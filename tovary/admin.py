# tovary/admin.py
"""
Регистрация моделей приложения "tovary" в админке Django.

Для Category используется MPTTModelAdmin — он даёт удобный редактор
дерева прямо в админке.
"""

from django.contrib import admin
from mptt.admin import DraggableMPTTAdmin

from .models import Tovar, Category


@admin.register(Category)
class CategoryAdmin(DraggableMPTTAdmin):
    """
    Админка категорий — с деревом и перетаскиванием (draggable).

    DraggableMPTTAdmin — из mptt.admin: даёт красивый список с деревом
    и возможностью перетаскивать категории мышью прямо в админке.
    """
    list_display = ('tree_actions', 'indented_title', 'is_deleted')
    list_display_links = ('indented_title',)
    list_filter = ('is_deleted',)
    search_fields = ('name',)


@admin.register(Tovar)
class TovarAdmin(admin.ModelAdmin):
    """Админка товаров."""

    list_display = (
        'name',
        'category',           # новое FK-поле
        'category_old',       # старое (пока есть)
        'article',
        'price',
        'unit',
        'is_deleted',
        'created_at',
    )

    list_filter = (
        'category',
        'is_deleted',
        'created_at',
    )

    search_fields = (
        'name',
        'article',
    )

    ordering = ('name',)

    readonly_fields = ('created_at', 'updated_at')

    list_editable = ('price',)

    autocomplete_fields = ('category',)