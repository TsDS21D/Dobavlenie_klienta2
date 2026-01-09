"""
urls.py для приложения devices
URL-маршруты для приложения devices
Определяет, какие URL ведут к каким view-функциям
"""

from django.urls import path
from . import views

# Пространство имен для приложения devices
# Позволяет использовать {% url 'devices:index' %} в шаблонах
app_name = 'devices'

# Список URL-шаблонов приложения
urlpatterns = [
    # Главная страница приложения devices
    # URL: /devices/
    # Обрабатывается функцией index из views.py
    path('', views.index, name='index'),
    
    # Удаление принтера
    # URL: /devices/delete/<printer_id>/
    # Пример: /devices/delete/1/ - удалить принтер с ID=1
    path('delete/<int:printer_id>/', views.delete_printer, name='delete_printer'),
    
    # Обновление принтера (для AJAX-запросов)
    # URL: /devices/update/<printer_id>/
    # Пример: /devices/update/1/ - обновить принтер с ID=1
    path('update/<int:printer_id>/', views.update_printer, name='update_printer'),
    
    # НОВЫЙ МАРШРУТ: Расчет цены для произвольного тиража
    # URL: /devices/calculate_price/<printer_id>/
    # Пример: /devices/calculate_price/1/ - рассчитать цену для принтера с ID=1
    path('calculate_price/<int:printer_id>/', views.calculate_price_devices, name='calculate_price_devices'),
]