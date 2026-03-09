/*
calculator/static/calculator/js/sections/list_proschet.js
ОБНОВЛЕНО: Исправлены гонки запросов и управление состоянием при переключении просчётов
ДОБАВЛЕНО: Правильное управление обработчиком изменения тиража
ДОБАВЛЕНО: Синхронизация состояний между секциями
ДОБАВЛЕНО: Сброс секции "Дополнительные работы" при выборе нового просчёта (т.к. теперь работы привязаны к компонентам, а не к просчёту)
УДАЛЕНО: Обновление секции "Дополнительные работы" при выборе просчёта (теперь она обновляется только при выборе компонента)

ИСПРАВЛЕНИЯ:
1. Исправлена гонка запросов при быстром переключении просчётов
2. Добавлена правильная последовательность сброса состояний
3. Исправлено управление обработчиком изменения тиража
4. Добавлена проверка актуальности запросов на каждом этапе
5. Улучшена синхронизация между секциями "Список просчётов", "Изделие", "Печатные компоненты" и "Дополнительные работы"
6. При выборе просчёта секция "Дополнительные работы" теперь сбрасывается в состояние "компонент не выбран"
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====

// Контроллер для отмены запросов - для управления асинхронными операциями
let listProschetCurrentRequestController = null;

// ID последнего запрошенного просчёта - для проверки актуальности данных
let listProschetLastRequestedId = null;

// ID выбранного просчёта - для хранения текущего состояния
let listProschetSelectedProschetId = null;

// URL для API запросов
const listProschetApiUrls = {
    create: '/calculator/create-proschet/',
};

// Переменные для управления поиском
let listProschetCurrentSearchQuery = '';
let listProschetSearchTimeout = null;

// Флаг блокировки для предотвращения одновременного выбора просчётов
let listProschetSelectionInProgress = false;

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Список просчётов" загружена и инициализирована');
    
    // Настраиваем обработчики событий для всей секции
    setupListProschetEventListeners();
    
    // Обновляем счетчик просчётов
    updateListProschetCount();
    
    // Инициализируем контейнер со скроллом
    initListProschetScrollContainer();
    
    // Сбрасываем контроллер при инициализации
    resetListProschetRequestController();
    
    console.log('✅ Инициализация секции "Список просчётов" завершена');
});

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====

function setupListProschetEventListeners() {
    console.log('🔧 Настраиваем обработчики событий для списка просчётов...');
    
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
    
    // Поле поиска для фильтрации просчётов
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
    
    // Кнопка очистки поиска
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
    if (!tableBody) {
        console.warn('❌ Тело таблицы просчётов не найдено');
        return;
    }
    
    // Обработчик клика по строке таблицы
    tableBody.addEventListener('click', function(event) {
        const row = event.target.closest('.proschet-row');
        if (!row) return;
        
        const proschetId = row.dataset.proschetId;
        
        // Проверяем, не кликаем ли мы на уже выбранную строку
        if (row.classList.contains('selected') && proschetId === listProschetSelectedProschetId) {
            console.log(`ℹ️ Просчёт ID: ${proschetId} уже выбран, пропускаем`);
            return;
        }
        
        console.log(`🔄 Выбор просчёта с ID: ${proschetId}`);
        
        selectListProschetRow(row, proschetId);
    });
}

// ===== 4. ФУНКЦИИ ДЛЯ ПОИСКА =====

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
    console.log(`🔍 Выполнение поиска по запросу: "${searchQuery}"`);
    
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
    
    // Обновляем скролл-контейнер
    initListProschetScrollContainer();
    
    console.log(`✅ Найдено просчётов: ${visibleRowsCount}`);
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
    console.log('🧹 Очистка поиска');
    
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
    
    console.log('📜 Инициализация контейнера со скроллом');
    
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

// ===== 6. ОСНОВНАЯ ФУНКЦИЯ ВЫБОРА ПРОСЧЁТА - ПОЛНОСТЬЮ ПЕРЕРАБОТАНА =====

function selectListProschetRow(rowElement, proschetId) {
    console.log(`🔄 Начинаем выбор просчёта ID: ${proschetId}`);
    
    // Проверяем, не идет ли уже процесс выбора
    if (listProschetSelectionInProgress) {
        console.warn('⚠️ Выбор просчёта уже выполняется, пропускаем');
        return;
    }
    
    // Устанавливаем флаг блокировки
    listProschetSelectionInProgress = true;
    
    // ВАЖНО: Первым делом сбрасываем обработчик изменения тиража для предыдущего просчёта
    resetCirculationHandlerForPreviousProschet();
    
    // ===== НОВОЕ: Сбрасываем секцию "Дополнительные работы" =====
    // Поскольку дополнительные работы теперь привязаны к печатным компонентам,
    // при смене просчёта мы должны вернуть секцию в состояние "компонент не выбран"
    if (window.additionalWorksSection && typeof window.additionalWorksSection.reset === 'function') {
        window.additionalWorksSection.reset();
        console.log('🔄 Секция "Дополнительные работы" сброшена (компонент не выбран)');
    } else {
        console.warn('⚠️ Секция "Дополнительные работы" не найдена или не инициализирована');
    }
    
    // Отменяем предыдущие запросы, если они есть
    if (listProschetCurrentRequestController) {
        listProschetCurrentRequestController.abort();
        console.log(`🛑 Отменён предыдущий запрос для просчёта ${listProschetLastRequestedId}`);
    }
    
    // Сохраняем ID текущего запроса
    listProschetLastRequestedId = proschetId;
    
    // Создаём новый AbortController для текущего запроса
    listProschetCurrentRequestController = new AbortController();
    const signal = listProschetCurrentRequestController.signal;
    
    try {
        // 1. Снимаем выделение со всех строк
        const allRows = document.querySelectorAll('.proschet-row');
        allRows.forEach(row => {
            row.classList.remove('selected');
        });
        
        // 2. Выделяем выбранную строку
        rowElement.classList.add('selected');
        listProschetSelectedProschetId = proschetId;
        
        console.log(`✅ Просчёт ID: ${listProschetSelectedProschetId} выбран в таблице`);
        
        // 3. Обновляем секцию "Клиент" с данными выбранного просчёта
        updateClientSectionForProschet(proschetId, signal);
        
        // 4. Обновляем название просчёта в секции "Изделие"
        updateProductSectionProschetTitle(rowElement);
        
        // 5. Обновляем секцию "Печатные компоненты" для выбранного просчёта
        updatePrintComponentsSectionForProschet(proschetId, rowElement, signal);
        
        // 6. Секцию "Дополнительные работы" НЕ обновляем здесь, т.к. она теперь зависит от выбора компонента,
        //    и мы уже сбросили её выше.
        
        // 7. Обновляем секцию "Цена"
        if (window.priceSection && typeof window.priceSection.updateForProschet === 'function') {
            window.priceSection.updateForProschet(proschetId, rowElement, signal);
        } else {
            console.warn('⚠️ Секция "Цена" не загружена или не имеет функции updateForProschet');
        }
        
        console.log(`✅ Все секции инициализированы для просчёта ID: ${proschetId}`);
        
    } catch (error) {
        console.error(`❌ Ошибка при выборе просчёта ID: ${proschetId}:`, error);
        
        // В случае ошибки снимаем выделение
        rowElement.classList.remove('selected');
        listProschetSelectedProschetId = null;
        
        // Показываем уведомление об ошибке
        showListProschetNotification('Ошибка при выборе просчёта', 'error');
    } finally {
        // Снимаем флаг блокировки независимо от результата
        listProschetSelectionInProgress = false;
    }
}

// ===== НОВАЯ ФУНКЦИЯ: СБРОС ОБРАБОТЧИКА ТИРАЖА ДЛЯ ПРЕДЫДУЩЕГО ПРОСЧЁТА =====

/**
 * Сбрасывает обработчик изменения тиража для предыдущего выбранного просчёта
 * Это критически важно для предотвращения гонок между просчётами
 */
function resetCirculationHandlerForPreviousProschet() {
    console.log('🔄 Сброс обработчика тиража для предыдущего просчёта');
    
    // Если был выбран предыдущий просчёт, сбрасываем его обработчик тиража
    if (listProschetSelectedProschetId && window.circulationChangeHandler) {
        console.log(`🗑️ Сброс обработчика тиража для предыдущего просчёта ID: ${listProschetSelectedProschetId}`);
        
        // Сбрасываем обработчик изменения тиража
        if (window.circulationChangeHandler.reset) {
            window.circulationChangeHandler.reset();
        }
        
        // Также сбрасываем глобальные переменные обработчика
        if (window.circulationChangeHandlerInitialized !== undefined) {
            window.circulationChangeHandlerInitialized = false;
        }
        
        if (window.currentProschetIdForCirculation !== undefined) {
            window.currentProschetIdForCirculation = null;
        }
        
        if (window.lastKnownCirculation !== undefined) {
            window.lastKnownCirculation = null;
        }
    }
}

// ===== 7. ФУНКЦИИ ОБНОВЛЕНИЯ СЕКЦИЙ С ПРОВЕРКОЙ АКТУАЛЬНОСТИ =====

/**
 * Обновление секции "Печатные компоненты" с проверкой актуальности
 */
function updatePrintComponentsSectionForProschet(proschetId, rowElement, signal) {
    console.log(`🔄 Обновление секции "Печатные компоненты" для просчёта ID: ${proschetId}`);
    
    // Проверяем, актуален ли запрос
    if (signal.aborted) {
        console.log(`ℹ️ Запрос для просчёта ${proschetId} был отменён, пропускаем обновление печатных компонентов`);
        return;
    }
    
    // Проверяем, что это всё ещё тот же просчёт, который мы хотим обновить
    if (proschetId !== listProschetSelectedProschetId) {
        console.warn(`⚠️ Пропускаем обновление печатных компонентов: запрос для просчёта ${proschetId}, но выбран просчёт ${listProschetSelectedProschetId}`);
        return;
    }
    
    // Проверяем, существует ли объект секции "Печатные компоненты"
    if (window.printComponentsSection && typeof window.printComponentsSection.updateForProschet === 'function') {
        // Передаём signal в секцию для возможности отмены
        window.printComponentsSection.updateForProschet(proschetId, rowElement, signal);
    } else {
        console.warn('❌ Секция "Печатные компоненты" не найдена или не инициализирована');
    }
}

// ===== 8. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ ЗАПРОСАМИ =====

/**
 * Сбрасывает контроллер запросов при перезагрузке страницы или завершении операций
 */
function resetListProschetRequestController() {
    console.log('🔄 Сброс контроллера запросов');
    
    if (listProschetCurrentRequestController) {
        listProschetCurrentRequestController.abort();
        listProschetCurrentRequestController = null;
    }
    
    listProschetLastRequestedId = null;
    listProschetSelectionInProgress = false;
}

/**
 * Отменяет текущий запрос
 * @returns {boolean} true если запрос был отменён, false если не было активного запроса
 */
function abortCurrentListProschetRequest() {
    if (listProschetCurrentRequestController) {
        listProschetCurrentRequestController.abort();
        listProschetCurrentRequestController = null;
        listProschetLastRequestedId = null;
        console.log('✅ Текущий запрос отменён');
        return true;
    }
    return false;
}

// ===== 9. ФУНКЦИИ ДЛЯ ФОРМЫ СОЗДАНИЯ ПРОСЧЁТА =====

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
    
    console.log('📤 Отправка формы создания просчёта');
    
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
        console.error('❌ Ошибка при создании просчёта:', error);
        showListProschetNotification('Ошибка сети или сервера', 'error');
    })
    .finally(() => {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    });
}

// ===== 10. ФУНКЦИИ ДЛЯ РАБОТЫ С ДАННЫМИ =====

function addListProschetProschetToTable(proschetData) {
    const tableBody = document.getElementById('proschet-table-body');
    if (!tableBody) return;
    
    console.log('📋 Добавление нового просчёта в таблицу:', proschetData);
    
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

// ===== 11. ФУНКЦИЯ ОБНОВЛЕНИЯ НАЗВАНИЯ ПРОСЧЁТА В СЕКЦИИ "ИЗДЕЛИЕ" =====

/**
 * Функция обновляет заголовок секции "Изделие" с названием выбранного просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
 */
function updateProductSectionProschetTitle(rowElement) {
    console.log('🔄 Обновление названия просчёта в секции "Изделие"');
    
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
    
    // Обновление данных в секции "Изделие" (включая тираж)
    const proschetId = rowElement.dataset.proschetId;
    if (proschetId) {
        // Используем текущий контроллер запроса для этой операции
        if (listProschetCurrentRequestController) {
            updateProductSectionData(proschetId, listProschetCurrentRequestController.signal);
        } else {
            updateProductSectionData(proschetId);
        }
    }
}

// ===== ОБНОВЛЁННАЯ ФУНКЦИЯ: Обновляет данные в секции "Изделие" с поддержкой отмены =====

/**
 * Обновляет данные в секции "Изделие"
 * @param {number} proschetId - ID просчёта
 * @param {AbortSignal} signal - Сигнал для отмены запроса (опционально)
 */
function updateProductSectionData(proschetId, signal) {
    console.log(`🔄 Обновление данных секции "Изделие" для просчёта ID: ${proschetId}`);
    
    // Проверяем, что запрос всё ещё актуален
    if (signal && signal.aborted) {
        console.log(`ℹ️ Запрос для просчёта ${proschetId} был отменён, пропускаем обновление секции "Изделие"`);
        return;
    }
    
    // Проверяем, что это всё ещё тот же просчёт, который мы хотим обновить
    if (proschetId !== listProschetSelectedProschetId) {
        console.warn(`⚠️ Пропускаем обновление секции "Изделие": запрос для просчёта ${proschetId}, но выбран просчёт ${listProschetSelectedProschetId}`);
        return;
    }
    
    // Используем существующий эндпоинт для получения данных просчёта
    fetch(`/calculator/get-proschet/${proschetId}/`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getListProschetCsrfToken()
        },
        signal: signal // Передаём signal для возможности отмены
    })
    .then(response => {
        // Проверяем, не был ли запрос отменён
        if (signal && signal.aborted) {
            console.log(`ℹ️ Запрос для просчёта ${proschetId} был отменён во время выполнения`);
            throw new Error('Request was aborted');
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ошибка! статус: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        // Дополнительная проверка: запрос всё еще актуален?
        if (proschetId !== listProschetSelectedProschetId) {
            console.warn(`⚠️ Получены данные для старого просчёта ${proschetId}, игнорируем (теперь выбран ${listProschetSelectedProschetId})`);
            return;
        }
        
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
        // Не выводим ошибку, если запрос был отменён
        if (error.name === 'AbortError') {
            console.log(`ℹ️ Запрос для просчёта ${proschetId} был отменён`);
            return;
        }
        console.error('❌ Ошибка сети при получении данных просчёта для секции "Изделие":', error);
    });
}

// ===== 12. ФУНКЦИИ ДЛЯ СЕКЦИИ "КЛИЕНТ" =====

function updateClientSectionForProschet(proschetId, signal) {
    console.log(`📡 Запрос данных просчёта ID: ${proschetId} для секции "Клиент"`);
    
    // Проверяем, актуален ли запрос
    if (signal.aborted) {
        console.log(`ℹ️ Запрос для просчёта ${proschetId} был отменён, пропускаем обновление секции "Клиент"`);
        return;
    }
    
    // Проверяем, что это всё ещё тот же просчёт, который мы хотим обновить
    if (proschetId !== listProschetSelectedProschetId) {
        console.warn(`⚠️ Пропускаем обновление секции "Клиент": запрос для просчёта ${proschetId}, но выбран просчёт ${listProschetSelectedProschetId}`);
        return;
    }
    
    // Отправляем запрос на сервер для получения данных просчёта
    fetch(`/calculator/get-proschet/${proschetId}/`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getListProschetCsrfToken()
        },
        signal: signal // Передаём signal для возможности отмены
    })
    .then(response => {
        // Проверяем, не был ли запрос отменён
        if (signal.aborted) {
            console.log(`ℹ️ Запрос для просчёта ${proschetId} был отменён во время выполнения`);
            throw new Error('Request was aborted');
        }
        
        if (!response.ok) {
            throw new Error(`HTTP ошибка! статус: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        // Дополнительная проверка: запрос всё еще актуален?
        if (proschetId !== listProschetSelectedProschetId) {
            console.warn(`⚠️ Получены данные для старого просчёта ${proschetId}, игнорируем (теперь выбран ${listProschetSelectedProschetId})`);
            return;
        }
        
        if (data.success) {
            // Обновляем интерфейс секции "Клиент"
            updateClientInterface(data.proschet);
        } else {
            console.error('❌ Ошибка при получении данных просчёта:', data.message);
        }
    })
    .catch(error => {
        // Не выводим ошибку, если запрос был отменён
        if (error.name === 'AbortError') {
            console.log(`ℹ️ Запрос для просчёта ${proschetId} был отменён`);
            return;
        }
        console.error('❌ Ошибка сети при получении данных просчёта для секции "Клиент":', error);
    });
}

function updateClientInterface(proschetData) {
    console.log('🔄 Обновление интерфейса секции "Клиент"', proschetData);
    
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
    console.log('🔄 Обновление отображения данных клиента:', clientData);
    
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
    console.log('📋 Показ формы выбора клиента');
    
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
    console.log('📥 Загрузка клиентов для формы создания...');
    
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
        console.error('❌ Ошибка при загрузке клиентов:', error);
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
    
    console.log(`✅ Загружено ${clients.length} клиентов`);
}

// ===== 13. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

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
    
    console.warn('⚠️ CSRF-токен не найден');
    return '';
}

function showListProschetNotification(message, type) {
    console.log(`💬 Уведомление [${type}]: ${message}`);
    
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
    console.log('❌ Показ ошибок формы:', errors);
    
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

// ===== 14. ЭКСПОРТ ФУНКЦИЙ =====

window.listProschetSection = {
    getSelectedId: () => listProschetSelectedProschetId,
    updateCount: updateListProschetCount,
    addToTable: addListProschetProschetToTable,
    showNotification: showListProschetNotification,
    clearSearch: clearListProschetSearch,
    initScroll: initListProschetScrollContainer,
    updatePrintComponents: updatePrintComponentsSectionForProschet,
    getCsrfToken: getListProschetCsrfToken,
    updateProductSectionTitle: updateProductSectionProschetTitle,
    resetRequestController: resetListProschetRequestController,
    abortCurrentRequest: abortCurrentListProschetRequest,
    // НОВАЯ ФУНКЦИЯ: Сброс обработчика тиража
    resetCirculationHandler: resetCirculationHandlerForPreviousProschet,
    // НОВАЯ ФУНКЦИЯ: Получение статуса выбора
    isSelectionInProgress: () => listProschetSelectionInProgress
};

// ===== 15. ОБРАБОТКА ПЕРЕЗАГРУЗКИ СТРАНИЦЫ =====

window.addEventListener('beforeunload', function() {
    console.log('🔄 Очистка перед перезагрузкой страницы');
    resetListProschetRequestController();
});

console.log('✅ Основной файл секции "Список просчётов" загружен с исправлениями для предотвращения гонок запросов');