/*
baza_klientov/static/baza_klientov/js/sections/contacts.js
JavaScript секции «Сотрудники» (Контактные лица).

ЧТО ДЕЛАЕТ:
  - слушает событие clientSelected;
  - при выборе клиента запрашивает его контакты с API;
  - рисует карточки сотрудников.
*/

"use strict";

(function () {
    let contactsSection = null;
    let contactsList = null;
    let contactsEmpty = null;
    let createBtn = null;
    
    let formWrapper = null;
    let formEl = null;
    let btnCancel = null;

    let currentClientId = null;

    document.addEventListener('DOMContentLoaded', function () {
        contactsSection = document.getElementById('contacts-section');
        contactsList = document.getElementById('contacts-list');
        contactsEmpty = document.getElementById('contacts-empty');
        createBtn = document.getElementById('contacts-create-btn');

        if (!contactsSection) return;

        formWrapper = document.getElementById('contacts-create-form');
        formEl = document.getElementById('contact-form-el');
        btnCancel = document.getElementById('contact-btn-cancel');

        // Открытие формы
        if (createBtn) {
            createBtn.addEventListener('click', function () {
                if (!currentClientId) return;
                formWrapper.style.display = 'block';
                document.getElementById('contact-full-name').focus();
            });
        }

        // Закрытие формы
        if (btnCancel) {
            btnCancel.addEventListener('click', closeForm);
        }

        // Отправка формы создания
        if (formEl) {
            formEl.addEventListener('submit', handleFormSubmit);
        }

        // Делегированные обработчики для карточек
        contactsList.addEventListener('dblclick', handleFieldDblClick);
        contactsList.addEventListener('click', handleDeleteClick);
        contactsList.addEventListener('click', handlePrimaryClick);

        // Слушаем выбор клиента
        document.addEventListener('clientSelected', handleClientSelected);
    });

    function closeForm() {
        formWrapper.style.display = 'none';
        formEl.reset();
    }

    function handleClientSelected(event) {
        const d = event.detail || {};
        const clientId = d.clientId;

        if (!clientId) return;
        if (currentClientId === String(clientId)) return;

        currentClientId = String(clientId);
        contactsSection.style.display = 'block';
        closeForm();
        loadContacts(currentClientId);
    }

    // Добавили параметр showLoading, чтобы при мелких правках не мигала "Загрузка"
    function loadContacts(clientId, showLoading) {
        if (showLoading === undefined) showLoading = true;

        if (showLoading) {
            contactsList.innerHTML = '<div style="color: #888; font-style: italic; padding: 0.5rem 0;">Загрузка...</div>';
            contactsEmpty.style.display = 'none';
        }

        fetch('/baza_klientov/api/client_contacts/' + clientId + '/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            // ЗАПОМИНАЕМ ПОЗИЦИЮ СКРОЛЛА ДО ОБНОВЛЕНИЯ
            const scrollY = window.scrollY;

            if (data.success && data.contacts) {
                renderContacts(data.contacts);
            } else {
                contactsList.innerHTML = '';
                contactsEmpty.style.display = 'block';
            }

            // ВОЗВРАЩАЕМ ПОЗИЦИЮ СКРОЛЛА СРАЗУ ПОСЛЕ ОБНОВЛЕНИЯ
            window.scrollTo(0, scrollY);
        })
        .catch(function (err) {
            console.error('Ошибка загрузки контактов:', err);
            contactsList.innerHTML = '<div style="color: #d9584f; padding: 0.5rem 0;">Ошибка загрузки</div>';
        });
    }

    function renderContacts(contacts) {
        contactsList.innerHTML = '';
        if (contacts.length === 0) {
            contactsEmpty.style.display = 'block';
            return;
        }
        contactsEmpty.style.display = 'none';

        contacts.forEach(function (contact) {
            const card = document.createElement('div');
            card.className = 'contact-card';
            card.dataset.contactId = contact.id;

            // Шапка (ФИО + Основной + Удалить)
            let headerHtml = '<div class="contact-card-header">';
            headerHtml += '<span class="contact-card-name">' + escapeHtml(contact.full_name) + '</span>';
            
            if (contact.is_primary) {
                headerHtml += '<span class="contact-card-primary" title="Клик для снятия отметки">Основной</span>';
            } else {
                headerHtml += '<span class="contact-card-primary" style="background: #f0f0f0; color: #888;" title="Клик для назначения основным">Сделать основным</span>';
            }
            
            // Кнопка удаления
            headerHtml += '<button type="button" class="contact-card-delete" title="Удалить">×</button>';
            headerHtml += '</div>';

            // Тело (Поля с data-field для редактирования)
            let bodyHtml = '<div class="contact-card-body">';
            
            if (contact.position) {
                bodyHtml += '<div class="contact-card-field"><span class="contact-card-label">Должность:</span><span class="contact-card-value" data-field="position">' + escapeHtml(contact.position) + '</span></div>';
            }
            if (contact.phone) {
                bodyHtml += '<div class="contact-card-field"><span class="contact-card-label">Тел:</span><span class="contact-card-value" data-field="phone">' + escapeHtml(contact.phone) + '</span></div>';
            }
            if (contact.mobile) {
                bodyHtml += '<div class="contact-card-field"><span class="contact-card-label">Моб:</span><span class="contact-card-value" data-field="mobile">' + escapeHtml(contact.mobile) + '</span></div>';
            }
            if (contact.email) {
                bodyHtml += '<div class="contact-card-field"><span class="contact-card-label">E-mail:</span><span class="contact-card-value" data-field="email">' + escapeHtml(contact.email) + '</span></div>';
            }
            if (contact.comments) {
                bodyHtml += '<div class="contact-card-field" style="flex-basis: 100%;"><span class="contact-card-label">Комментарий:</span><span class="contact-card-value" data-field="comments">' + escapeHtml(contact.comments) + '</span></div>';
            }
            
            bodyHtml += '</div>';
            card.innerHTML = headerHtml + bodyHtml;
            contactsList.appendChild(card);
        });
    }

    // --- РЕДАКТИРОВАНИЕ ПО ДВОЙНОМУ КЛИКУ ---
    function handleFieldDblClick(event) {
        const valueEl = event.target.closest('.contact-card-value');
        if (!valueEl) return;
        
        // Если уже редактируется - пропускаем
        if (valueEl.querySelector('input')) return;

        const field = valueEl.dataset.field;
        const originalText = valueEl.textContent;
        
        // Создаем инпут
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'contact-card-input';
        input.value = originalText === '—' ? '' : originalText;
        
        valueEl.textContent = '';
        valueEl.appendChild(input);
        input.focus();
        
        let finished = false;
        
        function finish(save) {
            if (finished) return;
            finished = true;
            
            const newValue = input.value.trim();
            
            // Возвращаем текст
            valueEl.textContent = (newValue === '') ? '—' : newValue;
            
            if (save && newValue !== originalText) {
                const contactId = valueEl.closest('.contact-card').dataset.contactId;
                saveContactField(contactId, field, newValue);
            }
        }
        
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        
        input.addEventListener('blur', function() {
            setTimeout(function() { finish(true); }, 100);
        });
    }

    function saveContactField(contactId, field, value) {
        const fd = new FormData();
        fd.append('field_name', field);
        fd.append('new_value', value);
        fd.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        fetch('/baza_klientov/api/update_contact/' + contactId + '/', {
            method: 'POST',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.success) {
                alert('Ошибка сохранения');
                loadContacts(currentClientId, false); // Откат
            }
        })
        .catch(function() {
            alert('Ошибка сети');
            loadContacts(currentClientId, false);
        });
    }

    // --- УДАЛЕНИЕ ---
    function handleDeleteClick(event) {
        const btn = event.target.closest('.contact-card-delete');
        if (!btn) return;
        
        if (!confirm('Удалить сотрудника?')) return;
        
        const contactId = btn.closest('.contact-card').dataset.contactId;
        
        const fd = new FormData();
        fd.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        fetch('/baza_klientov/delete_contact/' + contactId + '/', {
            method: 'POST',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                btn.closest('.contact-card').remove();
                updateContactCount(-1);
            } else {
                alert('Ошибка удаления');
            }
        })
        .catch(function() { alert('Ошибка сети'); });
    }

    // --- ПЕРЕКЛЮЧЕНИЕ "ОСНОВНОЙ" ---
    function handlePrimaryClick(event) {
        const badge = event.target.closest('.contact-card-primary');
        if (!badge) return;
        
        const contactId = badge.closest('.contact-card').dataset.contactId;
        const isCurrentlyPrimary = badge.textContent === 'Основной';
        const newValue = isCurrentlyPrimary ? 'false' : 'true';
        
        const fd = new FormData();
        fd.append('field_name', 'is_primary');
        fd.append('new_value', newValue);
        fd.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        fetch('/baza_klientov/api/update_contact/' + contactId + '/', {
            method: 'POST',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                loadContacts(currentClientId, false); // Перерисовываем, чтобы снять метку с других
            }
        });
    }

    // --- СОЗДАНИЕ (ИЗ ПРОШЛОГО ШАГА) ---
    function handleFormSubmit(e) {
        e.preventDefault();
        if (!currentClientId) return;

        const submitBtn = document.getElementById('contact-btn-submit');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Сохранение...';

        const fd = new FormData();
        fd.append('client_id', currentClientId);
        fd.append('full_name', document.getElementById('contact-full-name').value.trim());
        fd.append('position', document.getElementById('contact-position').value.trim());
        fd.append('phone', document.getElementById('contact-phone').value.trim());
        fd.append('mobile', document.getElementById('contact-mobile').value.trim());
        fd.append('email', document.getElementById('contact-email').value.trim());
        fd.append('comments', document.getElementById('contact-comments').value.trim());
        
        if (document.getElementById('contact-is-primary').checked) {
            fd.append('is_primary', 'on');
        }

        fetch('/baza_klientov/api/create_contact/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCookie('csrftoken')
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                closeForm();
                loadContacts(currentClientId);
                updateContactCount(1);
            } else {
                alert('Ошибка: ' + (data.errors ? JSON.stringify(data.errors) : 'неизвестная'));
            }
        })
        .catch(function (err) {
            console.error(err);
            alert('Ошибка сети при сохранении');
        })
        .finally(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        });
    }

    function updateContactCount(delta) {
        const row = document.querySelector('.list-clients-row[data-client-id="' + currentClientId + '"]');
        if (row) {
            const cell = row.querySelector('.col-contacts');
            if (cell) {
                let val = parseInt(cell.textContent || '0', 10) + delta;
                if (val < 0) val = 0;
                cell.textContent = val;
            }
        }
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function getCookie(name) {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const c = cookies[i].trim();
            if (c.indexOf(name + '=') === 0) {
                return decodeURIComponent(c.substring(name.length + 1));
            }
        }
        return '';
    }

})();