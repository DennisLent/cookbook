from .utils import (
    get_yt_transcript_cleaned,
    extract_recipe_via_ollama,
    extract_recipe_transcript_with_vosk,
)
import re
from recipe_scrapers import scrape_me
from ingredient_parser import parse_ingredient
from recipes.models import Ingredient

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

def extract_recipe_from_youtube(url: str, model: str = "llama3.2") -> dict | None:
    transcript = get_yt_transcript_cleaned(url)
    if len(transcript.split()) < 50:
        return None

    details    = extract_recipe_via_ollama(transcript=transcript, model=model)
    title      = details.get("title", "").strip()
    raw_ings   = details.get("ingredients", [])
    raw_steps  = details.get("instructions", [])

    ingredients_data = []
    for ing in raw_ings:
        name   = ing.get("name", "").strip()
        amount = ing.get("amount", "").strip()
        if not name:
            continue

        # persist or fetch your Ingredient record
        obj, _ = Ingredient.objects.get_or_create(
            name__iexact=name,
            defaults={"name": name}
        )

        ingredients_data.append({
            "ingredient": obj.name,
            "amount":     amount,
        })

    if not ingredients_data:
        return None

    instructions = "\n".join(s.strip() for s in raw_steps if s.strip())

    return {
        "title":            title,
        "description":      url,
        "instructions":     instructions,
        "ingredients_data": ingredients_data,
        "tags":             [],
        "image":            None,
    }


def extract_recipe_from_instagram(
    url: str,
    model: str = "llama3.2",
    ig_username: str | None = None,
    ig_password: str | None = None,
) -> dict | None:
    """Extract and structure a recipe from an Instagram Reel."""

    transcript = extract_recipe_transcript_with_vosk(
        video_url=url,
        ig_username=ig_username,
        ig_password=ig_password,
    )

    if not transcript or len(transcript.split()) < 50:
        return None

    details = extract_recipe_via_ollama(transcript=transcript, model=model)
    title = details.get("title", "").strip()
    raw_ings = details.get("ingredients", [])
    raw_steps = details.get("instructions", [])

    ingredients_data = []
    for ing in raw_ings:
        name = ing.get("name", "").strip()
        amount = ing.get("amount", "").strip()
        if not name:
            continue

        obj, _ = Ingredient.objects.get_or_create(
            name__iexact=name,
            defaults={"name": name},
        )

        ingredients_data.append({
            "ingredient": obj.name,
            "amount": amount,
        })

    if not ingredients_data:
        return None

    instructions = "\n".join(s.strip() for s in raw_steps if s.strip())

    return {
        "title": title,
        "description": url,
        "instructions": instructions,
        "ingredients_data": ingredients_data,
        "tags": [],
        "image": None,
    }
