"""
urls.py для приложения print_price
Маршруты (URL-адреса) для приложения справочника цен на печать
"""

from django.urls import path
from . import views

# Пространство имен приложения
app_name = 'print_price'

# Список URL-маршрутов приложения
urlpatterns = [
    # Главная страница приложения
    path('', views.index, name='index'),
    
    # API для создания новой цены (AJAX)
    path('api/create/', views.create_print_price, name='create_print_price'),
    
    # API для обновления существующей цены (AJAX, in-line редактирование)
    path('api/update/<int:price_id>/', views.update_print_price, name='update_print_price'),
    
    # Удаление цены (подтверждение через JS)
    path('delete/<int:price_id>/', views.delete_print_price, name='delete_print_price'),
]