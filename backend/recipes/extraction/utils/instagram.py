import instaloader
from instaloader.exceptions import LoginException, BadResponseException, TwoFactorAuthRequiredException, BadCredentialsException
from urllib.parse import urlparse
import ffmpeg
from pathlib import Path
from vosk import Model, KaldiRecognizer
import os
import re, json, wave

class InstagramCheckpointRequired(Exception):
    """
    Raised when Instagram forces a checkpoint / challenge.
    Has a .challenge_url attribute you can send back to the client.
    """
    def __init__(self, challenge_url: str):
        super().__init__("Instagram checkpoint required")
        self.challenge_url = challenge_url

def _download_reel(
    video_url: str,
    ig_username: str | None = None,
    ig_password: str | None = None,
    target_dir: str = "/tmp/reels",
) -> str:
    if ig_username is None:
        ig_username = os.environ.get("INSTAGRAM_USERNAME")
    if ig_password is None:
        ig_password = os.environ.get("INSTAGRAM_PASSWORD")
    if not ig_username or not ig_password:
        raise ValueError("Instagram credentials not provided")

    loader = instaloader.Instaloader(
        dirname_pattern=target_dir,
        download_comments=False,
        download_video_thumbnails=False,
        save_metadata=False,
    )

    # login
    try:
        loader.login(ig_username, ig_password)
    except LoginException as e:
        # try to pull challenge url
        url = getattr(e, "challenge_url", None)
        if not url:
            m = re.search(r"(\/challenge\/[^\s\/]+)", str(e))
            if m:
                url = m.group(1)
        if url:
            raise InstagramCheckpointRequired(f"https://www.instagram.com{url}")
        raise
    except TwoFactorAuthRequiredException as e:
        raise RuntimeError("2FA required for this account.") from e

    shortcode = urlparse(video_url).path.strip("/").split("/")[-1]

    try:
        post = instaloader.Post.from_shortcode(loader.context, shortcode)
    except BadResponseException as e:
        # IG may block metadata fetch during tests
        raise RuntimeError(f"IG metadata fetch failed: {e}") from e

    if not loader.download_post(post, target=shortcode):
        raise RuntimeError(f"Failed to download Reel: {video_url}")

    mp4_path = Path(target_dir) / shortcode / f"{shortcode}.mp4"
    if not mp4_path.exists():
        raise RuntimeError(f"Expected MP4 at {mp4_path}, but not found.")
    return str(mp4_path)

def _extract_audio(mp4_path: str) -> str:
    """
    Extract the audio track from mp4_path into a 16 kHz, mono WAV file,
    returning the new filepath.
    """
    wav_path = mp4_path.rsplit(".", 1)[0] + ".wav"
    try:
        (
            ffmpeg
            .input(mp4_path)
            .output(wav_path, ar=16000, ac=1, format="wav")
            .overwrite_output()
            .run(quiet=True)
        )
    except ffmpeg.Error as e:
        raise RuntimeError(f"FFmpeg audio extraction failed: {e.stderr.decode('utf-8', 'ignore')}")
    return wav_path


def reel_to_wav(
    video_url: str,
    ig_username: str | None = None,
    ig_password: str | None = None,
) -> str:
    mp4 = _download_reel(
        video_url=video_url,
        ig_username=ig_username,
        ig_password=ig_password,
    )
    wav = _extract_audio(mp4)
    return wav


def _find_vosk_model() -> str:
    """
    Dynamically find the Vosk model directory.  
    Checks either an environment variable or scans this folder for a single 'vosk-model-*' directory.
    """
    env_path = os.environ.get("VOSK_MODEL_PATH")
    if env_path:
        p = Path(env_path)
        if p.is_dir():
            return str(p.resolve())
        raise RuntimeError(f"VOSK_MODEL_PATH is set to {env_path}, but it's not a directory.")

    current_dir = Path(__file__).parent
    model_dirs = []
    for d in current_dir.iterdir():
        if d.is_dir() and d.name.startswith("vosk-model"):
            model_dirs.append(d)

    if not model_dirs:
        raise RuntimeError(f"No vosk-model-* directories found in {current_dir}")
    if len(model_dirs) > 1:
        names = ", ".join(d.name for d in model_dirs)
        raise RuntimeError(
            f"Multiple Vosk models found in {current_dir}: {names}. "
            "Please set VOSK_MODEL_PATH to the one you want to use."
        )
    return str(model_dirs[0].resolve())

_VOSK_MODEL_PATH = _find_vosk_model()
_VOSK_MODEL = Model(_VOSK_MODEL_PATH)

def transcribe_with_vosk(wav_path: str) -> str:
    """
    Given a WAV file, return the transcript.
    """
    wf = wave.open(wav_path, "rb")
    
    if wf.getnchannels() != 1 or wf.getframerate() not in (8000, 16000, 32000):
        raise ValueError("Vosk requires WAV mono @ 8/16/32 kHz")


    rec = KaldiRecognizer(_VOSK_MODEL, wf.getframerate())
    rec.SetWords(True)

    segments = []
    while True:
        data = wf.readframes(4000)
        if not data:
            break
        if rec.AcceptWaveform(data):
            j = json.loads(rec.Result())
            segments.append(j.get("text", ""))

    
    j = json.loads(rec.FinalResult())
    segments.append(j.get("text", ""))

    transcript = " ".join(s for s in segments if s)
    return transcript

def extract_recipe_transcript_with_vosk(
    video_url: str,
    ig_username: str | None = None,
    ig_password: str | None = None,
):
    wav_file = reel_to_wav(
        video_url=video_url,
        ig_username=ig_username,
        ig_password=ig_password,
    )
    transcript = transcribe_with_vosk(wav_path=wav_file)
    return transcript
