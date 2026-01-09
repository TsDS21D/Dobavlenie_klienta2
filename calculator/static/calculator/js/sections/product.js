/*
calculator/static/calculator/js/sections/product.js
JavaScript для секции "Изделие"
ДОБАВЛЕНО: Генерация событий при изменении тиража для автоматической синхронизации с печатными компонентами
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ С ПРЕФИКСОМ product =====

// ID выбранного просчёта (для связи с секцией list_proschet)
let productSelectedProschetId = null;

// ID просчёта, который редактируется (может отличаться от выбранного!)
let productEditingProschetId = null;

// Текущее значение тиража
let productCurrentCirculation = null;

// Флаг активного редактирования тиража
let productIsEditingCirculation = false;

// URL для обновления тиража на сервере
const productUpdateCirculationUrl = '/calculator/update-proschet-circulation/';

// Флаг, указывающий что секция "Изделие" полностью обновлена
let productSectionReady = false;

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Изделие" загружена с поддержкой событий для синхронизации тиража');
    
    // Настраиваем обработчики событий для секции
    setupProductEventListeners();
    
    // Инициализируем секцию (скрываем параметры по умолчанию)
    initProductSection();
});

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====

function setupProductEventListeners() {
    console.log('Настраиваем обработчики событий для секции "Изделие"...');
    
    // 1. Обработчик двойного клика по значению тиража
    const circulationDisplay = document.getElementById('product-circulation-display');
    if (circulationDisplay) {
        circulationDisplay.addEventListener('dblclick', handleProductCirculationDblClick);
    }
    
    // 2. Обработчики для поля ввода тиража
    const circulationInput = document.getElementById('product-circulation-input');
    if (circulationInput) {
        // Сохранение при потере фокуса
        circulationInput.addEventListener('blur', handleProductCirculationInputBlur);
        
        // Сохранение при нажатии Enter
        circulationInput.addEventListener('keydown', handleProductCirculationInputKeyDown);
        
        // Отмена при нажатии Escape
        circulationInput.addEventListener('keydown', handleProductCirculationInputEscape);
    }
    
    console.log('✅ Обработчики событий для секции "Изделие" настроены');
}

// ===== 4. ФУНКЦИИ ДЛЯ ИНИЦИАЛИЗАЦИИ СЕКЦИИ =====

function initProductSection() {
    console.log('Инициализация секции "Изделие"...');
    
    // По умолчанию показываем заглушку, скрываем параметры
    const paramsContainer = document.getElementById('product-params-container');
    const placeholder = document.getElementById('product-placeholder');
    
    if (paramsContainer) paramsContainer.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    
    // Сбрасываем состояние секции
    productResetSection();
    
    console.log('✅ Секция "Изделие" инициализирована (режим заглушки)');
}

/**
 * Полностью сбрасывает состояние секции "Изделие"
 */
function productResetSection() {
    console.log('Сброс состояния секции "Изделие"');
    
    // Сбрасываем ID выбранного просчёта
    productSelectedProschetId = null;
    productEditingProschetId = null;
    
    // Сбрасываем текущее значение тиража
    productCurrentCirculation = null;
    
    // Сбрасываем флаг редактирования
    productIsEditingCirculation = false;
    
    // Сбрасываем флаг готовности
    productSectionReady = false;
    
    // Сбрасываем отображение тиража
    const circulationDisplay = document.getElementById('product-circulation-display');
    if (circulationDisplay) {
        circulationDisplay.textContent = 'Не указан';
        circulationDisplay.dataset.originalValue = '';
        circulationDisplay.dataset.proschetId = '';
        circulationDisplay.classList.remove('editing');
    }
    
    // Сбрасываем поле ввода
    const circulationInput = document.getElementById('product-circulation-input');
    if (circulationInput) {
        circulationInput.value = '';
        circulationInput.style.display = 'none';
    }
    
    // Сбрасываем заголовок просчёта
    const titleElement = document.getElementById('product-proschet-title');
    if (titleElement) {
        titleElement.innerHTML = '<span class="placeholder-text">(просчёт не выбран)</span>';
    }
    
    console.log('✅ Состояние секции "Изделие" сброшено');
}

// ===== 5. ФУНКЦИИ ДЛЯ ОБНОВЛЕНИЯ ДАННЫХ ИЗ ПРОСЧЁТА =====

/**
 * Обновляет данные в секции "Изделие" при выборе просчёта
 * @param {Object} proschetData - Данные просчёта
 * @param {Function} callback - Функция обратного вызова, вызываемая после полного обновления
 */
function productUpdateFromProschet(proschetData, callback = null) {
    console.log('Обновление секции "Изделие" данными просчёта:', proschetData);
    
    // Если данных нет, сбрасываем секцию
    if (!proschetData || !proschetData.id) {
        console.warn('❌ Нет данных просчёта для обновления секции "Изделие"');
        productResetSection();
        if (callback) callback(false);
        return;
    }
    
    // ВАЖНО: Приводим ID к строке для консистентности
    const newProschetId = String(proschetData.id);
    
    // ВАЖНО: Если идет редактирование тиража, завершаем его перед загрузкой нового просчёта
    if (productIsEditingCirculation) {
        console.warn('⚠️ Завершаем активное редактирование перед загрузкой нового просчёта');
        productCancelCirculationEdit();
    }
    
    // Сбрасываем флаг готовности перед обновлением
    productSectionReady = false;
    
    // Сохраняем ID выбранного просчёта
    productSelectedProschetId = newProschetId;
    
    // Обновляем тираж в секции
    const newCirculation = proschetData.circulation || 1;
    productUpdateCirculationDisplay(newCirculation);
    
    // Обновляем заголовок с названием просчёта
    updateProductTitle(proschetData);
    
    // Переключаем отображение
    const paramsContainer = document.getElementById('product-params-container');
    const placeholder = document.getElementById('product-placeholder');
    
    if (paramsContainer) paramsContainer.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    
    // Устанавливаем флаг готовности
    productSectionReady = true;
    
    // Генерируем событие о готовности секции "Изделие"
    const event = new CustomEvent('productSectionReady', {
        detail: { 
            proschetId: productSelectedProschetId,
            circulation: productCurrentCirculation
        }
    });
    document.dispatchEvent(event);
    
    console.log(`✅ Секция "Изделие" обновлена для просчёта ID: ${productSelectedProschetId}`);
    
    // Вызываем callback, если он был передан
    if (callback) callback(true);
}

/**
 * Обновляет отображение тиража в секции
 * ВАЖНО: Теперь обновляет не только отображение, но и все связанные данные
 * @param {number|null} circulation - Значение тиража
 */
function productUpdateCirculationDisplay(circulation) {
    console.log(`Обновление отображения тиража: ${circulation}`);
    
    // Сохраняем текущее значение тиража
    productCurrentCirculation = circulation;
    
    const circulationDisplay = document.getElementById('product-circulation-display');
    if (!circulationDisplay) {
        console.warn('❌ Элемент для отображения тиража не найден');
        return;
    }
    
    // Форматируем значение для отображения
    let displayText;
    if (circulation === null || circulation === undefined || circulation === '') {
        displayText = "Не указан";
    } else {
        // Преобразуем в число для форматирования
        const circulationNum = parseInt(circulation, 10);
        if (isNaN(circulationNum)) {
            displayText = "Не указан";
        } else {
            // Форматируем с разделителями тысяч
            displayText = circulationNum.toLocaleString('ru-RU');
        }
    }
    
    // Обновляем текст
    circulationDisplay.textContent = displayText;
    
    // Сохраняем оригинальное значение в data-атрибуте
    circulationDisplay.dataset.originalValue = circulation || '';
    
    // ВАЖНО: Записываем ID просчёта как строку
    circulationDisplay.dataset.proschetId = productSelectedProschetId || '';
    
    console.log(`✅ Отображение тиража обновлено: ${displayText} (для просчёта: ${productSelectedProschetId})`);
    
    // Генерируем событие об изменении тиража для синхронизации с другими секциями
    // Это событие будет обработано в секции "Печатные компоненты"
    const event = new CustomEvent('productCirculationUpdated', {
        detail: { 
            proschetId: productSelectedProschetId,
            circulation: productCurrentCirculation,
            displayText: displayText,
            timestamp: new Date().getTime()
        }
    });
    document.dispatchEvent(event);
    
    // Также генерируем вспомогательное событие для совместимости со старым кодом
    const legacyEvent = new CustomEvent('circulationChanged', {
        detail: {
            proschetId: productSelectedProschetId,
            circulation: productCurrentCirculation
        }
    });
    document.dispatchEvent(legacyEvent);
}

/**
 * Обновляет заголовок с названием просчёта в секции
 * @param {Object} proschetData - Данные просчёта
 */
function updateProductTitle(proschetData) {
    const titleElement = document.getElementById('product-proschet-title');
    if (!titleElement) return;
    
    if (proschetData.title && proschetData.number) {
        titleElement.innerHTML = `
            <span class="proschet-title-active">
                ${proschetData.number}: ${proschetData.title}
            </span>
        `;
    } else if (proschetData.title) {
        titleElement.innerHTML = `
            <span class="proschet-title-active">
                ${proscheтData.title}
            </span>
        `;
    }
}

// ===== 6. ФУНКЦИИ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ ТИРАЖА =====

/**
 * Обработчик двойного клика по значению тиража
 */
function handleProductCirculationDblClick(event) {
    console.log('Двойной клик по значению тиража');
    
    // Проверяем, что элемент редактируемый
    if (event.target.dataset.editable !== 'true') {
        return;
    }
    
    // Проверяем, что выбран просчёт
    if (!productSelectedProschetId) {
        console.warn('❌ Не выбран просчёт для редактирования тиража');
        productShowNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    
    // ВАЖНО: Запоминаем, какой просчёт редактируем
    productEditingProschetId = productSelectedProschetId;
    
    console.log(`✏️ Начинаем редактирование тиража для просчёта ID: ${productEditingProschetId}`);
    
    // Активируем редактирование
    productActivateCirculationEdit(event.target);
}

/**
 * Активирует режим редактирования тиража
 * @param {HTMLElement} displayElement - Элемент отображения тиража
 */
function productActivateCirculationEdit(displayElement) {
    console.log('Активация редактирования тиража для просчёта:', productEditingProschetId);
    
    // Если уже редактируется, выходим
    if (productIsEditingCirculation) {
        console.log('⚠️ Редактирование уже активно');
        return;
    }
    
    // Проверяем, что есть просчёт для редактирования
    if (!productEditingProschetId) {
        console.error('❌ Нет просчёта для редактирования тиража');
        return;
    }
    
    // Устанавливаем флаг редактирования
    productIsEditingCirculation = true;
    
    // Получаем текущее значение тиража
    const currentValue = productCurrentCirculation || '';
    
    // Находим поле ввода
    const inputElement = document.getElementById('product-circulation-input');
    if (!inputElement) {
        console.error('❌ Поле ввода тиража не найдено');
        productIsEditingCirculation = false;
        productEditingProscheтId = null;
        return;
    }
    
    // Устанавливаем значение в поле ввода
    inputElement.value = currentValue;
    
    // Прячем элемент отображения, показываем поле ввода
    displayElement.style.display = 'none';
    inputElement.style.display = 'inline-block';
    
    // Добавляем класс редактирования
    displayElement.classList.add('editing');
    
    // Фокусируемся на поле ввода и выделяем текст
    inputElement.focus();
    inputElement.select();
    
    console.log('✅ Режим редактирования тиража активирован');
}

/**
 * Деактивирует режим редактирования тиража
 */
function productDeactivateCirculationEdit() {
    console.log('Деактивация редактирования тиража');
    
    if (!productIsEditingCirculation) {
        return;
    }
    
    // Сбрасываем флаг редактирования
    productIsEditingCirculation = false;
    
    // ВАЖНО: НЕ сбрасываем ID редактируемого просчёта здесь!
    // Он нужен для отправки на сервер
    
    // Находим элементы
    const displayElement = document.getElementById('product-circulation-display');
    const inputElement = document.getElementById('product-circulation-input');
    
    if (!displayElement || !inputElement) {
        return;
    }
    
    // Показываем элемент отображения, прячем поле ввода
    displayElement.style.display = 'inline';
    inputElement.style.display = 'none';
    
    // Убираем класс редактирования
    displayElement.classList.remove('editing');
    
    console.log('✅ Режим редактирования тиража деактивирован');
}

/**
 * Обработчик потери фокуса полем ввода тиража
 */
function handleProductCirculationInputBlur() {
    console.log('Потеря фокуса полем ввода тиража');
    
    // Небольшая задержка, чтобы обработать клик на кнопке сохранения
    setTimeout(() => {
        if (productIsEditingCirculation) {
            productSaveCirculationEdit();
        }
    }, 100);
}

/**
 * Обработчик нажатия клавиш в поле ввода тиража (Enter)
 */
function handleProductCirculationInputKeyDown(event) {
    // Сохраняем при нажатии Enter
    if (event.key === 'Enter') {
        console.log('Нажата клавиша Enter в поле ввода тиража');
        event.preventDefault();
        productSaveCirculationEdit();
    }
}

/**
 * Обработчик нажатия клавиш в поле ввода тиража (Escape)
 */
function handleProductCirculationInputEscape(event) {
    // Отменяем при нажатии Escape
    if (event.key === 'Escape') {
        console.log('Нажата клавиша Escape в поле ввода тиража');
        event.preventDefault();
        productCancelCirculationEdit();
    }
}

/**
 * Сохраняет отредактированное значение тиража
 */
function productSaveCirculationEdit() {
    console.log('Сохранение отредактированного значения тиража');
    
    // Если не в режиме редактирования, выходим
    if (!productIsEditingCirculation || !productEditingProschetId) {
        console.log('Нет активного редактирования или ID просчёта');
        return;
    }
    
    // Находим элементы
    const displayElement = document.getElementById('product-circulation-display');
    const inputElement = document.getElementById('product-circulation-input');
    
    if (!displayElement || !inputElement) {
        productDeactivateCirculationEdit();
        return;
    }
    
    // Получаем новое значение из поля ввода
    const newValue = inputElement.value.trim();
    
    // Проверяем, изменилось ли значение
    const originalValue = productCurrentCirculation || '';
    
    if (newValue === originalValue.toString()) {
        console.log('Значение тиража не изменилось, отмена редактирования');
        productCancelCirculationEdit();
        return;
    }
    
    // Валидируем новое значение
    if (!productValidateCirculation(newValue)) {
        console.warn('❌ Новое значение тиража не прошло валидацию');
        // Возвращаем фокус на поле ввода для исправления
        inputElement.focus();
        inputElement.select();
        return;
    }
    
    // Преобразуем в число
    const circulationNumber = parseInt(newValue, 10);
    
    // Отправляем на сервер
    productSendCirculationUpdate(circulationNumber);
}

/**
 * Отменяет редактирование тиража
 */
function productCancelCirculationEdit() {
    console.log('Отмена редактирования тиража');
    
    // Сохраняем ID редактируемого просчёта перед деактивацией
    const editingProschetId = productEditingProschetId;
    
    // Деактивируем режим редактирования
    productDeactivateCirculationEdit();
    
    // ВАЖНО: Сбрасываем ID редактируемого просчёта ТОЛЬКО после деактивации
    productEditingProschetId = null;
    
    // Восстанавливаем исходное значение только если это тот же просчёт, что и выбранный
    if (productSelectedProschetId === editingProschetId) {
        productUpdateCirculationDisplay(productCurrentCirculation);
    } else {
        console.log(`⚠️ Пропускаем восстановление: редактировался просчёт ${editingProschetId}, а выбран ${productSelectedProschetId}`);
    }
    
    // Показываем уведомление
    productShowNotification('Редактирование отменено', 'info');
}

/**
 * Валидирует значение тиража
 * @param {string} value - Значение для валидации
 * @returns {boolean} - Прошло ли валидацию
 */
function productValidateCirculation(value) {
    console.log(`Валидация значения тиража: "${value}"`);
    
    // Проверяем, что значение не пустое
    if (!value) {
        productShowNotification('Тираж не может быть пустым', 'error');
        return false;
    }
    
    // Проверяем, что значение - целое число
    const intValue = parseInt(value, 10);
    if (isNaN(intValue)) {
        productShowNotification('Тираж должен быть целым числом', 'error');
        return false;
    }
    
    // Проверяем, что значение положительное
    if (intValue <= 0) {
        productShowNotification('Тираж должен быть положительным числом', 'error');
        return false;
    }
    
    // Проверяем максимальное значение
    if (intValue > 1000000) {
        productShowNotification('Тираж не может превышать 1 000 000', 'error');
        return false;
    }
    
    console.log('✅ Валидация тиража пройдена успешно');
    return true;
}

/**
 * Отправляет обновление тиража на сервер
 * ВАЖНО: Используем productEditingProschetId, который был установлен при начале редактирования
 * @param {number} newCirculation - Новое значение тиража
 */
function productSendCirculationUpdate(newCirculation) {
    console.log(`Отправка обновления тиража на сервер: ${newCirculation} для просчёта: ${productEditingProschetId}`);
    
    // Проверяем, что есть просчёт, который редактируем
    if (!productEditingProschetId) {
        console.error('❌ Нет просчёта для обновления тиража');
        productShowNotification('Ошибка: не выбран просчёт для редактирования', 'error');
        productDeactivateCirculationEdit();
        return;
    }
    
    // Получаем CSRF токен
    const csrfToken = productGetCsrfToken();
    if (!csrfToken) {
        console.error('❌ Не удалось получить CSRF токен');
        productShowNotification('Ошибка безопасности', 'error');
        productDeactivateCirculationEdit();
        return;
    }
    
    // Формируем данные для отправки
    const formData = new FormData();
    formData.append('circulation', newCirculation);
    
    // ВАЖНО: Не меняем текст на "Сохранение..."
    const inputElement = document.getElementById('product-circulation-input');
    if (inputElement) {
        inputElement.style.display = 'none';
    }
    
    // Временно показываем старое значение
    const displayElement = document.getElementById('product-circulation-display');
    if (displayElement) {
        displayElement.style.display = 'inline';
    }
    
    // Сохраняем ID редактируемого просчёта
    const editingProschetId = productEditingProschetId;
    
    // Отправляем запрос на сервер
    fetch(`${productUpdateCirculationUrl}${productEditingProschetId}/`, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrfToken
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('✅ Тираж успешно обновлен на сервере');
            
            // Обновляем значение только если это тот же просчёт, что и выбранный сейчас
            if (productSelectedProschetId === editingProschetId) {
                productCurrentCirculation = newCirculation;
                productUpdateCirculationDisplay(newCirculation);
            } else {
                console.log(`⚠️ Тираж сохранен для просчёта ${editingProschetId}, но сейчас выбран просчёт ${productSelectedProschetId}`);
            }
            
            // Генерируем событие о сохранении тиража для синхронизации с другими секциями
            const saveEvent = new CustomEvent('productCirculationSaved', {
                detail: { 
                    proschetId: editingProschetId,
                    circulation: newCirculation,
                    timestamp: new Date().getTime()
                }
            });
            document.dispatchEvent(saveEvent);
            
            // Показываем уведомление об успехе
            productShowNotification(data.message || 'Тираж успешно обновлен', 'success');
            
        } else {
            console.error('❌ Ошибка сервера при обновлении тиража:', data.message);
            
            // Восстанавливаем предыдущее значение только если это тот же просчёт
            if (productSelectedProschetId === editingProschetId) {
                productUpdateCirculationDisplay(productCurrentCirculation);
            }
            
            // Показываем уведомление об ошибке
            productShowNotification(data.message || 'Ошибка при обновлении тиража', 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при обновлении тиража:', error);
        
        // Восстанавливаем предыдущее значение только если это тот же просчёт
        if (productSelectedProschetId === editingProschetId) {
            productUpdateCirculationDisplay(productCurrentCirculation);
        }
        
        // Показываем уведомление об ошибке
        productShowNotification('Ошибка сети при обновлении тиража', 'error');
    })
    .finally(() => {
        // Сбрасываем ID редактируемого просчёта
        productEditingProschetId = null;
        
        // Полностью деактивируем режим редактирования
        productDeactivateCirculationEdit();
    });
}

// ===== 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

/**
 * Функция для обновления данных секции "Изделие" по ID просчёта
 * @param {number} proschetId - ID просчёта для загрузки данных
 * @returns {Promise} - Промис, который разрешается после обновления
 */
function updateProductSectionData(proschetId) {
    console.log(`Обновление данных секции "Изделие" для просчёта ID: ${proschetId}`);
    
    return new Promise((resolve, reject) => {
        // Не обновляем данные, если идет редактирование
        if (productIsEditingCirculation) {
            console.warn('⚠️ Пропускаем обновление: идет редактирование тиража');
            reject(new Error('Идет редактирование тиража'));
            return;
        }
        
        fetch(`/calculator/get-proschet/${proschetId}/`, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': productGetCsrfToken()
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                productUpdateFromProschet(data.proschet, (success) => {
                    if (success) {
                        resolve(data.proschet);
                    } else {
                        reject(new Error('Не удалось обновить секцию'));
                    }
                });
            } else {
                console.error('❌ Ошибка при получении данных просчёта:', data.message);
                reject(new Error(data.message || 'Ошибка при получении данных'));
            }
        })
        .catch(error => {
            console.error('❌ Ошибка сети при получении данных просчёта:', error);
            reject(error);
        });
    });
}

/**
 * Показывает уведомление в интерфейсе
 * @param {string} message - Текст уведомления
 * @param {string} type - Тип уведомления
 */
function productShowNotification(message, type = 'info') {
    console.log(`Показ уведомления [${type}]: ${message}`);
    
    const notification = document.createElement('div');
    
    let backgroundColor;
    switch (type) {
        case 'success': backgroundColor = '#4CAF50'; break;
        case 'error': backgroundColor = '#f44336'; break;
        case 'warning': backgroundColor = '#ff9800'; break;
        case 'info': default: backgroundColor = '#2196F3'; break;
    }
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${backgroundColor};
        color: white;
        border-radius: 4px;
        z-index: 1000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        max-width: 300px;
        word-wrap: break-word;
        font-family: Arial, sans-serif;
        transition: opacity 0.3s;
    `;
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

/**
 * Получает CSRF токен из куки
 * @returns {string} - CSRF токен или пустая строка если не найден
 */
function productGetCsrfToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        
        if (cookie.startsWith(name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }
    
    console.warn('❌ CSRF-токен не найден');
    return '';
}

/**
 * Проверяет, готова ли секция "Изделие" для работы
 * @returns {boolean} - Готова ли секция
 */
function isProductSectionReady() {
    return productSectionReady && productSelectedProschetId !== null;
}

// ===== 8. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ =====

window.productSection = {
    // Основные функции
    updateFromProschet: productUpdateFromProschet,
    updateCirculation: productUpdateCirculationDisplay,
    updateSectionData: updateProductSectionData,
    resetSection: productResetSection,
    
    // Функции для inline-редактирования
    activateCirculationEdit: productActivateCirculationEdit,
    saveCirculationEdit: productSaveCirculationEdit,
    cancelCirculationEdit: productCancelCirculationEdit,
    
    // Вспомогательные функции
    showNotification: productShowNotification,
    getCsrfToken: productGetCsrfToken,
    isReady: isProductSectionReady,
    
    // Геттеры для состояния
    getSelectedProschetId: () => productSelectedProschetId,
    getEditingProschetId: () => productEditingProscheтId,
    getCurrentCirculation: () => productCurrentCirculation,
    isEditingCirculation: () => productIsEditingCirculation,
    
    // НОВЫЕ ФУНКЦИИ: Для синхронизации с другими секциями
    /**
     * Обновляет тираж и генерирует события для синхронизации
     * @param {number} newCirculation - Новое значение тиража
     */
    updateCirculationWithSync: function(newCirculation) {
        console.log(`🔄 Принудительное обновление тиража с синхронизацией: ${newCirculation}`);
        productCurrentCirculation = newCirculation;
        productUpdateCirculationDisplay(newCirculation);
    }
};

console.log('✅ Модуль секции "Изделие" полностью загружен с поддержкой синхронизации тиража');