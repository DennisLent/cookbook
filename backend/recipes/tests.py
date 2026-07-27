from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.db import transaction
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from yt_dlp.utils import DownloadError

from recipes.extraction.utils import validate_public_video_url
from recipes.models import RecipeImportJob
from recipes.extraction.services import build_recipe_payload_from_details, validate_public_website_url
from recipes.extraction.utils.public_video import PublicVideoDownloadError, download_public_video


class RecipeImportJobApiTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="chef", password="secret123")
        self.client.force_authenticate(self.user)

    @patch("recipes.extraction.utils.validate_public_video_url", return_value="instagram")
    @patch("recipes.tasks.process_recipe_import_job.delay")
    def test_create_recipe_import_job_queues_background_task(self, delay_mock, validate_mock):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse("recipe-import-job-list"),
                {"url": "https://www.instagram.com/reel/abc123/"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(RecipeImportJob.objects.count(), 1)

        job = RecipeImportJob.objects.get()
        self.assertEqual(job.status, RecipeImportJob.STATUS_QUEUED)
        self.assertEqual(job.progress_stage, RecipeImportJob.STAGE_QUEUED)
        self.assertEqual(job.platform, "instagram")
        delay_mock.assert_called_once_with(job.pk)
        validate_mock.assert_called_once()

    @patch("recipes.extraction.utils.validate_public_video_url", return_value="tiktok")
    @patch("recipes.tasks.process_recipe_import_job.delay")
    def test_create_recipe_import_job_supports_video_only_mode(self, delay_mock, validate_mock):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse("recipe-import-job-list"),
                {"url": "https://www.tiktok.com/@cook/video/123", "videoOnly": True},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        job = RecipeImportJob.objects.get()
        self.assertTrue(job.download_only)
        self.assertTrue(job.persist_media)
        self.assertTrue(response.data["videoOnly"])
        self.assertTrue(response.data["saveVideo"])
        delay_mock.assert_called_once_with(job.pk)
        validate_mock.assert_called_once()

    @patch("recipes.extraction.utils.validate_public_video_url", return_value="instagram")
    @patch("recipes.tasks.process_recipe_import_job.delay")
    def test_create_recipe_import_job_supports_save_video_without_skipping_extraction(self, delay_mock, validate_mock):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse("recipe-import-job-list"),
                {"url": "https://www.instagram.com/reel/abc123/", "saveVideo": True},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        job = RecipeImportJob.objects.get()
        self.assertFalse(job.download_only)
        self.assertTrue(job.persist_media)
        self.assertFalse(response.data["videoOnly"])
        self.assertTrue(response.data["saveVideo"])
        delay_mock.assert_called_once_with(job.pk)
        validate_mock.assert_called_once()

    @patch("recipes.extraction.services.validate_public_website_url", return_value="website")
    @patch("recipes.tasks.process_recipe_import_job.delay")
    def test_create_recipe_import_job_accepts_recipe_website(self, delay_mock, _validate_mock):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse("recipe-import-job-list"),
                {"url": "https://www.bbcgoodfood.com/recipes/creamy-mushroom-pasta"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED, response.data)
        job = RecipeImportJob.objects.get()
        self.assertEqual(job.platform, RecipeImportJob.PLATFORM_WEBSITE)
        self.assertFalse(job.download_only)
        self.assertFalse(job.persist_media)
        delay_mock.assert_called_once_with(job.pk)

    @patch("recipes.extraction.services.validate_public_website_url", return_value="website")
    def test_recipe_website_rejects_video_only_options(self, _validate_mock):
        response = self.client.post(
            reverse("recipe-import-job-list"),
            {
                "url": "https://www.bbcgoodfood.com/recipes/creamy-mushroom-pasta",
                "saveVideo": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["error"]["code"], "website_video_options_unsupported")

    @patch("recipes.tasks.process_recipe_import_job.delay")
    def test_create_recipe_import_job_accepts_youtube_url(self, delay_mock):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                reverse("recipe-import-job-list"),
                {"url": "https://www.youtube.com/watch?v=HILQ80TNyCk"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        job = RecipeImportJob.objects.get()
        self.assertEqual(job.platform, RecipeImportJob.PLATFORM_YOUTUBE)
        delay_mock.assert_called_once_with(job.pk)

    @patch("recipes.extraction.utils.validate_public_video_url", return_value="instagram")
    @patch("recipes.tasks.process_recipe_import_job.delay")
    def test_create_recipe_import_job_waits_until_transaction_commit(self, delay_mock, validate_mock):
        with self.captureOnCommitCallbacks(execute=True):
            with transaction.atomic():
                response = self.client.post(
                    reverse("recipe-import-job-list"),
                    {"url": "https://www.instagram.com/reel/abc123/"},
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
                delay_mock.assert_not_called()

        job = RecipeImportJob.objects.get()
        delay_mock.assert_called_once_with(job.pk)
        validate_mock.assert_called_once()

    def test_retrieve_recipe_import_job_is_scoped_to_request_user(self):
        other_user = get_user_model().objects.create_user(username="other", password="secret123")
        job = RecipeImportJob.objects.create(
            user=other_user,
            source_url="https://www.tiktok.com/@cook/video/123",
            platform=RecipeImportJob.PLATFORM_TIKTOK,
        )

        response = self.client.get(reverse("recipe-import-job-detail", args=[job.pk]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class RecipeImportJobTaskTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="task-user", password="secret123")

    @patch("recipes.tasks.extract_recipe_from_transcript")
    @patch("recipes.tasks.transcribe_wav_with_vosk", return_value="mix flour with eggs and bake for twenty minutes " * 5)
    @patch("recipes.tasks.extract_audio_from_video")
    @patch("recipes.tasks.download_public_video")
    def test_process_recipe_import_job_marks_job_done(
        self,
        download_mock,
        extract_audio_mock,
        transcribe_mock,
        extract_recipe_mock,
    ):
        job = RecipeImportJob.objects.create(
            user=self.user,
            source_url="https://www.instagram.com/reel/abc123/",
            platform=RecipeImportJob.PLATFORM_INSTAGRAM,
        )

        def fake_download(_url, target_dir):
            video_path = f"{target_dir}/clip.mp4"
            with open(video_path, "wb") as handle:
                handle.write(b"video")
            return video_path, 5

        def fake_audio(video_path):
            audio_path = video_path.replace(".mp4", ".wav")
            with open(audio_path, "wb") as handle:
                handle.write(b"audio")
            return audio_path

        download_mock.side_effect = fake_download
        extract_audio_mock.side_effect = fake_audio
        extract_recipe_mock.return_value = {
            "title": "Test Recipe",
            "description": "https://www.instagram.com/reel/abc123/",
            "instructions": "Mix\nBake",
            "ingredients_data": [{"ingredient": "Flour", "amount": "1 cup"}],
            "tags": [],
            "image": None,
        }

        from recipes.tasks import process_recipe_import_job

        process_recipe_import_job.run(job.pk)

        job.refresh_from_db()
        self.assertEqual(job.status, RecipeImportJob.STATUS_DONE)
        self.assertEqual(job.progress_stage, RecipeImportJob.STAGE_DONE)
        self.assertEqual(job.file_size_bytes, 5)
        self.assertFalse(job.media_file.name)
        self.assertFalse(job.audio_file.name)
        self.assertEqual(job.extracted_recipe["title"], "Test Recipe")
        transcribe_mock.assert_called_once()

    @patch("recipes.tasks.extract_recipe_from_transcript")
    @patch("recipes.tasks.transcribe_wav_with_vosk", return_value="mix flour with eggs and bake for twenty minutes " * 5)
    @patch("recipes.tasks.extract_audio_from_video")
    @patch("recipes.tasks.download_public_video")
    def test_process_recipe_import_job_persists_video_only_when_requested(
        self,
        download_mock,
        extract_audio_mock,
        transcribe_mock,
        extract_recipe_mock,
    ):
        job = RecipeImportJob.objects.create(
            user=self.user,
            source_url="https://www.instagram.com/reel/abc123/",
            platform=RecipeImportJob.PLATFORM_INSTAGRAM,
            persist_media=True,
        )

        def fake_download(_url, target_dir):
            video_path = f"{target_dir}/clip.mp4"
            with open(video_path, "wb") as handle:
                handle.write(b"video")
            return video_path, 5

        def fake_audio(video_path):
            audio_path = video_path.replace(".mp4", ".wav")
            with open(audio_path, "wb") as handle:
                handle.write(b"audio")
            return audio_path

        download_mock.side_effect = fake_download
        extract_audio_mock.side_effect = fake_audio
        extract_recipe_mock.return_value = {
            "title": "Test Recipe",
            "description": "https://www.instagram.com/reel/abc123/",
            "instructions": "Mix\nBake",
            "ingredients_data": [{"ingredient": "Flour", "amount": "1 cup"}],
            "tags": [],
            "image": None,
        }

        from recipes.tasks import process_recipe_import_job

        process_recipe_import_job.run(job.pk)

        job.refresh_from_db()
        self.assertEqual(job.status, RecipeImportJob.STATUS_DONE)
        self.assertTrue(job.media_file.name)
        self.assertFalse(job.audio_file.name)
        self.assertEqual(job.extracted_recipe["title"], "Test Recipe")
        transcribe_mock.assert_called_once()

    @patch("recipes.tasks.download_public_video")
    def test_process_recipe_import_job_marks_job_failed(self, download_mock):
        job = RecipeImportJob.objects.create(
            user=self.user,
            source_url="https://www.tiktok.com/@cook/video/123",
            platform=RecipeImportJob.PLATFORM_TIKTOK,
        )
        from recipes.extraction.utils import PublicVideoDownloadError
        from recipes.tasks import process_recipe_import_job

        download_mock.side_effect = PublicVideoDownloadError("authentication_required", "Private video")

        with self.assertRaises(PublicVideoDownloadError):
            process_recipe_import_job.run(job.pk)

        job.refresh_from_db()
        self.assertEqual(job.status, RecipeImportJob.STATUS_FAILED)
        self.assertEqual(job.progress_stage, RecipeImportJob.STAGE_DOWNLOADING)
        self.assertEqual(job.error_code, "authentication_required")

    @patch("recipes.tasks.download_public_video")
    @patch("recipes.tasks.extract_recipe_from_website")
    def test_process_recipe_import_job_scrapes_website_without_video_download(
        self,
        extract_mock,
        download_mock,
    ):
        job = RecipeImportJob.objects.create(
            user=self.user,
            source_url="https://www.bbcgoodfood.com/recipes/creamy-mushroom-pasta",
            platform=RecipeImportJob.PLATFORM_WEBSITE,
        )
        extract_mock.return_value = {
            "title": "Creamy mushroom pasta",
            "description": "A quick dinner",
            "instructions": "Boil pasta\nMake sauce",
            "ingredients_data": [{"ingredient": "Mushrooms", "amount": "250g"}],
            "tags": [],
            "image": None,
        }

        from recipes.tasks import process_recipe_import_job

        process_recipe_import_job.run(job.pk)

        job.refresh_from_db()
        self.assertEqual(job.status, RecipeImportJob.STATUS_DONE)
        self.assertEqual(job.progress_stage, RecipeImportJob.STAGE_DONE)
        self.assertEqual(job.extracted_recipe["title"], "Creamy mushroom pasta")
        download_mock.assert_not_called()

    @patch("recipes.tasks.transcribe_wav_with_vosk")
    @patch("recipes.tasks.extract_audio_from_video")
    @patch("recipes.tasks.download_public_video")
    def test_process_recipe_import_job_download_only_saves_video_without_parsing(
        self,
        download_mock,
        extract_audio_mock,
        transcribe_mock,
    ):
        job = RecipeImportJob.objects.create(
            user=self.user,
            source_url="https://www.instagram.com/reel/video-only/",
            platform=RecipeImportJob.PLATFORM_INSTAGRAM,
            download_only=True,
            persist_media=True,
        )

        def fake_download(_url, target_dir):
            video_path = f"{target_dir}/clip.mp4"
            with open(video_path, "wb") as handle:
                handle.write(b"video")
            return video_path, 5

        download_mock.side_effect = fake_download

        from recipes.tasks import process_recipe_import_job

        process_recipe_import_job.run(job.pk)

        job.refresh_from_db()
        self.assertEqual(job.status, RecipeImportJob.STATUS_DONE)
        self.assertEqual(job.progress_stage, RecipeImportJob.STAGE_DONE)
        self.assertEqual(job.file_size_bytes, 5)
        self.assertTrue(job.media_file.name)
        self.assertFalse(job.audio_file.name)
        self.assertEqual(job.transcript, "")
        self.assertEqual(job.extracted_recipe, {})
        extract_audio_mock.assert_not_called()
        transcribe_mock.assert_not_called()

    def test_process_recipe_import_job_retries_when_job_is_not_visible_yet(self):
        from celery.exceptions import Retry
        from recipes.tasks import process_recipe_import_job

        task = process_recipe_import_job
        retry = Mock(side_effect=Retry())
        with patch.object(task, "retry", retry):
            with self.assertRaises(Retry):
                task.run(999999)

        retry.assert_called_once()
        _, kwargs = retry.call_args
        self.assertEqual(kwargs["countdown"], 1)
        self.assertIsInstance(kwargs["exc"], RecipeImportJob.DoesNotExist)


class PublicVideoValidationTests(APITestCase):
    @override_settings(
        RECIPE_IMPORT_ALLOWED_HOSTS=[
            "instagram.com",
            "www.instagram.com",
            "m.instagram.com",
            "tiktok.com",
            "www.tiktok.com",
            "m.tiktok.com",
            "vm.tiktok.com",
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "youtu.be",
        ]
    )
    def test_validate_public_video_url_accepts_youtube_hosts(self):
        self.assertEqual(
            validate_public_video_url("https://www.youtube.com/watch?v=HILQ80TNyCk"),
            "youtube",
        )
        self.assertEqual(
            validate_public_video_url("https://youtu.be/HILQ80TNyCk"),
            "youtube",
        )

    @patch(
        "recipes.extraction.services.socket.getaddrinfo",
        return_value=[(2, 1, 6, "", ("127.0.0.1", 80))],
    )
    def test_validate_public_website_url_rejects_private_addresses(self, _dns_mock):
        with self.assertRaisesMessage(ValueError, "public website"):
            validate_public_website_url("http://localhost/recipe")


class PublicVideoDownloadTests(APITestCase):
    @override_settings(RECIPE_IMPORT_COOKIE_FILE="/tmp/import-cookies.txt")
    @patch("recipes.extraction.utils.public_video.Path.is_file", return_value=True)
    @patch("recipes.extraction.utils.public_video.YoutubeDL")
    def test_download_public_video_passes_cookie_file_to_yt_dlp(self, youtube_dl_mock, _is_file_mock):
        manager = youtube_dl_mock.return_value.__enter__.return_value
        manager.extract_info.side_effect = DownloadError("ERROR: Sign in to confirm you're not a bot")

        with self.assertRaises(PublicVideoDownloadError):
            download_public_video("https://www.instagram.com/reel/abc123/", "/tmp/recipe-import")

        options = youtube_dl_mock.call_args.args[0]
        self.assertEqual(options["cookiefile"], "/tmp/import-cookies.txt")

    @patch("recipes.extraction.utils.public_video.YoutubeDL")
    def test_download_public_video_includes_yt_dlp_reason_in_failure_message(self, youtube_dl_mock):
        manager = youtube_dl_mock.return_value.__enter__.return_value
        manager.extract_info.side_effect = DownloadError("ERROR: HTTP Error 403: Forbidden")

        with self.assertRaises(PublicVideoDownloadError) as ctx:
            download_public_video("https://www.instagram.com/reel/abc123/", "/tmp/recipe-import")

        self.assertEqual(ctx.exception.code, "download_failed")
        self.assertIn("yt-dlp reported: HTTP Error 403: Forbidden", ctx.exception.message)


class RecipeExtractionServiceTests(APITestCase):
    def test_build_recipe_payload_from_details_handles_null_llm_fields(self):
        payload = build_recipe_payload_from_details(
            details={
                "title": None,
                "ingredients": [
                    {"name": "Flour", "amount": None},
                    {"name": None, "amount": "1 tsp"},
                ],
                "instructions": [None, "Mix everything together", ""],
            },
            source_url="https://www.instagram.com/reel/example/",
        )

        self.assertIsNotNone(payload)
        self.assertEqual(payload["title"], "Imported recipe")
        self.assertEqual(
            payload["ingredients_data"],
            [{"ingredient": "Flour", "amount": ""}],
        )
        self.assertEqual(payload["instructions"], "Mix everything together")
