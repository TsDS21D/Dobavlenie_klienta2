# proschety/urls.py
#
# URL-маршруты приложения "Просчёты" (новая альтернативная страница).
#
# Важно: это СВОИ маршруты. Они не пересекаются с calculator/urls.py.
# Страница живёт по адресу /proschety/, а все API-запросы внутри страницы
# (создание, обновление, удаление просчётов) будут идти на СУЩЕСТВУЮЩИЕ
# эндпоинты приложения calculator — их мы НЕ дублируем и НЕ переписываем.
#
# Пространство имён 'proschety' позволит в шаблонах писать:
#     {% url 'proschety:index' %}
#
# На этом шаге маршрут только один — index (главная страница).
# Остальные маршруты (например, WebSocket-адрес) добавим позже.

from django.urls import path
from . import views

app_name = 'proschety'

urlpatterns = [
    # GET /proschety/  — главная страница «Просчёты».
    # Пока это заглушка: view вернёт простой ответ, чтобы убедиться,
    # что маршрут подключён. Настоящий шаблон сделаем на следующем шаге.
    path('', views.index, name='index'),

    # AJAX-перерисовка tbody таблицы просчётов (после создания/удаления).
    path('api/rows/', views.api_rows, name='api_rows'),
    
    # Мягкое удаление просчёта (is_deleted=True).
    # Свой эндпоинт — потому что bulk-delete в calculator использует
    # несуществующий метод soft_delete() и падает с ошибкой.
    path('api/delete-proschet/<int:proschet_id>/',
         views.delete_proschet,
         name='delete_proschet'),
    # Обновление комментария просчёта (inline-редактирование из секции «Просчёт»).
    path('api/update-proschet-comment/<int:proschet_id>/',
         views.update_proschet_comment,
         name='update_proschet_comment'),
    # НОВОЕ: детальные данные просчёта (свежие, при клике по строке).
    path('api/proschet/<int:proschet_id>/',
         views.api_proschet_detail, name='api_proschet_detail'),

    # НОВОЕ: уведомление других окон об изменении (шлёт WebSocket-событие).
    path('api/notify-change/<int:proschet_id>/',
         views.api_notify_change, name='api_notify_change'),

    # Новые эндпоинты с учётом скидки
    path('api/price-data/<int:proschet_id>/', views.api_price_data_with_discount, name='api_price_data'),
    path('api/print-components/<int:proschet_id>/', views.api_print_components_with_discount, name='api_print_components'),
    path('api/lamination/<int:component_id>/', views.api_lamination_with_discount, name='api_lamination'),
    path('api/works/<int:component_id>/', views.api_additional_works_with_discount, name='api_works'),


]