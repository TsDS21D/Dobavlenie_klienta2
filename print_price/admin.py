"""
admin.py для приложения print_price
Настройка административной панели Django для цен на печать (цена за 1 лист)
"""

from django.contrib import admin
from .models import PrintPrice


@admin.register(PrintPrice)
class PrintPriceAdmin(admin.ModelAdmin):
    """
    Настройка отображения модели PrintPrice в админ-панели
    """
    
    # Поля, отображаемые в списке объектов
    list_display = [
        'printer',
        'copies',
        'price_per_sheet',
        'total_price',
        'created_at',
    ]
    
    # Поля для фильтрации справа
    list_filter = [
        'printer',
        'created_at',
    ]
    
    # Поля для поиска
    search_fields = [
        'printer__name',
        'copies',
    ]
    
    # Порядок сортировки по умолчанию
    ordering = ['printer', 'copies']
    
    # Разбивка на страницы
    list_per_page = 20
    
    # Поля только для чтения
    readonly_fields = ['created_at', 'updated_at']
    
    # Поля для отображения в форме редактирования
    fieldsets = [
        ('Основная информация', {
            'fields': ['printer', 'copies', 'price_per_sheet']
        }),
        ('Даты', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']  # Сворачиваемый раздел
        }),
    ]
    
    # Метод для отображения общей стоимости в списке
    def total_price(self, obj):
        """
        Отображает общую стоимость за тираж
        
        Args:
            obj: Объект PrintPrice
        
        Returns:
            str: Форматированная общая стоимость
        """
        return f"{obj.get_total_price():.2f} руб."
    
    # Заголовок для колонки
    total_price.short_description = 'Общая стоимость'