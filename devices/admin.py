"""
admin.py для приложения devices
Настройки административной панели Django для приложения devices
Позволяет управлять принтерами через стандартный интерфейс админки
"""

from django.contrib import admin
from .models import Printer


@admin.register(Printer)
class PrinterAdmin(admin.ModelAdmin):
    """
    Административная панель для управления принтерами
    
    Настраивает отображение и поведение модели Printer в админ-панели Django
    """
    
    # Поля, отображаемые в списке принтеров (ДОБАВЛЯЕМ devices_interpolation_method)
    list_display = ('name', 'sheet_format', 'margin_mm', 'duplex_coefficient', 
                    'devices_interpolation_method', 'created_at')
    
    # Поля для фильтрации списка (ДОБАВЛЯЕМ devices_interpolation_method)
    list_filter = ('sheet_format', 'devices_interpolation_method', 'created_at')
    
    # Поля для поиска
    search_fields = ('name', 'sheet_format__name')
    
    # Поля, которые можно редактировать прямо из списка (ДОБАВЛЯЕМ devices_interpolation_method)
    list_editable = ('margin_mm', 'duplex_coefficient', 'devices_interpolation_method')
    
    # Количество элементов на странице
    list_per_page = 20
    
    # Поля, которые будут показаны на странице редактирования (ДОБАВЛЯЕМ devices_interpolation_method)
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'sheet_format')
        }),
        ('Параметры печати', {
            'fields': ('margin_mm', 'duplex_coefficient')
        }),
        ('Метод интерполяции', {  # НОВЫЙ БЛОК
            'fields': ('devices_interpolation_method',),
            'description': 'Выберите метод интерполяции для расчета стоимости при произвольном тираже',
        }),
        ('Даты', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)  # Сворачиваемый блок
        }),
    )
    
    # Поля только для чтения
    readonly_fields = ('created_at', 'updated_at')
    
    # Автозаполнение поля slug на основе названия
    # prepopulated_fields = {'slug': ('name',)}
    
    # Порядок сортировки по умолчанию
    ordering = ('name',)
    
    def get_dimensions_display(self, obj):
        """
        Отображает размеры формата в админ-панели
        
        Args:
            obj: Объект Printer
            
        Returns:
            str: Строка с размерами
        """
        return obj.get_dimensions_display()
    
    get_dimensions_display.short_description = 'Размеры формата'
    
    def get_margin_display(self, obj):
        """
        Отображает поля в админ-панели
        
        Args:
            obj: Объект Printer
            
        Returns:
            str: Строка с полями
        """
        return obj.get_margin_display()
    
    get_margin_display.short_description = 'Поля'
    
    def get_duplex_display(self, obj):
        """
        Отображает коэффициент в админ-панели
        
        Args:
            obj: Объект Printer
            
        Returns:
            str: Строка с коэффициентом
        """
        return obj.get_duplex_display()
    
    get_duplex_display.short_description = 'Коэффициент'
    
    def devices_interpolation_method_display(self, obj):
        """
        НОВЫЙ МЕТОД: Отображает метод интерполяции в админ-панели
        
        Args:
            obj: Объект Printer
            
        Returns:
            str: Строка с методом интерполяции
        """
        return obj.get_interpolation_method_display_short()
    
    devices_interpolation_method_display.short_description = 'Интерполяция'