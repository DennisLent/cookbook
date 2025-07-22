# recipes/management/commands/seed_internal_data.py
from django.core.management.base import BaseCommand
from django.db import transaction, connection
from django.contrib.auth import get_user_model
from recipe_scrapers import scrape_me
from ingredient_parser import parse_ingredient
from recipes.models import Recipe, Ingredient, RecipeIngredient, Tag

RECIPE_URLS = [
    "https://www.bbcgoodfood.com/recipes/cottage-pie",
    "https://www.bbcgoodfood.com/recipes/creamy-mushroom-pasta",
    "https://www.recipetineats.com/one-pot-greek-chicken-lemon-rice/",
    "https://www.bbcgoodfood.com/recipes/creamy-salmon-leek-potato-traybake",
    "https://www.twopeasandtheirpod.com/lentil-salad/",
    "https://www.bbcgoodfood.com/recipes/honey-chicken",
    "https://www.loveandlemons.com/chickpea-salad/",
    "https://www.delish.com/cooking/recipe-ideas/a51338/homemade-chicken-noodle-soup-recipe/",
    "https://www.bbcgoodfood.com/recipes/french-onion-soup",
    "https://www.bbcgoodfood.com/recipes/german-spaetzle",
    "https://www.recipetineats.com/schnitzel/",
    "https://www.bbcgoodfood.com/user/9109/recipe/red-lentil-dahl",
    "https://www.bbcgoodfood.com/recipes/aubergine-milanese",
    "https://www.bbcgoodfood.com/recipes/mushroom-risotto"
]

RECIPE_TAGS = [
    ["Beef"],
    ["Pasta", "Vegetarian"],
    ["Chicken"],
    ["Fish"],
    ["Vegetarian", "Salad"],
    ["Chicken", "Rice"],
    ["Vegetarian", "Salad"],
    ["Chicken", "Soup"],
    ["Beef", "Soup"],
    ["Vegetarian"],
    ["Beef", "Pork", "Chicken"],
    ["Vegetarian"],
    ["Vegetarian"],
    ["Vegetarian"]
]

SEED_TAGS = [
    "Chicken",
    "Vegetarian",
    "Vegan",
    "Beef",
    "Fish",
    "Pasta",
    "Rice",
    "Salad",
    "Lamb",
    "Dinner",
    "Breakfast",
    "Lunch",
    "Sides",
    "Soup",
    "Pork"
]

class Command(BaseCommand):
    help = "Seeds the database with a default user and some example recipes"

    def handle(self, *args, **options):

        # remove all previous recipes
        with transaction.atomic():
            with connection.cursor() as c:
                c.execute("""
                    TRUNCATE
                    recipes_recipeingredient,
                    recipes_rating,
                    recipes_comment,
                    recipes_recipe,
                    recipes_ingredient,
                    recipes_tag
                    RESTART IDENTITY CASCADE;
                """)
        User = get_user_model()

        # 1. Create or get superuser 'dennis'
        dennis, created = User.objects.get_or_create(
            username="admin",
            defaults={
                "first_name": "Admin",
                "last_name": "Admin",
                "bio": "Default admin :P",
                "is_superuser": True,
                "is_staff": True
            }
        )
        if created:
            dennis.set_password("admin123")
            dennis.save()
            self.stdout.write(self.style.SUCCESS(
                "Created superuser 'dennis' (password 'admin123')"
            ))
        else:
            self.stdout.write("Superuser 'dennis' already exists")

        tag_objs = {}
        for tag_name in SEED_TAGS:
            tag_obj, _ = Tag.objects.get_or_create(name__iexact=tag_name, defaults={"name": tag_name})
            tag_objs[tag_name] = tag_obj
        self.stdout.write(self.style.SUCCESS(f"Seeded tags: {', '.join(SEED_TAGS)}"))

        for url in RECIPE_URLS:
            try:
                scraper = scrape_me(url)
                title = scraper.title().strip()

                # Skip if we've already got that title
                if Recipe.objects.filter(title__iexact=title).exists():
                    self.stdout.write(f"Skipping existing recipe: {title}")
                    continue

                description = (scraper.description() or "").strip()
                instructions = scraper.instructions().strip()
                raw_ingredients = scraper.ingredients()

                # Create recipe shell
                recipe = Recipe.objects.create(
                    title=title,
                    description=description,
                    instructions=instructions,
                    created_by=dennis,
                )

                # Parse and create ingredients
                for raw in raw_ingredients:
                    parsed = parse_ingredient(raw)

                    # extract name
                    if parsed.name:
                        name = parsed.name[0].text.strip()
                    else:
                        # fallback to full raw if parsing fails
                        name = raw.strip()

                    # extract amount and unit
                    if parsed.amount:
                        amount_str = parsed.amount[0].text.strip()
                    else:
                        amount_str = raw.strip()

                    ingredient_obj, _ = Ingredient.objects.get_or_create(
                        name__iexact=name,
                        defaults={'name': name}
                    )
                    RecipeIngredient.objects.create(
                        recipe=recipe,
                        ingredient=ingredient_obj,
                        amount=amount_str
                    )
                
                selected_tags = RECIPE_TAGS[RECIPE_URLS.index(url)]
                for tag_name in selected_tags:
                    recipe.tags.add(tag_objs[tag_name])
                
                recipe.save()

                self.stdout.write(self.style.SUCCESS(f"Added recipe: {title}"))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Failed to add {url}: {e}"))