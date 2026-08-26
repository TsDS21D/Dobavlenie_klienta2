# calculator/admin.py
"""
Настройка административного интерфейса Django для приложения Calculator.

ИЗМЕНЕНИЯ:
- В PrintComponentInline и PrintComponentAdmin убраны ссылки на удалённое поле sheet_count.
- Добавлено отображение количества листов через метод get_sheet_count() (в readonly-полях).
- Добавлен метод sheet_count_display для отображения листов в списке и форме.
- Обновлены поля в fieldsets и list_display.
- Добавлены комментарии к каждой строке для понимания новичками.
"""

from django.contrib import admin
from django.utils.html import format_html
from .models_list_proschet import Proschet, PrintComponent, AdditionalWork
from .models_lamination import Laminate


class PrintComponentInline(admin.TabularInline):
    """
    Inline-форма для редактирования Компонентов печати внутри просчёта.
    Отображается на странице редактирования просчёта.
    """

    # Указываем модель, с которой работает inline
    model = PrintComponent

    # Количество пустых форм для добавления новых компонентов
    extra = 1

    # Минимальное количество форм (0 – можно удалить все)
    min_num = 0

    # Максимальное количество форм (None – без ограничений)
    max_num = None

    # Поля, отображаемые в inline-форме (порядок важен)
    fields = [
        'circulation_display',           # Тираж из просчёта (только чтение)
        'printer',                       # Выбор принтера
        'price_per_sheet',               # Цена за лист
        'printing_cost_display',         # Стоимость печати (вычисляется)
        'paper',                         # Выбор бумаги
        'material_price_display',        # Цена материала (только чтение)
        'sheet_count_display',           # Количество листов (из вычислений, только чтение)
        'material_cost_display',         # Стоимость материала (вычисляется)
        'total_circulation_price_display', # Общая цена компонента (вычисляется)
    ]

    # Поля, исключённые из формы (не редактируются пользователем)
    exclude = ['number', 'created_at', 'is_deleted']

    # Поля только для чтения (пользователь не может их изменять)
    readonly_fields = [
        'circulation_display',
        'material_price_display',
        'printing_cost_display',
        'material_cost_display',
        'total_circulation_price_display',
        'is_price_calculated_display',
        'price_per_sheet',               # цена за лист тоже readonly (рассчитывается)
        'sheet_count_display',           # количество листов – только чтение
    ]

    # Человекочитаемые названия для inline
    verbose_name = 'Компонент печати'
    verbose_name_plural = 'Компоненты печати'

    # Автодополнение для полей со связями (удобно при большом количестве записей)
    autocomplete_fields = ['printer', 'paper']

    # ===== МЕТОДЫ ДЛЯ ОТОБРАЖЕНИЯ ВЫЧИСЛЯЕМЫХ ПОЛЕЙ =====

    def circulation_display(self, obj):
        """
        Отображает тираж из связанного просчёта.
        Если объект существует и у него есть просчёт – возвращает отформатированный тираж.
        """
        if obj and obj.proschet:
            return obj.formatted_circulation
        return "---"
    circulation_display.short_description = 'Тираж из просчёта:'

    def is_price_calculated_display(self, obj):
        """
        Отображает, была ли цена рассчитана автоматически.
        Возвращает HTML с цветным индикатором.
        """
        if obj and obj.pk:
            if obj.is_price_calculated:
                return format_html('<span style="color: #0B8661; font-weight: bold;">✓ Рассчитана автоматически</span>')
            else:
                return format_html('<span style="color: #d35400; font-weight: bold;">✗ Установлена вручную</span>')
        return "---"
    is_price_calculated_display.short_description = 'Расчет цены:'

    def material_price_display(self, obj):
        """
        Отображает цену выбранного материала (бумаги) за единицу.
        """
        if obj and obj.paper:
            return obj.formatted_material_price
        return "— Выберите материал —"
    material_price_display.short_description = 'Цена материала за единицу:'

    def printing_cost_display(self, obj):
        """
        Отображает стоимость печати для всего тиража (без учёта бумаги).
        """
        if obj.pk and obj.price_per_sheet is not None:
            return obj.formatted_printing_cost_for_circulation
        return "0.00 ₽"
    printing_cost_display.short_description = 'Стоимость печати для тиража:'

    def material_cost_display(self, obj):
        """
        Отображает стоимость материала (бумаги) для всего тиража.
        """
        if obj.pk and obj.paper:
            return obj.formatted_material_cost_for_circulation
        return "0.00 ₽"
    material_cost_display.short_description = 'Стоимость материала для тиража:'

    def total_circulation_price_display(self, obj):
        """
        Отображает общую цену компонента (печать + бумага).
        """
        if obj.pk:
            return obj.formatted_total_circulation_price
        return "0.00 ₽"
    total_circulation_price_display.short_description = 'Общая цена за тираж:'

    def sheet_count_display(self, obj):
        """
        НОВЫЙ МЕТОД: отображает количество листов из связанной записи вычислений.
        Использует метод get_sheet_count() модели PrintComponent.
        """
        if obj and obj.pk:
            sheet_count = obj.get_sheet_count()
            return f"{sheet_count:.2f}"
        return "0.00"
    sheet_count_display.short_description = 'Количество листов (из вычислений)'


class AdditionalWorkInline(admin.TabularInline):
    """
    Inline-форма для дополнительных работ внутри печатного компонента.
    """
    model = AdditionalWork
    extra = 1
    min_num = 0
    max_num = None
    fields = ['title', 'price', 'is_deleted']
    exclude = ['number', 'created_at']
    verbose_name = 'Дополнительная работа'
    verbose_name_plural = 'Дополнительные работы'
    readonly_fields = ['is_deleted']


class LaminateInline(admin.TabularInline):
    """
    Inline-форма для ламинации внутри печатного компонента.
    """
    model = Laminate
    can_delete = False
    extra = 0
    verbose_name = 'Ламинация'
    verbose_name_plural = 'Ламинации'
    fields = [
        'is_enabled', 'side', 'laminator', 'film',   # добавлено side
        'laminator_cost', 'laminator_markup', 'laminator_price',
        'film_price', 'total_price'
    ]
    readonly_fields = [
        'laminator_cost', 'laminator_markup', 'laminator_price',
        'film_price', 'total_price'
    ]
    autocomplete_fields = ['laminator', 'film']


@admin.register(Proschet)
class ProschetAdmin(admin.ModelAdmin):
    """
    Административный класс для модели Proschet (просчёт).
    """
    # Поля, отображаемые в списке просчётов
    list_display = [
        'number',
        'title',
        'circulation',
        'client',
        'formatted_total_price',
        'created_at',
        'is_deleted',
    ]

    # Фильтры в правой панели
    list_filter = ['is_deleted', 'created_at', 'client', 'circulation']

    # Поля поиска
    search_fields = ['number', 'title', 'client__name', 'client__client_number']

    # Inline-формы (печатные компоненты)
    inlines = [PrintComponentInline]

    # Поля в форме редактирования просчёта
    fields = [
        'number',
        'title',
        'circulation',
        'client',
        'formatted_total_price_display',
        'created_at',
        'is_deleted',
    ]

    # Поля только для чтения
    readonly_fields = ['number', 'created_at', 'formatted_total_price_display']

    # Автодополнение для клиента
    autocomplete_fields = ['client']

    def get_form(self, request, obj=None, **kwargs):
        """
        Устанавливает начальное значение тиража = 1 для новой формы.
        """
        form = super().get_form(request, obj, **kwargs)
        form.base_fields['circulation'].initial = 1
        return form

    def formatted_total_price(self, obj):
        """
        Отображает общую стоимость просчёта в списке.
        """
        return obj.formatted_total_price
    formatted_total_price.short_description = 'Общая стоимость'

    def formatted_total_price_display(self, obj):
        """
        Отображает общую стоимость просчёта в форме редактирования (с HTML-стилем).
        """
        if obj.pk:
            return format_html("<strong style='font-size: 16px; color: #d35400;'>{}</strong>",
                               obj.formatted_total_price)
        return "Будет рассчитано после сохранения"
    formatted_total_price_display.short_description = 'Общая стоимость'


@admin.register(PrintComponent)
class PrintComponentAdmin(admin.ModelAdmin):
    """
    Административный класс для модели PrintComponent (печатный компонент).
    ИСПРАВЛЕНИЕ: убраны ссылки на удалённое поле sheet_count,
    добавлено отображение количества листов через sheet_count_display.
    """

    # Поля, отображаемые в списке компонентов
    list_display = [
        'number',
        'circulation_display',
        'printer',
        'paper',
        'material_price_display',
        'sheet_count_display',          # НОВОЕ: отображение листов
        'price_per_sheet_display',
        'is_price_calculated_display',
        'printing_cost_display',
        'material_cost_display',
        'total_circulation_price_display',
        'proschet',
        'created_at',
    ]

    # Фильтры
    list_filter = [
        'printer',
        'paper',
        'proschet',
        'is_price_calculated',
        'created_at',
    ]

    # Поля поиска
    search_fields = [
        'number',
        'printer__name',
        'paper__name',
        'proschet__number',
    ]

    # Поля только для чтения
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
        'sheet_count_display',          # НОВОЕ: только для чтения
    ]

    # Автодополнение для связей
    autocomplete_fields = ['proschet', 'printer', 'paper']

    # Inline-формы для дополнительных работ и ламинации
    inlines = [AdditionalWorkInline, LaminateInline]

    # Группировка полей в форме редактирования
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
                'sheet_count_display',          # вместо sheet_count
                'printing_cost_display',
                'material_cost_display',
                'total_circulation_price_display',
                'total_circulation_price',
            ]
        }),
    ]

    # ===== МЕТОДЫ ДЛЯ ОТОБРАЖЕНИЯ =====

    def circulation_display(self, obj):
        """Отображает тираж из связанного просчёта."""
        return obj.formatted_circulation
    circulation_display.short_description = 'Тираж'

    def is_price_calculated_display(self, obj):
        """
        Отображает способ расчёта цены (автоматический или ручной).
        Возвращает HTML с пояснением.
        """
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

    def sheet_count_display(self, obj):
        """
        НОВЫЙ МЕТОД: отображает количество листов из связанной записи вычислений.
        Использует метод get_sheet_count() модели PrintComponent.
        """
        if obj and obj.pk:
            sheet_count = obj.get_sheet_count()
            return f"{sheet_count:.2f}"
        return "0.00"
    sheet_count_display.short_description = 'Количество листов (из вычислений)'

    def material_price_display(self, obj):
        """Отображает цену материала (бумаги) за единицу."""
        return obj.formatted_material_price
    material_price_display.short_description = 'Цена материала'

    def price_per_sheet_display(self, obj):
        """Отображает цену печати за один лист."""
        return obj.formatted_price_per_sheet
    price_per_sheet_display.short_description = 'Цена печати за лист'

    def printing_cost_display(self, obj):
        """Отображает стоимость печати для всего тиража."""
        return obj.formatted_printing_cost_for_circulation
    printing_cost_display.short_description = 'Стоимость печати'

    def material_cost_display(self, obj):
        """Отображает стоимость материала для всего тиража."""
        return obj.formatted_material_cost_for_circulation
    material_cost_display.short_description = 'Стоимость материала'

    def total_circulation_price_display(self, obj):
        """Отображает общую стоимость компонента (печать + материал)."""
        return obj.formatted_total_circulation_price
    total_circulation_price_display.short_description = 'Общая цена'

    # ===== ДЕЙСТВИЯ (ACTIONS) =====
    actions = ['recalculate_prices']

    def recalculate_prices(self, request, queryset):
        """
        Действие для пересчёта цен выбранных компонентов на основе справочника.
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


@admin.register(AdditionalWork)
class AdditionalWorkAdmin(admin.ModelAdmin):
    """
    Административный класс для AdditionalWork (дополнительные работы).
    Добавлены поля cost и markup_percent в список и форму.
    """

    # Поля, отображаемые в списке
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

    # Фильтры
    list_filter = ['title', 'print_component', 'created_at', 'is_deleted']

    # Поля поиска
    search_fields = ['number', 'title', 'print_component__number']

    # Поля только для чтения
    readonly_fields = ['number', 'created_at', 'profit_per_unit']

    # Автодополнение для печатного компонента
    autocomplete_fields = ['print_component']

    # Вычисляемое поле для отображения прибыли на единицу
    def profit_per_unit(self, obj):
        profit = obj.price - obj.cost
        return f"{profit:.2f} ₽"
    profit_per_unit.short_description = 'Прибыль на ед.'

    # Отображение статуса удаления с иконкой
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

    # Действия (actions)
    actions = ['mark_as_deleted', 'restore_deleted']

    def mark_as_deleted(self, request, queryset):
        """Помечает выбранные работы как удалённые."""
        updated = queryset.update(is_deleted=True)
        self.message_user(request, f"Помечено как удалённые: {updated} работ", level='success')
    mark_as_deleted.short_description = "Пометить как удалённые"

    def restore_deleted(self, request, queryset):
        """Восстанавливает удалённые работы."""
        updated = queryset.update(is_deleted=False)
        self.message_user(request, f"Восстановлено: {updated} работ", level='success')
    restore_deleted.short_description = "Восстановить удалённые"