/*
sections/additional_works.js - JavaScript для секции "Дополнительные работы"
ИСПРАВЛЕНИЕ: Уникальные названия переменных и функций для устранения конфликтов
ДОБАВЛЕНО: Подробные комментарии для каждой функции и блока кода
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ СЕКЦИИ ДОПОЛНИТЕЛЬНЫХ РАБОТ =====
// Все переменные имеют префикс "additionalWorks_" для уникальности

/**
 * Текущий ID просчёта, для которого отображаются дополнительные работы
 * @type {number|null}
 */
let additionalWorks_currentProschetId = null;

/**
 * Массив текущих дополнительных работ для выбранного просчёта
 * @type {Array}
 */
let additionalWorks_currentAdditionalWorks = [];

/**
 * Объект с URL-адресами API для работы с дополнительными работами
 * @type {Object}
 */
const additionalWorks_apiUrls = {
    getWorks: '/calculator/get-additional-works/',
    addWork: '/calculator/add-additional-work/',
    updateWork: '/calculator/update-additional-work/',
    deleteWork: '/calculator/delete-additional-work/',
};

/**
 * DOM-элемент контейнера общей стоимости
 * @type {HTMLElement|null}
 */
let additionalWorks_totalContainer = null;

/**
 * DOM-элемент для отображения общей цены
 * @type {HTMLElement|null}
 */
let additionalWorks_totalPriceElement = null;

/**
 * DOM-элемент для отображения метки общей стоимости
 * @type {HTMLElement|null}
 */
let additionalWorks_totalLabelElement = null;

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

/**
 * Обработчик события загрузки DOM
 * Вызывается когда весь DOM загружен и готов к работе
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Дополнительные работы" загружена и инициализируется');
    
    // Инициализируем DOM элементы при загрузке
    additionalWorks_initDOMElements();
    
    // Настраиваем обработчики событий для секции
    additionalWorks_setupEventListeners();
    
    // Инициализируем интерфейс секции
    additionalWorks_initInterface();
});

// ===== 3. ФУНКЦИИ ДЛЯ РАБОТЫ С DOM-ЭЛЕМЕНТАМИ =====

/**
 * Инициализация DOM элементов секции
 * Вызывается при загрузке страницы для кэширования элементов
 */
function additionalWorks_initDOMElements() {
    console.log('🔍 Инициализация DOM элементов секции "Дополнительные работы"...');
    
    // Кэшируем элементы общей стоимости (ИСПРАВЛЕНО: уникальные названия)
    additionalWorks_totalContainer = document.getElementById('additional-works-total-container');
    additionalWorks_totalPriceElement = document.getElementById('additional-works-total-price');
    
    // Находим элемент метки общей стоимости
    additionalWorks_totalLabelElement = additionalWorks_totalContainer 
        ? additionalWorks_totalContainer.querySelector('.additional-works-total-label') 
        : null;
    
    // Отладочная информация
    console.log('📊 DOM элементы общей стоимости:');
    console.log('- Контейнер:', !!additionalWorks_totalContainer);
    console.log('- Метка:', !!additionalWorks_totalLabelElement);
    console.log('- Цена:', !!additionalWorks_totalPriceElement);
    
    // Если элементы не найдены, создаем их
    if (!additionalWorks_totalContainer || !additionalWorks_totalLabelElement || !additionalWorks_totalPriceElement) {
        console.warn('⚠️ Некоторые DOM элементы не найдены при инициализации');
        additionalWorks_createMissingTotalElements();
    }
}

/**
 * Создает отсутствующие элементы общей стоимости
 * Вызывается если элементы не найдены в DOM
 */
function additionalWorks_createMissingTotalElements() {
    console.log('🛠️ Создание отсутствующих элементов общей стоимости');
    
    // Находим контейнер таблицы
    const worksContainer = document.getElementById('additional-works-container');
    if (!worksContainer) {
        console.error('❌ Контейнер таблицы дополнительных работ не найден');
        return;
    }
    
    // Создаем элементы общей стоимости
    const totalContainer = document.createElement('div');
    totalContainer.id = 'additional-works-total-container';
    totalContainer.className = 'additional-works-total-summary';
    totalContainer.style.display = 'none';
    
    const totalLabel = document.createElement('div');
    totalLabel.className = 'additional-works-total-label';
    totalLabel.textContent = 'Общая стоимость дополнительных работ:';
    
    const totalPriceElement = document.createElement('div');
    totalPriceElement.id = 'additional-works-total-price';
    totalPriceElement.className = 'additional-works-total-price';
    totalPriceElement.textContent = '0.00 ₽';
    
    // Собираем структуру
    totalContainer.appendChild(totalLabel);
    totalContainer.appendChild(totalPriceElement);
    
    // Добавляем элементы в контейнер таблицы
    worksContainer.appendChild(totalContainer);
    
    // Сохраняем ссылки на созданные элементы
    additionalWorks_totalContainer = totalContainer;
    additionalWorks_totalLabelElement = totalLabel;
    additionalWorks_totalPriceElement = totalPriceElement;
    
    console.log('✅ Отсутствующие элементы общей стоимости созданы');
}

// ===== 4. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====

/**
 * Настройка всех обработчиков событий для секции
 */
function additionalWorks_setupEventListeners() {
    console.log('🔗 Настраиваем обработчики событий для секции "Дополнительные работы"...');
    
    // Обработчик для кнопки добавления работы
    const addBtn = document.getElementById('add-additional-work-btn');
    if (addBtn) {
        addBtn.addEventListener('click', additionalWorks_handleAddWork);
    }
    
    // Обработчик для кнопки добавления первой работы
    const addFirstBtn = document.getElementById('add-first-work-btn');
    if (addFirstBtn) {
        addFirstBtn.addEventListener('click', additionalWorks_handleAddFirstWork);
    }
    
    // Обработчик для кнопки сворачивания секции
    const collapseBtn = document.querySelector('.additional-works-btn-collapse-section');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', additionalWorks_toggleSectionCollapse);
    }
    
    console.log('✅ Обработчики событий настроены');
}

/**
 * Переключение состояния сворачивания/разворачивания секции
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

// ===== 5. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ДОПОЛНИТЕЛЬНЫМИ РАБОТАМИ =====

/**
 * Инициализация интерфейса секции
 * Вызывается при загрузке страницы
 */
function additionalWorks_initInterface() {
    console.log('🎨 Инициализация интерфейса секции "Дополнительные работы"');
    additionalWorks_showNoProschetSelectedMessage();
}

/**
 * Обновление секции для выбранного просчёта
 * @param {number} proschetId - ID просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы
 */
function additionalWorks_updateForProschet(proschetId, rowElement) {
    console.log(`🔄 Обновление секции "Дополнительные работы" для просчёта ID: ${proschetId}`);
    
    // Сохраняем ID просчёта
    additionalWorks_currentProschetId = proschetId;
    
    // Обновляем заголовок
    additionalWorks_updateProschetTitle(rowElement);
    
    // Загружаем работы
    additionalWorks_loadWorksForProschet(proschetId);
    
    // Восстанавливаем выбор
    additionalWorks_restoreProschetSelection(proschetId);
}

/**
 * Обновление заголовка просчёта в секции
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы
 */
function additionalWorks_updateProschetTitle(rowElement) {
    const proschetTitleElement = document.getElementById('additional-works-proschet-title');
    if (!proschetTitleElement) {
        console.warn('❌ Элемент #additional-works-proschet-title не найден');
        return;
    }
    
    const titleCell = rowElement.querySelector('.proschet-title');
    if (!titleCell) {
        console.warn('❌ Ячейка с названием просчёта не найдена');
        return;
    }
    
    const proschetTitle = titleCell.textContent.trim();
    proschetTitleElement.innerHTML = `
        <span class="additional-works-proschet-title-active">
            ${proschetTitle}
        </span>
    `;
}

/**
 * Загрузка дополнительных работ для указанного просчёта
 * @param {number} proschetId - ID просчёта
 */
function additionalWorks_loadWorksForProschet(proschetId) {
    console.log(`📥 Загрузка дополнительных работ для просчёта ID: ${proschetId}`);
    
    // Сохраняем ID просчёта перед загрузкой
    additionalWorks_currentProschetId = proschetId;
    
    additionalWorks_showLoadingState();
    const url = `${additionalWorks_apiUrls.getWorks}${proschetId}/`;
    
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': additionalWorks_getCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('📊 Получены данные дополнительных работ:', data);
        
        if (data.success) {
            additionalWorks_currentAdditionalWorks = data.works || [];
            additionalWorks_updateInterface(data.works || []);
            console.log(`✅ Загружено ${additionalWorks_currentAdditionalWorks.length} дополнительных работ`);
        } else {
            console.error('❌ Ошибка при загрузке работ:', data.message);
            additionalWorks_showErrorMessage('Не удалось загрузить дополнительные работы');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при загрузке работ:', error);
        additionalWorks_showErrorMessage('Ошибка сети при загрузке дополнительных работ');
        
        // Восстанавливаем выбор просчёта даже при ошибке
        if (proschetId) {
            additionalWorks_restoreProschetSelection(proschetId);
        }
    });
}

/**
 * Обновление интерфейса с дополнительными работами
 * @param {Array} works - Массив объектов дополнительных работ
 */
function additionalWorks_updateInterface(works) {
    console.log('🔄 Обновление интерфейса с дополнительными работами', works);
    
    // Синхронизируем выбранный просчёт с другими секциями
    additionalWorks_syncProschetSelection();
    
    // Скрываем все сообщения и контейнеры
    additionalWorks_hideAllMessagesAndContainers();
    
    if (works.length === 0) {
        additionalWorks_showNoWorksMessage();
        additionalWorks_updateTotalPrice([]);
    } else {
        additionalWorks_showTable();
        additionalWorks_populateTable(works);
        additionalWorks_updateTotalPrice(works);
    }
    
    additionalWorks_showAddButton(true);
    
    // Отправляем событие для обновления других секций
    const event = new CustomEvent('additionalWorksUpdated', {
        detail: {
            proschetId: additionalWorks_currentProschetId,
            works: works
        }
    });
    document.dispatchEvent(event);
}

/**
 * Заполнение таблицы дополнительными работами
 * @param {Array} works - Массив объектов дополнительных работ
 */
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
}

/**
 * Создание строки таблицы для дополнительной работы
 * @param {Object} work - Объект работы
 * @param {number} index - Индекс в массиве
 * @returns {HTMLElement} DOM-элемент строки таблицы
 */
function additionalWorks_createWorkRow(work, index) {
    const row = document.createElement('tr');
    
    // Добавляем классы для чередования строк
    if (index % 2 === 0) {
        row.classList.add('additional-works-even-row');
    } else {
        row.classList.add('additional-works-odd-row');
    }
    
    // Добавляем класс для возможности выбора строки
    row.classList.add('additional-works-selectable-row');
    row.dataset.workId = work.id;
    
    // Заполняем содержимое строки
    row.innerHTML = `
        <td class="additional-works-work-number">${work.number || '—'}</td>
        <td class="additional-works-work-title additional-works-editable-cell" 
            data-editable="true"
            data-field="title"
            data-original-value="${work.title || ''}"
            data-work-id="${work.id}">
            ${work.title || '—'}
        </td>
        <td class="additional-works-work-price additional-works-editable-cell"
            data-editable="true"
            data-field="price"
            data-original-value="${work.price || '0.00'}"
            data-work-id="${work.id}">
            ${work.formatted_price || '0.00 ₽'}
        </td>
        <td class="additional-works-work-actions">
            <button type="button" class="additional-works-delete-work-btn" 
                    title="Удалить работу" 
                    data-work-id="${work.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;
    
    // Обработчик клика по строке (для выделения)
    row.addEventListener('click', function(event) {
        if (!event.target.closest('.additional-works-delete-work-btn') && 
            !event.target.closest('.additional-works-editable-cell')) {
            const allRows = document.querySelectorAll('#additional-works-table-body tr');
            allRows.forEach(r => r.classList.remove('additional-works-selected'));
            this.classList.add('additional-works-selected');
        }
    });
    
    // Обработчики для inline-редактирования
    const titleCell = row.querySelector('.additional-works-work-title');
    const priceCell = row.querySelector('.additional-works-work-price');
    
    if (titleCell) {
        titleCell.addEventListener('dblclick', function(event) {
            event.stopPropagation();
            additionalWorks_enableInlineEdit(this, 'title');
        });
    }
    
    if (priceCell) {
        priceCell.addEventListener('dblclick', function(event) {
            event.stopPropagation();
            additionalWorks_enableInlineEdit(this, 'price');
        });
    }
    
    // Обработчик для кнопки удаления
    const deleteBtn = row.querySelector('.additional-works-delete-work-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            const workId = this.dataset.workId;
            if (workId) {
                additionalWorks_deleteWork(workId, row);
            }
        });
    }
    
    return row;
}

// ===== 6. ФУНКЦИИ ДЛЯ РАБОТЫ С ОБЩЕЙ СТОИМОСТЬЮ (ИСПРАВЛЕНО) =====

/**
 * Обновление отображения общей стоимости работ
 * @param {Array} works - Массив объектов дополнительных работ
 */
function additionalWorks_updateTotalPrice(works) {
    console.log('💰 Обновление общей стоимости дополнительных работ');
    console.log('📊 Количество работ:', works.length);
    
    // Проверяем, инициализированы ли элементы
    if (!additionalWorks_totalContainer || !additionalWorks_totalLabelElement || !additionalWorks_totalPriceElement) {
        console.warn('⚠️ DOM элементы общей стоимости не инициализированы, пытаемся найти...');
        additionalWorks_initDOMElements();
        
        if (!additionalWorks_totalContainer || !additionalWorks_totalLabelElement || !additionalWorks_totalPriceElement) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Элементы для отображения общей стоимости не найдены!');
            return;
        }
    }
    
    // Вычисляем общую стоимость всех работ
    let totalPrice = 0;
    works.forEach(work => {
        if (work.price) {
            totalPrice += parseFloat(work.price);
        }
    });
    
    console.log(`📊 Рассчитана общая стоимость работ: ${totalPrice.toFixed(2)} ₽`);
    
    // Форматируем и отображаем общую стоимость
    additionalWorks_totalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;
    
    // Обновляем метку (на всякий случай)
    additionalWorks_totalLabelElement.textContent = 'Общая стоимость дополнительных работ:';
    
    // Управляем видимостью блока общей стоимости
    if (works.length > 0) {
        additionalWorks_totalContainer.style.display = 'flex';
        console.log(`✅ Показан блок общей стоимости дополнительных работ`);
    } else {
        additionalWorks_totalContainer.style.display = 'none';
        console.log(`✅ Скрыт блок общей стоимости (работ нет)`);
    }
    
    console.log(`✅ Локальная сумма обновлена: ${totalPrice.toFixed(2)} ₽`);
    
    // Отправляем событие для обновления секции "Цена"
    if (additionalWorks_currentProschetId) {
        const event = new CustomEvent('additionalWorksUpdated', {
            detail: {
                proschetId: additionalWorks_currentProschetId,
                works: works,
                totalPrice: totalPrice
            }
        });
        document.dispatchEvent(event);
        console.log(`📤 Событие additionalWorksUpdated отправлено для просчёта ${additionalWorks_currentProschetId}`);
    } else {
        console.warn('⚠️ Не удалось отправить событие additionalWorksUpdated: просчёт не выбран');
    }
}

// ===== 7. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА =====

/**
 * Показ сообщения "Выберите просчёт"
 */
function additionalWorks_showNoProschetSelectedMessage() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    const addButton = document.getElementById('add-additional-work-btn');
    
    if (noProschetMsg) noProschetMsg.style.display = 'block';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (worksContainer) worksContainer.style.display = 'none';
    if (addButton) addButton.style.display = 'none';
    
    const proschetTitleElement = document.getElementById('additional-works-proschet-title');
    if (proschetTitleElement) {
        proschetTitleElement.innerHTML = `<span class="additional-works-placeholder-text">(просчёт не выбран)</span>`;
    }
    
    additionalWorks_currentProschetId = null;
    additionalWorks_currentAdditionalWorks = [];
}

/**
 * Показ сообщения "Нет дополнительных работ"
 */
function additionalWorks_showNoWorksMessage() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'block';
    if (worksContainer) worksContainer.style.display = 'none';
}

/**
 * Показ таблицы с работами
 */
function additionalWorks_showTable() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (worksContainer) {
        worksContainer.style.display = 'block';
        console.log('✅ Таблица дополнительных работ показана');
    }
}

/**
 * Показ состояния загрузки
 */
function additionalWorks_showLoadingState() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    const tableBody = document.getElementById('additional-works-table-body');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="additional-works-text-center" style="padding: 40px;">
                    <div class="additional-works-loading-spinner"></div>
                    <p>Загрузка дополнительных работ...</p>
                </td>
            </tr>
        `;
        
        if (worksContainer) {
            worksContainer.style.display = 'block';
        }
    }
}

/**
 * Показ сообщения об ошибке
 * @param {string} message - Текст сообщения об ошибке
 */
function additionalWorks_showErrorMessage(message) {
    const tableBody = document.getElementById('additional-works-table-body');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="additional-works-text-center" style="padding: 40px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p>${message}</p>
                    <button type="button" id="additional-works-retry-load-btn" class="additional-works-btn-action" style="margin-top: 10px;">
                        <i class="fas fa-redo"></i> Повторить попытку
                    </button>
                </td>
            </tr>
        `;
        
        const retryBtn = document.getElementById('additional-works-retry-load-btn');
        if (retryBtn && additionalWorks_currentProschetId) {
            retryBtn.addEventListener('click', function() {
                additionalWorks_loadWorksForProschet(additionalWorks_currentProschetId);
            });
        }
    }
}

/**
 * Скрытие всех сообщений и контейнеров
 */
function additionalWorks_hideAllMessagesAndContainers() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
}

/**
 * Показ/скрытие кнопки добавления
 * @param {boolean} show - Показывать кнопку (true) или скрыть (false)
 */
function additionalWorks_showAddButton(show) {
    const addButton = document.getElementById('add-additional-work-btn');
    if (addButton) {
        addButton.style.display = show ? 'inline-block' : 'none';
    }
}

// ===== 8. ОБРАБОТЧИКИ КНОПОК =====

/**
 * Обработчик кнопки добавления работы
 */
function additionalWorks_handleAddWork() {
    console.log('🛠️ Добавление новой дополнительной работы');
    
    if (!additionalWorks_currentProschetId) {
        additionalWorks_showNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    
    additionalWorks_showAddWorkModal();
}

/**
 * Обработчик кнопки добавления первой работы
 */
function additionalWorks_handleAddFirstWork() {
    console.log('➕ Добавление первой дополнительной работы');
    additionalWorks_handleAddWork();
}

// ===== 9. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

/**
 * Получение CSRF-токена из куки
 * @returns {string} CSRF-токен
 */
function additionalWorks_getCsrfToken() {
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


/**
 * Восстановление выбранного просчёта после операций
 * @param {number} proschetId - ID просчёта для восстановления
 */
function additionalWorks_restoreProschetSelection(proschetId) {
    console.log(`🔧 Восстановление выбора просчёта ID: ${proschetId}`);
    
    if (!proschetId) {
        console.warn('⚠️ Не указан ID просчёта для восстановления');
        return;
    }
    
    // Обновляем глобальную переменную
    additionalWorks_currentProschetId = proschetId;
    
    // Обновляем заголовок в секции
    const proschetTitleElement = document.getElementById('additional-works-proschet-title');
    if (proschetTitleElement) {
        proschetTitleElement.innerHTML = `
            <span class="additional-works-proschet-title-active">
                Просчёт #${proschetId}
            </span>
        `;
    }
    
    // Показываем кнопку добавления
    additionalWorks_showAddButton(true);
    
    // Синхронизируем с другими секциями
    additionalWorks_syncProschetSelection();
}



/**
 * Показ уведомления
 * @param {string} message - Текст уведомления
 * @param {string} type - Тип уведомления (info, success, error, warning)
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
        <button type="button" class="additional-works-notification-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('additional-works-notification-show');
    }, 10);
    
    const closeBtn = notification.querySelector('.additional-works-notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            notification.classList.remove('additional-works-notification-show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
    }
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.remove('additional-works-notification-show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}

// ===== 10. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С ДРУГИМИ СЕКЦИЯМИ =====

/**
 * Объект для взаимодействия с другими секциями
 */
window.additionalWorksSection = {
    /**
     * Обновление секции для выбранного просчёта
     * @param {number} proschetId - ID просчёта
     * @param {HTMLElement} rowElement - DOM-элемент строки таблицы
     */
    updateForProschet: function(proschetId, rowElement) {
        additionalWorks_updateForProschet(proschetId, rowElement);
    },
    
    /**
     * Сброс секции к начальному состоянию
     */
    reset: function() {
        additionalWorks_showNoProschetSelectedMessage();
    },
    
    /**
     * Получение текущего ID просчёта
     * @returns {number|null} Текущий ID просчёта
     */
    getCurrentProschetId: function() {
        return additionalWorks_currentProschetId;
    },
    
    /**
     * Получение текущих дополнительных работ
     * @returns {Array} Массив текущих работ
     */
    getCurrentWorks: function() {
        return additionalWorks_currentAdditionalWorks;
    },
    
    /**
     * Восстановление выбранного просчёта
     * @param {number} proschetId - ID просчёта для восстановления
     */
    restoreProschetSelection: function(proschetId) {
        additionalWorks_restoreProschetSelection(proschetId);
    }
};

// ===== 11. ФУНКЦИИ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ =====

/**
 * Активация inline-редактирования для ячейки таблицы
 * @param {HTMLElement} cellElement - DOM-элемент ячейки
 * @param {string} fieldName - Название поля (title или price)
 */
function additionalWorks_enableInlineEdit(cellElement, fieldName) {
    console.log(`🔄 Активация inline-редактирования для поля: ${fieldName}`);
    
    if (!cellElement.dataset.editable || cellElement.dataset.editable !== 'true') {
        console.warn('❌ Ячейка не доступна для редактирования');
        return;
    }
    
    if (cellElement.classList.contains('additional-works-editing-cell')) {
        console.log('⚠️ Ячейка уже находится в режиме редактирования');
        return;
    }
    
    const workId = cellElement.dataset.workId;
    if (!workId) {
        console.warn('❌ Не удалось получить ID работы для редактирования');
        return;
    }
    
    const currentValue = cellElement.dataset.originalValue || '';
    const originalHTML = cellElement.innerHTML;
    
    let inputElement;
    
    if (fieldName === 'title') {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = currentValue;
        inputElement.className = 'additional-works-inline-edit-input';
        inputElement.placeholder = 'Введите название работы';
        inputElement.maxLength = 200;
        inputElement.autocomplete = 'off';
        inputElement.autocapitalize = 'off';
        inputElement.spellcheck = false;
    } else if (fieldName === 'price') {
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.value = currentValue;
        inputElement.className = 'additional-works-inline-edit-input';
        inputElement.placeholder = '0.00';
        inputElement.min = '0';
        inputElement.step = '0.01';
        inputElement.max = '9999999.99';
        inputElement.autocomplete = 'off';
    } else {
        console.warn(`❌ Неподдерживаемое поле для редактирования: ${fieldName}`);
        return;
    }
    
    cellElement.dataset.currentInputId = 'input_' + Date.now();
    cellElement.innerHTML = '';
    cellElement.appendChild(inputElement);
    cellElement.classList.add('additional-works-editing-cell');
    
    setTimeout(() => {
        inputElement.focus();
        if (fieldName === 'title' || fieldName === 'price') {
            inputElement.select();
        }
    }, 10);
    
    let isSaving = false;
    
    // Обработчик нажатия клавиш
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
    
    // Обработчик потери фокуса
    inputElement.addEventListener('blur', function(event) {
        setTimeout(() => {
            if (cellElement.classList.contains('additional-works-editing-cell') && !isSaving) {
                isSaving = true;
                additionalWorks_saveInlineEdit(cellElement, fieldName, workId, inputElement.value, originalHTML);
            }
        }, 150);
    });
    
    // Предотвращаем всплытие событий мыши
    inputElement.addEventListener('mousedown', function(event) {
        event.stopPropagation();
    });
}

/**
 * Сохранение изменений при inline-редактировании
 * @param {HTMLElement} cellElement - DOM-элемент ячейки
 * @param {string} fieldName - Название поля
 * @param {string} workId - ID работы
 * @param {string} newValue - Новое значение
 * @param {string} originalHTML - Оригинальное HTML содержимое
 */
function additionalWorks_saveInlineEdit(cellElement, fieldName, workId, newValue, originalHTML) {
    console.log(`💾 Сохранение изменений для работы ID: ${workId}, поле: ${fieldName}`);
    
    // Сохраняем текущий ID просчёта перед сохранением
    const currentProschetId = additionalWorks_currentProschetId;
    console.log(`💾 Сохраняем текущий ID просчёта: ${currentProschetId}`);
    
    // Если значение не изменилось
    if (newValue === cellElement.dataset.originalValue) {
        console.log('📝 Значение не изменилось, отмена редактирования');
        cellElement.innerHTML = originalHTML;
        cellElement.classList.remove('additional-works-editing-cell');
        additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
        return;
    }
    
    let validatedValue = newValue.trim();
    
    // Валидация для названия
    if (fieldName === 'title') {
        if (!validatedValue) {
            additionalWorks_showNotification('Название не может быть пустым', 'error');
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('additional-works-editing-cell');
            additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
            return;
        }
        
        if (validatedValue.length > 200) {
            additionalWorks_showNotification('Название не должно превышать 200 символов', 'error');
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('additional-works-editing-cell');
            additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
            return;
        }
    } 
    // Валидация для цены
    else if (fieldName === 'price') {
        const priceValue = parseFloat(validatedValue);
        
        if (isNaN(priceValue)) {
            additionalWorks_showNotification('Цена должна быть числом', 'error');
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('additional-works-editing-cell');
            additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
            return;
        }
        
        if (priceValue < 0) {
            additionalWorks_showNotification('Цена не может быть отрицательной', 'error');
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('additional-works-editing-cell');
            additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
            return;
        }
        
        validatedValue = priceValue.toFixed(2);
    }
    
    // Показываем индикатор сохранения
    cellElement.innerHTML = `
        <div class="additional-works-inline-edit-saving">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Сохранение...</span>
        </div>
    `;
    
    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('work_id', workId);
    formData.append('field_name', fieldName);
    formData.append('field_value', validatedValue);
    
    // Отправляем запрос на сервер
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
            console.log('✅ Изменения успешно сохранены');
            
            // Обновляем содержимое ячейки
            if (fieldName === 'title') {
                cellElement.textContent = validatedValue;
                cellElement.dataset.originalValue = validatedValue;
                additionalWorks_showNotification('Изменения сохранены', 'success');
                
                // Немедленно обновляем интерфейс для названия
                cellElement.classList.remove('additional-works-editing-cell');
                additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId);
            } else if (fieldName === 'price') {
                const formattedPrice = `${parseFloat(validatedValue).toFixed(2)} ₽`;
                cellElement.textContent = formattedPrice;
                cellElement.dataset.originalValue = validatedValue;
                
                // Перезагружаем работы для обновления общей стоимости, но сохраняем ID просчёта
                if (currentProschetId) {
                    console.log(`🔄 Перезагружаем работы для сохранённого просчёта ID: ${currentProschetId}`);
                    // Небольшая задержка для надёжности
                    setTimeout(() => {
                        additionalWorks_loadWorksForProschet(currentProschetId);
                    }, 300);
                }
                additionalWorks_showNotification('Изменения сохранены', 'success');
            }
        } else {
            console.error('❌ Ошибка при сохранении:', data.message);
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
 * Синхронизация выбранного просчёта с другими секциями
 */
function additionalWorks_syncProschetSelection() {
    console.log(`🔄 Синхронизация выбранного просчёта: ${additionalWorks_currentProschetId}`);
    
    if (!additionalWorks_currentProschetId) {
        console.warn('⚠️ Нет текущего ID просчёта для синхронизации');
        return;
    }
    
    // Отправляем событие другим секциям для обновления выделения
    const event = new CustomEvent('additionalWorksProschetSync', {
        detail: {
            proschetId: additionalWorks_currentProschetId
        }
    });
    document.dispatchEvent(event);
    console.log(`📤 Событие синхронизации отправлено для просчёта ${additionalWorks_currentProschetId}`);
}

// Вызывать эту функцию после каждой операции:
// В additionalWorks_loadWorksForProschet после успешной загрузки:
// additionalWorks_syncProschetSelection();

// В additionalWorks_handleAddWorkSubmit после успешного добавления:
// additionalWorks_syncProschetSelection();

// В additionalWorks_deleteWork после успешного удаления:
// additionalWorks_syncProschetSelection();




/**
 * Восстановление обработчиков событий для ячейки после редактирования
 * @param {HTMLElement} cellElement - DOM-элемент ячейки
 * @param {string} fieldName - Название поля
 * @param {string} workId - ID работы
 */
function additionalWorks_restoreCellEventListeners(cellElement, fieldName, workId) {
    console.log(`🔄 Восстановление обработчиков для ячейки, поле: ${fieldName}`);
    
    // Удаляем старые обработчики
    const oldHandler = cellElement._doubleClickHandler;
    if (oldHandler) {
        cellElement.removeEventListener('dblclick', oldHandler);
    }
    
    // Создаем новый обработчик
    const handleDoubleClick = function(event) {
        event.stopPropagation();
        additionalWorks_enableInlineEdit(this, fieldName);
    };
    
    // Сохраняем ссылку на обработчик
    cellElement._doubleClickHandler = handleDoubleClick;
    
    // Добавляем новый обработчик
    cellElement.addEventListener('dblclick', handleDoubleClick);
}

/**
 * Удаление дополнительной работы
 * @param {string} workId - ID работы для удаления
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы
 */
function additionalWorks_deleteWork(workId, rowElement) {
    console.log(`🗑️ Запрос на удаление работы ID: ${workId}`);
    
    // Сохраняем текущий ID просчёта перед удалением
    const currentProschetId = additionalWorks_currentProschetId;
    console.log(`💾 Сохраняем текущий ID просчёта: ${currentProschetId}`);
    
    if (!workId) {
        console.warn('❌ Не указан ID работы для удаления');
        return;
    }
    
    if (!confirm('Вы уверены, что хотите удалить эту дополнительную работу?')) {
        console.log('❌ Удаление отменено пользователем');
        return;
    }
    
    console.log(`🗑️ Удаление дополнительной работы ID: ${workId}`);
    
    // Визуально отключаем строку
    rowElement.style.opacity = '0.5';
    rowElement.style.pointerEvents = 'none';
    
    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('work_id', workId);
    
    // Отправляем запрос на сервер
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
            console.log('✅ Работа успешно удалена');
            
            // Удаляем строку из таблицы
            if (rowElement.parentNode) {
                rowElement.parentNode.removeChild(rowElement);
            }
            
            // Показываем уведомление
            additionalWorks_showNotification('Работа успешно удалена', 'success');
            
            // Восстанавливаем и перезагружаем работы для текущего просчёта
            if (currentProschetId) {
                console.log(`🔄 Перезагружаем работы для сохранённого просчёта ID: ${currentProschetId}`);
                // Небольшая задержка для надёжности
                setTimeout(() => {
                    additionalWorks_loadWorksForProschet(currentProschetId);
                }, 300);
            } else {
                console.error('❌ Ошибка: не удалось восстановить ID просчёта');
            }
        } else {
            console.error('❌ Ошибка при удалении работы:', data.message);
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

/**
 * Показать модальное окно для добавления новой работы
 */
function additionalWorks_showAddWorkModal() {
    console.log('🪟 Открытие модального окна для добавления работы');
    
    // Проверяем, не открыто ли уже модальное окно
    if (document.getElementById('additional-works-modal-overlay')) {
        console.log('⚠️ Модальное окно уже открыто');
        return;
    }
    
    // Создаем оверлей для модального окна
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'additional-works-modal-overlay';
    modalOverlay.id = 'additional-works-modal-overlay';
    
    // Создаем само модальное окно
    const modal = document.createElement('div');
    modal.className = 'additional-works-modal';
    modal.id = 'additional-works-modal';
    
    // Заполняем содержимое модального окна
    modal.innerHTML = `
        <div class="additional-works-modal-header">
            <h3><i class="fas fa-plus-circle"></i> Добавить дополнительную работу</h3>
            <button type="button" class="additional-works-modal-close-btn" id="additional-works-modal-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="additional-works-modal-body">
            <form id="additional-works-add-form">
                <div class="additional-works-form-group">
                    <label for="additional-work-title">
                        <i class="fas fa-heading"></i> Название работы *
                    </label>
                    <input type="text" 
                           id="additional-work-title" 
                           name="title" 
                           class="additional-works-modal-input" 
                           placeholder="Например: Резка, Ламинация, Доставка..." 
                           maxlength="200"
                           required>
                    <small class="additional-works-form-hint">Максимум 200 символов</small>
                </div>
                
                <div class="additional-works-form-group">
                    <label for="additional-work-price">
                        <i class="fas fa-ruble-sign"></i> Цена (₽) *
                    </label>
                    <input type="number" 
                           id="additional-work-price" 
                           name="price" 
                           class="additional-works-modal-input" 
                           placeholder="0.00" 
                           min="0" 
                           step="0.01" 
                           max="9999999.99"
                           required>
                    <small class="additional-works-form-hint">Цена в рублях. Максимум 9 999 999.99 ₽</small>
                </div>
                
                <div class="additional-works-form-footer">
                    <button type="button" 
                            id="additional-works-modal-cancel" 
                            class="additional-works-modal-cancel-btn">
                        <i class="fas fa-times"></i> Отмена
                    </button>
                    <button type="submit" 
                            id="additional-works-modal-submit" 
                            class="additional-works-modal-submit-btn">
                        <i class="fas fa-plus"></i> Добавить работу
                    </button>
                </div>
            </form>
        </div>
    `;
    
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
    
    // Анимация появления
    setTimeout(() => {
        modalOverlay.classList.add('additional-works-active');
        modal.classList.add('additional-works-active');
    }, 10);
    
    // Функция закрытия модального окна
    const createCloseModal = () => {
        // Внутренняя функция закрытия
        const closeModalFunction = () => {
            console.log('🪟 Закрытие модального окна');
            modalOverlay.classList.remove('additional-works-active');
            modal.classList.remove('additional-works-active');
            setTimeout(() => {
                if (modalOverlay.parentNode) {
                    modalOverlay.parentNode.removeChild(modalOverlay);
                }
            }, 300);
            
            // Удаляем обработчик ESC при закрытии
            document.removeEventListener('keydown', handleEscKey);
        };
        
        return closeModalFunction;
    };
    
    // Создаем функцию закрытия
    const closeModal = createCloseModal();
    
    // Закрытие по клавише ESC
    const handleEscKey = (event) => {
        if (event.key === 'Escape') {
            closeModal();
        }
    };
    document.addEventListener('keydown', handleEscKey);
    
    // Обработчики для кнопок закрытия
    const closeBtn = document.getElementById('additional-works-modal-close');
    const cancelBtn = document.getElementById('additional-works-modal-cancel');
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    // Закрытие по клику на оверлей (вне модального окна)
    modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) {
            closeModal();
        }
    });
    
    // Обработчик отправки формы
    const form = document.getElementById('additional-works-add-form');
    if (form) {
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            additionalWorks_handleAddWorkSubmit(this);
        });
    }
    
    // Фокус на поле названия
    setTimeout(() => {
        const titleInput = document.getElementById('additional-work-title');
        if (titleInput) titleInput.focus();
    }, 100);
}

/**
 * Обработчик отправки формы добавления работы
 * @param {HTMLFormElement} formElement - DOM-элемент формы
 */
function additionalWorks_handleAddWorkSubmit(formElement) {
    console.log('📤 Отправка формы добавления работы');
    
    // Сохраняем текущий ID просчёта перед отправкой
    const currentProschetId = additionalWorks_currentProschetId;
    console.log(`💾 Сохраняем текущий ID просчёта: ${currentProschetId}`);
    
    if (!currentProschetId) {
        console.error('❌ Ошибка: ID просчёта не установлен');
        additionalWorks_showNotification('Ошибка: не выбран просчёт', 'error');
        return;
    }
    
    // Получаем данные из формы
    const title = document.getElementById('additional-work-title').value;
    const price = document.getElementById('additional-work-price').value;
    
    // Валидация данных
    if (!title || title.trim() === '') {
        additionalWorks_showNotification('Введите название работы', 'error');
        return;
    }
    
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
        additionalWorks_showNotification('Введите корректную цену', 'error');
        return;
    }
    
    // Получаем кнопку отправки
    const submitBtn = document.getElementById('additional-works-modal-submit');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    
    // Блокируем кнопку отправки
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
    }
    
    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('price', parseFloat(price).toFixed(2));
    formData.append('proschet_id', currentProschetId);
    
    // Получаем CSRF токен
    const csrfToken = additionalWorks_getCsrfToken();
    if (!csrfToken) {
        console.error('❌ Ошибка: CSRF токен не найден');
        additionalWorks_showNotification('Ошибка безопасности', 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
        return;
    }
    
    console.log('📦 Отправляемые данные:', {
        title: title.trim(),
        price: parseFloat(price).toFixed(2),
        proschet_id: currentProschetId
    });
    
    // Отправляем запрос на сервер
    fetch(additionalWorks_apiUrls.addWork, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrfToken
        }
    })
    .then(response => {
        console.log('📥 Статус ответа:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('📊 Данные ответа:', data);
        
        if (data.success) {
            console.log('✅ Работа успешно добавлена, ID:', data.work_id);
            
            // Закрываем модальное окно
            const modalOverlay = document.getElementById('additional-works-modal-overlay');
            if (modalOverlay) {
                modalOverlay.classList.remove('additional-works-active');
                setTimeout(() => {
                    if (modalOverlay.parentNode) {
                        modalOverlay.parentNode.removeChild(modalOverlay);
                    }
                }, 300);
            }
            
            // Показываем уведомление
            additionalWorks_showNotification('Дополнительная работа успешно добавлена', 'success');
            
            // Восстанавливаем и перезагружаем работы для текущего просчёта
            if (currentProschetId) {
                console.log(`🔄 Перезагружаем работы для сохранённого просчёта ID: ${currentProschetId}`);
                // Небольшая задержка для надёжности
                setTimeout(() => {
                    additionalWorks_loadWorksForProschet(currentProschetId);
                }, 300);
            } else {
                console.error('❌ Ошибка: не удалось восстановить ID просчёта');
            }
        } else {
            console.error('❌ Ошибка при добавлении работы:', data.message);
            let errorMessage = data.message || 'Ошибка при добавлении работы';
            
            // Если есть ошибки валидации, показываем их
            if (data.errors) {
                errorMessage += ': ' + JSON.stringify(data.errors);
            }
            
            additionalWorks_showNotification(errorMessage, 'error');
            
            // Разблокируем кнопку
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при добавлении работы:', error);
        additionalWorks_showNotification('Ошибка сети при добавлении работы: ' + error.message, 'error');
        
        // Разблокируем кнопку
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}



// ===== 12. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С ДРУГИМИ СЕКЦИЯМИ =====



console.log('✅ Секция "Дополнительные работы" полностью реализована со всеми функциями');