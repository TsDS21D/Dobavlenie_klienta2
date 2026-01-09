"""
urls.py для приложения baza_klientov
Маршруты (URL-адреса) для приложения базы клиентов
ИСПРАВЛЕНИЕ: Добавлен новый маршрут для обновления контактных лиц
"""

from django.urls import path
from . import views

# Пространство имен приложения (для использования в шаблонах: {% url 'baza_klientov:index' %})
app_name = 'baza_klientov'

# Список URL-маршрутов приложения
urlpatterns = [
    # Главная страница приложения
    path('', views.index, name='index'),
    
    # API для создания нового клиента (AJAX)
    path('api/create_client/', views.create_client, name='create_client'),
    
    # API для создания нового контактного лица (AJAX)
    path('api/create_contact/', views.create_contact_person, name='create_contact'),
    
    # API для обновления клиента (AJAX, in-line редактирование)
    path('api/update_client/<int:client_id>/', views.update_client, name='update_client'),
    
    # ИСПРАВЛЕНИЕ: Добавлен новый API для обновления контактного лица
    path('api/update_contact/<int:contact_id>/', views.update_contact_person, name='update_contact'),
    
    # API для переключения основного контактного лица
    path('api/toggle_primary/<int:contact_id>/', views.toggle_primary_contact, name='toggle_primary'),
    
    # Удаление клиента
    path('delete_client/<int:client_id>/', views.delete_client, name='delete_client'),
    
    # Удаление контактного лица
    path('delete_contact/<int:contact_id>/', views.delete_contact_person, name='delete_contact'),
]