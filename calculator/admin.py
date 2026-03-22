# calculator/admin.py
"""
Настройка административного интерфейса Django для приложения Calculator.
ИЗМЕНЕНИЯ: 
- В AdditionalWorkInline и AdditionalWorkAdmin убрано поле proschet, добавлено print_component.
- Обновлены list_display и методы.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models_list_proschet import Proschet, PrintComponent, AdditionalWork


class PrintComponentInline(admin.TabularInline):
    """Inline-форма для редактирования Компонентов печати внутри просчёта."""
    model = PrintComponent
    extra = 1
    min_num = 0
    max_num = None

    fields = [
        'circulation_display',
        'printer',
        'price_per_sheet',
        'printing_cost_display',
        'paper',
        'material_price_display',
        'sheet_count',
        'material_cost_display',
        'total_circulation_price_display',
    ]
    exclude = ['number', 'created_at', 'is_deleted']
    readonly_fields = [
        'circulation_display',
        'material_price_display',
        'printing_cost_display',
        'material_cost_display',
        'total_circulation_price_display',
        'is_price_calculated_display',
        'price_per_sheet',
        'sheet_count'
    ]
    verbose_name = 'Компонент печати'
    verbose_name_plural = 'Компоненты печати'
    autocomplete_fields = ['printer', 'paper']

    def circulation_display(self, obj):
        if obj and obj.proschet:
            return obj.formatted_circulation
        return "---"
    circulation_display.short_description = 'Тираж из просчёта:'

    def is_price_calculated_display(self, obj):
        if obj and obj.pk:
            if obj.is_price_calculated:
                return format_html('<span style="color: #0B8661; font-weight: bold;">✓ Рассчитана автоматически</span>')
            else:
                return format_html('<span style="color: #d35400; font-weight: bold;">✗ Установлена вручную</span>')
        return "---"
    is_price_calculated_display.short_description = 'Расчет цены:'

    def material_price_display(self, obj):
        if obj and obj.paper:
            return obj.formatted_material_price
        return "— Выберите материал —"
    material_price_display.short_description = 'Цена материала за единицу:'

    def printing_cost_display(self, obj):
        if obj.pk and obj.price_per_sheet is not None:
            return obj.formatted_printing_cost_for_circulation
        return "0.00 ₽"
    printing_cost_display.short_description = 'Стоимость печати для тиража:'

    def material_cost_display(self, obj):
        if obj.pk and obj.paper:
            return obj.formatted_material_cost_for_circulation
        return "0.00 ₽"
    material_cost_display.short_description = 'Стоимость материала для тиража:'

    def total_circulation_price_display(self, obj):
        if obj.pk:
            return obj.formatted_total_circulation_price
        return "0.00 ₽"
    total_circulation_price_display.short_description = 'Общая цена за тираж:'


class AdditionalWorkInline(admin.TabularInline):
    """Inline-форма для дополнительных работ (теперь внутри печатного компонента)."""
    model = AdditionalWork
    extra = 1
    min_num = 0
    max_num = None
    fields = ['title', 'price', 'is_deleted']
    exclude = ['number', 'created_at']
    verbose_name = 'Дополнительная работа'
    verbose_name_plural = 'Дополнительные работы'
    readonly_fields = ['is_deleted']


@admin.register(Proschet)
class ProschetAdmin(admin.ModelAdmin):
    """Административный класс для модели Proschet."""
    list_display = [
        'number',
        'title',
        'circulation',
        'client',
        'formatted_total_price',
        'created_at',
        'is_deleted',
    ]
    list_filter = ['is_deleted', 'created_at', 'client', 'circulation']
    search_fields = ['number', 'title', 'client__name', 'client__client_number']
    inlines = [PrintComponentInline]   # убрали AdditionalWorkInline из просчёта
    fields = [
        'number',
        'title',
        'circulation',
        'client',
        'formatted_total_price_display',
        'created_at',
        'is_deleted',
    ]
    readonly_fields = ['number', 'created_at', 'formatted_total_price_display']
    autocomplete_fields = ['client']

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
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
    Теперь включает inline для дополнительных работ.
    """
    list_display = [
        'number',
        'circulation_display',
        'printer',
        'paper',
        'material_price_display',
        'sheet_count',
        'price_per_sheet_display',
        'is_price_calculated_display',
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
        'is_price_calculated',
        'created_at',
    ]

    search_fields = [
        'number',
        'printer__name',
        'paper__name',
        'proschet__number',
    ]

    readonly_fields = [
        'number',
        'created_at',
        'circulation_display',
        'material_price_display',
        'printing_cost_display',
        'material_cost_display',
        'total_circulation_price_display',
        'is_price_calculated_display',
        'price_per_sheet',
        'total_circulation_price',
    ]

    autocomplete_fields = ['proschet', 'printer', 'paper']

    # Добавляем inline для дополнительных работ прямо внутри компонента
    inlines = [AdditionalWorkInline]

    fieldsets = [
        ('Основная информация', {
            'fields': [
                'number',
                'proschet',
                'circulation_display',
                'printer',
                'paper',
                'is_price_calculated_display',
                'created_at',
            ]
        }),
        ('Расчет стоимости', {
            'fields': [
                'material_price_display',
                'sheet_count',
                'printing_cost_display',
                'material_cost_display',
                'total_circulation_price_display',
                'total_circulation_price',
            ]
        }),
    ]

    def circulation_display(self, obj):
        return obj.formatted_circulation
    circulation_display.short_description = 'Тираж'

    def is_price_calculated_display(self, obj):
        if obj and obj.pk:
            if obj.is_price_calculated:
                return format_html(
                    '<span style="color: #0B8661; font-weight: bold;">✓ Рассчитана автоматически</span><br>'
                    '<small>На основе справочника цен для тиража {}</small>'.format(
                        obj.formatted_circulation
                    )
                )
            else:
                return format_html(
                    '<span style="color: #d35400; font-weight: bold;">✗ Установлена вручную</span><br>'
                    '<small>Не рассчитана по справочнику цен</small>'
                )
        return "---"
    is_price_calculated_display.short_description = 'Способ расчета цены:'

    actions = ['recalculate_prices']

    def recalculate_prices(self, request, queryset):
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
    Административный класс для AdditionalWork.
    Добавлены поля cost и markup_percent в список и форму.
    """
    list_display = [
        'number',
        'title',
        'cost',
        'markup_percent',
        'price',
        'profit_per_unit',   # вычисляемое поле
        'quantity',
        'total_price',
        'print_component',
        'created_at',
        'is_deleted',
    ]
    list_filter = ['title', 'print_component', 'created_at', 'is_deleted']
    search_fields = ['number', 'title', 'print_component__number']
    readonly_fields = ['number', 'created_at', 'profit_per_unit']
    autocomplete_fields = ['print_component']

    # Добавляем вычисляемое поле для отображения прибыли на единицу
    def profit_per_unit(self, obj):
        profit = obj.price - obj.cost
        return f"{profit:.2f} ₽"
    profit_per_unit.short_description = 'Прибыль на ед.'

    def is_deleted_display(self, obj):
        if obj.is_deleted:
            return format_html(
                '<span style="color: #e74c3c; font-weight: bold;">'
                '<i class="fas fa-trash-alt"></i> Удалён</span>'
            )
        else:
            return format_html(
                '<span style="color: #27ae60; font-weight: bold;">'
                '<i class="fas fa-check-circle"></i> Активен</span>'
            )
    is_deleted_display.short_description = 'Статус'

    actions = ['mark_as_deleted', 'restore_deleted']

    def mark_as_deleted(self, request, queryset):
        updated = queryset.update(is_deleted=True)
        self.message_user(request, f"Помечено как удалённые: {updated} работ", level='success')
    mark_as_deleted.short_description = "Пометить как удалённые"

    def restore_deleted(self, request, queryset):
        updated = queryset.update(is_deleted=False)
        self.message_user(request, f"Восстановлено: {updated} работ", level='success')
    restore_deleted.short_description = "Восстановить удалённые"