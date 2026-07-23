"""Shared utilities for validating, downloading, and transcribing public videos."""

import json
import logging
import os
import re
import wave
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import ffmpeg
from django.conf import settings
from vosk import KaldiRecognizer, Model
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError

logger = logging.getLogger(__name__)


class PublicVideoDownloadError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def infer_supported_platform(video_url: str) -> str:
    hostname = (urlparse(video_url).hostname or "").lower()
    if hostname.startswith("www."):
        hostname = hostname[4:]

    if hostname in {"instagram.com", "m.instagram.com"}:
        return "instagram"
    if hostname in {"tiktok.com", "m.tiktok.com", "vm.tiktok.com"}:
        return "tiktok"
    if hostname in {"youtube.com", "m.youtube.com", "youtu.be"}:
        return "youtube"
    raise PublicVideoDownloadError("unsupported_platform", "Only public Instagram, TikTok, and YouTube URLs are supported.")


def validate_public_video_url(video_url: str) -> str:
    parsed = urlparse(video_url)
    if parsed.scheme not in {"http", "https"}:
        raise PublicVideoDownloadError("invalid_url", "The URL must use http or https.")

    hostname = (parsed.hostname or "").lower()
    allowed_hosts = {host.lower() for host in settings.RECIPE_IMPORT_ALLOWED_HOSTS}
    if hostname not in allowed_hosts:
        raise PublicVideoDownloadError("unsupported_host", "This URL host is not supported for recipe imports.")

    return infer_supported_platform(video_url)


def _summarize_download_error(message: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in message.splitlines()]
    lines = [re.sub(r"^(?:error|warning):\s*", "", line, flags=re.IGNORECASE) for line in lines if line]
    if not lines:
        return ""

    summary = lines[-1]
    if len(summary) > 240:
        summary = f"{summary[:237].rstrip()}..."
    return summary


def _get_cookie_file() -> str | None:
    cookie_file = str(getattr(settings, "RECIPE_IMPORT_COOKIE_FILE", "") or "").strip()
    if not cookie_file:
        return None

    if Path(cookie_file).is_file():
        return cookie_file

    logger.warning("Configured recipe import cookie file was not found: %s", cookie_file)
    return None


def download_public_video(video_url: str, target_dir: str) -> tuple[str, int | None]:
    os.makedirs(target_dir, exist_ok=True)
    outtmpl = str(Path(target_dir) / "%(extractor)s-%(id)s.%(ext)s")
    cookie_file = _get_cookie_file()

    options = {
        "outtmpl": outtmpl,
        "format": "mp4/bestvideo*+bestaudio/best",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": settings.RECIPE_IMPORT_DOWNLOAD_TIMEOUT_SECONDS,
        "max_filesize": settings.RECIPE_IMPORT_MAX_FILESIZE_BYTES,
        "retries": 1,
        "overwrites": True,
        "restrictfilenames": True,
    }
    if cookie_file:
        options["cookiefile"] = cookie_file

    try:
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(video_url, download=True)
            file_path = ydl.prepare_filename(info)
            if not file_path.endswith(".mp4") and info.get("ext"):
                candidate = Path(file_path).with_suffix(".mp4")
                if candidate.exists():
                    file_path = str(candidate)
            if not Path(file_path).exists():
                raise PublicVideoDownloadError("download_failed", "The media file was not created by yt-dlp.")
            return file_path, Path(file_path).stat().st_size
    except DownloadError as exc:
        message = str(exc)
        normalized = message.lower()
        detail = _summarize_download_error(message)
        if detail:
            logger.warning("yt-dlp failed for %s: %s", video_url, detail)
        if "private" in normalized or "login" in normalized or "sign in" in normalized or "authentication" in normalized:
            raise PublicVideoDownloadError(
                "authentication_required",
                f"This video is private or requires authentication.{f' yt-dlp reported: {detail}' if detail else ''}",
            ) from exc
        if "geo" in normalized or "region" in normalized or "country" in normalized or "not available" in normalized:
            raise PublicVideoDownloadError(
                "region_restricted",
                f"This video is not available from the server's region.{f' yt-dlp reported: {detail}' if detail else ''}",
            ) from exc
        if "file is larger than max-filesize" in normalized or "larger than max" in normalized:
            raise PublicVideoDownloadError(
                "file_too_large",
                f"The source video exceeds the configured file size limit.{f' yt-dlp reported: {detail}' if detail else ''}",
            ) from exc
        raise PublicVideoDownloadError(
            "download_failed",
            f"The video could not be downloaded from the provided URL.{f' yt-dlp reported: {detail}' if detail else ''}",
        ) from exc


def extract_audio_from_video(video_path: str) -> str:
    wav_path = str(Path(video_path).with_suffix(".wav"))
    try:
        (
            ffmpeg
            .input(video_path)
            .output(wav_path, ar=16000, ac=1, format="wav")
            .overwrite_output()
            .run(quiet=True)
        )
    except ffmpeg.Error as exc:
        stderr = exc.stderr.decode("utf-8", "ignore") if exc.stderr else ""
        raise PublicVideoDownloadError("audio_extraction_failed", f"FFmpeg could not extract audio. {stderr}".strip()) from exc
    return wav_path


def _find_vosk_model(model_path: str | None = None) -> str:
    configured_path = model_path or os.environ.get("VOSK_MODEL_PATH")
    if configured_path:
        path = Path(configured_path)
        if path.is_dir():
            return str(path.resolve())
        raise PublicVideoDownloadError("vosk_model_missing", f"Vosk model path points to {configured_path}, but it is not a directory.")

    current_dir = Path(__file__).parent
    model_dirs = [entry for entry in current_dir.iterdir() if entry.is_dir() and entry.name.startswith("vosk-model")]
    if not model_dirs:
        raise PublicVideoDownloadError("vosk_model_missing", f"No vosk-model-* directory was found in {current_dir}.")
    if len(model_dirs) > 1:
        names = ", ".join(entry.name for entry in model_dirs)
        raise PublicVideoDownloadError("vosk_model_ambiguous", f"Multiple Vosk models were found: {names}.")
    return str(model_dirs[0].resolve())


@lru_cache(maxsize=8)
def get_vosk_model(model_path: str | None = None) -> Model:
    return Model(_find_vosk_model(model_path))


def transcribe_wav_with_vosk(wav_path: str, model_path: str | None = None) -> str:
    with wave.open(wav_path, "rb") as wav_file:
        if wav_file.getnchannels() != 1 or wav_file.getframerate() not in (8000, 16000, 32000):
            raise PublicVideoDownloadError("invalid_audio_format", "Vosk requires mono WAV audio at 8, 16, or 32 kHz.")

        recognizer = KaldiRecognizer(get_vosk_model(model_path), wav_file.getframerate())
        recognizer.SetWords(True)
        segments = []

        while True:
            chunk = wav_file.readframes(4000)
            if not chunk:
                break
            if recognizer.AcceptWaveform(chunk):
                result = json.loads(recognizer.Result())
                segments.append(result.get("text", ""))

        final_result = json.loads(recognizer.FinalResult())
        segments.append(final_result.get("text", ""))

    transcript = " ".join(part for part in segments if part).strip()
    if not transcript:
        raise PublicVideoDownloadError("empty_transcript", "The video audio could not be transcribed into speech.")
    return transcript


def normalize_transcript_text(transcript: str) -> str:
    filler_pattern = re.compile(r"\b(?:uhm+|um+|hmm+|like)\b", flags=re.IGNORECASE)
    whitespace_pattern = re.compile(r"\s+")
    without_fillers = filler_pattern.sub("", transcript)
    return whitespace_pattern.sub(" ", without_fillers).strip()
