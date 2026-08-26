"""
admin.py для приложения sheet_formats
Настройки административной панели Django для приложения sheet_formats
Позволяет управлять форматами листов через стандартный интерфейс админки
"""

from django.contrib import admin
from .models import SheetFormat


@admin.register(SheetFormat)
class SheetFormatAdmin(admin.ModelAdmin):
    """
    Административная панель для управления форматами листов
    Настраивает отображение и поведение модели SheetFormat в админ-панели Django
    """
    
    # Поля, которые будут отображаться в списке форматов
    list_display = ('name', 'width_mm', 'height_mm', 'get_dimensions_display')
    
    # Поля, по которым можно фильтровать список
    list_filter = ()
    
    # Поля, по которым работает поиск
    search_fields = ('name',)
    
    # Порядок сортировки по умолчанию
    ordering = ('name',)
    
    # Количество элементов на странице
    list_per_page = 20
    
    # Группировка полей в форме редактирования
    fieldsets = (
        ('Основная информация', {
            'fields': ('name',)
        }),
        ('Размеры листа', {
            'fields': ('width_mm', 'height_mm')
        }),
    )
    
    def get_dimensions_display(self, obj):
        """
        Отображает размеры в админ-панели в формате "ширина×высота мм"
        Args:
            obj: Объект SheetFormat
        Returns:
            str: Строка с размерами
        """
        return obj.get_dimensions_display()
    
    get_dimensions_display.short_description = 'Размеры'
    get_dimensions_display.admin_order_field = 'width_mm'