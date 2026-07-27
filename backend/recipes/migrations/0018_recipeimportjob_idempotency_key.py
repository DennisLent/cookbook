from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("recipes", "0017_recipe_version"),
        ("users", "0008_user_preferences_version"),
    ]

    operations = [
        migrations.AddField(
            model_name="recipeimportjob",
            name="idempotency_key",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddConstraint(
            model_name="recipeimportjob",
            constraint=models.UniqueConstraint(
                fields=("user", "idempotency_key"),
                name="unique_user_recipe_import_idempotency_key",
            ),
        ),
    ]
