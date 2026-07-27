from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("recipes", "0018_recipeimportjob_idempotency_key"),
    ]

    operations = [
        migrations.AlterField(
            model_name="recipeimportjob",
            name="platform",
            field=models.CharField(
                choices=[
                    ("instagram", "Instagram"),
                    ("tiktok", "TikTok"),
                    ("youtube", "YouTube"),
                    ("website", "Website"),
                ],
                max_length=20,
            ),
        ),
    ]
