"""
Административная панель приложения "web_orders" (Входящие заявки).
Позволяет менеджерам просматривать сырые заявки с сайта, 
менять их статусы и видеть состав корзины.
"""
from django.contrib import admin
from .models import WebOrder, WebOrderItem


class WebOrderItemInline(admin.TabularInline):
    """
    Позволяет просматривать товары (позиции) заявки 
    прямо внутри карточки WebOrder.
    """
    model = WebOrderItem
    extra = 0  # Не добавлять пустые строки по умолчанию
    # Поля только для чтения, так как это "сырой" снимок с сайта
    readonly_fields = ('name', 'count', 'price', 'property', 'total_price')


@admin.register(WebOrder)
class WebOrderAdmin(admin.ModelAdmin):
    """
    Настройка списка и карточки входящих заявок в админке.
    """
    # Колонки в общем списке заявок
    list_display = (
        'id', 
        'moguta_order_number', 
        'fio', 
        'email', 
        'phone', 
        'total_summ', 
        'status', 
        'created_at'
    )
    # Фильтры в правой панели
    list_filter = ('status', 'customer_type', 'site')
    # Поля для поиска
    search_fields = ('moguta_order_number', 'fio', 'email', 'phone')
    # Поля, которые нельзя редактировать вручную.
    # op_fields добавлен сюда по той же причине, что и raw_payload:
    # это снимок данных из Moguta, а не рабочее поле. В админке он
    # выводится как редактируемая текстовая область с JSON — если
    # менеджер случайно тронет кавычку, поле превратится в битую строку
    # и заявка перестанет разбираться. Только чтение.
    readonly_fields = ('created_at', 'updated_at', 'raw_payload', 'op_fields')
    # Встроенный список товаров
    inlines = [WebOrderItemInline]

    def items_summary(self, obj):
        return ', '.join(f'{i.name} ×{i.count}' for i in obj.items.all())
    items_summary.short_description = 'Состав'


@admin.register(WebOrderItem)
class WebOrderItemAdmin(admin.ModelAdmin):
    """
    Отдельный список всех позиций заявок (для массового просмотра).
    """
    list_display = ('id', 'web_order', 'name', 'count', 'price', 'total_price')
    list_filter = ('web_order__status',)