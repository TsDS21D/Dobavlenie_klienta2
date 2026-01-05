"""
views.py для приложения sklad
ДОБАВЛЕНА: Полная AJAX-поддержка для обновления контента без перезагрузки
"""

from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.views.decorators.cache import never_cache
from django.contrib import messages
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST, require_http_methods
from django.db.models import Q, F
import json
from decimal import Decimal, InvalidOperation

from .models import Category, Material

# ================== AJAX API ДЛЯ БЕСПЕРЕЗАГРУЗОЧНОЙ РАБОТЫ ==================

@login_required(login_url='/counter/login/')
def test_api(request, category_id):
    """
    Простая тестовая функция для проверки работы API
    """
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
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

@login_required(login_url='/counter/login/')
def get_category_data(request, category_id=None):
    """
    ВОЗВРАЩАЕТ ВСЕ ДАННЫЕ ДЛЯ ОТОБРАЖЕНИЯ ПРИ ВЫБОРЕ КАТЕГОРИИ
    """
    try:
        selected_category = None
        materials = Material.objects.select_related('category').all().order_by('name')
        descendants_count = 0
        
        if category_id:
            try:
                selected_category = Category.objects.get(id=category_id)
                descendants = selected_category.get_descendants(include_self=True)
                descendant_ids = list(descendants.values_list('id', flat=True))
                descendants_count = len(descendant_ids) - 1
                materials = materials.filter(category_id__in=descendant_ids)
            except Category.DoesNotExist:
                selected_category = None
                descendants_count = 0
        
        materials_data = []
        for material in materials:
            quantity_status = material.get_quantity_status()
            
            materials_data.append({
                'id': material.id,
                'name': material.name,
                'category_id': material.category.id,
                'category_name': material.category.name,
                'price': str(material.price),
                'unit': material.unit,
                'quantity': material.quantity,
                'min_quantity': material.min_quantity,
                'price_display': material.get_price_display(),
                'quantity_status_class': quantity_status[0],
                'quantity_status_text': quantity_status[1],
                'is_active': material.is_active,
            })
        
        stats = {
            'categories_count': Category.objects.count(),
            'materials_count': Material.objects.count(),
            'active_materials_count': Material.objects.filter(is_active=True).count(),
            'current_materials_count': materials.count(),
        }
        
        if selected_category:
            category_dict = {
                'id': selected_category.id,
                'name': selected_category.name,
            }
        else:
            category_dict = None
            
        html_content = generate_materials_html(materials_data, category_dict, descendants_count, stats)
        
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
    """
    Получает всех потомков категории для отображения подкатегорий
    """
    try:
        category = get_object_or_404(Category, id=category_id)
        descendants = category.get_descendants()
        
        subcategories = []
        for descendant in descendants:
            subcategories.append({
                'id': descendant.id,
                'name': descendant.name,
                'materials_count': descendant.materials.count(),
                'level': descendant.level - category.level - 1,
            })
        
        return JsonResponse({
            'success': True,
            'category': {
                'id': category.id,
                'name': category.name,
                'materials_count': category.materials.count(),
            },
            'subcategories': subcategories,
            'descendants_count': len(descendants),
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Ошибка при получении подкатегорий: {str(e)}'
        }, status=500)

def generate_materials_html(materials_data, selected_category, descendants_count, stats):
    """
    УНИВЕРСАЛЬНАЯ функция для генерации HTML таблицы материалов
    """
    
    if not materials_data:
        if selected_category:
            message = f'В категории "{selected_category["name"]}" нет материалов'
        else:
            message = 'Материалы не найдены.'
        
        html = f'''
        <div class="empty-message">
            <i class="fas fa-box-open"></i>
            {message}
        </div>
        '''
        return html
    
    materials_rows = ''
    
    for material in materials_data:
        quantity_class = ''
        if material['quantity'] <= 0:
            quantity_class = 'quantity-zero'
        elif material['min_quantity'] and material['quantity'] <= material['min_quantity']:
            quantity_class = 'quantity-low'
        
        material_name = material['name'].replace("'", "\\'").replace('"', '&quot;')
        material_price = str(material['price']).replace("'", "\\'")
        material_quantity = str(material['quantity']).replace("'", "\\'")
        
        materials_rows += f'''
        <div class="table-row" data-material-id="{material['id']}">
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
            </div>
            
            <div class="col-price">
                <span class="price-badge editable-field"
                      data-editable="true"
                      data-field="price"
                      data-material-id="{material['id']}"
                      data-original-value="{material_price}">
                    {material['price_display']}
                </span>
            </div>
            
            <div class="col-quantity">
                <span class="quantity-badge {quantity_class} editable-field"
                      data-editable="true"
                      data-field="quantity"
                      data-material-id="{material['id']}"
                      data-original-value="{material_quantity}"
                      data-min-quantity="{material['min_quantity']}">
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
            category_title = f'''
            <span class="selected-category">
                в категории "<strong>{selected_category['name']}</strong>" 
                и {descendants_count} подкатегори{'ях' if descendants_count > 1 else 'ях'}
            </span>
        '''
    
    html = f'''
    <!-- Заголовок секции материалов -->
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
    
    <!-- Форма добавления материала -->
    <div class="form-section" id="material-form-section" style="display: none;">
        <h3>Добавить новый материал</h3>
        <form method="post" action="/sklad/material/create/" id="material-form">
            <div class="form-group">
                <label for="material-name">Название материала*</label>
                <input type="text" 
                    id="material-name" 
                    name="name" 
                    class="form-control"
                    placeholder="Например: Меловка 130 г/кв.м, глянец"
                    required>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="material-category">Категория*</label>
                    <select id="material-category" name="category" class="form-control" required>
                        <option value="">-- Выберите категорию --</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="material-price">Цена*</label>
                    <input type="number" 
                        id="material-price" 
                        name="price" 
                        class="form-control"
                        step="0.01" 
                        min="0.01" 
                        placeholder="50.00"
                        required>
                </div>
            </div>
            
            <div class="form-row">
                <div class="form-group">
                    <label for="material-unit">Единица измерения</label>
                    <input type="text" 
                        id="material-unit" 
                        name="unit" 
                        class="form-control"
                        value="лист"
                        placeholder="лист, рулон, метр">
                </div>
                
                <div class="form-group">
                    <label for="material-quantity">Количество на складе</label>
                    <input type="number" 
                        id="material-quantity" 
                        name="quantity" 
                        class="form-control"
                        step="0.01" 
                        min="0" 
                        value="0">
                </div>
            </div>
            
            <div class="button-group">
                <button type="submit" class="btn-submit">Сохранить материал</button>
                <button type="button" class="btn-clear" onclick="clearMaterialForm()">Очистить форму</button>
            </div>
        </form>
    </div>
    
    <!-- Таблица со списком материалов -->
    <div class="materials-table">
        <div class="table-header">
            <div class="col-name">Название материала</div>
            <div class="col-price">Цена</div>
            <div class="col-quantity">Количество</div>
            <div class="col-actions">Действия</div>
        </div>
        
        <div class="table-body" id="materials-table-body">
            {materials_rows}
        </div>
    </div>
    
    <!-- Подсказки для пользователя -->
    <div class="table-hint">
        <div class="hint-item">
            <span class="hint-icon">📁</span>
            <span class="hint-text">Показаны материалы из выбранной категории и всех её подкатегорий</span>
        </div>
        <div class="hint-item">
            <span class="hint-icon">👆</span>
            <span class="hint-text">Нажмите на название категории, чтобы увидеть иерархию</span>
        </div>
        <div class="hint-item">
            <span class="hint-icon">✏️</span>
            <span class="hint-text">Двойной клик по названию, цене или количеству для быстрого редактирования</span>
        </div>
    </div>
    '''
    
    return html

@login_required(login_url='/counter/login/')
def get_all_materials(request):
    """
    Получает все материалы (без фильтрации по категории)
    """
    try:
        materials = Material.objects.select_related('category').all().order_by('name')
        
        materials_data = []
        for material in materials:
            quantity_status = material.get_quantity_status()
            
            materials_data.append({
                'id': material.id,
                'name': material.name,
                'category_id': material.category.id,
                'category_name': material.category.name,
                'price': str(material.price),
                'unit': material.unit,
                'quantity': material.quantity,
                'min_quantity': material.min_quantity,
                'price_display': material.get_price_display(),
                'quantity_status_class': quantity_status[0],
                'quantity_status_text': quantity_status[1],
                'is_active': material.is_active,
            })
        
        stats = {
            'categories_count': Category.objects.count(),
            'materials_count': Material.objects.count(),
            'active_materials_count': Material.objects.filter(is_active=True).count(),
            'current_materials_count': materials.count(),
        }
        
        html_content = generate_materials_html(materials_data, None, 0, stats)
        
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
    """
    Главная страница приложения sklad
    """
    
    categories = Category.objects.all().order_by('name')
    materials = Material.objects.select_related('category').all().order_by('name')
    
    category_id = request.GET.get('category_id')
    selected_category = None
    descendants_count = 0
    
    if category_id:
        try:
            selected_category = Category.objects.get(id=category_id)
            descendants = selected_category.get_descendants(include_self=True)
            descendant_ids = list(descendants.values_list('id', flat=True))
            descendants_count = len(descendant_ids) - 1
            materials = materials.filter(category_id__in=descendant_ids)
        except Category.DoesNotExist:
            pass
    
    stats = {
        'categories_count': Category.objects.count(),
        'materials_count': Material.objects.count(),
        'active_materials_count': Material.objects.filter(is_active=True).count(),
    }
    
    root_categories = Category.objects.filter(parent=None).order_by('name')
    
    context = {
        'categories': categories,
        'root_categories': root_categories,
        'materials': materials,
        'selected_category': selected_category,
        'descendants_count': descendants_count,
        'stats': stats,
        'user': request.user,
        'active_app': 'sklad',
    }
    
    return render(request, 'sklad/index.html', context)

# ================== ДЕРЕВО КАТЕГОРИЙ (AJAX) ==================

@login_required(login_url='/counter/login/')
def get_category_tree(request):
    """
    Возвращает дерево категорий в формате JSON
    """
    def serialize_category(category):
        return {
            'id': category.id,
            'name': category.name,
            'children': [serialize_category(child) for child in category.children.all()],
            'materials_count': category.materials.count()
        }
    
    root_categories = Category.objects.filter(parent=None).order_by('name')
    tree = [serialize_category(cat) for cat in root_categories]
    
    return JsonResponse({'tree': tree})

# ================== СОЗДАНИЕ КАТЕГОРИЙ И МАТЕРИАЛОВ ==================

@login_required(login_url='/counter/login/')
@require_POST
def create_category(request):
    """
    Создание новой категории
    """
    try:
        name = request.POST.get('name', '').strip()
        parent_id = request.POST.get('parent', '').strip()
        
        if not name:
            messages.error(request, 'Название категории обязательно')
            return redirect('sklad:index')
        
        if len(name) < 2:
            messages.error(request, 'Название должно содержать минимум 2 символа')
            return redirect('sklad:index')
        
        parent = None
        if parent_id:
            try:
                parent = Category.objects.get(id=parent_id)
            except Category.DoesNotExist:
                messages.error(request, 'Родительская категория не найдена')
                return redirect('sklad:index')
        
        existing = Category.objects.filter(name=name, parent=parent)
        if existing.exists():
            messages.error(request, f'Категория с именем "{name}" уже существует на этом уровне')
            return redirect('sklad:index')
        
        category = Category.objects.create(
            name=name,
            parent=parent
        )
        
        messages.success(request, f'Категория "{category.name}" создана успешно!')
        
    except Exception as e:
        messages.error(request, f'Ошибка при создании категории: {str(e)}')
    
    return redirect('sklad:index')

@login_required(login_url='/counter/login/')
@require_POST
def create_material(request):
    """
    Создание нового материала
    """
    try:
        name = request.POST.get('name', '').strip()
        category_id = request.POST.get('category', '').strip()
        price = request.POST.get('price', '0').strip()
        unit = request.POST.get('unit', 'лист').strip()
        quantity = request.POST.get('quantity', '0').strip()
        
        if not name:
            messages.error(request, 'Название материала обязательно')
            return redirect('sklad:index')
        
        if not category_id:
            messages.error(request, 'Выберите категорию')
            return redirect('sklad:index')
        
        try:
            category = Category.objects.get(id=category_id)
        except Category.DoesNotExist:
            messages.error(request, 'Категория не найдена')
            return redirect('sklad:index')
        
        try:
            price = float(price)
            if price <= 0:
                raise ValueError('Цена должна быть положительной')
        except ValueError:
            messages.error(request, 'Укажите корректную цену')
            return redirect('sklad:index')
        
        try:
            quantity = float(quantity)
            if quantity < 0:
                raise ValueError('Количество не может быть отрицательным')
        except ValueError:
            messages.error(request, 'Укажите корректное количество')
            return redirect('sklad:index')
        
        material = Material.objects.create(
            name=name,
            category=category,
            price=price,
            unit=unit,
            quantity=quantity
        )
        
        messages.success(request, f'Материал "{material.name}" создан успешно!')
        
    except Exception as e:
        messages.error(request, f'Ошибка при создании материала: {str(e)}')
    
    return redirect('sklad:index')

# ================== УДАЛЕНИЕ КАТЕГОРИЙ И МАТЕРИАЛОВ ==================

@login_required(login_url='/counter/login/')
def delete_category(request, category_id):
    """
    Удаление категории
    """
    try:
        category = Category.objects.get(id=category_id)
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
    
    except Category.DoesNotExist:
        messages.error(request, 'Категория не найдена.')
    
    return redirect('sklad:index')

@login_required(login_url='/counter/login/')
@require_http_methods(["POST"])
def delete_material(request, material_id):
    try:
        material = Material.objects.get(id=material_id)
        material_name = material.name
        material.delete()
        
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({
                'success': True,
                'message': f'Материал "{material_name}" удален!'
            })
        else:
            messages.success(request, f'Материал "{material_name}" удален!')
    
    except Material.DoesNotExist:
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({
                'success': False,
                'error': 'Материал не найден.'
            }, status=404)
        else:
            messages.error(request, 'Материал не найден.')
    
    return redirect('sklad:index')

# ================== INLINE-РЕДАКТИРОВАНИЕ (AJAX) ==================

@login_required(login_url='/counter/login/')
@require_http_methods(["POST", "PUT", "PATCH"])
def update_material(request, material_id):
    """
    Обновление материала через AJAX (inline-редактирование)
    """
    
    try:
        material = get_object_or_404(Material, id=material_id)
        
        try:
            data = json.loads(request.body.decode('utf-8'))
        except json.JSONDecodeError:
            return JsonResponse({
                'success': False,
                'error': 'Некорректный формат JSON данных.'
            }, status=400)
        
        if 'field' not in data or 'value' not in data:
            return JsonResponse({
                'success': False,
                'error': 'Отсутствуют обязательные поля: "field" и "value".'
            }, status=400)
        
        field_name = data['field']
        field_value = data['value']
        
        allowed_fields = {
            'name', 'price', 'unit', 'density', 'quantity', 
            'min_quantity', 'notes', 'is_active', 'characteristics'
        }
        
        if field_name not in allowed_fields:
            return JsonResponse({
                'success': False,
                'error': f'Поле "{field_name}" не может быть отредактировано или не существует.'
            }, status=400)
        
        old_value = getattr(material, field_name)
        
        try:
            if field_name == 'name':
                if not field_value or len(field_value.strip()) < 2:
                    return JsonResponse({
                        'success': False,
                        'error': 'Название материала должно содержать минимум 2 символа.'
                    }, status=400)
                
                existing = Material.objects.filter(
                    name=field_value.strip(),
                    category=material.category
                ).exclude(id=material_id)
                
                if existing.exists():
                    return JsonResponse({
                        'success': False,
                        'error': f'Материал с названием "{field_value}" уже существует в этой категории.'
                    }, status=400)
                
                material.name = field_value.strip()
                
            elif field_name == 'price':
                try:
                    price_value = Decimal(str(field_value).replace(',', '.'))
                except (ValueError, InvalidOperation):
                    return JsonResponse({
                        'success': False,
                        'error': 'Некорректный формат цены. Используйте числа (например: 50.00).'
                    }, status=400)
                
                if price_value <= 0:
                    return JsonResponse({
                        'success': False,
                        'error': 'Цена должна быть положительным числом.'
                    }, status=400)
                
                if price_value > 999999.99:
                    return JsonResponse({
                        'success': False,
                        'error': 'Цена не может превышать 999 999.99'
                    }, status=400)
                
                material.price = price_value
                
            elif field_name == 'quantity':
                try:
                    quantity_value = Decimal(str(field_value).replace(',', '.'))
                except (ValueError, InvalidOperation):
                    return JsonResponse({
                        'success': False,
                        'error': 'Некорректный формат количества. Используйте числа (например: 100).'
                    }, status=400)
                
                if quantity_value < 0:
                    return JsonResponse({
                        'success': False,
                        'error': 'Количество не может быть отрицательным.'
                    }, status=400)
                
                if not quantity_value == int(quantity_value):
                    return JsonResponse({
                        'success': False,
                        'error': 'Количество должно быть целым числом.'
                    }, status=400)
                
                material.quantity = int(quantity_value)
                
            elif field_name == 'min_quantity':
                try:
                    min_quantity_value = Decimal(str(field_value).replace(',', '.'))
                except (ValueError, InvalidOperation):
                    return JsonResponse({
                        'success': False,
                        'error': 'Некорректный формат минимального количества.'
                    }, status=400)
                
                if min_quantity_value < 0:
                    return JsonResponse({
                        'success': False,
                        'error': 'Минимальное количество не может быть отрицательным.'
                    }, status=400)
                
                if not min_quantity_value == int(min_quantity_value):
                    return JsonResponse({
                        'success': False,
                        'error': 'Минимальное количество должно быть целым числом.'
                    }, status=400)
                
                material.min_quantity = int(min_quantity_value)
                
            elif field_name == 'density' and field_value:
                try:
                    density_value = int(field_value)
                except ValueError:
                    return JsonResponse({
                        'success': False,
                        'error': 'Плотность должна быть целым числом.'
                    }, status=400)
                
                if density_value <= 0:
                    return JsonResponse({
                        'success': False,
                        'error': 'Плотность должна быть положительным числом.'
                    }, status=400)
                
                material.density = density_value
                
            elif field_name == 'unit':
                if not field_value or len(field_value.strip()) < 1:
                    return JsonResponse({
                        'success': False,
                        'error': 'Единица измерения не может быть пустой.'
                    }, status=400)
                
                material.unit = field_value.strip()
                
            elif field_name == 'is_active':
                if isinstance(field_value, bool):
                    material.is_active = field_value
                elif isinstance(field_value, str):
                    lower_value = field_value.lower()
                    if lower_value in ['true', '1', 'yes', 'да']:
                        material.is_active = True
                    elif lower_value in ['false', '0', 'no', 'нет']:
                        material.is_active = False
                    else:
                        return JsonResponse({
                            'success': False,
                            'error': 'Некорректное значение для поля "is_active". Используйте true/false.'
                        }, status=400)
                else:
                    material.is_active = bool(field_value)
                    
            else:
                setattr(material, field_name, field_value)
                
        except Exception as validation_error:
            return JsonResponse({
                'success': False,
                'error': f'Ошибка валидации: {str(validation_error)}'
            }, status=400)
        
        material.save()
        
        response_data = {
            'success': True,
            'message': f'Поле "{field_name}" успешно обновлено.',
            'material': {
                'id': material.id,
                'name': material.name,
                'price': str(material.price),
                'unit': material.unit,
                'quantity': material.quantity,
                'min_quantity': material.min_quantity,
                'price_display': material.get_price_display(),
                'quantity_status': material.get_quantity_status(),
                'updated_at': material.updated_at.strftime('%d.%m.%Y %H:%M'),
            }
        }
        
        return JsonResponse(response_data)
        
    except Material.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': f'Материал с ID {material_id} не найден.'
        }, status=404)
        
    except Exception as e:
        print(f"Ошибка при обновлении материала: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': f'Внутренняя ошибка сервера: {str(e)}'
        }, status=500)

# ================== ПОЛУЧЕНИЕ СПИСКА КАТЕГОРИЙ ДЛЯ ФОРМЫ ==================

@login_required(login_url='/counter/login/')
def get_categories_for_form(request):
    """
    Возвращает список категорий для формы добавления материала
    """
    try:
        categories = Category.objects.all().order_by('name')
        
        categories_list = []
        for category in categories:
            categories_list.append({
                'id': category.id,
                'name': category.name,
            })
        
        return JsonResponse({
            'success': True,
            'categories': categories_list
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Ошибка получения категорий: {str(e)}'
        }, status=500)