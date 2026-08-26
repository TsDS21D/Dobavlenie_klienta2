"""
urls.py для приложения sheet_formats
URL-маршруты для приложения sheet_formats
Определяет, какие URL ведут к каким view-функциям
"""

from django.urls import path
from . import views

# Пространство имен для приложения sheet_formats
# Позволяет использовать {% url 'sheet_formats:index' %} в шаблонах
app_name = 'sheet_formats'

# Список URL-шаблонов приложения
# Django сопоставляет URL с view-функциями
urlpatterns = [
    # Главная страница приложения sheet_formats
    # URL: /sheet_formats/
    # Обрабатывается функцией index из views.py
    path('', views.index, name='index'),
    
    # Удаление формата
    # URL: /sheet_formats/delete/<format_id>/
    # Пример: /sheet_formats/delete/1/ - удалить формат с ID=1
    path('delete/<int:format_id>/', views.delete_format, name='delete_format'),
    
    # Обновление формата (для AJAX-запросов)
    # URL: /sheet_formats/update/<format_id>/
    # Пример: /sheet_formats/update/1/ - обновить формат с ID=1
    # Метод: POST (только для AJAX-запросов)
    path('update/<int:format_id>/', views.update_format, name='update_format'),
]