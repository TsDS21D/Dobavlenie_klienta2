/*
 * sklad.js
 * Полный JavaScript-файл для приложения sklad (управление складом материалов).
 *
 * Основные функции:
 * - Загрузка и отображение древовидной структуры категорий (с поддержкой бумаги/плёнки)
 * - Управление формами добавления категорий и материалов (AJAX-отправка)
 * - Inline-редактирование любых полей (двойной клик) – включая плотность (density)
 * - Удаление материалов и категорий
 * - Переключение между типами материалов (бумага/плёнка)
 * - Вспомогательные функции (уведомления, CSRF-токен, экранирование HTML)
 *
 * Все функции доступны глобально через объект window.sklad.
 *
 * Автор: разработчик
 * Дата: 2025
 */

// ================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==================
// Хранит ID выбранной в данный момент категории (для подсветки в дереве и фильтрации)
let sklad_currentSelectedCategoryId = null;

// Хранит DOM-элемент, который сейчас находится в режиме inline-редактирования (чтобы не открывать два редактора одновременно)
let sklad_currentEditingElement = null;

// Текущий тип материала: 'paper' (бумага) или 'film' (плёнка). Определяется из URL или переключателя.
let sklad_currentMaterialType = 'paper';

// Флаг, открыта ли форма добавления материала (используется для синхронизации состояния кнопки)
let sklad_isMaterialFormOpen = false;

// ================== ФУНКЦИИ ДЛЯ РАБОТЫ С ДЕРЕВОМ КАТЕГОРИЙ ==================

/**
 * Загружает дерево категорий с сервера и отображает его.
 * Учитывает текущий тип материала (sklad_currentMaterialType).
 * @returns {Promise} Promise, который разрешается при успешной загрузке.
 */
function loadCategoryTree() {
    // Выводим в консоль отладочную информацию (тип материала)
    console.log('[SKLAD] Загрузка дерева категорий, тип:', sklad_currentMaterialType);
    
    // Находим контейнер, куда будем вставлять дерево
    const treeContainer = document.getElementById('category-tree-container');
    // Если контейнер не найден – возвращаем отклонённый Promise с ошибкой
    if (!treeContainer) {
        return Promise.reject('Контейнер для дерева не найден');
    }
    
    // Показываем индикатор загрузки (спиннер)
    treeContainer.innerHTML = `
        <div class="tree-loading">
            <div class="spinner"></div>
            <p>Загрузка дерева категорий...</p>
        </div>
    `;
    
    // Выполняем GET-запрос к API /sklad/category/tree/ с параметром type (текущий тип)
    return fetch(`/sklad/category/tree/?type=${sklad_currentMaterialType}`)
        .then(response => {
            // Если ответ не успешный (статус не 2xx), выбрасываем ошибку
            if (!response.ok) {
                throw new Error(`Ошибка HTTP: ${response.status} ${response.statusText}`);
            }
            // Парсим ответ как JSON
            return response.json();
        })
        .then(data => {
            // Логируем полученные данные
            console.log('[SKLAD] Дерево категорий загружено успешно:', data);
            // Проверяем, что данные содержат поле tree (массив корневых категорий)
            if (!data || !data.tree) {
                throw new Error('Некорректные данные дерева категорий');
            }
            // Вызываем функцию отрисовки дерева
            renderCategoryTree(data.tree);
            // Если ранее была выбрана категория – выделяем её заново (после обновления дерева)
            if (sklad_currentSelectedCategoryId) {
                highlightSelectedCategory(sklad_currentSelectedCategoryId);
            }
            return data; // Возвращаем данные для возможной дальнейшей обработки
        })
        .catch(error => {
            // Логируем ошибку в консоль
            console.error('[SKLAD] Ошибка загрузки дерева категорий:', error);
            // Показываем в контейнере сообщение об ошибке и кнопку повторной попытки
            treeContainer.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Ошибка загрузки дерева категорий</p>
                    <p class="error-details">${error.message}</p>
                    <button class="btn-retry" onclick="loadCategoryTree()">
                        <i class="fas fa-redo"></i> Повторить попытку
                    </button>
                </div>
            `;
            // Пробрасываем ошибку дальше
            return Promise.reject(error);
        });
}

/**
 * Отрисовывает дерево категорий в контейнере.
 * Использует рекурсивную функцию для создания HTML-структуры.
 * @param {Array} treeData - Массив данных корневых категорий (каждая категория имеет id, name, children, materials_count)
 */
function renderCategoryTree(treeData) {
    console.log('[SKLAD] Отрисовка дерева категорий...');
    
    const treeContainer = document.getElementById('category-tree-container');
    if (!treeContainer) {
        console.error('[SKLAD] Контейнер для дерева не найден');
        return;
    }
    
    // Если данных нет (пустой массив) – показываем сообщение о пустом дереве
    if (!treeData || treeData.length === 0) {
        treeContainer.innerHTML = `
            <div class="empty-tree">
                <i class="fas fa-folder-open"></i>
                <p>Категорий нет. Создайте первую!</p>
                <p class="hint-text">Нажмите "Добавить категорию" выше</p>
            </div>
        `;
        return;
    }
    
    // Начинаем формировать HTML-код дерева
    let html = '<div class="tree">';
    
    /**
     * Рекурсивная функция для создания HTML-узла одной категории.
     * @param {Object} category - Объект категории (id, name, children, materials_count)
     * @param {number} level - Уровень вложенности (0 – корневая)
     * @param {boolean} isLast - Является ли этот узел последним в своей группе (для CSS-стилей)
     * @returns {string} HTML-строка узла
     */
    function createCategoryNode(category, level = 0, isLast = false) {
        // Проверяем, что категория имеет необходимые поля
        if (!category || !category.id || !category.name) {
            console.warn('[SKLAD] Некорректные данные категории:', category);
            return '';
        }
        
        // Определяем, есть ли у категории дочерние элементы
        const hasChildren = category.children && category.children.length > 0;
        
        // Формируем классы для элемента .tree-item
        let categoryClass = 'tree-item';
        categoryClass += ` level-${Math.min(level, 3)}`; // level-0, level-1, level-2, level-3 (не более 3)
        if (isLast) categoryClass += ' last-child';      // добавляем класс, если последний в группе
        
        // Если ID категории совпадает с текущей выбранной – добавляем класс selected
        if (parseInt(sklad_currentSelectedCategoryId) === parseInt(category.id)) {
            categoryClass += ' selected';
        }
        
        // Начинаем формировать HTML узла
        let nodeHtml = `
            <div class="${categoryClass}" 
                 data-category-id="${category.id}"
                 data-category-name="${escapeHtml(category.name)}"
                 data-category-level="${level}"
                 data-has-children="${hasChildren}">
                
                <div class="tree-item-content">
                    <!-- Иконка: папка для родительских, файл для листьев -->
                    <div class="tree-icon ${hasChildren ? 'folder' : 'leaf'}">
                        ${hasChildren ? '<i class="fas fa-folder"></i>' : '<i class="fas fa-file"></i>'}
                    </div>
                    
                    <!-- Название категории и счётчик материалов -->
                    <div class="tree-name">
                        <a href="#" class="category-link" 
                           title="Показать материалы в категории: ${escapeHtml(category.name)}">
                            ${escapeHtml(category.name)}
                        </a>
                        ${category.materials_count > 0 ? 
                            `<span class="material-count" 
                                   title="${category.materials_count} материалов в этой категории">
                                ${category.materials_count}
                            </span>` : ''}
                    </div>
                    
                    <!-- Кнопки действий (добавить подкатегорию, удалить) -->
                    <div class="tree-actions">
                        <!-- Кнопка добавления подкатегории (всегда активна) -->
                        <button class="btn-tree-action btn-add-subcategory" 
                                data-category-id="${category.id}"
                                title="Добавить подкатегорию в '${escapeHtml(category.name)}'"
                                onclick="event.stopPropagation(); addSubcategory('${category.id}', '${escapeHtml(category.name)}')">
                            <i class="fas fa-plus-circle"></i>
                        </button>
                        
                        <!-- Кнопка удаления: показываем только если нет материалов и нет подкатегорий -->
                        ${category.materials_count === 0 && (!hasChildren || category.children.length === 0) ?
                            `<a href="/sklad/category/delete/${category.id}/" 
                               class="btn-tree-action btn-delete-category"
                               title="Удалить категорию '${escapeHtml(category.name)}'"
                               onclick="return confirmDeleteCategory('${category.id}', '${escapeHtml(category.name)}')">
                                <i class="fas fa-trash-alt"></i>
                            </a>` :
                            `<span class="btn-tree-action btn-disabled" 
                                  title="Нельзя удалить (есть материалы или подкатегории)">
                                <i class="fas fa-trash-alt" style="opacity: 0.3;"></i>
                            </span>`
                        }
                    </div>
                </div>
        `;
        
        // Если есть дочерние категории – рекурсивно добавляем их в блок .tree-children
        if (hasChildren) {
            nodeHtml += '<div class="tree-children">';
            const childrenCount = category.children.length;
            category.children.forEach((child, index) => {
                const isChildLast = index === childrenCount - 1;
                nodeHtml += createCategoryNode(child, level + 1, isChildLast);
            });
            nodeHtml += '</div>';
        }
        
        nodeHtml += '</div>'; // закрываем .tree-item
        return nodeHtml;
    }
    
    // Проходим по всем корневым категориям и добавляем их в HTML
    const rootCount = treeData.length;
    treeData.forEach((category, index) => {
        const isLast = index === rootCount - 1;
        html += createCategoryNode(category, 0, isLast);
    });
    
    html += '</div>'; // закрываем .tree
    
    // Вставляем готовый HTML в контейнер
    treeContainer.innerHTML = html;
    console.log('[SKLAD] Дерево категорий отрисовано успешно');
    
    // Добавляем обработчики событий для кликов по категориям и кнопкам
    attachTreeEventListeners();
    
    // Если есть выбранная категория – прокручиваем к ней и подсвечиваем
    if (sklad_currentSelectedCategoryId) {
        setTimeout(() => {
            highlightSelectedCategory(sklad_currentSelectedCategoryId);
        }, 100);
    }
}

/**
 * Добавляет обработчики событий для элементов дерева категорий.
 * Обрабатывает клики по ссылкам категорий (загрузка материалов) и по области содержимого.
 */
function attachTreeEventListeners() {
    console.log('[SKLAD] Добавление обработчиков событий для дерева');
    
    // 1. Обработчики для ссылок .category-link (клик по названию категории)
    document.querySelectorAll('.category-link').forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault(); // отменяем переход по ссылке (href="#")
            // Находим родительский элемент .tree-item и извлекаем data-category-id
            const treeItem = this.closest('.tree-item');
            const categoryId = treeItem.getAttribute('data-category-id');
            // Вызываем функцию выбора категории
            selectCategory(categoryId);
        });
    });
    
    // 2. Обработчики для .tree-item-content (клик по области, кроме кнопок)
    document.querySelectorAll('.tree-item-content').forEach(content => {
        content.addEventListener('click', function(event) {
            // Если клик был по кнопке действия или по ссылке – игнорируем (они уже обработаны)
            if (event.target.closest('.btn-tree-action') || 
                event.target.closest('.category-link')) {
                return;
            }
            const treeItem = this.closest('.tree-item');
            const categoryId = treeItem.getAttribute('data-category-id');
            selectCategory(categoryId);
        });
    });
}

/**
 * Программно выбирает категорию: обновляет глобальную переменную, выделяет элемент в дереве,
 * обновляет URL и загружает материалы через AJAX.
 * @param {string} categoryId - ID категории (может быть null или пустая строка для сброса)
 */
function selectCategory(categoryId) {
    console.log(`[SKLAD] Программный выбор категории ID: ${categoryId}`);
    
    // Сохраняем ID выбранной категории в глобальную переменную
    sklad_currentSelectedCategoryId = categoryId;
    
    // Снимаем выделение со всех категорий (убираем класс selected и фон)
    document.querySelectorAll('.tree-item.selected').forEach(item => {
        item.classList.remove('selected');
        item.style.backgroundColor = '';
    });
    
    // Если categoryId не задан (null, undefined или 0) – сбрасываем фильтр
    if (!categoryId && categoryId !== 0) {
        console.log('[SKLAD] Очистка выделения категории');
        // Обновляем URL, удаляя параметр category_id
        updateUrlWithoutCategoryFilter();
        // Загружаем все материалы (без фильтра) через AJAX-модуль
        if (typeof window.skladAJAX?.loadCategoryMaterials === 'function') {
            window.skladAJAX.loadCategoryMaterials(null);
        }
        return;
    }
    
    // Находим элемент категории в дереве и выделяем его
    const selectedItem = document.querySelector(`.tree-item[data-category-id="${categoryId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        selectedItem.style.backgroundColor = '#e8f5e9';
        console.log(`[SKLAD] Категория ID: ${categoryId} выделена`);
    } else {
        console.log(`[SKLAD] Категория ID: ${categoryId} не найдена в дереве`);
    }
    
    // Обновляем URL, добавляя параметр category_id (для сохранения состояния при перезагрузке)
    updateUrlWithCategoryFilter(categoryId);
    // Загружаем материалы выбранной категории через AJAX
    if (typeof window.skladAJAX?.loadCategoryMaterials === 'function') {
        window.skladAJAX.loadCategoryMaterials(categoryId);
    } else {
        console.error('[SKLAD] Функция loadCategoryMaterials не найдена');
    }
}

/**
 * Подсвечивает выбранную категорию в дереве и плавно прокручивает к ней.
 * @param {string} categoryId - ID категории для подсветки
 */
function highlightSelectedCategory(categoryId) {
    console.log(`[SKLAD] Подсветка категории ID: ${categoryId}`);
    
    // Снимаем выделение со всех категорий
    document.querySelectorAll('.tree-item.selected').forEach(item => {
        item.classList.remove('selected');
        item.style.backgroundColor = '';
    });
    
    if (!categoryId && categoryId !== 0) {
        return;
    }
    
    const categoryItem = document.querySelector(`.tree-item[data-category-id="${categoryId}"]`);
    if (categoryItem) {
        categoryItem.classList.add('selected');
        categoryItem.style.backgroundColor = '#e8f5e9';
        // Прокручиваем к элементу с плавной анимацией
        setTimeout(() => {
            categoryItem.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest' 
            });
        }, 100);
        console.log(`[SKLAD] Категория ID: ${categoryId} подсвечена и прокручена`);
    } else {
        console.log(`[SKLAD] Категория ID: ${categoryId} не найдена`);
    }
}

/**
 * Добавляет новую подкатегорию (вызывается по клику на кнопку "+").
 * Запрашивает название через prompt и отправляет AJAX-запрос на создание.
 * @param {string} parentCategoryId - ID родительской категории
 * @param {string} parentCategoryName - Название родительской категории (для сообщения)
 */
function addSubcategory(parentCategoryId, parentCategoryName) {
    console.log(`[SKLAD] Добавление подкатегории для: ${parentCategoryName}`);
    
    // Запрашиваем название у пользователя
    const subcategoryName = prompt(
        `Введите название подкатегории для "${parentCategoryName}":\n` +
        `(Минимум 2 символа, максимум 100 символов)`,
        ''
    );
    
    // Если пользователь отменил или ввел пустую строку – выходим
    if (!subcategoryName || subcategoryName.trim() === '') {
        console.log('[SKLAD] Добавление подкатегории отменено: пустое название');
        return;
    }
    
    const trimmedName = subcategoryName.trim();
    if (trimmedName.length < 2) {
        showNotification('error', 'Название подкатегории должно содержать минимум 2 символа');
        return;
    }
    
    // Получаем CSRF-токен для защиты от межсайтовой подделки запросов
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
        showNotification('error', 'Ошибка безопасности. Обновите страницу.');
        return;
    }
    
    // Формируем данные для отправки (multipart/form-data)
    const formData = new FormData();
    formData.append('name', trimmedName);
    formData.append('parent', parentCategoryId);
    formData.append('type', sklad_currentMaterialType); // тип категории совпадает с текущим типом материала
    formData.append('csrfmiddlewaretoken', csrfToken);
    
    showNotification('info', `Создание подкатегории "${trimmedName}"...`);
    
    // Отправляем POST-запрос на создание категории
    fetch('/sklad/category/create/', {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest' // пометка, что это AJAX-запрос
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        // При успешном создании перезагружаем страницу, чтобы обновить дерево категорий
        console.log('[SKLAD] Подкатегория создана успешно, обновление страницы...');
        window.location.reload();
    })
    .catch(error => {
        console.error('[SKLAD] Ошибка при создании подкатегории:', error);
        showNotification('error', `Ошибка при создании подкатегории: ${error.message}`);
    });
}

/**
 * Подтверждение удаления категории (вызывается из onclick ссылки удаления).
 * @param {string} categoryId - ID категории
 * @param {string} categoryName - Название категории
 * @returns {boolean} true – удалить, false – отмена
 */
function confirmDeleteCategory(categoryId, categoryName) {
    const confirmed = confirm(
        `Вы уверены, что хотите удалить категорию "${categoryName}"?\n\n` +
        `Внимание: Если в категории есть подкатегории или материалы, удаление будет невозможно.\n` +
        `Удаление необратимо.`
    );
    if (confirmed) {
        console.log(`[SKLAD] Подтверждено удаление категории ID: ${categoryId}`);
        return true;
    } else {
        console.log(`[SKLAD] Удаление категории ID: ${categoryId} отменено`);
        return false;
    }
}

// ================== ПЕРЕКЛЮЧЕНИЕ ТИПА МАТЕРИАЛА ==================

/**
 * Устанавливает текущий тип материала (paper/film) и перезагружает все данные.
 * @param {string} type - 'paper' или 'film'
 */
function setMaterialType(type) {
    console.log('[SKLAD] Переключение типа на:', type);
    sklad_currentMaterialType = type;
    // Синхронизируем с глобальным объектом window.sklad (для доступа из sklad_ajax.js)
    if (window.sklad) window.sklad.currentMaterialType = type;
    
    // Обновляем активный класс у кнопок переключателя
    document.querySelectorAll('.type-switcher-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.type-switcher-btn[data-type="${type}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Сбрасываем выбранную категорию (так как типы разные)
    sklad_currentSelectedCategoryId = null;
    
    // Обновляем URL: меняем параметр type, убираем category_id
    const url = new URL(window.location.href);
    url.searchParams.set('type', type);
    url.searchParams.delete('category_id');
    window.history.pushState({}, '', url);
    
    // Перезагружаем дерево категорий и материалы
    loadCategoryTree();
    if (typeof window.skladAJAX?.loadCategoryMaterials === 'function') {
        window.skladAJAX.loadCategoryMaterials(null);
    }
}

// ================== ФУНКЦИИ ДЛЯ РАБОТЫ С ФОРМАМИ ==================

/**
 * Переключает отображение формы добавления материала (показать/скрыть).
 */
function toggleMaterialForm() {
    console.log('[SKLAD] Переключение формы добавления материала');
    
    const formSection = document.getElementById('material-form-section');
    const toggleButton = document.getElementById('add-material-btn');
    
    if (!formSection || !toggleButton) {
        console.error('[SKLAD] Элементы формы материала не найдены');
        return;
    }
    
    if (formSection.style.display === 'none') {
        // Показываем форму
        formSection.style.display = 'block';
        toggleButton.textContent = 'Скрыть форму';
        toggleButton.classList.add('active');
        sklad_isMaterialFormOpen = true;
        
        // Обновляем список категорий в выпадающем списке (AJAX)
        if (typeof window.skladAJAX?.loadCategoriesForForm === 'function') {
            window.skladAJAX.loadCategoriesForForm();
        }
        // Приводим видимость полей в соответствие с выбранным типом материала
        updateFormFieldsByType();
        
        // Прокручиваем страницу к форме
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Устанавливаем фокус на поле "Название"
        setTimeout(() => {
            const nameInput = document.getElementById('material-name');
            if (nameInput) nameInput.focus();
        }, 300);
        console.log('[SKLAD] Форма добавления материала открыта');
    } else {
        // Скрываем форму
        formSection.style.display = 'none';
        toggleButton.textContent = '+ Добавить';
        toggleButton.classList.remove('active');
        sklad_isMaterialFormOpen = false;
        console.log('[SKLAD] Форма добавления материала закрыта');
    }
}

/**
 * Показывает форму добавления категории.
 */
function showCategoryForm() {
    console.log('[SKLAD] Показ формы добавления категории');
    
    const formSection = document.getElementById('category-form-section');
    if (!formSection) {
        console.error('[SKLAD] Форма категории не найдена');
        return;
    }
    
    // Устанавливаем тип категории в соответствии с текущим типом материала
    const typeSelect = document.getElementById('category-type');
    if (typeSelect) typeSelect.value = sklad_currentMaterialType;
    
    formSection.style.display = 'block';
    formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
        const nameInput = document.getElementById('category-name');
        if (nameInput) nameInput.focus();
    }, 300);
    console.log('[SKLAD] Форма добавления категории открыта');
}

/**
 * Скрывает форму добавления категории.
 */
function hideCategoryForm() {
    console.log('[SKLAD] Скрытие формы добавления категории');
    const formSection = document.getElementById('category-form-section');
    if (formSection) formSection.style.display = 'none';
}

/**
 * Очищает форму добавления материала (сбрасывает все поля).
 */
function clearMaterialForm() {
    console.log('[SKLAD] Очистка формы материала');
    const form = document.getElementById('material-form');
    if (form) form.reset();
    const unitInput = document.getElementById('material-unit');
    if (unitInput) unitInput.value = 'лист';
    const quantityInput = document.getElementById('material-quantity');
    if (quantityInput) quantityInput.value = '0';
    const minQuantityInput = document.getElementById('material-min-quantity');
    if (minQuantityInput) minQuantityInput.value = '10';
    updateFormFieldsByType();
    const nameInput = document.getElementById('material-name');
    if (nameInput) nameInput.focus();
}

/**
 * Обновляет отображение полей формы в зависимости от выбранного типа материала.
 * Для бумаги показываем поля цены, единицы измерения, плотности, толщины бумаги.
 * Для плёнки – себестоимость, наценку, толщину.
 */
function updateFormFieldsByType() {
    const typeSelect = document.getElementById('material-type');
    const paperFields = document.getElementById('paper-fields');
    const filmFields = document.getElementById('film-fields');
    if (!typeSelect) return;
    
    if (typeSelect.value === 'paper') {
        paperFields.style.display = 'block';
        filmFields.style.display = 'none';
        // Делаем цену обязательной
        document.getElementById('material-price')?.setAttribute('required', 'required');
        // Убираем обязательность полей плёнки
        document.getElementById('material-cost')?.removeAttribute('required');
        document.getElementById('material-markup')?.removeAttribute('required');
        document.getElementById('material-thickness')?.removeAttribute('required');
    } else {
        paperFields.style.display = 'none';
        filmFields.style.display = 'block';
        // Убираем обязательность цены
        document.getElementById('material-price')?.removeAttribute('required');
        // Делаем обязательными поля плёнки
        document.getElementById('material-cost')?.setAttribute('required', 'required');
        document.getElementById('material-markup')?.setAttribute('required', 'required');
        document.getElementById('material-thickness')?.setAttribute('required', 'required');
    }
}

// ================== AJAX-ОТПРАВКА ФОРМЫ ДОБАВЛЕНИЯ МАТЕРИАЛА ==================

/**
 * Отправляет форму добавления материала через AJAX (без перезагрузки страницы).
 * @param {Event} event - событие отправки формы
 */
function submitMaterialForm(event) {
    event.preventDefault(); // отменяем стандартную отправку формы
    
    const form = document.getElementById('material-form');
    if (!form) return;
    
    // Проверяем, что категория выбрана
    const categorySelect = document.getElementById('material-category');
    if (!categorySelect || !categorySelect.value) {
        showNotification('warning', 'Выберите категорию для материала');
        return;
    }
    
    const formData = new FormData(form);
    const csrfToken = getCsrfToken();
    
    // Логируем отправляемые данные для отладки
    console.log('[SKLAD] Отправляемые данные:', [...formData.entries()]);
    
    const submitBtn = form.querySelector('.btn-submit');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Сохранение...';
    
    fetch('/sklad/material/create/', {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrfToken
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showNotification('success', data.message);
            // Очищаем форму и закрываем её
            clearMaterialForm();
            const formSection = document.getElementById('material-form-section');
            const toggleButton = document.getElementById('add-material-btn');
            if (formSection && toggleButton) {
                formSection.style.display = 'none';
                toggleButton.textContent = '+ Добавить';
                toggleButton.classList.remove('active');
                sklad_isMaterialFormOpen = false;
            }
            // Обновляем список материалов и дерево категорий
            if (typeof window.skladAJAX?.loadCategoryMaterials === 'function') {
                window.skladAJAX.loadCategoryMaterials(sklad_currentSelectedCategoryId);
            }
            loadCategoryTree(); // обновляем счётчики материалов в дереве
        } else {
            throw new Error(data.error || 'Ошибка при создании материала');
        }
    })
    .catch(error => {
        console.error('[SKLAD] Ошибка при создании материала:', error);
        showNotification('error', error.message || 'Не удалось создать материал');
    })
    .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    });
}

/**
 * Инициализирует обработчик отправки формы материала.
 * Удаляет предыдущий обработчик, чтобы не было дублирования, и добавляет новый.
 */
function initMaterialFormSubmit() {
    const form = document.getElementById('material-form');
    if (form) {
        form.removeEventListener('submit', submitMaterialForm);
        form.addEventListener('submit', submitMaterialForm);
    }
}

// ================== INLINE-РЕДАКТИРОВАНИЕ (ГЛАВНАЯ ЧАСТЬ) ==================

/**
 * Начинает inline-редактирование элемента при двойном клике.
 * @param {HTMLElement} element - DOM элемент, который нужно редактировать (должен иметь data-editable="true")
 */
function startInlineEdit(element) {
    // Защита от повторного вызова на том же элементе (если уже редактируется)
    if (sklad_currentEditingElement === element) return;
    // Если есть другой редактируемый элемент – отменяем его редактирование
    if (sklad_currentEditingElement) cancelInlineEdit(sklad_currentEditingElement);
    
    // Запоминаем текущий редактируемый элемент
    sklad_currentEditingElement = element;
    
    // Определяем ID материала.
    // Сначала пытаемся взять из атрибута data-material-id самого элемента,
    // если нет – ищем ближайшую строку таблицы .table-row и берём её data-material-id.
    let materialId = element.getAttribute('data-material-id');
    if (!materialId) {
        const row = element.closest('.table-row');
        if (row) materialId = row.getAttribute('data-material-id');
    }
    if (!materialId) {
        console.error('[SKLAD] Не удалось определить ID материала для редактирования');
        showNotification('error', 'Ошибка: не найден ID материала');
        cancelInlineEdit(element);
        return;
    }
    
    const fieldName = element.getAttribute('data-field');
    // Получаем исходное значение из data-original-value (если есть)
    let originalValue = element.getAttribute('data-original-value');
    // Нормализуем десятичный разделитель (запятую заменяем на точку)
    if (originalValue) originalValue = originalValue.replace(',', '.');
    
    // Для полей, которые могут быть NULL (плёнка и толщина бумаги), если значение равно "None" или "null", делаем пустую строку
    if (fieldName === 'cost' || fieldName === 'markup_percent' || fieldName === 'thickness' || fieldName === 'paper_thickness' || fieldName === 'density') {
        if (originalValue === 'None' || originalValue === 'null' || originalValue === 'undefined' || originalValue === '') {
            originalValue = '';
            element.setAttribute('data-original-value', '');
        }
    }
    
    // Если data-original-value не задан, пытаемся извлечь значение из текста элемента (для старых данных)
    if (!originalValue || originalValue === 'null' || originalValue === 'undefined') {
        if (fieldName === 'price' && element.textContent) {
            const match = element.textContent.match(/(\d+[.,]?\d*)/);
            if (match) originalValue = match[1].replace(',', '.');
        } else if (fieldName === 'quantity' && element.textContent) {
            const match = element.textContent.match(/(\d+)/);
            if (match) originalValue = match[1];
        } else if (fieldName === 'name') {
            originalValue = element.textContent.trim();
        } else if (fieldName === 'density' && element.textContent) {
            const match = element.textContent.match(/(\d+)/);
            originalValue = match ? match[1] : '';
        } else if (fieldName === 'paper_thickness' && element.textContent) {
            const match = element.textContent.match(/(\d+[.,]?\d*)/);
            originalValue = match ? match[1].replace(',', '.') : '';
        } else if (fieldName === 'cost' && element.textContent) {
            const match = element.textContent.match(/(\d+[.,]?\d*)/);
            originalValue = match ? match[1].replace(',', '.') : '';
        } else if (fieldName === 'markup_percent' && element.textContent) {
            const match = element.textContent.match(/(\d+[.,]?\d*)/);
            originalValue = match ? match[1].replace(',', '.') : '';
        } else if (fieldName === 'thickness' && element.textContent) {
            const match = element.textContent.match(/(\d+)/);
            originalValue = match ? match[1] : '';
        }
        if (originalValue) element.setAttribute('data-original-value', originalValue);
    }
    
    // Сохраняем оригинальный HTML элемента (чтобы потом восстановить при отмене)
    const originalHtml = element.innerHTML;
    element.setAttribute('data-original-html', originalHtml);
    
    // Определяем тип и атрибуты input в зависимости от поля
    let inputType = 'text';
    let step = '';
    let min = '';
    if (fieldName === 'price') {
        inputType = 'number';
        step = '0.01';
        min = '0.01';
    } else if (fieldName === 'quantity') {
        inputType = 'number';
        step = '1';
        min = '0';
    } else if (fieldName === 'cost') {
        inputType = 'number';
        step = '0.01';
        min = '0';
    } else if (fieldName === 'markup_percent') {
        inputType = 'number';
        step = '0.01';
        min = '0';
    } else if (fieldName === 'thickness') {
        inputType = 'number';
        step = '1';
        min = '1';
    } else if (fieldName === 'density') {
        inputType = 'number';
        step = '1';
        min = '1';
    } else if (fieldName === 'paper_thickness') {
        inputType = 'number';
        step = '0.001';
        min = '0.001';
    }
    
    // Создаём элемент input
    const input = document.createElement('input');
    input.type = inputType;
    if (step) input.step = step;
    if (min) input.min = min;
    input.className = 'inline-edit-input';
    // Устанавливаем значение (предзаполнение текущим значением)
    input.value = originalValue || '';
    
    // Очищаем элемент и помещаем в него input
    element.innerHTML = '';
    element.appendChild(input);
    
    // Создаём контейнер для кнопок сохранения и отмены
    const btnDiv = document.createElement('div');
    btnDiv.className = 'inline-edit-buttons';
    
    // Кнопка сохранения (галочка)
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn-inline-save';
    saveBtn.innerHTML = '<i class="fas fa-check"></i>';
    saveBtn.title = 'Сохранить';
    saveBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        saveInlineEdit(element, input.value);
    };
    
    // Кнопка отмены (крестик)
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-inline-cancel';
    cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
    cancelBtn.title = 'Отмена';
    cancelBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        cancelInlineEdit(element);
    };
    
    btnDiv.appendChild(saveBtn);
    btnDiv.appendChild(cancelBtn);
    element.appendChild(btnDiv);
    
    // Устанавливаем фокус и выделяем текст
    input.focus();
    input.select();
    
    // Обработчики клавиш: Enter – сохранить, Escape – отменить
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveInlineEdit(element, input.value);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelInlineEdit(element);
        }
    });
    
    // ВАЖНО: обработчик blur УБРАН, чтобы не было автоматического сохранения при потере фокуса.
    // Это предотвращает зацикливание и конфликты.
    
    console.log(`[SKLAD] Редактирование поля "${fieldName}" материала ${materialId} начато`);
}

/**
 * Сохраняет изменения после inline-редактирования (отправляет AJAX-запрос на сервер).
 * @param {HTMLElement} element - DOM элемент, который редактировался
 * @param {string} newValue - новое значение, введённое пользователем
 */
function saveInlineEdit(element, newValue) {
    // Определяем ID материала (аналогично startInlineEdit)
    let materialId = element.getAttribute('data-material-id');
    if (!materialId) {
        const row = element.closest('.table-row');
        if (row) materialId = row.getAttribute('data-material-id');
    }
    if (!materialId) {
        console.error('[SKLAD] Не удалось определить ID материала для сохранения');
        showNotification('error', 'Ошибка: не найден ID материала');
        cancelInlineEdit(element);
        return;
    }
    
    const fieldName = element.getAttribute('data-field');
    let originalValue = element.getAttribute('data-original-value');
    if (originalValue) originalValue = originalValue.replace(',', '.');
    const normalizedNewValue = newValue.toString().replace(',', '.');
    
    // Если значение не изменилось – просто отменяем редактирование
    if (normalizedNewValue === originalValue) {
        cancelInlineEdit(element);
        return;
    }
    
    // Валидация введённого значения
    if (!validateInlineInput(fieldName, normalizedNewValue)) {
        const input = element.querySelector('input');
        if (input) input.focus();
        return;
    }
    
    // Показываем индикатор сохранения (например, изменение opacity)
    element.classList.add('saving');
    
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
        showNotification('error', 'Ошибка безопасности. Обновите страницу.');
        cancelInlineEdit(element);
        return;
    }
    
    // Отправляем AJAX-запрос на сервер
    fetch(`/sklad/material/update/${materialId}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ field: fieldName, value: normalizedNewValue })
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Обновляем data-атрибут оригинального значения
            element.setAttribute('data-original-value', normalizedNewValue);
            // Обновляем отображение элемента
            updateElementDisplay(element, fieldName, normalizedNewValue, data.material);
            
            // Если обновляли себестоимость или наценку (для плёнки) – нужно пересчитать и обновить цену
            if (fieldName === 'cost' || fieldName === 'markup_percent') {
                const row = element.closest('.table-row');
                if (row) {
                    const priceSpan = row.querySelector('.price-badge');
                    if (priceSpan && data.material && data.material.price_display) {
                        priceSpan.innerHTML = data.material.price_display;
                        if (priceSpan.getAttribute('data-field') === 'price') {
                            priceSpan.setAttribute('data-original-value', data.material.price);
                        }
                    }
                }
            }
            
            showNotification('success', data.message || 'Изменения сохранены');
            sklad_currentEditingElement = null; // сбрасываем флаг редактирования
        } else {
            throw new Error(data.error || 'Неизвестная ошибка');
        }
    })
    .catch(error => {
        console.error('[SKLAD] Ошибка сохранения:', error);
        showNotification('error', `Ошибка: ${error.message}`);
        cancelInlineEdit(element);
    })
    .finally(() => {
        element.classList.remove('saving');
    });
}

/**
 * Отменяет inline-редактирование и возвращает исходное состояние элемента.
 * @param {HTMLElement} element - DOM элемент, который редактировался
 */
function cancelInlineEdit(element) {
    console.log('[SKLAD] Отмена inline-редактирования');
    const originalHtml = element.getAttribute('data-original-html');
    if (originalHtml) {
        element.innerHTML = originalHtml;
        // Восстанавливаем атрибут ondblclick (на случай, если он был удалён)
        element.setAttribute('ondblclick', 'startInlineEdit(this)');
    }
    if (sklad_currentEditingElement === element) sklad_currentEditingElement = null;
}

/**
 * Валидирует введённое значение в зависимости от поля.
 * @param {string} fieldName - название поля (name, price, quantity, cost, markup_percent, thickness, density, paper_thickness)
 * @param {string} value - нормализованное значение (с точкой в качестве разделителя)
 * @returns {boolean} true – если значение валидно, иначе false
 */
function validateInlineInput(fieldName, value) {
    // Для полей, которые могут быть NULL, пустая строка разрешена
    if ((fieldName === 'cost' || fieldName === 'markup_percent' || fieldName === 'thickness' || fieldName === 'paper_thickness' || fieldName === 'density') && value === '') {
        return true;
    }
    // Для всех остальных полей пустое значение не допускается (кроме 0)
    if (!value && value !== '0') {
        showNotification('warning', 'Значение не может быть пустым');
        return false;
    }
    
    if (fieldName === 'name') {
        if (value.length < 2) {
            showNotification('warning', 'Название должно содержать минимум 2 символа');
            return false;
        }
        if (value.length > 100) {
            showNotification('warning', 'Название не может превышать 100 символов');
            return false;
        }
    } else if (fieldName === 'price') {
        const price = parseFloat(value);
        if (isNaN(price) || price <= 0) {
            showNotification('warning', 'Цена должна быть положительным числом');
            return false;
        }
        if (price > 999999.99) {
            showNotification('warning', 'Цена не может превышать 999 999.99');
            return false;
        }
    } else if (fieldName === 'quantity') {
        const qty = parseFloat(value);
        if (isNaN(qty) || qty < 0) {
            showNotification('warning', 'Количество должно быть неотрицательным числом');
            return false;
        }
        if (!Number.isInteger(qty)) {
            showNotification('warning', 'Количество должно быть целым числом');
            return false;
        }
    } else if (fieldName === 'cost') {
        const cost = parseFloat(value);
        if (isNaN(cost) || cost < 0) {
            showNotification('warning', 'Себестоимость должна быть неотрицательным числом');
            return false;
        }
        if (cost > 999999.99) {
            showNotification('warning', 'Себестоимость не может превышать 999 999.99');
            return false;
        }
    } else if (fieldName === 'markup_percent') {
        const markup = parseFloat(value);
        if (isNaN(markup) || markup < 0) {
            showNotification('warning', 'Наценка должна быть неотрицательным числом');
            return false;
        }
        if (markup > 1000) {
            showNotification('warning', 'Наценка не может превышать 1000%');
            return false;
        }
    } else if (fieldName === 'thickness') {
        const thickness = parseInt(value, 10);
        if (isNaN(thickness) || thickness <= 0) {
            showNotification('warning', 'Толщина должна быть положительным целым числом');
            return false;
        }
        if (thickness > 10000) {
            showNotification('warning', 'Толщина не может превышать 10000 мкм');
            return false;
        }
    } else if (fieldName === 'density') {
        const density = parseInt(value, 10);
        if (isNaN(density) || density <= 0) {
            showNotification('warning', 'Плотность должна быть положительным целым числом');
            return false;
        }
        if (density > 2000) {
            showNotification('warning', 'Плотность не может превышать 2000 г/м²');
            return false;
        }
    } else if (fieldName === 'paper_thickness') {
        const thickness = parseFloat(value);
        if (isNaN(thickness) || thickness <= 0) {
            showNotification('warning', 'Толщина бумаги должна быть положительным числом');
            return false;
        }
        if (thickness > 100) {
            showNotification('warning', 'Толщина бумаги не может превышать 100 мм');
            return false;
        }
    }
    return true;
}

/**
 * Обновляет отображение элемента после успешного сохранения.
 * @param {HTMLElement} element - DOM элемент
 * @param {string} fieldName - название поля
 * @param {string} value - новое значение
 * @param {Object} materialData - данные материала от сервера (содержит price_display, unit и т.д.)
 */
function updateElementDisplay(element, fieldName, value, materialData) {
    if (fieldName === 'name') {
        element.innerHTML = escapeHtml(value);
    } else if (fieldName === 'price') {
        if (materialData && materialData.price_display) {
            element.innerHTML = escapeHtml(materialData.price_display);
        } else {
            const price = parseFloat(value);
            const unit = materialData?.unit || 'лист';
            element.innerHTML = `${price.toFixed(2).replace('.', ',')} руб./${unit}`;
        }
    } else if (fieldName === 'quantity') {
        const qty = parseInt(value, 10);
        const unit = materialData?.unit || 'лист';
        element.innerHTML = `${qty} ${unit}`;
        // Обновляем CSS-классы в зависимости от остатка
        element.className = 'quantity-badge';
        if (qty <= 0) element.classList.add('quantity-zero');
        else if (materialData?.min_quantity && qty <= materialData.min_quantity) {
            element.classList.add('quantity-low');
        }
    } else if (fieldName === 'cost') {
        if (!value || value === '' || isNaN(parseFloat(value))) {
            element.innerHTML = '<i class="fas fa-ruble-sign"></i> — руб.';
            element.setAttribute('data-original-value', '');
        } else {
            const cost = parseFloat(value).toFixed(2).replace('.', ',');
            element.innerHTML = `<i class="fas fa-ruble-sign"></i> ${cost} руб.`;
            element.setAttribute('data-original-value', value);
        }
    } else if (fieldName === 'markup_percent') {
        if (!value || value === '' || isNaN(parseFloat(value))) {
            element.innerHTML = '<i class="fas fa-percent"></i> —%';
            element.setAttribute('data-original-value', '');
        } else {
            const markup = parseFloat(value).toFixed(2).replace('.', ',');
            element.innerHTML = `<i class="fas fa-percent"></i> ${markup}%`;
            element.setAttribute('data-original-value', value);
        }
    } else if (fieldName === 'thickness') {
        if (!value || value === '' || isNaN(parseInt(value,10))) {
            element.innerHTML = '<i class="fas fa-ruler"></i> — мкм';
            element.setAttribute('data-original-value', '');
        } else {
            element.innerHTML = `<i class="fas fa-ruler"></i> ${value} мкм`;
            element.setAttribute('data-original-value', value);
        }
    } else if (fieldName === 'density') {
        if (!value || value === '' || isNaN(parseInt(value,10))) {
            element.innerHTML = '<i class="fas fa-weight-hanging"></i> — г/м²';
            element.setAttribute('data-original-value', '');
        } else {
            element.innerHTML = `<i class="fas fa-weight-hanging"></i> ${parseInt(value,10)} г/м²`;
            element.setAttribute('data-original-value', value);
        }
    } else if (fieldName === 'paper_thickness') {
        if (!value || value === '' || isNaN(parseFloat(value))) {
            element.innerHTML = '<i class="fas fa-ruler"></i> — мм';
            element.setAttribute('data-original-value', '');
        } else {
            const thickness = parseFloat(value).toFixed(3).replace('.', ',');
            element.innerHTML = `<i class="fas fa-ruler"></i> ${thickness} мм`;
            element.setAttribute('data-original-value', value);
        }
    }
    // Обновляем сохранённый оригинальный HTML и атрибут ondblclick
    element.setAttribute('data-original-html', element.innerHTML);
    element.setAttribute('ondblclick', 'startInlineEdit(this)');
}

// ================== УДАЛЕНИЕ МАТЕРИАЛА ==================

/**
 * Удаляет материал через AJAX.
 * @param {HTMLElement} btn - кнопка удаления (будет заменена на спиннер)
 * @param {string} materialId - ID материала
 */
function deleteMaterial(btn, materialId) {
    console.log(`[SKLAD] Удаление материала ID: ${materialId}`);
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
        showNotification('error', 'Ошибка безопасности. Обновите страницу.');
        btn.remove(); // убираем кнопку
        return;
    }
    
    fetch(`/sklad/material/delete/${materialId}/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
    .then(response => {
        if (!response.ok) throw new Error('Ошибка сети');
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Удаляем строку таблицы с плавным исчезновением
            const row = btn.closest('.table-row');
            if (row) {
                row.style.opacity = '0';
                setTimeout(() => row.remove(), 300);
            }
            showNotification('success', data.message || 'Материал удалён');
            // Обновляем дерево категорий (счётчики материалов могли измениться)
            loadCategoryTree();
        } else {
            throw new Error(data.error || 'Неизвестная ошибка');
        }
    })
    .catch(error => {
        console.error('[SKLAD] Ошибка удаления:', error);
        showNotification('error', `Не удалось удалить: ${error.message}`);
        btn.disabled = false;
        btn.innerHTML = 'Удалить';
    });
}

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================

/**
 * Получает CSRF-токен из cookie или из DOM.
 * @returns {string|null} CSRF-токен или null, если не найден
 */
function getCsrfToken() {
    // Пытаемся получить из cookie
    const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
    if (cookie) return cookie.split('=')[1];
    // Пытаемся получить из скрытого поля формы
    const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (input) return input.value;
    // Пытаемся получить из meta-тега
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.content;
    console.warn('[SKLAD] CSRF-токен не найден');
    return null;
}

/**
 * Экранирует HTML-символы в строке (защита от XSS).
 * @param {string} text - исходный текст
 * @returns {string} экранированный текст
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Показывает всплывающее уведомление (toast).
 * @param {string} type - тип уведомления: 'success', 'error', 'warning', 'info'
 * @param {string} message - текст сообщения
 */
function showNotification(type, message) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    // Автоматически удаляем через 5 секунд
    setTimeout(() => notification.remove(), 5000);
    console.log(`[SKLAD] Уведомление (${type}): ${message}`);
}

/**
 * Обновляет URL, добавляя параметр category_id (фильтр по категории).
 * @param {string} categoryId - ID категории
 */
function updateUrlWithCategoryFilter(categoryId) {
    const url = new URL(window.location.href);
    url.searchParams.set('category_id', categoryId);
    window.history.pushState({}, '', url);
    console.log(`[SKLAD] URL обновлён с фильтром category_id=${categoryId}`);
}

/**
 * Обновляет URL, удаляя параметр category_id (сброс фильтра).
 */
function updateUrlWithoutCategoryFilter() {
    const url = new URL(window.location.href);
    url.searchParams.delete('category_id');
    window.history.pushState({}, '', url);
    console.log('[SKLAD] URL обновлён без фильтра категории');
}

/**
 * Преобразует сообщения Django (из скрытого контейнера .django-messages) в уведомления.
 */
function convertDjangoMessagesToNotifications() {
    const djangoMessages = document.querySelectorAll('.django-message');
    djangoMessages.forEach(msg => {
        const type = msg.dataset.type || 'info';
        const message = msg.textContent.trim();
        showNotification(type, message);
        msg.remove();
    });
    const container = document.querySelector('.django-messages');
    if (container && container.children.length === 0) container.remove();
    console.log(`[SKLAD] Преобразовано ${djangoMessages.length} сообщений Django`);
}

// ================== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ ==================

/**
 * Инициализирует всё приложение при загрузке страницы.
 * Определяет текущий тип из URL, загружает дерево, навешивает обработчики.
 */
function initializeSkladApp() {
    console.log('[SKLAD] Инициализация приложения...');
    
    // Определяем текущий тип материала из URL (параметр type)
    const urlParams = new URLSearchParams(window.location.search);
    const urlType = urlParams.get('type');
    if (urlType === 'film') sklad_currentMaterialType = 'film';
    else sklad_currentMaterialType = 'paper';
    
    // Синхронизируем глобальный объект
    if (window.sklad) window.sklad.currentMaterialType = sklad_currentMaterialType;
    
    // Настройка переключателя типа (кнопки "Бумага" / "Плёнка")
    const switcher = document.getElementById('type-switcher');
    if (switcher) {
        const activeBtn = switcher.querySelector(`.type-switcher-btn[data-type="${sklad_currentMaterialType}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        switcher.querySelectorAll('.type-switcher-btn').forEach(btn => {
            btn.addEventListener('click', () => setMaterialType(btn.getAttribute('data-type')));
        });
    }
    
    // Преобразуем сообщения Django в уведомления
    convertDjangoMessagesToNotifications();
    
    // Загружаем дерево категорий
    loadCategoryTree();
    
    // Кнопка "Добавить категорию"
    const addCategoryBtn = document.getElementById('add-category-btn');
    if (addCategoryBtn) addCategoryBtn.addEventListener('click', showCategoryForm);
    
    // Кнопка "Добавить материал"
    const addMaterialBtn = document.getElementById('add-material-btn');
    if (addMaterialBtn) addMaterialBtn.addEventListener('click', toggleMaterialForm);
    
    // Обработчик изменения типа в форме добавления материала (для динамического переключения полей)
    const materialTypeSelect = document.getElementById('material-type');
    if (materialTypeSelect) materialTypeSelect.addEventListener('change', updateFormFieldsByType);
    
    // Глобальный обработчик двойного клика для inline-редактирования
    document.addEventListener('dblclick', (e) => {
        const target = e.target.closest('[data-editable="true"]');
        if (target && !sklad_currentEditingElement) startInlineEdit(target);
    });
    
    // Обработчик удаления материалов (делегирование, так как кнопки могут быть динамическими)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-delete');
        if (btn && !btn.disabled) {
            e.preventDefault();
            const materialId = btn.getAttribute('data-material-id');
            const materialName = btn.getAttribute('data-material-name');
            if (confirm(`Удалить материал "${materialName}"?`)) {
                deleteMaterial(btn, materialId);
            }
        }
    });
    
    // Инициализируем AJAX-отправку формы материала
    initMaterialFormSubmit();
    
    // Если в URL есть параметр category_id – загружаем материалы этой категории
    const initialCategoryId = urlParams.get('category_id');
    if (initialCategoryId) {
        selectCategory(initialCategoryId);
    } else if (typeof window.skladAJAX?.loadCategoryMaterials === 'function') {
        window.skladAJAX.loadCategoryMaterials(null);
    }
    
    // Показываем подсказку при первом посещении
    if (!localStorage.getItem('sklad_hint_shown')) {
        setTimeout(() => {
            showNotification('info', 
                '💡 Подсказка: кликните по категории слева, чтобы увидеть материалы. ' +
                'Двойной клик по любому полю (название, цена, количество, плотность, толщина) для быстрого редактирования.'
            );
            localStorage.setItem('sklad_hint_shown', 'true');
        }, 3000);
    }
    
    console.log('[SKLAD] Инициализация завершена');
}

// ================== ГЛОБАЛЬНЫЙ ЭКСПОРТ ФУНКЦИЙ ==================

// Делаем функции доступными глобально для вызова из HTML и из модуля sklad_ajax.js
window.sklad = {
    loadCategoryTree,
    addSubcategory,
    toggleMaterialForm,
    showCategoryForm,
    hideCategoryForm,
    clearMaterialForm,
    startInlineEdit,
    saveInlineEdit,
    cancelInlineEdit,
    deleteMaterial,
    setMaterialType,
    selectCategory,
    highlightSelectedCategory,
    showNotification,
    getCsrfToken,
    updateFormFieldsByType,
    submitMaterialForm,
    initMaterialFormSubmit,
    currentMaterialType: sklad_currentMaterialType
};

// ================== ЗАПУСК ИНИЦИАЛИЗАЦИИ ==================

// Запускаем инициализацию после полной загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSkladApp);
} else {
    initializeSkladApp();
}