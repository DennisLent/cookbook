from django.db import models
from users.models import User

class Tag(models.Model):
    name = models.CharField(max_length=30, unique=True)

    def __str__(self):
        return self.name

class Ingredient(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name

class Recipe(models.Model):
    # Title of recipe (required)
    title = models.CharField(max_length=255)
    # Description of recipe (optional)
    description = models.TextField(blank=True)
    # Ingredients (required)
    ingredients = models.ManyToManyField(Ingredient, through="RecipeIngredient")
    # Instructions (required)
    instructions = models.TextField()
    # Created by and created at (auto)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recipes')
    created_at = models.DateTimeField(auto_now_add=True)
    # Tags for recipes (optional)
    tags = models.ManyToManyField(Tag, related_name='recipes', blank=True)
    # Servings (optional)
    servings = models.PositiveIntegerField(blank=True, null=True)
    # Cooking times (prep, cook, total)
    prep_time = models.DurationField(blank=True, null=True)
    cook_time = models.DurationField(blank=True, null=True)
    total_time = models.DurationField(blank=True, null=True)
    # Optional
    image = models.ImageField(upload_to='recipe_images/', blank=True, null=True)

    def __str__(self):
        return self.title

class RecipeIngredient(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE)
    ingredient = models.ForeignKey(Ingredient, on_delete=models.CASCADE)
    amount = models.CharField(max_length=150)

    def __str__(self):
        return f"{self.amount} {self.ingredient}"

# One rating per user per recipe
class Rating(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='ratings')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    stars = models.PositiveSmallIntegerField()

    class Meta:
        unique_together = ('recipe', 'user')

    def __str__(self):
        return f"{self.stars}⭐ by {self.user.username} for {self.recipe.title}"

class Comment(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='comments')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Comment by {self.user.username} on {self.recipe.title}"
