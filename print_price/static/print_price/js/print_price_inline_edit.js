/*
print_price_inline_edit.js - JavaScript для in-line редактирования цен на печать
*/

// Ждем полной загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    
    console.log('print_price_inline_edit.js загружен'); // Отладочное сообщение
    
    // ===== 1. НАСТРОЙКА ГЛОБАЛЬНЫХ ПЕРЕМЕННЫХ =====
    
    // Текущее редактируемое поле (для предотвращения одновременного редактирования нескольких полей)
    let currentlyEditing = null;
    
    // ===== 2. ФУНКЦИЯ ДЛЯ ВКЛЮЧЕНИЯ РЕДАКТИРОВАНИЯ ПОЛЯ =====
    
    /**
     * Включает режим редактирования для указанного поля
     * @param {HTMLElement} fieldElement - Элемент поля (бейдж), которое нужно редактировать
     */
    function enableEditMode(fieldElement) {
        console.log('enableEditMode вызван для:', fieldElement); // Отладочное сообщение
        
        // Если уже есть редактируемое поле, выходим
        if (currentlyEditing) {
            showNotification('Завершите редактирование текущего поля', 'warning');
            return;
        }
        
        // Получаем данные из атрибутов элемента
        const fieldName = fieldElement.getAttribute('data-field'); // Название поля (copies или price_per_sheet)
        const priceId = fieldElement.getAttribute('data-price-id'); // ID записи в базе данных
        const originalValue = fieldElement.getAttribute('data-original-value'); // Исходное значение
        
        console.log('Параметры редактирования:', { fieldName, priceId, originalValue }); // Отладочное сообщение
        
        // Находим соответствующий input для этого поля
        // Ищем input с тем же data-price-id и data-field
        const inputSelector = `.inline-edit-input[data-price-id="${priceId}"][data-field="${fieldName}"]`;
        const targetInput = document.querySelector(inputSelector);
        
        console.log('Ищем input по селектору:', inputSelector); // Отладочное сообщение
        console.log('Найденный input:', targetInput); // Отладочное сообщение
        
        // Если input не найден, выходим
        if (!targetInput) {
            console.error('Input для редактирования не найден для поля', fieldName, 'с ID', priceId);
            showNotification('Ошибка: поле ввода не найдено', 'error');
            return;
        }
        
        // Проверяем и корректируем значение originalValue для input
        let valueForInput = originalValue;
        
        if (valueForInput) {
            // Для поля цены: заменяем запятую на точку (если есть)
            if (fieldName === 'price_per_sheet') {
                valueForInput = valueForInput.replace(',', '.');
            }
            
            // Для поля тиража: убеждаемся, что это целое число
            if (fieldName === 'copies') {
                // Удаляем все нечисловые символы, кроме минуса
                valueForInput = valueForInput.replace(/[^\d.-]/g, '');
                
                // Преобразуем в целое число
                const intValue = parseInt(valueForInput);
                if (!isNaN(intValue)) {
                    valueForInput = intValue.toString();
                }
            }
            
            // Устанавливаем значение в input
            targetInput.value = valueForInput;
            console.log('Установлено значение в input:', valueForInput, 'для поля', fieldName);
        } else {
            console.warn('originalValue пустое для поля', fieldName);
        }
        
        // Сохраняем ссылку на текущее редактируемое поле
        currentlyEditing = {
            fieldElement: fieldElement,
            inputElement: targetInput,
            fieldName: fieldName,
            priceId: priceId,
            originalValue: originalValue
        };
        
        // Скрываем бейдж и показываем input
        fieldElement.style.display = 'none';
        targetInput.style.display = 'inline-block';
        targetInput.style.width = '100px'; // Фиксированная ширина для удобства
        targetInput.focus();
        targetInput.select(); // Выделяем весь текст для удобства редактирования
        
        // Добавляем визуальный эффект (подсветка)
        const row = fieldElement.closest('.table-row');
        if (row) {
            row.classList.add('editing');
        }
        
        // Показываем подсказку
        showNotification('Введите новое значение и нажмите Enter для сохранения', 'info');
    }
    
    // ===== 3. ФУНКЦИЯ ДЛЯ ВЫКЛЮЧЕНИЯ РЕДАКТИРОВАНИЯ =====
    
    /**
     * Выключает режим редактирования
     * @param {boolean} saveChanges - Сохранять ли изменения (true) или отменить (false)
     */
    function disableEditMode(saveChanges) {
        console.log('disableEditMode вызван, saveChanges:', saveChanges); // Отладочное сообщение
        
        // Если нет активного редактирования, выходим
        if (!currentlyEditing) return;
        
        const { fieldElement, inputElement, fieldName, priceId, originalValue } = currentlyEditing;
        const newValue = inputElement.value.trim();
        
        console.log('Текущие значения:', { newValue, originalValue, fieldName, priceId }); // Отладочное сообщение
        
        // Если сохраняем изменения и значение изменилось
        if (saveChanges && newValue !== originalValue) {
            // Проверяем валидность значения
            if (fieldName === 'copies') {
                const copiesValue = parseInt(newValue);
                if (isNaN(copiesValue) || copiesValue < 1) {
                    showNotification('Тираж должен быть целым числом больше 0', 'error');
                    cancelEdit();
                    return;
                }
            }
            
            if (fieldName === 'price_per_sheet') {
                const priceValue = parseFloat(newValue);
                if (isNaN(priceValue) || priceValue < 0.01) {
                    showNotification('Цена должна быть числом больше 0.01', 'error');
                    cancelEdit();
                    return;
                }
            }
            
            // Отправляем AJAX-запрос для сохранения изменений
            saveFieldValue(fieldName, priceId, newValue);
        } else {
            // Отменяем редактирование (не сохраняем изменения)
            cancelEdit();
            
            if (!saveChanges) {
                showNotification('Редактирование отменено', 'info');
            }
        }
    }
    
    // ===== 4. ФУНКЦИЯ ДЛЯ ОТМЕНЫ РЕДАКТИРОВАНИЯ =====
    
    /**
     * Отменяет редактирование и восстанавливает исходное значение
     */
    function cancelEdit() {
        console.log('cancelEdit вызван'); // Отладочное сообщение
        
        if (!currentlyEditing) return;
        
        const { fieldElement, inputElement, originalValue } = currentlyEditing;
        
        // Восстанавливаем исходное значение в input
        if (inputElement && originalValue) {
            let valueForInput = originalValue;
            
            // Для поля цены: заменяем запятую на точку (если есть)
            if (currentlyEditing.fieldName === 'price_per_sheet') {
                valueForInput = valueForInput.replace(',', '.');
            }
            
            inputElement.value = valueForInput;
        }
        
        // Восстанавливаем отображение
        if (fieldElement) {
            fieldElement.style.display = 'inline-block';
        }
        if (inputElement) {
            inputElement.style.display = 'none';
        }
        
        // Убираем визуальный эффект
        if (fieldElement) {
            const row = fieldElement.closest('.table-row');
            if (row) {
                row.classList.remove('editing');
            }
        }
        
        // Сбрасываем текущее редактирование
        currentlyEditing = null;
    }
    
    // ===== 5. ФУНКЦИЯ ДЛЯ СОХРАНЕНИЯ ЗНАЧЕНИЯ ПОЛЯ =====
    
    /**
     * Отправляет AJAX-запрос для сохранения нового значения поля
     * @param {string} fieldName - Название поля (copies или price_per_sheet)
     * @param {string} priceId - ID записи в базе данных
     * @param {string} newValue - Новое значение
     */
    function saveFieldValue(fieldName, priceId, newValue) {
        console.log('saveFieldValue вызван:', { fieldName, priceId, newValue }); // Отладочное сообщение
        
        if (!currentlyEditing) return;
        
        const { fieldElement, inputElement } = currentlyEditing;
        
        // Показываем индикатор загрузки
        const savingText = fieldName === 'copies' ? 'Сохранение...' : 'Сохранение...';
        if (fieldElement) {
            fieldElement.textContent = savingText;
            fieldElement.style.display = 'inline-block';
        }
        if (inputElement) {
            inputElement.style.display = 'none';
        }
        
        // Подготавливаем данные для отправки
        const formData = new FormData();
        formData.append('field_name', fieldName);
        formData.append('new_value', newValue);
        formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));
        
        console.log('Отправляем данные:', { fieldName, newValue }); // Отладочное сообщение
        
        // Отправляем AJAX-запрос
        fetch(`/print_price/api/update/${priceId}/`, {
            method: 'POST',
            body: formData,
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(response => {
            console.log('Получен ответ:', response.status); // Отладочное сообщение
            if (!response.ok) {
                throw new Error(`HTTP ошибка! статус: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Данные ответа:', data); // Отладочное сообщение
            if (data.success) {
                // Обновляем данные на странице
                updateFieldDisplay(fieldName, priceId, data.print_price);
                
                // Показываем сообщение об успехе
                showNotification('Значение успешно обновлено', 'success');
                
                // Сбрасываем текущее редактирование
                currentlyEditing = null;
                
                // Убираем визуальный эффект
                if (fieldElement) {
                    const row = fieldElement.closest('.table-row');
                    if (row) {
                        row.classList.remove('editing');
                    }
                }
            } else {
                // Показываем ошибку
                showNotification(`Ошибка: ${data.error}`, 'error');
                
                // Восстанавливаем исходное значение
                cancelEdit();
            }
        })
        .catch(error => {
            console.error('Ошибка при сохранении:', error);
            showNotification('Ошибка при сохранении. Проверьте подключение к интернету.', 'error');
            
            // Восстанавливаем исходное значение
            cancelEdit();
        });
    }
    
    // ===== 6. ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ ОТОБРАЖЕНИЯ ПОСЛЕ СОХРАНЕНИЯ =====
    
    /**
     * Обновляет отображение поля после успешного сохранения
     * @param {string} fieldName - Название поля (copies или price_per_sheet)
     * @param {string} priceId - ID записи в базе данных
     * @param {object} priceData - Данные о цене из ответа сервера
     */
    function updateFieldDisplay(fieldName, priceId, priceData) {
        console.log('updateFieldDisplay вызван:', { fieldName, priceId, priceData }); // Отладочное сообщение
        
        // Находим строку таблицы с данным priceId
        const tableRow = document.querySelector(`.table-row[data-price-id="${priceId}"]`);
        if (!tableRow) {
            console.error('Строка таблицы не найдена для priceId:', priceId);
            return;
        }
        
        if (fieldName === 'copies') {
            // Обновляем бейдж тиража
            const copiesBadge = tableRow.querySelector('.copies-badge');
            if (copiesBadge && priceData.copies_display) {
                copiesBadge.textContent = priceData.copies_display;
                copiesBadge.setAttribute('data-original-value', priceData.copies.toString());
            }
            
            // Обновляем input тиража
            const copiesInput = tableRow.querySelector('.copies-input');
            if (copiesInput && priceData.copies) {
                copiesInput.value = priceData.copies.toString();
            }
            
            // Обновляем кнопку удаления (если нужно)
            const deleteBtn = tableRow.querySelector('.btn-delete');
            if (deleteBtn && priceData.copies) {
                deleteBtn.setAttribute('data-price-copies', priceData.copies.toString());
            }
        } else if (fieldName === 'price_per_sheet') {
            // Обновляем бейдж цены за лист
            const priceBadge = tableRow.querySelector('.price-per-sheet-badge');
            if (priceBadge && priceData.price_per_sheet_display) {
                priceBadge.textContent = priceData.price_per_sheet_display;
                // Сохраняем значение в правильном формате (с точкой)
                const priceValue = parseFloat(priceData.price_per_sheet).toFixed(2);
                priceBadge.setAttribute('data-original-value', priceValue);
            }
            
            // Обновляем input цены
            const priceInput = tableRow.querySelector('.price-per-sheet-input');
            if (priceInput && priceData.price_per_sheet) {
                // Форматируем значение для input (с точкой)
                const priceValue = parseFloat(priceData.price_per_sheet).toFixed(2);
                priceInput.value = priceValue;
            }
        }
        
        // Обновляем общую стоимость (она зависит от обоих полей)
        const totalPriceBadge = tableRow.querySelector('.total-price-badge');
        if (totalPriceBadge && priceData.total_price_display) {
            totalPriceBadge.textContent = priceData.total_price_display;
        }
    }
    
    // ===== 7. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====
    
    // Обработчик двойного клика для редактируемых полей
    document.addEventListener('dblclick', function(event) {
        console.log('Двойной клик по:', event.target); // Отладочное сообщение
        
        // Проверяем, был ли клик по редактируемому полю
        const editableField = event.target.closest('.editable-field');
        
        if (editableField) {
            console.log('Найден редактируемый элемент:', editableField); // Отладочное сообщение
            // Включаем режим редактирования
            enableEditMode(editableField);
            
            // Предотвращаем дальнейшую обработку события
            event.stopPropagation();
            event.preventDefault();
        }
    });
    
    // Обработчик нажатия клавиш
    document.addEventListener('keydown', function(event) {
        // Если есть активное редактирование
        if (currentlyEditing && currentlyEditing.inputElement) {
            const inputElement = currentlyEditing.inputElement;
            
            console.log('Нажата клавиша:', event.key); // Отладочное сообщение
            
            // Если нажат Enter - сохраняем изменения
            if (event.key === 'Enter') {
                disableEditMode(true);
                event.preventDefault();
            }
            
            // Если нажат Escape - отменяем редактирование
            if (event.key === 'Escape') {
                disableEditMode(false);
                event.preventDefault();
            }
        }
    });
    
    // Обработчик потери фокуса полем ввода
    document.addEventListener('focusout', function(event) {
        // Проверяем, потерял ли фокус текущее поле ввода
        if (currentlyEditing && currentlyEditing.inputElement === event.target) {
            console.log('Поле ввода потеряло фокус'); // Отладочное сообщение
            
            // Используем setTimeout, чтобы дать время для обработки кликов на других элементах
            setTimeout(() => {
                // Проверяем, не перешел ли фокус на другое поле ввода на этой же строке
                const isStillFocused = document.activeElement === currentlyEditing.inputElement;
                
                console.log('Фокус все еще на поле ввода?', isStillFocused); // Отладочное сообщение
                
                // Если фокус не на другом поле ввода, сохраняем изменения
                if (!isStillFocused && currentlyEditing) {
                    disableEditMode(true);
                }
            }, 100);
        }
    });
    
    // Обработчик клика вне поля редактирования
    document.addEventListener('click', function(event) {
        // Если есть активное редактирование и клик был вне поля ввода
        if (currentlyEditing && currentlyEditing.inputElement) {
            const inputElement = currentlyEditing.inputElement;
            const fieldElement = currentlyEditing.fieldElement;
            
            // Проверяем, был ли клик внутри поля редактирования
            const isClickInside = (inputElement && inputElement.contains(event.target)) || 
                                  (fieldElement && fieldElement.contains(event.target));
            
            console.log('Клик внутри поля редактирования?', isClickInside); // Отладочное сообщение
            
            // Если клик был вне поля редактирования, сохраняем изменения
            if (!isClickInside) {
                disableEditMode(true);
            }
        }
    });
    
    // ===== 8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
    
    /**
     * Получает значение cookie по имени
     * @param {string} name - Имя cookie
     * @returns {string|null} Значение cookie или null, если не найдено
     */
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
    
    /**
     * Показывает уведомление на странице
     * @param {string} message - Текст сообщения
     * @param {string} type - Тип сообщения (success, error, warning, info)
     */
    function showNotification(message, type = 'info') {
        console.log('Показываем уведомление:', message, type); // Отладочное сообщение
        
        // Удаляем старые уведомления
        const oldNotifications = document.querySelectorAll('.inline-edit-notification');
        oldNotifications.forEach(n => {
            if (n.parentNode) {
                n.parentNode.removeChild(n);
            }
        });
        
        // Создаем элемент уведомления
        const notification = document.createElement('div');
        notification.className = `inline-edit-notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 10000;
            animation: fadeInOut 5s ease-in-out;
        `;
        
        // Настраиваем цвет в зависимости от типа
        if (type === 'success') {
            notification.style.backgroundColor = '#4CAF50'; // Зеленый
        } else if (type === 'error') {
            notification.style.backgroundColor = '#F44336'; // Красный
        } else if (type === 'warning') {
            notification.style.backgroundColor = '#FF9800'; // Оранжевый
        } else {
            notification.style.backgroundColor = '#2196F3'; // Синий
        }
        
        // Добавляем стили для анимации
        const styleId = 'inline-edit-notification-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateY(-20px); }
                    10% { opacity: 1; transform: translateY(0); }
                    90% { opacity: 1; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-20px); }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Добавляем уведомление на страницу
        document.body.appendChild(notification);
        
        // Удаляем уведомление через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
    
    // ===== 9. ИНИЦИАЛИЗАЦИЯ =====
    
    // Проверяем, есть ли на странице редактируемые поля
    const editableFields = document.querySelectorAll('.editable-field');
    console.log('Найдено редактируемых полей:', editableFields.length); // Отладочное сообщение
    
    // Проверяем, есть ли поля ввода
    const inputFields = document.querySelectorAll('.inline-edit-input');
    console.log('Найдено полей ввода:', inputFields.length); // Отладочное сообщение
    
    if (editableFields.length > 0) {
        console.log('In-line редактирование инициализировано для', editableFields.length, 'полей');
        
        // Добавляем курсор-указатель для редактируемых полей
        editableFields.forEach(field => {
            field.style.cursor = 'pointer';
        });
    }
    
    // ===== 10. ДЕБАГГИНГ =====
    
    // Добавляем глобальную функцию для отладки
    window.debugInlineEdit = function() {
        console.log('=== DEBUG INLINE EDIT ===');
        console.log('currentlyEditing:', currentlyEditing);
        
        // Проверяем все редактируемые поля
        const allFields = document.querySelectorAll('.editable-field');
        console.log('Все редактируемые поля:', allFields.length);
        
        allFields.forEach((field, index) => {
            console.log(`Поле ${index + 1}:`, {
                field: field.getAttribute('data-field'),
                priceId: field.getAttribute('data-price-id'),
                originalValue: field.getAttribute('data-original-value'),
                textContent: field.textContent
            });
        });
        
        // Проверяем все поля ввода
        const allInputs = document.querySelectorAll('.inline-edit-input');
        console.log('Все поля ввода:', allInputs.length);
        
        allInputs.forEach((input, index) => {
            console.log(`Input ${index + 1}:`, {
                field: input.getAttribute('data-field'),
                priceId: input.getAttribute('data-price-id'),
                value: input.value,
                defaultValue: input.defaultValue
            });
        });
        
        console.log('=========================');
    };
    
    // Добавляем функцию для проверки конкретного поля
    window.checkFieldValue = function(priceId, fieldName) {
        const field = document.querySelector(`.editable-field[data-price-id="${priceId}"][data-field="${fieldName}"]`);
        const input = document.querySelector(`.inline-edit-input[data-price-id="${priceId}"][data-field="${fieldName}"]`);
        
        console.log('=== CHECK FIELD VALUE ===');
        console.log('Field:', field);
        console.log('Field data-original-value:', field ? field.getAttribute('data-original-value') : 'null');
        console.log('Input:', input);
        console.log('Input value:', input ? input.value : 'null');
        console.log('Input defaultValue:', input ? input.defaultValue : 'null');
        console.log('=========================');
    };
});