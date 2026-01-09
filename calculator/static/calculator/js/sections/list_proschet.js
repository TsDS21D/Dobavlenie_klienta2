/*
calculator/static/calculator/js/sections/list_proschet.js
ОБНОВЛЕНО: Добавлен функционал поиска и скролла для таблицы просчётов
ДОБАВЛЕНО: Функция обновления названия просчёта в секции "Изделие"

ИЗМЕНЕНИЯ:
1. Добавлена функция фильтрации просчётов по поисковому запросу
2. Добавлена обработка поля поиска и кнопки очистки
3. Обновлено отображение сообщений при поиске
4. Добавлена логика для контейнера со скроллом
5. Добавлена функция updateProductSectionProschetTitle для обновления заголовка в секции "Изделие"
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====

// Уникальные переменные для секции списка просчётов
let listProschetSelectedProschetId = null; // ID выбранного просчёта (уникальное имя)

// URL для API запросов (уникальное имя)
const listProschetApiUrls = {
    create: '/calculator/create-proschet/',
};

// Переменные для управления поиском (уникальные имена)
let listProschetCurrentSearchQuery = ''; // Текущий поисковый запрос
let listProschetSearchTimeout = null; // Таймер для отложенного поиска

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Список просчётов" загружена');
    
    // Настраиваем обработчики событий для всей секции
    setupListProschetEventListeners();
    
    // Обновляем счетчик просчётов
    updateListProschetCount();
    
    // Инициализируем контейнер со скроллом
    initListProschetScrollContainer();
});

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====

function setupListProschetEventListeners() {
    console.log('Настраиваем обработчики событий для списка просчётов...');
    
    // Кнопка создания просчёта
    const createBtn = document.getElementById('create-proschet-btn');
    if (createBtn) {
        createBtn.addEventListener('click', function() {
            toggleListProschetCreateForm(true);
        });
    }
    
    // Кнопка отмены создания
    const cancelBtn = document.getElementById('cancel-create-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            toggleListProschetCreateForm(false);
            resetListProschetCreateForm();
        });
    }
    
    // Форма создания
    const createForm = document.getElementById('create-proschet-form');
    if (createForm) {
        createForm.addEventListener('submit', handleListProschetCreateFormSubmit);
    }
    
    // НОВЫЙ ОБРАБОТЧИК: Поле поиска
    const searchInput = document.getElementById('list-proschet-search-input');
    if (searchInput) {
        // Поиск при вводе текста (с задержкой для производительности)
        searchInput.addEventListener('input', handleListProschetSearchInput);
        
        // Очистка поиска при нажатии Esc
        searchInput.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                clearListProschetSearch();
            }
        });
    }
    
    // НОВЫЙ ОБРАБОТЧИК: Кнопка очистки поиска
    const searchClearBtn = document.getElementById('list-proschet-search-clear');
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', clearListProschetSearch);
    }
    
    // Обработчики кликов по строкам таблицы
    setupListProschetRowClickListeners();
    
    console.log('✅ Обработчики событий для списка просчётов настроены');
}

function setupListProschetRowClickListeners() {
    const tableBody = document.getElementById('proschet-table-body');
    if (!tableBody) return;
    
    // Обработчик клика по строке таблицы
    tableBody.addEventListener('click', function(event) {
        const row = event.target.closest('.proschet-row');
        if (!row) return;
        
        const proschetId = row.dataset.proschetId;
        console.log(`Выбор просчёта с ID: ${proschetId}`);
        
        selectListProschetRow(row, proschetId);
    });
}



/**
 * Инициализирует обработчик изменения тиража для выбранного просчёта.
 * @param {number} proschetId - ID просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы
 */
function initCirculationChangeHandlerForSelectedProschet(proschetId, rowElement) {
    console.log(`🔄 Инициализация обработчика тиража для выбранного просчёта ${proschetId}`);
    
    // Находим элемент отображения тиража
    const circulationElement = document.getElementById('product-circulation-display');
    
    if (!circulationElement) {
        console.warn('⚠️ Элемент отображения тиража не найден');
        return;
    }
    
    // Извлекаем текущий тираж
    const circulationText = circulationElement.textContent.trim();
    const initialCirculation = extractCirculationFromText(circulationText);
    
    if (!initialCirculation) {
        console.warn(`⚠️ Не удалось определить тираж: "${circulationText}"`);
        return;
    }
    
    // Инициализируем обработчик
    if (window.circulationChangeHandler && window.circulationChangeHandler.init) {
        window.circulationChangeHandler.init(proschetId, initialCirculation);
    }
}



// ===== 4. НОВЫЕ ФУНКЦИИ ДЛЯ ПОИСКА =====

function handleListProschetSearchInput(event) {
    // Получаем значение из поля поиска и очищаем от лишних пробелов
    const searchValue = event.target.value.trim().toLowerCase();
    
    // Обновляем текущий поисковый запрос
    listProschetCurrentSearchQuery = searchValue;
    
    // Показываем/скрываем кнопку очистки
    updateListProschetSearchClearButton();
    
    // Очищаем предыдущий таймер (если был)
    if (listProschetSearchTimeout) {
        clearTimeout(listProschetSearchTimeout);
    }
    
    // Устанавливаем новый таймер для отложенного поиска (300мс)
    // Это улучшает производительность при быстром вводе
    listProschetSearchTimeout = setTimeout(function() {
        performListProschetSearch(searchValue);
    }, 300);
}

function performListProschetSearch(searchQuery) {
    console.log(`Выполнение поиска по запросу: "${searchQuery}"`);
    
    const tableBody = document.getElementById('proschet-table-body');
    if (!tableBody) return;
    
    // Получаем все строки таблицы
    const rows = tableBody.querySelectorAll('.proschet-row');
    let visibleRowsCount = 0; // Счетчик видимых строк
    
    // Если поисковый запрос пустой, показываем все строки
    if (!searchQuery) {
        rows.forEach(row => {
            row.style.display = ''; // Показываем строку
            visibleRowsCount++;
        });
    } else {
        // Если есть поисковый запрос, фильтруем строки
        rows.forEach(row => {
            // Получаем текст для поиска из data-атрибута
            const searchText = row.dataset.searchText || '';
            
            // Проверяем содержит ли текст поисковый запрос
            if (searchText.includes(searchQuery)) {
                row.style.display = ''; // Показываем строку
                visibleRowsCount++;
            } else {
                row.style.display = 'none'; // Скрываем строку
            }
        });
    }
    
    // Обновляем видимость сообщений в зависимости от результатов поиска
    updateListProschetMessagesVisibility(visibleRowsCount, searchQuery);
    
    // Обновляем счетчик просчётов
    updateListProschetCount();
    
    console.log(`Найдено просчётов: ${visibleRowsCount}`);
}

function updateListProschetSearchClearButton() {
    const searchClearBtn = document.getElementById('list-proschet-search-clear');
    if (!searchClearBtn) return;
    
    // Показываем кнопку очистки только если есть текст в поле поиска
    if (listProschetCurrentSearchQuery) {
        searchClearBtn.style.display = 'block';
    } else {
        searchClearBtn.style.display = 'none';
    }
}

function clearListProschetSearch() {
    console.log('Очистка поиска');
    
    const searchInput = document.getElementById('list-proschet-search-input');
    if (searchInput) {
        searchInput.value = ''; // Очищаем поле ввода
        listProschetCurrentSearchQuery = ''; // Сбрасываем запрос
        performListProschetSearch(''); // Выполняем поиск (показываем все строки)
        updateListProschetSearchClearButton(); // Обновляем кнопку очистки
        searchInput.focus(); // Возвращаем фокус в поле поиска
    }
}

function updateListProschetMessagesVisibility(visibleRowsCount, searchQuery) {
    // Получаем элементы сообщений
    const noProschetsMsg = document.getElementById('no-proschets-message');
    const noResultsMsg = document.getElementById('list-proschet-no-results-message');
    const table = document.getElementById('proschet-table');
    const searchContainer = document.getElementById('list-proschet-search-container');
    
    // Получаем общее количество строк (включая скрытые)
    const tableBody = document.getElementById('proschet-table-body');
    const totalRows = tableBody ? tableBody.querySelectorAll('.proschet-row').length : 0;
    
    // Определяем логику отображения сообщений
    if (totalRows === 0) {
        // Случай 1: Нет просчётов вообще
        if (noProschetsMsg) noProschetsMsg.style.display = 'block';
        if (noResultsMsg) noResultsMsg.style.display = 'none';
        if (table) table.style.display = 'none';
        if (searchContainer) searchContainer.style.display = 'none';
    } else if (searchQuery && visibleRowsCount === 0) {
        // Случай 2: Есть поисковый запрос, но ничего не найдено
        if (noProschetsMsg) noProschetsMsg.style.display = 'none';
        if (noResultsMsg) noResultsMsg.style.display = 'block';
        if (table) table.style.display = 'table';
        if (searchContainer) searchContainer.style.display = 'block';
    } else {
        // Случай 3: Есть просчёты (возможно отфильтрованные)
        if (noProschetsMsg) noProschetsMsg.style.display = 'none';
        if (noResultsMsg) noResultsMsg.style.display = 'none';
        if (table) table.style.display = 'table';
        if (searchContainer) searchContainer.style.display = 'block';
    }
}

// ===== 5. ФУНКЦИИ ДЛЯ СКРОЛЛ-КОНТЕЙНЕРА =====

function initListProschetScrollContainer() {
    const scrollContainer = document.getElementById('list-proschet-table-scroll-container');
    if (!scrollContainer) return;
    
    console.log('Инициализация контейнера со скроллом');
    
    // Проверяем, нужен ли скролл (если строк больше 5)
    const tableBody = document.getElementById('proschet-table-body');
    if (!tableBody) return;
    
    const rows = tableBody.querySelectorAll('.proschet-row');
    const visibleRows = Array.from(rows).filter(row => row.style.display !== 'none');
    
    // Примерная высота одной строки (60px) * 5 строк = 300px
    // Если видимых строк больше 5, включаем скролл
    if (visibleRows.length > 5) {
        scrollContainer.classList.add('table-scroll-container');
    } else {
        scrollContainer.classList.remove('table-scroll-container');
    }
}

// ===== 6. ФУНКЦИИ ДЛЯ ВЫДЕЛЕНИЯ СТРОКИ =====

function selectListProschetRow(rowElement, proschetId) {
    console.log(`Выделение строки просчёта ID: ${proschetId}`);
    
    // 1. Снимаем выделение со всех строк
    const allRows = document.querySelectorAll('.proschet-row');
    allRows.forEach(row => {
        row.classList.remove('selected');
    });
    
    // 2. Выделяем выбранную строку
    rowElement.classList.add('selected');
    listProschetSelectedProschetId = proschetId;
    
    console.log(`✅ Просчёт ID: ${listProschetSelectedProschetId} выбран`);
    
    // 3. Обновляем секцию "Клиент" с данными выбранного просчёта
    updateClientSectionForProschet(proschetId);
    
    // 4. НОВОЕ: Обновляем название просчёта в секции "Изделие"
    updateProductSectionProschetTitle(rowElement);
    // 5. НОВОЕ: Обновляем секцию "Печатные компоненты" для выбранного просчёта
    updatePrintComponentsSectionForProschet(proschetId, rowElement);

    // 6. НОВОЕ: Обновляем секцию "Дополнительные работы" для выбранного просчёта
    updateAdditionalWorksSectionForProschet(proschetId, rowElement);


    // ✅ ДОБАВЛЯЕМ: Обновляем секцию "Цена"
    if (window.priceSection && typeof window.priceSection.updateForProschet === 'function') {
        window.priceSection.updateForProschet(proschetId, rowElement);
    } else {
        console.warn('⚠️ Секция "Цена" не загружена');
    }
}


// Добавляем новую функцию для обновления секции "Печатные компоненты":
function updatePrintComponentsSectionForProschet(proschetId, rowElement) {
    console.log(`Обновление секции "Печатные компоненты" для просчёта ID: ${proschetId}`);
    
    // Проверяем, существует ли объект секции "Печатные компоненты"
    if (window.printComponentsSection && typeof window.printComponentsSection.updateForProschet === 'function') {
        window.printComponentsSection.updateForProschet(proschetId, rowElement);
    } else {
        console.warn('❌ Секция "Печатные компоненты" не найдена или не инициализирована');
    }
}


/**
 * Функция обновления секции "Дополнительные работы" для выбранного просчёта
 * @param {number} proschetId - ID просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы
 */
function updateAdditionalWorksSectionForProschet(proschetId, rowElement) {
    console.log(`Обновление секции "Дополнительные работы" для просчёта ID: ${proschetId}`);
    
    // Проверяем, существует ли объект секции "Дополнительные работы"
    if (window.additionalWorksSection && typeof window.additionalWorksSection.updateForProschet === 'function') {
        window.additionalWorksSection.updateForProschet(proschetId, rowElement);
    } else {
        console.warn('❌ Секция "Дополнительные работы" не найдена или не инициализирована');
    }
}


// ===== 7. ФУНКЦИИ ДЛЯ ФОРМЫ СОЗДАНИЯ ПРОСЧЁТА =====

function toggleListProschetCreateForm(show) {
    const formContainer = document.getElementById('create-proschet-form-container');
    const createBtn = document.getElementById('create-proschet-btn');
    
    if (show) {
        formContainer.style.display = 'block';
        createBtn.style.display = 'none';
        // Загружаем список клиентов для формы
        loadClientsForCreateForm();
    } else {
        formContainer.style.display = 'none';
        createBtn.style.display = 'inline-block';
    }
}

function resetListProschetCreateForm() {
    const form = document.getElementById('create-proschet-form');
    if (form) {
        form.reset();
    }
}

function handleListProschetCreateFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    console.log('Отправка формы создания просчёта');
    
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    
    submitBtn.textContent = 'Создание...';
    submitBtn.disabled = true;
    
    fetch(form.action, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getListProschetCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showListProschetNotification(data.message, 'success');
            toggleListProschetCreateForm(false);
            addListProschetProschetToTable(data.proschet);
            resetListProschetCreateForm();
        } else {
            showListProschetFormErrors(form, data.errors);
            showListProschetNotification('Ошибка при создании просчёта', 'error');
        }
    })
    .catch(error => {
        console.error('Ошибка при создании просчёта:', error);
        showListProschetNotification('Ошибка сети или сервера', 'error');
    })
    .finally(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    });
}

// ===== 8. ФУНКЦИИ ДЛЯ РАБОТЫ С ДАННЫМИ =====

function addListProschetProschetToTable(proschetData) {
    const tableBody = document.getElementById('proschet-table-body');
    if (!tableBody) return;
    
    console.log('Добавление нового просчёта в таблицу:', proschetData);
    
    // Создаем новую строку таблицы
    const newRow = document.createElement('tr');
    newRow.className = 'proschet-row';
    newRow.dataset.proschetId = proschetData.id;
    // Создаем строку для поиска из всех текстовых данных
    newRow.dataset.searchText = `${proschetData.number.toLowerCase()} ${proschetData.title.toLowerCase()} ${proschetData.created_at.toLowerCase()}`;
    
    // Заполняем ячейки строки
    newRow.innerHTML = `
        <td class="proschet-number">${proschetData.number}</td>
        <td class="proschet-title editable-cell" 
            data-editable="true"
            data-field="title"
            data-original-value="${proschetData.title}">
            ${proschetData.title}
        </td>
        <td class="proschet-created">${proschetData.created_at}</td>
    `;
    
    // Добавляем новую строку в начало таблицы
    tableBody.insertBefore(newRow, tableBody.firstChild);
    
    // Обновляем счетчик и интерфейс
    updateListProschetCount();
    
    // Показываем таблицу и скрываем сообщения
    const noProschetsMsg = document.getElementById('no-proschets-message');
    const noResultsMsg = document.getElementById('list-proschet-no-results-message');
    const table = document.getElementById('proschet-table');
    const searchContainer = document.getElementById('list-proschet-search-container');
    
    if (noProschetsMsg) noProschetsMsg.style.display = 'none';
    if (noResultsMsg) noResultsMsg.style.display = 'none';
    if (table) table.style.display = 'table';
    if (searchContainer) searchContainer.style.display = 'block';
    
    // Применяем текущий поисковый запрос к новой строке
    if (listProschetCurrentSearchQuery) {
        const searchText = newRow.dataset.searchText || '';
        if (searchText.includes(listProschetCurrentSearchQuery)) {
            newRow.style.display = '';
        } else {
            newRow.style.display = 'none';
        }
        // Обновляем счетчик видимых строк
        updateListProschetCount();
    }
    
    // Инициализируем скролл-контейнер заново
    initListProschetScrollContainer();
}

// ===== 9. НОВАЯ ФУНКЦИЯ: ОБНОВЛЕНИЕ НАЗВАНИЯ ПРОСЧЁТА В СЕКЦИИ "ИЗДЕЛИЕ" =====

/**
 * Функция обновляет заголовок секции "Изделие" с названием выбранного просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
 */
function updateProductSectionProschetTitle(rowElement) {
    // Находим элемент для отображения названия просчёта в секции "Изделие"
    const proschetTitleElement = document.getElementById('product-proschet-title');
    if (!proschetTitleElement) {
        console.warn('❌ Элемент #product-proschet-title не найден в секции "Изделие"');
        return;
    }
    
    // Находим ячейку с названием просчёта в строке таблицы
    const titleCell = rowElement.querySelector('.proschet-title');
    if (!titleCell) {
        console.warn('❌ Ячейка с названием просчёта не найдена в строке таблицы');
        return;
    }
    
    // Получаем название просчёта из ячейки
    const proschetTitle = titleCell.textContent.trim();
    
    // Обновляем содержимое элемента
    proschetTitleElement.innerHTML = `
        <span class="proschet-title-active">
            ${proschetTitle}
        </span>
    `;
    
    console.log(`✅ Название просчёта обновлено в секции "Изделие": "${proschetTitle}"`);
    
    // ДОБАВЛЕНО: Обновление данных в секции "Изделие" (включая тираж)
    const proschetId = rowElement.dataset.proschetId;
    if (proschetId) {
        updateProductSectionData(proschetId);
    }
}

// НОВАЯ ФУНКЦИЯ: Обновляет данные в секции "Изделие"
function updateProductSectionData(proschetId) {
    console.log(`Обновление данных секции "Изделие" для просчёта ID: ${proschetId}`);
    
    // Используем существующий эндпоинт для получения данных просчёта
    fetch(`/calculator/get-proschet/${proschetId}/`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getListProschetCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Обновляем секцию "Изделие" с данными просчёта
            if (window.productSection && window.productSection.updateFromProschet) {
                window.productSection.updateFromProschet(data.proschet);
            }
        } else {
            console.error('❌ Ошибка при получении данных просчёта:', data.message);
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при получении данных просчёта для секции "Изделие":', error);
    });
}

// ===== 10. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

function updateListProschetCount() {
    const tableBody = document.getElementById('proschet-table-body');
    let count = 0;
    
    if (tableBody) {
        // Считаем только видимые строки (не скрытые поиском)
        const rows = tableBody.querySelectorAll('.proschet-row');
        rows.forEach(row => {
            if (row.style.display !== 'none') {
                count++;
            }
        });
    }
    
    // Обновляем бейдж с количеством
    const badge = document.getElementById('proschet-count-badge');
    if (badge) {
        badge.textContent = count;
    }
    
    return count;
}

function getListProschetCsrfToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith(name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }
    
    console.warn('CSRF-токен не найден');
    return '';
}

function showListProschetNotification(message, type) {
    console.log(`Показ уведомления [${type}]: ${message}`);
    
    const notification = document.createElement('div');
    
    let backgroundColor = '#2196F3';
    if (type === 'success') backgroundColor = '#4CAF50';
    if (type === 'error') backgroundColor = '#f44336';
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${backgroundColor};
        color: white;
        border-radius: 4px;
        z-index: 1000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        max-width: 300px;
        word-wrap: break-word;
        font-family: Arial, sans-serif;
        transition: opacity 0.3s;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function showListProschetFormErrors(form, errors) {
    console.log('Показ ошибок формы:', errors);
    
    let errorContainer = form.querySelector('.error-message');
    if (!errorContainer) {
        errorContainer = document.createElement('div');
        errorContainer.className = 'error-message';
        errorContainer.style.cssText = `
            background: #ffebee;
            color: #c62828;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 15px;
            border-left: 4px solid #f44336;
        `;
        form.insertBefore(errorContainer, form.firstChild);
    }
    
    let errorText = 'Пожалуйста, исправьте следующие ошибки:<br>';
    for (const field in errors) {
        if (errors.hasOwnProperty(field)) {
            errorText += `• ${errors[field].join(', ')}<br>`;
        }
    }
    
    errorContainer.innerHTML = errorText;
    errorContainer.style.display = 'block';
}

// ===== 11. ФУНКЦИИ ДЛЯ СЕКЦИИ "КЛИЕНТ" (уже существующие, но с уникальными именами) =====

function updateClientSectionForProschet(proschetId) {
    console.log(`Запрос данных просчёта ID: ${proschetId} для секции "Клиент"`);
    
    // Отправляем запрос на сервер для получения данных просчёта
    fetch(`/calculator/get-proschet/${proschetId}/`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getListProschetCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Обновляем интерфейс секции "Клиент"
            updateClientInterface(data.proschet);
        } else {
            console.error('Ошибка при получении данных просчёта:', data.message);
        }
    })
    .catch(error => {
        console.error('Ошибка сети при получении данных просчёта:', error);
    });
}

function updateClientInterface(proschetData) {
    console.log('Обновление интерфейса секции "Клиент"', proschetData);
    
    // Обновляем бейдж с номером просчёта
    const proschetNumberElement = document.getElementById('current-proschet-number');
    if (proschetNumberElement) {
        proschetNumberElement.textContent = proschetData.number;
    }
    
    const selectedBadge = document.getElementById('selected-proschet-badge');
    if (selectedBadge) {
        selectedBadge.style.display = 'inline-block';
        selectedBadge.dataset.proschetId = proschetData.id;
    }
    
    // Скрываем сообщение "Выберите просчёт"
    const noProschetMsg = document.getElementById('no-proschet-selected');
    if (noProschetMsg) {
        noProschetMsg.style.display = 'none';
    }
    
    // Показываем основной интерфейс
    const clientInterface = document.getElementById('client-selection-interface');
    if (clientInterface) {
        clientInterface.style.display = 'block';
    }
    
    const clientDisplay = document.getElementById('current-client-display');
    if (clientDisplay) {
        clientDisplay.dataset.proschetId = proschetData.id;
    }
    
    // Обновляем данные о клиенте, если он привязан
    if (proschetData.client) {
        updateClientDisplay(proschetData.client);
    } else {
        // Если клиент не привязан, показываем форму выбора
        showClientSelectionForm();
    }
}

function updateClientDisplay(clientData) {
    console.log('Обновление отображения данных клиента:', clientData);
    
    const clientNumberElement = document.getElementById('current-client-number');
    if (clientNumberElement) {
        clientNumberElement.textContent = clientData.client_number || '—';
    }
    
    const clientNameElement = document.getElementById('current-client-name');
    if (clientNameElement) {
        clientNameElement.textContent = clientData.name || '—';
    }
    
    const clientDiscountElement = document.getElementById('current-client-discount');
    if (clientDiscountElement) {
        clientDiscountElement.textContent = clientData.discount ? `${clientData.discount}%` : '0%';
    }
    
    const clientEdoElement = document.getElementById('current-client-edo');
    if (clientEdoElement) {
        clientEdoElement.textContent = clientData.has_edo ? 'Да' : 'Нет';
    }
    
    const currentClientDisplay = document.getElementById('current-client-display');
    const clientSelectionForm = document.getElementById('client-selection-form');
    
    if (currentClientDisplay) currentClientDisplay.style.display = 'block';
    if (clientSelectionForm) clientSelectionForm.style.display = 'none';
    
    const clearClientBtn = document.getElementById('clear-client-btn');
    if (clearClientBtn) clearClientBtn.style.display = 'inline-block';
}

function showClientSelectionForm() {
    console.log('Показ формы выбора клиента');
    
    const currentClientDisplay = document.getElementById('current-client-display');
    const clientSelectionForm = document.getElementById('client-selection-form');
    const selectionActions = document.getElementById('client-selection-actions');
    
    if (currentClientDisplay) currentClientDisplay.style.display = 'none';
    if (clientSelectionForm) clientSelectionForm.style.display = 'block';
    if (selectionActions) selectionActions.style.display = 'block';
    
    const clearClientBtn = document.getElementById('clear-client-btn');
    if (clearClientBtn) clearClientBtn.style.display = 'none';
}

function loadClientsForCreateForm() {
    console.log('Загрузка клиентов для формы создания...');
    
    fetch('/calculator/get-clients/', {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getListProschetCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.clients) {
            populateClientDropdown(data.clients);
        }
    })
    .catch(error => {
        console.error('Ошибка при загрузке клиентов:', error);
    });
}

function populateClientDropdown(clients) {
    const selectElement = document.getElementById('id_client');
    if (!selectElement) return;
    
    // Очищаем существующие опции (кроме первой)
    while (selectElement.options.length > 1) {
        selectElement.remove(1);
    }
    
    // Добавляем клиентов
    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `${client.client_number}: ${client.name}`;
        selectElement.appendChild(option);
    });
    
    console.log(`Загружено ${clients.length} клиентов`);
}

// ===== 12. ЭКСПОРТ ФУНКЦИЙ =====

window.listProschetSection = {
    getSelectedId: () => listProschetSelectedProschetId,
    updateCount: updateListProschetCount,
    addToTable: addListProschetProschetToTable,
    showNotification: showListProschetNotification,
    clearSearch: clearListProschetSearch,
    initScroll: initListProschetScrollContainer,
    // НОВОЕ: Добавляем функцию для обновления секции "Печатные компоненты"
    updatePrintComponents: updatePrintComponentsSectionForProschet
};

console.log('✅ Основной файл секции "Список просчётов" загружен с поиском, скроллом и обновлением секции "Изделие"');