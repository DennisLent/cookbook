from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from recipes.models import Collection, Comment, Favorite, Rating, Recipe, RecipeImportJob
from users.instance_mode import SINGLE_USER_USERNAME
from users.models import InstanceConfiguration, User


class Command(BaseCommand):
    help = "Irreversibly promote a single-user database to multi-user ownership."

    def add_arguments(self, parser):
        parser.add_argument("username", help="Existing destination account")
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Confirm the irreversible promotion after taking a backup and stopping application writes.",
        )

    def handle(self, *args, **options):
        configuration = InstanceConfiguration.get_solo()
        if configuration is None or configuration.mode != InstanceConfiguration.MODE_SINGLE_USER:
            raise CommandError("The database is not initialized in single-user mode.")
        if configuration.ever_multi_user:
            raise CommandError("Invalid mode history: this database has already been multi-user.")

        try:
            owner = User.objects.get(username=SINGLE_USER_USERNAME)
        except User.DoesNotExist as exc:
            raise CommandError("The managed single-user owner does not exist.") from exc
        try:
            destination = User.objects.get(username=options["username"])
        except User.DoesNotExist as exc:
            raise CommandError("Create the destination account before promotion.") from exc
        if destination.pk == owner.pk:
            raise CommandError("The destination must be a real multi-user account.")

        counts = {
            "recipes": Recipe.objects.filter(created_by=owner).count(),
            "import_jobs": RecipeImportJob.objects.filter(user=owner).count(),
            "collections": Collection.objects.filter(owner=owner).count(),
            "comments": Comment.objects.filter(user=owner).count(),
            "ratings": Rating.objects.filter(user=owner).count(),
            "favorites": Favorite.objects.filter(user=owner).count(),
        }
        self.stdout.write("Promotion preview: " + ", ".join(f"{key}={value}" for key, value in counts.items()))
        if options["dry_run"]:
            return
        if not options["confirm"]:
            raise CommandError("Re-run with --confirm after stopping writes and creating a database backup.")

        with transaction.atomic():
            configuration = InstanceConfiguration.objects.select_for_update().get(pk=configuration.pk)
            if configuration.mode != InstanceConfiguration.MODE_SINGLE_USER or configuration.ever_multi_user:
                raise CommandError("Instance mode changed before promotion could begin.")

            Recipe.objects.filter(created_by=owner).update(created_by=destination)
            RecipeImportJob.objects.filter(user=owner).update(user=destination)
            Collection.objects.filter(owner=owner).update(owner=destination)
            Comment.objects.filter(user=owner).update(user=destination)

            # Merge constrained personal state without violating one-row
            # invariants if the destination was pre-provisioned with data.
            for favorite in Favorite.objects.filter(user=owner).iterator():
                Favorite.objects.get_or_create(user=destination, recipe_id=favorite.recipe_id)
            Favorite.objects.filter(user=owner).delete()

            for rating in Rating.objects.filter(user=owner).iterator():
                Rating.objects.update_or_create(
                    user=destination,
                    recipe_id=rating.recipe_id,
                    defaults={"stars": rating.stars},
                )
            Rating.objects.filter(user=owner).delete()

            destination.preferences = owner.preferences
            destination.theme = owner.theme
            destination.layout = owner.layout
            destination.widget_whitelist = owner.widget_whitelist
            destination.save(
                update_fields=["preferences", "theme", "layout", "widget_whitelist"]
            )

            owner.is_active = False
            owner.set_unusable_password()
            owner.save(update_fields=["is_active", "password"])
            configuration.mode = InstanceConfiguration.MODE_MULTI_USER
            configuration.ever_multi_user = True
            configuration.save(update_fields=["mode", "ever_multi_user", "updated_at"])

        self.stdout.write(self.style.SUCCESS("Promotion complete. Set APP_MODE=multi_user and restart the full stack."))
