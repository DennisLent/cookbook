"""Top-level URL routing for API, auth, admin, and media endpoints."""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.shortcuts import redirect
from django.views.static import serve
from django.urls import re_path
from rest_framework.routers import DefaultRouter
from recipes.views import CollectionViewSet, RecipeImportJobViewSet, RecipeViewSet, TagViewSet, RatingViewSet, CommentViewSet, IngredientViewSet
from users.views import AppConfigView, AppUpdateCheckView, AppUpdateDismissView, AppUpdateStatusView, AppVersionView, ChangePasswordView, DatabaseExportView, DatabaseImportView, ExtractionSettingsView, ModeAwareTokenObtainPairView, ModeAwareTokenRefreshView, UserRegisterView, UserDetailView, VoskModelUploadView


router = DefaultRouter()
router.register(r'recipes', RecipeViewSet)
router.register(r'recipe-import-jobs', RecipeImportJobViewSet, basename='recipe-import-job')
router.register(r'collections', CollectionViewSet, basename='collection')
router.register(r'tags', TagViewSet)
router.register(r'ratings', RatingViewSet)
router.register(r'comments', CommentViewSet)
router.register(r'ingredients', IngredientViewSet)


def root_redirect(_request):
    return redirect('/admin/', permanent=False)

urlpatterns = [
    path('', root_redirect, name='root_redirect'),

    # admin path
    path('admin/', admin.site.urls),

    # api path
    path('api/', include(router.urls)),

    # auth path
    path('api/auth/token/', ModeAwareTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', ModeAwareTokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/register/', UserRegisterView.as_view(), name='auth_register'),
    path('api/app/config/', AppConfigView.as_view(), name='app_config'),
    path('api/app/version/', AppVersionView.as_view(), name='app_version'),
    path('api/app/update-status/', AppUpdateStatusView.as_view(), name='app_update_status'),
    path('api/app/update-status/check/', AppUpdateCheckView.as_view(), name='app_update_check'),
    path('api/app/update-status/dismiss/', AppUpdateDismissView.as_view(), name='app_update_dismiss'),
    path('api/users/me/', UserDetailView.as_view(), name='user_detail'),
    path('api/users/me/change-password/', ChangePasswordView.as_view(), name='change_password'),
    path('api/database/export/', DatabaseExportView.as_view(), name='database_export'),
    path('api/database/import/', DatabaseImportView.as_view(), name='database_import'),
    path('api/settings/extraction-models/', ExtractionSettingsView.as_view(), name='extraction_settings'),
    path('api/settings/vosk-model-upload/', VoskModelUploadView.as_view(), name='vosk_model_upload'),
]

# uploads for locally stored media
if settings.USE_S3_MEDIA_STORAGE:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
else:
    urlpatterns += [
        re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
    ]
