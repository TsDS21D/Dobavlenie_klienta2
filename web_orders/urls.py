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
    # GET /web-orders/
    # Список входящих заявок для менеджера (интерфейс в стиле CRM).
    # Показывает все неудалённые заявки, новые сверху.
    # Имя 'index' — по аналогии с orders:index и sklad:index, чтобы в
    # шаблонах и редиректах было единообразно: {% url 'web_orders:index' %}.
    path('', views.list_web_orders, name='index'),
    # POST /web-orders/api/convert/<id>/
    # Конвертировать заявку в заказ (orders.Order).
    # Вызывается кнопкой «Конвертировать в заказ».
    # Ответ — JSON: {success: true, order_id: 12, order_number: 'ORD-12'}
    path(
        'api/convert/<int:order_id>/',
        views.api_convert_web_order,
        name='api_convert_web_order',
    ),

    # POST /web-orders/api/restore/<id>/
    # Вернуть отклонённую заявку в работу (статус → «Новая»).
    # Вызывается кнопкой «Вернуть» в карточке отклонённой заявки.
    # Ответ — JSON: {success: true, status: 'new', status_display: 'Новая'}
    path(
        'api/restore/<int:order_id>/',
        views.api_restore_web_order,
        name='api_restore_web_order',
    ),


    # POST /web-orders/api/reject/<id>/
    # Отклонить входящую заявку (статус → «Отклонена»).
    # Вызывается кнопкой «Отклонить» в карточке заявки на /web-orders/.
    # Ответ — JSON: {success: true, status: 'rejected', status_display: 'Отклонена'}
    #
    # <int:order_id> — Django сам приведёт часть адреса к целому числу
    # и не пропустит сюда «/reject/abc/» (вернёт 404 ещё до вызова view).
    path(
        'api/reject/<int:order_id>/',
        views.api_reject_web_order,
        name='api_reject_web_order',
    ),


    # POST /web-orders/api/receive/
    # Принимает JSON с данными заказа от Moguta (bukva-a.ru).
    # Возвращает JSON: {success: true, web_order_id: N}
    path(
        'api/receive/',
        views.api_receive_order,
        name='api_receive_order',
    ),
]