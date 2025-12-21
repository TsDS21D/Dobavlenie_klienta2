"""
admin.py
Настройки административной панели Django для приложения devices.
Позволяет управлять принтерами через стандартный интерфейс админки.
"""

from django.contrib import admin
from .models import Printer


@admin.register(Printer)
class PrinterAdmin(admin.ModelAdmin):
    """
    Административная панель для управления принтерами.
    
    Настраивает отображение и поведение модели Printer в админ-панели Django.
    """
    
    # Поля, которые будут отображаться в списке принтеров
    list_display = ('name', 'sheet_format', 'width_mm', 'height_mm', 'margin_mm', 'duplex_coefficient')
    
    # Поля, по которым можно фильтровать список
    list_filter = ('sheet_format',)
    
    # Поля, по которым работает поиск
    search_fields = ('name', 'sheet_format')
    
    # Порядок сортировки по умолчанию
    ordering = ('name',)
    
    # Количество элементов на странице
    list_per_page = 20
    
    # Группировка полей в форме редактирования
    fieldsets = (
        ('Основная информация', {
            'fields': ('name',)
        }),
        ('Характеристики формата', {
            'fields': ('sheet_format', 'width_mm', 'height_mm')
        }),
        ('Дополнительные параметры', {
            'fields': ('margin_mm', 'duplex_coefficient'),
            'classes': ('collapse',)  # Группа свернута по умолчанию
        }),
    )
    
    # Действия, доступные в админ-панели
    actions = ['duplicate_printers']
    
    def duplicate_printers(self, request, queryset):
        """
        Действие: дублировать выбранные принтеры.
        Создает копии выбранных принтеров с добавлением "(копия)" к названию.
        
        Args:
            request: HTTP запрос
            queryset: Выбранные объекты Printer
        """
        for printer in queryset:
            # Создаем копию принтера
            new_printer = Printer(
                name=f"{printer.name} (копия)",
                sheet_format=printer.sheet_format,
                width_mm=printer.width_mm,
                height_mm=printer.height_mm,
                margin_mm=printer.margin_mm,
                duplex_coefficient=printer.duplex_coefficient,
            )
            new_printer.save()
        
        self.message_user(request, f'{queryset.count()} принтеров успешно дублировано.')
    
    duplicate_printers.short_description = "Дублировать выбранные принтеры"