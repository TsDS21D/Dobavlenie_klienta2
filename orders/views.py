# orders/views.py
"""
Представления (views) приложения "orders" (Заказы и изделия).

На этом шаге — только одна заглушка: главная страница заказов.
Все остальные операции (создание заказа из просчёта, добавление изделия
в имеющийся заказ, создание просчёта из изделия) будут добавлены
отдельными шагами.
"""

# Импорт render для возврата HTML-страницы.
from django.shortcuts import render

# Декоратор: страница только для авторизованных пользователей.
from django.contrib.auth.decorators import login_required

# Отключаем кеширование страницы (важно — данные динамические).
from django.views.decorators.cache import never_cache

# Импорт модели заказов.
from .models import Order


@login_required(login_url='/login/')                 # Только для авторизованных
@never_cache                                          # Запрет кеширования
def index(request):
    """
    Главная страница приложения "orders".

    Отдаёт:
        - список неудалённых заказов (свежие сверху);
        - список клиентов (для выпадающего списка в форме создания заказа);
        - active_app/page_title — как у остальных страниц проекта.
    """
    # Берём все не удалённые заказы, свежие сверху.
    # select_related('client') — подгружает клиента одним запросом,
    # чтобы не было N+1 при обращении к order.client.name в шаблоне.
    orders = (
        Order.objects
        .filter(is_deleted=False)
        .select_related('client')
        .order_by('-created_at')
    )

    # Клиенты — для селекта в форме создания.
    # Импорт локальный, как в calculator/views.py::index — Client нужен
    # только здесь, в шапке файла его держать смысла нет.
    clients = []
    try:
        from baza_klientov.models import Client
        clients = Client.objects.all().order_by('client_number')
    except ImportError:
        # Если приложение baza_klientov не подключено — оставляем пустой
        # список. Форма будет без выбора клиента, но страница откроется.
        pass

    # Формируем контекст для шаблона.
    context = {
        'orders': orders,                              # Список заказов
        'clients': clients,                            # Список клиентов
        'active_app': 'orders',                        # Активное приложение (для подсветки в панели)
        'page_title': 'Заказы',                        # Заголовок страницы
        'session_key': request.session.session_key or '', # НОВОЕ: для фильтрации своих WebSocket-событий
    }

    # Рендерим шаблон.
    return render(request, 'orders/index.html', context)




# ============================================================================
# ИМПОРТЫ ДЛЯ API-ЭНДПОИНТОВ
# ============================================================================
# Эти импорты находятся ниже по файлу, а не в начале, потому что
# функция index() выше использует только Order и render, а всё
# нижеперечисленное нужно только API-эндпоинтам. Такой порядок
# не обязателен, но делает верх файла читаемее.

import json                                              # Разбор JSON из тела запроса
from datetime import datetime                            # Парсинг строки в дату (для готовности)

from django.http import JsonResponse                     # Ответ в формате JSON
from django.shortcuts import get_object_or_404           # 404, если объект не найден
from django.utils import timezone                        # Часовые пояса (МСК ↔ UTC)
from django.views.decorators.http import require_POST, require_GET  # Ограничение методов

# Импорты для WebSocket-уведомлений
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from calculator.models_list_proschet import Proschet     # Модель просчёта

from .models import Order, Product                       # Наши модели
from .services import (                                  # Сервисные функции
    create_order_from_proschet,
    add_product_to_order,
    create_proschet_from_product,
)


# ============================================================================
# ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: РАЗБОР JSON
# ============================================================================

def _parse_json(request):
    """
    Разбирает тело запроса как JSON.
    Возвращает dict или бросает ValueError с понятным сообщением.
    Используется во всех POST-эндпоинтах ниже — чтобы не дублировать
    try/except в каждом.
    """
    try:
        return json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError('Некорректный JSON в теле запроса')


# ============================================================================
# API 1: СОЗДАТЬ НОВЫЙ ЗАКАЗ ИЗ ПРОСЧЁТА
# ============================================================================

@login_required                                          # Только для авторизованных
@require_POST                                            # Только POST
def api_create_order_from_proschet(request):
    """
    Создаёт новый заказ из просчёта.

    Ожидаемый JSON в теле:
        {
            "proschet_id": 42,
            "comment": "Срочный заказ"      // необязательно
        }

    Возвращает JSON:
        {
            "success": true,
            "order_id": 7,
            "order_number": "ORD-3",
            "product_id": 11
        }

    Или при ошибке:
        { "success": false, "error": "<описание>" } + HTTP-статус 400/404/500
    """

    # --- Разбираем JSON ---
    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    # --- Проверяем входные данные ---
    proschet_id = data.get('proschet_id')
    comment = (data.get('comment') or '').strip()

    if not proschet_id:
        return JsonResponse(
            {'success': False, 'error': 'Не указан ID просчёта'},
            status=400
        )

    # --- Находим просчёт (только не удалённый) ---
    proschet = get_object_or_404(Proschet, pk=proschet_id, is_deleted=False)

    # --- Вызываем сервисную функцию ---
    # Вся тяжёлая работа — в services.create_order_from_proschet
    # (создание Order + Product + копирование вложенной структуры).
    try:
        order, product = create_order_from_proschet(
            proschet=proschet,
            comment=comment,
            created_by=request.user,        # Запоминаем, кто создал заказ
        )
    except ValueError as e:
        # Наши бизнес-ошибки — например, «у просчёта нет клиента».
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        # Любая другая ошибка (ошибка БД, баг в сервисе и т.п.).
        # Логируем трассировку в консоль и отдаём общее сообщение.
        import traceback
        traceback.print_exc()
        return JsonResponse(
            {'success': False, 'error': f'Внутренняя ошибка: {e}'},
            status=500
        )

    # --- Успех ---
    return JsonResponse({
        'success': True,
        'order_id': order.id,
        'order_number': order.number,
        'product_id': product.id,
    })


# ============================================================================
# API 2: ДОБАВИТЬ ИЗДЕЛИЕ В СУЩЕСТВУЮЩИЙ ЗАКАЗ
# ============================================================================

@login_required
@require_POST
def api_add_to_order(request):
    """
    Добавляет изделие (копию просчёта) в существующий заказ.

    Ожидаемый JSON в теле:
        {
            "proschet_id": 42,
            "order_id": 7
        }

    Возвращает JSON:
        {
            "success": true,
            "order_id": 7,
            "order_number": "ORD-3",
            "product_id": 15
        }
    """

    # --- Разбираем JSON ---
    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    # --- Проверяем входные данные ---
    proschet_id = data.get('proschet_id')
    order_id = data.get('order_id')

    if not proschet_id:
        return JsonResponse(
            {'success': False, 'error': 'Не указан ID просчёта'},
            status=400
        )
    if not order_id:
        return JsonResponse(
            {'success': False, 'error': 'Не указан ID заказа'},
            status=400
        )

    # --- Находим просчёт и заказ ---
    proschet = get_object_or_404(Proschet, pk=proschet_id, is_deleted=False)
    order = get_object_or_404(Order, pk=order_id, is_deleted=False)


    # --- Вызываем сервисную функцию ---
    try:
        product = add_product_to_order(proschet=proschet, order=order)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse(
            {'success': False, 'error': f'Внутренняя ошибка: {e}'},
            status=500
        )

    # --- Успех ---
    return JsonResponse({
        'success': True,
        'order_id': order.id,
        'order_number': order.number,
        'product_id': product.id,
    })


# ============================================================================
# API 3: СОЗДАТЬ НОВЫЙ ПРОСЧЁТ ИЗ ИЗДЕЛИЯ
# ============================================================================

@login_required
@require_POST
def api_proschet_from_product(request):
    """
    Создаёт новый просчёт из изделия.
    Цена пересчитается на актуальные справочники.

    Ожидаемый JSON в теле:
        {
            "product_id": 11
        }

    Возвращает JSON:
        {
            "success": true,
            "proschet_id": 88,
            "proschet_number": "PR-88"
        }
    """

    # --- Разбираем JSON ---
    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    # --- Проверяем входные данные ---
    product_id = data.get('product_id')
    if not product_id:
        return JsonResponse(
            {'success': False, 'error': 'Не указан ID изделия'},
            status=400
        )

    # --- Находим изделие ---
    product = get_object_or_404(Product, pk=product_id, is_deleted=False)

    # --- Вызываем сервисную функцию ---
    try:
        proschet = create_proschet_from_product(product)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse(
            {'success': False, 'error': f'Внутренняя ошибка: {e}'},
            status=500
        )

    # --- Успех ---
    return JsonResponse({
        'success': True,
        'proschet_id': proschet.id,
        'proschet_number': proschet.number,
    })


# ============================================================================
# API 4: СПИСОК ВСЕХ АКТИВНЫХ ЗАКАЗОВ
# ============================================================================

@login_required
@require_GET
def api_all_orders(request):
    """
    Возвращает список всех не удалённых заказов (без фильтра по клиенту).
    Используется фронтом для выпадающего списка «Добавить в имеющийся».

    URL: /orders/api/all-orders/

    Возвращает JSON:
        {
            "success": true,
            "orders": [
                {
                    "id": 7,
                    "number": "ORD-3",
                    "client_name": "Иван Иванов",
                    "created_at": "10.10.2026 15:42",
                    "products_count": 2,
                    "formatted_total_price": "1250.00 ₽"
                },
                ...
            ]
        }
    """

    # --- Берём все не удалённые заказы ---
    # select_related('client') — подгружает клиента одним запросом,
    # чтобы не было N+1 при обращении к order.client.name в цикле ниже.
    orders = (
        Order.objects
        .filter(is_deleted=False)
        .select_related('client')
        .order_by('-created_at')
    )

    # --- Формируем ответ ---
    orders_data = []
    for order in orders:
        orders_data.append({
            'id': order.id,
            'number': order.number,
            'client_name': order.client.name if order.client else '—',
            'created_at': order.created_at.strftime('%d.%m.%Y %H:%M'),
            'products_count': order.products.filter(is_deleted=False).count(),
            'formatted_total_price': order.formatted_total_price,
        })

    return JsonResponse({
        'success': True,
        'orders': orders_data,
    })



# ============================================================================
# VIEW: КАРТОЧКА ЗАКАЗА
# ============================================================================

@login_required
@never_cache
def order_detail(request, order_id):
    """
    Страница одного заказа.

    URL: /orders/<order_id>/

    Показывает:
        - номер заказа, клиента, даты;
        - комментарий (редактируется инлайн на этой странице);
        - общую стоимость;
        - список изделий этого заказа (карточки с составом и кнопкой
          «Создать просчёт из изделия»).

    На этом шаге шаблон рисует только «шапку» заказа и пустой контейнер
    под изделия. Сами карточки изделий сделаем следующим шагом.
    """
    # --- Находим заказ или 404 ---
    # Разрешаем смотреть и удалённые заказы (is_deleted мы тут не фильтруем),
    # потому что по прямой ссылке в карточку может зайти админ — например,
    # чтобы восстановить. Если хочешь фильтровать — скажи, добавим.
    order = get_object_or_404(Order, pk=order_id)

    # --- Загружаем изделия заказа (не удалённые) ---
    # select_related подтягивает связанные справочники одним запросом.
    products = (
        order.products
        .filter(is_deleted=False)
        .order_by('created_at')
    )

    # --- Формируем контекст ---
    context = {
        'order': order,
        'products': products,
        'active_app': 'orders',
        'page_title': f'Заказ {order.number}',
    }
    return render(request, 'orders/detail.html', context)


# ============================================================================
# API: ОБНОВИТЬ КОММЕНТАРИЙ ЗАКАЗА (инлайн-редактирование)
# ============================================================================

@login_required
@require_POST
def api_update_order_comment(request, order_id):
    """
    Обновляет комментарий заказа. Используется фронтом для инлайн-редактирования.

    URL: /orders/api/order/<order_id>/update-comment/

    Ожидаемый JSON:
        { "comment": "текст" }

    Возвращает JSON:
        { "success": true, "comment": "текст" }
    """

    # --- Находим заказ ---
    order = get_object_or_404(Order, pk=order_id)

    # --- Разбираем JSON ---
    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    # --- Берём комментарий ---
    # Разрешаем пустую строку — комментарий необязателен.
    comment = (data.get('comment') or '').strip()

    # --- Сохраняем ---
    order.comment = comment
    order.save(update_fields=['comment', 'updated_at'])

    # --- Ответ ---
    return JsonResponse({
        'success': True,
        'comment': order.comment,
    })




# ============================================================================
# API 5: СОСТАВ ИЗДЕЛИЯ (для раскрытия карточки)
# ============================================================================

@login_required
@require_GET
def api_product_details(request, product_id):
    """
    Возвращает полный состав изделия (JSON) для раскрытия карточки:
        - шапка: title, circulation, total_price, даты, источники;
        - компоненты: принтер, бумага, тип/режим печати, sheet_count,
          runs_count, price_per_sheet, total_circulation_price;
        - для каждого компонента — вложенно: работы, ламинация,
          одностраничный расчёт, многостраничный расчёт.

    URL: /orders/api/product/<product_id>/details/
    """

    # --- Находим изделие ---
    product = get_object_or_404(Product, pk=product_id, is_deleted=False)

    # --- Загружаем компоненты с жадной подгрузкой связей ---
    # prefetch_related подтягивает работы/ламинацию/расчёты одним запросом
    # на каждый тип связи, чтобы не было N+1.
    components = (
        product.components
        .select_related('printer', 'paper')
        .prefetch_related('works', 'works__work')
    )

    # --- Собираем данные по каждому компоненту ---
    components_data = []

    for comp in components:
        # Работы (кроме удалённых).
        works_data = []
        for w in comp.works.filter(is_deleted=False):
            works_data.append({
                'id': w.id,
                'number': w.number or '',
                'title': w.title,
                'cost': float(w.cost),
                'markup_percent': float(w.markup_percent),
                'price': float(w.price),
                'quantity': w.quantity,
                'formula_type': w.formula_type,
                'lines_count': w.lines_count,
                'items_per_sheet': w.items_per_sheet,
                'total_price': float(w.total_price),
                'formatted_total_price': f"{w.total_price:.2f} ₽",
            })

        # Ламинация (OneToOne, может отсутствовать).
        lamination_data = None
        lamination = getattr(comp, 'lamination', None)
        if lamination is not None and lamination.is_enabled:
            lamination_data = {
                'is_enabled': True,
                'side': lamination.side,
                'side_display': lamination.get_side_display(),
                'laminator_name': lamination.laminator.name if lamination.laminator else None,
                'film_name': lamination.film.name if lamination.film else None,
                'laminator_price': float(lamination.laminator_price),
                'film_price': float(lamination.film_price),
                'total_price': float(lamination.total_price),
                'formatted_total_price': f"{lamination.total_price:.2f} ₽",
            }

        # Одностраничный расчёт (OneToOne, может отсутствовать).
        vich_data = None
        vich = getattr(comp, 'vichisliniya', None)
        if vich is not None:
            vich_data = {
                'item_width': float(vich.item_width),
                'item_height': float(vich.item_height),
                'vyleta': vich.vyleta,
                'color': vich.color,
                'fit_horizontal': vich.fit_horizontal,
                'fit_vertical': vich.fit_vertical,
                'fit_total': vich.fit_total,
                'fit_selected_orientation': vich.fit_selected_orientation,
                'list_count': float(vich.list_count),
                'cuts_count': vich.cuts_count,
            }

        # Многостраничный расчёт (OneToOne, может отсутствовать).
        mp_data = None
        mp = getattr(comp, 'multipage', None)
        if mp is not None:
            mp_data = {
                'binding_name': mp.binding.name if mp.binding else None,
                'total_pages': mp.total_pages,
                'copies': mp.copies,
                'finished_width': float(mp.finished_width),
                'finished_height': float(mp.finished_height),
                'vyleta': mp.vyleta,
                'color': mp.color,
                'booklet_orientation': mp.booklet_orientation,
                # ===== Поля размещения страниц — нужны для отрисовки раскладки =====
                'fit_horizontal': mp.fit_horizontal,
                'fit_vertical': mp.fit_vertical,
                'fit_total': mp.fit_total,
                'fit_landscape_total': mp.fit_landscape_total,
                'fit_portrait_total': mp.fit_portrait_total,
                'fit_selected_orientation': mp.fit_selected_orientation,
                # ===== Результат и признак активности =====
                'sheet_count': float(mp.sheet_count),
                'is_active': mp.is_active,
            }

        components_data.append({
            'id': comp.id,
            'number': comp.number or '',
            'position': comp.position,
            'printer_name': comp.printer.name if comp.printer else None,
            'paper_name': comp.paper.name if comp.paper else None,
            # ===== Размеры печатного листа принтера (для раскладки) =====
            'sheet_width': float(comp.printer.sheet_format.width_mm) if (comp.printer and comp.printer.sheet_format) else None,
            'sheet_height': float(comp.printer.sheet_format.height_mm) if (comp.printer and comp.printer.sheet_format) else None,
            'margin': float(comp.printer.margin_mm) if (comp.printer and comp.printer.margin_mm is not None) else None,            
            'print_type': comp.print_type,
            'print_type_display': comp.get_print_type_display(),
            'printing_mode': comp.printing_mode,
            'printing_mode_display': comp.get_printing_mode_display(),
            'color_mode': comp.color_mode,
            'price_per_sheet': float(comp.price_per_sheet) if comp.price_per_sheet is not None else 0.0,
            'formatted_price_per_sheet': f"{comp.price_per_sheet:.2f} ₽" if comp.price_per_sheet is not None else "—",
            'sheet_count': float(comp.sheet_count),
            'formatted_sheet_count': f"{comp.sheet_count:.2f}",
            'runs_count': comp.runs_count,
            'material_price': float(comp.material_price),
            'formatted_material_price': f"{comp.material_price:.2f} ₽",
            'total_circulation_price': float(comp.total_circulation_price),
            'formatted_total_circulation_price': f"{comp.total_circulation_price:.2f} ₽",
            'works': works_data,
            'lamination': lamination_data,
            'vichisliniya': vich_data,
            'multipage': mp_data,
        })

    # --- Ответ ---
    return JsonResponse({
        'success': True,
        'product': {
            'id': product.id,
            'title': product.title,
            'circulation': product.circulation,
            'total_price': float(product.total_price),
            'formatted_total_price': product.formatted_total_price,
            'created_at': product.created_at.strftime('%d.%m.%Y %H:%M'),
            'source_proschet_number': product.source_proschet.number if product.source_proschet else None,
            'source_template_name': product.source_template.name if product.source_template else None,
            # ===== ЗАМОРОЖЕННЫЕ МАССА / ОБЪЁМ / СТОПКИ =====
            'frozen_total_mass_g': float(product.frozen_total_mass_g),
            'frozen_total_volume_cm3': float(product.frozen_total_volume_cm3),
            'frozen_stacks': product.frozen_stacks or [],
            'components': components_data,
        }
    })


# ============================================================================
# API 6: HTML-ПАРТИАЛ СПИСКА ЗАКАЗОВ (для перерисовки tbody без перезагрузки)
# ============================================================================

@login_required
@require_GET
def api_rows(request):
    """
    Возвращает HTML-партиал orders/sections/_order_rows.html
    с актуальным списком не удалённых заказов.

    Используется JS секции «Список заказов» после создания, удаления
    или инлайн-редактирования заказа — чтобы перерисовать только tbody
    таблицы, без перезагрузки всей страницы. Это сохраняет открытые
    модалки, введённые фильтры поиска и прокрутку.

    Сортировка и фильтр — те же, что в index(): по дате создания (новые
    сверху), без удалённых.

    select_related('client') — подгружаем клиента одним JOIN-запросом,
    чтобы в шаблоне order.client.name не породил N+1.
    """
    orders = (
        Order.objects
        .filter(is_deleted=False)
        .select_related('client')
        .order_by('-created_at')
    )
    return render(
        request,
        'orders/sections/_order_rows.html',
        {'orders': orders},
    )

# ============================================================================
# API 7: РУЧНОЕ СОЗДАНИЕ ЗАКАЗА
# ============================================================================

@login_required
@require_POST
def api_create_order(request):
    """
    Создаёт новый заказ вручную (без изделий) из формы «Создать».

    Принимает form-data (не JSON):
        client           — id клиента или пустая строка (необязателен);
        comment          — текст комментария (необязателен);
        ready_datetime   — 'YYYY-MM-DDTHH:MM' (значение от <input datetime-local>)
                           или пустая строка (тогда сервер применит дефолт модели:
                           15:00 следующего рабочего дня).

    Возвращает JSON:
        {success: true, order: {id, number, client_name, status,
                                 ready_datetime, comment, created_at}}
    Или:
        {success: false, error: '...'} + статус 400/500.

    ВАЖНО про часовой пояс:
        <input type="datetime-local"> даёт «локальную» строку без зоны.
        Пользователь вводит её в московском времени. Чтобы Django сохранил
        правильный UTC-момент (а в интерфейсе потом отобразилось ровно то,
        что ввёл пользователь), делаем три шага:
            1) strptime → naive datetime;
            2) make_aware(…, Europe/Moscow) → aware в МСК;
            3) Django сам переведёт его в UTC при сохранении
               (при условии USE_TZ=True в settings — что в проекте включено).
        Та же логика, что в counter/consumers.py::add_order_with_client.
    """
    # --- Берём поля формы. get(...) с дефолтом: отсутствие поля не ломает запрос. ---
    client_id_raw   = (request.POST.get('client')         or '').strip()
    comment_raw     = (request.POST.get('comment')        or '').strip()
    ready_raw       = (request.POST.get('ready_datetime') or '').strip()

    # --- Клиент (необязателен). Если id задан — ищем в БД. ---
    client = None
    if client_id_raw:
        try:
            from baza_klientov.models import Client
            client = Client.objects.get(id=client_id_raw)
        except (ImportError, Client.DoesNotExist):
            return JsonResponse(
                {'success': False, 'error': 'Клиент не найден'},
                status=404,
            )

    # --- Дата готовности. ---
    # Пусто → не передаём поле в create(): модель подставит default_ready_datetime().
    # Непусто → парсим и делаем aware в московском поясе.
    ready_datetime_parsed = None
    if ready_raw:
        try:
            # 1) 'YYYY-MM-DDTHH:MM' → naive datetime
            naive = datetime.strptime(ready_raw, '%Y-%m-%dT%H:%M')
            # 2) Проставляем часовой пояс проекта (Europe/Moscow из settings).
            #    timezone.get_current_timezone() берёт значение из TIME_ZONE.
            ready_datetime_parsed = timezone.make_aware(
                naive, timezone.get_current_timezone()
            )
        except ValueError:
            return JsonResponse(
                {'success': False, 'error': 'Некорректный формат даты готовности'},
                status=400,
            )

    # --- Создаём заказ. ---
    # Собираем kwargs только с теми полями, которые реально передаём.
    # Если ready_datetime_parsed = None — поле не передаём,
    # сработает default модели.
    create_kwargs = {
        'client':     client,
        'comment':    comment_raw,
        'created_by': request.user,
    }
    if ready_datetime_parsed is not None:
        create_kwargs['ready_datetime'] = ready_datetime_parsed

    try:
        order = Order.objects.create(**create_kwargs)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse(
            {'success': False, 'error': f'Внутренняя ошибка: {e}'},
            status=500,
        )

    # Отправляем WebSocket-событие «заказ создан».
    _send_order_event('created', order, request)

    # --- Ответ. Формат — плоский, JS (шаг 5) им и воспользуется. ---
    return JsonResponse({
        'success': True,
        'order': {
            'id':              order.id,
            'number':          order.number,
            'client_name':     order.client.name if order.client else '',
            'client_id':       order.client.id if order.client else None,
            'status':          order.status,
            'status_display':  order.get_status_display(),
            'ready_datetime':  order.ready_datetime.strftime('%d.%m.%Y %H:%M'),
            'comment':         order.comment or '',
            'created_at':      order.created_at.strftime('%d.%m.%Y %H:%M'),
        },
    })


# ============================================================================
# API 8: ИНЛАЙН-РЕДАКТИРОВАНИЕ ПОЛЯ ЗАКАЗА
# ============================================================================

@login_required
@require_POST
def api_update_order(request, order_id):
    """
    Обновляет одно поле заказа (инлайн-редактирование в списке).

    URL: /orders/api/order/<order_id>/update-field/

    Принимает form-data:
        field_name   — 'client' | 'status' | 'ready_datetime' | 'comment';
        field_value  — новое значение в виде строки.

    Возвращает JSON:
        {
          success: true,
          order: {
            id, number, client_id, client_name, status, status_display,
            ready_datetime (dd.mm.YYYY HH:MM), comment, created_at,
            products_count, total_price
          }
        }
    Или:
        {success: false, error: '...'} + статус 400/404.

    ВАЖНО:
        Поле ready_datetime модели обязательное (не null),
        поэтому пустое значение отклоняем с 400.
        Часовой пояс — тот же приём, что в api_create_order
        (make_aware в Europe/Moscow → Django сохранит в UTC).
    """
    # --- Находим заказ. Только неудалённый. ---
    order = get_object_or_404(Order, pk=order_id, is_deleted=False)

    field_name  = (request.POST.get('field_name')  or '').strip()
    field_value = (request.POST.get('field_value') or '').strip()

    # --- Ветвление по полю. ---
    if field_name == 'client':
        # Пусто → «без клиента». Иначе — ищем клиента по id.
        if field_value == '':
            order.client = None
        else:
            try:
                from baza_klientov.models import Client
                client = Client.objects.get(id=field_value)
                order.client = client
            except (ImportError, Client.DoesNotExist):
                return JsonResponse(
                    {'success': False, 'error': 'Клиент не найден'},
                    status=404,
                )

    elif field_name == 'status':
        # Проверяем, что значение есть в списке choices.
        allowed_statuses = {choice[0] for choice in Order.STATUS_CHOICES}
        if field_value not in allowed_statuses:
            return JsonResponse(
                {'success': False, 'error': 'Недопустимое значение статуса'},
                status=400,
            )
        order.status = field_value

    elif field_name == 'ready_datetime':
        # Пустое значение не принимаем — поле обязательное.
        if not field_value:
            return JsonResponse(
                {'success': False, 'error': 'Дата готовности не может быть пустой'},
                status=400,
            )
        try:
            naive = datetime.strptime(field_value, '%Y-%m-%dT%H:%M')
            order.ready_datetime = timezone.make_aware(
                naive, timezone.get_current_timezone()
            )
        except ValueError:
            return JsonResponse(
                {'success': False, 'error': 'Некорректный формат даты готовности'},
                status=400,
            )

    elif field_name == 'comment':
        # Ограничение длины — как в proschety.views.update_proschet_comment.
        if len(field_value) > 5000:
            return JsonResponse(
                {'success': False, 'error': 'Комментарий не должен превышать 5000 символов'},
                status=400,
            )
        order.comment = field_value

    else:
        return JsonResponse(
            {'success': False, 'error': f'Поле "{field_name}" не поддерживается'},
            status=400,
        )

    # --- Сохраняем. update_fields — чтобы не трогать лишнего
    #     (updated_at = auto_now обновится автоматически при .save()). ---
    try:
        order.save()
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse(
            {'success': False, 'error': f'Внутренняя ошибка: {e}'},
            status=500,
        )

    # Отправляем WebSocket-событие «заказ обновлён».
    _send_order_event('updated', order, request)

    # --- Ответ в том же формате, что api_create_order (плюс два поля для строки). ---
    return JsonResponse({
        'success': True,
        'order': {
            'id':             order.id,
            'number':         order.number,
            'client_id':      order.client.id if order.client else None,
            'client_name':    order.client.name if order.client else '',
            'status':         order.status,
            'status_display': order.get_status_display(),
            'ready_datetime': order.ready_datetime.strftime('%d.%m.%Y %H:%M'),
            'comment':        order.comment or '',
            'created_at':     order.created_at.strftime('%d.%m.%Y %H:%M'),
            'products_count': order.products.filter(is_deleted=False).count(),
            'total_price':    order.formatted_total_price,
        },
    })


# ============================================================================
# API 9: МЯГКОЕ УДАЛЕНИЕ ЗАКАЗА
# ============================================================================

@login_required
@require_POST
def api_delete_order(request, order_id):
    """
    Мягкое удаление заказа (is_deleted=True).

    URL: /orders/api/order/<order_id>/delete/

    Ничего не принимает в теле (кроме CSRF).

    Возвращает JSON:
        {success: true, order_id, message}
    Или:
        {success: false, error: '...'} + статус 404.

    ВАЖНО:
        Заказ помечается is_deleted=True, но физически остаётся в БД.
        Это соответствует поведению удаления в других приложениях
        (proschety, calculator) и позволяет восстановить его через
        админку. Связанные изделия (Product) не трогаем — они
        фильтруются по собственному is_deleted в других местах
        и останутся в БД как снимки.
    """
    order = get_object_or_404(Order, pk=order_id, is_deleted=False)

    order.is_deleted = True
    order.save(update_fields=['is_deleted'])

    # Отправляем WebSocket-событие «заказ удалён».
    _send_order_event('deleted', order, request)

    return JsonResponse({
        'success': True,
        'order_id': order.id,
        'message': f'Заказ {order.number} удалён',
    })


# ============================================================================
# ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: ОТПРАВКА WEBSOCKET-СОБЫТИЯ
# ============================================================================

def _send_order_event(event_type, order, request):
    """
    Отправляет событие в WebSocket-группу 'orders_list' (см. orders/consumers.py).
    Это заставит все открытые вкладки /orders/ перерисовать таблицу или показать тост.
    
    event_type: 'created' | 'updated' | 'deleted'
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
        
    # Определяем имя пользователя для красивого уведомления
    actor_username = ''
    if request.user and request.user.is_authenticated:
        actor_username = request.user.get_full_name() or request.user.username

    # Отправляем в группу
    async_to_sync(channel_layer.group_send)(
        'orders_list',
        {
            'type': 'order_event',
            'event': event_type,
            'order_id': order.id,
            'order_number': order.number,
            'actor_username': actor_username,
            'actor_session_key': request.session.session_key or '',
        }
    )