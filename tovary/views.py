# tovary/views.py
"""
Представления приложения "tovary" (Справочник товаров + Дерево категорий).
"""

from decimal import Decimal, InvalidOperation

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.shortcuts import render, get_object_or_404, redirect
from django.views.decorators.cache import never_cache
from django.contrib.messages import get_messages

from .models import Tovar, Category


# ============================================================================
# 1. ГЛАВНАЯ СТРАНИЦА: ДЕРЕВО КАТЕГОРИЙ + СПИСОК ТОВАРОВ
# ============================================================================

@login_required(login_url='/login/')
@never_cache
def index(request):
    """
    Главная страница справочника.
    GET  — показать дерево категорий и список товаров (с фильтром по категории).
    POST — создать новый товар в выбранной категории.
    """
    # --- 1. Категории ---
    # MPTT сортирует их в правильном порядке дерева (по lft).
    # Берём только активные (не удалённые).
    all_categories = Category.objects.filter(is_deleted=False)

    # Выбранная категория (из GET-параметра ?category_id=X).
    selected_category_id = request.GET.get('category_id')
    selected_category = None
    if selected_category_id:
        try:
            selected_category = Category.objects.get(
                pk=selected_category_id, is_deleted=False
            )
        except Category.DoesNotExist:
            selected_category = None

    # --- 2. Товары ---
    tovary = Tovar.objects.filter(is_deleted=False)

    if selected_category is not None:
        # Показываем товары ТОЛЬКО из выбранной категории (без подкатегорий).
        tovary = tovary.filter(category=selected_category)
    # Если категория не выбрана — показываем ВСЕ товары (без фильтра).

    tovary = tovary.order_by('name', 'id')

    # --- 3. Обработка POST (создание товара) ---
    if request.method == 'POST':
        name = (request.POST.get('name') or '').strip()
        article = (request.POST.get('article') or '').strip()
        price = (request.POST.get('price') or '').strip().replace(',', '.')
        unit = (request.POST.get('unit') or 'шт.').strip() or 'шт.'
        category_id = (request.POST.get('category') or '').strip()

        errors = []
        if not name:
            errors.append('Название обязательно')

        price_dec = Decimal('0.00')
        if price:
            try:
                price_dec = Decimal(price)
                if price_dec < 0:
                    errors.append('Цена не может быть отрицательной')
            except (InvalidOperation, ValueError):
                errors.append('Некорректная цена')

        category = None
        if category_id:
            try:
                category = Category.objects.get(pk=category_id, is_deleted=False)
            except Category.DoesNotExist:
                errors.append('Категория не найдена')

        if errors:
            for e in errors:
                messages.error(request, e)
        else:
            Tovar.objects.create(
                name=name,
                category=category,
                article=article,
                price=price_dec,
                unit=unit,
            )
            messages.success(request, f'Товар «{name}» создан')
            # Редирект с сохранением выбранной категории.
            if category:
                return redirect(f'{request.path}?category_id={category.id}')
            return redirect(request.path)

    context = {
        'categories': all_categories,
        'selected_category': selected_category,
        'selected_category_id': selected_category_id,
        'tovary': tovary,
        'active_app': 'tovary',
        'page_title': 'Товары',
    }
    return render(request, 'tovary/index.html', context)


# ============================================================================
# 2. ОБНОВЛЕНИЕ ТОВАРА (инлайн)
# ============================================================================

@login_required(login_url='/login/')
def update_tovar(request, tovar_id):
    """
    Обновление товара. Принимает POST из формы редактирования.
    """
    tovar = get_object_or_404(Tovar, pk=tovar_id, is_deleted=False)

    if request.method != 'POST':
        return redirect('tovary:index')

    name = (request.POST.get('name') or '').strip()
    article = (request.POST.get('article') or '').strip()
    price = (request.POST.get('price') or '').strip().replace(',', '.')
    unit = (request.POST.get('unit') or 'шт.').strip() or 'шт.'
    category_id = (request.POST.get('category') or '').strip()

    if not name:
        messages.error(request, 'Название обязательно')
        return redirect('tovary:index')

    try:
        price_dec = Decimal(price) if price else Decimal('0.00')
        if price_dec < 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        messages.error(request, 'Некорректная цена')
        return redirect('tovary:index')

    category = None
    if category_id:
        try:
            category = Category.objects.get(pk=category_id, is_deleted=False)
        except Category.DoesNotExist:
            messages.error(request, 'Категория не найдена')
            return redirect('tovary:index')

    tovar.name = name
    tovar.article = article
    tovar.price = price_dec
    tovar.unit = unit
    tovar.category = category
    tovar.save()

    messages.success(request, f'Товар «{name}» обновлён')
    # Возврат на ту же категорию, что и была.
    ref = request.META.get('HTTP_REFERER')
    if ref:
        return redirect(ref)
    return redirect('tovary:index')


# ============================================================================
# 3. УДАЛЕНИЕ ТОВАРА
# ============================================================================

@login_required(login_url='/login/')
def delete_tovar(request, tovar_id):
    """Мягкое удаление товара."""
    tovar = get_object_or_404(Tovar, pk=tovar_id, is_deleted=False)
    tovar.is_deleted = True
    tovar.save(update_fields=['is_deleted'])
    messages.success(request, f'Товар «{tovar.name}» удалён')

    ref = request.META.get('HTTP_REFERER')
    if ref:
        return redirect(ref)
    return redirect('tovary:index')


# ============================================================================
# 4. УПРАВЛЕНИЕ КАТЕГОРИЯМИ
# ============================================================================

@login_required(login_url='/login/')
def category_create(request):
    """Создать новую категорию."""
    if request.method != 'POST':
        return redirect('tovary:index')

    name = (request.POST.get('name') or '').strip()
    parent_id = (request.POST.get('parent_id') or '').strip()

    if not name:
        messages.error(request, 'Название категории обязательно')
        return redirect('tovary:index')

    parent = None
    if parent_id:
        try:
            parent = Category.objects.get(pk=parent_id, is_deleted=False)
        except Category.DoesNotExist:
            messages.error(request, 'Родительская категория не найдена')
            return redirect('tovary:index')

    Category.objects.create(name=name, parent=parent)
    messages.success(request, f'Категория «{name}» создана')
    return redirect('tovary:index')


@login_required(login_url='/login/')
def category_update(request, category_id):
    """Переименовать категорию."""
    category = get_object_or_404(Category, pk=category_id, is_deleted=False)

    if request.method != 'POST':
        return redirect('tovary:index')

    name = (request.POST.get('name') or '').strip()
    if not name:
        messages.error(request, 'Название не может быть пустым')
        return redirect('tovary:index')

    category.name = name
    category.save(update_fields=['name'])
    messages.success(request, 'Категория переименована')
    return redirect('tovary:index')


@login_required(login_url='/login/')
def category_delete(request, category_id):
    """
    Мягкое удаление категории.
    Запрещено, если в категории есть товары.
    """
    category = get_object_or_404(Category, pk=category_id, is_deleted=False)

    # Проверка: есть ли в этой категории (или её подкатегориях) товары?
    descendants = category.get_descendants(include_self=True)
    if Tovar.objects.filter(category__in=descendants, is_deleted=False).exists():
        messages.error(
            request,
            f'Нельзя удалить категорию «{category.name}»: сначала перенесите товары '
            f'в другую категорию.'
        )
        return redirect('tovary:index')

    # Проверка: есть ли подкатегории?
    if category.get_children().filter(is_deleted=False).exists():
        messages.error(
            request,
            f'Нельзя удалить категорию «{category.name}»: сначала удалите или перенесите '
            f'вложенные категории.'
        )
        return redirect('tovary:index')

    category.is_deleted = True
    category.save(update_fields=['is_deleted'])
    messages.success(request, f'Категория «{category.name}» удалена')
    return redirect('tovary:index')

# ============================================================================
# 5. API ДЛЯ ПЕРЕНОСА ТОВАРА (AJAX)
# ============================================================================

from django.http import JsonResponse
from django.views.decorators.http import require_POST
import json

@login_required(login_url='/login/')
@require_POST
def api_move_tovar(request, tovar_id):
    """
    Переносит товар в другую категорию.
    Принимает JSON: {"category_id": 5} (или null/пусто для «Без категории»).
    """
    tovar = get_object_or_404(Tovar, pk=tovar_id, is_deleted=False)

    try:
        data = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'success': False, 'error': 'Некорректный JSON'}, status=400)

    category_id = data.get('category_id')

    if category_id:
        try:
            category = Category.objects.get(pk=category_id, is_deleted=False)
        except Category.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Категория не найдена'}, status=404)
        tovar.category = category
    else:
        tovar.category = None

    tovar.save(update_fields=['category'])
    # Очищаем очередь сообщений, чтобы старые ошибки не вылезали после перезагрузки страницы
    list(get_messages(request))

    return JsonResponse({'success': True, 'message': 'Товар перенесён'})

# ============================================================================
# API ДЛЯ ИНЛАЙН-ОБНОВЛЕНИЯ ПОЛЯ ТОВАРА
# ============================================================================

@login_required(login_url='/login/')
@require_POST
def api_update_tovar_field(request, tovar_id):
    """
    Обновляет одно поле товара (AJAX).
    Принимает JSON: {"field_name": "name", "field_value": "..."}
    """
    tovar = get_object_or_404(Tovar, pk=tovar_id, is_deleted=False)
    
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'success': False, 'error': 'Некорректный JSON'}, status=400)

    field_name = data.get('field_name')
    field_value = data.get('field_value')

    if field_name == 'name':
        if not field_value or not str(field_value).strip():
            return JsonResponse({'success': False, 'error': 'Название не может быть пустым'}, status=400)
        tovar.name = str(field_value).strip()
        
    elif field_name == 'article':
        tovar.article = (str(field_value) or '').strip()
        
    elif field_name == 'price':
        try:
            price_str = str(field_value).replace(',', '.').strip()
            price_dec = Decimal(price_str) if price_str else Decimal('0.00')
            if price_dec < 0:
                raise ValueError
            tovar.price = price_dec
        except (InvalidOperation, ValueError):
            return JsonResponse({'success': False, 'error': 'Некорректная цена'}, status=400)
            
    elif field_name == 'unit':
        tovar.unit = (str(field_value) or 'шт.').strip() or 'шт.'
        
    else:
        return JsonResponse({'success': False, 'error': 'Неизвестное поле'}, status=400)

    tovar.save(update_fields=[field_name, 'updated_at'])
    
    return JsonResponse({'success': True})