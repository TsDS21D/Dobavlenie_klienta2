/*
sections/additional_works.js - JavaScript для секции "Дополнительные работы"
ПОЛНАЯ РЕАЛИЗАЦИЯ: Аналог секции "Печатные компоненты" для модели AdditionalWork
ИСПРАВЛЕНИЯ:
1. Добавлена и корректно работает строка с общей суммой дополнительных работ
2. Исправлен баг с двойным кликом (поле открывается и сразу закрывается)
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ СЕКЦИИ (с уникальными именами) =====

// ID текущего выбранного просчёта (уникальное имя)
let additionalWorksCurrentProschetId = null;

// Массив с дополнительными работами для текущего просчёта (уникальное имя)
let additionalWorksCurrentAdditionalWorks = [];

// URL для API запросов к серверу (уникальное имя)
const additionalWorksApiUrls = {
    getWorks: '/calculator/get-additional-works/',          // Для получения работ просчёта
    addWork: '/calculator/add-additional-work/',           // Для добавления новой работы
    updateWork: '/calculator/update-additional-work/',     // Для обновления существующей работы
    deleteWork: '/calculator/delete-additional-work/',     // Для удаления работы
};

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

/**
 * Функция инициализации секции при полной загрузке DOM
 * Вызывается автоматически браузером после загрузки HTML
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Дополнительные работы" загружена');
    
    // Настраиваем обработчики событий для секции
    setupAdditionalWorksEventListeners();
    
    // Инициализируем интерфейс (показываем сообщение о выборе просчёта)
    initAdditionalWorksInterface();
});

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====

/**
 * Функция настройки всех обработчиков событий для секции
 * Вызывается при инициализации и при необходимости обновления обработчиков
 */
function setupAdditionalWorksEventListeners() {
    console.log('Настраиваем обработчики событий для секции "Дополнительные работы"...');
    
    // Кнопка добавления новой работы
    const addBtn = document.getElementById('add-additional-work-btn');
    if (addBtn) {
        // Удаляем старые обработчики (если есть) чтобы избежать дублирования
        addBtn.removeEventListener('click', handleAddAdditionalWork);
        // Добавляем новый обработчик
        addBtn.addEventListener('click', handleAddAdditionalWork);
    }
    
    // Кнопка добавления первой работы (в сообщении "нет работ")
    const addFirstBtn = document.getElementById('add-first-work-btn');
    if (addFirstBtn) {
        // Удаляем старые обработчики
        addFirstBtn.removeEventListener('click', handleAddFirstWork);
        // Добавляем новый обработчик
        addFirstBtn.addEventListener('click', handleAddFirstWork);
    }
    
    console.log('✅ Обработчики событий для секции "Дополнительные работы" настроены');
}

// ===== 4. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С ДОПОЛНИТЕЛЬНЫМИ РАБОТАМИ =====

/**
 * Функция инициализации интерфейса секции
 * Показывает сообщение о необходимости выбора просчёта
 */
function initAdditionalWorksInterface() {
    console.log('Инициализация интерфейса секции "Дополнительные работы"');
    
    // Показываем сообщение о выборе просчёта
    showAdditionalWorksNoProschetSelectedMessage();
}

/**
 * Функция обновления секции при выборе просчёта
 * Вызывается из list_proschet.js при выборе просчёта
 * @param {number} proschetId - ID выбранного просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
 */
function updateAdditionalWorksForProschet(proschetId, rowElement) {
    console.log(`🔄 Обновление секции "Дополнительные работы" для просчёта ID: ${proschetId}`);
    
    // Сохраняем ID текущего просчёта
    additionalWorksCurrentProschetId = proschetId;
    
    // Обновляем заголовок секции с названием просчёта
    updateAdditionalWorksProschetTitle(rowElement);

    // Загружаем дополнительные работы для выбранного просчёта
    loadAdditionalWorksForProschet(proschetId);
    
    console.log(`✅ Секция "Дополнительные работы" начала обновление для просчёта ${proschetId}`);
}

/**
 * Функция обновления заголовка секции с названием просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
 */
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
    
    console.log(`✅ Название просчёта обновлено в секции "Дополнительные работы": "${proschetTitle}"`);
}

/**
 * Функция загрузки дополнительных работ для указанного просчёта
 * @param {number} proschetId - ID просчёта
 */
function loadAdditionalWorksForProschet(proschetId) {
    console.log(`Загрузка дополнительных работ для просчёта ID: ${proschetId}`);
    
    // Показываем индикатор загрузки
    showAdditionalWorksLoadingState();
    
    // Формируем URL для запроса
    const url = `${additionalWorksApiUrls.getWorks}${proschetId}/`;
    
    // Отправляем GET-запрос к серверу
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getAdditionalWorksCsrfToken()
        }
    })
    .then(response => {
        // Проверяем статус ответа сервера
        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('📥 Получены данные дополнительных работ:', data);
        
        if (data.success) {
            // Сохраняем полученные работы
            additionalWorksCurrentAdditionalWorks = data.works || [];
            
            // Обновляем интерфейс с полученными данными
            updateAdditionalWorksInterface(data.works || []);
            
            console.log(`✅ Загружено ${additionalWorksCurrentAdditionalWorks.length} дополнительных работ`);
        } else {
            // Если сервер вернул ошибку
            console.error('Ошибка при загрузке работ:', data.message);
            showAdditionalWorksErrorMessage('Не удалось загрузить дополнительные работы');
        }
    })
    .catch(error => {
        // Обработка ошибок сети или других ошибок
        console.error('Ошибка сети при загрузке работ:', error);
        showAdditionalWorksErrorMessage('Ошибка сети при загрузке дополнительных работ');
    });
}

/**
 * Функция обновления интерфейса с дополнительными работами
 * @param {Array} works - Массив объектов дополнительных работ
 */
function updateAdditionalWorksInterface(works) {
    console.log('Обновление интерфейса с дополнительными работами', works);
    
    // Скрываем все сообщения и контейнеры
    hideAdditionalWorksAllMessagesAndContainers();
    
    if (works.length === 0) {
        // Если работ нет, показываем соответствующее сообщение
        showAdditionalWorksNoWorksMessage();
        // ИСПРАВЛЕНИЕ: Всегда обновляем общую стоимость, даже если работ нет
        updateAdditionalWorksTotalPrice([]);
    } else {
        // Если есть работы, показываем таблицу
        showAdditionalWorksTable();
        
        // Заполняем таблицу данными
        populateAdditionalWorksTable(works);
        
        // ИСПРАВЛЕНИЕ: Обновляем общую стоимость (передаем массив работ)
        updateAdditionalWorksTotalPrice(works);
    }
    
    // Показываем кнопку добавления работы (только если есть выбранный просчёт)
    showAdditionalWorksAddButton(true);

    // Отправляем событие для обновления других секций
    const event = new CustomEvent('additionalWorksUpdated', {
        detail: {
            proschetId: additionalWorksCurrentProschetId,
            works: works
        }
    });
    document.dispatchEvent(event);
}

/**
 * Функция заполнения таблицы дополнительными работами
 * @param {Array} works - Массив объектов дополнительных работ
 */
function populateAdditionalWorksTable(works) {
    const tableBody = document.getElementById('additional-works-table-body');
    if (!tableBody) {
        console.error('❌ Элемент #additional-works-table-body не найден');
        return;
    }
    
    // Очищаем текущее содержимое таблицы
    tableBody.innerHTML = '';
    
    // Добавляем строки для каждой работы
    works.forEach((work, index) => {
        const row = createAdditionalWorkRow(work, index);
        tableBody.appendChild(row);
    });
    
    console.log(`✅ Таблица обновлена: добавлено ${works.length} строк`);
}

/**
 * Функция создания строки таблицы для дополнительной работы
 * @param {Object} work - Объект дополнительной работы
 * @param {number} index - Индекс работы (для чередования стилей строк)
 * @returns {HTMLElement} - DOM-элемент строки таблицы
 */
function createAdditionalWorkRow(work, index) {
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
    
    // Добавляем data-атрибут с ID работы
    row.dataset.workId = work.id;
    
    // Заполняем ячейки строки данными работы
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
    
    // Добавляем обработчик клика для выделения строки
    row.addEventListener('click', function(event) {
        // Игнорируем клики по кнопке удаления и по редактируемым ячейкам
        if (!event.target.closest('.delete-work-btn') && 
            !event.target.closest('.editable-cell')) {
            // Снимаем выделение со всех строк
            const allRows = document.querySelectorAll('#additional-works-table-body tr');
            allRows.forEach(r => r.classList.remove('selected'));
            
            // Добавляем выделение текущей строке
            this.classList.add('selected');
        }
    });
    
    // Добавляем обработчик клика по ячейке для inline-редактирования
    const titleCell = row.querySelector('.work-title');
    const priceCell = row.querySelector('.work-price');
    
    if (titleCell) {
        titleCell.addEventListener('dblclick', function(event) {
            // ИСПРАВЛЕНИЕ: Останавливаем всплытие события, чтобы избежать конфликтов
            event.stopPropagation();
            enableAdditionalWorksInlineEdit(this, 'title');
        });
    }
    
    if (priceCell) {
        priceCell.addEventListener('dblclick', function(event) {
            // ИСПРАВЛЕНИЕ: Останавливаем всплытие события, чтобы избежать конфликтов
            event.stopPropagation();
            enableAdditionalWorksInlineEdit(this, 'price');
        });
    }
    
    // Добавляем обработчик для кнопки удаления
    const deleteBtn = row.querySelector('.delete-work-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation(); // Предотвращаем всплытие события
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
 * ИСПРАВЛЕНИЕ: Полностью аналогично функции в секции "Печатные компоненты"
 * @param {Array} works - Массив объектов дополнительных работ
 */
function updateAdditionalWorksTotalPrice(works) {
    console.log('💰 Обновление общей стоимости дополнительных работ');
    
    // Вычисляем общую стоимость всех работ
    let totalPrice = 0;
    works.forEach(work => {
        if (work.price) {
            totalPrice += parseFloat(work.price);
        }
    });
    
    console.log(`📊 Рассчитана общая стоимость работ: ${totalPrice.toFixed(2)} ₽`);
    
    // Получаем элементы для отображения общей суммы
    const totalContainer = document.getElementById('additional-works-total');
    const totalPriceElement = document.getElementById('additional-works-total-price');
    
    if (!totalContainer || !totalPriceElement) {
        console.warn('❌ Элементы для отображения общей стоимости не найдены');
        // Но всё равно отправляем событие для секции "Цена"
    } else {
        // Форматируем и отображаем общую стоимость
        totalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;
        
        // Показываем контейнер с общей суммой только если есть работы
        if (works.length > 0) {
            totalContainer.style.display = 'flex';
        } else {
            totalContainer.style.display = 'none';
        }
        
        console.log(`✅ Локальная сумма обновлена: ${totalPrice.toFixed(2)} ₽`);
    }
    
    // ВАЖНО: Отправляем событие для обновления секции "Цена"
    // Используем правильный ID текущего просчёта из секции "Дополнительные работы"
    if (additionalWorksCurrentProschetId) {
        const event = new CustomEvent('additionalWorksUpdated', {
            detail: {
                proschetId: additionalWorksCurrentProschetId, // ИСПРАВЛЕНО: используем правильную переменную
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

// ===== 5. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА =====

/**
 * Функция показа сообщения о необходимости выбора просчёта
 */
function showAdditionalWorksNoProschetSelectedMessage() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    const addButton = document.getElementById('add-additional-work-btn');
    
    if (noProschetMsg) noProschetMsg.style.display = 'block';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (worksContainer) worksContainer.style.display = 'none';
    if (addButton) addButton.style.display = 'none';
    
    // Очищаем заголовок с названием просчёта
    const proschetTitleElement = document.getElementById('additional-works-proschet-title');
    if (proschetTitleElement) {
        proschetTitleElement.innerHTML = `<span class="placeholder-text">(просчёт не выбран)</span>`;
    }
    
    // Сбрасываем текущий просчёт
    additionalWorksCurrentProschetId = null;
    additionalWorksCurrentAdditionalWorks = [];
}

/**
 * Функция показа сообщения об отсутствии работ
 */
function showAdditionalWorksNoWorksMessage() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'block';
    if (worksContainer) worksContainer.style.display = 'none';
}

/**
 * Функция показа таблицы с работами
 */
function showAdditionalWorksTable() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (worksContainer) worksContainer.style.display = 'block';
}

/**
 * Функция показа состояния загрузки
 */
function showAdditionalWorksLoadingState() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    const tableBody = document.getElementById('additional-works-table-body');
    
    // Скрываем все сообщения и контейнеры
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (worksContainer) worksContainer.style.display = 'none';
    
    // Показываем индикатор загрузки в таблице
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p>Загрузка дополнительных работ...</p>
                </td>
            </tr>
        `;
        
        // Временно показываем таблицу с индикатором загрузки
        if (worksContainer) {
            worksContainer.style.display = 'block';
        }
    }
}

/**
 * Функция показа сообщения об ошибке
 * @param {string} message - Текст сообщения об ошибке
 */
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
        
        // Добавляем обработчик для кнопки повтора
        const retryBtn = document.getElementById('retry-load-btn');
        if (retryBtn && additionalWorksCurrentProschetId) {
            retryBtn.addEventListener('click', function() {
                loadAdditionalWorksForProschet(additionalWorksCurrentProschetId);
            });
        }
    }
}

/**
 * Функция скрытия всех сообщений и контейнеров
 */
function hideAdditionalWorksAllMessagesAndContainers() {
    const noProschetMsg = document.getElementById('no-proschet-selected-additional');
    const noWorksMsg = document.getElementById('no-works-message');
    const worksContainer = document.getElementById('additional-works-container');
    
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (noWorksMsg) noWorksMsg.style.display = 'none';
    if (worksContainer) worksContainer.style.display = 'none';
}

/**
 * Функция управления видимостью кнопки добавления
 * @param {boolean} show - Показывать ли кнопку
 */
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

/**
 * Обработчик нажатия на кнопку добавления работы
 */
function handleAddAdditionalWork() {
    console.log('🛠️ Добавление новой дополнительной работы');
    
    // Проверяем, выбран ли просчёт
    if (!additionalWorksCurrentProschetId) {
        showAdditionalWorksNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    
    // Открываем модальное окно для добавления работы
    showAddAdditionalWorkModal();
}

/**
 * Обработчик нажатия на кнопку добавления первой работы
 */
function handleAddFirstWork() {
    console.log('Добавление первой дополнительной работы');
    handleAddAdditionalWork(); // Используем ту же логику
}

// ===== 7. ФУНКЦИИ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ =====

/**
 * Включает режим inline-редактирования для ячейки
 * ИСПРАВЛЕНИЕ: Устранен баг с двойным кликом (поле открывается и сразу закрывается)
 * @param {HTMLElement} cellElement - DOM-элемент ячейки
 * @param {string} fieldName - Название поля (title или price)
 */
function enableAdditionalWorksInlineEdit(cellElement, fieldName) {
    // Проверяем, можно ли редактировать эту ячейку
    if (!cellElement.dataset.editable || cellElement.dataset.editable !== 'true') {
        return;
    }
    
    // Проверяем, не находимся ли мы уже в режиме редактирования
    if (cellElement.classList.contains('editing-cell')) {
        console.log('⚠️ Ячейка уже находится в режиме редактирования');
        return;
    }
    
    // Получаем ID работы
    const workId = cellElement.dataset.workId;
    if (!workId) {
        console.warn('❌ Не удалось получить ID работы для редактирования');
        return;
    }
    
    // Получаем текущее значение
    const currentValue = cellElement.dataset.originalValue || '';
    
    // Сохраняем оригинальный HTML для возможного отката
    const originalHTML = cellElement.innerHTML;
    
    // Создаем поле ввода в зависимости от типа поля
    let inputElement;
    
    if (fieldName === 'title') {
        // Для названия - текстовое поле
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = currentValue;
        inputElement.className = 'inline-edit-input';
        inputElement.placeholder = 'Введите название работы';
        inputElement.maxLength = 200; // Максимальная длина как в модели
        
        // ИСПРАВЛЕНИЕ: Отключаем автозаполнение, чтобы избежать конфликтов
        inputElement.autocomplete = 'off';
        inputElement.autocapitalize = 'off';
        inputElement.spellcheck = false;
    } else if (fieldName === 'price') {
        // Для цены - числовое поле
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.value = currentValue;
        inputElement.className = 'inline-edit-input';
        inputElement.placeholder = '0.00';
        inputElement.min = '0';
        inputElement.step = '0.01';
        inputElement.max = '9999999.99'; // Максимальное значение как в модели (10 цифр, 2 знака после запятой)
        
        // ИСПРАВЛЕНИЕ: Отключаем автозаполнение
        inputElement.autocomplete = 'off';
    } else {
        console.warn(`❌ Неподдерживаемое поле для редактирования: ${fieldName}`);
        return;
    }
    
    // ИСПРАВЛЕНИЕ: Сохраняем ссылку на inputElement в dataset ячейки
    // Это позволит нам получить к нему доступ позже
    cellElement.dataset.currentInputId = 'input_' + Date.now();
    
    // Очищаем ячейку и добавляем поле ввода
    cellElement.innerHTML = '';
    cellElement.appendChild(inputElement);
    cellElement.classList.add('editing-cell');
    
    // ИСПРАВЛЕНИЕ: Добавляем небольшой таймаут перед фокусом, чтобы избежать конфликтов с событиями мыши
    setTimeout(() => {
        // Фокус на поле ввода
        inputElement.focus();
        
        // ИСПРАВЛЕНИЕ: Выделяем весь текст в поле для удобства редактирования
        if (fieldName === 'title') {
            inputElement.select();
        } else if (fieldName === 'price') {
            inputElement.select();
        }
    }, 10);
    
    // ИСПРАВЛЕНИЕ: Флаг для отслеживания, было ли уже сохранение
    let isSaving = false;
    
    // Обработчик нажатия Enter для сохранения
    inputElement.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault(); // Предотвращаем стандартное поведение
            event.stopPropagation(); // Останавливаем всплытие
            
            if (!isSaving) {
                isSaving = true;
                saveAdditionalWorksInlineEdit(cellElement, fieldName, workId, inputElement.value, originalHTML);
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            
            // Отмена редактирования
            cellElement.innerHTML = originalHTML;
            cellElement.classList.remove('editing-cell');
            // Восстанавливаем обработчики событий
            restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
        }
    });
    
    // ИСПРАВЛЕНИЕ: Обработчик потери фокуса с улучшенной логикой
    inputElement.addEventListener('blur', function(event) {
        // ИСПРАВЛЕНИЕ: Небольшая задержка перед сохранением, чтобы дать время
        // на обработку других событий (например, клика на кнопку)
        setTimeout(() => {
            // Проверяем, что ячейка все еще в режиме редактирования
            if (cellElement.classList.contains('editing-cell') && !isSaving) {
                isSaving = true;
                saveAdditionalWorksInlineEdit(cellElement, fieldName, workId, inputElement.value, originalHTML);
            }
        }, 150); // Увеличена задержка с 200 мс до 150 мс для лучшей совместимости
    });
    
    // ИСПРАВЛЕНИЕ: Добавляем обработчик клика на само поле ввода,
    // чтобы предотвратить немедленную потерю фокуса при двойном клике
    inputElement.addEventListener('mousedown', function(event) {
        event.stopPropagation(); // Останавливаем всплытие, чтобы избежать закрытия
    });
    
    console.log(`✅ Включено inline-редактирование для ${fieldName}, workId: ${workId}`);
}

/**
 * Сохраняет изменения после inline-редактирования
 * @param {HTMLElement} cellElement - DOM-элемент ячейки
 * @param {string} fieldName - Название поля (title или price)
 * @param {string} workId - ID работы
 * @param {string} newValue - Новое значение
 * @param {string} originalHTML - Оригинальный HTML для отката
 */
function saveAdditionalWorksInlineEdit(cellElement, fieldName, workId, newValue, originalHTML) {
    // Проверяем новое значение
    if (newValue === cellElement.dataset.originalValue) {
        // Значение не изменилось
        cellElement.innerHTML = originalHTML;
        cellElement.classList.remove('editing-cell');
        restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
        return;
    }
    
    // Валидация в зависимости от поля
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
        // Преобразуем в число
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
        
        // Округляем до 2 знаков после запятой
        validatedValue = priceValue.toFixed(2);
    }
    
    // Показываем индикатор сохранения
    cellElement.innerHTML = `
        <div class="inline-edit-saving">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Сохранение...</span>
        </div>
    `;
    
    // Отправляем запрос на сервер
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
            // Обновляем данные в ячейке
            if (fieldName === 'title') {
                cellElement.textContent = validatedValue;
                cellElement.dataset.originalValue = validatedValue;
            } else if (fieldName === 'price') {
                // Форматируем цену для отображения
                const formattedPrice = `${parseFloat(validatedValue).toFixed(2)} ₽`;
                cellElement.textContent = formattedPrice;
                cellElement.dataset.originalValue = validatedValue;
                
                // Обновляем общую стоимость (перезагружаем работы)
                loadAdditionalWorksForProschet(additionalWorksCurrentProschetId);
            }
            
            showAdditionalWorksNotification('Изменения сохранены', 'success');
        } else {
            // В случае ошибки восстанавливаем оригинальное значение
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
        // Восстанавливаем обработчики событий
        restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId);
    });
}

/**
 * Восстанавливает обработчики событий для ячейки после редактирования
 * @param {HTMLElement} cellElement - DOM-элемент ячейки
 * @param {string} fieldName - Название поля
 * @param {string} workId - ID работы
 */
function restoreAdditionalWorksCellEventListeners(cellElement, fieldName, workId) {
    // Удаляем старый обработчик, если он есть
    cellElement.removeEventListener('dblclick', handleDoubleClick);
    
    // Создаем новую функцию-обработчик
    function handleDoubleClick(event) {
        event.stopPropagation(); // ИСПРАВЛЕНИЕ: Останавливаем всплытие
        enableAdditionalWorksInlineEdit(this, fieldName);
    }
    
    // Добавляем обработчик обратно
    cellElement.addEventListener('dblclick', handleDoubleClick);
}

// ===== 8. ФУНКЦИИ ДЛЯ РАБОТЫ С МОДАЛЬНЫМ ОКНОМ ДОБАВЛЕНИЯ =====

/**
 * Показывает модальное окно для добавления новой работы
 */
function showAddAdditionalWorkModal() {
    // Создаем overlay для модального окна
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'print-components-modal-overlay';
    modalOverlay.id = 'additional-works-modal-overlay';
    
    // Создаем само модальное окно
    const modal = document.createElement('div');
    modal.className = 'print-components-modal';
    modal.id = 'additional-works-modal';
    
    // Содержимое модального окна
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
    
    // Добавляем модальное окно на страницу
    modalOverlay.appendChild(modal);
    document.body.appendChild(modalOverlay);
    
    // Показываем модальное окно с анимацией
    setTimeout(() => {
        modalOverlay.classList.add('active');
        modal.classList.add('active');
    }, 10);
    
    // Обработчик закрытия модального окна
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
    
    // Обработчик отправки формы
    const form = document.getElementById('additional-works-add-form');
    if (form) {
        form.addEventListener('submit', function(event) {
            event.preventDefault();
            handleAddAdditionalWorkSubmit(this);
        });
    }
    
    // Фокус на первое поле
    setTimeout(() => {
        const titleInput = document.getElementById('additional-work-title');
        if (titleInput) titleInput.focus();
    }, 100);
}

/**
 * Обработчик отправки формы добавления работы
 * @param {HTMLFormElement} formElement - DOM-элемент формы
 */
function handleAddAdditionalWorkSubmit(formElement) {
    // Получаем данные из формы
    const formData = new FormData(formElement);
    
    // Добавляем ID просчёта
    formData.append('proschet_id', additionalWorksCurrentProschetId);
    
    // Получаем кнопку отправки
    const submitBtn = document.getElementById('additional-works-modal-submit');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    
    // Блокируем кнопку и меняем текст
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
    }
    
    // Отправляем запрос на сервер
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
            // Закрываем модальное окно
            const modalOverlay = document.getElementById('additional-works-modal-overlay');
            if (modalOverlay) {
                modalOverlay.classList.remove('active');
                setTimeout(() => {
                    if (modalOverlay.parentNode) {
                        modalOverlay.parentNode.removeChild(modalOverlay);
                    }
                }, 300);
            }
            
            // Показываем уведомление об успехе
            showAdditionalWorksNotification('Дополнительная работа успешно добавлена', 'success');
            
            // Обновляем список работ
            loadAdditionalWorksForProschet(additionalWorksCurrentProschetId);
        } else {
            // Показываем ошибку
            showAdditionalWorksNotification(data.message || 'Ошибка при добавлении работы', 'error');
            
            // Разблокируем кнопку
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    })
    .catch(error => {
        console.error('Ошибка при добавлении работы:', error);
        showAdditionalWorksNotification('Ошибка сети при добавлении работы', 'error');
        
        // Разблокируем кнопку
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });
}

// ===== 9. ФУНКЦИИ ДЛЯ УДАЛЕНИЯ РАБОТ =====

/**
 * Удаляет дополнительную работу
 * @param {string} workId - ID работы для удаления
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы
 */
function deleteAdditionalWork(workId, rowElement) {
    if (!workId) {
        console.warn('❌ Не указан ID работы для удаления');
        return;
    }
    
    // Подтверждение удаления
    if (!confirm('Вы уверены, что хотите удалить эту работу?')) {
        return;
    }
    
    console.log(`🗑️ Удаление дополнительной работы ID: ${workId}`);
    
    // Показываем индикатор удаления
    rowElement.style.opacity = '0.5';
    rowElement.style.pointerEvents = 'none';
    
    // Отправляем запрос на сервер
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
            // Удаляем строку из таблицы
            if (rowElement.parentNode) {
                rowElement.parentNode.removeChild(rowElement);
            }
            
            // ИСПРАВЛЕНИЕ: Перезагружаем работы для обновления общей суммы
            loadAdditionalWorksForProschet(additionalWorksCurrentProschetId);
            
            // Показываем уведомление
            showAdditionalWorksNotification('Работа успешно удалена', 'success');
        } else {
            // Восстанавливаем строку
            rowElement.style.opacity = '1';
            rowElement.style.pointerEvents = 'auto';
            
            // Показываем ошибку
            showAdditionalWorksNotification(data.message || 'Ошибка при удалении работы', 'error');
        }
    })
    .catch(error => {
        console.error('Ошибка при удалении работы:', error);
        
        // Восстанавливаем строку
        rowElement.style.opacity = '1';
        rowElement.style.pointerEvents = 'auto';
        
        showAdditionalWorksNotification('Ошибка сети при удалении работы', 'error');
    });
}

// ===== 10. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

/**
 * Функция получения CSRF-токена для AJAX-запросов
 * @returns {string} CSRF-токен
 */
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

/**
 * Функция показа уведомления
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип сообщения: 'success', 'error', 'warning', 'info'
 */
function showAdditionalWorksNotification(message, type = 'info') {
    console.log(`Показ уведомления [${type}]: ${message}`);
    
    const notification = document.createElement('div');
    notification.className = `print-components-notification notification-${type}`;
    
    // Определяем иконку в зависимости от типа
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
    
    // Показываем с анимацией
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Обработчик закрытия уведомления
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
    
    // Автоматическое скрытие через 5 секунд
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

// Экспортируем функцию обновления дополнительных работ для использования в list_proschet.js
window.additionalWorksSection = {
    /**
     * Основная функция для обновления секции при выборе просчёта
     * @param {number} proschetId - ID выбранного просчёта
     * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
     */
    updateForProschet: function(proschetId, rowElement) {
        updateAdditionalWorksForProschet(proschetId, rowElement);
    },
    
    /**
     * Функция сброса секции (когда просчёт не выбран)
     */
    reset: function() {
        showAdditionalWorksNoProschetSelectedMessage();
    },
    
    /**
     * Функция для получения текущего просчёта
     * @returns {number|null} ID текущего просчёта или null
     */
    getCurrentProschetId: function() {
        return additionalWorksCurrentProschetId;
    },
    
    /**
     * Функция для получения текущих дополнительных работ
     * @returns {Array} Массив дополнительных работ
     */
    getCurrentWorks: function() {
        return additionalWorksCurrentAdditionalWorks;
    }
};

console.log('✅ Секция "Дополнительные работы" полностью реализована с исправлениями');