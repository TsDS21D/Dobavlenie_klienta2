/*
sections/additional_works.js - JavaScript для секции "Дополнительные работы"
ИСПРАВЛЕНИЕ: Добавлена защита от отсутствия элементов и улучшена отладка
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ СЕКЦИИ =====

let additionalWorksCurrentProschetId = null;
let additionalWorksCurrentAdditionalWorks = [];

const additionalWorksApiUrls = {
    getWorks: '/calculator/get-additional-works/',
    addWork: '/calculator/add-additional-work/',
    updateWork: '/calculator/update-additional-work/',
    deleteWork: '/calculator/delete-additional-work/',
};

// Добавляем переменные для кэширования DOM элементов
let additionalWorksTotalContainer = null;
let additionalWorksTotalPriceElement = null;

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Дополнительные работы" загружена');
    
    // Инициализируем DOM элементы при загрузке
    initAdditionalWorksDOMElements();
    
    // Настраиваем обработчики событий для секции
    setupAdditionalWorksEventListeners();
    
    // Инициализируем интерфейс
    initAdditionalWorksInterface();
});

/**
 * Инициализация DOM элементов секции
 * Вызывается при загрузке страницы для кэширования элементов
 */
function initAdditionalWorksDOMElements() {
    console.log('🔍 Инициализация DOM элементов секции "Дополнительные работы"...');
    
    // Кэшируем элементы общей стоимости
    additionalWorksTotalContainer = document.getElementById('additional-works-total');
    additionalWorksTotalPriceElement = document.getElementById('additional-works-total-price');
    
    // Отладочная информация
    console.log('📊 Элемент additional-works-total найден:', !!additionalWorksTotalContainer);
    console.log('📊 Элемент additional-works-total-price найден:', !!additionalWorksTotalPriceElement);
    
    // Если элементы не найдены, выводим дополнительную информацию
    if (!additionalWorksTotalContainer || !additionalWorksTotalPriceElement) {
        console.warn('⚠️ Некоторые DOM элементы не найдены при инициализации');
        console.warn('Проверьте, что в additional_works.html есть:');
        console.warn('- <div id="additional-works-total" class="total-summary">');
        console.warn('- <div id="additional-works-total-price" class="total-price">');
        
        // Пробуем найти элементы еще раз через более широкий поиск
        const allElements = document.querySelectorAll('[id*="additional-works"]');
        console.log('Найденные элементы с "additional-works":', 
            Array.from(allElements).map(el => ({id: el.id, tag: el.tagName})));
    }
}

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====

function setupAdditionalWorksEventListeners() {
    console.log('Настраиваем обработчики событий для секции "Дополнительные работы"...');
    
    const addBtn = document.getElementById('add-additional-work-btn');
    if (addBtn) {
        addBtn.removeEventListener('click', handleAddAdditionalWork);
        addBtn.addEventListener('click', handleAddAdditionalWork);
    }
    
    const addFirstBtn = document.getElementById('add-first-work-btn');
    if (addFirstBtn) {
        addFirstBtn.removeEventListener('click', handleAddFirstWork);
        addFirstBtn.addEventListener('click', handleAddFirstWork);
    }
    
    console.log('✅ Обработчики событий для секции "Дополнительные работы" настроены');
}

// ===== 4. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ДОПОЛНИТЕЛЬНЫМИ РАБОТАМИ =====

function initAdditionalWorksInterface() {
    console.log('Инициализация интерфейса секции "Дополнительные работы"');
    showAdditionalWorksNoProschetSelectedMessage();
}

function updateAdditionalWorksForProschet(proschetId, rowElement) {
    console.log(`🔄 Обновление секции "Дополнительные работы" для просчёта ID: ${proschetId}`);
    
    additionalWorksCurrentProschetId = proschetId;
    updateAdditionalWorksProschetTitle(rowElement);
    loadAdditionalWorksForProschet(proschetId);
}

function updateAdditionalWorksProschetTitle(rowElement) {
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
        <span class="proschet-title-active">
            ${proschetTitle}
        </span>
    `;
}

function loadAdditionalWorksForProschet(proschetId) {
    console.log(`Загрузка дополнительных работ для просчёта ID: ${proschetId}`);
    
    showAdditionalWorksLoadingState();
    const url = `${additionalWorksApiUrls.getWorks}${proschetId}/`;
    
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getAdditionalWorksCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('📥 Получены данные дополнительных работ:', data);
        
        if (data.success) {
            additionalWorksCurrentAdditionalWorks = data.works || [];
            updateAdditionalWorksInterface(data.works || []);
            console.log(`✅ Загружено ${additionalWorksCurrentAdditionalWorks.length} дополнительных работ`);
        } else {
            console.error('Ошибка при загрузке работ:', data.message);
            showAdditionalWorksErrorMessage('Не удалось загрузить дополнительные работы');
        }
    })
    .catch(error => {
        console.error('Ошибка сети при загрузке работ:', error);
        showAdditionalWorksErrorMessage('Ошибка сети при загрузке дополнительных работ');
    });
}

/**
 * Функция обновления интерфейса с дополнительными работами
 * ИСПРАВЛЕНИЕ: Добавлена проверка существования элементов перед их использованием
 * @param {Array} works - Массив объектов дополнительных работ
 */
function updateAdditionalWorksInterface(works) {
    console.log('Обновление интерфейса с дополнительными работами', works);
    
    // Скрываем все сообщения и контейнеры
    hideAdditionalWorksAllMessagesAndContainers();
    
    if (works.length === 0) {
        showAdditionalWorksNoWorksMessage();
        updateAdditionalWorksTotalPrice([]);
    } else {
        showAdditionalWorksTable();
        populateAdditionalWorksTable(works);
        updateAdditionalWorksTotalPrice(works);
    }
    
    showAdditionalWorksAddButton(true);

    const event = new CustomEvent('additionalWorksUpdated', {
        detail: {
            proschetId: additionalWorksCurrentProschetId,
            works: works
        }
    });
    document.dispatchEvent(event);
}

function populateAdditionalWorksTable(works) {
    const tableBody = document.getElementById('additional-works-table-body');
    if (!tableBody) {
        console.error('❌ Элемент #additional-works-table-body не найден');
        return;
    }
    
    tableBody.innerHTML = '';
    
    works.forEach((work, index) => {
        const row = createAdditionalWorkRow(work, index);
        tableBody.appendChild(row);
    });
    
    console.log(`✅ Таблица обновлена: добавлено ${works.length} строк`);
}

function createAdditionalWorkRow(work, index) {
    const row = document.createElement('tr');
    
    if (index % 2 === 0) {
        row.classList.add('even-row');
    } else {
        row.classList.add('odd-row');
    }
    
    row.classList.add('selectable-row');
    row.dataset.workId = work.id;
    
    row.innerHTML = `
        <td class="work-number">${work.number || '—'}</td>
        <td class="work-title editable-cell" 
            data-editable="true"
            data-field="title"
            data-original-value="${work.title || ''}"
            data-work-id="${work.id}">
            ${work.title || '—'}
        </td>
        <td class="work-price editable-cell"
            data-editable="true"
            data-field="price"
            data-original-value="${work.price || '0.00'}"
            data-work-id="${work.id}">
            ${work.formatted_price || '0.00 ₽'}
        </td>
        <td class="work-actions">
            <button type="button" class="delete-work-btn" 
                    title="Удалить работу" 
                    data-work-id="${work.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;
    
    row.addEventListener('click', function(event) {
        if (!event.target.closest('.delete-work-btn') && 
            !event.target.closest('.editable-cell')) {
            const allRows = document.querySelectorAll('#additional-works-table-body tr');
            allRows.forEach(r => r.classList.remove('selected'));
            this.classList.add('selected');
        }
    });
    
    const titleCell = row.querySelector('.work-title');
    const priceCell = row.querySelector('.work-price');
    
    if (titleCell) {
        titleCell.addEventListener('dblclick', function(event) {
            event.stopPropagation();
            enableAdditionalWorksInlineEdit(this, 'title');
        });
    }
    
    if (priceCell) {
        priceCell.addEventListener('dblclick', function(event) {
            event.stopPropagation();
            enableAdditionalWorksInlineEdit(this, 'price');
        });
    }
    
    const deleteBtn = row.querySelector('.delete-work-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            const workId = this.dataset.workId;
            if (workId) {
                deleteAdditionalWork(workId, row);
            }
        });
    }
    
    return row;
}

/**
 * Функция обновления отображения общей стоимости работ
 * ИСПРАВЛЕНИЕ: Добавлена защита от отсутствия элементов и улучшена логика
 * @param {Array} works - Массив объектов дополнительных работ
 */
function updateAdditionalWorksTotalPrice(works) {
    console.log('💰 Обновление общей стоимости дополнительных работ');
    console.log('📊 Количество работ:', works.length);
    
    // Проверяем, инициализированы ли элементы
    if (!additionalWorksTotalContainer || !additionalWorksTotalPriceElement) {
        console.warn('⚠️ DOM элементы общей стоимости не инициализированы, пытаемся найти...');
        
        // Пробуем найти элементы снова
        additionalWorksTotalContainer = document.getElementById('additional-works-total');
        additionalWorksTotalPriceElement = document.getElementById('additional-works-total-price');
        
        if (!additionalWorksTotalContainer || !additionalWorksTotalPriceElement) {
            console.error('❌ КРИТИЧЕСКАЯ ОШИБКА: Элементы для отображения общей стоимости не найдены!');
            console.error('Проверьте, что в DOM присутствуют элементы:');
            console.error('- <div id="additional-works-total" class="total-summary">');
            console.error('- <div id="additional-works-total-price" class="total-price">');
            
            // Временно создаем элементы, если они отсутствуют
            createMissingTotalElements(works);
            return;
        } else {
            console.log('✅ DOM элементы успешно найдены');
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
    additionalWorksTotalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;
    
    // ИСПРАВЛЕНИЕ: ВСЕГДА показываем контейнер с общей суммой при наличии работ
    // Это идентично логике в секции "Печатные компоненты"
    if (works.length > 0) {
        additionalWorksTotalContainer.style.display = 'flex';
        console.log(`✅ Показан блок общей стоимости дополнительных работ`);
    } else {
        additionalWorksTotalContainer.style.display = 'none';
        console.log(`✅ Скрыт блок общей стоимости (работ нет)`);
    }
    
    console.log(`✅ Локальная сумма обновлена: ${totalPrice.toFixed(2)} ₽`);
    
    // Отправляем событие для обновления секции "Цена"
    if (additionalWorksCurrentProschetId) {
        const event = new CustomEvent('additionalWorksUpdated', {
            detail: {
                proschetId: additionalWorksCurrentProschetId,
                works: works,
                totalPrice: totalPrice
            }
        });
        document.dispatchEvent(event);
        console.log(`📤 Событие additionalWorksUpdated отправлено для просчёта ${additionalWorksCurrentProschetId}`);
    } else {
        console.warn('⚠️ Не удалось отправить событие additionalWorksUpdated: просчёт не выбран');
    }
}

/**
 * Создает отсутствующие элементы общей стоимости (аварийный режим)
 * @param {Array} works - Массив объектов дополнительных работ
 */
function createMissingTotalElements(works) {
    console.log('🛠️ Создание отсутствующих элементов общей стоимости в аварийном режиме');
    
    // Находим контейнер таблицы
    const worksContainer = document.getElementById('additional-works-container');
    if (!worksContainer) {
        console.error('❌ Контейнер таблицы дополнительных работ не найден');
        return;
    }
    
    // Вычисляем общую стоимость
    let totalPrice = 0;
    works.forEach(work => {
        if (work.price) {
            totalPrice += parseFloat(work.price);
        }
    });
    
    // Создаем элементы общей стоимости
    const totalContainer = document.createElement('div');
    totalContainer.id = 'additional-works-total';
    totalContainer.className = 'total-summary';
    totalContainer.style.display = works.length > 0 ? 'flex' : 'none';
    
    const totalLabel = document.createElement('div');
    totalLabel.className = 'total-label';
    totalLabel.textContent = 'Общая стоимость дополнительных работ:';
    
    const totalPriceElement = document.createElement('div');
    totalPriceElement.id = 'additional-works-total-price';
    totalPriceElement.className = 'total-price';
    totalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;
    
    totalContainer.appendChild(totalLabel);
    totalContainer.appendChild(totalPriceElement);
    
    // Добавляем элементы в контейнер таблицы
    worksContainer.appendChild(totalContainer);
    
    // Сохраняем ссылки на созданные элементы
    additionalWorksTotalContainer = totalContainer;
    additionalWorksTotalPriceElement = totalPriceElement;
    
    console.log('✅ Отсутствующие элементы общей стоимости созданы');
    
    // Отправляем событие для обновления секции "Цена"
    if (additionalWorksCurrentProschetId) {
        const event = new CustomEvent('additionalWorksUpdated', {
            detail: {
                proschetId: additionalWorksCurrentProschetId,
                works: works,
                totalPrice: totalPrice
            }
        });
        document.dispatchEvent(event);
    }
}

// ===== 5. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА =====

function showAdditionalWorksNoProschetSelectedMessage() {
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
        proschetTitleElement.innerHTML = `<span class="placeholder-text">(просчёт не выбран)</span>`;
    }
    
    additionalWorksCurrentProschetId = null;
    additionalWorksCurrentAdditionalWorks = [];
}

function showAdditionalWorksNoWorksMessage() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'block';
    if (worksContainer) worksContainer.style.display = 'none';
}

function showAdditionalWorksTable() {
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

function showAdditionalWorksLoadingState() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    const tableBody = document.getElementById('additional-works-table-body');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (worksContainer) worksContainer.style.display = 'none';
    
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p>Загрузка дополнительных работ...</p>
                </td>
            </tr>
        `;
        
        if (worksContainer) {
            worksContainer.style.display = 'block';
        }
    }
}

function showAdditionalWorksErrorMessage(message) {
    const tableBody = document.getElementById('additional-works-table-body');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 40px; color: #e74c3c;">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <p>${message}</p>
                    <button type="button" id="retry-load-btn" class="btn-action" style="margin-top: 10px;">
                        <i class="fas fa-redo"></i> Повторить попытку
                    </button>
                </td>
            </tr>
        `;
        
        const retryBtn = document.getElementById('retry-load-btn');
        if (retryBtn && additionalWorksCurrentProschetId) {
            retryBtn.addEventListener('click', function() {
                loadAdditionalWorksForProschet(additionalWorksCurrentProschetId);
            });
        }
    }
}

function hideAdditionalWorksAllMessagesAndContainers() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    // Не скрываем worksContainer здесь - его видимостью управляет showAdditionalWorksTable
}

function showAdditionalWorksAddButton(show) {
    const addButton = document.getElementById('add-additional-work-btn');
    if (addButton) {
        if (show) {
            addButton.style.display = 'inline-block';
        } else {
            addButton.style.display = 'none';
        }
    }
}

// ===== 6. ОБРАБОТЧИКИ КНОПОК =====

function handleAddAdditionalWork() {
    console.log('🛠️ Добавление новой дополнительной работы');
    
    if (!additionalWorksCurrentProschetId) {
        showAdditionalWorksNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    
    showAddAdditionalWorkModal();
}

function handleAddFirstWork() {
    console.log('Добавление первой дополнительной работы');
    handleAddAdditionalWork();
}

// ===== 7. ФУНКЦИИ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ =====

function enableAdditionalWorksInlineEdit(cellElement, fieldName) {
    if (!cellElement.dataset.editable || cellElement.dataset.editable !== 'true') {
        return;
    }
    
    if (cellElement.classList.contains('editing-cell')) {
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
        inputElement.className = 'inline-edit-input';
        inputElement.placeholder = 'Введите название работы';
        inputElement.maxLength = 200;
        inputElement.autocomplete = 'off';
        inputElement.autocapitalize = 'off';
        inputElement.spellcheck = false;
    } else if (fieldName === 'price') {
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.value = currentValue;
        inputElement.className = 'inline-edit-input';
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
    cellElement.classList.add('editing-cell');
    
    setTimeout(() => {
        inputElement.focus();
        if (fieldName === 'title' || fieldName === 'price') {
            inputElement.select();
        }
    }, 10);
    
    let isSaving = false;
    
    inputElement.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            
            if (!isSaving) {
                isSaving = true;
                saveAdditionalWorksInlineEdit(cellElement, fieldName, workId, inputElement.value, originalHTML);
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('editing-cell');
            restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
        }
    });
    
    inputElement.addEventListener('blur', function(event) {
        setTimeout(() => {
            if (cellElement.classList.contains('editing-cell') && !isSaving) {
                isSaving = true;
                saveAdditionalWorksInlineEdit(cellElement, fieldName, workId, inputElement.value, originalHTML);
            }
        }, 150);
    });
    
    inputElement.addEventListener('mousedown', function(event) {
        event.stopPropagation();
    });
}

function saveAdditionalWorksInlineEdit(cellElement, fieldName, workId, newValue, originalHTML) {
    if (newValue === cellElement.dataset.originalValue) {
        cellElement.innerHTML = originalHTML;
        cellElement.classList.remove('editing-cell');
        restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
        return;
    }
    
    let validatedValue = newValue.trim();
    
    if (fieldName === 'title') {
        if (!validatedValue) {
            showAdditionalWorksNotification('Название не может быть пустым', 'error');
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('editing-cell');
            restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
            return;
        }
        
        if (validatedValue.length > 200) {
            showAdditionalWorksNotification('Название не должно превышать 200 символов', 'error');
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('editing-cell');
            restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
            return;
        }
    } else if (fieldName === 'price') {
        const priceValue = parseFloat(validatedValue);
        
        if (isNaN(priceValue)) {
            showAdditionalWorksNotification('Цена должна быть числом', 'error');
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('editing-cell');
            restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
            return;
        }
        
        if (priceValue < 0) {
            showAdditionalWorksNotification('Цена не может быть отрицательной', 'error');
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('editing-cell');
            restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
            return;
        }
        
        validatedValue = priceValue.toFixed(2);
    }
    
    cellElement.innerHTML = `
        <div class="inline-edit-saving">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Сохранение...</span>
        </div>
    `;
    
    const formData = new FormData();
    formData.append('work_id', workId);
    formData.append('field_name', fieldName);
    formData.append('field_value', validatedValue);
    
    fetch(additionalWorksApiUrls.updateWork, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getAdditionalWorksCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (fieldName === 'title') {
                cellElement.textContent = validatedValue;
                cellElement.dataset.originalValue = validatedValue;
            } else if (fieldName === 'price') {
                const formattedPrice = `${parseFloat(validatedValue).toFixed(2)} ₽`;
                cellElement.textContent = formattedPrice;
                cellElement.dataset.originalValue = validatedValue;
                loadAdditionalWorksForProschet(additionalWorksCurrentProschetId);
            }
            
            showAdditionalWorksNotification('Изменения сохранены', 'success');
        } else {
            cellElement.innerHTML = originalHTML;
            showAdditionalWorksNotification(data.message || 'Ошибка при сохранении', 'error');
        }
    })
    .catch(error => {
        console.error('Ошибка при сохранении:', error);
        cellElement.innerHTML = originalHTML;
        showAdditionalWorksNotification('Ошибка сети при сохранении', 'error');
    })
    .finally(() => {
        cellElement.classList.remove('editing-cell');
        restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
    });
}

function restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId) {
    cellElement.removeEventListener('dblclick', handleDoubleClick);
    
    function handleDoubleClick(event) {
        event.stopPropagation();
        enableAdditionalWorksInlineEdit(this, fieldName);
    }
    
    cellElement.addEventListener('dblclick', handleDoubleClick);
}

// ===== 8. ФУНКЦИИ ДЛЯ РАБОТЫ С МОДАЛЬНЫМ ОКНОМ ДОБАВЛЕНИЯ =====

function showAddAdditionalWorkModal() {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'print-components-modal-overlay';
    modalOverlay.id = 'additional-works-modal-overlay';
    
    const modal = document.createElement('div');
    modal.className = 'print-components-modal';
    modal.id = 'additional-works-modal';
    
    modal.innerHTML = `
        <div class="modal-header">
            <h3><i class="fas fa-plus-circle"></i> Добавить дополнительную работу</h3>
            <button type="button" class="modal-close-btn" id="additional-works-modal-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-body">
            <form id="additional-works-add-form">
                <div class="form-group">
                    <label for="additional-work-title">
                        <i class="fas fa-heading"></i> Название работы *
                    </label>
                    <input type="text" 
                           id="additional-work-title" 
                           name="title" 
                           class="modal-input" 
                           placeholder="Например: Резка, Ламинация, Доставка..." 
                           maxlength="200"
                           required>
                    <small class="form-hint">Максимум 200 символов</small>
                </div>
                
                <div class="form-group">
                    <label for="additional-work-price">
                        <i class="fas fa-ruble-sign"></i> Цена (₽) *
                    </label>
                    <input type="number" 
                           id="additional-work-price" 
                           name="price" 
                           class="modal-input" 
                           placeholder="0.00" 
                           min="0" 
                           step="0.01" 
                           max="9999999.99"
                           required>
                    <small class="form-hint">Цена в рублях. Максимум 9 999 999.99 ₽</small>
                </div>
                
                <div class="form-footer">
                    <button type="button" 
                            id="additional-works-modal-cancel" 
                            class="modal-cancel-btn">
                        <i class="fas fa-times"></i> Отмена
                    </button>
                    <button type="submit" 
                            id="additional-works-modal-submit" 
                            class="modal-submit-btn">
                        <i class="fas fa-plus"></i> Добавить работу
                    </button>
                </div>
            </form>
        </div>
    `;
    
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
    
    setTimeout(() => {
        modalOverlay.classList.add('active');
        modal.classList.add('active');
    }, 10);
    
    const closeBtn = document.getElementById('additional-works-modal-close');
    const cancelBtn = document.getElementById('additional-works-modal-cancel');
    
    const closeModal = () => {
        modalOverlay.classList.remove('active');
        modal.classList.remove('active');
        setTimeout(() => {
            if (modalOverlay.parentNode) {
                modalOverlay.parentNode.removeChild(modalOverlay);
            }
        }, 300);
    };
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    
    const form = document.getElementById('additional-works-add-form');
    if (form) {
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            handleAddAdditionalWorkSubmit(this);
        });
    }
    
    setTimeout(() => {
        const titleInput = document.getElementById('additional-work-title');
        if (titleInput) titleInput.focus();
    }, 100);
}

function handleAddAdditionalWorkSubmit(formElement) {
    const formData = new FormData(formElement);
    formData.append('proschet_id', additionalWorksCurrentProschetId);
    
    const submitBtn = document.getElementById('additional-works-modal-submit');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
    }
    
    fetch(additionalWorksApiUrls.addWork, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getAdditionalWorksCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const modalOverlay = document.getElementById('additional-works-modal-overlay');
            if (modalOverlay) {
                modalOverlay.classList.remove('active');
                setTimeout(() => {
                    if (modalOverlay.parentNode) {
                        modalOverlay.parentNode.removeChild(modalOverlay);
                    }
                }, 300);
            }
            
            showAdditionalWorksNotification('Дополнительная работа успешно добавлена', 'success');
            loadAdditionalWorksForProschet(additionalWorksCurrentProschetId);
        } else {
            showAdditionalWorksNotification(data.message || 'Ошибка при добавлении работы', 'error');
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    })
    .catch(error => {
        console.error('Ошибка при добавлении работы:', error);
        showAdditionalWorksNotification('Ошибка сети при добавлении работы', 'error');
        
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}

// ===== 9. ФУНКЦИИ ДЛЯ УДАЛЕНИЯ РАБОТ =====

function deleteAdditionalWork(workId, rowElement) {
    if (!workId) {
        console.warn('❌ Не указан ID работы для удаления');
        return;
    }
    
    if (!confirm('Вы уверены, что хотите удалить эту работу?')) {
        return;
    }
    
    console.log(`🗑️ Удаление дополнительной работы ID: ${workId}`);
    
    rowElement.style.opacity = '0.5';
    rowElement.style.pointerEvents = 'none';
    
    const formData = new FormData();
    formData.append('work_id', workId);
    
    fetch(additionalWorksApiUrls.deleteWork, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getAdditionalWorksCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (rowElement.parentNode) {
                rowElement.parentNode.removeChild(rowElement);
            }
            
            loadAdditionalWorksForProschet(additionalWorksCurrentProschetId);
            showAdditionalWorksNotification('Работа успешно удалена', 'success');
        } else {
            rowElement.style.opacity = '1';
            rowElement.style.pointerEvents = 'auto';
            showAdditionalWorksNotification(data.message || 'Ошибка при удалении работы', 'error');
        }
    })
    .catch(error => {
        console.error('Ошибка при удалении работы:', error);
        rowElement.style.opacity = '1';
        rowElement.style.pointerEvents = 'auto';
        showAdditionalWorksNotification('Ошибка сети при удалении работы', 'error');
    });
}

// ===== 10. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

function getAdditionalWorksCsrfToken() {
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

function showAdditionalWorksNotification(message, type = 'info') {
    console.log(`Показ уведомления [${type}]: ${message}`);
    
    const notification = document.createElement('div');
    notification.className = `print-components-notification notification-${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        </div>
        <button type="button" class="notification-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        });
    }
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}

// ===== 11. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С ДРУГИМИ СЕКЦИЯМИ =====

window.additionalWorksSection = {
    updateForProschet: function(proschetId, rowElement) {
        updateAdditionalWorksForProschet(proschetId, rowElement);
    },
    
    reset: function() {
        showAdditionalWorksNoProschetSelectedMessage();
    },
    
    getCurrentProschetId: function() {
        return additionalWorksCurrentProschetId;
    },
    
    getCurrentWorks: function() {
        return additionalWorksCurrentAdditionalWorks;
    }
};

console.log('✅ Секция "Дополнительные работы" полностью реализована с исправлениями и отладкой');