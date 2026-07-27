from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from recipes.models import Recipe


class ManagementCommandTests(TestCase):
    def test_create_user_creates_standard_user(self):
        call_command("create_user", "alice", "wonderland")

        user = get_user_model().objects.get(username="alice")
        self.assertTrue(user.check_password("wonderland"))
        self.assertEqual(user.role, "user")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertTrue(user.is_active)

    def test_create_super_user_creates_admin_user(self):
        call_command("create_super_user", "boss", "topsecret")

        user = get_user_model().objects.get(username="boss")
        self.assertTrue(user.check_password("topsecret"))
        self.assertEqual(user.role, "admin")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_active)

    def test_create_super_user_updates_existing_user(self):
        user = get_user_model().objects.create_user(username="boss", password="oldpass", role="user")

        call_command("create_super_user", "boss", "newpass")

        user.refresh_from_db()
        self.assertTrue(user.check_password("newpass"))
        self.assertEqual(user.role, "admin")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)

    @patch("users.management.commands.populate_db.populate_database_for_user", return_value=["recipe-1", "recipe-2"])
    def test_populate_db_command_uses_existing_user(self, mock_populate):
        get_user_model().objects.create_user(username="owner", password="secret")

        call_command("populate_db", "owner", "--reset")

        mock_populate.assert_called_once_with(username="owner", stdout=mock_populate.call_args.kwargs["stdout"], reset=True)

    def test_populate_db_command_errors_for_missing_user(self):
        with self.assertRaises(CommandError):
            call_command("populate_db", "ghost")

    @patch("users.management.commands.seed_internal_data.populate_database_for_user", return_value=["recipe"])
    def test_seed_internal_data_creates_superuser_then_populates(self, mock_populate):
        call_command("seed_internal_data", "--username", "admin", "--password", "admin-pass", "--reset")

        user = get_user_model().objects.get(username="admin")
        self.assertTrue(user.check_password("admin-pass"))
        self.assertEqual(user.role, "admin")
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        mock_populate.assert_called_once_with(username="admin", stdout=mock_populate.call_args.kwargs["stdout"], reset=True)

    @override_settings(APP_MODE="single_user")
    @patch("users.management.commands.seed_internal_data.populate_database_for_user", return_value=["recipe"])
    def test_single_user_seed_uses_shared_owner_without_creating_account(self, mock_populate):
        call_command("seed_internal_data", "--username", "", "--password", "", "--reset")

        owner = get_user_model().objects.get(username="__single_user__")
        self.assertFalse(owner.has_usable_password())
        self.assertEqual(get_user_model().objects.count(), 1)
        mock_populate.assert_called_once_with(
            username="__single_user__",
            stdout=mock_populate.call_args.kwargs["stdout"],
            reset=True,
        )

    @patch("users.management.commands.seed_internal_data.populate_database_for_user")
    def test_seed_internal_data_skips_existing_recipes_without_force(self, mock_populate):
        owner = get_user_model().objects.create_user(username="owner", password="secret")
        Recipe.objects.create(title="Existing recipe", created_by=owner)

        call_command("seed_internal_data", "--username", "admin", "--password", "admin-pass")

        user = get_user_model().objects.get(username="admin")
        self.assertTrue(user.check_password("admin-pass"))
        self.assertEqual(user.role, "admin")
        mock_populate.assert_not_called()

    @patch("users.management.commands.seed_internal_data.populate_database_for_user", return_value=["recipe"])
    def test_seed_internal_data_force_populates_existing_recipes(self, mock_populate):
        owner = get_user_model().objects.create_user(username="owner", password="secret")
        Recipe.objects.create(title="Existing recipe", created_by=owner)

        call_command("seed_internal_data", "--username", "admin", "--password", "admin-pass", "--force")

        mock_populate.assert_called_once_with(username="admin", stdout=mock_populate.call_args.kwargs["stdout"], reset=False)
