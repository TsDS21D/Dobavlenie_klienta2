# shablony_proschetov/views.py
"""
Представления (views) приложения "Справочник шаблонов просчётов".

Содержит:
- index:              HTML-страница справочника (дерево + превью).
- template_preview:   AJAX-эндпоинт, возвращает JSON-описание шаблона для превью.
- category_create:    AJAX-эндпоинт, создаёт корневую категорию или подкатегорию.
- category_rename:    AJAX-эндпоинт, переименовывает категорию.
- category_delete:    AJAX-эндпоинт, удаляет категорию (только пустую).

Все изменяющие эндпоинты доступны только администратору (is_staff).

Создание/удаление/редактирование шаблонов и создание просчёта из шаблона
будут добавлены отдельными шагами.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
import json                                            # Разбор JSON из тела запроса
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required, user_passes_test
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

# ===== ИМПОРТЫ НАШИХ МОДЕЛЕЙ =====
from .models import TemplateCategory, ProschetTemplate

# ===== ИМПОРТЫ СЕРВИСНЫХ ФУНКЦИЙ =====
from .services import create_proschet_from_template, save_proschet_as_template

# ===== ИМПОРТ МОДЕЛИ ПРОСЧЁТА ИЗ calculator =====
# Нужна для функции index() (поиск просчёта по proschet_id из GET)
# и для save_from_proschet() (получение просчёта, который сохраняем как шаблон).
from calculator.models_list_proschet import Proschet

# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================================

def _is_admin(user):
    """
    Проверка: является ли пользователь администратором (is_staff).
    Используется в декораторе @user_passes_test.
    """
    return user.is_authenticated and user.is_staff


def _parse_json(request):
    """
    Разбирает тело запроса как JSON.
    Возвращает dict или бросает ValueError с понятным сообщением.
    """
    try:
        return json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError('Некорректный JSON в теле запроса')


# ============================================================================
# ГЛАВНАЯ СТРАНИЦА И ПРЕВЬЮ
# ============================================================================

@login_required(login_url='/counter/login/')
@never_cache
def index(request):
    """
    Главная страница справочника шаблонов.

    Дополнительно: если в GET пришёл proschet_id — пробуем найти этот
    просчёт и передать в шаблон, чтобы показать панель «Сохранить как шаблон».
    """
    categories = TemplateCategory.objects.all()
    templates = (
        ProschetTemplate.objects
        .select_related('category', 'created_by', 'source_proschet')
    )

    # Плоский список категорий для выпадающего списка в панели сохранения.
    categories_flat = []
    for cat in categories:
        path_parts = [a.name for a in cat.get_ancestors(include_self=True)]
        categories_flat.append({
            'id': cat.id,
            'path': ' / '.join(path_parts),
        })

    # Если пришёл proschet_id — пробуем найти просчёт.
    source_proschet = None
    source_id = request.GET.get('proschet_id', '')
    if source_id:
        try:
            source_proschet = Proschet.objects.get(id=source_id, is_deleted=False)
        except (Proschet.DoesNotExist, ValueError):
            source_proschet = None

    context = {
        'user': request.user,
        'active_app': 'shablony_proschetov',
        'page_title': 'Справочник шаблонов просчётов',
        'categories': categories,
        'categories_flat': categories_flat,
        'templates': templates,
        'is_admin': request.user.is_staff,
        'source_proschet': source_proschet,
    }
    return render(request, 'shablony_proschetov/index.html', context)


@login_required
@require_GET
def template_preview(request, template_id):
    """AJAX-эндпоинт: возвращает JSON с полной информацией о шаблоне."""
    template = get_object_or_404(
        ProschetTemplate.objects
        .select_related('category', 'created_by', 'source_proschet')
        .prefetch_related(
            'components__printer',
            'components__paper',
            'components__works',
            'components__lamination__laminator',
            'components__lamination__film',
            'components__vichisliniya',
            'components__multipage__binding',
        ),
        pk=template_id
    )

    components_data = []
    for comp in template.components.all().order_by('order', 'id'):
        works_data = []
        for w in comp.works.all():
            works_data.append({
                'title': w.title,
                'quantity': w.quantity,
                'price': str(w.price),
            })

        lamination_data = None
        lamination = getattr(comp, 'lamination', None)
        if lamination is not None:
            lamination_data = {
                'is_enabled': lamination.is_enabled,
                'side_display': lamination.get_side_display(),
                'laminator': lamination.laminator.name if lamination.laminator else None,
                'film': lamination.film.name if lamination.film else None,
            }

        vich_data = None
        vichisliniya = getattr(comp, 'vichisliniya', None)
        if vichisliniya is not None:
            vich_data = {
                'item_width': float(vichisliniya.item_width),
                'item_height': float(vichisliniya.item_height),
                'vyleta': vichisliniya.vyleta,
                'color': vichisliniya.color,
            }

        multipage_data = None
        multipage = getattr(comp, 'multipage', None)
        if multipage is not None:
            multipage_data = {
                'binding': multipage.binding.name if multipage.binding else None,
                'total_pages': multipage.total_pages,
                'finished_width': float(multipage.finished_width),
                'finished_height': float(multipage.finished_height),
                'is_active': multipage.is_active,
            }

        components_data.append({
            'order': comp.order,
            'printer': comp.printer.name if comp.printer else None,
            'paper': comp.paper.name if comp.paper else None,
            'print_type': comp.print_type,
            'print_type_display': comp.get_print_type_display(),
            'printing_mode': comp.printing_mode,
            'printing_mode_display': comp.get_printing_mode_display(),
            'works': works_data,
            'lamination': lamination_data,
            'vichisliniya': vich_data,
            'multipage': multipage_data,
        })

    return JsonResponse({
        'success': True,
        'template': {
            'id': template.id,
            'name': template.name,
            'category': template.category.name,
            'comment': template.comment or '',
            'circulation': template.circulation,
            'created_at': template.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': template.updated_at.strftime('%d.%m.%Y %H:%M'),
            'components': components_data,
        }
    })


# ============================================================================
# API: КАТЕГОРИИ (только для администратора)
# ============================================================================

@login_required
@user_passes_test(_is_admin)
@require_POST
def category_create(request):
    """
    Создаёт категорию.

    Ожидаемый JSON в теле:
    {
        "name": "Визитки",                    # обязательное, непустое
        "parent_id": 12                       # опционально: id родительской категории
    }

    Если parent_id не указан (null или отсутствует) — создаётся корневая категория.

    Возвращает:
    {
        "success": true,
        "category": { "id": ..., "name": ..., "parent_id": ... }
    }
    """
    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'success': False, 'error': 'Название категории не может быть пустым'}, status=400)
    if len(name) > 200:
        return JsonResponse({'success': False, 'error': 'Название слишком длинное (макс. 200 символов)'}, status=400)

    parent_id = data.get('parent_id')
    parent = None
    if parent_id:
        parent = get_object_or_404(TemplateCategory, pk=parent_id)

    # Создаём категорию.
    # order — новый элемент помещаем в конец списка братьев:
    # берём максимальный order среди братьев и добавляем 1.
    siblings = TemplateCategory.objects.filter(parent=parent)
    max_order = siblings.order_by('-order').values_list('order', flat=True).first() or 0

    category = TemplateCategory.objects.create(
        name=name,
        parent=parent,
        order=max_order + 1,
    )

    return JsonResponse({
        'success': True,
        'category': {
            'id': category.id,
            'name': category.name,
            'parent_id': category.parent_id,
        }
    })


@login_required
@user_passes_test(_is_admin)
@require_POST
def category_rename(request, category_id):
    """
    Переименовывает категорию.

    Ожидаемый JSON:
    { "name": "Новое название" }
    """
    category = get_object_or_404(TemplateCategory, pk=category_id)

    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    name = (data.get('name') or '').strip()
    if not name:
        return JsonResponse({'success': False, 'error': 'Название не может быть пустым'}, status=400)
    if len(name) > 200:
        return JsonResponse({'success': False, 'error': 'Название слишком длинное'}, status=400)

    category.name = name
    category.save(update_fields=['name'])

    return JsonResponse({
        'success': True,
        'category': {
            'id': category.id,
            'name': category.name,
        }
    })


@login_required
@user_passes_test(_is_admin)
@require_POST
def category_delete(request, category_id):
    """
    Удаляет категорию.

    ВАЖНО: категория удаляется только если она ПУСТАЯ — нет ни дочерних
    категорий, ни шаблонов. Это защита от случайной потери данных.
    Для непустых категорий вернётся ошибка — пользователь сначала должен
    перенести/удалить вложенное.
    """
    category = get_object_or_404(TemplateCategory, pk=category_id)

    # Проверяем, есть ли дочерние категории.
    if category.get_children().exists():
        return JsonResponse({
            'success': False,
            'error': 'Нельзя удалить категорию: в ней есть подкатегории'
        }, status=400)

    # Проверяем, есть ли шаблоны в этой категории.
    if category.templates.exists():
        return JsonResponse({
            'success': False,
            'error': 'Нельзя удалить категорию: в ней есть шаблоны'
        }, status=400)

    category.delete()
    return JsonResponse({'success': True})

# ============================================================================
# API: СОЗДАНИЕ ПРОСЧЁТА ИЗ ШАБЛОНА (только для администратора)
# ============================================================================


@login_required
@user_passes_test(_is_admin)
@require_POST
def create_proschet(request, template_id):
    """
    Создаёт реальный просчёт из шаблона.

    Доступно только администратору.
    Возвращает JSON:
    { "success": true, "proschet_id": 42, "proschet_number": "PR-15" }
    """
    template = get_object_or_404(ProschetTemplate, pk=template_id)
    try:
        proschet = create_proschet_from_template(template)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

    return JsonResponse({
        'success': True,
        'proschet_id': proschet.id,
        'proschet_number': proschet.number,
        'proschet_title': proschet.title,
    })


# ============================================================================
# API: СОХРАНИТЬ ПРОСЧЁТ КАК ШАБЛОН (только админ)
# ============================================================================



@login_required
@user_passes_test(_is_admin)
@require_POST
def save_from_proschet(request):
    """
    Сохраняет просчёт как шаблон.

    Ожидаемый JSON:
    {
        "proschet_id": 42,
        "name": "Визитки 90x50 мм 4+0",
        "comment": "Для VIP-клиентов",
        "category_id": 3
    }

    Возвращает:
    { "success": true, "template_id": 7 }
    """
    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    proschet_id = data.get('proschet_id')
    name = (data.get('name') or '').strip()
    comment = (data.get('comment') or '').strip()
    category_id = data.get('category_id')

    # Валидация.
    if not proschet_id:
        return JsonResponse({'success': False, 'error': 'Не указан ID просчёта'}, status=400)
    if not name:
        return JsonResponse({'success': False, 'error': 'Не заполнено название шаблона'}, status=400)
    if len(name) > 200:
        return JsonResponse({'success': False, 'error': 'Название слишком длинное'}, status=400)
    if not category_id:
        return JsonResponse({'success': False, 'error': 'Не выбрана категория'}, status=400)

    proschet = get_object_or_404(Proschet, pk=proschet_id, is_deleted=False)
    category = get_object_or_404(TemplateCategory, pk=category_id)

    try:
        template = save_proschet_as_template(
            proschet=proschet,
            name=name,
            category=category,
            comment=comment,
            created_by=request.user,
        )
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)

    return JsonResponse({
        'success': True,
        'template_id': template.id,
        'message': f'Шаблон "{template.name}" сохранён в категории "{category.name}"',
    })

# ============================================================================
# API: ОБНОВЛЕНИЕ ШАБЛОНА (переименование / комментарий) — только админ
# ============================================================================

@login_required
@user_passes_test(_is_admin)
@require_POST
def template_update(request, template_id):
    """
    Обновляет название и комментарий шаблона.

    Ожидаемый JSON:
    {
        "name": "Новое название",
        "comment": "Новый комментарий"
    }

    Возвращает:
    { "success": true, "template": { "id": ..., "name": ..., "comment": ... } }
    """
    template = get_object_or_404(ProschetTemplate, pk=template_id)

    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    name = (data.get('name') or '').strip()
    comment = (data.get('comment') or '').strip()

    if not name:
        return JsonResponse({'success': False, 'error': 'Название не может быть пустым'}, status=400)
    if len(name) > 200:
        return JsonResponse({'success': False, 'error': 'Название слишком длинное (макс. 200 символов)'}, status=400)

    template.name = name
    template.comment = comment
    template.save(update_fields=['name', 'comment', 'updated_at'])

    return JsonResponse({
        'success': True,
        'template': {
            'id': template.id,
            'name': template.name,
            'comment': template.comment,
        }
    })

# ============================================================================
# API: УДАЛЕНИЕ ШАБЛОНА (только админ)
# ============================================================================

@login_required
@user_passes_test(_is_admin)
@require_POST
def template_delete(request, template_id):
    """
    Удаляет шаблон.

    ВАЖНО: удаляется только сам шаблон и его копии-вложения
    (компоненты, работы, ламинация, вычисления листов).
    Никакие реальные просчёты (Proschet) НЕ затрагиваются — они лишь
    содержат ссылку source_template, которая сбросится в NULL
    (по on_delete=SET_NULL).

    Возвращает: { "success": true }
    """
    template = get_object_or_404(ProschetTemplate, pk=template_id)

    # Название сохраняем, чтобы вернуть в ответе (после delete() объекта уже нет).
    deleted_name = template.name

    template.delete()
    return JsonResponse({'success': True, 'deleted_name': deleted_name})