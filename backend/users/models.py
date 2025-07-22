from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    bio = models.TextField(blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)

    # Don't use email because no smtp is envisioned
    email = models.EmailField(blank=True)
    preferences = models.JSONField(default=dict, blank=True)


    def __str__(self):
        return self.username
