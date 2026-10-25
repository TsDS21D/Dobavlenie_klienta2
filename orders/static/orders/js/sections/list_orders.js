/*
orders/static/orders/js/sections/list_orders.js
JavaScript секции «Список заказов» страницы /orders/.

ПОДХОД:
  - Создание/удаление заказа → перерисовываем только tbody через
    GET /orders/api/rows/. Страница не мигает, открытые модалки не
    закрываются, фильтры поиска сохраняются.
  - Инлайн-редактирование ячеек — по двойному клику на .editable-cell.
    Поле редактируется через свой контрол (input / select / datetime-local),
    сохранение — POST /orders/api/order/<id>/update-field/.
    После успеха обновляем ячейку локально, не перерисовывая таблицу.
  - Все обработчики — на document, чтобы переживать перерисовку tbody.
*/

"use strict";

(function () {

    // ========================================================================
    // 1. СОСТОЯНИЕ И DOM.
    // ========================================================================

    // DOM-элементы (находим один раз при инициализации).
    let inputAll        = null;   // общий поиск
    let inputClient     = null;   // поиск по клиенту
    let selectStatus    = null;   // фильтр по статусу
    let tableBody       = null;   // tbody таблицы заказов
    let noResultsBlock  = null;   // сообщение «Ничего не найдено»

    // Форма создания.
    let createBtn       = null;
    let createForm      = null;
    let createFormEl    = null;
    let createCancel    = null;
    let createSubmit    = null;
    let createClient    = null;
    let createComment   = null;
    let createReady     = null;

    // Модалка удаления.
    let pendingDeleteOrderId = null;
    let pendingDeleteButton  = null;
    let pendingDeleteProductId = null; // <-- ДОБАВЛЕНО: для запоминания ID изделия

    // Кэш клиентов (загружается один раз, при первом редактировании клиента).
    let clientsCache = null;

    // WebSocket для реактивности (уведомления о чужих действиях).
    let toastsWebSocket = null;

    // ========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ.
    // ========================================================================

    document.addEventListener('DOMContentLoaded', function () {
        console.log('✅ Модуль «Список заказов» загружен');

        // --- Поиск и tbody ---
        inputAll       = document.getElementById('list-orders-search-input');
        inputClient    = document.getElementById('list-orders-search-client');
        selectStatus   = document.getElementById('list-orders-search-status');
        tableBody      = document.getElementById('list-orders-table-body');
        noResultsBlock = document.getElementById('list-orders-no-results');

        if (inputAll)     inputAll.addEventListener('input',  handleSearch);
        if (inputClient)  inputClient.addEventListener('input', handleSearch);
        if (selectStatus) selectStatus.addEventListener('change', handleSearch);

        // Делегирование: dblclick — редактирование, click — удаление/переход.
        document.addEventListener('dblclick', handleEditableCellDblClick);
        document.addEventListener('click',    handleDeleteClick);
        document.addEventListener('click',    handleProductDeleteClick);
        document.addEventListener('click',    handleToggleAddProductSection);
        document.addEventListener('click',    handleAddFromProschetClick);
        document.addEventListener('click',    handleRowClick);
        document.addEventListener('change', handleStatusChange);
        document.addEventListener('click', handleToggleAddProductSection);
        document.addEventListener('click', handleAddFromProschetClick);

        // --- Форма создания ---
        createBtn     = document.getElementById('list-orders-create-btn');
        createForm    = document.getElementById('list-orders-create-form');
        createFormEl  = document.getElementById('list-orders-create-form-el');
        createCancel  = document.getElementById('list-orders-create-cancel');
        createSubmit  = document.getElementById('list-orders-create-submit');
        createClient  = document.getElementById('list-orders-create-client');
        createComment = document.getElementById('list-orders-create-comment');
        createReady   = document.getElementById('list-orders-create-ready');

        if (createBtn)    createBtn.addEventListener('click', toggleCreateForm);
        if (createCancel) createCancel.addEventListener('click', closeCreateForm);
        if (createFormEl) createFormEl.addEventListener('submit', handleCreateSubmit);

        // --- Модалка удаления ---
        const confirmOverlay = document.getElementById('list-orders-confirm-overlay');
        const confirmNo      = document.getElementById('list-orders-confirm-no');
        const confirmYes     = document.getElementById('list-orders-confirm-yes');
        if (confirmNo)  confirmNo.addEventListener('click', closeConfirmModal);
        if (confirmYes) confirmYes.addEventListener('click', confirmDeleteYes);
        if (confirmOverlay) {
            confirmOverlay.addEventListener('click', function (e) {
                if (e.target === confirmOverlay) closeConfirmModal();
            });
        }
        // Esc закрывает модалку удаления, если она открыта.
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (!confirmOverlay) return;
            if (confirmOverlay.style.display !== 'flex') return;
            closeConfirmModal();
        });

        // Пересчёт тостов при изменении размера окна.
        window.addEventListener('resize', layoutToasts);

        // --- WebSocket для реактивности ---
        initToastsWebSocket();

        // --- АВТОРАСКРЫТИЕ ЗАКАЗА ИЗ URL ---
        // Если мы пришли со страницы просчётов после добавления изделия,
        // в URL будет параметр ?expanded_order=123.
        const urlParams = new URLSearchParams(window.location.search);
        const expandedOrderId = urlParams.get('expanded_order');
        
        if (expandedOrderId && tableBody) {
            // Ищем карточку с этим ID
            const cardToExpand = tableBody.querySelector('.list-orders-card[data-order-id="' + expandedOrderId + '"]');
            if (cardToExpand) {
                // Раскрываем её
                cardToExpand.classList.add('is-expanded');
                
                // Плавно прокручиваем экран к ней (с небольшой задержкой, чтобы DOM успел отрисоваться)
                setTimeout(() => {
                    cardToExpand.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            }
        }

        console.log('✅ Инициализация секции «Список заказов» завершена');
    });

    // ========================================================================
    // 3. CSRF-ТОКЕН И УВЕДОМЛЕНИЯ.
    // ========================================================================

    /**
     * Достаёт CSRF-токен из cookie csrftoken.
     * Sessionid HttpOnly — его тут не читаем (и не нужно).
     */
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
     * Кратковременное уведомление в верхнем левом углу.
     * Тот же контейнер и те же классы, что у «Списка просчётов».
     * Если контейнера нет — молча выходим.
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

    // ========================================================================
    // 4. ПОИСК И ФИЛЬТРАЦИЯ СТРОК.
    // ========================================================================

    function handleSearch() {
        const qAll    = inputAll    ? (inputAll.value    || '').trim().toLowerCase() : '';
        const qClient = inputClient ? (inputClient.value || '').trim().toLowerCase() : '';
        const qStatus = selectStatus ? (selectStatus.value || '') : '';

        // Теперь ищем карточки, а не строки таблицы
        const cards = tableBody.querySelectorAll('.list-orders-card');
        let visibleCount = 0;

        cards.forEach(function (card) {
            const fullText   = card.textContent.toLowerCase();
            const clientCell = card.querySelector('.list-orders-card-client');
            const clientText = clientCell ? clientCell.textContent.toLowerCase() : '';
            const rowStatus  = card.dataset.status || '';

            const passAll    = !qAll    || fullText.indexOf(qAll)       !== -1;
            const passClient = !qClient || clientText.indexOf(qClient) !== -1;
            const passStatus = !qStatus || rowStatus === qStatus;

            if (passAll && passClient && passStatus) {
                card.style.display = '';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Скрываем заголовки групп, если в них не осталось видимых карточек
        document.querySelectorAll('.list-orders-group').forEach(function (group) {
            const groupCards = group.querySelectorAll('.list-orders-card');
            if (groupCards.length === 0) return; // Пустые группы не трогаем

            let hasVisible = false;
            groupCards.forEach(function (c) {
                if (c.style.display !== 'none') hasVisible = true;
            });
            
            const title = group.querySelector('.list-orders-group-title');
            const emptyMsg = group.querySelector('.list-orders-group-empty');

            if (hasVisible) {
                if (title) title.style.display = '';
                if (emptyMsg) emptyMsg.style.display = 'none';
            } else {
                if (title) title.style.display = 'none';
                // Если поиск отфильтровал все карточки, но группа не была пуста изначально
                if (emptyMsg) emptyMsg.style.display = 'none'; 
            }
        });

        const anyQuery = !!(qAll || qClient || qStatus);
        if (noResultsBlock) {
            noResultsBlock.style.display = (anyQuery && visibleCount === 0) ? 'block' : 'none';
        }
    }

    // ========================================================================
    // 5. ФОРМА СОЗДАНИЯ.
    // ========================================================================

    function toggleCreateForm() {
        if (!createForm) return;
        
        // Проверяем, открыта ли форма сейчас
        const isHidden = createForm.style.display === 'none' || createForm.style.display === '';
        
        if (isHidden) {
            // Открываем
            createForm.style.display = 'block';
            if (createBtn) createBtn.classList.add('is-open');
            
            // Если дата пустая — ставим дефолтную
            if (createReady && !createReady.value) {
                createReady.value = getDefaultReadyDatetime();
            }
            if (createComment) createComment.focus();
        } else {
            // Закрываем
            closeCreateForm();
        }
    }
    function closeCreateForm() {
        if (!createForm) return;
        createForm.style.display = 'none';
        if (createBtn) createBtn.classList.remove('is-open'); // Снимаем класс, стрелка поворачивается обратно
        if (createFormEl) createFormEl.reset();
    }

    /**
     * Возвращает строку 'YYYY-MM-DDTHH:MM' — «завтра 15:00» в локальном
     * часовом поясе браузера. Логика совпадает с default_ready_datetime
     * на сервере (см. orders/models.py).
     */
    function getDefaultReadyDatetime() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        // Пропускаем выходные.
        while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
            tomorrow.setDate(tomorrow.getDate() + 1);
        }
        const yyyy = tomorrow.getFullYear();
        const mm   = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const dd   = String(tomorrow.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}T15:00`;
    }

    function handleCreateSubmit(event) {
        event.preventDefault();
        if (!createFormEl) return;

        const clientId  = createClient  ? createClient.value.trim()   : '';
        const comment   = createComment ? createComment.value.trim()  : '';
        const readyVal  = createReady   ? createReady.value.trim()    : '';

        // Минимальная проверка на клиенте.
        if (!clientId && !comment && !readyVal) {
            showNotification('Заполните хотя бы одно поле', 'warning');
            return;
        }

        const originalText = createSubmit.textContent;
        createSubmit.disabled = true;
        createSubmit.textContent = 'Создание...';

        const fd = new FormData();
        fd.append('client',         clientId);
        fd.append('comment',        comment);
        fd.append('ready_datetime', readyVal);

        fetch('/orders/api/order/create/', {
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
                showNotification('Заказ ' + data.order.number + ' создан', 'success');
                closeCreateForm();
                return refreshTable();
            } else {
                showNotification('Ошибка: ' + (data.error || 'неизвестная ошибка'), 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при создании заказа', 'error');
        })
        .finally(function () {
            createSubmit.disabled = false;
            createSubmit.textContent = originalText;
        });
    }

    // ========================================================================
    // 6. ПЕРЕРИСОВКА ТАБЛИЦЫ.
    // ========================================================================

    /**
     * Запрашивает актуальный HTML-партиал с <tr>-строками
     * и подменяет содержимое tbody. После — переприменяет фильтры поиска.
     */
    function refreshTable() {
        // 1. Запоминаем ID раскрытых карточек ДО перерисовки
        let expandedIds = [];
        if (tableBody) {
            tableBody.querySelectorAll('.list-orders-card.is-expanded').forEach(function(card) {
                if (card.dataset.orderId) {
                    expandedIds.push(card.dataset.orderId);
                }
            });
        }

        return fetch('/orders/api/rows/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.text(); })
        .then(function (html) {
            if (tableBody) {
                // 2. Вставляем свежий HTML
                tableBody.innerHTML = html;
                
                // 3. Восстанавливаем раскрытое состояние (если заказ ещё существует)
                if (expandedIds.length > 0) {
                    expandedIds.forEach(function(id) {
                        const cardToExpand = tableBody.querySelector('.list-orders-card[data-order-id="' + id + '"]');
                        if (cardToExpand) {
                            cardToExpand.classList.add('is-expanded');
                        }
                    });
                }
            }
            handleSearch();
        });
    }

    // ========================================================================
    // 7. ИНЛАЙН-РЕДАКТИРОВАНИЕ ЯЧЕЕК.
    // ========================================================================

    /**
     * Двойной клик по редактируемой ячейке .editable-cell.
     * Смотрим на data-field и запускаем нужный редактор.
     */
    function handleEditableCellDblClick(event) {
        const cell = event.target.closest('.editable-cell');
        if (!cell) return;
        if (cell.classList.contains('editing-cell')) return;

        const card = cell.closest('.list-orders-card');
        if (!card) return;
        const orderId = card.dataset.orderId;
        if (!orderId) return;

        const field = cell.dataset.field;

        if (field === 'client')         activateClientEdit(cell, orderId, card.dataset.clientId || '');
        else if (field === 'ready_datetime') activateReadyEdit(cell, orderId);
        else if (field === 'comment')   activateCommentEdit(cell, orderId);
    }

    /**
     * Редактирование клиента — селект со списком клиентов.
     * Список тянем один раз и кэшируем.
     */
    function activateClientEdit(cell, orderId, currentId) {
        const originalText  = cell.dataset.originalValue || '—';

        // Показываем «Загрузка...», пока приходит список.
        if (clientsCache === null) {
            cell.classList.add('editing-cell');
            cell.innerHTML = '<span class="list-orders-inline-saving">Загрузка...</span>';

            fetch('/orders/api/clients/', {
                method: 'GET',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success && Array.isArray(data.clients)) {
                    clientsCache = data.clients;
                    buildClientSelect(cell, orderId, currentId, originalText);
                } else {
                    cancelEdit(cell, originalText);
                    showNotification('Не удалось загрузить клиентов', 'error');
                }
            })
            .catch(function (err) {
                console.error(err);
                cancelEdit(cell, originalText);
                showNotification('Ошибка сети при загрузке клиентов', 'error');
            });
        } else {
            buildClientSelect(cell, orderId, currentId, originalText);
        }
    }

    function buildClientSelect(cell, orderId, currentId, originalText) {
        cell.classList.add('editing-cell');
        cell.innerHTML = '';

        const select = document.createElement('select');
        select.className = 'list-orders-inline-select';

        const optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = '— Не выбран —';
        select.appendChild(optEmpty);

        clientsCache.forEach(function (c) {
            const opt = document.createElement('option');
            opt.value = String(c.id);
            opt.textContent = c.name + (c.primary_le_name ? ' (' + c.primary_le_name + ')' : '');
            if (String(c.id) === String(currentId)) opt.selected = true;
            select.appendChild(opt);
        });

        cell.appendChild(select);
        select.focus();

        let finished = false;
        select.addEventListener('change', function () {
            if (finished) return;
            finished = true;
            saveField(cell, orderId, 'client', select.value, originalText);
        });
        select.addEventListener('blur', function () {
            setTimeout(function () {
                if (finished) return;
                finished = true;
                saveField(cell, orderId, 'client', select.value, originalText);
            }, 120);
        });
        select.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                cancelEdit(cell, originalText);
            }
        });
    }

    /**
     * Редактирование статуса — селект с четырьмя вариантами.
     */
    function activateStatusEdit(cell, orderId) {
        const currentValue = cell.dataset.originalValue || 'accepted';
        const originalHtml = cell.innerHTML;

        cell.classList.add('editing-cell');
        cell.innerHTML = '';

        const statuses = [
            { value: 'accepted',    label: 'Принят'    },
            { value: 'in_progress', label: 'В работе'  },
            { value: 'ready',       label: 'Готов'     },
            { value: 'completed',   label: 'Выдан'     },
        ];

        const select = document.createElement('select');
        select.className = 'list-orders-inline-select';
        statuses.forEach(function (s) {
            const opt = document.createElement('option');
            opt.value = s.value;
            opt.textContent = s.label;
            if (s.value === currentValue) opt.selected = true;
            select.appendChild(opt);
        });

        cell.appendChild(select);
        select.focus();

        let finished = false;
        select.addEventListener('change', function () {
            if (finished) return;
            finished = true;
            saveField(cell, orderId, 'status', select.value, originalHtml);
        });
        select.addEventListener('blur', function () {
            setTimeout(function () {
                if (finished) return;
                finished = true;
                saveField(cell, orderId, 'status', select.value, originalHtml);
            }, 120);
        });
        select.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                cell.classList.remove('editing-cell');
                cell.innerHTML = originalHtml;
            }
        });
    }

    /**
     * Редактирование даты готовности — <input type="datetime-local">.
     */
    function activateReadyEdit(cell, orderId) {
        const currentVal  = cell.dataset.originalValue || '';
        const originalText = cell.textContent.trim();

        cell.classList.add('editing-cell');
        cell.innerHTML = '';

        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.className = 'list-orders-inline-input';
        input.value = currentVal;
        cell.appendChild(input);
        input.focus();

        let finished = false;
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                saveField(cell, orderId, 'ready_datetime', input.value, originalText);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                cancelEdit(cell, originalText);
            }
        });
        input.addEventListener('blur', function () {
            setTimeout(function () {
                if (finished) return;
                finished = true;
                saveField(cell, orderId, 'ready_datetime', input.value, originalText);
            }, 100);
        });
    }

    /**
     * Редактирование комментария — текстовый input.
     */
    function activateCommentEdit(cell, orderId) {
        const currentVal   = cell.dataset.originalValue || '';
        const originalText = currentVal || '—';

        cell.classList.add('editing-cell');
        cell.innerHTML = '';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'list-orders-inline-input';
        input.value = currentVal;
        input.maxLength = 5000;
        cell.appendChild(input);
        input.focus();
        input.select();

        let finished = false;
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                saveField(cell, orderId, 'comment', input.value, originalText);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                cancelEdit(cell, originalText);
            }
        });
        input.addEventListener('blur', function () {
            setTimeout(function () {
                if (finished) return;
                finished = true;
                saveField(cell, orderId, 'comment', input.value, originalText);
            }, 100);
        });
    }

    /**
     * Сохраняет новое значение поля заказа на сервере.
     * После успеха обновляет ячейку и data-атрибуты, не перерисовывая таблицу.
     *
     * @param {HTMLElement} cell       — редактируемая ячейка.
     * @param {string}      orderId    — ID заказа.
     * @param {string}      fieldName  — client / status / ready_datetime / comment.
     * @param {string}      fieldValue — новое значение.
     * @param {string}      originalValue — исходное отображаемое значение (для отката).
     */
    function saveField(cell, orderId, fieldName, fieldValue, originalValue) {
        // Оптимизация: если значение не изменилось — просто возвращаемся.
        const oldValue = cell.dataset.originalValue || '';
        if (fieldName !== 'client' && String(fieldValue) === String(oldValue)) {
            cancelEdit(cell, originalValue);
            return;
        }

        cell.innerHTML = '<span class="list-orders-inline-saving">Сохранение...</span>';

        const fd = new FormData();
        fd.append('field_name',  fieldName);
        fd.append('field_value', fieldValue);

        fetch('/orders/api/order/' + orderId + '/update-field/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                cancelEdit(cell, originalValue);
                showNotification('Ошибка: ' + (data.error || 'неизвестная'), 'error');
                return;
            }

            // Обновляем ячейку и data-атрибуты в зависимости от поля.
            const o = data.order;
            const card = cell.closest('.list-orders-card');

            if (fieldName === 'client') {
                cell.textContent = o.client_name || '—';
                cell.dataset.originalValue = o.client_name || '—';
                if (card) card.dataset.clientId = o.client_id || '';
                cell.classList.remove('editing-cell');
                showNotification('Сохранено', 'success');
            }
            else if (fieldName === 'status') {
                // При смене статуса карточка должна переехать в другую группу.
                // Проще всего перерисовать всё дерево.
                showNotification('Статус изменён', 'success');
                return refreshTable(); 
            }
            else if (fieldName === 'ready_datetime') {
                cell.textContent = o.ready_datetime;
                cell.dataset.originalValue = fieldValue;
                if (card) card.dataset.readyDatetime = fieldValue;
                cell.classList.remove('editing-cell');
                
                // ДОБАВЛЕНО: Обновляем бейдж с часами на основе ответа сервера
                if (card && o.working_hours_remaining !== undefined) {
                    const hoursContainer = card.querySelector('.list-orders-card-hours');
                    if (hoursContainer) {
                        const hours = o.working_hours_remaining;
                        let badgeClass = 'normal';
                        if (hours <= 1) badgeClass = 'critical';
                        else if (hours <= 3) badgeClass = 'warning';
                        
                        // Перерисовываем внутренность бейджа
                        hoursContainer.innerHTML = `<span class="list-orders-hours-badge ${badgeClass}">⏱️ ${hours}ч</span>`;
                    }
                }
                
                showNotification('Сохранено', 'success');
            }
            else if (fieldName === 'comment') {
                if (card) {
                    card.dataset.comment = o.comment || '';
                    
                    // Находим ВСЕ ячейки комментария в этой карточке (в шапке и в раскрытом блоке)
                    const commentCells = card.querySelectorAll('.editable-cell[data-field="comment"]');
                    
                    commentCells.forEach(function(c) {
                        c.textContent = o.comment || '—';
                        c.dataset.originalValue = o.comment || '';
                        c.classList.remove('editing-cell');
                    });
                }
                showNotification('Сохранено', 'success');
            }
        })
        .catch(function (err) {
            console.error(err);
            cancelEdit(cell, originalValue);
            showNotification('Ошибка сети при сохранении', 'error');
        });
    }

    /**
     * Откат редактирования — возвращает исходное отображаемое значение.
     * Для status использует originalHtml, переданный в saveField как originalValue,
     * но safe-вариант: если originalValue — это HTML, вставляем как HTML.
     * Для остальных полей — как текст.
     */
    function cancelEdit(cell, originalValue) {
        cell.classList.remove('editing-cell');
        // Для status originalValue — это HTML бейджа.
        // Для остальных — plain text.
        // Различим по наличию '<span' в начале.
        if (typeof originalValue === 'string' && originalValue.indexOf('<span') === 0) {
            cell.innerHTML = originalValue;
        } else {
            cell.textContent = originalValue;
        }
    }

    // ========================================================================
    // 8. УДАЛЕНИЕ ЗАКАЗА.
    // ========================================================================

    function handleDeleteClick(event) {
        const btn = event.target.closest('.list-orders-btn-delete');
        if (!btn) return;
        event.stopPropagation();

        const orderId = btn.dataset.orderId;
        if (!orderId) return;

        pendingDeleteOrderId = orderId;
        pendingDeleteButton  = btn;
        pendingDeleteProductId = null; // Сбрасываем контекст

        const overlay = document.getElementById('list-orders-confirm-overlay');
        if (overlay) {
            const titleEl = overlay.querySelector('.list-orders-confirm-title');
            const textEl  = overlay.querySelector('.list-orders-confirm-text');
            
            if (titleEl) titleEl.textContent = 'Удалить заказ?';
            if (textEl) textEl.innerHTML = 'Заказ пропадёт из списка.<br>Его можно будет восстановить через админку.';
            
            overlay.style.display = 'flex';
        }
    }

    function closeConfirmModal() {
        const overlay = document.getElementById('list-orders-confirm-overlay');
        if (overlay) overlay.style.display = 'none';
        pendingDeleteOrderId = null;
        pendingDeleteButton  = null;
        pendingDeleteProductId = null; // Очищаем и ID изделия
    }

    function confirmDeleteYes() {
        // ===== ВАРИАНТ 1: Удаление ИЗДЕЛИЯ =====
        if (pendingDeleteProductId) {
            const productId = pendingDeleteProductId;
            const btn = pendingDeleteButton;
            
            closeConfirmModal();
            if (btn) btn.disabled = true;

            fetch('/orders/api/product/' + productId + '/delete/', {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': getCsrfToken()
                }
            })
            .then(function (r) { 
                // Если вернулась ошибка 404 (изделие уже удалено) — просто обновляем таблицу
                if (r.status === 404) return { success: true }; 
                return r.json(); 
            })
            .then(function (data) {
                if (data.success) {
                    showNotification('Изделие удалено', 'success');
                    return refreshTable();
                } else {
                    if (btn) btn.disabled = false;
                    showNotification(data.error || 'Ошибка удаления', 'error');
                }
            })
            .catch(function (err) {
                console.error(err);
                if (btn) btn.disabled = false;
                showNotification('Ошибка сети при удалении изделия', 'error');
            });
            
            return; // Выходим, чтобы не выполнять код удаления заказа
        }

        // ===== ВАРИАНТ 2: Удаление ЗАКАЗА =====
        if (!pendingDeleteOrderId || !pendingDeleteButton) {
            closeConfirmModal();
            return;
        }
        const orderId = pendingDeleteOrderId;
        const btn     = pendingDeleteButton;

        closeConfirmModal();

        btn.disabled = true;

        fetch('/orders/api/order/' + orderId + '/delete/', {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                showNotification('Заказ удалён', 'error');
                return refreshTable();
            } else {
                btn.disabled = false;
                showNotification('Ошибка: ' + (data.error || 'неизвестная'), 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            btn.disabled = false;
            showNotification('Ошибка сети при удалении', 'error');
        });
    }

    // ========================================================================
    // 9. КЛИК ПО СТРОКЕ — ПЕРЕХОД НА КАРТОЧКУ ЗАКАЗА.
    // ========================================================================

    /**
     * Клик по строке (вне редактируемых ячеек и кнопки удаления) —
     * переход на /orders/<id>/.
     * На редактируемых ячейках клик ничего не делает — там работает dblclick.
     */
    function handleRowClick(event) {
        // Игнорируем клики по интерактивным элементам
        if (event.target.closest('.list-orders-btn-delete')) return;
        if (event.target.closest('.editable-cell')) return;
        if (event.target.closest('.editing-cell')) return;
        if (event.target.closest('.list-orders-inline-input')) return;
        if (event.target.closest('.list-orders-inline-select')) return;
        if (event.target.closest('.list-orders-status-select')) return;
        
        // Игнорируем клики внутри раскрытого блока (например, по кнопке "Открыть карточку")
        if (event.target.closest('.list-orders-card-details')) return;

        // Ищем карточку
        const card = event.target.closest('.list-orders-card');
        if (!card) return;

        // Сворачиваем все остальные открытые карточки (по желанию)
        document.querySelectorAll('.list-orders-card.is-expanded').forEach(function(c) {
            if (c !== card) c.classList.remove('is-expanded');
        });

        // Переключаем состояние текущей карточки
        card.classList.toggle('is-expanded');
    }

    // ========================================================================
    // 10. WEBSOCKET-УВЕДОМЛЕНИЯ (реактивность).
    // ========================================================================

    /**
     * Подключается к WebSocket-каналу /ws/orders/.
     * При получении события от другой сессии — перерисовывает таблицу
     * и показывает тост в левом нижнем углу.
     */
    function initToastsWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const url = protocol + window.location.host + '/ws/orders/';

        try {
            toastsWebSocket = new WebSocket(url);
        } catch (e) {
            console.warn('WebSocket не удалось открыть:', e);
            return;
        }

        toastsWebSocket.onopen = function () {
            console.log('✅ WebSocket /ws/orders/ подключён');
        };

        toastsWebSocket.onmessage = function (event) {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                return;
            }
            if (data.type !== 'order_event') return;

            const container = document.getElementById('proschety-toasts');
            const mySessionKey = container ? (container.dataset.sessionKey || '') : '';

            // Игнорируем события, которые породили мы сами.
            if (data.actor_session_key && mySessionKey && mySessionKey === data.actor_session_key) {
                return;
            }

            // Чужая сессия изменила данные — перерисовываем tbody.
            refreshTable();

            // Показываем тост.
            showToast(data);
        };

        toastsWebSocket.onclose = function () {
            console.warn('WebSocket /ws/orders/ закрыт, переподключение через 3 сек.');
            setTimeout(initToastsWebSocket, 3000);
        };

        toastsWebSocket.onerror = function (err) {
            console.warn('WebSocket ошибка:', err);
        };
    }

    /**
     * Показывает тост о событии и переразкладывает стек.
     */
    function showToast(data) {
        const container = document.getElementById('proschety-toasts');
        if (!container) return;

        let action = '';
        let modifierClass = '';
        if (data.event === 'created') {
            action = 'создал заказ';
            modifierClass = 'proschety-toast-created';
        }
        if (data.event === 'deleted') {
            action = 'удалил заказ';
            modifierClass = 'proschety-toast-deleted';
        }
        if (data.event === 'updated') {
            action = 'изменил заказ';
            modifierClass = 'proschety-toast-updated';
        }

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
            refreshTable().then(function () {
                container.innerHTML = '';
            }).catch(function (err) {
                console.error(err);
                refreshBtn.disabled = false;
                showNotification('Не удалось обновить список', 'error');
            });
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

    /**
     * Пересчитывает позиции тостов в стеке.
     */
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

/**
 * Обработка изменения выпадающего списка статусов.
 */
function handleStatusChange(event) {
    const select = event.target.closest('.list-orders-status-select');
    if (!select) return;

    const orderId = select.dataset.orderId;
    const newStatus = select.value;
    if (!orderId) return;

    select.disabled = true;

    const fd = new FormData();
    fd.append('field_name', 'status');
    fd.append('field_value', newStatus);

    fetch('/orders/api/order/' + orderId + '/update-field/', {
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
            showNotification('Статус изменён', 'success');
            return refreshTable(); 
        } else {
            select.disabled = false;
            showNotification(data.error || 'Ошибка сохранения', 'error');
        }
    })
    .catch(function (err) {
        console.error(err);
        select.disabled = false;
        showNotification('Ошибка сети при сохранении статуса', 'error');
    });
}

    /**
     * Обработка клика по кнопке удаления изделия внутри раскрытого заказа.
     */
    function handleProductDeleteClick(event) {
        const btn = event.target.closest('.list-orders-product-delete-btn');
        if (!btn) return;
        
        // Останавливаем всплытие, чтобы клик не вызвал сворачивание карточки
        event.stopPropagation();
        
        const productId = btn.dataset.productId;
        if (!productId) return;
        
        // Запоминаем контекст: мы удаляем ИЗДЕЛИЕ
        pendingDeleteProductId = productId;
        pendingDeleteOrderId = null;
        pendingDeleteButton = btn;
        
        // Настраиваем модалку под удаление изделия
        const overlay = document.getElementById('list-orders-confirm-overlay');
        if (overlay) {
            const titleEl = overlay.querySelector('.list-orders-confirm-title');
            const textEl  = overlay.querySelector('.list-orders-confirm-text');
            
            if (titleEl) titleEl.textContent = 'Удалить изделие?';
            if (textEl) {
                textEl.innerHTML = 'Изделие пропадёт из этого заказа.<br>Его можно будет восстановить через админку.';
            }
            
            overlay.style.display = 'flex';
        }
    }
    /**
     * Открытие/закрытие формы добавления изделия.
     */
    function handleToggleAddProductSection(event) {
        const btn = event.target.closest('.list-orders-toggle-add-product');
        if (!btn) return;
        
        event.stopPropagation(); // Чтобы не сворачивалась карточка
        
        const section = btn.closest('.list-orders-add-product-section');
        if (!section) return;
        
        const willOpen = !section.classList.contains('is-open');
        section.classList.toggle('is-open');
        
        // Если открываем впервые — загружаем список просчётов
        if (willOpen) {
            const select = section.querySelector('.list-orders-select-proschet');
            if (select && select.options.length <= 1) {
                loadProschetsForSelect(select);
            }
        }
    }
    /**
     * Загружает список просчётов для выпадающего списка.
     */
    function loadProschetsForSelect(selectEl) {
        fetch('/orders/api/proschets-list/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !data.proschets) {
                selectEl.innerHTML = '<option value="">— Ошибка загрузки —</option>';
                return;
            }
            
            let html = '<option value="">— Выберите просчёт —</option>';
            data.proschets.forEach(function (p) {
                html += `<option value="${p.id}">${p.number}: ${p.title}</option>`;
            });
            selectEl.innerHTML = html;
        })
        .catch(function (err) {
            console.error(err);
            selectEl.innerHTML = '<option value="">— Ошибка сети —</option>';
        });
    }

    /**
     * Добавляет изделие (из выбранного просчёта) в текущий заказ.
     */
    function handleAddFromProschetClick(event) {
        const btn = event.target.closest('.list-orders-btn-add-from-proschet');
        if (!btn) return;
        
        event.stopPropagation();
        
        const orderId = btn.dataset.orderId;
        const section = btn.closest('.list-orders-add-product-section');
        const select = section.querySelector('.list-orders-select-proschet');
        
        const proschetId = select.value;
        if (!proschetId) {
            showNotification('Выберите просчёт', 'warning');
            return;
        }
        
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Добавление...';
        
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
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                showNotification('Изделие добавлено в заказ', 'success');
                // Очищаем форму и закрываем её
                select.value = '';
                section.classList.remove('is-open');
                // Обновляем таблицу (карточка останется открытой благодаря нашей недавней правке refreshTable)
                return refreshTable();
            } else {
                showNotification('Ошибка: ' + (data.error || 'неизвестная'), 'error');
                btn.disabled = false;
                btn.textContent = originalText;
            }
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при добавлении', 'error');
            btn.disabled = false;
            btn.textContent = originalText;
        });
    }

    // ========================================================================
    // 11. ДОБАВЛЕНИЕ ИЗДЕЛИЯ ИЗ ПРОСЧЁТА (АККОРДЕОН)
    // ========================================================================

    /**
     * Открытие/закрытие формы добавления изделия по клику на стрелочку.
     */
    function handleToggleAddProductSection(event) {
        const btn = event.target.closest('.list-orders-toggle-add-product');
        if (!btn) return;
        
        event.stopPropagation(); // Чтобы не сворачивалась сама карточка заказа
        
        const section = btn.closest('.list-orders-add-product-section');
        if (!section) return;
        
        const willOpen = !section.classList.contains('is-open');
        section.classList.toggle('is-open');
        
        // Если открываем впервые — загружаем список просчётов
        if (willOpen) {
            const select = section.querySelector('.list-orders-select-proschet');
            // Проверяем, что там всё ещё висит "Загрузка списка..."
            if (select && select.options.length <= 1) {
                loadProschetsForSelect(select);
            }
        }
    }

    /**
     * Загружает список активных просчётов с сервера и наполняет <select>.
     */
    function loadProschetsForSelect(selectEl) {
        fetch('/orders/api/proschets-list/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !data.proschets) {
                selectEl.innerHTML = '<option value="">— Ошибка загрузки —</option>';
                return;
            }
            
            let html = '<option value="">— Выберите просчёт —</option>';
            data.proschets.forEach(function (p) {
                html += `<option value="${p.id}">${p.number}: ${p.title}</option>`;
            });
            selectEl.innerHTML = html;
        })
        .catch(function (err) {
            console.error('Ошибка загрузки просчётов:', err);
            selectEl.innerHTML = '<option value="">— Ошибка сети —</option>';
        });
    }

    /**
     * Отправляет запрос на создание изделия из выбранного просчёта
     * и добавление его в текущий заказ.
     */
    function handleAddFromProschetClick(event) {
        const btn = event.target.closest('.list-orders-btn-add-from-proschet');
        if (!btn) return;
        
        event.stopPropagation();
        
        const orderId = btn.dataset.orderId;
        const section = btn.closest('.list-orders-add-product-section');
        const select = section.querySelector('.list-orders-select-proschet');
        const proschetId = select.value;
        
        if (!proschetId) {
            showNotification('Выберите просчёт из списка', 'warning');
            return;
        }
        
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Добавление...';
        
        // Отправляем JSON, как того требует api_add_to_order во views.py
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
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                showNotification('Изделие успешно добавлено в заказ', 'success');
                select.value = ''; // Сбрасываем выбор
                section.classList.remove('is-open'); // Закрываем форму
                
                // Перерисовываем таблицу. Благодаря нашей прошлой правке, 
                // открытая карточка заказа останется открытой, но в ней 
                // появится новое изделие, а счетчик и цена обновятся!
                return refreshTable();
            } else {
                showNotification('Ошибка: ' + (data.error || 'неизвестная'), 'error');
                btn.disabled = false;
                btn.textContent = originalText;
            }
        })
        .catch(function (err) {
            console.error('Ошибка добавления изделия:', err);
            showNotification('Ошибка сети при добавлении изделия', 'error');
            btn.disabled = false;
            btn.textContent = originalText;
        });
    }


})();