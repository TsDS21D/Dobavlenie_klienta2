"""
admin.py
Настройки административной панели Django.
"""

from django.contrib import admin
from .models import Client, Order

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    """Административная панель для клиентов."""
    
    list_display = ('name', 'phone', 'email', 'uses_edo', 'created_at')
    list_filter = ('uses_edo', 'created_at')
    search_fields = ('name', 'phone', 'email')
    ordering = ('name',)
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('name', 'phone', 'email')
        }),
        ('Дополнительная информация', {
            'fields': ('uses_edo', 'notes')
        }),
    )

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    """Административная панель для заказов."""
    
    list_display = ('order_number', 'get_client_display', 'status', 'ready_datetime', 'created_at')
    list_filter = ('status', 'created_at', 'ready_datetime')
    search_fields = ('order_number', 'customer_name', 'client__name', 'description')
    ordering = ('-created_at',)
    
    fieldsets = (
        ('Основная информация', {
            'fields': ('client', 'customer_name', 'description')
        }),
        ('Статус и сроки', {
            'fields': ('status', 'ready_datetime')
        }),
    )
    
    def get_client_display(self, obj):
        """Возвращает отображаемое имя клиента."""
        return obj.get_client_display()
    get_client_display.short_description = 'Клиент'