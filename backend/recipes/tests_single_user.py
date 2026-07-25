from django.test import override_settings
from rest_framework.test import APITestCase
from unittest.mock import patch

from recipes.models import Favorite, RecipeImportJob


RECIPE_PAYLOAD = {
    "title": "Shared soup",
    "description": "Concurrent household recipe",
    "servings": 4,
    "tags": ["dinner"],
    "ingredients": [{"item": "Water", "qty": "1", "unit": "l"}],
    "steps": [{"order": 1, "text": "Simmer"}],
}


@override_settings(APP_MODE="single_user")
class SingleUserRecipeTests(APITestCase):
    def setUp(self):
        response = self.client.post("/api/recipes/", RECIPE_PAYLOAD, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.recipe = response.data

    def test_crud_uses_shared_owner_and_rejects_stale_version(self):
        self.assertEqual(self.recipe["created_by"], "__single_user__")
        update = {**RECIPE_PAYLOAD, "title": "Updated soup", "version": self.recipe["version"]}
        response = self.client.put(f"/api/recipes/{self.recipe['id']}/", update, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["version"], self.recipe["version"] + 1)

        stale = self.client.put(f"/api/recipes/{self.recipe['id']}/", update, format="json")
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data["error"]["code"], "recipe_version_conflict")

    def test_update_requires_a_concurrency_version(self):
        response = self.client.put(
            f"/api/recipes/{self.recipe['id']}/",
            RECIPE_PAYLOAD,
            format="json",
        )
        self.assertEqual(response.status_code, 428)
        self.assertEqual(response.data["error"]["code"], "recipe_version_required")

    def test_favorite_and_collection_membership_are_idempotent(self):
        favorite_url = f"/api/recipes/{self.recipe['id']}/favorite/"
        self.assertEqual(self.client.post(favorite_url).status_code, 200)
        self.assertEqual(self.client.post(favorite_url).status_code, 200)
        self.assertEqual(Favorite.objects.count(), 1)

        collection = self.client.post("/api/collections/", {"name": "Dinner", "recipeIds": []}, format="json")
        self.assertEqual(collection.status_code, 201, collection.data)
        membership_url = f"/api/collections/{collection.data['id']}/recipes/{self.recipe['id']}/"
        first = self.client.post(membership_url)
        second = self.client.post(membership_url)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["recipeIds"], [self.recipe["id"]])

        removed = self.client.delete(membership_url)
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(removed.data["recipeIds"], [])

    @patch("recipes.extraction.utils.validate_public_video_url", return_value="youtube")
    @patch("recipes.tasks.process_recipe_import_job.delay")
    def test_import_idempotency_key_enqueues_once(self, delay_mock, _validate_mock):
        headers = {"HTTP_IDEMPOTENCY_KEY": "same-browser-action"}
        with self.captureOnCommitCallbacks(execute=True):
            first = self.client.post(
                "/api/recipe-import-jobs/",
                {"url": "https://youtube.com/watch?v=abc"},
                format="json",
                **headers,
            )
        with self.captureOnCommitCallbacks(execute=True):
            second = self.client.post(
                "/api/recipe-import-jobs/",
                {"url": "https://youtube.com/watch?v=abc"},
                format="json",
                **headers,
            )
        self.assertEqual(first.status_code, 202)
        self.assertEqual(second.status_code, 202)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(RecipeImportJob.objects.count(), 1)
        delay_mock.assert_called_once()
