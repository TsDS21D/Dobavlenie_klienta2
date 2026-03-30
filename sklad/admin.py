"""
admin.py для приложения sklad
Настройка панели администратора для моделей Category и Material.
Добавлены поля density и paper_thickness в секцию бумаги.
"""

from django.contrib import admin
from django.utils.html import format_html
from mptt.admin import DraggableMPTTAdmin
from .models import Category, Material


@admin.register(Category)
class CategoryAdmin(DraggableMPTTAdmin):
    """
    Административный интерфейс для категорий с поддержкой drag-and-drop (MPTT).
    """

    # Какие поля показывать в списке
    list_display = ('tree_actions', 'indented_title', 'type', 'get_materials_count', 'created_at')
    list_display_links = ('indented_title',)   # По indented_title можно перейти к редактированию
    search_fields = ('name', 'description')    # Поиск по названию и описанию
    list_filter = ('created_at', 'type')       # Фильтры по дате создания и типу

    # Группировка полей на форме редактирования
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'type', 'parent', 'description')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),          # Сворачиваемая секция
        }),
    )
    readonly_fields = ('created_at', 'updated_at')   # Только для чтения
    expand_tree_by_default = True              # Дерево развёрнуто по умолчанию

    def get_materials_count(self, obj):
        """Возвращает количество материалов в категории."""
        return obj.materials.count()

    get_materials_count.short_description = 'Кол-во материалов'
    get_materials_count.admin_order_field = 'materials__count'


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    """
    Административный интерфейс для материалов.
    Поля сгруппированы по типам.
    """

    # Поля, отображаемые в списке материалов
    list_display = (
        'name', 'category', 'type', 'price_display', 'quantity_display',
        'quantity_status', 'is_active', 'created_at'
    )
    search_fields = ('name', 'category__name', 'notes')
    list_filter = ('category', 'type', 'is_active', 'created_at', 'unit')
    list_editable = ('is_active',)           # Можно редактировать прямо из списка
    list_per_page = 50
    autocomplete_fields = ['category']       # Автодополнение при выборе категории

    # Группировка полей на форме редактирования
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'category', 'type')
        }),
        ('Для бумажных материалов', {
            'fields': ('price', 'unit', 'density', 'paper_thickness'),   # density и paper_thickness
            'classes': ('collapse',),
        }),
        ('Для плёнки', {
            'fields': ('cost', 'markup_percent', 'thickness'),
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
        """Отображает цену с единицей измерения (использует вычисляемую цену)."""
        return f"{obj.get_price():.2f} руб./{obj.unit}"

    price_display.short_description = 'Цена'
    price_display.admin_order_field = 'price'   # Сортировка по полю price (только для бумаги)

    def quantity_display(self, obj):
        """Отображает количество с единицей измерения."""
        return f"{int(obj.quantity)} {obj.unit}"

    quantity_display.short_description = 'Количество'
    quantity_display.admin_order_field = 'quantity'

    def quantity_status(self, obj):
        """Цветовой индикатор статуса остатка."""
        status, text = obj.get_quantity_status()
        colors = {'danger': 'red', 'warning': 'orange', 'success': 'green'}
        color = colors.get(status, 'black')
        return format_html('<span style="color: {}; font-weight: bold;">{}</span>', color, text)

    quantity_status.short_description = 'Статус'
    quantity_status.admin_order_field = 'quantity'