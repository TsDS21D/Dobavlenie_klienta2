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
- Inline-редактирование материала (update_material) – поддерживает все поля, включая density
- Получение списка категорий для формы (get_categories_for_form)
- Вспомогательные тестовые API (test_api, get_category_children)

Добавлена полная поддержка полей:
- density (плотность бумаги) – теперь редактируется inline
- paper_thickness (толщина бумаги) – редактируется inline
- cost, markup_percent, thickness (для плёнки) – редактируются inline
"""

# ================== ИМПОРТЫ ==================
# Стандартные импорты Django
from django.shortcuts import render, redirect, get_object_or_404
# render – рендеринг HTML-шаблона с передачей контекста
# redirect – перенаправление на другой URL
# get_object_or_404 – получение объекта модели или возврат HTTP 404

from django.contrib.auth.decorators import login_required
# login_required – декоратор, требующий, чтобы пользователь был авторизован.
# Если пользователь не авторизован, он будет перенаправлен на страницу входа (login_url='/counter/login/')

from django.views.decorators.cache import never_cache
# never_cache – декоратор, запрещающий кэширование страницы (чтобы всегда показывались актуальные данные)

from django.contrib import messages
# messages – фреймворк для отправки одноразовых уведомлений пользователю (flash-сообщения)

from django.http import JsonResponse
# JsonResponse – ответ в формате JSON (используется для AJAX-API)

from django.views.decorators.http import require_POST, require_http_methods
# require_POST – требует, чтобы запрос был методом POST (иначе вернёт 405)
# require_http_methods – требует определённые HTTP-методы (например, POST, PUT, PATCH)

import json
# json – модуль для парсинга и сериализации JSON-данных

from decimal import Decimal, InvalidOperation
# Decimal – для точной работы с денежными суммами (избегаем ошибок float)
# InvalidOperation – исключение, возникающее при некорректном преобразовании в Decimal

# Импортируем наши модели
from .models import Category, Material

# Импортируем функцию для получения CSRF-токена (нужна при генерации HTML-форм)
from django.middleware.csrf import get_token


# ================== AJAX API ДЛЯ БЕСПЕРЕЗАГРУЗОЧНОЙ РАБОТЫ ==================

@login_required(login_url='/counter/login/')
def test_api(request, category_id):
    """
    Простая тестовая функция для проверки работы API.
    Принимает category_id (может быть любым числом) и возвращает JSON с тестовыми данными.
    Используется для отладки, в реальной работе не задействована.
    """
    try:
        # Возвращаем успешный ответ с тестовыми данными
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
        # В случае любой ошибки возвращаем JSON с ошибкой и статусом 500
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@login_required(login_url='/counter/login/')
def get_category_data(request, category_id=None):
    """
    Возвращает все данные для отображения при выборе категории.
    Используется AJAX-запросами для бес-перезагрузочного обновления правой колонки.
    Принимает GET-параметр type (paper/film) для фильтрации материалов по типу.
    Возвращает JSON с HTML-кодом правой колонки, списком материалов и статистикой.
    """
    try:
        # Получаем тип материала из GET-параметра, по умолчанию 'paper'
        material_type = request.GET.get('type', 'paper')

        # Переменная для хранения выбранной категории (будет заполнена, если передан category_id)
        selected_category = None

        # Базовый QuerySet материалов – только нужного типа, отсортированные по имени,
        # с подгрузкой связанной категории (select_related для уменьшения числа запросов)
        materials = Material.objects.select_related('category').filter(
            type=material_type
        ).order_by('name')

        # Количество подкатегорий (для отображения в заголовке)
        descendants_count = 0

        # Если передан category_id, фильтруем материалы по этой категории и её потомкам
        if category_id:
            try:
                # Пытаемся найти категорию с указанным id и типом
                selected_category = Category.objects.get(id=category_id, type=material_type)

                # Получаем всех потомков категории (включая саму категорию)
                descendants = selected_category.get_descendants(include_self=True)

                # Извлекаем список ID всех потомков
                descendant_ids = list(descendants.values_list('id', flat=True))

                # Количество подкатегорий = общее количество потомков минус 1 (сама категория)
                descendants_count = len(descendant_ids) - 1

                # Ограничиваем материалы только теми, чья категория входит в список descendant_ids
                materials = materials.filter(category_id__in=descendant_ids)

            except Category.DoesNotExist:
                # Если категория не найдена – сбрасываем выбранную категорию и количество подкатегорий
                selected_category = None
                descendants_count = 0

        # Преобразуем каждый объект Material в словарь с помощью метода to_dict()
        # Это удобно для сериализации в JSON
        materials_data = [m.to_dict() for m in materials]

        # Статистика для текущего типа материала
        stats = {
            'categories_count': Category.objects.filter(type=material_type).count(),
            'materials_count': Material.objects.filter(type=material_type).count(),
            'active_materials_count': Material.objects.filter(type=material_type, is_active=True).count(),
            'current_materials_count': materials.count(),  # количество материалов после фильтрации
        }

        # Если выбрана категория, создаём словарь с её id и названием (для передачи в шаблон)
        category_dict = None
        if selected_category:
            category_dict = {'id': selected_category.id, 'name': selected_category.name}

        # Получаем CSRF-токен для вставки в форму (он понадобится при генерации HTML)
        csrf_token = get_token(request)

        # Генерируем HTML для правой колонки (таблица материалов + форма добавления + статистика)
        html_content = generate_materials_html(materials_data, category_dict, descendants_count, stats, csrf_token)

        # Возвращаем JSON-ответ со всеми данными
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
        # Логируем ошибку в консоль сервера для отладки
        print(f"Ошибка в get_category_data: {str(e)}")
        import traceback
        traceback.print_exc()

        # Генерируем HTML с сообщением об ошибке и кнопкой повторной попытки
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
    Получает всех потомков категории для отображения подкатегорий в информационном блоке.
    Учитывает тип материала (GET-параметр type).
    """
    try:
        # Получаем тип материала из запроса
        material_type = request.GET.get('type', 'paper')

        # Находим категорию или возвращаем 404, если не найдена
        category = get_object_or_404(Category, id=category_id, type=material_type)

        # Получаем всех потомков (без самой категории, т.к. include_self=False по умолчанию)
        descendants = category.get_descendants()

        # Формируем список подкатегорий для JSON-ответа
        subcategories = []
        for descendant in descendants:
            subcategories.append({
                'id': descendant.id,
                'name': descendant.name,
                'materials_count': descendant.materials.filter(type=material_type).count(),
                'level': descendant.level - category.level - 1,  # относительный уровень вложенности
            })

        # Возвращаем успешный JSON-ответ
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
        # В случае ошибки возвращаем JSON с ошибкой
        return JsonResponse({
            'success': False,
            'error': f'Ошибка при получении подкатегорий: {str(e)}'
        }, status=500)


def generate_materials_html(materials_data, selected_category, descendants_count, stats, csrf_token):
    """
    Универсальная функция для генерации HTML таблицы материалов.
    Всегда включает форму добавления и кнопку, даже если материалов нет.

    Параметры:
    - materials_data: список словарей с данными материалов (результат to_dict())
    - selected_category: словарь с id и name выбранной категории (или None)
    - descendants_count: количество подкатегорий (для отображения в заголовке)
    - stats: словарь со статистикой (количество категорий, материалов и т.д.)
    - csrf_token: CSRF-токен для вставки в форму

    ВАЖНО: все поля (density, paper_thickness, cost, markup_percent, thickness)
    теперь имеют атрибут data-editable="true", чтобы их можно было редактировать inline.
    """
    materials_rows = ''   # Пустая строка, в которую будем собирать HTML строк таблицы

    # Если есть материалы, формируем строки таблицы
    if materials_data:
        for material in materials_data:
            # Определяем CSS-класс для количества в зависимости от остатка
            quantity_class = ''
            if material['quantity'] <= 0:
                quantity_class = 'quantity-zero'          # нет в наличии
            elif material['min_quantity'] and material['quantity'] <= material['min_quantity']:
                quantity_class = 'quantity-low'           # мало

            # Генерация дополнительной информации (extra_info) в зависимости от типа материала
            extra_info = ''
            if material['type'] == 'film':
                # --- Плёнка: себестоимость, наценка, толщина (все редактируемые) ---
                # Себестоимость
                cost_display = material['cost'] if material['cost'] is not None else '—'
                cost_value = material['cost'] if material['cost'] is not None else ''
                extra_info += f'''
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
                '''

                # Наценка
                markup_display = material['markup_percent'] if material['markup_percent'] is not None else '—'
                markup_value = material['markup_percent'] if material['markup_percent'] is not None else ''
                extra_info += f'''
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

                # Толщина плёнки
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
            else:  # material['type'] == 'paper'
                # --- Бумага: плотность и толщина бумаги (оба редактируемые) ---
                # Плотность (density) – теперь редактируемая!
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

                # Толщина бумаги
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

            # Экранируем спецсимволы для безопасной вставки в атрибуты HTML
            material_name = material['name'].replace("'", "\\'").replace('"', '&quot;')
            material_price = str(material['price']).replace("'", "\\'")
            material_quantity = str(material['quantity']).replace("'", "\\'")

            # Цена редактируется только для бумаги (для плёнки цена вычисляется)
            price_editable = material['type'] == 'paper'
            price_attrs = ''
            price_class = 'price-badge'
            if price_editable:
                price_attrs = f'data-editable="true" data-field="price" data-original-value="{material_price}"'
                price_class += ' editable-field'

            # Количество редактируется всегда
            quantity_attrs = (f'data-editable="true" data-field="quantity" '
                              f'data-original-value="{material_quantity}" '
                              f'data-min-quantity="{material["min_quantity"]}" '
                              f'data-material-id="{material["id"]}"')
            quantity_class = f'quantity-badge {quantity_class} editable-field'

            # Формируем одну строку таблицы
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
                    <span class="{price_class}" {price_attrs}>
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

    # Формируем заголовок с информацией о выбранной категории
    category_title = ''
    if selected_category:
        if descendants_count > 0:
            category_title = f'в категории "<strong>{selected_category["name"]}</strong>" и {descendants_count} подкатегориях'
        else:
            category_title = f'в категории "<strong>{selected_category["name"]}</strong>"'

    # Полный HTML правой колонки (секция материалов, статистика, форма добавления, таблица, подсказки)
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

    <!-- Блок статистики -->
    <div class="stats-container">
        <div class="stat-card"><div class="stat-value">{stats['categories_count']}</div><div class="stat-label">Категорий</div></div>
        <div class="stat-card"><div class="stat-value">{stats['materials_count']}</div><div class="stat-label">Всего материалов</div></div>
        <div class="stat-card"><div class="stat-value">{stats['active_materials_count']}</div><div class="stat-label">Активных</div></div>
    </div>

    <!-- Форма добавления материала (изначально скрыта) -->
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
            <!-- Поля для бумаги -->
            <div id="paper-fields">
                <div class="form-row">
                    <div class="form-group">
                        <label for="material-price">Цена*</label>
                        <input type="number" id="material-price" name="price" class="form-control" step="0.01" min="0.01" placeholder="50.00">
                    </div>
                    <div class="form-group">
                        <label for="material-unit">Единица измерения</label>
                        <input type="text" id="material-unit" name="unit" class="form-control" value="лист">
                    </div>
                </div>
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
                <div class="form-row">
                    <div class="form-group">
                        <label for="material-cost">Себестоимость (руб.)*</label>
                        <input type="number" id="material-cost" name="cost" class="form-control" step="0.01" min="0">
                    </div>
                    <div class="form-group">
                        <label for="material-markup">Наценка (%)*</label>
                        <input type="number" id="material-markup" name="markup_percent" class="form-control" step="0.01" min="0">
                    </div>
                </div>
                <div class="form-group">
                    <label for="material-thickness">Толщина (мкм)*</label>
                    <input type="number" id="material-thickness" name="thickness" class="form-control" step="1" min="1">
                </div>
            </div>
            <!-- Складские поля (общие) -->
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

    <!-- Таблица со списком материалов -->
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

    <!-- Подсказки для пользователя -->
    <div class="table-hint">
        <div class="hint-item"><span class="hint-icon">📁</span>Показаны материалы из выбранной категории и всех её подкатегорий</div>
        <div class="hint-item"><span class="hint-icon">👆</span>Нажмите на название категории, чтобы увидеть иерархию</div>
        <div class="hint-item"><span class="hint-icon">✏️</span>Двойной клик по любому полю (название, цена, количество, плотность, толщина) для быстрого редактирования</div>
    </div>
    '''
    return html


@login_required(login_url='/counter/login/')
def get_all_materials(request):
    """
    Возвращает все материалы выбранного типа (без фильтрации по категории).
    Используется, когда не выбрана ни одна категория.
    GET-параметр type (paper/film) определяет тип.
    """
    try:
        material_type = request.GET.get('type', 'paper')

        # Получаем все материалы выбранного типа, отсортированные по имени
        materials = Material.objects.select_related('category').filter(
            type=material_type
        ).order_by('name')

        # Преобразуем в список словарей
        materials_data = [m.to_dict() for m in materials]

        # Статистика
        stats = {
            'categories_count': Category.objects.filter(type=material_type).count(),
            'materials_count': Material.objects.filter(type=material_type).count(),
            'active_materials_count': Material.objects.filter(type=material_type, is_active=True).count(),
            'current_materials_count': materials.count(),
        }

        csrf_token = get_token(request)

        # Генерируем HTML (без выбранной категории)
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
    """
    Главная страница приложения sklad.
    Используется для первоначальной загрузки (без AJAX).
    Принимает GET-параметры: category_id и type.
    """
    # Получаем тип материала из GET-параметра
    material_type = request.GET.get('type', 'paper')

    # Категории выбранного типа (для выпадающих списков)
    categories = Category.objects.filter(type=material_type).order_by('name')

    # Материалы выбранного типа (начальный QuerySet)
    materials = Material.objects.select_related('category').filter(type=material_type).order_by('name')

    category_id = request.GET.get('category_id')
    selected_category = None
    descendants_count = 0

    # Если указана категория, фильтруем материалы по ней и её потомкам
    if category_id:
        try:
            selected_category = Category.objects.get(id=category_id, type=material_type)
            descendants = selected_category.get_descendants(include_self=True)
            descendant_ids = list(descendants.values_list('id', flat=True))
            descendants_count = len(descendant_ids) - 1
            materials = materials.filter(category_id__in=descendant_ids)
        except Category.DoesNotExist:
            # Если категория не найдена – игнорируем
            pass

    # Статистика для отображения в шаблоне
    stats = {
        'categories_count': Category.objects.filter(type=material_type).count(),
        'materials_count': Material.objects.filter(type=material_type).count(),
        'active_materials_count': Material.objects.filter(type=material_type, is_active=True).count(),
    }

    # Корневые категории (для построения дерева на клиенте)
    root_categories = Category.objects.filter(parent=None, type=material_type).order_by('name')

    # Контекст для шаблона
    context = {
        'categories': categories,
        'root_categories': root_categories,
        'materials': materials,
        'selected_category': selected_category,
        'descendants_count': descendants_count,
        'stats': stats,
        'user': request.user,
        'active_app': 'sklad',
        'current_type': material_type,   # передаём тип в шаблон для инициализации переключателя
    }

    return render(request, 'sklad/index.html', context)


# ================== ДЕРЕВО КАТЕГОРИЙ (AJAX) ==================

@login_required(login_url='/counter/login/')
def get_category_tree(request):
    """
    Возвращает дерево категорий в формате JSON с учётом типа материала.
    GET-параметр type (paper/film) определяет, какие категории показывать.
    """
    material_type = request.GET.get('type', 'paper')

    # Внутренняя рекурсивная функция для сериализации категории в словарь
    def serialize_category(category):
        return {
            'id': category.id,
            'name': category.name,
            'children': [serialize_category(child) for child in category.children.all()],
            'materials_count': category.materials.filter(type=material_type).count()
        }

    # Корневые категории (у которых parent=None) выбранного типа
    root_categories = Category.objects.filter(parent=None, type=material_type).order_by('name')

    # Строим дерево
    tree = [serialize_category(cat) for cat in root_categories]

    return JsonResponse({'tree': tree})


# ================== СОЗДАНИЕ КАТЕГОРИЙ И МАТЕРИАЛОВ ==================

@login_required(login_url='/counter/login/')
@require_POST
def create_category(request):
    """
    Создание новой категории.
    Принимает POST-данные: name (название), parent (ID родительской категории, опционально), type (тип).
    После успешного создания перенаправляет на главную страницу с сохранением параметра type.
    """
    try:
        # Получаем данные из POST
        name = request.POST.get('name', '').strip()
        parent_id = request.POST.get('parent', '')
        material_type = request.POST.get('type', 'paper')

        # Валидация: название не должно быть пустым и должно быть не короче 2 символов
        if not name:
            messages.error(request, 'Название категории обязательно')
            return redirect(f'/sklad/?type={material_type}')

        if len(name) < 2:
            messages.error(request, 'Название должно содержать минимум 2 символа')
            return redirect(f'/sklad/?type={material_type}')

        # Поиск родительской категории (если указана)
        parent = None
        if parent_id:
            try:
                parent = Category.objects.get(id=parent_id, type=material_type)
            except Category.DoesNotExist:
                messages.error(request, 'Родительская категория не найдена')
                return redirect(f'/sklad/?type={material_type}')

        # Проверка уникальности названия на одном уровне иерархии
        existing = Category.objects.filter(name=name, parent=parent, type=material_type)
        if existing.exists():
            messages.error(request, f'Категория с именем "{name}" уже существует на этом уровне')
            return redirect(f'/sklad/?type={material_type}')

        # Создаём категорию
        category = Category.objects.create(
            name=name,
            parent=parent,
            type=material_type
        )
        messages.success(request, f'Категория "{category.name}" создана успешно!')

    except Exception as e:
        messages.error(request, f'Ошибка при создании категории: {str(e)}')

    # Перенаправляем на главную страницу с тем же типом
    return redirect(f'/sklad/?type={material_type}')


@login_required(login_url='/counter/login/')
@require_POST
def create_material(request):
    """
    Создание нового материала.
    Принимает POST-данные в зависимости от типа материала (бумага/плёнка).
    Поддерживает AJAX-запросы (возвращает JSON) и обычные (редирект).
    """
    try:
        # Общие поля
        name = request.POST.get('name', '').strip()
        category_id = request.POST.get('category', '')
        material_type = request.POST.get('type', 'paper')
        quantity = request.POST.get('quantity', '0')
        min_quantity = request.POST.get('min_quantity', '10')
        notes = request.POST.get('notes', '')
        is_active = request.POST.get('is_active') == 'on'  # чекбокс возвращает 'on' если отмечен

        # Валидация
        if not name:
            raise ValueError('Название материала обязательно')

        if not category_id:
            raise ValueError('Выберите категорию')

        # Проверяем существование категории с учётом типа
        try:
            category = Category.objects.get(id=category_id, type=material_type)
        except Category.DoesNotExist:
            raise ValueError('Категория не найдена')

        # Базовый словарь данных
        material_data = {
            'name': name,
            'category': category,
            'type': material_type,
            'quantity': int(quantity),
            'min_quantity': int(min_quantity),
            'notes': notes,
            'is_active': is_active,
        }

        # Заполняем специфичные поля в зависимости от типа
        if material_type == 'paper':
            price = request.POST.get('price')
            unit = request.POST.get('unit', 'лист')
            density = request.POST.get('density')
            paper_thickness = request.POST.get('paper_thickness')

            if not price:
                raise ValueError('Цена обязательна')
            material_data['price'] = Decimal(price)
            material_data['unit'] = unit
            if density and density.strip():
                material_data['density'] = int(density)
            if paper_thickness and paper_thickness.strip():
                material_data['paper_thickness'] = Decimal(paper_thickness)

        elif material_type == 'film':
            cost = request.POST.get('cost')
            markup_percent = request.POST.get('markup_percent')
            thickness = request.POST.get('thickness')

            if not cost or not markup_percent or not thickness:
                raise ValueError('Для плёнки необходимо заполнить себестоимость, наценку и толщину')
            material_data['cost'] = Decimal(cost)
            material_data['markup_percent'] = Decimal(markup_percent)
            material_data['thickness'] = int(thickness)

        # Создаём материал
        material = Material.objects.create(**material_data)

        # Если это AJAX-запрос – возвращаем JSON
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({
                'success': True,
                'message': f'Материал "{material.name}" создан успешно!',
                'material': material.to_dict()
            })
        else:
            # Обычный POST – редирект с сообщением
            messages.success(request, f'Материал "{material.name}" создан успешно!')
            return redirect('sklad:index')

    except Exception as e:
        # Обработка ошибок
        if request.headers.get('x-requested-with') == 'XMLHttpRequest':
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=400)
        else:
            messages.error(request, f'Ошибка при создании материала: {str(e)}')
            return redirect('sklad:index')


# ================== УДАЛЕНИЕ КАТЕГОРИЙ И МАТЕРИАЛОВ ==================

@login_required(login_url='/counter/login/')
def delete_category(request, category_id):
    """
    Удаление категории.
    Удаление возможно только если в категории нет материалов и нет подкатегорий.
    Сохраняет тип удаляемой категории для корректного перенаправления.
    """
    try:
        # Находим категорию или возвращаем 404
        category = get_object_or_404(Category, id=category_id)
        material_type = category.type          # сохраняем тип (paper/film)
        category_name = category.name

        # Проверяем, есть ли материалы или подкатегории
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

        # Перенаправляем на главную страницу с тем же типом
        return redirect(f'/sklad/?type={material_type}')

    except Category.DoesNotExist:
        messages.error(request, 'Категория не найдена.')
        return redirect('/sklad/')


@login_required(login_url='/counter/login/')
@require_http_methods(["POST"])
def delete_material(request, material_id):
    """
    Удаление материала.
    Поддерживает как обычные запросы, так и AJAX.
    """
    try:
        material = Material.objects.get(id=material_id)
        material_name = material.name
        material.delete()

        # Если AJAX-запрос – возвращаем JSON
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

    # Для обычного POST – редирект
    return redirect('sklad:index')


# ================== INLINE-РЕДАКТИРОВАНИЕ (AJAX) ==================

@login_required(login_url='/counter/login/')
@require_http_methods(["POST", "PUT", "PATCH"])
def update_material(request, material_id):
    """
    Обновление материала через AJAX (inline-редактирование).
    Ожидает JSON с полями field (название поля) и value (новое значение).
    Поддерживает ВСЕ поля: name, price, quantity, min_quantity, unit,
    density, paper_thickness, cost, markup_percent, thickness, is_active, notes.
    Для полей, которые могут быть NULL (например, толщина бумаги, себестоимость),
    пустая строка преобразуется в None.
    """
    try:
        # Находим материал или возвращаем 404
        material = get_object_or_404(Material, id=material_id)

        # Парсим JSON из тела запроса
        try:
            data = json.loads(request.body.decode('utf-8'))
        except json.JSONDecodeError:
            return JsonResponse({
                'success': False,
                'error': 'Некорректный формат JSON данных.'
            }, status=400)

        field_name = data.get('field')
        field_value = data.get('value')

        # Проверяем обязательные поля
        if not field_name or field_value is None:
            return JsonResponse({
                'success': False,
                'error': 'Отсутствуют обязательные поля: "field" и "value".'
            }, status=400)

        # Разрешённые поля для редактирования (все возможные)
        allowed_fields = {
            'name', 'price', 'unit', 'density', 'quantity',
            'min_quantity', 'notes', 'is_active', 'characteristics',
            'cost', 'markup_percent', 'thickness', 'paper_thickness'
        }
        if field_name not in allowed_fields:
            return JsonResponse({
                'success': False,
                'error': f'Поле "{field_name}" не может быть отредактировано или не существует.'
            }, status=400)

        # Обрабатываем каждое поле отдельно с валидацией
        try:
            # ===== ОБРАБОТКА ПУСТЫХ ЗНАЧЕНИЙ ДЛЯ ПОЛЕЙ, КОТОРЫЕ МОГУТ БЫТЬ NULL =====
            # Если значение – пустая строка, устанавливаем None (NULL в базе)
            if field_name == 'name':
                # Название: не менее 2 символов, уникальность в рамках категории
                if not field_value or len(field_value.strip()) < 2:
                    return JsonResponse({
                        'success': False,
                        'error': 'Название материала должно содержать минимум 2 символа.'
                    }, status=400)
                # Проверка уникальности в рамках категории
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
                # Цена редактируется только для бумаги
                if material.type == 'paper':
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
                else:
                    return JsonResponse({
                        'success': False,
                        'error': 'Цена для плёнки вычисляется автоматически и не может быть отредактирована.'
                    }, status=400)

            elif field_name == 'quantity':
                # Количество – целое неотрицательное число
                try:
                    quantity_value = Decimal(str(field_value).replace(',', '.'))
                except (ValueError, InvalidOperation):
                    return JsonResponse({
                        'success': False,
                        'error': 'Некорректный формат количества. Используйте целые числа.'
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
                # Минимальное количество – целое неотрицательное
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

            elif field_name == 'density':
                # Плотность (только для бумаги, целое положительное число)
                if material.type != 'paper':
                    return JsonResponse({
                        'success': False,
                        'error': 'Плотность можно редактировать только для бумаги.'
                    }, status=400)
                # Пустое значение – устанавливаем None
                if field_value == '' or field_value is None:
                    material.density = None
                else:
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
                # Единица измерения – непустая строка
                if not field_value or len(field_value.strip()) < 1:
                    return JsonResponse({
                        'success': False,
                        'error': 'Единица измерения не может быть пустой.'
                    }, status=400)
                material.unit = field_value.strip()

            elif field_name == 'is_active':
                # Преобразуем в булево значение
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

            # ===== ПОЛЯ ДЛЯ БУМАГИ =====
            elif field_name == 'paper_thickness' and material.type == 'paper':
                # Толщина бумаги: пустая строка -> None, иначе положительное число
                if field_value == '' or field_value is None:
                    material.paper_thickness = None
                else:
                    try:
                        thickness_value = Decimal(str(field_value).replace(',', '.'))
                    except (ValueError, InvalidOperation):
                        return JsonResponse({
                            'success': False,
                            'error': 'Некорректный формат толщины бумаги. Используйте число (например, 0.1).'
                        }, status=400)
                    if thickness_value <= 0:
                        return JsonResponse({
                            'success': False,
                            'error': 'Толщина бумаги должна быть положительным числом.'
                        }, status=400)
                    if thickness_value > 100:   # разумное ограничение 100 мм
                        return JsonResponse({
                            'success': False,
                            'error': 'Толщина бумаги не может превышать 100 мм.'
                        }, status=400)
                    material.paper_thickness = thickness_value

            # ===== ПОЛЯ ДЛЯ ПЛЁНКИ =====
            elif field_name == 'cost' and material.type == 'film':
                # Себестоимость: пустая строка -> None, иначе неотрицательное число
                if field_value == '' or field_value is None:
                    material.cost = None
                else:
                    try:
                        cost_value = Decimal(str(field_value).replace(',', '.'))
                    except (ValueError, InvalidOperation):
                        return JsonResponse({
                            'success': False,
                            'error': 'Некорректный формат себестоимости.'
                        }, status=400)
                    if cost_value < 0:
                        return JsonResponse({
                            'success': False,
                            'error': 'Себестоимость не может быть отрицательной.'
                        }, status=400)
                    material.cost = cost_value

            elif field_name == 'markup_percent' and material.type == 'film':
                # Наценка: пустая строка -> None, иначе неотрицательное число
                if field_value == '' or field_value is None:
                    material.markup_percent = None
                else:
                    try:
                        markup_value = Decimal(str(field_value).replace(',', '.'))
                    except (ValueError, InvalidOperation):
                        return JsonResponse({
                            'success': False,
                            'error': 'Некорректный формат наценки.'
                        }, status=400)
                    if markup_value < 0:
                        return JsonResponse({
                            'success': False,
                            'error': 'Наценка не может быть отрицательной.'
                        }, status=400)
                    material.markup_percent = markup_value

            elif field_name == 'thickness' and material.type == 'film':
                # Толщина плёнки: пустая строка -> None, иначе положительное целое
                if field_value == '' or field_value is None:
                    material.thickness = None
                else:
                    try:
                        thickness_value = int(field_value)
                    except ValueError:
                        return JsonResponse({
                            'success': False,
                            'error': 'Толщина должна быть целым числом.'
                        }, status=400)
                    if thickness_value <= 0:
                        return JsonResponse({
                            'success': False,
                            'error': 'Толщина должна быть положительным числом.'
                        }, status=400)
                    material.thickness = thickness_value

            else:
                # Для остальных полей (notes, characteristics) – прямое присвоение
                setattr(material, field_name, field_value)

        except Exception as validation_error:
            return JsonResponse({
                'success': False,
                'error': f'Ошибка валидации: {str(validation_error)}'
            }, status=400)

        # Сохраняем изменения в базе данных
        material.save()

        # Возвращаем успешный ответ с обновлёнными данными материала
        response_data = {
            'success': True,
            'message': f'Поле "{field_name}" успешно обновлено.',
            'material': material.to_dict()
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
    Возвращает список категорий для выпадающего списка в форме добавления материала.
    Фильтрует по типу материала (GET-параметр type).
    Используется AJAX-запросом при открытии формы.
    """
    try:
        material_type = request.GET.get('type', 'paper')
        # Получаем все категории выбранного типа, сортируем по имени
        categories = Category.objects.filter(type=material_type).order_by('name')
        # Преобразуем в список словарей {id, name}
        categories_list = [{'id': c.id, 'name': c.name} for c in categories]
        return JsonResponse({
            'success': True,
            'categories': categories_list
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Ошибка получения категорий: {str(e)}'
        }, status=500)
    
@login_required
def get_films_list(request):
    """
    Возвращает список плёнок (материалы с type='film') для выпадающего списка в секции "Ламинация".
    URL: /sklad/api/films/
    """
    from .models import Material
    films = Material.objects.filter(type='film', is_active=True).order_by('name')
    data = [{'id': f.id, 'name': f.name} for f in films]
    return JsonResponse({'success': True, 'films': data})