"""Persistent application-mode resolution and shared-owner provisioning."""

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, transaction

from .models import InstanceConfiguration, User


SINGLE_USER_USERNAME = "__single_user__"


def get_instance_configuration(
    *,
    initialization_intent=None,
    force_existing_installation=False,
) -> InstanceConfiguration:
    """Return mode metadata, initializing a new database exactly once.

    Existing databases with user data are conservatively classified as
    multi-user. This makes adding APP_MODE=single_user to an upgraded account
    database fail closed instead of collapsing its ownership boundary.
    """

    if force_existing_installation:
        initialization_intent = "existing"
    if initialization_intent not in {None, "fresh", "existing", "validate"}:
        raise ValueError("Unknown instance-mode initialization intent.")

    requested_mode = settings.APP_MODE
    try:
        with transaction.atomic():
            configuration = InstanceConfiguration.objects.select_for_update().filter(pk=1).first()
            if configuration is None:
                has_existing_users = User.objects.exclude(username=SINGLE_USER_USERNAME).exists()
                if initialization_intent == "validate":
                    raise ImproperlyConfigured(
                        "Instance mode has not been initialized. Run initialize_instance_mode "
                        "with --fresh-installation or --existing-installation."
                    )
                if initialization_intent == "fresh" and has_existing_users:
                    raise ImproperlyConfigured(
                        "A fresh installation cannot be initialized because user accounts already exist."
                    )
                initial_mode = (
                    InstanceConfiguration.MODE_MULTI_USER
                    if initialization_intent == "existing" or has_existing_users
                    else requested_mode
                )
                # A fixed primary key turns singleton initialization into a
                # database-enforced race rather than an application convention.
                configuration = InstanceConfiguration.objects.create(
                    pk=1,
                    mode=initial_mode,
                    ever_multi_user=initial_mode == InstanceConfiguration.MODE_MULTI_USER,
                )
    except IntegrityError:
        configuration = InstanceConfiguration.objects.get(pk=1)

    # Validate after the initialization transaction commits. In particular, an
    # upgraded database must retain its irreversible multi-user marker even
    # when startup then fails because APP_MODE was set to single_user.
    if requested_mode == InstanceConfiguration.MODE_SINGLE_USER and configuration.ever_multi_user:
        raise ImproperlyConfigured(
            "This database has operated in multi-user mode and cannot be started in single-user mode."
        )
    if requested_mode != configuration.mode:
        raise ImproperlyConfigured(
            f"APP_MODE={requested_mode} does not match the database mode {configuration.mode}. "
            "Use the single-user promotion command for a supported mode change."
        )
    return configuration


def get_single_user_owner() -> User:
    """Resolve the one shared owner, safely under concurrent first requests."""

    configuration = get_instance_configuration()
    if configuration.mode != InstanceConfiguration.MODE_SINGLE_USER:
        raise ImproperlyConfigured("The shared owner is only available in single-user mode.")

    try:
        with transaction.atomic():
            owner, created = User.objects.get_or_create(
                username=SINGLE_USER_USERNAME,
                defaults={
                    "display_name": "Cookbook Owner",
                    "is_active": True,
                    "role": "admin",
                },
            )
            if created or owner.has_usable_password():
                owner.set_unusable_password()
                owner.save(update_fields=["password"])
            return owner
    except IntegrityError:
        # A concurrent transaction may have created the unique username.
        return User.objects.get(username=SINGLE_USER_USERNAME)
