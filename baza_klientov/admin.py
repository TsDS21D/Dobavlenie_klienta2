"""
admin.py для приложения baza_klientov
Настройка административной панели Django для базы клиентов
"""

from django.contrib import admin
from django.utils.html import format_html
from .models import Client, ContactPerson


class ContactPersonInline(admin.TabularInline):
    """
    Встроенное отображение контактных лиц в форме редактирования клиента
    
    Позволяет добавлять/редактировать контактные лица прямо на странице клиента
    """
    model = ContactPerson
    extra = 1  # Количество пустых форм для добавления новых контактов
    fields = ['full_name', 'position', 'phone', 'mobile', 'email', 'is_primary', 'comments']
    classes = ['collapse']  # Раздел можно свернуть


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    """
    Настройка отображения модели Client в админ-панели
    """
    
    # Поля, отображаемые в списке объектов
    list_display = [
        'client_number',
        'name',
        'display_primary_contact',
        'discount',
        'has_edo',
        'created_at',
    ]
    
    # Поля для фильтрации справа
    list_filter = [
        'has_edo',
        'created_at',
        'discount',
    ]
    
    # Поля для поиска
    search_fields = [
        'client_number',
        'name',
        'address',
        'contact_persons__full_name',  # Поиск по контактным лицам
    ]
    
    # Порядок сортировки по умолчанию
    ordering = ['-created_at']
    
    # Разбивка на страницы
    list_per_page = 20
    
    # Поля только для чтения
    readonly_fields = ['client_number', 'created_at', 'updated_at']
    
    # Встроенное отображение контактных лиц
    inlines = [ContactPersonInline]
    
    # Поля для отображения в форме редактирования
    fieldsets = [
        ('Основная информация', {
            'fields': ['client_number', 'name', 'discount', 'has_edo']
        }),
        ('Контактная информация', {
            'fields': ['address', 'bank_details'],
            'classes': ['collapse']
        }),
        ('Даты', {
            'fields': ['created_at', 'updated_at'],
            'classes': ['collapse']
        }),
    ]
    
    def display_primary_contact(self, obj):
        """
        Отображает основное контактное лицо клиента
        
        Args:
            obj: Объект Client
        
        Returns:
            str: Основное контактное лицо или сообщение об отсутствии
        """
        primary_contact = obj.contact_persons.filter(is_primary=True).first()
        if primary_contact:
            return primary_contact.full_name
        return "Не указано"
    
    # Заголовок для колонки
    display_primary_contact.short_description = 'Основное контактное лицо'


@admin.register(ContactPerson)
class ContactPersonAdmin(admin.ModelAdmin):
    """
    Настройка отображения модели ContactPerson в админ-панели
    """
    
    list_display = [
        'full_name',
        'client',
        'position',
        'phone',
        'mobile',
        'is_primary',
    ]
    
    list_filter = [
        'is_primary',
        'client',
    ]
    
    search_fields = [
        'full_name',
        'position',
        'phone',
        'mobile',
        'email',
        'client__name',
    ]
    
    ordering = ['-is_primary', 'full_name']
    
    list_per_page = 20
    
    readonly_fields = ['created_at']
    
    fieldsets = [
        ('Основная информация', {
            'fields': ['client', 'full_name', 'position', 'is_primary']
        }),
        ('Контактные данные', {
            'fields': ['phone', 'mobile', 'email']
        }),
        ('Дополнительно', {
            'fields': ['comments', 'created_at'],
            'classes': ['collapse']
        }),
    ]
    
    def get_queryset(self, request):
        """
        Оптимизация запросов: предзагрузка связанных данных
        """
        queryset = super().get_queryset(request)
        return queryset.select_related('client')