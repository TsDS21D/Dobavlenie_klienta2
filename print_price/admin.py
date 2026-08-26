"""
admin.py для приложения print_price
Настройка административной панели Django для цен на печать (себестоимость + наценка)
"""

from django.contrib import admin
from .models import PrintPrice


@admin.register(PrintPrice)
class PrintPriceAdmin(admin.ModelAdmin):
    """
    Настройка отображения модели PrintPrice в админ-панели
    """
    list_display = [
        'printer',
        'copies',
        'cost',
        'markup_percent',
        'price_per_sheet',
        'total_price',
        'created_at',
    ]
    list_filter = ['printer', 'created_at']
    search_fields = ['printer__name', 'copies']
    ordering = ['printer', 'copies']
    list_per_page = 20
    readonly_fields = ['price_per_sheet', 'created_at', 'updated_at']

    fieldsets = [
        ('Основная информация', {
            'fields': ['printer', 'copies', 'cost', 'markup_percent']
        }),
        ('Расчётные поля', {
            'fields': ['price_per_sheet', 'created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]

    def total_price(self, obj):
        return f"{obj.get_total_price():.2f} руб."
    total_price.short_description = 'Общая стоимость'