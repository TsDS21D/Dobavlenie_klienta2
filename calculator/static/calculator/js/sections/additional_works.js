"use strict";

// ============================================================================
// Файл: additional_works.js
// Описание: JavaScript для секции "Дополнительные работы".
//           Управление загрузкой, отображением, добавлением, редактированием
//           (только количества) и удалением дополнительных работ.
//           Интеграция со справочником, с приложением "Вычисления листов",
//           с изменением тиража.
// ============================================================================
//
// ИСПРАВЛЕНИЯ:
//   - В функции additionalWorks_createWorkRow добавлено явное преобразование
//     полей vich_data (item_width, item_height, list_count) в числа,
//     чтобы избежать ошибки "toFixed is not a function" при работе со строками.
//   - Все данные из vich_data теперь гарантированно числа перед использованием.
//   - В функции additionalWorks_updateTotalPrice теперь используются:
//     * work.total_price – для общей стоимости (уже умножено на quantity и формулу)
//     * work.total_cost – для общей себестоимости (рассчитано на сервере)
//     * общая наценка = общая стоимость - общая себестоимость
//
// ============================================================================

// ----------------------------------------------------------------------------
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (состояние секции)
// ----------------------------------------------------------------------------

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
 * Каждый элемент содержит поля: id, number, title, price, quantity, total_price,
 * formatted_price, formatted_total_price, work_id (если связан со справочником).
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
    updateWork: '/calculator/update-additional-work/',       // POST (только для количества)
    deleteWork: '/calculator/delete-additional-work/',       // POST
    getSpravochnikWorks: '/calculator/get-spravochnik-works/' // GET (справочник)
};

// DOM-элементы для блока итоговых сумм
let additionalWorks_totalContainer = null;
let additionalWorks_totalCostElement = null;
let additionalWorks_totalMarkupElement = null;
let additionalWorks_totalPriceElement = null;
let additionalWorks_totalLabelElement = null;  // может не использоваться, но оставим

// ===== ПЕРЕМЕННЫЕ для хранения данных из VichisliniyaListov =====
/**
 * Объект с данными вычислений листов для текущего компонента.
 * Содержит поля: item_width, item_height, list_count, fit_total, cuts_count.
 * @type {Object|null}
 */
let additionalWorks_currentVichData = null;

// ----------------------------------------------------------------------------
// 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Дополнительные работы" загружена и инициализируется');
    additionalWorks_initDOMElements();      // Найти все нужные DOM-элементы
    additionalWorks_setupEventListeners();  // Навесить обработчики событий
    additionalWorks_initInterface();        // Показать начальное состояние (нет компонента)
});

// ----------------------------------------------------------------------------
// 3. ФУНКЦИИ ДЛЯ РАБОТЫ С DOM-ЭЛЕМЕНТАМИ
// ----------------------------------------------------------------------------

/**
 * Ищет и сохраняет ссылки на ключевые DOM-элементы.
 * Если некоторые элементы отсутствуют, создаёт их программно.
 */
function additionalWorks_initDOMElements() {
    console.log('🔍 Инициализация DOM элементов секции "Дополнительные работы"...');

    // Поиск элементов, отвечающих за отображение итоговых сумм
    additionalWorks_totalContainer = document.getElementById('additional-works-total-container');
    additionalWorks_totalCostElement = document.getElementById('additional-works-total-cost');
    additionalWorks_totalMarkupElement = document.getElementById('additional-works-total-markup');
    additionalWorks_totalPriceElement = document.getElementById('additional-works-total-price');

    // Если блок общей стоимости не найден, создаём его вручную
    if (!additionalWorks_totalContainer || !additionalWorks_totalCostElement || !additionalWorks_totalMarkupElement || !additionalWorks_totalPriceElement) {
        console.warn('⚠️ Некоторые DOM элементы не найдены при инициализации');
        additionalWorks_createMissingTotalElements(); // Создать их программно, если отсутствуют
    }
}

/**
 * Создаёт недостающие элементы для отображения итоговых сумм.
 * Это запасной вариант, если в HTML по какой-то причине их нет.
 */
function additionalWorks_createMissingTotalElements() {
    console.log('🛠️ Создание отсутствующих элементов итоговых сумм');
    const worksContainer = document.getElementById('additional-works-container');
    if (!worksContainer) {
        console.error('❌ Контейнер таблицы дополнительных работ не найден');
        return;
    }

    // Создаём div-контейнер для итоговых сумм
    const totalContainer = document.createElement('div');
    totalContainer.id = 'additional-works-total-container';
    totalContainer.className = 'additional-works-total-summary';
    totalContainer.style.display = 'none'; // изначально скрыт

    // Создаём строку для общей себестоимости
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

    // Создаём строку для общей наценки
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

    // Создаём строку для общей стоимости
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

    // Сохраняем ссылки в глобальные переменные
    additionalWorks_totalContainer = totalContainer;
    additionalWorks_totalCostElement = costValue;
    additionalWorks_totalMarkupElement = markupValue;
    additionalWorks_totalPriceElement = priceValue;

    console.log('✅ Отсутствующие элементы итоговых сумм созданы');
}

// ----------------------------------------------------------------------------
// 4. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ
// ----------------------------------------------------------------------------

/**
 * Навешивает все обработчики событий: внутренние (кнопки) и внешние (события документа).
 */
function additionalWorks_setupEventListeners() {
    console.log('🔗 Настраиваем обработчики событий для секции "Дополнительные работы"...');

    // Кнопка "Добавить" в заголовке секции
    const addBtn = document.getElementById('add-additional-work-btn');
    if (addBtn) addBtn.addEventListener('click', additionalWorks_handleAddWork);

    // Кнопка "Добавить первую работу" (отображается, когда список пуст)
    const addFirstBtn = document.getElementById('add-first-work-btn');
    if (addFirstBtn) addFirstBtn.addEventListener('click', additionalWorks_handleAddFirstWork);

    // Кнопка сворачивания/разворачивания секции
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

    // Событие обновления данных вычислений листов
    document.addEventListener('vichisliniyaListovUpdated', function(event) {
        console.log('📥 Получено событие vichisliniyaListovUpdated:', event.detail);
        if (event.detail && event.detail.printComponentId == additionalWorks_currentComponentId) {
            console.log('🔄 Данные вычислений листов изменились – перезагружаем доп. работы');
            additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
        }
    });

    // Событие изменения тиража просчёта
    document.addEventListener('productCirculationUpdated', function(event) {
        console.log('📥 Получено событие productCirculationUpdated:', event.detail);
        if (event.detail && event.detail.proschetId == additionalWorks_currentProschetId) {
            console.log('🔄 Тираж изменился – перезагружаем доп. работы для компонента', additionalWorks_currentComponentId);
            if (additionalWorks_currentComponentId) {
                additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
            }
        }
    });

    // ===== ОБРАБОТЧИК: обновление данных из справочника (в той же вкладке) =====
    document.addEventListener('spravochnikWorkUpdated', function(event) {
        console.log('📥 Получено событие spravochnikWorkUpdated:', event.detail);
        if (additionalWorks_currentComponentId) {
            console.log(`🔄 Работа в справочнике изменилась – перезагружаем доп. работы компонента ${additionalWorks_currentComponentId}`);
            additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
        }
    });

    // ===== СЛУШАТЕЛЬ ИЗМЕНЕНИЙ LOCALSTORAGE (МЕЖВКЛАДОЧНОЕ ВЗАИМОДЕЙСТВИЕ) =====
    window.addEventListener('storage', function(event) {
        // Проверяем, что изменился один из ключей, связанных со справочником
        // Ключ spravochnik_last_update обновляется при изменении Work (базовые данные работы)
        // Ключ work_price_last_update обновляется при изменении опорных точек цены (WorkPrice)
        if (event.key === 'spravochnik_last_update' || event.key === 'work_price_last_update') {
            console.log(`📥 Обнаружено изменение в другой вкладке по ключу ${event.key}, перезагружаем данные`);
            // Если выбран печатный компонент, перезагружаем его дополнительные работы
            if (additionalWorks_currentComponentId) {
                additionalWorks_loadWorksForComponent(additionalWorks_currentComponentId);
            }
        }
    });

    console.log('✅ Обработчики событий настроены');
}

/**
 * Переключает сворачивание/разворачивание секции.
 * @param {Event} event - событие клика по кнопке
 */
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

// ----------------------------------------------------------------------------
// 5. ОСНОВНЫЕ ФУНКЦИИ УПРАВЛЕНИЯ СЕКЦИЕЙ
// ----------------------------------------------------------------------------

/**
 * Инициализация интерфейса при загрузке страницы.
 * Показывает сообщение о том, что компонент не выбран.
 */
function additionalWorks_initInterface() {
    console.log('🎨 Инициализация интерфейса секции "Дополнительные работы"');
    additionalWorks_showNoComponentSelectedMessage(); // Показываем сообщение "компонент не выбран"
}

/**
 * Обновляет секцию при выборе нового печатного компонента.
 * @param {number} componentId - ID печатного компонента
 * @param {string} componentNumber - Номер компонента (например, "KP-1")
 * @param {string} printerName - Название принтера (может быть null)
 */
function additionalWorks_updateForPrintComponent(componentId, componentNumber, printerName) {
    console.log(`🔄 Обновление секции "Дополнительные работы" для компонента ID: ${componentId} (${componentNumber})`);
    additionalWorks_deselectCurrentWork();               // Снимаем выделение с предыдущей работы
    additionalWorks_currentComponentId = componentId;
    additionalWorks_updateComponentTitle(componentNumber, printerName); // Обновляем заголовок
    additionalWorks_loadWorksForComponent(componentId);  // Загружаем список работ с сервера
    additionalWorks_showAddButton(true);                  // Показываем кнопку "Добавить"
}

/**
 * Обновляет заголовок секции, добавляя номер и принтер выбранного компонента.
 * @param {string} componentNumber - Номер компонента
 * @param {string} printerName - Название принтера
 */
function additionalWorks_updateComponentTitle(componentNumber, printerName) {
    const titleElement = document.getElementById('additional-works-component-title');
    if (!titleElement) return;
    let displayText = componentNumber;
    if (printerName) displayText += ` (${printerName})`;
    titleElement.innerHTML = `<span class="additional-works-component-title-active">${displayText}</span>`;
}

/**
 * Загружает список дополнительных работ для указанного компонента с сервера.
 * @param {number} componentId - ID печатного компонента
 */
function additionalWorks_loadWorksForComponent(componentId) {
    console.log(`📥 Загрузка дополнительных работ для компонента ID: ${componentId}`);
    additionalWorks_showLoadingState(); // Показываем индикатор загрузки в таблице

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
            // Сохраняем список работ
            additionalWorks_currentWorks = data.works || [];
            // Сохраняем данные из VichisliniyaListov (параметры печатного компонента)
            additionalWorks_currentVichData = data.vich_data || {
                item_width: 0,
                item_height: 0,
                list_count: 0,
                fit_total: 0,
                cuts_count: 0
            };
            // Обновляем интерфейс на основе полученных данных
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

/**
 * Обновляет интерфейс в зависимости от наличия работ.
 * @param {Array} works - массив объектов дополнительных работ
 */
function additionalWorks_updateInterface(works) {
    console.log('🔄 Обновление интерфейса с дополнительными работами', works);
    additionalWorks_hideAllMessagesAndContainers(); // Скрываем все вспомогательные блоки

    if (works.length === 0) {
        // Если работ нет – показываем сообщение "нет работ"
        additionalWorks_showNoWorksMessage();         // Показываем "нет работ"
        additionalWorks_updateTotalPrice([]);         // Обнуляем общие суммы
        additionalWorks_deselectCurrentWork();        // Снимаем выделение
    } else {
        // Если работы есть – показываем таблицу и заполняем её
        additionalWorks_showTable();                   // Показываем таблицу
        additionalWorks_populateTable(works);          // Заполняем таблицу данными
        additionalWorks_updateTotalPrice(works);       // Вычисляем и отображаем общие суммы
    }
    additionalWorks_showAddButton(true);                // Кнопка "Добавить" всегда видна при выбранном компоненте

    // Отправляем событие, что список работ обновлён (для других секций, например "Цена")
    const event = new CustomEvent('additionalWorksUpdated', {
        detail: {
            componentId: additionalWorks_currentComponentId,
            proschetId: additionalWorks_currentProschetId,
            works: works
        }
    });
    document.dispatchEvent(event);
}

/**
 * Заполняет таблицу строками с данными работ.
 * @param {Array} works - массив объектов дополнительных работ
 */
function additionalWorks_populateTable(works) {
    const tableBody = document.getElementById('additional-works-table-body');
    if (!tableBody) {
        console.error('❌ Элемент #additional-works-table-body не найден');
        return;
    }
    tableBody.innerHTML = ''; // Очищаем таблицу

    // Для каждой работы создаём строку и добавляем в тело таблицы
    works.forEach((work, index) => {
        const row = additionalWorks_createWorkRow(work, index);
        tableBody.appendChild(row);
    });
    console.log(`✅ Таблица обновлена: добавлено ${works.length} строк`);

    // Если ранее была выбрана какая-то работа, восстанавливаем выделение
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

/**
 * Создаёт DOM-элемент строки таблицы для одной дополнительной работы.
 * @param {Object} work - объект дополнительной работы (включает поля effective_price, formatted_effective_price)
 * @param {number} index - индекс для чередования цвета строк
 * @returns {HTMLTableRowElement} готовая строка таблицы
 */
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

    // Обработчик клика по строке (выделение работы)
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

    // Навешиваем обработчик двойного клика только на ячейку количества
    const quantityCell = row.querySelector('.additional-works-work-quantity');
    if (quantityCell) {
        quantityCell.addEventListener('dblclick', function(event) {
            event.stopPropagation();
            additionalWorks_enableInlineEdit(this, 'quantity');
        });
    }

    // Обработчик для кнопки удаления
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

// ----------------------------------------------------------------------------
// 6. ФУНКЦИИ ДЛЯ РАБОТЫ С ОБЩЕЙ СТОИМОСТЬЮ
// ----------------------------------------------------------------------------

/**
 * Обновляет отображение итоговых сумм: общей себестоимости, общей наценки, общей стоимости.
 * ВНИМАНИЕ:
 *   - Общая стоимость = сумма work.total_price (итоговая стоимость каждой работы).
 *   - Общая себестоимость = сумма work.total_cost (общая себестоимость каждой работы).
 *   - Общая наценка = общая стоимость - общая себестоимость.
 * @param {Array} works - Массив объектов работ
 */
function additionalWorks_updateTotalPrice(works) {
    console.log('💰 Обновление итоговых сумм дополнительных работ');
    // Убеждаемся, что DOM-элементы существуют
    if (!additionalWorks_totalContainer || !additionalWorks_totalCostElement || !additionalWorks_totalMarkupElement || !additionalWorks_totalPriceElement) {
        additionalWorks_initDOMElements();
        if (!additionalWorks_totalContainer || !additionalWorks_totalCostElement || !additionalWorks_totalMarkupElement || !additionalWorks_totalPriceElement) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Элементы для отображения итоговых сумм не найдены!');
            return;
        }
    }

    // Инициализируем суммы
    let totalCost = 0;      // общая себестоимость (total_cost из ответа сервера)
    let totalPrice = 0;     // общая стоимость (total_price из ответа сервера)

    works.forEach(work => {
        // Общая себестоимость работы (уже рассчитана на сервере с учётом формулы)
        const workTotalCost = parseFloat(work.total_cost) || 0;
        // Итоговая стоимость работы (уже рассчитана на сервере)
        const workTotalPrice = parseFloat(work.total_price) || 0;

        totalCost += workTotalCost;
        totalPrice += workTotalPrice;
    });

    // Общая наценка = общая стоимость - общая себестоимость
    const totalMarkup = totalPrice - totalCost;

    console.log(`📊 Рассчитаны итоговые суммы: себестоимость = ${totalCost.toFixed(2)} ₽, наценка = ${totalMarkup.toFixed(2)} ₽, общая стоимость = ${totalPrice.toFixed(2)} ₽`);

    // Обновляем текст в блоках
    additionalWorks_totalCostElement.textContent = `${totalCost.toFixed(2)} ₽`;
    additionalWorks_totalMarkupElement.textContent = `${totalMarkup.toFixed(2)} ₽`;
    additionalWorks_totalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;

    // Показываем блок, только если есть работы
    additionalWorks_totalContainer.style.display = works.length > 0 ? 'flex' : 'none';

    console.log(`✅ Итоговые суммы обновлены`);

    // Отправляем событие для обновления секции "Цена" (price.js) с общей стоимостью
    if (additionalWorks_currentComponentId) {
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
    } else {
        console.warn('⚠️ Не удалось отправить событие additionalWorksUpdated: компонент не выбран');
    }
}

// ----------------------------------------------------------------------------
// 7. УПРАВЛЕНИЕ СОСТОЯНИЯМИ ИНТЕРФЕЙСА
// ----------------------------------------------------------------------------

/**
 * Показывает сообщение "Компонент не выбран" и скрывает всё остальное.
 */
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
    // Сбрасываем все данные
    additionalWorks_currentComponentId = null;
    additionalWorks_currentProschetId = null;
    additionalWorks_currentWorks = [];
    additionalWorks_currentVichData = null;
    additionalWorks_deselectCurrentWork();
}

/**
 * Показывает сообщение "Нет дополнительных работ" (когда компонент выбран, но список пуст).
 */
function additionalWorks_showNoWorksMessage() {
    const noComponentMsg = document.getElementById('no-component-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    if (noComponentMsg) noComponentMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'block';
    if (worksContainer) worksContainer.style.display = 'none';
}

/**
 * Показывает таблицу с дополнительными работами.
 */
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

/**
 * Показывает индикатор загрузки в таблице.
 */
function additionalWorks_showLoadingState() {
    const noComponentMsg = document.getElementById('no-component-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    const tableBody = document.getElementById('additional-works-table-body');
    if (noComponentMsg) noComponentMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (tableBody) {
        // Заменяем содержимое таблицы на строку с индикатором загрузки
        // colspan должен быть равен количеству колонок (14)
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

/**
 * Показывает сообщение об ошибке при загрузке.
 * @param {string} message - текст ошибки
 */
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

/**
 * Скрывает все вспомогательные сообщения (компонент не выбран, нет работ).
 */
function additionalWorks_hideAllMessagesAndContainers() {
    const noComponentMsg = document.getElementById('no-component-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    if (noComponentMsg) noComponentMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
}

/**
 * Показывает или скрывает кнопку "Добавить".
 * @param {boolean} show - true – показать, false – скрыть
 */
function additionalWorks_showAddButton(show) {
    const addButton = document.getElementById('add-additional-work-btn');
    if (addButton) addButton.style.display = show ? 'inline-block' : 'none';
}

// ----------------------------------------------------------------------------
// 8. ОБРАБОТЧИКИ ДОБАВЛЕНИЯ РАБОТЫ (МОДАЛЬНОЕ ОКНО)
// ----------------------------------------------------------------------------

/**
 * Обработчик клика по кнопке "Добавить".
 */
function additionalWorks_handleAddWork() {
    console.log('🛠️ Добавление новой дополнительной работы через справочник');
    if (!additionalWorks_currentComponentId) {
        additionalWorks_showNotification('Сначала выберите печатный компонент', 'warning');
        return;
    }
    additionalWorks_openAddModal();
}

/**
 * Обработчик клика по кнопке "Добавить первую работу" (в сообщении о пустом списке).
 */
function additionalWorks_handleAddFirstWork() {
    console.log('➕ Добавление первой дополнительной работы');
    additionalWorks_handleAddWork();
}

/**
 * Открывает модальное окно для добавления работы.
 */
function additionalWorks_openAddModal() {
    const modalOverlay = document.getElementById('additional-work-modal');
    if (!modalOverlay) {
        console.error('❌ Модальное окно не найдено!');
        return;
    }

    // Показываем оверлей (делаем display: flex)
    modalOverlay.style.display = 'flex';

    // Устанавливаем ID текущего компонента в скрытое поле формы
    const hiddenInput = document.getElementById('modal-print-component-id');
    if (hiddenInput) hiddenInput.value = additionalWorks_currentComponentId;

    // Сбрасываем форму
    const form = document.getElementById('additional-work-add-form');
    if (form) form.reset();

    // Очищаем поля названия и цены (на всякий случай) – это гарантирует, что
    // в полях не останется старых значений, и placeholder будет виден.
    const titleDisplay = document.getElementById('work-title-display');
    const priceInput = document.getElementById('work-price-input');
    if (titleDisplay) titleDisplay.value = '';
    if (priceInput) priceInput.value = '';

    // Небольшая задержка перед добавлением классов анимации, чтобы браузер успел применить display
    setTimeout(() => {
        modalOverlay.classList.add('additional-works-active');
        const modal = modalOverlay.querySelector('.additional-works-modal');
        if (modal) modal.classList.add('additional-works-active');
    }, 10);

    // Загружаем список работ из справочника для выпадающего списка
    additionalWorks_loadSpravochnikWorks();
}

/**
 * Загружает список работ из справочника и заполняет выпадающий список в модальном окне.
 */
function additionalWorks_loadSpravochnikWorks() {
    const select = document.getElementById('spravochnik-work-select');
    if (!select) return;

    // Показываем загрузку
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
            // Очищаем и заполняем выпадающий список
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

// Обработчик изменения выпадающего списка – заполняет поля названия и цены
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

// Обработчик отправки формы добавления работы
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
    formData.append('quantity', 1); // По умолчанию количество = 1

    // Если выбран элемент справочника, передаём его ID
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
                // Перезагружаем список работ, чтобы отобразить новую
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

/**
 * Закрывает модальное окно.
 */
function additionalWorks_closeModal() {
    const modalOverlay = document.getElementById('additional-work-modal');
    if (modalOverlay) {
        const modal = modalOverlay.querySelector('.additional-works-modal');
        if (modal) modal.classList.remove('additional-works-active');
        modalOverlay.classList.remove('additional-works-active');
        // После завершения анимации скрываем оверлей полностью
        setTimeout(() => {
            modalOverlay.style.display = 'none';
        }, 300);
    }
}

// Обработчики закрытия модального окна
document.getElementById('modal-close-btn')?.addEventListener('click', additionalWorks_closeModal);
document.getElementById('modal-cancel-btn')?.addEventListener('click', additionalWorks_closeModal);
document.getElementById('additional-work-modal')?.addEventListener('click', function(e) {
    if (e.target === this) additionalWorks_closeModal(); // Клик по оверлею (фону) закрывает окно
});

// ----------------------------------------------------------------------------
// 9. INLINE-РЕДАКТИРОВАНИЕ (ТОЛЬКО КОЛИЧЕСТВО) И УДАЛЕНИЕ
// ----------------------------------------------------------------------------

/**
 * Активирует режим редактирования для ячейки количества.
 * @param {HTMLElement} cellElement - ячейка таблицы
 * @param {string} fieldName - название поля (всегда 'quantity')
 */
function additionalWorks_enableInlineEdit(cellElement, fieldName) {
    console.log(`🔄 Активация inline-редактирования для поля: ${fieldName}`);
    // Проверяем, что ячейка помечена как редактируемая и ещё не в режиме редактирования
    if (!cellElement.dataset.editable || cellElement.dataset.editable !== 'true') return;
    if (cellElement.classList.contains('additional-works-editing-cell')) return;

    const workId = cellElement.dataset.workId;
    if (!workId) return;

    const currentValue = cellElement.dataset.originalValue || '';
    const originalHTML = cellElement.innerHTML;

    // Создаём поле ввода для количества (тип number)
    let inputElement = document.createElement('input');
    inputElement.type = 'number';
    inputElement.value = currentValue;
    inputElement.className = 'additional-works-inline-edit-input';
    inputElement.placeholder = '1';
    inputElement.min = '1';
    inputElement.step = '1';
    inputElement.max = '9999';

    // Заменяем содержимое ячейки на поле ввода
    cellElement.innerHTML = '';
    cellElement.appendChild(inputElement);
    cellElement.classList.add('additional-works-editing-cell');

    // Фокус на поле ввода с небольшой задержкой
    setTimeout(() => {
        inputElement.focus();
        inputElement.select();
    }, 10);

    let isSaving = false; // Флаг, чтобы избежать двойного сохранения

    // Обработчик нажатия клавиш в поле ввода
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
            // Отмена редактирования – восстанавливаем исходное содержимое
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('additional-works-editing-cell');
            additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
        }
    });

    // Обработчик потери фокуса
    inputElement.addEventListener('blur', function(event) {
        setTimeout(() => {
            if (cellElement.classList.contains('additional-works-editing-cell') && !isSaving) {
                isSaving = true;
                additionalWorks_saveInlineEdit(cellElement, fieldName, workId, inputElement.value, originalHTML);
            }
        }, 150);
    });

    // Предотвращаем всплытие клика, чтобы не выделять строку при клике на поле
    inputElement.addEventListener('mousedown', function(event) { event.stopPropagation(); });
}

/**
 * Сохраняет изменённое значение количества на сервер.
 * @param {HTMLElement} cellElement - ячейка таблицы
 * @param {string} fieldName - название поля ('quantity')
 * @param {number} workId - ID дополнительной работы
 * @param {string} newValue - новое значение
 * @param {string} originalHTML - исходный HTML ячейки для восстановления в случае ошибки
 */
function additionalWorks_saveInlineEdit(cellElement, fieldName, workId, newValue, originalHTML) {
    console.log(`💾 Сохранение изменений для работы ID: ${workId}, поле: ${fieldName}`);
    const currentComponentId = additionalWorks_currentComponentId;

    // Если значение не изменилось – просто выходим из режима редактирования
    if (newValue === cellElement.dataset.originalValue) {
        cellElement.innerHTML = originalHTML;
        cellElement.classList.remove('additional-works-editing-cell');
        additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
        return;
    }

    // Валидация: должно быть целое число ≥ 1
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

    // Показываем индикатор сохранения
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
            // После успешного сохранения перезагружаем список работ, чтобы обновить total_price и общую сумму
            if (currentComponentId) {
                setTimeout(() => additionalWorks_loadWorksForComponent(currentComponentId), 300);
            }
            additionalWorks_showNotification('Количество обновлено', 'success');
        } else {
            // Ошибка – восстанавливаем исходное содержимое ячейки
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

/**
 * Восстанавливает обработчик двойного клика для ячейки количества.
 * @param {HTMLElement} cellElement - ячейка таблицы
 * @param {string} fieldName - название поля ('quantity')
 * @param {number} workId - ID работы
 */
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

/**
 * Удаляет дополнительную работу.
 * @param {number} workId - ID работы
 * @param {HTMLElement} rowElement - строка таблицы, соответствующая работе
 */
function additionalWorks_deleteWork(workId, rowElement) {
    console.log(`🗑️ Запрос на удаление работы ID: ${workId}`);
    const currentComponentId = additionalWorks_currentComponentId;
    if (!workId) return;
    if (!confirm('Вы уверены, что хотите удалить эту дополнительную работу?')) return;

    // Если удаляемая работа была выделена, снимаем выделение
    if (additionalWorks_currentSelectedWorkId == workId) additionalWorks_deselectCurrentWork();

    // Визуально отмечаем удаление (делаем строку полупрозрачной)
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
            // Удаляем строку из DOM
            if (rowElement.parentNode) rowElement.parentNode.removeChild(rowElement);
            additionalWorks_showNotification('Работа успешно удалена', 'success');
            // Перезагружаем список, чтобы обновить общую сумму (можно и без перезагрузки, но для надёжности)
            if (currentComponentId) {
                setTimeout(() => additionalWorks_loadWorksForComponent(currentComponentId), 300);
            }
        } else {
            // Возвращаем строку в нормальное состояние
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

// ----------------------------------------------------------------------------
// 10. УПРАВЛЕНИЕ ВЫБОРОМ РАБОТЫ
// ----------------------------------------------------------------------------

/**
 * Снимает выделение с текущей выбранной работы.
 */
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

// ----------------------------------------------------------------------------
// 11. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (CSRF, уведомления, сброс)
// ----------------------------------------------------------------------------

/**
 * Получает CSRF-токен из cookies.
 * @returns {string} токен или пустая строка
 */
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

/**
 * Показывает всплывающее уведомление.
 * @param {string} message - текст сообщения
 * @param {string} type - тип: 'success', 'error', 'warning', 'info'
 */
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

    // Автоматически скрываем через 5 секунд
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.remove('additional-works-notification-show');
            setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
        }
    }, 5000);
}

/**
 * Полный сброс секции (при отмене выбора компонента).
 */
function additionalWorks_resetSection() {
    console.log('🔄 Сброс секции "Дополнительные работы"');
    additionalWorks_showNoComponentSelectedMessage();
    additionalWorks_currentComponentId = null;
    additionalWorks_currentProschetId = null;
    additionalWorks_currentWorks = [];
    additionalWorks_currentVichData = null;
    additionalWorks_deselectCurrentWork();
}

// ----------------------------------------------------------------------------
// 12. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ДРУГИХ СЕКЦИЙ
// ----------------------------------------------------------------------------

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