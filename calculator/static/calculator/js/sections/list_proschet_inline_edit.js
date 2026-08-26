/*
calculator/static/calculator/js/sections/list_proschet_inline_edit.js
JavaScript для inline-редактирования в секции "Список просчётов"

ИСПРАВЛЕНИЯ:
1. Исправлена ошибка Cannot set properties of null (setting 'textContent')
2. Добавлена проверка существования элементов перед их использованием
3. Улучшена обработка ошибок
4. Использован правильный CSRF токен из существующей функции
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ =====

let currentEditingElement = null;  // Текущий редактируемый элемент
let originalEditValue = "";        // Оригинальное значение до редактирования
let inlineEditInput = null;        // Ссылка на поле ввода

// URL для отправки запроса на обновление названия просчёта
const UPDATE_TITLE_URL = '/calculator/update-proschet-title/';

// ===== 2. ИНИЦИАЛИЗАЦИЯ INLINE-РЕДАКТИРОВАНИЯ =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Модуль inline-редактирования загружен');
    setupInlineEditEventListeners();
    console.log('✅ Inline-редактирование инициализировано');
});

// ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ =====

/**
 * Настраивает обработчики событий для inline-редактирования
 */
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
            event.stopPropagation();  // Предотвращаем всплытие события
            activateInlineEdit(editableCell);
        }
    });
    
    // ===== ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ =====
    
    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);
    
    console.log('✅ Обработчики событий для inline-редактирования настроены');
}

/**
 * Обрабатывает клик по документу
 * @param {Event} event - Событие клика
 */
function handleDocumentClick(event) {
    // Если нет активного редактирования, выходим
    if (!currentEditingElement || !inlineEditInput) {
        return;
    }
    
    // Проверяем, был ли клик внутри поля ввода или его контейнера
    const clickedInsideInput = event.target === inlineEditInput || 
                               (currentEditingElement && currentEditingElement.contains(event.target));
    
    // Если клик был снаружи - сохраняем изменения
    if (!clickedInsideInput) {
        console.log('Клик вне поля редактирования - сохраняем');
        saveInlineEdit();
    }
}

/**
 * Обрабатывает нажатие клавиш
 * @param {KeyboardEvent} event - Событие клавиатуры
 */
function handleKeyDown(event) {
    // Если нет активного редактирования, выходим
    if (!currentEditingElement || !inlineEditInput) {
        return;
    }
    
    // Escape - отмена редактирования
    if (event.key === 'Escape') {
        console.log('Нажата клавиша Escape - отмена редактирования');
        event.preventDefault();
        cancelInlineEdit();
    }
    
    // Enter - сохранение изменений
    if (event.key === 'Enter') {
        console.log('Нажата клавиша Enter - сохранение');
        event.preventDefault();
        saveInlineEdit();
    }
}

// ===== 4. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ INLINE-РЕДАКТИРОВАНИЯ =====

/**
 * Активирует inline-редактирование для ячейки
 * @param {HTMLElement} cellElement - DOM-элемент ячейки
 */
function activateInlineEdit(cellElement) {
    console.log('Активация inline-редактирования');
    
    // Проверяем, можно ли редактировать ячейку
    if (cellElement.dataset.editable !== 'true') {
        console.warn('Ячейка не предназначена для редактирования');
        return;
    }
    
    // Если уже есть активное редактирование в другой ячейке - сохраняем его
    if (currentEditingElement && currentEditingElement !== cellElement) {
        saveInlineEdit();
    }
    
    // Если эта ячейка уже редактируется - выходим
    if (currentEditingElement === cellElement) {
        console.log('Эта ячейка уже редактируется');
        return;
    }
    
    // Сохраняем ссылку на текущий элемент
    currentEditingElement = cellElement;
    
    // Сохраняем оригинальное значение
    originalEditValue = cellElement.dataset.originalValue || cellElement.textContent.trim();
    
    // Получаем имя поля и текущее значение
    const fieldName = cellElement.dataset.field || 'title';
    const currentValue = cellElement.textContent.trim();
    
    // Создаем поле ввода
    inlineEditInput = document.createElement('input');
    inlineEditInput.type = 'text';
    inlineEditInput.className = 'inline-edit-input';
    inlineEditInput.value = currentValue;
    inlineEditInput.dataset.field = fieldName;
    
    // Заменяем содержимое ячейки полем ввода
    cellElement.innerHTML = '';
    cellElement.appendChild(inlineEditInput);
    
    // Устанавливаем фокус и выделяем текст
    inlineEditInput.focus();
    inlineEditInput.select();
    
    console.log(`✅ Редактирование активировано для поля: ${fieldName}`);
    setupInputEventListeners();
}

/**
 * Настраивает обработчики событий для поля ввода
 */
function setupInputEventListeners() {
    if (!inlineEditInput) return;
    
    // Сохраняем при потере фокуса
    inlineEditInput.addEventListener('blur', function() {
        setTimeout(() => {
            if (currentEditingElement && inlineEditInput) {
                saveInlineEdit();
            }
        }, 100);
    });
}

/**
 * Сохраняет изменения из inline-редактирования
 */
function saveInlineEdit() {
    // Проверяем наличие активного редактирования
    if (!currentEditingElement || !inlineEditInput) {
        console.log('Нет активного редактирования для сохранения');
        return;
    }
    
    // Получаем новое значение
    const newValue = inlineEditInput.value.trim();
    const fieldName = inlineEditInput.dataset.field || 'title';
    
    console.log(`Сохранение изменений: "${newValue}"`);
    
    // Валидируем новое значение
    if (!validateEditValue(newValue, fieldName)) {
        console.warn('Новое значение не прошло валидацию');
        cancelInlineEdit();
        return;
    }
    
    // Если значение не изменилось - отменяем редактирование
    if (newValue === originalEditValue) {
        console.log('Значение не изменилось, отменяем редактирование');
        cancelInlineEdit();
        return;
    }
    
    // Находим строку таблицы и ID просчёта
    const row = currentEditingElement.closest('.proschet-row');
    if (!row) {
        console.error('Не удалось найти строку таблицы');
        cancelInlineEdit();
        return;
    }
    
    const proschetId = row.dataset.proschetId;
    if (!proschetId) {
        console.error('Не удалось получить ID просчёта');
        cancelInlineEdit();
        return;
    }
    
    // Отправляем данные на сервер
    saveToServer(proschetId, newValue, fieldName);
}

/**
 * Отправляет изменения на сервер
 * @param {string} proschetId - ID просчёта
 * @param {string} newValue - Новое значение
 * @param {string} fieldName - Имя поля
 */
function saveToServer(proschetId, newValue, fieldName) {
    console.log(`Отправка на сервер: ID=${proschetId}, поле=${fieldName}, значение=${newValue}`);
    
    // Создаем FormData для отправки
    const formData = new FormData();
    formData.append('field', fieldName);
    formData.append('value', newValue);
    
    // ИСПРАВЛЕНО: Используем функцию getCsrfToken из list_proschet.js
    let csrfToken = '';
    
    // Пробуем получить CSRF токен разными способами
    if (typeof window.listProschetSection !== 'undefined') {
        // Используем функцию из list_proschet.js если она доступна
        csrfToken = window.listProschetSection.getCsrfToken ? 
                    window.listProschetSection.getCsrfToken() : getCsrfTokenFromCookies();
    } else {
        // Используем нашу локальную функцию
        csrfToken = getCsrfTokenFromCookies();
    }
    
    // Отправляем запрос на сервер
    fetch(`${UPDATE_TITLE_URL}${proschetId}/`, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': csrfToken
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ошибка! статус: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('✅ Изменения успешно сохранены на сервере');
            
            // ИСПРАВЛЕНО: Проверяем существование элемента перед обновлением
            if (currentEditingElement) {
                currentEditingElement.textContent = newValue;
                currentEditingElement.dataset.originalValue = newValue;
                
                // Обновляем data-search-text в строке для поиска
                const row = currentEditingElement.closest('.proschet-row');
                if (row) {
                    const searchText = row.dataset.searchText || '';
                    const newSearchText = searchText.replace(originalEditValue.toLowerCase(), newValue.toLowerCase());
                    row.dataset.searchText = newSearchText;
                }
            }
            
            // Показываем уведомление об успехе
            if (window.listProschetSection && window.listProschetSection.showNotification) {
                window.listProschetSection.showNotification(data.message || 'Изменения сохранены', 'success');
            }
            
            // Обновляем секцию "Изделие", если редактируется выбранный просчёт
            updateProductSectionIfSelected(proschetId, newValue);
            
            // Очищаем переменные редактирования
            currentEditingElement = null;
            originalEditValue = "";
            inlineEditInput = null;
            
        } else {
            // Обработка ошибки от сервера
            console.error('Ошибка сервера при сохранении:', data.message);
            
            // Показываем уведомление об ошибке
            if (window.listProschetSection && window.listProschetSection.showNotification) {
                window.listProschetSection.showNotification(data.message || 'Ошибка сервера', 'error');
            } else {
                showSimpleNotification(data.message || 'Ошибка сервера', 'error');
            }
            
            // Отменяем редактирование
            cancelInlineEdit();
        }
    })
    .catch(error => {
        // Обработка ошибок сети
        console.error('Ошибка при сохранении на сервере:', error);
        
        if (window.listProschetSection && window.listProschetSection.showNotification) {
            window.listProschetSection.showNotification('Ошибка сети при сохранении', 'error');
        } else {
            showSimpleNotification('Ошибка сети при сохранении', 'error');
        }
        
        // Отменяем редактирование
        cancelInlineEdit();
    });
}

/**
 * Обновляет секцию "Изделие" если редактируется выбранный просчёт
 * @param {string} proschetId - ID просчёта
 * @param {string} newTitle - Новое название
 */
function updateProductSectionIfSelected(proschetId, newTitle) {
    // Получаем ID выбранного просчёта
    let selectedId = null;
    
    if (window.listProschetSection && window.listProschetSection.getSelectedId) {
        selectedId = window.listProschetSection.getSelectedId();
    }
    
    // Если редактируется выбранный просчёт - обновляем секцию "Изделие"
    if (selectedId && selectedId.toString() === proschetId.toString()) {
        const proschetTitleElement = document.getElementById('product-proschet-title');
        if (proschetTitleElement) {
            proschetTitleElement.innerHTML = `
                <span class="proschet-title-active">
                    ${newTitle}
                </span>
            `;
            console.log(`✅ Название просчёта обновлено в секции "Изделие": "${newTitle}"`);
        }
    }
}

/**
 * Отменяет inline-редактирование
 */
function cancelInlineEdit() {
    // Проверяем наличие активного редактирования
    if (!currentEditingElement) {
        console.log('Нет активного редактирования для отмены');
        return;
    }
    
    console.log('Отмена inline-редактирования');
    
    // Восстанавливаем оригинальное значение
    currentEditingElement.textContent = originalEditValue;
    
    // Показываем уведомление об отмене
    if (window.listProschetSection && window.listProschetSection.showNotification) {
        window.listProschetSection.showNotification('Редактирование отменено', 'info');
    }
    
    console.log('✅ Редактирование отменено');
    
    // Очищаем переменные
    currentEditingElement = null;
    originalEditValue = "";
    inlineEditInput = null;
}

/**
 * Валидирует значение для редактирования
 * @param {string} value - Значение для проверки
 * @param {string} fieldName - Имя поля
 * @returns {boolean} - Результат валидации
 */
function validateEditValue(value, fieldName) {
    console.log(`Валидация значения "${value}" для поля "${fieldName}"`);
    
    // Валидация в зависимости от типа поля
    switch (fieldName) {
        case 'title':
            // Название должно содержать минимум 3 символа
            if (value.length < 3) {
                showSimpleNotification('Название должно содержать минимум 3 символа', 'error');
                return false;
            }
            
            // Название не должно превышать 200 символов
            if (value.length > 200) {
                showSimpleNotification('Название не должно превышать 200 символов', 'error');
                return false;
            }
            
            // Название не может быть пустым
            if (!value.trim()) {
                showSimpleNotification('Название не может быть пустым', 'error');
                return false;
            }
            break;
            
        default:
            // Для других полей проверяем только на пустоту
            if (!value.trim()) {
                showSimpleNotification('Значение не может быть пустым', 'error');
                return false;
            }
    }
    
    console.log('✅ Валидация пройдена успешно');
    return true;
}

// ===== 5. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

/**
 * Получает CSRF токен из куки
 * @returns {string} - CSRF токен
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

/**
 * Показывает простое уведомление (используется если основное не доступно)
 * @param {string} message - Сообщение
 * @param {string} type - Тип уведомления (success, error, info)
 */
function showSimpleNotification(message, type) {
    console.log(`Показ простого уведомления [${type}]: ${message}`);
    
    // Определяем цвет в зависимости от типа
    let backgroundColor = '#2196F3'; // синий по умолчанию (info)
    if (type === 'success') backgroundColor = '#4CAF50'; // зеленый
    if (type === 'error') backgroundColor = '#f44336'; // красный
    
    // Создаем элемент уведомления
    const notification = document.createElement('div');
    
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
    
    // Удаляем уведомление через 3 секунды
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ===== 6. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ =====

window.inlineEdit = {
    activateInlineEdit: activateInlineEdit,
    saveInlineEdit: saveInlineEdit,
    cancelInlineEdit: cancelInlineEdit,
    getCsrfTokenFromCookies: getCsrfTokenFromCookies
};

console.log('✅ Модуль inline-редактирования полностью загружен и готов к работе');