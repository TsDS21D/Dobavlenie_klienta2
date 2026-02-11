"""
Файл urls.py для приложения vichisliniya_listov.
ОБНОВЛЕНО: Все URL теперь работают с печатными компонентами вместо просчётов.
"""

from django.urls import path
from . import views

# Устанавливаем пространство имён для приложения
# Это позволяет использовать reverse('vichisliniya_listov:имя_маршрута')
app_name = 'vichisliniya_listov'

# Определяем URL-маршруты для приложения
urlpatterns = [
    # API для получения данных вычислений листов по ID печатного компонента
    # ВАЖНОЕ ИЗМЕНЕНИЕ: Заменяем proschet_id на print_component_id
    path(
        'get-data/<int:print_component_id>/',
        views.vichisliniya_listov_get_data,
        name='vichisliniya_listov_get_data'
    ),
    
    # API для сохранения данных вычислений листов
    path(
        'save-data/',
        views.vichisliniya_listov_save_data,
        name='vichisliniya_listov_save_data'
    ),
    
    # API для расчёта количества листов по ID печатного компонента
    path(
        'calculate/<int:print_component_id>/<int:circulation>/',
        views.vichisliniya_listov_calculate,
        name='vichisliniya_listov_calculate'
    ),
    
    # API для расчёта с тиражом как строкой
    path(
        'calculate/<int:print_component_id>/<str:circulation>/',
        views.vichisliniya_listov_calculate,
        name='vichisliniya_listov_calculate_str'
    ),
    
    # НОВЫЙ API: Получение всех вычислений листов для просчёта
    # Для совместимости со старым кодом
    path(
        'get-by-proschet/<int:proschet_id>/',
        views.vichisliniya_listov_get_by_proschet,
        name='vichisliniya_listov_get_by_proschet'
    ),
    
    # API для проверки миграций и состояния базы данных (отладка)
    path(
        'check-migrations/',
        views.vichisliniya_listov_check_migrations,
        name='vichisliniya_listov_check_migrations'
    ),
]