from rest_framework import serializers
from .models import Recipe, Tag, Rating, Comment, Ingredient, RecipeIngredient
from users.models import User

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name']

class IngredientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ingredient
        fields = ['id', 'name']

class RecipeIngredientSerializer(serializers.ModelSerializer):
    ingredient = IngredientSerializer(read_only=True)

    class Meta:
        model = RecipeIngredient
        fields = ['ingredient', 'amount']

class RecipeIngredientCreateSerializer(serializers.ModelSerializer):
    # accept an existing ingredient by ID
    ingredient_id = serializers.PrimaryKeyRelatedField(
        source='ingredient',
        queryset=Ingredient.objects.all(),
        write_only=True
    )

    class Meta:
        model = RecipeIngredient
        fields = ['ingredient_id', 'amount']


class RatingSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')

    class Meta:
        model = Rating
        fields = ['id', 'recipe', 'user', 'stars']

    def validate_stars(self, value):
        if not (1 <= value <= 5):
            raise serializers.ValidationError("Rating must be between 1 and 5.")
        return value


class CommentSerializer(serializers.ModelSerializer):
    author = serializers.ReadOnlyField(source='user.username')

    class Meta:
        model = Comment
        fields = ['id', 'recipe', 'author', 'text', 'created_at']


class RecipeSerializer(serializers.ModelSerializer):
    created_by = serializers.ReadOnlyField(source='created_by.username')

    prep_time   = serializers.DurationField(required=False)
    cook_time   = serializers.DurationField(required=False)
    total_time  = serializers.DurationField(required=False)
    servings    = serializers.IntegerField(required=False)

    tags = serializers.SlugRelatedField(
        many=True,
        slug_field='name',
        queryset=Tag.objects.all(),
        required=False
    )

    image = serializers.ImageField(required=False, allow_null=True)

    comments = CommentSerializer(many=True, read_only=True)
    ratings  = RatingSerializer(many=True, read_only=True)

    # nested read
    ingredients = RecipeIngredientSerializer(
        source='recipeingredient_set',
        many=True,
        read_only=True
    )
    # nested write
    ingredients_data = RecipeIngredientCreateSerializer(
        source='recipeingredient_set',
        many=True,
        write_only=True,
        required=True
    )

    class Meta:
        model = Recipe
        fields = [
            'id', 'title', 'description', 'instructions',
            'created_by', 'created_at', 'image',
            'tags', 'ingredients', 'ingredients_data',
            'prep_time', 'cook_time', 'total_time',
            'servings',
            'comments',
            'ratings'
        ]

    def create(self, validated_data):
        tags = validated_data.pop('tags', [])
        ingredients_data = validated_data.pop('recipeingredient_set', [])

        created_by = validated_data.pop('created_by', None) or self.context['request'].user

        recipe = Recipe.objects.create(
            created_by=created_by,
            **validated_data
        )

        for tag_name in tags:
            tag, _ = Tag.objects.get_or_create(name=tag_name)
            recipe.tags.add(tag)

        for ing in ingredients_data:
            RecipeIngredient.objects.create(
                recipe=recipe,
                ingredient=ing['ingredient'],
                amount=ing['amount']
            )

        return recipe

    def update(self, instance, validated_data):
        # handle tags if provided
        if 'tags' in validated_data:
            instance.tags.clear()
            for tag_name in validated_data.pop('tags'):
                tag, _ = Tag.objects.get_or_create(name=tag_name)
                instance.tags.add(tag)

        # handle ingredients if provided
        if 'recipeingredient_set' in validated_data:
            new_ings = validated_data.pop('recipeingredient_set')
            instance.recipeingredient_set.all().delete()
            for ing in new_ings:
                RecipeIngredient.objects.create(
                    recipe=instance,
                    ingredient=ing['ingredient'],
                    amount=ing['amount']
                )

        # update other fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance

