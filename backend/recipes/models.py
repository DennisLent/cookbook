"""Core recipe-domain models used throughout the API and background jobs."""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify
from users.models import User


class Tag(models.Model):
    name = models.CharField(max_length=30, unique=True)

    def __str__(self):
        return self.name


class Ingredient(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True, blank=True)
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="variants",
    )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class IngredientAlias(models.Model):
    ingredient = models.ForeignKey(Ingredient, on_delete=models.CASCADE, related_name="aliases")
    alias_name = models.CharField(max_length=100, unique=True)
    normalized_alias = models.CharField(max_length=120, unique=True)

    def save(self, *args, **kwargs):
        if not self.normalized_alias:
            self.normalized_alias = slugify(self.alias_name)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.alias_name} -> {self.ingredient.name}"


class Recipe(models.Model):
    # Title of recipe
    title = models.CharField(max_length=255)
    # Description of recipe
    description = models.TextField(blank=True)
    # Ingredients
    ingredients = models.ManyToManyField(Ingredient, through="RecipeIngredient")
    # Instructions
    instructions = models.TextField(blank=True)
    # Created by and created at
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recipes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Incremented on every API update so stale clients can be rejected instead
    # of silently replacing another device's nested recipe edits.
    version = models.PositiveBigIntegerField(default=1)
    # Tags for recipes
    tags = models.ManyToManyField(Tag, related_name='recipes', blank=True)
    # Servings
    servings = models.PositiveIntegerField(blank=True, null=True)
    prep_minutes = models.PositiveIntegerField(blank=True, null=True)
    cook_minutes = models.PositiveIntegerField(blank=True, null=True)
    # Cooking times
    prep_time = models.DurationField(blank=True, null=True)
    cook_time = models.DurationField(blank=True, null=True)
    total_time = models.DurationField(blank=True, null=True)
    # Optional image
    image = models.ImageField(upload_to='recipe_images/', blank=True, null=True)
    image_url = models.TextField(blank=True)
    is_side = models.BooleanField(default=False)
    is_sauce = models.BooleanField(default=False)
    suggested_sides = models.ManyToManyField(
        "self",
        symmetrical=False,
        related_name="recommended_with_as_side",
        blank=True,
    )
    suggested_sauces = models.ManyToManyField(
        "self",
        symmetrical=False,
        related_name="recommended_with_as_sauce",
        blank=True,
    )

    # Optional metadata
    origin = models.CharField(max_length=255, blank=True)
    source_name = models.CharField(max_length=255, blank=True)
    source_url = models.URLField(blank=True)
    author_name = models.CharField(max_length=255, blank=True)
    cuisine = models.CharField(max_length=100, blank=True)
    course = models.CharField(max_length=100, blank=True)

    DIFFICULTY_CHOICES = (
        ("easy", "easy"),
        ("medium", "medium"),
        ("hard", "hard"),
    )
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES, blank=True)

    calories = models.PositiveIntegerField(blank=True, null=True)
    nutrition = models.JSONField(default=dict, blank=True)
    equipment = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    video_url = models.URLField(blank=True)

    def __str__(self):
        return self.title


class ExtractionSettings(models.Model):
    ollama_model = models.CharField(max_length=255)
    vosk_model_path = models.CharField(max_length=1024)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Extraction settings"

    def __str__(self):
        return "Extraction settings"

    @classmethod
    def get_solo(cls):
        return cls.objects.order_by("pk").first()


def get_effective_ollama_model() -> str:
    current = ExtractionSettings.get_solo()
    if current and current.ollama_model.strip():
        return current.ollama_model.strip()
    return settings.OLLAMA_DEFAULT_MODEL


def get_effective_vosk_model_path() -> str:
    current = ExtractionSettings.get_solo()
    if current and current.vosk_model_path.strip():
        return current.vosk_model_path.strip()
    return getattr(settings, "VOSK_MODEL_PATH", "") or ""


class RecipeImportJob(models.Model):
    STATUS_QUEUED = "queued"
    STATUS_RUNNING = "running"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = (
        (STATUS_QUEUED, "Queued"),
        (STATUS_RUNNING, "Running"),
        (STATUS_DONE, "Done"),
        (STATUS_FAILED, "Failed"),
    )

    PLATFORM_INSTAGRAM = "instagram"
    PLATFORM_TIKTOK = "tiktok"
    PLATFORM_YOUTUBE = "youtube"
    PLATFORM_WEBSITE = "website"
    PLATFORM_CHOICES = (
        (PLATFORM_INSTAGRAM, "Instagram"),
        (PLATFORM_TIKTOK, "TikTok"),
        (PLATFORM_YOUTUBE, "YouTube"),
        (PLATFORM_WEBSITE, "Website"),
    )

    STAGE_QUEUED = "queued"
    STAGE_DOWNLOADING = "downloading"
    STAGE_PARSING = "parsing"
    STAGE_VERIFYING = "verifying"
    STAGE_DONE = "done"
    STAGE_FAILED = "failed"
    STAGE_CHOICES = (
        (STAGE_QUEUED, "Queued"),
        (STAGE_DOWNLOADING, "Downloading"),
        (STAGE_PARSING, "Parsing"),
        (STAGE_VERIFYING, "Verifying"),
        (STAGE_DONE, "Done"),
        (STAGE_FAILED, "Failed"),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="recipe_import_jobs")
    # Client-generated retry key; NULL keeps legacy/non-idempotent submissions
    # independent while the unique pair deduplicates explicit retries.
    idempotency_key = models.CharField(max_length=128, null=True, blank=True)
    source_url = models.URLField()
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_QUEUED)
    progress_stage = models.CharField(max_length=16, choices=STAGE_CHOICES, default=STAGE_QUEUED)
    media_file = models.FileField(upload_to="recipe_imports/media/", blank=True)
    audio_file = models.FileField(upload_to="recipe_imports/audio/", blank=True)
    transcript = models.TextField(blank=True)
    extracted_recipe = models.JSONField(default=dict, blank=True)
    download_only = models.BooleanField(default=False)
    persist_media = models.BooleanField(default=False)
    celery_task_id = models.CharField(max_length=255, blank=True)
    file_size_bytes = models.PositiveBigIntegerField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error_code = models.CharField(max_length=64, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("user", "idempotency_key"),
                name="unique_user_recipe_import_idempotency_key",
            ),
        ]

    def __str__(self):
        return f"{self.platform} import #{self.pk} ({self.status})"

class RecipeIngredient(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="recipe_ingredients")
    ingredient = models.ForeignKey(Ingredient, on_delete=models.CASCADE, related_name="recipe_ingredients")
    position = models.PositiveIntegerField(default=0)
    quantity_text = models.CharField(max_length=50, blank=True)
    unit_text = models.CharField(max_length=50, blank=True)
    display_name = models.CharField(max_length=150, blank=True)
    note = models.CharField(max_length=255, blank=True)
    amount = models.CharField(max_length=150, blank=True)

    class Meta:
        ordering = ("position", "id")

    def __str__(self):
        label = self.display_name or self.ingredient.name
        return f"{self.amount or self.quantity_text} {label}".strip()

    def save(self, *args, **kwargs):
        if not self.display_name:
            self.display_name = self.ingredient.name
        if not self.amount:
            parts = [self.quantity_text, self.unit_text, self.display_name]
            self.amount = " ".join([part for part in parts if part]).strip()
        super().save(*args, **kwargs)


class RecipeStep(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="steps")
    position = models.PositiveIntegerField(default=0)
    instruction_text = models.TextField()
    timer_seconds = models.PositiveIntegerField(blank=True, null=True)
    image_url = models.TextField(blank=True)
    ingredients = models.ManyToManyField(RecipeIngredient, related_name="steps", blank=True)

    class Meta:
        ordering = ("position", "id")

    def __str__(self):
        return f"Step {self.position} for {self.recipe.title}"

# One rating per user per recipe
class Rating(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='ratings')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    stars = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(default=timezone.now, editable=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('recipe', 'user')

    def __str__(self):
        return f"{self.stars}⭐ by {self.user.username} for {self.recipe.title}"


class Favorite(models.Model):
    """Normalized favorite membership safe for concurrent add/remove calls."""

    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="favorites")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="favorites")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "recipe")


class Comment(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='comments')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Comment by {self.user.username} on {self.recipe.title}"


class Collection(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="collections")
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class CollectionRecipe(models.Model):
    collection = models.ForeignKey(Collection, on_delete=models.CASCADE, related_name="collection_recipes")
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name="collection_recipes")

    class Meta:
        unique_together = ("collection", "recipe")

    def __str__(self):
        return f"{self.collection.name}: {self.recipe.title}"
