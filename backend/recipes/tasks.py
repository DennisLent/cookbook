"""Background jobs for long-running recipe import and extraction workflows."""

import logging
from pathlib import Path
from tempfile import TemporaryDirectory

from celery import shared_task
from django.core.files import File
from django.db import transaction
from django.utils import timezone

from .extraction.services import extract_recipe_from_transcript
from .extraction.utils import (
    PublicVideoDownloadError,
    download_public_video,
    extract_audio_from_video,
    normalize_transcript_text,
    transcribe_wav_with_vosk,
)
from .models import RecipeImportJob, get_effective_vosk_model_path

logger = logging.getLogger(__name__)


@shared_task(bind=True, autoretry_for=(), retry_backoff=False, max_retries=5)
def process_recipe_import_job(self, job_id: int):
    try:
        job = RecipeImportJob.objects.get(pk=job_id)
    except RecipeImportJob.DoesNotExist as exc:
        raise self.retry(exc=exc, countdown=1)

    job.status = RecipeImportJob.STATUS_RUNNING
    job.progress_stage = RecipeImportJob.STAGE_DOWNLOADING
    job.started_at = timezone.now()
    job.finished_at = None
    job.error_code = ""
    job.error_message = ""
    job.celery_task_id = self.request.id or ""
    job.save(update_fields=["status", "progress_stage", "started_at", "finished_at", "error_code", "error_message", "celery_task_id", "updated_at"])

    try:
        with TemporaryDirectory(prefix=f"recipe-import-{job.pk}-") as tmpdir:
            video_path, file_size = download_public_video(job.source_url, tmpdir)
            with transaction.atomic():
                job.file_size_bytes = file_size
                job.transcript = ""
                job.extracted_recipe = {}
                job.media_file = ""
                job.audio_file = ""

                if job.persist_media:
                    with open(video_path, "rb") as video_handle:
                        job.media_file.save(Path(video_path).name, File(video_handle), save=False)

                if not job.download_only:
                    job.progress_stage = RecipeImportJob.STAGE_PARSING
                    job.save(update_fields=["progress_stage", "updated_at"])
                    audio_path = extract_audio_from_video(video_path)
                    transcript = normalize_transcript_text(
                        transcribe_wav_with_vosk(audio_path, model_path=get_effective_vosk_model_path())
                    )
                    extracted_recipe = extract_recipe_from_transcript(transcript=transcript, source_url=job.source_url)
                    job.progress_stage = RecipeImportJob.STAGE_VERIFYING
                    job.save(update_fields=["progress_stage", "updated_at"])

                    if extracted_recipe is None:
                        raise PublicVideoDownloadError(
                            "recipe_not_found",
                            "No recipe data could be extracted from the video's transcript.",
                        )

                    job.transcript = transcript
                    job.extracted_recipe = extracted_recipe

                job.status = RecipeImportJob.STATUS_DONE
                job.progress_stage = RecipeImportJob.STAGE_DONE
                job.finished_at = timezone.now()
                job.save()

    except PublicVideoDownloadError as exc:
        logger.warning(
            "Recipe import job %s failed for %s with %s: %s",
            job.pk,
            job.source_url,
            exc.code,
            exc.message,
        )
        job.status = RecipeImportJob.STATUS_FAILED
        job.error_code = exc.code
        job.error_message = exc.message
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error_code", "error_message", "finished_at", "updated_at"])
        raise
    except Exception as exc:
        logger.exception("Recipe import job %s failed unexpectedly for %s", job.pk, job.source_url)
        job.status = RecipeImportJob.STATUS_FAILED
        job.error_code = "unexpected_error"
        job.error_message = str(exc)
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "error_code", "error_message", "finished_at", "updated_at"])
        raise
