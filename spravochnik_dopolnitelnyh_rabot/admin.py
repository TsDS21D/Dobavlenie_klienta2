"""
admin.py для приложения spravochnik_dopolnitelnyh_rabot.
Регистрация модели Work в админке.
"""

from django.contrib import admin
from .models import Work


@admin.register(Work)
class WorkAdmin(admin.ModelAdmin):
    """
    Настройка отображения модели Work в админ-панели.
    """
    # Поля, отображаемые в списке объектов
    list_display = ['name', 'price', 'created_at', 'updated_at']
    # Поля для поиска
    search_fields = ['name']
    # Фильтры справа
    list_filter = ['created_at']
    # Сортировка по умолчанию
    ordering = ['-created_at']
    # Поля только для чтения
    readonly_fields = ['created_at', 'updated_at']
    # Разбивка на страницы
    list_per_page = 20