# sklad/views.py
"""
Представления приложения "sklad" (Склад материалов).
Переписано по образу tovary/views.py для чистого рендера шаблонов и API.
"""
from decimal import Decimal, InvalidOperation
import json

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, get_object_or_404, redirect
from django.views.decorators.cache import never_cache
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.db import transaction
from django.db.models import Max

from .models import Category, Material

# ============================================================================
# 1. ГЛАВНАЯ СТРАНИЦА
# ============================================================================

@login_required(login_url='/counter/login/')
@never_cache
def index(request):
    """
    Главная страница склада.
    GET: рендер дерева категорий и списка материалов.
    POST: создание нового материала.
    """
    material_type = request.GET.get('type', 'paper')
    
    # Дерево категорий для текущего типа
    categories = Category.objects.filter(type=material_type).order_by('tree_id', 'lft')
    
    # Выбранная категория
    selected_category_id = request.GET.get('category_id')
    selected_category = None
    if selected_category_id:
        try:
            selected_category = Category.objects.get(pk=selected_category_id, type=material_type)
        except Category.DoesNotExist:
            selected_category = None

    # Материалы
    materials = Material.objects.select_related('category').filter(type=material_type)
    if selected_category:
        # Показываем материалы только из этой категории (без подкатегорий, как просил заказчик в tovary)
        materials = materials.filter(category=selected_category)
    materials = materials.order_by('position', 'id')

    # Обработка POST (создание материала)
    if request.method == 'POST':
        name = (request.POST.get('name') or '').strip()
        category_id = (request.POST.get('category') or '').strip()
        cost_raw = (request.POST.get('cost') or '').strip().replace(',', '.')
        markup_raw = (request.POST.get('markup_percent') or '').strip().replace(',', '.')
        unit = (request.POST.get('unit') or 'лист').strip() or 'лист'
        quantity_raw = (request.POST.get('quantity') or '0').strip()
        min_quantity_raw = (request.POST.get('min_quantity') or '10').strip()
        notes = (request.POST.get('notes') or '').strip()
        
        # Специфические поля
        density_raw = (request.POST.get('density') or '').strip()
        paper_thickness_raw = (request.POST.get('paper_thickness') or '').strip().replace(',', '.')
        film_thickness_raw = (request.POST.get('thickness') or '').strip()

        errors = []
        if not name:
            errors.append('Название обязательно')
        if not category_id:
            errors.append('Выберите категорию')

        # Парсинг чисел
        try:
            cost = Decimal(cost_raw) if cost_raw else Decimal('0.00')
            if cost < 0: errors.append('Себестоимость не может быть отрицательной')
        except (InvalidOperation, ValueError):
            errors.append('Некорректная себестоимость')

        try:
            markup = Decimal(markup_raw) if markup_raw else Decimal('0.00')
            if markup < 0: errors.append('Наценка не может быть отрицательной')
        except (InvalidOperation, ValueError):
            errors.append('Некорректная наценка')

        try:
            quantity = int(quantity_raw) if quantity_raw else 0
        except ValueError:
            errors.append('Некорректное количество')

        try:
            min_quantity = int(min_quantity_raw) if min_quantity_raw else 10
        except ValueError:
            errors.append('Некорректный минимальный остаток')

        density = None
        if density_raw:
            try:
                density = int(density_raw)
            except ValueError:
                errors.append('Некорректная плотность')
        
        paper_thickness = None
        if paper_thickness_raw:
            try:
                paper_thickness = Decimal(paper_thickness_raw)
            except (InvalidOperation, ValueError):
                errors.append('Некорректная толщина бумаги')

        film_thickness = None
        if film_thickness_raw:
            try:
                film_thickness = int(film_thickness_raw)
            except ValueError:
                errors.append('Некорректная толщина плёнки')

        category = None
        if category_id:
            try:
                category = Category.objects.get(pk=category_id, type=material_type)
            except Category.DoesNotExist:
                errors.append('Категория не найдена')

        if errors:
            for e in errors:
                messages.error(request, e)
        else:
            # Вычисляем следующий position, чтобы новый материал встал в конец
            max_pos = Material.objects.filter(type=material_type).aggregate(Max('position'))['position__max'] or 0
            
            Material.objects.create(
                name=name,
                category=category,
                type=material_type,
                cost=cost,
                markup_percent=markup,
                unit=unit,
                quantity=quantity,
                min_quantity=min_quantity,
                notes=notes,
                density=density if material_type == 'paper' else None,
                paper_thickness=paper_thickness if material_type == 'paper' else None,
                thickness=film_thickness if material_type == 'film' else None,
                position=max_pos + 1,
            )
            messages.success(request, f'Материал «{name}» создан')
            # Редирект с сохранением типа и категории
            query = f'?type={material_type}'
            if category:
                query += f'&category_id={category.id}'
            return redirect(f'{request.path}{query}')

    context = {
        'categories': categories,
        'selected_category': selected_category,
        'selected_category_id': selected_category_id,
        'materials': materials,
        'current_type': material_type,
        'active_app': 'sklad',
        'page_title': 'Склад материалов',
    }
    return render(request, 'sklad/index.html', context)


# ============================================================================
# 2. СОЗДАНИЕ И ОБНОВЛЕНИЕ МАТЕРИАЛОВ
# ============================================================================

@login_required(login_url='/counter/login/')
@require_POST
def api_update_material_field(request, material_id):
    """
    Инлайн-обновление одного поля материала через AJAX.
    Принимает JSON: {"field_name": "...", "field_value": "..."}
    """
    material = get_object_or_404(Material, pk=material_id)
    
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'success': False, 'error': 'Некорректный JSON'}, status=400)

    field_name = data.get('field_name')
    field_value = data.get('field_value')

    try:
        if field_name == 'name':
            if not field_value or not str(field_value).strip():
                raise ValueError('Название не может быть пустым')
            material.name = str(field_value).strip()

        elif field_name == 'cost':
            val = str(field_value).replace(',', '.').strip()
            material.cost = Decimal(val) if val else None
            if material.cost is not None and material.cost < 0:
                raise ValueError('Себестоимость не может быть отрицательной')

        elif field_name == 'markup_percent':
            val = str(field_value).replace(',', '.').strip()
            material.markup_percent = Decimal(val) if val else None
            if material.markup_percent is not None and material.markup_percent < 0:
                raise ValueError('Наценка не может быть отрицательной')

        elif field_name == 'unit':
            material.unit = str(field_value).strip() or 'лист'

        elif field_name == 'quantity':
            material.quantity = int(field_value) if str(field_value).strip() else 0
            if material.quantity < 0:
                raise ValueError('Количество не может быть отрицательным')

        elif field_name == 'min_quantity':
            material.min_quantity = int(field_value) if str(field_value).strip() else 10
            if material.min_quantity < 0:
                raise ValueError('Минимальный остаток не может быть отрицательным')

        elif field_name == 'density':
            if material.type != 'paper':
                raise ValueError('Только для бумаги')
            material.density = int(field_value) if str(field_value).strip() else None

        elif field_name == 'paper_thickness':
            if material.type != 'paper':
                raise ValueError('Только для бумаги')
            val = str(field_value).replace(',', '.').strip()
            material.paper_thickness = Decimal(val) if val else None

        elif field_name == 'thickness':
            if material.type != 'film':
                raise ValueError('Только для плёнки')
            material.thickness = int(field_value) if str(field_value).strip() else None

        elif field_name == 'notes':
            material.notes = str(field_value).strip()

        elif field_name == 'is_active':
            material.is_active = str(field_value).lower() in ['true', '1', 'yes', 'да']
            
        elif field_name == 'category_id':
            if field_value:
                category = Category.objects.get(pk=field_value, type=material.type)
                material.category = category
            else:
                raise ValueError('Категория обязательна')

        else:
            return JsonResponse({'success': False, 'error': 'Неизвестное поле'}, status=400)

        material.save(update_fields=[field_name, 'updated_at'])
        return JsonResponse({'success': True})

    except (ValueError, InvalidOperation, TypeError, Category.DoesNotExist) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)

@login_required(login_url='/counter/login/')
@require_POST
def api_update_material_category(request, material_id):
    """
    Меняет категорию у материала (перетаскивание в дереве).
    Принимает JSON: {"category_id": 5}
    """
    material = get_object_or_404(Material, pk=material_id)
    
    try:
        data = json.loads(request.body.decode('utf-8'))
        category_id = data.get('category_id')
        
        if not category_id:
            return JsonResponse({'success': False, 'error': 'Не указана категория'}, status=400)
            
        # Проверяем, что категория существует и подходит по типу (бумага/плёнка)
        category = Category.objects.get(pk=category_id, type=material.type)
        
        material.category = category
        material.save(update_fields=['category', 'updated_at'])
        
        return JsonResponse({'success': True})
    except Category.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Категория не найдена или не подходит по типу'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='/counter/login/')
@require_POST
def delete_material(request, material_id):
    """Мягкое удаление материала."""
    material = get_object_or_404(Material, pk=material_id)
    material.delete() # Физическое удаление, как в старом коде
    messages.success(request, f'Материал «{material.name}» удалён')
    return redirect(request.META.get('HTTP_REFERER', 'sklad:index'))


# ============================================================================
# 3. УПРАВЛЕНИЕ КАТЕГОРИЯМИ
# ============================================================================

@login_required(login_url='/counter/login/')
def category_create(request):
    """Создать новую категорию."""
    if request.method != 'POST':
        return redirect('sklad:index')
    
    name = (request.POST.get('name') or '').strip()
    parent_id = (request.POST.get('parent_id') or '').strip()
    material_type = (request.POST.get('type') or 'paper').strip()

    if not name:
        messages.error(request, 'Название категории обязательно')
        return redirect(f'/sklad/?type={material_type}')

    parent = None
    if parent_id:
        try:
            parent = Category.objects.get(pk=parent_id, type=material_type)
        except Category.DoesNotExist:
            messages.error(request, 'Родительская категория не найдена')
            return redirect(f'/sklad/?type={material_type}')

    Category.objects.create(name=name, parent=parent, type=material_type)
    messages.success(request, f'Категория «{name}» создана')
    return redirect(f'/sklad/?type={material_type}')

@login_required(login_url='/counter/login/')
def category_update(request, category_id):
    """Переименовать категорию."""
    category = get_object_or_404(Category, pk=category_id)
    if request.method != 'POST':
        return redirect('sklad:index')

    name = (request.POST.get('name') or '').strip()
    if not name:
        messages.error(request, 'Название не может быть пустым')
        return redirect(f'/sklad/?type={category.type}')

    category.name = name
    category.save(update_fields=['name'])
    messages.success(request, 'Категория переименована')
    return redirect(f'/sklad/?type={category.type}')

@login_required(login_url='/counter/login/')
def category_delete(request, category_id):
    """Мягкое удаление категории."""
    category = get_object_or_404(Category, pk=category_id)
    
    # Проверка на материалы
    if Material.objects.filter(category__in=category.get_descendants(include_self=True)).exists():
        messages.error(request, f'Нельзя удалить: в категории есть материалы.')
        return redirect(f'/sklad/?type={category.type}')
    
    # Проверка на подкатегории
    if category.get_children().exists():
        messages.error(request, f'Нельзя удалить: есть подкатегории.')
        return redirect(f'/sklad/?type={category.type}')

    category.delete() # В sklad Category не имеет is_deleted, удаляем физически
    messages.success(request, f'Категория «{category.name}» удалена')
    return redirect(f'/sklad/?type={category.type}')


# ============================================================================
# 4. СОХРАНЕНИЕ ПОРЯДКА (DRAG-AND-DROP)
# ============================================================================

@login_required
@require_POST
def api_update_materials_order(request):
    """
    Принимает JSON: {"order": [id1, id2, id3, ...]}
    Сохраняет новый порядок в поле position.
    """
    try:
        data = json.loads(request.body.decode('utf-8'))
        order = data.get('order', [])
        
        if not isinstance(order, list):
            return JsonResponse({'success': False, 'error': 'Неверный формат данных'}, status=400)

        # Обновляем в транзакции, чтобы не было "половины" обновлений при ошибке
        with transaction.atomic():
            for index, material_id in enumerate(order):
                # Сохраняем position начиная с 1
                Material.objects.filter(id=material_id).update(position=index + 1)

        return JsonResponse({'success': True})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ============================================================================
# 5. ДЛЯ ДРУГИХ ПРИЛОЖЕНИЙ
# ============================================================================

@login_required
def get_films_list(request):
    """Возвращает список плёнок для выпадающего списка в секции 'Ламинация'."""
    films = Material.objects.filter(type='film', is_active=True).order_by('name')
    data = [{'id': f.id, 'name': f.name} for f in films]
    return JsonResponse({'success': True, 'films': data})