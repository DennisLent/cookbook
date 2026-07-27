from django.core.management.base import BaseCommand

from users.instance_mode import get_instance_configuration


class Command(BaseCommand):
    help = "Initialize and validate the database-backed application mode."

    def add_arguments(self, parser):
        parser.add_argument(
            "--existing-installation",
            action="store_true",
            help="Mark a database whose pre-feature migrations were already applied as multi-user.",
        )

    def handle(self, *args, **options):
        configuration = get_instance_configuration(
            force_existing_installation=options["existing_installation"]
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Instance mode validated: {configuration.mode}"
            )
        )
