/*
baza_klientov/static/baza_klientov/js/sections/legal_entities.js
*/

"use strict";

(function () {
    let leSection = null;
    let leList = null;
    let leEmpty = null;
    let createBtn = null;
    
    let formWrapper = null;
    let formEl = null;
    let btnCancel = null;

    let currentClientId = null;

    document.addEventListener('DOMContentLoaded', function () {
        leSection = document.getElementById('le-section');
        leList = document.getElementById('le-list');
        leEmpty = document.getElementById('le-empty');
        createBtn = document.getElementById('le-create-btn');

        if (!leSection) return;

        formWrapper = document.getElementById('le-create-form');
        formEl = document.getElementById('le-form-el');
        btnCancel = document.getElementById('le-btn-cancel');

        if (createBtn) {
            createBtn.addEventListener('click', function () {
                if (!currentClientId) return;
                formWrapper.style.display = 'block';
                document.getElementById('le-name').focus();
            });
        }

        if (btnCancel) btnCancel.addEventListener('click', closeForm);
        if (formEl) formEl.addEventListener('submit', handleFormSubmit);

        leList.addEventListener('dblclick', handleFieldDblClick);
        leList.addEventListener('click', handleDeleteClick);
        leList.addEventListener('click', handlePrimaryClick);
        leList.addEventListener('change', handleEdoChange);

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
        leSection.style.display = 'block';
        closeForm();
        loadEntities(currentClientId);
    }

    function loadEntities(clientId, showLoading) {
        if (showLoading === undefined) showLoading = true;

        if (showLoading) {
            leList.innerHTML = '<div style="color: #888; font-style: italic; padding: 0.5rem 0;">Загрузка...</div>';
            leEmpty.style.display = 'none';
        }

        fetch('/baza_klientov/api/legal_entities/' + clientId + '/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            const scrollY = window.scrollY;
            if (data.success && data.legal_entities) {
                renderEntities(data.legal_entities);
            } else {
                leList.innerHTML = '';
                leEmpty.style.display = 'block';
            }
            window.scrollTo(0, scrollY);
        })
        .catch(function (err) {
            console.error('Ошибка загрузки юрлиц:', err);
            leList.innerHTML = '<div style="color: #d9584f; padding: 0.5rem 0;">Ошибка загрузки</div>';
        });
    }

    function renderEntities(entities) {
        leList.innerHTML = '';
        if (entities.length === 0) {
            leEmpty.style.display = 'block';
            return;
        }
        leEmpty.style.display = 'none';

        entities.forEach(function (le) {
            const card = document.createElement('div');
            card.className = 'le-card' + (le.is_primary ? ' is-primary' : '');
            card.dataset.leId = le.id;

            // Шапка
            let headerHtml = '<div class="le-card-header">';
            headerHtml += '<span class="le-card-name">' + escapeHtml(le.name) + '</span>';
            
            if (le.is_primary) {
                headerHtml += '<span class="le-badge le-badge-primary" data-action="primary" title="Клик для снятия">Основной</span>';
            } else {
                headerHtml += '<span class="le-badge le-badge-make-primary" data-action="primary" title="Клик для назначения">Сделать основным</span>';
            }

            // Рисуем выпадающий список для ЭДО
            const edoStatus = le.edo_status || 'none';
            let edoClass = 'status-none';
            if (edoStatus === 'connected') edoClass = 'status-connected';
            if (edoStatus === 'requested') edoClass = 'status-requested';
            if (edoStatus === 'unchecked') edoClass = 'status-unchecked';

            headerHtml += `
                <select class="le-edo-select ${edoClass}">
                    <option value="none" ${edoStatus === 'none' ? 'selected' : ''}>Без ЭДО</option>
                    <option value="unchecked" ${edoStatus === 'unchecked' ? 'selected' : ''}>ЭДО не проверял</option>
                    <option value="requested" ${edoStatus === 'requested' ? 'selected' : ''}>Отправлен запрос</option>
                    <option value="connected" ${edoStatus === 'connected' ? 'selected' : ''}>Работает через ЭДО</option>
                </select>
            `;

            headerHtml += '<button type="button" class="le-card-delete" title="Удалить">×</button>';
            headerHtml += '</div>';

            // Всегда выводим все поля. Если данных нет — ставим прочерк (—).
            let bodyHtml = '<div class="le-card-body">';
            bodyHtml += '<div class="le-card-field"><span class="le-card-label">Реквизиты:</span><span class="le-card-value" data-field="requisites">' + escapeHtml(le.requisites || '—') + '</span></div>';
            bodyHtml += '<div class="le-card-field" style="flex-basis: 100%;"><span class="le-card-label">Комментарий:</span><span class="le-card-value" data-field="comment">' + escapeHtml(le.comment || '—') + '</span></div>';
            bodyHtml += '</div>';

            card.innerHTML = headerHtml + bodyHtml;
            leList.appendChild(card);
        });
    }

    // Редактирование названия по двойному клику
    function handleFieldDblClick(event) {
        const valueEl = event.target.closest('.le-card-value[data-field="requisites"], .le-card-value[data-field="comment"], .le-card-name');
        if (!valueEl) return;
        if (valueEl.querySelector('input') || valueEl.querySelector('textarea')) return;

        const field = valueEl.dataset.field || 'name';
        const originalText = valueEl.textContent === '—' ? '' : valueEl.textContent;
        
        const isMultiline = (field === 'requisites' || field === 'comment');
        let input;
        if (isMultiline) {
            input = document.createElement('textarea');
            input.rows = 2;
        } else {
            input = document.createElement('input');
            input.type = 'text';
        }
        input.className = 'le-card-input';
        input.value = originalText === '—' ? '' : originalText;
        
        valueEl.textContent = '';
        valueEl.appendChild(input);
        input.focus();
        
        let finished = false;
        function finish(save) {
            if (finished) return;
            finished = true;
            const newValue = input.value.trim();
            valueEl.textContent = (newValue === '') ? '—' : newValue;
            
            if (save && newValue !== originalText) {
                const leId = valueEl.closest('.le-card').dataset.leId;
                saveField(leId, field, newValue);
            }
        }
        
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !isMultiline) { e.preventDefault(); finish(true); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        
        input.addEventListener('blur', function() {
            setTimeout(function() { finish(true); }, 100);
        });
    }

    // Сохранение поля
    function saveField(leId, field, value) {
        const fd = new FormData();
        fd.append('field_name', field);
        fd.append('new_value', value);
        fd.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        fetch('/baza_klientov/api/update_legal_entity/' + leId + '/', {
            method: 'POST',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.success) {
                window.BazaNotify.notify('Ошибка сохранения', 'error');
                loadEntities(currentClientId, false);
            } else {
                if (window.BazaListClients) window.BazaListClients.refreshTable();
            }

        })
        .catch(function() {
            alert('Ошибка сети');
            loadEntities(currentClientId, false);
        });
    }

    // Переключение основного / ЭДО
    function handlePrimaryClick(event) {
        const target = event.target.closest('[data-action="primary"], [data-action="edo"]');
        if (!target) return;

        const action = target.dataset.action;
        const leId = target.closest('.le-card').dataset.leId;
        
        let field, newValue;
        if (action === 'primary') {
            field = 'is_primary';
            newValue = target.textContent === 'Основной' ? 'false' : 'true';
        } else {
            field = 'has_edo';
            newValue = target.textContent === 'ЭДО' ? 'false' : 'true';
        }

        const fd = new FormData();
        fd.append('field_name', field);
        fd.append('new_value', newValue);
        fd.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        fetch('/baza_klientov/api/update_legal_entity/' + leId + '/', {
            method: 'POST',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                loadEntities(currentClientId, false);
                if (window.BazaListClients) window.BazaListClients.refreshTable();
            }
        });
    }

    // Удаление юрлица
    function handleDeleteClick(event) {
        const btn = event.target.closest('.le-card-delete'); // Ищем крестик юрлица
        if (!btn) return;
        
        const leId = btn.closest('.le-card').dataset.leId;
        
        window.BazaConfirm.show(
            'Удалить юрлицо?',
            'Юрлицо и все его данные будут удалены.',
            function() {
                const fd = new FormData();
                fd.append('csrfmiddlewaretoken', getCookie('csrftoken'));

                fetch('/baza_klientov/api/delete_legal_entity/' + leId + '/', {
                    method: 'POST',
                    body: fd,
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.success) {
                        window.BazaNotify.notify('Юрлицо удалено', 'success');
                        loadEntities(currentClientId, false);
                        if (window.BazaListClients) window.BazaListClients.refreshTable(); // <-- ДОБАВИТЬ
                    } else {
                        window.BazaNotify.notify('Ошибка удаления', 'error');
                    }
                })
                .catch(function() { 
                    window.BazaNotify.notify('Ошибка сети', 'error'); 
                });
            }
        );
    }

    // Создание
    function handleFormSubmit(e) {
        e.preventDefault();
        if (!currentClientId) return;

        const submitBtn = document.getElementById('le-btn-submit');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Сохранение...';

        const fd = new FormData();
        fd.append('client_id', currentClientId);
        fd.append('name', document.getElementById('le-name').value.trim());
        fd.append('requisites', document.getElementById('le-requisites').value.trim());
        fd.append('comment', document.getElementById('le-comment').value.trim());
        
        fd.append('edo_status', document.getElementById('le-edo-status').value);
        if (document.getElementById('le-is-primary').checked) fd.append('is_primary', 'on');

        fetch('/baza_klientov/api/create_legal_entity/', {
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
                loadEntities(currentClientId, false);
                if (window.BazaListClients) window.BazaListClients.refreshTable();
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

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Изменение статуса ЭДО через выпадающий список
    function handleEdoChange(event) {
        const select = event.target.closest('.le-edo-select');
        if (!select) return;

        const leId = select.closest('.le-card').dataset.leId;
        const newValue = select.value;

        // Меняем цвет селекта сразу (для визуального отклика)
        select.classList.remove('status-none', 'status-requested', 'status-connected');
        if (newValue === 'connected') select.classList.add('status-connected');
        else if (newValue === 'requested') select.classList.add('status-requested');
        else if (newValue === 'unchecked') select.classList.add('status-unchecked');
        else select.classList.add('status-none');

        const fd = new FormData();
        fd.append('field_name', 'edo_status');
        fd.append('new_value', newValue);
        fd.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        fetch('/baza_klientov/api/update_legal_entity/' + leId + '/', {
            method: 'POST',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data.success) {
                alert('Ошибка сохранения ЭДО');
                loadEntities(currentClientId, false);
            } else {
                if (window.BazaListClients) window.BazaListClients.refreshTable(); // <-- ДОБАВИТЬ
            }
        })
        .catch(function() {
            alert('Ошибка сети');
            loadEntities(currentClientId, false);
        });
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