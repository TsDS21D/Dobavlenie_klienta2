/*
 * sklad_ajax.js
 * JavaScript для AJAX-работы приложения sklad (бес-перезагрузочная загрузка материалов).
 * Обеспечивает:
 * - Загрузку материалов при выборе категории или сбросе фильтра.
 * - Обновление правой колонки (таблица материалов, статистика, форма добавления).
 * - Загрузку списка категорий для выпадающего списка в форме добавления материала.
 * - Обработку истории браузера (кнопки "назад"/"вперёд").
 * - Поддержку типа материала (paper/film) для корректной фильтрации.
 * - Создание формы добавления материала, если она отсутствует в DOM.
 *
 * Все функции экспортируются в глобальный объект window.skladAJAX для доступа из других скриптов.
 *
 * Автор: разработчик
 * Дата: 2025
 */

// ================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==================

// Текущая выбранная категория (ID) – используется для обновления URL и фильтрации.
// Инициализируется значением null, позже может быть установлена из URL.
let currentCategoryId = null;

// Контроллер для отмены предыдущего AJAX-запроса (чтобы не было race conditions).
// Позволяет прервать старый запрос, если пользователь быстро переключает категории.
let activeRequestController = null;

// ================== ОСНОВНЫЕ ФУНКЦИИ AJAX ==================

/**
 * Сбрасывает фильтр категории и показывает все материалы текущего типа.
 * Вызывается по нажатию на кнопку "Сбросить" или программно.
 */
function resetCategoryFilter() {
    console.log('[SKLAD-AJAX] Сброс фильтра категории');
    currentCategoryId = null;                 // Очищаем ID выбранной категории
    updateUrlWithoutCategoryFilter();         // Убираем параметр category_id из URL
    loadCategoryMaterials(null);              // Загружаем все материалы (без фильтра)
}

/**
 * Обновляет URL, добавляя параметр category_id (фильтр по категории).
 * Использует History API, чтобы не перезагружать страницу.
 * @param {string} categoryId - ID категории для фильтрации
 */
function updateUrlWithCategoryFilter(categoryId) {
    const url = new URL(window.location.href);
    url.searchParams.set('category_id', categoryId);
    window.history.pushState({}, '', url);
    console.log(`[SKLAD-AJAX] URL обновлен с фильтром category_id=${categoryId}`);
}

/**
 * Обновляет URL, удаляя параметр category_id (сброс фильтра).
 */
function updateUrlWithoutCategoryFilter() {
    const url = new URL(window.location.href);
    url.searchParams.delete('category_id');
    window.history.pushState({}, '', url);
    console.log('[SKLAD-AJAX] URL обновлен без фильтра');
}

/**
 * Загружает материалы для выбранной категории (или все) через AJAX.
 * Принимает ID категории или null для загрузки всех материалов.
 * @param {string|null} categoryId - ID категории или null
 */
function loadCategoryMaterials(categoryId) {
    // Определяем текущий тип материала (бумага/плёнка) с помощью вспомогательной функции
    const type = getCurrentType();
    
    // Формируем URL в зависимости от наличия categoryId
    // Если categoryId передан – используем API для конкретной категории,
    // иначе – API для всех материалов
    let url = categoryId 
        ? `/sklad/api/category/${categoryId}/?type=${type}` 
        : `/sklad/api/category/all/?type=${type}`;
    
    console.log(`[SKLAD-AJAX] Загрузка материалов для категории ID: ${categoryId}, тип: ${type}`);
    
    // Отменяем предыдущий незавершённый запрос, если он есть
    // Это предотвращает ситуацию, когда ответ от старого запроса приходит после нового
    if (activeRequestController) {
        console.log('[SKLAD-AJAX] Отмена предыдущего запроса');
        activeRequestController.abort();
    }
    
    // Создаём новый контроллер для этого запроса
    activeRequestController = new AbortController();
    
    // Выполняем fetch-запрос
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',  // Указываем, что это AJAX (Django определяет)
            'Accept': 'application/json'           // Ожидаем JSON-ответ
        },
        signal: activeRequestController.signal     // Привязываем сигнал для отмены
    })
    .then(response => {
        // Проверяем, что ответ успешный (статус 2xx)
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status} ${response.statusText}`);
        }
        return response.json(); // Парсим JSON
    })
    .then(data => {
        console.log('[SKLAD-AJAX] Материалы получены успешно');
        if (data.success) {
            // Обновляем правую колонку (таблицу материалов, статистику, форму)
            updateMaterialsContent(data);
            // Обновляем выпадающий список категорий в форме добавления материала
            loadCategoriesForForm();
        } else {
            throw new Error(data.error || 'Неизвестная ошибка сервера');
        }
    })
    .catch(error => {
        // Игнорируем ошибки отмены (AbortError) – это нормальное поведение
        if (error.name === 'AbortError') {
            console.log('[SKLAD-AJAX] Запрос отменён');
            return;
        }
        console.error('[SKLAD-AJAX] Ошибка загрузки материалов:', error);
        // Можно показать уведомление об ошибке, но не обязательно, так как функция
        // generate_materials_html в views.py уже возвращает HTML с сообщением об ошибке.
    })
    .finally(() => {
        // Освобождаем контроллер, чтобы следующий запрос мог создать новый
        activeRequestController = null;
    });
}

/**
 * Загружает список категорий для выпадающего списка в форме добавления материала.
 * Учитывает текущий тип материала (paper/film).
 */
function loadCategoriesForForm() {
    const type = getCurrentType();
    console.log('[SKLAD-AJAX] Загрузка категорий для формы, тип:', type);
    
    fetch(`/sklad/api/categories/for-form/?type=${type}`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status} ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            updateCategorySelect(data.categories);
        } else {
            console.error('[SKLAD-AJAX] Ошибка получения категорий:', data.error);
        }
    })
    .catch(error => {
        console.error('[SKLAD-AJAX] Ошибка загрузки категорий для формы:', error);
    });
}

/**
 * Обновляет выпадающий список категорий в форме добавления материала.
 * @param {Array} categories - Массив объектов категорий {id, name}
 */
function updateCategorySelect(categories) {
    const select = document.getElementById('material-category');
    if (!select) return;
    
    // Сохраняем текущее выбранное значение (чтобы восстановить, если возможно)
    const currentValue = select.value;
    // Очищаем список и добавляем заглушку
    select.innerHTML = '<option value="">-- Выберите категорию --</option>';
    
    // Добавляем все категории как опции
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
    });
    
    // Восстанавливаем ранее выбранное значение, если оно есть в новом списке
    if (currentValue && categories.some(c => c.id == currentValue)) {
        select.value = currentValue;
    }
}

/**
 * Обновляет содержимое правой колонки (таблицу материалов) на основе данных от сервера.
 * @param {Object} data - Данные от сервера (содержат html, stats и т.д.)
 */
function updateMaterialsContent(data) {
    console.log('[SKLAD-AJAX] Обновление содержимого правой колонки');
    console.log('Получен HTML длиной:', data.html.length);
    
    const rightColumn = document.querySelector('.right-column');
    if (!rightColumn) {
        console.error('[SKLAD-AJAX] Правая колонка не найдена');
        return;
    }
    
    // Вставляем полученный HTML (таблица материалов + форма добавления + статистика)
    // Это полностью заменяет содержимое правой колонки
    rightColumn.innerHTML = data.html;
    console.log('HTML вставлен');
    
    // После вставки нового HTML нужно заново инициализировать обработчики событий
    // (кнопки удаления, форма добавления, переключение типа материала)
    initializeMaterialEventHandlers();
    
    // Дополнительная проверка: выводим все элементы с data-editable для отладки
    const editableFields = document.querySelectorAll('[data-editable="true"]');
    console.log(`Найдено editable полей: ${editableFields.length}`);
    editableFields.forEach(el => {
        console.log(`  - поле: ${el.getAttribute('data-field')}, material-id: ${el.getAttribute('data-material-id')}, original-value: ${el.getAttribute('data-original-value')}`);
    });
    
    console.log('[SKLAD-AJAX] Правая колонка обновлена');
}

/**
 * Инициализирует обработчики событий для динамически созданных элементов
 * (кнопки удаления, форма добавления, переключатель полей формы).
 * Обработчики двойного клика для редактирования не добавляются,
 * так как они обрабатываются глобальным слушателем в sklad.js.
 */
function initializeMaterialEventHandlers() {
    console.log('[SKLAD-AJAX] Инициализация обработчиков событий для материалов');
    
    // 1. Обработчики для кнопок удаления (используем делегирование или прямую привязку)
    // Находим все кнопки с классом .btn-delete и добавляем обработчик click
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            const materialId = this.getAttribute('data-material-id');
            const materialName = this.getAttribute('data-material-name');
            if (materialId && materialName) {
                // Запрашиваем подтверждение и вызываем функцию удаления из sklad.js
                if (confirm(`Удалить материал "${materialName}"?`)) {
                    if (typeof window.sklad?.deleteMaterial === 'function') {
                        window.sklad.deleteMaterial(this, materialId);
                    }
                }
            }
        });
    });
    
    // 2. Обработчик для кнопки добавления материала (она может быть новой)
    const addMaterialBtn = document.getElementById('add-material-btn');
    if (addMaterialBtn) {
        // Удаляем старые обработчики (чтобы не дублировать при повторных инициализациях)
        addMaterialBtn.removeEventListener('click', handleAddMaterialClick);
        addMaterialBtn.addEventListener('click', handleAddMaterialClick);
    }
    
    // 3. Обработчик для кнопки сброса фильтра (если она есть)
    const resetFilterBtn = document.querySelector('.btn-reset-filter');
    if (resetFilterBtn) {
        resetFilterBtn.addEventListener('click', function(event) {
            event.preventDefault();
            resetCategoryFilter();
        });
    }
    
    // 4. Привязываем обработчик изменения типа материала для динамического показа/скрытия полей
    const materialTypeSelect = document.getElementById('material-type');
    if (materialTypeSelect) {
        // Удаляем предыдущий обработчик, если он был (чтобы не дублировать)
        materialTypeSelect.removeEventListener('change', window.sklad.updateFormFieldsByType);
        // Добавляем новый обработчик, который будет показывать/скрывать поля в зависимости от типа
        materialTypeSelect.addEventListener('change', window.sklad.updateFormFieldsByType);
        // Сразу вызываем функцию, чтобы привести видимость полей в соответствие с текущим выбранным типом
        if (typeof window.sklad.updateFormFieldsByType === 'function') {
            window.sklad.updateFormFieldsByType();
        }
    }
    
    // 5. Инициализируем обработчик отправки формы материала (AJAX)
    if (typeof window.sklad?.initMaterialFormSubmit === 'function') {
        window.sklad.initMaterialFormSubmit();
    }
    
    console.log('[SKLAD-AJAX] Обработчики событий для материалов инициализированы');
}

/**
 * Обработчик клика по кнопке "Добавить материал".
 * Показывает/скрывает форму добавления материала.
 * @param {Event} event - Событие клика
 */
function handleAddMaterialClick(event) {
    console.log('[SKLAD-AJAX] Клик по кнопке добавления материала');
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const formSection = document.getElementById('material-form-section');
    const toggleButton = document.getElementById('add-material-btn');
    
    if (!formSection) {
        // Если форма отсутствует (например, при первой загрузке, если в правой колонке нет формы),
        // создаём её динамически
        console.log('[SKLAD-AJAX] Форма материала не найдена, создаем новую');
        createMaterialForm();
        return;
    }
    
    if (formSection.style.display === 'none') {
        // Показываем форму
        formSection.style.display = 'block';
        toggleButton.textContent = 'Скрыть форму';
        toggleButton.classList.add('active');
        // Обновляем список категорий в форме (на случай, если они изменились)
        loadCategoriesForForm();
        // Переключаем видимость полей в зависимости от выбранного типа
        if (typeof window.sklad?.updateFormFieldsByType === 'function') {
            window.sklad.updateFormFieldsByType();
        }
        // Прокручиваем к форме
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Устанавливаем фокус на поле "Название" через небольшую задержку
        setTimeout(() => {
            const nameInput = document.getElementById('material-name');
            if (nameInput) nameInput.focus();
        }, 300);
    } else {
        // Скрываем форму
        formSection.style.display = 'none';
        toggleButton.textContent = '+ Добавить';
        toggleButton.classList.remove('active');
    }
}

/**
 * Создаёт форму добавления материала, если она отсутствует в DOM.
 * Используется при первом клике, если форма ещё не была загружена
 * (например, когда правая колонка была пустой).
 */
function createMaterialForm() {
    console.log('[SKLAD-AJAX] Создание формы материала');
    
    const rightColumn = document.querySelector('.right-column');
    if (!rightColumn) return;
    
    // Получаем CSRF-токен из cookie (наиболее надёжный способ)
    const csrfToken = getCsrfToken();
    
    // HTML-код формы (полностью соответствует тому, что генерирует generate_materials_html)
    // Добавлены поля density и paper_thickness
    const formHTML = `
    <div class="form-section" id="material-form-section" style="display: block;">
        <h3>Добавить новый материал</h3>
        <form method="post" action="/sklad/material/create/" id="material-form">
            <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken}">
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
                <button type="button" class="btn-clear" onclick="skladAJAX.clearMaterialForm()">Очистить</button>
            </div>
        </form>
    </div>
    `;
    
    // Находим место для вставки формы (после заголовка или в начало правой колонки)
    const sectionHeader = rightColumn.querySelector('.section-header');
    if (sectionHeader) {
        sectionHeader.insertAdjacentHTML('afterend', formHTML);
    } else {
        rightColumn.insertAdjacentHTML('afterbegin', formHTML);
    }
    
    // Загружаем категории для формы
    loadCategoriesForForm();
    
    // Настраиваем переключение полей при изменении типа
    const materialTypeSelect = document.getElementById('material-type');
    if (materialTypeSelect && typeof window.sklad?.updateFormFieldsByType === 'function') {
        materialTypeSelect.addEventListener('change', window.sklad.updateFormFieldsByType);
        window.sklad.updateFormFieldsByType();
    }
    
    // Меняем текст кнопки добавления, чтобы показать, что форма открыта
    const addMaterialBtn = document.getElementById('add-material-btn');
    if (addMaterialBtn) {
        addMaterialBtn.textContent = 'Скрыть форму';
        addMaterialBtn.classList.add('active');
    }
}

/**
 * Очищает форму добавления материала (сбрасывает значения).
 * Вызывается из onclick на кнопке "Очистить".
 */
function clearMaterialForm() {
    console.log('[SKLAD-AJAX] Очистка формы материала');
    // Используем функцию из sklad.js, чтобы не дублировать логику
    if (typeof window.sklad?.clearMaterialForm === 'function') {
        window.sklad.clearMaterialForm();
    }
}

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================

/**
 * Возвращает текущий тип материала (paper/film), определяя его из глобальной переменной sklad или URL.
 * @returns {string} 'paper' или 'film'
 */
function getCurrentType() {
    // Если глобальная переменная sklad определена и содержит currentMaterialType, используем её
    if (window.sklad && window.sklad.currentMaterialType) {
        return window.sklad.currentMaterialType;
    }
    // Иначе пытаемся получить из URL (параметр type)
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('type');
    return (type === 'film') ? 'film' : 'paper';
}

/**
 * Получает CSRF-токен из cookie или DOM.
 * @returns {string} CSRF-токен или пустая строка, если не найден
 */
function getCsrfToken() {
    // Сначала пробуем из cookie
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrftoken') {
            return value;
        }
    }
    // Затем из скрытого поля формы
    const csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (csrfInput) return csrfInput.value;
    // И из meta-тега (если используется)
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    if (csrfMeta) return csrfMeta.content;
    console.warn('[SKLAD-AJAX] CSRF-токен не найден');
    return '';
}

// ================== ОБРАБОТЧИКИ ИСТОРИИ БРАУЗЕРА ==================

/**
 * Настраивает обработчик события popstate (нажатие кнопок назад/вперёд).
 * При изменении URL загружаем материалы для новой категории.
 */
function setupHistoryHandlers() {
    window.addEventListener('popstate', function(event) {
        console.log('[SKLAD-AJAX] Событие popstate, URL изменён:', window.location.href);
        const urlParams = new URLSearchParams(window.location.search);
        const categoryId = urlParams.get('category_id');
        currentCategoryId = categoryId;
        loadCategoryMaterials(categoryId);
        // Подсвечиваем категорию в дереве, если она есть
        if (typeof window.sklad?.highlightSelectedCategory === 'function') {
            window.sklad.highlightSelectedCategory(categoryId);
        }
    });
}

// ================== ИНИЦИАЛИЗАЦИЯ AJAX-МОДУЛЯ ==================

/**
 * Инициализирует AJAX-функциональность приложения.
 * Вызывается при загрузке страницы.
 */
function initializeSkladAJAX() {
    console.log('[SKLAD-AJAX] Инициализация AJAX-функциональности');
    
    try {
        // Настраиваем обработчики истории (назад/вперёд)
        setupHistoryHandlers();
        
        // Определяем начальную категорию из URL (если есть)
        const urlParams = new URLSearchParams(window.location.search);
        const initialCategoryId = urlParams.get('category_id');
        if (initialCategoryId) {
            currentCategoryId = initialCategoryId;
            // Небольшая задержка, чтобы дерево категорий успело загрузиться
            setTimeout(() => {
                loadCategoryMaterials(initialCategoryId);
            }, 500);
        } else {
            // Если категория не выбрана, загружаем все материалы
            loadCategoryMaterials(null);
        }
        
        console.log('[SKLAD-AJAX] AJAX-функциональность инициализирована');
    } catch (error) {
        console.error('[SKLAD-AJAX] Ошибка инициализации AJAX:', error);
    }
}

// ================== ГЛОБАЛЬНЫЙ ЭКСПОРТ ФУНКЦИЙ ==================

// Делаем функции доступными глобально для вызова из других скриптов и HTML
window.skladAJAX = {
    loadCategoryMaterials,      // Загрузка материалов для категории
    loadCategoriesForForm,      // Загрузка категорий для выпадающего списка
    resetCategoryFilter,        // Сброс фильтра категории
    updateUrlWithCategoryFilter,// Обновление URL с фильтром
    updateUrlWithoutCategoryFilter, // Обновление URL без фильтра
    initializeSkladAJAX,        // Инициализация модуля
    handleAddMaterialClick,     // Обработчик кнопки "Добавить материал"
    clearMaterialForm,          // Очистка формы материала
    getCsrfToken                // Получение CSRF-токена
};

// ================== ЗАПУСК ИНИЦИАЛИЗАЦИИ ==================

// Запускаем инициализацию после полной загрузки DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSkladAJAX);
} else {
    initializeSkladAJAX();
}