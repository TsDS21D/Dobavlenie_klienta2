# orders/urls.py
"""
URL-маршруты приложения "orders" (Заказы и изделия).

Префикс URL задаётся в корневом urls.py проекта (clickcounter/urls.py).
Здесь описаны только внутренние маршруты приложения.

app_name = 'orders' даёт пространство имён.
В шаблонах можно писать: {% url 'orders:index' %}
"""

# Импорт функции path для описания маршрутов.
from django.urls import path

# Импорт модуля views нашего приложения.
from . import views

# Пространство имён приложения — исключает конфликты имён между приложениями.
app_name = 'orders'

# Список URL-маршрутов приложения.
urlpatterns = [
    # Главная страница заказов — список заказов и карточка выбранного заказа.
    path('', views.index, name='index'),

    # ===== AJAX-API =====

    # POST /orders/api/create-from-proschet/
    # Создать НОВЫЙ заказ из просчёта.
    # Вход: {proschet_id, comment?}
    # Выход: {order_id, order_number, product_id}
    path(
        'api/create-from-proschet/',
        views.api_create_order_from_proschet,
        name='api_create_order_from_proschet',
    ),

    # POST /orders/api/add-to-order/
    # Добавить изделие (копию просчёта) в СУЩЕСТВУЮЩИЙ заказ.
    # Вход: {proschet_id, order_id}
    # Выход: {order_id, order_number, product_id}
    path(
        'api/add-to-order/',
        views.api_add_to_order,
        name='api_add_to_order',
    ),

    # POST /orders/api/proschet-from-product/
    # Создать новый просчёт из изделия (цена пересчитается на актуальную).
    # Вход: {product_id}
    # Выход: {proschet_id, proschet_number}
    path(
        'api/proschet-from-product/',
        views.api_proschet_from_product,
        name='api_proschet_from_product',
    ),

    # GET /orders/api/all-orders/
    # Список всех неудалённых заказов (для выпадающего списка
    # «Добавить в имеющийся»).
    path(
        'api/all-orders/',
        views.api_all_orders,
        name='api_all_orders',
    ),

    # POST /orders/api/order/<order_id>/update-comment/
    # Инлайн-обновление комментария заказа (карточка заказа).
    # Вход: {comment}
    # Выход: {success, comment}
    path(
        'api/order/<int:order_id>/update-comment/',
        views.api_update_order_comment,
        name='api_update_order_comment',
    ),

    # POST /orders/api/order/create/
    # Ручное создание заказа (секция «Список заказов», форма «Создать»).
    # Вход: form-data {client?, comment?, ready_datetime?}
    # Выход: {success, order: {...}}
    path(
        'api/order/create/',
        views.api_create_order,
        name='api_create_order',
    ),

    # POST /orders/api/order/<order_id>/update-field/
    # Инлайн-редактирование одного поля заказа в списке
    # (client / status / ready_datetime / comment).
    # Вход: form-data {field_name, field_value}
    # Выход: {success, order: {...}}
    path(
        'api/order/<int:order_id>/update-field/',
        views.api_update_order,
        name='api_update_order',
    ),

    # POST /orders/api/order/<order_id>/delete/
    # Мягкое удаление заказа (is_deleted=True).
    # Выход: {success, order_id, message}
    path(
        'api/order/<int:order_id>/delete/',
        views.api_delete_order,
        name='api_delete_order',
    ),
    # POST /orders/api/product/<product_id>/delete/
    # Мягкое удаление изделия
    path(
        'api/product/<int:product_id>/delete/',
        views.api_delete_product,
        name='api_delete_product',
    ),

    # GET /orders/api/proschets-list/
    path(
        'api/proschets-list/',
        views.api_proschets_list,
        name='api_proschets_list',
    ),

    # GET /orders/api/product/<product_id>/details/
    # Полный состав изделия (для раскрытия карточки на странице заказа).
    path(
        'api/product/<int:product_id>/details/',
        views.api_product_details,
        name='api_product_details',
    ),    

    # GET /orders/api/rows/
    # HTML-партиал <tr>-строк для перерисовки tbody таблицы заказов
    # без перезагрузки страницы (после создания/удаления/редактирования).
    path(
        'api/rows/',
        views.api_rows,
        name='api_rows',
    ),

    # GET /orders/api/proschets-list/
    # Список просчётов для выпадающего списка
    path(
        'api/proschets-list/',
        views.api_proschets_list,
        name='api_proschets_list',
    ),

    # GET /orders/api/order-info/<order_id>/
    path(
        'api/order-info/<int:order_id>/',
        views.api_order_info,
        name='api_order_info',
    ),
    # GET /orders/api/orders-delivery-today/
    # Список заказов, доставка которых назначена на сегодня.
    # Используется для зелёных плашек в левом верхнем углу на /orders/.
    path(
        'api/orders-delivery-today/',
        views.api_orders_delivery_today,
        name='api_orders_delivery_today',
    ),

    # GET /orders/api/clients/
    # Список клиентов с юрлицами для инлайн-редактирования
    path(
        'api/clients/',
        views.api_clients,
        name='api_clients',
    ),
    # GET /orders/api/client-details/<client_id>/
    path(
        'api/client-details/<int:client_id>/',
        views.api_client_details,
        name='api_client_details',
    ),

    # ===== API «УМНОГО РЕДАКТИРОВАНИЯ» И КЛОНИРОВАНИЯ =====

    # POST /orders/api/unfreeze-product/
    # Разморозить изделие в новый просчёт (для кнопки «Редактировать»).
    # Вход: {product_id, return_to?}
    # Выход: {success, proschet_id, proschet_number, return_to}
    path(
        'api/unfreeze-product/',
        views.api_unfreeze_product,
        name='api_unfreeze_product',
    ),

    # POST /orders/api/clone-product/
    # Клонировать изделие в указанный заказ (или в тот же).
    # Вход: {product_id, target_order_id?}
    # Выход: {success, order_id, order_number, new_product_id}
    path(
        'api/clone-product/',
        views.api_clone_product,
        name='api_clone_product',
    ),

    # POST /orders/api/replace-product-in-order/
    # Заменить старое изделие новым (после редактирования).
    # Вход: {proschet_id, old_product_id}
    # Выход: {success, order_id, order_number, old_product_id,
    #         new_product_id, old_price, new_price, price_changed}
    path(
        'api/replace-product-in-order/',
        views.api_replace_product_in_order,
        name='api_replace_product_in_order',
    ),

    # POST /orders/api/cancel-edit/
    # Отменить редактирование — мягко удалить временный просчёт.
    # Вход: {proschet_id}
    # Выход: {success, return_to}
    path(
        'api/cancel-edit/',
        views.api_cancel_edit,
        name='api_cancel_edit',
    ),

    # GET /orders/<order_id>/
    # Страница одного заказа (карточка со списком изделий).
    # ВАЖНО: этот маршрут должен идти ПОСЛЕ всех api/… — иначе общий
    # шаблон <int:order_id>/ может перехватить часть api-URL.
    path(
        '<int:order_id>/',
        views.order_detail,
        name='order_detail',
    ),
]