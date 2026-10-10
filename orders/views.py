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
    Пока выводит список не удалённых заказов (без интерактива).
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

    # Формируем контекст для шаблона.
    context = {
        'orders': orders,                              # Список заказов
        'active_app': 'orders',                        # Активное приложение (для подсветки в панели)
        'page_title': 'Заказы',                        # Заголовок страницы
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

from django.http import JsonResponse                     # Ответ в формате JSON
from django.shortcuts import get_object_or_404           # 404, если объект не найден
from django.views.decorators.http import require_POST, require_GET  # Ограничение методов

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
                'sheet_count': float(mp.sheet_count),
                'is_active': mp.is_active,
            }

        components_data.append({
            'id': comp.id,
            'number': comp.number or '',
            'position': comp.position,
            'printer_name': comp.printer.name if comp.printer else None,
            'paper_name': comp.paper.name if comp.paper else None,
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
            'components': components_data,
        }
    })