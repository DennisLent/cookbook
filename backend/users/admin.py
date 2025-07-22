from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    model = User
    list_display = (
        'username', 'first_name', 'last_name', 'is_staff', 'is_active'
    )
    # Include bio, avatar, and preferences in both edit and add forms
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Extra Info', {'fields': ('bio', 'avatar', 'preferences')}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Extra Info', {'fields': ('bio', 'avatar', 'preferences')}),
    )
    # Optional: show avatar thumbnail in list
    readonly_fields = ('avatar_preview',)

    def avatar_preview(self, obj):
        if obj.avatar:
            return mark_safe(f"<img src='{obj.avatar.url}' width='50' height='50' style='object-fit:cover;border-radius:50%;'/>")
        return "-"
    avatar_preview.short_description = 'Avatar'
