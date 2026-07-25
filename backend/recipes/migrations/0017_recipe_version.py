from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("recipes", "0016_favorite"),
    ]

    operations = [
        migrations.AddField(
            model_name="recipe",
            name="version",
            field=models.PositiveBigIntegerField(default=1),
        ),
    ]
