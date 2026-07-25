"""User-account and deployment-status models for the application."""

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    display_name = models.CharField(max_length=255, blank=True)
    bio = models.TextField(blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)

    # Don't use email because no smtp is envisioned
    email = models.EmailField(blank=True)
    preferences = models.JSONField(default=dict, blank=True)
    preferences_version = models.PositiveBigIntegerField(default=1)
    # Legacy import field retained for backup compatibility. Runtime favorite
    # membership is normalized in recipes.Favorite for concurrency safety.
    favorite_recipe_ids = models.JSONField(default=list, blank=True)

    # Role flag for clarity
    ROLE_CHOICES = (
        ("admin", "admin"),
        ("user", "user"),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="user")

    # Per-user UI customization
    theme = models.JSONField(default=dict, blank=True)
    layout = models.JSONField(default=dict, blank=True)
    widget_whitelist = models.JSONField(default=list, blank=True)

    def save(self, *args, **kwargs):
        if not self.display_name:
            full_name = self.get_full_name().strip()
            self.display_name = full_name or self.username
        super().save(*args, **kwargs)

    def __str__(self):
        return self.username


class AppUpdateStatus(models.Model):
    current_version = models.CharField(max_length=64, blank=True)
    latest_version = models.CharField(max_length=64, blank=True)
    repository = models.CharField(max_length=255, blank=True)
    release_url = models.URLField(blank=True)
    update_available = models.BooleanField(default=False)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    dismissed_version = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "App update status"
        verbose_name_plural = "App update status"

    @classmethod
    def get_solo(cls):
        return cls.objects.order_by("pk").first()

    def __str__(self):
        return "App update status"


class InstanceConfiguration(models.Model):
    """Persistent security-mode history for this database.

    ``ever_multi_user`` is irreversible by application code. This prevents an
    operator from turning a database containing multiple identities into one
    shared, unauthenticated identity by changing only an environment variable.
    """

    MODE_SINGLE_USER = "single_user"
    MODE_MULTI_USER = "multi_user"
    MODE_CHOICES = (
        (MODE_SINGLE_USER, "single_user"),
        (MODE_MULTI_USER, "multi_user"),
    )

    mode = models.CharField(max_length=20, choices=MODE_CHOICES)
    ever_multi_user = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get_solo(cls):
        return cls.objects.order_by("pk").first()

    def save(self, *args, **kwargs):
        if self.pk:
            previous = type(self).objects.filter(pk=self.pk).values("ever_multi_user").first()
            if previous and previous["ever_multi_user"] and not self.ever_multi_user:
                raise ValueError("ever_multi_user cannot be reset.")
        if self.mode == self.MODE_MULTI_USER:
            self.ever_multi_user = True
        super().save(*args, **kwargs)
