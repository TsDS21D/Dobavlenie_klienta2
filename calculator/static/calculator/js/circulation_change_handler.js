// calculator/static/calculator/js/circulation_change_handler.js

/**
 * Обработчик изменения тиража просчёта.
 * 
 * ИСПРАВЛЕНИЯ (03.04.2026):
 * - Убрана дублирующая отправка запроса на пересчёт компонентов из MutationObserver.
 *   Теперь MutationObserver только обновляет внутреннюю переменную lastKnownCirculation,
 *   но НЕ вызывает handleCirculationChange (чтобы избежать двойного пересчёта).
 * - Запрос на пересчёт компонентов выполняется ТОЛЬКО из product.js после успешного
 *   сохранения тиража на сервере (событие productCirculationSaved).
 * - Добавлена функция updateProschetId для обновления ID просчёта при выборе нового просчёта.
 * - Добавлена защита от повторной инициализации.
 * - Добавлены подробные комментарии для каждой строки.
 * 
 * Основная задача: отслеживать изменения тиража в DOM-элементе #product-circulation-display
 * и синхронизировать переменную lastKnownCirculation, но НЕ инициировать пересчёт.
 * Пересчёт запускается только после подтверждения сервера.
 */

"use strict";

// ============================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================================================

// Флаг, инициализирован ли обработчик (чтобы не создавать дубликаты)
let circulationChangeHandlerInitialized = false;

// ID текущего выбранного просчёта (число или null)
let currentProschetIdForCirculation = null;

// Последнее известное значение тиража (используется для сравнения изменений)
let lastKnownCirculation = null;

// MutationObserver для отслеживания изменений текста в элементе отображения тиража
let circulationObserver = null;

// ============================================================================
// 2. ОСНОВНЫЕ ФУНКЦИИ УПРАВЛЕНИЯ
// ============================================================================

/**
 * Обновляет ID просчёта и переинициализирует обработчик.
 * Вызывается при выборе нового просчёта из секции "Список просчётов".
 * 
 * @param {number} proschetId - ID просчёта
 * @param {number} initialCirculation - Текущий тираж просчёта (число)
 */
function updateProschetIdForCirculation(proschetId, initialCirculation) {
    console.log(`🔄 Обновление ID просчёта для обработчика тиража: ${proschetId}, тираж=${initialCirculation}`);
    
    // Если уже был инициализирован для другого просчёта, сбрасываем всё состояние
    if (circulationChangeHandlerInitialized && currentProschetIdForCirculation !== proschetId) {
        resetCirculationChangeHandler();
    }
    
    // Инициализируем заново для нового просчёта
    initCirculationChangeHandler(proschetId, initialCirculation);
}

/**
 * Инициализирует обработчик изменения тиража для указанного просчёта.
 * Настраивает наблюдение за элементом отображения тиража и обработчики событий.
 * 
 * @param {number} proschetId - ID просчёта
 * @param {number} initialCirculation - Начальное значение тиража
 */
function initCirculationChangeHandler(proschetId, initialCirculation) {
    console.log(`🔄 Инициализация обработчика изменения тиража для просчёта ID: ${proschetId}`);
    
    // ===== ПРОВЕРКА: если ID не передан, выходим =====
    if (!proschetId) {
        console.warn('⚠️ Не указан ID просчёта, инициализация отменена');
        return;
    }
    
    // Если уже инициализирован для этого же просчёта, не пересоздаём
    if (circulationChangeHandlerInitialized && currentProschetIdForCirculation === proschetId) {
        console.log('ℹ️ Обработчик уже инициализирован для этого просчёта');
        return;
    }
    
    // Сбрасываем предыдущее состояние (если было)
    resetCirculationChangeHandler();
    
    // Сохраняем ID текущего просчёта и начальный тираж
    currentProschetIdForCirculation = proschetId;
    lastKnownCirculation = initialCirculation;
    
    // Находим DOM-элементы для работы с тиражом
    const circulationDisplayElement = document.getElementById('product-circulation-display');
    const circulationInputElement = document.getElementById('product-circulation-input');
    
    if (!circulationDisplayElement) {
        console.error('❌ Элемент #product-circulation-display не найден в DOM!');
        return;
    }
    
    console.log('✅ Найден элемент отображения тиража:', circulationDisplayElement);
    
    // Настраиваем наблюдение за изменениями в элементе отображения тиража
    setupCirculationDisplayObserver(circulationDisplayElement);
    
    // Настраиваем обработчик inline-редактирования тиража (для синхронизации lastKnownCirculation)
    setupCirculationInlineEditHandler(circulationDisplayElement, circulationInputElement);
    
    // Настраиваем другие обработчики изменения тиража (пользовательские события)
    setupOtherCirculationChangeHandlers();
    
    circulationChangeHandlerInitialized = true;
    console.log('✅ Обработчик изменения тиража инициализирован');
}

// ============================================================================
// 3. НАСТРОЙКА НАБЛЮДАТЕЛЯ ЗА ИЗМЕНЕНИЯМИ ТИРАЖА
// ============================================================================

/**
 * Настраивает MutationObserver для отслеживания изменений текста в элементе отображения тиража.
 * ВАЖНО: Наблюдатель только обновляет переменную lastKnownCirculation, но НЕ вызывает
 * пересчёт компонентов. Пересчёт запускается только после подтверждения сервера.
 * 
 * @param {HTMLElement} circulationDisplayElement - DOM-элемент, содержащий текст тиража
 */
function setupCirculationDisplayObserver(circulationDisplayElement) {
    console.log('🔍 Настройка наблюдения за элементом тиража');
    
    // Если уже есть активный наблюдатель, отключаем его (чтобы не было дублирования)
    if (circulationObserver) {
        circulationObserver.disconnect();
        circulationObserver = null;
    }
    
    // Создаём новый MutationObserver
    circulationObserver = new MutationObserver(function(mutations) {
        // Перебираем все произошедшие мутации (изменения в DOM)
        mutations.forEach(function(mutation) {
            // Нас интересуют изменения текста (characterData) и структуры (childList)
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
                // Получаем новый текст из элемента
                const newCirculationText = circulationDisplayElement.textContent.trim();
                console.log(`📝 Обнаружено изменение тиража в DOM: ${newCirculationText}`);
                
                // Извлекаем числовое значение тиража из текста
                const newCirculation = extractCirculationFromText(newCirculationText);
                
                // Если тираж изменился и не равен предыдущему значению
                if (newCirculation && newCirculation !== lastKnownCirculation) {
                    console.log(`🔄 Тираж изменился в DOM: ${lastKnownCirculation} → ${newCirculation}`);
                    
                    // ===== ВАЖНОЕ ИСПРАВЛЕНИЕ =====
                    // Раньше здесь вызывался handleCirculationChange, который отправлял запрос на пересчёт.
                    // Это приводило к дублированию, так как запрос уже отправляется из product.js
                    // после успешного сохранения тиража на сервере.
                    // Теперь мы ТОЛЬКО обновляем переменную lastKnownCirculation,
                    // а пересчёт запускается по событию productCirculationSaved.
                    lastKnownCirculation = newCirculation;
                }
            }
        });
    });
    
    // Запускаем наблюдение за элементом
    circulationObserver.observe(circulationDisplayElement, {
        childList: true,      // Отслеживаем добавление/удаление дочерних узлов
        characterData: true,  // Отслеживаем изменение текста
        subtree: true         // Отслеживаем изменения во всех потомках
    });
    
    console.log('✅ Наблюдение за элементом тиража настроено (только синхронизация, без пересчёта)');
}

// ============================================================================
// 4. НАСТРОЙКА ОБРАБОТЧИКОВ INLINE-РЕДАКТИРОВАНИЯ
// ============================================================================

/**
 * Настраивает обработчики событий для поля ввода тиража (inline-редактирование).
 * Эти обработчики нужны для синхронизации lastKnownCirculation после редактирования,
 * но НЕ для отправки запросов на пересчёт.
 * 
 * @param {HTMLElement} displayElement - Элемент отображения тиража (span)
 * @param {HTMLElement} inputElement - Элемент ввода тиража (input)
 */
function setupCirculationInlineEditHandler(displayElement, inputElement) {
    console.log('✏️ Настройка обработчика inline-редактирования тиража');
    
    // Если элемент ввода существует (он скрыт по умолчанию, появляется при редактировании)
    if (inputElement) {
        // Обработчик нажатия клавиши Enter в поле ввода
        inputElement.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                console.log('⏎ Нажата клавиша Enter в поле ввода тиража');
                // Даём небольшую задержку, чтобы значение успело сохраниться в displayElement
                setTimeout(() => {
                    const newText = displayElement.textContent.trim();
                    const newCirculation = extractCirculationFromText(newText);
                    if (newCirculation && newCirculation !== lastKnownCirculation) {
                        console.log(`🔄 Тираж изменён через inline-редактирование: ${newCirculation}`);
                        // Обновляем только переменную, запрос на пересчёт отправит product.js
                        lastKnownCirculation = newCirculation;
                    }
                }, 300);
            }
        });
        
        // Обработчик потери фокуса (blur) – когда пользователь кликнул вне поля ввода
        inputElement.addEventListener('blur', function() {
            console.log('👁️ Поле ввода тиража потеряло фокус');
            setTimeout(() => {
                const newText = displayElement.textContent.trim();
                const newCirculation = extractCirculationFromText(newText);
                if (newCirculation && newCirculation !== lastKnownCirculation) {
                    console.log(`🔄 Тираж изменён (потеря фокуса): ${newCirculation}`);
                    // Обновляем только переменную, запрос на пересчёт отправит product.js
                    lastKnownCirculation = newCirculation;
                }
            }, 300);
        });
    }
    
    console.log('✅ Обработчик inline-редактирования тиража настроен (только синхронизация)');
}

// ============================================================================
// 5. НАСТРОЙКА ДРУГИХ ОБРАБОТЧИКОВ (СОБЫТИЯ)
// ============================================================================

/**
 * Настраивает обработчики пользовательских событий, которые могут изменить тираж.
 * Например, событие productCirculationSaved, генерируемое секцией "Изделие"
 * после успешного сохранения тиража на сервере.
 * 
 * Только это событие теперь запускает пересчёт компонентов.
 */
function setupOtherCirculationChangeHandlers() {
    console.log('🔧 Настройка других обработчиков изменения тиража');
    
    // Слушаем событие productCirculationSaved (генерируется в product.js после сохранения на сервере)
    // Это единственное место, где должен запускаться пересчёт компонентов.
    document.addEventListener('productCirculationSaved', function(event) {
        if (event.detail && event.detail.proschetId == currentProschetIdForCirculation) {
            const newCirculation = event.detail.circulation;
            console.log(`📥 Событие productCirculationSaved: тираж ${newCirculation}`);
            lastKnownCirculation = newCirculation;
            // Пересчёт выполняется в print_components.js, здесь только синхронизация
        }
    });
    
    // Старое событие circulationChanged оставляем для обратной совместимости,
    // но оно НЕ запускает пересчёт (только синхронизирует переменную)
    window.addEventListener('circulationChanged', function(event) {
        if (event.detail && event.detail.circulation && event.detail.proschetId == currentProschetIdForCirculation) {
            const newCirculation = parseInt(event.detail.circulation, 10);
            if (!isNaN(newCirculation) && newCirculation !== lastKnownCirculation) {
                console.log(`🔄 Тираж изменён через событие circulationChanged: ${newCirculation}`);
                // Только синхронизируем переменную, пересчёт не запускаем
                lastKnownCirculation = newCirculation;
            }
        }
    });
    
    console.log('✅ Другие обработчики изменения тиража настроены');
}

// ============================================================================
// 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Извлекает числовое значение тиража из текстовой строки.
 * Поддерживает форматирование с пробелами (разделители тысяч).
 * 
 * @param {string} text - Текст, содержащий тираж (например: "1 000 шт." или "1000")
 * @returns {number|null} Числовое значение тиража или null, если не удалось извлечь
 */
function extractCirculationFromText(text) {
    // Если текст пустой или содержит "Не указан" – возвращаем null
    if (!text) return null;
    if (text.toLowerCase().includes('не указан') || text.trim() === '') return null;
    
    try {
        // Удаляем все символы, кроме цифр, пробелов, точек и запятых
        let cleanedText = text.replace(/[^\d\s.,]/g, '');
        // Заменяем запятую на точку (для возможных десятичных дробей, хотя тираж целый)
        cleanedText = cleanedText.replace(',', '.');
        // Удаляем пробелы (разделители тысяч)
        cleanedText = cleanedText.replace(/\s/g, '');
        // Ищем первое число в строке
        const match = cleanedText.match(/\d+/);
        if (!match) return null;
        // Преобразуем в целое число
        const circulation = parseInt(match[0], 10);
        // Проверяем, что число положительное
        if (isNaN(circulation) || circulation <= 0) return null;
        return circulation;
    } catch (error) {
        console.error(`❌ Ошибка при извлечении тиража из "${text}":`, error);
        return null;
    }
}

// ============================================================================
// 7. ОСНОВНАЯ ЛОГИКА ОБРАБОТКИ ИЗМЕНЕНИЯ ТИРАЖА (ТОЛЬКО ПЕРЕСЧЁТ)
// ============================================================================



// ============================================================================
// 8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (CSRF, УВЕДОМЛЕНИЯ, СБРОС)
// ============================================================================

/**
 * Получает CSRF-токен из cookies.
 * @returns {string} CSRF-токен или пустая строка
 */
function getCsrfToken() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const trimmed = cookie.trim();
        if (trimmed.startsWith('csrftoken=')) {
            return decodeURIComponent(trimmed.substring('csrftoken='.length));
        }
    }
    console.warn('⚠️ CSRF-токен не найден');
    return '';
}

/**
 * Показывает всплывающее уведомление на странице.
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип: 'success', 'error', 'warning', 'info'
 */
function showNotification(message, type = 'info') {
    console.log(`💬 Уведомление [${type}]: ${message}`);
    const notification = document.createElement('div');
    
    let backgroundColor = '#2196F3'; // синий по умолчанию (info)
    if (type === 'success') backgroundColor = '#4CAF50';
    else if (type === 'error') backgroundColor = '#F44336';
    else if (type === 'warning') backgroundColor = '#FF9800';
    
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        padding: 12px 20px; background: ${backgroundColor};
        color: white; border-radius: 4px; z-index: 10000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        max-width: 300px; transition: opacity 0.3s; opacity: 0;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Анимация появления
    setTimeout(() => notification.style.opacity = '1', 10);
    
    // Автоматическое скрытие через 5 секунд
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

/**
 * Сбрасывает состояние обработчика (при смене просчёта или перезагрузке).
 * Отключает MutationObserver и очищает переменные.
 */
function resetCirculationChangeHandler() {
    console.log('🔄 Сброс обработчика изменения тиража');
    if (circulationObserver) {
        circulationObserver.disconnect();
        circulationObserver = null;
    }
    circulationChangeHandlerInitialized = false;
    currentProschetIdForCirculation = null;
    lastKnownCirculation = null;
}

// ============================================================================
// 9. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ
// ============================================================================

// Делаем объект доступным глобально, чтобы другие секции могли вызывать его методы
window.circulationChangeHandler = {
    init: initCirculationChangeHandler,                     // Инициализация
    reset: resetCirculationChangeHandler,                   // Сброс
    updateProschetId: updateProschetIdForCirculation        // Обновление ID просчёта
};

// ============================================================================
// 10. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ (если уже выбран просчёт)
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 Модуль обработки изменения тиража загружен');
    
    // Даём небольшую задержку, чтобы DOM полностью сформировался и все секции инициализировались
    setTimeout(() => {
        const selectedProschetRow = document.querySelector('.proschet-row.selected');
        if (selectedProschetRow) {
            const proschetId = selectedProschetRow.dataset.proschetId;
            const circulationElement = document.getElementById('product-circulation-display');
            if (proschetId && circulationElement) {
                const initialCirculation = extractCirculationFromText(circulationElement.textContent);
                if (initialCirculation) {
                    initCirculationChangeHandler(proschetId, initialCirculation);
                }
            }
        }
    }, 1000);
});