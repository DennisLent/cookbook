from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def migrate_json_favorites(apps, schema_editor):
    User = apps.get_model("users", "User")
    Favorite = apps.get_model("recipes", "Favorite")
    Recipe = apps.get_model("recipes", "Recipe")
    valid_recipe_ids = set(Recipe.objects.values_list("pk", flat=True))
    favorites = []
    for user in User.objects.only("pk", "favorite_recipe_ids").iterator():
        for recipe_id in set(user.favorite_recipe_ids or []):
            if recipe_id in valid_recipe_ids:
                favorites.append(Favorite(user_id=user.pk, recipe_id=recipe_id))
    Favorite.objects.bulk_create(favorites, ignore_conflicts=True)


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0007_instanceconfiguration"),
        ("recipes", "0015_extractionsettings"),
    ]

    operations = [
        migrations.CreateModel(
            name="Favorite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "recipe",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="favorites",
                        to="recipes.recipe",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="favorites",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"unique_together": {("user", "recipe")}},
        ),
        migrations.RunPython(migrate_json_favorites, migrations.RunPython.noop),
    ]
