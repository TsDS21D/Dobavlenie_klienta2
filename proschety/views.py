# proschety/views.py
#
# View-функции приложения "Просчёты" (новая альтернативная страница).
#
# ВАЖНО: это СВОИ view. Логику калькулятора (calculator/views.py)
# и логику справочника шаблонов (shablony_proschetov/views.py)
# мы не трогаем и не копируем. Все данные страница получает
# из тех же моделей и через СУЩЕСТВУЮЩИЕ API.

import json

from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_POST

from django.views.decorators.http import require_GET

# Модель Proschet живёт в приложении calculator.
from calculator.models_list_proschet import Proschet

# Клиенты нужны для выпадающего списка в форме создания просчёта.
from baza_klientov.models import Client

# Категории и шаблоны нужны для модалки выбора шаблона.
# Данные передаём в шаблон в виде JSON — JS сам построит дерево.
from shablony_proschetov.models import TemplateCategory, ProschetTemplate

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


@login_required(login_url='/login/')
@never_cache
def index(request):
    """
    Главная страница приложения «Просчёты».

    В контекст передаём:
      - proschets       — активные (не удалённые) просчёты,
      - clients         — все клиенты (для выпадающего списка),
      - categories_json — плоский список категорий шаблонов (id, name, parent_id, level),
      - templates_json  — плоский список шаблонов (id, name, category_id),
      - is_admin        — доступ к выбору шаблона только для админов,
      - active_app      — для подсветки в боковой панели.
    """
    proschets = Proschet.objects.filter(is_deleted=False).order_by('-created_at')
    clients = Client.objects.all().order_by('client_number')

    # Категории в MPTT-порядке (tree_id, lft).
    categories_qs = TemplateCategory.objects.all()
    categories_data = [
        {
            'id': c.id,
            'name': c.name,
            'parent_id': c.parent_id,
            'level': c.level,
        }
        for c in categories_qs
    ]

    # Шаблоны (только то, что нужно для модалки).
    templates_qs = ProschetTemplate.objects.all()
    templates_data = [
        {
            'id': t.id,
            'name': t.name,
            'category_id': t.category_id,
        }
        for t in templates_qs
    ]

    context = {
        'proschets': proschets,
        'clients': clients,
        'categories_json': json.dumps(categories_data, ensure_ascii=False),
        'templates_json': json.dumps(templates_data, ensure_ascii=False),
        'is_admin': request.user.is_staff,
        'active_app': 'proschety',
        # session_key текущего пользователя — прокидываем в JS,
        # чтобы фильтровать «свои» WebSocket-уведомления.
        # Из cookie его прочитать нельзя (HttpOnly).
        'session_key': request.session.session_key or '',
    }
    return render(request, 'proschety/index.html', context)

@login_required(login_url='/login/')
@require_POST
def delete_proschet(request, proschet_id):
    """
    Мягкое удаление просчёта (is_deleted=True).

    Свой эндпоинт приложения proschety. После сохранения отправляет
    событие в WebSocket-группу proschety_list, чтобы все открытые окна
    /proschety/ получили уведомление «такой-то просчёт удалён».
    """
    proschet = get_object_or_404(Proschet, pk=proschet_id, is_deleted=False)

    proschet.is_deleted = True
    proschet.save(update_fields=['is_deleted'])

    # Отправляем WebSocket-событие.
    actor_username = ''
    if request.user and request.user.is_authenticated:
        actor_username = request.user.get_full_name() or request.user.username

    channel_layer = get_channel_layer()
    if channel_layer is not None:
        async_to_sync(channel_layer.group_send)(
            'proschety_list',
            {
                'type': 'proschet_event',
                'event': 'deleted',
                'proschet_id': proschet.id,
                'proschet_number': proschet.number,
                'proschet_title': proschet.title,
                'actor_username': actor_username,
                'actor_session_key': request.session.session_key or '',
            }
        )

    return JsonResponse({
        'success': True,
        'proschet_id': proschet.id,
        'message': f'Просчёт {proschet.number} удалён',
    })


@login_required(login_url='/login/')
@require_GET
def api_rows(request):
    """
    Возвращает HTML-партиал _proschet_rows.html с актуальным списком
    активных (не удалённых) просчётов.

    Используется JS после создания/удаления просчёта, чтобы
    перерисовать tbody таблицы без перезагрузки страницы.
    Логика фильтрации и сортировки — та же, что в index().
    """
    proschets = Proschet.objects.filter(is_deleted=False).order_by('-created_at')
    return render(
        request,
        'proschety/sections/_proschet_rows.html',
        {'proschets': proschets},
    )

@login_required(login_url='/login/')
@require_POST
def update_proschet_comment(request, proschet_id):
    """
    Обновляет комментарий просчёта.

    Свой эндпоинт приложения proschety — потому что в calculator
    такого API нет. Работает с уже существующим полем Proschet.comment
    (добавлено миграцией calculator.0044_proschet_comment).

    Принимает POST: comment=<текст>.
    Возвращает JSON: {success, comment, message}.
    """
    proschet = get_object_or_404(Proschet, pk=proschet_id, is_deleted=False)

    new_comment = request.POST.get('comment', '')

    # Ограничение длины — защита от «мегабайтных» комментариев.
    if len(new_comment) > 5000:
        return JsonResponse({
            'success': False,
            'message': 'Комментарий не должен превышать 5000 символов',
        }, status=400)

    proschet.comment = new_comment
    proschet.save(update_fields=['comment'])

    return JsonResponse({
        'success': True,
        'proschet_id': proschet.id,
        'comment': proschet.comment,
        'message': 'Комментарий обновлён',
    })


@login_required(login_url='/login/')
@require_GET
def api_proschet_detail(request, proschet_id):
    """
    Возвращает актуальные данные просчёта для секции «Просчёт».

    Используется при клике по строке в списке — чтобы получить свежие
    тираж, комментарий, скидку клиента (в другом окне они могли устареть).
    """
    proschet = get_object_or_404(Proschet, pk=proschet_id, is_deleted=False)

    discount = ''
    if proschet.client and proschet.client.discount is not None:
        discount = str(proschet.client.discount)

    return JsonResponse({
        'success': True,
        'proschet': {
            'id': proschet.id,
            'number': proschet.number,
            'title': proschet.title,
            'circulation': proschet.circulation,
            'comment': proschet.comment or '',
            'discount': discount,
        }
    })


@login_required(login_url='/login/')
@require_POST
def api_notify_change(request, proschet_id):
    """
    Отправляет WebSocket-событие 'updated' в группу proschety_list.

    Вызывается из JS ПОСЛЕ успешного сохранения любого поля просчёта
    (тираж, комментарий, клиент, название). Сам просчёт не изменяет —
    это только «уведомитель» для других открытых окон.
    """
    proschet = get_object_or_404(Proschet, pk=proschet_id, is_deleted=False)

    changed_field = request.POST.get('field_name', '')

    actor_username = ''
    if request.user and request.user.is_authenticated:
        actor_username = request.user.get_full_name() or request.user.username

    channel_layer = get_channel_layer()
    if channel_layer is not None:
        async_to_sync(channel_layer.group_send)(
            'proschety_list',
            {
                'type': 'proschet_event',
                'event': 'updated',
                'proschet_id': proschet.id,
                'proschet_number': proschet.number,
                'proschet_title': proschet.title,
                'changed_field': changed_field,
                'actor_username': actor_username,
                'actor_session_key': request.session.session_key or '',
            }
        )

    return JsonResponse({'success': True})


# ============================================================================
# ОБЕРТКИ НАД CALCULATOR ДЛЯ ПРИМЕНЕНИЯ СКИДКИ КЛИЕНТА
# ============================================================================
import json
from decimal import Decimal
# Импортируем оригинальные вьюхи калькулятора, чтобы переиспользовать их логику
from calculator.views import (
    get_proschet_price_data as calc_get_price_data,
    get_print_components as calc_get_print_components,
    get_lamination_data as calc_get_lamination,
    get_additional_works as calc_get_works
)

def apply_discount(price, discount_percent):
    """Вспомогательная функция для применения скидки к числу."""
    if not discount_percent or discount_percent <= 0:
        return price
    return price * (1 - float(discount_percent) / 100.0)

@login_required(login_url='/login/')
@require_GET
def api_price_data_with_discount(request, proschet_id):
    """Возвращает итоговые данные просчёта с применённой скидкой клиента."""
    # 1. Получаем оригинальный ответ от калькулятора
    resp = calc_get_price_data(request, proschet_id)
    if resp.status_code != 200:
        return resp
    
    data = json.loads(resp.content)
    if not data.get('success'):
        return resp

    # 2. Получаем скидку
    proschet = Proschet.objects.get(id=proschet_id)
    discount = float(proschet.client.discount) if proschet.client and proschet.client.discount else 0.0

    # 3. Применяем скидку ко всем числовым полям
    if discount > 0:
        # Итоговая сумма
        if 'summary' in data and 'total_price' in data['summary']:
            orig_total = float(data['summary']['total_price'])
            data['summary']['original_total_price'] = orig_total
            data['summary']['total_price'] = str(apply_discount(orig_total, discount))
            data['summary']['formatted_total_price'] = f"{apply_discount(orig_total, discount):.2f} ₽"

        # Печатные компоненты
        for comp in data.get('print_components', []):
            comp['original_price_per_sheet'] = float(comp['price_per_sheet'])
            comp['price_per_sheet'] = apply_discount(float(comp['price_per_sheet']), discount)
            comp['total_circulation_price'] = apply_discount(float(comp['total_circulation_price']), discount)
            comp['paper_price'] = apply_discount(float(comp['paper_price']), discount)

        # Работы
        for work in data.get('additional_works', []):
            work['original_total_price'] = float(work['total_price'])
            work['total_price'] = apply_discount(float(work['total_price']), discount)

        # Ламинация
        for lam in data.get('laminations', []):
            lam['original_total_price'] = float(lam['total_price'])
            lam['total_price'] = apply_discount(float(lam['total_price']), discount)

    data['discount_percent'] = discount
    return JsonResponse(data)

@login_required(login_url='/login/')
@require_GET
def api_print_components_with_discount(request, proschet_id):
    """Возвращает компоненты печати с учётом скидки."""
    resp = calc_get_print_components(request, proschet_id)
    if resp.status_code != 200:
        return resp
    
    data = json.loads(resp.content)
    if not data.get('success'):
        return resp

    proschet = Proschet.objects.get(id=proschet_id)
    discount = float(proschet.client.discount) if proschet.client and proschet.client.discount else 0.0

    if discount > 0:
        for comp in data.get('components', []):
            comp['original_price_per_sheet'] = float(comp['price_per_sheet'])
            comp['price_per_sheet'] = str(apply_discount(float(comp['price_per_sheet']), discount))
            comp['formatted_price_per_sheet'] = f"{apply_discount(float(comp['price_per_sheet']), discount):.2f} ₽"
            
            comp['original_total_circulation_price'] = float(comp['total_circulation_price'])
            comp['total_circulation_price'] = str(apply_discount(float(comp['total_circulation_price']), discount))
            comp['formatted_total_circulation_price'] = f"{apply_discount(float(comp['total_circulation_price']), discount):.2f} ₽"
            
            comp['original_paper_price'] = float(comp['paper_price'])
            comp['paper_price'] = apply_discount(float(comp['paper_price']), discount)

    data['discount_percent'] = discount
    return JsonResponse(data)

@login_required(login_url='/login/')
@require_GET
def api_lamination_with_discount(request, component_id):
    """Возвращает данные ламинации с учётом скидки."""
    resp = calc_get_lamination(request, component_id)
    if resp.status_code != 200:
        return resp
    
    data = json.loads(resp.content)
    if not data.get('success'):
        return resp

    # Нам нужен просчёт, к которому относится компонент, чтобы узнать скидку
    from calculator.models_list_proschet import PrintComponent
    comp = PrintComponent.objects.get(id=component_id)
    discount = float(comp.proschet.client.discount) if comp.proschet.client and comp.proschet.client.discount else 0.0

    if discount > 0:
        lam = data.get('lamination', {})
        if 'total_price' in lam:
            lam['original_total_price'] = float(lam['total_price'])
            lam['total_price'] = apply_discount(float(lam['total_price']), discount)
            lam['total_price_display'] = f"{apply_discount(float(lam['total_price']), discount):.2f} ₽"

    data['discount_percent'] = discount
    return JsonResponse(data)

@login_required(login_url='/login/')
@require_GET
def api_additional_works_with_discount(request, component_id):
    """Возвращает дополнительные работы с учётом скидки."""
    resp = calc_get_works(request, component_id)
    if resp.status_code != 200:
        return resp
    
    data = json.loads(resp.content)
    if not data.get('success'):
        return resp

    from calculator.models_list_proschet import PrintComponent
    comp = PrintComponent.objects.get(id=component_id)
    discount = float(comp.proschet.client.discount) if comp.proschet.client and comp.proschet.client.discount else 0.0

    if discount > 0:
        for work in data.get('works', []):
            work['original_total_price'] = float(work['total_price'])
            work['total_price'] = str(apply_discount(float(work['total_price']), discount))
            work['formatted_total_price'] = f"{apply_discount(float(work['total_price']), discount):.2f} ₽"

    data['discount_percent'] = discount
    return JsonResponse(data)