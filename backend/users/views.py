"""User-facing API views for profiles, admin maintenance, and update status."""

from pathlib import Path
import shutil
import stat
from tempfile import TemporaryDirectory
import zipfile

import requests
from django.http import HttpResponse
from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from cookbook.api_errors import error_response
from django.conf import settings as django_settings
from cookbook.db_backup import export_backup_data, import_backup_data
from recipes.extraction.utils.public_video import get_vosk_model
from recipes.models import ExtractionSettings, get_effective_ollama_model, get_effective_vosk_model_path
from .models import User
from .serializers import ChangePasswordSerializer, UserRegisterSerializer, UserSerializer
from .update_checks import check_for_updates, dismiss_update, get_update_status
from .instance_mode import get_instance_configuration


def _single_user_mode():
    return django_settings.APP_MODE == "single_user"


class IsInstanceAdministrator(permissions.BasePermission):
    """Allow superusers, or the shared owner of a trusted single-user instance."""

    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        return bool(
            user
            and user.is_authenticated
            and (_single_user_mode() or user.is_superuser)
        )


# Compatibility name for existing views while centralizing the policy.
IsSuperuser = IsInstanceAdministrator


class ModeAwareTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        if _single_user_mode():
            return error_response(
                code="auth_not_enabled",
                message="Account authentication is disabled in single-user mode.",
                http_status=status.HTTP_403_FORBIDDEN,
            )
        return super().post(request, *args, **kwargs)


class ModeAwareTokenRefreshView(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        if _single_user_mode():
            return error_response(
                code="auth_not_enabled",
                message="Account authentication is disabled in single-user mode.",
                http_status=status.HTTP_403_FORBIDDEN,
            )
        return super().post(request, *args, **kwargs)


class AppConfigView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, _request):
        configuration = get_instance_configuration()
        single_user = configuration.mode == "single_user"
        response = Response(
            {
                "mode": configuration.mode,
                "authenticationRequired": not single_user,
                "registrationEnabled": not single_user and django_settings.AUTH_PROVIDER == "jwt",
                "authProvider": "none" if single_user else django_settings.AUTH_PROVIDER,
                "profileEnabled": True,
                "passwordManagementEnabled": not single_user and django_settings.AUTH_PROVIDER == "jwt",
                "administrationEnabled": single_user,
            }
        )
        response["Cache-Control"] = "no-store"
        return response

class UserRegisterView(generics.CreateAPIView):
    """
    POST /api/users/  
    Creates a new user (username, first_name, last_name, password)
    Optionally add: (bio, avatar, preferences).
    """
    queryset = User.objects.all()
    serializer_class = UserRegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        if _single_user_mode():
            return error_response(
                code="registration_disabled",
                message="Registration is disabled in single-user mode.",
                http_status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET  /api/users/me/   → retrieve current user’s profile  
    PUT  /api/users/me/   → replace entire profile (except username)  
    PATCH /api/users/me/  → partial update  
    DELETE /api/users/me/ → delete the current user
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        with transaction.atomic():
            user = User.objects.select_for_update().get(pk=request.user.pk)
            updates_preferences = "preferences" in request.data
            if updates_preferences:
                expected_version = request.data.get("preferencesVersion")
                if expected_version is None:
                    return error_response(
                        code="preferences_version_required",
                        message="The current preferences version is required before saving.",
                        http_status=status.HTTP_428_PRECONDITION_REQUIRED,
                        details={"currentVersion": user.preferences_version},
                    )
                if str(expected_version) != str(user.preferences_version):
                    return error_response(
                        code="preferences_version_conflict",
                        message="Preferences changed on another device. Refresh before saving again.",
                        http_status=status.HTTP_409_CONFLICT,
                        details={"currentVersion": user.preferences_version},
                    )

            serializer = self.get_serializer(user, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            if updates_preferences:
                serializer.save(preferences_version=user.preferences_version + 1)
            else:
                serializer.save()
            return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        if _single_user_mode():
            return error_response(
                code="account_deletion_disabled",
                message="The shared instance owner cannot be deleted.",
                http_status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if _single_user_mode():
            return error_response(
                code="password_management_disabled",
                message="Password management is disabled in single-user mode.",
                http_status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AppVersionView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, _request):
        return Response(
            {
                "appName": django_settings.APP_NAME,
                "version": django_settings.APP_VERSION,
                "gitSha": django_settings.APP_GIT_SHA,
            },
            status=status.HTTP_200_OK,
        )


def _serialize_update_status():
    current = get_update_status()
    current_version = current.current_version or django_settings.APP_VERSION
    latest_version = current.latest_version or ""
    repository = current.repository or django_settings.APP_UPDATE_REPOSITORY
    return {
        "currentVersion": current_version,
        "latestVersion": latest_version,
        "repository": repository,
        "releaseUrl": current.release_url,
        "updateAvailable": bool(current.update_available and latest_version and latest_version != current.dismissed_version),
        "lastCheckedAt": current.last_checked_at,
        "lastError": current.last_error,
        "dismissedVersion": current.dismissed_version,
        "updateChecksEnabled": bool(django_settings.APP_UPDATE_CHECK_ENABLED and repository),
    }


class AppUpdateStatusView(APIView):
    permission_classes = [IsSuperuser]

    def get(self, _request):
        return Response(_serialize_update_status(), status=status.HTTP_200_OK)


class AppUpdateCheckView(APIView):
    permission_classes = [IsSuperuser]

    def post(self, _request):
        check_for_updates()
        return Response(_serialize_update_status(), status=status.HTTP_200_OK)


class AppUpdateDismissView(APIView):
    permission_classes = [IsSuperuser]

    def post(self, request):
        version = str(request.data.get("version") or "").strip() or None
        dismiss_update(version)
        return Response(_serialize_update_status(), status=status.HTTP_200_OK)


class DatabaseExportView(APIView):
    permission_classes = [IsInstanceAdministrator]

    def get(self, _request):
        backup_bytes = export_backup_data()
        response = HttpResponse(backup_bytes, content_type="application/json")
        response["Content-Disposition"] = 'attachment; filename="cookbook-backup.json"'
        return response


class DatabaseImportView(APIView):
    permission_classes = [IsInstanceAdministrator]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return error_response(
                code="missing_backup_file",
                message="A backup JSON file is required.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "file"},
            )

        try:
            counts = import_backup_data(uploaded_file.read())
        except ValueError as exc:
            return error_response(
                code="invalid_backup_file",
                message="The uploaded backup file is not valid.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"reason": str(exc)},
            )
        except Exception as exc:
            return error_response(
                code="backup_import_failed",
                message="The backend could not import the uploaded backup.",
                http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                details={"reason": str(exc)},
            )

        return Response({"status": "ok", "counts": counts}, status=status.HTTP_200_OK)


def _discover_vosk_model_paths():
    candidates: set[str] = set()
    configured_path = get_effective_vosk_model_path()

    if configured_path:
        path = Path(configured_path)
        if path.is_dir():
            candidates.add(str(path.resolve()))
            for entry in path.parent.iterdir():
                if entry.is_dir() and entry.name.startswith("vosk-model"):
                    candidates.add(str(entry.resolve()))

    utils_dir = Path(__file__).resolve().parents[1] / "recipes" / "extraction" / "utils"
    if utils_dir.is_dir():
        for entry in utils_dir.iterdir():
            if entry.is_dir() and entry.name.startswith("vosk-model"):
                candidates.add(str(entry.resolve()))

    return sorted(candidates)


def _get_vosk_upload_target_path():
    configured_path = get_effective_vosk_model_path()
    if configured_path:
        return Path(configured_path)

    fallback_raw = getattr(django_settings, "VOSK_MODEL_PATH", "") or ""
    if fallback_raw.strip():
        return Path(fallback_raw).expanduser()

    return Path(__file__).resolve().parents[2] / "vosk-model"


def _discover_ollama_models():
    base_url = (getattr(django_settings, "OLLAMA_HOST", "") or "").rstrip("/")
    if not base_url:
        return []

    try:
        response = requests.get(f"{base_url}/api/tags", timeout=5)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return []

    models = payload.get("models") or []
    names = [str(model.get("name")).strip() for model in models if model.get("name")]
    return sorted(set(filter(None, names)))


def _fetch_ollama_models():
    base_url = (getattr(django_settings, "OLLAMA_HOST", "") or "").rstrip("/")
    if not base_url:
        return []

    try:
        response = requests.get(f"{base_url}/api/tags", timeout=5)
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return []

    models = payload.get("models") or []
    items = []
    active_name = get_effective_ollama_model()
    for model in models:
        name = str(model.get("name") or "").strip()
        if not name:
            continue
        items.append(
            {
                "name": name,
                "size": model.get("size"),
                "modifiedAt": model.get("modified_at"),
                "family": ((model.get("details") or {}).get("family") or ""),
                "parameterSize": ((model.get("details") or {}).get("parameter_size") or ""),
                "quantizationLevel": ((model.get("details") or {}).get("quantization_level") or ""),
                "isActive": name == active_name,
            }
        )
    return sorted(items, key=lambda item: item["name"])


def _serialize_extraction_settings():
    installed_models = _fetch_ollama_models()
    return {
        "ollamaModel": get_effective_ollama_model(),
        "voskModelPath": get_effective_vosk_model_path(),
        "ollamaModelOptions": [model["name"] for model in installed_models],
        "installedOllamaModels": installed_models,
        "voskModelPathOptions": _discover_vosk_model_paths(),
    }


def _replace_directory_contents(source_dir: Path, target_dir: Path):
    target_dir.mkdir(parents=True, exist_ok=True)
    for child in target_dir.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    for child in source_dir.iterdir():
        destination = target_dir / child.name
        if child.is_dir():
            shutil.copytree(child, destination)
        else:
            shutil.copy2(child, destination)


def _validate_zip_member(name: str):
    normalized = name.replace("\\", "/")
    if not normalized or normalized.endswith("/"):
        return
    parts = [part for part in normalized.split("/") if part not in {"", "."}]
    if normalized.startswith("/") or any(part == ".." for part in parts):
        raise ValueError("Archive contains an unsafe path.")


def _safe_extract_zip(archive: zipfile.ZipFile, extract_dir: Path):
    max_file_count = getattr(django_settings, "VOSK_MODEL_UPLOAD_MAX_FILE_COUNT", 5000)
    max_extracted_bytes = getattr(django_settings, "VOSK_MODEL_UPLOAD_MAX_EXTRACTED_BYTES", 2147483648)
    members = archive.infolist()

    if len(members) > max_file_count:
        raise ValueError("Archive contains too many files.")

    total_size = 0
    for member in members:
        _validate_zip_member(member.filename)
        total_size += member.file_size
        if total_size > max_extracted_bytes:
            raise ValueError("Archive is too large when extracted.")

        mode = (member.external_attr >> 16) & 0o170000
        if stat.S_ISLNK(mode):
            raise ValueError("Archive contains unsupported symbolic links.")

    for member in members:
        normalized = member.filename.replace("\\", "/")
        if not normalized or normalized.endswith("/"):
            continue

        destination = (extract_dir / normalized).resolve()
        if extract_dir.resolve() not in destination.parents and destination != extract_dir.resolve():
            raise ValueError("Archive contains an unsafe path.")

        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member) as source, open(destination, "wb") as target:
            shutil.copyfileobj(source, target)


class ExtractionSettingsView(APIView):
    permission_classes = [IsSuperuser]

    def get(self, _request):
        return Response(_serialize_extraction_settings(), status=status.HTTP_200_OK)

    def patch(self, request):
        ollama_model = str(request.data.get("ollamaModel") or "").strip()
        vosk_model_path = str(request.data.get("voskModelPath") or "").strip()

        if not ollama_model:
            return error_response(
                code="missing_ollama_model",
                message="An Ollama model is required.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "ollamaModel"},
            )

        if not vosk_model_path:
            return error_response(
                code="missing_vosk_model_path",
                message="A Vosk model path is required.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "voskModelPath"},
            )

        if not Path(vosk_model_path).is_dir():
            return error_response(
                code="invalid_vosk_model_path",
                message="The selected Vosk model path does not exist on the server.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "voskModelPath"},
            )

        installed_models = {model["name"] for model in _fetch_ollama_models()}
        if installed_models and ollama_model not in installed_models:
            return error_response(
                code="ollama_model_not_installed",
                message="The selected Ollama model is not installed.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "ollamaModel"},
            )

        current = ExtractionSettings.get_solo()
        if current is None:
            current = ExtractionSettings.objects.create(
                ollama_model=ollama_model,
                vosk_model_path=vosk_model_path,
            )
        else:
            current.ollama_model = ollama_model
            current.vosk_model_path = vosk_model_path
            current.save(update_fields=["ollama_model", "vosk_model_path", "updated_at"])

        get_vosk_model.cache_clear()

        return Response(_serialize_extraction_settings(), status=status.HTTP_200_OK)

    def post(self, request):
        model_name = str(request.data.get("model") or "").strip()
        if not model_name:
            return error_response(
                code="missing_model_name",
                message="A model name is required to pull an Ollama model.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "model"},
            )

        base_url = (getattr(django_settings, "OLLAMA_HOST", "") or "").rstrip("/")
        try:
            response = requests.post(
                f"{base_url}/api/pull",
                json={"model": model_name, "stream": False},
                timeout=600,
            )
            response.raise_for_status()
        except Exception as exc:
            return error_response(
                code="ollama_pull_failed",
                message="The backend could not pull the requested Ollama model.",
                http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                details={"reason": str(exc)},
            )

        return Response(_serialize_extraction_settings(), status=status.HTTP_200_OK)

    def delete(self, request):
        model_name = str(request.data.get("model") or request.query_params.get("model") or "").strip()
        if not model_name:
            return error_response(
                code="missing_model_name",
                message="A model name is required to delete an Ollama model.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "model"},
            )

        if model_name == get_effective_ollama_model():
            return error_response(
                code="cannot_delete_active_model",
                message="Select a different active Ollama model before deleting this one.",
                http_status=status.HTTP_409_CONFLICT,
                details={"field": "model"},
            )

        base_url = (getattr(django_settings, "OLLAMA_HOST", "") or "").rstrip("/")
        try:
            response = requests.delete(
                f"{base_url}/api/delete",
                json={"model": model_name},
                timeout=60,
            )
            response.raise_for_status()
        except Exception as exc:
            return error_response(
                code="ollama_delete_failed",
                message="The backend could not delete the requested Ollama model.",
                http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                details={"reason": str(exc)},
            )

        return Response(_serialize_extraction_settings(), status=status.HTTP_200_OK)


class VoskModelUploadView(APIView):
    permission_classes = [IsSuperuser]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded_file = request.FILES.get("file")
        if uploaded_file is None:
            return error_response(
                code="missing_vosk_archive",
                message="A Vosk model zip file is required.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "file"},
            )

        filename = (uploaded_file.name or "").lower()
        if not filename.endswith(".zip"):
            return error_response(
                code="invalid_vosk_archive_type",
                message="Upload a .zip archive containing the Vosk model files.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "file"},
            )

        if uploaded_file.size and uploaded_file.size > getattr(django_settings, "VOSK_MODEL_UPLOAD_MAX_ARCHIVE_BYTES", 1073741824):
            return error_response(
                code="vosk_archive_too_large",
                message="The uploaded Vosk archive is too large.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "file"},
            )

        target_dir = _get_vosk_upload_target_path().resolve()

        try:
            with TemporaryDirectory(prefix="vosk-upload-") as tmpdir:
                archive_path = Path(tmpdir) / "model.zip"
                with open(archive_path, "wb") as handle:
                    for chunk in uploaded_file.chunks():
                        handle.write(chunk)

                extract_dir = Path(tmpdir) / "extracted"
                extract_dir.mkdir(parents=True, exist_ok=True)

                with zipfile.ZipFile(archive_path) as archive:
                    _safe_extract_zip(archive, extract_dir)

                entries = [entry for entry in extract_dir.iterdir() if entry.name != "__MACOSX"]
                if len(entries) == 1 and entries[0].is_dir():
                    model_dir = entries[0]
                else:
                    model_dir = extract_dir

                if not any(model_dir.iterdir()):
                    return error_response(
                        code="empty_vosk_archive",
                        message="The uploaded archive did not contain a Vosk model.",
                        http_status=status.HTTP_400_BAD_REQUEST,
                    )

                _replace_directory_contents(model_dir, target_dir)
        except zipfile.BadZipFile:
            return error_response(
                code="invalid_vosk_archive",
                message="The uploaded file is not a valid zip archive.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        except ValueError as exc:
            return error_response(
                code="invalid_vosk_archive",
                message=str(exc),
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return error_response(
                code="vosk_upload_failed",
                message="The backend could not replace the Vosk model.",
                http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                details={"reason": str(exc)},
            )

        current = ExtractionSettings.get_solo()
        if current is None:
            ExtractionSettings.objects.create(
                ollama_model=get_effective_ollama_model(),
                vosk_model_path=str(target_dir),
            )
        else:
            current.vosk_model_path = str(target_dir)
            current.save(update_fields=["vosk_model_path", "updated_at"])

        get_vosk_model.cache_clear()

        return Response(_serialize_extraction_settings(), status=status.HTTP_200_OK)
