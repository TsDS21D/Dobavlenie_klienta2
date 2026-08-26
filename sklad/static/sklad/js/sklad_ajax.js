/*
 * sklad_ajax.js
 * JavaScript для AJAX-работы приложения sklad (бес-перезагрузочная загрузка материалов).
 *
 * Обеспечивает:
 * - Загрузку материалов при выборе категории или сбросе фильтра.
 * - Обновление правой колонки (таблица материалов, статистика, форма добавления).
 * - Загрузку списка категорий для выпадающего списка в форме добавления материала.
 * - Обработку истории браузера (кнопки "назад"/"вперёд").
 * - Поддержку типа материала (paper/film) для корректной фильтрации.
 * - Создание формы добавления материала, если она отсутствует в DOM.
 *
 * ИСПРАВЛЕНИЕ (06.04.2026): функция loadCategoriesForForm теперь принимает
 * параметр materialType, чтобы загружать категории именно для выбранного типа,
 * а не только для глобального. Это позволяет корректно обновлять список
 * категорий при переключении типа материала в форме.
 *
 * Все функции экспортируются в глобальный объект window.skladAJAX.
 */

// ================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==================

// Текущая выбранная категория (ID) – используется для обновления URL и фильтрации.
let currentCategoryId = null;

// Контроллер для отмены предыдущего AJAX-запроса (чтобы не было race conditions).
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
    const type = getCurrentType();
    let url = categoryId 
        ? `/sklad/api/category/${categoryId}/?type=${type}` 
        : `/sklad/api/category/all/?type=${type}`;
    
    console.log(`[SKLAD-AJAX] Загрузка материалов для категории ID: ${categoryId}, тип: ${type}`);
    
    // Отменяем предыдущий незавершённый запрос
    if (activeRequestController) {
        console.log('[SKLAD-AJAX] Отмена предыдущего запроса');
        activeRequestController.abort();
    }
    
    activeRequestController = new AbortController();
    
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json'
        },
        signal: activeRequestController.signal
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status} ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('[SKLAD-AJAX] Материалы получены успешно');
        if (data.success) {
            updateMaterialsContent(data);
            loadCategoriesForForm(); // Обновляем выпадающий список категорий (без параметра - использует глобальный тип)
        } else {
            throw new Error(data.error || 'Неизвестная ошибка сервера');
        }
    })
    .catch(error => {
        if (error.name === 'AbortError') {
            console.log('[SKLAD-AJAX] Запрос отменён');
            return;
        }
        console.error('[SKLAD-AJAX] Ошибка загрузки материалов:', error);
        // Ошибка уже обработана в generate_materials_html, поэтому ничего не делаем
    })
    .finally(() => {
        activeRequestController = null;
    });
}

/**
 * Загружает список категорий для выпадающего списка в форме добавления материала.
 * Учитывает переданный тип материала (paper/film) или берёт из глобальной переменной.
 * 
 * ИСПРАВЛЕНИЕ: добавлен необязательный параметр materialType, который позволяет
 * загружать категории именно для нужного типа, независимо от глобального.
 * 
 * @param {string} [materialType] - 'paper' или 'film' (если не указан, берётся из getCurrentType())
 */
function loadCategoriesForForm(materialType) {
    // Определяем тип: если передан параметр, используем его, иначе берём глобальный
    let type = materialType;
    if (!type) {
        type = getCurrentType();
    }
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
            // Передаём в функцию обновления select флаг, нужно ли сохранять текущее значение
            updateCategorySelect(data.categories, false); // false - не сохранять, так как тип изменился
        } else {
            console.error('[SKLAD-AJAX] Ошибка получения категорий:', data.error);
        }
    })
    .catch(error => {
        console.error('[SKLAD-AJAX] Ошибка загрузки категорий для формы:', error);
        const select = document.getElementById('material-category');
        if (select) {
            select.disabled = false;
            select.innerHTML = '<option value="">-- Ошибка загрузки категорий --</option>';
        }
    });
}

/**
 * Обновляет выпадающий список категорий в форме добавления материала.
 * 
 * ИСПРАВЛЕНИЕ: добавлен параметр preserveValue, который определяет,
 * нужно ли пытаться сохранить ранее выбранное значение (при смене типа
 * значение сбрасывается, так как старый ID категории не подходит).
 * 
 * @param {Array} categories - Массив объектов категорий {id, name}
 * @param {boolean} preserveValue - Сохранять ли текущее выбранное значение (по умолчанию false)
 */
function updateCategorySelect(categories, preserveValue = false) {
    const select = document.getElementById('material-category');
    if (!select) return;
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Выберите категорию --</option>';
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        select.appendChild(option);
    });
    
    // Если нужно сохранить значение и оно присутствует в новом списке - восстанавливаем
    if (preserveValue && currentValue && categories.some(c => c.id == currentValue)) {
        select.value = currentValue;
    } else {
        // Иначе сбрасываем выбранное значение
        select.value = '';
    }
    select.disabled = false;
}

/**
 * Обновляет содержимое правой колонки (таблицу материалов) на основе данных от сервера.
 * @param {Object} data - Данные от сервера (содержат html, stats и т.д.)
 */
function updateMaterialsContent(data) {
    console.log('[SKLAD-AJAX] Обновление содержимого правой колонки');
    
    const rightColumn = document.querySelector('.right-column');
    if (!rightColumn) {
        console.error('[SKLAD-AJAX] Правая колонка не найдена');
        return;
    }
    
    rightColumn.innerHTML = data.html;
    console.log('HTML вставлен');
    
    // После вставки нового HTML нужно заново инициализировать обработчики событий
    initializeMaterialEventHandlers();
    
    console.log('[SKLAD-AJAX] Правая колонка обновлена');
}

/**
 * Инициализирует обработчики событий для динамически созданных элементов
 * (кнопки удаления, форма добавления, переключатель полей формы).
 */
function initializeMaterialEventHandlers() {
    console.log('[SKLAD-AJAX] Инициализация обработчиков событий для материалов');
    
    // 1. Обработчики для кнопок удаления
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            const materialId = this.getAttribute('data-material-id');
            const materialName = this.getAttribute('data-material-name');
            if (materialId && materialName) {
                if (confirm(`Удалить материал "${materialName}"?`)) {
                    if (typeof window.sklad?.deleteMaterial === 'function') {
                        window.sklad.deleteMaterial(this, materialId);
                    }
                }
            }
        });
    });
    
    // 2. Обработчик для кнопки добавления материала
    const addMaterialBtn = document.getElementById('add-material-btn');
    if (addMaterialBtn) {
        addMaterialBtn.removeEventListener('click', handleAddMaterialClick);
        addMaterialBtn.addEventListener('click', handleAddMaterialClick);
    }
    
    // 3. Обработчик для кнопки сброса фильтра
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
        materialTypeSelect.removeEventListener('change', window.sklad.updateFormFieldsByType);
        materialTypeSelect.addEventListener('change', window.sklad.updateFormFieldsByType);
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
        console.log('[SKLAD-AJAX] Форма материала не найдена, создаем новую');
        createMaterialForm();
        return;
    }
    
    if (formSection.style.display === 'none') {
        formSection.style.display = 'block';
        toggleButton.textContent = 'Скрыть форму';
        toggleButton.classList.add('active');
        // Загружаем категории для текущего типа (из глобальной переменной)
        loadCategoriesForForm();
        if (typeof window.sklad?.updateFormFieldsByType === 'function') {
            window.sklad.updateFormFieldsByType();
        }
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
            const nameInput = document.getElementById('material-name');
            if (nameInput) nameInput.focus();
        }, 300);
    } else {
        formSection.style.display = 'none';
        toggleButton.textContent = '+ Добавить';
        toggleButton.classList.remove('active');
    }
}

/**
 * Создаёт форму добавления материала, если она отсутствует в DOM.
 * Используется при первом клике, если форма ещё не была загружена.
 * Теперь форма содержит поля cost, markup_percent, unit (общие для всех типов),
 * а также специфические блоки paper-fields и film-fields.
 */
function createMaterialForm() {
    console.log('[SKLAD-AJAX] Создание формы материала');
    
    const rightColumn = document.querySelector('.right-column');
    if (!rightColumn) return;
    
    const csrfToken = getCsrfToken();
    
    // HTML-код формы с унифицированными полями (себестоимость, наценка, единица измерения)
    const formHTML = `
    <div class="form-section" id="material-form-section" style="display: block;">
        <h3>Добавить новый материал</h3>
        <form method="post" action="/sklad/material/create/" id="material-form">
            <input type="hidden" name="csrfmiddlewaretoken" value="${csrfToken}">
            
            <!-- Название материала -->
            <div class="form-group">
                <label for="material-name">Название материала*</label>
                <input type="text" id="material-name" name="name" class="form-control" required>
            </div>
            
            <!-- Тип материала (бумага/плёнка) -->
            <div class="form-group">
                <label for="material-type">Тип материала*</label>
                <select id="material-type" name="type" class="form-control" required>
                    <option value="paper">Бумага</option>
                    <option value="film">Плёнка</option>
                </select>
            </div>
            
            <!-- Категория -->
            <div class="form-group" id="category-group">
                <label for="material-category">Категория*</label>
                <select id="material-category" name="category" class="form-control" required>
                    <option value="">-- Выберите категорию --</option>
                </select>
            </div>
            
            <!-- ОБЩИЕ ПОЛЯ ДЛЯ ВСЕХ ТИПОВ (ценообразование и единицы) -->
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
            
            <!-- СПЕЦИФИЧЕСКИЕ ПОЛЯ ДЛЯ БУМАГИ (изначально видимы) -->
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
            
            <!-- СПЕЦИФИЧЕСКИЕ ПОЛЯ ДЛЯ ПЛЁНКИ (изначально скрыты) -->
            <div id="film-fields" style="display: none;">
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
            
            <!-- Примечание -->
            <div class="form-group">
                <label for="material-notes">Примечание</label>
                <textarea id="material-notes" name="notes" class="form-control" rows="3"></textarea>
            </div>
            
            <!-- Активен -->
            <div class="form-group">
                <label><input type="checkbox" name="is_active" class="form-check-input" checked> Активен</label>
            </div>
            
            <!-- Кнопки управления -->
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
    
    // Загружаем категории для формы (используя текущий тип из глобальной переменной)
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
    if (window.sklad && window.sklad.currentMaterialType) {
        return window.sklad.currentMaterialType;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get('type');
    return (type === 'film') ? 'film' : 'paper';
}

/**
 * Получает CSRF-токен из cookie или DOM.
 * @returns {string} CSRF-токен или пустая строка, если не найден
 */
function getCsrfToken() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrftoken') {
            return value;
        }
    }
    const csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (csrfInput) return csrfInput.value;
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
        setupHistoryHandlers();
        const urlParams = new URLSearchParams(window.location.search);
        const initialCategoryId = urlParams.get('category_id');
        if (initialCategoryId) {
            currentCategoryId = initialCategoryId;
            setTimeout(() => {
                loadCategoryMaterials(initialCategoryId);
            }, 500);
        } else {
            loadCategoryMaterials(null);
        }
        console.log('[SKLAD-AJAX] AJAX-функциональность инициализирована');
    } catch (error) {
        console.error('[SKLAD-AJAX] Ошибка инициализации AJAX:', error);
    }
}

// ================== ГЛОБАЛЬНЫЙ ЭКСПОРТ ФУНКЦИЙ ==================

window.skladAJAX = {
    loadCategoryMaterials,
    loadCategoriesForForm,      // теперь может принимать параметр materialType
    resetCategoryFilter,
    updateUrlWithCategoryFilter,
    updateUrlWithoutCategoryFilter,
    initializeSkladAJAX,
    handleAddMaterialClick,
    clearMaterialForm,
    getCsrfToken
};

// ================== ЗАПУСК ИНИЦИАЛИЗАЦИИ ==================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSkladAJAX);
} else {
    initializeSkladAJAX();
}