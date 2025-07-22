from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from recipes.views import RecipeViewSet, TagViewSet, RatingViewSet, CommentViewSet, IngredientViewSet
from users.views import UserRegisterView, UserDetailView


router = DefaultRouter()
router.register(r'recipes', RecipeViewSet)
router.register(r'tags', TagViewSet)
router.register(r'ratings', RatingViewSet)
router.register(r'comments', CommentViewSet)
router.register(r'ingredients', IngredientViewSet)

urlpatterns = [
    # admin path
    path('admin/', admin.site.urls),

    # api path
    path('api/', include(router.urls)),

    # auth path
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/register/', UserRegisterView.as_view(), name='auth_register'),
    path('api/users/me/', UserDetailView.as_view(), name='user_detail'),
]

# uploads for images
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
