from rest_framework import generics, permissions
from .models import User
from .serializers import UserRegisterSerializer, UserSerializer

class UserRegisterView(generics.CreateAPIView):
    """
    POST /api/users/  
    Creates a new user (username, first_name, last_name, password)
    Optionally add: (bio, avatar, preferences).
    """
    queryset = User.objects.all()
    serializer_class = UserRegisterSerializer
    permission_classes = [permissions.AllowAny]

class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET  /api/users/me/   → retrieve current user’s profile  
    PUT  /api/users/me/   → replace entire profile (except username)  
    PATCH /api/users/me/  → partial update  
    DELETE /api/users/me/ → delete the current user
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user