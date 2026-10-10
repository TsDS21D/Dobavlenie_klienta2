# orders/admin.py
"""
Регистрация моделей приложения "orders" в административной панели Django.

На этом шаге — простая плоская регистрация всех моделей. Nested-inline
(редактирование компонентов с работами/ламинацией/расчётами на одной странице)
подключим отдельным шагом, если понадобится.
"""

# Импорт базового модуля админки.
from django.contrib import admin

# Импорт всех моделей приложения.
from .models import (
    Order,
    Product,
    ProductPrintComponent,
    ProductAdditionalWork,
    ProductLaminate,
    ProductVichisliniya,
    ProductMultipage,
)


# ============================================================================
# ИНЛАЙН ДЛЯ ИЗДЕЛИЯ
# ============================================================================

class ProductPrintComponentInline(admin.TabularInline):
    """
    Показываем компоненты изделия прямо на странице изделия —
    табличным списком, с возможностью быстрого просмотра.
    """
    model = ProductPrintComponent                    # Модель inline'а
    extra = 0                                        # Не предлагать пустые формы
    fields = (                                       # Какие поля показывать
        'position', 'number', 'printer', 'paper',
        'print_type', 'printing_mode',
        'sheet_count', 'total_circulation_price',
    )
    readonly_fields = (                              # Только для чтения (снимок)
        'sheet_count', 'total_circulation_price',
    )
    ordering = ('position',)                         # Сортировка


# ============================================================================
# АДМИНКА ЗАКАЗА
# ============================================================================

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    """Админка заказов: список, фильтры, поиск, счётчик изделий."""

    # Колонки в списке заказов.
    list_display = (
        'number',                # Номер заказа (ORD-N)
        'client',                # Клиент
        'products_count',        # Кол-во изделий (метод ниже)
        'created_at',            # Дата создания
        'is_deleted',            # Флаг удаления
    )

    # Фильтры в правой панели.
    list_filter = ('is_deleted', 'created_at', 'client')

    # Поля поиска.
    search_fields = ('number', 'client__name', 'client__client_number', 'comment')

    # Только для чтения.
    readonly_fields = ('number', 'created_at', 'updated_at')

    # Автодополнение по клиенту и пользователю.
    autocomplete_fields = ('client', 'created_by')

    # Сортировка.
    ordering = ('-created_at',)

    def products_count(self, obj):
        """Число изделий в заказе — выводим в списке заказов."""
        return obj.products.filter(is_deleted=False).count()
    products_count.short_description = 'Изделий'


# ============================================================================
# АДМИНКА ИЗДЕЛИЯ
# ============================================================================

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    """Админка изделий: снимок просчёта, привязан к заказу."""

    list_display = (
        'id',                    # ID
        'title',                 # Название
        'order',                 # Заказ
        'circulation',           # Тираж
        'formatted_total_price_display',   # Итоговая (замороженная) цена
        'source_proschet',       # Из какого просчёта
        'source_template',       # Из какого шаблона
        'created_at',            # Дата создания
        'is_deleted',
    )

    list_filter = ('is_deleted', 'created_at', 'order')

    search_fields = ('title', 'order__number', 'source_proschet__number')

    readonly_fields = ('created_at', 'updated_at')

    autocomplete_fields = ('order', 'source_proschet', 'source_template')

    # Inline компонентов — показываем снимок структуры.
    inlines = [ProductPrintComponentInline]

    def formatted_total_price_display(self, obj):
        """Красиво отформатированная цена."""
        return obj.formatted_total_price
    formatted_total_price_display.short_description = 'Стоимость'


# ============================================================================
# ПРОЧИЕ МОДЕЛИ-СНИМКИ — ПЛОСКАЯ РЕГИСТРАЦИЯ
# ============================================================================

@admin.register(ProductPrintComponent)
class ProductPrintComponentAdmin(admin.ModelAdmin):
    """Отдельная админка компонентов — для поиска и ручной правки."""
    list_display = (
        'id', 'number', 'product', 'position',
        'printer', 'paper', 'print_type', 'printing_mode',
        'sheet_count', 'total_circulation_price',
    )
    list_filter = ('print_type', 'printing_mode', 'printer', 'paper')
    search_fields = ('number', 'product__title', 'printer__name', 'paper__name')
    autocomplete_fields = ('product', 'printer', 'paper')


@admin.register(ProductAdditionalWork)
class ProductAdditionalWorkAdmin(admin.ModelAdmin):
    """Админка работ-снимков."""
    list_display = (
        'id', 'number', 'title', 'product_component',
        'formula_type', 'quantity', 'total_price',
    )
    list_filter = ('formula_type', 'is_deleted')
    search_fields = ('title', 'product_component__product__title', 'work__name')
    autocomplete_fields = ('product_component', 'work')


@admin.register(ProductLaminate)
class ProductLaminateAdmin(admin.ModelAdmin):
    """Админка ламинации-снимков."""
    list_display = (
        'id', 'product_component', 'is_enabled', 'side',
        'laminator', 'film', 'total_price',
    )
    list_filter = ('is_enabled', 'side')
    search_fields = ('product_component__product__title', 'laminator__name', 'film__name')
    autocomplete_fields = ('product_component', 'laminator', 'film')


@admin.register(ProductVichisliniya)
class ProductVichisliniyaAdmin(admin.ModelAdmin):
    """Админка одностраничных расчётов-снимков."""
    list_display = (
        'id', 'product_component', 'item_width', 'item_height',
        'color', 'fit_total', 'list_count',
    )
    list_filter = ('color',)
    search_fields = ('product_component__product__title',)
    autocomplete_fields = ('product_component',)


@admin.register(ProductMultipage)
class ProductMultipageAdmin(admin.ModelAdmin):
    """Админка многостраничных расчётов-снимков."""
    list_display = (
        'id', 'product_component', 'binding', 'total_pages',
        'copies', 'finished_width', 'finished_height',
        'is_active', 'sheet_count',
    )
    list_filter = ('is_active', 'binding')
    search_fields = ('product_component__product__title',)
    autocomplete_fields = ('product_component', 'binding')