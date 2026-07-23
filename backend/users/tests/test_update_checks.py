from unittest.mock import Mock, patch

import requests
from django.test import TestCase, override_settings

from users.models import AppUpdateStatus
from users.tasks import check_for_app_updates
from users.update_checks import (
    _build_tags_api_url,
    check_for_updates,
    dismiss_update,
    get_update_status,
    is_newer_version,
    parse_version,
    select_latest_version,
)
from users.views import _serialize_update_status


class UpdateCheckVersionParsingTests(TestCase):
    def test_parse_version_accepts_prefixed_and_unprefixed_semver(self):
        self.assertEqual(parse_version("v1.2.3"), (1, 2, 3))
        self.assertEqual(parse_version("1.2.3"), (1, 2, 3))

    def test_parse_version_rejects_non_stable_or_incomplete_values(self):
        self.assertIsNone(parse_version(""))
        self.assertIsNone(parse_version("v1.2"))
        self.assertIsNone(parse_version("v1.2.3-beta"))
        self.assertIsNone(parse_version("main"))

    def test_select_latest_version_prefers_highest_stable_semver(self):
        latest = select_latest_version(["main", "1.10.0", "v1.2.3", "v2.0.0", "release-candidate"])
        self.assertEqual(latest, "v2.0.0")

    def test_is_newer_version_returns_false_for_invalid_values(self):
        self.assertTrue(is_newer_version("v1.2.3", "v1.3.0"))
        self.assertFalse(is_newer_version("v1.3.0", "v1.3.0"))
        self.assertFalse(is_newer_version("dev", "v1.3.0"))
        self.assertFalse(is_newer_version("v1.3.0", "latest"))


class UpdateCheckFlowTests(TestCase):
    def _mock_response(self, payload):
        mock_response = Mock()
        mock_response.json.return_value = payload
        mock_response.raise_for_status.return_value = None
        return mock_response

    def test_get_update_status_creates_singleton_record(self):
        status = get_update_status()

        self.assertEqual(AppUpdateStatus.objects.count(), 1)
        self.assertEqual(status.latest_version, "")
        self.assertFalse(status.update_available)

    @override_settings(APP_VERSION="v1.0.0", APP_UPDATE_CHECK_ENABLED=False, APP_UPDATE_REPOSITORY="example/emma-cookbook")
    def test_check_for_updates_marks_disabled_checks(self):
        status = check_for_updates()

        self.assertEqual(status.current_version, "v1.0.0")
        self.assertEqual(status.repository, "example/emma-cookbook")
        self.assertFalse(status.update_available)
        self.assertEqual(status.last_error, "Update checks are disabled.")
        self.assertIsNotNone(status.last_checked_at)

    @override_settings(APP_VERSION="v1.0.0", APP_UPDATE_CHECK_ENABLED=True, APP_UPDATE_REPOSITORY="")
    def test_check_for_updates_requires_repository_configuration(self):
        status = check_for_updates()

        self.assertFalse(status.update_available)
        self.assertEqual(status.last_error, "APP_UPDATE_REPOSITORY is not configured.")
        self.assertIsNotNone(status.last_checked_at)

    @override_settings(
        APP_VERSION="v1.0.0",
        APP_UPDATE_CHECK_ENABLED=True,
        APP_UPDATE_REPOSITORY="example/emma-cookbook",
        APP_UPDATE_CHECK_TAG_LIMIT=7,
        APP_UPDATE_CHECK_TIMEOUT_SECONDS=12,
    )
    @patch("users.update_checks.requests.get")
    def test_check_for_updates_calls_github_tags_api_with_expected_parameters(self, mock_get):
        mock_get.return_value = self._mock_response([{"name": "v1.2.0"}])

        status = check_for_updates()

        self.assertEqual(status.latest_version, "v1.2.0")
        mock_get.assert_called_once_with(
            "https://api.github.com/repos/example/emma-cookbook/tags",
            params={"per_page": 7},
            headers={"Accept": "application/vnd.github+json"},
            timeout=12,
        )

    @override_settings(APP_VERSION="v1.0.0", APP_UPDATE_CHECK_ENABLED=True, APP_UPDATE_REPOSITORY="example/emma-cookbook")
    @patch("users.update_checks.requests.get")
    def test_check_for_updates_handles_request_failures(self, mock_get):
        mock_get.side_effect = requests.Timeout("timed out")

        status = check_for_updates()

        self.assertFalse(status.update_available)
        self.assertIn("Update check failed:", status.last_error)
        self.assertIn("timed out", status.last_error)

    @override_settings(APP_VERSION="v1.0.0", APP_UPDATE_CHECK_ENABLED=True, APP_UPDATE_REPOSITORY="example/emma-cookbook")
    @patch("users.update_checks.requests.get")
    def test_check_for_updates_rejects_repositories_without_stable_tags(self, mock_get):
        mock_get.return_value = self._mock_response(
            [{"name": "main"}, {"name": "v2.0.0-rc1"}, {"name": "nightly"}]
        )

        status = check_for_updates()

        self.assertFalse(status.update_available)
        self.assertEqual(status.last_error, "No stable version tags were found in the configured repository.")

    @override_settings(APP_VERSION="v1.2.0", APP_UPDATE_CHECK_ENABLED=True, APP_UPDATE_REPOSITORY="example/emma-cookbook")
    @patch("users.update_checks.requests.get")
    def test_check_for_updates_sets_release_metadata_when_newer_tag_exists(self, mock_get):
        mock_get.return_value = self._mock_response(
            [{"name": "v1.3.0"}, {"name": "v1.2.5"}, {"name": "v1.2.0"}]
        )

        status = check_for_updates()

        self.assertEqual(status.latest_version, "v1.3.0")
        self.assertEqual(status.release_url, "https://github.com/example/emma-cookbook/releases")
        self.assertTrue(status.update_available)
        self.assertEqual(status.last_error, "")

    @override_settings(APP_VERSION="v1.2.0", APP_UPDATE_CHECK_ENABLED=True, APP_UPDATE_REPOSITORY="example/emma-cookbook")
    @patch("users.update_checks.requests.get")
    def test_check_for_updates_respects_dismissed_version(self, mock_get):
        AppUpdateStatus.objects.create(
            current_version="v1.2.0",
            latest_version="v1.3.0",
            repository="example/emma-cookbook",
            dismissed_version="v1.3.0",
            update_available=False,
        )
        mock_get.return_value = self._mock_response([{"name": "v1.3.0"}])

        status = check_for_updates()

        self.assertEqual(status.latest_version, "v1.3.0")
        self.assertFalse(status.update_available)

    def test_dismiss_update_defaults_to_latest_version(self):
        AppUpdateStatus.objects.create(
            current_version="v1.0.0",
            latest_version="v1.2.0",
            repository="example/emma-cookbook",
            update_available=True,
        )

        status = dismiss_update()

        self.assertEqual(status.dismissed_version, "v1.2.0")
        self.assertFalse(status.update_available)

    def test_dismiss_update_keeps_notice_when_dismissing_older_version(self):
        AppUpdateStatus.objects.create(
            current_version="v1.0.0",
            latest_version="v1.2.0",
            repository="example/emma-cookbook",
            update_available=True,
        )

        status = dismiss_update("v1.1.0")

        self.assertEqual(status.dismissed_version, "v1.1.0")
        self.assertTrue(status.update_available)

    def test_build_tags_api_url_targets_repository_tags_endpoint(self):
        self.assertEqual(
            _build_tags_api_url("example/emma-cookbook"),
            "https://api.github.com/repos/example/emma-cookbook/tags",
        )


class UpdateStatusSerializationTests(TestCase):
    @override_settings(APP_VERSION="v1.0.0", APP_UPDATE_CHECK_ENABLED=True, APP_UPDATE_REPOSITORY="example/emma-cookbook")
    def test_serialize_update_status_falls_back_to_settings_when_model_fields_are_blank(self):
        AppUpdateStatus.objects.create(
            current_version="",
            latest_version="",
            repository="",
            release_url="",
            update_available=False,
            dismissed_version="",
        )

        payload = _serialize_update_status()

        self.assertEqual(payload["currentVersion"], "v1.0.0")
        self.assertEqual(payload["repository"], "example/emma-cookbook")
        self.assertTrue(payload["updateChecksEnabled"])

    @override_settings(APP_VERSION="v1.0.0", APP_UPDATE_CHECK_ENABLED=True, APP_UPDATE_REPOSITORY="example/emma-cookbook")
    def test_serialize_update_status_hides_dismissed_release_notice(self):
        AppUpdateStatus.objects.create(
            current_version="v1.0.0",
            latest_version="v1.2.0",
            repository="example/emma-cookbook",
            release_url="https://github.com/example/emma-cookbook/releases",
            update_available=True,
            dismissed_version="v1.2.0",
        )

        payload = _serialize_update_status()

        self.assertFalse(payload["updateAvailable"])
        self.assertEqual(payload["dismissedVersion"], "v1.2.0")


class UpdateCheckTaskTests(TestCase):
    @patch("users.tasks.check_for_updates")
    def test_check_for_app_updates_returns_summary_payload(self, mock_check_for_updates):
        mock_check_for_updates.return_value = AppUpdateStatus(
            latest_version="v1.2.0",
            update_available=True,
            last_error="",
        )

        payload = check_for_app_updates()

        self.assertEqual(
            payload,
            {
                "latest_version": "v1.2.0",
                "update_available": True,
                "last_error": "",
            },
        )
