/*
baza_klientov/static/baza_klientov/js/sections/client_detail.js
JavaScript секции «Клиент» страницы /baza_klientov/.

ЧТО ДЕЛАЕТ:
  - слушает событие clientSelected от списка клиентов;
  - отображает данные клиента и выбранного юрлица;
  - dblclick-редактирование для name и discount клиента;
  - убрано редактирование адреса, реквизитов и ЭДО клиента (переехали в юрлицо).
*/

"use strict";

(function () {
    let activeClient = null;

    document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('clientSelected', handleClientSelected);
        document.addEventListener('dblclick', handleFieldDblClick);
        
        const deleteBtn = document.getElementById('client-detail-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', handleDeleteClient);
        }
    });

    function handleClientSelected(event) {
        const d = event.detail || {};
        if (!d.clientId) return;

        activeClient = {
            id: String(d.clientId),
            number: d.clientNumber || '',
            name: d.clientName || '',
            discount: d.clientDiscount !== undefined ? String(d.clientDiscount) : '0',
            comment: d.clientComment || '',
            address: d.clientAddress || '', // <-- НОВОЕ
            legalEntity: d.legalEntity || null
        };

        renderClient();
    }

    function renderClient() {
        const emptyEl = document.getElementById('client-detail-empty');
        const bodyEl  = document.getElementById('client-detail-body');
        
        if (!activeClient) {
            emptyEl.style.display = 'block';
            bodyEl.style.display = 'none';
            return;
        }

        emptyEl.style.display = 'none';
        bodyEl.style.display = 'block';

        // Номер, Название, Скидка
        document.getElementById('client-detail-number').textContent = activeClient.number || '—';
        setValueAndOriginal('client-detail-name-display', activeClient.name || '—', activeClient.name);
        
        const discountText = (Number(activeClient.discount) || 0) === 0 ? 'Без скидки' : activeClient.discount + '%';
        setValueAndOriginal('client-detail-discount-display', discountText, activeClient.discount);

        // Комментарий клиента
        setValueAndOriginal('client-detail-comment-display', activeClient.comment || '—', activeClient.comment);

        // Адрес доставки клиента (НОВОЕ)
        setValueAndOriginal('client-detail-address-display', activeClient.address || '—', activeClient.address);

        // Юрлицо
        const leBlock = document.getElementById('client-detail-legal-entity');
        if (leBlock) {
            if (activeClient.legalEntity) {
                leBlock.style.display = 'block';
                document.getElementById('client-detail-le-name').textContent = activeClient.legalEntity.name || '—';
                document.getElementById('client-detail-le-requisites').textContent = activeClient.legalEntity.requisites || 'Реквизиты не указаны';
                
                // Комментарий юрлица (НОВОЕ)
                const leCommentEl = document.getElementById('client-detail-le-comment');
                if (leCommentEl) {
                    leCommentEl.textContent = activeClient.legalEntity.comment || 'Не указан';
                }

                const edoBadge = document.getElementById('client-detail-le-edo');
                edoBadge.classList.remove('client-detail-edo-active', 'client-detail-edo-inactive');
                edoBadge.classList.add(activeClient.legalEntity.hasEdo ? 'client-detail-edo-active' : 'client-detail-edo-inactive');
            } else {
                leBlock.style.display = 'none';
            }
        }
    }

    function handleFieldDblClick(event) {
        if (!activeClient) return;

        const valueEl = event.target.closest('.cd-value[data-field]');
        if (!valueEl) return;

        const field = valueEl.dataset.field;
        // Разрешаем редактировать: name, discount, comment, address
        if (field !== 'name' && field !== 'discount' && field !== 'comment' && field !== 'address') return;
        if (valueEl.classList.contains('editing')) return;

        event.preventDefault();
        openFieldEditor(field, valueEl);
    }

    function openFieldEditor(field, valueEl) {
        const inputEl = document.querySelector('.client-detail-input[data-field="' + field + '"]');
        if (!inputEl) return;

        const original = (valueEl.dataset.originalValue === '—') ? '' : (valueEl.dataset.originalValue || '');

        valueEl.classList.add('editing');
        valueEl.style.display = 'none';
        inputEl.value = original;
        inputEl.style.display = '';

        inputEl.focus();
        if (inputEl.select && field !== 'comment' && field !== 'address') inputEl.select();

        let finished = false;

        function finish(save) {
            if (finished) return;
            finished = true;

            inputEl.removeEventListener('keydown', onKeydown);
            inputEl.removeEventListener('blur', onBlur);

            valueEl.classList.remove('editing');
            valueEl.style.display = '';
            inputEl.style.display = 'none';

            if (save) {
                const newValue = inputEl.value.trim();
                if (newValue === (original || '')) return;
                saveField(field, valueEl, newValue, original);
            } else {
                valueEl.textContent = displayText(field, original);
            }
        }

        function onKeydown(e) {
            if (e.key === 'Enter' && field !== 'comment' && field !== 'address') {
                e.preventDefault();
                finish(true);
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                finish(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
            }
        }

        function onBlur() {
            setTimeout(function () { finish(true); }, 100);
        }

        inputEl.addEventListener('keydown', onKeydown);
        inputEl.addEventListener('blur', onBlur);
    }

    function saveField(field, valueEl, newValue, original) {
        const savedHTML = valueEl.innerHTML;
        valueEl.innerHTML = '<span style="color:#0B8661; font-style:italic;">Сохранение...</span>';

        const fd = new FormData();
        fd.append('field_name', field);
        fd.append('new_value', newValue);
        fd.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        fetch('/baza_klientov/api/update_client/' + activeClient.id + '/', {
            method: 'POST',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success && data.client) {
                if (field === 'name') {
                    activeClient.name = data.client.name;
                    setValueAndOriginal('client-detail-name-display', activeClient.name, activeClient.name);
                    syncListRow('name', activeClient.name);
                } else if (field === 'discount') {
                    activeClient.discount = String(data.client.discount);
                    const txt = (Number(activeClient.discount) || 0) === 0 ? 'Без скидки' : activeClient.discount + '%';
                    setValueAndOriginal('client-detail-discount-display', txt, activeClient.discount);
                    syncListRow('discount', activeClient.discount);
                } else if (field === 'comment') {
                    activeClient.comment = data.client.comment || '';
                    setValueAndOriginal('client-detail-comment-display', activeClient.comment || '—', activeClient.comment);
                    syncListRow('comment', activeClient.comment);
                } else if (field === 'address') { // <-- НОВОЕ
                    activeClient.address = data.client.address || '';
                    setValueAndOriginal('client-detail-address-display', activeClient.address || '—', activeClient.address);
                    syncListRow('address', activeClient.address);
                }
            } else {
                valueEl.innerHTML = savedHTML;
                notify(data.error || 'Ошибка сохранения', 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            valueEl.innerHTML = savedHTML;
            notify('Ошибка сети при сохранении', 'error');
        });
    }

    function handleDeleteClient() {
        if (!activeClient) return;
        
        window.BazaConfirm.show(
            'Удалить клиента?', 
            'Вы уверены, что хотите удалить клиента "' + activeClient.name + '"?',
            function() {
                const fd = new FormData();
                fd.append('csrfmiddlewaretoken', getCookie('csrftoken'));

                fetch('/baza_klientov/delete_client/' + activeClient.id + '/', {
                    method: 'POST',
                    body: fd,
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                })
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    if (data.success) {
                        const row = document.querySelector('.list-clients-row[data-client-id="' + activeClient.id + '"]');
                        if (row) row.remove();

                        document.getElementById('client-detail-body').style.display = 'none';
                        document.getElementById('client-detail-empty').style.display = 'block';
                        activeClient = null;
                        
                        notify('Клиент удалён', 'error');
                    } else {
                        notify('Ошибка при удалении: ' + (data.error || ''), 'error');
                    }
                })
                .catch(function (err) {
                    console.error(err);
                    notify('Ошибка сети при удалении', 'error');
                });
            }
        );
    }

    function setValueAndOriginal(id, text, originalValue) {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.dataset.originalValue = originalValue === undefined ? '' : String(originalValue);
    }

    function displayText(field, raw) {
        if (raw === '' || raw === null || raw === undefined) {
            if (field === 'discount') return 'Без скидки';
            return '—';
        }
        if (field === 'discount') {
            const n = Number(raw) || 0;
            return n === 0 ? 'Без скидки' : n + '%';
        }
        return String(raw);
    }

    function syncListRow(field, value) {
        if (!activeClient) return;
        const row = document.querySelector('.list-clients-row[data-client-id="' + activeClient.id + '"]');
        if (!row) return;

        if (field === 'name') {
            const cell = row.querySelector('.col-name');
            if (cell) cell.textContent = value || '';
            row.dataset.clientName = value || '';
        } else if (field === 'discount') {
            const cell = row.querySelector('.col-discount');
            if (cell) {
                const n = Number(value) || 0;
                cell.textContent = n === 0 ? 'Без скидки' : n + '%';
            }
            row.dataset.clientDiscount = String(value);
        } else if (field === 'comment') {
            row.dataset.clientComment = value || '';
        } else if (field === 'address') { // <-- НОВОЕ
            row.dataset.clientAddress = value || '';
        }
    }

    function notify(message, type) {
        if (window.BazaNotify && typeof window.BazaNotify.notify === 'function') {
            window.BazaNotify.notify(message, type);
        } else {
            alert(message);
        }
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