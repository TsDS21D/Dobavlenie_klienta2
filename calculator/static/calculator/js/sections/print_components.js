/**
 * ============================================================================
 * ФАЙЛ: print_components.js
 * НАЗНАЧЕНИЕ: Управление секцией "Печатные компоненты" в калькуляторе типографии.
 *
 * ОСНОВНЫЕ ФУНКЦИИ:
 * - Загрузка и отображение списка печатных компонентов для выбранного просчёта.
 * - Добавление нового компонента печати (через модальное окно).
 * - Inline-редактирование принтера, бумаги, типа печати и режима печати.
 * - Удаление компонента.
 * - Пересчёт стоимости компонента при изменении количества листов.
 * - Массовый пересчёт всех компонентов при изменении тиража просчёта.
 * - Отправка событий другим секциям (ламинация, доп. работы, цена).
 *
 * ИСПРАВЛЕНИЕ ДЛЯ МНОГОСТРАНИЧНОГО РЕЖИМА (20.04.2026):
 * - При отправке события printComponentSelected добавляется актуальный тираж
 *   из секции "Изделие", чтобы многостраничный модуль мог использовать
 *   правильное значение для отображения, а не пересчитывать заново.
 *
 * ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ – для понимания новичками.
 * ============================================================================
 */

// Режим строгого соответствия стандартам JavaScript (позволяет отлавливать ошибки)
"use strict";

// ============================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ
// ============================================================================

// ID текущего выбранного просчёта (число или null, если просчёт не выбран)
let currentProschetId = null;

// Массив текущих компонентов печати (хранит объекты, полученные с сервера)
let currentComponents = [];

// ID выбранного (выделенного) печатного компонента (для которого отображаются доп. работы и ламинация)
let selectedComponentId = null;

// Текущее количество листов для выбранного компонента (используется для отслеживания изменений)
let currentSheetCount = null;

// MutationObserver – специальный объект, который следит за изменениями в DOM.
// Здесь он используется для отслеживания изменения количества листов в элементе #vichisliniya-listov-result-value.
let sheetCountObserver = null;

// Таймер для отложенного обновления (дебаунс) – чтобы не отправлять запрос на сервер при каждом изменении,
// а только после того, как пользователь перестал вводить данные (задержка UPDATE_DELAY).
let updateTimeout = null;

// Контроллер для отмены предыдущих AJAX-запросов (предотвращает гонку запросов при быстром переключении просчётов)
let abortController = null;

// Флаг, указывающий, что идёт массовый пересчёт всех компонентов (изменение тиража).
// Этот флаг предотвращает лишние вызовы recalculateComponentPrice во время массового обновления.
let isMassRecalculating = false;

// Флаг для предотвращения одновременного запуска массового пересчёта (блокировка повторного входа)
let isRecalculating = false;

// Таймер для автоматического сброса флагов на случай ошибки (через 5 секунд)
let recalcTimeout = null;

// Объект с URL-адресами API для работы с компонентами печати.
// Константа – значение не изменяется после инициализации.
const API_URLS = {
    getComponents: '/calculator/get-print-components/',           // Получение списка компонентов
    updateComponentPrice: '/calculator/update-component-price/', // Пересчёт стоимости одного компонента
    recalculateAll: '/calculator/recalculate-components/'        // Массовый пересчёт всех компонентов
};

// Задержка перед пересчётом после изменения количества листов (1 секунда в миллисекундах)
const UPDATE_DELAY = 1000;

// ============================================================================
// 2. ОСНОВНЫЕ ФУНКЦИИ ИНИЦИАЛИЗАЦИИ
// ============================================================================

/**
 * Инициализирует секцию "Печатные компоненты".
 * Вызывается при загрузке страницы (в обработчике DOMContentLoaded).
 */
function initPrintComponents() {
    // Выводим в консоль сообщение о начале инициализации (для отладки)
    console.log('🔄 Инициализация секции "Печатные компоненты"...');
    
    // Настраиваем все обработчики событий (клики, события от других секций)
    setupEventListeners();
    
    // Инициализируем интерфейс (показываем сообщение "выберите просчёт")
    initInterface();
    
    // Сообщаем об успешной инициализации
    console.log('✅ Секция "Печатные компоненты" инициализирована');
}

/**
 * Настраивает обработчики событий:
 * - Клики по кнопкам "Добавить"
 * - События от других секций (proschetSelected, vichisliniyaListovUpdated,
 *   printComponentSelected, proschetDeselected, productCirculationSaved)
 */
function setupEventListeners() {
    console.log('🛠️ Настройка обработчиков событий...');

    // Находим кнопку "Добавить компонент" в заголовке секции
    const addBtn = document.getElementById('add-print-component-btn');
    // Если кнопка существует – добавляем обработчик клика
    if (addBtn) addBtn.addEventListener('click', handleAddComponent);

    // Находим кнопку "Добавить первый компонент" (показывается, когда компонентов нет)
    const addFirstBtn = document.getElementById('add-first-component-btn');
    if (addFirstBtn) addFirstBtn.addEventListener('click', handleAddFirstComponent);

    // Настраиваем обработчики событий, генерируемых другими секциями калькулятора
    setupIntersectionListeners();
}

/**
 * Настраивает обработчики событий, генерируемых другими секциями калькулятора.
 * Это основная точка интеграции – секция реагирует на действия пользователя в других частях интерфейса.
 */
function setupIntersectionListeners() {
    console.log('🔗 Настройка обработчиков событий от других секций...');

    // 1. СОБЫТИЕ ВЫБОРА ПРОСЧЁТА (генерируется секцией list_proschet.js)
    //    Когда пользователь кликает по строке просчёта, отправляется событие proschetSelected.
    document.addEventListener('proschetSelected', function(event) {
        console.log('📥 Получено событие выбора просчёта:', event.detail);
        // Если в деталях события есть ID просчёта – обновляем секцию
        if (event.detail && event.detail.proschetId) {
            // Передаём ID просчёта, DOM-элемент строки (для получения названия) и сигнал для отмены запроса
            updateForProschet(event.detail.proschetId, event.detail.rowElement, event.detail.signal);
        }
    });

    // 2. СОБЫТИЕ ОБНОВЛЕНИЯ КОЛИЧЕСТВА ЛИСТОВ (генерируется секцией vichisliniya_listov.js)
    //    Когда пользователь изменяет параметры в секции "Вычисления листов", отправляется событие vichisliniyaListovUpdated.
    document.addEventListener('vichisliniyaListovUpdated', function(event) {
        console.log('📥 Получено событие обновления количества листов для одного компонента:', event.detail);
        // Проверяем, что событие содержит ID компонента и новое количество листов
        if (event.detail && event.detail.printComponentId) {
            // ========== ГЛАВНОЕ ИСПРАВЛЕНИЕ ==========
            // Если идёт массовый пересчёт (изменение тиража), то игнорируем этот вызов,
            // потому что массовый пересчёт уже обновит все компоненты.
            // Это предотвращает дублирование запросов на сервер.
            if (isMassRecalculating) {
                console.log(`🚫 Пропускаем recalculateComponentPrice для компонента ${event.detail.printComponentId}, так как идёт массовый пересчёт`);
                return;
            }
            // Обновляем отображение количества листов в таблице
            updateSheetCountDisplayForComponent(event.detail.printComponentId, event.detail.listCount);
            // Пересчитываем стоимость только для одного компонента (отправляем запрос на сервер)
            recalculateComponentPrice(event.detail.printComponentId, event.detail.listCount);
        }
    });

    // 3. СОБЫТИЕ ВЫБОРА ПЕЧАТНОГО КОМПОНЕНТА (генерируется этой же секцией при клике по строке таблицы)
    //    Когда пользователь кликает по строке компонента, отправляется событие printComponentSelected.
    document.addEventListener('printComponentSelected', function(event) {
        console.log('📥 Получено событие выбора печатного компонента:', event.detail);
        // Сохраняем ID выбранного компонента в глобальную переменную
        selectedComponentId = event.detail.printComponentId;
        if (event.detail.printComponentId) {
            // Начинаем наблюдение за изменениями количества листов для выбранного компонента
            initSheetCountObservation(event.detail.printComponentId);
        }
    });

    // 4. СОБЫТИЕ ОТМЕНЫ ВЫБОРА ПРОСЧЁТА (генерируется list_proschet.js)
    //    Когда пользователь снимает выделение с просчёта (например, кликает вне таблицы).
    document.addEventListener('proschetDeselected', function() {
        console.log('📥 Получено событие отмены выбора просчёта');
        resetSection(); // Полностью сбрасываем секцию (очищаем таблицу и переменные)
    });

    // 5. СОБЫТИЕ СОХРАНЕНИЯ ТИРАЖА (генерируется секцией product.js после успешного обновления тиража на сервере)
    //    Когда пользователь изменяет тираж просчёта и сохраняет его, отправляется событие productCirculationSaved.
    document.addEventListener('productCirculationSaved', function(event) {
        // Проверяем, что событие относится к текущему выбранному просчёту
        if (event.detail && event.detail.proschetId == currentProschetId) {
            const newCirculation = event.detail.circulation;
            console.log(`🔄 Массовый пересчёт компонентов (тираж: ${newCirculation})`);
            // Запускаем массовый пересчёт всех компонентов (обновляет количество листов и цены)
            recalculateAllComponentsForCirculation(currentProschetId, newCirculation);
        }
    });
}

/**
 * Инициализирует интерфейс секции при загрузке страницы.
 * Показывает сообщение "Выберите просчёт" и скрывает таблицу.
 */
function initInterface() {
    console.log('🎨 Инициализация интерфейса...');
    showNoProschetSelectedMessage();
}

// ============================================================================
// 3. ФУНКЦИЯ ОТМЕНЫ ВЫБОРА ПЕЧАТНОГО КОМПОНЕНТА
// ============================================================================

/**
 * Снимает выделение с текущего выбранного компонента.
 * Отправляет событие printComponentDeselected для других секций (ламинация, доп. работы).
 */
function deselectCurrentComponent() {
    // Если есть выбранный компонент – выполняем снятие выделения
    if (selectedComponentId) {
        console.log(`🔄 Снятие выбора с компонента ID: ${selectedComponentId}`);

        // Убираем CSS-класс 'selected' со всех строк таблицы (чтобы визуально снять выделение)
        document.querySelectorAll('#print-components-table-body tr').forEach(row => {
            row.classList.remove('selected');
        });

        // Отправляем событие о снятии выбора (чтобы другие секции, например, ламинация и доп. работы, очистились)
        const event = new CustomEvent('printComponentDeselected', {
            detail: {
                printComponentId: selectedComponentId,
                timestamp: new Date().toISOString(),
                reason: 'component_deselected'
            }
        });
        document.dispatchEvent(event);
        console.log('📤 Событие printComponentDeselected отправлено');

        // Сбрасываем глобальные переменные состояния
        selectedComponentId = null;
        currentSheetCount = null;

        // Останавливаем наблюдение за количеством листов (отключаем MutationObserver)
        stopSheetCountObservation();

        // Очищаем таймер отложенного обновления (чтобы не было лишних запросов)
        clearUpdateTimeout();
    } else {
        console.log('ℹ️ Нет выбранного компонента для отмены');
    }
}

// ============================================================================
// 4. ФУНКЦИИ ДЛЯ РАБОТЫ С СЕРВЕРОМ (API)
// ============================================================================

/**
 * Загружает список печатных компонентов для указанного просчёта с сервера.
 * @param {string|number} proschetId - ID просчёта
 * @param {AbortSignal} signal - Сигнал для отмены запроса (опционально, используется при быстром переключении)
 */
function loadComponentsForProschet(proschetId, signal) {
    console.log(`📡 Загрузка компонентов для просчёта ID: ${proschetId}`);

    // Показываем индикатор загрузки (спиннер в таблице)
    showLoadingState();

    // Если запрос уже отменён через сигнал – выходим, не делаем ничего
    if (signal && signal.aborted) {
        console.log('ℹ️ Запрос отменён, загрузка компонентов пропущена');
        return;
    }

    // Формируем полный URL для запроса
    const url = `${API_URLS.getComponents}${proschetId}/`;
    // Получаем CSRF-токен для защиты от подделки межсайтовых запросов
    const csrfToken = getCsrfToken();

    // Выполняем GET-запрос к серверу
    fetch(url, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',   // Указываем, что это AJAX-запрос
            'X-CSRFToken': csrfToken                // Передаём CSRF-токен
        },
        signal: signal // Передаём сигнал для возможности отмены запроса
    })
    .then(response => {
        // Если запрос был отменён – выбрасываем исключение, чтобы не обрабатывать ответ
        if (signal && signal.aborted) throw new Error('RequestAborted');
        // Проверяем статус ответа HTTP
        if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
        // Преобразуем ответ в JSON
        return response.json();
    })
    .then(data => {
        // Если запрос отменён – ничего не делаем
        if (signal && signal.aborted) return;
        // Если сервер вернул success: true
        if (data.success) {
            console.log('✅ Компоненты успешно загружены:', data);
            // Сохраняем массив компонентов в глобальную переменную
            currentComponents = data.components || [];
            // Обновляем интерфейс (отображаем таблицу или сообщение "нет компонентов")
            updateInterface(currentComponents);
            console.log(`✅ Загружено ${currentComponents.length} компонентов`);
            // Отправляем событие для секции "Цена" (чтобы она пересчитала общую стоимость)
            dispatchPrintComponentsUpdated();
        } else {
            // Если сервер вернул ошибку – показываем сообщение
            console.error('❌ Ошибка при загрузке компонентов:', data.message);
            showErrorMessage('Не удалось загрузить компоненты печати');
        }
    })
    .catch(error => {
        // Обрабатываем ошибки сети или отмену запроса
        if (error.name === 'AbortError' || (signal && signal.aborted)) {
            console.log('ℹ️ Запрос был отменён');
            return;
        }
        console.error('❌ Ошибка сети при загрузке компонентов:', error);
        showErrorMessage('Ошибка сети при загрузке компонентов');
    });
}

/**
 * Обновляет данные одного компонента в локальном массиве currentComponents.
 * Используется после успешного обновления компонента на сервере.
 * @param {Object} updatedComponentData - Обновлённые данные компонента (с сервера)
 */
function updateCurrentComponent(updatedComponentData) {
    // Проверяем, что данные валидны (есть ID)
    if (!updatedComponentData || !updatedComponentData.id) {
        console.warn('⚠️ Не удалось обновить компонент: нет ID');
        return;
    }
    // Находим индекс компонента в массиве currentComponents по ID
    const index = currentComponents.findIndex(c => c.id == updatedComponentData.id);
    if (index !== -1) {
        // Объединяем существующие данные с новыми (поверхностное копирование)
        // ... – оператор расширения, создаёт новый объект, копируя все свойства
        currentComponents[index] = { ...currentComponents[index], ...updatedComponentData };
        console.log(`✅ Компонент ID=${updatedComponentData.id} обновлён в массиве currentComponents`);
    } else {
        console.warn(`⚠️ Компонент с ID=${updatedComponentData.id} не найден в currentComponents`);
    }
}

/**
 * Отправляет событие printComponentsUpdated для секции "Цена" и других подписчиков.
 * Это событие содержит актуальный список компонентов, чтобы секция "Цена" могла пересчитать итоговую стоимость.
 */
function dispatchPrintComponentsUpdated() {
    // Если просчёт не выбран – не отправляем событие
    if (!currentProschetId) {
        console.warn('⚠️ Не выбран просчёт, событие printComponentsUpdated не отправлено');
        return;
    }
    // Создаём пользовательское событие
    const event = new CustomEvent('printComponentsUpdated', {
        detail: {
            proschetId: currentProschetId,
            components: currentComponents,
            timestamp: new Date().toISOString()
        }
    });
    // Отправляем событие в документ (на него могут подписаться другие скрипты)
    document.dispatchEvent(event);
    console.log(`📤 Событие printComponentsUpdated отправлено (компонентов: ${currentComponents.length})`);
}

/**
 * Пересчитывает стоимость одного компонента на сервере и обновляет отображение.
 * Вызывается при изменении количества листов или вручную.
 * @param {number|string} componentId - ID компонента
 * @param {number} sheetCount - Новое количество листов
 */
function recalculateComponentPrice(componentId, sheetCount) {
    // Защита: если идёт массовый пересчёт – ничего не делаем (чтобы не дублировать запросы)
    if (isMassRecalculating) {
        console.log(`🚫 recalculateComponentPrice для компонента ${componentId} пропущен (массовый пересчёт)`);
        return;
    }
    // Проверяем, что выбран просчёт
    if (!currentProschetId) {
        console.warn('⚠️ Не указан ID просчёта');
        showNotification('Не выбран просчёт для пересчёта стоимости', 'warning');
        return;
    }
    // Формируем данные для отправки на сервер
    const url = API_URLS.updateComponentPrice;
    const requestData = {
        component_id: componentId,
        sheet_count: sheetCount,
        proschet_id: currentProschetId
    };
    const csrfToken = getCsrfToken();

    console.log('📤 Отправляю запрос на пересчёт:', { url: url, data: requestData });

    // Выполняем POST-запрос на сервер
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
            // Обновляем локальный массив компонентов
            if (data.component) {
                updateCurrentComponent(data.component);
            }
            // Обновляем отображение в таблице
            updateComponentInTable(componentId, data.component);
            // Обновляем общую стоимость всех компонентов в секции
            updateTotalPrice(data.total_price);
            // Отправляем событие для секции "Цена"
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
// 5. МАССОВЫЙ ПЕРЕСЧЁТ ВСЕХ КОМПОНЕНТОВ ПРИ ИЗМЕНЕНИИ ТИРАЖА
// ============================================================================

/**
 * Пересчитывает все печатные компоненты для указанного просчёта при изменении тиража.
 * Вызывается по событию productCirculationSaved.
 * @param {number|string} proschetId - ID просчёта
 * @param {number} circulation - Новый тираж
 */
function recalculateAllComponentsForCirculation(proschetId, circulation) {
    // Защита от одновременного запуска (если уже идёт пересчёт – пропускаем)
    if (isRecalculating) {
        console.warn('⚠️ Пересчёт уже выполняется, пропускаем');
        return;
    }

    // ========== Устанавливаем флаги ==========
    // isMassRecalculating – чтобы обработчик vichisliniyaListovUpdated не вызывал recalculateComponentPrice
    // isRecalculating – чтобы не запустить второй массовый пересчёт параллельно
    isMassRecalculating = true;
    isRecalculating = true;

    // Таймер для автоматического сброса флагов на случай ошибки (через 5 секунд)
    if (recalcTimeout) clearTimeout(recalcTimeout);
    recalcTimeout = setTimeout(() => {
        isRecalculating = false;
        isMassRecalculating = false;
        recalcTimeout = null;
    }, 5000);

    console.log(`🔄 Массовый пересчёт компонентов для просчёта ID=${proschetId}, тираж=${circulation}`);
    showLoadingState(); // Показываем индикатор загрузки

    // Сохраняем ID ранее выбранного компонента, чтобы восстановить выбор после пересчёта
    const previouslySelectedComponentId = selectedComponentId;
    console.log(`💾 Сохраняем ID выбранного компонента: ${previouslySelectedComponentId}`);

    // Подготавливаем данные для отправки
    const csrfToken = getCsrfToken();
    const formData = new FormData();
    formData.append('circulation', circulation);

    // Отправляем POST-запрос на сервер для массового пересчёта
    fetch(`${API_URLS.recalculateAll}${proschetId}/`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': csrfToken },
        body: formData
    })
    .then(response => {
        if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('✅ Массовый пересчёт успешен', data);
            // Обновляем глобальный массив компонентов новыми данными с сервера
            currentComponents = data.components || [];

            // === ПРИНУДИТЕЛЬНО ОБНОВЛЯЕМ ТАБЛИЦУ ===
            const tableBody = document.getElementById('print-components-table-body');
            if (tableBody) {
                // Очищаем тело таблицы
                tableBody.innerHTML = '';
                // Перебираем все компоненты и создаём для каждого строку таблицы
                currentComponents.forEach((component, index) => {
                    const row = createComponentRow(component, index);
                    tableBody.appendChild(row);
                });
                console.log(`✅ Таблица обновлена: ${currentComponents.length} строк`);
            }

            // === ВОССТАНАВЛИВАЕМ ВЫБРАННЫЙ КОМПОНЕНТ (если был) ===
            if (previouslySelectedComponentId) {
                const restoredRow = document.querySelector(`tr[data-component-id="${previouslySelectedComponentId}"]`);
                if (restoredRow) {
                    // Снимаем выделение со всех строк
                    document.querySelectorAll('#print-components-table-body tr').forEach(r => r.classList.remove('selected'));
                    // Выделяем восстановленную строку
                    restoredRow.classList.add('selected');
                    selectedComponentId = previouslySelectedComponentId;

                    // Находим обновлённые данные компонента
                    const restoredComponent = currentComponents.find(c => c.id == previouslySelectedComponentId);
                    if (restoredComponent) {
                        currentSheetCount = restoredComponent.sheet_count || 0;
                        // Получаем текущий тираж из секции "Изделие" для события
                        let currentCirculation = 1;
                        if (window.productSection && typeof window.productSection.getCurrentCirculation === 'function') {
                            const circ = window.productSection.getCurrentCirculation();
                            if (circ !== null && circ !== undefined) currentCirculation = circ;
                        }
                        // Отправляем событие для зависимых секций (ламинация, доп. работы, цена)
                        const eventDetail = {
                            printComponentId: previouslySelectedComponentId,
                            printComponentNumber: restoredComponent.number || '',
                            printerName: restoredComponent.printer_name || '',
                            paperName: restoredComponent.paper_name || '',
                            paperPrice: restoredComponent.paper_price || 0,
                            proschetId: currentProschetId,
                            sheetCount: restoredComponent.sheet_count || 0,
                            pricePerSheet: restoredComponent.price_per_sheet || 0,
                            printingMode: restoredComponent.printing_mode || 'single',
                            printType: restoredComponent.print_type || 'color',
                            printTypeDisplay: restoredComponent.print_type_display || 'Цветная',
                            circulation: currentCirculation  // <-- ДОБАВЛЕНО: передаём тираж
                        };
                        document.dispatchEvent(new CustomEvent('printComponentSelected', { detail: eventDetail }));
                        console.log(`✅ Восстановлен выбор компонента ${previouslySelectedComponentId}`);
                    }
                } else {
                    console.log(`ℹ️ Ранее выбранный компонент ${previouslySelectedComponentId} не найден после пересчёта`);
                    selectedComponentId = null;
                    currentSheetCount = null;
                }
            } else {
                selectedComponentId = null;
                currentSheetCount = null;
            }

            // Обновляем отображение общей стоимости компонентов
            updateTotalPrice(data.total_price || calculateTotalPrice(currentComponents));
            // Отправляем событие обновления компонентов (для секции "Цена")
            dispatchPrintComponentsUpdated();
            // Показываем уведомление об успешном пересчёте
            showNotification(data.message || 'Компоненты пересчитаны', 'success');
        } else {
            console.error('❌ Ошибка массового пересчёта:', data.message);
            showNotification(`Ошибка: ${data.message}`, 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при массовом пересчёте:', error);
        showNotification('Ошибка сети при пересчёте компонентов', 'error');
    })
    .finally(() => {
        // Сбрасываем флаги после завершения (успешного или с ошибкой)
        isRecalculating = false;
        isMassRecalculating = false;
        if (recalcTimeout) clearTimeout(recalcTimeout);
        recalcTimeout = null;
    });
}

// ============================================================================
// 6. ФУНКЦИИ ДЛЯ ОБНОВЛЕНИЯ ПРИ ВЫБОРЕ ПРОСЧЁТА
// ============================================================================

/**
 * Обновляет секцию для выбранного просчёта.
 * Вызывается из обработчика proschetSelected.
 * @param {number|string} proschetId - ID просчёта
 * @param {HTMLElement} rowElement - DOM-элемент строки таблицы просчётов (для получения названия)
 * @param {AbortSignal} signal - Сигнал для отмены запроса
 */
function updateForProschet(proschetId, rowElement, signal) {
    console.log(`🔄 Обновление секции для просчёта ID: ${proschetId}`);

    // Если запрос отменён – выходим
    if (signal && signal.aborted) {
        console.log('ℹ️ Запрос отменён, обновление секции пропущено');
        return;
    }

    // Снимаем выделение с текущего компонента (если был выбран)
    deselectCurrentComponent();

    // Отменяем предыдущий AJAX-запрос (если был) – предотвращает гонку запросов
    cancelCurrentRequest();

    // Останавливаем наблюдение за количеством листов
    stopSheetCountObservation();

    // Очищаем таймер отложенного обновления
    clearUpdateTimeout();

    // Сохраняем ID нового просчёта в глобальную переменную
    currentProschetId = proschetId;
    // Сбрасываем ID выбранного компонента
    selectedComponentId = null;
    currentSheetCount = null;

    // Обновляем заголовок секции (отображаем название выбранного просчёта)
    updateProschetTitle(rowElement);

    // Загружаем компоненты для этого просчёта с сервера
    loadComponentsForProschet(proschetId, signal);
}

/**
 * Обновляет интерфейс в зависимости от наличия компонентов.
 * @param {Array} components - Массив компонентов
 */
function updateInterface(components) {
    console.log('🎨 Обновление интерфейса с компонентами:', components);
    // Скрываем все сообщения (пустого состояния)
    hideAllMessages();

    // Проверяем, не идёт ли inline-редактирование (чтобы не перерисовывать таблицу во время редактирования)
    if (window.printComponentsInlineEditState?.isEditing && window.printComponentsInlineEditState.isEditing()) {
        console.warn('🛑 Пропускаем обновление интерфейса, так как идёт inline-редактирование компонента');
        return;
    }

    // Если компонентов нет – показываем сообщение "Нет компонентов"
    if (components.length === 0) {
        showNoComponentsMessage();
    } else {
        // Иначе показываем таблицу и заполняем её данными
        showComponentsTable();
        populateTable(components);
        updateTotalPrice(calculateTotalPrice(components));
        restoreSelectedRow(); // Восстанавливаем выделение, если был выбран компонент
    }
    // Показываем кнопку "Добавить компонент"
    showAddButton(true);
}

/**
 * Заполняет таблицу компонентами.
 * @param {Array} components - Массив компонентов
 */
function populateTable(components) {
    const tableBody = document.getElementById('print-components-table-body');
    if (!tableBody) {
        console.error('❌ Элемент #print-components-table-body не найден');
        return;
    }

    // Если идёт inline-редактирование – не перерисовываем таблицу (чтобы не сбросить редактирование)
    if (window.printComponentsInlineEditState?.isEditing && window.printComponentsInlineEditState.isEditing()) {
        console.warn('🛑 Пропускаем заполнение таблицы, так как идёт inline-редактирование');
        return;
    }

    // Очищаем тело таблицы
    tableBody.innerHTML = '';
    // Для каждого компонента создаём строку и добавляем в таблицу
    components.forEach((component, index) => {
        const row = createComponentRow(component, index);
        tableBody.appendChild(row);
    });
    console.log(`✅ Таблица обновлена: ${components.length} строк`);
}

/**
 * Создаёт DOM-строку таблицы для одного компонента.
 * @param {Object} component - Данные компонента (с сервера)
 * @param {number} index - Индекс для чередования цвета строк
 * @returns {HTMLElement} Строка таблицы (элемент tr)
 * 
 * ПОРЯДОК КОЛОНОК (индексы, начиная с 0):
 * 0 - № компонента
 * 1 - Принтер
 * 2 - Бумага
 * 3 - Тип печати (Цветная/Ч/б)
 * 4 - Листов
 * 5 - Себестоимость
 * 6 - Наценка
 * 7 - Цена
 * 8 - Прибыль
 * 9 - Режим (односторонняя/двусторонняя)
 * 10 - Стоимость за тираж
 * 11 - Действия (кнопка удаления)
 */
function createComponentRow(component, index) {
    // Создаём элемент строки таблицы <tr>
    const row = document.createElement('tr');
    // Чередование фона: чётные строки получают класс 'even-row', нечётные – 'odd-row'
    if (index % 2 === 0) row.classList.add('even-row');
    else row.classList.add('odd-row');
    // Добавляем класс для возможности выделения строки
    row.classList.add('selectable-row');
    // Сохраняем ID компонента в data-атрибуте для быстрого доступа
    row.dataset.componentId = component.id;

    // Форматируем отображение количества листов (с пробелами как разделителями тысяч)
    let sheetCountDisplay = 'Не указан';
    if (component.formatted_sheet_count_display && component.formatted_sheet_count_display !== 'Не указан')
        sheetCountDisplay = component.formatted_sheet_count_display;
    else if (component.sheet_count)
        sheetCountDisplay = parseFloat(component.sheet_count).toFixed(2);

    // Получаем числовые значения для расчётов
    const pricePerSheet = parseFloat(component.price_per_sheet) || 0;
    const paperPrice = parseFloat(component.paper_price) || 0;
    const runsCount = component.runs_count || 0;
    // Подсказка с формулой расчёта (всплывает при наведении на стоимость)
    const formulaTooltip = `Формула: (${pricePerSheet.toFixed(2)} руб./печать × ${runsCount} прогонов) + (${paperPrice.toFixed(2)} руб./бумага × ${sheetCountDisplay} листов)`;
    // Отображение режима печати (сокращённо)
    let modeDisplay = (component.printing_mode === 'duplex') ? 'Двуст.' : 'Одност.';
    // Отображение типа печати
    let printTypeDisplay = component.print_type_display || (component.print_type === 'bw' ? 'Ч/б' : 'Цветная');

    // Заполняем HTML содержимое строки
    // Обратите внимание: количество ячеек (td) должно соответствовать количеству заголовков (th)
    row.innerHTML = `
        <td class="component-number" title="Уникальный номер компонента">${component.number || '—'}</td>
        <td class="component-printer" title="Выбранное печатное оборудование">${component.printer_name || 'Принтер не выбран'}</td>
        <td class="component-paper" title="Выбранный материал (бумага)">
            ${component.paper_name || 'Бумага не выбрана'}
            ${paperPrice ? `<br><small>${paperPrice.toFixed(2)} ₽/лист</small>` : ''}
        </td>
        <td class="component-print-type" title="Тип печати: цветная или ч/б">${printTypeDisplay}</td>
        <td class="component-sheet-count" title="Количество листов из секции 'Вычисления листов'">${sheetCountDisplay}</td>
        <td class="component-cost" title="Себестоимость печати одного листа">${component.formatted_cost || '0.00 ₽'}</td>
        <td class="component-markup" title="Наценка от себестоимости">${component.formatted_markup_percent || '0%'}</td>
        <td class="component-price" title="Цена печати одного листа (рассчитана интерполяцией)">${pricePerSheet.toFixed(2)} ₽</td>
        <td class="component-profit" title="Прибыль на один лист">${component.formatted_profit_per_unit || '0.00 ₽'}</td>
        <td class="component-mode" title="Режим печати: ${component.printing_mode_display || (component.printing_mode === 'duplex' ? 'двусторонняя' : 'односторонняя')}">
            ${modeDisplay}
        </td>
        <td class="component-total" title="${formulaTooltip}">${parseFloat(component.total_circulation_price).toFixed(2)} ₽</td>
        <td class="component-actions">
            <button type="button" class="delete-component-btn" title="Удалить компонент" data-component-id="${component.id}">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;

    // Обработчик клика по строке – выбирает компонент и отправляет событие для других секций
    row.addEventListener('click', function(event) {
        // Если клик был по кнопке удаления – не выбираем компонент (чтобы не мешать удалению)
        if (event.target.closest('.delete-component-btn')) return;

        // Снимаем выделение со всех строк
        document.querySelectorAll('#print-components-table-body tr').forEach(r => r.classList.remove('selected'));
        // Выделяем текущую строку
        this.classList.add('selected');

        // Получаем ID компонента из dataset строки
        const clickedComponentId = parseInt(this.dataset.componentId, 10);
        
        // ===== ВАЖНО: получаем актуальные данные из глобального массива currentComponents =====
        // Это гарантирует, что у нас свежие данные (например, после пересчёта)
        const actualComponent = currentComponents.find(c => c.id === clickedComponentId);
        if (!actualComponent) {
            console.error(`❌ Компонент с ID ${clickedComponentId} не найден в currentComponents`);
            return;
        }

        // Обновляем глобальные переменные
        selectedComponentId = actualComponent.id;
        currentSheetCount = actualComponent.sheet_count || 0;

        // Получаем текущий тираж из секции "Изделие"
        let currentCirculation = 1;
        if (window.productSection && typeof window.productSection.getCurrentCirculation === 'function') {
            const circ = window.productSection.getCurrentCirculation();
            if (circ !== null && circ !== undefined) currentCirculation = circ;
        }

        // Формируем детали события для отправки другим секциям
        const paperPriceVal = parseFloat(actualComponent.paper_price) || 0;
        const pricePerSheetVal = parseFloat(actualComponent.price_per_sheet) || 0;
        
        const eventDetail = {
            printComponentId: actualComponent.id,
            printComponentNumber: actualComponent.number,
            printerName: actualComponent.printer_name,
            paperName: actualComponent.paper_name,
            paperPrice: paperPriceVal,
            proschetId: currentProschetId,
            sheetCount: actualComponent.sheet_count || 0,
            pricePerSheet: pricePerSheetVal,
            printingMode: actualComponent.printing_mode,
            printType: actualComponent.print_type,           // тип печати
            printTypeDisplay: actualComponent.print_type_display, // отображаемое имя типа
            circulation: currentCirculation,                 // <-- ДОБАВЛЕНО: тираж для многостраничного режима
            formula: '(price_per_sheet * runs_count) + (paper_price * sheet_count)'
        };
        
        // Отправляем событие, чтобы другие секции (ламинация, доп. работы, цена) обновились
        document.dispatchEvent(new CustomEvent('printComponentSelected', { detail: eventDetail }));
        console.log(`📤 Событие printComponentSelected отправлено для компонента ${actualComponent.id} (режим: ${actualComponent.printing_mode}, тип: ${actualComponent.print_type}, тираж: ${currentCirculation})`);

        // Начинаем наблюдение за изменениями количества листов (MutationObserver)
        initSheetCountObservation(actualComponent.id);
    });

    return row;
}

/**
 * Восстанавливает выделение строки, если ранее был выбран компонент.
 * Вызывается после загрузки/перезагрузки компонентов.
 */
function restoreSelectedRow() {
    if (selectedComponentId) {
        // Ищем строку с соответствующим data-component-id
        const row = document.querySelector(`#print-components-table-body tr[data-component-id="${selectedComponentId}"]`);
        if (row) {
            row.classList.add('selected');
        } else {
            // Если компонент больше не существует – сбрасываем выбор
            selectedComponentId = null;
            currentSheetCount = null;
        }
    }
}

/**
 * Обновляет отображение количества листов в таблице для конкретного компонента.
 * Вызывается из события vichisliniyaListovUpdated.
 * @param {number|string} componentId - ID компонента
 * @param {number} sheetCount - Новое количество листов
 */
function updateSheetCountDisplayForComponent(componentId, sheetCount) {
    console.log(`📊 Обновление отображения количества листов для компонента ${componentId}: ${sheetCount}`);
    const componentRow = document.querySelector(`tr[data-component-id="${componentId}"]`);
    if (!componentRow) return;
    const sheetCountCell = componentRow.querySelector('.component-sheet-count');
    if (sheetCountCell) {
        const currentText = sheetCountCell.textContent.trim();
        const newFormatted = parseFloat(sheetCount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        if (currentText !== newFormatted) {
            sheetCountCell.textContent = newFormatted;
            sheetCountCell.title = `Количество листов: ${newFormatted}`;
        }
    }
}

/**
 * Обновляет данные в строке таблицы после пересчёта стоимости или изменения параметров компонента.
 * @param {number|string} componentId - ID компонента
 * @param {Object} componentData - Обновлённые данные с сервера
 */
function updateComponentInTable(componentId, componentData) {
    // Если идёт inline-редактирование – не обновляем таблицу (чтобы не сбросить редактирование)
    if (window.printComponentsInlineEditState?.isEditing && window.printComponentsInlineEditState.isEditing()) {
        console.log(`🛑 Пропускаем обновление таблицы для компонента ${componentId}, так как идёт редактирование`);
        return;
    }

    console.log(`📊 Обновление отображения для компонента ${componentId}`);
    // Находим строку таблицы
    const componentRow = document.querySelector(`tr[data-component-id="${componentId}"]`);
    if (!componentRow) {
        console.log(`ℹ️ Строка для компонента ${componentId} не найдена`);
        return;
    }

    // Извлекаем новые значения из componentData (с сервера)
    const pricePerSheet = parseFloat(componentData.price_per_sheet) || 0;
    const paperPrice = parseFloat(componentData.paper_price) || 0;
    const sheetCount = parseFloat(componentData.sheet_count) || 0;
    const totalPrice = parseFloat(componentData.total_circulation_price) || 0;
    const runsCount = componentData.runs_count || (sheetCount * (componentData.printing_mode === 'duplex' ? 2 : 1));
    const printingMode = componentData.printing_mode || 'single';
    const modeDisplay = (printingMode === 'duplex') ? 'Двуст.' : 'Одност.';
    const cost = parseFloat(componentData.cost) || 0;
    const markup = parseFloat(componentData.markup_percent) || 0;
    const profit = parseFloat(componentData.profit_per_unit) || 0;

    // Обновляем ячейку с бумагой (может содержать название и цену)
    const paperCell = componentRow.querySelector('.component-paper');
    if (paperCell && componentData.paper_name) {
        paperCell.innerHTML = `${componentData.paper_name}${paperPrice ? `<br><small>${paperPrice.toFixed(2)} ₽/лист</small>` : ''}`;
    }

    // Обновляем количество листов
    const sheetCountCell = componentRow.querySelector('.component-sheet-count');
    if (sheetCountCell) {
        const formattedSheetCount = sheetCount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        sheetCountCell.textContent = formattedSheetCount;
        sheetCountCell.title = `Количество листов из секции 'Вычисления листов': ${formattedSheetCount}`;
    }

    // Обновляем цену за лист
    const priceCell = componentRow.querySelector('.component-price');
    if (priceCell) priceCell.textContent = `${pricePerSheet.toFixed(2)} ₽`;

    // Обновляем себестоимость
    const costCell = componentRow.querySelector('.component-cost');
    if (costCell) costCell.textContent = componentData.formatted_cost || '0.00 ₽';

    // Обновляем наценку
    const markupCell = componentRow.querySelector('.component-markup');
    if (markupCell) markupCell.textContent = componentData.formatted_markup_percent || '0%';

    // Обновляем прибыль
    const profitCell = componentRow.querySelector('.component-profit');
    if (profitCell) profitCell.textContent = componentData.formatted_profit_per_unit || '0.00 ₽';

    // Обновляем режим печати
    const modeCell = componentRow.querySelector('.component-mode');
    if (modeCell) {
        modeCell.textContent = modeDisplay;
        modeCell.title = `Режим печати: ${componentData.printing_mode_display || (printingMode === 'duplex' ? 'двусторонняя' : 'односторонняя')}`;
    }

    // Обновляем тип печати
    const printTypeCell = componentRow.querySelector('.component-print-type');
    if (printTypeCell && componentData.print_type_display) {
        printTypeCell.textContent = componentData.print_type_display;
    }

    // Обновляем общую стоимость
    const totalCell = componentRow.querySelector('.component-total');
    if (totalCell) {
        totalCell.textContent = `${totalPrice.toFixed(2)} ₽`;
        const formulaTooltip = `Формула: (${pricePerSheet.toFixed(2)} руб./печать × ${runsCount} прогонов) + (${paperPrice.toFixed(2)} руб./бумага × ${sheetCount.toFixed(2)} листов)`;
        totalCell.title = formulaTooltip;
    }

    console.log(`✅ Отображение для компонента ${componentId} обновлено`);
}

/**
 * Обновляет отображение общей стоимости всех компонентов в секции.
 * @param {number} totalPrice - Общая стоимость (сумма всех total_circulation_price)
 */
function updateTotalPrice(totalPrice) {
    console.log(`💰 Обновление общей стоимости: ${totalPrice} руб.`);
    const totalPriceElement = document.getElementById('print-components-total-price');
    const totalContainer = document.getElementById('print-components-total');
    if (totalPriceElement) totalPriceElement.textContent = `${parseFloat(totalPrice).toFixed(2)} ₽`;
    if (totalContainer) totalContainer.style.display = 'block';
}

/**
 * Вычисляет общую стоимость всех компонентов (локально, на основе currentComponents).
 * Используется как резервный вариант, если сервер не вернул total_price.
 * @param {Array} components - Массив компонентов
 * @returns {number} Общая стоимость
 */
function calculateTotalPrice(components) {
    let total = 0;
    components.forEach(component => {
        if (component.total_circulation_price) total += parseFloat(component.total_circulation_price);
    });
    return total;
}

// ============================================================================
// 7. ОБРАБОТЧИКИ СОБЫТИЙ КНОПОК ДОБАВЛЕНИЯ
// ============================================================================

/**
 * Обработчик кнопки "Добавить компонент" (в заголовке секции).
 * Проверяет, выбран ли просчёт, и вызывает функцию из print_components_inline_edit.js.
 */
function handleAddComponent() {
    console.log('🖨️ Добавление нового компонента');
    if (!currentProschetId) {
        showNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    // Функция print_components_handle_add_component определена в print_components_inline_edit.js
    if (typeof window.print_components_handle_add_component === 'function') {
        window.print_components_handle_add_component();
    } else {
        showNotification('Функция добавления компонента не загружена', 'error');
    }
}

/**
 * Обработчик кнопки "Добавить первый компонент" (показывается, когда компонентов нет).
 * Просто вызывает ту же функцию, что и обычная кнопка добавления.
 */
function handleAddFirstComponent() {
    console.log('🖨️ Добавление первого компонента');
    handleAddComponent();
}

// ============================================================================
// 8. НАБЛЮДЕНИЕ ЗА ИЗМЕНЕНИЯМИ КОЛИЧЕСТВА ЛИСТОВ (MutationObserver)
// ============================================================================

/**
 * Начинает наблюдение за элементом, отображающим количество листов (#vichisliniya-listov-result-value).
 * При изменении текста в этом элементе запускается отложенный пересчёт стоимости компонента.
 * @param {number|string} componentId - ID компонента
 */
function initSheetCountObservation(componentId) {
    console.log(`👁️ Инициализация наблюдения для компонента ${componentId}`);

    // Очищаем предыдущий таймер и останавливаем старый наблюдатель (если есть)
    clearUpdateTimeout();
    stopSheetCountObservation();

    // Находим элемент, который отображает количество листов (создаётся в секции vichisliniya_listov)
    const sheetCountElement = document.getElementById('vichisliniya-listov-result-value');
    if (!sheetCountElement) {
        console.warn('⚠️ Элемент с количеством листов не найден');
        return;
    }

    // Извлекаем начальное значение количества листов
    const sheetCountText = sheetCountElement.textContent.trim();
    const initialSheetCount = parseFloat(sheetCountText);
    if (isNaN(initialSheetCount)) {
        console.warn('⚠️ Не удалось извлечь количество листов:', sheetCountText);
        return;
    }

    console.log(`📊 Начальное количество листов: ${initialSheetCount}`);
    currentSheetCount = initialSheetCount;

    // Создаём MutationObserver для отслеживания изменений текста
    // MutationObserver – встроенный объект браузера, который следит за изменениями в DOM.
    const observerCallback = function(mutations) {
        mutations.forEach(function(mutation) {
            // Нас интересуют изменения текста (characterData) или структуры (childList)
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
                const newText = sheetCountElement.textContent.trim();
                const newSheetCount = parseFloat(newText);
                if (isNaN(newSheetCount)) return;
                if (newSheetCount !== currentSheetCount) {
                    console.log(`🔄 Обнаружено изменение: ${currentSheetCount} → ${newSheetCount}`);
                    currentSheetCount = newSheetCount;
                    // Обновляем отображение в таблице
                    updateSheetCountDisplayForComponent(componentId, newSheetCount);
                    // Если это выбранный компонент – запускаем отложенный пересчёт
                    if (selectedComponentId === componentId) {
                        schedulePriceUpdate(componentId, newSheetCount);
                    }
                }
            }
        });
    };

    // Создаём экземпляр MutationObserver
    sheetCountObserver = new MutationObserver(observerCallback);
    // Начинаем наблюдение за элементом и его дочерними узлами
    sheetCountObserver.observe(sheetCountElement, {
        childList: true,      // Следить за добавлением/удалением дочерних узлов
        characterData: true,  // Следить за изменением текста
        subtree: true         // Следить за всеми потомками
    });
    console.log(`✅ Наблюдение установлено для компонента ${componentId}`);
}

/**
 * Останавливает наблюдение за количеством листов (отключает MutationObserver).
 */
function stopSheetCountObservation() {
    if (sheetCountObserver) {
        sheetCountObserver.disconnect(); // Отключаем наблюдателя
        sheetCountObserver = null;
        console.log('🛑 Наблюдение остановлено');
    }
    clearUpdateTimeout(); // Очищаем таймер
}

/**
 * Очищает таймер отложенного обновления (если он запущен).
 */
function clearUpdateTimeout() {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
    }
}

/**
 * Запускает отложенный пересчёт стоимости компонента (дебаунс).
 * Отправка запроса происходит только после того, как пользователь перестал изменять значение (задержка UPDATE_DELAY).
 * @param {number|string} componentId - ID компонента
 * @param {number} sheetCount - Количество листов
 */
function schedulePriceUpdate(componentId, sheetCount) {
    console.log(`⏰ Запуск отложенного обновления для компонента ${componentId}`);
    // Если компонент уже не выбран – не обновляем
    if (componentId !== selectedComponentId) {
        console.log(`ℹ️ Компонент ${componentId} уже не выбран, пропускаем отложенное обновление`);
        return;
    }
    clearUpdateTimeout(); // Сбрасываем предыдущий таймер
    // Устанавливаем новый таймер
    updateTimeout = setTimeout(() => {
        recalculateComponentPrice(componentId, sheetCount);
    }, UPDATE_DELAY);
}

// ============================================================================
// 9. ОТМЕНА AJAX-ЗАПРОСОВ
// ============================================================================

/**
 * Отменяет текущий AJAX-запрос (если есть) и создаёт новый контроллер.
 * Используется при быстром переключении между просчётами, чтобы отменить старый запрос.
 */
function cancelCurrentRequest() {
    if (abortController) {
        abortController.abort(); // Отменяем предыдущий запрос
        console.log('🛑 Текущий запрос отменён');
    }
    // Создаём новый контроллер для следующего запроса
    abortController = new AbortController();
}

// ============================================================================
// 10. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (CSRF, уведомления)
// ============================================================================

/**
 * Получает CSRF-токен из cookies или meta-тега.
 * CSRF-токен необходим для защиты от межсайтовой подделки запросов (Cross-Site Request Forgery).
 * @returns {string} CSRF-токен
 */
function getCsrfToken() {
    // Сначала пробуем взять из meta-тега (если есть)
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken && metaToken.getAttribute('content')) return metaToken.getAttribute('content');

    // Иначе ищем в cookies
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
 * Показывает всплывающее уведомление в правом верхнем углу экрана.
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип: 'success', 'error', 'warning', 'info'
 */
function showNotification(message, type = 'info') {
    console.log(`💬 Уведомление [${type}]: ${message}`);
    const notification = document.createElement('div');
    let backgroundColor = '#2196F3'; // синий по умолчанию
    let icon = 'ℹ️';
    if (type === 'success') { backgroundColor = '#4CAF50'; icon = '✅'; }
    else if (type === 'error') { backgroundColor = '#F44336'; icon = '❌'; }
    else if (type === 'warning') { backgroundColor = '#FF9800'; icon = '⚠️'; }

    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 12px 20px;
        background: ${backgroundColor}; color: white; border-radius: 4px;
        z-index: 10000; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        max-width: 300px; transition: opacity 0.3s; opacity: 0;
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
// 11. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА (показать/скрыть сообщения)
// ============================================================================

/**
 * Показывает сообщение "Выберите просчёт" и скрывает всё остальное.
 * Вызывается при загрузке страницы и при сбросе выбора просчёта.
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
    if (elements.title) elements.title.innerHTML = `<span class="placeholder-text">(просчёт не выбран)</span>`;

    // Сбрасываем все глобальные переменные
    currentProschetId = null;
    currentComponents = [];
    selectedComponentId = null;
    currentSheetCount = null;
    cancelCurrentRequest();
    stopSheetCountObservation();
    clearUpdateTimeout();
}

/**
 * Показывает сообщение "Нет компонентов" (когда просчёт выбран, но компонентов нет).
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
 * Показывает таблицу компонентов (скрывает сообщения пустого состояния).
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
 * Показывает индикатор загрузки в таблице (спиннер).
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
    if (elements.container) elements.container.style.display = 'block';
    if (elements.tableBody) {
        elements.tableBody.innerHTML = `
            <tr><td colspan="12" style="text-align: center; padding: 40px;">
                <div class="loading-spinner"></div>
                <p>Загрузка компонентов печати...</p>
                <p class="loading-note">Используется "Количество листов" из секции "Вычисления листов"</p>
            </td>
            </tr>
        `;
    }
}

/**
 * Показывает сообщение об ошибке загрузки.
 * @param {string} message - Текст ошибки
 */
function showErrorMessage(message) {
    console.log(`❌ Показ ошибки: ${message}`);
    const tableBody = document.getElementById('print-components-table-body');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr><td colspan="12" style="text-align: center; padding: 40px; color: #e74c3c;">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <p>${message}</p>
            </td></tr>
        `;
    }
}

/**
 * Скрывает все сообщения (пустого состояния) – используется перед показом таблицы.
 */
function hideAllMessages() {
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
 * Показывает или скрывает кнопку "Добавить компонент" в заголовке секции.
 * @param {boolean} show - true – показать, false – скрыть
 */
function showAddButton(show) {
    const addButton = document.getElementById('add-print-component-btn');
    if (addButton) addButton.style.display = show ? 'inline-block' : 'none';
}

/**
 * Обновляет заголовок секции (отображает название выбранного просчёта).
 * @param {HTMLElement} rowElement - Строка таблицы просчётов, содержащая название
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
    proschetTitleElement.innerHTML = `<span class="proschet-title-active">${proschetTitle}</span>`;
    console.log(`✅ Заголовок обновлён: "${proschetTitle}"`);
}

/**
 * Полностью сбрасывает секцию (при отмене выбора просчёта).
 */
function resetSection() {
    console.log('🔄 Сброс секции "Печатные компоненты"');
    deselectCurrentComponent();       // Снимаем выделение с компонента
    currentProschetId = null;          // Сбрасываем ID просчёта
    currentComponents = [];            // Очищаем массив компонентов
    showNoProschetSelectedMessage();   // Показываем сообщение "Выберите просчёт"
    cancelCurrentRequest();            // Отменяем все запросы
    stopSheetCountObservation();       // Останавливаем наблюдение
    clearUpdateTimeout();              // Очищаем таймер
    console.log('✅ Секция сброшена');
}

// ============================================================================
// 12. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ИСПОЛЬЗОВАНИЯ В ДРУГИХ МОДУЛЯХ
// ============================================================================

// Делаем объект printComponentsSection доступным глобально (через window).
// Другие скрипты (например, print_components_inline_edit.js) могут вызывать его методы.
window.printComponentsSection = {
    updateForProschet: updateForProschet,
    reset: resetSection,
    getCurrentProschetId: () => currentProschetId,
    getCurrentComponents: () => currentComponents,
    getSelectedComponentId: () => selectedComponentId,
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
    dispatchUpdateEvent: dispatchPrintComponentsUpdated,
    isReady: () => true
};

// ============================================================================
// 13. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ DOM
// ============================================================================

// DOMContentLoaded – событие, которое срабатывает, когда HTML-документ полностью загружен и разобран.
document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 DOM загружен, инициализация секции "Печатные компоненты"...');
    initPrintComponents(); // Запускаем инициализацию
    console.log('✅ Секция "Печатные компоненты" готова к работе');
});