/*
proschety/static/proschety/js/sections/list_proschet.js
JavaScript секции «Список просчётов» новой страницы /proschety/.

ПОДХОД:
  - Вместо window.location.reload() после создания/удаления
    перерисовываем только tbody таблицы через GET /proschety/api/rows/.
    Это сохраняет открытые уведомления, введённые фильтры поиска
    и не «моргает» страницей.
  - После вставки нового HTML находим строку по data-proschet-id
    и подсвечиваем её зелёным на несколько секунд.

ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ.
*/

"use strict";

(function () {

    // ========================================================================
    // 1. DOM-ЭЛЕМЕНТЫ.
    // ========================================================================

    // Поиск
    let inputAll       = null;
    let inputTitle     = null;
    let inputClient    = null;
    let tableBody      = null;
    let noResultsBlock = null;

    // Форма создания
    let createBtn     = null;
    let createForm    = null;
    let createFormEl  = null;
    let createCancel  = null;
    let createSubmit  = null;
    let createTitle   = null;
    let createClient  = null;

    // Поле «Шаблон» (для админов)
    let templateField    = null;
    let templateIdField  = null;
    let templatePickBtn  = null;
    let templateClearBtn = null;

    // Модалка выбора шаблона
    let modalOverlay   = null;
    let modalClose     = null;
    let modalCancel    = null;
    let modalConfirm   = null;
    let modalTree      = null;
    let modalTemplates = null;
    let modalSelectedTemplateId = null;
    let modalActiveCategoryId   = null;

    // Модалка подтверждения удаления
    let pendingDeleteProschetId = null;
    let pendingDeleteButton     = null;

    // WebSocket
    let toastsWebSocket = null;

    // ========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ.
    // ========================================================================

    document.addEventListener('DOMContentLoaded', function () {
        console.log('✅ Модуль «Список просчётов» загружен');

        // --- Поиск ---
        inputAll       = document.getElementById('list-proschet-search-input');
        inputTitle     = document.getElementById('list-proschet-search-title');
        inputClient    = document.getElementById('list-proschet-search-client');
        tableBody      = document.getElementById('list-proschet-table-body');
        noResultsBlock = document.getElementById('list-proschet-no-results');

        if (tableBody) {
            if (inputAll)    inputAll.addEventListener('input', handleSearch);
            if (inputTitle)  inputTitle.addEventListener('input', handleSearch);
            if (inputClient) inputClient.addEventListener('input', handleSearch);
        }

        // Обработчики dblclick/click вешаем на document, а не на tableBody.
        // Причина: tbody может быть заменён через innerHTML (например, после
        // refreshTable()), но document остаётся жить. Делегирование через
        // document стабильно работает независимо от того, когда появился tbody.
        document.addEventListener('dblclick', handleEditableCellDblClick);
        document.addEventListener('dblclick', handleCommentCellDblClick);
        document.addEventListener('click', handleDeleteClick);
        document.addEventListener('click', handleRowClick);

        // --- Форма создания ---
        createBtn    = document.getElementById('list-proschet-create-btn');
        createForm   = document.getElementById('list-proschet-create-form');
        createFormEl = document.getElementById('list-proschet-create-form-el');
        createCancel = document.getElementById('list-proschet-create-cancel');
        createSubmit = document.getElementById('list-proschet-create-submit');
        createTitle  = document.getElementById('list-proschet-create-title');
        createClient = document.getElementById('list-proschet-create-client');

        if (createBtn)    createBtn.addEventListener('click', openCreateForm);
        if (createCancel) createCancel.addEventListener('click', closeCreateForm);
        if (createFormEl) createFormEl.addEventListener('submit', handleCreateSubmit);

        // --- Поле «Шаблон» и модалка (только для админов) ---
        templateField    = document.getElementById('list-proschet-create-template');
        templateIdField  = document.getElementById('list-proschet-create-template-id');
        templatePickBtn  = document.getElementById('list-proschet-template-pick');
        templateClearBtn = document.getElementById('list-proschet-template-clear');

        modalOverlay   = document.getElementById('list-proschet-template-modal');
        modalClose     = document.getElementById('list-proschet-template-modal-close');
        modalCancel    = document.getElementById('list-proschet-template-modal-cancel');
        modalConfirm   = document.getElementById('list-proschet-template-modal-confirm');
        modalTree      = document.getElementById('list-proschet-modal-tree');
        modalTemplates = document.getElementById('list-proschet-modal-templates');

        if (templatePickBtn)  templatePickBtn.addEventListener('click', openTemplateModal);
        if (templateClearBtn) templateClearBtn.addEventListener('click', clearTemplateSelection);
        if (modalClose)       modalClose.addEventListener('click', closeTemplateModal);
        if (modalCancel)      modalCancel.addEventListener('click', closeTemplateModal);
        if (modalConfirm)     modalConfirm.addEventListener('click', confirmTemplateSelection);
        if (modalOverlay) {
            modalOverlay.addEventListener('click', function (e) {
                if (e.target === modalOverlay) closeTemplateModal();
            });
        }

        // Пересчёт стека уведомлений при изменении размеров окна.
        window.addEventListener('resize', layoutToasts);

        // --- Модалка подтверждения удаления ---
        const confirmOverlay = document.getElementById('list-proschet-confirm-overlay');
        const confirmNo      = document.getElementById('list-proschet-confirm-no');
        const confirmYes     = document.getElementById('list-proschet-confirm-yes');
        if (confirmNo)  confirmNo.addEventListener('click', closeConfirmModal);
        if (confirmYes) confirmYes.addEventListener('click', confirmDeleteYes);
        if (confirmOverlay) {
            confirmOverlay.addEventListener('click', function (e) {
                if (e.target === confirmOverlay) closeConfirmModal();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (!confirmOverlay) return;
            if (confirmOverlay.style.display !== 'flex') return;
            closeConfirmModal();
        });

        // --- WebSocket-уведомления ---
        initToastsWebSocket();

        console.log('✅ Инициализация модуля завершена');
    });

    // ========================================================================
    // 3. ПОИСК.
    // ========================================================================

    function handleSearch() {
        const qAll    = inputAll    ? (inputAll.value    || '').trim().toLowerCase() : '';
        const qTitle  = inputTitle  ? (inputTitle.value  || '').trim().toLowerCase() : '';
        const qClient = inputClient ? (inputClient.value || '').trim().toLowerCase() : '';

        const rows = tableBody.querySelectorAll('.list-proschet-row');
        let visibleCount = 0;

        rows.forEach(function (row) {
            const fullText = row.textContent.toLowerCase();
            const titleCell  = row.querySelector('.col-title');
            const clientCell = row.querySelector('.col-client');
            const titleText  = titleCell  ? titleCell.textContent.toLowerCase()  : '';
            const clientText = clientCell ? clientCell.textContent.toLowerCase() : '';

            const passAll    = !qAll    || fullText.indexOf(qAll)     !== -1;
            const passTitle  = !qTitle  || titleText.indexOf(qTitle)  !== -1;
            const passClient = !qClient || clientText.indexOf(qClient) !== -1;

            if (passAll && passTitle && passClient) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        const anyQuery = qAll || qTitle || qClient;
        if (noResultsBlock) {
            noResultsBlock.style.display = (anyQuery && visibleCount === 0) ? 'block' : 'none';
        }
    }

    // ========================================================================
    // 4. ФОРМА СОЗДАНИЯ.
    // ========================================================================

    function openCreateForm() {
        if (!createForm) return;
        createForm.style.display = 'block';
        if (createTitle) createTitle.focus();
    }

    function closeCreateForm() {
        if (!createForm) return;
        createForm.style.display = 'none';
        if (createFormEl) createFormEl.reset();
        clearTemplateSelection();
    }

    function handleCreateSubmit(event) {
        event.preventDefault();
        if (!createFormEl) return;

        const title  = createTitle  ? createTitle.value.trim()  : '';
        const client = createClient ? createClient.value        : '';
        const tplId  = templateIdField ? templateIdField.value  : '';

        if (!tplId && title.length < 3) {
            showNotification('Введите название просчёта (минимум 3 символа) или выберите шаблон', 'error');
            if (createTitle) createTitle.focus();
            return;
        }

        const originalText = createSubmit.textContent;
        createSubmit.disabled = true;
        createSubmit.textContent = 'Создание...';

        if (tplId) {
            createFromTemplate(tplId, title, client)
                .catch(function (err) {
                    console.error(err);
                    showNotification('Ошибка сети при создании из шаблона', 'error');
                })
                .finally(function () {
                    createSubmit.disabled = false;
                    createSubmit.textContent = originalText;
                });
        } else {
            const formData = new FormData(createFormEl);
            fetch('/calculator/create-proschet/', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': getCsrfToken()
                }
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    const newId = data.proschet ? data.proschet.id : null;
                    const num   = data.proschet ? data.proschet.number : '';
                    showNotification('Просчёт «' + num + '» создан', 'success');
                    closeCreateForm();
                    return refreshTable().then(function () {
                        highlightRow(newId);
                    });
                } else {
                    showNotification('Ошибка: ' + (data.message || 'неизвестная ошибка'), 'error');
                }
            })
            .catch(function (err) {
                console.error(err);
                showNotification('Ошибка сети при создании просчёта', 'error');
            })
            .finally(function () {
                createSubmit.disabled = false;
                createSubmit.textContent = originalText;
            });
        }
    }

    /**
     * Создание просчёта из шаблона.
     *   1. POST /shablony/api/template/<id>/create-proschet/
     *   2. При необходимости — PATCH названия и клиента
     *   3. Перерисовать tbody и подсветить новую строку.
     */
    function createFromTemplate(templateId, userTitle, clientId) {
        return fetch('/shablony/api/template/' + templateId + '/create-proschet/', {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                throw new Error(data.error || 'Не удалось создать просчёт из шаблона');
            }
            const proschetId = data.proschet_id;

            let chain = Promise.resolve();

            if (userTitle) {
                chain = chain.then(function () {
                    const fd = new FormData();
                    fd.append('field', 'title');
                    fd.append('value', userTitle);
                    return fetch('/calculator/update-proschet-title/' + proschetId + '/', {
                        method: 'POST',
                        body: fd,
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-CSRFToken': getCsrfToken()
                        }
                    }).then(function (r) { return r.json(); });
                });
            }

            if (clientId) {
                chain = chain.then(function () {
                    const fd = new FormData();
                    fd.append('client_id', clientId);
                    return fetch('/calculator/update-proschet-client/' + proschetId + '/', {
                        method: 'POST',
                        body: fd,
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'X-CSRFToken': getCsrfToken()
                        }
                    }).then(function (r) { return r.json(); });
                });
            }

            return chain.then(function () {
                showNotification('Просчёт «' + data.proschet_number + '» создан из шаблона', 'success');
                closeCreateForm();
                return refreshTable().then(function () {
                    highlightRow(proschetId);
                });
            });
        });
    }

    // ========================================================================
    // 5. ПЕРЕРИСОВКА ТАБЛИЦЫ И ПОДСВЕТКА НОВОЙ СТРОКИ.
    // ========================================================================

    /**
     * Запрашивает у сервера актуальный HTML-партиал с <tr>-строками
     * и подменяет содержимое tbody. Сохраняет введённые фильтры поиска
     * (применяет их к новому содержимому).
     */
    function refreshTable() {
        // Запоминаем ID выделенного просчёта ДО подмены tbody.
        // После innerHTML = html все строки «чистые» (без .selected),
        // и без этого шага выделение визуально пропадёт.
        let selectedIdBefore = null;
        if (tableBody) {
            const selectedRow = tableBody.querySelector('.list-proschet-row.selected');
            if (selectedRow) {
                selectedIdBefore = selectedRow.dataset.proschetId || null;
            }
        }

        return fetch('/proschety/api/rows/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.text(); })
        .then(function (html) {
            if (tableBody) tableBody.innerHTML = html;

            // Переприменяем поиск — иначе новая строка может не соответствовать
            // текущему фильтру, но зато все остальные снова вернутся.
            handleSearch();

            // Восстанавливаем выделение на той же строке, если она ещё жива.
            // Событие proschetSelected НЕ генерируем — секция «Просчёт» уже
            // знает про свой активный просчёт, повторный вызов ей не нужен
            // (и, что важно, не сбросит открытые редакторы).
            if (selectedIdBefore && tableBody) {
                const rowToSelect = tableBody.querySelector(
                    '.list-proschet-row[data-proschet-id="' + selectedIdBefore + '"]'
                );
                if (rowToSelect) {
                    rowToSelect.classList.add('selected');
                }
            }
        });
    }

    /**
     * Сделать строку с указанным id просчёта активной.
     *
     * Что делает:
     *   1. Снимает .selected со всех строк в tbody.
     *   2. Ставит .selected на нужную строку.
     *   3. Прокручивает контейнер таблицы к этой строке.
     *   4. Генерирует событие proschetSelected — чтобы секция «Просчёт»
     *      и все будущие секции (Клиент, Изделие, …) подхватили данные.
     */
    function highlightRow(proschetId) {
        if (!proschetId) return;

        const tbody = document.getElementById('list-proschet-table-body');
        if (!tbody) return;

        const row = tbody.querySelector(
            '.list-proschet-row[data-proschet-id="' + proschetId + '"]'
        );
        if (!row) return;

        // Снимаем .selected со всех строк.
        tbody.querySelectorAll('.list-proschet-row').forEach(function (r) {
            r.classList.remove('selected');
        });

        // Ставим .selected на нужную.
        row.classList.add('selected');

        // Прокрутить контейнер так, чтобы строка была видна.
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

        // Читаем данные и генерируем proschetSelected —
        // это заставит секцию «Просчёт» показать номер, название, тираж и комментарий.
        const numberCell = row.querySelector('.col-number');
        const titleCell  = row.querySelector('.col-title');
        const number = numberCell ? numberCell.textContent.trim() : '';
        const title  = titleCell  ? titleCell.textContent.trim()  : '';
        const circulation    = row.dataset.circulation || '';
        const comment        = row.dataset.comment     || '';
        const clientDiscount = row.dataset.clientDiscount || '';

        document.dispatchEvent(new CustomEvent('proschetSelected', {
            detail: {
                proschetId: String(proschetId),
                proschetNumber: number,
                proschetTitle: title,
                proschetCirculation: circulation,
                proschetComment: comment,
                proschetDiscount: clientDiscount
            }
        }));
    }

    // ========================================================================
    // 6. МОДАЛКА ВЫБОРА ШАБЛОНА.
    // ========================================================================

    function openTemplateModal() {
        if (!modalOverlay) return;

        modalSelectedTemplateId = null;
        modalActiveCategoryId = null;
        renderModalTree();
        renderModalTemplates(null);
        modalConfirm.disabled = true;

        modalOverlay.style.display = 'flex';
    }

    function closeTemplateModal() {
        if (!modalOverlay) return;
        modalOverlay.style.display = 'none';
        modalSelectedTemplateId = null;
    }

    function renderModalTree() {
        const cats = window.PROSHETY_CATEGORIES || [];

        let html = '';
        let prevLevel = -1;

        cats.forEach(function (c, index) {
            const lvl = c.level || 0;

            if (index === 0) {
                html += '<ul>';
            } else if (lvl > prevLevel) {
                html += '<ul>';
            } else if (lvl < prevLevel) {
                html += '</li>';
                for (let k = 0; k < (prevLevel - lvl); k++) {
                    html += '</ul></li>';
                }
            } else {
                html += '</li>';
            }

            html +=
                '<li>' +
                    '<div class="list-proschet-modal-cat" ' +
                         'data-category-id="' + c.id + '">' +
                        '<i class="fas fa-folder"></i>' +
                        '<span>' + escapeHtml(c.name) + '</span>' +
                    '</div>';

            prevLevel = lvl;
        });

        if (cats.length > 0) {
            html += '</li>';
            for (let k = 0; k < prevLevel; k++) {
                html += '</ul></li>';
            }
            html += '</ul>';
        }

        modalTree.innerHTML = html;

        modalTree.querySelectorAll('.list-proschet-modal-cat').forEach(function (el) {
            el.addEventListener('click', function () {
                const catId = parseInt(this.dataset.categoryId, 10);

                modalTree.querySelectorAll('.list-proschet-modal-cat').forEach(function (n) {
                    n.classList.remove('active');
                });
                this.classList.add('active');

                modalActiveCategoryId = catId;

                modalSelectedTemplateId = null;
                modalConfirm.disabled = true;
                renderModalTemplates(catId);
            });
        });
    }

    function renderModalTemplates(categoryId) {
        if (!categoryId) {
            modalTemplates.innerHTML =
                '<div class="list-proschet-modal-empty">Выберите категорию слева</div>';
            return;
        }

        const allTemplates = window.PROSHETY_TEMPLATES || [];
        const items = allTemplates.filter(function (t) {
            return t.category_id === categoryId;
        });

        if (items.length === 0) {
            modalTemplates.innerHTML =
                '<div class="list-proschet-modal-empty">В этой категории шаблонов нет</div>';
            return;
        }

        let html = '';
        items.forEach(function (t) {
            html +=
                '<div class="list-proschet-modal-template" ' +
                     'data-template-id="' + t.id + '">' +
                    '<i class="fas fa-file-alt"></i>' +
                    '<span>' + escapeHtml(t.name) + '</span>' +
                '</div>';
        });
        modalTemplates.innerHTML = html;

        modalTemplates.querySelectorAll('.list-proschet-modal-template').forEach(function (el) {
            el.addEventListener('click', function () {
                modalTemplates.querySelectorAll('.list-proschet-modal-template').forEach(function (n) {
                    n.classList.remove('selected');
                });
                this.classList.add('selected');
                modalSelectedTemplateId = parseInt(this.dataset.templateId, 10);
                modalConfirm.disabled = false;
            });
        });
    }

    function confirmTemplateSelection() {
        if (!modalSelectedTemplateId) return;

        const allTemplates = window.PROSHETY_TEMPLATES || [];
        const tpl = allTemplates.find(function (t) {
            return t.id === modalSelectedTemplateId;
        });
        if (!tpl) {
            closeTemplateModal();
            return;
        }

        if (templateField)   templateField.value = tpl.name;
        if (templateIdField) templateIdField.value = String(tpl.id);
        if (templateClearBtn) templateClearBtn.style.display = 'inline-block';

        closeTemplateModal();
    }

    function clearTemplateSelection() {
        if (templateField)   templateField.value = '';
        if (templateIdField) templateIdField.value = '';
        if (templateClearBtn) templateClearBtn.style.display = 'none';
    }

    // ========================================================================
    // 7. INLINE-РЕДАКТИРОВАНИЕ ЯЧЕЕК (название, клиент).
    // ========================================================================

    /**
     * Двойной клик по редактируемой ячейке .editable-cell.
     * Смотрим на data-field — «title» или «client» — и запускаем нужный редактор.
     */
    function handleEditableCellDblClick(event) {
        const cell = event.target.closest('.editable-cell');
        if (!cell) return;
        if (cell.classList.contains('editing-cell')) return;

        const field = cell.dataset.field;

        if (field === 'title') {
            activateTitleEdit(cell);
        } else if (field === 'client') {
            activateClientEdit(cell);
        }
    }
    /**
     * Двойной клик по ячейке «Комментарий» в списке просчётов.
     *
     * Задача: открыть редактор комментария в секции «Просчёт» — тот же
     * редактор, который открывается по двойному клику в самой секции.
     *
     * Логика:
     *   1. Убедиться, что строка выделена — иначе сначала выделить её,
     *      чтобы секция «Просчёт» получила данные этого просчёта.
     *   2. Программно вызвать dblclick на #proschet-section-comment-body —
     *      это переиспользует существующий обработчик в proschet.js
     *      и не дублирует логику.
     */
    function handleCommentCellDblClick(event) {
        const cell = event.target.closest('.col-comment');
        if (!cell) return;

        const row = cell.closest('.list-proschet-row');
        if (!row) return;

        // Если строка ещё не выделена — сначала выделяем её.
        // handleRowClick сгенерирует proschetSelected, и секция «Просчёт»
        // мгновенно отрисует данные этого просчёта.
        if (!row.classList.contains('selected')) {
            handleRowClick(event);
            // setTimeout(0) — даём синхронным обработчикам proschetSelected
            // в proschet.js отработать, прежде чем открывать textarea.
            setTimeout(openCommentEditorInProschet, 0);
        } else {
            openCommentEditorInProschet();
        }
    }

    /**
     * Открывает редактор комментария в секции «Просчёт».
     *
     * Программно вызывает dblclick на #proschet-section-comment-body —
     * в proschet.js на этот элемент уже подписан handleCommentDblClick,
     * который открывает textarea. Ничего дублировать не нужно.
     */
    function openCommentEditorInProschet() {
        const commentBody = document.getElementById('proschet-section-comment-body');
        if (!commentBody) return;

        // Если редактор уже открыт — не трогаем.
        if (commentBody.querySelector('textarea')) return;

        commentBody.dispatchEvent(new MouseEvent('dblclick', {
            bubbles: true,
            cancelable: true,
            view: window
        }));
    }


    function activateTitleEdit(cell) {
        const proschetId = cell.dataset.proschetId;
        const original   = cell.dataset.originalValue || cell.textContent.trim();

        cell.classList.add('editing-cell');
        cell.innerHTML = '';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'list-proschet-inline-input';
        input.value = original;
        input.maxLength = 200;
        cell.appendChild(input);

        input.focus();
        input.select();

        let finished = false;

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (!finished) {
                    finished = true;
                    saveTitleEdit(cell, input, proschetId, original);
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (!finished) {
                    finished = true;
                    cancelTitleEdit(cell, original);
                }
            }
        });

        input.addEventListener('blur', function () {
            setTimeout(function () {
                if (!finished) {
                    finished = true;
                    saveTitleEdit(cell, input, proschetId, original);
                }
            }, 100);
        });
    }

    /**
     * Активирует редактирование клиента: подгружает список клиентов
     * через /calculator/get-clients/, превращает ячейку в <select>,
     * при выборе значения — сохраняет через
     * /calculator/update-proschet-client/<id>/.
     */
    function activateClientEdit(cell) {
        const proschetId = cell.dataset.proschetId;
        const currentClientId = cell.dataset.clientId || '';
        const originalText = cell.dataset.originalValue || '—';

        // Показываем «Загрузка...», пока приходит список клиентов.
        cell.classList.add('editing-cell');
        cell.innerHTML = '<span class="list-proschet-inline-saving">Загрузка...</span>';

        fetch('/calculator/get-clients/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !Array.isArray(data.clients)) {
                cancelClientEdit(cell, originalText);
                showNotification('Не удалось загрузить список клиентов', 'error');
                return;
            }

            // Строим <select>.
            cell.innerHTML = '';

            const select = document.createElement('select');
            select.className = 'list-proschet-client-input';

            // Опция «— Не выбран —».
            const optEmpty = document.createElement('option');
            optEmpty.value = '';
            optEmpty.textContent = '— Не выбран —';
            select.appendChild(optEmpty);

            // Опции клиентов — только имя, без номера клиента.
            data.clients.forEach(function (c) {
                const opt = document.createElement('option');
                opt.value = String(c.id);
                opt.textContent = c.name;
                select.appendChild(opt);
            });

            // Ставим текущее значение, если есть.
            if (currentClientId) {
                select.value = String(currentClientId);
            } else {
                select.value = '';
            }

            cell.appendChild(select);
            select.focus();

            // Флаг, чтобы не сработало дважды (change + blur).
            let finished = false;

            // При выборе — сохраняем.
            select.addEventListener('change', function () {
                if (finished) return;
                finished = true;
                saveClientEdit(cell, select, proschetId, originalText);
            });

            // Потеря фокуса — тоже сохраняем, но с задержкой.
            select.addEventListener('blur', function () {
                setTimeout(function () {
                    if (finished) return;
                    finished = true;
                    saveClientEdit(cell, select, proschetId, originalText);
                }, 120);
            });

            // Escape — отмена.
            select.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    if (finished) return;
                    finished = true;
                    cancelClientEdit(cell, originalText);
                }
            });
        })
        .catch(function (err) {
            console.error(err);
            cancelClientEdit(cell, originalText);
            showNotification('Ошибка сети при загрузке клиентов', 'error');
        });
    }

    /**
     * Сохраняет выбранного клиента на сервере.
     * После успеха — обновляет ячейку и генерирует proschetClientChanged.
     */
    function saveClientEdit(cell, select, proschetId, originalText) {
        const newClientId = select.value || '';
        const newClientText = select.options[select.selectedIndex]
            ? select.options[select.selectedIndex].textContent
            : '— Не выбран —';

        // Если ничего не изменилось — просто закрываем редактор.
        const oldClientId = cell.dataset.clientId || '';
        if (String(newClientId) === String(oldClientId)) {
            cancelClientEdit(cell, originalText);
            return;
        }

        // Отображаем «Сохранение...».
        cell.innerHTML = '<span class="list-proschet-inline-saving">Сохранение...</span>';

        const fd = new FormData();
        fd.append('client_id', newClientId);

        fetch('/calculator/update-proschet-client/' + proschetId + '/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                cell.classList.remove('editing-cell');

                // Итоговый текст: либо имя клиента, либо «—».
                let displayText = '—';
                let newClientIdAttr = '';
                let newDiscountAttr = '';

                if (data.client && data.client.name) {
                    displayText = data.client.name;
                    newClientIdAttr = String(data.client.id);
                    // Скидка клиента — из ответа сервера.
                    // Если поля нет, оставляем пустым.
                    if (data.client.discount !== undefined && data.client.discount !== null) {
                        newDiscountAttr = String(data.client.discount);
                    }
                }

                cell.textContent = displayText;
                cell.dataset.originalValue = displayText;
                cell.dataset.clientId = newClientIdAttr;

                // Обновляем data-client-discount в самой строке — чтобы
                // при следующем клике по строке в секцию «Просчёт» ушла
                // актуальная скидка.
                const row = cell.closest('.list-proschet-row');
                if (row) {
                    row.dataset.clientDiscount = newDiscountAttr;

                    // Если это АКТИВНАЯ строка — сразу сообщаем секции
                    // «Просчёт» обновлённые данные, чтобы скидка (и всё
                    // остальное) обновилось мгновенно, без второго клика.
                    if (row.classList.contains('selected')) {
                        const numberCell = row.querySelector('.col-number');
                        const titleCell  = row.querySelector('.col-title');
                        const number = numberCell ? numberCell.textContent.trim() : '';
                        const title  = titleCell  ? titleCell.textContent.trim()  : '';

                        document.dispatchEvent(new CustomEvent('proschetSelected', {
                            detail: {
                                proschetId: row.dataset.proschetId || '',
                                proschetNumber: number,
                                proschetTitle: title,
                                proschetCirculation: row.dataset.circulation || '',
                                proschetComment: row.dataset.comment || '',
                                proschetDiscount: newDiscountAttr
                            }
                        }));
                    }
                }

                showNotification('Клиент обновлён', 'success');

                // Сообщаем всем секциям — пригодится, если в будущем
                // в блоке «Клиент» появится своя подсекция.
                document.dispatchEvent(new CustomEvent('proschetClientChanged', {
                    detail: {
                        proschetId: String(proschetId),
                        clientId: newClientIdAttr,
                        clientName: newClientIdAttr ? displayText : ''
                    }
                }));
            } else {
                cell.classList.remove('editing-cell');
                cell.textContent = originalText;
                showNotification(data.message || 'Ошибка сохранения клиента', 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            cell.classList.remove('editing-cell');
            cell.textContent = originalText;
            showNotification('Ошибка сети при сохранении клиента', 'error');
        });
    }

    /**
     * Откат: возвращает исходное содержимое ячейки клиента.
     */
    function cancelClientEdit(cell, originalText) {
        cell.classList.remove('editing-cell');
        cell.textContent = originalText;
    }


    function saveTitleEdit(cell, input, proschetId, original) {
        const newValue = (input.value || '').trim();

        if (newValue === original) {
            cancelTitleEdit(cell, original);
            return;
        }

        if (newValue.length < 3) {
            showNotification('Название должно содержать минимум 3 символа', 'error');
            input.focus();
            return;
        }
        if (newValue.length > 200) {
            showNotification('Название не должно превышать 200 символов', 'error');
            input.focus();
            return;
        }

        cell.innerHTML = '<span class="list-proschet-inline-saving">Сохранение...</span>';

        const fd = new FormData();
        fd.append('field', 'title');
        fd.append('value', newValue);

        fetch('/calculator/update-proschet-title/' + proschetId + '/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                cell.classList.remove('editing-cell');
                cell.textContent = newValue;
                cell.dataset.originalValue = newValue;
                showNotification('Название обновлено', 'success');

                // Сообщаем всем секциям, что название просчёта изменилось.
                // Секция «Просчёт» обновит заголовок, если это активный просчёт.
                document.dispatchEvent(new CustomEvent('proschetTitleChanged', {
                    detail: {
                        proschetId: String(proschetId),
                        proschetTitle: newValue
                    }
                }));
            } else {
                cell.classList.remove('editing-cell');
                cell.textContent = original;
                showNotification(data.message || 'Ошибка сохранения', 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            cell.classList.remove('editing-cell');
            cell.textContent = original;
            showNotification('Ошибка сети при сохранении', 'error');
        });
    }

    function cancelTitleEdit(cell, original) {
        cell.classList.remove('editing-cell');
        cell.textContent = original;
    }

    // ========================================================================
    // 8. УДАЛЕНИЕ ПРОСЧЁТА.
    // ========================================================================

    function handleDeleteClick(event) {
        const btn = event.target.closest('.list-proschet-btn-delete');
        if (!btn) return;
        event.stopPropagation();

        const proschetId = btn.dataset.proschetId;
        if (!proschetId) return;

        pendingDeleteProschetId = proschetId;
        pendingDeleteButton    = btn;

        const overlay = document.getElementById('list-proschet-confirm-overlay');
        if (overlay) overlay.style.display = 'flex';
    }

    function closeConfirmModal() {
        const overlay = document.getElementById('list-proschet-confirm-overlay');
        if (overlay) overlay.style.display = 'none';
        pendingDeleteProschetId = null;
        pendingDeleteButton    = null;
    }

    function confirmDeleteYes() {
        if (!pendingDeleteProschetId || !pendingDeleteButton) {
            closeConfirmModal();
            return;
        }
        const proschetId = pendingDeleteProschetId;
        const btn = pendingDeleteButton;

        const overlay = document.getElementById('list-proschet-confirm-overlay');
        if (overlay) overlay.style.display = 'none';
        pendingDeleteProschetId = null;
        pendingDeleteButton    = null;

        deleteProschet(proschetId, btn);
    }

    function deleteProschet(proschetId, btn) {
        btn.disabled = true;

        fetch('/proschety/api/delete-proschet/' + proschetId + '/', {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                // Красный цвет уведомления — удаление это «минус» из системы.
                showNotification('Просчёт удалён', 'error');
                // Перерисовываем tbody, чтобы убрать удалённую строку.
                // Так надёжнее, чем удалять её вручную из DOM.
                return refreshTable();
            } else {
                btn.disabled = false;
                showNotification(data.message || 'Ошибка удаления', 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            btn.disabled = false;
            showNotification('Ошибка сети при удалении', 'error');
        });
    }

    // ========================================================================
    // 9. WEBSOCKET-УВЕДОМЛЕНИЯ.
    // ========================================================================

    function initToastsWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const url = protocol + window.location.host + '/ws/proschety/';

        try {
            toastsWebSocket = new WebSocket(url);
        } catch (e) {
            console.warn('WebSocket не удалось открыть:', e);
            return;
        }

        toastsWebSocket.onopen = function () {
            console.log('✅ WebSocket /ws/proschety/ подключён');
        };

        toastsWebSocket.onmessage = function (event) {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                return;
            }
            if (data.type !== 'proschet_event') return;

            const container = document.getElementById('proschety-toasts');
            const mySessionKey = container ? (container.dataset.sessionKey || '') : '';
            if (data.actor_session_key && mySessionKey && mySessionKey === data.actor_session_key) {
                return;
            }

            // Если событие — «обновление»:
            //   • если это активная строка — подтягиваем свежие данные
            //     в секцию «Просчёт»;
            //   • в любом случае перерисовываем таблицу, чтобы обновлённые
            //     ячейки (комментарий, название, клиент) показали новые данные.
            if (data.event === 'updated' && data.proschet_id) {
                const activeRow = document.querySelector(
                    '.list-proschet-row.selected[data-proschet-id="' + data.proschet_id + '"]'
                );
                if (activeRow) {
                    refreshProschetData(data.proschet_id);
                }

                // Перерисовка tbody (кроме случаев, когда пользователь
                // прямо сейчас редактирует ячейку — иначе правка потеряется).
                const editing = document.querySelector('.editing-cell');
                if (!editing) {
                    refreshTable();
                }
            }

            showToast(data);
        };

        toastsWebSocket.onclose = function () {
            console.warn('WebSocket /ws/proschety/ закрыт, переподключение через 3 сек.');
            setTimeout(initToastsWebSocket, 3000);
        };

        toastsWebSocket.onerror = function (err) {
            console.warn('WebSocket ошибка:', err);
        };
    }

    /**
     * Показать одно уведомление и переразложить стек.
     *
     * Логика раскладки:
     *   - каждое новое уведомление встаёт СВЕРХУ стека;
     *   - карточки накладываются друг на друга на 50% высоты;
     *   - клик по карточке — она «выдвигается» на передний план
     *     (приподнимается над всеми, z-index выше, усиленная тень);
     *   - повторный клик — возвращается в стопку на своё место.
     */
    function showToast(data) {
        const container = document.getElementById('proschety-toasts');
        if (!container) return;

        let action = '';
        let modifierClass = '';
        if (data.event === 'created') {
            action = 'создал просчёт';
            modifierClass = 'proschety-toast-created';
        }
        if (data.event === 'deleted') {
            action = 'удалил просчёт';
            modifierClass = 'proschety-toast-deleted';
        }
        if (data.event === 'updated') {
            // Голубое уведомление об изменении.
            modifierClass = 'proschety-toast-updated';

            // Печатные компоненты — три частных случая с осмысленным текстом,
            // чтобы не звучало «изменил печатный компонент (добавил)».
            if (data.changed_field === 'print_component_added') {
                action = 'добавил печатный компонент в просчёте';
            } else if (data.changed_field === 'print_component_deleted') {
                action = 'удалил печатный компонент в просчёте';
            } else if (data.changed_field === 'print_component_changed') {
                action = 'изменил печатный компонент в просчёте';
            } else {
                const fieldNames = {
                    'circulation': 'тираж',
                    'comment':     'комментарий',
                    'client':      'клиента',
                    'title':       'название',
                };
                const fieldName = fieldNames[data.changed_field] || 'данные';
                action = 'изменил ' + fieldName + ' в просчёте';
            }
        }

        // --- Дедупликация для событий 'updated' ---
        // Ключ: proschet_id + changed_field.
        // Если уведомление о той же правке того же поля того же просчёта
        // уже висит в стеке — новое не создаём.
        // Если правка другого поля того же просчёта ИЛИ другого просчёта —
        // ключ другой, создаём новое уведомление.
        // Для 'created' и 'deleted' дедупликацию не делаем — эти события
        // редки и каждое важно показать.
        let dedupKey = '';
        if (data.event === 'updated') {
            dedupKey = 'updated|' + (data.proschet_id || '') + '|' + (data.changed_field || '');
            const existing = container.querySelector(
                '.proschety-toast[data-dedup-key="' + dedupKey + '"]'
            );
            if (existing) {
                return;   // Такое уведомление уже есть — выходим.
            }
        }

        const who = data.actor_username || 'Кто-то';
        const number = data.proschet_number || '';
        const title = data.proschet_title || '';

        const toast = document.createElement('div');
        // Базовый класс + модификатор (deleted / created / updated).
        toast.className = 'proschety-toast ' + modifierClass;
        // Сохраняем ключ дедупликации в data-атрибуте — по нему
        // при следующей правке поймём, надо ли создавать уведомление.
        if (dedupKey) {
            toast.dataset.dedupKey = dedupKey;
        }

        // --- Наполнение ---
        const actor = document.createElement('span');
        actor.className = 'proschety-toast-actor';
        actor.textContent = who;

        const rest = document.createElement('span');
        rest.textContent = ' ' + action + ' ';

        const numberSpan = document.createElement('span');
        numberSpan.className = 'proschety-toast-number';
        numberSpan.textContent = number;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = title ? ' «' + title + '»' : '';

        toast.appendChild(actor);
        toast.appendChild(rest);
        toast.appendChild(numberSpan);
        toast.appendChild(titleSpan);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'proschety-toast-close';
        closeBtn.title = 'Закрыть';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();       // не считаем это кликом по карточке
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
                layoutToasts();        // пересобираем стек после удаления
            }
        });
        toast.appendChild(closeBtn);

        // --- Кнопка «Обновить данные» ---
        // Показывается только на самом верхнем уведомлении (логика — в layoutToasts).
        // Клик: перерисовать таблицу просчётов и очистить все уведомления.
        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'proschety-toast-refresh';
        refreshBtn.textContent = 'Обновить данные';
        refreshBtn.addEventListener('click', function (e) {
            e.stopPropagation();       // не считаем это кликом по карточке
            refreshBtn.disabled = true;

            // Подтягиваем актуальный список просчётов.
            refreshTable()
                .then(function () {
                    // Очищаем контейнер уведомлений — считаем их «прочитанными».
                    const cont = document.getElementById('proschety-toasts');
                    if (cont) cont.innerHTML = '';
                })
                .catch(function (err) {
                    console.error(err);
                    refreshBtn.disabled = false;
                    showNotification('Не удалось обновить список', 'error');
                });
        });
        toast.appendChild(refreshBtn);


        // --- Клик по карточке: «приподнять» / вернуть на место ---
        toast.addEventListener('click', function () {
            if (toast.classList.contains('proschety-toast-raised')) {
                toast.classList.remove('proschety-toast-raised');
                layoutToasts();        // пересчитать top и z-index всех карточек
            } else {
                // Снимаем «приподнятость» с других — одновременно поднята одна.
                container.querySelectorAll('.proschety-toast-raised')
                    .forEach(function (t) {
                        t.classList.remove('proschety-toast-raised');
                    });
                toast.classList.add('proschety-toast-raised');
                layoutToasts();
            }
        });

        // Новое уведомление всегда вставляем ПЕРВЫМ (сверху стека).
        container.insertBefore(toast, container.firstChild);

        // После вставки — перераскладываем весь стек.
        layoutToasts();
    }

    /**
     * Пересчитывает позиции всех уведомлений в контейнере.
     *
     * Раскладка:
     *   - карточки растут ВВЕРХ от нижнего края контейнера (top — отрицательный);
     *   - каждая следующая карточка перекрывает предыдущую на 50% её высоты;
     *   - обычная карточка — top = -(index * height/2), z-index = 1000 - index;
     *   - «приподнятая» карточка — top -= 12 (визуальный подъём), z-index 9000.
     *
     * Контейнер имеет bottom: 20px и высоту 0, поэтому top: 0 у карточки — это
     * её верхний край на уровне bottom-20. Отрицательные top двигают карточку вверх.
     */
    function layoutToasts() {
        const container = document.getElementById('proschety-toasts');
        if (!container) return;

        const toasts = Array.from(container.querySelectorAll('.proschety-toast'));

        // ШАГ 1. Сначала решаем, у кого показывается кнопка «Обновить данные».
        // Кнопка — только у верхнего (первого в DOM, самого нового) уведомления.
        // Это надо сделать ДО подсчёта высот, потому что кнопка меняет высоту.
        toasts.forEach(function (toast, index) {
            const btn = toast.querySelector('.proschety-toast-refresh');
            if (!btn) return;
            btn.hidden = (index !== 0);
        });

        // ШАГ 2. Теперь считаем наложение по актуальным высотам.
        // Идём от старых (последних в DOM) к новым (первым).
        // Самая старая карточка — снизу (top: -height, прижата к нижнему краю).
        // Каждая следующая по «свежести» — выше на половину высоты.
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
    // 10. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ.
    // ========================================================================

    function getCsrfToken() {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const c = cookies[i].trim();
            if (c.indexOf('csrftoken=') === 0) {
                return decodeURIComponent(c.substring('csrftoken='.length));
            }
        }
        console.warn('CSRF-токен не найден');
        return '';
    }

    /**
     * Кратковременное уведомление в левом верхнем углу.
     * Использует тот же контейнер #proschety-top-notifications и те же
     * классы, что и proschet.js — единый стиль по всей странице.
     *
     * @param {string} message
     * @param {string} type — 'success' (по умолчанию зелёный) | 'error' (красный) | 'warning' (жёлтый)
     */
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

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========================================================================
    // 11. ВЫБОР АКТИВНОГО ПРОСЧЁТА (клик по строке).
    // ========================================================================

    /**
     * Клик по строке таблицы:
     *   - снимает .selected со всех строк;
     *   - ставит .selected на кликнутую;
     *   - генерирует событие proschetSelected с номером и названием.
     *
     * Не срабатывает:
     *   - при клике по крестику удаления;
     *   - при клике по ячейке, которая сейчас редактируется;
     *   - при клике по полю ввода внутри ячейки.
     */
    function handleRowClick(event) {
        // Клик по кнопке удаления — не выбираем строку.
        if (event.target.closest('.list-proschet-btn-delete')) return;

        // Клик по ячейке, которая сейчас редактируется — не выбираем строку.
        if (event.target.closest('.editing-cell')) return;

        // Клик по полю ввода или его обёртке — не выбираем строку.
        if (event.target.closest('.list-proschet-inline-input')) return;

        // Находим строку. Если клика не было по строке таблицы — молча выходим.
        const row = event.target.closest('.list-proschet-row');
        if (!row) return;

        // Находим tbody через саму строку — это всегда надёжно.
        const tbody = row.closest('tbody');
        if (!tbody) return;

        // Снимаем .selected со всех строк.
        tbody.querySelectorAll('.list-proschet-row').forEach(function (r) {
            r.classList.remove('selected');
        });
        // Ставим на кликнутую.
        row.classList.add('selected');

        // Читаем данные из ячеек и data-атрибутов.
        const proschetId = row.dataset.proschetId || '';
        const numberCell = row.querySelector('.col-number');
        const titleCell  = row.querySelector('.col-title');
        const number = numberCell ? numberCell.textContent.trim() : '';
        const title  = titleCell  ? titleCell.textContent.trim()  : '';
        const circulation    = row.dataset.circulation || '';
        const comment        = row.dataset.comment     || '';
        const clientDiscount = row.dataset.clientDiscount || '';

        // Генерируем событие с данными из DOM (мгновенно).
        document.dispatchEvent(new CustomEvent('proschetSelected', {
            detail: {
                proschetId: proschetId,
                proschetNumber: number,
                proschetTitle: title,
                proschetCirculation: circulation,
                proschetComment: comment,
                proschetDiscount: clientDiscount
            }
        }));

        // И параллельно — запрос свежих данных с сервера (вдруг в другом
        // окне кто-то изменил тираж/комментарий/клиента). Если данные
        // отличаются — генерируем ещё одно proschetSelected с актуальными.
        refreshProschetData(proschetId);
    }

    /**
     * Запрашивает у сервера свежие данные просчёта и генерирует событие
     * proschetSelected с актуальными значениями (тираж, комментарий, скидка).
     */
    function refreshProschetData(proschetId) {
        fetch('/proschety/api/proschet/' + proschetId + '/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !data.proschet) return;
            const p = data.proschet;

            document.dispatchEvent(new CustomEvent('proschetSelected', {
                detail: {
                    proschetId: String(p.id),
                    proschetNumber: p.number,
                    proschetTitle: p.title,
                    proschetCirculation: p.circulation,
                    proschetComment: p.comment || '',
                    proschetDiscount: p.discount || ''
                }
            }));
        })
        .catch(function (err) {
            // Не критично — данные из DOM уже показаны.
            console.warn('Не удалось получить свежие данные просчёта:', err);
        });
    }

})();