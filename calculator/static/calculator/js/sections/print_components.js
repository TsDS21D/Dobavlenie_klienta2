/*
sections/print_components.js - JavaScript для секции "Печатные компоненты"
ОБНОВЛЕНО: Исправлен MutationObserver для правильного отслеживания тиража
ИСПРАВЛЕНИЕ: Тираж теперь корректно применяется только к текущему просчёту
ДОБАВЛЕНО: Улучшенная логика наблюдения с обработкой задержек обновления данных
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ СЕКЦИИ =====

// ID текущего выбранного просчёта
let currentProschetId = null;

// Массив с компонентами печати для текущего просчёта
let currentPrintComponents = [];

// Объект MutationObserver для отслеживания изменений тиража
let circulationObserver = null;

// ID просчёта, за которым в данный момент ведётся наблюдение
let observedProschetId = null;

// URL для API запросов к серверу
const printComponentsApiUrls = {
    getComponents: '/calculator/get-print-components/', // Для получения компонентов просчёта
};

// Таймер для отложенной инициализации наблюдения (позволяет дождаться обновления данных)
let observationTimeout = null;

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Печатные компоненты" загружена');
    
    // Настраиваем обработчики событий для секции
    setupPrintComponentsEventListeners();
    
    // Инициализируем интерфейс (показываем сообщение о выборе просчёта)
    initPrintComponentsInterface();
});

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====

function setupPrintComponentsEventListeners() {
    console.log('Настраиваем обработчики событий для секции "Печатные компоненты"...');
    
    // Кнопка добавления нового компонента
    const addBtn = document.getElementById('add-print-component-btn');
    if (addBtn) {
        // Удаляем старые обработчики
        addBtn.removeEventListener('click', handleAddPrintComponent);
        addBtn.addEventListener('click', handleAddPrintComponent);
    }
    
    // Кнопка добавления первого компонента (в сообщении "нет компонентов")
    const addFirstBtn = document.getElementById('add-first-component-btn');
    if (addFirstBtn) {
        // Удаляем старые обработчики
        addFirstBtn.removeEventListener('click', handleAddFirstComponent);
        addFirstBtn.addEventListener('click', handleAddFirstComponent);
    }
    
    console.log('✅ Обработчики событий для секции "Печатные компоненты" настроены');
}

// ===== 4. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С КОМПОНЕНТАМИ ПЕЧАТИ =====

/**
 * Функция инициализации интерфейса секции
 * Показывает сообщение о необходимости выбора просчёта
 */
function initPrintComponentsInterface() {
    console.log('Инициализация интерфейса секции "Печатные компоненты"');
    
    // Показываем сообщение о выборе просчёта
    showNoProschetSelectedMessage();
}

/**
 * Функция обновления секции при выборе просчёта
 * Вызывается из list_proschet.js при выборе просчёта
 * @param {number} proschetId - ID выбранного просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
 */
function updatePrintComponentsForProschet(proschetId, rowElement) {
    console.log(`🔄 Обновление секции "Печатные компоненты" для просчёта ID: ${proschetId}`);
    
    // ВАЖНО: Останавливаем предыдущее наблюдение за тиражом
    stopCirculationObservation();
    
    // Сбрасываем таймер наблюдения если он был
    if (observationTimeout) {
        clearTimeout(observationTimeout);
        observationTimeout = null;
    }
    
    // Сохраняем ID текущего просчёта
    currentProschetId = proschetId;
    
    // Обновляем заголовок секции с названием просчёта
    updatePrintComponentsProschetTitle(rowElement);

    // Загружаем компоненты печати для выбранного просчёта
    loadPrintComponentsForProschet(proschetId);
    
    console.log(`✅ Секция "Печатные компоненты" начала обновление для просчёта ${proschetId}`);
}

/**
 * Функция обновления заголовка секции с названием просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
 */
function updatePrintComponentsProschetTitle(rowElement) {
    const proschetTitleElement = document.getElementById('print-components-proschet-title');
    if (!proschetTitleElement) {
        console.warn('❌ Элемент #print-components-proschet-title не найден');
        return;
    }
    
    const titleCell = rowElement.querySelector('.proschet-title');
    if (!titleCell) {
        console.warn('❌ Ячейка с названием просчёта не найдена');
        return;
    }
    
    const proschetTitle = titleCell.textContent.trim();
    
    proschetTitleElement.innerHTML = `
        <span class="proschet-title-active">
            ${proschetTitle}
        </span>
    `;
    
    console.log(`✅ Название просчёта обновлено в секции "Печатные компоненты": "${proschetTitle}"`);
}

/**
 * Функция загрузки компонентов печати для указанного просчёта
 * @param {number} proschetId - ID просчёта
 */
function loadPrintComponentsForProschet(proschetId) {
    console.log(`Загрузка компонентов печати для просчёта ID: ${proschetId}`);
    
    // Показываем индикатор загрузки
    showLoadingState();
    
    // Формируем URL для запроса
    const url = `${printComponentsApiUrls.getComponents}${proschetId}/`;
    
    // Отправляем GET-запрос к серверу
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getPrintComponentsCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('📥 Получены данные компонентов печати:', data);
        
        if (data.success) {
            // Сохраняем полученные компоненты
            currentPrintComponents = data.components || [];
            
            // Обновляем интерфейс с полученными данными
            updatePrintComponentsInterface(data.components || []);
            
            // ИСПРАВЛЕНИЕ: Отложенная инициализация наблюдения за тиражом
            // Даём время секции "Изделие" обновиться
            observationTimeout = setTimeout(() => {
                initCirculationObservationForProschet(proschetId);
            }, 300); // 300мс задержка чтобы данные успели обновиться
            
            console.log(`✅ Загружено ${currentPrintComponents.length} компонентов печати`);
        } else {
            console.error('Ошибка при загрузке компонентов:', data.message);
            showErrorMessage('Не удалось загрузить компоненты печати');
        }
    })
    .catch(error => {
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
    const tableBody = document.getElementById('print-components-table-body');
    if (!tableBody) {
        console.error('❌ Элемент #print-components-table-body не найден');
        return;
    }
    
    // Очищаем текущее содержимое таблицы
    tableBody.innerHTML = '';
    
    // Обновляем заголовок таблицы для отражения новой колонки действий
    const tableHeader = document.querySelector('.print-components-table thead tr');
    if (tableHeader && tableHeader.children.length < 7) {
        const actionsHeader = document.createElement('th');
        actionsHeader.width = '5%';
        actionsHeader.className = 'actions-header';
        actionsHeader.textContent = 'Действия';
        tableHeader.appendChild(actionsHeader);
    }
    
    // Добавляем строки для каждого компонента
    components.forEach((component, index) => {
        const row = createPrintComponentRow(component, index);
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
    // Создаем элемент строки
    const row = document.createElement('tr');
    
    // Добавляем класс для чередования цвета строк
    if (index % 2 === 0) {
        row.classList.add('even-row');
    } else {
        row.classList.add('odd-row');
    }
    
    // Добавляем класс для возможности выделения строки
    row.classList.add('selectable-row');
    
    // Добавляем data-атрибут с ID компонента
    row.dataset.componentId = component.id;
    
    // ОПРЕДЕЛЕНИЕ: Получаем значение для отображения в колонке "Кол-во листов"
    let sheetCountDisplay = 'Не указан';
    
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
    
    return row;
}

/**
 * Функция обновления отображения общей стоимости компонентов
 * @param {Array} components - Массив объектов компонентов печати
 */
function updateTotalPrice(components) {
    const totalContainer = document.getElementById('print-components-total');
    const totalPriceElement = document.getElementById('print-components-total-price');
    
    if (!totalContainer || !totalPriceElement) {
        console.warn('❌ Элементы для отображения общей стоимости не найдены');
        return;
    }
    
    // Вычисляем общую стоимость всех компонентов
    let totalPrice = 0;
    components.forEach(component => {
        if (component.total_circulation_price) {
            totalPrice += parseFloat(component.total_circulation_price);
        }
    });
    
    // Форматируем и отображаем общую стоимость
    totalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;
    totalContainer.style.display = 'flex';
    
    console.log(`✅ Общая стоимость компонентов печати: ${totalPrice.toFixed(2)} ₽`);
    
    // Отправляем событие для обновления других секций
    if (currentProschetId) {
        const event = new CustomEvent('printComponentsUpdated', {
            detail: {
                proschetId: currentProschetId,
                components: components
            }
        });
        document.dispatchEvent(event);
        console.log(`📤 Событие printComponentsUpdated отправлено для просчёта ${currentProschetId}`);
    }
}

// ===== 5. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА =====

/**
 * Функция показа сообщения о необходимости выбора просчёта
 */
function showNoProschetSelectedMessage() {
    const noProschetMsg = document.getElementById('no-proschet-selected-print');
    const noComponentsMsg = document.getElementById('no-components-message');
    const componentsContainer = document.getElementById('print-components-container');
    const addButton = document.getElementById('add-print-component-btn');
    
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
    currentProschetId = null;
    currentPrintComponents = [];
    
    // Останавливаем наблюдение за тиражом
    stopCirculationObservation();
}

/**
 * Функция показа сообщения об отсутствии компонентов
 */
function showNoComponentsMessage() {
    const noProschetMsg = document.getElementById('no-proschet-selected-print');
    const noComponentsMsg = document.getElementById('no-components-message');
    const componentsContainer = document.getElementById('print-components-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noComponentsMsg) noComponentsMsg.style.display = 'block';
    if (componentsContainer) componentsContainer.style.display = 'none';
}

/**
 * Функция показа таблицы с компонентами
 */
function showPrintComponentsTable() {
    const noProschetMsg = document.getElementById('no-proschet-selected-print');
    const noComponentsMsg = document.getElementById('no-components-message');
    const componentsContainer = document.getElementById('print-components-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noComponentsMsg) noComponentsMsg.style.display = 'none';
    if (componentsContainer) componentsContainer.style.display = 'block';
}

/**
 * Функция показа состояния загрузки
 */
function showLoadingState() {
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
    const tableBody = document.getElementById('print-components-table-body');
    if (tableBody) {
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
        if (retryBtn && currentProschetId) {
            retryBtn.addEventListener('click', function() {
                loadPrintComponentsForProschet(currentProschetId);
            });
        }
    }
}

/**
 * Функция скрытия всех сообщений и контейнеров
 */
function hideAllMessagesAndContainers() {
    const noProschetMsg = document.getElementById('no-proschet-selected-print');
    const noComponentsMsg = document.getElementById('no-components-message');
    const componentsContainer = document.getElementById('print-components-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noComponentsMsg) noComponentsMsg.style.display = 'none';
    if (componentsContainer) componentsContainer.style.display = 'none';
}

/**
 * Функция управления видимостью кнопки добавления
 * @param {boolean} show - Показывать ли кнопку
 */
function showAddButton(show) {
    const addButton = document.getElementById('add-print-component-btn');
    if (addButton) {
        if (show) {
            addButton.style.display = 'inline-block';
        } else {
            addButton.style.display = 'none';
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
    if (!currentProschetId) {
        showNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    
    console.log(`🖨️ Создание модального окна для просчёта ID: ${currentProschetId}`);
    
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

/**
 * Функция показа уведомления
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип сообщения: 'success', 'error', 'warning', 'info'
 */
function showNotification(message, type = 'info') {
    console.log(`Показ уведомления [${type}]: ${message}`);
    
    const notification = document.createElement('div');
    
    // Определяем цвет фона в зависимости от типа
    let backgroundColor = '#2196F3'; // По умолчанию синий (info)
    if (type === 'success') backgroundColor = '#4CAF50';
    if (type === 'error') backgroundColor = '#f44336';
    if (type === 'warning') backgroundColor = '#ff9800';
    
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

/**
 * Извлекает числовое значение тиража из текста.
 * @param {string} text - Текст, содержащий тираж
 * @returns {number|null} Числовое значение тиража или null, если не удалось извлечь
 */
function extractCirculationFromText(text) {
    if (!text || text.toLowerCase().includes('не указан')) {
        return null;
    }
    
    try {
        let cleanedText = text.replace(/[^\d\s]/g, '');
        cleanedText = cleanedText.replace(/\s/g, '');
        
        const circulation = parseInt(cleanedText, 10);
        
        if (isNaN(circulation) || circulation <= 0) {
            return null;
        }
        
        return circulation;
    } catch (error) {
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
    
    // Останавливаем предыдущее наблюдение
    stopCirculationObservation();
    
    // ИСПРАВЛЕНИЕ: Проверяем, что это тот же просчёт, который сейчас выбран
    if (proschetId !== currentProschetId) {
        console.warn(`⚠️ Пропускаем наблюдение: запрошено для просчёта ${proschetId}, а текущий ${currentProschetId}`);
        return;
    }
    
    // Находим элемент отображения тиража в секции "Изделие"
    const circulationDisplayElement = document.getElementById('product-circulation-display');
    
    if (!circulationDisplayElement) {
        console.warn('⚠️ Элемент отображения тиража не найден');
        return;
    }
    
    // ИСПРАВЛЕНИЕ: Проверяем наличие data-proschet-id, но не блокируем инициализацию если его нет
    const elementProschetId = circulationDisplayElement.dataset.proschetId;
    
    // Если у элемента есть proschetId, проверяем совпадение
    if (elementProschetId) {
        if (parseInt(elementProschetId) !== parseInt(proschetId)) {
            console.warn(`⚠️ Пропускаем наблюдение: элемент тиража принадлежит просчёту ${elementProschetId}, а не ${proschetId}`);
            
            // ИСПРАВЛЕНИЕ: Пытаемся обновить data-proschet-id элемента
            circulationDisplayElement.dataset.proschetId = proschetId;
            console.log(`🔄 Обновлен data-proschet-id элемента тиража на ${proschetId}`);
            
            // Продолжаем инициализацию после обновления
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
    observedProschetId = proschetId;
    
    // Создаём новый обработчик для текущего просчёта
    const circulationChangeHandler = function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
                const newText = circulationDisplayElement.textContent.trim();
                const newCirculation = extractCirculationFromText(newText);
                
                // ИСПРАВЛЕНИЕ: Проверяем, что изменение относится к текущему просчёту
                if (newCirculation && currentProschetId === proschetId) {
                    console.log(`🔄 Обнаружено изменение тиража для просчёта ${proschetId}: ${initialCirculation} → ${newCirculation}`);
                    
                    // Показываем уведомление
                    showNotification(`Тираж изменён на ${newCirculation} шт.`, 'info');
                    
                    // Пересчитываем компоненты только для текущего просчёта
                    recalculatePrintComponentsForCirculation(proschetId, newCirculation);
                } else if (newCirculation) {
                    console.log(`ℹ️ Изменение тиража проигнорировано: текущий просчёт ${currentProschetId}, а изменение для ${proschetId}`);
                }
            }
        });
    };
    
    // Создаём новый наблюдатель
    circulationObserver = new MutationObserver(circulationChangeHandler);
    
    // Начинаем наблюдение
    circulationObserver.observe(circulationDisplayElement, {
        childList: true,
        characterData: true,
        subtree: true
    });
    
    console.log(`✅ Наблюдение за тиражом установлено для просчёта ${proschetId}`);
}

/**
 * Останавливает наблюдение за изменениями тиража
 */
function stopCirculationObservation() {
    if (circulationObserver) {
        circulationObserver.disconnect();
        circulationObserver = null;
        observedProschetId = null;
        console.log('🛑 Наблюдение за изменениями тиража остановлено');
    }
    
    // Очищаем таймер если он есть
    if (observationTimeout) {
        clearTimeout(observationTimeout);
        observationTimeout = null;
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
    if (proschetId !== currentProschetId) {
        console.warn(`⚠️ Пропускаем пересчёт: запрошен для просчёта ${proschetId}, а текущий ${currentProschetId}`);
        return;
    }
    
    // Здесь должна быть реализация пересчёта цен компонентов
    // Пока просто обновляем отображение
    showNotification(`Тираж изменён на ${newCirculation} шт. Обновите компоненты вручную.`, 'info');
}

// ===== 8. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С ДРУГИМИ СЕКЦИЯМИ =====

// Экспортируем функцию обновления компонентов печати для использования в list_proschet.js
window.printComponentsSection = {
    /**
     * Основная функция для обновления секции при выборе просчёта
     * @param {number} proschetId - ID выбранного просчёта
     * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
     */
    updateForProschet: function(proschetId, rowElement) {
        updatePrintComponentsForProschet(proschetId, rowElement);
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
        return currentProschetId;
    },
    
    /**
     * Функция для получения текущих компонентов печати
     * @returns {Array} Массив компонентов печати
     */
    getCurrentComponents: function() {
        return currentPrintComponents;
    },
    
    /**
     * Останавливает наблюдение за изменениями тиража
     */
    stopObservation: stopCirculationObservation
};

console.log('✅ Секция "Печатные компоненты" загружена с исправленной синхронизацией');