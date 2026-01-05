/*
sklad_ajax.js
JavaScript для AJAX-работы приложения sklad
*/

// ================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ==================

let isAJAXLoading = false;
let currentCategoryId = null;
let activeRequestController = null;

// ================== ОСНОВНЫЕ ФУНКЦИИ ==================

/**
 * Сбрасывает фильтр категории и показывает все материалы
 */
function resetCategoryFilter() {
    console.log('[SKLAD-AJAX] Сброс фильтра категории');
    
    // Сбрасываем текущую категорию
    currentCategoryId = null;
    
    // Убираем выделение в дереве - передаем null
    if (typeof window.sklad?.highlightSelectedCategory === 'function') {
        window.sklad.highlightSelectedCategory(null);
    }
    
    // Обновляем URL
    updateUrlWithoutCategoryFilter();
    
    // Загружаем все материалы
    loadCategoryMaterials(null);
}

/**
 * Обновляет URL с фильтром по категории
 */
function updateUrlWithCategoryFilter(categoryId) {
    const url = new URL(window.location.href);
    url.searchParams.set('category_id', categoryId);
    window.history.pushState({}, '', url);
    console.log(`[SKLAD-AJAX] URL обновлен с фильтром category_id=${categoryId}`);
}

/**
 * Обновляет URL без фильтра по категории
 */
function updateUrlWithoutCategoryFilter() {
    const url = new URL(window.location.href);
    url.searchParams.delete('category_id');
    window.history.pushState({}, '', url);
    console.log('[SKLAD-AJAX] URL обновлен без фильтра');
}

// ================== AJAX-ЗАГРУЗКА МАТЕРИАЛОВ ==================

/**
 * Загружает материалы для выбранной категории через AJAX
 */
function loadCategoryMaterials(categoryId) {
    console.log(`[SKLAD-AJAX] Загрузка материалов для категории ID: ${categoryId}`);
    
    if (activeRequestController) {
        console.log('[SKLAD-AJAX] Отмена предыдущего запроса');
        activeRequestController.abort();
    }
    
    activeRequestController = new AbortController();
    
    let url = '/sklad/api/category/all/';
    if (categoryId) {
        url = `/sklad/api/category/${categoryId}/`;
    }
    
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
            loadCategoriesForForm();
        } else {
            throw new Error(data.error || 'Неизвестная ошибка сервера');
        }
    })
    .catch(error => {
        if (error.name === 'AbortError') {
            console.log('[SKLAD-AJAX] Запрос отменен');
            return;
        }
        
        console.error('[SKLAD-AJAX] Ошибка загрузки материалов:', error);
    })
    .finally(() => {
        activeRequestController = null;
    });
}

/**
 * Загружает список категорий для формы добавления материала
 */
function loadCategoriesForForm() {
    console.log('[SKLAD-AJAX] Загрузка категорий для формы');
    
    fetch('/sklad/api/categories/for-form/', {
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
        }
    })
    .catch(error => {
        console.error('[SKLAD-AJAX] Ошибка загрузки категорий для формы:', error);
    });
}

/**
 * Обновляет выпадающий список категорий в форме
 */
function updateCategorySelect(categories) {
    const categorySelect = document.getElementById('material-category');
    if (!categorySelect) return;
    
    // Сохраняем текущее значение
    const currentValue = categorySelect.value;
    
    // Обновляем список
    categorySelect.innerHTML = '<option value="">-- Выберите категорию --</option>';
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
    });
    
    // Восстанавливаем значение
    categorySelect.value = currentValue;
    
    // Если есть текущая категория и она не выбрана, выбираем её
    if (currentCategoryId && !categorySelect.value) {
        categorySelect.value = currentCategoryId;
    }
}

// ================== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ==================

/**
 * Обновляет содержимое правой колонки полностью
 */
function updateMaterialsContent(data) {
    console.log('[SKLAD-AJAX] Обновление содержимого правой колонки');
    
    const rightColumn = document.querySelector('.right-column');
    if (!rightColumn) {
        console.error('[SKLAD-AJAX] Правая колонка не найдена');
        return;
    }
    
    rightColumn.innerHTML = data.html;
    initializeMaterialEventHandlers();
    console.log('[SKLAD-AJAX] Правая колонка обновлена');
}

// ================== ОБРАБОТЧИКИ СОБЫТИЙ ==================

/**
 * Инициализирует обработчики событий для материалов
 */
function initializeMaterialEventHandlers() {
    console.log('[SKLAD-AJAX] Инициализация обработчиков событий для материалов');
    
    // 1. Обработчики для inline-редактирования
    document.querySelectorAll('[data-editable="true"]').forEach(element => {
        element.addEventListener('dblclick', function() {
            if (typeof window.sklad?.startInlineEdit === 'function') {
                window.sklad.startInlineEdit(this);
            }
        });
    });
    
    // 2. Обработчики для кнопок удаления
    document.querySelectorAll('.btn-delete').forEach(button => {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            const materialId = this.getAttribute('data-material-id');
            const materialName = this.getAttribute('data-material-name');
            
            if (materialId && materialName) {
                if (typeof window.sklad?.deleteMaterial === 'function') {
                    window.sklad.deleteMaterial(event, this);
                }
            }
        });
    });
    
    // 3. Обработчик для кнопки добавления материала
    const addMaterialBtn = document.getElementById('add-material-btn');
    if (addMaterialBtn) {
        // Удаляем старые обработчики
        addMaterialBtn.removeEventListener('click', handleAddMaterialClick);
        // Добавляем новый обработчик
        addMaterialBtn.addEventListener('click', handleAddMaterialClick);
    }
    
    // 4. Обработчик для кнопки сброса фильтра
    const resetFilterBtn = document.querySelector('.btn-reset-filter');
    if (resetFilterBtn) {
        resetFilterBtn.addEventListener('click', function(event) {
            event.preventDefault();
            resetCategoryFilter(); // Вызываем локальную функцию
        });
    }
    
    console.log('[SKLAD-AJAX] Обработчики событий для материалов инициализированы');
}

/**
 * Обработчик клика по кнопке добавления материала
 */
function handleAddMaterialClick(event) {
    console.log('[SKLAD-AJAX] Клик по кнопке добавления материала');
    
    // Останавливаем всплытие события
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
    
    if (formSection.style.display === 'none' || !formSection.style.display) {
        // Показываем форму
        formSection.style.display = 'block';
        toggleButton.textContent = 'Скрыть форму';
        toggleButton.classList.add('active');
        
        // Прокручиваем к форме
        formSection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
        
        // Устанавливаем фокус на поле ввода
        setTimeout(() => {
            const nameInput = document.getElementById('material-name');
            if (nameInput) {
                nameInput.focus();
            }
        }, 300);
    } else {
        // Скрываем форму
        formSection.style.display = 'none';
        toggleButton.textContent = '+ Добавить';
        toggleButton.classList.remove('active');
    }
}

/**
 * Создает форму материала если её нет
 */
function createMaterialForm() {
    console.log('[SKLAD-AJAX] Создание формы материала');
    
    const rightColumn = document.querySelector('.right-column');
    if (!rightColumn) return;
    
    // Создаем HTML для формы
    const formHTML = `
    <div class="form-section" id="material-form-section" style="display: block;">
        <h3>Добавить новый материал</h3>
        <form method="post" action="/sklad/material/create/" id="material-form">
            <input type="hidden" name="csrfmiddlewaretoken" value="${getCsrfToken()}">
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
                <button type="button" class="btn-clear" onclick="skladAJAX.clearMaterialForm()">Очистить форму</button>
            </div>
        </form>
    </div>
    `;
    
    // Находим место для вставки формы
    const sectionHeader = rightColumn.querySelector('.section-header');
    const materialsTable = rightColumn.querySelector('.materials-table');
    
    if (sectionHeader && materialsTable) {
        // Вставляем форму между заголовком и таблицей
        sectionHeader.insertAdjacentHTML('afterend', formHTML);
    } else if (sectionHeader) {
        // Вставляем после заголовка
        sectionHeader.insertAdjacentHTML('afterend', formHTML);
    } else {
        // Вставляем в начало колонки
        rightColumn.insertAdjacentHTML('afterbegin', formHTML);
    }
    
    // Загружаем категории для формы
    loadCategoriesForForm();
    
    // Обновляем текст кнопки
    const addMaterialBtn = document.getElementById('add-material-btn');
    if (addMaterialBtn) {
        addMaterialBtn.textContent = 'Скрыть форму';
        addMaterialBtn.classList.add('active');
    }
}

/**
 * Очищает форму материала
 */
function clearMaterialForm() {
    console.log('[SKLAD-AJAX] Очистка формы материала');
    
    const form = document.getElementById('material-form');
    if (form) {
        form.reset();
        
        const unitInput = document.getElementById('material-unit');
        if (unitInput) {
            unitInput.value = 'лист';
        }
        
        const nameInput = document.getElementById('material-name');
        if (nameInput) {
            nameInput.focus();
        }
        
        console.log('[SKLAD-AJAX] Форма материала очищена');
    }
}

// ================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==================

/**
 * Экранирует HTML-символы в строке
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Получает CSRF токен
 */
function getCsrfToken() {
    const csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]');
    if (csrfInput) {
        return csrfInput.value;
    }
    
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    if (csrfMeta) {
        return csrfMeta.content;
    }
    
    console.warn('[SKLAD-AJAX] CSRF токен не найден');
    return '';
}

// ================== ИНИЦИАЛИЗАЦИЯ ==================

/**
 * Инициализирует AJAX-функциональность приложения
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
        }
        
        console.log('[SKLAD-AJAX] AJAX-функциональность инициализирована');
        
    } catch (error) {
        console.error('[SKLAD-AJAX] Ошибка инициализации AJAX:', error);
    }
}

/**
 * Обрабатывает изменение истории браузера
 */
function setupHistoryHandlers() {
    window.addEventListener('popstate', function(event) {
        console.log('[SKLAD-AJAX] Событие popstate:', event.state);
        
        const urlParams = new URLSearchParams(window.location.search);
        const categoryId = urlParams.get('category_id');
        currentCategoryId = categoryId;
        
        loadCategoryMaterials(categoryId);
        
        if (typeof window.sklad?.highlightSelectedCategory === 'function') {
            window.sklad.highlightSelectedCategory(categoryId);
        }
    });
}

// ================== ГЛОБАЛЬНЫЙ ЭКСПОРТ ФУНКЦИЙ ==================

window.skladAJAX = {
    loadCategoryMaterials,
    loadCategoriesForForm,
    resetCategoryFilter,
    updateUrlWithCategoryFilter,
    updateUrlWithoutCategoryFilter,
    initializeSkladAJAX,
    handleAddMaterialClick,
    clearMaterialForm,
    escapeHtml,
    getCsrfToken
};

// ================== ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ HTML ==================

/**
 * Глобальная функция для сброса фильтра категории
 * Используется в onclick атрибутах HTML
 */
window.resetCategoryFilter = function() {
    console.log('[SKLAD-AJAX] Вызвана глобальная функция resetCategoryFilter');
    if (window.skladAJAX && typeof window.skladAJAX.resetCategoryFilter === 'function') {
        window.skladAJAX.resetCategoryFilter();
    } else {
        // Фолбэк на прямую перезагрузку страницы
        window.location.href = '/sklad/';
    }
};

// ================== ЗАПУСК ИНИЦИАЛИЗАЦИИ ==================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSkladAJAX);
} else {
    initializeSkladAJAX();
}