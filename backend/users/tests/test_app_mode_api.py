from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.test import override_settings
import json
from rest_framework.test import APITestCase

from users.instance_mode import SINGLE_USER_USERNAME, get_instance_configuration
from users.instance_mode import get_single_user_owner
from users.models import InstanceConfiguration
from recipes.models import Recipe
from cookbook.db_backup import import_backup_data


@override_settings(APP_MODE="single_user")
class SingleUserModeApiTests(APITestCase):
    def test_config_and_profile_bootstrap_without_credentials(self):
        config_response = self.client.get("/api/app/config/")
        self.assertEqual(config_response.status_code, 200)
        self.assertEqual(config_response.data["mode"], "single_user")
        self.assertFalse(config_response.data["authenticationRequired"])

        profile_response = self.client.get("/api/users/me/")
        self.assertEqual(profile_response.status_code, 200)
        self.assertEqual(profile_response.data["username"], SINGLE_USER_USERNAME)

        owner = get_user_model().objects.get(username=SINGLE_USER_USERNAME)
        self.assertFalse(owner.has_usable_password())
        self.assertEqual(get_user_model().objects.filter(username=SINGLE_USER_USERNAME).count(), 1)

    def test_account_endpoints_are_disabled(self):
        self.assertEqual(
            self.client.post("/api/auth/register/", {"username": "other", "password": "password123"}).status_code,
            403,
        )
        self.assertEqual(
            self.client.post("/api/auth/token/", {"username": "other", "password": "password123"}).status_code,
            403,
        )
        self.assertEqual(
            self.client.post("/api/users/me/change-password/", {}).status_code,
            403,
        )
        self.assertEqual(self.client.delete("/api/users/me/").status_code, 403)

    def test_bearer_token_cannot_select_another_identity(self):
        get_user_model().objects.create_user(username="other", password="password123")
        # Pre-create explicit single-user metadata because an upgraded database
        # containing normal users is otherwise deliberately classified multi-user.
        InstanceConfiguration.objects.create(mode="single_user", ever_multi_user=False)

        response = self.client.get("/api/users/me/", HTTP_AUTHORIZATION="Bearer invalid-or-stale")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], SINGLE_USER_USERNAME)

    def test_multi_user_backup_is_rejected_before_restore(self):
        payload = [{
            "model": "users.instanceconfiguration",
            "pk": 1,
            "fields": {"mode": "multi_user", "ever_multi_user": True},
        }]
        with self.assertRaisesMessage(ValueError, "cannot be restored"):
            import_backup_data(json.dumps(payload).encode())

    def test_preferences_require_current_version(self):
        profile = self.client.get("/api/users/me/").data
        first = self.client.patch(
            "/api/users/me/",
            {
                "preferences": {"prefs": {"theme": "dark"}},
                "preferencesVersion": profile["preferencesVersion"],
            },
            format="json",
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["preferencesVersion"], profile["preferencesVersion"] + 1)

        stale = self.client.patch(
            "/api/users/me/",
            {
                "preferences": {"prefs": {"theme": "light"}},
                "preferencesVersion": profile["preferencesVersion"],
            },
            format="json",
        )
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.data["error"]["code"], "preferences_version_conflict")


class InstanceModeHistoryTests(APITestCase):
    @override_settings(APP_MODE="multi_user")
    def test_multi_user_history_is_irreversible(self):
        configuration = get_instance_configuration()
        self.assertTrue(configuration.ever_multi_user)

        with override_settings(APP_MODE="single_user"):
            with self.assertRaises(ImproperlyConfigured):
                get_instance_configuration()


@override_settings(APP_MODE="single_user")
class PromotionCommandTests(APITestCase):
    def test_dry_run_does_not_change_mode_and_confirm_promotes(self):
        owner = get_single_user_owner()
        destination = get_user_model().objects.create_user(username="alice", password="password123")
        recipe = Recipe.objects.create(title="Owned recipe", created_by=owner)

        call_command("promote_to_multi_user", "alice", "--dry-run")
        self.assertEqual(InstanceConfiguration.get_solo().mode, "single_user")
        recipe.refresh_from_db()
        self.assertEqual(recipe.created_by, owner)

        call_command("promote_to_multi_user", "alice", "--confirm")
        recipe.refresh_from_db()
        configuration = InstanceConfiguration.get_solo()
        self.assertEqual(recipe.created_by, destination)
        self.assertEqual(configuration.mode, "multi_user")
        self.assertTrue(configuration.ever_multi_user)
        owner.refresh_from_db()
        self.assertFalse(owner.is_active)

    @override_settings(APP_MODE="single_user")
    def test_existing_account_database_fails_closed(self):
        get_user_model().objects.create_user(username="legacy", password="password123")
        with self.assertRaises(ImproperlyConfigured):
            get_instance_configuration()

    def test_pre_feature_empty_database_is_still_marked_multi_user(self):
        with self.assertRaises(ImproperlyConfigured):
            get_instance_configuration(force_existing_installation=True)
        configuration = InstanceConfiguration.get_solo()
        self.assertEqual(configuration.mode, "multi_user")
        self.assertTrue(configuration.ever_multi_user)
