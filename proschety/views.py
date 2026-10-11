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