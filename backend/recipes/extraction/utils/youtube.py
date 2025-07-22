from youtube_transcript_api import YouTubeTranscriptApi
import re

def _get_video_id(video_url: str) -> str | None:
    """
    Extract the 11-character YouTube ID from common URL formats:
      - https://youtu.be/VIDEOID
      - https://www.youtube.com/watch?v=VIDEOID
      - https://www.youtube.com/embed/VIDEOID
    """
    if not video_url:
        return None

    # Try the multi-format pattern first
    multi_re = re.compile(r"""
        (?:                                   # non-capturing group for URL prefix
            youtu\.be/                        #   youtu.be/VIDEOID
          | youtube\.com/(?:.*v=|embed/)      #   youtube.com/...v= or /embed/
        )
        ([A-Za-z0-9_-]{11})
    """, re.VERBOSE)

    m = multi_re.search(video_url)
    if m:
        return m.group(1)

    # Fallback
    simple_re = re.compile(r"[?&]v=([^&#]+)")
    m = simple_re.search(video_url)
    if m:
        return m.group(1)

    return None

def _get_transcript(video_url: str):
    """
    Use the video url to get the transcript using YouTubeTranscriptApi
    """

    video_id = _get_video_id(video_url=video_url)
    if video_id is None:
        return None
    
    ytt_api = YouTubeTranscriptApi()
    fetched_transcript = ytt_api.fetch(video_id)

    return "".join(snippet.text for snippet in fetched_transcript)

def _remove_fillers(transcript: str):
    """
    Remove any fillers t normalize the text. Examples of fillers:
    - uhm
    - hmm
    - like
    """
    filler_pattern = re.compile(r"\b(?:uhm+|um+|hmm+|like)\b", flags=re.IGNORECASE)
    white_space_pattern = re.compile(r"\s+")

    no_fillers = filler_pattern.sub("", transcript)
    cleaned = white_space_pattern.sub(" ", no_fillers)

    return cleaned.strip()

def get_yt_transcript_cleaned(video_url):
    """
    Uses the video URL to extract the transcript from YouTube.
    Cleans the response for fillers.
    """
    transcript = _get_transcript(video_url=video_url)
    cleaned_transcript = _remove_fillers(transcript=transcript)
    return cleaned_transcript