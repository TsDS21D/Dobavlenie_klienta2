/*
calculator/static/calculator/js/sections/list_proschet_inline_edit.js
JavaScript для inline-редактирования в секции "Список просчётов"

ИСПРАВЛЕНИЕ: Убираем дублирование функции getCsrfToken и используем существующую
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ =====

let currentEditingElement = null;
let originalEditValue = "";
let inlineEditInput = null;

// URL для отправки запроса на обновление названия просчёта
// ИСПРАВЛЕНО: убираем префикс, используем обычное имя
const UPDATE_TITLE_URL = '/calculator/update-proschet-title/';

// ===== 2. ИНИЦИАЛИЗАЦИЯ INLINE-РЕДАКТИРОВАНИЯ =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Модуль inline-редактирования загружен');
    setupInlineEditEventListeners();
    console.log('✅ Inline-редактирование инициализировано');
});

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ =====

function setupInlineEditEventListeners() {
    console.log('Настраиваем обработчики событий для inline-редактирования...');
    
    const tableBody = document.getElementById('proschet-table-body');
    if (!tableBody) {
        console.warn('Тело таблицы не найдено для настройки inline-редактирования');
        return;
    }
    
    // ===== ОБРАБОТЧИК ДВОЙНОГО КЛИКА ПО ЯЧЕЙКАМ =====
    
    tableBody.addEventListener('dblclick', function(event) {
        const editableCell = event.target.closest('.editable-cell');
        if (!editableCell) {
            return;
        }
        
        console.log('Двойной клик по редактируемой ячейке');
        
        if (editableCell.dataset.editable === 'true') {
            event.stopPropagation();
            activateInlineEdit(editableCell);
        }
    });
    
    // ===== ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ =====
    
    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    
    console.log('✅ Обработчики событий для inline-редактирования настроены');
}

function handleDocumentClick(event) {
    if (!currentEditingElement || !inlineEditInput) {
        return;
    }
    
    const clickedInsideInput = event.target === inlineEditInput || 
                               currentEditingElement.contains(event.target);
    
    if (!clickedInsideInput) {
        console.log('Клик вне поля редактирования - сохраняем');
        saveInlineEdit();
    }
}

function handleKeyDown(event) {
    if (!currentEditingElement || !inlineEditInput) {
        return;
    }
    
    if (event.key === 'Escape') {
        console.log('Нажата клавиша Escape - отмена редактирования');
        event.preventDefault();
        cancelInlineEdit();
    }
    
    if (event.key === 'Enter') {
        console.log('Нажата клавиша Enter - сохранение');
        event.preventDefault();
        saveInlineEdit();
    }
}

// ===== 4. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ =====

function activateInlineEdit(cellElement) {
    console.log('Активация inline-редактирования');
    
    if (cellElement.dataset.editable !== 'true') {
        console.warn('Ячейка не предназначена для редактирования');
        return;
    }
    
    if (currentEditingElement && currentEditingElement !== cellElement) {
        saveInlineEdit();
    }
    
    if (currentEditingElement === cellElement) {
        console.log('Эта ячейка уже редактируется');
        return;
    }
    
    currentEditingElement = cellElement;
    originalEditValue = cellElement.dataset.originalValue || cellElement.textContent.trim();
    
    const fieldName = cellElement.dataset.field || 'title';
    const currentValue = cellElement.textContent.trim();
    
    inlineEditInput = document.createElement('input');
    inlineEditInput.type = 'text';
    inlineEditInput.className = 'inline-edit-input';
    inlineEditInput.value = currentValue;
    inlineEditInput.dataset.field = fieldName;
    
    cellElement.innerHTML = '';
    cellElement.appendChild(inlineEditInput);
    
    inlineEditInput.focus();
    inlineEditInput.select();
    
    console.log(`✅ Редактирование активировано для поля: ${fieldName}`);
    setupInputEventListeners();
}

function setupInputEventListeners() {
    if (!inlineEditInput) return;
    
    inlineEditInput.addEventListener('blur', function() {
        setTimeout(() => {
            if (currentEditingElement && inlineEditInput) {
                saveInlineEdit();
            }
        }, 100);
    });
}

function saveInlineEdit() {
    if (!currentEditingElement || !inlineEditInput) {
        console.log('Нет активного редактирования для сохранения');
        return;
    }
    
    const newValue = inlineEditInput.value.trim();
    const fieldName = inlineEditInput.dataset.field || 'title';
    
    console.log(`Сохранение изменений: "${newValue}"`);
    
    if (!validateEditValue(newValue, fieldName)) {
        console.warn('Новое значение не прошло валидацию');
        cancelInlineEdit();
        return;
    }
    
    if (newValue === originalEditValue) {
        console.log('Значение не изменилось, отменяем редактирование');
        cancelInlineEdit();
        return;
    }
    
    const row = currentEditingElement.closest('.proschet-row');
    const proschetId = row.dataset.proschetId;
    
    if (!proschetId) {
        console.error('Не удалось получить ID просчёта');
        cancelInlineEdit();
        return;
    }
    
    saveToServer(proschetId, newValue, fieldName);
}

function saveToServer(proschetId, newValue, fieldName) {
    console.log(`Отправка на сервер: ID=${proschetId}, поле=${fieldName}, значение=${newValue}`);
    
    const formData = new FormData();
    formData.append('field', fieldName);
    formData.append('value', newValue);
    
    // ИСПРАВЛЕНО: Используем функцию getCsrfToken из window.proschetList
    // или из глобальной области видимости, если она существует
    const csrfToken = window.proschetList && window.proschetList.getCsrfToken ? 
                     window.proschetList.getCsrfToken() : getCsrfTokenFromCookies();
    
    fetch(UPDATE_TITLE_URL + proschetId + '/', {
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
            console.log('✅ Изменения успешно сохранены на сервере');
            
            currentEditingElement.textContent = newValue;
            currentEditingElement.dataset.originalValue = newValue;
            
            if (window.proschetList && window.proschetList.showNotification) {

            } else {

            }
            
            currentEditingElement = null;
            originalEditValue = "";
            inlineEditInput = null;
            
        } else {
            console.error('Ошибка сервера при сохранении:', data.message);
            
            if (window.proschetList && window.proschetList.showNotification) {
                window.proschetList.showNotification(data.message || 'Ошибка сервера', 'error');
            } else {
                alert(data.message || 'Ошибка сервера');
            }
            
            cancelInlineEdit();
        }
    })
    .catch(error => {
        console.error('Ошибка при сохранении на сервере:', error);
        
        if (window.proschetList && window.proschetList.showNotification) {
            window.proschetList.showNotification('Ошибка сети при сохранении', 'error');
        } else {
            alert('Ошибка сети при сохранении');
        }
        
        cancelInlineEdit();
    });
}

function cancelInlineEdit() {
    if (!currentEditingElement) {
        console.log('Нет активного редактирования для отмены');
        return;
    }
    
    console.log('Отмена inline-редактирования');
    
    currentEditingElement.textContent = originalEditValue;
    
    if (window.proschetList && window.proschetList.showNotification) {

    }
    
    console.log('✅ Редактирование отменено');
    
    currentEditingElement = null;
    originalEditValue = "";
    inlineEditInput = null;
}

function validateEditValue(value, fieldName) {
    console.log(`Валидация значения "${value}" для поля "${fieldName}"`);
    
    switch (fieldName) {
        case 'title':
            if (value.length < 3) {
                if (window.proschetList && window.proschetList.showNotification) {
                    window.proschetList.showNotification('Название должно содержать минимум 3 символа', 'error');
                } else {
                    alert('Название должно содержать минимум 3 символа');
                }
                return false;
            }
            
            if (value.length > 200) {
                if (window.proschetList && window.proschetList.showNotification) {
                    window.proschetList.showNotification('Название не должно превышать 200 символов', 'error');
                } else {
                    alert('Название не должно превышать 200 символов');
                }
                return false;
            }
            
            if (!value.trim()) {
                if (window.proschetList && window.proschetList.showNotification) {
                    window.proschetList.showNotification('Название не может быть пустым', 'error');
                } else {
                    alert('Название не может быть пустым');
                }
                return false;
            }
            break;
            
        default:
            if (!value.trim()) {
                if (window.proschetList && window.proschetList.showNotification) {
                    window.proschetList.showNotification('Значение не может быть пустым', 'error');
                } else {
                    alert('Значение не может быть пустым');
                }
                return false;
            }
    }
    
    console.log('✅ Валидация пройдена успешно');
    return true;
}

/**
 * Вспомогательная функция для получения CSRF токена из куки
 * ИСПРАВЛЕНО: Называем её по-другому, чтобы не конфликтовать с getCsrfToken из list_proschet.js
 * @returns {string} - CSRF токен или пустая строка если не найден
 */
function getCsrfTokenFromCookies() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        
        if (cookie.startsWith(name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }
    
    console.warn('CSRF-токен не найден в куках');
    return '';
}

// ===== 5. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ =====

window.inlineEdit = {
    activateInlineEdit: activateInlineEdit,
    saveInlineEdit: saveInlineEdit,
    cancelInlineEdit: cancelInlineEdit
};

console.log('✅ Модуль inline-редактирования полностью загружен и готов к работе');