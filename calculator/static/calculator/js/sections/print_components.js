/*

ФАЙЛ: print_components.js
НАЗНАЧЕНИЕ: JavaScript для секции "Печатные компоненты"
ОБНОВЛЕНИЯ:
1. Добавлено управление конкурентными запросами через AbortController
2. Исправлены проблемы с асинхронным обновлением данных
3. Улучшена синхронизация между секциями при быстром переключении

ОСНОВНЫЕ ИЗМЕНЕНИЯ:
- Все fetch-запросы теперь поддерживают отмену через AbortController
- Добавлена проверка актуальности запросов перед обновлением интерфейса
- Улучшена обработка ошибок и отмены запросов
- Добавлены уникальные префиксы для переменных и функций

*/

"use strict"; // Строгий режим для предотвращения распространенных ошибок JavaScript

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ СЕКЦИИ =====

// Переменная для хранения ID текущего выбранного просчёта
let printComponentsCurrentProschetId = null;

// Массив для хранения компонентов печати текущего просчёта
let printComponentsCurrentComponents = [];

// Объект MutationObserver для отслеживания изменений тиража
let printComponentsCirculationObserver = null;

// ID просчёта, за которым в данный момент ведётся наблюдение
let printComponentsObservedProschetId = null;

// URL для API запросов к серверу (статический объект)
const printComponentsApiUrls = {
    getComponents: '/calculator/get-print-components/', // Эндпоинт для получения компонентов
};

// Таймер для отложенной инициализации наблюдения (позволяет дождаться обновления данных)
let printComponentsObservationTimeout = null;

// НОВОЕ: AbortController для управления текущими запросами
let printComponentsCurrentAbortController = null;

// НОВОЕ: ID последнего запрошенного просчёта для проверки актуальности
let printComponentsLastRequestedId = null;

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

document.addEventListener('DOMContentLoaded', function() {
    // Сообщение в консоль для отладки
    console.log('✅ Секция "Печатные компоненты" загружена');
    
    // Настраиваем обработчики событий для секции
    setupPrintComponentsEventListeners();
    
    // Инициализируем интерфейс (показываем сообщение о выборе просчёта)
    initPrintComponentsInterface();
});

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====

function setupPrintComponentsEventListeners() {
    // Сообщение в консоль для отладки
    console.log('Настраиваем обработчики событий для секции "Печатные компоненты"...');
    
    // Получаем кнопку добавления нового компонента
    const addBtn = document.getElementById('add-print-component-btn');
    if (addBtn) {
        // Удаляем старые обработчики для предотвращения дублирования
        addBtn.removeEventListener('click', handleAddPrintComponent);
        // Добавляем новый обработчик клика
        addBtn.addEventListener('click', handleAddPrintComponent);
    }
    
    // Получаем кнопку добавления первого компонента (в сообщении "нет компонентов")
    const addFirstBtn = document.getElementById('add-first-component-btn');
    if (addFirstBtn) {
        // Удаляем старые обработчики
        addFirstBtn.removeEventListener('click', handleAddFirstComponent);
        // Добавляем новый обработчик клика
        addFirstBtn.addEventListener('click', handleAddFirstComponent);
    }
    
    console.log('✅ Обработчики событий для секции "Печатные компоненты" настроены');
}

// ===== 4. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С КОМПОНЕНТАМИ ПЕЧАТИ =====

/**
 * Функция инициализации интерфейса секции
 * Показывает сообщение о необходимости выбора просчёта
 * Вызывается при загрузке страницы
 */
function initPrintComponentsInterface() {
    console.log('Инициализация интерфейса секции "Печатные компоненты"');
    
    // Показываем сообщение о выборе просчёта
    showNoProschetSelectedMessage();
}

/**
 * Функция обновления секции при выборе просчёта
 * Вызывается из list_proschet.js при выборе просчёта
 * ОСНОВНОЕ ИЗМЕНЕНИЕ: Добавлена поддержка AbortController
 * 
 * @param {number} proschetId - ID выбранного просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
 * @param {AbortSignal} [signal] - Сигнал для отмены запросов (опционально)
 */
function updatePrintComponentsForProschet(proschetId, rowElement, signal = null) {
    console.log(`🔄 Обновление секции "Печатные компоненты" для просчёта ID: ${proschetId}`);
    
    // НОВОЕ: Отменяем предыдущие запросы
    cancelPrintComponentsCurrentRequest();
    
    // НОВОЕ: Сохраняем ID текущего запроса
    printComponentsLastRequestedId = proschetId;
    
    // НОВОЕ: Создаём новый AbortController, если сигнал не передан
    if (!signal) {
        printComponentsCurrentAbortController = new AbortController();
        signal = printComponentsCurrentAbortController.signal;
    }
    
    // ВАЖНО: Останавливаем предыдущее наблюдение за тиражом
    stopCirculationObservation();
    
    // Сбрасываем таймер наблюдения если он был
    if (printComponentsObservationTimeout) {
        clearTimeout(printComponentsObservationTimeout);
        printComponentsObservationTimeout = null;
    }
    
    // Сохраняем ID текущего просчёта
    printComponentsCurrentProschetId = proschetId;
    
    // Обновляем заголовок секции с названием просчёта
    updatePrintComponentsProschetTitle(rowElement);
    
    // Загружаем компоненты печати для выбранного просчёта (передаём signal)
    loadPrintComponentsForProschet(proschetId, signal);
    
    console.log(`✅ Секция "Печатные компоненты" начала обновление для просчёта ${proschetId}`);
}

/**
 * Функция отмены текущего запроса
 * НОВАЯ ФУНКЦИЯ: Для предотвращения конкурентных запросов
 */
function cancelPrintComponentsCurrentRequest() {
    if (printComponentsCurrentAbortController) {
        // Отменяем запрос через AbortController
        printComponentsCurrentAbortController.abort();
        console.log('🛑 Текущий запрос компонентов отменён');
    }
    
    // Сбрасываем ссылку на контроллер
    printComponentsCurrentAbortController = null;
}

/**
 * Функция обновления заголовка секции с названием просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
 */
function updatePrintComponentsProschetTitle(rowElement) {
    // Находим элемент заголовка в секции
    const proschetTitleElement = document.getElementById('print-components-proschet-title');
    
    // Проверяем, найден ли элемент
    if (!proschetTitleElement) {
        console.warn('❌ Элемент #print-components-proschet-title не найден');
        return;
    }
    
    // Находим ячейку с названием просчёта в строке таблицы
    const titleCell = rowElement.querySelector('.proschet-title');
    
    // Проверяем, найдена ли ячейка
    if (!titleCell) {
        console.warn('❌ Ячейка с названием просчёта не найдена');
        return;
    }
    
    // Получаем текст названия просчёта и удаляем лишние пробелы
    const proschetTitle = titleCell.textContent.trim();
    
    // Обновляем содержимое элемента заголовка
    proschetTitleElement.innerHTML = `
        <span class="proschet-title-active">
            ${proschetTitle}
        </span>
    `;
    
    // Сообщение в консоль для отладки
    console.log(`✅ Название просчёта обновлено в секции "Печатные компоненты": "${proschetTitle}"`);
}

/**
 * Функция загрузки компонентов печати для указанного просчёта
 * ОСНОВНОЕ ИЗМЕНЕНИЕ: Добавлена поддержка AbortSignal
 * 
 * @param {number} proschetId - ID просчёта
 * @param {AbortSignal} signal - Сигнал для отмены запроса
 */
function loadPrintComponentsForProschet(proschetId, signal) {
    console.log(`Загрузка компонентов печати для просчёта ID: ${proschetId}`);
    
    // Показываем индикатор загрузки
    showLoadingState();
    
    // Формируем URL для запроса
    const url = `${printComponentsApiUrls.getComponents}${proschetId}/`;
    
    // Отправляем GET-запрос к серверу с поддержкой отмены
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest', // Маркер AJAX-запроса
            'X-CSRFToken': getPrintComponentsCsrfToken() // CSRF-токен для безопасности
        },
        signal: signal // Передаём сигнал для возможности отмены запроса
    })
    .then(response => {
        // НОВОЕ: Проверяем, не был ли запрос отменён
        if (signal.aborted) {
            console.log(`ℹ️ Запрос для просчёта ${proschetId} был отменён`);
            throw new Error('RequestAborted');
        }
        
        // Проверяем статус ответа сервера
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        
        // Преобразуем ответ в JSON формат
        return response.json();
    })
    .then(data => {
        // НОВОЕ: Проверяем актуальность данных перед обновлением
        if (proschetId !== printComponentsLastRequestedId) {
            console.log(`ℹ️ Получены данные для старого просчёта ${proschetId}, игнорируем`);
            return;
        }
        
        console.log('📥 Получены данные компонентов печати:', data);
        
        // Проверяем успешность операции
        if (data.success) {
            // Сохраняем полученные компоненты
            printComponentsCurrentComponents = data.components || [];
            
            // Обновляем интерфейс с полученными данными
            updatePrintComponentsInterface(data.components || []);
            
            // ИСПРАВЛЕНИЕ: Отложенная инициализация наблюдения за тиражом
            // Даём время секции "Изделие" обновиться
            printComponentsObservationTimeout = setTimeout(() => {
                initCirculationObservationForProschet(proschetId);
            }, 300); // 300мс задержка чтобы данные успели обновиться
            
            console.log(`✅ Загружено ${printComponentsCurrentComponents.length} компонентов печати`);
        } else {
            // Обработка ошибки от сервера
            console.error('Ошибка при загрузке компонентов:', data.message);
            showErrorMessage('Не удалось загрузить компоненты печати');
        }
    })
    .catch(error => {
        // НОВОЕ: Отдельная обработка отмены запроса
        if (error.name === 'AbortError' || error.message === 'RequestAborted') {
            console.log(`ℹ️ Запрос для просчёта ${proschetId} был отменён`);
            return;
        }
        
        // Обработка других ошибок сети
        console.error('Ошибка сети при загрузке компонентов:', error);
        showErrorMessage('Ошибка сети при загрузке компонентов');
    });
}

/**
 * Функция обновления интерфейса с компонентами печати
 * @param {Array} components - Массив объектов компонентов печати
 */
function updatePrintComponentsInterface(components) {
    console.log('Обновление интерфейса с компонентами печати', components);
    
    // Скрываем все сообщения и контейнеры
    hideAllMessagesAndContainers();
    
    // Проверяем наличие компонентов
    if (components.length === 0) {
        // Если компонентов нет, показываем соответствующее сообщение
        showNoComponentsMessage();
    } else {
        // Если есть компоненты, показываем таблицу
        showPrintComponentsTable();
        
        // Заполняем таблицу данными
        populatePrintComponentsTable(components);
        
        // Показываем общую стоимость
        updateTotalPrice(components);
    }
    
    // Показываем кнопку добавления компонента (только если есть выбранный просчёт)
    showAddButton(true);
}

/**
 * Функция заполнения таблицы компонентами печати
 * @param {Array} components - Массив объектов компонентов печати
 */
function populatePrintComponentsTable(components) {
    // Находим тело таблицы
    const tableBody = document.getElementById('print-components-table-body');
    
    // Проверяем наличие элемента
    if (!tableBody) {
        console.error('❌ Элемент #print-components-table-body не найден');
        return;
    }
    
    // Очищаем текущее содержимое таблицы
    tableBody.innerHTML = '';
    
    // Обновляем заголовок таблицы для отражения новой колонки действий
    const tableHeader = document.querySelector('.print-components-table thead tr');
    if (tableHeader && tableHeader.children.length < 7) {
        // Создаём элемент заголовка для колонки действий
        const actionsHeader = document.createElement('th');
        actionsHeader.width = '5%'; // Ширина колонки
        actionsHeader.className = 'actions-header'; // CSS-класс
        actionsHeader.textContent = 'Действия'; // Текст заголовка
        tableHeader.appendChild(actionsHeader); // Добавляем в таблицу
    }
    
    // Добавляем строки для каждого компонента
    components.forEach((component, index) => {
        // Создаём строку для компонента
        const row = createPrintComponentRow(component, index);
        // Добавляем строку в тело таблицы
        tableBody.appendChild(row);
    });
    
    console.log(`✅ Таблица обновлена: добавлено ${components.length} строк`);
}

/**
 * Функция создания строки таблицы для компонента печати
 * @param {Object} component - Объект компонента печати
 * @param {number} index - Индекс компонента (для чередования стилей строк)
 * @returns {HTMLElement} - DOM-элемент строки таблицы
 */
function createPrintComponentRow(component, index) {
    // Создаем элемент строки таблицы
    const row = document.createElement('tr');
    
    // Добавляем класс для чередования цвета строк
    if (index % 2 === 0) {
        row.classList.add('even-row'); // Чётная строка
    } else {
        row.classList.add('odd-row'); // Нечётная строка
    }
    
    // Добавляем класс для возможности выделения строки
    row.classList.add('selectable-row');
    
    // Добавляем data-атрибут с ID компонента
    row.dataset.componentId = component.id;
    
    // Определение: Получаем значение для отображения в колонке "Кол-во листов"
    let sheetCountDisplay = 'Не указан'; // Значение по умолчанию
    
    // Приоритет отображения: formatted_circulation_display > circulation_display > sheet_count
    if (component.formatted_circulation_display && component.formatted_circulation_display !== 'Не указан') {
        sheetCountDisplay = component.formatted_circulation_display;
    } else if (component.circulation_display && component.circulation_display !== 'Не указан') {
        sheetCountDisplay = component.circulation_display;
    } else if (component.sheet_count) {
        sheetCountDisplay = component.sheet_count;
    }
    
    // Заполняем ячейки строки данными компонента
    row.innerHTML = `
        <td class="component-number">${component.number || '—'}</td>
        <td class="component-printer">${component.printer_name || 'Принтер не выбран'}</td>
        <td class="component-paper">${component.paper_name || 'Бумага не выбрана'}</td>
        <td class="component-sheet-count">${sheetCountDisplay}</td>
        <td class="component-price">${component.formatted_price_per_sheet || '0.00 ₽'}</td>
        <td class="component-total">${component.formatted_total_circulation_price || '0.00 ₽'}</td>
        <td class="component-actions">
            <button type="button" class="delete-component-btn" 
                    title="Удалить компонент" 
                    data-component-id="${component.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;
    
    // Добавляем обработчик клика для выделения строки
    row.addEventListener('click', function(event) {
        // Игнорируем клики по кнопке удаления
        if (!event.target.closest('.delete-component-btn')) {
            // Снимаем выделение со всех строк
            const allRows = document.querySelectorAll('#print-components-table-body tr');
            allRows.forEach(r => r.classList.remove('selected'));
            
            // Добавляем выделение текущей строке
            this.classList.add('selected');
        }
    });
    
    // Возвращаем созданную строку
    return row;
}

/**
 * Функция обновления отображения общей стоимости компонентов
 * @param {Array} components - Массив объектов компонентов печати
 */
function updateTotalPrice(components) {
    // Находим элементы для отображения общей стоимости
    const totalContainer = document.getElementById('print-components-total');
    const totalPriceElement = document.getElementById('print-components-total-price');
    
    // Проверяем наличие элементов
    if (!totalContainer || !totalPriceElement) {
        console.warn('❌ Элементы для отображения общей стоимости не найдены');
        return;
    }
    
    // Вычисляем общую стоимость всех компонентов
    let totalPrice = 0; // Начальное значение
    components.forEach(component => {
        if (component.total_circulation_price) {
            // Суммируем стоимость каждого компонента
            totalPrice += parseFloat(component.total_circulation_price);
        }
    });
    
    // Форматируем и отображаем общую стоимость
    totalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;
    totalContainer.style.display = 'flex'; // Показываем контейнер
    
    console.log(`✅ Общая стоимость компонентов печати: ${totalPrice.toFixed(2)} ₽`);
    
    // Отправляем событие для обновления других секций
    if (printComponentsCurrentProschetId) {
        // Создаём кастомное событие
        const event = new CustomEvent('printComponentsUpdated', {
            detail: {
                proschetId: printComponentsCurrentProschetId,
                components: components
            }
        });
        
        // Отправляем событие
        document.dispatchEvent(event);
        console.log(`📤 Событие printComponentsUpdated отправлено для просчёта ${printComponentsCurrentProschetId}`);
    }
}

// ===== 5. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА =====

/**
 * Функция показа сообщения о необходимости выбора просчёта
 */
function showNoProschetSelectedMessage() {
    // Находим все необходимые элементы
    const noProschetMsg = document.getElementById('no-proschet-selected-print');
    const noComponentsMsg = document.getElementById('no-components-message');
    const componentsContainer = document.getElementById('print-components-container');
    const addButton = document.getElementById('add-print-component-btn');
    
    // Управляем видимостью элементов
    if (noProschetMsg) noProschetMsg.style.display = 'block';
    if (noComponentsMsg) noComponentsMsg.style.display = 'none';
    if (componentsContainer) componentsContainer.style.display = 'none';
    if (addButton) addButton.style.display = 'none';
    
    // Очищаем заголовок с названием просчёта
    const proschetTitleElement = document.getElementById('print-components-proschet-title');
    if (proschetTitleElement) {
        proschetTitleElement.innerHTML = `<span class="placeholder-text">(просчёт не выбран)</span>`;
    }
    
    // Сбрасываем текущий просчёт
    printComponentsCurrentProschetId = null;
    printComponentsCurrentComponents = [];
    
    // НОВОЕ: Отменяем текущие запросы
    cancelPrintComponentsCurrentRequest();
    
    // Сбрасываем ID последнего запроса
    printComponentsLastRequestedId = null;
    
    // Останавливаем наблюдение за тиражом
    stopCirculationObservation();
}

/**
 * Функция показа сообщения об отсутствии компонентов
 */
function showNoComponentsMessage() {
    // Находим элементы
    const noProschetMsg = document.getElementById('no-proschet-selected-print');
    const noComponentsMsg = document.getElementById('no-components-message');
    const componentsContainer = document.getElementById('print-components-container');
    
    // Управляем видимостью элементов
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noComponentsMsg) noComponentsMsg.style.display = 'block';
    if (componentsContainer) componentsContainer.style.display = 'none';
}

/**
 * Функция показа таблицы с компонентами
 */
function showPrintComponentsTable() {
    // Находим элементы
    const noProschetMsg = document.getElementById('no-proschet-selected-print');
    const noComponentsMsg = document.getElementById('no-components-message');
    const componentsContainer = document.getElementById('print-components-container');
    
    // Управляем видимостью элементов
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noComponentsMsg) noComponentsMsg.style.display = 'none';
    if (componentsContainer) componentsContainer.style.display = 'block';
}

/**
 * Функция показа состояния загрузки
 */
function showLoadingState() {
    // Находим элементы
    const noProschetMsg = document.getElementById('no-proschet-selected-print');
    const noComponentsMsg = document.getElementById('no-components-message');
    const componentsContainer = document.getElementById('print-components-container');
    const tableBody = document.getElementById('print-components-table-body');
    
    // Скрываем все сообщения и контейнеры
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noComponentsMsg) noComponentsMsg.style.display = 'none';
    if (componentsContainer) componentsContainer.style.display = 'none';
    
    // Показываем индикатор загрузки в таблице
    if (tableBody) {
        // Заполняем таблицу индикатором загрузки
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p>Загрузка компонентов печати...</p>
                </td>
            </tr>
        `;
        
        // Временно показываем таблицу с индикатором загрузки
        if (componentsContainer) {
            componentsContainer.style.display = 'block';
        }
    }
}

/**
 * Функция показа сообщения об ошибке
 * @param {string} message - Текст сообщения об ошибке
 */
function showErrorMessage(message) {
    // Находим тело таблицы
    const tableBody = document.getElementById('print-components-table-body');
    
    if (tableBody) {
        // Заполняем таблицу сообщением об ошибке
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p>${message}</p>
                    <button type="button" id="retry-load-btn" class="btn-action" style="margin-top: 10px;">
                        <i class="fas fa-redo"></i> Повторить попытку
                    </button>
                </td>
            </tr>
        `;
        
        // Добавляем обработчик для кнопки повтора
        const retryBtn = document.getElementById('retry-load-btn');
        if (retryBtn && printComponentsCurrentProschetId) {
            retryBtn.addEventListener('click', function() {
                // НОВОЕ: Отменяем текущий запрос перед повторной попыткой
                cancelPrintComponentsCurrentRequest();
                
                // Создаём новый AbortController
                const controller = new AbortController();
                printComponentsCurrentAbortController = controller;
                
                // Загружаем компоненты снова
                loadPrintComponentsForProschet(printComponentsCurrentProschetId, controller.signal);
            });
        }
    }
}

/**
 * Функция скрытия всех сообщений и контейнеров
 */
function hideAllMessagesAndContainers() {
    // Находим элементы
    const noProschetMsg = document.getElementById('no-proschet-selected-print');
    const noComponentsMsg = document.getElementById('no-components-message');
    const componentsContainer = document.getElementById('print-components-container');
    
    // Скрываем все элементы
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noComponentsMsg) noComponentsMsg.style.display = 'none';
    if (componentsContainer) componentsContainer.style.display = 'none';
}

/**
 * Функция управления видимостью кнопки добавления
 * @param {boolean} show - Показывать ли кнопку
 */
function showAddButton(show) {
    // Находим кнопку добавления
    const addButton = document.getElementById('add-print-component-btn');
    
    if (addButton) {
        if (show) {
            addButton.style.display = 'inline-block'; // Показываем кнопку
        } else {
            addButton.style.display = 'none'; // Скрываем кнопку
        }
    }
}

// ===== 6. ОБРАБОТЧИКИ КНОПОК =====

/**
 * Обработчик нажатия на кнопку добавления компонента
 */
function handleAddPrintComponent() {
    console.log('🖨️ Добавление нового компонента печати');
    
    // Проверяем, выбран ли просчёт
    if (!printComponentsCurrentProschetId) {
        showNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    
    console.log(`🖨️ Создание модального окна для просчёта ID: ${printComponentsCurrentProschetId}`);
    
    // Используем функцию из print_components_inline_edit.js
    if (typeof window.print_components_handle_add_component === 'function') {
        window.print_components_handle_add_component();
    } else {
        showNotification('Функция добавления компонента не загружена', 'error');
    }
}

/**
 * Обработчик нажатия на кнопку добавления первого компонента
 */
function handleAddFirstComponent() {
    console.log('Добавление первого компонента печати');
    handleAddPrintComponent(); // Используем ту же логику
}

// ===== 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

/**
 * Функция получения CSRF-токена для AJAX-запросов
 * @returns {string} CSRF-токен
 */
function getPrintComponentsCsrfToken() {
    const name = 'csrftoken'; // Имя cookie с CSRF-токеном
    const cookies = document.cookie.split(';'); // Разбиваем строку cookie на массив
    
    // Ищем cookie с CSRF-токеном
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim(); // Удаляем пробелы
        if (cookie.startsWith(name + '=')) {
            // Возвращаем значение cookie (декодированное)
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }
    
    // Если токен не найден
    console.warn('CSRF-токен не найден');
    return ''; // Возвращаем пустую строку
}

/**
 * Функция показа уведомления
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип сообщения: 'success', 'error', 'warning', 'info'
 */
function showNotification(message, type = 'info') {
    console.log(`Показ уведомления [${type}]: ${message}`);
    
    // Создаём элемент уведомления
    const notification = document.createElement('div');
    
    // Определяем цвет фона в зависимости от типа
    let backgroundColor = '#2196F3'; // По умолчанию синий (info)
    if (type === 'success') backgroundColor = '#4CAF50'; // Зелёный для успеха
    if (type === 'error') backgroundColor = '#f44336'; // Красный для ошибки
    if (type === 'warning') backgroundColor = '#ff9800'; // Оранжевый для предупреждения
    
    // Настраиваем стили уведомления
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
    
    // Устанавливаем текст уведомления
    notification.textContent = message;
    
    // Добавляем уведомление на страницу
    document.body.appendChild(notification);
    
    // Удаляем уведомление через 3 секунды
    setTimeout(() => {
        notification.style.opacity = '0'; // Плавное исчезновение
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification); // Удаляем элемент
            }
        }, 300);
    }, 3000);
}

/**
 * Извлекает числовое значение тиража из текста.
 * @param {string} text - Текст, содержащий тираж
 * @returns {number|null} Числовое значение тиража или null, если не удалось извлечь
 */
function extractCirculationFromText(text) {
    // Проверяем наличие текста
    if (!text || text.toLowerCase().includes('не указан')) {
        return null; // Если текст пустой или содержит "не указан"
    }
    
    try {
        // Удаляем все символы кроме цифр и пробелов
        let cleanedText = text.replace(/[^\d\s]/g, '');
        
        // Удаляем все пробелы
        cleanedText = cleanedText.replace(/\s/g, '');
        
        // Преобразуем строку в число
        const circulation = parseInt(cleanedText, 10);
        
        // Проверяем валидность числа
        if (isNaN(circulation) || circulation <= 0) {
            return null; // Невалидное число
        }
        
        // Возвращаем числовое значение
        return circulation;
    } catch (error) {
        // В случае ошибки возвращаем null
        return null;
    }
}

/**
 * Инициализирует наблюдение за тиражом для указанного просчёта
 * ВАЖНО: Исправленная версия с проверкой актуальности данных
 * @param {number} proschetId - ID просчёта
 */
function initCirculationObservationForProschet(proschetId) {
    console.log(`👁️ Инициализация наблюдения за тиражом для просчёта ${proschetId}`);
    
    // НОВОЕ: Проверяем актуальность просчёта перед наблюдением
    if (proschetId !== printComponentsCurrentProschetId) {
        console.warn(`⚠️ Пропускаем наблюдение: запрошено для просчёта ${proschetId}, а текущий ${printComponentsCurrentProschetId}`);
        return;
    }
    
    // Останавливаем предыдущее наблюдение
    stopCirculationObservation();
    
    // Находим элемент отображения тиража в секции "Изделие"
    const circulationDisplayElement = document.getElementById('product-circulation-display');
    
    if (!circulationDisplayElement) {
        console.warn('⚠️ Элемент отображения тиража не найден');
        return;
    }
    
    // Проверяем наличие data-proschet-id у элемента
    const elementProschetId = circulationDisplayElement.dataset.proschetId;
    
    // Если у элемента есть proschetId, проверяем совпадение
    if (elementProschetId) {
        if (parseInt(elementProschetId) !== parseInt(proschetId)) {
            console.warn(`⚠️ Пропускаем наблюдение: элемент тиража принадлежит просчёту ${elementProschetId}, а не ${proschetId}`);
            
            // НОВОЕ: Вместо принудительного обновления атрибута, просто выходим
            // Это предотвращает наблюдение за чужим элементом
            return;
        }
    } else {
        // Если у элемента нет proschetId, устанавливаем его
        circulationDisplayElement.dataset.proschetId = proschetId;
        console.log(`✅ Установлен data-proschet-id элемента тиража: ${proschetId}`);
    }
    
    // Извлекаем текущее значение тиража
    const circulationText = circulationDisplayElement.textContent.trim();
    const initialCirculation = extractCirculationFromText(circulationText);
    
    if (!initialCirculation) {
        console.log(`ℹ️ Тираж не указан для просчёта ${proschetId}, наблюдение не инициализировано`);
        return;
    }
    
    console.log(`📊 Начальный тираж просчёта: ${initialCirculation} шт.`);
    
    // Сохраняем ID просчёта, за которым наблюдаем
    printComponentsObservedProschetId = proschetId;
    
    // Создаём новый обработчик для текущего просчёта
    const circulationChangeHandler = function(mutations) {
        mutations.forEach(function(mutation) {
            // Проверяем тип мутации
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
                // Получаем новый текст тиража
                const newText = circulationDisplayElement.textContent.trim();
                const newCirculation = extractCirculationFromText(newText);
                
                // Проверяем, что изменение относится к текущему просчёту
                if (newCirculation && printComponentsCurrentProschetId === proschetId) {
                    console.log(`🔄 Обнаружено изменение тиража для просчёта ${proschetId}: ${initialCirculation} → ${newCirculation}`);
                    
                    // Показываем уведомление
                    showNotification(`Тираж изменён на ${newCirculation} шт.`, 'info');
                    
                    // Пересчитываем компоненты только для текущего просчёта
                    recalculatePrintComponentsForCirculation(proschetId, newCirculation);
                } else if (newCirculation) {
                    console.log(`ℹ️ Изменение тиража проигнорировано: текущий просчёт ${printComponentsCurrentProschetId}, а изменение для ${proschetId}`);
                }
            }
        });
    };
    
    // Создаём новый наблюдатель MutationObserver
    printComponentsCirculationObserver = new MutationObserver(circulationChangeHandler);
    
    // Начинаем наблюдение за изменениями в элементе
    printComponentsCirculationObserver.observe(circulationDisplayElement, {
        childList: true, // Наблюдаем за изменением дочерних элементов
        characterData: true, // Наблюдаем за изменением текста
        subtree: true // Наблюдаем за всем поддеревом элементов
    });
    
    console.log(`✅ Наблюдение за тиражом установлено для просчёта ${proschetId}`);
}

/**
 * Останавливает наблюдение за изменениями тиража
 */
function stopCirculationObservation() {
    if (printComponentsCirculationObserver) {
        // Отключаем наблюдатель
        printComponentsCirculationObserver.disconnect();
        printComponentsCirculationObserver = null;
        printComponentsObservedProschetId = null;
        console.log('🛑 Наблюдение за изменениями тиража остановлено');
    }
    
    // Очищаем таймер если он есть
    if (printComponentsObservationTimeout) {
        clearTimeout(printComponentsObservationTimeout);
        printComponentsObservationTimeout = null;
    }
}

/**
 * Пересчитывает компоненты печати для нового тиража
 * @param {number} proschetId - ID просчёта
 * @param {number} newCirculation - Новый тираж
 */
function recalculatePrintComponentsForCirculation(proschetId, newCirculation) {
    console.log(`🔄 Пересчёт компонентов для просчёта ${proschetId}, тираж: ${newCirculation}`);
    
    // Проверяем, что пересчёт делается для текущего просчёта
    if (proschetId !== printComponentsCurrentProschetId) {
        console.warn(`⚠️ Пропускаем пересчёт: запрошен для просчёта ${proschetId}, а текущий ${printComponentsCurrentProschetId}`);
        return;
    }
    
    // Здесь должна быть реализация пересчёта цен компонентов
    // Пока просто обновляем отображение
    showNotification(`Тираж изменён на ${newCirculation} шт. Обновите компоненты вручную.`, 'info');
}

// ===== 8. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С ДРУГИМИ СЕКЦИЯМИ =====

/**
 * Глобальный объект для взаимодействия с другими секциями
 * НОВОЕ: Добавлены функции для управления запросами
 */
window.printComponentsSection = {
    /**
     * Основная функция для обновления секции при выборе просчёта
     * @param {number} proschetId - ID выбранного просчёта
     * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
     * @param {AbortSignal} [signal] - Сигнал для отмены запросов (опционально)
     */
    updateForProschet: function(proschetId, rowElement, signal = null) {
        updatePrintComponentsForProschet(proschetId, rowElement, signal);
    },
    
    /**
     * Функция сброса секции (когда просчёт не выбран)
     */
    reset: function() {
        showNoProschetSelectedMessage();
    },
    
    /**
     * Функция для получения текущего просчёта
     * @returns {number|null} ID текущего просчёта или null
     */
    getCurrentProschetId: function() {
        return printComponentsCurrentProschetId;
    },
    
    /**
     * Функция для получения текущих компонентов печати
     * @returns {Array} Массив компонентов печати
     */
    getCurrentComponents: function() {
        return printComponentsCurrentComponents;
    },
    
    /**
     * Останавливает наблюдение за изменениями тиража
     */
    stopObservation: stopCirculationObservation,
    
    /**
     * НОВАЯ ФУНКЦИЯ: Отменяет текущие запросы
     * Используется при быстром переключении между просчётами
     */
    cancelCurrentRequest: cancelPrintComponentsCurrentRequest,
    
    /**
     * НОВАЯ ФУНКЦИЯ: Получает ID последнего запрошенного просчёта
     * @returns {number|null} ID последнего запрошенного просчёта
     */
    getLastRequestedId: function() {
        return printComponentsLastRequestedId;
    }
};

console.log('✅ Секция "Печатные компоненты" загружена с исправленной синхронизацией и управлением запросами');