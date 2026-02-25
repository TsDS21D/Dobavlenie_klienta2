/*
calculator/static/calculator/js/sections/product.js
JavaScript для секции "Изделие"

ИЗМЕНЕНИЯ (для массового пересчёта компонентов печати):
- В функцию productSendCirculationUpdate добавлен вызов массового пересчёта
  всех печатных компонентов после успешного обновления тиража.
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ С ПРЕФИКСОМ product =====
let productSelectedProschetId = null;          // ID выбранного просчёта
let productEditingProschetId = null;           // ID просчёта, который редактируется
let productCurrentCirculation = null;          // Текущее значение тиража
let productIsEditingCirculation = false;       // Флаг активного редактирования тиража
const productUpdateCirculationUrl = '/calculator/update-proschet-circulation/';
let productSectionReady = false;                // Флаг готовности секции

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Изделие" загружена с поддержкой массового пересчёта компонентов');
    setupProductEventListeners();
    initProductSection();
});

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====
function setupProductEventListeners() {
    console.log('Настраиваем обработчики событий для секции "Изделие"...');
    const circulationDisplay = document.getElementById('product-circulation-display');
    if (circulationDisplay) {
        circulationDisplay.addEventListener('dblclick', handleProductCirculationDblClick);
    }
    const circulationInput = document.getElementById('product-circulation-input');
    if (circulationInput) {
        circulationInput.addEventListener('blur', handleProductCirculationInputBlur);
        circulationInput.addEventListener('keydown', handleProductCirculationInputKeyDown);
        circulationInput.addEventListener('keydown', handleProductCirculationInputEscape);
    }
    console.log('✅ Обработчики событий для секции "Изделие" настроены');
}

// ===== 4. ФУНКЦИИ ДЛЯ ИНИЦИАЛИЗАЦИИ СЕКЦИИ =====
function initProductSection() {
    console.log('Инициализация секции "Изделие"...');
    const paramsContainer = document.getElementById('product-params-container');
    const placeholder = document.getElementById('product-placeholder');
    if (paramsContainer) paramsContainer.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    productResetSection();
    console.log('✅ Секция "Изделие" инициализирована (режим заглушки)');
}

function productResetSection() {
    console.log('Сброс состояния секции "Изделие"');
    productSelectedProschetId = null;
    productEditingProschetId = null;
    productCurrentCirculation = null;
    productIsEditingCirculation = false;
    productSectionReady = false;

    const circulationDisplay = document.getElementById('product-circulation-display');
    if (circulationDisplay) {
        circulationDisplay.textContent = 'Не указан';
        circulationDisplay.dataset.originalValue = '';
        circulationDisplay.dataset.proschetId = '';
        circulationDisplay.classList.remove('editing');
    }
    const circulationInput = document.getElementById('product-circulation-input');
    if (circulationInput) {
        circulationInput.value = '';
        circulationInput.style.display = 'none';
    }
    const titleElement = document.getElementById('product-proschet-title');
    if (titleElement) {
        titleElement.innerHTML = '<span class="placeholder-text">(просчёт не выбран)</span>';
    }
    console.log('✅ Состояние секции "Изделие" сброшено');
}

// ===== 5. ФУНКЦИИ ДЛЯ ОБНОВЛЕНИЯ ДАННЫХ ИЗ ПРОСЧЁТА =====
function productUpdateFromProschet(proschetData, callback = null) {
    console.log('Обновление секции "Изделие" данными просчёта:', proschetData);
    if (!proschetData || !proschetData.id) {
        console.warn('❌ Нет данных просчёта для обновления секции "Изделие"');
        productResetSection();
        if (callback) callback(false);
        return;
    }
    const newProschetId = String(proschetData.id);
    if (productIsEditingCirculation) {
        console.warn('⚠️ Завершаем активное редактирование перед загрузкой нового просчёта');
        productCancelCirculationEdit();
    }
    productSectionReady = false;
    productSelectedProschetId = newProschetId;
    const newCirculation = proschetData.circulation || 1;
    productUpdateCirculationDisplay(newCirculation);
    updateProductTitle(proschetData);
    const paramsContainer = document.getElementById('product-params-container');
    const placeholder = document.getElementById('product-placeholder');
    if (paramsContainer) paramsContainer.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
    productSectionReady = true;

    const event = new CustomEvent('productSectionReady', {
        detail: { 
            proschetId: productSelectedProschetId,
            circulation: productCurrentCirculation
        }
    });
    document.dispatchEvent(event);

    console.log(`✅ Секция "Изделие" обновлена для просчёта ID: ${productSelectedProschetId}`);
    if (callback) callback(true);
}

function productUpdateCirculationDisplay(circulation) {
    console.log(`Обновление отображения тиража: ${circulation}`);
    productCurrentCirculation = circulation;
    const circulationDisplay = document.getElementById('product-circulation-display');
    if (!circulationDisplay) {
        console.warn('❌ Элемент для отображения тиража не найден');
        return;
    }
    let displayText;
    if (circulation === null || circulation === undefined || circulation === '') {
        displayText = "Не указан";
    } else {
        const circulationNum = parseInt(circulation, 10);
        if (isNaN(circulationNum)) {
            displayText = "Не указан";
        } else {
            displayText = circulationNum.toLocaleString('ru-RU');
        }
    }
    circulationDisplay.textContent = displayText;
    circulationDisplay.dataset.originalValue = circulation || '';
    circulationDisplay.dataset.proschetId = productSelectedProschetId || '';

    console.log(`✅ Отображение тиража обновлено: ${displayText} (для просчёта: ${productSelectedProschetId})`);

    const event = new CustomEvent('productCirculationUpdated', {
        detail: { 
            proschetId: productSelectedProschetId,
            circulation: productCurrentCirculation,
            displayText: displayText,
            timestamp: new Date().getTime()
        }
    });
    document.dispatchEvent(event);

    const legacyEvent = new CustomEvent('circulationChanged', {
        detail: {
            proschetId: productSelectedProschetId,
            circulation: productCurrentCirculation
        }
    });
    document.dispatchEvent(legacyEvent);
}

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
                ${proschetData.title}
            </span>
        `;
    }
}

// ===== 6. ФУНКЦИИ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ ТИРАЖА =====
function handleProductCirculationDblClick(event) {
    console.log('Двойной клик по значению тиража');
    if (event.target.dataset.editable !== 'true') return;
    if (!productSelectedProschetId) {
        console.warn('❌ Не выбран просчёт для редактирования тиража');
        productShowNotification('Сначала выберите просчёт', 'warning');
        return;
    }
    productEditingProschetId = productSelectedProschetId;
    console.log(`✏️ Начинаем редактирование тиража для просчёта ID: ${productEditingProschetId}`);
    productActivateCirculationEdit(event.target);
}

function productActivateCirculationEdit(displayElement) {
    console.log('Активация редактирования тиража для просчёта:', productEditingProschetId);
    if (productIsEditingCirculation) {
        console.log('⚠️ Редактирование уже активно');
        return;
    }
    if (!productEditingProschetId) {
        console.error('❌ Нет просчёта для редактирования тиража');
        return;
    }
    productIsEditingCirculation = true;
    const currentValue = productCurrentCirculation || '';
    const inputElement = document.getElementById('product-circulation-input');
    if (!inputElement) {
        console.error('❌ Поле ввода тиража не найдено');
        productIsEditingCirculation = false;
        productEditingProschetId = null;
        return;
    }
    inputElement.value = currentValue;
    displayElement.style.display = 'none';
    inputElement.style.display = 'inline-block';
    displayElement.classList.add('editing');
    inputElement.focus();
    inputElement.select();
    console.log('✅ Режим редактирования тиража активирован');
}

function productDeactivateCirculationEdit() {
    console.log('Деактивация редактирования тиража');
    if (!productIsEditingCirculation) return;
    productIsEditingCirculation = false;
    const displayElement = document.getElementById('product-circulation-display');
    const inputElement = document.getElementById('product-circulation-input');
    if (!displayElement || !inputElement) return;
    displayElement.style.display = 'inline';
    inputElement.style.display = 'none';
    displayElement.classList.remove('editing');
    console.log('✅ Режим редактирования тиража деактивирован');
}

function handleProductCirculationInputBlur() {
    console.log('Потеря фокуса полем ввода тиража');
    setTimeout(() => {
        if (productIsEditingCirculation) {
            productSaveCirculationEdit();
        }
    }, 100);
}

function handleProductCirculationInputKeyDown(event) {
    if (event.key === 'Enter') {
        console.log('Нажата клавиша Enter в поле ввода тиража');
        event.preventDefault();
        productSaveCirculationEdit();
    }
}

function handleProductCirculationInputEscape(event) {
    if (event.key === 'Escape') {
        console.log('Нажата клавиша Escape в поле ввода тиража');
        event.preventDefault();
        productCancelCirculationEdit();
    }
}

function productSaveCirculationEdit() {
    console.log('Сохранение отредактированного значения тиража');
    if (!productIsEditingCirculation || !productEditingProschetId) {
        console.log('Нет активного редактирования или ID просчёта');
        return;
    }
    const displayElement = document.getElementById('product-circulation-display');
    const inputElement = document.getElementById('product-circulation-input');
    if (!displayElement || !inputElement) {
        productDeactivateCirculationEdit();
        return;
    }
    const newValue = inputElement.value.trim();
    const originalValue = productCurrentCirculation || '';
    if (newValue === originalValue.toString()) {
        console.log('Значение тиража не изменилось, отмена редактирования');
        productCancelCirculationEdit();
        return;
    }
    if (!productValidateCirculation(newValue)) {
        console.warn('❌ Новое значение тиража не прошло валидацию');
        inputElement.focus();
        inputElement.select();
        return;
    }
    const circulationNumber = parseInt(newValue, 10);
    productSendCirculationUpdate(circulationNumber);
}

function productCancelCirculationEdit() {
    console.log('Отмена редактирования тиража');
    const editingProschetId = productEditingProschetId;
    productDeactivateCirculationEdit();
    productEditingProschetId = null;
    if (productSelectedProschetId === editingProschetId) {
        productUpdateCirculationDisplay(productCurrentCirculation);
    } else {
        console.log(`⚠️ Пропускаем восстановление: редактировался просчёт ${editingProschetId}, а выбран ${productSelectedProschetId}`);
    }
    productShowNotification('Редактирование отменено', 'info');
}

function productValidateCirculation(value) {
    console.log(`Валидация значения тиража: "${value}"`);
    if (!value) {
        productShowNotification('Тираж не может быть пустым', 'error');
        return false;
    }
    const intValue = parseInt(value, 10);
    if (isNaN(intValue)) {
        productShowNotification('Тираж должен быть целым числом', 'error');
        return false;
    }
    if (intValue <= 0) {
        productShowNotification('Тираж должен быть положительным числом', 'error');
        return false;
    }
    if (intValue > 1000000) {
        productShowNotification('Тираж не может превышать 1 000 000', 'error');
        return false;
    }
    console.log('✅ Валидация тиража пройдена успешно');
    return true;
}

function productSendCirculationUpdate(newCirculation) {
    console.log(`Отправка обновления тиража на сервер: ${newCirculation} для просчёта: ${productEditingProschetId}`);
    if (!productEditingProschetId) {
        console.error('❌ Нет просчёта для обновления тиража');
        productShowNotification('Ошибка: не выбран просчёт для редактирования', 'error');
        productDeactivateCirculationEdit();
        return;
    }
    const csrfToken = productGetCsrfToken();
    if (!csrfToken) {
        console.error('❌ Не удалось получить CSRF токен');
        productShowNotification('Ошибка безопасности', 'error');
        productDeactivateCirculationEdit();
        return;
    }
    const formData = new FormData();
    formData.append('circulation', newCirculation);
    const inputElement = document.getElementById('product-circulation-input');
    if (inputElement) {
        inputElement.style.display = 'none';
    }
    const displayElement = document.getElementById('product-circulation-display');
    if (displayElement) {
        displayElement.style.display = 'inline';
    }
    const editingProschetId = productEditingProschetId;

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
            if (productSelectedProschetId === editingProschetId) {
                productCurrentCirculation = newCirculation;
                productUpdateCirculationDisplay(newCirculation);
            } else {
                console.log(`⚠️ Тираж сохранен для просчёта ${editingProschetId}, но сейчас выбран просчёт ${productSelectedProschetId}`);
            }

            const saveEvent = new CustomEvent('productCirculationSaved', {
                detail: { 
                    proschetId: editingProschetId,
                    circulation: newCirculation,
                    timestamp: new Date().getTime()
                }
            });
            document.dispatchEvent(saveEvent);

            // ===== НОВЫЙ ВЫЗОВ: массовый пересчёт компонентов печати =====
            if (window.printComponentsSection && typeof window.printComponentsSection.recalculateAllComponentsForCirculation === 'function') {
                window.printComponentsSection.recalculateAllComponentsForCirculation(editingProschetId, newCirculation);
            }

            productShowNotification(data.message || 'Тираж успешно обновлен', 'success');
        } else {
            console.error('❌ Ошибка сервера при обновлении тиража:', data.message);
            if (productSelectedProschetId === editingProschetId) {
                productUpdateCirculationDisplay(productCurrentCirculation);
            }
            productShowNotification(data.message || 'Ошибка при обновлении тиража', 'error');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при обновлении тиража:', error);
        if (productSelectedProschetId === editingProschetId) {
            productUpdateCirculationDisplay(productCurrentCirculation);
        }
        productShowNotification('Ошибка сети при обновлении тиража', 'error');
    })
    .finally(() => {
        productEditingProschetId = null;
        productDeactivateCirculationEdit();
    });
}

// ===== 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function updateProductSectionData(proschetId) {
    console.log(`Обновление данных секции "Изделие" для просчёта ID: ${proschetId}`);
    return new Promise((resolve, reject) => {
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

function isProductSectionReady() {
    return productSectionReady && productSelectedProschetId !== null;
}

// ===== 8. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ =====
window.productSection = {
    updateFromProschet: productUpdateFromProschet,
    updateCirculation: productUpdateCirculationDisplay,
    updateSectionData: updateProductSectionData,
    resetSection: productResetSection,
    activateCirculationEdit: productActivateCirculationEdit,
    saveCirculationEdit: productSaveCirculationEdit,
    cancelCirculationEdit: productCancelCirculationEdit,
    showNotification: productShowNotification,
    getCsrfToken: productGetCsrfToken,
    isReady: isProductSectionReady,
    getSelectedProschetId: () => productSelectedProschetId,
    getEditingProschetId: () => productEditingProschetId,
    getCurrentCirculation: () => productCurrentCirculation,
    isEditingCirculation: () => productIsEditingCirculation,
    updateCirculationWithSync: function(newCirculation) {
        console.log(`🔄 Принудительное обновление тиража с синхронизацией: ${newCirculation}`);
        productCurrentCirculation = newCirculation;
        productUpdateCirculationDisplay(newCirculation);
    }
};

console.log('✅ Модуль секции "Изделие" полностью загружен с поддержкой массового пересчёта компонентов');