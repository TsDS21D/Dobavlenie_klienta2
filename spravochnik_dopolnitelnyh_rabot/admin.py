"""
admin.py для приложения spravochnik_dopolnitelnyh_rabot.
Регистрация модели Work в админке с добавлением полей cost и markup_percent.
"""

from django.contrib import admin
from .models import Work, WorkPrice, WorkCirculationPrice


@admin.register(Work)
class WorkAdmin(admin.ModelAdmin):
    """
    Настройка отображения модели Work в админ-панели.
    Добавлены поля cost и markup_percent в список и форму.
    """
    list_display = ['name', 'cost', 'markup_percent', 'price', 'created_at', 'updated_at']
    search_fields = ['name']
    list_filter = ['created_at', 'formula_type']
    ordering = ['-created_at']
    readonly_fields = ['created_at', 'updated_at', 'price']  # price теперь только для чтения
    list_per_page = 20

    # Группировка полей в форме
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'cost', 'markup_percent', 'formula_type', 'interpolation_method')
        }),
        ('Параметры расчёта', {
            'fields': ('k_lines', 'default_lines_count', 'default_items_per_sheet')
        }),
        ('Системные поля', {
            'fields': ('created_at', 'updated_at', 'price'),
            'classes': ('collapse',)
        }),
    )


@admin.register(WorkPrice)
class WorkPriceAdmin(admin.ModelAdmin):
    """Админка для WorkPrice (без изменений)."""
    list_display = ['work', 'sheets', 'price', 'created_at']
    list_filter = ['work', 'created_at']
    search_fields = ['work__name']
    ordering = ['work', 'sheets']
    autocomplete_fields = ['work']


@admin.register(WorkCirculationPrice)
class WorkCirculationPriceAdmin(admin.ModelAdmin):
    """Админка для WorkCirculationPrice (без изменений)."""
    list_display = ['work', 'circulation', 'price', 'created_at']
    list_filter = ['work', 'created_at']
    search_fields = ['work__name']
    ordering = ['work', 'circulation']
    autocomplete_fields = ['work']