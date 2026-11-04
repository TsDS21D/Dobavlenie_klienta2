"use strict";

    // Переменные для модалки удаления
    let pendingDeleteType = null; // 'order', 'product', 'tovar'
    let pendingDeleteId = null;
    let pendingDeleteButton = null;

(function () {
    var API_COMMENT_URL_TPL = '/orders/api/order/__ORDER_ID__/update-comment/';
    var API_PRODUCT_DETAILS_URL_TPL = '/orders/api/product/__PRODUCT_ID__/details/';
    var API_PRODUCT_TO_PROSCHET = '/orders/api/proschet-from-product/';

    function getCsrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content') || '';
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var c = cookies[i].trim();
            if (c.indexOf('csrftoken=') === 0) return decodeURIComponent(c.substring('csrftoken='.length));
        }
        return '';
    }

    function showNotification(message, type) {
        const container = document.getElementById('proschety-top-notifications');
        if (!container) return;

        const box = document.createElement('div');
        box.className = 'proschety-top-notification';
        if (type === 'error')   box.classList.add('proschety-top-notification-error');
        if (type === 'warning') box.classList.add('proschety-top-notification-warning');
        box.textContent = message;
        container.appendChild(box);

        function hide() {
            box.classList.add('proschety-top-notification-out');
            setTimeout(function () {
                if (box.parentNode) box.parentNode.removeChild(box);
            }, 300);
        }
        box.addEventListener('click', hide);
        setTimeout(hide, 2500);
    }

    // ========================================================================
    // ИНЛАЙН-РЕДАКТИРОВАНИЕ (Клиент, Дата, Комментарий)
    // ========================================================================
    document.addEventListener('dblclick', function(event) {
        const cell = event.target.closest('.editable-cell');
        if (!cell || cell.classList.contains('editing-cell')) return;
        const card = cell.closest('.list-orders-card');
        if (!card) return;
        const orderId = card.dataset.orderId;
        if (!orderId) return;
        const field = cell.dataset.field;

        if (field === 'client') activateClientEdit(cell, orderId, card.dataset.clientId || '');
        else if (field === 'ready_datetime') activateReadyEdit(cell, orderId);
        else if (field === 'comment') activateCommentEdit(cell, orderId);
    });

    function activateClientEdit(cell, orderId, currentId) {
        const originalText  = cell.dataset.originalValue || '—';
        fetch('/orders/api/clients/', { method: 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(r => r.json())
        .then(data => {
            if (!data.success) return;
            cell.classList.add('editing-cell');
            cell.innerHTML = '';
            const select = document.createElement('select');
            select.className = 'list-orders-inline-select';
            select.innerHTML = '<option value="">— Не выбран —</option>';
            data.clients.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name + (c.primary_le_name ? ' (' + c.primary_le_name + ')' : '');
                if (String(c.id) === String(currentId)) opt.selected = true;
                select.appendChild(opt);
            });
            cell.appendChild(select); select.focus();
            let finished = false;
            select.addEventListener('change', () => { if(!finished){ finished=true; saveField(cell, orderId, 'client', select.value, originalText); }});
            select.addEventListener('blur', () => setTimeout(() => { if(!finished){ finished=true; saveField(cell, orderId, 'client', select.value, originalText); }}, 120));
        });
    }

    function activateReadyEdit(cell, orderId) {
        const currentVal  = cell.dataset.originalValue || '';
        const originalText = cell.textContent.trim();
        cell.classList.add('editing-cell'); cell.innerHTML = '';
        const input = document.createElement('input');
        input.type = 'datetime-local'; input.className = 'list-orders-inline-input'; input.value = currentVal;
        cell.appendChild(input); input.focus();
        let finished = false;
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); if(!finished){ finished=true; saveField(cell, orderId, 'ready_datetime', input.value, originalText); }}
            else if (e.key === 'Escape') { e.preventDefault(); if(!finished){ finished=true; cancelEdit(cell, originalText); }}
        });
        input.addEventListener('blur', () => setTimeout(() => { if(!finished){ finished=true; saveField(cell, orderId, 'ready_datetime', input.value, originalText); }}, 100));
    }

    function activateCommentEdit(cell, orderId) {
        const currentVal   = cell.dataset.originalValue || '';
        const originalText = currentVal || '—';
        cell.classList.add('editing-cell'); cell.innerHTML = '';
        const textarea = document.createElement('textarea');
        textarea.className = 'list-orders-inline-textarea'; textarea.value = currentVal; textarea.maxLength = 5000;
        cell.appendChild(textarea);
        requestAnimationFrame(() => { textarea.style.height = 'auto'; textarea.style.height = textarea.scrollHeight + 'px'; });
        textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        textarea.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = this.scrollHeight + 'px'; });
        let finished = false;
        textarea.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); if(!finished){ finished=true; cancelEdit(cell, originalText); }}
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if(!finished){ finished=true; saveField(cell, orderId, 'comment', textarea.value, originalText); }}
        });
        textarea.addEventListener('blur', () => setTimeout(() => { if(!finished){ finished=true; saveField(cell, orderId, 'comment', textarea.value, originalText); }}, 100));
    }

    function saveField(cell, orderId, fieldName, fieldValue, originalValue) {
        cell.innerHTML = '<span class="list-orders-inline-saving">Сохранение...</span>';
        const fd = new FormData(); fd.append('field_name', fieldName); fd.append('field_value', fieldValue);
        fetch('/orders/api/order/' + orderId + '/update-field/', { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': getCsrfToken() } })
        .then(r => r.json()).then(data => {
            if (!data.success) { cancelEdit(cell, originalValue); showNotification(data.error || 'Ошибка', 'error'); return; }
            const o = data.order;
            if (fieldName === 'client') {
                cell.innerHTML = `<span class="client-name-text">${o.client_name || '—'}</span>`;
                cell.dataset.originalValue = o.client_name || '—'; cell.classList.remove('editing-cell');
                setTimeout(() => window.location.reload(), 500);
            } else if (fieldName === 'ready_datetime') {
                cell.textContent = o.ready_datetime; cell.dataset.originalValue = fieldValue; cell.classList.remove('editing-cell');
                showNotification('Сохранено', 'success');
                setTimeout(() => window.location.reload(), 500);
            } else if (fieldName === 'comment') {
                const card = cell.closest('.list-orders-card');
                if (card) {
                    card.dataset.comment = o.comment || '';
                    card.querySelectorAll('.editable-cell[data-field="comment"]').forEach(c => {
                        c.textContent = o.comment || '—'; c.dataset.originalValue = o.comment || ''; c.classList.remove('editing-cell');
                    });
                }
                showNotification('Сохранено', 'success');
            }
        }).catch(() => { cancelEdit(cell, originalValue); showNotification('Ошибка сети', 'error'); });
    }

    function cancelEdit(cell, originalValue) { cell.classList.remove('editing-cell'); cell.textContent = originalValue; }

    // ========================================================================
    // ОПЛАТА И ДОСТАВКА
    // ========================================================================
    document.addEventListener('dblclick', function(event) {
        const btn = event.target.closest('.list-orders-payment-btn');
        if (!btn) return;
        event.stopPropagation();
        const orderId = btn.dataset.orderId;
        const isCurrentlyPaid = btn.classList.contains('list-orders-payment-btn--on');
        const newIsPaid = !isCurrentlyPaid;
        const card = btn.closest('.list-orders-card');
        card.querySelectorAll('.list-orders-payment-btn').forEach(b => {
            if (newIsPaid) { b.classList.add('list-orders-payment-btn--on'); b.textContent = 'Оплачен'; }
            else { b.classList.remove('list-orders-payment-btn--on'); b.textContent = 'Не оплачен'; }
        });
        savePaymentField(orderId, 'is_paid', newIsPaid);
    });

    document.addEventListener('dblclick', function(event) {
        const btn = event.target.closest('.list-orders-delivery-btn');
        if (!btn) return;
        event.stopPropagation();
        const orderId = btn.dataset.orderId;
        const card = btn.closest('.list-orders-card');
        const details = card.querySelector(`#delivery-details-${orderId}`);
        const allDeliveryBtns = card.querySelectorAll('.list-orders-delivery-btn');

        let currentState = 'none';
        if (allDeliveryBtns[0].classList.contains('list-orders-delivery-btn--delivered')) currentState = 'delivered';
        else if (allDeliveryBtns[0].classList.contains('list-orders-delivery-btn--pending')) currentState = 'pending';

        let nextState = 'pending';
        if (currentState === 'none') nextState = 'pending';
        else if (currentState === 'pending') nextState = 'delivered';
        else if (currentState === 'delivered') nextState = 'none';

        allDeliveryBtns.forEach(b => {
            b.classList.remove('list-orders-delivery-btn--pending', 'list-orders-delivery-btn--delivered');
            const isCompact = b.classList.contains('list-orders-delivery-btn--compact');
            if (nextState === 'none') { b.textContent = 'Без доставки'; if (isCompact) b.style.display = 'none'; }
            else if (nextState === 'pending') { b.textContent = 'Доставка'; b.classList.add('list-orders-delivery-btn--pending'); if (isCompact) b.style.display = ''; }
            else if (nextState === 'delivered') { b.textContent = 'Доставлено'; b.classList.add('list-orders-delivery-btn--delivered'); if (isCompact) b.style.display = ''; }
        });
        
        if (nextState === 'none') { if (details) details.classList.add('hidden'); savePaymentField(orderId, 'is_delivery', 'false'); }
        else {
            if (details) details.classList.remove('hidden');
            savePaymentField(orderId, 'is_delivery', 'true').then(() => {
                if (nextState === 'pending') return savePaymentField(orderId, 'delivery_status', 'pending');
                else if (nextState === 'delivered') return savePaymentField(orderId, 'delivery_status', 'delivered');
            });
        }
    });

    document.addEventListener('change', function(event) {
        const target = event.target;

        // ===== СМЕНА СТАТУСА ЗАКАЗА =====
        if (target.classList.contains('list-orders-status-select')) {
            const orderId = target.dataset.orderId;
            target.disabled = true;
            
            savePaymentField(orderId, 'status', target.value).then(data => {
                if (data && data.success) {
                    showNotification('Статус изменён', 'success');
                    // Перезагружаем страницу, чтобы обновить цвет карточки и бейджи
                    setTimeout(() => window.location.reload(), 500);
                } else {
                    target.disabled = false;
                }
            });
            return;
        }

        // ===== ОСТАЛЬНЫЕ ПОЛЯ =====
        if (target.closest('.list-orders-delivery-details') && target.dataset.field) {
            savePaymentField(target.dataset.orderId, target.dataset.field, target.value);
        }
        
        if (target.dataset.field === 'payer_type') {
            const card = target.closest('.list-orders-payment-block');
            card.querySelector('.list-orders-payment-detail[id^="payment-detail-legal"]').classList.toggle('hidden', target.value !== 'legal');
            card.querySelector('.list-orders-payment-detail[id^="payment-detail-individual"]').classList.toggle('hidden', target.value !== 'individual');
            card.querySelector('.list-orders-payment-detail[id^="payment-detail-docs"]').classList.toggle('hidden', target.value === '');
            savePaymentField(target.dataset.orderId, 'payer_type', target.value);
        }
        
        if (['invoice_number', 'payment_method', 'documents_status'].includes(target.dataset.field)) {
            savePaymentField(target.dataset.orderId, target.dataset.field, target.value);
        }
        
        if (target.classList.contains('list-orders-le-select') || target.classList.contains('list-orders-cp-select')) {
            savePaymentField(target.dataset.orderId, target.dataset.field, target.value);
        }
        
        if (target.classList.contains('list-orders-select-tovar')) {
            const priceInput = target.closest('.list-orders-add-tovar-form')?.querySelector('.list-orders-tovar-price-input');
            if (priceInput) priceInput.value = target.options[target.selectedIndex].dataset.price || '';
        }
    });

    function savePaymentField(orderId, fieldName, fieldValue) {
        const fd = new FormData(); fd.append('field_name', fieldName); fd.append('field_value', fieldValue);
        return fetch('/orders/api/order/' + orderId + '/update-field/', { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': getCsrfToken() } })
        .then(r => r.json()).then(data => { if (!data.success) showNotification(data.error || 'Ошибка', 'error'); return data; }).catch(() => showNotification('Ошибка сети', 'error'));
    }

    // ========================================================================
    // РАСКРЫТИЕ ИЗДЕЛИЙ И АККОРДЕОНЫ
    // ========================================================================
    document.addEventListener('click', function(e) {
        const headerRow = e.target.closest('.list-orders-product-header-row');
        if (headerRow && !e.target.closest('.list-orders-product-edit-btn') && !e.target.closest('.list-orders-product-delete-btn')) {
            const productItem = headerRow.closest('.list-orders-product-item');
            const expandedBlock = productItem.querySelector('.list-orders-product-expanded');
            if (expandedBlock) {
                const isHidden = expandedBlock.style.display === 'none' || expandedBlock.style.display === '';
                if (isHidden) {
                    expandedBlock.style.display = 'block';
                    if (!expandedBlock.dataset.loaded) {
                        const productId = productItem.dataset.productId;
                        expandedBlock.innerHTML = '<div style="font-size:0.8rem; color:#888; font-style:italic;">Загрузка...</div>';
                        fetch('/orders/api/product/' + productId + '/details/', { method: 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
                        .then(r => r.json()).then(data => { if (data.success && data.product) { renderProductBody(expandedBlock, data.product); expandedBlock.dataset.loaded = '1'; } else { expandedBlock.innerHTML = '<div style="color:red;">Ошибка</div>'; } });
                    }
                } else { expandedBlock.style.display = 'none'; }
            }
            return;
        }

        // ===== ДОБАВЛЕНИЕ ИЗДЕЛИЯ ИЗ ПРОСЧЁТА =====
        const btnAddProschet = e.target.closest('.list-orders-btn-add-from-proschet');
        if (btnAddProschet) {
            e.stopPropagation();
            const orderId = btnAddProschet.dataset.orderId;
            const section = btnAddProschet.closest('.list-orders-add-product-section');
            const select = section.querySelector('.list-orders-select-proschet');
            const proschetId = select.value;

            if (!proschetId) {
                showNotification('Выберите просчёт из списка', 'warning');
                return;
            }

            const originalText = btnAddProschet.textContent;
            btnAddProschet.disabled = true;
            btnAddProschet.textContent = 'Добавление...';

            fetch('/orders/api/add-to-order/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    proschet_id: proschetId,
                    order_id: orderId
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    showNotification('Изделие добавлено в заказ', 'success');
                    // Перезагружаем страницу, чтобы обновить список и суммы
                    setTimeout(() => window.location.reload(), 500);
                } else {
                    showNotification('Ошибка: ' + (data.error || 'неизвестная'), 'error');
                    btnAddProschet.disabled = false;
                    btnAddProschet.textContent = originalText;
                }
            })
            .catch(err => {
                console.error(err);
                showNotification('Ошибка сети при добавлении изделия', 'error');
                btnAddProschet.disabled = false;
                btnAddProschet.textContent = originalText;
            });
            return;
        }  
        
        // ===== ДОБАВЛЕНИЕ ТОВАРА В ЗАКАЗ =====
        const btnAddTovar = e.target.closest('.list-orders-btn-add-tovar');
        if (btnAddTovar) {
            e.stopPropagation();
            const orderId = btnAddTovar.dataset.orderId;
            const section = btnAddTovar.closest('.list-orders-add-tovar-section');
            const select = section.querySelector('.list-orders-select-tovar');
            const qtyInput = section.querySelector('.list-orders-tovar-qty-input');
            const priceInput = section.querySelector('.list-orders-tovar-price-input');

            const tovarId = select.value;
            if (!tovarId) {
                showNotification('Выберите товар из списка', 'warning');
                return;
            }

            const quantity = parseInt(qtyInput.value) || 1;
            const price = priceInput.value.trim();

            const originalText = btnAddTovar.textContent;
            btnAddTovar.disabled = true;
            btnAddTovar.textContent = 'Добавление...';

            fetch('/orders/api/add-tovar-to-order/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    order_id: orderId,
                    tovar_id: tovarId,
                    quantity: quantity,
                    price: price || null
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    showNotification('Товар добавлен в заказ', 'success');
                    // Перезагружаем страницу, чтобы обновить список товаров и общую сумму
                    setTimeout(() => window.location.reload(), 500);
                } else {
                    showNotification('Ошибка: ' + (data.error || 'неизвестная'), 'error');
                    btnAddTovar.disabled = false;
                    btnAddTovar.textContent = originalText;
                }
            })
            .catch(err => {
                console.error(err);
                showNotification('Ошибка сети при добавлении товара', 'error');
                btnAddTovar.disabled = false;
                btnAddTovar.textContent = originalText;
            });
            return;
        }

        const btnProd = e.target.closest('.list-orders-toggle-add-product');
        if (btnProd) {
            e.stopPropagation();
            const section = btnProd.closest('.list-orders-add-product-section');
            section.classList.toggle('is-open');
            if (section.classList.contains('is-open')) {
                const select = section.querySelector('.list-orders-select-proschet');
                if (select && select.options.length <= 1) loadProschetsForSelect(select);
            }
            return;
        }

        const btnTovar = e.target.closest('.list-orders-toggle-add-tovar');
        if (btnTovar) {
            e.stopPropagation();
            const section = btnTovar.closest('.list-orders-add-tovar-section');
            section.classList.toggle('is-open');
            if (section.classList.contains('is-open')) {
                const select = section.querySelector('.list-orders-select-tovar');
                if (select && select.options.length <= 1) loadTovarsForSelect(select);
            }
            return;
        }
    });

    function loadProschetsForSelect(selectEl) {
        fetch('/orders/api/proschets-list/').then(r => r.json()).then(data => {
            if (!data.success || !data.proschets) return selectEl.innerHTML = '<option value="">— Ошибка —</option>';
            let html = '<option value="">— Выберите просчёт —</option>';
            data.proschets.forEach(p => { html += `<option value="${p.id}">${p.number}: ${p.title}</option>`; });
            selectEl.innerHTML = html;
        });
    }

    function loadTovarsForSelect(selectEl) {
        fetch('/orders/api/tovary-list/').then(r => r.json()).then(data => {
            if (!data.success || !data.tovary) return selectEl.innerHTML = '<option value="">— Ошибка —</option>';
            let html = '<option value="">— Выберите товар —</option>';
            data.tovary.forEach(t => { html += `<option value="${t.id}" data-price="${t.price}">${t.name}${t.article?' (арт. '+t.article+')':''} — ${t.price} ₽</option>`; });
            selectEl.innerHTML = html;
        });
    }

    function renderProductBody(body, product) {
        let html = '';
        if (product.components && product.components.length) {
            product.components.forEach((comp, idx) => {
                let width = '—', height = '—', vyleta = '—', mpDetailsHtml = '';
                if (comp.multipage) {
                    width = comp.multipage.finished_width; height = comp.multipage.finished_height; vyleta = comp.multipage.vyleta;
                    const bookOrient = comp.multipage.booklet_orientation === 'portrait' ? 'Портретная' : 'Альбомная';
                    mpDetailsHtml = `<div class="proschet-inline-field"><span class="proschet-inline-field-label">Страниц:</span><span class="order-field-value">${comp.multipage.total_pages}</span></div><div class="proschet-inline-field"><span class="proschet-inline-field-label">Скрепление:</span><span class="order-field-locked">${comp.multipage.binding_name || '—'}</span></div><div class="proschet-inline-field"><span class="proschet-inline-field-label">Ориентация:</span><span class="order-field-locked">${bookOrient}</span></div>`;
                } else if (comp.vichisliniya) { width = comp.vichisliniya.item_width; height = comp.vichisliniya.item_height; vyleta = comp.vichisliniya.vyleta; }
                
                const isColor = comp.print_type === 'color', bgColorClass = isColor ? 'proschet-mode-btn--side-color' : 'proschet-mode-btn--side-bw';
                const cardClass = comp.multipage ? 'order-product-component-card--multi' : '';

                html += `<div class="order-product-component-card ${cardClass}">
                    <div class="order-component-data-col">
                        <div style="display: flex; flex-wrap: wrap; gap: 0.8rem;">
                            <div class="proschet-inline-field"><span class="proschet-inline-field-label">Принтер:</span><span class="order-field-locked">${comp.printer_name || '—'}</span></div>
                            <div class="proschet-inline-field"><span class="proschet-inline-field-label">Бумага:</span><span class="order-field-locked">${comp.paper_name || '—'}</span></div>
                            <div class="proschet-inline-field"><span class="proschet-inline-field-label">Тип:</span><div class="proschet-mode-switch"><button class="proschet-mode-btn active ${bgColorClass}">${comp.print_type_display}</button></div></div>
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.8rem;">
                            <div class="proschet-inline-field"><span class="proschet-inline-field-label">Режим:</span><span class="order-field-locked">${comp.printing_mode_display}</span></div>
                            <div class="proschet-inline-field"><span class="proschet-inline-field-label">Листов:</span><span class="order-field-value">${comp.formatted_sheet_count}</span></div>
                            <div class="proschet-inline-field"><span class="proschet-inline-field-label">Вылеты:</span><span class="order-field-value">${vyleta} мм</span></div>
                            <div class="proschet-inline-field"><span class="proschet-inline-field-label">Размер:</span><span class="order-field-value">${width} × ${height} мм</span></div>
                            ${mpDetailsHtml}
                        </div>
                        ${comp.lamination ? `<div class="order-product-component-lamination"><div class="proschet-inline-field"><span class="proschet-inline-field-label">Ламинатор:</span><span class="order-field-locked">${comp.lamination.laminator_name || '—'}</span></div><div class="proschet-inline-field"><span class="proschet-inline-field-label">Плёнка:</span><span class="order-field-locked">${comp.lamination.film_name || '—'}</span></div><div class="proschet-inline-field"><span class="proschet-inline-field-label">Сторона:</span><span class="order-field-locked">${comp.lamination.side_display}</span></div></div>` : ''}
                        ${(comp.works && comp.works.length > 0) ? `<div class="order-product-component-works"><span class="order-works-label">Доп. работы:</span><div class="order-works-list">${comp.works.map(w => `<span class="order-work-item">${w.title}: <b>${w.quantity} шт.</b> — <span class="order-work-price">${w.formatted_total_price}</span></span>`).join('')}</div></div>` : ''}
                    </div>
                    <div class="order-component-viz-col">
                        <div class="order-component-viz">
                            <div class="order-viz-side"><div class="order-viz-label">Лицевая</div><canvas class="order-viz-canvas" data-comp-id="${comp.id}" data-side="front"></canvas></div>
                            <div class="order-viz-side"><div class="order-viz-label">Обратная</div><canvas class="order-viz-canvas" data-comp-id="${comp.id}" data-side="back"></canvas></div>
                        </div>
                    </div>
                </div>`;
            });
        } else { html += '<div class="order-product-empty">В изделии нет компонентов.</div>'; }

        var massG = parseFloat(product.frozen_total_mass_g) || 0, volumeCm3 = parseFloat(product.frozen_total_volume_cm3) || 0;
        var massKg = (massG / 1000).toFixed(3), volumeL = (volumeCm3 / 1000).toFixed(3), totalStackMm = 0;
        (product.frozen_stacks || []).forEach(s => { if (s.valid && s.stack_height_mm != null) totalStackMm += Number(s.stack_height_mm); });
        var stackText = totalStackMm > 0 ? (Math.round(totalStackMm * 10) / 10 % 1 === 0 ? String(Math.round(totalStackMm * 10) / 10) : (Math.round(totalStackMm * 10) / 10).toFixed(1)) + ' мм' : '—';

        if (html !== '') html += `<div style="font-size: 0.75rem; color: #999; margin-top: 0.8rem; padding-top: 0.5rem; border-top: 1px dashed #ececec; display: flex; gap: 1.5rem;"><span>Масса: <b>${massKg} кг</b></span><span>Объём: <b>${volumeL} л</b></span><span>Высота стопки: <b>${stackText}</b></span></div>`;
        if (html === '') html = '<div style="font-size:0.8rem; color:#888; font-style:italic;">Нет компонентов</div>';
        html += `<div class="order-product-total" style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: baseline;"><span>Итого по изделию:</span><b>${product.formatted_total_price}</b></div>`;
        html += `<div class="order-product-actions" style="margin-top: 0.75rem; text-align: right;"><button type="button" class="order-btn-create-proschet" data-product-id="${product.id}">Создать просчёт из изделия</button></div>`;

        body.innerHTML = html;
        if (product.components) product.components.forEach(c => drawOrderComponentViz(c));
        var btn = body.querySelector('.order-btn-create-proschet');
        if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); handleCreateProschetFromProduct(product.id, btn); });
    }

    function drawOrderComponentViz(comp) {
        const canvases = document.querySelectorAll(`.order-viz-canvas[data-comp-id="${comp.id}"]`);
        if (!canvases.length) return;
        const sheetW = parseFloat(comp.sheet_width) || 0, sheetH = parseFloat(comp.sheet_height) || 0, margin = parseFloat(comp.margin) || 0;
        let itemW = 0, itemH = 0, vyleta = 0, fitH = 0, fitV = 0, isStapled = false, bookletOrient = 'portrait', effectiveOrient = 'landscape';
        if (comp.multipage) { itemW = parseFloat(comp.multipage.finished_width) || 0; itemH = parseFloat(comp.multipage.finished_height) || 0; vyleta = parseFloat(comp.multipage.vyleta) || 0; fitH = parseInt(comp.multipage.fit_horizontal) || 0; fitV = parseInt(comp.multipage.fit_vertical) || 0; isStapled = (comp.multipage.binding_name || '').toLowerCase().includes('скрепка'); bookletOrient = comp.multipage.booklet_orientation || 'portrait'; effectiveOrient = comp.multipage.fit_selected_orientation || 'landscape'; }
        else if (comp.vichisliniya) { itemW = parseFloat(comp.vichisliniya.item_width) || 0; itemH = parseFloat(comp.vichisliniya.item_height) || 0; vyleta = parseFloat(comp.vichisliniya.vyleta) || 0; fitH = parseInt(comp.vichisliniya.fit_horizontal) || 0; fitV = parseInt(comp.vichisliniya.fit_vertical) || 0; effectiveOrient = comp.vichisliniya.fit_selected_orientation || 'landscape'; }
        
        const isDuplex = comp.printing_mode === 'duplex', isColor = comp.print_type === 'color';

        canvases.forEach(canvas => {
            const isBack = canvas.dataset.side === 'back', fill = isBack ? isDuplex : true;
            const shouldLaminate = isBack ? (comp.lamination && comp.lamination.side === 'duplex') : !!comp.lamination;
            const ctx = canvas.getContext('2d'), MAX = 240, PADDING = 4;
            if (!sheetW || !sheetH) { canvas.width = MAX; canvas.height = MAX; return; }
            const maxSheetDim = Math.max(sheetW, sheetH), scale = (MAX - 2 * PADDING) / maxSheetDim;
            canvas.width = Math.round(sheetW * scale + 2 * PADDING); canvas.height = Math.round(sheetH * scale + 2 * PADDING);
            ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.translate(PADDING, PADDING);
            ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8; ctx.strokeRect(0, 0, sheetW * scale, sheetH * scale);
            ctx.strokeStyle = '#999'; ctx.setLineDash([2, 1]); ctx.strokeRect(margin * scale, margin * scale, (sheetW - 2 * margin) * scale, (sheetH - 2 * margin) * scale); ctx.setLineDash([]);
            
            let fillColor, strokeColor;
            if (comp.multipage) { fillColor = fill ? (isColor ? 'rgba(42, 111, 201, 0.2)' : 'rgba(200, 200, 200, 0.4)') : 'transparent'; strokeColor = fill ? (isColor ? '#2a6fc9' : '#999999') : '#b3cce6'; }
            else { fillColor = fill ? (isColor ? 'rgba(11, 134, 97, 0.18)' : 'rgba(200, 200, 200, 0.4)') : 'transparent'; strokeColor = fill ? (isColor ? '#0B8661' : '#999999') : '#cccccc'; }
            ctx.fillStyle = fillColor; ctx.strokeStyle = strokeColor; ctx.lineWidth = 0.5;
            const isPortraitPlacement = (effectiveOrient === 'portrait');

            if (comp.multipage && isStapled) {
                let spreadWidthBase = (bookletOrient === 'portrait') ? itemW * 2 : itemW, spreadHeightBase = (bookletOrient === 'portrait') ? itemH : itemH * 2;
                let isPortraitPlacementAuto = (effectiveOrient === 'auto') ? (spreadWidthBase > spreadHeightBase) : isPortraitPlacement;
                const originalPagePlacement = (bookletOrient === 'portrait') ? 'horizontal' : 'vertical';
                const effectivePagePlacement = isPortraitPlacementAuto ? (originalPagePlacement === 'horizontal' ? 'vertical' : 'horizontal') : originalPagePlacement;
                const effectivePageW = isPortraitPlacementAuto ? itemH : itemW, effectivePageH = isPortraitPlacementAuto ? itemW : itemH;
                let spreadWidth = spreadWidthBase, spreadHeight = spreadHeightBase;
                if (isPortraitPlacementAuto) { let temp = spreadWidth; spreadWidth = spreadHeight; spreadHeight = temp; }

                for (let r = 0; r < fitV; r++) { for (let c = 0; c < fitH; c++) {
                    const x = margin + c * (spreadWidth + vyleta), y = margin + r * (spreadHeight + vyleta);
                    if (effectivePagePlacement === 'horizontal') {
                        const leftX = x, rightX = x + effectivePageW, pageY = y;
                        if (fill) ctx.fillRect(leftX * scale, pageY * scale, effectivePageW * scale, effectivePageH * scale); ctx.strokeRect(leftX * scale, pageY * scale, effectivePageW * scale, effectivePageH * scale);
                        if (fill) ctx.fillRect(rightX * scale, pageY * scale, effectivePageW * scale, effectivePageH * scale); ctx.strokeRect(rightX * scale, pageY * scale, effectivePageW * scale, effectivePageH * scale);
                        ctx.save(); ctx.strokeStyle = '#e67e22'; ctx.fillStyle = '#e67e22'; ctx.setLineDash([3, 2]);
                        ctx.beginPath(); ctx.moveTo((x + effectivePageW) * scale, y * scale); ctx.lineTo((x + effectivePageW) * scale, (y + effectivePageH) * scale); ctx.stroke();
                        ctx.beginPath(); ctx.arc((x + effectivePageW) * scale, (y + effectivePageH * 0.25) * scale, 1.5, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc((x + effectivePageW) * scale, (y + effectivePageH * 0.75) * scale, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                    } else {
                        const topY = y, bottomY = y + effectivePageH, pageX = x;
                        if (fill) ctx.fillRect(pageX * scale, topY * scale, effectivePageW * scale, effectivePageH * scale); ctx.strokeRect(pageX * scale, topY * scale, effectivePageW * scale, effectivePageH * scale);
                        if (fill) ctx.fillRect(pageX * scale, bottomY * scale, effectivePageW * scale, effectivePageH * scale); ctx.strokeRect(pageX * scale, bottomY * scale, effectivePageW * scale, effectivePageH * scale);
                        ctx.save(); ctx.strokeStyle = '#e67e22'; ctx.fillStyle = '#e67e22'; ctx.setLineDash([3, 2]);
                        ctx.beginPath(); ctx.moveTo(x * scale, (y + effectivePageH) * scale); ctx.lineTo((x + effectivePageW) * scale, (y + effectivePageH) * scale); ctx.stroke();
                        ctx.beginPath(); ctx.arc((x + effectivePageW * 0.25) * scale, (y + effectivePageH) * scale, 1.5, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc((x + effectivePageW * 0.75) * scale, (y + effectivePageH) * scale, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
                    }
                }}
            } else {
                const drawW = isPortraitPlacement ? itemH : itemW, drawH = isPortraitPlacement ? itemW : itemH;
                for (let r = 0; r < fitV; r++) { for (let c = 0; c < fitH; c++) {
                    const x = margin + c * (drawW + vyleta), y = margin + r * (drawH + vyleta);
                    if (fill) ctx.fillRect(x * scale, y * scale, drawW * scale, drawH * scale); ctx.strokeRect(x * scale, y * scale, drawW * scale, drawH * scale);
                }}
            }
            if (shouldLaminate) { ctx.fillStyle = 'rgba(255, 165, 0, 0.09)'; ctx.fillRect(0, 0, sheetW * scale, sheetH * scale); }
            ctx.restore();
        });
    }

    function handleCreateProschetFromProduct(productId, btn) {
        if (!window.confirm('Создать новый просчёт?')) return;
        var originalText = btn.textContent; btn.disabled = true; btn.textContent = 'Создание…';
        fetch(API_PRODUCT_TO_PROSCHET, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() }, body: JSON.stringify({ product_id: productId }) })
        .then(r => r.json()).then(data => {
            if (!data.success) { showNotification('Ошибка: ' + data.error, 'error'); btn.disabled = false; btn.textContent = originalText; return; }
            showNotification('Просчёт ' + data.proschet_number + ' создан', 'success');
            setTimeout(() => window.location.href = '/calculator/?proschet_id=' + data.proschet_id, 500);
        }).catch(() => { showNotification('Ошибка сети', 'error'); btn.disabled = false; btn.textContent = originalText; });
    }

    document.addEventListener('DOMContentLoaded', function () {
        // Восстанавливаем тосты, которые были до перезагрузки страницы
        restoreToasts();
        
        const leSelects = document.querySelectorAll('.list-orders-le-select');
        const clientIds = new Set();
        leSelects.forEach(sel => { if (sel.dataset.clientId) clientIds.add(sel.dataset.clientId); });
        clientIds.forEach(clientId => {
            fetch('/orders/api/client-details/' + clientId + '/').then(r=>r.json()).then(data => {
                if (!data.success) return;
                document.querySelectorAll(`.list-orders-le-select[data-client-id="${clientId}"]`).forEach(sel => {
                    let html = `<option value="">— Юрлицо —</option>`;
                    data.legal_entities.forEach(item => { html += `<option value="${item.id}" ${String(item.id) === String(sel.dataset.currentId) ? 'selected' : ''}>${item.name}</option>`; });
                    sel.innerHTML = html;
                });
                document.querySelectorAll(`.list-orders-cp-select[data-client-id="${clientId}"]`).forEach(sel => {
                    let html = `<option value="">— Сотрудник —</option>`;
                    data.contact_persons.forEach(item => { html += `<option value="${item.id}" ${String(item.id) === String(sel.dataset.currentId) ? 'selected' : ''}>${item.name}</option>`; });
                    sel.innerHTML = html;
                });
            });
        });
        // Запускаем WebSocket для отслеживания статуса и реактивности
        initWebSocket();
        // Подключаем удаление
        document.addEventListener('click', handleDeleteClick);
        const confirmNo = document.getElementById('list-orders-confirm-no');
        const confirmYes = document.getElementById('list-orders-confirm-yes');
        if (confirmNo) confirmNo.addEventListener('click', closeConfirmModal);
        if (confirmYes) confirmYes.addEventListener('click', confirmDeleteYes);
        
        const overlay = document.getElementById('list-orders-confirm-overlay');
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) closeConfirmModal();
            });
        }
    });


    // ========================================================================
    // УДАЛЕНИЕ (ИЗДЕЛИЯ, ТОВАРЫ, ЗАКАЗ)
    // ========================================================================
    function handleDeleteClick(event) {
        const btn = event.target.closest('.list-orders-product-delete-btn, .list-orders-tovar-delete-btn, .list-orders-btn-delete');
        if (!btn) return;
        event.stopPropagation(); // Чтобы не раскрывалась карточка

        let type, id, title, text;

        if (btn.classList.contains('list-orders-product-delete-btn')) {
            type = 'product';
            id = btn.dataset.productId;
            title = 'Удалить изделие?';
            text = 'Изделие пропадёт из этого заказа.<br>Его можно будет восстановить через админку.';
        } else if (btn.classList.contains('list-orders-tovar-delete-btn')) {
            type = 'tovar';
            id = btn.dataset.tovarId;
            title = 'Удалить товар?';
            text = 'Товар пропадёт из этого заказа.<br>Его можно будет восстановить через админку.';
        } else if (btn.classList.contains('list-orders-btn-delete')) {
            type = 'order';
            id = btn.dataset.orderId;
            title = 'Удалить заказ?';
            text = 'Заказ пропадёт из списка.<br>Его можно будет восстановить через админку.';
        } else {
            return;
        }

        pendingDeleteType = type;
        pendingDeleteId = id;
        pendingDeleteButton = btn;

        const overlay = document.getElementById('list-orders-confirm-overlay');
        if (overlay) {
            overlay.querySelector('#confirm-modal-title').textContent = title;
            overlay.querySelector('#confirm-modal-text').innerHTML = text;
            overlay.style.display = 'flex';
        }
    }

    function closeConfirmModal() {
        const overlay = document.getElementById('list-orders-confirm-overlay');
        if (overlay) overlay.style.display = 'none';
        pendingDeleteType = null;
        pendingDeleteId = null;
        pendingDeleteButton = null;
    }

    function confirmDeleteYes() {
        if (!pendingDeleteType || !pendingDeleteId) return;

        const btn = pendingDeleteButton;
        const type = pendingDeleteType;
        const id = pendingDeleteId;
        
        closeConfirmModal();
        if (btn) btn.disabled = true;

        let url = '';
        if (type === 'product') url = '/orders/api/product/' + id + '/delete/';
        else if (type === 'tovar') url = '/orders/api/order-tovar/' + id + '/delete/';
        else if (type === 'order') url = '/orders/api/order/' + id + '/delete/';

        fetch(url, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(r => {
            // Если вернулась 404 (уже удалено) — считаем успехом
            if (r.status === 404) return { success: true };
            return r.json();
        })
        .then(data => {
            if (data.success) {
                showNotification('Удалено', 'success');
                if (type === 'order') {
                    // Если удалили весь заказ — уходим в список
                    setTimeout(() => window.location.href = '/orders/', 500);
                } else {
                    // Если удалили изделие/товар — перезагружаем страницу
                    setTimeout(() => window.location.reload(), 500);
                }
            } else {
                if (btn) btn.disabled = false;
                showNotification(data.error || 'Ошибка удаления', 'error');
            }
        })
        .catch(err => {
            console.error(err);
            if (btn) btn.disabled = false;
            showNotification('Ошибка сети при удалении', 'error');
        });
    }

    // ========================================================================
    // 7. WEBSOCKET (Динамическая иконка и реактивность)
    // ========================================================================

    // Функция смены цвета иконки вкладки
    function setFaviconStatus(status) {
        const favicon = document.getElementById('detail-favicon');
        if (!favicon) return;
        
        let color = '%23999'; // серый (подключение)
        if (status === 'online') color = '%230B8661'; // зеленый (онлайн)
        if (status === 'offline') color = '%23f44336'; // красный (оффлайн)
        
        // Тот самый код лупы, но с подстановкой цвета
        favicon.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><circle cx='11' cy='11' r='8'></circle><line x1='21' y1='21' x2='16.65' y2='16.65'></line></svg>`;
    }

    // Функция подключения к WebSocket
    function initWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const url = protocol + window.location.host + '/ws/orders/';
        let ws;

        try {
            ws = new WebSocket(url);
        } catch (e) {
            console.warn('WebSocket не удалось открыть:', e);
            setFaviconStatus('offline');
            return;
        }

        ws.onopen = function () {
            console.log('✅ WebSocket /ws/orders/ подключён (карточка заказа)');
            setFaviconStatus('online');
        };

        ws.onmessage = function (event) {
            let data;
            try { data = JSON.parse(event.data); } catch (e) { return; }
            if (data.type !== 'order_event') return;

            const container = document.getElementById('proschety-toasts');
            const mySessionKey = container ? (container.dataset.sessionKey || '') : '';
            
            // Проверяем, наше ли это действие
            const isMyAction = (data.actor_session_key && mySessionKey && mySessionKey === data.actor_session_key);

            // Если действие ЧУЖОЕ — показываем тост и сохраняем его в кэш браузера
            if (!isMyAction) {
                showToast(data);
                layoutToasts();
                
                // Сохраняем тост, чтобы он не исчез после перезагрузки
                let pending = JSON.parse(sessionStorage.getItem('pending_order_toasts') || '[]');
                pending.push(data);
                sessionStorage.setItem('pending_order_toasts', JSON.stringify(pending));
            }

            // Если кто-то (неважно, мы или другой) изменил ТЕКУЩИЙ заказ — обновляем данные
            const currentOrderIdElement = document.querySelector('.list-orders-card[data-order-id]');
            if (currentOrderIdElement) {
                const currentOrderId = currentOrderIdElement.dataset.orderId;
                if (String(data.order_id) === String(currentOrderId)) {
                    // Увеличиваем задержку до 2.5 сек, чтобы пользователь успел прочитать тост
                    setTimeout(() => window.location.reload(), 2500);
                }
            }
        };

        ws.onclose = function () {
            console.warn('WebSocket закрыт, переподключение через 3 сек.');
            setFaviconStatus('offline');
            setTimeout(initWebSocket, 3000);
        };

        ws.onerror = function (err) {
            console.warn('WebSocket ошибка:', err);
            setFaviconStatus('offline');
        };
    }

    // ========================================================================
    // 9. ФУНКЦИИ ДЛЯ НИЖНИХ ТОСТОВ
    // ========================================================================
    function showToast(data) {
        const container = document.getElementById('proschety-toasts');
        if (!container) return;

        let action = '';
        let modifierClass = '';
        if (data.event === 'created') { action = 'создал заказ'; modifierClass = 'proschety-toast-created'; }
        if (data.event === 'deleted') { action = 'удалил заказ'; modifierClass = 'proschety-toast-deleted'; }
        if (data.event === 'updated') { action = 'изменил заказ'; modifierClass = 'proschety-toast-updated'; }

        const who = data.actor_username || 'Кто-то';
        const number = data.order_number || '';

        const toast = document.createElement('div');
        toast.className = 'proschety-toast ' + modifierClass;

        const actor = document.createElement('span');
        actor.className = 'proschety-toast-actor';
        actor.textContent = who;

        const rest = document.createElement('span');
        rest.textContent = ' ' + action + ' ';

        const numberSpan = document.createElement('span');
        numberSpan.className = 'proschety-toast-number';
        numberSpan.textContent = number;

        toast.appendChild(actor);
        toast.appendChild(rest);
        toast.appendChild(numberSpan);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'proschety-toast-close';
        closeBtn.title = 'Закрыть';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
                layoutToasts();
            }
        });
        toast.appendChild(closeBtn);

        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'proschety-toast-refresh';
        refreshBtn.textContent = 'Обновить данные';
        refreshBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            refreshBtn.disabled = true;
            window.location.reload();
        });
        toast.appendChild(refreshBtn);

        toast.addEventListener('click', function () {
            if (toast.classList.contains('proschety-toast-raised')) {
                toast.classList.remove('proschety-toast-raised');
                layoutToasts();
            } else {
                container.querySelectorAll('.proschety-toast-raised').forEach(function (t) {
                    t.classList.remove('proschety-toast-raised');
                });
                toast.classList.add('proschety-toast-raised');
                layoutToasts();
            }
        });

        container.insertBefore(toast, container.firstChild);
    }

    function restoreToasts() {
        const pending = JSON.parse(sessionStorage.getItem('pending_order_toasts') || '[]');
        if (pending.length > 0) {
            pending.forEach(data => showToast(data));
            layoutToasts();
            // Очищаем кэш после отрисовки
            sessionStorage.removeItem('pending_order_toasts');
        }
    }

    function layoutToasts() {
        const container = document.getElementById('proschety-toasts');
        if (!container) return;

        const toasts = Array.from(container.querySelectorAll('.proschety-toast'));

        toasts.forEach(function (toast, index) {
            const btn = toast.querySelector('.proschety-toast-refresh');
            if (!btn) return;
            btn.hidden = (index !== 0);
        });

        let offset = 0;
        let z = 1000;

        for (let i = toasts.length - 1; i >= 0; i--) {
            const toast = toasts[i];
            const height = toast.offsetHeight || 50;
            const isRaised = toast.classList.contains('proschety-toast-raised');

            let top = -(offset + height);
            let toastZ = z;

            if (isRaised) {
                top -= 12;
                toastZ = 9000;
            }

            toast.style.top = top + 'px';
            toast.style.zIndex = String(toastZ);

            offset += height / 2;
            z += 1;
        }
    }

    // ========================================================================
    // 8. ИНЛАЙН-РЕДАКТИРОВАНИЕ ТОВАРОВ (Двойной клик)
    // ========================================================================
    document.addEventListener('dblclick', function(event) {
        const cell = event.target.closest('.editable-tovar-cell');
        if (!cell || cell.classList.contains('editing-cell')) return;

        const item = cell.closest('.list-orders-tovar-item');
        if (!item) return;
        const tovarId = item.dataset.tovarId;
        if (!tovarId) return;

        const field = cell.dataset.field;
        const originalValue = cell.dataset.originalValue || '';
        const originalText = cell.textContent.trim();

        // Создаём поле ввода
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'list-orders-tovar-inline-input';
        input.value = originalValue;

        cell.classList.add('editing-cell');
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();

        let finished = false;

        // Функция сохранения
        const save = () => {
            if (finished) return;
            finished = true;

            const newValue = input.value.trim();
            // Если значение не изменилось — просто выходим
            if (newValue === String(originalValue)) {
                cell.classList.remove('editing-cell');
                cell.textContent = originalText;
                return;
            }

            cell.innerHTML = '<span class="list-orders-tovar-inline-saving">Сохранение...</span>';

            fetch('/orders/api/order-tovar/' + tovarId + '/update/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    field_name: field,
                    field_value: newValue
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    showNotification('Сохранено', 'success');
                    // Перезагружаем страницу, чтобы обновить итоговые суммы
                    setTimeout(() => window.location.reload(), 500);
                } else {
                    showNotification('Ошибка: ' + (data.error || 'неизвестная'), 'error');
                    cell.classList.remove('editing-cell');
                    cell.textContent = originalText;
                }
            })
            .catch(err => {
                console.error(err);
                showNotification('Ошибка сети при сохранении', 'error');
                cell.classList.remove('editing-cell');
                cell.textContent = originalText;
            });
        };

        // Функция отмены
        const cancel = () => {
            if (finished) return;
            finished = true;
            cell.classList.remove('editing-cell');
            cell.textContent = originalText;
        };

        // Обработчики событий
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        });
        input.addEventListener('blur', () => setTimeout(save, 100));
    });

})();