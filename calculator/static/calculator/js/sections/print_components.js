/**
 * ФАЙЛ: print_components.js
 * НАЗНАЧЕНИЕ: JavaScript для секции "Печатные компоненты"
 * 
 * ОСНОВНАЯ ФОРМУЛА: (Цена печати за лист × количество прогонов) + (Цена бумаги за лист × Количество листов)
 * где количество прогонов = количество листов * (2 если двусторонняя печать, иначе 1)
 * 
 * ИЗМЕНЕНИЯ:
 * - Добавлена поддержка поля printing_mode (режим печати).
 * - В таблице добавлена новая колонка "Режим".
 * - При создании строки учитывается runs_count для отображения.
 * - Событие 'vichisliniyaListovUpdated' обрабатывается для обновления количества листов.
 */

"use strict";

// ============================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ
// ============================================================================
let currentProschetId = null;               // ID текущего выбранного просчёта
let currentComponents = [];                  // Массив текущих компонентов печати
let selectedComponentId = null;               // ID выбранного печатного компонента
let currentSheetCount = null;                 // Текущее количество листов для выбранного компонента
let sheetCountObserver = null;                 // MutationObserver для отслеживания изменений количества листов
let updateTimeout = null;                      // Таймер для отложенного обновления (дебаунс)
let abortController = null;                    // Контроллер для отмены запросов

const API_URLS = {
    getComponents: '/calculator/get-print-components/',
    updateComponentPrice: '/calculator/update-component-price/',
    recalculateAll: '/calculator/recalculate-components/'
};

const UPDATE_DELAY = 1000; // 1 секунда

// ============================================================================
// 2. ОСНОВНЫЕ ФУНКЦИИ ИНИЦИАЛИЗАЦИИ
// ============================================================================
function initPrintComponents() {
    console.log('🔄 Инициализация секции "Печатные компоненты"...');
    console.log('📝 ФОРМУЛА РАСЧЁТА: (Цена печати за лист × количество прогонов) + (Цена бумаги за лист × Количество листов)');

    setupEventListeners();
    initInterface();
    console.log('✅ Секция "Печатные компоненты" инициализирована');
}

function setupEventListeners() {
    console.log('🛠️ Настройка обработчиков событий...');
    const addBtn = document.getElementById('add-print-component-btn');
    if (addBtn) {
        addBtn.addEventListener('click', handleAddComponent);
    }
    const addFirstBtn = document.getElementById('add-first-component-btn');
    if (addFirstBtn) {
        addFirstBtn.addEventListener('click', handleAddFirstComponent);
    }
    setupIntersectionListeners();
}

function setupIntersectionListeners() {
    console.log('🔗 Настройка обработчиков событий от других секций...');

    // 1. ВЫБОР ПРОСЧЁТА (из секции "Список просчётов")
    document.addEventListener('proschetSelected', function(event) {
        console.log('📥 Получено событие выбора просчёта:', event.detail);
        if (event.detail && event.detail.proschetId) {
            updateForProschet(event.detail.proschetId, event.detail.rowElement);
        }
    });

    // 2. ИЗМЕНЕНИЕ КОЛИЧЕСТВА ЛИСТОВ ДЛЯ ОДНОГО КОМПОНЕНТА (из секции "Вычисления листов")
    document.addEventListener('vichisliniyaListovUpdated', function(event) {
        console.log('📥 Получено событие обновления количества листов для одного компонента:', event.detail);
        if (event.detail && event.detail.printComponentId) {
            // Обновляем отображение количества листов в строке таблицы
            updateSheetCountDisplayForComponent(event.detail.printComponentId, event.detail.listCount);
            // Пересчитываем цену компонента с новым количеством листов (учитывая режим печати)
            recalculateComponentPrice(event.detail.printComponentId, event.detail.listCount);
        }
    });

    // 3. ВЫБОР ПЕЧАТНОГО КОМПОНЕНТА (генерируется внутри этой же секции)
    document.addEventListener('printComponentSelected', function(event) {
        console.log('📥 Получено событие выбора печатного компонента:', event.detail);
        selectedComponentId = event.detail.printComponentId;
        if (event.detail.printComponentId) {
            initSheetCountObservation(event.detail.printComponentId);
        }
    });

    // 4. ОТМЕНА ВЫБОРА ПРОСЧЁТА
    document.addEventListener('proschetDeselected', function() {
        console.log('📥 Получено событие отмены выбора просчёта');
        resetSection();
    });

    // 5. МАССОВЫЙ ПЕРЕСЧЁТ ПРИ ИЗМЕНЕНИИ ТИРАЖА
    document.addEventListener('productCirculationSaved', function(event) {
        const { proschetId, circulation } = event.detail;
        console.log(`📥 Получено событие сохранения тиража: просчёт=${proschetId}, тираж=${circulation}`);
        if (proschetId && circulation && proschetId === currentProschetId) {
            recalculateAllComponentsForCirculation(proschetId, circulation);
        }
    });
}

function initInterface() {
    console.log('🎨 Инициализация интерфейса...');
    showNoProschetSelectedMessage();
}

// ============================================================================
// 3. ФУНКЦИЯ ОТМЕНЫ ВЫБОРА ПЕЧАТНОГО КОМПОНЕНТА
// ============================================================================
function deselectCurrentComponent() {
    if (selectedComponentId) {
        console.log(`🔄 Снятие выбора с компонента ID: ${selectedComponentId}`);
        document.querySelectorAll('#print-components-table-body tr').forEach(row => {
            row.classList.remove('selected');
        });
        const event = new CustomEvent('printComponentDeselected', {
            detail: {
                printComponentId: selectedComponentId,
                timestamp: new Date().toISOString(),
                reason: 'component_deselected'
            }
        });
        document.dispatchEvent(event);
        console.log('📤 Событие printComponentDeselected отправлено');
        selectedComponentId = null;
        currentSheetCount = null;
        stopSheetCountObservation();
        clearUpdateTimeout();
    } else {
        console.log('ℹ️ Нет выбранного компонента для отмены');
    }
}

// ============================================================================
// 4. ФУНКЦИИ ДЛЯ РАБОТЫ С СЕРВЕРОМ (API)
// ============================================================================
function loadComponentsForProschet(proschetId, signal) {
    console.log(`📡 Загрузка компонентов для просчёта ID: ${proschetId}`);
    showLoadingState();
    const url = `${API_URLS.getComponents}${proschetId}/`;
    const csrfToken = getCsrfToken();

    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrfToken
        },
        signal: signal
    })
    .then(response => {
        if (signal.aborted) throw new Error('RequestAborted');
        if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('✅ Компоненты успешно загружены:', data);
            // Сохраняем загруженные компоненты в глобальный массив
            currentComponents = data.components || [];
            // Обновляем интерфейс (таблицу) с полученными компонентами
            updateInterface(currentComponents);
            console.log(`✅ Загружено ${currentComponents.length} компонентов`);

            // Отправляем событие об обновлении компонентов для секции "Цена"
            dispatchPrintComponentsUpdated();
        } else {
            console.error('❌ Ошибка при загрузке компонентов:', data.message);
            showErrorMessage('Не удалось загрузить компоненты печати');
        }
    })
    .catch(error => {
        if (error.name === 'AbortError' || error.message === 'RequestAborted') {
            console.log('ℹ️ Запрос был отменён');
            return;
        }
        console.error('❌ Ошибка сети при загрузке компонентов:', error);
        showErrorMessage('Ошибка сети при загрузке компонентов');
    });
}

/**
 * Обновляет один компонент в массиве currentComponents новыми данными с сервера.
 * @param {Object} updatedComponentData - объект с обновлёнными данными компонента (должен содержать id)
 */
function updateCurrentComponent(updatedComponentData) {
    if (!updatedComponentData || !updatedComponentData.id) {
        console.warn('⚠️ Не удалось обновить компонент: нет ID');
        return;
    }
    const index = currentComponents.findIndex(c => c.id == updatedComponentData.id);
    if (index !== -1) {
        // Заменяем старые данные новыми (объединяем объекты)
        currentComponents[index] = { ...currentComponents[index], ...updatedComponentData };
        console.log(`✅ Компонент ID=${updatedComponentData.id} обновлён в массиве currentComponents`);
    } else {
        console.warn(`⚠️ Компонент с ID=${updatedComponentData.id} не найден в currentComponents`);
    }
}

/**
 * Отправляет событие 'printComponentsUpdated' с текущим списком компонентов.
 * Это событие используется секцией "Цена" для обновления итоговой стоимости.
 */
function dispatchPrintComponentsUpdated() {
    if (!currentProschetId) {
        console.warn('⚠️ Не выбран просчёт, событие printComponentsUpdated не отправлено');
        return;
    }
    const event = new CustomEvent('printComponentsUpdated', {
        detail: {
            proschetId: currentProschetId,
            components: currentComponents,   // отправляем полный массив компонентов
            timestamp: new Date().toISOString()
        }
    });
    document.dispatchEvent(event);
    console.log(`📤 Событие printComponentsUpdated отправлено (компонентов: ${currentComponents.length})`);
}

function recalculateComponentPrice(componentId, sheetCount) {
    console.log('🧮 НАЧИНАЮ ПЕРЕСЧЁТ СТОИМОСТИ ДЛЯ ОДНОГО КОМПОНЕНТА');
    console.log(`📊 Компонент: ${componentId}, Количество листов: ${sheetCount}`);
    if (!currentProschetId) {
        console.warn('⚠️ Не указан ID просчёта');
        showNotification('Не выбран просчёт для пересчёта стоимости', 'warning');
        return;
    }

    const url = API_URLS.updateComponentPrice;
    const requestData = {
        component_id: componentId,
        sheet_count: sheetCount,
        proschet_id: currentProschetId
    };
    const csrfToken = getCsrfToken();

    console.log('📤 Отправляю запрос на пересчёт:', { url: url, data: requestData });

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify(requestData)
    })
    .then(response => {
        if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('✅ СЕРВЕР УСПЕШНО ПЕРЕСЧИТАЛ СТОИМОСТЬ:', data);

            // Обновляем данные в текущем массиве компонентов
            if (data.component) {
                updateCurrentComponent(data.component);
            }

            // Обновляем отображение в таблице
            updateComponentInTable(componentId, data.component);
            updateTotalPrice(data.total_price);

            // Отправляем событие об обновлении компонентов
            dispatchPrintComponentsUpdated();
        } else {
            console.error('❌ Ошибка при пересчёте стоимости:', data.message);
            showNotification(`Ошибка: ${data.message}`, 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при пересчёте стоимости:', error);
        showNotification('Ошибка сети при пересчёте стоимости', 'error');
    });
}

// ============================================================================
// МАССОВЫЙ ПЕРЕСЧЁТ ВСЕХ КОМПОНЕНТОВ ПРИ ИЗМЕНЕНИИ ТИРАЖА
// ============================================================================
function recalculateAllComponentsForCirculation(proschetId, circulation) {
    console.log(`🔄 Массовый пересчёт компонентов для просчёта ID=${proschetId}, тираж=${circulation}`);
    showLoadingState();

    const csrfToken = getCsrfToken();
    const formData = new FormData();
    formData.append('circulation', circulation);

    fetch(`${API_URLS.recalculateAll}${proschetId}/`, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrfToken
        },
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('✅ Массовый пересчёт выполнен успешно', data);
            // Обновляем массив компонентов и интерфейс
            currentComponents = data.components || [];
            updateInterface(currentComponents);
            updateTotalPrice(data.total_price || calculateTotalPrice(currentComponents));

            dispatchPrintComponentsUpdated();

            showNotification(data.message || 'Компоненты пересчитаны', 'success');
        } else {
            console.error('❌ Ошибка массового пересчёта:', data.message);
            showNotification(`Ошибка: ${data.message}`, 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при массовом пересчёте:', error);
        showNotification('Ошибка сети при пересчёте компонентов', 'error');
    });
}

// ============================================================================
// 5. ФУНКЦИИ ДЛЯ ОБНОВЛЕНИЯ ПРИ ВЫБОРЕ ПРОСЧЁТА
// ============================================================================
function updateForProschet(proschetId, rowElement) {
    console.log(`🔄 Обновление секции для просчёта ID: ${proschetId}`);
    deselectCurrentComponent();
    cancelCurrentRequest();
    stopSheetCountObservation();
    clearUpdateTimeout();

    currentProschetId = proschetId;
    selectedComponentId = null;
    currentSheetCount = null;

    updateProschetTitle(rowElement);
    loadComponentsForProschet(proschetId, abortController ? abortController.signal : null);
}

function updateInterface(components) {
    console.log('🎨 Обновление интерфейса с компонентами:', components);
    hideAllMessages();

    if (components.length === 0) {
        showNoComponentsMessage();
    } else {
        showComponentsTable();
        populateTable(components);
        updateTotalPrice(calculateTotalPrice(components));
        restoreSelectedRow();
    }
    showAddButton(true);
}

/**
 * Заполняет таблицу строками компонентов.
 * @param {Array} components - массив объектов компонентов
 */
function populateTable(components) {
    const tableBody = document.getElementById('print-components-table-body');
    if (!tableBody) {
        console.error('❌ Элемент #print-components-table-body не найден');
        return;
    }
    tableBody.innerHTML = ''; // Очищаем текущее содержимое
    components.forEach((component, index) => {
        const row = createComponentRow(component, index);
        tableBody.appendChild(row);
    });
    console.log(`✅ Таблица обновлена: ${components.length} строк`);
}

/**
 * Создаёт DOM-элемент строки таблицы для одного компонента.
 * @param {Object} component - объект компонента (данные с сервера)
 * @param {number} index - индекс для определения чётности/нечётности строки
 * @returns {HTMLTableRowElement} - готовая строка для вставки в таблицу
 */
function createComponentRow(component, index) {
    const row = document.createElement('tr');
    if (index % 2 === 0) {
        row.classList.add('even-row');
    } else {
        row.classList.add('odd-row');
    }
    row.classList.add('selectable-row'); // для возможности выбора
    row.dataset.componentId = component.id; // сохраняем ID компонента в data-атрибуте

    // Определяем отображаемое значение количества листов.
    let sheetCountDisplay = 'Не указан';
    if (component.formatted_sheet_count_display && component.formatted_sheet_count_display !== 'Не указан') {
        sheetCountDisplay = component.formatted_sheet_count_display;
    } else if (component.sheet_count_display && component.sheet_count_display !== 'Не указан') {
        sheetCountDisplay = component.sheet_count_display;
    } else if (component.sheet_count) {
        sheetCountDisplay = parseFloat(component.sheet_count).toFixed(2);
    }

    // Извлекаем цены для подсказок
    const pricePerSheet = parseFloat(component.price_per_sheet) || 0;
    const paperPrice = parseFloat(component.paper_price) || 0;
    const runsCount = component.runs_count || 0;
    // Формула теперь с прогонами
    const formulaTooltip = `Формула: (${pricePerSheet.toFixed(2)} руб./печать × ${runsCount} прогонов) + (${paperPrice.toFixed(2)} руб./бумага × ${sheetCountDisplay} листов)`;

    // Текстовое отображение режима
    let modeDisplay = '';
    if (component.printing_mode === 'duplex') {
        modeDisplay = 'Двуст.';
    } else {
        modeDisplay = 'Одност.';
    }

    // Заполняем HTML-содержимое строки с учётом новой колонки "Режим"
    row.innerHTML = `
        <td class="component-number" title="Уникальный номер компонента">${component.number || '—'}</td>
        <td class="component-printer" title="Выбранное печатное оборудование">${component.printer_name || 'Принтер не выбран'}</td>
        <td class="component-paper" title="Выбранный материал (бумага)">
            ${component.paper_name || 'Бумага не выбрана'}
            ${paperPrice ? `<br><small>${paperPrice.toFixed(2)} ₽/лист</small>` : ''}
        </td>
        <td class="component-sheet-count" title="Количество листов из секции 'Вычисления листов'">${sheetCountDisplay}</td>
        <td class="component-price" title="Цена печати одного листа (рассчитана интерполяцией)">${pricePerSheet.toFixed(2)} ₽</td>
        <!-- НОВАЯ ЯЧЕЙКА: Режим печати -->
        <td class="component-mode" title="Режим печати: ${component.printing_mode_display || (component.printing_mode === 'duplex' ? 'двусторонняя' : 'односторонняя')}">
            ${modeDisplay}
        </td>
        <td class="component-total" title="${formulaTooltip}">${parseFloat(component.total_circulation_price).toFixed(2)} ₽</td>
        <td class="component-actions">
            <button type="button" class="delete-component-btn" 
                    title="Удалить компонент" 
                    data-component-id="${component.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;

    // Обработчик клика по строке – выбор компонента
    row.addEventListener('click', function(event) {
        // Игнорируем клик по кнопке удаления
        if (!event.target.closest('.delete-component-btn')) {
            // Снимаем выделение со всех строк
            document.querySelectorAll('#print-components-table-body tr').forEach(r => {
                r.classList.remove('selected');
            });
            this.classList.add('selected'); // выделяем текущую строку
            selectedComponentId = component.id;
            currentSheetCount = component.sheet_count || 0;

            // Формируем данные для события выбора компонента
            const eventDetail = {
                printComponentId: component.id,
                printComponentNumber: component.number,
                printerName: component.printer_name,
                paperName: component.paper_name,
                paperPrice: paperPrice,
                proschetId: currentProschetId,
                sheetCount: component.sheet_count || 0,
                pricePerSheet: pricePerSheet,
                printingMode: component.printing_mode, // передаём режим
                formula: '(price_per_sheet * runs_count) + (paper_price * sheet_count)'
            };
            document.dispatchEvent(new CustomEvent('printComponentSelected', { detail: eventDetail }));
            console.log(`📤 Событие printComponentSelected отправлено для компонента: ${component.id}`);
            // Начинаем наблюдение за изменением количества листов в секции вычислений
            initSheetCountObservation(component.id);
        }
    });

    // Обработчик для кнопки удаления
    const deleteBtn = row.querySelector('.delete-component-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation(); // предотвращаем всплытие клика на строку
            const componentId = this.dataset.componentId;
            if (confirm(`Удалить компонент ${component.number || componentId}?`)) {
                deleteComponent(componentId);
            }
        });
    }

    return row;
}

/**
 * Восстанавливает выделение строки выбранного компонента после перестройки таблицы.
 */
function restoreSelectedRow() {
    if (selectedComponentId) {
        const row = document.querySelector(`#print-components-table-body tr[data-component-id="${selectedComponentId}"]`);
        if (row) {
            row.classList.add('selected');
        } else {
            selectedComponentId = null;
            currentSheetCount = null;
        }
    }
}

/**
 * Обновляет отображение количества листов в строке конкретного компонента.
 * @param {string|number} componentId - ID компонента
 * @param {number} sheetCount - новое количество листов
 */
function updateSheetCountDisplayForComponent(componentId, sheetCount) {
    console.log(`📊 Обновление отображения количества листов для компонента ${componentId}: ${sheetCount}`);
    const componentRow = document.querySelector(`tr[data-component-id="${componentId}"]`);
    if (!componentRow) {
        console.log(`ℹ️ Строка для компонента ${componentId} не найдена, обновление количества листов пропущено`);
        return;
    }
    const sheetCountCell = componentRow.querySelector('.component-sheet-count');
    if (sheetCountCell) {
        // Форматируем количество листов с двумя знаками после запятой и пробелами как разделителями тысяч
        const formattedSheetCount = parseFloat(sheetCount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        sheetCountCell.textContent = formattedSheetCount;
        sheetCountCell.title = `Количество листов из секции 'Вычисления листов': ${formattedSheetCount}`;
    }
}

/**
 * Обновляет отображение всех полей компонента в таблице на основе переданных данных.
 * @param {string|number} componentId - ID компонента
 * @param {Object} componentData - обновлённые данные компонента (с сервера)
 */
function updateComponentInTable(componentId, componentData) {
    // Если идёт inline-редактирование, пропускаем обновление, чтобы не сбивать интерфейс
    if (window.printComponentsInlineEditState?.isEditing() && 
        window.printComponentsInlineEditState.getEditingComponentId() === componentId) {
        console.log(`🛑 Пропускаем обновление таблицы для компонента ${componentId}, так как идёт редактирование`);
        return;
    }

    console.log(`📊 Обновление отображения для компонента ${componentId}`);
    const componentRow = document.querySelector(`tr[data-component-id="${componentId}"]`);
    if (!componentRow) {
        console.log(`ℹ️ Строка для компонента ${componentId} не найдена, возможно компонент уже не отображается`);
        return;
    }

    // Извлекаем обновлённые значения
    const pricePerSheet = parseFloat(componentData.price_per_sheet) || 0;
    const paperPrice = parseFloat(componentData.paper_price) || 0;
    const sheetCount = parseFloat(componentData.sheet_count) || 0;
    const totalPrice = parseFloat(componentData.total_circulation_price) || 0;
    const runsCount = componentData.runs_count || (sheetCount * (componentData.printing_mode === 'duplex' ? 2 : 1));
    const printingMode = componentData.printing_mode || 'single';
    const modeDisplay = (printingMode === 'duplex') ? 'Двуст.' : 'Одност.';

    // Обновляем ячейку с названием бумаги и ценой за лист
    const paperCell = componentRow.querySelector('.component-paper');
    if (paperCell && componentData.paper_name) {
        paperCell.innerHTML = `
            ${componentData.paper_name}
            ${paperPrice ? `<br><small>${paperPrice.toFixed(2)} ₽/лист</small>` : ''}
        `;
    }

    // Обновляем ячейку с количеством листов
    const sheetCountCell = componentRow.querySelector('.component-sheet-count');
    if (sheetCountCell) {
        const formattedSheetCount = sheetCount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        sheetCountCell.textContent = formattedSheetCount;
        sheetCountCell.title = `Количество листов из секции 'Вычисления листов': ${formattedSheetCount}`;
    }

    // Обновляем ячейку с ценой за лист
    const priceCell = componentRow.querySelector('.component-price');
    if (priceCell) {
        const formattedPrice = pricePerSheet.toFixed(2) + ' ₽';
        priceCell.textContent = formattedPrice;
        priceCell.title = `Цена печати одного листа: ${formattedPrice}`;
    }

    // Обновляем ячейку с режимом печати
    const modeCell = componentRow.querySelector('.component-mode');
    if (modeCell) {
        modeCell.textContent = modeDisplay;
        modeCell.title = `Режим печати: ${componentData.printing_mode_display || (printingMode === 'duplex' ? 'двусторонняя' : 'односторонняя')}`;
    }

    // Обновляем ячейку с общей стоимостью
    const totalCell = componentRow.querySelector('.component-total');
    if (totalCell) {
        const formattedTotal = totalPrice.toFixed(2) + ' ₽';
        totalCell.textContent = formattedTotal;
        const formulaTooltip = `Формула: (${pricePerSheet.toFixed(2)} руб./печать × ${runsCount} прогонов) + (${paperPrice.toFixed(2)} руб./бумага × ${sheetCount} листов)`;
        totalCell.title = formulaTooltip;
    }

    console.log(`✅ Отображение для компонента ${componentId} обновлено`);
}

function updateTotalPrice(totalPrice) {
    console.log(`💰 Обновление общей стоимости: ${totalPrice} руб.`);
    const totalPriceElement = document.getElementById('print-components-total-price');
    const totalContainer = document.getElementById('print-components-total');
    if (totalPriceElement) {
        totalPriceElement.textContent = `${parseFloat(totalPrice).toFixed(2)} ₽`;
    }
    if (totalContainer) {
        totalContainer.style.display = 'block';
    }
}

function calculateTotalPrice(components) {
    let total = 0;
    components.forEach(component => {
        if (component.total_circulation_price) {
            total += parseFloat(component.total_circulation_price);
        }
    });
    return total;
}

// ============================================================================
// 6. ОБРАБОТЧИКИ СОБЫТИЙ И КНОПОК
// ============================================================================
function handleAddComponent() {
    console.log('🖨️ Добавление нового компонента');
    if (!currentProschetId) {
        showNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    if (typeof window.print_components_handle_add_component === 'function') {
        window.print_components_handle_add_component();
    } else {
        showNotification('Функция добавления компонента не загружена', 'error');
    }
}

function handleAddFirstComponent() {
    console.log('🖨️ Добавление первого компонента');
    handleAddComponent();
}

// ============================================================================
// 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================
function initSheetCountObservation(componentId) {
    console.log(`👁️ Инициализация наблюдения для компонента ${componentId}`);
    clearUpdateTimeout();
    stopSheetCountObservation();

    const sheetCountElement = document.getElementById('vichisliniya-listov-result-value');
    if (!sheetCountElement) {
        console.warn('⚠️ Элемент с количеством листов не найден');
        return;
    }

    const sheetCountText = sheetCountElement.textContent.trim();
    const initialSheetCount = parseFloat(sheetCountText);
    if (isNaN(initialSheetCount)) {
        console.warn('⚠️ Не удалось извлечь количество листов:', sheetCountText);
        return;
    }

    console.log(`📊 Начальное количество листов: ${initialSheetCount}`);
    currentSheetCount = initialSheetCount;

    const observerCallback = function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
                const newText = sheetCountElement.textContent.trim();
                const newSheetCount = parseFloat(newText);
                if (isNaN(newSheetCount)) return;
                if (newSheetCount !== currentSheetCount) {
                    console.log(`🔄 Обнаружено изменение: ${currentSheetCount} → ${newSheetCount}`);
                    currentSheetCount = newSheetCount;
                    updateSheetCountDisplayForComponent(componentId, newSheetCount);
                    if (selectedComponentId === componentId) {
                        schedulePriceUpdate(componentId, newSheetCount);
                    }
                }
            }
        });
    };

    sheetCountObserver = new MutationObserver(observerCallback);
    sheetCountObserver.observe(sheetCountElement, {
        childList: true,
        characterData: true,
        subtree: true
    });
    console.log(`✅ Наблюдение установлено для компонента ${componentId}`);
}

function schedulePriceUpdate(componentId, sheetCount) {
    console.log(`⏰ Запуск отложенного обновления для компонента ${componentId}`);
    if (componentId !== selectedComponentId) {
        console.log(`ℹ️ Компонент ${componentId} уже не выбран, пропускаем отложенное обновление`);
        return;
    }
    clearUpdateTimeout();
    updateTimeout = setTimeout(() => {
        recalculateComponentPrice(componentId, sheetCount);
    }, UPDATE_DELAY);
}

function stopSheetCountObservation() {
    if (sheetCountObserver) {
        sheetCountObserver.disconnect();
        sheetCountObserver = null;
        console.log('🛑 Наблюдение остановлено');
    }
    clearUpdateTimeout();
}

function clearUpdateTimeout() {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }
}

function cancelCurrentRequest() {
    if (abortController) {
        abortController.abort();
        console.log('🛑 Текущий запрос отменён');
    }
    abortController = new AbortController();
}

function getCsrfToken() {
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken && metaToken.getAttribute('content')) {
        return metaToken.getAttribute('content');
    }
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith('csrftoken=')) {
            return decodeURIComponent(cookie.substring('csrftoken='.length));
        }
    }
    console.warn('⚠️ CSRF токен не найден');
    return '';
}

function showNotification(message, type = 'info') {
    console.log(`💬 Уведомление [${type}]: ${message}`);
    const notification = document.createElement('div');
    let backgroundColor = '#2196F3';
    let icon = 'ℹ️';
    if (type === 'success') { backgroundColor = '#4CAF50'; icon = '✅'; }
    else if (type === 'error') { backgroundColor = '#F44336'; icon = '❌'; }
    else if (type === 'warning') { backgroundColor = '#FF9800'; icon = '⚠️'; }
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${backgroundColor};
        color: white;
        border-radius: 4px;
        z-index: 10000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        max-width: 300px;
        word-wrap: break-word;
        font-family: Arial, sans-serif;
        transition: opacity 0.3s;
        opacity: 0;
    `;
    notification.textContent = `${icon} ${message}`;
    document.body.appendChild(notification);
    setTimeout(() => { notification.style.opacity = '1'; }, 10);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
    }, 5000);
}

// ============================================================================
// 8. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА
// ============================================================================
function showNoProschetSelectedMessage() {
    console.log('ℹ️ Показ сообщения "Выберите просчёт"');
    const elements = {
        noProschet: document.getElementById('no-proschet-selected-print'),
        noComponents: document.getElementById('no-components-message'),
        container: document.getElementById('print-components-container'),
        addButton: document.getElementById('add-print-component-btn'),
        title: document.getElementById('print-components-proschet-title')
    };
    if (elements.noProschet) elements.noProschet.style.display = 'block';
    if (elements.noComponents) elements.noComponents.style.display = 'none';
    if (elements.container) elements.container.style.display = 'none';
    if (elements.addButton) elements.addButton.style.display = 'none';
    if (elements.title) {
        elements.title.innerHTML = `<span class="placeholder-text">(просчёт не выбран)</span>`;
    }
    currentProschetId = null;
    currentComponents = [];
    selectedComponentId = null;
    currentSheetCount = null;
    cancelCurrentRequest();
    stopSheetCountObservation();
    clearUpdateTimeout();
}

function showNoComponentsMessage() {
    console.log('ℹ️ Показ сообщения "Нет компонентов"');
    const elements = {
        noProschet: document.getElementById('no-proschet-selected-print'),
        noComponents: document.getElementById('no-components-message'),
        container: document.getElementById('print-components-container')
    };
    if (elements.noProschet) elements.noProschet.style.display = 'none';
    if (elements.noComponents) elements.noComponents.style.display = 'block';
    if (elements.container) elements.container.style.display = 'none';
}

function showComponentsTable() {
    console.log('ℹ️ Показ таблицы компонентов');
    const elements = {
        noProschet: document.getElementById('no-proschet-selected-print'),
        noComponents: document.getElementById('no-components-message'),
        container: document.getElementById('print-components-container')
    };
    if (elements.noProschet) elements.noProschet.style.display = 'none';
    if (elements.noComponents) elements.noComponents.style.display = 'none';
    if (elements.container) elements.container.style.display = 'block';
}

function showLoadingState() {
    console.log('⏳ Показ состояния загрузки');
    const elements = {
        noProschet: document.getElementById('no-proschet-selected-print'),
        noComponents: document.getElementById('no-components-message'),
        container: document.getElementById('print-components-container'),
        tableBody: document.getElementById('print-components-table-body')
    };
    if (elements.noProschet) elements.noProschet.style.display = 'none';
    if (elements.noComponents) elements.noComponents.style.display = 'none';
    if (elements.container) {
        elements.container.style.display = 'block';
    }
    if (elements.tableBody) {
        elements.tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p>Загрузка компонентов печати...</p>
                    <p class="loading-note">Используется "Количество листов" из секции "Вычисления листов"</p>
                </td>
            </tr>
        `;
    }
}

function showErrorMessage(message) {
    console.log(`❌ Показ ошибки: ${message}`);
    const tableBody = document.getElementById('print-components-table-body');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p>${message}</p>
                </td>
            </tr>
        `;
    }
}

function hideAllMessages() {
    console.log('🔧 Скрытие всех сообщений');
    const elements = {
        noProschet: document.getElementById('no-proschet-selected-print'),
        noComponents: document.getElementById('no-components-message'),
        container: document.getElementById('print-components-container')
    };
    if (elements.noProschet) elements.noProschet.style.display = 'none';
    if (elements.noComponents) elements.noComponents.style.display = 'none';
    if (elements.container) elements.container.style.display = 'none';
}

function showAddButton(show) {
    const addButton = document.getElementById('add-print-component-btn');
    if (addButton) {
        addButton.style.display = show ? 'inline-block' : 'none';
    }
}

function updateProschetTitle(rowElement) {
    const proschetTitleElement = document.getElementById('print-components-proschet-title');
    if (!proschetTitleElement) {
        console.warn('❌ Элемент заголовка не найден');
        return;
    }
    const titleCell = rowElement.querySelector('.proschet-title');
    if (!titleCell) {
        console.warn('❌ Ячейка с названием не найдена');
        return;
    }
    const proschetTitle = titleCell.textContent.trim();
    proschetTitleElement.innerHTML = `
        <span class="proschet-title-active">
            ${proschetTitle}
        </span>
    `;
    console.log(`✅ Заголовок обновлён: "${proschetTitle}"`);
}

function resetSection() {
    console.log('🔄 Сброс секции "Печатные компоненты"');
    deselectCurrentComponent();
    currentProschetId = null;
    currentComponents = [];
    showNoProschetSelectedMessage();
    cancelCurrentRequest();
    stopSheetCountObservation();
    clearUpdateTimeout();
    console.log('✅ Секция сброшена');
}

// ============================================================================
// 9. ФУНКЦИИ ДЛЯ УДАЛЕНИЯ КОМПОНЕНТОВ
// ============================================================================
function deleteComponent(componentId) {
    console.log(`🗑️ Удаление компонента ${componentId}`);
    // TODO: Реализовать удаление через API
    showNotification(`Удаление компонента ${componentId} (в разработке)`, 'info');
}

// ============================================================================
// 10. ЭКСПОРТ ФУНКЦИЙ И ИНИЦИАЛИЗАЦИЯ
// ============================================================================
window.printComponentsSection = {
    updateForProschet: updateForProschet,
    reset: resetSection,
    getCurrentProschetId: () => currentProschetId,
    getCurrentComponents: () => currentComponents,
    stopObservation: stopSheetCountObservation,
    cancelCurrentRequest: cancelCurrentRequest,
    deselectCurrentComponent: deselectCurrentComponent,
    updateComponentsData: function(components) {
        console.log(`📦 Обновление данных для ${components.length} компонентов`);
        components.forEach(component => {
            updateComponentInTable(component.id, component);
            updateCurrentComponent(component);
        });
        const total = calculateTotalPrice(components);
        updateTotalPrice(total);
        dispatchPrintComponentsUpdated();
    },
    recalculateComponentPrice: recalculateComponentPrice,
    recalculateAllComponentsForCirculation: recalculateAllComponentsForCirculation,
    dispatchUpdateEvent: dispatchPrintComponentsUpdated
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 DOM загружен, инициализация секции "Печатные компоненты"...');
    initPrintComponents();
    console.log('✅ Секция "Печатные компоненты" готова к работе');
});