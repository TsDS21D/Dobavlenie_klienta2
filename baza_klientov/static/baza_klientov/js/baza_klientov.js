/*
baza_klientov.js - Основной JavaScript файл для базы клиентов
ИЗМЕНЕНИЯ:
1. Убрана обработка кнопки редактирования клиента
2. Убрана обработка кнопки переключения основного контакта (теперь по двойному клику)
3. Обновлена валидация формы контакта (теперь требуется только ФИО)
*/

// Глобальные переменные
let isClientFormVisible = false;
let isContactFormVisible = false;

// Функция инициализации при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('База клиентов: Инициализация...');
    
    // Инициализация всех обработчиков событий
    initEventListeners();
    
    // Отображение сообщений Django
    showDjangoMessages();
    
    // Восстановление состояния формы (если нужно)
    restoreFormState();
});

// Инициализация обработчиков событий
function initEventListeners() {
    console.log('Инициализация обработчиков событий...');
    
    // Кнопка добавления клиента
    const addClientBtn = document.getElementById('add-client-btn');
    if (addClientBtn) {
        addClientBtn.addEventListener('click', toggleClientForm);
    }
    
    // Кнопка добавления контактного лица
    const addContactBtn = document.getElementById('add-contact-btn');
    if (addContactBtn) {
        addContactBtn.addEventListener('click', toggleContactForm);
    }
    
    // Форма добавления клиента (AJAX)
    const clientForm = document.getElementById('client-form');
    if (clientForm) {
        clientForm.addEventListener('submit', handleClientFormSubmit);
    }
    
    // Форма добавления контактного лица (AJAX)
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', handleContactFormSubmit);
    }
    
    // Кнопки удаления клиента
    document.querySelectorAll('.btn-delete-client').forEach(btn => {
        btn.addEventListener('click', handleDeleteClient);
    });
    
    // Кнопки удаления контактного лица
    document.querySelectorAll('.btn-delete-contact').forEach(btn => {
        btn.addEventListener('click', handleDeleteContact);
    });
    
    // ИСПРАВЛЕНИЕ: Убраны обработчики для кнопок переключения основного контакта
    // Теперь это делается по двойному клику на метке "основное"
    
    // ИСПРАВЛЕНИЕ: Убрана кнопка редактирования клиента
    
    // Обработчики для полей с автоматическим расчетом
    const discountInput = document.getElementById('client-discount');
    if (discountInput) {
        discountInput.addEventListener('input', validateDiscount);
    }
    
    // Инициализация поиска
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.form.submit();
            }
        });
    }
}

// Функция отображения/скрытия формы добавления клиента
function toggleClientForm() {
    const formSection = document.getElementById('client-form-section');
    const addClientBtn = document.getElementById('add-client-btn');
    
    if (!formSection || !addClientBtn) return;
    
    isClientFormVisible = !isClientFormVisible;
    
    if (isClientFormVisible) {
        formSection.style.display = 'block';
        addClientBtn.innerHTML = '<i class="fas fa-times"></i> Отмена';
        addClientBtn.classList.add('btn-cancel');
        
        // Прокручиваем к форме
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Фокусируемся на первом поле
        const firstInput = formSection.querySelector('input, textarea, select');
        if (firstInput) firstInput.focus();
    } else {
        formSection.style.display = 'none';
        addClientBtn.innerHTML = '+ Добавить клиента';
        addClientBtn.classList.remove('btn-cancel');
        
        // Очищаем форму
        clearClientForm();
    }
}

// Функция отображения/скрытия формы добавления контактного лица
function toggleContactForm() {
    const formSection = document.getElementById('contact-form-section');
    const addContactBtn = document.getElementById('add-contact-btn');
    
    if (!formSection || !addContactBtn) return;
    
    isContactFormVisible = !isContactFormVisible;
    
    if (isContactFormVisible) {
        formSection.style.display = 'block';
        addContactBtn.innerHTML = '<i class="fas fa-times"></i> Отмена';
        addContactBtn.classList.add('btn-cancel');
        
        // Прокручиваем к форме
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Фокусируемся на первом поле
        const firstInput = formSection.querySelector('input, textarea, select');
        if (firstInput) firstInput.focus();
    } else {
        formSection.style.display = 'none';
        addContactBtn.innerHTML = '+ Добавить контакт';
        addContactBtn.classList.remove('btn-cancel');
        
        // Очищаем форму
        clearContactForm();
    }
}

// Обработка отправки формы клиента через AJAX
function handleClientFormSubmit(e) {
    e.preventDefault();
    console.log('Отправка формы клиента...');
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Валидация формы
    if (!validateClientForm(form)) {
        return;
    }
    
    // Показываем индикатор загрузки
    const submitBtn = form.querySelector('.btn-submit');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
    submitBtn.disabled = true;
    
    // Отправляем AJAX запрос
    fetch(form.action, {
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
            console.log('Клиент успешно добавлен:', data.client);
            
            // Показываем уведомление
            showNotification('Клиент успешно добавлен!', 'success');
            
            // Очищаем форму
            clearClientForm();
            
            // Скрываем форму
            toggleClientForm();
            
            // Обновляем список клиентов
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            // Показываем ошибки
            console.error('Ошибки при сохранении клиента:', data.errors);
            showNotification('Ошибка при сохранении клиента', 'error');
            
            // Отображаем ошибки в форме
            displayFormErrors(form, data.errors);
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке формы:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    })
    .finally(() => {
        // Восстанавливаем кнопку
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
}

// Обработка отправки формы контактного лица через AJAX
function handleContactFormSubmit(e) {
    e.preventDefault();
    console.log('Отправка формы контактного лица...');
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Валидация формы
    if (!validateContactForm(form)) {
        return;
    }
    
    // Показываем индикатор загрузки
    const submitBtn = form.querySelector('.btn-submit');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
    submitBtn.disabled = true;
    
    // Отправляем AJAX запрос
    fetch(form.action, {
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
            console.log('Контактное лицо успешно добавлено:', data.contact);
            
            // Показываем уведомление
            showNotification('Контактное лицо успешно добавлено!', 'success');
            
            // Очищаем форму
            clearContactForm();
            
            // Скрываем форму
            toggleContactForm();
            
            // Обновляем страницу через 1.5 секунды
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            // Показываем ошибки
            console.error('Ошибки при сохранении контакта:', data.errors);
            showNotification('Ошибка при сохранении контактного лица', 'error');
            
            // Отображаем ошибки в форме
            displayFormErrors(form, data.errors);
        }
    })
    .catch(error => {
        console.error('Ошибка при отправке формы:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    })
    .finally(() => {
        // Восстанавливаем кнопку
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    });
}

// Удаление клиента
function handleDeleteClient(e) {
    const btn = e.currentTarget;
    const clientId = btn.getAttribute('data-client-id');
    const clientName = btn.getAttribute('data-client-name');
    
    if (!confirm(`Вы уверены, что хотите удалить клиента "${clientName}"?\n\nЭто действие нельзя отменить.`)) {
        return;
    }
    
    // Показываем индикатор загрузки
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    
    // Отправляем запрос на удаление
    fetch(`/baza_klientov/delete_client/${clientId}/`, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCookie('csrftoken'),
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
            showNotification(data.message, 'success');
            // Обновляем страницу через 1 секунду
            setTimeout(() => {
                window.location.href = '/baza_klientov/';
            }, 1000);
        } else {
            showNotification('Ошибка при удалении клиента', 'error');
        }
    })
    .catch(error => {
        console.error('Ошибка при удалении клиента:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    })
    .finally(() => {
        // Восстанавливаем кнопку
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

// Удаление контактного лица
function handleDeleteContact(e) {
    const btn = e.currentTarget;
    const contactId = btn.getAttribute('data-contact-id');
    const contactName = btn.getAttribute('data-contact-name');
    
    if (!confirm(`Вы уверены, что хотите удалить контактное лицо "${contactName}"?`)) {
        return;
    }
    
    // Показываем индикатор загрузки
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;
    
    // Отправляем запрос на удаление
    fetch(`/baza_klientov/delete_contact/${contactId}/`, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCookie('csrftoken'),
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
            showNotification(data.message, 'success');
            // Обновляем страницу через 1 секунду
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } else {
            showNotification('Ошибка при удалении контактного лица', 'error');
        }
    })
    .catch(error => {
        console.error('Ошибка при удалении контакта:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    })
    .finally(() => {
        // Восстанавливаем кнопку
        btn.innerHTML = originalText;
        btn.disabled = false;
    });
}

// ИСПРАВЛЕНИЕ: Убрана функция handleTogglePrimaryContact
// Теперь переключение основного контакта происходит по двойному клику на метке

// ИСПРАВЛЕНИЕ: Убрана функция handleEditClient
// Теперь редактирование происходит по двойному клику на полях

// Валидация формы клиента
function validateClientForm(form) {
    let isValid = true;
    const errors = [];
    
    // Проверка названия
    const nameInput = form.querySelector('#client-name');
    if (nameInput && !nameInput.value.trim()) {
        showFieldError(nameInput, 'Введите название или ФИО клиента');
        isValid = false;
    } else {
        clearFieldError(nameInput);
    }
    
    // Проверка скидки
    const discountInput = form.querySelector('#client-discount');
    if (discountInput) {
        const discount = parseInt(discountInput.value) || 0;
        if (discount < 0 || discount > 100) {
            showFieldError(discountInput, 'Скидка должна быть от 0 до 100%');
            isValid = false;
        } else {
            clearFieldError(discountInput);
        }
    }
    
    return isValid;
}

// Валидация формы контактного лица
function validateContactForm(form) {
    let isValid = true;
    
    // Проверка ФИО (единственное обязательное поле)
    const nameInput = form.querySelector('#contact-full-name');
    if (nameInput && !nameInput.value.trim()) {
        showFieldError(nameInput, 'Введите ФИО контактного лица');
        isValid = false;
    } else {
        clearFieldError(nameInput);
    }
    
    // ИСПРАВЛЕНИЕ: Убрана проверка на наличие хотя бы одного контакта
    // Теперь контактное лицо можно добавить только с ФИО
    
    return isValid;
}

// Валидация поля скидки
function validateDiscount(e) {
    const input = e.target;
    const value = parseInt(input.value) || 0;
    
    if (value < 0) {
        input.value = 0;
    } else if (value > 100) {
        input.value = 100;
    }
}

// Отображение ошибок формы
function displayFormErrors(form, errors) {
    // Очищаем предыдущие ошибки
    form.querySelectorAll('.error-message').forEach(el => el.remove());
    form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
    
    // Добавляем новые ошибки
    for (const field in errors) {
        const fieldElement = form.querySelector(`[name="${field}"]`);
        if (fieldElement) {
            fieldElement.classList.add('error');
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.style.color = '#dc3545';
            errorDiv.style.fontSize = '0.85rem';
            errorDiv.style.marginTop = '0.25rem';
            errorDiv.innerHTML = errors[field].join('<br>');
            
            fieldElement.parentNode.appendChild(errorDiv);
        }
    }
}

// Показать ошибку для поля
function showFieldError(field, message) {
    // Очищаем предыдущие ошибки
    clearFieldError(field);
    
    // Добавляем класс ошибки
    field.classList.add('error');
    
    // Создаем элемент с сообщением об ошибке
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.color = '#dc3545';
    errorDiv.style.fontSize = '0.85rem';
    errorDiv.style.marginTop = '0.25rem';
    errorDiv.textContent = message;
    
    // Вставляем после поля
    field.parentNode.appendChild(errorDiv);
    
    // Фокусируемся на поле с ошибкой
    field.focus();
}

// Очистить ошибку поля
function clearFieldError(field) {
    field.classList.remove('error');
    
    // Удаляем сообщение об ошибке
    const errorMsg = field.parentNode.querySelector('.error-message');
    if (errorMsg) {
        errorMsg.remove();
    }
}

// Очистка формы клиента
function clearClientForm() {
    const form = document.getElementById('client-form');
    if (!form) return;
    
    form.reset();
    
    // Очищаем ошибки
    form.querySelectorAll('.error-message').forEach(el => el.remove());
    form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
}

// Очистка формы контактного лица
function clearContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;
    
    form.reset();
    
    // Очищаем ошибки
    form.querySelectorAll('.error-message').forEach(el => el.remove());
    form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
}

// Отображение уведомления
function showNotification(message, type = 'info') {
    // Удаляем предыдущие уведомления
    document.querySelectorAll('.notification').forEach(el => el.remove());
    
    // Создаем новое уведомление
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Добавляем на страницу
    document.body.appendChild(notification);
    
    // Удаляем через 5 секунд
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

// Отображение сообщений Django
function showDjangoMessages() {
    const messagesContainer = document.querySelector('.django-messages');
    if (!messagesContainer) return;
    
    const messages = messagesContainer.querySelectorAll('.django-message');
    messages.forEach(message => {
        const type = message.getAttribute('data-type');
        const text = message.textContent;
        
        if (text && text.trim()) {
            showNotification(text, type || 'info');
        }
    });
}

// Восстановление состояния формы
function restoreFormState() {
    // Проверяем, была ли открыта форма клиента
    const clientFormSection = document.getElementById('client-form-section');
    if (clientFormSection && clientFormSection.style.display !== 'none') {
        isClientFormVisible = true;
    }
    
    // Проверяем, была ли открыта форма контакта
    const contactFormSection = document.getElementById('contact-form-section');
    if (contactFormSection && contactFormSection.style.display !== 'none') {
        isContactFormVisible = true;
    }
}

// Получение CSRF токена из cookies
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

// Экспорт функций для использования в других файлах
window.BazaKlientov = {
    toggleClientForm,
    toggleContactForm,
    clearClientForm,
    clearContactForm,
    showNotification,
    validateDiscount,
};