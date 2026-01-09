// calculator/static/calculator/js/circulation_change_handler.js

/**
 * Обработчик изменения тиража просчёта.
 * Отслеживает изменения тиража в секции "Изделие" и пересчитывает цены компонентов печати.
 */

"use strict";

// Глобальные переменные
let circulationChangeHandlerInitialized = false;
let currentProschetIdForCirculation = null;
let lastKnownCirculation = null;

/**
 * Инициализирует обработчик изменения тиража.
 * Должна быть вызвана после загрузки DOM и выбора просчёта.
 */
function initCirculationChangeHandler(proschetId, initialCirculation) {
    console.log(`🔄 Инициализация обработчика изменения тиража для просчёта ID: ${proschetId}`);
    
    if (circulationChangeHandlerInitialized) {
        console.log('⚠️ Обработчик уже инициализирован');
        return;
    }
    
    // Сохраняем ID текущего просчёта и начальный тираж
    currentProschetIdForCirculation = proschetId;
    lastKnownCirculation = initialCirculation;
    
    // Находим поле отображения тиража в секции "Изделие"
    const circulationDisplayElement = document.getElementById('product-circulation-display');
    const circulationInputElement = document.getElementById('product-circulation-input');
    
    if (!circulationDisplayElement) {
        console.error('❌ Элемент #product-circulation-display не найден');
        return;
    }
    
    console.log('✅ Найден элемент отображения тиража:', circulationDisplayElement);
    
    // 1. Настраиваем наблюдение за изменениями в элементе отображения тиража
    setupCirculationDisplayObserver(circulationDisplayElement);
    
    // 2. Настраиваем обработчик inline-редактирования тиража
    setupCirculationInlineEditHandler(circulationDisplayElement, circulationInputElement);
    
    // 3. Настраиваем обработчик изменения тиража через другие интерфейсы
    setupOtherCirculationChangeHandlers();
    
    circulationChangeHandlerInitialized = true;
    console.log('✅ Обработчик изменения тиража инициализирован');
}

/**
 * Настраивает MutationObserver для отслеживания изменений в элементе отображения тиража.
 * @param {HTMLElement} circulationDisplayElement - Элемент отображения тиража
 */
function setupCirculationDisplayObserver(circulationDisplayElement) {
    console.log('🔍 Настройка наблюдения за элементом тиража');
    
    // Создаем наблюдатель за изменениями в DOM
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            // Проверяем, изменился ли текст элемента
            if (mutation.type === 'characterData' || mutation.type === 'childList') {
                const newCirculationText = circulationDisplayElement.textContent.trim();
                console.log(`📝 Обнаружено изменение тиража: ${newCirculationText}`);
                
                // Извлекаем числовое значение из текста
                const newCirculation = extractCirculationFromText(newCirculationText);
                
                if (newCirculation && newCirculation !== lastKnownCirculation) {
                    console.log(`🔄 Тираж изменился: ${lastKnownCirculation} → ${newCirculation}`);
                    handleCirculationChange(newCirculation);
                    lastKnownCirculation = newCirculation;
                }
            }
        });
    });
    
    // Начинаем наблюдение за изменениями текста в элементе
    observer.observe(circulationDisplayElement, {
        childList: true,          // Отслеживаем добавление/удаление дочерних элементов
        characterData: true,      // Отслеживаем изменения текста
        subtree: true             // Отслеживаем изменения во всех потомках
    });
    
    console.log('✅ Наблюдение за элементом тиража настроено');
}

/**
 * Настраивает обработчик для inline-редактирования тиража.
 * @param {HTMLElement} displayElement - Элемент отображения тиража
 * @param {HTMLElement} inputElement - Элемент ввода тиража (если есть)
 */
function setupCirculationInlineEditHandler(displayElement, inputElement) {
    console.log('✏️ Настройка обработчика inline-редактирования тиража');
    
    // Если есть элемент ввода (для inline-редактирования)
    if (inputElement) {
        // Обработчик завершения редактирования (например, при нажатии Enter)
        inputElement.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                console.log('⏎ Нажата клавиша Enter в поле ввода тиража');
                
                // Ждём немного, чтобы дать время на сохранение значения
                setTimeout(() => {
                    const newText = displayElement.textContent.trim();
                    const newCirculation = extractCirculationFromText(newText);
                    
                    if (newCirculation && newCirculation !== lastKnownCirculation) {
                        console.log(`🔄 Тираж изменён через inline-редактирование: ${newCirculation}`);
                        handleCirculationChange(newCirculation);
                        lastKnownCirculation = newCirculation;
                    }
                }, 300);
            }
        });
        
        // Обработчик потери фокуса
        inputElement.addEventListener('blur', function() {
            console.log('👁️ Поле ввода тиража потеряло фокус');
            
            // Ждём немного, чтобы дать время на сохранение значения
            setTimeout(() => {
                const newText = displayElement.textContent.trim();
                const newCirculation = extractCirculationFromText(newText);
                
                if (newCirculation && newCirculation !== lastKnownCirculation) {
                    console.log(`🔄 Тираж изменён (потеря фокуса): ${newCirculation}`);
                    handleCirculationChange(newCirculation);
                    lastKnownCirculation = newCirculation;
                }
            }, 300);
        });
    }
    
    console.log('✅ Обработчик inline-редактирования тиража настроен');
}

/**
 * Настраивает другие обработчики изменения тиража.
 * Например, через AJAX-запросы или другие элементы интерфейса.
 */
function setupOtherCirculationChangeHandlers() {
    console.log('🔧 Настройка других обработчиков изменения тиража');
    
    // 1. Обработчик для AJAX-ответов, которые могут содержать обновлённый тираж
    document.addEventListener('ajaxComplete', function(event) {
        // Проверяем, относится ли запрос к обновлению тиража
        if (event.detail.url && event.detail.url.includes('update-proschet-circulation')) {
            console.log('📡 Обнаружен AJAX-запрос обновления тиража');
            
            // Ждём немного, чтобы DOM обновился
            setTimeout(() => {
                const circulationDisplayElement = document.getElementById('product-circulation-display');
                if (circulationDisplayElement) {
                    const newText = circulationDisplayElement.textContent.trim();
                    const newCirculation = extractCirculationFromText(newText);
                    
                    if (newCirculation && newCirculation !== lastKnownCirculation) {
                        console.log(`🔄 Тираж изменён через AJAX: ${newCirculation}`);
                        handleCirculationChange(newCirculation);
                        lastKnownCirculation = newCirculation;
                    }
                }
            }, 500);
        }
    });
    
    // 2. Создаём пользовательское событие для изменения тиража
    // (может быть вызвано из других скриптов)
    window.addEventListener('circulationChanged', function(event) {
        if (event.detail && event.detail.circulation) {
            const newCirculation = parseInt(event.detail.circulation);
            
            if (!isNaN(newCirculation) && newCirculation !== lastKnownCirculation) {
                console.log(`🔄 Тираж изменён через пользовательское событие: ${newCirculation}`);
                handleCirculationChange(newCirculation);
                lastKnownCirculation = newCirculation;
            }
        }
    });
    
    console.log('✅ Другие обработчики изменения тиража настроены');
}

/**
 * Извлекает числовое значение тиража из текста.
 * @param {string} text - Текст, содержащий тираж (например: "1 000 шт." или "1000")
 * @returns {number|null} Числовое значение тиража или null, если не удалось извлечь
 */
function extractCirculationFromText(text) {
    if (!text) return null;
    
    try {
        // Проверяем, не является ли текст "Не указан" или подобным
        if (text.toLowerCase().includes('не указан') || text.trim() === '') {
            console.log('📊 Текст тиража: "Не указан", возвращаем null');
            return null;
        }
        
        // Удаляем все нецифровые символы, кроме пробелов и точек/запятых
        let cleanedText = text.replace(/[^\d\s.,]/g, '');
        
        // Заменяем запятые на точки для десятичных чисел
        cleanedText = cleanedText.replace(',', '.');
        
        // Удаляем пробелы (разделители тысяч)
        cleanedText = cleanedText.replace(/\s/g, '');
        
        // Извлекаем первое число
        const match = cleanedText.match(/\d+/);
        
        if (!match) {
            console.warn(`⚠️ Не удалось найти числа в тексте: "${text}"`);
            return null;
        }
        
        const circulation = parseInt(match[0], 10);
        
        if (isNaN(circulation)) {
            console.warn(`❌ Не удалось преобразовать в число: "${match[0]}"`);
            return null;
        }
        
        if (circulation <= 0) {
            console.warn(`⚠️ Тираж должен быть положительным: ${circulation}`);
            return null;
        }
        
        console.log(`✅ Извлечён тираж: ${circulation} шт. из текста: "${text}"`);
        return circulation;
        
    } catch (error) {
        console.error(`❌ Ошибка при извлечении тиража из "${text}":`, error);
        return null;
    }
}

/**
 * Обрабатывает изменение тиража.
 * @param {number} newCirculation - Новое значение тиража
 */
function handleCirculationChange(newCirculation) {
    console.log(`🔄 Обработка изменения тиража на ${newCirculation} шт.`);
    
    // Проверяем, выбран ли просчёт
    if (!currentProschetIdForCirculation) {
        console.warn('⚠️ Просчёт не выбран, пересчёт компонентов невозможен');
        showNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    
    // Проверяем, есть ли компоненты для пересчёта
    const printComponentsSection = window.printComponentsSection;
    if (!printComponentsSection || !printComponentsSection.getCurrentComponents) {
        console.warn('⚠️ Секция печатных компонентов не загружена');
        return;
    }
    
    const currentComponents = printComponentsSection.getCurrentComponents();
    if (!currentComponents || currentComponents.length === 0) {
        console.log('ℹ️ Нет компонентов печати для пересчёта');
        return;
    }
    
    // Показываем уведомление о начале пересчёта
    showNotification(`Пересчёт цен для тиража ${newCirculation} шт....`, 'info');
    
    // Отправляем запрос на сервер для пересчёта компонентов
    recalculatePrintComponentsForCirculation(currentProschetIdForCirculation, newCirculation);
}

/**
 * Отправляет запрос на сервер для пересчёта компонентов печати.
 * @param {number} proschetId - ID просчёта
 * @param {number} circulation - Новый тираж
 */
function recalculatePrintComponentsForCirculation(proschetId, circulation) {
    console.log(`📤 Отправка запроса пересчёта компонентов: просчёт=${proschetId}, тираж=${circulation}`);
    
    // Формируем данные для отправки
    const formData = new FormData();
    formData.append('circulation', circulation);
    formData.append('csrfmiddlewaretoken', getCsrfToken());
    
    // Отправляем POST-запрос на сервер
    fetch(`/calculator/recalculate-components/${proschetId}/`, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('📥 Получен ответ от сервера:', data);
        
        if (data.success) {
            // Успешный пересчёт
            
            // 1. Обновляем данные в секции печатных компонентов
            if (window.printComponentsSection && window.printComponentsSection.updateForProschet) {
                // Находим выбранную строку просчёта
                const selectedProschetRow = document.querySelector('.proschet-row.selected');
                if (selectedProschetRow) {
                    // Обновляем секцию с новыми данными компонентов
                    window.printComponentsSection.updateForProschet(proschetId, selectedProschetRow);
                }
            }
            
            // 2. Показываем уведомление об успехе
            showNotification(data.message || 'Цены компонентов успешно пересчитаны', 'success');
            
            console.log(`✅ Пересчёт завершён. Обновлено ${data.updated_count || 0} компонентов`);
        } else {
            // Ошибка пересчёта
            console.error('❌ Ошибка пересчёта компонентов:', data.message);
            showNotification(`Ошибка пересчёта: ${data.message}`, 'error');
        }
    })
    .catch(error => {
        // Ошибка сети или сервера
        console.error('❌ Ошибка при отправке запроса пересчёта:', error);
        showNotification('Ошибка сети при пересчёте компонентов', 'error');
    });
}

/**
 * Получает CSRF-токен из cookies.
 * @returns {string} CSRF-токен
 */
function getCsrfToken() {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith('csrftoken=')) {
            return decodeURIComponent(cookie.substring('csrftoken='.length));
        }
    }
    console.warn('⚠️ CSRF-токен не найден');
    return '';
}

/**
 * Показывает уведомление на странице.
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип сообщения: 'success', 'error', 'warning', 'info'
 */
function showNotification(message, type = 'info') {
    console.log(`💬 Уведомление [${type}]: ${message}`);
    
    // Создаём элемент уведомления
    const notification = document.createElement('div');
    
    // Определяем цвет в зависимости от типа
    let backgroundColor = '#2196F3'; // Синий по умолчанию (info)
    let icon = 'ℹ️';
    
    if (type === 'success') {
        backgroundColor = '#4CAF50'; // Зелёный
        icon = '✅';
    } else if (type === 'error') {
        backgroundColor = '#F44336'; // Красный
        icon = '❌';
    } else if (type === 'warning') {
        backgroundColor = '#FF9800'; // Оранжевый
        icon = '⚠️';
    }
    
    // Настраиваем стили уведомления
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
    
    // Показываем уведомление с анимацией
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);
    
    // Скрываем и удаляем уведомление через 5 секунд
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

/**
 * Сбрасывает обработчик (при смене просчёта).
 */
function resetCirculationChangeHandler() {
    console.log('🔄 Сброс обработчика изменения тиража');
    circulationChangeHandlerInitialized = false;
    currentProschetIdForCirculation = null;
    lastKnownCirculation = null;
}

// Экспортируем функции для использования в других файлах
window.circulationChangeHandler = {
    init: initCirculationChangeHandler,
    reset: resetCirculationChangeHandler,
    handleChange: handleCirculationChange
};

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 Модуль обработки изменения тиража загружен');
    
    // Проверяем, есть ли уже выбранный просчёт при загрузке страницы
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