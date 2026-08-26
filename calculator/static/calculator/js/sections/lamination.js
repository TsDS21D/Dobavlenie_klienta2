/**
 * ============================================================================
 * ФАЙЛ: lamination.js
 * НАЗНАЧЕНИЕ: Управление секцией "Ламинация" для выбранного печатного компонента.
 *
 * ОСНОВНЫЕ ФУНКЦИИ:
 * - Отображение/скрытие блока ламинации в зависимости от выбора компонента.
 * - Включение/выключение ламинации.
 * - Выбор ламинатора и плёнки.
 * - Выбор стороны ламинации (односторонняя/двусторонняя) – НОВЫЙ ПАРАМЕТР.
 * - Автоматический пересчёт стоимости ламинации при изменении количества листов.
 * - Отправка события laminationUpdated для секции "Цена".
 *
 * ИСПРАВЛЕНИЯ И ДОПОЛНЕНИЯ:
 * 1. При выборе компонента НЕ отправляется событие с null для старого компонента,
 *    чтобы ламинация других компонентов не исчезала из секции "Цена".
 * 2. В событие laminationUpdated добавлено поле is_enabled, чтобы price.js
 *    корректно определяла включённую ламинацию.
 * 3. Предупреждение о нулевой total_price выводится только для включённой ламинации.
 * 4. Добавлена поддержка стороны ламинации (односторонняя/двусторонняя).
 *    При двусторонней ламинации цена плёнки удваивается (расчёт на сервере).
 *
 * ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ – для понимания новичками.
 * ============================================================================
 */

"use strict";

// ============================================================================
// 1. ГЛОБАЛЬНОЕ СОСТОЯНИЕ СЕКЦИИ
// ============================================================================

/** @type {number|null} ID текущего выбранного печатного компонента */
let laminationCurrentComponentId = null;

/** @type {number|null} ID просчёта (для синхронизации) */
let laminationCurrentProschetId = null;

/** @type {boolean} Флаг включения ламинации для текущего компонента */
let laminationEnabled = false;

/** @type {Array} Кэш списка ламинаторов (загружается с сервера) */
let laminatorsList = [];

/** @type {Array} Кэш списка плёнок (загружается с сервера) */
let filmsList = [];

// Переменные для отмены запросов (предотвращает гонку)
/** @type {AbortController|null} Контроллер для отмены предыдущего запроса */
let laminationAbortController = null;

/** @type {number|null} ID компонента, для которого выполняется текущий запрос */
let laminationLoadingComponentId = null;

// ============================================================================
// 2. DOM-ЭЛЕМЕНТЫ (кэшируются при инициализации)
// ============================================================================

/** @type {HTMLElement|null} */
let laminationNoComponentMsg;

/** @type {HTMLElement|null} */
let laminationContent;

/** @type {HTMLElement|null} */
let laminationToggle;

/** @type {HTMLElement|null} */
let laminationToggleLabel;

/** @type {HTMLElement|null} */
let laminationSettings;

/** @type {HTMLSelectElement|null} */
let laminatorSelect;

/** @type {HTMLSelectElement|null} */
let filmSelect;

/** @type {HTMLElement|null} */
let laminatorCostSpan;

/** @type {HTMLElement|null} */
let laminatorMarkupSpan;

/** @type {HTMLElement|null} */
let laminatorPriceSpan;

/** @type {HTMLElement|null} */
let filmPriceSpan;

/** @type {HTMLElement|null} */
let totalPriceSpan;

/** @type {HTMLElement|null} */
let sheetCountSpan;

/** @type {NodeList|null} Группа радиокнопок для выбора стороны ламинации */
let sideRadios = null;

// ============================================================================
// 3. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Ламинация" загружена (исправленная версия с поддержкой стороны ламинации)');
    initLaminationDOMElements();      // Находим все нужные элементы на странице
    setupLaminationEventListeners();  // Настраиваем обработчики событий
    loadLaminators();                 // Загружаем список ламинаторов
    loadFilms();                      // Загружаем список плёнок
});

// ============================================================================
// 4. ПОИСК DOM-ЭЛЕМЕНТОВ
// ============================================================================

/**
 * Инициализирует ссылки на DOM-элементы, необходимые для работы секции.
 * Если какой-то элемент отсутствует, будет предупреждение в консоли.
 */
function initLaminationDOMElements() {
    // Базовые контейнеры
    laminationNoComponentMsg = document.getElementById('lamination-no-component-message');
    laminationContent = document.getElementById('lamination-content');
    laminationToggle = document.getElementById('lamination-enabled-toggle');
    laminationToggleLabel = document.getElementById('lamination-toggle-label');
    laminationSettings = document.getElementById('lamination-settings');

    // Элементы форм
    laminatorSelect = document.getElementById('lamination-laminator-select');
    filmSelect = document.getElementById('lamination-film-select');

    // Элементы отображения цен
    laminatorCostSpan = document.getElementById('lamination-laminator-cost');
    laminatorMarkupSpan = document.getElementById('lamination-laminator-markup');
    laminatorPriceSpan = document.getElementById('lamination-laminator-price');
    filmPriceSpan = document.getElementById('lamination-film-price');
    totalPriceSpan = document.getElementById('lamination-total-price');
    sheetCountSpan = document.getElementById('lamination-sheet-count-display');

    // ===== НОВЫЙ ПАРАМЕТР: радиокнопки стороны ламинации =====
    sideRadios = document.querySelectorAll('input[name="lamination-side"]');
}

// ============================================================================
// 5. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ
// ============================================================================

/**
 * Навешивает обработчики на элементы управления внутри секции,
 * а также подписывается на глобальные события от других секций.
 */
function setupLaminationEventListeners() {
    // ===== 1. Переключатель "Включена/Выключена" =====
    if (laminationToggle) {
        laminationToggle.addEventListener('change', function() {
            const isChecked = this.checked;
            updateLaminationToggleUI(isChecked);
            saveLaminationSetting('is_enabled', isChecked);
        });
    }

    // ===== 2. Выбор ламинатора =====
    if (laminatorSelect) {
        laminatorSelect.addEventListener('change', function() {
            const laminatorId = this.value;
            saveLaminationSetting('laminator', laminatorId);
        });
    }

    // ===== 3. Выбор плёнки =====
    if (filmSelect) {
        filmSelect.addEventListener('change', function() {
            const filmId = this.value;
            saveLaminationSetting('film', filmId);
        });
    }

    // ===== 4. НОВОЕ: выбор стороны ламинации (радиокнопки) =====
    if (sideRadios && sideRadios.length > 0) {
        sideRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.checked) {
                    // Сохраняем выбранное значение ('single' или 'duplex') на сервер
                    saveLaminationSetting('side', this.value);
                }
            });
        });
    }

    // ===== 5. СОБЫТИЕ ВЫБОРА ПЕЧАТНОГО КОМПОНЕНТА =====
    document.addEventListener('printComponentSelected', function(event) {
        if (event.detail && event.detail.printComponentId) {
            const newComponentId = event.detail.printComponentId;
            const newProschetId = event.detail.proschetId;

            // ===== ИСПРАВЛЕНИЕ: НЕ ОТПРАВЛЯЕМ dispatchLaminationUpdatedEvent(null) =====
            // Раньше здесь был вызов dispatchLaminationUpdatedEvent(null) для старого компонента,
            // что приводило к исчезновению ламинации других компонентов в секции "Цена".
            // Теперь мы просто обновляем текущий компонент, не трогая данные других.

            laminationCurrentComponentId = newComponentId;
            laminationCurrentProschetId = newProschetId;
            updateComponentTitle(event.detail.printComponentNumber, event.detail.printerName);
            loadLaminationData(laminationCurrentComponentId);
        }
    });

    // ===== 6. СОБЫТИЕ ОТМЕНЫ ВЫБОРА КОМПОНЕНТА =====
    document.addEventListener('printComponentDeselected', function() {
        // Сбрасываем секцию, когда компонент снят с выделения
        if (laminationCurrentComponentId) {
            dispatchLaminationUpdatedEvent(null);
        }
        resetLaminationSection();
    });

    // ===== 7. СОБЫТИЕ ОБНОВЛЕНИЯ КОЛИЧЕСТВА ЛИСТОВ =====
    document.addEventListener('vichisliniyaListovUpdated', function(event) {
        // Приводим ID из события к числу для корректного сравнения
        const eventComponentId = event.detail && event.detail.printComponentId
            ? Number(event.detail.printComponentId)
            : null;

        if (eventComponentId === laminationCurrentComponentId && laminationCurrentComponentId) {
            console.log(`🔄 Количество листов изменилось для компонента ${laminationCurrentComponentId}, перезагружаем ламинацию`);
            loadLaminationData(laminationCurrentComponentId);
        }
    });
}

// ============================================================================
// 6. ЗАГРУЗКА ДАННЫХ ЛАМИНАЦИИ С СЕРВЕРА (с отменой предыдущих запросов)
// ============================================================================

/**
 * Загружает данные ламинации для указанного компонента с сервера.
 * Использует AbortController для отмены предыдущего запроса (предотвращает гонку).
 * @param {number|string} componentId - ID печатного компонента
 */
function loadLaminationData(componentId) {
    console.log(`📥 Загрузка данных ламинации для компонента ${componentId}`);

    // Отменяем предыдущий запрос, если он был для того же компонента
    if (laminationAbortController && laminationLoadingComponentId === componentId) {
        laminationAbortController.abort();
        console.log(`🛑 Отменён предыдущий запрос для компонента ${componentId}`);
    }

    // Создаём новый контроллер для текущего запроса
    laminationAbortController = new AbortController();
    laminationLoadingComponentId = componentId;
    const signal = laminationAbortController.signal;

    showLaminationLoading(); // Показываем индикатор загрузки (опционально)

    fetch(`/calculator/get-lamination/${componentId}/`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCsrfToken()
        },
        signal: signal
    })
    .then(response => {
        if (signal.aborted) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (signal.aborted || !data) return;
        if (data.success) {
            const lam = data.lamination;

            // ===== ИСПРАВЛЕНИЕ ПРЕДУПРЕЖДЕНИЯ: только для включённой ламинации =====
            if (lam.sheet_count > 0 && lam.total_price === 0 && lam.is_enabled) {
                console.warn(`⚠️ Сервер вернул total_price = 0 при sheet_count = ${lam.sheet_count}. Пересчитываем на клиенте.`);
                const laminatorPrice = parseFloat(lam.laminator_price) || 0;
                const filmPrice = parseFloat(lam.film_price) || 0;
                const recalculatedTotal = (laminatorPrice + filmPrice) * lam.sheet_count;
                lam.total_price = recalculatedTotal;
                lam.total_price_display = `${recalculatedTotal.toFixed(2)} ₽`;
            }

            // Сохраняем состояние ламинации
            laminationEnabled = lam.is_enabled;
            if (laminationToggle) laminationToggle.checked = lam.is_enabled;
            updateLaminationToggleUI(lam.is_enabled);

            // Устанавливаем выбранные значения в выпадающих списках
            if (lam.laminator_id) laminatorSelect.value = lam.laminator_id;
            else laminatorSelect.value = '';

            if (lam.film_id) filmSelect.value = lam.film_id;
            else filmSelect.value = '';

            // ===== НОВОЕ: устанавливаем радиокнопки стороны ламинации =====
            if (sideRadios && sideRadios.length > 0) {
                const sideValue = lam.side || 'single';
                sideRadios.forEach(radio => {
                    if (radio.value === sideValue) {
                        radio.checked = true;
                    }
                });
            }

            // Обновляем отображение цен
            updatePriceDisplay(lam);

            // Показываем интерфейс ламинации
            if (laminationNoComponentMsg) laminationNoComponentMsg.style.display = 'none';
            if (laminationContent) laminationContent.style.display = 'block';

            // Отправляем событие для секции "Цена"
            dispatchLaminationUpdatedEvent(lam);
        } else {
            console.error('Ошибка загрузки ламинации:', data.message);
            showLaminationError('Не удалось загрузить данные ламинации');
        }
    })
    .catch(error => {
        if (error.name === 'AbortError') return;
        console.error('Ошибка сети:', error);
        showLaminationError('Ошибка сети при загрузке ламинации');
    })
    .finally(() => {
        if (laminationLoadingComponentId === componentId) {
            laminationAbortController = null;
            laminationLoadingComponentId = null;
        }
    });
}

// ============================================================================
// 7. ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ ЦЕН (внутри секции)
// ============================================================================

/**
 * Обновляет текстовые поля с ценами и количеством листов в интерфейсе.
 * @param {Object} lam - Объект ламинации (полученный с сервера)
 */
function updatePriceDisplay(lam) {
    if (lam.laminator_cost_display && laminatorCostSpan) laminatorCostSpan.textContent = lam.laminator_cost_display;
    if (lam.laminator_markup_display && laminatorMarkupSpan) laminatorMarkupSpan.textContent = lam.laminator_markup_display;
    if (lam.laminator_price_display && laminatorPriceSpan) laminatorPriceSpan.textContent = lam.laminator_price_display;
    if (lam.film_price_display && filmPriceSpan) filmPriceSpan.textContent = lam.film_price_display;
    if (lam.total_price_display && totalPriceSpan) totalPriceSpan.textContent = lam.total_price_display;
    if (lam.sheet_count_display && sheetCountSpan) sheetCountSpan.textContent = lam.sheet_count_display;
}

// ============================================================================
// 8. ОТПРАВКА ИЗМЕНЕНИЙ НА СЕРВЕР
// ============================================================================

/**
 * Отправляет на сервер изменение одного параметра ламинации.
 * @param {string} fieldName - Имя поля ('is_enabled', 'laminator', 'film', 'side')
 * @param {*} fieldValue - Новое значение поля
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
            // Обновляем отображение цен на основе ответа сервера
            updatePriceDisplay(data.lamination);
            // Отправляем событие для секции "Цена"
            if (data.lamination.is_enabled && data.lamination.laminator_id && data.lamination.film_id) {
                dispatchLaminationUpdatedEvent(data.lamination);
            } else {
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

// ============================================================================
// 9. ОБНОВЛЕНИЕ ВНЕШНЕГО ВИДА ПЕРЕКЛЮЧАТЕЛЯ
// ============================================================================

/**
 * Меняет внешний вид переключателя ламинации (текст и видимость блока настроек).
 * @param {boolean} enabled - Включена ли ламинация
 */
function updateLaminationToggleUI(enabled) {
    if (enabled) {
        if (laminationToggleLabel) laminationToggleLabel.textContent = 'Включена';
        if (laminationToggleLabel) laminationToggleLabel.classList.add('active');
        if (laminationSettings) laminationSettings.style.display = 'block';
    } else {
        if (laminationToggleLabel) laminationToggleLabel.textContent = 'Выключена';
        if (laminationToggleLabel) laminationToggleLabel.classList.remove('active');
        if (laminationSettings) laminationSettings.style.display = 'none';
    }
}

// ============================================================================
// 10. ЗАГРУЗКА СПРАВОЧНЫХ ДАННЫХ (ламинаторы, плёнки)
// ============================================================================

/**
 * Загружает список ламинаторов из API приложения print_price.
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
 * Загружает список плёнок из API приложения sklad.
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
 * Заполняет выпадающий список данными.
 * @param {HTMLSelectElement} selectElement - Элемент select
 * @param {Array} items - Массив объектов
 * @param {string} valueKey - Ключ для значения option
 * @param {string} textKey - Ключ для текста option
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

// ============================================================================
// 11. ОБНОВЛЕНИЕ ЗАГОЛОВКА СЕКЦИИ
// ============================================================================

/**
 * Обновляет текст в заголовке секции, отображая номер и принтер компонента.
 * @param {string} componentNumber - Номер компонента (например, KP-1)
 * @param {string} printerName - Название принтера
 */
function updateComponentTitle(componentNumber, printerName) {
    const titleSpan = document.getElementById('lamination-component-title');
    if (titleSpan) {
        let displayText = componentNumber;
        if (printerName) displayText += ` (${printerName})`;
        titleSpan.innerHTML = `<span class="lamination-component-title-active">${displayText}</span>`;
    }
}

// ============================================================================
// 12. СБРОС СЕКЦИИ (при отмене выбора компонента)
// ============================================================================

/**
 * Полностью сбрасывает интерфейс секции ламинации.
 * Вызывается при событии printComponentDeselected.
 */
function resetLaminationSection() {
    // Отменяем текущий запрос, если он есть
    if (laminationAbortController) {
        laminationAbortController.abort();
        laminationAbortController = null;
        laminationLoadingComponentId = null;
    }

    // Сбрасываем переменные состояния
    laminationCurrentComponentId = null;
    laminationCurrentProschetId = null;

    // Показываем сообщение "компонент не выбран"
    if (laminationNoComponentMsg) laminationNoComponentMsg.style.display = 'block';
    if (laminationContent) laminationContent.style.display = 'none';

    // Сбрасываем переключатель и скрываем настройки
    if (laminationToggle) laminationToggle.checked = false;
    updateLaminationToggleUI(false);

    // Очищаем выпадающие списки
    if (laminatorSelect) laminatorSelect.value = '';
    if (filmSelect) filmSelect.value = '';

    // Сбрасываем радиокнопки стороны ламинации в значение по умолчанию
    if (sideRadios && sideRadios.length > 0) {
        sideRadios.forEach(radio => {
            if (radio.value === 'single') radio.checked = true;
        });
    }

    // Обнуляем отображение цен
    const zeroDisplay = '0.00 руб.';
    if (laminatorCostSpan) laminatorCostSpan.textContent = zeroDisplay;
    if (laminatorMarkupSpan) laminatorMarkupSpan.textContent = '0%';
    if (laminatorPriceSpan) laminatorPriceSpan.textContent = zeroDisplay;
    if (filmPriceSpan) filmPriceSpan.textContent = zeroDisplay;
    if (totalPriceSpan) totalPriceSpan.textContent = '0.00 ₽';
    if (sheetCountSpan) sheetCountSpan.textContent = '0';

    // Отправляем событие, что ламинация отключена (для секции "Цена")
    dispatchLaminationUpdatedEvent(null);
}

// ============================================================================
// 13. ОТПРАВКА СОБЫТИЯ ДЛЯ СЕКЦИИ "ЦЕНА"
// ============================================================================

/**
 * Генерирует и отправляет событие laminationUpdated, которое слушает price.js.
 * В detail обязательно передаётся поле is_enabled, чтобы price.js могла
 * корректно определить, учитывать ли ламинацию в общей стоимости.
 * @param {Object|null} laminationData - Объект ламинации (с сервера) или null
 */
function dispatchLaminationUpdatedEvent(laminationData) {
    // Базовый объект detail содержит ID компонента и просчёта, а также is_enabled
    let detail = {
        componentId: laminationCurrentComponentId,
        proschetId: laminationCurrentProschetId,
        is_enabled: laminationData ? laminationData.is_enabled : false
    };

    // Если ламинация включена и есть данные – добавляем все расчётные поля
    if (laminationData && laminationData.is_enabled) {
        detail = {
            ...detail,
            total_price: laminationData.total_price,
            laminator_price: laminationData.laminator_price,
            film_price: laminationData.film_price,
            sheet_count: laminationData.sheet_count,
            laminator_name: laminationData.laminator_name,
            film_name: laminationData.film_name,
            laminator_cost: laminationData.laminator_cost,
            laminator_markup: laminationData.laminator_markup,
            laminator_cost_display: laminationData.laminator_cost_display,
            laminator_markup_display: laminationData.laminator_markup_display,
            laminator_price_display: laminationData.laminator_price_display,
            film_price_display: laminationData.film_price_display,
            total_price_display: laminationData.total_price_display,
            sheet_count_display: laminationData.sheet_count_display,
            side: laminationData.side,                 // НОВОЕ: сторона ламинации
            side_display: laminationData.side_display
        };
    } else {
        detail.total_price = 0;
    }

    const event = new CustomEvent('laminationUpdated', { detail });
    document.dispatchEvent(event);
    console.log(`📤 Событие laminationUpdated отправлено для компонента ${laminationCurrentComponentId}, enabled=${detail.is_enabled}, total_price=${detail.total_price}`);
}

// ============================================================================
// 14. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/** Показывает индикатор загрузки (можно реализовать по желанию) */
function showLaminationLoading() {
    // Можно добавить spinner или оставить пустым
    console.log('Загрузка данных ламинации...');
}

/** Показывает сообщение об ошибке */
function showLaminationError(message) {
    console.error(message);
    showLaminationNotification(message, 'error');
}

/**
 * Показывает всплывающее уведомление.
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип: 'success', 'error', 'warning', 'info'
 */
function showLaminationNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 5000);
}

/**
 * Получает CSRF-токен из cookies.
 * @returns {string} CSRF-токен
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
    console.warn('⚠️ CSRF-токен не найден');
    return '';
}

// ============================================================================
// 15. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ (необязательно)
// ============================================================================
window.laminationSection = {
    reset: resetLaminationSection,
    getCurrentComponentId: () => laminationCurrentComponentId,
    reload: () => {
        if (laminationCurrentComponentId) loadLaminationData(laminationCurrentComponentId);
    }
};

console.log('✅ Секция "Ламинация" полностью инициализирована с поддержкой стороны ламинации и исправлениями для корректного отображения в секции "Цена"');