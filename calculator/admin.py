# calculator/admin.py
"""
Настройка административного интерфейса Django для приложения Calculator.

ИСПРАВЛЕНИЯ:
1. Во всех методах, отображающих тираж, вместо obj.formatted_circulation_display
   и obj.circulation_display используется obj.formatted_circulation (добавлено в модель).
2. В методе is_price_calculated_display убрано обращение к obj.formatted_circulation_display,
   теперь используется obj.formatted_circulation.
3. Действие recalculate_prices теперь корректно вызывает component.recalculate_price().
4. Все комментарии расширены для новичков.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models_list_proschet import Proschet, PrintComponent, AdditionalWork


class PrintComponentInline(admin.TabularInline):
    """
    Inline-форма для редактирования Компонентов печати внутри просчёта.
    """
    model = PrintComponent
    extra = 1
    min_num = 0
    max_num = None

    fields = [
        'circulation_display',      # Отображение тиража (только чтение)
        'printer',
        'price_per_sheet',          # Только для чтения – авторасчёт
        'printing_cost_display',
        'paper',
        'material_price_display',
        'sheet_count',              # Количество листов (только чтение в админке)
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
        'price_per_sheet',          # Запрещаем ручное редактирование
        'sheet_count'              # Количество листов тоже только для чтения
    ]

    verbose_name = 'Компонент печати'
    verbose_name_plural = 'Компоненты печати'
    autocomplete_fields = ['printer', 'paper']

    # ---------- ИСПРАВЛЕНИЕ: используем obj.formatted_circulation ----------
    def circulation_display(self, obj):
        """
        Отображает тираж из связанного просчёта.
        ИСПРАВЛЕНО: вместо obj.formatted_circulation_display используем obj.formatted_circulation.
        """
        if obj and obj.proschet:
            return obj.formatted_circulation   # новое свойство модели
        return "---"

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
        """Цена за единицу выбранного материала."""
        if obj and obj.paper:
            return obj.formatted_material_price
        return "— Выберите материал —"

    material_price_display.short_description = 'Цена материала за единицу:'

    def printing_cost_display(self, obj):
        """Стоимость печати для тиража."""
        if obj.pk and obj.price_per_sheet is not None:
            return obj.formatted_printing_cost_for_circulation
        return "0.00 ₽"

    printing_cost_display.short_description = 'Стоимость печати для тиража:'

    def material_cost_display(self, obj):
        """Стоимость материала для тиража."""
        if obj.pk and obj.paper:
            return obj.formatted_material_cost_for_circulation
        return "0.00 ₽"

    material_cost_display.short_description = 'Стоимость материала для тиража:'

    def total_circulation_price_display(self, obj):
        """Общая цена за тираж."""
        if obj.pk:
            return obj.formatted_total_circulation_price
        return "0.00 ₽"

    total_circulation_price_display.short_description = 'Общая цена за тираж:'


class AdditionalWorkInline(admin.TabularInline):
    """Inline-форма для дополнительных работ."""
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
    inlines = [PrintComponentInline, AdditionalWorkInline]
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
        form.base_fields['circulation'].initial = 1   # значение по умолчанию
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

    ИСПРАВЛЕНИЯ:
    - circulation_display теперь возвращает obj.formatted_circulation.
    - is_price_calculated_display использует obj.formatted_circulation вместо несуществующего _display.
    - recalculate_prices вызывает obj.recalculate_price().
    """

    list_display = [
        'number',
        'circulation_display',          # Тираж из просчёта
        'printer',
        'paper',
        'material_price_display',
        'sheet_count',
        'price_per_sheet_display',
        'is_price_calculated_display',  # Способ расчёта
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
        'circulation_display',          # Исправлено – работает через obj.formatted_circulation
        'material_price_display',
        'printing_cost_display',
        'material_cost_display',
        'total_circulation_price_display',
        'is_price_calculated_display',
        'price_per_sheet',              # Только для чтения
    ]

    autocomplete_fields = ['proschet', 'printer', 'paper']

    fieldsets = [
        ('Основная информация', {
            'fields': [
                'number',
                'proschet',
                'circulation_display',   # Отображение тиража
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
            ]
        }),
    ]

    # ---------- ИСПРАВЛЕНИЕ: используем obj.formatted_circulation ----------
    def circulation_display(self, obj):
        """
        Отображает тираж из связанного просчёта.
        ИСПРАВЛЕНО: вместо obj.circulation_display (которого не было) используем obj.formatted_circulation.
        """
        return obj.formatted_circulation   # новое свойство модели

    circulation_display.short_description = 'Тираж'

    # ---------- ИСПРАВЛЕНИЕ: убран вызов obj.formatted_circulation_display ----------
    def is_price_calculated_display(self, obj):
        """
        Отображает информацию о том, была ли цена рассчитана автоматически.
        ИСПРАВЛЕНО: вместо obj.formatted_circulation_display используем obj.formatted_circulation.
        """
        if obj and obj.pk:
            if obj.is_price_calculated:
                return format_html(
                    '<span style="color: #0B8661; font-weight: bold;">✓ Рассчитана автоматически</span><br>'
                    '<small>На основе справочника цен для тиража {}</small>'.format(
                        obj.formatted_circulation   # работает благодаря новому свойству
                    )
                )
            else:
                return format_html(
                    '<span style="color: #d35400; font-weight: bold;">✗ Установлена вручную</span><br>'
                    '<small>Не рассчитана по справочнику цен</small>'
                )
        return "---"

    is_price_calculated_display.short_description = 'Способ расчета цены:'

    # ---------- ИСПРАВЛЕНИЕ: действие теперь вызывает recalculate_price() ----------
    actions = ['recalculate_prices']

    def recalculate_prices(self, request, queryset):
        """
        Пересчитывает цены для выбранных компонентов печати.
        ИСПРАВЛЕНО: теперь вызывает obj.recalculate_price(), который добавлен в модель.
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

    # ---------- Остальные методы (без изменений) ----------
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
    """Административный класс для AdditionalWork."""
    list_display = [
        'number',
        'title',
        'price',
        'proschet',
        'created_at',
        'is_deleted',
    ]
    list_filter = ['title', 'proschet', 'created_at', 'is_deleted']
    search_fields = ['number', 'title', 'proschet__number']
    readonly_fields = ['number', 'created_at']
    autocomplete_fields = ['proschet']

    def is_deleted_display(self, obj):
        """Цветовое отображение статуса удаления."""
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