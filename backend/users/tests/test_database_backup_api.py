import json
from io import BytesIO
from pathlib import Path
import zipfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from recipes.models import ExtractionSettings, Ingredient, Recipe


class DatabaseBackupApiTests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            username="admin",
            password="secret123",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.user = get_user_model().objects.create_user(username="chef", password="secret123")

    def test_non_admin_cannot_export_or_import_database_backup(self):
        self.client.force_authenticate(self.user)

        export_response = self.client.get(reverse("database_export"))
        import_response = self.client.post(reverse("database_import"), {}, format="multipart")

        self.assertEqual(export_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(import_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_export_database_backup(self):
        Ingredient.objects.create(name="Salt")
        Recipe.objects.create(
            title="Backup Soup",
            description="Export me",
            instructions="Mix\nServe",
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)

        response = self.client.get(reverse("database_export"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/json")
        payload = json.loads(response.content)
        self.assertTrue(any(entry["model"] == "users.user" for entry in payload))
        self.assertTrue(any(entry["model"] == "recipes.recipe" for entry in payload))

    def test_admin_can_import_database_backup(self):
        original_recipe = Recipe.objects.create(
            title="Original Recipe",
            description="Keep me",
            instructions="Cook",
            created_by=self.admin,
        )
        self.client.force_authenticate(self.admin)
        export_response = self.client.get(reverse("database_export"))
        backup_file = SimpleUploadedFile(
            "cookbook-backup.json",
            export_response.content,
            content_type="application/json",
        )

        Recipe.objects.create(
            title="Temporary Recipe",
            description="Remove me",
            instructions="Delete",
            created_by=self.admin,
        )
        get_user_model().objects.create_user(username="temporary-user", password="secret123")

        import_response = self.client.post(
            reverse("database_import"),
            {"file": backup_file},
            format="multipart",
        )

        self.assertEqual(import_response.status_code, status.HTTP_200_OK)
        self.assertEqual(Recipe.objects.count(), 1)
        self.assertEqual(Recipe.objects.get().pk, original_recipe.pk)
        self.assertFalse(Recipe.objects.filter(title="Temporary Recipe").exists())
        self.assertFalse(get_user_model().objects.filter(username="temporary-user").exists())

    def test_import_requires_file(self):
        self.client.force_authenticate(self.admin)

        response = self.client.post(reverse("database_import"), {}, format="multipart")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "missing_backup_file")

    def test_import_rejects_invalid_payload(self):
        self.client.force_authenticate(self.admin)
        invalid_file = SimpleUploadedFile(
            "invalid.json",
            b'{"nope": true}',
            content_type="application/json",
        )

        response = self.client.post(
            reverse("database_import"),
            {"file": invalid_file},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "invalid_backup_file")


class VoskModelUploadApiTests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            username="admin",
            password="secret123",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.user = get_user_model().objects.create_user(username="chef", password="secret123")

    @override_settings(VOSK_MODEL_PATH="/tmp/test-vosk-model")
    def test_superuser_can_upload_and_replace_vosk_model(self):
        self.client.force_authenticate(self.admin)
        ExtractionSettings.objects.update_or_create(
            pk=1,
            defaults={
                "ollama_model": "llama3.2",
                "vosk_model_path": "/tmp/test-vosk-model",
            },
        )

        archive = BytesIO()
        with zipfile.ZipFile(archive, "w") as zf:
            zf.writestr("vosk-model-small/README", "model")
            zf.writestr("vosk-model-small/conf/model.conf", "config")
        archive.seek(0)

        response = self.client.post(
            reverse("vosk_model_upload"),
            {"file": SimpleUploadedFile("vosk.zip", archive.read(), content_type="application/zip")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(Path("/tmp/test-vosk-model/README").exists())
        self.assertTrue(Path("/tmp/test-vosk-model/conf/model.conf").exists())
        self.assertEqual(ExtractionSettings.get_solo().vosk_model_path, "/tmp/test-vosk-model")

    def test_non_superuser_cannot_upload_vosk_model(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(reverse("vosk_model_upload"), {}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @override_settings(VOSK_MODEL_PATH="/tmp/test-vosk-model")
    def test_vosk_upload_rejects_path_traversal_archive(self):
        self.client.force_authenticate(self.admin)

        archive = BytesIO()
        with zipfile.ZipFile(archive, "w") as zf:
            zf.writestr("../escape.txt", "bad")
        archive.seek(0)

        response = self.client.post(
            reverse("vosk_model_upload"),
            {"file": SimpleUploadedFile("vosk.zip", archive.read(), content_type="application/zip")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "invalid_vosk_archive")
        self.assertFalse(Path("/tmp/escape.txt").exists())

    @override_settings(
        VOSK_MODEL_PATH="/tmp/test-vosk-model",
        VOSK_MODEL_UPLOAD_MAX_ARCHIVE_BYTES=10,
    )
    def test_vosk_upload_rejects_oversized_archive(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse("vosk_model_upload"),
            {"file": SimpleUploadedFile("vosk.zip", b"x" * 20, content_type="application/zip")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "vosk_archive_too_large")


class ExtractionSettingsApiTests(APITestCase):
    def setUp(self):
        self.admin = get_user_model().objects.create_user(
            username="admin",
            password="secret123",
            role="admin",
            is_staff=True,
            is_superuser=True,
        )
        self.user = get_user_model().objects.create_user(username="chef", password="secret123")

    @patch("users.views._fetch_ollama_models", return_value=[{"name": "llama3.2", "isActive": True}])
    @override_settings(VOSK_MODEL_PATH="/tmp/test-vosk-model")
    def test_superuser_can_update_extraction_settings(self, _models_mock):
        Path("/tmp/test-vosk-model").mkdir(parents=True, exist_ok=True)
        self.client.force_authenticate(self.admin)

        response = self.client.patch(
            reverse("extraction_settings"),
            {"ollamaModel": "llama3.2", "voskModelPath": "/tmp/test-vosk-model"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["ollamaModel"], "llama3.2")
        self.assertEqual(response.data["voskModelPath"], "/tmp/test-vosk-model")

    def test_non_superuser_cannot_update_extraction_settings(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(reverse("extraction_settings"), {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
