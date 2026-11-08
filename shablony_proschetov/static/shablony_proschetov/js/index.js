/*
shablony_proschetov/static/shablony_proschetov/js/index.js
Клиентская логика страницы шаблонов.
*/

"use strict";

// ============================================================================
// 1. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');
    const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    return input ? input.value : '';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// 2. ИНИЦИАЛИЗАЦИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', function () {
    initDjangoMessages();
    initInlineEditing();
    initDragAndDrop();
    initFaviconWebSocket();
    initSearch();
    initSavePanel();
});

// ============================================================================
// 3. АККОРДЕОН И ЗАГРУЗКА ПРЕВЬЮ
// ============================================================================

window.toggleTemplateCard = function(headerElement) {
    if (window.event && window.event.target.closest('input, select, button')) {
        return;
    }

    const card = headerElement.closest('.material-row-card');
    if (!card) return;
    
    card.classList.toggle('is-open');
    
    if (card.classList.contains('is-open')) {
        const body = card.querySelector('.template-preview-body');
        if (body && body.style.display === 'none') {
            body.style.display = 'block';
            const tplId = card.getAttribute('data-template-id');
            loadTemplatePreview(tplId, body);
        }
    }
};

function loadTemplatePreview(templateId, container) {
    fetch('/shablony/api/template/' + templateId + '/preview/', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            renderPreview(data.template, container);
        } else {
            container.innerHTML = '<div style="color:red;">Ошибка загрузки превью</div>';
        }
    })
    .catch(err => {
        console.error(err);
        container.innerHTML = '<div style="color:red;">Ошибка сети при загрузке превью</div>';
    });
}

function renderPreview(tpl, container) {
    if (!tpl.components || tpl.components.length === 0) {
        container.innerHTML = '<p style="color:#999;">В шаблоне нет печатных компонентов.</p>';
        return;
    }
    
    let html = '';
    tpl.components.forEach((c, idx) => {
        html += `
            <div class="tpl-component-card">
                <div class="tpl-component-title">
                    <span>Компонент #${idx + 1}</span>
                    <span>${c.print_type_display || ''}, ${c.printing_mode_display || ''}</span>
                </div>
                <div class="tpl-component-row"><b>Принтер:</b> ${c.printer || '—'}</div>
                <div class="tpl-component-row"><b>Бумага:</b> ${c.paper || '—'}</div>
        `;
        
        if (c.works && c.works.length) {
            html += `<div class="tpl-section"><h4>Дополнительные работы</h4><ul class="tpl-works-list">`;
            c.works.forEach(w => {
                html += `<li>• ${w.title} × ${w.quantity} — ${w.price} ₽</li>`;
            });
            html += `</ul></div>`;
        }
        
        if (c.lamination) {
            html += `<div class="tpl-section"><h4>Ламинация</h4>`;
            if (c.lamination.is_enabled) {
                html += `<div class="tpl-component-row"><b>Сторона:</b> ${c.lamination.side_display || '—'}</div>`;
                html += `<div class="tpl-component-row"><b>Ламинатор:</b> ${c.lamination.laminator || '—'}</div>`;
                html += `<div class="tpl-component-row"><b>Плёнка:</b> ${c.lamination.film || '—'}</div>`;
            } else {
                html += `<div class="tpl-component-row">Выключена</div>`;
            }
            html += `</div>`;
        }
        
        if (c.vichisliniya) {
            html += `<div class="tpl-section"><h4>Одностраничные вычисления</h4>`;
            html += `<div class="tpl-component-row"><b>Изделие:</b> ${c.vichisliniya.item_width}×${c.vichisliniya.item_height} мм</div>`;
            html += `<div class="tpl-component-row"><b>Зазор:</b> ${c.vichisliniya.vyleta} мм</div>`;
            html += `<div class="tpl-component-row"><b>Цветность:</b> ${c.vichisliniya.color}</div>`;
            html += `</div>`;
        }
        
        if (c.multipage) {
            html += `<div class="tpl-section"><h4>Многостраничные вычисления</h4>`;
            html += `<div class="tpl-component-row"><b>Скрепление:</b> ${c.multipage.binding || '—'}</div>`;
            html += `<div class="tpl-component-row"><b>Страниц:</b> ${c.multipage.total_pages}</div>`;
            html += `<div class="tpl-component-row"><b>Страница:</b> ${c.multipage.finished_width}×${c.multipage.finished_height} мм</div>`;
            html += `</div>`;
        }
        
        html += `</div>`;
    });
    
    container.innerHTML = html;
}

// ============================================================================
// 4. ИНЛАЙН-РЕДАКТИРОВАНИЕ
// ============================================================================

function initInlineEditing() {
    document.querySelectorAll('.material-row-card [data-field]').forEach(input => {
        const card = input.closest('.material-row-card');
        const templateId = card.getAttribute('data-template-id');
        const field = input.getAttribute('data-field');
        
        if (input.tagName === 'SELECT') {
            input.addEventListener('change', function() {
                saveField(card, templateId, field, input.value, input);
            });
        } else {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    input.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    input.value = input.getAttribute('data-original-value') || '';
                    input.blur();
                }
            });
            
            input.addEventListener('blur', function () {
                const newValue = input.value;
                const oldValue = input.getAttribute('data-original-value') || '';
                if (newValue === oldValue) return;
                saveField(card, templateId, field, newValue, input);
            });
        }
    });
}

function saveField(card, templateId, field, value, inputEl) {
    inputEl.style.opacity = '0.5';
    
    fetch('/shablony/template/' + templateId + '/update-field/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ field_name: field, field_value: value })
    })
    .then(r => r.json())
    .then(data => {
        inputEl.style.opacity = '1';
        if (data.success) {
            inputEl.setAttribute('data-original-value', value);
            inputEl.style.backgroundColor = '#eaf6ef';
            setTimeout(() => inputEl.style.backgroundColor = '', 500);
        } else {
            showNotification('Ошибка: ' + data.error, 'error');
            inputEl.value = inputEl.getAttribute('data-original-value');
        }
    })
    .catch(err => {
        console.error(err);
        inputEl.style.opacity = '1';
        showNotification('Ошибка сети', 'error');
        inputEl.value = inputEl.getAttribute('data-original-value');
    });
}

// ============================================================================
// 5. DRAG AND DROP
// ============================================================================

function initDragAndDrop() {
    const list = document.getElementById('tpl-templates-list');
    if (!list) return;

    const cards = list.querySelectorAll('.material-row-card');
    let draggedItem = null;

    cards.forEach(card => {
        card.addEventListener('mousedown', function(e) {
            const isInteractive = e.target.closest('input, button, select, textarea, .material-row-header');
            if (isInteractive) {
                this.setAttribute('draggable', 'false');
            } else {
                this.setAttribute('draggable', 'true');
            }
        });

        card.addEventListener('mouseup', function() {
            this.setAttribute('draggable', 'true');
        });

        card.addEventListener('dragstart', function(e) {
            draggedItem = this;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.getAttribute('data-template-id'));
        });

        card.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            cards.forEach(c => c.classList.remove('drag-over'));
            draggedItem = null;
        });

        card.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (this !== draggedItem) {
                this.classList.add('drag-over');
            }
        });

        card.addEventListener('dragleave', function() {
            this.classList.remove('drag-over');
        });

        card.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over');

            if (this !== draggedItem && draggedItem) {
                const rect = this.getBoundingClientRect();
                const offset = e.clientY - rect.top;
                
                if (offset > rect.height / 2) {
                    list.insertBefore(draggedItem, this.nextSibling);
                } else {
                    list.insertBefore(draggedItem, this);
                }
                saveNewOrder(list);
            }
        });
    });

    const categoryNodes = document.querySelectorAll('.category-node');
    categoryNodes.forEach(node => {
        node.addEventListener('dragover', function(e) {
            e.preventDefault();
            this.classList.add('drag-over-category');
        });
        node.addEventListener('dragleave', function() {
            this.classList.remove('drag-over-category');
        });
        node.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('drag-over-category');

            if (draggedItem) {
                const templateId = draggedItem.getAttribute('data-template-id');
                const categoryId = this.getAttribute('data-category-id');
                if (templateId && categoryId) {
                    moveTemplateToCategory(templateId, categoryId);
                }
            }
        });
    });
}

function saveNewOrder(list) {
    const cards = list.querySelectorAll('.material-row-card');
    const order = Array.from(cards).map(c => c.getAttribute('data-template-id'));

    fetch('/shablony/templates/update-order/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ order: order })
    })
    .then(r => r.json())
    .then(data => {
        if (!data.success) {
            showNotification('Ошибка сохранения порядка', 'error');
            window.location.reload();
        }
    });
}

function moveTemplateToCategory(templateId, categoryId) {
    fetch('/shablony/template/' + templateId + '/update-category/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ category_id: categoryId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            window.location.reload();
        } else {
            showNotification('Ошибка переноса: ' + data.error, 'error');
        }
    });
}

// ============================================================================
// 6. МОДАЛКИ
// ============================================================================

window.addCategory = function(parentId) {
    const form = document.getElementById('category-modal-form');
    form.action = '/shablony/category/create/';
    document.getElementById('category-modal-title').textContent = parentId ? 'Новая подкатегория' : 'Новая категория';
    document.getElementById('category-modal-input').value = '';
    document.getElementById('category-modal-parent-id').value = parentId || '';
    document.getElementById('category-modal-overlay').style.display = 'flex';
    setTimeout(() => document.getElementById('category-modal-input').focus(), 50);
};

window.renameCategory = function(catId, currentName) {
    const form = document.getElementById('category-modal-form');
    form.action = '/shablony/category/' + catId + '/update/';
    document.getElementById('category-modal-title').textContent = 'Переименовать категорию';
    document.getElementById('category-modal-input').value = currentName;
    document.getElementById('category-modal-parent-id').value = '';
    document.getElementById('category-modal-overlay').style.display = 'flex';
    setTimeout(() => {
        const input = document.getElementById('category-modal-input');
        input.focus();
        input.select();
    }, 50);
};

window.closeCategoryModal = function() {
    document.getElementById('category-modal-overlay').style.display = 'none';
};

window.deleteCategory = function(catId, catName) {
    document.getElementById('delete-cat-name').textContent = '«' + catName + '»';
    document.getElementById('delete-category-form').action = '/shablony/category/' + catId + '/delete/';
    document.getElementById('delete-category-overlay').style.display = 'flex';
};

window.closeDeleteCategoryModal = function() {
    document.getElementById('delete-category-overlay').style.display = 'none';
};

window.deleteTemplate = function(tplId, tplName) {
    document.getElementById('delete-template-name').textContent = '«' + tplName + '»';
    document.getElementById('delete-template-form').action = '/shablony/template/' + tplId + '/delete/';
    document.getElementById('delete-template-overlay').style.display = 'flex';
};

window.closeDeleteTemplateModal = function() {
    document.getElementById('delete-template-overlay').style.display = 'none';
};

// ============================================================================
// 7. ПОИСК
// ============================================================================

function initSearch() {
    const searchInput = document.getElementById('tpl-search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function() {
        const query = this.value.trim().toLowerCase();
        const cards = document.querySelectorAll('.material-row-card');
        
        cards.forEach(card => {
            const name = card.querySelector('input[name="name"]').value.toLowerCase();
            const commentInput = card.querySelector('input[name="comment"]');
            const comment = commentInput ? commentInput.value.toLowerCase() : '';
            
            let categoryText = '';
            const select = card.querySelector('select[name="category_id"]');
            if (select && select.options[select.selectedIndex]) {
                categoryText = select.options[select.selectedIndex].textContent.toLowerCase();
            }
            
            if (name.includes(query) || comment.includes(query) || categoryText.includes(query)) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// ============================================================================
// 8. WEBSOCKET И ТОСТЫ
// ============================================================================

function initFaviconWebSocket() {
    const favicon = document.getElementById('shablony-favicon');
    if (!favicon) return;
    
    function setFaviconStatus(status) {
        let color = '%23999';
        if (status === 'online') color = '%230B8661';
        if (status === 'offline') color = '%23f44336';
        
        favicon.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='3' width='7' height='7'></rect><rect x='14' y='3' width='7' height='7'></rect><rect x='14' y='14' width='7' height='7'></rect><rect x='3' y='14' width='7' height='7'></rect></svg>`;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const url = protocol + window.location.host + '/ws/shablony/';
    let ws;
    
    try {
        ws = new WebSocket(url);
    } catch (e) {
        setFaviconStatus('offline');
        return;
    }

    ws.onopen = function () {
        setFaviconStatus('online');
    };

    ws.onmessage = function (event) {
        let data;
        try { data = JSON.parse(event.data); } catch (e) { return; }
        
        if (data.type !== 'template_event') return;
        
        // Фильтр своих событий
        const toastContainer = document.getElementById('proschety-toasts');
        const mySessionKey = toastContainer ? (toastContainer.dataset.sessionKey || '') : '';
        if (data.actor_session_key && mySessionKey && mySessionKey === data.actor_session_key) {
            return;
        }
        
        // Показываем нижний тост
        showTemplateToast(data);
        
        // Обновление карточки на лету
        if (data.event === 'deleted') {
            const card = document.querySelector('.material-row-card[data-template-id="' + data.template_id + '"]');
            if (card) card.remove();
        } else if (data.event === 'updated') {
            const card = document.querySelector('.material-row-card[data-template-id="' + data.template_id + '"]');
            if (card) {
                if (data.changed_field === 'name') {
                    const input = card.querySelector('input[name="name"]');
                    if (input && document.activeElement !== input) {
                        input.value = data.template_name;
                        input.setAttribute('data-original-value', data.template_name);
                    }
                }
            }
        } else if (data.event === 'created') {
            window.location.reload(); 
        }
    };

    ws.onclose = function () {
        setFaviconStatus('offline');
        setTimeout(initFaviconWebSocket, 3000);
    };
    ws.onerror = function () {
        setFaviconStatus('offline');
    };
}

// 1. Верхние маленькие уведомления (для ошибок и успеха)
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

// 2. Нижние карточки-тосты (для WebSocket событий)
function showTemplateToast(data) {
    const container = document.getElementById('proschety-toasts');
    if (!container) return;

    let action = '';
    let modifierClass = '';
    if (data.event === 'created') { action = 'создал шаблон'; modifierClass = 'proschety-toast-created'; }
    if (data.event === 'deleted') { action = 'удалил шаблон'; modifierClass = 'proschety-toast-deleted'; }
    if (data.event === 'updated') { action = 'изменил шаблон'; modifierClass = 'proschety-toast-updated'; }

    const who = data.actor_username || 'Кто-то';
    const name = data.template_name || '';

    const toast = document.createElement('div');
    toast.className = 'proschety-toast ' + modifierClass;

    const actor = document.createElement('span');
    actor.className = 'proschety-toast-actor';
    actor.textContent = who;

    const rest = document.createElement('span');
    rest.textContent = ' ' + action + ' ';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'proschety-toast-number';
    nameSpan.textContent = name;

    toast.appendChild(actor);
    toast.appendChild(rest);
    toast.appendChild(nameSpan);

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
    layoutToasts();
}

// 3. Размещение нижних тостов стопкой
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


// ============================================================================
// 9. ПАНЕЛЬ СОХРАНЕНИЯ (SAVE FROM PROSCHET)
// ============================================================================

function initSavePanel() {
    const panel = document.getElementById('tpl-save-panel');
    if (!panel) return;
    
    const btnConfirm = document.getElementById('tpl-save-confirm');
    const btnCancel = document.getElementById('tpl-save-cancel');
    
    if (btnCancel) {
        btnCancel.onclick = () => { window.location.href = '/shablony/'; };
    }
    
    if (btnConfirm) {
        btnConfirm.onclick = function() {
            const proschetId = panel.getAttribute('data-proschet-id');
            const name = document.getElementById('tpl-save-name').value.trim();
            const comment = document.getElementById('tpl-save-comment').value.trim();
            const categoryId = document.getElementById('tpl-save-category').value;
            
            if (!name) { showNotification('Введите название шаблона', 'error'); return; }
            if (!categoryId) { showNotification('Выберите категорию', 'error'); return; }
            
            btnConfirm.disabled = true;
            btnConfirm.textContent = 'Сохранение...';
            
            fetch('/shablony/api/save-from-proschet/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    proschet_id: proschetId,
                    name: name,
                    comment: comment,
                    category_id: categoryId
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    window.location.href = '/shablony/?category_id=' + categoryId;
                } else {
                    showNotification('Ошибка: ' + data.error, 'error');
                    btnConfirm.disabled = false;
                    btnConfirm.textContent = 'Сохранить шаблон';
                }
            })
            .catch(err => {
                console.error(err);
                showNotification('Ошибка сети', 'error');
                btnConfirm.disabled = false;
                btnConfirm.textContent = 'Сохранить шаблон';
            });
        };
    }
}

// ============================================================================
// 10. СОЗДАНИЕ ПРОСЧЁТА ИЗ ШАБЛОНА
// ============================================================================

let pendingCreateProschetId = null;

window.createProschetFromTemplate = function(templateId, tplName) {
    pendingCreateProschetId = templateId;
    document.getElementById('create-proschet-name').textContent = '«' + tplName + '»';
    document.getElementById('create-proschet-overlay').style.display = 'flex';
};

window.closeCreateProschetModal = function() {
    pendingCreateProschetId = null;
    document.getElementById('create-proschet-overlay').style.display = 'none';
};

window.confirmCreateProschet = function() {
    if (!pendingCreateProschetId) return;
    
    const templateId = pendingCreateProschetId;
    closeCreateProschetModal();
    
    fetch('/shablony/api/template/' + templateId + '/create-proschet/', {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCsrfToken()
        }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            window.location.href = '/proschety/?proschet_id=' + data.proschet_id;
        } else {
            showNotification('Ошибка: ' + data.error, 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showNotification('Ошибка сети при создании просчёта', 'error');
    });
};

// ============================================================================
// 11. УВЕДОМЛЕНИЯ DJANGO (ВМЕСТО ЗЕЛЕНЫХ ПЛАШЕК)
// ============================================================================

function initDjangoMessages() {
    const container = document.getElementById('django-messages');
    if (!container) return;
    
    container.querySelectorAll('div').forEach(el => {
        const text = el.getAttribute('data-text');
        const tag = el.getAttribute('data-tag');
        if (text) {
            // Если error — красный тост, иначе зеленый
            showNotification(text, tag === 'error' ? 'error' : 'success');
        }
    });
}