"""
calculator/urls.py
Файл маршрутов (URL patterns) для приложения calculator.
Определяет, какие URL ведут к каким функциям-представлениям.
"""

from django.urls import path
from . import views

# Пространство имен приложения для использования в шаблонах
# Например: {% url 'calculator:index' %}
app_name = 'calculator'

# Список URL-маршрутов приложения calculator
urlpatterns = [
    path('get-clients/', views.get_clients, name='get_clients'),
    # Главная страница калькулятора с таблицей просчётов
    # URL: /calculator/
    path('', views.index, name='index'),
    
    # Создание нового просчёта (AJAX)
    # URL: /calculator/create-proschet/
    path('create-proschet/', views.create_proschet, name='create_proschet'),
    
    # Массовое удаление просчётов (AJAX)
    # URL: /calculator/bulk-delete-proschets/
    path('bulk-delete-proschets/', views.bulk_delete_proschets, name='bulk_delete_proschets'),
    
    # Обновление клиента в просчёте (AJAX)
    # URL: /calculator/update-proschet-client/<proschet_id>/
    path('update-proschet-client/<int:proschet_id>/', views.update_proschet_client, name='update_proschet_client'),
    
    # Получение данных просчёта по ID (AJAX)
    # URL: /calculator/get-proschet/<proschet_id>/
    path('get-proschet/<int:proschet_id>/', views.get_proschet, name='get_proschet'),
    
    # Получение списка клиентов (AJAX)
    # URL: /calculator/get-clients/
    path('get-clients/', views.get_clients, name='get_clients'),

    # URL для работы с компонентами печати
    path('get-print-components/<int:proschet_id>/', views.get_print_components, name='get_print_components'),
    path('get-printers/', views.get_printers, name='get_printers'),
    path('get-papers/', views.get_papers, name='get_papers'),
    path('add-print-component/', views.add_print_component, name='add_print_component'),
    path('update-print-component/', views.update_print_component, name='update_print_component'),
    path('delete-print-component/', views.delete_print_component, name='delete_print_component'),
    
    # НОВЫЙ МАРШРУТ: Обновление названия просчёта при inline-редактировании (AJAX)
    # URL: /calculator/update-proschet-title/<proschet_id>/
    # <int:proschet_id> - преобразует часть URL в целое число и передает как параметр proschet_id
    path(
        'update-proschet-title/<int:proschet_id>/',  # Шаблон URL
        views.update_proschet_title,                  # Функция-обработчик
        name='update_proschet_title'                 # Имя маршрута для использования в шаблонах
    ),

    # URL для обновления тиража просчёта
    path('update-proschet-circulation/<int:proschet_id>/', 
         views.update_proschet_circulation,  # ИЗМЕНЕНО: используем views.update_proschet_circulation
         name='update_proschet_circulation'),
    
    # URL для получения данных просчёта (должен уже существовать)
    path('get-proschet/<int:proschet_id>/', 
         views.get_proschet,  # ИЗМЕНЕНО: используем views.get_proschet
         name='get_proschet'),


    # НОВЫЙ МАРШРУТ: API для расчёта цены за лист на основе принтера и тиража
    # URL: /calculator/calculate-price-for-printer/
    path(
        'calculate-price-for-printer/',
        views.calculate_price_for_printer,
        name='calculate_price_for_printer'
    ),

    # Маршрут для пересчёта компонентов при изменении тиража
    path(
        'recalculate-components/<int:proschet_id>/',
        views.recalculate_components_for_circulation,
        name='recalculate_components_for_circulation'
    ),

    # API для дополнительных работ
    path('get-additional-works/<int:proschet_id>/', views.get_additional_works, name='get_additional_works'),
    path('add-additional-work/', views.add_additional_work, name='add_additional_work'),
    path('update-additional-work/', views.update_additional_work, name='update_additional_work'),
    path('delete-additional-work/', views.delete_additional_work, name='delete_additional_work'),

    path('get-proschet-price-data/<int:proschet_id>/', 
         views.get_proschet_price_data, 
         name='get_proschet_price_data'),


]