/*
sklad.js
JavaScript для приложения sklad (управление складом материалов)
Содержит логику для:
    - Загрузки и отображения древовидной структуры категорий
    - Управления формами добавления категорий и материалов
    - Взаимодействия с элементами интерфейса
    - Отображения уведомлений и сообщений
*/

// ================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ ==================

// Текущая выбранная категория (для выделения в дереве)
let currentSelectedCategoryId = null;

// Текущий редактируемый элемент (для inline-редактирования)
let currentEditingElement = null;

// Состояние форм (открыты/закрыты)
let isMaterialFormOpen = false;
let isCategoryFormOpen = false;

// ================== ФУНКЦИИ ДЛЯ РАБОТЫ С ДЕРЕВОМ КАТЕГОРИЙ ==================

/**
 * Загружает дерево категорий с сервера и отображает его
 * @returns {Promise} Promise, который разрешается при успешной загрузке дерева
 */
function loadCategoryTree() {
    console.log('[SKLAD] Начало загрузки дерева категорий...');
    
    // Получаем контейнер для дерева
    const treeContainer = document.getElementById('category-tree-container');
    if (!treeContainer) {
        console.error('[SKLAD] Контейнер для дерева не найден');
        return Promise.reject('Контейнер для дерева не найден');
    }
    
    // Показываем индикатор загрузки
    treeContainer.innerHTML = `
        <div class="tree-loading">
            <div class="spinner"></div>
            <p>Загрузка дерева категорий...</p>
        </div>
    `;
    
    // Возвращаем Promise для асинхронной работы
    return new Promise((resolve, reject) => {
        // Отправляем запрос на сервер для получения дерева категорий
        fetch('/sklad/category/tree/')
            .then(response => {
                // Проверяем статус ответа
                if (!response.ok) {
                    throw new Error(`Ошибка HTTP: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('[SKLAD] Дерево категорий загружено успешно:', data);
                
                // Проверяем наличие данных
                if (!data || !data.tree) {
                    throw new Error('Некорректные данные дерева категорий');
                }
                
                // Отображаем дерево категорий
                renderCategoryTree(data.tree);
                
                // Выделяем текущую выбранную категорию (если есть)
                if (currentSelectedCategoryId) {
                    highlightSelectedCategory(currentSelectedCategoryId);
                }
                
                // Разрешаем Promise
                resolve(data);
            })
            .catch(error => {
                console.error('[SKLAD] Ошибка загрузки дерева категорий:', error);
                
                // Показываем сообщение об ошибке
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
                
                // Отклоняем Promise
                reject(error);
            });
    });
}

/**
 * Отображает дерево категорий в контейнере с ПЕРЕРАБОТАННОЙ визуализацией
 * Теперь используется подход с соединительными линиями и компактным дизайном
 * @param {Array} treeData - Массив данных категорий
 */
function renderCategoryTree(treeData) {
    console.log('[SKLAD] Отрисовка дерева с новым дизайном...');
    
    const treeContainer = document.getElementById('category-tree-container');
    if (!treeContainer) {
        console.error('[SKLAD] Контейнер для дерева не найден');
        return;
    }
    
    // Проверяем, есть ли данные
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
    
    // Создаем HTML для дерева
    let html = '<div class="tree">';
    
    /**
     * Рекурсивная функция для создания HTML узла категории
     * с новым дизайном и соединительными линиями
     * @param {Object} category - Объект категории
     * @param {number} level - Уровень вложенности (0 для корневых)
     * @param {boolean} isLast - Последний ли элемент в группе
     * @returns {string} HTML строка для узла категории
     */
    function createCategoryNode(category, level = 0, isLast = false) {
        // Проверяем наличие необходимых данных
        if (!category || !category.id || !category.name) {
            console.warn('[SKLAD] Некорректные данные категории:', category);
            return '';
        }
        
        // Определяем, есть ли у категории дочерние элементы
        const hasChildren = category.children && category.children.length > 0;
        
        // Определяем классы для элемента категории
        let categoryClass = 'tree-item';
        
        // Добавляем класс для уровня вложенности
        categoryClass += ` level-${Math.min(level, 3)}`;
        
        // Если это последний элемент, добавляем специальный класс
        if (isLast) {
            categoryClass += ' last-child';
        }
        
        // Если это выбранная категория, добавляем класс selected
        if (parseInt(currentSelectedCategoryId) === parseInt(category.id)) {
            categoryClass += ' selected';
        }
        
        // Создаем HTML для элемента категории с НОВЫМ ДИЗАЙНОМ
        let nodeHtml = `
            <div class="${categoryClass}" 
                 data-category-id="${category.id}"
                 data-category-name="${escapeHtml(category.name)}"
                 data-category-level="${level}"
                 data-has-children="${hasChildren}">
                
                <div class="tree-item-content">
                    <!-- Иконка категории - разная для папок и листьев -->
                    <div class="tree-icon ${hasChildren ? 'folder' : 'leaf'}">
                        ${hasChildren ? 
                            '<i class="fas fa-folder"></i>' : 
                            '<i class="fas fa-file"></i>'}
                    </div>
                    
                    <!-- Название категории и количество материалов -->
                    <div class="tree-name">
                        <a href="/sklad/?category_id=${category.id}" 
                           class="category-link"
                           title="Показать материалы в категории: ${escapeHtml(category.name)}">
                           <!-- УБРАЛИ onclick="showLoadingIndicator()" -->
                            ${escapeHtml(category.name)}
                        </a>
                        
                        <!-- Счетчик материалов - показываем только если есть материалы -->
                        ${category.materials_count > 0 ? 
                            `<span class="material-count" 
                                   title="${category.materials_count} материалов в этой категории">
                                ${category.materials_count}
                            </span>` : 
                            ''}
                    </div>
                    
                    <!-- Кнопки действий - КОМПАКТНЫЕ -->
                    <div class="tree-actions">
                        <!-- Кнопка добавления подкатегории -->
                        <button class="btn-tree-action btn-add-subcategory" 
                                data-category-id="${category.id}"
                                title="Добавить подкатегорию в '${escapeHtml(category.name)}'"
                                onclick="event.stopPropagation(); addSubcategory('${category.id}', '${escapeHtml(category.name)}')">
                            <i class="fas fa-plus-circle"></i>
                        </button>
                        
                        <!-- Кнопка удаления категории (только если нет материалов и детей) -->
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
        
        // Добавляем дочерние элементы с улучшенной визуализацией
        if (hasChildren) {
            // Для вложенных элементов добавляем контейнер
            nodeHtml += '<div class="tree-children">';
            
            // Рекурсивно обрабатываем дочерние категории
            const childrenCount = category.children.length;
            category.children.forEach((child, index) => {
                const isChildLast = index === childrenCount - 1;
                nodeHtml += createCategoryNode(child, level + 1, isChildLast);
            });
            
            nodeHtml += '</div>';
        }
        
        nodeHtml += '</div>';
        return nodeHtml;
    }
    
    // Создаем корневые узлы дерева
    const rootCount = treeData.length;
    treeData.forEach((category, index) => {
        const isLast = index === rootCount - 1;
        html += createCategoryNode(category, 0, isLast);
    });
    
    html += '</div>';
    
    // Обновляем содержимое контейнера
    treeContainer.innerHTML = html;
    
    console.log('[SKLAD] Дерево с новым дизайном отрисовано успешно');
    
    // Добавляем обработчики событий для дерева
    addTreeEventListeners();
    
    // Прокручиваем к выбранной категории (если есть)
    if (currentSelectedCategoryId) {
        setTimeout(() => {
            highlightSelectedCategory(currentSelectedCategoryId);
        }, 100);
    }
}

/**
 * Добавляет обработчики событий для элементов дерева категорий
 * Теперь с улучшенной логикой для нового дизайна
 */
function addTreeEventListeners() {
    console.log('[SKLAD] Добавление обработчиков событий для нового дизайна дерева...');
    
    // 1. Обработчики для кликов по элементам дерева (для выделения)
    document.querySelectorAll('.tree-item-content').forEach(content => {
        content.addEventListener('click', function(event) {
            // Игнорируем клики по кнопкам действий и ссылкам
            if (event.target.closest('.btn-tree-action') || 
                event.target.closest('.category-link')) {
                return;
            }
            
            const treeItem = this.closest('.tree-item');
            const categoryId = treeItem.getAttribute('data-category-id');
            const categoryName = treeItem.getAttribute('data-category-name');
            
            console.log(`[SKLAD] Выбор категории ID: ${categoryId}, Name: ${categoryName}`);
            
            // Выделяем выбранную категорию
            selectCategory(categoryId);
            
            // Плавный скролл к выбранному элементу
            treeItem.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        });
    });
    
    // 2. Обработчики для ссылок категорий (предотвращаем стандартное поведение)
    document.querySelectorAll('.category-link').forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault(); // Предотвращаем переход по ссылке
            
            const treeItem = this.closest('.tree-item');
            const categoryId = treeItem.getAttribute('data-category-id');
            const categoryName = treeItem.getAttribute('data-category-name');
            
            console.log(`[SKLAD] Клик по ссылке категории ID: ${categoryId}, Name: ${categoryName}`);
            
            // Выделяем категорию и загружаем материалы через AJAX
            selectCategory(categoryId);
            
            // Добавляем небольшой визуальный feedback для пользователя
            this.style.backgroundColor = 'rgba(11, 134, 97, 0.1)';
            this.style.transition = 'background-color 0.3s ease';
            
            // Убираем подсветку через короткое время
            setTimeout(() => {
                this.style.backgroundColor = '';
            }, 300);
        });
    });
    
    // 3. Обработчики для кнопок добавления подкатегорий (уже есть в HTML)
    // Они работают через inline onclick для предотвращения всплытия событий
    
    // 4. Добавляем эффект наведения на весь элемент
    document.querySelectorAll('.tree-item').forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.backgroundColor = 'rgba(240, 248, 255, 0.3)';
        });
        
        item.addEventListener('mouseleave', function() {
            if (!this.classList.contains('selected')) {
                this.style.backgroundColor = '';
            }
        });
    });
    
    console.log('[SKLAD] Обработчики событий для нового дерева добавлены');
}

// В файле sklad.js, НАЙТИ функцию selectCategory (примерно строка 340)
// и ЗАМЕНИТЬ её полностью на эту версию:

/**
 * Выделяет указанную категорию в дереве и загружает её материалы через AJAX
 * @param {string} categoryId - ID категории для выделения
 */
function selectCategory(categoryId) {
    console.log(`[SKLAD] Программный выбор категории ID: ${categoryId}`);
    
    // Обновляем глобальную переменную
    currentSelectedCategoryId = categoryId;
    
    // Снимаем выделение со всех категорий
    document.querySelectorAll('.tree-item.selected').forEach(item => {
        item.classList.remove('selected');
        item.style.backgroundColor = '';
    });
    
    // Если categoryId не задан, просто очищаем выделение
    if (!categoryId && categoryId !== 0) {
        console.log('[SKLAD] Очистка выделения категории');
        
        // Обновляем URL без категории через AJAX
        if (typeof window.skladAJAX?.updateUrlWithoutCategoryFilter === 'function') {
            window.skladAJAX.updateUrlWithoutCategoryFilter();
        }
        
        // Загружаем все материалы через AJAX
        if (typeof window.skladAJAX?.loadCategoryMaterials === 'function') {
            window.skladAJAX.loadCategoryMaterials(null);
        }
        return;
    }
    
    // Находим и выделяем выбранную категорию
    const selectedItem = document.querySelector(`.tree-item[data-category-id="${categoryId}"]`);
    if (selectedItem) {
        selectedItem.classList.add('selected');
        
        // Плавное изменение фона
        selectedItem.style.transition = 'background-color 0.3s ease';
        selectedItem.style.backgroundColor = '#e8f5e9';
        
        console.log(`[SKLAD] Категория ID: ${categoryId} выделена`);
        
        // Обновляем URL с фильтром через AJAX
        if (typeof window.skladAJAX?.updateUrlWithCategoryFilter === 'function') {
            window.skladAJAX.updateUrlWithCategoryFilter(categoryId);
        }
        
        // Загружаем материалы через AJAX
        if (typeof window.skladAJAX?.loadCategoryMaterials === 'function') {
            window.skladAJAX.loadCategoryMaterials(categoryId);
        } else {
            console.error('[SKLAD] Функция loadCategoryMaterials не найдена');
        }
    } else {
        console.log(`[SKLAD] Категория ID: ${categoryId} не найдена в дереве, но все равно загружаем материалы`);
        
        // Если категория не найдена в дереве (например, оно еще не загружено),
        // все равно загружаем материалы по этой категории
        if (typeof window.skladAJAX?.updateUrlWithCategoryFilter === 'function') {
            window.skladAJAX.updateUrlWithCategoryFilter(categoryId);
        }
        
        if (typeof window.skladAJAX?.loadCategoryMaterials === 'function') {
            window.skladAJAX.loadCategoryMaterials(categoryId);
        }
    }
}

/**
 * Обновляет URL страницы с фильтром по категории
 * @param {string} categoryId - ID категории для фильтрации
 */
function updateUrlWithCategoryFilter(categoryId) {
    // Создаем объект URL
    const url = new URL(window.location.href);
    
    // Устанавливаем параметр category_id
    url.searchParams.set('category_id', categoryId);
    
    // Обновляем URL без перезагрузки страницы
    window.history.pushState({}, '', url);
    
    console.log(`[SKLAD] URL обновлен с фильтром category_id=${categoryId}`);
    
    // Показываем уведомление о применении фильтра
    showNotification('info', 'Фильтр применен: показаны материалы выбранной категории и всех её подкатегорий');
    
    // Перезагружаем страницу для обновления списка материалов
    setTimeout(() => {
        window.location.href = url.toString();
    }, 300);
}

/**
 * Подсвечивает выбранную категорию в дереве с анимацией
 * @param {string} categoryId - ID категории для подсветки
 */
function highlightSelectedCategory(categoryId) {
    console.log(`[SKLAD] Подсветка категории ID: ${categoryId}`);
    
    // Снимаем подсветку со всех категорий
    document.querySelectorAll('.tree-item.highlighted').forEach(item => {
        item.classList.remove('highlighted');
    });
    
    // Снимаем выделение со всех категорий
    document.querySelectorAll('.tree-item.selected').forEach(item => {
        item.classList.remove('selected');
        item.style.backgroundColor = '';
    });
    
    // Если categoryId равен null, undefined или пустой строке, просто выходим
    if (!categoryId && categoryId !== 0) {
        console.log('[SKLAD] Category ID is null/undefined, only clearing selection');
        return;
    }
    
    // Находим и подсвечиваем категорию
    const categoryItem = document.querySelector(`.tree-item[data-category-id="${categoryId}"]`);
    if (categoryItem) {
        // Добавляем классы выделения
        categoryItem.classList.add('selected', 'highlighted');
        
        // Анимация плавного появления фона
        categoryItem.style.transition = 'background-color 0.5s ease';
        categoryItem.style.backgroundColor = '#e8f5e9';
        
        // Прокручиваем к выбранной категории с плавной анимацией
        setTimeout(() => {
            categoryItem.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest' 
            });
        }, 100);
        
        console.log(`[SKLAD] Категория ID: ${categoryId} выделена и подсвечена`);
    } else {
        console.log(`[SKLAD] Категория ID: ${categoryId} не найдена в дереве (может быть скрыта или не загружена)`);
    }
}

// ================== ФУНКЦИИ ДЛЯ РАБОТЫ С ПОДКАТЕГОРИЯМИ ==================

/**
 * Добавляет новую подкатегорию
 * @param {string} parentCategoryId - ID родительской категории
 * @param {string} parentCategoryName - Название родительской категории
 */
function addSubcategory(parentCategoryId, parentCategoryName) {
    console.log(`[SKLAD] Начало добавления подкатегории для родительской категории: ${parentCategoryName}`);
    
    // Запрашиваем название новой подкатегории
    const subcategoryName = prompt(
        `Введите название подкатегории для "${parentCategoryName}":\n` +
        `(Минимум 2 символа, максимум 100 символов)`,
        ''
    );
    
    // Проверяем введенное название
    if (!subcategoryName || subcategoryName.trim() === '') {
        console.log('[SKLAD] Добавление подкатегории отменено: пустое название');
        return;
    }
    
    const trimmedName = subcategoryName.trim();
    
    // Валидация названия
    if (trimmedName.length < 2) {
        showNotification('error', 'Название подкатегории должно содержать минимум 2 символа');
        return;
    }
    
    if (trimmedName.length > 100) {
        showNotification('error', 'Название подкатегории не может превышать 100 символов');
        return;
    }
    
    // Получаем CSRF токен
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
        showNotification('error', 'Ошибка безопасности. Обновите страницу.');
        return;
    }
    
    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('name', trimmedName);
    formData.append('parent', parentCategoryId);
    formData.append('csrfmiddlewaretoken', csrfToken);
    
    // Показываем уведомление о начале процесса
    showNotification('info', `Создание подкатегории "${trimmedName}"...`);
    
    // Отправляем запрос на сервер
    fetch('/sklad/category/create/', {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
    .then(response => {
        // Проверяем статус ответа
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status} ${response.statusText}`);
        }
        
        // Перенаправляем на ту же страницу для обновления данных
        console.log('[SKLAD] Подкатегория создана успешно, обновление страницы...');
        window.location.reload();
    })
    .catch(error => {
        console.error('[SKLAD] Ошибка при создании подкатегории:', error);
        showNotification('error', `Ошибка при создании подкатегории: ${error.message}`);
    });
}

/**
 * Подтверждение удаления категории
 * @param {string} categoryId - ID категории
 * @param {string} categoryName - Название категории
 * @returns {boolean} Результат подтверждения
 */
function confirmDeleteCategory(categoryId, categoryName) {
    const confirmed = confirm(
        `Вы уверены, что хотите удалить категорию "${categoryName}"?\n\n` +
        `Внимание: Если в категории есть подкатегории или материалы, удаление будет невозможно.\n` +
        `Удаление необратимо.`
    );
    
    if (confirmed) {
        console.log(`[SKLAD] Подтверждено удаление категории ID: ${categoryId}, Name: ${categoryName}`);
        return true;
    } else {
        console.log(`[SKLAD] Удаление категории ID: ${categoryId} отменено пользователем`);
        return false;
    }
}

// ================== ФУНКЦИИ ДЛЯ РАБОТЫ С ФОРМАМИ ==================

/**
 * Переключает отображение формы добавления материала
 */
function toggleMaterialForm() {
    console.log('[SKLAD] Переключение формы добавления материала');
    
    const formSection = document.getElementById('material-form-section');
    const toggleButton = document.getElementById('add-material-btn');
    
    if (!formSection || !toggleButton) {
        console.error('[SKLAD] Элементы формы материала не найдены');
        return;
    }
    
    if (formSection.style.display === 'none' || !formSection.style.display) {
        // Показываем форму
        formSection.style.display = 'block';
        toggleButton.textContent = 'Скрыть форму';
        toggleButton.classList.add('active');
        isMaterialFormOpen = true;
        
        // Прокручиваем к форме
        formSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
        
        // Устанавливаем фокус на первое поле
        setTimeout(() => {
            const nameInput = document.getElementById('material-name');
            if (nameInput) {
                nameInput.focus();
            }
        }, 300);
        
        console.log('[SKLAD] Форма добавления материала открыта');
    } else {
        // Скрываем форму
        formSection.style.display = 'none';
        toggleButton.textContent = '+ Добавить материал';
        toggleButton.classList.remove('active');
        isMaterialFormOpen = false;
        
        console.log('[SKLAD] Форма добавления материала закрыта');
    }
}

/**
 * Показывает форму добавления категории
 */
function showCategoryForm() {
    console.log('[SKLAD] Показ формы добавления категории');
    
    const formSection = document.getElementById('category-form-section');
    if (!formSection) {
        console.error('[SKLAD] Форма категории не найдена');
        return;
    }
    
    // Показываем форму
    formSection.style.display = 'block';
    isCategoryFormOpen = true;
    
    // Прокручиваем к форме
    formSection.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
    });
    
    // Устанавливаем фокус на поле ввода
    setTimeout(() => {
        const nameInput = document.getElementById('category-name');
        if (nameInput) {
            nameInput.focus();
        }
    }, 300);
    
    console.log('[SKLAD] Форма добавления категории открыта');
}

/**
 * Скрывает форму добавления категории
 */
function hideCategoryForm() {
    console.log('[SKLAD] Скрытие формы добавления категории');
    
    const formSection = document.getElementById('category-form-section');
    if (formSection) {
        formSection.style.display = 'none';
        isCategoryFormOpen = false;
        console.log('[SKLAD] Форма добавления категории закрыта');
    }
}

/**
 * Очищает форму добавления материала
 */
function clearMaterialForm() {
    console.log('[SKLAD] Очистка формы материала');
    
    const form = document.getElementById('material-form');
    if (form) {
        form.reset();
        
        // Устанавливаем значение по умолчанию для единицы измерения
        const unitInput = document.getElementById('material-unit');
        if (unitInput && !unitInput.value) {
            unitInput.value = 'лист';
        }
        
        // Устанавливаем фокус на название
        const nameInput = document.getElementById('material-name');
        if (nameInput) {
            nameInput.focus();
        }
        
        console.log('[SKLAD] Форма материала очищена');
    }
}

// ================== ФУНКЦИИ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ ==================

/**
 * Начинает inline-редактирование элемента при двойном клике
 * @param {HTMLElement} element - DOM элемент, который нужно редактировать
 */
function startInlineEdit(element) {
    console.log('[SKLAD] Начало inline-редактирования элемента:', element);
    
    // 1. Проверяем, разрешено ли редактирование этого элемента
    if (element.getAttribute('data-editable') !== 'true') {
        console.warn('[SKLAD] Элемент не предназначен для редактирования');
        return;
    }
    
    // 2. Если уже есть редактируемый элемент, отменяем предыдущее редактирование
    if (currentEditingElement && currentEditingElement !== element) {
        console.log('[SKLAD] Отменяем предыдущее редактирование элемента:', currentEditingElement);
        cancelInlineEdit(currentEditingElement);
    }
    
    // 3. Сохраняем ссылку на текущий редактируемый элемент
    currentEditingElement = element;
    
    // 4. Получаем данные из data-атрибутов элемента
    const materialId = element.getAttribute('data-material-id');
    const fieldName = element.getAttribute('data-field');
    let originalValue = element.getAttribute('data-original-value');
    
    // ВАЖНОЕ ИСПРАВЛЕНИЕ: Нормализуем значение - заменяем запятую на точку
    if (originalValue) {
        originalValue = originalValue.replace(',', '.');
    }
    
    // Извлекаем текущее отображаемое значение из текста
    let displayValue = '';
    
    if (fieldName === 'price' && element.textContent) {
        // Для цены: извлекаем числовое значение из текста "300.00 руб./лист"
        const priceMatch = element.textContent.match(/(\d+[.,]?\d*)/);
        if (priceMatch) {
            displayValue = priceMatch[1].replace(',', '.');
            console.log(`[SKLAD] Извлекли значение цены из текста: ${displayValue}`);
        }
    } else if (fieldName === 'quantity' && element.textContent) {
        // Для количества: извлекаем числовое значение из текста "100 лист"
        const quantityMatch = element.textContent.match(/(\d+[.,]?\d*)/);
        if (quantityMatch) {
            displayValue = quantityMatch[1].replace(',', '.');
            console.log(`[SKLAD] Извлекли значение количества из текста: ${displayValue}`);
        }
    } else if (fieldName === 'name') {
        // Для названия: берем текст напрямую
        displayValue = element.textContent.trim();
    }
    
    // Если удалось извлечь значение из текста, используем его как основное
    if (displayValue) {
        // Обновляем data-original-value нормализованным значением
        element.setAttribute('data-original-value', displayValue);
        originalValue = displayValue;
    } else if (!originalValue || originalValue === 'null' || originalValue === 'undefined') {
        // Если значение отсутствует, устанавливаем пустую строку
        originalValue = '';
        element.setAttribute('data-original-value', '');
    }
    
    console.log(`[SKLAD] Данные для редактирования: 
        materialId=${materialId}, 
        fieldName=${fieldName}, 
        originalValue=${originalValue},
        displayValue=${displayValue}`);
    
    // 5. Сохраняем оригинальное содержимое элемента
    const originalHtml = element.innerHTML;
    element.setAttribute('data-original-html', originalHtml);
    
    // 6. Определяем тип поля для создания соответствующего input
    let inputType = 'text';
    let inputStep = 'any';
    let inputMin = '';
    
    switch(fieldName) {
        case 'price':
            inputType = 'number';
            inputStep = '0.01';
            inputMin = '0.01';
            break;
            
        case 'quantity':
            inputType = 'number';
            inputStep = '1';  // Только целые числа
            inputMin = '0';
            
            // Получаем минимальное количество для валидации
            const minQuantity = element.getAttribute('data-min-quantity');
            if (minQuantity) {
                element.setAttribute('title', `Минимальное количество: ${minQuantity}`);
            }
            break;
            
        case 'name':
            inputType = 'text';
            break;
            
        default:
            inputType = 'text';
    }
    
    // 7. Создаем input элемент для редактирования
    const input = document.createElement('input');
    input.type = inputType;
    
    // ВАЖНОЕ ИСПРАВЛЕНИЕ: Устанавливаем значение input
    // Используем нормализованное значение (с точкой)
    const valueToSet = originalValue || '';
    console.log(`[SKLAD] Устанавливаем значение в input: "${valueToSet}"`);
    
    // Для числовых полей преобразуем в число
    if (inputType === 'number') {
        // Убеждаемся, что значение корректное число
        const numValue = parseFloat(valueToSet);
        input.value = isNaN(numValue) ? '' : numValue;
    } else {
        input.value = valueToSet;
    }
    
    // Устанавливаем атрибуты в зависимости от типа поля
    if (inputStep) input.step = inputStep;
    if (inputMin) input.min = inputMin;
    
    // Добавляем CSS классы для стилизации
    input.className = 'inline-edit-input';
    
    // 8. Заменяем содержимое элемента на input
    element.innerHTML = '';
    element.appendChild(input);
    
    // 9. Добавляем кнопки действий (сохранить/отмена)
    const actionButtons = document.createElement('div');
    actionButtons.className = 'inline-edit-buttons';
    
    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'btn-inline-save';
    saveButton.innerHTML = '<i class="fas fa-check"></i>';
    saveButton.title = 'Сохранить изменения';
    
    saveButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveInlineEdit(element, input.value);
    };
    
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn-inline-cancel';
    cancelButton.innerHTML = '<i class="fas fa-times"></i>';
    cancelButton.title = 'Отменить редактирование';
    
    cancelButton.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        cancelInlineEdit(element);
    };
    
    actionButtons.appendChild(saveButton);
    actionButtons.appendChild(cancelButton);
    element.appendChild(actionButtons);
    
    // 10. Устанавливаем фокус на input и выделяем весь текст
    input.focus();
    input.select();
    
    // 11. Добавляем обработчики клавиш
    input.addEventListener('keydown', function(event) {
        // Enter - сохранить изменения
        if (event.key === 'Enter') {
            event.preventDefault();
            saveInlineEdit(element, input.value);
        }
        
        // Escape - отменить редактирование
        if (event.key === 'Escape') {
            event.preventDefault();
            cancelInlineEdit(element);
        }
    });
    
    // 12. Обработчик потери фокуса с защитой от двойного сохранения
    let saveInProgress = false;
    
    input.addEventListener('blur', function() {
        // Даем время для обработки клика по кнопкам
        setTimeout(() => {
            if (!saveInProgress && currentEditingElement === element) {
                console.log('[SKLAD] Input потерял фокус, сохраняем изменения');
                saveInlineEdit(element, input.value);
            }
        }, 200);
    });
    
    // Отмечаем, что началось сохранение
    saveButton.addEventListener('mousedown', () => {
        saveInProgress = true;
    });
    
    cancelButton.addEventListener('mousedown', () => {
        saveInProgress = true;
    });
    
    console.log(`[SKLAD] Начато редактирование поля "${fieldName}" материала ID: ${materialId}, значение: ${input.value}`);
}

/**
 * Сохраняет изменения после inline-редактирования
 * @param {HTMLElement} element - DOM элемент, который редактировался
 * @param {string} newValue - Новое значение
 */
function saveInlineEdit(element, newValue) {
    console.log(`[SKLAD] Попытка сохранения inline-редактирования. newValue="${newValue}"`);
    
    // 1. Получаем данные из data-атрибутов
    const materialId = element.getAttribute('data-material-id');
    const fieldName = element.getAttribute('data-field');
    let originalValue = element.getAttribute('data-original-value');
    
    // Нормализуем значения для сравнения
    if (originalValue) {
        originalValue = originalValue.replace(',', '.');
    }
    
    // Нормализуем новое значение (заменяем запятую на точку)
    const normalizedNewValue = newValue.toString().replace(',', '.');
    
    console.log(`[SKLAD] Данные для сохранения: 
        materialId=${materialId}, 
        fieldName=${fieldName}, 
        originalValue="${originalValue}", 
        newValue="${newValue}",
        normalizedNewValue="${normalizedNewValue}"`);
    
    // 2. Проверяем, изменилось ли значение (сравниваем нормализованные значения)
    if (normalizedNewValue === originalValue) {
        console.log('[SKLAD] Значение не изменилось, отмена редактирования');
        cancelInlineEdit(element);
        return;
    }
    
    // 3. Проверяем, что newValue не пустое
    if (!newValue && newValue !== 0) {
        console.warn('[SKLAD] Пустое значение, отмена редактирования');
        showNotification('warning', 'Значение не может быть пустым');
        
        // Возвращаем фокус на input
        const input = element.querySelector('input');
        if (input) {
            input.focus();
            input.select();
        }
        return;
    }
    
    // 4. Валидация введенного значения
    if (!validateInlineInput(fieldName, normalizedNewValue)) {
        console.warn('[SKLAD] Валидация не пройдена');
        
        // Возвращаем фокус на input
        const input = element.querySelector('input');
        if (input) {
            input.focus();
            input.select();
        }
        return;
    }
    
    // 5. Показываем индикатор загрузки
    element.classList.add('saving');
    
    // 6. Получаем CSRF токен
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
        showNotification('error', 'Ошибка безопасности. Обновите страницу.');
        cancelInlineEdit(element);
        return;
    }
    
    // 7. Подготавливаем данные для отправки
    const requestData = {
        field: fieldName,
        value: normalizedNewValue // Отправляем нормализованное значение
    };
    
    console.log(`[SKLAD] Отправка AJAX запроса:`, requestData);
    
    // 8. Отправляем AJAX запрос на сервер
    fetch(`/sklad/material/update/${materialId}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(requestData)
    })
    .then(response => {
        // Проверяем статус ответа
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('[SKLAD] Ответ сервера:', data);
        
        if (data.success) {
            // Успешное сохранение
            
            // Обновляем data-атрибуты элемента с нормализованным значением
            element.setAttribute('data-original-value', normalizedNewValue);
            
            // Форматируем и отображаем новое значение
            updateElementDisplay(element, fieldName, normalizedNewValue, data.material);
            
            // Показываем уведомление об успехе
            showNotification('success', data.message || 'Изменения сохранены');
            
            // Сбрасываем текущий редактируемый элемент
            currentEditingElement = null;
            
            console.log(`[SKLAD] Поле "${fieldName}" успешно обновлено`);
        } else {
            // Ошибка от сервера
            throw new Error(data.error || 'Неизвестная ошибка сервера');
        }
    })
    .catch(error => {
        console.error('[SKLAD] Ошибка при сохранении:', error);
        
        // Показываем уведомление об ошибке
        showNotification('error', `Ошибка сохранения: ${error.message}`);
        
        // Откатываем изменения
        cancelInlineEdit(element);
    })
    .finally(() => {
        // Убираем индикатор загрузки
        element.classList.remove('saving');
    });
}

/**
 * Отменяет inline-редактирование и возвращает исходное состояние
 * @param {HTMLElement} element - DOM элемент, который редактировался
 */
function cancelInlineEdit(element) {
    console.log('[SKLAD] Отмена inline-редактирования');
    
    // 1. Восстанавливаем оригинальное содержимое элемента
    const originalHtml = element.getAttribute('data-original-html');
    if (originalHtml) {
        element.innerHTML = originalHtml;
    }
    
    // 2. Восстанавливаем обработчик двойного клика
    element.setAttribute('ondblclick', 'startInlineEdit(this)');
    
    // 3. Сбрасываем текущий редактируемый элемент
    if (currentEditingElement === element) {
        currentEditingElement = null;
    }
    
    console.log('[SKLAD] Редактирование отменено, восстановлено исходное состояние');
}

/**
 * Валидирует введенное значение в зависимости от типа поля
 * @param {string} fieldName - Название поля
 * @param {string} value - Введенное значение
 * @returns {boolean} true если значение валидно, false если нет
 */
function validateInlineInput(fieldName, value) {
    // Нормализуем значение (заменяем запятую на точку)
    const normalizedValue = value.toString().replace(',', '.');
    
    // Проверка на пустое значение
    if (!normalizedValue && normalizedValue !== '0') {
        showNotification('warning', 'Значение не может быть пустым');
        return false;
    }
    
    switch(fieldName) {
        case 'name':
            // Название должно быть не менее 2 символов
            if (normalizedValue.length < 2) {
                showNotification('warning', 'Название должно содержать минимум 2 символа');
                return false;
            }
            if (normalizedValue.length > 100) {
                showNotification('warning', 'Название не может превышать 100 символов');
                return false;
            }
            return true;
            
        case 'price':
            // Цена должна быть положительным числом
            const price = parseFloat(normalizedValue);
            if (isNaN(price) || price <= 0) {
                showNotification('warning', 'Цена должна быть положительным числом');
                return false;
            }
            if (price > 999999.99) {
                showNotification('warning', 'Цена не может превышать 999 999.99');
                return false;
            }
            return true;
            
        case 'quantity':
            // Количество должно быть целым неотрицательным числом
            const quantity = parseFloat(normalizedValue);
            if (isNaN(quantity) || quantity < 0) {
                showNotification('warning', 'Количество не может быть отрицательным');
                return false;
            }
            
            // Проверяем, что это целое число
            if (!Number.isInteger(quantity)) {
                showNotification('warning', 'Количество должно быть целым числом');
                return false;
            }
            
            return true;
            
        default:
            // Для остальных полей минимальная валидация
            return true;
    }
}

/**
 * Обновляет отображение элемента после успешного сохранения
 * @param {HTMLElement} element - DOM элемент для обновления
 * @param {string} fieldName - Название поля
 * @param {string} value - Новое значение
 * @param {Object} materialData - Данные материала от сервера
 */
function updateElementDisplay(element, fieldName, value, materialData) {
    console.log(`[SKLAD] Обновление отображения для поля "${fieldName}"`);
    
    // ВАЖНО: Сохраняем текущее состояние элемента для возможного отката
    const currentHtml = element.innerHTML;
    
    switch(fieldName) {
        case 'name':
            // Просто устанавливаем текст
            element.innerHTML = escapeHtml(value);
            break;
            
        case 'price':
            // Форматируем цену с помощью данных от сервера
            if (materialData && materialData.price_display) {
                element.innerHTML = escapeHtml(materialData.price_display);
            } else {
                const price = parseFloat(value);
                const unit = materialData?.unit || 'лист';
                // Форматируем цену с точкой как разделителем
                element.innerHTML = `${price.toFixed(2).replace('.', ',')} руб./${unit}`;
            }
            break;
            
        case 'quantity':
            // Обновляем количество с учетом единицы измерения
            const quantity = parseInt(value, 10);  // Используем parseInt для целых чисел
            const unit = materialData?.unit || 'лист';
            
            // Формируем HTML для количества (без дробной части)
            let quantityHtml = `${quantity} ${unit}`;
            
            // Обновляем классы в зависимости от значения
            element.className = 'quantity-badge'; // Сбрасываем классы
            
            if (quantity <= 0) {
                element.classList.add('quantity-zero');
            } else if (materialData?.min_quantity && quantity <= parseInt(materialData.min_quantity, 10)) {
                element.classList.add('quantity-low');
            }
            
            element.innerHTML = quantityHtml;
            break;
    }
    
    // Восстанавливаем обработчик двойного клика
    element.setAttribute('ondblclick', 'startInlineEdit(this)');
    
    // Обновляем data-атрибуты с нормализованным значением (с точкой)
    element.setAttribute('data-original-value', value);
    
    // Сохраняем новый HTML как оригинальный для будущих редактирований
    element.setAttribute('data-original-html', element.innerHTML);
    
    console.log(`[SKLAD] Отображение для поля "${fieldName}" обновлено. Новое значение: ${value}`);
}

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================

/**
 * Получает CSRF токен со страницы
 * @returns {string|null} CSRF токен или null, если не найден
 */
function getCsrfToken() {
    // Ищем токен в скрытом поле формы
    const csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (csrfInput) {
        return csrfInput.value;
    }
    
    // Ищем токен в meta-теге
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    if (csrfMeta) {
        return csrfMeta.content;
    }
    
    console.warn('[SKLAD] CSRF токен не найден');
    return null;
}

/**
 * Экранирует HTML-символы в строке
 * @param {string} text - Текст для экранирования
 * @returns {string} Экранированный текст
 */
function escapeHtml(text) {
    if (!text) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}



/**
 * Показывает уведомление
 * @param {string} type - Тип уведомления (success, error, info, warning)
 * @param {string} message - Текст сообщения
 */
function showNotification(type, message) {
    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Добавляем на страницу
    document.body.appendChild(notification);
    
    // Удаляем через 5 секунд
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
    
    console.log(`[SKLAD] Показано уведомление типа "${type}": ${message}`);
}

/**
 * Преобразует сообщения Django в уведомления
 */
function convertDjangoMessagesToNotifications() {
    const djangoMessages = document.querySelectorAll('.django-message');
    
    djangoMessages.forEach(msg => {
        const type = msg.dataset.type || 'info';
        const message = msg.textContent.trim();
        
        // Показываем как уведомление
        showNotification(type, message);
        
        // Удаляем элемент из DOM
        msg.remove();
    });
    
    // Удаляем контейнер, если он пуст
    const container = document.querySelector('.django-messages');
    if (container && container.children.length === 0) {
        container.remove();
    }
    
    console.log(`[SKLAD] Преобразовано ${djangoMessages.length} сообщений Django в уведомления`);
}

// ================== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ ==================

/**
 * Инициализация приложения при загрузке DOM
 * ТЕПЕРЬ: Добавлена отладочная информация
 */
function initializeSkladApp() {
    console.log('[SKLAD] Инициализация приложения управления складом...');
    
    try {
        // 1. Конвертируем сообщения Django в уведомления
        convertDjangoMessagesToNotifications();
        
        // 2. Устанавливаем текущую выбранную категорию из URL
        const urlParams = new URLSearchParams(window.location.search);
        const categoryId = urlParams.get('category_id');

        if (categoryId && categoryId !== 'null' && categoryId !== 'undefined') {
            currentSelectedCategoryId = categoryId;
            console.log(`[SKLAD] Текущая выбранная категория из URL: ${categoryId}`);
        } else {
            console.log('[SKLAD] Категория не выбрана');
        }
        
        // 3. Загружаем дерево категорий
        loadCategoryTree()
            .then(() => {
                console.log('[SKLAD] Дерево категорий загружено успешно');
                
                // 4. Подсвечиваем выбранную категорию (если есть)
                if (currentSelectedCategoryId) {
                    // Небольшая задержка для гарантии, что дерево отрисовано
                    setTimeout(() => {
                        highlightSelectedCategory(currentSelectedCategoryId);
                    }, 100);
                }
                
                // 5. ВАЖНО: После загрузки дерева обновляем data-атрибуты у всех редактируемых элементов
                setTimeout(() => {
                    updateAllEditableElements();
                }, 500);
            })
            .catch(error => {
                console.error('[SKLAD] Ошибка при загрузке дерева категорий:', error);
            });
        
        // 4. Назначаем обработчики на кнопки
        const addMaterialBtn = document.getElementById('add-material-btn');
        if (addMaterialBtn) {
            addMaterialBtn.addEventListener('click', toggleMaterialForm);
            console.log('[SKLAD] Обработчик для кнопки добавления материала назначен');
        }
        
        const addCategoryBtn = document.getElementById('add-category-btn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', showCategoryForm);
            console.log('[SKLAD] Обработчик для кнопки добавления категории назначен');
        }
        
        // 5. Если есть сообщения об ошибках в форме, показываем соответствующую форму
        const errorMessages = document.querySelectorAll('.errorlist');
        if (errorMessages.length > 0) {
            console.log('[SKLAD] Обнаружены сообщения об ошибках');
            
            // Определяем, какая форма содержит ошибки
            const materialFormErrors = document.querySelectorAll('#material-form .errorlist');
            const categoryFormErrors = document.querySelectorAll('#category-form .errorlist');
            
            if (materialFormErrors.length > 0 && !isMaterialFormOpen) {
                console.log('[SKLAD] Показываем форму материала из-за ошибок');
                toggleMaterialForm();
            } else if (categoryFormErrors.length > 0 && !isCategoryFormOpen) {
                console.log('[SKLAD] Показываем форму категории из-за ошибок');
                showCategoryForm();
            }
        }
        
        // 6. Показываем подсказку при первом посещении страницы
        if (!localStorage.getItem('sklad_hint_shown')) {
            setTimeout(() => {
                showNotification('info', 
                    '💡 Подсказка: кликните по категории слева, чтобы увидеть материалы в ней. ' +
                    'Для добавления подкатегории нажмите "+" рядом с категорией. ' +
                    'Двойной клик по названию, цене или количеству для быстрого редактирования.'
                );
                localStorage.setItem('sklad_hint_shown', 'true');
                console.log('[SKLAD] Подсказка для первого посещения показана');
            }, 3000);
        }
        
        // 7. Добавляем обработчик для удаления материалов через AJAX
        document.addEventListener('click', function(event) {
            if (event.target.classList.contains('btn-delete') && 
                event.target.tagName === 'BUTTON') {
                
                const materialId = event.target.getAttribute('data-material-id');
                const materialName = event.target.getAttribute('data-material-name');
                
                if (materialId && materialName) {
                    deleteMaterial(event, event.target);
                }
            }
        });
        
        console.log('[SKLAD] Приложение успешно инициализировано');
        
    } catch (error) {
        console.error('[SKLAD] Критическая ошибка при инициализации приложения:', error);
        showNotification('error', 'Ошибка инициализации приложения. Пожалуйста, обновите страницу.');
    }
}

/**
 * НОВАЯ ФУНКЦИЯ: Обновляет data-атрибуты у всех редактируемых элементов
 * Чтобы гарантировать, что data-original-value содержит актуальные значения
 */
function updateAllEditableElements() {
    console.log('[SKLAD] Обновление data-атрибутов у редактируемых элементов...');
    
    // Для всех элементов с data-editable="true"
    document.querySelectorAll('[data-editable="true"]').forEach(element => {
        const fieldName = element.getAttribute('data-field');
        let currentValue = element.getAttribute('data-original-value');
        
        // Нормализуем существующее значение
        if (currentValue) {
            const normalizedValue = currentValue.replace(',', '.');
            if (normalizedValue !== currentValue) {
                element.setAttribute('data-original-value', normalizedValue);
                console.log(`[SKLAD] Нормализован data-original-value для ${fieldName}: ${currentValue} -> ${normalizedValue}`);
            }
        }
        
        // Если значение не установлено, пытаемся извлечь его из текста
        if (!currentValue || currentValue === 'undefined' || currentValue === 'null') {
            if (fieldName === 'price' && element.textContent) {
                const priceMatch = element.textContent.match(/(\d+[.,]?\d*)/);
                if (priceMatch) {
                    const normalizedPrice = priceMatch[1].replace(',', '.');
                    element.setAttribute('data-original-value', normalizedPrice);
                    console.log(`[SKLAD] Обновлен data-original-value для цены: ${normalizedPrice}`);
                }
            } else if (fieldName === 'quantity' && element.textContent) {
                const quantityMatch = element.textContent.match(/(\d+[.,]?\d*)/);
                if (quantityMatch) {
                    const normalizedQuantity = quantityMatch[1].replace(',', '.');
                    element.setAttribute('data-original-value', normalizedQuantity);
                    console.log(`[SKLAD] Обновлен data-original-value для количества: ${normalizedQuantity}`);
                }
            }
        }
    });
    
    console.log('[SKLAD] Data-атрибуты обновлены и нормализованы');
}


/**
 * Удаляет материал через AJAX
 * @param {Event} event - Событие клика
 * @param {HTMLElement} element - Элемент кнопки удаления
 */
function deleteMaterial(event, element) {
    event.preventDefault();
    event.stopPropagation();
    
    const materialId = element.getAttribute('data-material-id');
    const materialName = element.getAttribute('data-material-name');
    
    if (!confirm(`Вы уверены, что хотите удалить материал "${materialName}"?`)) {
        return false;
    }
    
    // Показываем индикатор загрузки
    element.classList.add('deleting');
    element.disabled = true;
    element.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Удаление...';
    
    // Получаем CSRF токен
    const csrfToken = getCsrfToken();
    
    if (!csrfToken) {
        showNotification('error', 'Ошибка безопасности. Обновите страницу.');
        element.classList.remove('deleting');
        element.disabled = false;
        element.innerHTML = 'Удалить';
        return;
    }
    
    // Отправляем AJAX запрос на удаление
    fetch(`/sklad/material/delete/${materialId}/`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Удаляем строку из таблицы
            const row = element.closest('.table-row');
            if (row) {
                row.style.opacity = '0';
                setTimeout(() => {
                    row.remove();
                    showNotification('success', data.message || `Материал "${materialName}" удален.`);
                    
                    // Обновляем дерево категорий, если нужно
                    if (typeof loadCategoryTree === 'function') {
                        loadCategoryTree();
                    }
                }, 300);
            }
        } else {
            throw new Error(data.error || 'Неизвестная ошибка');
        }
    })
    .catch(error => {
        console.error('[SKLAD] Ошибка при удалении материала:', error);
        showNotification('error', `Не удалось удалить материал: ${error.message}`);
    })
    .finally(() => {
        element.classList.remove('deleting');
        element.disabled = false;
        element.innerHTML = 'Удалить';
    });
}

/**
 * Очищает форму добавления материала
 * Используется глобально для обработчиков onclick
 */
window.clearMaterialForm = function() {
    if (typeof window.sklad?.clearMaterialForm === 'function') {
        window.sklad.clearMaterialForm();
    } else if (typeof window.skladAJAX?.clearMaterialForm === 'function') {
        window.skladAJAX.clearMaterialForm();
    }
};


// ================== ГЛОБАЛЬНЫЙ ЭКСПОРТ ФУНКЦИЙ ==================

// Делаем функции доступными глобально для отладки
window.sklad = {
    loadCategoryTree,
    renderCategoryTree,
    addSubcategory,
    toggleMaterialForm,
    showCategoryForm,
    hideCategoryForm,
    clearMaterialForm,
    showNotification,
    initializeSkladApp,
    // НОВЫЕ ФУНКЦИИ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ
    startInlineEdit,
    saveInlineEdit,
    cancelInlineEdit,
    validateInlineInput,
    updateElementDisplay,
    highlightSelectedCategory,
    selectCategory,
    deleteMaterial,
};

// ================== ЗАПУСК ИНИЦИАЛИЗАЦИИ ==================

// Запускаем инициализацию при полной загрузке DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSkladApp);
} else {
    initializeSkladApp();
}