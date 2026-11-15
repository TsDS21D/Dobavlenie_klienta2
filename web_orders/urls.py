"""
URL-маршруты приложения "web_orders" (Входящие заявки с сайта).
Префикс URL задаётся в корневом urls.py проекта (clickcounter/urls.py).
Здесь описаны только внутренние маршруты приложения.
app_name = 'web_orders' даёт пространство имён.
В шаблонах можно писать: {% url 'web_orders:api_receive_order' %}
"""
from django.urls import path
from . import views

app_name = 'web_orders'

urlpatterns = [
    # POST /web-orders/api/receive/
    # Принимает JSON с данными заказа от Moguta (bukva-a.ru).
    # Возвращает JSON: {success: true, web_order_id: N}
    path(
        'api/receive/',
        views.api_receive_order,
        name='api_receive_order',
    ),
]