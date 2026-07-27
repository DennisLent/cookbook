from django.core.management.base import BaseCommand

from users.instance_mode import get_instance_configuration


class Command(BaseCommand):
    help = "Initialize and validate the database-backed application mode."

    def add_arguments(self, parser):
        intent = parser.add_mutually_exclusive_group()
        intent.add_argument(
            "--fresh-installation",
            action="store_true",
            help="Initialize a newly created database using APP_MODE.",
        )
        intent.add_argument(
            "--existing-installation",
            action="store_true",
            help="Mark a database whose pre-feature migrations were already applied as multi-user.",
        )
        intent.add_argument(
            "--validate-only",
            action="store_true",
            help="Validate existing mode metadata without initializing it.",
        )

    def handle(self, *args, **options):
        intent = None
        if options["fresh_installation"]:
            intent = "fresh"
        elif options["existing_installation"]:
            intent = "existing"
        elif options["validate_only"]:
            intent = "validate"
        configuration = get_instance_configuration(
            initialization_intent=intent
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Instance mode validated: {configuration.mode}"
            )
        )
