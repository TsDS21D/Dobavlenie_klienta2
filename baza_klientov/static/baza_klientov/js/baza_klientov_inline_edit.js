/*
baza_klientov_inline_edit.js - JavaScript для in-line редактирования клиентов и контактов
ИСПРАВЛЕНИЯ:
1. Уточнены селекторы для предотвращения конфликтов с формами
2. Исправлено сравнение значений boolean (добавлено .toLowerCase() для атрибута)
3. Добавлено inline-редактирование для контактных лиц
4. Добавлено inline-редактирование для метки ЭДО
5. Добавлено inline-редактирование для метки "основное" в контактах
6. ИСПРАВЛЕНИЕ: Добавлена задержка для обработки blur событий при двойном клике
*/

// Глобальные переменные для отслеживания состояния редактирования
let currentlyEditing = null;  // Текущий редактируемый элемент
let originalValue = null;     // Оригинальное значение перед редактированием
let isProcessingDoubleClick = false;  // Флаг для обработки двойного клика
let ignoreBlurTimeout = null;  // Таймер для игнорирования blur события

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('Инициализация in-line редактирования для клиентов и контактов...');
    
    // Инициализация обработчиков для редактируемых полей клиентов
    initClientInlineEditListeners();
    
    // Инициализация обработчиков для редактируемых полей контактов
    initContactInlineEditListeners();
    
    // Инициализация обработчиков для метки ЭДО
    initEdoEditListeners();
    
    // Инициализация обработчиков для метки "основное" в контактах
    initPrimaryEditListeners();
    
    // Инициализация обработчиков для полей ввода
    initInlineInputListeners();
    
    // Инициализация обработчика нажатия клавиш
    document.addEventListener('keydown', handleKeyPress);
});

// Инициализация обработчиков для редактируемых полей клиентов
function initClientInlineEditListeners() {
    console.log('Инициализация обработчиков редактируемых полей клиентов...');
    
    // ИСПРАВЛЕНИЕ: Ограничиваем селекторы только правой колонкой, где находятся детали клиента
    // Это предотвращает конфликты с формами в левой колонке
    const clientDetailsSection = document.querySelector('.client-details-section');
    if (!clientDetailsSection) return;
    
    // Обработчики для всех редактируемых полей клиента в правой колонке
    clientDetailsSection.querySelectorAll('.editable-field, .editable-text').forEach(field => {
        // Проверяем, что элемент действительно имеет необходимые атрибуты для редактирования
        if (field.hasAttribute('data-field') && (field.hasAttribute('data-client-id') || field.hasAttribute('data-contact-id'))) {
            // Двойной клик запускает редактирование
            field.addEventListener('dblclick', function(e) {
                isProcessingDoubleClick = true; // Устанавливаем флаг двойного клика
                setTimeout(() => { isProcessingDoubleClick = false; }, 300); // Сбрасываем через 300мс
                startInlineEdit(e);
            });
            // Одиночный клик обрабатывается отдельно
            field.addEventListener('click', handleSingleClick);
        }
    });
    
    // Обработчики для текстовых областей клиента
    clientDetailsSection.querySelectorAll('.editable-text').forEach(textArea => {
        if (textArea.hasAttribute('data-field') && (textArea.hasAttribute('data-client-id') || textArea.hasAttribute('data-contact-id'))) {
            textArea.addEventListener('dblclick', function(e) {
                isProcessingDoubleClick = true;
                setTimeout(() => { isProcessingDoubleClick = false; }, 300);
                startTextAreaEdit(e);
            });
        }
    });
}

// Инициализация обработчиков для редактируемых полей контактов
function initContactInlineEditListeners() {
    console.log('Инициализация обработчиков редактируемых полей контактов...');
    
    // ИСПРАВЛЕНИЕ: Ограничиваем селекторы только разделом с контактами
    const contactsSection = document.querySelector('.contacts-section');
    if (!contactsSection) return;
    
    // Обработчики для редактируемых полей контактов (кроме метки "основное")
    contactsSection.querySelectorAll('.contact-full-name-field, .contact-position-field, .contact-phone-field, .contact-mobile-field, .contact-email-field, .contact-comments-field').forEach(field => {
        // Проверяем наличие необходимых атрибутов
        if (field.hasAttribute('data-field') && field.hasAttribute('data-contact-id')) {
            field.addEventListener('dblclick', function(e) {
                isProcessingDoubleClick = true;
                setTimeout(() => { isProcessingDoubleClick = false; }, 300);
                startContactInlineEdit(e);
            });
            field.addEventListener('click', handleSingleClick);
        }
    });
    
    // Обработчики для текстовых областей контактов (комментарии)
    contactsSection.querySelectorAll('.contact-comments-field').forEach(textArea => {
        if (textArea.hasAttribute('data-field') && textArea.hasAttribute('data-contact-id')) {
            textArea.addEventListener('dblclick', function(e) {
                isProcessingDoubleClick = true;
                setTimeout(() => { isProcessingDoubleClick = false; }, 300);
                startContactTextAreaEdit(e);
            });
        }
    });
}

// Инициализация обработчиков для метки ЭДО
function initEdoEditListeners() {
    console.log('Инициализация обработчиков для метки ЭДО...');
    
    // ИСПРАВЛЕНИЕ: Ограничиваем селекторы только правой колонкой
    const clientDetailsSection = document.querySelector('.client-details-section');
    if (!clientDetailsSection) return;
    
    // Обработчики для метки ЭДО (зеленая/серая метка)
    clientDetailsSection.querySelectorAll('.editable-eto').forEach(field => {
        if (field.hasAttribute('data-client-id')) {
            field.addEventListener('dblclick', function(e) {
                isProcessingDoubleClick = true;
                setTimeout(() => { isProcessingDoubleClick = false; }, 300);
                toggleEdoStatus(e);
            });
            field.addEventListener('click', handleSingleClick);
        }
    });
    
    // Также обрабатываем метки ЭДО в списке клиентов
    const clientsList = document.querySelector('.clients-list');
    if (clientsList) {
        clientsList.querySelectorAll('.edo-badge-active, .edo-badge-inactive').forEach(field => {
            field.addEventListener('dblclick', function(e) {
                isProcessingDoubleClick = true;
                setTimeout(() => { isProcessingDoubleClick = false; }, 300);
                
                // Предотвращаем переход по ссылке
                e.preventDefault();
                e.stopPropagation();
                
                // Находим ID клиента из родительского элемента
                const clientItem = this.closest('.client-item');
                if (clientItem) {
                    const link = clientItem.getAttribute('href');
                    const clientIdMatch = link.match(/client_id=(\d+)/);
                    if (clientIdMatch && clientIdMatch[1]) {
                        toggleEdoStatusForClient(clientIdMatch[1], this);
                    }
                }
            });
        });
    }
}

// Инициализация обработчиков для метки "основное" в контактах
function initPrimaryEditListeners() {
    console.log('Инициализация обработчиков для метки "основное"...');
    
    // ИСПРАВЛЕНИЕ: Ограничиваем селекторы только разделом с контактами
    const contactsSection = document.querySelector('.contacts-section');
    if (!contactsSection) return;
    
    // Обработчики для метки "основное" (теперь по двойному клику)
    contactsSection.querySelectorAll('.editable-primary').forEach(field => {
        if (field.hasAttribute('data-contact-id')) {
            field.addEventListener('dblclick', function(e) {
                isProcessingDoubleClick = true;
                setTimeout(() => { isProcessingDoubleClick = false; }, 300);
                togglePrimaryStatus(e);
            });
            field.addEventListener('click', handleSingleClick);
        }
    });
}

// Инициализация обработчиков для полей ввода
function initInlineInputListeners() {
    // ИСПРАВЛЕНИЕ: Ограничиваем селекторы только разделами с деталями клиента и контактами
    const clientDetailsSection = document.querySelector('.client-details-section');
    if (clientDetailsSection) {
        // Обработчики для полей ввода клиентов
        clientDetailsSection.querySelectorAll('.inline-edit-input, .inline-edit-textarea').forEach(input => {
            // ИСПРАВЛЕНИЕ: Добавляем задержку для обработки blur при двойном клике
            input.addEventListener('blur', function(e) {
                if (ignoreBlurTimeout) {
                    clearTimeout(ignoreBlurTimeout);
                }
                
                // Если это двойной клик, игнорируем blur на короткое время
                if (isProcessingDoubleClick) {
                    ignoreBlurTimeout = setTimeout(() => {
                        finishInlineEdit(e);
                    }, 100);
                } else {
                    finishInlineEdit(e);
                }
            });
            input.addEventListener('keydown', handleInputKeyPress);
        });
    }
    
    const contactsSection = document.querySelector('.contacts-section');
    if (contactsSection) {
        // Обработчики для полей ввода контактов
        contactsSection.querySelectorAll('.contact-full-name-input, .contact-position-input, .contact-phone-input, .contact-mobile-input, .contact-email-input, .contact-comments-textarea').forEach(input => {
            // ИСПРАВЛЕНИЕ: Добавляем задержку для обработки blur при двойном клике
            input.addEventListener('blur', function(e) {
                if (ignoreBlurTimeout) {
                    clearTimeout(ignoreBlurTimeout);
                }
                
                // Если это двойной клик, игнорируем blur на короткое время
                if (isProcessingDoubleClick) {
                    ignoreBlurTimeout = setTimeout(() => {
                        finishContactInlineEdit(e);
                    }, 100);
                } else {
                    finishContactInlineEdit(e);
                }
            });
            input.addEventListener('keydown', handleContactInputKeyPress);
        });
    }
}

// Начало in-line редактирования для клиентов (для полей ввода)
function startInlineEdit(e) {
    e.stopPropagation(); // Останавливаем всплытие события
    
    const field = e.currentTarget; // Получаем элемент, на который кликнули
    const fieldType = field.getAttribute('data-field'); // Тип поля (name, discount и т.д.)
    const clientId = field.getAttribute('data-client-id'); // ID клиента
    const contactId = field.getAttribute('data-contact-id'); // ID контакта (может быть null)
    const originalValue = field.getAttribute('data-original-value') || field.textContent; // Оригинальное значение
    
    // ИСПРАВЛЕНИЕ: Проверяем наличие обязательных атрибутов
    if (!fieldType || (!clientId && !contactId)) {
        console.debug('Элемент не предназначен для inline-редактирования:', field);
        return; // Просто выходим без ошибки
    }
    
    // Если уже редактируем другое поле, завершаем предыдущее редактирование
    if (currentlyEditing) {
        finishInlineEdit();
    }
    
    // Сохраняем текущее состояние
    currentlyEditing = {
        field: field,
        fieldType: fieldType,
        clientId: clientId,
        contactId: contactId,
        originalValue: originalValue,
        isContact: !!contactId // Это поле контакта, если есть contactId
    };
    
    // Скрываем текстовое поле
    field.style.display = 'none';
    field.classList.add('editing'); // Добавляем класс для стилизации
    
    // Находим соответствующее поле ввода
    let inputField;
    
    if (fieldType === 'name') {
        inputField = field.parentNode.querySelector('.client-name-input');
    } else if (fieldType === 'discount') {
        inputField = field.parentNode.querySelector('.discount-input');
    } else if (fieldType === 'address') {
        inputField = field.parentNode.querySelector('.address-textarea');
    } else if (fieldType === 'bank_details') {
        inputField = field.parentNode.querySelector('.bank-details-textarea');
    } else if (fieldType === 'full_name' && contactId) {
        inputField = field.parentNode.querySelector('.contact-full-name-input');
    } else if (fieldType === 'position' && contactId) {
        inputField = field.parentNode.querySelector('.contact-position-input');
    } else if (fieldType === 'phone' && contactId) {
        inputField = field.parentNode.querySelector('.contact-phone-input');
    } else if (fieldType === 'mobile' && contactId) {
        inputField = field.parentNode.querySelector('.contact-mobile-input');
    } else if (fieldType === 'email' && contactId) {
        inputField = field.parentNode.querySelector('.contact-email-input');
    }
    
    if (!inputField) {
        console.debug('Не найдено поле ввода для', fieldType, 'в элементе:', field);
        restoreField(field); // Восстанавливаем поле
        return;
    }
    
    // Показываем поле ввода
    inputField.style.display = 'block';
    
    // ИСПРАВЛЕНИЕ: Добавляем небольшую задержку перед фокусировкой
    // Это помогает предотвратить немедленное срабатывание blur при двойном клике
    setTimeout(() => {
        if (inputField.style.display === 'block') {
            inputField.focus(); // Устанавливаем фокус
            // Выделяем текст в поле ввода
            if (fieldType !== 'discount') {
                inputField.select(); // Выделяем весь текст
            }
        }
    }, 10);
    
    console.log('Начато редактирование поля:', { fieldType, clientId, contactId, originalValue });
}

// Начало in-line редактирования для клиентов (для текстовых областей)
function startTextAreaEdit(e) {
    e.stopPropagation(); // Останавливаем всплытие события
    
    const field = e.currentTarget;
    const fieldType = field.getAttribute('data-field');
    const clientId = field.getAttribute('data-client-id');
    const contactId = field.getAttribute('data-contact-id');
    const originalValue = field.getAttribute('data-original-value') || field.textContent;
    
    // ИСПРАВЛЕНИЕ: Проверяем наличие обязательных атрибутов
    if (!fieldType || (!clientId && !contactId)) {
        console.debug('Элемент не предназначен для inline-редактирования (textarea):', field);
        return;
    }
    
    // Если уже редактируем другое поле, завершаем предыдущее редактирование
    if (currentlyEditing) {
        finishInlineEdit();
    }
    
    // Сохраняем текущее состояние
    currentlyEditing = {
        field: field,
        fieldType: fieldType,
        clientId: clientId,
        contactId: contactId,
        originalValue: originalValue,
        isContact: !!contactId, // Это поле контакта, если есть contactId
        isTextarea: true // Это текстовое поле
    };
    
    // Скрываем текстовое поле
    field.style.display = 'none';
    field.classList.add('editing');
    
    // Находим соответствующее текстовое поле
    let textareaField;
    
    if (fieldType === 'address') {
        textareaField = field.parentNode.querySelector('.address-textarea');
    } else if (fieldType === 'bank_details') {
        textareaField = field.parentNode.querySelector('.bank-details-textarea');
    } else if (fieldType === 'comments' && contactId) {
        textareaField = field.parentNode.querySelector('.contact-comments-textarea');
    }
    
    if (!textareaField) {
        console.debug('Не найдено текстовое поле для', fieldType, 'в элементе:', field);
        restoreField(field);
        return;
    }
    
    // Устанавливаем значение
    textareaField.value = originalValue;
    
    // Показываем текстовое поле
    textareaField.style.display = 'block';
    
    // ИСПРАВЛЕНИЕ: Добавляем небольшую задержку перед фокусировкой
    setTimeout(() => {
        if (textareaField.style.display === 'block') {
            textareaField.focus();
            // Помещаем курсор в конец текста
            textareaField.selectionStart = textareaField.value.length;
            textareaField.selectionEnd = textareaField.value.length;
        }
    }, 10);
    
    console.log('Начато редактирование текстовой области:', { fieldType, clientId, contactId });
}

// Начало in-line редактирования для контактов
function startContactInlineEdit(e) {
    e.stopPropagation();
    
    const field = e.currentTarget;
    const fieldType = field.getAttribute('data-field');
    const contactId = field.getAttribute('data-contact-id');
    const originalValue = field.getAttribute('data-original-value') || field.textContent;
    
    // ИСПРАВЛЕНИЕ: Проверяем наличие обязательных атрибутов
    if (!fieldType || !contactId) {
        console.debug('Элемент не предназначен для inline-редактирования контакта:', field);
        return;
    }
    
    // Если уже редактируем другое поле, завершаем предыдущее редактирование
    if (currentlyEditing) {
        finishInlineEdit();
    }
    
    // Сохраняем текущее состояние
    currentlyEditing = {
        field: field,
        fieldType: fieldType,
        contactId: contactId,
        originalValue: originalValue,
        isContact: true // Это поле контакта
    };
    
    // Скрываем текстовое поле
    field.style.display = 'none';
    field.classList.add('editing');
    
    // Находим соответствующее поле ввода
    let inputField;
    
    if (fieldType === 'full_name') {
        inputField = field.parentNode.querySelector('.contact-full-name-input');
    } else if (fieldType === 'position') {
        inputField = field.parentNode.querySelector('.contact-position-input');
    } else if (fieldType === 'phone') {
        inputField = field.parentNode.querySelector('.contact-phone-input');
    } else if (fieldType === 'mobile') {
        inputField = field.parentNode.querySelector('.contact-mobile-input');
    } else if (fieldType === 'email') {
        inputField = field.parentNode.querySelector('.contact-email-input');
    }
    
    if (!inputField) {
        console.debug('Не найдено поле ввода для контакта', fieldType, 'в элементе:', field);
        restoreField(field);
        return;
    }
    
    // Показываем поле ввода
    inputField.style.display = 'block';
    
    // ИСПРАВЛЕНИЕ: Добавляем небольшую задержку перед фокусировкой
    setTimeout(() => {
        if (inputField.style.display === 'block') {
            inputField.focus();
            // Выделяем текст в поле ввода
            inputField.select();
        }
    }, 10);
    
    console.log('Начато редактирование поля контакта:', { fieldType, contactId, originalValue });
}

// Начало in-line редактирования для контактов (текстовые области)
function startContactTextAreaEdit(e) {
    e.stopPropagation();
    
    const field = e.currentTarget;
    const fieldType = field.getAttribute('data-field');
    const contactId = field.getAttribute('data-contact-id');
    const originalValue = field.getAttribute('data-original-value') || field.textContent;
    
    // ИСПРАВЛЕНИЕ: Проверяем наличие обязательных атрибутов
    if (!fieldType || !contactId) {
        console.debug('Элемент не предназначен для inline-редактирования контакта (textarea):', field);
        return;
    }
    
    // Если уже редактируем другое поле, завершаем предыдущее редактирование
    if (currentlyEditing) {
        finishInlineEdit();
    }
    
    // Сохраняем текущее состояние
    currentlyEditing = {
        field: field,
        fieldType: fieldType,
        contactId: contactId,
        originalValue: originalValue,
        isContact: true, // Это поле контакта
        isTextarea: true // Это текстовое поле
    };
    
    // Скрываем текстовое поле
    field.style.display = 'none';
    field.classList.add('editing');
    
    // Находим соответствующее текстовое поле
    let textareaField = field.parentNode.querySelector('.contact-comments-textarea');
    
    if (!textareaField) {
        console.debug('Не найдено текстовое поле для контакта', fieldType, 'в элементе:', field);
        restoreField(field);
        return;
    }
    
    // Устанавливаем значение
    textareaField.value = originalValue;
    
    // Показываем текстовое поле
    textareaField.style.display = 'block';
    
    // ИСПРАВЛЕНИЕ: Добавляем небольшую задержку перед фокусировкой
    setTimeout(() => {
        if (textareaField.style.display === 'block') {
            textareaField.focus();
            // Помещаем курсор в конец текста
            textareaField.selectionStart = textareaField.value.length;
            textareaField.selectionEnd = textareaField.value.length;
        }
    }, 10);
    
    console.log('Начато редактирование текстовой области контакта:', { fieldType, contactId });
}

// Завершение in-line редактирования для клиентов
function finishInlineEdit(e) {
    if (!currentlyEditing || currentlyEditing.isContact) return; // Если не редактируем или это контакт
    
    const { field, fieldType, clientId, originalValue, isTextarea } = currentlyEditing;
    
    // Находим поле ввода
    let inputField;
    if (isTextarea) {
        if (fieldType === 'address') {
            inputField = field.parentNode.querySelector('.address-textarea');
        } else if (fieldType === 'bank_details') {
            inputField = field.parentNode.querySelector('.bank-details-textarea');
        }
    } else {
        if (fieldType === 'name') {
            inputField = field.parentNode.querySelector('.client-name-input');
        } else if (fieldType === 'discount') {
            inputField = field.parentNode.querySelector('.discount-input');
        }
    }
    
    if (!inputField) {
        console.debug('Не найдено поле ввода при завершении редактирования');
        restoreField(field);
        currentlyEditing = null;
        return;
    }
    
    const newValue = inputField.value.trim(); // Получаем новое значение, убирая пробелы
    
    // Проверяем, изменилось ли значение
    if (newValue === originalValue || newValue === field.textContent.trim()) {
        // Значение не изменилось, просто восстанавливаем поле
        restoreField(field);
        currentlyEditing = null;
        return;
    }
    
    // Валидация значения
    if (!validateInlineValue(fieldType, newValue)) {
        // Значение не прошло валидацию, восстанавливаем оригинальное значение
        inputField.value = originalValue;
        restoreField(field);
        currentlyEditing = null;
        return;
    }
    
    // Показываем индикатор загрузки
    field.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    field.style.display = 'inline-block';
    inputField.style.display = 'none';
    
    // Отправляем данные на сервер
    saveInlineEdit(fieldType, clientId, newValue, field, inputField);
}

// Завершение in-line редактирования для контактов
function finishContactInlineEdit(e) {
    if (!currentlyEditing || !currentlyEditing.isContact) return; // Если не редактируем контакт
    
    const { field, fieldType, contactId, originalValue } = currentlyEditing;
    
    // Находим поле ввода
    let inputField;
    if (fieldType === 'full_name') {
        inputField = field.parentNode.querySelector('.contact-full-name-input');
    } else if (fieldType === 'position') {
        inputField = field.parentNode.querySelector('.contact-position-input');
    } else if (fieldType === 'phone') {
        inputField = field.parentNode.querySelector('.contact-phone-input');
    } else if (fieldType === 'mobile') {
        inputField = field.parentNode.querySelector('.contact-mobile-input');
    } else if (fieldType === 'email') {
        inputField = field.parentNode.querySelector('.contact-email-input');
    } else if (fieldType === 'comments') {
        inputField = field.parentNode.querySelector('.contact-comments-textarea');
    }
    
    if (!inputField) {
        console.debug('Не найдено поле ввода контакта при завершении редактирования');
        restoreField(field);
        currentlyEditing = null;
        return;
    }
    
    const newValue = inputField.value.trim();
    
    // Проверяем, изменилось ли значение
    if (newValue === originalValue || newValue === field.textContent.trim()) {
        // Значение не изменилось, просто восстанавливаем поле
        restoreField(field);
        currentlyEditing = null;
        return;
    }
    
    // Валидация значения
    if (!validateContactInlineValue(fieldType, newValue)) {
        // Значение не прошло валидацию, восстанавливаем оригинальное значение
        inputField.value = originalValue;
        restoreField(field);
        currentlyEditing = null;
        return;
    }
    
    // Показываем индикатор загрузки
    field.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    field.style.display = 'inline-block';
    inputField.style.display = 'none';
    
    // Отправляем данные на сервер
    saveContactInlineEdit(fieldType, contactId, newValue, field, inputField);
}

// Валидация значения при in-line редактировании клиентов
function validateInlineValue(fieldType, value) {
    switch (fieldType) {
        case 'discount':
            const discount = parseInt(value); // Преобразуем строку в число
            return !isNaN(discount) && discount >= 0 && discount <= 100; // Проверяем диапазон
        
        case 'name':
            return value.length > 0 && value.length <= 255; // Не пустое и не слишком длинное
        
        case 'address':
        case 'bank_details':
            return value.length <= 2000; // Ограничение для текстовых полей
        
        default:
            return true; // Для остальных полей всегда true
    }
}

// Валидация значения при in-line редактировании контактов
function validateContactInlineValue(fieldType, value) {
    switch (fieldType) {
        case 'full_name':
            return value.length > 0 && value.length <= 255; // Обязательное поле
        
        case 'position':
        case 'phone':
        case 'mobile':
            return value.length <= 255; // Ограничение длины
        
        case 'email':
            // Проверяем email только если он не пустой
            if (value === '') return true; // Пустой email допустим
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Регулярное выражение для email
            return emailRegex.test(value) && value.length <= 254; // Проверяем формат и длину
        
        case 'comments':
            return value.length <= 1000; // Ограничение для комментариев
        
        default:
            return true;
    }
}

// Сохранение изменений клиента через AJAX
function saveInlineEdit(fieldType, clientId, newValue, fieldElement, inputElement) {
    console.log('Сохранение изменений клиента:', { fieldType, clientId, newValue });
    
    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('field_name', fieldType);
    formData.append('new_value', newValue);
    formData.append('csrfmiddlewaretoken', getCookie('csrftoken')); // CSRF токен для безопасности
    
    // Отправляем AJAX запрос
    fetch(`/baza_klientov/api/update_client/${clientId}/`, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest', // Указываем, что это AJAX запрос
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`); // Обработка HTTP ошибок
        }
        return response.json(); // Преобразуем ответ в JSON
    })
    .then(data => {
        if (data.success) {
            console.log('Изменения клиента сохранены:', data);
            
            // Обновляем отображаемое значение
            updateFieldDisplay(fieldElement, fieldType, data.client);
            
            // Показываем уведомление об успехе
            showNotification('Изменения сохранены', 'success');
            
            // Если это поле ЭДО, обновляем метку в списке клиентов
            if (fieldType === 'has_edo') {
                updateEdoBadgeInList(clientId, data.client.has_edo);
            }
        } else {
            // Показываем ошибку
            console.error('Ошибка при сохранении клиента:', data.error);
            showNotification(data.error || 'Ошибка при сохранении', 'error');
            
            // Восстанавливаем оригинальное значение
            restoreField(fieldElement);
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке данных клиента:', error);
        showNotification('Ошибка соединения с сервером', 'error');
        
        // Восстанавливаем оригинальное значение
        restoreField(fieldElement);
    })
    .finally(() => {
        // Скрываем поле ввода
        if (inputElement) {
            inputElement.style.display = 'none';
        }
        
        // Сбрасываем состояние редактирования
        currentlyEditing = null;
        isProcessingDoubleClick = false;
        if (ignoreBlurTimeout) {
            clearTimeout(ignoreBlurTimeout);
            ignoreBlurTimeout = null;
        }
    });
}

// Сохранение изменений контакта через AJAX
function saveContactInlineEdit(fieldType, contactId, newValue, fieldElement, inputElement) {
    console.log('Сохранение изменений контакта:', { fieldType, contactId, newValue });
    
    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('field_name', fieldType);
    formData.append('new_value', newValue);
    formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));
    
    // Отправляем AJAX запрос
    fetch(`/baza_klientov/api/update_contact/${contactId}/`, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('Изменения контакта сохранены:', data);
            
            // Обновляем отображаемое значение
            updateContactFieldDisplay(fieldElement, fieldType, data.contact);
            
            // Показываем уведомление об успехе
            showNotification('Изменения контакта сохранены', 'success');
        } else {
            // Показываем ошибку
            console.error('Ошибка при сохранении контакта:', data.error);
            showNotification(data.error || 'Ошибка при сохранении контакта', 'error');
            
            // Восстанавливаем оригинальное значение
            restoreField(fieldElement);
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке данных контакта:', error);
        showNotification('Ошибка соединения с сервером', 'error');
        
        // Восстанавливаем оригинальное значение
        restoreField(fieldElement);
    })
    .finally(() => {
        // Скрываем поле ввода
        if (inputElement) {
            inputElement.style.display = 'none';
        }
        
        // Сбрасываем состояние редактирования
        currentlyEditing = null;
        isProcessingDoubleClick = false;
        if (ignoreBlurTimeout) {
            clearTimeout(ignoreBlurTimeout);
            ignoreBlurTimeout = null;
        }
    });
}

// Обновление отображаемого значения поля клиента
function updateFieldDisplay(fieldElement, fieldType, clientData) {
    if (!fieldElement || !clientData) return;
    
    switch (fieldType) {
        case 'name':
            fieldElement.textContent = clientData.name; // Обновляем текст
            fieldElement.setAttribute('data-original-value', clientData.name); // Обновляем атрибут
            break;
        
        case 'discount':
            const discountText = clientData.discount === 0 ? 'Без скидки' : `${clientData.discount}%`; // Форматируем текст
            fieldElement.textContent = discountText;
            fieldElement.setAttribute('data-original-value', clientData.discount);
            break;
        
        case 'address':
            fieldElement.textContent = clientData.address || 'Не указан'; // Если пусто, показываем "Не указан"
            fieldElement.setAttribute('data-original-value', clientData.address || '');
            break;
        
        case 'bank_details':
            fieldElement.textContent = clientData.bank_details || 'Не указаны';
            fieldElement.setAttribute('data-original-value', clientData.bank_details || '');
            break;
        
        case 'has_edo':
            // Для поля ЭДО обновляем классы и иконку
            if (clientData.has_edo) {
                fieldElement.classList.remove('edo-inactive');
                fieldElement.classList.add('edo-active');
                fieldElement.innerHTML = '<i class="fas fa-file-contract"></i> ЭДО';
            } else {
                fieldElement.classList.remove('edo-active');
                fieldElement.classList.add('edo-inactive');
                fieldElement.innerHTML = '<i class="fas fa-file-contract"></i> ЭДО';
            }
            fieldElement.setAttribute('data-original-value', clientData.has_edo);
            break;
    }
    
    // Показываем обновленное поле
    fieldElement.style.display = 'inline-block';
    fieldElement.classList.remove('editing'); // Убираем класс редактирования
}

// Обновление отображаемого значения поля контакта
function updateContactFieldDisplay(fieldElement, fieldType, contactData) {
    if (!fieldElement || !contactData) return;
    
    switch (fieldType) {
        case 'full_name':
            fieldElement.textContent = contactData.full_name;
            fieldElement.setAttribute('data-original-value', contactData.full_name);
            break;
        
        case 'position':
            fieldElement.textContent = contactData.position || 'Не указана';
            fieldElement.setAttribute('data-original-value', contactData.position || '');
            break;
        
        case 'phone':
            fieldElement.textContent = contactData.phone || 'Не указан';
            fieldElement.setAttribute('data-original-value', contactData.phone || '');
            break;
        
        case 'mobile':
            fieldElement.textContent = contactData.mobile || 'Не указан';
            fieldElement.setAttribute('data-original-value', contactData.mobile || '');
            break;
        
        case 'email':
            fieldElement.textContent = contactData.email || 'Не указан';
            fieldElement.setAttribute('data-original-value', contactData.email || '');
            break;
        
        case 'comments':
            fieldElement.textContent = contactData.comments || 'Нет комментариев';
            fieldElement.setAttribute('data-original-value', contactData.comments || '');
            break;
        
        case 'is_primary':
            // Для поля "основное" обновляем классы и иконку
            if (contactData.is_primary) {
                fieldElement.classList.remove('primary-inactive');
                fieldElement.classList.add('primary-active');
                fieldElement.innerHTML = '<i class="fas fa-star"></i> Основное';
            } else {
                fieldElement.classList.remove('primary-active');
                fieldElement.classList.add('primary-inactive');
                fieldElement.innerHTML = '<i class="far fa-star"></i> Основное';
            }
            fieldElement.setAttribute('data-original-value', contactData.is_primary);
            break;
    }
    
    // Показываем обновленное поле
    fieldElement.style.display = 'inline-block';
    fieldElement.classList.remove('editing');
}

// Обновление метки ЭДО в списке клиентов
function updateEdoBadgeInList(clientId, hasEdo) {
    // Находим все элементы клиента в списке с этим ID
    document.querySelectorAll('.client-item').forEach(item => {
        const link = item.getAttribute('href');
        if (link && link.includes(`client_id=${clientId}`)) {
            const edoBadge = item.querySelector('.edo-badge-active, .edo-badge-inactive');
            if (edoBadge) {
                if (hasEdo) {
                    edoBadge.classList.remove('edo-badge-inactive');
                    edoBadge.classList.add('edo-badge-active');
                    edoBadge.textContent = 'ЭДО';
                } else {
                    edoBadge.classList.remove('edo-badge-active');
                    edoBadge.classList.add('edo-badge-inactive');
                    edoBadge.textContent = 'ЭДО';
                }
            }
        }
    });
}

// Восстановление поля (отмена редактирования)
function restoreField(fieldElement) {
    if (!fieldElement) return;
    
    // Показываем текстовое поле
    fieldElement.style.display = 'inline-block';
    fieldElement.classList.remove('editing');
    
    // Скрываем все поля ввода в этом контейнере
    const container = fieldElement.parentNode;
    if (container) {
        container.querySelectorAll('.inline-edit-input, .inline-edit-textarea, .contact-full-name-input, .contact-position-input, .contact-phone-input, .contact-mobile-input, .contact-email-input, .contact-comments-textarea').forEach(input => {
            input.style.display = 'none';
        });
    }
}

// Обработка одиночного клика (для предотвращения конфликтов)
function handleSingleClick(e) {
    // Если уже редактируем это поле, игнорируем одиночный клик
    if (currentlyEditing && currentlyEditing.field === e.currentTarget) {
        e.preventDefault(); // Предотвращаем стандартное действие
        e.stopPropagation(); // Останавливаем всплытие
    }
}

// Обработка нажатия клавиш в поле ввода клиента
function handleInputKeyPress(e) {
    if (!currentlyEditing || currentlyEditing.isContact) return; // Если не редактируем или это контакт
    
    const key = e.key; // Получаем нажатую клавишу
    
    switch (key) {
        case 'Enter':
            // Enter сохраняет изменения
            e.preventDefault(); // Предотвращаем стандартное действие
            finishInlineEdit(); // Завершаем редактирование
            break;
        
        case 'Escape':
            // Escape отменяет редактирование
            e.preventDefault();
            cancelInlineEdit(); // Отменяем редактирование
            break;
        
        case 'Tab':
            // Tab переключает между полями
            e.preventDefault();
            finishInlineEdit(); // Сначала сохраняем текущее поле
            // Можно добавить переход к следующему полю
            break;
    }
}

// Обработка нажатия клавиш в поле ввода контакта
function handleContactInputKeyPress(e) {
    if (!currentlyEditing || !currentlyEditing.isContact) return;
    
    const key = e.key;
    
    switch (key) {
        case 'Enter':
            e.preventDefault();
            finishContactInlineEdit();
            break;
        
        case 'Escape':
            e.preventDefault();
            cancelInlineEdit();
            break;
        
        case 'Tab':
            e.preventDefault();
            finishContactInlineEdit();
            break;
    }
}

// Обработка нажатия клавиш на странице
function handleKeyPress(e) {
    if (!currentlyEditing) return; // Если не в режиме редактирования
    
    const key = e.key;
    
    // Если нажата Escape и мы в режиме редактирования
    if (key === 'Escape') {
        e.preventDefault();
        cancelInlineEdit();
    }
}

// Отмена редактирования
function cancelInlineEdit() {
    if (!currentlyEditing) return;
    
    const { field } = currentlyEditing;
    
    // Восстанавливаем поле
    restoreField(field);
    
    // Сбрасываем состояние
    currentlyEditing = null;
    isProcessingDoubleClick = false;
    if (ignoreBlurTimeout) {
        clearTimeout(ignoreBlurTimeout);
        ignoreBlurTimeout = null;
    }
    
    console.log('Редактирование отменено');
}

// Переключение статуса ЭДО (по двойному клику)
function toggleEdoStatus(e) {
    e.stopPropagation();
    
    const field = e.currentTarget;
    const clientId = field.getAttribute('data-client-id');
    // ИСПРАВЛЕНИЕ: Добавлено .toLowerCase() для корректного сравнения
    const currentValue = field.getAttribute('data-original-value').toLowerCase();
    
    if (!clientId) {
        console.debug('Не удалось определить ID клиента для переключения ЭДО');
        return;
    }
    
    // Определяем новое значение (инвертируем текущее)
    // Сравниваем со строкой 'true' (в нижнем регистре)
    const newValue = currentValue === 'true' ? 'false' : 'true';
    
    // Показываем индикатор загрузки
    const originalHTML = field.innerHTML;
    field.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('field_name', 'has_edo');
    formData.append('new_value', newValue);
    formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));
    
    // Отправляем AJAX запрос
    fetch(`/baza_klientov/api/update_client/${clientId}/`, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('Статус ЭДО обновлен:', data);
            
            // Обновляем отображаемое значение
            updateFieldDisplay(field, 'has_edo', data.client);
            
            // Обновляем метку ЭДО в списке клиентов
            updateEdoBadgeInList(clientId, data.client.has_edo);
            
            // Показываем уведомление об успехе
            showNotification('Статус ЭДО обновлен', 'success');
        } else {
            // Показываем ошибку
            console.error('Ошибка при обновлении ЭДО:', data.error);
            showNotification(data.error || 'Ошибка при обновлении ЭДО', 'error');
            
            // Восстанавливаем оригинальное значение
            field.innerHTML = originalHTML;
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке данных ЭДО:', error);
        showNotification('Ошибка соединения с сервером', 'error');
        
        // Восстанавливаем оригинальное значение
        field.innerHTML = originalHTML;
    });
}

// Переключение статуса ЭДО для клиента в списке
function toggleEdoStatusForClient(clientId, badgeElement) {
    if (!clientId || !badgeElement) return;
    
    // Определяем текущее значение (по классу)
    const currentValue = badgeElement.classList.contains('edo-badge-active');
    const newValue = !currentValue;
    
    // Показываем индикатор загрузки
    const originalText = badgeElement.textContent;
    badgeElement.textContent = '...';
    
    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('field_name', 'has_edo');
    formData.append('new_value', newValue.toString());
    formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));
    
    // Отправляем AJAX запрос
    fetch(`/baza_klientov/api/update_client/${clientId}/`, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('Статус ЭДО обновлен (из списка):', data);
            
            // Обновляем метку в списке
            if (data.client.has_edo) {
                badgeElement.classList.remove('edo-badge-inactive');
                badgeElement.classList.add('edo-badge-active');
                badgeElement.textContent = 'ЭДО';
            } else {
                badgeElement.classList.remove('edo-badge-active');
                badgeElement.classList.add('edo-badge-inactive');
                badgeElement.textContent = 'ЭДО';
            }
            
            // Обновляем метку ЭДО в деталях клиента, если он выбран
            const edoDetailBadge = document.querySelector('.editable-eto[data-client-id="' + clientId + '"]');
            if (edoDetailBadge) {
                updateFieldDisplay(edoDetailBadge, 'has_edo', data.client);
            }
            
            // Показываем уведомление об успехе
            showNotification('Статус ЭДО обновлен', 'success');
        } else {
            // Показываем ошибку
            console.error('Ошибка при обновлении ЭДО (из списка):', data.error);
            showNotification(data.error || 'Ошибка при обновлении ЭДО', 'error');
            
            // Восстанавливаем оригинальное значение
            badgeElement.textContent = originalText;
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке данных ЭДО (из списка):', error);
        showNotification('Ошибка соединения с сервером', 'error');
        
        // Восстанавливаем оригинальное значение
        badgeElement.textContent = originalText;
    });
}

// Переключение статуса "основное" для контакта (по двойному клику)
function togglePrimaryStatus(e) {
    e.stopPropagation();
    
    const field = e.currentTarget;
    const contactId = field.getAttribute('data-contact-id');
    // ИСПРАВЛЕНИЕ: Добавлено .toLowerCase() для корректного сравнения
    const currentValue = field.getAttribute('data-original-value').toLowerCase();
    
    if (!contactId) {
        console.debug('Не удалось определить ID контакта для переключения статуса "основное"');
        return;
    }
    
    // Определяем новое значение (инвертируем текущее)
    const newValue = currentValue === 'true' ? 'false' : 'true';
    
    // Показываем индикатор загрузки
    const originalHTML = field.innerHTML;
    field.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('field_name', 'is_primary');
    formData.append('new_value', newValue);
    formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));
    
    // Отправляем AJAX запрос
    fetch(`/baza_klientov/api/update_contact/${contactId}/`, {
        method: 'POST',
        body: formData,
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
        },
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            console.log('Статус "основное" обновлен:', data);
            
            // Обновляем отображаемое значение
            updateContactFieldDisplay(field, 'is_primary', data.contact);
            
            // Если установили как основное, снимаем отметку с других контактов
            if (data.contact.is_primary) {
                document.querySelectorAll('.editable-primary').forEach(badge => {
                    if (badge.getAttribute('data-contact-id') !== contactId) {
                        badge.classList.remove('primary-active');
                        badge.classList.add('primary-inactive');
                        badge.innerHTML = '<i class="far fa-star"></i> Основное';
                        badge.setAttribute('data-original-value', 'false');
                    }
                });
            }
            
            // Показываем уведомление об успехе
            showNotification('Статус контакта обновлен', 'success');
        } else {
            // Показываем ошибку
            console.error('Ошибка при обновлении статуса "основное":', data.error);
            showNotification(data.error || 'Ошибка при обновлении статуса контакта', 'error');
            
            // Восстанавливаем оригинальное значение
            field.innerHTML = originalHTML;
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке данных статуса "основное":', error);
        showNotification('Ошибка соединения с сервером', 'error');
        
        // Восстанавливаем оригинальное значение
        field.innerHTML = originalHTML;
    });
}

// Получение CSRF токена из cookies
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';'); // Разбиваем строку cookies по точкам с запятой
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim(); // Убираем пробелы
            // Ищем cookie с нужным именем
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                // Декодируем значение cookie
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue; // Возвращаем значение cookie
}

// Показать уведомление
function showNotification(message, type = 'info') {
    // Используем функцию из основного файла, если она существует
    if (window.BazaKlientov && typeof window.BazaKlientov.showNotification === 'function') {
        window.BazaKlientov.showNotification(message, type);
        return;
    }
    
    // Или создаем простую реализацию
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
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
    
    // Добавляем стили для анимации
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(-20px); }
            10% { opacity: 1; transform: translateY(0); }
            90% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
        }
        
        .notification-success { background-color: #4CAF50; }
        .notification-error { background-color: #F44336; }
        .notification-warning { background-color: #FF9800; }
        .notification-info { background-color: #2196F3; }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Удаляем через 5 секунд
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Экспорт функций для использования в консоли или других скриптах
window.InlineEdit = {
    startInlineEdit,
    finishInlineEdit,
    cancelInlineEdit,
    validateInlineValue,
    saveInlineEdit,
    toggleEdoStatus,
    togglePrimaryStatus,
};