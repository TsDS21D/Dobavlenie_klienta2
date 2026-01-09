# calculator/admin.py
"""
Настройка административного интерфейса Django для приложения Calculator.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models_list_proschet import Proschet, PrintComponent, AdditionalWork


class PrintComponentInline(admin.TabularInline):
    """
    Inline-форма для редактирования Компонентов печати.
    """
    model = PrintComponent
    extra = 1
    min_num = 0
    max_num = None
    
    # ИЗМЕНЕНИЕ: Убираем price_per_sheet из полей редактирования
    fields = [
        'circulation_display',
        'printer',
        'price_per_sheet',
        # 'is_price_calculated_display',  # ДОБАВЛЕНО: Информация о расчете цены
        'printing_cost_display',
        'paper',
        'material_price_display',
        'sheet_count',
        'material_cost_display',
        'total_circulation_price_display',
    ]
    
    exclude = ['number', 'created_at', 'is_deleted']
    
    # ИЗМЕНЕНИЕ: Добавляем price_per_sheet в поля только для чтения
    readonly_fields = [
        'circulation_display',
        'material_price_display',
        'printing_cost_display',
        'material_cost_display',
        'total_circulation_price_display',
        'is_price_calculated_display',  # Поле только для чтения
        'price_per_sheet',  # ДОБАВЛЕНО: Делаем поле только для чтения
        'sheet_count'
    ]
    
    verbose_name = 'Компонент печати'
    verbose_name_plural = 'Компоненты печати'
    
    autocomplete_fields = ['printer', 'paper']
    
    # ИЗМЕНЕНИЕ: Удаляем метод get_formset, так как поле price_per_sheet теперь только для чтения
    # и начальное значение устанавливать не нужно
    
    def circulation_display(self, obj):
        """
        Отображает тираж из связанного просчёта.
        Это поле только для чтения, так как тираж берется из просчёта.
        """
        if obj and obj.proschet:
            # Возвращаем отформатированный тираж с разделителями тысяч
            return obj.formatted_circulation_display
        return "---"  # Если компонент не связан с просчётом
    
    circulation_display.short_description = 'Тираж из просчёта:'
    
    def is_price_calculated_display(self, obj):
        """
        Отображает информацию о том, была ли цена рассчитана автоматически.
        """
        if obj and obj.pk:
            if obj.is_price_calculated:
                return format_html(
                    '<span style="color: #0B8661; font-weight: bold;">✓ Рассчитана автоматически</span>'
                )
            else:
                return format_html(
                    '<span style="color: #d35400; font-weight: bold;">✗ Установлена вручную</span>'
                )
        return "---"
    
    is_price_calculated_display.short_description = 'Расчет цены:'
    
    def material_price_display(self, obj):
        """
        Отображает цену за единицу из выбранного материала.
        """
        if obj and obj.paper:
            return obj.formatted_material_price
        return "— Выберите материал —"
    
    material_price_display.short_description = 'Цена материала за единицу:'
    
    def printing_cost_display(self, obj):
        """
        Отображает стоимость печати для тиража.
        """
        if obj.pk and obj.price_per_sheet is not None:
            return obj.formatted_printing_cost_for_circulation
        return "0.00 ₽"
    
    printing_cost_display.short_description = 'Стоимость печати для тиража:'
    
    def material_cost_display(self, obj):
        """
        Отображает стоимость материала для тиража.
        """
        if obj.pk and obj.paper:
            return obj.formatted_material_cost_for_circulation
        return "0.00 ₽"
    
    material_cost_display.short_description = 'Стоимость материала для тиража:'
    
    def total_circulation_price_display(self, obj):
        """
        Отображает общую цену за тираж.
        """
        if obj.pk:
            return obj.formatted_total_circulation_price
        return "0.00 ₽"
    
    total_circulation_price_display.short_description = 'Общая цена за тираж:'


class AdditionalWorkInline(admin.TabularInline):
    """
    Inline-форма для редактирования Дополнительных работ.
    """
    model = AdditionalWork
    extra = 1
    min_num = 0
    max_num = None
    
    fields = ['title', 'price', 'is_deleted']
    exclude = ['number', 'created_at']
    
    verbose_name = 'Дополнительная работа'
    verbose_name_plural = 'Дополнительные работы'

    # ДОБАВЛЕНО: Поле is_deleted доступно только для чтения
    readonly_fields = ['is_deleted']


@admin.register(Proschet)
class ProschetAdmin(admin.ModelAdmin):
    """
    Административный класс для модели Proschet.
    """
    
    list_display = [
        'number',
        'title',
        'circulation',  # Отображение тиража в списке
        'client',
        'formatted_total_price',
        'created_at',
        'is_deleted',
    ]
    
    list_filter = [
        'is_deleted',
        'created_at',
        'client',
        'circulation',  # Фильтр по тиражу
    ]
    
    search_fields = [
        'number',
        'title',
        'client__name',
        'client__client_number',
    ]
    
    inlines = [
        PrintComponentInline,
        AdditionalWorkInline,
    ]
    
    fields = [
        'number',
        'title',
        'circulation',  # Поле тиража в форме редактирования
        'client',
        'formatted_total_price_display',
        'created_at',
        'is_deleted',
    ]
    
    readonly_fields = ['number', 'created_at', 'formatted_total_price_display']
    
    autocomplete_fields = ['client']
    
    # ИСПРАВЛЕНИЕ: Добавляем значение по умолчанию для формы
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        # Устанавливаем начальное значение для circulation (тираж)
        form.base_fields['circulation'].initial = 1
        return form
    
    def formatted_total_price(self, obj):
        return obj.formatted_total_price
    
    formatted_total_price.short_description = 'Общая стоимость'
    
    def formatted_total_price_display(self, obj):
        if obj.pk:
            return format_html("<strong style='font-size: 16px; color: #d35400;'>{}</strong>", 
                             obj.formatted_total_price)
        return "Будет рассчитано после сохранения"
    
    formatted_total_price_display.short_description = 'Общая стоимость'


@admin.register(PrintComponent)
class PrintComponentAdmin(admin.ModelAdmin):
    """
    Административный класс для модели PrintComponent.
    """
    
    # ИЗМЕНЕНИЕ: Добавляем отображение информации о расчете цены
    list_display = [
        'number',
        'circulation_display',
        'printer',
        'paper',
        'material_price_display',
        'sheet_count',
        'price_per_sheet_display',
        'is_price_calculated_display',  # ДОБАВЛЕНО: Информация о расчете
        'printing_cost_display',
        'material_cost_display',
        'total_circulation_price_display',
        'proschet',
        'created_at',
    ]
    
    list_filter = [
        'printer',
        'paper',
        'proschet',
        'is_price_calculated',  # ДОБАВЛЕНО: Фильтр по способу расчета
        'created_at',
    ]
    
    search_fields = [
        'number',
        'printer__name',
        'paper__name',
        'proschet__number',
    ]
    
    # ИЗМЕНЕНИЕ: Добавляем price_per_sheet в поля только для чтения
    readonly_fields = [
        'number', 
        'created_at', 
        'circulation_display',
        'material_price_display',
        'printing_cost_display',
        'material_cost_display',
        'total_circulation_price_display',
        'is_price_calculated_display',  # Поле только для чтения
        'price_per_sheet',  # ДОБАВЛЕНО: Делаем поле только для чтения
    ]
    
    autocomplete_fields = ['proschet', 'printer', 'paper']
    
    # ИЗМЕНЕНИЕ: Добавляем информацию о расчете цены в fieldsets
    fieldsets = [
        ('Основная информация', {
            'fields': [
                'number',
                'proschet',
                'circulation_display',
                'printer',
                'paper',
                'is_price_calculated_display',  # ДОБАВЛЕНО: Информация о расчете
                'created_at',
            ]
        }),
        ('Расчет стоимости', {
            'fields': [
                'material_price_display',
                'sheet_count',
                # ИСКЛЮЧЕНО: 'price_per_sheet', - теперь поле только для чтения
                'printing_cost_display',
                'material_cost_display',
                'total_circulation_price_display',
            ]
        }),
    ]
    
    # ДОБАВЛЕНО: Метод для отображения информации о расчете цены
    def is_price_calculated_display(self, obj):
        """
        Отображает информацию о том, была ли цена рассчитана автоматически.
        """
        if obj and obj.pk:
            if obj.is_price_calculated:
                return format_html(
                    '<span style="color: #0B8661; font-weight: bold;">✓ Рассчитана автоматически</span><br>'
                    '<small>На основе справочника цен для тиража {}</small>'.format(
                        obj.formatted_circulation_display
                    )
                )
            else:
                return format_html(
                    '<span style="color: #d35400; font-weight: bold;">✗ Установлена вручную</span><br>'
                    '<small>Не рассчитана по справочнику цен</small>'
                )
        return "---"
    
    is_price_calculated_display.short_description = 'Способ расчета цены:'
    
    # ДОБАВЛЕНО: Action для пересчета цен
    actions = ['recalculate_prices']
    
    def recalculate_prices(self, request, queryset):
        """
        Пересчитывает цены для выбранных компонентов печати.
        """
        updated_count = 0
        failed_count = 0
        
        for component in queryset:
            success, message = component.recalculate_price()
            if success:
                updated_count += 1
            else:
                failed_count += 1
        
        if updated_count > 0:
            self.message_user(request, f"Успешно пересчитано {updated_count} цен")
        if failed_count > 0:
            self.message_user(request, f"Не удалось пересчитать {failed_count} цен", level='warning')
    
    recalculate_prices.short_description = "Пересчитать цены на основе справочника"
    
    # ИЗМЕНЕНИЕ: Удаляем метод get_form, так как поле price_per_sheet теперь только для чтения
    # и начальное значение устанавливать не нужно
    
    def circulation_display(self, obj):
        """
        Отображает тираж из связанного просчёта.
        """
        return obj.circulation_display
    
    circulation_display.short_description = 'Тираж'
    
    def material_price_display(self, obj):
        return obj.formatted_material_price
    
    material_price_display.short_description = 'Цена материала'
    
    def price_per_sheet_display(self, obj):
        return obj.formatted_price_per_sheet
    
    price_per_sheet_display.short_description = 'Цена печати за лист'
    
    def printing_cost_display(self, obj):
        return obj.formatted_printing_cost_for_circulation
    
    printing_cost_display.short_description = 'Стоимость печати'
    
    def material_cost_display(self, obj):
        return obj.formatted_material_cost_for_circulation
    
    material_cost_display.short_description = 'Стоимость материала'
    
    def total_circulation_price_display(self, obj):
        return obj.formatted_total_circulation_price
    
    total_circulation_price_display.short_description = 'Общая цена'


@admin.register(AdditionalWork)
class AdditionalWorkAdmin(admin.ModelAdmin):
    """
    Административный класс для модели AdditionalWork.
    """
    
    list_display = [
        'number',
        'title',
        'price',
        'proschet',
        'created_at',
        'is_deleted',  # ДОБАВЛЕНО: Показывать статус удаления
    ]
    
    list_filter = [
        'title',
        'proschet',
        'created_at',
        'is_deleted',  # ДОБАВЛЕНО: Фильтр по статусу удаления
    ]
    
    search_fields = [
        'number',
        'title',
        'proschet__number',
    ]
    
    readonly_fields = ['number', 'created_at']
    
    autocomplete_fields = ['proschet']


    # ДОБАВЛЕНО: Метод для цветового отображения статуса удаления
    def is_deleted_display(self, obj):
        """
        Отображает статус удаления с цветовым оформлением.
        """
        if obj.is_deleted:
            return format_html(
                '<span style="color: #e74c3c; font-weight: bold;">'
                '<i class="fas fa-trash-alt"></i> Удалён'
                '</span>'
            )
        else:
            return format_html(
                '<span style="color: #27ae60; font-weight: bold;">'
                '<i class="fas fa-check-circle"></i> Активен'
                '</span>'
            )
    
    is_deleted_display.short_description = 'Статус'
    
    # ДОБАВЛЕНО: Actions для мягкого удаления/восстановления
    actions = ['mark_as_deleted', 'restore_deleted']
    
    def mark_as_deleted(self, request, queryset):
        """
        Помечает выбранные работы как удаленные.
        """
        updated_count = queryset.update(is_deleted=True)
        self.message_user(
            request, 
            f"Помечено как удалённые: {updated_count} работ",
            level='success'
        )
    
    mark_as_deleted.short_description = "Пометить как удалённые"
    
    def restore_deleted(self, request, queryset):
        """
        Восстанавливает выбранные работы из удаления.
        """
        updated_count = queryset.update(is_deleted=False)
        self.message_user(
            request, 
            f"Восстановлено: {updated_count} работ",
            level='success'
        )
    
    restore_deleted.short_description = "Восстановить удалённые"