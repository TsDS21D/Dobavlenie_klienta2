/**
 * ФАЙЛ: additional_works.js
 * НАЗНАЧЕНИЕ: JavaScript для секции "Дополнительные работы"
 * 
 * ИСПРАВЛЕНИЯ (03.04.2026):
 * - Добавлена проверка на null в additionalWorks_loadWorksForComponent,
 *   чтобы не отправлять запросы с componentId = null (ошибка 404).
 * - В обработчике vichisliniyaListovUpdated добавлена проверка,
 *   что компонент выбран перед перезагрузкой.
 * - В additionalWorks_updateForPrintComponent установка ID происходит
 *   до вызова загрузки, чтобы избежать состояния гонки.
 * 
 * Подробные комментарии для каждой строки.
 */

"use strict";

// ============================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (состояние секции)
// ============================================================================

/**
 * Текущий ID печатного компонента, для которого отображаются дополнительные работы
 * @type {number|null}
 */
let additionalWorks_currentComponentId = null;

/**
 * Текущий ID просчёта, которому принадлежит выбранный компонент.
 * @type {number|null}
 */
let additionalWorks_currentProschetId = null;

/**
 * Массив текущих дополнительных работ для выбранного компонента.
 * @type {Array}
 */
let additionalWorks_currentWorks = [];

/**
 * ID текущей выбранной дополнительной работы (если есть).
 * @type {number|null}
 */
let additionalWorks_currentSelectedWorkId = null;

/**
 * Объект с URL-адресами API для работы с дополнительными работами.
 * @type {Object}
 */
const additionalWorks_apiUrls = {
    getWorks: '/calculator/get-additional-works/',           // GET /<component_id>/
    addWork: '/calculator/add-additional-work/',             // POST
    updateWork: '/calculator/update-additional-work/',       // POST
    deleteWork: '/calculator/delete-additional-work/',       // POST
    getSpravochnikWorks: '/calculator/get-spravochnik-works/' // GET
};

// DOM-элементы для блока итоговых сумм
let additionalWorks_totalContainer = null;
let additionalWorks_totalCostElement = null;
let additionalWorks_totalMarkupElement = null;
let additionalWorks_totalPriceElement = null;

/**
 * Объект с данными вычислений листов для текущего компонента.
 * @type {Object|null}
 */
let additionalWorks_currentVichData = null;

// ============================================================================
// 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Дополнительные работы" загружена и инициализируется');
    additionalWorks_initDOMElements();
    additionalWorks_setupEventListeners();
    additionalWorks_initInterface();
});

// ============================================================================
// 3. ФУНКЦИИ ДЛЯ РАБОТЫ С DOM-ЭЛЕМЕНТАМИ
// ============================================================================

function additionalWorks_initDOMElements() {
    console.log('🔍 Инициализация DOM элементов секции "Дополнительные работы"...');
    additionalWorks_totalContainer = document.getElementById('additional-works-total-container');
    additionalWorks_totalCostElement = document.getElementById('additional-works-total-cost');
    additionalWorks_totalMarkupElement = document.getElementById('additional-works-total-markup');
    additionalWorks_totalPriceElement = document.getElementById('additional-works-total-price');

    if (!additionalWorks_totalContainer || !additionalWorks_totalCostElement || !additionalWorks_totalMarkupElement || !additionalWorks_totalPriceElement) {
        console.warn('⚠️ Некоторые DOM элементы не найдены при инициализации');
        additionalWorks_createMissingTotalElements();
    }
}

function additionalWorks_createMissingTotalElements() {
    console.log('🛠️ Создание отсутствующих элементов итоговых сумм');
    const worksContainer = document.getElementById('additional-works-container');
    if (!worksContainer) {
        console.error('❌ Контейнер таблицы дополнительных работ не найден');
        return;
    }

    const totalContainer = document.createElement('div');
    totalContainer.id = 'additional-works-total-container';
    totalContainer.className = 'additional-works-total-summary';
    totalContainer.style.display = 'none';

    const costDiv = document.createElement('div');
    costDiv.className = 'additional-works-total-item';
    const costLabel = document.createElement('div');
    costLabel.className = 'additional-works-total-label';
    costLabel.textContent = 'Общая себестоимость:';
    const costValue = document.createElement('div');
    costValue.id = 'additional-works-total-cost';
    costValue.className = 'additional-works-total-cost';
    costValue.textContent = '0.00 ₽';
    costDiv.appendChild(costLabel);
    costDiv.appendChild(costValue);

    const markupDiv = document.createElement('div');
    markupDiv.className = 'additional-works-total-item';
    const markupLabel = document.createElement('div');
    markupLabel.className = 'additional-works-total-label';
    markupLabel.textContent = 'Общая наценка:';
    const markupValue = document.createElement('div');
    markupValue.id = 'additional-works-total-markup';
    markupValue.className = 'additional-works-total-markup';
    markupValue.textContent = '0.00 ₽';
    markupDiv.appendChild(markupLabel);
    markupDiv.appendChild(markupValue);

    const priceDiv = document.createElement('div');
    priceDiv.className = 'additional-works-total-item';
    const priceLabel = document.createElement('div');
    priceLabel.className = 'additional-works-total-label';
    priceLabel.textContent = 'Общая стоимость:';
    const priceValue = document.createElement('div');
    priceValue.id = 'additional-works-total-price';
    priceValue.className = 'additional-works-total-price';
    priceValue.textContent = '0.00 ₽';
    priceDiv.appendChild(priceLabel);
    priceDiv.appendChild(priceValue);

    totalContainer.appendChild(costDiv);
    totalContainer.appendChild(markupDiv);
    totalContainer.appendChild(priceDiv);
    worksContainer.appendChild(totalContainer);

    additionalWorks_totalContainer = totalContainer;
    additionalWorks_totalCostElement = costValue;
    additionalWorks_totalMarkupElement = markupValue;
    additionalWorks_totalPriceElement = priceValue;

    console.log('✅ Отсутствующие элементы итоговых сумм созданы');
}

// ============================================================================
// 4. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ
// ============================================================================

function additionalWorks_setupEventListeners() {
    console.log('🔗 Настраиваем обработчики событий для секции "Дополнительные работы"...');

    const addBtn = document.getElementById('add-additional-work-btn');
    if (addBtn) addBtn.addEventListener('click', additionalWorks_handleAddWork);

    const addFirstBtn = document.getElementById('add-first-work-btn');
    if (addFirstBtn) addFirstBtn.addEventListener('click', additionalWorks_handleAddFirstWork);

    const collapseBtn = document.querySelector('.additional-works-btn-collapse-section');
    if (collapseBtn) collapseBtn.addEventListener('click', additionalWorks_toggleSectionCollapse);

    // ===== ВНЕШНИЕ СОБЫТИЯ, ГЕНЕРИРУЕМЫЕ ДРУГИМИ СЕКЦИЯМИ =====

    // Событие выбора печатного компонента
    document.addEventListener('printComponentSelected', function(event) {
        console.log('📥 Получено событие выбора печатного компонента:', event.detail);
        if (event.detail && event.detail.printComponentId) {
            additionalWorks_currentProschetId = event.detail.proschetId;
            additionalWorks_updateForPrintComponent(
                event.detail.printComponentId,
                event.detail.printComponentNumber,
                event.detail.printerName
            );
        }
    });

    // Событие отмены выбора компонента
    document.addEventListener('printComponentDeselected', function() {
        console.log('📥 Получено событие отмены выбора компонента');
        additionalWorks_resetSection();
    });

    // ===== ИСПРАВЛЕНИЕ: добавляем проверку, что компонент выбран =====
    document.addEventListener('vichisliniyaListovUpdated', function(event) {
        console.log('📥 Получено событие vichisliniyaListovUpdated:', event.detail);
        if (event.detail && event.detail.printComponentId == additionalWorks_currentComponentId) {
            if (additionalWorks_currentComponentId) {
                console.log('🔄 Данные вычислений листов изменились – перезагружаем доп. работы');
                additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
            } else {
                console.warn('⚠️ Компонент не выбран, перезагрузка доп. работ пропущена');
            }
        }
    });

    // Событие изменения тиража просчёта
    document.addEventListener('productCirculationUpdated', function(event) {
        console.log('📥 Получено событие productCirculationUpdated:', event.detail);
        if (event.detail && event.detail.proschetId == additionalWorks_currentProschetId) {
            if (additionalWorks_currentComponentId) {
                console.log('🔄 Тираж изменился – перезагружаем доп. работы для компонента', additionalWorks_currentComponentId);
                additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
            } else {
                console.warn('⚠️ Нет выбранного компонента, перезагрузка доп. работ пропущена');
            }
        }
    });

    // Обновление данных из справочника
    document.addEventListener('spravochnikWorkUpdated', function(event) {
        console.log('📥 Получено событие spravochnikWorkUpdated:', event.detail);
        if (additionalWorks_currentComponentId) {
            console.log(`🔄 Работа в справочнике изменилась – перезагружаем доп. работы компонента ${additionalWorks_currentComponentId}`);
            additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
        }
    });

    // Слушатель изменений localStorage (межвкладочное взаимодействие)
    window.addEventListener('storage', function(event) {
        if (event.key === 'spravochnik_last_update' || event.key === 'work_price_last_update') {
            console.log(`📥 Обнаружено изменение в другой вкладке по ключу ${event.key}, перезагружаем данные`);
            if (additionalWorks_currentComponentId) {
                additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
            }
        }
    });

    console.log('✅ Обработчики событий настроены');
}

function additionalWorks_toggleSectionCollapse(event) {
    const section = document.getElementById('additional-works-section');
    const icon = event.currentTarget.querySelector('i');
    if (section.classList.contains('collapsed')) {
        section.classList.remove('collapsed');
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    } else {
        section.classList.add('collapsed');
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    }
}

// ============================================================================
// 5. ОСНОВНЫЕ ФУНКЦИИ УПРАВЛЕНИЯ СЕКЦИЕЙ
// ============================================================================

function additionalWorks_initInterface() {
    console.log('🎨 Инициализация интерфейса секции "Дополнительные работы"');
    additionalWorks_showNoComponentSelectedMessage();
}

function additionalWorks_updateForPrintComponent(componentId, componentNumber, printerName) {
    console.log(`🔄 Обновление секции "Дополнительные работы" для компонента ID: ${componentId} (${componentNumber})`);
    additionalWorks_deselectCurrentWork();
    // ===== ИСПРАВЛЕНИЕ: сначала устанавливаем ID, потом загружаем =====
    additionalWorks_currentComponentId = componentId;
    additionalWorks_currentProschetId = window.printComponentsSection?.getCurrentProschetId() || null;
    additionalWorks_updateComponentTitle(componentNumber, printerName);
    additionalWorks_loadWorksForComponent(componentId);
    additionalWorks_showAddButton(true);
}

function additionalWorks_updateComponentTitle(componentNumber, printerName) {
    const titleElement = document.getElementById('additional-works-component-title');
    if (!titleElement) return;
    let displayText = componentNumber;
    if (printerName) displayText += ` (${printerName})`;
    titleElement.innerHTML = `<span class="additional-works-component-title-active">${displayText}</span>`;
}

// ===== ИСПРАВЛЕНИЕ: добавляем проверку на null componentId =====
function additionalWorks_loadWorksForComponent(componentId) {
    if (!componentId) {
        console.warn('⚠️ Попытка загрузить дополнительные работы для componentId = null, пропускаем');
        return;
    }
    console.log(`📥 Загрузка дополнительных работ для компонента ID: ${componentId}`);
    additionalWorks_showLoadingState();

    const url = `${additionalWorks_apiUrls.getWorks}${componentId}/`;
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': additionalWorks_getCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
        return response.json();
    })
    .then(data => {
        console.log('📊 Получены данные дополнительных работ:', data);
        if (data.success) {
            additionalWorks_currentWorks = data.works || [];
            additionalWorks_currentVichData = data.vich_data || {
                item_width: 0,
                item_height: 0,
                list_count: 0,
                fit_total: 0,
                cuts_count: 0
            };
            additionalWorks_updateInterface(data.works || []);
        } else {
            console.error('❌ Ошибка при загрузке работ:', data.message);
            additionalWorks_showErrorMessage('Не удалось загрузить дополнительные работы');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при загрузке работ:', error);
        additionalWorks_showErrorMessage('Ошибка сети при загрузке дополнительных работ');
    });
}

function additionalWorks_updateInterface(works) {
    console.log('🔄 Обновление интерфейса с дополнительными работами', works);
    additionalWorks_hideAllMessagesAndContainers();

    if (works.length === 0) {
        additionalWorks_showNoWorksMessage();
        additionalWorks_updateTotalPrice([]);
        additionalWorks_deselectCurrentWork();
    } else {
        additionalWorks_showTable();
        additionalWorks_populateTable(works);
        additionalWorks_updateTotalPrice(works);
    }
    additionalWorks_showAddButton(true);

    if (!additionalWorks_currentComponentId) {
        console.warn('⚠️ Компонент не выбран, событие additionalWorksUpdated не отправлено');
        return;
    }

    const worksWithComponentId = works.map(work => ({
        ...work,
        component_id: additionalWorks_currentComponentId
    }));

    const event = new CustomEvent('additionalWorksUpdated', {
        detail: {
            componentId: additionalWorks_currentComponentId,
            proschetId: additionalWorks_currentProschetId,
            works: worksWithComponentId
        }
    });
    document.dispatchEvent(event);
}

function additionalWorks_populateTable(works) {
    const tableBody = document.getElementById('additional-works-table-body');
    if (!tableBody) {
        console.error('❌ Элемент #additional-works-table-body не найден');
        return;
    }
    tableBody.innerHTML = '';

    works.forEach((work, index) => {
        const row = additionalWorks_createWorkRow(work, index);
        tableBody.appendChild(row);
    });
    console.log(`✅ Таблица обновлена: добавлено ${works.length} строк`);

    if (additionalWorks_currentSelectedWorkId) {
        const selectedRow = document.querySelector(`#additional-works-table-body tr[data-work-id="${additionalWorks_currentSelectedWorkId}"]`);
        if (selectedRow) {
            document.querySelectorAll('#additional-works-table-body tr').forEach(r => r.classList.remove('selected'));
            selectedRow.classList.add('selected');
            console.log(`🔄 Восстановлено выделение работы ID=${additionalWorks_currentSelectedWorkId}`);
        } else {
            additionalWorks_deselectCurrentWork();
        }
    }
}

function additionalWorks_createWorkRow(work, index) {
    const row = document.createElement('tr');
    row.classList.add(index % 2 === 0 ? 'additional-works-even-row' : 'additional-works-odd-row');
    row.classList.add('additional-works-selectable-row');
    row.dataset.workId = work.id;

    const vich = additionalWorks_currentVichData || {
        item_width: 0,
        item_height: 0,
        list_count: 0,
        fit_total: 0,
        cuts_count: 0
    };

    const itemWidth = typeof vich.item_width === 'number' ? vich.item_width : parseFloat(vich.item_width) || 0;
    const itemHeight = typeof vich.item_height === 'number' ? vich.item_height : parseFloat(vich.item_height) || 0;
    const listCount = typeof vich.list_count === 'number' ? vich.list_count : parseFloat(vich.list_count) || 0;
    const fitTotal = typeof vich.fit_total === 'number' ? vich.fit_total : parseInt(vich.fit_total, 10) || 0;
    const cutsCount = typeof vich.cuts_count === 'number' ? vich.cuts_count : parseInt(vich.cuts_count, 10) || 0;

    row.innerHTML = `
        <td class="additional-works-work-number">${work.number || '—'}<\/td>
        <td class="additional-works-work-title">${work.title || '—'}<\/td>
        <td class="additional-works-work-cost">${work.formatted_cost || '0.00 ₽'}<\/td>
        <td class="additional-works-work-markup">${work.formatted_markup_percent || '0%'}<\/td>
        <td class="additional-works-work-price">${work.formatted_effective_price || '0.00 ₽'}<\/td>
        <td class="additional-works-work-profit">${work.formatted_profit_per_unit || '0.00 ₽'}<\/td>
        <td class="additional-works-work-quantity additional-works-editable-cell"
            data-editable="true"
            data-field="quantity"
            data-original-value="${work.quantity || 1}"
            data-work-id="${work.id}">
            ${work.quantity || 1}
        <\/td>
        <td class="additional-works-component-width">${itemWidth.toFixed(2)}<\/td>
        <td class="additional-works-component-height">${itemHeight.toFixed(2)}<\/td>
        <td class="additional-works-component-sheet-count">${listCount.toFixed(2)}<\/td>
        <td class="additional-works-component-fit-total">${fitTotal}<\/td>
        <td class="additional-works-component-cuts-count">${cutsCount}<\/td>
        <td class="additional-works-work-total-price">${work.formatted_total_price || '0.00 ₽'}<\/td>
        <td class="additional-works-work-actions">
            <button type="button" class="additional-works-delete-work-btn" 
                    title="Удалить работу" 
                    data-work-id="${work.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        <\/td>
    `;

    row.addEventListener('click', function(event) {
        if (event.target.closest('.additional-works-delete-work-btn') ||
            event.target.closest('.additional-works-editable-cell')) {
            return;
        }
        const allRows = document.querySelectorAll('#additional-works-table-body tr');
        allRows.forEach(r => r.classList.remove('selected'));
        this.classList.add('selected');
        additionalWorks_currentSelectedWorkId = work.id;
        console.log(`✅ Выбрана дополнительная работа ID=${work.id} (${work.number})`);

        const selectEvent = new CustomEvent('additionalWorkSelected', {
            detail: {
                workId: work.id,
                workNumber: work.number,
                workTitle: work.title,
                workPrice: work.effective_price,
                formattedWorkPrice: work.formatted_effective_price,
                componentId: additionalWorks_currentComponentId,
                proschetId: additionalWorks_currentProschetId,
                timestamp: new Date().toISOString()
            }
        });
        document.dispatchEvent(selectEvent);
    });

    const quantityCell = row.querySelector('.additional-works-work-quantity');
    if (quantityCell) {
        quantityCell.addEventListener('dblclick', function(event) {
            event.stopPropagation();
            additionalWorks_enableInlineEdit(this, 'quantity');
        });
    }

    const deleteBtn = row.querySelector('.additional-works-delete-work-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            const workId = this.dataset.workId;
            if (workId) additionalWorks_deleteWork(workId, row);
        });
    }

    return row;
}

// ============================================================================
// 6. ФУНКЦИИ ДЛЯ РАБОТЫ С ОБЩЕЙ СТОИМОСТЬЮ
// ============================================================================

function additionalWorks_updateTotalPrice(works) {
    console.log('💰 Обновление итоговых сумм дополнительных работ');
    if (!additionalWorks_currentComponentId) {
        console.warn('⚠️ Не удалось обновить итоговые суммы: компонент не выбран');
        return;
    }

    if (!additionalWorks_totalContainer || !additionalWorks_totalCostElement || !additionalWorks_totalMarkupElement || !additionalWorks_totalPriceElement) {
        additionalWorks_initDOMElements();
        if (!additionalWorks_totalContainer || !additionalWorks_totalCostElement || !additionalWorks_totalMarkupElement || !additionalWorks_totalPriceElement) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Элементы для отображения итоговых сумм не найдены!');
            return;
        }
    }

    let totalCost = 0;
    let totalPrice = 0;

    works.forEach(work => {
        totalCost += parseFloat(work.total_cost) || 0;
        totalPrice += parseFloat(work.total_price) || 0;
    });

    const totalMarkup = totalPrice - totalCost;

    console.log(`📊 Рассчитаны итоговые суммы: себестоимость = ${totalCost.toFixed(2)} ₽, наценка = ${totalMarkup.toFixed(2)} ₽, общая стоимость = ${totalPrice.toFixed(2)} ₽`);

    additionalWorks_totalCostElement.textContent = `${totalCost.toFixed(2)} ₽`;
    additionalWorks_totalMarkupElement.textContent = `${totalMarkup.toFixed(2)} ₽`;
    additionalWorks_totalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;

    additionalWorks_totalContainer.style.display = works.length > 0 ? 'flex' : 'none';

    console.log(`✅ Итоговые суммы обновлены`);

    const event = new CustomEvent('additionalWorksUpdated', {
        detail: {
            componentId: additionalWorks_currentComponentId,
            proschetId: additionalWorks_currentProschetId,
            works: works,
            totalPrice: totalPrice,
            totalCost: totalCost,
            totalMarkup: totalMarkup
        }
    });
    document.dispatchEvent(event);
    console.log(`📤 Событие additionalWorksUpdated отправлено для компонента ${additionalWorks_currentComponentId}`);
}

// ============================================================================
// 7. УПРАВЛЕНИЕ СОСТОЯНИЯМИ ИНТЕРФЕЙСА
// ============================================================================

function additionalWorks_showNoComponentSelectedMessage() {
    const noComponentMsg = document.getElementById('no-component-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    const addButton = document.getElementById('add-additional-work-btn');
    if (noComponentMsg) noComponentMsg.style.display = 'block';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (worksContainer) worksContainer.style.display = 'none';
    if (addButton) addButton.style.display = 'none';
    const titleElement = document.getElementById('additional-works-component-title');
    if (titleElement) titleElement.innerHTML = `<span class="additional-works-placeholder-text">(компонент не выбран)</span>`;
    additionalWorks_currentComponentId = null;
    additionalWorks_currentProschetId = null;
    additionalWorks_currentWorks = [];
    additionalWorks_currentVichData = null;
    additionalWorks_deselectCurrentWork();
}

function additionalWorks_showNoWorksMessage() {
    const noComponentMsg = document.getElementById('no-component-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    if (noComponentMsg) noComponentMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'block';
    if (worksContainer) worksContainer.style.display = 'none';
}

function additionalWorks_showTable() {
    const noComponentMsg = document.getElementById('no-component-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    if (noComponentMsg) noComponentMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (worksContainer) {
        worksContainer.style.display = 'block';
        console.log('✅ Таблица дополнительных работ показана');
    }
}

function additionalWorks_showLoadingState() {
    const noComponentMsg = document.getElementById('no-component-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    const tableBody = document.getElementById('additional-works-table-body');
    if (noComponentMsg) noComponentMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (tableBody) {
        tableBody.innerHTML = `
             <tr>
                <td colspan="14" class="additional-works-text-center" style="padding: 40px;">
                    <div class="additional-works-loading-spinner"></div>
                    <p>Загрузка дополнительных работ...</p>
                <\/td>
            <\/tr>
        `;
        if (worksContainer) worksContainer.style.display = 'block';
    }
}

function additionalWorks_showErrorMessage(message) {
    const tableBody = document.getElementById('additional-works-table-body');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="14" class="additional-works-text-center" style="padding: 40px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p>${message}</p>
                    <button type="button" id="additional-works-retry-load-btn" class="additional-works-btn-action" style="margin-top: 10px;">
                        <i class="fas fa-redo"></i> Повторить попытку
                    </button>
                <\/td>
            <\/tr>
        `;
        const retryBtn = document.getElementById('additional-works-retry-load-btn');
        if (retryBtn && additionalWorks_currentComponentId) {
            retryBtn.addEventListener('click', function() {
                additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
            });
        }
    }
}

function additionalWorks_hideAllMessagesAndContainers() {
    const noComponentMsg = document.getElementById('no-component-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    if (noComponentMsg) noComponentMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
}

function additionalWorks_showAddButton(show) {
    const addButton = document.getElementById('add-additional-work-btn');
    if (addButton) addButton.style.display = show ? 'inline-block' : 'none';
}

// ============================================================================
// 8. ОБРАБОТЧИКИ ДОБАВЛЕНИЯ РАБОТЫ (МОДАЛЬНОЕ ОКНО)
// ============================================================================

function additionalWorks_handleAddWork() {
    console.log('🛠️ Добавление новой дополнительной работы через справочник');
    if (!additionalWorks_currentComponentId) {
        additionalWorks_showNotification('Сначала выберите печатный компонент', 'warning');
        return;
    }
    additionalWorks_openAddModal();
}

function additionalWorks_handleAddFirstWork() {
    console.log('➕ Добавление первой дополнительной работы');
    additionalWorks_handleAddWork();
}

function additionalWorks_openAddModal() {
    const modalOverlay = document.getElementById('additional-work-modal');
    if (!modalOverlay) {
        console.error('❌ Модальное окно не найдено!');
        return;
    }
    modalOverlay.style.display = 'flex';
    const hiddenInput = document.getElementById('modal-print-component-id');
    if (hiddenInput) hiddenInput.value = additionalWorks_currentComponentId;
    const form = document.getElementById('additional-work-add-form');
    if (form) form.reset();
    const titleDisplay = document.getElementById('work-title-display');
    const priceInput = document.getElementById('work-price-input');
    if (titleDisplay) titleDisplay.value = '';
    if (priceInput) priceInput.value = '';
    setTimeout(() => {
        modalOverlay.classList.add('additional-works-active');
        const modal = modalOverlay.querySelector('.additional-works-modal');
        if (modal) modal.classList.add('additional-works-active');
    }, 10);
    additionalWorks_loadSpravochnikWorks();
}

function additionalWorks_loadSpravochnikWorks() {
    const select = document.getElementById('spravochnik-work-select');
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>⏳ Загрузка...</option>';
    fetch(additionalWorks_apiUrls.getSpravochnikWorks, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': additionalWorks_getCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data.success && data.works) {
            select.innerHTML = '<option value="" disabled selected>— Выберите работу —</option>';
            data.works.forEach(work => {
                const option = document.createElement('option');
                option.value = work.id;
                option.dataset.name = work.name;
                option.dataset.price = work.price;
                option.textContent = `${work.name} — ${work.price} ₽`;
                select.appendChild(option);
            });
            console.log(`✅ Загружено ${data.works.length} работ из справочника`);
        } else {
            select.innerHTML = '<option value="" disabled>Ошибка загрузки</option>';
            additionalWorks_showNotification('Не удалось загрузить справочник', 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка загрузки справочника:', error);
        select.innerHTML = '<option value="" disabled>Ошибка соединения</option>';
        additionalWorks_showNotification('Ошибка сети при загрузке справочника', 'error');
    });
}

document.getElementById('spravochnik-work-select')?.addEventListener('change', function(e) {
    const selectedOption = e.target.selectedOptions[0];
    if (!selectedOption || !selectedOption.value) return;
    const name = selectedOption.dataset.name;
    const price = selectedOption.dataset.price;
    const titleDisplay = document.getElementById('work-title-display');
    const priceInput = document.getElementById('work-price-input');
    if (titleDisplay) titleDisplay.value = name || '';
    if (priceInput) priceInput.value = price || '';
});

document.getElementById('additional-work-add-form')?.addEventListener('submit', function(e) {
    e.preventDefault();
    const componentId = document.getElementById('modal-print-component-id')?.value;
    const title = document.getElementById('work-title-display')?.value;
    const price = document.getElementById('work-price-input')?.value;
    if (!componentId) {
        additionalWorks_showNotification('Ошибка: не выбран печатный компонент', 'error');
        return;
    }
    if (!title || title.trim() === '') {
        additionalWorks_showNotification('Название работы не может быть пустым', 'error');
        return;
    }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
        additionalWorks_showNotification('Введите корректную цену (≥ 0)', 'error');
        return;
    }
    const formData = new FormData();
    formData.append('print_component_id', componentId);
    formData.append('title', title.trim());
    formData.append('price', parseFloat(price).toFixed(2));
    formData.append('quantity', 1);
    const workSelect = document.getElementById('spravochnik-work-select');
    if (workSelect && workSelect.value) {
        formData.append('work_id', workSelect.value);
    }
    const submitBtn = document.getElementById('modal-submit-btn');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
    }
    fetch(additionalWorks_apiUrls.addWork, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': additionalWorks_getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            additionalWorks_closeModal();
            additionalWorks_showNotification('Дополнительная работа добавлена', 'success');
            if (additionalWorks_currentComponentId) {
                additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
            }
        } else {
            additionalWorks_showNotification(data.message || 'Ошибка при добавлении', 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка:', error);
        additionalWorks_showNotification('Ошибка сети', 'error');
    })
    .finally(() => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
});

function additionalWorks_closeModal() {
    const modalOverlay = document.getElementById('additional-work-modal');
    if (modalOverlay) {
        const modal = modalOverlay.querySelector('.additional-works-modal');
        if (modal) modal.classList.remove('additional-works-active');
        modalOverlay.classList.remove('additional-works-active');
        setTimeout(() => {
            modalOverlay.style.display = 'none';
        }, 300);
    }
}

document.getElementById('modal-close-btn')?.addEventListener('click', additionalWorks_closeModal);
document.getElementById('modal-cancel-btn')?.addEventListener('click', additionalWorks_closeModal);
document.getElementById('additional-work-modal')?.addEventListener('click', function(e) {
    if (e.target === this) additionalWorks_closeModal();
});

// ============================================================================
// 9. INLINE-РЕДАКТИРОВАНИЕ (ТОЛЬКО КОЛИЧЕСТВО) И УДАЛЕНИЕ
// ============================================================================

function additionalWorks_enableInlineEdit(cellElement, fieldName) {
    console.log(`🔄 Активация inline-редактирования для поля: ${fieldName}`);
    if (!cellElement.dataset.editable || cellElement.dataset.editable !== 'true') return;
    if (cellElement.classList.contains('additional-works-editing-cell')) return;
    const workId = cellElement.dataset.workId;
    if (!workId) return;
    const currentValue = cellElement.dataset.originalValue || '';
    const originalHTML = cellElement.innerHTML;
    let inputElement = document.createElement('input');
    inputElement.type = 'number';
    inputElement.value = currentValue;
    inputElement.className = 'additional-works-inline-edit-input';
    inputElement.placeholder = '1';
    inputElement.min = '1';
    inputElement.step = '1';
    inputElement.max = '9999';
    cellElement.innerHTML = '';
    cellElement.appendChild(inputElement);
    cellElement.classList.add('additional-works-editing-cell');
    setTimeout(() => {
        inputElement.focus();
        inputElement.select();
    }, 10);
    let isSaving = false;
    inputElement.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (!isSaving) {
                isSaving = true;
                additionalWorks_saveInlineEdit(cellElement, fieldName, workId, inputElement.value, originalHTML);
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('additional-works-editing-cell');
            additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
        }
    });
    inputElement.addEventListener('blur', function(event) {
        setTimeout(() => {
            if (cellElement.classList.contains('additional-works-editing-cell') && !isSaving) {
                isSaving = true;
                additionalWorks_saveInlineEdit(cellElement, fieldName, workId, inputElement.value, originalHTML);
            }
        }, 150);
    });
    inputElement.addEventListener('mousedown', function(event) { event.stopPropagation(); });
}

function additionalWorks_saveInlineEdit(cellElement, fieldName, workId, newValue, originalHTML) {
    console.log(`💾 Сохранение изменений для работы ID: ${workId}, поле: ${fieldName}`);
    const currentComponentId = additionalWorks_currentComponentId;
    if (newValue === cellElement.dataset.originalValue) {
        cellElement.innerHTML = originalHTML;
        cellElement.classList.remove('additional-works-editing-cell');
        additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
        return;
    }
    let validatedValue = newValue.trim();
    const quantityValue = parseInt(validatedValue, 10);
    if (isNaN(quantityValue) || quantityValue < 1) {
        additionalWorks_showNotification('Количество должно быть целым числом ≥ 1', 'error');
        cellElement.innerHTML = originalHTML;
        cellElement.classList.remove('additional-works-editing-cell');
        additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
        return;
    }
    validatedValue = quantityValue;
    cellElement.innerHTML = `<div class="additional-works-inline-edit-saving"><i class="fas fa-spinner fa-spin"></i><span>Сохранение...</span></div>`;
    const formData = new FormData();
    formData.append('work_id', workId);
    formData.append('field_name', fieldName);
    formData.append('field_value', validatedValue);
    fetch(additionalWorks_apiUrls.updateWork, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': additionalWorks_getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (currentComponentId) {
                setTimeout(() => additionalWorks_loadWorksForComponent(currentComponentId), 300);
            }
            additionalWorks_showNotification('Количество обновлено', 'success');
        } else {
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('additional-works-editing-cell');
            additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
            additionalWorks_showNotification(data.message || 'Ошибка при сохранении', 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при сохранении:', error);
        cellElement.innerHTML = originalHTML;
        cellElement.classList.remove('additional-works-editing-cell');
        additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
        additionalWorks_showNotification('Ошибка сети при сохранении', 'error');
    });
}

function additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId) {
    const oldHandler = cellElement._doubleClickHandler;
    if (oldHandler) cellElement.removeEventListener('dblclick', oldHandler);
    const handleDoubleClick = function(event) {
        event.stopPropagation();
        additionalWorks_enableInlineEdit(this, fieldName);
    };
    cellElement._doubleClickHandler = handleDoubleClick;
    cellElement.addEventListener('dblclick', handleDoubleClick);
}

function additionalWorks_deleteWork(workId, rowElement) {
    console.log(`🗑️ Запрос на удаление работы ID: ${workId}`);
    const currentComponentId = additionalWorks_currentComponentId;
    if (!workId) return;
    if (!confirm('Вы уверены, что хотите удалить эту дополнительную работу?')) return;
    if (additionalWorks_currentSelectedWorkId == workId) additionalWorks_deselectCurrentWork();
    rowElement.style.opacity = '0.5';
    rowElement.style.pointerEvents = 'none';
    const formData = new FormData();
    formData.append('work_id', workId);
    fetch(additionalWorks_apiUrls.deleteWork, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': additionalWorks_getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (rowElement.parentNode) rowElement.parentNode.removeChild(rowElement);
            additionalWorks_showNotification('Работа успешно удалена', 'success');
            if (currentComponentId) {
                setTimeout(() => additionalWorks_loadWorksForComponent(currentComponentId), 300);
            }
        } else {
            rowElement.style.opacity = '1';
            rowElement.style.pointerEvents = 'auto';
            additionalWorks_showNotification(data.message || 'Ошибка при удалении работы', 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при удалении работы:', error);
        rowElement.style.opacity = '1';
        rowElement.style.pointerEvents = 'auto';
        additionalWorks_showNotification('Ошибка сети при удалении работы', 'error');
    });
}

// ============================================================================
// 10. УПРАВЛЕНИЕ ВЫБОРОМ РАБОТЫ
// ============================================================================

function additionalWorks_deselectCurrentWork() {
    if (additionalWorks_currentSelectedWorkId) {
        console.log(`🔄 Снятие выбора с работы ID=${additionalWorks_currentSelectedWorkId}`);
        document.querySelectorAll('#additional-works-table-body tr').forEach(row => row.classList.remove('selected'));
        const deselectedWorkId = additionalWorks_currentSelectedWorkId;
        additionalWorks_currentSelectedWorkId = null;
        const event = new CustomEvent('additionalWorkDeselected', {
            detail: {
                workId: deselectedWorkId,
                componentId: additionalWorks_currentComponentId,
                proschetId: additionalWorks_currentProschetId,
                timestamp: new Date().toISOString()
            }
        });
        document.dispatchEvent(event);
        console.log('📤 Событие additionalWorkDeselected отправлено');
    } else {
        console.log('ℹ️ Нет выбранной работы для снятия выделения');
    }
}

// ============================================================================
// 11. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (CSRF, уведомления, сброс)
// ============================================================================

function additionalWorks_getCsrfToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith(name + '=')) return decodeURIComponent(cookie.substring(name.length + 1));
    }
    console.warn('⚠️ CSRF-токен не найден');
    return '';
}

function additionalWorks_showNotification(message, type = 'info') {
    console.log(`📢 Показ уведомления [${type}]: ${message}`);
    const notification = document.createElement('div');
    notification.className = `additional-works-notification additional-works-notification-${type}`;
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    notification.innerHTML = `
        <div class="additional-works-notification-content">
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        </div>
        <button type="button" class="additional-works-notification-close"><i class="fas fa-times"></i></button>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('additional-works-notification-show'), 10);
    const closeBtn = notification.querySelector('.additional-works-notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            notification.classList.remove('additional-works-notification-show');
            setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
        });
    }
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.remove('additional-works-notification-show');
            setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
        }
    }, 5000);
}

function additionalWorks_resetSection() {
    console.log('🔄 Сброс секции "Дополнительные работы"');
    additionalWorks_showNoComponentSelectedMessage();
    additionalWorks_currentComponentId = null;
    additionalWorks_currentProschetId = null;
    additionalWorks_currentWorks = [];
    additionalWorks_currentVichData = null;
    additionalWorks_deselectCurrentWork();
}

// ============================================================================
// 12. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ДРУГИХ СЕКЦИЙ
// ============================================================================

window.additionalWorksSection = {
    updateForPrintComponent: additionalWorks_updateForPrintComponent,
    reset: additionalWorks_resetSection,
    getCurrentComponentId: () => additionalWorks_currentComponentId,
    getCurrentWorks: () => additionalWorks_currentWorks,
    getSelectedWorkId: () => additionalWorks_currentSelectedWorkId,
    deselectCurrentWork: additionalWorks_deselectCurrentWork,
    getCurrentVichData: () => additionalWorks_currentVichData,
};

console.log('✅ Секция "Дополнительные работы" полностью реализована со всеми функциями');