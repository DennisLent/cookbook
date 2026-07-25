from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0006_appupdatestatus"),
    ]

    operations = [
        migrations.CreateModel(
            name="InstanceConfiguration",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "mode",
                    models.CharField(
                        choices=[("single_user", "single_user"), ("multi_user", "multi_user")],
                        max_length=20,
                    ),
                ),
                ("ever_multi_user", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
