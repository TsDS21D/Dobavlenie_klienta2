"""
Файл multipage_admin.py – настройка админки для многостраничных моделей.
Исправлено: добавлено поле is_active в отображение.
"""

# Импортируем модуль admin из Django для регистрации моделей
from django.contrib import admin

# Импортируем наши модели из multipage_models
from .multipage_models import MultipageBinding, VichisliniyaMultipageModel


@admin.register(MultipageBinding)
class MultipageBindingAdmin(admin.ModelAdmin):
    """
    Настройка отображения способов скрепления в админке.
    """
    # Поля, отображаемые в списке записей
    list_display = ['name', 'page_multiple', 'paper_coefficient', 'order']
    # Поля, которые можно редактировать прямо в списке (inline-редактирование)
    list_editable = ['page_multiple', 'paper_coefficient', 'order']
    # Поля, по которым можно искать
    search_fields = ['name', 'description']
    # Сортировка по умолчанию
    ordering = ['order', 'name']


@admin.register(VichisliniyaMultipageModel)
class VichisliniyaMultipageModelAdmin(admin.ModelAdmin):
    """
    Настройка отображения многостраничных вычислений в админке.
    """
    # Поля, отображаемые в списке записей
    list_display = [
        'print_component',           # Печатный компонент
        'binding',                   # Способ скрепления
        'total_pages',               # Общее количество страниц
        'fit_total',                 # Страниц на листе (рассчитывается автоматически)
        'sheet_count',               # Количество печатных листов
        'copies',                    # Количество экземпляров (тираж)
        'color',                     # Цветность
        'is_active',                 # НОВОЕ: активен ли многостраничный режим
        'updated_at',                # Дата последнего обновления
    ]
    
    # Поля для фильтрации в правой боковой панели
    list_filter = ['binding', 'color', 'is_active', 'created_at']
    
    # Поля для поиска (по номеру печатного компонента или номеру просчёта)
    search_fields = ['print_component__number', 'print_component__proschet__number']
    
    # Поля только для чтения (автоматически вычисляемые)
    readonly_fields = ['sheet_count', 'created_at', 'updated_at']
    
    # Группировка полей в форме редактирования
    fieldsets = (
        ('Связь с печатным компонентом', {
            'fields': ('print_component',)
        }),
        ('Параметры брошюры', {
            'fields': (
                'binding',
                'total_pages',
                'copies',
                'finished_width',
                'finished_height'
            )
        }),
        ('Параметры печати', {
            'fields': ('color', 'vyleta')
        }),
        # Поля размещения страниц на листе (автоматически рассчитываются)
        ('Размещение страниц на листе', {
            'fields': (
                'fit_horizontal',
                'fit_vertical',
                'fit_total',
                'fit_landscape_total',
                'fit_portrait_total',
                'fit_selected_orientation'
            ),
            'classes': ('collapse',),  # Группа свёрнута по умолчанию
            'description': 'Эти поля рассчитываются автоматически на основе размеров страницы, зазора и формата листа'
        }),
        ('Результаты расчёта', {
            'fields': ('sheet_count',)
        }),
        ('Режим', {
            'fields': ('is_active',),   # НОВАЯ ГРУППА
            'description': 'Активен ли многостраничный режим для данного компонента'
        }),
        ('Служебная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )