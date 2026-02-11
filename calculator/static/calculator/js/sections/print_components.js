/**
 * ФАЙЛ: print_components.js
 * НАЗНАЧЕНИЕ: JavaScript для секции "Печатные компоненты"
 * 
 * ВАЖНОЕ ОБНОВЛЕНИЕ: Система рассчитывает стоимость по формуле:
 * (Цена печати за лист + Цена бумаги за лист) × Количество листов
 * 
 * ИСПРАВЛЕНО: Теперь при смене просчёта или сбросе секции генерируется
 * событие 'printComponentDeselected', чтобы другие секции (например,
 * "Вычисления листов") могли корректно сбросить своё состояние.
 * 
 * ПОДРОБНЫЕ КОММЕНТАРИИ: Каждая строка объяснена для новичков.
 */

"use strict"; // Строгий режим – запрещает небезопасные действия

// ============================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ
// ============================================================================

/**
 * ID текущего выбранного просчёта.
 * @type {string|null}
 */
let currentProschetId = null;

/**
 * Массив текущих компонентов печати.
 * @type {Array}
 */
let currentComponents = [];

/**
 * ID выбранного печатного компонента.
 * @type {string|null}
 */
let selectedComponentId = null;

/**
 * Текущее количество листов для выбранного компонента (из vichisliniya_listov).
 * @type {number|null}
 */
let currentSheetCount = null;

/**
 * MutationObserver для отслеживания изменений количества листов в секции "Вычисления листов".
 * @type {MutationObserver|null}
 */
let sheetCountObserver = null;

/**
 * Таймер для отложенного обновления (дебаунс).
 * @type {number|null}
 */
let updateTimeout = null;

/**
 * Контроллер для отмены запросов.
 * @type {AbortController|null}
 */
let abortController = null;

/**
 * URL для API запросов.
 * @type {Object}
 */
const API_URLS = {
    getComponents: '/calculator/get-print-components/',   // GET-запрос: список компонентов
    updateComponentPrice: '/calculator/update-component-price/' // POST-запрос: пересчёт стоимости
};

/**
 * Задержка для обновления стоимости (в миллисекундах).
 * Используется для оптимизации – не отправляем запрос при каждом нажатии клавиши.
 * @type {number}
 */
const UPDATE_DELAY = 1000; // 1 секунда

// ============================================================================
// 2. ОСНОВНЫЕ ФУНКЦИИ ИНИЦИАЛИЗАЦИИ
// ============================================================================

/**
 * Инициализация секции при загрузке страницы.
 * Вызывается один раз, когда DOM полностью построен.
 */
function initPrintComponents() {
    console.log('🔄 Инициализация секции "Печатные компоненты"...');
    console.log('📝 ФОРМУЛА РАСЧЁТА: (Цена печати за лист + Цена бумаги за лист) × Количество листов');
    
    // Устанавливаем обработчики событий для кнопок внутри секции
    setupEventListeners();
    
    // Инициализируем интерфейс – показываем сообщение «просчёт не выбран»
    initInterface();
    
    console.log('✅ Секция "Печатные компоненты" инициализирована');
    console.log('ℹ️ Ожидание событий от других секций...');
}

/**
 * Настройка обработчиков событий внутри секции.
 */
function setupEventListeners() {
    console.log('🛠️ Настройка обработчиков событий...');
    
    // Кнопка "Добавить" (основная)
    const addBtn = document.getElementById('add-print-component-btn');
    if (addBtn) {
        addBtn.addEventListener('click', handleAddComponent);
        console.log('✅ Обработчик для кнопки "Добавить компонент" установлен');
    }
    
    // Кнопка "Добавить первый компонент" (показывается, когда компонентов нет)
    const addFirstBtn = document.getElementById('add-first-component-btn');
    if (addFirstBtn) {
        addFirstBtn.addEventListener('click', handleAddFirstComponent);
        console.log('✅ Обработчик для кнопки "Добавить первый компонент" установлен');
    }
    
    // Подписка на события от других секций (выбор просчёта, обновление листов и т.д.)
    setupIntersectionListeners();
}

/**
 * Настройка обработчиков событий от других секций.
 * Именно здесь мы связываем секцию "Печатные компоненты" с остальными частями системы.
 */
function setupIntersectionListeners() {
    console.log('🔗 Настройка обработчиков событий от других секций...');
    
    // ------------------------------------------------------------
    // 1. СОБЫТИЕ ВЫБОРА ПРОСЧЁТА (из секции "Список просчётов")
    // ------------------------------------------------------------
    document.addEventListener('proschetSelected', function(event) {
        console.log('📥 Получено событие выбора просчёта:', event.detail);
        if (event.detail && event.detail.proschetId) {
            updateForProschet(event.detail.proschetId, event.detail.rowElement);
        }
    });
    
    // ------------------------------------------------------------
    // 2. СОБЫТИЕ ИЗМЕНЕНИЯ КОЛИЧЕСТВА ЛИСТОВ (из секции "Вычисления листов")
    // ------------------------------------------------------------
    document.addEventListener('vichisliniyaListovUpdated', function(event) {
        console.log('📥 Получено событие обновления количества листов:', event.detail);
        // Проверяем, что событие относится к текущему выбранному компоненту
        if (event.detail && event.detail.printComponentId === selectedComponentId) {
            console.log(`🔄 Обновление стоимости для компонента ${event.detail.printComponentId}`);
            currentSheetCount = event.detail.listCount;
            updateSheetCountDisplay(event.detail.listCount);
            recalculateComponentPrice(event.detail.printComponentId, event.detail.listCount);
        } else {
            console.log(`ℹ️ Событие не для текущего компонента. Текущий: ${selectedComponentId}, событие: ${event.detail?.printComponentId}`);
        }
    });
    
    // ------------------------------------------------------------
    // 3. СОБЫТИЕ ВЫБОРА ПЕЧАТНОГО КОМПОНЕНТА (генерируется внутри этой же секции)
    // ------------------------------------------------------------
    document.addEventListener('printComponentSelected', function(event) {
        console.log('📥 Получено событие выбора печатного компонента:', event.detail);
        selectedComponentId = event.detail.printComponentId;
        if (event.detail.printComponentId) {
            initSheetCountObservation(event.detail.printComponentId);
        }
    });
    
    // ------------------------------------------------------------
    // 4. СОБЫТИЕ ОТМЕНЫ ВЫБОРА ПРОСЧЁТА
    // ------------------------------------------------------------
    document.addEventListener('proschetDeselected', function() {
        console.log('📥 Получено событие отмены выбора просчёта');
        resetSection();
    });
}

/**
 * Инициализация интерфейса – сразу после загрузки показываем сообщение
 * «Выберите просчёт», скрываем всё остальное.
 */
function initInterface() {
    console.log('🎨 Инициализация интерфейса...');
    showNoProschetSelectedMessage();
}

// ============================================================================
// 3. [ИСПРАВЛЕНО] ФУНКЦИЯ ОТМЕНЫ ВЫБОРА ПЕЧАТНОГО КОМПОНЕНТА
// ============================================================================

/**
 * Снимает выделение с текущего печатного компонента и генерирует событие
 * 'printComponentDeselected', чтобы другие секции (например, "Вычисления листов")
 * узнали об этом и сбросили своё состояние.
 * 
 * Это ключевое изменение для синхронизации секций.
 */
function deselectCurrentComponent() {
    // Если компонент действительно был выбран
    if (selectedComponentId) {
        console.log(`🔄 Снятие выбора с компонента ID: ${selectedComponentId}`);
        
        // Удаляем класс 'selected' со всех строк таблицы компонентов
        // Это визуально убирает подсветку выбранной строки
        document.querySelectorAll('#print-components-table-body tr').forEach(row => {
            row.classList.remove('selected');
        });

        // Создаём пользовательское событие с данными о том, какой компонент был отменён
        const event = new CustomEvent('printComponentDeselected', {
            detail: {
                printComponentId: selectedComponentId,
                timestamp: new Date().toISOString(),
                reason: 'component_deselected' // причина: ручное снятие выбора
            }
        });
        // Отправляем событие глобально – все секции его увидят
        document.dispatchEvent(event);
        console.log('📤 Событие printComponentDeselected отправлено');

        // Сбрасываем глобальные переменные, связанные с выбором
        selectedComponentId = null;
        currentSheetCount = null;

        // Останавливаем наблюдение за количеством листов (чтобы не было утечек памяти)
        stopSheetCountObservation();
        // Очищаем таймер отложенного обновления
        clearUpdateTimeout();
    } else {
        console.log('ℹ️ Нет выбранного компонента для отмены');
    }
}

// ============================================================================
// 4. ФУНКЦИИ ДЛЯ РАБОТЫ С СЕРВЕРОМ (API)
// ============================================================================

/**
 * Загрузка компонентов печати для указанного просчёта.
 * @param {string} proschetId - ID просчёта
 * @param {AbortSignal} signal - Сигнал для отмены запроса
 */
function loadComponentsForProschet(proschetId, signal) {
    console.log(`📡 Загрузка компонентов для просчёта ID: ${proschetId}`);
    
    // Показываем состояние загрузки (спиннер)
    showLoadingState();
    
    // Формируем URL для GET-запроса
    const url = `${API_URLS.getComponents}${proschetId}/`;
    
    // Получаем CSRF-токен для защиты от межсайтовой подделки запросов
    const csrfToken = getCsrfToken();
    
    // Отправляем асинхронный запрос
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest', // помечаем как AJAX-запрос
            'X-CSRFToken': csrfToken
        },
        signal: signal // позволяет отменить запрос, если пользователь переключился быстрее
    })
    .then(response => {
        if (signal.aborted) {
            throw new Error('RequestAborted');
        }
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('✅ Компоненты успешно загружены:', data);
            currentComponents = data.components || [];
            updateInterface(data.components || []);
            console.log(`✅ Загружено ${currentComponents.length} компонентов`);
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
 * Пересчёт стоимости компонента на основе нового количества листов.
 * 
 * @param {string} componentId - ID компонента
 * @param {number} sheetCount - Новое количество листов (из vichisliniya_listov)
 */
function recalculateComponentPrice(componentId, sheetCount) {
    console.log('🧮 НАЧИНАЮ ПЕРЕСЧЁТ СТОИМОСТИ');
    console.log(`📊 Компонент: ${componentId}`);
    console.log(`📊 Количество листов: ${sheetCount}`);
    console.log('📝 ФОРМУЛА: (Цена печати за лист + Цена бумаги за лист) × Количество листов');
    
    // Проверяем, что пересчёт делается для текущего компонента
    if (componentId !== selectedComponentId) {
        console.warn(`⚠️ Пропускаем пересчёт: запрошен для компонента ${componentId}, а текущий ${selectedComponentId}`);
        return;
    }
    
    // Проверяем, что есть ID просчёта
    if (!currentProschetId) {
        console.warn('⚠️ Не указан ID просчёта');
        showNotification('Не выбран просчёт для пересчёта стоимости', 'warning');
        return;
    }
    
    // Формируем URL для POST-запроса
    const url = API_URLS.updateComponentPrice;
    
    // Подготавливаем данные для отправки на сервер
    const requestData = {
        component_id: componentId,
        sheet_count: sheetCount,
        proschet_id: currentProschetId
    };
    
    const csrfToken = getCsrfToken();
    
    console.log('📤 Отправляю запрос на пересчёт:', {
        url: url,
        data: requestData,
        formula: '(price_per_sheet + paper_price) * sheet_count'
    });
    
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
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`URL не найден: ${url}. Проверьте настройки сервера.`);
            }
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('✅ СЕРВЕР УСПЕШНО ПЕРЕСЧИТАЛ СТОИМОСТЬ:', data);
            console.log('📊 РЕЗУЛЬТАТЫ ПЕРЕСЧЁТА:');
            console.log(`   • Количество листов: ${sheetCount}`);
            console.log(`   • Цена печати за лист: ${data.component.price_per_sheet} руб.`);
            console.log(`   • Цена бумаги за лист: ${data.component.paper_price} руб.`);
            console.log(`   • Общая стоимость: ${data.component.total_price} руб.`);
            console.log(`   • Формула: (${data.component.price_per_sheet} + ${data.component.paper_price}) × ${sheetCount}`);
            
            // Обновляем отображение стоимости в таблице
            updateComponentInTable(componentId, data.component);
            // Обновляем общую стоимость всех компонентов
            updateTotalPrice(data.total_price);
            
            // Показываем уведомление с формулой
            const formulaText = `(${data.component.price_per_sheet.toFixed(2)} + ${data.component.paper_price.toFixed(2)}) × ${sheetCount}`;
            showNotification(
                `Стоимость пересчитана: ${formulaText} = ${data.component.total_price.toFixed(2)} руб.`, 
                'success'
            );
            
            // Отправляем событие об успешном обновлении цены (для других секций, если нужно)
            const event = new CustomEvent('componentPriceRecalculated', {
                detail: {
                    componentId: componentId,
                    sheetCount: sheetCount,
                    pricePerSheet: data.component.price_per_sheet,
                    paperPrice: data.component.paper_price,
                    totalPrice: data.component.total_price,
                    calculationFormula: 'total = (price_per_sheet + paper_price) * sheet_count'
                }
            });
            document.dispatchEvent(event);
        } else {
            console.error('❌ Ошибка при пересчёте стоимости:', data.message);
            showNotification(`Ошибка: ${data.message}`, 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при пересчёте стоимости:', error);
        let errorMessage = 'Ошибка сети при пересчёте стоимости';
        if (error.message.includes('404')) {
            errorMessage = 'Сервер не отвечает. Проверьте настройки маршрутов.';
        }
        showNotification(errorMessage, 'error');
    });
}

// ============================================================================
// 5. [ИСПРАВЛЕНО] ФУНКЦИИ ДЛЯ ОБНОВЛЕНИЯ ПРИ ВЫБОРЕ ПРОСЧЁТА
// ============================================================================

/**
 * Обновление секции для выбранного просчёта.
 * Вызывается при выборе просчёта в таблице.
 * 
 * @param {string} proschetId - ID просчёта
 * @param {HTMLElement} rowElement - Элемент строки таблицы
 */
function updateForProschet(proschetId, rowElement) {
    console.log(`🔄 Обновление секции для просчёта ID: ${proschetId}`);

    // [ИСПРАВЛЕНО] Сначала снимаем выделение с текущего компонента,
    // чтобы другие секции узнали о его отмене.
    deselectCurrentComponent();

    // Отменяем предыдущие запросы (если были)
    cancelCurrentRequest();
    
    // Останавливаем наблюдение за количеством листов (для старого компонента)
    stopSheetCountObservation();
    
    // Очищаем таймер отложенного обновления
    clearUpdateTimeout();
    
    // Сохраняем ID текущего просчёта
    currentProschetId = proschetId;
    
    // Сбрасываем выбранный компонент (уже сделано в deselectCurrentComponent,
    // но для надёжности дублируем)
    selectedComponentId = null;
    currentSheetCount = null;
    
    // Обновляем заголовок секции – показываем название выбранного просчёта
    updateProschetTitle(rowElement);
    
    // Загружаем компоненты для нового просчёта
    loadComponentsForProschet(proschetId, abortController ? abortController.signal : null);
}

/**
 * Обновление интерфейса с компонентами.
 * 
 * @param {Array} components - Массив компонентов
 */
function updateInterface(components) {
    console.log('🎨 Обновление интерфейса с компонентами:', components);
    
    // Скрываем все сообщения (загрузка, ошибка, пусто)
    hideAllMessages();
    
    if (components.length === 0) {
        // Если компонентов нет – показываем специальное сообщение
        showNoComponentsMessage();
    } else {
        // Иначе отображаем таблицу с компонентами
        showComponentsTable();
        populateTable(components);
        updateTotalPrice(calculateTotalPrice(components));
    }
    
    // Показываем кнопку "Добавить" (она всегда должна быть видна, если просчёт выбран)
    showAddButton(true);
}

/**
 * Заполнение таблицы компонентами.
 * 
 * @param {Array} components - Массив компонентов
 */
function populateTable(components) {
    const tableBody = document.getElementById('print-components-table-body');
    if (!tableBody) {
        console.error('❌ Элемент #print-components-table-body не найден');
        return;
    }
    
    tableBody.innerHTML = ''; // Очищаем таблицу
    
    components.forEach((component, index) => {
        const row = createComponentRow(component, index);
        tableBody.appendChild(row);
    });
    
    console.log(`✅ Таблица обновлена: ${components.length} строк`);
}

/**
 * Создание строки таблицы для компонента.
 * 
 * @param {Object} component - Объект компонента
 * @param {number} index - Индекс компонента (для чередования цвета строк)
 * @returns {HTMLElement} - Элемент строки таблицы
 */
function createComponentRow(component, index) {
    const row = document.createElement('tr');
    
    // Чередование фона строк для лучшей читаемости
    if (index % 2 === 0) {
        row.classList.add('even-row');
    } else {
        row.classList.add('odd-row');
    }
    
    // Добавляем класс, делающий строку кликабельной
    row.classList.add('selectable-row');
    // Сохраняем ID компонента в data-атрибуте
    row.dataset.componentId = component.id;
    
    // Определяем, как отображать количество листов
    let sheetCountDisplay = 'Не указан';
    if (component.formatted_sheet_count_display && component.formatted_sheet_count_display !== 'Не указан') {
        sheetCountDisplay = component.formatted_sheet_count_display;
    } else if (component.sheet_count_display && component.sheet_count_display !== 'Не указан') {
        sheetCountDisplay = component.sheet_count_display;
    } else if (component.sheet_count) {
        sheetCountDisplay = component.sheet_count;
    }
    
    // Подсказка с формулой расчёта (будет видна при наведении на ячейку стоимости)
    const formulaTooltip = `Формула: (${component.price_per_sheet || '0.00'} руб./печать + ${component.paper_price || '0.00'} руб./бумага) × ${sheetCountDisplay} листов`;
    
    // Формируем HTML-содержимое строки
    row.innerHTML = `
        <td class="component-number" title="Уникальный номер компонента">${component.number || '—'}</td>
        <td class="component-printer" title="Выбранное печатное оборудование">${component.printer_name || 'Принтер не выбран'}</td>
        <td class="component-paper" title="Выбранный материал (бумага)">
            ${component.paper_name || 'Бумага не выбрана'}
            ${component.paper_price ? `<br><small>${component.formatted_paper_price || '0.00 ₽'}/лист</small>` : ''}
        </td>
        <td class="component-sheet-count" title="Количество листов из секции 'Вычисления листов'">${sheetCountDisplay}</td>
        <td class="component-price" title="Цена печати одного листа (рассчитана интерполяцией)">${component.formatted_price_per_sheet || '0.00 ₽'}</td>
        <td class="component-total" title="${formulaTooltip}">${component.formatted_total_circulation_price || '0.00 ₽'}</td>
        <td class="component-actions">
            <button type="button" class="delete-component-btn" 
                    title="Удалить компонент" 
                    data-component-id="${component.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;
    
    // ------------------------------------------------------------
    // ОБРАБОТЧИК КЛИКА ПО СТРОКЕ – выбор компонента
    // ------------------------------------------------------------
    row.addEventListener('click', function(event) {
        // Если кликнули не по кнопке удаления – обрабатываем как выбор
        if (!event.target.closest('.delete-component-btn')) {
            // Снимаем выделение со всех строк
            document.querySelectorAll('#print-components-table-body tr').forEach(r => {
                r.classList.remove('selected');
            });
            
            // Добавляем выделение текущей строке
            this.classList.add('selected');
            
            // Сохраняем ID выбранного компонента
            selectedComponentId = component.id;
            currentSheetCount = component.sheet_count || 0;
            
            // Генерируем событие выбора компонента
            const eventDetail = {
                printComponentId: component.id,
                printComponentNumber: component.number,
                printerName: component.printer_name,
                paperName: component.paper_name,
                paperPrice: component.paper_price || 0,
                proschetId: currentProschetId,
                sheetCount: component.sheet_count || 0,
                pricePerSheet: component.price_per_sheet || 0,
                formula: '(price_per_sheet + paper_price) * sheet_count'
            };
            
            document.dispatchEvent(new CustomEvent('printComponentSelected', { detail: eventDetail }));
            
            console.log(`📤 Событие printComponentSelected отправлено для компонента: ${component.id}`);
            console.log(`📝 Формула для компонента: (${eventDetail.pricePerSheet} + ${eventDetail.paperPrice}) × ${eventDetail.sheetCount}`);
            
            // Начинаем наблюдение за количеством листов (чтобы реагировать на изменения)
            initSheetCountObservation(component.id);
        }
    });
    
    // ------------------------------------------------------------
    // ОБРАБОТЧИК КЛИКА ПО КНОПКЕ УДАЛЕНИЯ
    // ------------------------------------------------------------
    const deleteBtn = row.querySelector('.delete-component-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation(); // Не даём событию всплыть до обработчика строки
            
            const componentId = this.dataset.componentId;
            if (confirm(`Удалить компонент ${component.number || componentId}?`)) {
                deleteComponent(componentId);
            }
        });
    }
    
    return row;
}

/**
 * Обновление отображения количества листов в таблице.
 * 
 * @param {number} sheetCount - Новое количество листов
 */
function updateSheetCountDisplay(sheetCount) {
    console.log(`📊 Обновление отображения количества листов: ${sheetCount}`);
    
    if (!selectedComponentId) {
        console.warn('⚠️ Не выбран компонент для обновления');
        return;
    }
    
    const componentRow = document.querySelector(`tr[data-component-id="${selectedComponentId}"]`);
    if (!componentRow) {
        console.warn(`⚠️ Строка для компонента ${selectedComponentId} не найдена`);
        return;
    }
    
    const sheetCountCell = componentRow.querySelector('.component-sheet-count');
    if (sheetCountCell) {
        // Форматируем число: добавляем пробелы как разделители тысяч, два знака после запятой
        const formattedSheetCount = parseFloat(sheetCount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        sheetCountCell.textContent = formattedSheetCount;
        sheetCountCell.title = `Количество листов из секции 'Вычисления листов': ${formattedSheetCount}`;
    }
}

/**
 * Обновление данных компонента в таблице после пересчёта.
 * 
 * @param {string} componentId - ID компонента
 * @param {Object} componentData - Данные компонента (с сервера)
 */
function updateComponentInTable(componentId, componentData) {
    console.log(`📊 Обновление отображения для компонента ${componentId}`);
    
    const componentRow = document.querySelector(`tr[data-component-id="${componentId}"]`);
    if (!componentRow) {
        console.warn(`⚠️ Строка для компонента ${componentId} не найдена`);
        return;
    }
    
    // Обновляем ячейку с бумагой (добавляем цену за лист)
    const paperCell = componentRow.querySelector('.component-paper');
    if (paperCell && componentData.paper_name) {
        paperCell.innerHTML = `
            ${componentData.paper_name}
            ${componentData.paper_price ? `<br><small>${componentData.formatted_paper_price || '0.00 ₽'}/лист</small>` : ''}
        `;
    }
    
    // Обновляем ячейку с ценой печати за лист
    const priceCell = componentRow.querySelector('.component-price');
    if (priceCell && componentData.formatted_price_per_sheet) {
        priceCell.textContent = componentData.formatted_price_per_sheet;
        priceCell.title = `Цена печати одного листа: ${componentData.formatted_price_per_sheet}`;
    }
    
    // Обновляем ячейку с общей стоимостью
    const totalCell = componentRow.querySelector('.component-total');
    if (totalCell && componentData.formatted_total_price) {
        totalCell.textContent = componentData.formatted_total_price;
        
        // Обновляем подсказку с формулой
        const formulaTooltip = `Формула: (${componentData.price_per_sheet.toFixed(2)} руб./печать + ${componentData.paper_price.toFixed(2)} руб./бумага) × ${componentData.sheet_count} листов`;
        totalCell.title = formulaTooltip;
    }
    
    console.log(`✅ Отображение для компонента ${componentId} обновлено`);
    console.log(`📝 Формула в подсказке: (${componentData.price_per_sheet.toFixed(2)} + ${componentData.paper_price.toFixed(2)}) × ${componentData.sheet_count}`);
}

/**
 * Обновление общей стоимости всех компонентов.
 * 
 * @param {number} totalPrice - Общая стоимость
 */
function updateTotalPrice(totalPrice) {
    console.log(`💰 Обновление общей стоимости: ${totalPrice} руб.`);
    
    const totalPriceElement = document.getElementById('print-components-total-price');
    const totalContainer = document.getElementById('print-components-total');
    
    if (totalPriceElement) {
        totalPriceElement.textContent = `${parseFloat(totalPrice).toFixed(2)} ₽`;
    }
    
    if (totalContainer) {
        totalContainer.style.display = 'block'; // Показываем блок итога
    }
}

/**
 * Расчёт общей стоимости всех компонентов.
 * 
 * @param {Array} components - Массив компонентов
 * @returns {number} - Общая стоимость
 */
function calculateTotalPrice(components) {
    let total = 0;
    components.forEach(component => {
        if (component.total_price) {
            total += parseFloat(component.total_price);
        }
    });
    return total;
}

// ============================================================================
// 6. ОБРАБОТЧИКИ СОБЫТИЙ И КНОПОК
// ============================================================================

/**
 * Обработчик добавления компонента.
 */
function handleAddComponent() {
    console.log('🖨️ Добавление нового компонента');
    
    if (!currentProschetId) {
        showNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    
    // Вызываем функцию из другого файла (модальное окно выбора принтера/бумаги)
    if (typeof window.print_components_handle_add_component === 'function') {
        window.print_components_handle_add_component();
    } else {
        showNotification('Функция добавления компонента не загружена', 'error');
    }
}

/**
 * Обработчик добавления первого компонента.
 */
function handleAddFirstComponent() {
    console.log('🖨️ Добавление первого компонента');
    handleAddComponent();
}

// ============================================================================
// 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Инициализация наблюдения за количеством листов.
 * Использует MutationObserver для отслеживания изменений в элементе с результатом.
 * 
 * @param {string} componentId - ID компонента
 */
function initSheetCountObservation(componentId) {
    console.log(`👁️ Инициализация наблюдения для компонента ${componentId}`);
    
    // Останавливаем предыдущее наблюдение (если было)
    stopSheetCountObservation();
    
    // Находим элемент, в котором отображается количество листов (из секции "Вычисления листов")
    const sheetCountElement = document.getElementById('vichisliniya-listov-result-value');
    
    if (!sheetCountElement) {
        console.warn('⚠️ Элемент с количеством листов не найден');
        return;
    }
    
    // Извлекаем начальное значение
    const sheetCountText = sheetCountElement.textContent.trim();
    const initialSheetCount = parseFloat(sheetCountText);
    
    if (isNaN(initialSheetCount)) {
        console.warn('⚠️ Не удалось извлечь количество листов:', sheetCountText);
        return;
    }
    
    console.log(`📊 Начальное количество листов: ${initialSheetCount}`);
    currentSheetCount = initialSheetCount;
    
    // Создаём функцию обратного вызова для MutationObserver
    const observerCallback = function(mutations) {
        mutations.forEach(function(mutation) {
            // Нас интересуют изменения текстового содержимого
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
                const newText = sheetCountElement.textContent.trim();
                const newSheetCount = parseFloat(newText);
                
                if (isNaN(newSheetCount)) {
                    console.warn('⚠️ Новое значение не является числом:', newText);
                    return;
                }
                
                // Если значение изменилось
                if (newSheetCount !== currentSheetCount) {
                    console.log(`🔄 Обнаружено изменение: ${currentSheetCount} → ${newSheetCount}`);
                    currentSheetCount = newSheetCount;
                    
                    // Если это наш текущий компонент – планируем обновление стоимости
                    if (selectedComponentId === componentId) {
                        schedulePriceUpdate(componentId, newSheetCount);
                    }
                }
            }
        });
    };
    
    // Создаём наблюдатель
    sheetCountObserver = new MutationObserver(observerCallback);
    
    // Начинаем наблюдение – следим за изменением текста и дочерних узлов
    sheetCountObserver.observe(sheetCountElement, {
        childList: true,
        characterData: true,
        subtree: true
    });
    
    console.log(`✅ Наблюдение установлено для компонента ${componentId}`);
}

/**
 * Запуск отложенного обновления стоимости (дебаунс).
 * 
 * @param {string} componentId - ID компонента
 * @param {number} sheetCount - Количество листов
 */
function schedulePriceUpdate(componentId, sheetCount) {
    console.log(`⏰ Запуск отложенного обновления для компонента ${componentId}`);
    
    clearUpdateTimeout(); // Очищаем предыдущий таймер
    
    updateTimeout = setTimeout(() => {
        recalculateComponentPrice(componentId, sheetCount);
    }, UPDATE_DELAY);
}

/**
 * Остановка наблюдения за количеством листов.
 */
function stopSheetCountObservation() {
    if (sheetCountObserver) {
        sheetCountObserver.disconnect();
        sheetCountObserver = null;
        console.log('🛑 Наблюдение остановлено');
    }
    clearUpdateTimeout();
}

/**
 * Очистка таймера обновления.
 */
function clearUpdateTimeout() {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }
}

/**
 * Отмена текущего запроса (используется при быстром переключении просчётов).
 */
function cancelCurrentRequest() {
    if (abortController) {
        abortController.abort(); // Отменяем запрос
        console.log('🛑 Текущий запрос отменён');
    }
    // Создаём новый контроллер для следующих запросов
    abortController = new AbortController();
}

/**
 * Получение CSRF-токена для AJAX-запросов.
 * 
 * @returns {string} - CSRF токен
 */
function getCsrfToken() {
    // Пробуем взять из meta-тега
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken && metaToken.getAttribute('content')) {
        return metaToken.getAttribute('content');
    }
    
    // Если нет – ищем в cookies
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

/**
 * Показ уведомления на странице.
 * 
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип сообщения (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
    console.log(`💬 Уведомление [${type}]: ${message}`);
    
    const notification = document.createElement('div');
    
    let backgroundColor = '#2196F3'; // info – синий
    let icon = 'ℹ️';
    
    if (type === 'success') {
        backgroundColor = '#4CAF50'; // зелёный
        icon = '✅';
    } else if (type === 'error') {
        backgroundColor = '#F44336'; // красный
        icon = '❌';
    } else if (type === 'warning') {
        backgroundColor = '#FF9800'; // оранжевый
        icon = '⚠️';
    }
    
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
    
    // Плавное появление
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);
    
    // Автоматическое скрытие через 5 секунд
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// ============================================================================
// 8. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА
// ============================================================================

/**
 * Показать сообщение "Выберите просчёт".
 */
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
    
    // Сбрасываем данные
    currentProschetId = null;
    currentComponents = [];
    selectedComponentId = null;
    currentSheetCount = null;
    
    cancelCurrentRequest();
    stopSheetCountObservation();
    clearUpdateTimeout();
}

/**
 * Показать сообщение "Нет компонентов".
 */
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

/**
 * Показать таблицу компонентов.
 */
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

/**
 * Показать состояние загрузки.
 */
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
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p>Загрузка компонентов печати...</p>
                    <p class="loading-note">Используется "Количество листов" из секции "Вычисления листов"</p>
                </td>
            </tr>
        `;
    }
}

/**
 * Показать сообщение об ошибке.
 * 
 * @param {string} message - Текст ошибки
 */
function showErrorMessage(message) {
    console.log(`❌ Показ ошибки: ${message}`);
    
    const tableBody = document.getElementById('print-components-table-body');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p>${message}</p>
                </td>
            </tr>
        `;
    }
}

/**
 * Скрыть все сообщения (используется перед показом таблицы).
 */
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

/**
 * Показать/скрыть кнопку добавления.
 * 
 * @param {boolean} show - Показать кнопку
 */
function showAddButton(show) {
    const addButton = document.getElementById('add-print-component-btn');
    if (addButton) {
        addButton.style.display = show ? 'inline-block' : 'none';
    }
}

/**
 * Обновление заголовка с названием просчёта.
 * 
 * @param {HTMLElement} rowElement - Элемент строки таблицы просчётов
 */
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

/**
 * [ИСПРАВЛЕНО] Сброс секции.
 * Вызывается при отмене выбора просчёта или принудительном сбросе.
 */
function resetSection() {
    console.log('🔄 Сброс секции "Печатные компоненты"');

    // [ИСПРАВЛЕНО] Снимаем выбор с текущего компонента и оповещаем другие секции
    deselectCurrentComponent();

    // Сбрасываем все глобальные данные
    currentProschetId = null;
    currentComponents = [];

    // Переводим интерфейс в состояние "просчёт не выбран"
    showNoProschetSelectedMessage();

    // Отменяем все запросы и таймеры
    cancelCurrentRequest();
    stopSheetCountObservation();
    clearUpdateTimeout();

    console.log('✅ Секция сброшена');
}

// ============================================================================
// 9. ФУНКЦИИ ДЛЯ УДАЛЕНИЯ КОМПОНЕНТОВ
// ============================================================================

/**
 * Удаление компонента.
 * @param {string} componentId - ID компонента
 */
function deleteComponent(componentId) {
    console.log(`🗑️ Удаление компонента ${componentId}`);
    // TODO: Реализовать удаление через API
    showNotification(`Удаление компонента ${componentId} (в разработке)`, 'info');
}

// ============================================================================
// 10. ЭКСПОРТ ФУНКЦИЙ И ИНИЦИАЛИЗАЦИЯ
// ============================================================================

/**
 * Глобальный объект для взаимодействия с другими секциями.
 */
window.printComponentsSection = {
    updateForProschet: updateForProschet,
    reset: resetSection,
    getCurrentProschetId: () => currentProschetId,
    getCurrentComponents: () => currentComponents,
    stopObservation: stopSheetCountObservation,
    cancelCurrentRequest: cancelCurrentRequest,
    deselectCurrentComponent: deselectCurrentComponent // экспортируем для внешнего вызова
};

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 DOM загружен, инициализация секции "Печатные компоненты"...');
    initPrintComponents();
    console.log('✅ Секция "Печатные компоненты" готова к работе');
});