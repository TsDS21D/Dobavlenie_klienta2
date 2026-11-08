# shablony_proschetov/views.py
"""
Представления (views) приложения "Справочник шаблонов просчётов".

ЛОГИКА (по образцу sklad):
- index:                          GET — рендер дерева и списка шаблонов
                                       (фильтр по category_id, панель ?proschet_id=).
- category_create/update/delete:  form-POST + редирект + Django messages.
- api_update_template_field:      AJAX — инлайн-обновление одного поля шаблона.
- api_update_template_category:   AJAX — drag&drop на узел дерева (смена категории).
- api_update_templates_order:     AJAX — drag&drop внутри списка (порядок).
- template_delete:                form-POST через модалку (удаление шаблона).
- template_preview:               AJAX — превью шаблона (как раньше).
- create_proschet:                AJAX — создать просчёт из шаблона (как раньше).
- save_from_proschet:             AJAX — сохранить просчёт как шаблон (как раньше).

Все мутирующие операции доступны только is_staff.
"""

# ===== СТАНДАРТНЫЕ ИМПОРТЫ =====
import json
from django.contrib import messages
from django.contrib.auth.decorators import login_required, user_passes_test
from django.db import transaction
from django.db.models import Max
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_POST

# ===== ИМПОРТЫ МОДЕЛЕЙ И СЕРВИСОВ ПРИЛОЖЕНИЯ =====
from .models import TemplateCategory, ProschetTemplate
from .services import create_proschet_from_template, save_proschet_as_template

# ===== ИМПОРТ УТИЛИТЫ ОТПРАВКИ WS-СОБЫТИЙ =====
from .utils import send_template_event

# ===== ИМПОРТ МОДЕЛИ ПРОСЧЁТА (для ?proschet_id= и save_from_proschet) =====
from calculator.models_list_proschet import Proschet


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================================

def _is_admin(user):
    """Проверка: is_staff. Используется в @user_passes_test."""
    return user.is_authenticated and user.is_staff


def _parse_json(request):
    """Разбирает тело запроса как JSON. Бросает ValueError при ошибке."""
    try:
        return json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError('Некорректный JSON в теле запроса')


def _redirect_to_index(category_id=None):
    """
    Редирект на /shablony/ с сохранением фильтра по категории (если задан).
    Используется во всех form-POST обработчиках категорий.
    """
    if category_id:
        return redirect(f'/shablony/?category_id={category_id}')
    return redirect('shablony_proschetov:index')


# ============================================================================
# ГЛАВНАЯ СТРАНИЦА
# ============================================================================

@login_required(login_url='/counter/login/')
@never_cache
def index(request):
    """
    Главная страница справочника шаблонов.

    GET-параметры:
      ?category_id=<id>   — фильтр по категории (если не задан — все шаблоны).
      ?proschet_id=<id>   — исходный просчёт для панели «Сохранить как шаблон».

    Форма добавления шаблона сверху отсутствует — создание шаблона
    происходит только через «Сохранить просчёт как шаблон» (панель ниже)
    или через Django-админку.
    """
    category_id = request.GET.get('category_id', '').strip()

    # Дерево категорий (MPTT-сортировка: tree_id + lft).
    categories = TemplateCategory.objects.all()

    # Список шаблонов с фильтром по категории (или без фильтра — все).
    templates_qs = (
        ProschetTemplate.objects
        .select_related('category', 'created_by', 'source_proschet')
    )
    selected_category = None
    if category_id:
        try:
            selected_category = TemplateCategory.objects.get(pk=category_id)
        except (TemplateCategory.DoesNotExist, ValueError):
            selected_category = None

    if selected_category:
        templates_qs = templates_qs.filter(category=selected_category)
    templates_qs = templates_qs.order_by('position', 'id')

    # Плоский список категорий (для выпадающего списка в панели сохранения).
    categories_flat = []
    for cat in categories:
        path_parts = [a.name for a in cat.get_ancestors(include_self=True)]
        categories_flat.append({
            'id': cat.id,
            'path': ' / '.join(path_parts),
        })

    # Исходный просчёт для панели «Сохранить как шаблон» (?proschet_id=).
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
        'selected_category': selected_category,
        'selected_category_id': category_id,
        'templates': templates_qs,
        'is_admin': request.user.is_staff,
        'source_proschet': source_proschet,
    }
    return render(request, 'shablony_proschetov/index.html', context)


# ============================================================================
# AJAX: ПРЕВЬЮ ШАБЛОНА (не меняется по логике)
# ============================================================================

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
            'category_id': template.category_id,
            'comment': template.comment or '',
            'circulation': template.circulation,
            'created_at': template.created_at.strftime('%d.%m.%Y %H:%M'),
            'updated_at': template.updated_at.strftime('%d.%m.%Y %H:%M'),
            'components': components_data,
        }
    })


# ============================================================================
# AJAX: ИНЛАЙН-ОБНОВЛЕНИЕ ПОЛЯ ШАБЛОНА (аналог sklad:api_update_material_field)
# ============================================================================

@login_required
@user_passes_test(_is_admin)
@require_POST
def api_update_template_field(request, template_id):
    """
    Инлайн-обновление одного поля шаблона через AJAX.

    Ожидаемый JSON:
    {
        "field_name":  "name" | "comment" | "circulation" | "category_id",
        "field_value": <новое значение>
    }
    """
    template = get_object_or_404(ProschetTemplate, pk=template_id)

    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    field_name = data.get('field_name')
    field_value = data.get('field_value')

    try:
        # --- name ---
        if field_name == 'name':
            value = str(field_value or '').strip()
            if not value:
                raise ValueError('Название не может быть пустым')
            if len(value) > 200:
                raise ValueError('Название слишком длинное (макс. 200 символов)')
            template.name = value

        # --- comment ---
        elif field_name == 'comment':
            template.comment = str(field_value or '').strip()

        # --- circulation (типовой тираж) ---
        elif field_name == 'circulation':
            try:
                value = int(field_value)
            except (TypeError, ValueError):
                raise ValueError('Некорректный тираж')
            if value < 1:
                raise ValueError('Тираж должен быть положительным')
            template.circulation = value

        # --- category_id ---
        elif field_name == 'category_id':
            if not field_value:
                raise ValueError('Категория обязательна')
            try:
                category = TemplateCategory.objects.get(pk=field_value)
            except TemplateCategory.DoesNotExist:
                raise ValueError('Категория не найдена')
            template.category = category

        else:
            return JsonResponse({'success': False, 'error': 'Неизвестное поле'}, status=400)

        template.save(update_fields=[field_name, 'updated_at'])

        # WS-событие для реактивности у других вкладок.
        send_template_event(
            request,
            event='updated',
            template_id=template.id,
            template_name=template.name,
            category_id=template.category_id,
            changed_field=field_name,
        )

        return JsonResponse({'success': True})

    except (ValueError, TypeError) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


# ============================================================================
# AJAX: DRAG&DROP НА УЗЕЛ ДЕРЕВА — СМЕНА КАТЕГОРИИ
# (аналог sklad:api_update_material_category)
# ============================================================================

@login_required
@user_passes_test(_is_admin)
@require_POST
def api_update_template_category(request, template_id):
    """
    Смена категории шаблона при перетаскивании на узел дерева.

    Ожидаемый JSON: {"category_id": <id>}
    """
    template = get_object_or_404(ProschetTemplate, pk=template_id)

    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    category_id = data.get('category_id')
    if not category_id:
        return JsonResponse({'success': False, 'error': 'Не указана категория'}, status=400)

    try:
        category = TemplateCategory.objects.get(pk=category_id)
    except TemplateCategory.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Категория не найдена'}, status=404)

    template.category = category
    template.save(update_fields=['category', 'updated_at'])

    send_template_event(
        request,
        event='updated',
        template_id=template.id,
        template_name=template.name,
        category_id=category.id,
        changed_field='category',
    )

    return JsonResponse({'success': True})


# ============================================================================
# AJAX: СОХРАНЕНИЕ ПОРЯДКА (drag&drop внутри списка)
# (аналог sklad:api_update_materials_order)
# ============================================================================

@login_required
@user_passes_test(_is_admin)
@require_POST
def api_update_templates_order(request):
    """
    Принимает JSON: {"order": [id1, id2, ...]}.
    Сохраняет новый порядок в поле position (нумерация с 1).
    """
    try:
        data = _parse_json(request)
    except ValueError as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

    order = data.get('order', [])
    if not isinstance(order, list):
        return JsonResponse({'success': False, 'error': 'Неверный формат данных'}, status=400)

    try:
        with transaction.atomic():
            for index, template_id in enumerate(order):
                ProschetTemplate.objects.filter(id=template_id).update(position=index + 1)
        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ============================================================================
# УДАЛЕНИЕ ШАБЛОНА (form-POST через модалку + редирект)
# ============================================================================

@login_required
@user_passes_test(_is_admin)
@require_POST
def template_delete(request, template_id):
    """
    Удаляет шаблон. Редирект на главную (с сохранением фильтра, если был).

    Ожидаемые POST-поля:
        return_category_id — id категории, на которую вернуться (необязательно).
    """
    template = get_object_or_404(ProschetTemplate, pk=template_id)
    deleted_name = template.name
    category_id = template.category_id
    return_category_id = (request.POST.get('return_category_id') or '').strip()

    # Событие отправляем ДО удаления — потом объекта уже нет (хотя имя сохранили).
    send_template_event(
        request,
        event='deleted',
        template_id=template_id,
        template_name=deleted_name,
        category_id=category_id,
        changed_field='deleted',
    )

    template.delete()
    messages.error(request, f'Шаблон «{deleted_name}» удалён')
    return _redirect_to_index(return_category_id or None)


# ============================================================================
# AJAX: СОЗДАНИЕ ПРОСЧЁТА ИЗ ШАБЛОНА (не меняется)
# ============================================================================

@login_required
@user_passes_test(_is_admin)
@require_POST
def create_proschet(request, template_id):
    """
    Создаёт реальный просчёт из шаблона. Доступно только администратору.

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
# AJAX: СОХРАНИТЬ ПРОСЧЁТ КАК ШАБЛОН (не меняется + WS-событие 'created')
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
        "name": "...",
        "comment": "...",
        "category_id": 3
    }
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

    # WS-событие: шаблон появился/перезаписан.
    send_template_event(
        request,
        event='created',
        template_id=template.id,
        template_name=template.name,
        category_id=template.category_id,
        changed_field='created',
    )

    return JsonResponse({
        'success': True,
        'template_id': template.id,
        'message': f'Шаблон "{template.name}" сохранён в категории "{category.name}"',
    })


# ============================================================================
# КАТЕГОРИИ: form-POST + редирект (как в sklad)
# ============================================================================

@login_required
@user_passes_test(_is_admin)
@require_POST
def category_create(request):
    """
    Создать категорию (form-POST).

    POST-поля:
        name               — название категории (обязательно).
        parent_id          — id родителя (опционально, иначе корневая).
        return_category_id — id категории, на которую вернуться после создания.
    """
    name = (request.POST.get('name') or '').strip()
    parent_id = (request.POST.get('parent_id') or '').strip()
    return_category_id = (request.POST.get('return_category_id') or '').strip()

    if not name:
        messages.error(request, 'Название категории обязательно')
        return _redirect_to_index(return_category_id or None)
    if len(name) > 200:
        messages.error(request, 'Название слишком длинное (макс. 200 символов)')
        return _redirect_to_index(return_category_id or None)

    parent = None
    if parent_id:
        try:
            parent = TemplateCategory.objects.get(pk=parent_id)
        except TemplateCategory.DoesNotExist:
            messages.error(request, 'Родительская категория не найдена')
            return _redirect_to_index(return_category_id or None)

    # Новый элемент помещаем в конец списка братьев.
    siblings = TemplateCategory.objects.filter(parent=parent)
    max_order = siblings.order_by('-order').values_list('order', flat=True).first() or 0

    TemplateCategory.objects.create(
        name=name,
        parent=parent,
        order=max_order + 1,
    )
    messages.success(request, f'Категория «{name}» создана')
    return _redirect_to_index(return_category_id or None)


@login_required
@user_passes_test(_is_admin)
@require_POST
def category_update(request, category_id):
    """
    Переименовать категорию (form-POST).

    POST-поля:
        name               — новое название.
        return_category_id — id категории, на которую вернуться.
    """
    category = get_object_or_404(TemplateCategory, pk=category_id)
    name = (request.POST.get('name') or '').strip()
    return_category_id = (request.POST.get('return_category_id') or '').strip()

    if not name:
        messages.error(request, 'Название не может быть пустым')
        return _redirect_to_index(return_category_id or None)
    if len(name) > 200:
        messages.error(request, 'Название слишком длинное')
        return _redirect_to_index(return_category_id or None)

    category.name = name
    category.save(update_fields=['name', 'updated_at'])
    messages.success(request, 'Категория переименована')
    return _redirect_to_index(return_category_id or None)


@login_required
@user_passes_test(_is_admin)
@require_POST
def category_delete(request, category_id):
    """
    Удалить категорию (form-POST). Только пустую — без подкатегорий и шаблонов.

    POST-поля:
        return_category_id — id категории, на которую вернуться.
    """
    category = get_object_or_404(TemplateCategory, pk=category_id)
    return_category_id = (request.POST.get('return_category_id') or '').strip()
    deleted_name = category.name

    if category.get_children().exists():
        messages.error(request, 'Нельзя удалить: в категории есть подкатегории')
        return _redirect_to_index(return_category_id or None)

    if category.templates.exists():
        messages.error(request, 'Нельзя удалить: в категории есть шаблоны')
        return _redirect_to_index(return_category_id or None)

    category.delete()
    messages.error(request, f'Категория «{deleted_name}» удалена')
    return _redirect_to_index(return_category_id or None)