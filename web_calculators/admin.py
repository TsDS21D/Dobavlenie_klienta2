# web_calculators/admin.py
"""
Административная панель для приложения "Веб-калькуляторы для сайтов".

Используется django-nested-admin, чтобы на одной странице редактировать:
    Веб-калькулятор
      └── Компонент (принтер, бумаги, плёнки, работы, диапазон размеров)
            └── Пресеты размеров

Это визуально совпадает с админкой справочника шаблонов — единый подход.

M2M-поля (allowed_papers, allowed_films, allowed_works) отображаются
через filter_horizontal — это два списка с фильтром по центру, удобнее,
чем обычный Ctrl-выбор.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
from django.contrib import admin                              # Базовый модуль админки
from nested_admin import (                                    # Вложенные inlines
    NestedModelAdmin,
    NestedStackedInline,
    NestedTabularInline,
)

# ===== ИМПОРТЫ НАШИХ МОДЕЛЕЙ =====
from .models import (
    WebCalculator,
    WebCalculatorCirculationPreset,
    WebCalculatorComponent,
    WebCalculatorComponentWork,
    WebCalculatorSizePreset,
)


# ============================================================================
# INLINE-ФОРМЫ
# ============================================================================

class WebCalculatorSizePresetInline(NestedTabularInline):
    """
    Inline пресетов размеров внутри компонента.
    Tabular — пресеты удобнее видеть таблицей: их обычно несколько.
    """
    model = WebCalculatorSizePreset
    extra = 1                                                    # одна пустая строка для быстрого добавления
    fields = ('order', 'width_mm', 'height_mm', 'label')         # какие поля показывать
    ordering = ('order', 'width_mm', 'height_mm')                # порядок по умолчанию
    verbose_name = 'Пресет размера'
    verbose_name_plural = 'Пресеты размеров'


class WebCalculatorComponentWorkInline(NestedTabularInline):
    """
    Inline списка работ внутри компонента.
    Tabular — работы удобнее видеть таблицей.

    Колонка «Всегда включена» — флаг is_always_on.
    Если он включён — работа не показывается галочкой в калькуляторе,
    но всегда участвует в расчёте.
    """
    model = WebCalculatorComponentWork
    extra = 1
    fields = ('order', 'work', 'trigger', 'preview_effect')
    ordering = ('order', 'id')
    autocomplete_fields = ('work',)
    verbose_name = 'Работа'
    verbose_name_plural = 'Работы'




class WebCalculatorComponentInline(NestedStackedInline):
    """
    Inline одного печатного компонента внутри веб-калькулятора.
    К нему подключается inline пресетов размеров.

    Stacked (вертикально) — потому что у компонента много полей,
    таблица была бы неудобной.
    """
    model = WebCalculatorComponent
    extra = 1                                                    # одна пустая форма при создании
    verbose_name = 'Компонент'
    verbose_name_plural = 'Компоненты'
    # Вкладываем пресеты размеров внутрь каждого компонента.
    inlines = [WebCalculatorComponentWorkInline, WebCalculatorSizePresetInline]
    # M2M-поля — через два списка с фильтром.
    filter_horizontal = ('allowed_papers', 'allowed_films')

    # Группировка полей внутри компонента для читаемости.
    fieldsets = (
        ('Основное', {
            'fields': ('name', 'order', 'printer'),
        }),
        ('Доступные комбинации печати', {
            'fields': (
                'allow_color_single',
                'allow_color_duplex',
                'allow_bw_single',
                'allow_bw_duplex',
            ),
        }),
        ('Бумага и ламинация', {
            'fields': (
                'allowed_papers',
                'lamination_enabled',
                'laminator',
                'allow_lamination_single',
                'allow_lamination_duplex',
                'allowed_films',
            ),
        }),
        ('Дополнительные работы', {
            'fields': (),
            'description': 'Работы добавляются в инлайн-таблице ниже. '
                           'Отметьте «Всегда включена» для работ, которые '
                           'всегда входят в стоимость.',
        }),
        ('Размеры', {
            'fields': (
                ('min_width_mm', 'max_width_mm'),
                ('min_height_mm', 'max_height_mm'),
            ),
        }),
        ('Скрепление (только для многостраничных)', {
            'fields': (
                'binding',
                'allow_booklet_portrait',
                'allow_booklet_landscape',
                'min_pages',
                'max_pages',
            ),
            'classes': ('collapse',),
            'description': 'Заполняется только у компонента-обложки в многостраничных калькуляторах',
        }),
    )

class WebCalculatorCirculationPresetInline(NestedTabularInline):
    """
    Inline пресетов тиража внутри веб-калькулятора.
    Tabular — пресеты удобнее видеть таблицей.
    """
    model = WebCalculatorCirculationPreset
    extra = 1
    fields = ('order', 'value')
    ordering = ('order', 'value')
    verbose_name = 'Пресет тиража'
    verbose_name_plural = 'Пресеты тиража'

# ============================================================================
# РЕГИСТРАЦИЯ: ВЕБ-КАЛЬКУЛЯТОР
# ============================================================================

@admin.register(WebCalculator)
class WebCalculatorAdmin(NestedModelAdmin):
    """
    Главный админ веб-калькулятора.
    Здесь редактируется всё: сам калькулятор, его компоненты и их пресеты.
    """
    list_display = (
        'name',
        'slug',
        'product_type',
        'min_circulation',
        'max_circulation',
        'components_count',
        'is_active',
        'order',
        'updated_at',
        'preview_link',
    )
    list_filter = ('product_type', 'is_active', 'created_at')
    search_fields = ('name', 'slug', 'comment')
    list_editable = ('order', 'is_active')                       # быстрая правка прямо из списка
    readonly_fields = ('created_at', 'updated_at')
    prepopulated_fields = {'slug': ('name',)}                    # slug автоматически из названия
    inlines = [WebCalculatorCirculationPresetInline, WebCalculatorComponentInline]

    fieldsets = (
        ('Основное', {
            'fields': ('name', 'slug', 'product_type', 'comment', 'order', 'is_active'),
        }),
        ('Тираж', {
            'fields': (
                'min_circulation',
                'max_circulation',
                'circulation_step',
                'default_circulation',
            ),
        }),
        ('Служебная информация', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    def components_count(self, obj):
        """Сколько печатных компонентов в калькуляторе — удобно видеть сразу в списке."""
        return obj.components.count()
    components_count.short_description = 'Компонентов'

    def preview_link(self, obj):
        """
        Возвращает HTML-ссылку на публичную страницу этого калькулятора.
        Открывается в новой вкладке.
        """
        from django.urls import reverse
        from django.utils.html import format_html

        # Если у калькулятора ещё нет slug — ссылку не строим.
        if not obj.slug:
            return '—'

        try:
            url = reverse('web_calculators:calculator', args=[obj.slug])
        except Exception:
            return '—'

        return format_html(
            '<a href="{}" target="_blank" rel="noopener" '
            'style="padding: 2px 8px; background: #0B8661; color: white; '
            'border-radius: 4px; text-decoration: none; font-size: 12px;">'
            'Открыть</a>',
            url,
        )
    preview_link.short_description = 'Просмотр'



# ============================================================================
# РЕГИСТРАЦИЯ: ОТДЕЛЬНЫЕ АДМИНКИ ДЛЯ ПОИСКА
# ============================================================================

@admin.register(WebCalculatorComponent)
class WebCalculatorComponentAdmin(admin.ModelAdmin):
    """
    Отдельная админка компонентов — для быстрого поиска
    («в каких калькуляторах используется этот принтер»).
    """
    list_display = (
        'id', 'calculator', 'name', 'order', 'printer', 'binding', 'laminator',
    )
    list_filter = ('calculator', 'printer', 'binding')
    search_fields = ('name', 'calculator__name', 'calculator__slug', 'printer__name')
    filter_horizontal = ('allowed_papers', 'allowed_films')
    inlines = [WebCalculatorComponentWorkInline]
    autocomplete_fields = ('printer', 'binding')


@admin.register(WebCalculatorSizePreset)
class WebCalculatorSizePresetAdmin(admin.ModelAdmin):
    """
    Отдельная админка пресетов размеров — для массового просмотра.
    """
    list_display = ('id', 'component', 'width_mm', 'height_mm', 'label', 'order')
    list_filter = ('component__calculator',)
    search_fields = ('label', 'component__name', 'component__calculator__name')
    autocomplete_fields = ('component',)


@admin.register(WebCalculatorComponentWork)
class WebCalculatorComponentWorkAdmin(admin.ModelAdmin):
    """
    Отдельная админка работ веб-калькуляторов — для поиска.
    """
    list_display = ('id', 'component', 'work', 'trigger', 'preview_effect', 'order')
    list_filter = ('trigger', 'preview_effect', 'work')
    search_fields = ('component__name', 'component__calculator__name', 'work__name')
    autocomplete_fields = ('component', 'work')

@admin.register(WebCalculatorCirculationPreset)
class WebCalculatorCirculationPresetAdmin(admin.ModelAdmin):
    """
    Отдельная админка пресетов тиража — для поиска и обслуживания.
    """
    list_display = ('id', 'calculator', 'value', 'order')
    list_filter = ('calculator',)
    search_fields = ('calculator__name', 'calculator__slug')
    autocomplete_fields = ('calculator',)