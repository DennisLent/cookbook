from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("users", "0007_instanceconfiguration"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="preferences_version",
            field=models.PositiveBigIntegerField(default=1),
        ),
    ]
