/*
calculator/static/calculator/js/sections/lamination.js
Управление секцией "Ламинация":
- Загрузка данных при выборе печатного компонента
- Загрузка списков ламинаторов и плёнок
- Включение/выключение ламинации
- Обновление цен при изменении ламинатора/плёнки
- Подписка на события изменения количества листов (vichisliniyaListovUpdated)
*/

"use strict";

// Глобальное состояние секции
let laminationCurrentComponentId = null;      // ID выбранного печатного компонента
let laminationCurrentProschetId = null;       // ID просчёта (для синхронизации)
let laminationEnabled = false;                // Флаг включения ламинации
let laminatorsList = [];                      // Кэш списка ламинаторов
let filmsList = [];                           // Кэш списка плёнок

// DOM элементы
let laminationNoComponentMsg, laminationContent, laminationToggle, laminationToggleLabel;
let laminationSettings, laminatorSelect, filmSelect;
let laminatorCostSpan, laminatorMarkupSpan, laminatorPriceSpan, filmPriceSpan, totalPriceSpan, sheetCountSpan;

/**
 * Инициализация секции при загрузке страницы
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Ламинация" загружена');
    initLaminationDOMElements();
    setupLaminationEventListeners();
    // Загружаем справочные данные (ламинаторы и плёнки) один раз
    loadLaminators();
    loadFilms();
});

/**
 * Находит все необходимые DOM элементы и сохраняет ссылки
 */
function initLaminationDOMElements() {
    laminationNoComponentMsg = document.getElementById('lamination-no-component-message');
    laminationContent = document.getElementById('lamination-content');
    laminationToggle = document.getElementById('lamination-enabled-toggle');
    laminationToggleLabel = document.getElementById('lamination-toggle-label');
    laminationSettings = document.getElementById('lamination-settings');
    laminatorSelect = document.getElementById('lamination-laminator-select');
    filmSelect = document.getElementById('lamination-film-select');
    laminatorCostSpan = document.getElementById('lamination-laminator-cost');
    laminatorMarkupSpan = document.getElementById('lamination-laminator-markup');
    laminatorPriceSpan = document.getElementById('lamination-laminator-price');
    filmPriceSpan = document.getElementById('lamination-film-price');
    totalPriceSpan = document.getElementById('lamination-total-price');
    sheetCountSpan = document.getElementById('lamination-sheet-count-display');
}

/**
 * Настраивает обработчики событий: переключатель, выбор ламинатора/плёнки, внешние события.
 */
function setupLaminationEventListeners() {
    // Переключатель включения/выключения
    if (laminationToggle) {
        laminationToggle.addEventListener('change', function() {
            const isChecked = this.checked;
            updateLaminationToggleUI(isChecked);
            saveLaminationSetting('is_enabled', isChecked);
        });
    }
    // Выбор ламинатора
    if (laminatorSelect) {
        laminatorSelect.addEventListener('change', function() {
            const laminatorId = this.value;
            saveLaminationSetting('laminator', laminatorId);
        });
    }
    // Выбор плёнки
    if (filmSelect) {
        filmSelect.addEventListener('change', function() {
            const filmId = this.value;
            saveLaminationSetting('film', filmId);
        });
    }

    // Подписка на событие выбора печатного компонента (из print_components.js)
    document.addEventListener('printComponentSelected', function(event) {
        if (event.detail && event.detail.printComponentId) {
            laminationCurrentComponentId = event.detail.printComponentId;
            laminationCurrentProschetId = event.detail.proschetId;
            updateComponentTitle(event.detail.printComponentNumber, event.detail.printerName);
            loadLaminationData(laminationCurrentComponentId);
        }
    });

    // Подписка на событие отмены выбора компонента
    document.addEventListener('printComponentDeselected', function() {
        resetLaminationSection();
    });

    // Подписка на событие обновления количества листов (из vichisliniya_listov.js)
    document.addEventListener('vichisliniyaListovUpdated', function(event) {
        if (event.detail && event.detail.printComponentId === laminationCurrentComponentId) {
            // Количество листов изменилось – нужно пересчитать цены ламинации
            if (laminationCurrentComponentId) {
                loadLaminationData(laminationCurrentComponentId);
            }
        }
    });
}

/**
 * Загружает данные о ламинации для выбранного компонента с сервера.
 * @param {number} componentId
 */
function loadLaminationData(componentId) {
    console.log(`📥 Загрузка данных ламинации для компонента ${componentId}`);
    showLaminationLoading();
    fetch(`/calculator/get-lamination/${componentId}/`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const lam = data.lamination;
            // Обновляем UI в соответствии с полученными данными
            laminationEnabled = lam.is_enabled;
            laminationToggle.checked = lam.is_enabled;
            updateLaminationToggleUI(lam.is_enabled);
            // Заполняем выпадающие списки сохранёнными значениями
            if (lam.laminator_id) laminatorSelect.value = lam.laminator_id;
            else laminatorSelect.value = '';
            if (lam.film_id) filmSelect.value = lam.film_id;
            else filmSelect.value = '';
            // Обновляем отображение цен
            updatePriceDisplay(lam);
            // Показываем основное содержимое
            laminationNoComponentMsg.style.display = 'none';
            laminationContent.style.display = 'block';
        } else {
            console.error('Ошибка загрузки ламинации:', data.message);
            showLaminationError('Не удалось загрузить данные ламинации');
        }
    })
    .catch(error => {
        console.error('Ошибка сети:', error);
        showLaminationError('Ошибка сети при загрузке ламинации');
    });
}

/**
 * Обновляет отображение цен на основе объекта ламинации.
 * @param {Object} lam - объект ламинации (to_dict)
 */
function updatePriceDisplay(lam) {
    if (lam.laminator_cost_display) laminatorCostSpan.textContent = lam.laminator_cost_display;
    if (lam.laminator_markup_display) laminatorMarkupSpan.textContent = lam.laminator_markup_display;
    if (lam.laminator_price_display) laminatorPriceSpan.textContent = lam.laminator_price_display;
    if (lam.film_price_display) filmPriceSpan.textContent = lam.film_price_display;
    if (lam.total_price_display) totalPriceSpan.textContent = lam.total_price_display;
    if (lam.sheet_count_display) sheetCountSpan.textContent = lam.sheet_count_display;
}

/**
 * Отправляет изменение на сервер (включение/выключение, ламинатор, плёнка).
 * @param {string} fieldName - 'is_enabled', 'laminator', 'film'
 * @param {*} fieldValue - новое значение
 */
function saveLaminationSetting(fieldName, fieldValue) {
    if (!laminationCurrentComponentId) return;
    const data = {
        print_component_id: laminationCurrentComponentId,
        field_name: fieldName,
        field_value: fieldValue
    };
    fetch('/calculator/update-lamination/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Обновляем отображение цен
            updatePriceDisplay(data.lamination);
            // Если ламинация включена и есть ламинатор и плёнка, отправляем событие для секции Price
            if (data.lamination.is_enabled && data.lamination.laminator_id && data.lamination.film_id) {
                dispatchLaminationUpdatedEvent(data.lamination);
            } else {
                // Если выключена, отправляем событие с нулевыми суммами
                dispatchLaminationUpdatedEvent(null);
            }
        } else {
            showLaminationNotification('Ошибка сохранения: ' + data.error, 'error');
        }
    })
    .catch(error => {
        console.error('Ошибка сохранения ламинации:', error);
        showLaminationNotification('Ошибка сети', 'error');
    });
}

/**
 * Обновляет UI переключателя и видимость блока настроек.
 * @param {boolean} enabled
 */
function updateLaminationToggleUI(enabled) {
    if (enabled) {
        laminationToggleLabel.textContent = 'Включена';
        laminationToggleLabel.classList.add('active');
        laminationSettings.style.display = 'block';
    } else {
        laminationToggleLabel.textContent = 'Выключена';
        laminationToggleLabel.classList.remove('active');
        laminationSettings.style.display = 'none';
    }
}

/**
 * Загружает список ламинаторов из API print_price.
 */
function loadLaminators() {
    fetch('/print_price/laminators/api/get_laminators/', {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.laminators) {
            laminatorsList = data.laminators;
            populateSelect(laminatorSelect, laminatorsList, 'id', 'name');
        } else {
            console.warn('Не удалось загрузить ламинаторы');
        }
    })
    .catch(error => console.error('Ошибка загрузки ламинаторов:', error));
}

/**
 * Загружает список плёнок (материалы типа film) из приложения sklad.
 */
function loadFilms() {
    fetch('/sklad/api/films/', {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.films) {
            filmsList = data.films;
            populateSelect(filmSelect, filmsList, 'id', 'name');
        } else {
            console.warn('Не удалось загрузить плёнки');
        }
    })
    .catch(error => console.error('Ошибка загрузки плёнок:', error));
}

/**
 * Заполняет выпадающий список опциями.
 * @param {HTMLSelectElement} selectElement
 * @param {Array} items
 * @param {string} valueKey
 * @param {string} textKey
 */
function populateSelect(selectElement, items, valueKey, textKey) {
    if (!selectElement) return;
    const selectedValue = selectElement.value;
    selectElement.innerHTML = '<option value="">-- Выберите --</option>';
    items.forEach(item => {
        const option = document.createElement('option');
        option.value = item[valueKey];
        option.textContent = item[textKey];
        if (selectedValue && option.value == selectedValue) option.selected = true;
        selectElement.appendChild(option);
    });
}

/**
 * Обновляет заголовок секции, отображая номер компонента.
 */
function updateComponentTitle(componentNumber, printerName) {
    const titleSpan = document.getElementById('lamination-component-title');
    if (titleSpan) {
        let displayText = componentNumber;
        if (printerName) displayText += ` (${printerName})`;
        titleSpan.innerHTML = `<span class="lamination-component-title-active">${displayText}</span>`;
    }
}

/**
 * Сбрасывает секцию (когда компонент не выбран).
 */
function resetLaminationSection() {
    laminationCurrentComponentId = null;
    laminationCurrentProschetId = null;
    laminationNoComponentMsg.style.display = 'block';
    laminationContent.style.display = 'none';
    laminationToggle.checked = false;
    updateLaminationToggleUI(false);
    laminatorSelect.value = '';
    filmSelect.value = '';
    // Обнуляем отображение цен
    const zeroDisplay = '0.00 руб.';
    laminatorCostSpan.textContent = zeroDisplay;
    laminatorMarkupSpan.textContent = '0%';
    laminatorPriceSpan.textContent = zeroDisplay;
    filmPriceSpan.textContent = zeroDisplay;
    totalPriceSpan.textContent = '0.00 ₽';
    sheetCountSpan.textContent = '0';
    // Отправляем событие обнуления для секции Price
    dispatchLaminationUpdatedEvent(null);
}

/**
 * Отправляет событие с данными ламинации для секции Price.
 * @param {Object|null} laminationData
 */
function dispatchLaminationUpdatedEvent(laminationData) {
    let detail = {
        componentId: laminationCurrentComponentId,
        proschetId: laminationCurrentProschetId
    };
    if (laminationData && laminationData.is_enabled) {
        detail = {
            ...detail,
            enabled: true,
            total_price: laminationData.total_price,
            laminator_price: laminationData.laminator_price,
            film_price: laminationData.film_price,
            sheet_count: laminationData.sheet_count,
            laminator_name: laminationData.laminator_name,
            film_name: laminationData.film_name,
            laminator_cost: laminationData.laminator_cost,      
            laminator_markup: laminationData.laminator_markup   
        };
    } else {
        detail.enabled = false;
        detail.total_price = 0;
    }
    const event = new CustomEvent('laminationUpdated', { detail });
    document.dispatchEvent(event);
}

/**
 * Показывает индикатор загрузки.
 */
function showLaminationLoading() {
    // Можно добавить спиннер в блоке цен, но для простоты пропустим
    console.log('Загрузка данных ламинации...');
}

/**
 * Показывает сообщение об ошибке.
 */
function showLaminationError(message) {
    console.error(message);
    showLaminationNotification(message, 'error');
}

/**
 * Вспомогательная функция для уведомлений.
 */
function showLaminationNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

/**
 * Получает CSRF-токен из cookie.
 */
function getCsrfToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const trimmed = cookie.trim();
        if (trimmed.startsWith(name + '=')) {
            return decodeURIComponent(trimmed.substring(name.length + 1));
        }
    }
    return '';
}