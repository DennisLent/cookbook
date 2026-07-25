import threading
from unittest import skipUnless

from django.db import connection, close_old_connections
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from recipes.models import Favorite, Recipe
from users.instance_mode import get_single_user_owner


@skipUnless(connection.vendor == "postgresql", "overlap guarantees require PostgreSQL")
@override_settings(APP_MODE="single_user")
class SharedOwnerConcurrencyTests(TransactionTestCase):
    """Exercise real overlapping requests against the production database."""

    reset_sequences = True

    def setUp(self):
        self.owner = get_single_user_owner()
        self.recipes = [
            Recipe.objects.create(title=f"Recipe {index}", created_by=self.owner)
            for index in range(2)
        ]

    def _run_together(self, callbacks):
        barrier = threading.Barrier(len(callbacks))
        errors = []

        def run(callback):
            close_old_connections()
            try:
                barrier.wait(timeout=5)
                callback()
            except Exception as exc:  # pragma: no cover - assertion reports thread failures
                errors.append(exc)
            finally:
                close_old_connections()

        threads = [threading.Thread(target=run, args=(callback,)) for callback in callbacks]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=10)
        self.assertFalse(errors, errors)
        self.assertTrue(all(not thread.is_alive() for thread in threads))

    def test_concurrent_favorites_for_different_recipes_preserve_both(self):
        def favorite(recipe):
            response = APIClient().post(f"/api/recipes/{recipe.pk}/favorite/")
            self.assertEqual(response.status_code, 200)

        self._run_together([lambda: favorite(self.recipes[0]), lambda: favorite(self.recipes[1])])
        self.assertSetEqual(
            set(Favorite.objects.filter(user=self.owner).values_list("recipe_id", flat=True)),
            {self.recipes[0].pk, self.recipes[1].pk},
        )

    def test_duplicate_concurrent_favorite_converges_to_one_row(self):
        def favorite():
            response = APIClient().post(f"/api/recipes/{self.recipes[0].pk}/favorite/")
            self.assertEqual(response.status_code, 200)

        self._run_together([favorite, favorite])
        self.assertEqual(
            Favorite.objects.filter(user=self.owner, recipe=self.recipes[0]).count(),
            1,
        )
