from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from recipes.models import Recipe


class RecipeSuggestionContractTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="contract-user",
            password="StrongPass123!",
        )
        self.client.force_authenticate(user=self.user)

        self.side = Recipe.objects.create(
            title="Cucumber Salad",
            created_by=self.user,
            servings=2,
            is_side=True,
        )
        self.sauce = Recipe.objects.create(
            title="Yogurt Sauce",
            created_by=self.user,
            servings=2,
            is_sauce=True,
        )
        self.main = Recipe.objects.create(
            title="Roast Chicken",
            created_by=self.user,
            servings=4,
        )

    def test_create_recipe_persists_suggested_sides_and_sauces(self):
        response = self.client.post(
            "/api/recipes/",
            {
                "title": "Main Plate",
                "description": "Dinner plate",
                "servings": 4,
                "tags": ["Dinner"],
                "ingredients": [{"item": "chicken"}],
                "steps": [{"order": 1, "text": "Cook chicken"}],
                "suggestedSideIds": [self.side.pk],
                "suggestedSauceIds": [self.sauce.pk],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payload = response.json()
        recipe = Recipe.objects.get(pk=payload["id"])

        self.assertEqual(payload["suggestedSideIds"], [self.side.pk])
        self.assertEqual(payload["suggestedSauceIds"], [self.sauce.pk])
        self.assertQuerySetEqual(recipe.suggested_sides.order_by("pk"), [self.side], transform=lambda x: x)
        self.assertQuerySetEqual(recipe.suggested_sauces.order_by("pk"), [self.sauce], transform=lambda x: x)

    def test_update_recipe_returns_persisted_suggestion_ids(self):
        self.main.suggested_sides.add(self.side)
        self.main.suggested_sauces.add(self.sauce)

        response = self.client.put(
            f"/api/recipes/{self.main.pk}/",
            {
                "title": self.main.title,
                "version": self.main.version,
                "description": "",
                "servings": 4,
                "tags": [],
                "ingredients": [{"item": "chicken"}],
                "steps": [{"order": 1, "text": "Cook chicken"}],
                "suggestedSideIds": [self.side.pk],
                "suggestedSauceIds": [self.sauce.pk],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = response.json()
        self.assertEqual(payload["suggestedSideIds"], [self.side.pk])
        self.assertEqual(payload["suggestedSauceIds"], [self.sauce.pk])

    def test_invalid_suggestion_type_returns_clear_field_error(self):
        response = self.client.post(
            "/api/recipes/",
            {
                "title": "Invalid Main Plate",
                "description": "Dinner plate",
                "servings": 4,
                "tags": ["Dinner"],
                "ingredients": [{"item": "chicken"}],
                "steps": [{"order": 1, "text": "Cook chicken"}],
                "suggestedSideIds": [self.sauce.pk],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        payload = response.json()
        self.assertEqual(payload["error"]["code"], "bad_request")
        self.assertIn("suggestedSideIds", payload["error"]["details"])
