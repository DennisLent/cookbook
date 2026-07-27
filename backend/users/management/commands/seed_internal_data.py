import os

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from recipes.models import Recipe
from users.instance_mode import get_single_user_owner
from users.management.seed_helpers import populate_database_for_user


class Command(BaseCommand):
    help = "Seeds recipe data for the shared owner or a multi-user administrator."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            default=os.getenv("DJANGO_SUPERUSER_USERNAME", "admin"),
            help="Username for the superuser that will own the seeded data.",
        )
        parser.add_argument(
            "--password",
            default=os.getenv("DJANGO_SUPERUSER_PASSWORD", "admin123"),
            help="Password for the superuser.",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Clear existing recipe-related data before seeding.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Seed even when recipe data already exists.",
        )

    def handle(self, *args, **options):
        username = options["username"]
        password = options["password"]
        reset = options["reset"]
        force = options["force"]

        if settings.APP_MODE == "single_user":
            user = get_single_user_owner()
            username = user.username
            self.stdout.write(self.style.SUCCESS("Using the single-user shared owner"))
        else:
            user_model = get_user_model()
            user, created = user_model.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": username.capitalize(),
                    "last_name": "Admin",
                    "bio": "Default admin account",
                    "display_name": username.capitalize(),
                },
            )

            user.is_superuser = True
            user.is_staff = True
            user.role = "admin"
            user.set_password(password)
            user.save()

            if created:
                self.stdout.write(self.style.SUCCESS(f"Created superuser '{username}'"))
            else:
                self.stdout.write(self.style.SUCCESS(f"Updated superuser '{username}'"))

        if Recipe.objects.exists() and not reset and not force:
            self.stdout.write("Skipping recipe seed because recipe data already exists. Use --force to seed anyway.")
            return

        created_recipes = populate_database_for_user(username=username, stdout=self.stdout, reset=reset)
        self.stdout.write(self.style.SUCCESS(f"Seeded {len(created_recipes)} recipes for '{username}'"))
