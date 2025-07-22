from django.test import TestCase, override_settings
from recipes.extraction.utils import (
    get_yt_transcript_cleaned,
    extract_recipe_via_ollama,
    reel_to_wav,
    extract_recipe_transcript_with_vosk,
)
from recipes.extraction.utils.instagram import BadResponseException, InstagramCheckpointRequired
from recipes.extraction.services import extract_recipe_from_instagram
from decouple import Config, RepositoryEnv
from pathlib import Path
import os

# VIDEO_NO_AUDIO = "https://youtu.be/ipt85QM__M0?si=RaFtlc1axsgPZw-K"
VIDEO_AUDIO = "https://youtu.be/SjCkW-oAFQ8?si=F2mhZwwY8g6kuDZt"
VIDEO_BIG = "https://youtu.be/J2RbSZob6ag?si=vtJrxhE1tWJd-uUj"

VIDEO_URLS = [VIDEO_AUDIO, VIDEO_BIG]

INSTAGRAM_REEL = "https://www.instagram.com/reel/C4mM4oqsKP-/"

class YouTubeRecipeIntegrationTest(TestCase):
    """Integration tests for YouTube extraction helpers."""

    @override_settings(DEBUG=True)
    def test_get_yt_transcript_cleaned(self):
        for video in VIDEO_URLS:
            transcript = get_yt_transcript_cleaned(video)
            self.assertTrue(transcript, "Transcript was empty")

    @override_settings(DEBUG=True)
    def test_extract_recipe_via_ollama(self):
        if os.system("ollama list | grep -q llama3.2") != 0:
            self.skipTest("llama3.2 model not installed locally")

        for video in VIDEO_URLS:
            transcript = get_yt_transcript_cleaned(video)
            recipe = extract_recipe_via_ollama(transcript, model="llama3.2")

            self.assertIsInstance(recipe, dict)
            self.assertIn("title", recipe)
            self.assertIn("ingredients", recipe)
            self.assertIn("instructions", recipe)

            ings = recipe["ingredients"]
            self.assertIsInstance(ings, list)
            self.assertTrue(ings, "Expected at least one ingredient")
            for ing in ings:
                self.assertIsInstance(ing, dict)
                self.assertIn("name", ing)
                self.assertIn("amount", ing)
                self.assertIsInstance(ing["name"], str)
                self.assertIsInstance(ing["amount"], str)

            steps = recipe["instructions"]
            self.assertIsInstance(steps, list)
            self.assertTrue(steps, "Expected at least one instruction")
            for step in steps:
                self.assertIsInstance(step, str)

class InstagramRecipeIntegrationTest(TestCase):
    """Integration tests for Instagram Reel extraction."""

    @override_settings(DEBUG=True)
    def test_extract_recipe_from_instagram(self):
        env_path = Path(__file__).resolve().parents[2] / ".env"
        config = Config(repository=RepositoryEnv(str(env_path)))
        username = config("INSTAGRAM_USERNAME", default=None)
        password = config("INSTAGRAM_PASSWORD", default=None)

        if not username or not password:
            self.skipTest("Instagram credentials not configured in .env")

        try:
            recipe = extract_recipe_from_instagram(
                INSTAGRAM_REEL,
                model="llama3.2",
                ig_username=username,
                ig_password=password,
            )
        
        except InstagramCheckpointRequired as e:
            self.skipTest(f"IG challenge required: {e.challenge_url}")
        except BadResponseException as e:
            self.skipTest(f"IG blocked anonymous/metadata fetch: {e}")
        except RuntimeError as e:
            if "vosk model" in str(e).lower():
                self.skipTest("Vosk model not available")
            raise

        self.assertIsInstance(recipe, dict)
        self.assertIn("title", recipe)
        self.assertIn("ingredients_data", recipe)
        self.assertIn("instructions", recipe)
        self.assertTrue(recipe["ingredients_data"])
        self.assertTrue(recipe["instructions"])

