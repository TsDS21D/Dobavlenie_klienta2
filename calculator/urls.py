# calculator/urls.py
"""
URL-маршруты для приложения calculator (калькулятор типографии).
Включает все API для работы с просчётами, печатными компонентами,
дополнительными работами и пересчётом стоимости при изменении тиража.
"""

from django.urls import path
from . import views

# Устанавливаем пространство имён для приложения
# Это позволяет использовать reverse('calculator:имя_маршрута')
app_name = 'calculator'

# Определяем URL-маршруты для приложения
urlpatterns = [
    # ------------------------------------------------------------
    # Главная страница калькулятора
    # ------------------------------------------------------------
    path('', views.index, name='index'),

    # ------------------------------------------------------------
    # API для работы с просчётами
    # ------------------------------------------------------------
    # Получение данных одного просчёта по ID
    path('get-proschet/<int:proschet_id>/', views.get_proschet, name='get_proschet'),

    # Создание нового просчёта
    path('create-proschet/', views.create_proschet, name='create_proschet'),

    # Обновление названия просчёта (inline-редактирование)
    path('update-proschet-title/<int:proschet_id>/', views.update_proschet_title, name='update_proschet_title'),

    # Обновление клиента в просчёте
    path('update-proschet-client/<int:proschet_id>/', views.update_proschet_client, name='update_proschet_client'),

    # Обновление тиража просчёта
    path('update-proschet-circulation/<int:proschet_id>/', views.update_proschet_circulation, name='update_proschet_circulation'),

    # ===== НОВЫЙ МАРШРУТ: пересчёт всех компонентов при изменении тиража =====
    # Этот маршрут вызывается из product.js после успешного сохранения тиража.
    # Он обновляет количество листов и цены для всех печатных компонентов просчёта.
    path('recalculate-components-for-circulation/<int:proschet_id>/', views.recalculate_components_for_circulation, name='recalculate_components_for_circulation'),

    # Удаление нескольких просчётов (мягкое удаление)
    path('bulk-delete-proschets/', views.bulk_delete_proschets, name='bulk_delete_proschets'),

    # ------------------------------------------------------------
    # API для работы с печатными компонентами
    # ------------------------------------------------------------
    # Получение списка печатных компонентов для просчёта
    path('get-print-components/<int:proschet_id>/', views.get_print_components, name='get_print_components'),

    # Добавление нового печатного компонента
    path('add-print-component/', views.add_print_component, name='add_print_component'),

    # Обновление печатного компонента
    path('update-print-component/', views.update_print_component, name='update_print_component'),

    # Удаление печатного компонента
    path('delete-print-component/', views.delete_print_component, name='delete_print_component'),

    # Пересчёт стоимости компонента при изменении количества листов
    path('update-component-price/', views.update_component_price, name='update_component_price'),

    # ------------------------------------------------------------
    # API для работы с дополнительными работами
    # ------------------------------------------------------------
    # Получение списка дополнительных работ для просчёта
    path('get-additional-works/<int:proschet_id>/', views.get_additional_works, name='get_additional_works'),

    # Добавление дополнительной работы
    path('add-additional-work/', views.add_additional_work, name='add_additional_work'),

    # Обновление дополнительной работы
    path('update-additional-work/', views.update_additional_work, name='update_additional_work'),

    # Удаление дополнительной работы
    path('delete-additional-work/', views.delete_additional_work, name='delete_additional_work'),

    # ------------------------------------------------------------
    # API для получения справочных данных
    # ------------------------------------------------------------
    # Получение списка принтеров (для выпадающих списков)
    path('get-printers/', views.get_printers, name='get_printers'),

    # Получение списка материалов (бумаги)
    path('get-papers/', views.get_papers, name='get_papers'),

    # Получение списка клиентов
    path('get-clients/', views.get_clients, name='get_clients'),

    # ------------------------------------------------------------
    # API для расчёта цены печати (интерполяция)
    # ------------------------------------------------------------
    path('calculate-price-for-printer/', views.calculate_price_for_printer, name='calculate_price_for_printer'),

    # ------------------------------------------------------------
    # API для получения данных о стоимости просчёта (для сводки)
    # ------------------------------------------------------------
    path('get-proschet-price-data/<int:proschet_id>/', views.get_proschet_price_data, name='get_proschet_price_data'),
]