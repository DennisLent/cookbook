# Generated by Django 5.2.1 on 2025-05-31 15:11

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('recipes', '0003_ingredient_rename_author_comment_user_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='recipeingredient',
            name='amount',
            field=models.CharField(max_length=150),
        ),
    ]
