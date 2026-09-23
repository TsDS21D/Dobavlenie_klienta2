# shablony_proschetov/admin.py
"""
Настройка административной панели Django для приложения
"Справочник шаблонов просчётов" (shablony_proschetov).

ИСПОЛЬЗУЕТСЯ django-nested-admin:
Он позволяет редактировать ВЛОЖЕННЫЕ inlines на одной странице:
    Шаблон
      └── Компонент (printer, paper, print_type, printing_mode)
            ├── Дополнительные работы
            ├── Ламинация
            ├── Одностраничный расчёт листов
            └── Многостраничный расчёт листов

Для этого:
- Главный админ шаблона наследуется от NestedModelAdmin.
- Все inline'ы — от NestedStackedInline / NestedTabularInline.
- Дерево категорий редактируется отдельно через MPTTModelAdmin (nested-admin не нужен).
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
from django.contrib import admin                     # Базовый модуль админки
from django.utils.html import format_html            # Безопасный HTML в списках
from mptt.admin import MPTTModelAdmin                # Админка для MPTT-дерева
from nested_admin import (                           # Пакет вложенных inlines
    NestedModelAdmin,
    NestedStackedInline,
    NestedTabularInline,
)

# ===== ИМПОРТЫ НАШИХ МОДЕЛЕЙ =====
from .models import (
    TemplateCategory,
    ProschetTemplate,
    TemplatePrintComponent,
    TemplateAdditionalWork,
    TemplateLaminate,
    TemplateVichisliniya,
    TemplateMultipage,
)


# ============================================================================
# INLINE-ФОРМЫ (вложенные блоки)
# ============================================================================

class TemplateVichisliniyaInline(NestedStackedInline):
    """
    Inline одностраничного расчёта листов внутри компонента.
    Stacked — поля вертикально, читается удобнее.
    max_num=1 и can_delete=False — потому что связь OneToOne.
    """
    model = TemplateVichisliniya
    can_delete = False
    extra = 0
    max_num = 1
    verbose_name = 'Одностраничные вычисления листов'
    verbose_name_plural = 'Одностраничные вычисления листов'


class TemplateMultipageInline(NestedStackedInline):
    """Inline многостраничного расчёта листов (брошюры)."""
    model = TemplateMultipage
    can_delete = False
    extra = 0
    max_num = 1
    verbose_name = 'Многостраничные вычисления листов'
    verbose_name_plural = 'Многостраничные вычисления листов'


class TemplateLaminateInline(NestedStackedInline):
    """Inline настроек ламинации (OneToOne к компоненту)."""
    model = TemplateLaminate
    can_delete = False
    extra = 0
    max_num = 1
    verbose_name = 'Ламинация'
    verbose_name_plural = 'Ламинация'


class TemplateAdditionalWorkInline(NestedTabularInline):
    """
    Inline списка дополнительных работ внутри компонента.
    Tabular — работы удобнее видеть таблицей, их обычно несколько.
    """
    model = TemplateAdditionalWork
    extra = 1
    verbose_name = 'Дополнительная работа'
    verbose_name_plural = 'Дополнительные работы'


class TemplatePrintComponentInline(NestedStackedInline):
    """
    Inline печатного компонента внутри шаблона.
    К нему привязаны ВЛОЖЕННЫЕ inline'ы (работы, ламинация, вычисления).
    Благодаря nested-admin вся эта структура редактируется на одной странице шаблона.
    """
    model = TemplatePrintComponent
    extra = 1
    verbose_name = 'Компонент печати'
    verbose_name_plural = 'Компоненты печати'
    # Список вложенных inline'ов. Порядок важен — так они и отобразятся.
    inlines = [
        TemplateAdditionalWorkInline,
        TemplateLaminateInline,
        TemplateVichisliniyaInline,
        TemplateMultipageInline,
    ]


# ============================================================================
# РЕГИСТРАЦИЯ: Категории (MPTT-дерево)
# ============================================================================

@admin.register(TemplateCategory)
class TemplateCategoryAdmin(MPTTModelAdmin):
    """
    Админка дерева категорий (MPTT).
    Здесь nested-admin не нужен — MPTTModelAdmin сам рисует дерево.
    """
    list_display = ('name', 'parent', 'order', 'created_at')
    list_display_links = ('name',)
    list_filter = ('parent',)
    search_fields = ('name', 'description')
    ordering = ('order', 'name')


# ============================================================================
# РЕГИСТРАЦИЯ: Шаблоны просчётов
# ============================================================================

@admin.register(ProschetTemplate)
class ProschetTemplateAdmin(NestedModelAdmin):
    """
    Главный админ шаблона. Именно здесь благодаря nested-admin
    видна вся вложенная структура: компоненты → работы, ламинация, расчёты.
    """
    list_display = (
        'name',
        'category',
        'circulation',
        'comment_short',
        'components_count',
        'created_by',
        'updated_at',
    )
    list_filter = ('category', 'created_at', 'created_by')
    search_fields = ('name', 'comment', 'category__name')
    readonly_fields = ('created_at', 'updated_at')
    autocomplete_fields = ('source_proschet',)
    inlines = [TemplatePrintComponentInline]

    fieldsets = (
        ('Основное', {
            'fields': ('name', 'category', 'comment', 'circulation')
        }),
        ('Служебная информация', {
            'fields': ('source_proschet', 'created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',),
            'description': 'Заполняется автоматически, править обычно не нужно'
        }),
    )

    def comment_short(self, obj):
        """Обрезанный комментарий — чтобы список не расползался по ширине."""
        if obj.comment:
            return obj.comment[:50] + ('…' if len(obj.comment) > 50 else '')
        return '—'
    comment_short.short_description = 'Комментарий'

    def components_count(self, obj):
        """Число печатных компонентов в шаблоне — удобно видеть сразу."""
        return format_html('<b>{}</b>', obj.components.count())
    components_count.short_description = 'Компонентов'


# ============================================================================
# РЕГИСТРАЦИЯ: Копии вложений (отдельные страницы — для поиска и обслуживания)
# ============================================================================

@admin.register(TemplatePrintComponent)
class TemplatePrintComponentAdmin(admin.ModelAdmin):
    """
    Отдельная админка компонентов шаблона.
    Здесь НЕ используем nested-admin — просто чтобы иметь быстрый поиск
    («в каких шаблонах используется меловка 350 г»).
    """
    list_display = ('id', 'template', 'order', 'printer', 'paper', 'print_type', 'printing_mode')
    list_filter = ('print_type', 'printing_mode', 'printer', 'paper')
    search_fields = ('template__name', 'printer__name', 'paper__name')
    autocomplete_fields = ('template', 'printer', 'paper')


@admin.register(TemplateAdditionalWork)
class TemplateAdditionalWorkAdmin(admin.ModelAdmin):
    """Отдельная админка работ шаблонов — для поиска и ручной правки."""
    list_display = ('id', 'title', 'template_component', 'formula_type', 'quantity', 'price')
    list_filter = ('formula_type',)
    search_fields = ('title', 'template_component__template__name', 'work__name')
    autocomplete_fields = ('template_component', 'work')


@admin.register(TemplateLaminate)
class TemplateLaminateAdmin(admin.ModelAdmin):
    """Отдельная админка ламинации шаблонов."""
    list_display = ('id', 'template_component', 'is_enabled', 'side', 'laminator', 'film')
    list_filter = ('is_enabled', 'side')
    search_fields = ('template_component__template__name', 'laminator__name', 'film__name')
    autocomplete_fields = ('template_component', 'laminator', 'film')


@admin.register(TemplateVichisliniya)
class TemplateVichisliniyaAdmin(admin.ModelAdmin):
    """Отдельная админка одностраничных вычислений шаблонов."""
    list_display = ('id', 'template_component', 'item_width', 'item_height', 'color', 'fit_total')
    list_filter = ('color',)
    search_fields = ('template_component__template__name',)
    autocomplete_fields = ('template_component',)


@admin.register(TemplateMultipage)
class TemplateMultipageAdmin(admin.ModelAdmin):
    """Отдельная админка многостраничных вычислений шаблонов."""
    list_display = (
        'id', 'template_component', 'binding', 'total_pages', 'copies',
        'finished_width', 'finished_height', 'is_active',
    )
    list_filter = ('is_active', 'binding')
    search_fields = ('template_component__template__name',)
    autocomplete_fields = ('template_component', 'binding')