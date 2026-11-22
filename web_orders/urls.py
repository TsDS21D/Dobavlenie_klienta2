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

    # GET /web-orders/api/statuses/?ids=60,59
    # Отдаёт сайту bukva-a.ru статусы заказов для личного кабинета:
    # производство, макет, оплату, ссылку на оплату и счёт.
    # Авторизация — заголовок X-Beauty-Secret (BUKVA_API_SECRET),
    # как у API цен в calculator.
    path(
        'api/statuses/',
        views.api_site_statuses,
        name='api_site_statuses',
    ),

    # POST /web-orders/api/site/order-upload/
    # Прямая загрузка правки макета клиентом из ЛК (защита — X-Upload-Token).
    path(
        'api/site/order-upload/',
        views.api_site_order_upload,
        name='api_site_order_upload',
    ),


    # POST /web-orders/api/site/order-upload-token/
    # Токен на загрузку правки к позиции заказа из ЛК клиента.
    path(
        'api/site/order-upload-token/',
        views.api_site_order_upload_token,
        name='api_site_order_upload_token',
    ),

    # POST /web-orders/api/site/next-order-number/
    # Сайт просит номер заказа до создания заказа в Moguta.
    path(
        'api/site/next-order-number/',
        views.api_site_next_order_number,
        name='api_site_next_order_number',
    ),


    # POST /web-orders/api/site/customer-type/
    # Смена типа плательщика с сайта (физ/юр) — чтобы ИС не расходилась с ЛК.
    path(
        'api/site/customer-type/',
        views.api_site_update_customer_type,
        name='api_site_update_customer_type',
    ),


    # POST /web-orders/api/client/files/
    # Макеты и переписка для ЛК клиента (только is_client_visible=True).
    path(
        'api/client/files/',
        views.api_client_files,
        name='api_client_files',
    ),

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
    # POST /web-orders/api/delete/<id>/
    # Удалить заявку (и связанный заказ, если он есть).
    # Вызывается кнопкой «Удалить» в карточке заявки.
    # Ответ — JSON: {success: true, order_deleted: true}
    path(
        'api/delete/<int:order_id>/',
        views.api_delete_web_order,
        name='api_delete_web_order',
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

    # POST /web-orders/api/order/<id>/site-status/
    # Ссылка на оплату и PDF счёта из карточки заявки.
    path(
        'api/order/<int:order_id>/site-status/',
        views.api_update_site_status,
        name='api_update_site_status',
    ),


    # POST /web-orders/api/item/<id>/layout-status/
    # Ручная смена статуса макета менеджером.
    path(
        'api/item/<int:item_id>/layout-status/',
        views.api_set_item_layout_status,
        name='api_set_item_layout_status',
    ),


    # POST /web-orders/api/item/<id>/files/upload/
    # Загрузка файла макета к конкретной позиции заявки
    # (изделию или товару; доставка исключена).
    path(
        'api/item/<int:item_id>/files/upload/',
        views.api_upload_item_file,
        name='api_upload_item_file',
    ),
    path(
        'api/file/<int:file_id>/comments/add/',
        views.api_add_file_comment,
        name='api_add_file_comment',
    ),

    # GET /web-orders/invoices/<id>/download/ — счёт по подписанной ссылке
    # (или по логину для сотрудника).
    path(
        'invoices/<int:status_id>/download/',
        views.api_download_invoice,
        name='api_download_invoice',
    ),


    path(
        'files/<int:file_id>/download/',
        views.api_download_item_file,
        name='api_download_item_file',
    ),

    path(
        'files/<int:file_id>/delete/',
        views.api_delete_item_file,
        name='api_delete_item_file',
    ),

    path(
        'files/<int:file_id>/delete/',
        views.api_delete_item_file,
        name='api_delete_item_file',
    ),

    # POST /web-orders/api/site/upload-token/
    # Сайт получает короткоживущий токен для прямой загрузки файлов
    # клиентом (браузер грузит файл сразу в ИС, минуя сайт).
    path(
        'api/site/upload-token/',
        views.api_site_upload_token,
        name='api_site_upload_token',
    ),

    # POST /web-orders/api/site/upload/
    # Прямая загрузка файла клиентом из браузера (защита — X-Upload-Token).
    path(
        'api/site/upload/',
        views.api_site_upload_file,
        name='api_site_upload_file',
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