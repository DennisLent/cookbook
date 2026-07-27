"""REST API views for recipes, meal planning, collections, and social actions."""

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, permissions, status
from .models import Favorite, Recipe, RecipeImportJob, Tag, Rating, Comment, Ingredient
from .serializers import CollectionSerializer, RecipeImportJobCreateSerializer, RecipeImportJobSerializer, RecipeSerializer, TagSerializer, RatingSerializer, CommentSerializer, IngredientSerializer
import random
from django.db.models import Avg, Case, FloatField, IntegerField, Q, Value, When
from django.db.models.functions import Coalesce
from django.db import transaction
from django.db import IntegrityError
from django.db.transaction import on_commit
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from .meal_plan import generate_balanced_meal_plan, generate_meal_plan, swap_recipe
from .models import Collection
from cookbook.api_errors import error_response

import traceback


def query_param_is_truthy(value):
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}

# Custom permission
class IsAuthorOrReadOnly(permissions.BasePermission):
    """
    Permission to only allow an object's authors to edit or delete it.
    Model instance needs a .user attribute.
    """

    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed to anyone
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write permissions only to the owning user
        owner = getattr(obj, 'user', None)
        return owner == request.user

class RecipeViewSet(viewsets.ModelViewSet):
    queryset = Recipe.objects.prefetch_related(
        'tags',
        'recipe_ingredients',
        'steps__ingredients',
        'suggested_sides',
        'suggested_sauces',
        'ratings',
        'comments',
    ).order_by('-created_at')
    serializer_class = RecipeSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    class IsOwnerOrReadOnly(permissions.BasePermission):
        """
        Only allow the recipe creator to edit/delete. Read-only for others.
        """
        def has_object_permission(self, request, view, obj):
            if request.method in permissions.SAFE_METHODS:
                return True
            return getattr(obj, 'created_by', None) == request.user

    def get_permissions(self):
        # Apply owner check for mutating actions
        if self.action in ('update', 'partial_update', 'destroy'):
            return [permissions.IsAuthenticated(), self.IsOwnerOrReadOnly()]
        return [perm() if isinstance(perm, type) else perm for perm in self.permission_classes]

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()

        search = (request.query_params.get('search') or '').strip()
        tags = [tag.strip() for tag in (request.query_params.get('tags') or '').split(',') if tag.strip()]
        collection_id = (request.query_params.get('collection_id') or '').strip()
        favorites_only = query_param_is_truthy(request.query_params.get('favorites_only'))
        min_rating_raw = (request.query_params.get('min_rating') or '').strip()
        sort = request.query_params.get('sort')
        direction = request.query_params.get('direction', 'desc')
        dir_prefix = '-' if direction == 'desc' else ''
        needs_rating_annotation = sort == 'rating' or bool(min_rating_raw)

        if search:
            qs = qs.filter(
                Q(title__icontains=search)
                | Q(description__icontains=search)
                | Q(tags__name__icontains=search)
                | Q(recipe_ingredients__display_name__icontains=search)
                | Q(recipe_ingredients__ingredient__name__icontains=search)
            )

        if tags:
            for tag_name in tags:
                qs = qs.filter(tags__name__iexact=tag_name)

        if collection_id:
            qs = qs.filter(collection_recipes__collection_id=collection_id)
            if request.user and request.user.is_authenticated:
                qs = qs.filter(collection_recipes__collection__owner=request.user)

        favorite_ids = []
        if request.user and request.user.is_authenticated:
            favorite_ids = list(request.user.favorites.values_list("recipe_id", flat=True))
            if favorites_only:
                qs = qs.filter(pk__in=favorite_ids)
        elif favorites_only:
            qs = qs.none()

        if needs_rating_annotation:
            qs = qs.annotate(
                avg_rating_order=Coalesce(Avg('ratings__stars'), Value(0.0), output_field=FloatField())
            )

        if min_rating_raw:
            try:
                min_rating = float(min_rating_raw)
            except ValueError:
                min_rating = None
            if min_rating is not None:
                qs = qs.filter(avg_rating_order__gte=min_rating)

        if request.user and request.user.is_authenticated and sort in ('rating', 'favorites'):
            if sort == 'rating':
                qs = qs.order_by(f"{dir_prefix}avg_rating_order", '-created_at')
            elif sort == 'favorites':
                whens = [When(pk=recipe_id, then=Value(1)) for recipe_id in favorite_ids]
                qs = qs.annotate(
                    favorite_rank=Case(
                        *whens,
                        default=Value(0),
                        output_field=IntegerField(),
                    )
                ).order_by(f"{dir_prefix}favorite_rank", '-created_at')
        elif sort == 'rating':
            qs = qs.order_by(f"{dir_prefix}avg_rating_order", '-created_at')

        qs = qs.distinct()

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            instance = serializer.save(created_by=request.user)

        headers = self.get_success_headers(serializer.data)
        return Response(self.get_serializer(instance).data,
                        status=status.HTTP_201_CREATED,
                        headers=headers)

    def update(self, request, *args, **kwargs):
        with transaction.atomic():
            recipe = get_object_or_404(Recipe.objects.select_for_update(), pk=kwargs["pk"])
            self.check_object_permissions(request, recipe)
            expected_version = request.data.get("version")
            if expected_version is None:
                return error_response(
                    code="recipe_version_required",
                    message="The current recipe version is required before saving.",
                    http_status=status.HTTP_428_PRECONDITION_REQUIRED,
                    details={"currentVersion": recipe.version},
                )
            try:
                expected_version = int(expected_version)
            except (TypeError, ValueError):
                expected_version = -1
            if expected_version != recipe.version:
                return error_response(
                    code="recipe_version_conflict",
                    message="This recipe was changed by another client. Refresh it before saving again.",
                    http_status=status.HTTP_409_CONFLICT,
                    details={"currentVersion": recipe.version},
                )
            serializer = self.get_serializer(
                recipe,
                data=request.data,
                partial=False,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            recipe = serializer.save(version=recipe.version + 1)
            return Response(self.get_serializer(recipe).data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        with transaction.atomic():
            recipe = get_object_or_404(Recipe.objects.select_for_update(), pk=kwargs["pk"])
            self.check_object_permissions(request, recipe)
            expected_version = request.data.get("version")
            if expected_version is None:
                return error_response(
                    code="recipe_version_required",
                    message="The current recipe version is required before saving.",
                    http_status=status.HTTP_428_PRECONDITION_REQUIRED,
                    details={"currentVersion": recipe.version},
                )
            if str(expected_version) != str(recipe.version):
                return error_response(
                    code="recipe_version_conflict",
                    message="This recipe was changed by another client. Refresh it before saving again.",
                    http_status=status.HTTP_409_CONFLICT,
                    details={"currentVersion": recipe.version},
                )
            serializer = self.get_serializer(
                recipe,
                data=request.data,
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            recipe = serializer.save(version=recipe.version + 1)
            return Response(self.get_serializer(recipe).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='plan', permission_classes=[permissions.AllowAny])
    def plan(self, request):
        """Generate a meal plan based on frontend filters.

        Error cases are returned with structured codes so the frontend can show
        actionable messages instead of generic failures.
        """
        diet = (request.data.get('diet_type') or 'omnivore').lower()
        meal_types = request.data.get('meal_types') or ["breakfast", "lunch", "dinner"]
        dietary_filters = request.data.get('dietary_filters') or []
        try:
            days = max(1, min(14, int(request.data.get('days', 7))))
        except Exception:
            return error_response(
                code="invalid_meal_plan_days",
                message="The meal plan days value must be a valid integer between 1 and 14.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "days"},
            )

        if not isinstance(meal_types, list) or not meal_types:
            return error_response(
                code="invalid_meal_types",
                message="At least one meal type must be selected.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "meal_types"},
            )

        entries = generate_balanced_meal_plan(
            days=days,
            meal_types=meal_types,
            dietary_filters=dietary_filters,
        )
        serialized_entries = []
        for entry in entries:
            serialized_entries.append(
                {
                    "day": entry["day"],
                    "mealType": entry["mealType"],
                    "recipe": RecipeSerializer(entry["recipe"], context={"request": request}).data if entry["recipe"] else None,
                }
            )
        return Response({"entries": serialized_entries})

    @action(detail=False, methods=['post'], url_path='swap', permission_classes=[permissions.AllowAny])
    def swap(self, request):
        """Swap a recipe in an existing plan, prefer same protein."""
        diet = (request.data.get('diet_type') or 'omnivore').lower()
        try:
            current_id = int(request.data.get('current_recipe_id'))
        except Exception:
            return error_response(
                code="missing_current_recipe_id",
                message="A valid current_recipe_id is required to swap a meal plan recipe.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "current_recipe_id"},
            )
        existing_ids = request.data.get('existing_plan_ids') or []
        if not isinstance(existing_ids, (list, tuple)):
            existing_ids = []
        existing_ids = [int(i) for i in existing_ids if str(i).isdigit()]

        replacement = swap_recipe(
            diet,
            current_id,
            existing_ids,
            request.data.get('dietary_filters') or [],
        )
        if not replacement:
            return error_response(
                code="replacement_not_found",
                message="No suitable replacement recipe could be found for the current meal plan slot.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        return Response(RecipeSerializer(replacement, context={"request": request}).data)


    @action(detail=False, methods=['get'], url_path='suggestions')
    def suggestions(self, request):
        """
        Return a varied list of 7 recipes, ordered roughly by highest average rating
        with some randomness so results differ each time.
        """
        # get average rating
        top_qs = Recipe.objects.annotate(avg_rating=Avg('ratings__stars'))

        # sort by descending avg_rating
        # take top 20 for randomness pool
        top_recipes = list(top_qs.order_by('-avg_rating')[:20])

        # pick up to 7 unique recipes at random
        count = min(7, len(top_recipes))
        suggestions = random.sample(top_recipes, count)

        # serialize and return
        serializer = self.get_serializer(suggestions, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'], url_path="preview/website", permission_classes=[permissions.IsAuthenticated])
    def get_from_website(self, request):
        from .extraction.services import extract_recipe_from_website

        url = request.data.get('url')
        if not url:
            return error_response(
                code="missing_url",
                message="A source URL is required for website recipe preview.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "url"},
            )
        
        try:
            data = extract_recipe_from_website(url=url)
        except Exception as e:
            traceback.print_exc()
            return error_response(
                code="website_preview_failed",
                message="The backend could not extract recipe data from the provided website.",
                http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                details={"reason": str(e)},
            )

        return Response(data)
    
    @action(detail=False, methods=['post'], url_path="preview/youtube", permission_classes=[permissions.IsAuthenticated])
    def get_from_youtube(self, request):
        from .extraction.services import extract_recipe_from_youtube

        video_url = request.data.get('video_url')
        if not video_url:
            return error_response(
                code="missing_video_url",
                message="A video URL is required for YouTube recipe preview.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "video_url"},
            )

        try:
            data = extract_recipe_from_youtube(video_url, model=settings.OLLAMA_DEFAULT_MODEL)
        except Exception as e:
            traceback.print_exc()
            return error_response(
                code="youtube_preview_failed",
                message="The backend could not extract recipe data from the provided YouTube video.",
                http_status=status.HTTP_422_UNPROCESSABLE_ENTITY,
                details={"reason": str(e)},
            )

        if data is None:
            return error_response(
                code="youtube_recipe_not_found",
                message="No recipe data could be found in the provided YouTube video.",
                http_status=status.HTTP_404_NOT_FOUND,
            )

        return Response(data)

    @action(detail=False, methods=['post'], url_path="preview/instagram", permission_classes=[permissions.IsAuthenticated])
    def get_from_instagram(self, request):
        """Deprecated synchronous endpoint retained for API clarity."""
        video_url = request.data.get('video_url')

        if not video_url:
            return error_response(
                code="missing_video_url",
                message="A video URL is required for Instagram recipe preview.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "video_url"},
            )

        return error_response(
            code="instagram_async_required",
            message="Instagram imports now run asynchronously. Create a recipe import job and poll its status instead.",
            http_status=status.HTTP_409_CONFLICT,
            details={"field": "video_url", "source_url": video_url},
        )

    @action(detail=True, methods=['post', 'delete', 'get'], url_path='favorite', permission_classes=[permissions.IsAuthenticated])
    def favorite(self, request, pk=None):
        """Favorite/unfavorite a recipe for the current user, or fetch status."""
        recipe = self.get_object()
        user = request.user
        is_favorited = Favorite.objects.filter(user=user, recipe=recipe).exists()

        if request.method == 'GET':
            return Response({
                'is_favorited': is_favorited,
                'favorites_count': RecipeSerializer(recipe, context={"request": request}).data["favorites_count"],
            })

        if request.method == 'POST':
            Favorite.objects.get_or_create(user=user, recipe=recipe)
            return Response({
                'is_favorited': True,
                'favorites_count': RecipeSerializer(recipe, context={"request": request}).data["favorites_count"],
            }, status=status.HTTP_200_OK)

        # DELETE
        Favorite.objects.filter(user=user, recipe=recipe).delete()
        return Response({
            'is_favorited': False,
            'favorites_count': RecipeSerializer(recipe, context={"request": request}).data["favorites_count"],
        }, status=status.HTTP_200_OK)
    @action(detail=True, methods=['post'], url_path='rate', permission_classes=[permissions.IsAuthenticated])
    def rate(self, request, pk=None):
        """Create or update the current user's rating for this recipe."""
        recipe = self.get_object()
        user = request.user
        try:
            stars = int(request.data.get('stars'))
        except Exception:
            return error_response(
                code="invalid_rating",
                message="A valid stars value between 1 and 5 is required.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "stars"},
            )
        if not (1 <= stars <= 5):
            return error_response(
                code="rating_out_of_range",
                message="Ratings must be between 1 and 5.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "stars"},
            )

        try:
            with transaction.atomic():
                rating, _created = Rating.objects.update_or_create(
                    recipe=recipe,
                    user=user,
                    defaults={'stars': stars},
                )
        except IntegrityError:
            # A concurrent first rating may win the unique-key race.
            with transaction.atomic():
                rating = Rating.objects.select_for_update().get(recipe=recipe, user=user)
                rating.stars = stars
                rating.save(update_fields=["stars", "updated_at"])

        avg = Recipe.objects.filter(pk=recipe.pk).aggregate(avg=Avg('ratings__stars')).get('avg')
        return Response({
            'my_rating': rating.stars,
            'avg_rating': avg,
        }, status=status.HTTP_200_OK)

class IngredientViewSet(viewsets.ModelViewSet):
    """
    Anyone can list/retrieve tags.
    Only authenticated users can create, edit or delete tags.
    """
    queryset = Ingredient.objects.all().order_by('name')
    serializer_class = IngredientSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]


class TagViewSet(viewsets.ModelViewSet):
    """
    Anyone can list/retrieve tags.
    Only authenticated users can create, edit or delete tags.
    """
    queryset = Tag.objects.all().order_by('name')
    serializer_class = TagSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]


class RatingViewSet(viewsets.ModelViewSet):
    """
    Anyone can list/retrieve ratings.
    Only authenticated users can create.
    Only the rating’s owner can edit or delete their rating.
    """
    queryset = Rating.objects.all()
    serializer_class = RatingSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class RecipeImportJobViewSet(viewsets.GenericViewSet):
    serializer_class = RecipeImportJobSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "recipe_import_jobs"

    def get_queryset(self):
        return RecipeImportJob.objects.filter(user=self.request.user).order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return RecipeImportJobCreateSerializer
        return RecipeImportJobSerializer

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset()[:50], many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        from .extraction.services import validate_public_website_url
        from .extraction.utils import PublicVideoDownloadError, validate_public_video_url
        from .tasks import process_recipe_import_job

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        source_url = serializer.validated_data["url"]
        download_only = serializer.validated_data.get("videoOnly", False)
        persist_media = serializer.validated_data.get("saveVideo", False)
        idempotency_key = (request.headers.get("Idempotency-Key") or "").strip() or None
        if idempotency_key and len(idempotency_key) > 128:
            return error_response(
                code="invalid_idempotency_key",
                message="Idempotency-Key must not exceed 128 characters.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            platform = validate_public_video_url(source_url)
        except PublicVideoDownloadError as exc:
            if exc.code != "unsupported_host":
                return error_response(
                    code=exc.code,
                    message=exc.message,
                    http_status=status.HTTP_400_BAD_REQUEST,
                    details={"field": "url"},
                )
            try:
                platform = validate_public_website_url(source_url)
            except ValueError as website_exc:
                return error_response(
                    code="invalid_website_url",
                    message=str(website_exc),
                    http_status=status.HTTP_400_BAD_REQUEST,
                    details={"field": "url"},
                )

        if platform == RecipeImportJob.PLATFORM_WEBSITE and (download_only or persist_media):
            return error_response(
                code="website_video_options_unsupported",
                message="Saving video is only available for YouTube, Instagram, and TikTok imports.",
                http_status=status.HTTP_400_BAD_REQUEST,
                details={"field": "url"},
            )

        with transaction.atomic():
            defaults = {
                "source_url": source_url,
                "platform": platform,
                "status": RecipeImportJob.STATUS_QUEUED,
                "download_only": download_only,
                "persist_media": persist_media,
            }
            if idempotency_key:
                job, created = RecipeImportJob.objects.get_or_create(
                    user=request.user,
                    idempotency_key=idempotency_key,
                    defaults=defaults,
                )
                if not created and (
                    job.source_url != source_url
                    or job.download_only != download_only
                    or job.persist_media != persist_media
                ):
                    return error_response(
                        code="idempotency_key_reused",
                        message="This Idempotency-Key was already used for a different import.",
                        http_status=status.HTTP_409_CONFLICT,
                    )
            else:
                job = RecipeImportJob.objects.create(
                    user=request.user,
                    idempotency_key=None,
                    **defaults,
                )
                created = True

            if created:
                def enqueue():
                    process_recipe_import_job.delay(job.pk)

                on_commit(enqueue)

        return Response(
            RecipeImportJobSerializer(job, context={"request": request}).data,
            status=status.HTTP_202_ACCEPTED,
        )


class CommentViewSet(viewsets.ModelViewSet):
    """
    Anyone can list/retrieve comments.
    Only authenticated users can create.
    Only the comment’s author can edit or delete their comment.
    """
    queryset = Comment.objects.all().order_by('-created_at')
    serializer_class = CommentSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsAuthorOrReadOnly]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class CollectionViewSet(viewsets.ModelViewSet):
    serializer_class = CollectionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Collection.objects.filter(owner=self.request.user).order_by("name")

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post", "delete"], url_path=r"recipes/(?P<recipe_id>[^/.]+)")
    def recipe_membership(self, request, pk=None, recipe_id=None):
        """Atomically add/remove one member without replacing the full set."""

        collection = self.get_object()
        try:
            recipe = Recipe.objects.get(pk=recipe_id)
        except Recipe.DoesNotExist:
            return error_response(
                code="recipe_not_found",
                message="The requested recipe does not exist.",
                http_status=status.HTTP_404_NOT_FOUND,
            )
        from .models import CollectionRecipe

        if request.method == "POST":
            CollectionRecipe.objects.get_or_create(collection=collection, recipe=recipe)
        else:
            CollectionRecipe.objects.filter(collection=collection, recipe=recipe).delete()
        return Response(
            CollectionSerializer(collection, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )
