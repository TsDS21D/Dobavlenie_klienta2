"""
admin.py для приложения sklad
Настройки административной панели для древовидной структуры материалов
"""

from django.contrib import admin
from django.utils.html import format_html
from mptt.admin import MPTTModelAdmin, DraggableMPTTAdmin  # Импортируем админку для деревьев
from .models import Category, Material


@admin.register(Category)
class CategoryAdmin(DraggableMPTTAdmin):
    """
    Административная панель для категорий с поддержкой drag-and-drop
    DraggableMPTTAdmin позволяет перетаскивать категории мышкой
    """
    
    # Поля, отображаемые в списке
    list_display = ('tree_actions', 'indented_title', 'get_materials_count', 'created_at')
    
    # Поле для отображения в виде дерева
    list_display_links = ('indented_title',)
    
    # Поля для поиска
    search_fields = ('name', 'description')
    
    # Поля для фильтрации
    list_filter = ('created_at',)
    
    # Поля в форме редактирования
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'parent', 'description')
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),  # Сворачиваемый раздел
        }),
    )
    
    # Только для чтения поля
    readonly_fields = ('created_at', 'updated_at')
    
    # Раскрывать узлы дерева по умолчанию
    expand_tree_by_default = True
    
    def get_materials_count(self, obj):
        """
        Отображает количество материалов в категории
        """
        return obj.materials.count()
    
    get_materials_count.short_description = 'Кол-во материалов'
    get_materials_count.admin_order_field = 'materials__count'


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    """
    Административная панель для материалов
    """
    
    # Поля в списке
    list_display = (
        'name', 
        'category', 
        'price_display', 
        'quantity_display',
        'quantity_status',
        'is_active',
        'created_at'
    )
    
    # Поля для поиска
    search_fields = ('name', 'category__name', 'notes')
    
    # Поля для фильтрации
    list_filter = (
        'category',
        'is_active',
        'created_at',
        'unit',
    )
    
    # Быстрые действия в списке
    list_editable = ('is_active',)
    
    # Разбивка на страницы
    list_per_page = 50
    
    # Расположение полей в форме редактирования
    fieldsets = (
        ('Основная информация', {
            'fields': (
                'name',
                'category',
                'price',
                'unit',
                'density',
            )
        }),
        ('Складской учет', {
            'fields': (
                'quantity',
                'min_quantity',
            )
        }),
        ('Дополнительно', {
            'fields': (
                'characteristics',
                'notes',
                'is_active',
            ),
            'classes': ('collapse',),  # Сворачиваемый раздел
        }),
        ('Системная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )
    
    # Только для чтения поля
    readonly_fields = ('created_at', 'updated_at')
    
    # Автозаполнение для некоторых полей
    autocomplete_fields = ['category']
    
    def price_display(self, obj):
        """
        Форматированное отображение цены
        """
        return f"{obj.price:.2f} руб./{obj.unit}"
    
    price_display.short_description = 'Цена'
    price_display.admin_order_field = 'price'
    
    def quantity_display(self, obj):
        """
        Форматированное отображение количества (только целые числа)
        """
        return f"{int(obj.quantity)} {obj.unit}"  # Используем int() для приведения к целому

    quantity_display.short_description = 'Количество'
    quantity_display.admin_order_field = 'quantity'
    
    def quantity_status(self, obj):
        """
        Цветовое отображение статуса количества
        """
        status, text = obj.get_quantity_status()
        colors = {
            'danger': 'red',
            'warning': 'orange',
            'success': 'green',
        }
        color = colors.get(status, 'black')
        
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color,
            text
        )
    
    quantity_status.short_description = 'Статус'
    quantity_status.admin_order_field = 'quantity'