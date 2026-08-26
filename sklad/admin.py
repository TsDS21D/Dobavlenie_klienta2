"""
admin.py для приложения sklad
Настройка панели администратора для моделей Category и Material.

ИСПРАВЛЕНИЯ (унификация ценообразования):
- Убрано поле price, добавлены cost и markup_percent для бумаги.
- Поле unit теперь общее, вынесено в основную секцию.
"""

from django.contrib import admin
from django.utils.html import format_html
from mptt.admin import DraggableMPTTAdmin
from .models import Category, Material


@admin.register(Category)
class CategoryAdmin(DraggableMPTTAdmin):
    """Административный интерфейс для категорий с поддержкой drag-and-drop (MPTT)."""

    list_display = ('tree_actions', 'indented_title', 'type', 'get_materials_count', 'created_at')
    list_display_links = ('indented_title',)
    search_fields = ('name', 'description')
    list_filter = ('created_at', 'type')

    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'type', 'parent', 'description')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )
    readonly_fields = ('created_at', 'updated_at')
    expand_tree_by_default = True

    def get_materials_count(self, obj):
        return obj.materials.count()
    get_materials_count.short_description = 'Кол-во материалов'
    get_materials_count.admin_order_field = 'materials__count'


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    """Административный интерфейс для материалов."""

    list_display = (
        'name', 'category', 'type', 'price_display', 'quantity_display',
        'quantity_status', 'is_active', 'created_at'
    )
    search_fields = ('name', 'category__name', 'notes')
    list_filter = ('category', 'type', 'is_active', 'created_at', 'unit')
    list_editable = ('is_active',)
    list_per_page = 50
    autocomplete_fields = ['category']

    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'category', 'type')
        }),
        ('Ценообразование (общее)', {
            'fields': ('cost', 'markup_percent', 'unit'),
            'description': 'Цена вычисляется автоматически: себестоимость × (1 + наценка/100)'
        }),
        ('Для бумаги', {
            'fields': ('density', 'paper_thickness'),
            'classes': ('collapse',),
        }),
        ('Для плёнки', {
            'fields': ('thickness',),
            'classes': ('collapse',),
        }),
        ('Складской учёт', {
            'fields': ('quantity', 'min_quantity'),
        }),
        ('Дополнительно', {
            'fields': ('characteristics', 'notes', 'is_active'),
            'classes': ('collapse',),
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )
    readonly_fields = ('created_at', 'updated_at')

    def price_display(self, obj):
        """Отображает вычисленную цену с единицей измерения."""
        return f"{obj.get_price():.2f} руб./{obj.unit}"
    price_display.short_description = 'Цена'

    def quantity_display(self, obj):
        return f"{int(obj.quantity)} {obj.unit}"
    quantity_display.short_description = 'Количество'
    quantity_display.admin_order_field = 'quantity'

    def quantity_status(self, obj):
        status, text = obj.get_quantity_status()
        colors = {'danger': 'red', 'warning': 'orange', 'success': 'green'}
        color = colors.get(status, 'black')
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, text)
    quantity_status.short_description = 'Статус'
    quantity_status.admin_order_field = 'quantity'