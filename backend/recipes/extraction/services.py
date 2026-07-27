"""High-level extraction flows that turn web/video sources into recipe payloads."""

from .utils import (
    get_yt_transcript_cleaned,
    extract_recipe_via_ollama,
)
import re
import ipaddress
import socket
from tempfile import TemporaryDirectory
from urllib.parse import urlparse
from recipe_scrapers import scrape_me
from ingredient_parser import parse_ingredient
from recipes.models import Ingredient, get_effective_ollama_model, get_effective_vosk_model_path
from .utils import download_public_video, extract_audio_from_video, normalize_transcript_text, transcribe_wav_with_vosk, validate_public_video_url


def validate_public_website_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Enter a valid public HTTP or HTTPS recipe URL.")
    if parsed.username or parsed.password:
        raise ValueError("Recipe URLs containing credentials are not supported.")

    try:
        addresses = {
            ipaddress.ip_address(item[4][0])
            for item in socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
        }
    except (OSError, ValueError) as exc:
        raise ValueError("The recipe website hostname could not be resolved.") from exc

    if not addresses or any(not address.is_global for address in addresses):
        raise ValueError("Recipe imports must use a public website address.")
    return "website"


def _clean_text(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def build_recipe_payload_from_details(*, details: dict, source_url: str) -> dict | None:
    title = _clean_text(details.get("title"))
    raw_ings = details.get("ingredients", [])
    raw_steps = details.get("instructions", [])

    ingredients_data = []
    for ing in raw_ings:
        name = _clean_text(ing.get("name"))
        amount = _clean_text(ing.get("amount"))
        if not name:
            continue

        obj, _ = Ingredient.objects.get_or_create(
            name__iexact=name,
            defaults={"name": name}
        )

        ingredients_data.append({
            "ingredient": obj.name,
            "amount": amount,
        })

    if not ingredients_data:
        return None

    instruction_steps = [_clean_text(step) for step in raw_steps]
    instructions = "\n".join(step for step in instruction_steps if step)
    if not instructions:
        return None

    return {
        "title": title or "Imported recipe",
        "description": source_url,
        "instructions": instructions,
        "ingredients_data": ingredients_data,
        "tags": [],
        "image": None,
    }

def extract_recipe_from_website(url: str) -> dict:
    try:
        scraper = scrape_me(url)
    except Exception as e:
        raise ValueError(f"Could not load recipe from {url}: {e}")

    title        = (scraper.title() or "").strip()
    description  = (scraper.description() or "").strip()
    instructions = (scraper.instructions() or "").strip()
    raw_ings     = scraper.ingredients() or []

    if not title:
        raise ValueError("No title found on page")
    if not instructions:
        raise ValueError("No instructions found on page")
    if not raw_ings:
        raise ValueError("No ingredients found on page")

    parsed = []
    for raw in raw_ings:
        raw = raw.strip()
        if not raw:
            continue

        p = parse_ingredient(raw)
        if p.name:
            name = p.name[0].text.strip()
        else:
            # fallback: strip leading numbers/punctuation
            name = re.sub(r'^[\d\W]+', '', raw)

        if p.amount:
            amount = p.amount[0].text.strip()
        else:
            # fallback: everything but last word
            parts = raw.split()
            amount = " ".join(parts[:-1]).strip()

        if name:
            parsed.append({"name": name, "amount": amount})

    if not parsed:
        raise ValueError("Failed to parse any ingredients")

    return {
        "title":            title,
        "description":      description,
        "instructions":     instructions,
        "ingredients_data": [
            {"ingredient": ing["name"], "amount": ing["amount"]}
            for ing in parsed
        ],
        "tags": [],
        "image": None,
    }

def extract_recipe_from_youtube(url: str, model: str | None = None) -> dict | None:
    model = model or get_effective_ollama_model()
    transcript = get_yt_transcript_cleaned(url)
    if len(transcript.split()) < 50:
        return None

    details = extract_recipe_via_ollama(transcript=transcript, model=model)
    return build_recipe_payload_from_details(details=details, source_url=url)


def extract_recipe_from_transcript(transcript: str, source_url: str, model: str | None = None) -> dict | None:
    model = model or get_effective_ollama_model()
    if not transcript or len(transcript.split()) < 50:
        return None

    details = extract_recipe_via_ollama(transcript=transcript, model=model)
    return build_recipe_payload_from_details(details=details, source_url=source_url)


def extract_recipe_from_instagram(url: str, model: str | None = None) -> dict | None:
    model = model or get_effective_ollama_model()
    platform = validate_public_video_url(url)
    if platform != "instagram":
        raise ValueError("The provided URL is not a supported Instagram URL.")

    with TemporaryDirectory(prefix="instagram-import-") as tmpdir:
        video_path, _ = download_public_video(url, tmpdir)
        audio_path = extract_audio_from_video(video_path)
        transcript = normalize_transcript_text(
            transcribe_wav_with_vosk(audio_path, model_path=get_effective_vosk_model_path())
        )
        return extract_recipe_from_transcript(transcript=transcript, source_url=url, model=model)


def extract_recipe_from_tiktok(url: str, model: str | None = None) -> dict | None:
    model = model or get_effective_ollama_model()
    platform = validate_public_video_url(url)
    if platform != "tiktok":
        raise ValueError("The provided URL is not a supported TikTok URL.")

    with TemporaryDirectory(prefix="tiktok-import-") as tmpdir:
        video_path, _ = download_public_video(url, tmpdir)
        audio_path = extract_audio_from_video(video_path)
        transcript = normalize_transcript_text(
            transcribe_wav_with_vosk(audio_path, model_path=get_effective_vosk_model_path())
        )
        return extract_recipe_from_transcript(transcript=transcript, source_url=url, model=model)
