"""Serializers that translate recipe-domain models to the public API shape."""

from django.db.models import Avg
from django.utils.text import slugify
from rest_framework import serializers

from .models import (
    Collection,
    CollectionRecipe,
    Comment,
    Favorite,
    Ingredient,
    IngredientAlias,
    Rating,
    Recipe,
    RecipeImportJob,
    RecipeIngredient,
    RecipeStep,
    Tag,
)


def resolve_ingredient(name: str) -> Ingredient:
    normalized = slugify(name or "")
    alias = IngredientAlias.objects.filter(normalized_alias=normalized).select_related("ingredient").first()
    if alias:
        return alias.ingredient

    ingredient = Ingredient.objects.filter(name__iexact=name).first()
    if ingredient:
        return ingredient

    ingredient = Ingredient.objects.create(name=name)
    IngredientAlias.objects.get_or_create(
        ingredient=ingredient,
        alias_name=name,
        defaults={"normalized_alias": normalized or slugify(ingredient.name)},
    )
    return ingredient


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name"]


class IngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ingredient
        fields = ["id", "name", "slug", "parent"]


class RecipeIngredientSerializer(serializers.ModelSerializer):
    qty = serializers.CharField(source="quantity_text", allow_blank=True, required=False)
    unit = serializers.CharField(source="unit_text", allow_blank=True, required=False)
    item = serializers.CharField(source="display_name")

    class Meta:
        model = RecipeIngredient
        fields = ["id", "qty", "unit", "item", "note"]


class RecipeStepSerializer(serializers.ModelSerializer):
    order = serializers.IntegerField(source="position")
    text = serializers.CharField(source="instruction_text")
    timerSec = serializers.IntegerField(source="timer_seconds", allow_null=True, required=False)
    imageUrl = serializers.CharField(source="image_url", allow_blank=True, required=False)
    ingredientIndices = serializers.ListField(
        child=serializers.IntegerField(min_value=0),
        required=False,
        allow_empty=True,
        write_only=True,
    )

    class Meta:
        model = RecipeStep
        fields = ["id", "order", "text", "timerSec", "imageUrl", "ingredientIndices"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        ingredient_positions = list(instance.ingredients.order_by("position").values_list("position", flat=True))
        data["ingredientIndices"] = [max(position - 1, 0) for position in ingredient_positions]
        return data


class RatingSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source="user.username")
    recipeId = serializers.ReadOnlyField(source="recipe_id")
    userId = serializers.ReadOnlyField(source="user_id")
    value = serializers.IntegerField(source="stars")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Rating
        fields = ["id", "recipe", "recipeId", "user", "userId", "stars", "value", "createdAt"]

    def validate_stars(self, value):
        if not (1 <= value <= 5):
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value


class CommentSerializer(serializers.ModelSerializer):
    author = serializers.ReadOnlyField(source="user.username")
    recipeId = serializers.ReadOnlyField(source="recipe_id")
    userId = serializers.ReadOnlyField(source="user_id")
    userName = serializers.ReadOnlyField(source="user.display_name")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Comment
        fields = [
            "id",
            "recipe",
            "recipeId",
            "author",
            "userId",
            "userName",
            "text",
            "created_at",
            "createdAt",
        ]


class RecipeSerializer(serializers.ModelSerializer):
    created_by = serializers.ReadOnlyField(source="created_by.username")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    origin = serializers.CharField(required=False, allow_blank=True)
    prepMin = serializers.IntegerField(source="prep_minutes", required=False, allow_null=True)
    cookMin = serializers.IntegerField(source="cook_minutes", required=False, allow_null=True)
    imageUrl = serializers.CharField(source="image_url", required=False, allow_blank=True)
    sourceUrl = serializers.CharField(source="source_url", required=False, allow_blank=True)
    videoUrl = serializers.CharField(source="video_url", required=False, allow_blank=True)
    isSide = serializers.BooleanField(source="is_side", required=False)
    isSauce = serializers.BooleanField(source="is_sauce", required=False)
    suggestedSideIds = serializers.PrimaryKeyRelatedField(
        many=True,
        source="suggested_sides",
        queryset=Recipe.objects.filter(is_side=True),
        required=False,
    )
    suggestedSauceIds = serializers.PrimaryKeyRelatedField(
        many=True,
        source="suggested_sauces",
        queryset=Recipe.objects.filter(is_sauce=True),
        required=False,
    )

    tags = serializers.SerializerMethodField()
    tags_input = serializers.ListField(child=serializers.CharField(), required=False, write_only=True)
    ingredients = RecipeIngredientSerializer(source="recipe_ingredients", many=True, required=False)
    steps = RecipeStepSerializer(many=True, required=False)

    comments = CommentSerializer(many=True, read_only=True)
    ratings = RatingSerializer(many=True, read_only=True)
    favorites_count = serializers.SerializerMethodField()
    is_favorited = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    my_rating = serializers.SerializerMethodField()

    class Meta:
        model = Recipe
        fields = [
            "id",
            "title",
            "description",
            "created_by",
            "createdAt",
            "updatedAt",
            "version",
            "origin",
            "servings",
            "prepMin",
            "cookMin",
            "imageUrl",
            "sourceUrl",
            "videoUrl",
            "isSide",
            "isSauce",
            "suggestedSideIds",
            "suggestedSauceIds",
            "tags",
            "tags_input",
            "ingredients",
            "steps",
            "comments",
            "ratings",
            "favorites_count",
            "is_favorited",
            "avg_rating",
            "my_rating",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        return data

    def to_internal_value(self, data):
        if hasattr(data, "copy"):
            data = data.copy()
        else:
            data = dict(data)
        if "tags" in data and "tags_input" not in data:
            data["tags_input"] = data.get("tags")
        return super().to_internal_value(data)

    def get_tags(self, obj):
        return list(obj.tags.order_by("name").values_list("name", flat=True))

    def validate(self, attrs):
        ingredients = attrs.get("recipe_ingredients")
        steps = attrs.get("steps")
        suggested_sides = attrs.get("suggested_sides")
        suggested_sauces = attrs.get("suggested_sauces")
        has_video = bool(attrs.get("video_url", getattr(self.instance, "video_url", "")))

        if ingredients is None and "ingredients_data" in self.initial_data:
            ingredients = [
                {
                    "item": entry.get("ingredient") or entry.get("item") or "",
                    "qty": entry.get("amount") or "",
                }
                for entry in self.initial_data.get("ingredients_data", [])
            ]
            attrs["recipe_ingredients"] = ingredients

        if steps is None and "instructions" in self.initial_data:
            raw = self.initial_data.get("instructions")
            if isinstance(raw, list):
                steps = [{"order": idx + 1, "text": text} for idx, text in enumerate(raw)]
            elif isinstance(raw, str) and raw.strip():
                steps = [{"order": idx + 1, "text": text.strip()} for idx, text in enumerate(raw.splitlines()) if text.strip()]
            else:
                steps = []
            attrs["steps"] = steps

        if self.instance is None or ingredients is not None:
            if not attrs.get("recipe_ingredients"):
                raise serializers.ValidationError({"ingredients": "At least one ingredient is required."})
        if self.instance is None or steps is not None:
            if not attrs.get("steps") and not has_video:
                raise serializers.ValidationError({"steps": "At least one step is required."})

        # Side/sauce suggestions are persisted product features, so invalid
        # suggestion assignments should fail clearly instead of being ignored.
        is_side = attrs.get("is_side", getattr(self.instance, "is_side", False))
        is_sauce = attrs.get("is_sauce", getattr(self.instance, "is_sauce", False))
        if is_side or is_sauce:
            if suggested_sides:
                raise serializers.ValidationError(
                    {"suggestedSideIds": "Side or sauce recipes cannot define suggested side recipes."}
                )
            if suggested_sauces:
                raise serializers.ValidationError(
                    {"suggestedSauceIds": "Side or sauce recipes cannot define suggested sauce recipes."}
                )

        if self.instance is not None:
            if suggested_sides and any(recipe.pk == self.instance.pk for recipe in suggested_sides):
                raise serializers.ValidationError(
                    {"suggestedSideIds": "A recipe cannot suggest itself as a side."}
                )
            if suggested_sauces and any(recipe.pk == self.instance.pk for recipe in suggested_sauces):
                raise serializers.ValidationError(
                    {"suggestedSauceIds": "A recipe cannot suggest itself as a sauce."}
                )

        return attrs

    def create(self, validated_data):
        tags = validated_data.pop("tags_input", [])
        ingredients = validated_data.pop("recipe_ingredients", [])
        steps = validated_data.pop("steps", [])
        suggested_sides = validated_data.pop("suggested_sides", [])
        suggested_sauces = validated_data.pop("suggested_sauces", [])
        created_by = validated_data.pop("created_by", None) or self.context["request"].user

        recipe = Recipe.objects.create(created_by=created_by, **validated_data)
        self._replace_tags(recipe, tags)
        self._replace_ingredients(recipe, ingredients)
        self._replace_steps(recipe, steps)
        recipe.suggested_sides.set(suggested_sides)
        recipe.suggested_sauces.set(suggested_sauces)
        return recipe

    def update(self, instance, validated_data):
        tags = validated_data.pop("tags_input", None)
        ingredients = validated_data.pop("recipe_ingredients", None)
        steps = validated_data.pop("steps", None)
        suggested_sides = validated_data.pop("suggested_sides", None)
        suggested_sauces = validated_data.pop("suggested_sauces", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if tags is not None:
            self._replace_tags(instance, tags)
        if ingredients is not None:
            self._replace_ingredients(instance, ingredients)
        if steps is not None:
            self._replace_steps(instance, steps)
        if instance.is_side or instance.is_sauce:
            instance.suggested_sides.clear()
            instance.suggested_sauces.clear()
        elif suggested_sides is not None:
            instance.suggested_sides.set(suggested_sides)
        if not (instance.is_side or instance.is_sauce) and suggested_sauces is not None:
            instance.suggested_sauces.set(suggested_sauces)
        return instance

    def _replace_tags(self, recipe: Recipe, tags):
        recipe.tags.clear()
        for tag_name in tags:
            name = str(tag_name).strip()
            if not name:
                continue
            tag, _ = Tag.objects.get_or_create(name=name)
            recipe.tags.add(tag)

    def _replace_ingredients(self, recipe: Recipe, ingredients):
        recipe.recipe_ingredients.all().delete()
        created = []
        for index, ingredient_data in enumerate(ingredients, start=1):
            display_name = str(ingredient_data.get("display_name") or ingredient_data.get("item") or "").strip()
            if not display_name:
                continue
            ingredient = resolve_ingredient(display_name)
            created.append(
                RecipeIngredient.objects.create(
                    recipe=recipe,
                    ingredient=ingredient,
                    position=index,
                    quantity_text=str(ingredient_data.get("quantity_text") or ingredient_data.get("qty") or "").strip(),
                    unit_text=str(ingredient_data.get("unit_text") or ingredient_data.get("unit") or "").strip(),
                    display_name=display_name,
                    note=str(ingredient_data.get("note") or "").strip(),
                )
            )
        return created

    def _replace_steps(self, recipe: Recipe, steps):
        recipe.steps.all().delete()
        ingredients_by_position = {ing.position: ing for ing in recipe.recipe_ingredients.all()}
        for index, step_data in enumerate(steps, start=1):
            text = str(step_data.get("instruction_text") or step_data.get("text") or "").strip()
            if not text:
                continue
            step = RecipeStep.objects.create(
                recipe=recipe,
                position=step_data.get("position") or step_data.get("order") or index,
                instruction_text=text,
                timer_seconds=step_data.get("timer_seconds") or step_data.get("timerSec"),
                image_url=step_data.get("image_url") or step_data.get("imageUrl") or "",
            )
            for raw_index in step_data.get("ingredientIndices", []):
                ingredient = ingredients_by_position.get(int(raw_index) + 1)
                if ingredient:
                    step.ingredients.add(ingredient)

    def get_favorites_count(self, obj) -> int:
        return Favorite.objects.filter(recipe=obj).count()

    def get_is_favorited(self, obj) -> bool:
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return False
        return Favorite.objects.filter(recipe=obj, user=user).exists()

    def get_avg_rating(self, obj):
        agg = obj.ratings.aggregate(avg=Avg("stars"))
        return agg.get("avg")

    def get_my_rating(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return None
        rating = obj.ratings.filter(user=user).first()
        return rating.stars if rating else None


class CollectionSerializer(serializers.ModelSerializer):
    recipeIds = serializers.PrimaryKeyRelatedField(
        many=True,
        source="recipes",
        queryset=Recipe.objects.all(),
        required=False,
    )

    class Meta:
        model = Collection
        fields = ["id", "name", "recipeIds", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["recipeIds"] = list(instance.collection_recipes.order_by("id").values_list("recipe_id", flat=True))
        return data

    def validate(self, attrs):
        if self.instance is not None and "recipes" in attrs:
            raise serializers.ValidationError(
                {"recipeIds": "Use the atomic collection membership endpoint to add or remove recipes."}
            )
        return attrs

    def create(self, validated_data):
        recipes = validated_data.pop("recipes", [])
        collection = Collection.objects.create(owner=self.context["request"].user, **validated_data)
        for recipe in recipes:
            CollectionRecipe.objects.get_or_create(collection=collection, recipe=recipe)
        return collection

    def update(self, instance, validated_data):
        recipes = validated_data.pop("recipes", None)
        instance.name = validated_data.get("name", instance.name)
        instance.save()
        if recipes is not None:
            instance.collection_recipes.all().delete()
            for recipe in recipes:
                CollectionRecipe.objects.get_or_create(collection=instance, recipe=recipe)
        return instance


class RecipeImportJobCreateSerializer(serializers.Serializer):
    url = serializers.URLField(max_length=1000)
    videoOnly = serializers.BooleanField(required=False, default=False)
    saveVideo = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        if attrs.get("videoOnly"):
            attrs["saveVideo"] = True
        return attrs


class RecipeImportJobSerializer(serializers.ModelSerializer):
    mediaUrl = serializers.SerializerMethodField()
    audioUrl = serializers.SerializerMethodField()
    result = serializers.JSONField(source="extracted_recipe", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    startedAt = serializers.DateTimeField(source="started_at", read_only=True)
    finishedAt = serializers.DateTimeField(source="finished_at", read_only=True)
    sourceUrl = serializers.CharField(source="source_url", read_only=True)
    errorCode = serializers.CharField(source="error_code", read_only=True)
    errorMessage = serializers.CharField(source="error_message", read_only=True)
    fileSizeBytes = serializers.IntegerField(source="file_size_bytes", read_only=True)
    progressStage = serializers.CharField(source="progress_stage", read_only=True)
    videoOnly = serializers.BooleanField(source="download_only", read_only=True)
    saveVideo = serializers.BooleanField(source="persist_media", read_only=True)

    class Meta:
        model = RecipeImportJob
        fields = [
            "id",
            "status",
            "progressStage",
            "platform",
            "sourceUrl",
            "videoOnly",
            "saveVideo",
            "mediaUrl",
            "audioUrl",
            "result",
            "transcript",
            "fileSizeBytes",
            "errorCode",
            "errorMessage",
            "createdAt",
            "updatedAt",
            "startedAt",
            "finishedAt",
        ]

    def get_mediaUrl(self, obj):
        if not obj.media_file:
            return None
        try:
            return obj.media_file.url
        except Exception:
            return None

    def get_audioUrl(self, obj):
        if not obj.audio_file:
            return None
        try:
            return obj.audio_file.url
        except Exception:
            return None
