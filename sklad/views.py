"""
views.py для приложения sklad
Полная AJAX-поддержка с учётом типа материала (бумага/плёнка).

Содержит все представления (views) для работы со складом материалов:
- Главная страница (index)
- Дерево категорий (get_category_tree)
- Получение данных категории (get_category_data)
- Получение всех материалов (get_all_materials)
- Создание категории (create_category)
- Создание материала (create_material)
- Удаление категории (delete_category)
- Удаление материала (delete_material)
- Inline-редактирование материала (update_material)
- Получение списка категорий для формы (get_categories_for_form)
- Получение списка плёнок для других приложений (get_films_list)
- Вспомогательные тестовые API (test_api, get_category_children)

ИСПРАВЛЕНИЯ (унификация ценообразования):
- Удалено поле price (готовая цена) – теперь цена вычисляется из себестоимости и наценки.
- Для бумаги добавлены обязательные поля cost и markup_percent.
- Поле unit стало общим для всех типов материалов.
- В generate_materials_html теперь для всех материалов отображаются cost и markup_percent.
- В update_material добавлена обработка cost и markup_percent для всех типов.
- Убрано поле 'price' из allowed_fields.
- Добавлена валидация пределов для себестоимости и наценки.
- Исправлена ошибка с форматом даты в to_dict (в models.py, здесь не повторяется).
"""

# ================== ИМПОРТЫ ==================
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.http import require_POST, require_http_methods
import json
from decimal import Decimal, InvalidOperation
from .models import Category, Material
from django.middleware.csrf import get_token


# ================== AJAX API ДЛЯ БЕСПЕРЕЗАГРУЗОЧНОЙ РАБОТЫ ==================

@login_required(login_url='/counter/login/')
def test_api(request, category_id):
    """Тестовая функция для проверки работы API."""
    try:
        return JsonResponse({
            'success': True,
            'message': f'Категория {category_id} получена успешно',
            'test_data': {
                'category_id': category_id,
                'name': f'Тестовая категория {category_id}',
                'materials': [
                    {'id': 1, 'name': 'Тестовый материал 1'},
                    {'id': 2, 'name': 'Тестовый материал 2'}
                ]
            }
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='/counter/login/')
def get_category_data(request, category_id=None):
    """
    Возвращает все данные для отображения при выборе категории.
    Используется AJAX-запросами для бес-перезагрузочного обновления правой колонки.
    """
    try:
        material_type = request.GET.get('type', 'paper')
        selected_category = None
        materials = Material.objects.select_related('category').filter(
            type=material_type
        ).order_by('name')
        descendants_count = 0

        if category_id:
            try:
                selected_category = Category.objects.get(id=category_id, type=material_type)
                descendants = selected_category.get_descendants(include_self=True)
                descendant_ids = list(descendants.values_list('id', flat=True))
                descendants_count = len(descendant_ids) - 1
                materials = materials.filter(category_id__in=descendant_ids)
            except Category.DoesNotExist:
                selected_category = None
                descendants_count = 0

        materials_data = [m.to_dict() for m in materials]

        stats = {
            'categories_count': Category.objects.filter(type=material_type).count(),
            'materials_count': Material.objects.filter(type=material_type).count(),
            'active_materials_count': Material.objects.filter(type=material_type, is_active=True).count(),
            'current_materials_count': materials.count(),
        }

        category_dict = None
        if selected_category:
            category_dict = {'id': selected_category.id, 'name': selected_category.name}

        csrf_token = get_token(request)
        html_content = generate_materials_html(materials_data, category_dict, descendants_count, stats, csrf_token)

        return JsonResponse({
            'success': True,
            'category': {
                'selected_category': category_dict,
                'descendants_count': descendants_count,
                'materials_count': materials.count(),
            } if category_dict else None,
            'materials': materials_data,
            'stats': stats,
            'html': html_content,
            'materials_count': len(materials_data),
        })

    except Exception as e:
        print(f"Ошибка в get_category_data: {str(e)}")
        import traceback
        traceback.print_exc()
        error_html = f'''
        <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Ошибка загрузки материалов</p>
            <p class="error-details">Ошибка сервера: {str(e)}</p>
            <button class="btn-retry" onclick="loadCategoryMaterials({category_id if category_id else 'null'})">
                <i class="fas fa-redo"></i> Повторить попытку
            </button>
        </div>
        '''
        return JsonResponse({
            'success': False,
            'error': f'Ошибка сервера: {str(e)}',
            'html': error_html
        }, status=500)


@login_required(login_url='/counter/login/')
def get_category_children(request, category_id):
    """Получает всех потомков категории для отображения подкатегорий."""
    try:
        material_type = request.GET.get('type', 'paper')
        category = get_object_or_404(Category, id=category_id, type=material_type)
        descendants = category.get_descendants()
        subcategories = []
        for descendant in descendants:
            subcategories.append({
                'id': descendant.id,
                'name': descendant.name,
                'materials_count': descendant.materials.filter(type=material_type).count(),
                'level': descendant.level - category.level - 1,
            })
        return JsonResponse({
            'success': True,
            'category': {
                'id': category.id,
                'name': category.name,
                'materials_count': category.materials.filter(type=material_type).count(),
            },
            'subcategories': subcategories,
            'descendants_count': len(descendants),
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Ошибка при получении подкатегорий: {str(e)}'
        }, status=500)


def generate_materials_html(materials_data, selected_category, descendants_count, stats, csrf_token):
    """
    Генерирует HTML таблицы материалов.
    Теперь для всех материалов отображаются себестоимость (cost) и наценка (markup_percent),
    а цена вычисляется и показывается в колонке "Цена".
    """
    materials_rows = ''

    if materials_data:
        for material in materials_data:
            # Определяем CSS-класс для количества
            quantity_class = ''
            if material['quantity'] <= 0:
                quantity_class = 'quantity-zero'
            elif material['min_quantity'] and material['quantity'] <= material['min_quantity']:
                quantity_class = 'quantity-low'

            # --- Общие поля для всех типов (cost и markup_percent) ---
            cost_display = material['cost'] if material['cost'] is not None else '—'
            cost_value = material['cost'] if material['cost'] is not None else ''
            markup_display = material['markup_percent'] if material['markup_percent'] is not None else '—'
            markup_value = material['markup_percent'] if material['markup_percent'] is not None else ''

            extra_info = f'''
            <div class="material-extra">
                <span class="param editable-field" 
                    data-editable="true"
                    data-field="cost"
                    data-material-id="{material['id']}"
                    data-original-value="{cost_value}"
                    ondblclick="startInlineEdit(this)">
                    <i class="fas fa-ruble-sign"></i> {cost_display} руб.
                </span>
            </div>
            <div class="material-extra">
                <span class="param editable-field" 
                      data-editable="true"
                      data-field="markup_percent"
                      data-material-id="{material['id']}"
                      data-original-value="{markup_value}"
                      ondblclick="startInlineEdit(this)">
                    <i class="fas fa-percent"></i> {markup_display}%
                </span>
            </div>
            '''

            # --- Специфические поля в зависимости от типа ---
            if material['type'] == 'film':
                thickness_display = material['thickness'] if material['thickness'] is not None else '—'
                thickness_value = material['thickness'] if material['thickness'] is not None else ''
                extra_info += f'''
                <div class="material-extra">
                    <span class="param editable-field" 
                          data-editable="true"
                          data-field="thickness"
                          data-material-id="{material['id']}"
                          data-original-value="{thickness_value}"
                          ondblclick="startInlineEdit(this)">
                        <i class="fas fa-ruler"></i> {thickness_display} мкм
                    </span>
                </div>
                '''
            else:  # paper
                density_display = material['density'] if material['density'] is not None else '—'
                density_value = material['density'] if material['density'] is not None else ''
                extra_info += f'''
                <div class="material-extra">
                    <span class="param editable-field" 
                          data-editable="true"
                          data-field="density"
                          data-material-id="{material['id']}"
                          data-original-value="{density_value}"
                          ondblclick="startInlineEdit(this)">
                        <i class="fas fa-weight-hanging"></i> {density_display} г/м²
                    </span>
                </div>
                '''
                paper_thickness_display = material['paper_thickness'] if material['paper_thickness'] is not None else '—'
                paper_thickness_value = material['paper_thickness'] if material['paper_thickness'] is not None else ''
                extra_info += f'''
                <div class="material-extra">
                    <span class="param editable-field" 
                          data-editable="true"
                          data-field="paper_thickness"
                          data-material-id="{material['id']}"
                          data-original-value="{paper_thickness_value}"
                          ondblclick="startInlineEdit(this)">
                        <i class="fas fa-ruler"></i> {paper_thickness_display} мм
                    </span>
                </div>
                '''

            # Экранирование для атрибутов
            material_name = material['name'].replace("'", "\\'").replace('"', '&quot;')
            material_quantity = str(material['quantity']).replace("'", "\\'")

            # Количество редактируется всегда
            quantity_attrs = (f'data-editable="true" data-field="quantity" '
                              f'data-original-value="{material_quantity}" '
                              f'data-min-quantity="{material["min_quantity"]}" '
                              f'data-material-id="{material["id"]}"')
            quantity_class = f'quantity-badge {quantity_class} editable-field'

            # Формируем строку таблицы
            materials_rows += f'''
            <div class="table-row" data-material-id="{material['id']}" data-material-type="{material['type']}">
                <div class="col-name">
                    <div class="material-name editable-field" 
                         data-editable="true"
                         data-field="name"
                         data-material-id="{material['id']}"
                         data-original-value="{material_name}">
                        {material['name']}
                    </div>
                    <div class="material-category">
                        <i class="fas fa-folder"></i>
                        {material['category_name']}
                    </div>
                    <div class="material-extra">
                        {extra_info}
                    </div>
                </div>
                <div class="col-price">
                    <span class="price-badge">
                        {material['price_display']}
                    </span>
                </div>
                <div class="col-quantity">
                    <span class="{quantity_class}" {quantity_attrs}>
                        {material['quantity']} {material['unit']}
                    </span>
                </div>
                <div class="col-actions">
                    <button type="button" 
                            class="btn-action btn-delete"
                            data-material-id="{material['id']}"
                            data-material-name="{material['name']}">
                        Удалить
                    </button>
                </div>
            </div>
            '''

    category_title = ''
    if selected_category:
        if descendants_count > 0:
            category_title = f'в категории "<strong>{selected_category["name"]}</strong>" и {descendants_count} подкатегориях'
        else:
            category_title = f'в категории "<strong>{selected_category["name"]}</strong>"'

    # Полный HTML правой колонки
    html = f'''
    <div class="section-header">
        <h2>
            <i class="fas fa-box-open"></i> Материалы
            {category_title}
        </h2>
        <div class="header-buttons">
            {f'<button type="button" class="btn-action btn-reset-filter" id="reset-filter-btn" title="Сбросить фильтр"><i class="fas fa-times-circle"></i> Сбросить</button>' if selected_category else ''}
            <button type="button" class="btn-action btn-add-material" id="add-material-btn">+ Добавить</button>
        </div>
    </div>

    <div class="stats-container">
        <div class="stat-card"><div class="stat-value">{stats['categories_count']}</div><div class="stat-label">Категорий</div></div>
        <div class="stat-card"><div class="stat-value">{stats['materials_count']}</div><div class="stat-label">Всего материалов</div></div>
        <div class="stat-card"><div class="stat-value">{stats['active_materials_count']}</div><div class="stat-label">Активных</div></div>
    </div>

    <div class="form-section" id="material-form-section" style="display: none;">
        <h3>Добавить новый материал</h3>
        <form method="post" action="/sklad/material/create/" id="material-form">
            <input type="hidden" name="csrfmiddlewaretoken" value="{csrf_token}">
            <div class="form-group">
                <label for="material-name">Название материала*</label>
                <input type="text" id="material-name" name="name" class="form-control" required>
            </div>
            <div class="form-group">
                <label for="material-type">Тип материала*</label>
                <select id="material-type" name="type" class="form-control" required>
                    <option value="paper">Бумага</option>
                    <option value="film">Плёнка</option>
                </select>
            </div>
            <div class="form-group" id="category-group">
                <label for="material-category">Категория*</label>
                <select id="material-category" name="category" class="form-control" required>
                    <option value="">-- Выберите категорию --</option>
                </select>
            </div>
            <!-- Общие поля для всех типов -->
            <div class="form-group">
                <label for="material-cost">Себестоимость (руб.)*</label>
                <input type="number" id="material-cost" name="cost" class="form-control" step="0.01" min="0" required>
            </div>
            <div class="form-group">
                <label for="material-markup">Наценка (%)*</label>
                <input type="number" id="material-markup" name="markup_percent" class="form-control" step="0.01" min="0" required>
            </div>
            <div class="form-group">
                <label for="material-unit">Единица измерения*</label>
                <input type="text" id="material-unit" name="unit" class="form-control" value="лист" required>
            </div>
            <!-- Поля для бумаги -->
            <div id="paper-fields">
                <div class="form-group">
                    <label for="material-density">Плотность (г/кв.м)</label>
                    <input type="number" id="material-density" name="density" class="form-control" step="1" min="1" placeholder="130">
                </div>
                <div class="form-group">
                    <label for="material-paper-thickness">Толщина бумаги (мм)</label>
                    <input type="number" id="material-paper-thickness" name="paper_thickness" class="form-control" step="0.001" min="0.001" placeholder="0.1">
                    <small class="form-text text-muted">Толщина в миллиметрах (например, 0.1 для 100 мкм)</small>
                </div>
            </div>
            <!-- Поля для плёнки -->
            <div id="film-fields" style="display: none;">
                <div class="form-group">
                    <label for="material-thickness">Толщина (мкм)*</label>
                    <input type="number" id="material-thickness" name="thickness" class="form-control" step="1" min="1">
                </div>
            </div>
            <!-- Складские поля -->
            <div class="form-row">
                <div class="form-group">
                    <label for="material-quantity">Количество на складе</label>
                    <input type="number" id="material-quantity" name="quantity" class="form-control" step="1" min="0" value="0">
                </div>
                <div class="form-group">
                    <label for="material-min-quantity">Минимальный остаток</label>
                    <input type="number" id="material-min-quantity" name="min_quantity" class="form-control" step="1" min="0" value="10">
                </div>
            </div>
            <div class="form-group">
                <label for="material-notes">Примечание</label>
                <textarea id="material-notes" name="notes" class="form-control" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label><input type="checkbox" name="is_active" class="form-check-input" checked> Активен</label>
            </div>
            <div class="button-group">
                <button type="submit" class="btn-submit">Сохранить материал</button>
                <button type="button" class="btn-clear" onclick="clearMaterialForm()">Очистить форму</button>
            </div>
        </form>
    </div>

    <div class="materials-table">
        <div class="table-header">
            <div class="col-name">Название материала</div>
            <div class="col-price">Цена</div>
            <div class="col-quantity">Количество</div>
            <div class="col-actions">Действия</div>
        </div>
        <div class="table-body" id="materials-table-body">
            {materials_rows if materials_rows else '<div class="empty-message"><i class="fas fa-box-open"></i>Нет материалов. Нажмите "Добавить", чтобы создать первый.</div>'}
        </div>
    </div>

    <div class="table-hint">
        <div class="hint-item"><span class="hint-icon">📁</span>Показаны материалы из выбранной категории и всех её подкатегорий</div>
        <div class="hint-item"><span class="hint-icon">👆</span>Нажмите на название категории, чтобы увидеть иерархию</div>
        <div class="hint-item"><span class="hint-icon">✏️</span>Двойной клик по любому полю для быстрого редактирования</div>
    </div>
    '''
    return html


@login_required(login_url='/counter/login/')
def get_all_materials(request):
    """Возвращает все материалы выбранного типа (без фильтрации по категории)."""
    try:
        material_type = request.GET.get('type', 'paper')
        materials = Material.objects.select_related('category').filter(
            type=material_type
        ).order_by('name')
        materials_data = [m.to_dict() for m in materials]
        stats = {
            'categories_count': Category.objects.filter(type=material_type).count(),
            'materials_count': Material.objects.filter(type=material_type).count(),
            'active_materials_count': Material.objects.filter(type=material_type, is_active=True).count(),
            'current_materials_count': materials.count(),
        }
        csrf_token = get_token(request)
        html_content = generate_materials_html(materials_data, None, 0, stats, csrf_token)
        return JsonResponse({
            'success': True,
            'materials': materials_data,
            'stats': stats,
            'html': html_content,
            'materials_count': len(materials_data),
        })
    except Exception as e:
        print(f"Ошибка при получении всех материалов: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'Ошибка сервера: {str(e)}'
        }, status=500)


# ================== ГЛАВНАЯ СТРАНИЦА ==================

@login_required(login_url='/counter/login/')
@never_cache
def index(request):
    """Главная страница приложения sklad."""
    material_type = request.GET.get('type', 'paper')
    categories = Category.objects.filter(type=material_type).order_by('name')
    materials = Material.objects.select_related('category').filter(type=material_type).order_by('name')
    category_id = request.GET.get('category_id')
    selected_category = None
    descendants_count = 0

    if category_id:
        try:
            selected_category = Category.objects.get(id=category_id, type=material_type)
            descendants = selected_category.get_descendants(include_self=True)
            descendant_ids = list(descendants.values_list('id', flat=True))
            descendants_count = len(descendant_ids) - 1
            materials = materials.filter(category_id__in=descendant_ids)
        except Category.DoesNotExist:
            pass

    stats = {
        'categories_count': Category.objects.filter(type=material_type).count(),
        'materials_count': Material.objects.filter(type=material_type).count(),
        'active_materials_count': Material.objects.filter(type=material_type, is_active=True).count(),
    }
    root_categories = Category.objects.filter(parent=None, type=material_type).order_by('name')

    context = {
        'categories': categories,
        'root_categories': root_categories,
        'materials': materials,
        'selected_category': selected_category,
        'descendants_count': descendants_count,
        'stats': stats,
        'user': request.user,
        'active_app': 'sklad',
        'current_type': material_type,
    }
    return render(request, 'sklad/index.html', context)


# ================== ДЕРЕВО КАТЕГОРИЙ ==================

@login_required(login_url='/counter/login/')
def get_category_tree(request):
    """Возвращает дерево категорий в формате JSON."""
    material_type = request.GET.get('type', 'paper')

    def serialize_category(category):
        return {
            'id': category.id,
            'name': category.name,
            'children': [serialize_category(child) for child in category.children.all()],
            'materials_count': category.materials.filter(type=material_type).count()
        }

    root_categories = Category.objects.filter(parent=None, type=material_type).order_by('name')
    tree = [serialize_category(cat) for cat in root_categories]
    return JsonResponse({'tree': tree})


# ================== СОЗДАНИЕ КАТЕГОРИЙ И МАТЕРИАЛОВ ==================

@login_required(login_url='/counter/login/')
@require_POST
def create_category(request):
    """Создание новой категории."""
    try:
        name = request.POST.get('name', '').strip()
        parent_id = request.POST.get('parent', '')
        material_type = request.POST.get('type', 'paper')

        if not name:
            messages.error(request, 'Название категории обязательно')
            return redirect(f'/sklad/?type={material_type}')
        if len(name) < 2:
            messages.error(request, 'Название должно содержать минимум 2 символа')
            return redirect(f'/sklad/?type={material_type}')

        parent = None
        if parent_id:
            try:
                parent = Category.objects.get(id=parent_id, type=material_type)
            except Category.DoesNotExist:
                messages.error(request, 'Родительская категория не найдена')
                return redirect(f'/sklad/?type={material_type}')

        existing = Category.objects.filter(name=name, parent=parent, type=material_type)
        if existing.exists():
            messages.error(request, f'Категория с именем "{name}" уже существует на этом уровне')
            return redirect(f'/sklad/?type={material_type}')

        Category.objects.create(name=name, parent=parent, type=material_type)
        messages.success(request, f'Категория "{name}" создана успешно!')
    except Exception as e:
        messages.error(request, f'Ошибка при создании категории: {str(e)}')
    return redirect(f'/sklad/?type={material_type}')


@login_required(login_url='/counter/login/')
@require_POST
def create_material(request):
    """
    Создание нового материала с унифицированным ценообразованием.
    Для всех типов обязательны cost, markup_percent, unit.
    """
    try:
        name = request.POST.get('name', '').strip()
        category_id = request.POST.get('category', '')
        material_type = request.POST.get('type', 'paper')
        quantity = request.POST.get('quantity', '0')
        min_quantity = request.POST.get('min_quantity', '10')
        notes = request.POST.get('notes', '')
        is_active = request.POST.get('is_active') == 'on'

        # Валидация общих полей
        if not name:
            raise ValueError('Название материала обязательно')
        if not category_id:
            raise ValueError('Выберите категорию')

        try:
            category = Category.objects.get(id=category_id, type=material_type)
        except Category.DoesNotExist:
            raise ValueError('Категория не найдена')

        # Общие поля для всех типов
        cost = request.POST.get('cost')
        markup_percent = request.POST.get('markup_percent')
        unit = request.POST.get('unit', 'лист')

        if not cost or not markup_percent:
            raise ValueError('Себестоимость и наценка обязательны')
        try:
            cost_decimal = Decimal(cost)
            markup_decimal = Decimal(markup_percent)
        except (InvalidOperation, ValueError):
            raise ValueError('Некорректный формат себестоимости или наценки')
        if cost_decimal < 0:
            raise ValueError('Себестоимость не может быть отрицательной')
        if markup_decimal < 0:
            raise ValueError('Наценка не может быть отрицательной')
        if not unit.strip():
            raise ValueError('Единица измерения обязательна')

        material_data = {
            'name': name,
            'category': category,
            'type': material_type,
            'cost': cost_decimal,
            'markup_percent': markup_decimal,
            'unit': unit.strip(),
            'quantity': int(quantity),
            'min_quantity': int(min_quantity),
            'notes': notes,
            'is_active': is_active,
        }

        # Специфические поля
        if material_type == 'paper':
            density = request.POST.get('density')
            paper_thickness = request.POST.get('paper_thickness')
            if density and density.strip():
                try:
                    density_int = int(density)
                    if density_int < 1 or density_int > 2000:
                        raise ValueError('Плотность должна быть от 1 до 2000 г/м²')
                    material_data['density'] = density_int
                except ValueError:
                    raise ValueError('Плотность должна быть целым числом')
            if paper_thickness and paper_thickness.strip():
                try:
                    thickness_dec = Decimal(paper_thickness)
                    if thickness_dec < Decimal('0.001') or thickness_dec > Decimal('100'):
                        raise ValueError('Толщина бумаги должна быть от 0.001 до 100 мм')
                    material_data['paper_thickness'] = thickness_dec
                except (InvalidOperation, ValueError):
                    raise ValueError('Некорректный формат толщины бумаги')

        elif material_type == 'film':
            thickness = request.POST.get('thickness')
            if not thickness:
                raise ValueError('Для плёнки необходимо указать толщину')
            try:
                thickness_int = int(thickness)
                if thickness_int <= 0:
                    raise ValueError('Толщина должна быть положительным целым числом')
                material_data['thickness'] = thickness_int
            except ValueError:
                raise ValueError('Толщина должна быть целым числом')

        material = Material.objects.create(**material_data)

        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({
                'success': True,
                'message': f'Материал "{material.name}" создан успешно!',
                'material': material.to_dict()
            })
        else:
            messages.success(request, f'Материал "{material.name}" создан успешно!')
            return redirect('sklad:index')

    except Exception as e:
        error_message = str(e)
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({'success': False, 'error': error_message}, status=400)
        else:
            messages.error(request, f'Ошибка при создании материала: {error_message}')
            return redirect('sklad:index')


# ================== УДАЛЕНИЕ КАТЕГОРИЙ И МАТЕРИАЛОВ ==================

@login_required(login_url='/counter/login/')
def delete_category(request, category_id):
    """Удаление категории (только если нет материалов и подкатегорий)."""
    try:
        category = get_object_or_404(Category, id=category_id)
        material_type = category.type
        category_name = category.name
        materials_count = category.materials.count()
        children_count = category.children.count()

        if materials_count > 0 or children_count > 0:
            messages.error(
                request,
                f'Нельзя удалить категорию "{category_name}"! '
                f'В ней есть {materials_count} материалов и {children_count} подкатегорий.'
            )
        else:
            category.delete()
            messages.success(request, f'Категория "{category_name}" удалена!')
        return redirect(f'/sklad/?type={material_type}')
    except Category.DoesNotExist:
        messages.error(request, 'Категория не найдена.')
        return redirect('/sklad/')


@login_required(login_url='/counter/login/')
@require_http_methods(["POST"])
def delete_material(request, material_id):
    """Удаление материала."""
    try:
        material = Material.objects.get(id=material_id)
        material_name = material.name
        material.delete()
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({'success': True, 'message': f'Материал "{material_name}" удален!'})
        else:
            messages.success(request, f'Материал "{material_name}" удален!')
    except Material.DoesNotExist:
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({'success': False, 'error': 'Материал не найден.'}, status=404)
        else:
            messages.error(request, 'Материал не найден.')
    return redirect('sklad:index')


# ================== INLINE-РЕДАКТИРОВАНИЕ ==================

@login_required(login_url='/counter/login/')
@require_http_methods(["POST", "PUT", "PATCH"])
def update_material(request, material_id):
    """
    Обновление материала через AJAX (inline-редактирование).
    Поддерживает поля: name, cost, markup_percent, unit, quantity, min_quantity,
    density, paper_thickness, thickness, notes, is_active.
    Поле 'price' отсутствует, так как цена вычисляется.
    """
    try:
        material = get_object_or_404(Material, id=material_id)

        try:
            data = json.loads(request.body.decode('utf-8'))
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Некорректный формат JSON данных.'}, status=400)

        field_name = data.get('field')
        field_value = data.get('value')

        if not field_name or field_value is None:
            return JsonResponse({'success': False, 'error': 'Отсутствуют обязательные поля: "field" и "value".'}, status=400)

        allowed_fields = {
            'name', 'cost', 'markup_percent', 'unit', 'density', 'quantity',
            'min_quantity', 'notes', 'is_active', 'paper_thickness', 'thickness'
        }
        if field_name not in allowed_fields:
            return JsonResponse({'success': False, 'error': f'Поле "{field_name}" не может быть отредактировано.'}, status=400)

        try:
            # name
            if field_name == 'name':
                if not field_value or len(field_value.strip()) < 2:
                    return JsonResponse({'success': False, 'error': 'Название должно содержать минимум 2 символа.'}, status=400)
                if Material.objects.filter(name=field_value.strip(), category=material.category).exclude(id=material_id).exists():
                    return JsonResponse({'success': False, 'error': f'Материал с названием "{field_value}" уже существует в этой категории.'}, status=400)
                material.name = field_value.strip()

            # cost (для всех типов)
            elif field_name == 'cost':
                if field_value == '' or field_value is None:
                    return JsonResponse({'success': False, 'error': 'Себестоимость не может быть пустой.'}, status=400)
                try:
                    cost_value = Decimal(str(field_value).replace(',', '.'))
                except (ValueError, InvalidOperation):
                    return JsonResponse({'success': False, 'error': 'Некорректный формат себестоимости.'}, status=400)
                if cost_value < 0:
                    return JsonResponse({'success': False, 'error': 'Себестоимость не может быть отрицательной.'}, status=400)
                material.cost = cost_value

            # markup_percent (для всех типов)
            elif field_name == 'markup_percent':
                if field_value == '' or field_value is None:
                    return JsonResponse({'success': False, 'error': 'Наценка не может быть пустой.'}, status=400)
                try:
                    markup_value = Decimal(str(field_value).replace(',', '.'))
                except (ValueError, InvalidOperation):
                    return JsonResponse({'success': False, 'error': 'Некорректный формат наценки.'}, status=400)
                if markup_value < 0:
                    return JsonResponse({'success': False, 'error': 'Наценка не может быть отрицательной.'}, status=400)
                material.markup_percent = markup_value

            # unit
            elif field_name == 'unit':
                if not field_value or len(field_value.strip()) < 1:
                    return JsonResponse({'success': False, 'error': 'Единица измерения не может быть пустой.'}, status=400)
                material.unit = field_value.strip()

            # quantity
            elif field_name == 'quantity':
                try:
                    qty = Decimal(str(field_value).replace(',', '.'))
                except (ValueError, InvalidOperation):
                    return JsonResponse({'success': False, 'error': 'Некорректный формат количества.'}, status=400)
                if qty < 0:
                    return JsonResponse({'success': False, 'error': 'Количество не может быть отрицательным.'}, status=400)
                if qty != int(qty):
                    return JsonResponse({'success': False, 'error': 'Количество должно быть целым числом.'}, status=400)
                material.quantity = int(qty)

            # min_quantity
            elif field_name == 'min_quantity':
                try:
                    min_qty = Decimal(str(field_value).replace(',', '.'))
                except (ValueError, InvalidOperation):
                    return JsonResponse({'success': False, 'error': 'Некорректный формат минимального количества.'}, status=400)
                if min_qty < 0:
                    return JsonResponse({'success': False, 'error': 'Минимальное количество не может быть отрицательным.'}, status=400)
                if min_qty != int(min_qty):
                    return JsonResponse({'success': False, 'error': 'Минимальное количество должно быть целым числом.'}, status=400)
                material.min_quantity = int(min_qty)

            # density (только для бумаги)
            elif field_name == 'density':
                if material.type != 'paper':
                    return JsonResponse({'success': False, 'error': 'Плотность можно редактировать только для бумаги.'}, status=400)
                if field_value == '' or field_value is None:
                    material.density = None
                else:
                    try:
                        density_val = int(field_value)
                    except ValueError:
                        return JsonResponse({'success': False, 'error': 'Плотность должна быть целым числом.'}, status=400)
                    if density_val <= 0 or density_val > 2000:
                        return JsonResponse({'success': False, 'error': 'Плотность должна быть от 1 до 2000 г/м².'}, status=400)
                    material.density = density_val

            # paper_thickness (только для бумаги)
            elif field_name == 'paper_thickness':
                if material.type != 'paper':
                    return JsonResponse({'success': False, 'error': 'Толщину бумаги можно редактировать только для бумаги.'}, status=400)
                if field_value == '' or field_value is None:
                    material.paper_thickness = None
                else:
                    try:
                        thickness_val = Decimal(str(field_value).replace(',', '.'))
                    except (ValueError, InvalidOperation):
                        return JsonResponse({'success': False, 'error': 'Некорректный формат толщины бумаги.'}, status=400)
                    if thickness_val <= 0 or thickness_val > 100:
                        return JsonResponse({'success': False, 'error': 'Толщина бумаги должна быть от 0.001 до 100 мм.'}, status=400)
                    material.paper_thickness = thickness_val

            # thickness (только для плёнки)
            elif field_name == 'thickness':
                if material.type != 'film':
                    return JsonResponse({'success': False, 'error': 'Толщину плёнки можно редактировать только для плёнки.'}, status=400)
                if field_value == '' or field_value is None:
                    return JsonResponse({'success': False, 'error': 'Толщина не может быть пустой.'}, status=400)
                try:
                    thickness_val = int(field_value)
                except ValueError:
                    return JsonResponse({'success': False, 'error': 'Толщина должна быть целым числом.'}, status=400)
                if thickness_val <= 0:
                    return JsonResponse({'success': False, 'error': 'Толщина должна быть положительным числом.'}, status=400)
                material.thickness = thickness_val

            # is_active
            elif field_name == 'is_active':
                if isinstance(field_value, bool):
                    material.is_active = field_value
                elif isinstance(field_value, str):
                    material.is_active = field_value.lower() in ['true', '1', 'yes', 'да']
                else:
                    material.is_active = bool(field_value)

            # notes
            elif field_name == 'notes':
                material.notes = field_value

            else:
                return JsonResponse({'success': False, 'error': f'Поле "{field_name}" не поддерживается.'}, status=400)

            material.save()
            return JsonResponse({
                'success': True,
                'message': f'Поле "{field_name}" успешно обновлено.',
                'material': material.to_dict()
            })

        except Exception as validation_error:
            return JsonResponse({'success': False, 'error': f'Ошибка валидации: {str(validation_error)}'}, status=400)

    except Material.DoesNotExist:
        return JsonResponse({'success': False, 'error': f'Материал с ID {material_id} не найден.'}, status=404)
    except Exception as e:
        print(f"Ошибка при обновлении материала: {str(e)}")
        return JsonResponse({'success': False, 'error': f'Внутренняя ошибка сервера: {str(e)}'}, status=500)


# ================== ПОЛУЧЕНИЕ СПИСКА КАТЕГОРИЙ ДЛЯ ФОРМЫ ==================

@login_required(login_url='/counter/login/')
def get_categories_for_form(request):
    """Возвращает список категорий для выпадающего списка в форме добавления материала."""
    try:
        material_type = request.GET.get('type', 'paper')
        categories = Category.objects.filter(type=material_type).order_by('name')
        categories_list = [{'id': c.id, 'name': c.name} for c in categories]
        return JsonResponse({'success': True, 'categories': categories_list})
    except Exception as e:
        return JsonResponse({'success': False, 'error': f'Ошибка получения категорий: {str(e)}'}, status=500)


@login_required
def get_films_list(request):
    """Возвращает список плёнок для выпадающего списка в секции 'Ламинация'."""
    films = Material.objects.filter(type='film', is_active=True).order_by('name')
    data = [{'id': f.id, 'name': f.name} for f in films]
    return JsonResponse({'success': True, 'films': data})