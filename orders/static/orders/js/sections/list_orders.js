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
        document.addEventListener('dblclick', handlePaymentToggleDblClick);
        document.addEventListener('change', handlePaymentFieldChange);
        document.addEventListener('dblclick', handleDeliveryToggleDblClick);
        document.addEventListener('change', handleDeliveryFieldChange);
        // Автоформатирование телефона при вводе и вставке
        document.addEventListener('input', function(e) {
            if (e.target.classList.contains('list-orders-delivery-phone')) {
                e.target.value = formatPhoneNumber(e.target.value);
            }
        });
        document.addEventListener('paste', function(e) {
            if (e.target.classList.contains('list-orders-delivery-phone')) {
                e.preventDefault();
                const pastedText = (e.clipboardData || window.clipboardData).getData('text');
                e.target.value = formatPhoneNumber(pastedText);
            }
        });
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
        // --- Инициализация селектов юрлиц и сотрудников ---
        initClientSelects();
        document.addEventListener('change', handleClientSelectChange);
        // --- WebSocket для реактивности ---
        initToastsWebSocket();

        // --- Умное редактирование и клонирование изделий ---
        // Инициализируем:
        //   • контекстное меню (правый клик / долгий тап);
        //   • модалку выбора заказа для копирования;
        //   • обработчик кнопки «Редактировать» на карточке изделия.
        // Всё это — делегированные обработчики на document, поэтому
        // они переживают перерисовку tbody через refreshTable().
        initProductActions();

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
            initClientSelects();
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

        const textarea = document.createElement('textarea');
        textarea.className = 'list-orders-inline-textarea';
        textarea.value = currentVal;
        textarea.maxLength = 5000;
        
        cell.appendChild(textarea);
        
        // АВТО-ВЫСОТА: делаем это после того, как textarea получила ширину
        requestAnimationFrame(() => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        });
        
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        // АВТО-ВЫСОТА: растягиваем при вводе текста
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });

        let finished = false;
        
        textarea.addEventListener('keydown', function (e) {
            // Escape — отмена
            if (e.key === 'Escape') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                cancelEdit(cell, originalText);
            }
            // Ctrl+Enter (или Cmd+Enter) — сохранить
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (finished) return;
                finished = true;
                saveField(cell, orderId, 'comment', textarea.value, originalText);
            }
            // Обычный Enter теперь работает как перенос строки!
        });

        // Сохранение по клику вне поля
        textarea.addEventListener('blur', function () {
            setTimeout(function () {
                if (finished) return;
                finished = true;
                saveField(cell, orderId, 'comment', textarea.value, originalText);
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
                if (card) {
                    card.dataset.clientId = o.client_id || '';
                    
                    // ОБНОВЛЯЕМ АДРЕС ДОСТАВКИ В DOM
                    if (o.delivery_address !== undefined) {
                        const addressInput = card.querySelector('.list-orders-delivery-address');
                        if (addressInput) {
                            addressInput.value = o.delivery_address;
                        }
                    }
                    // ОБНОВЛЯЕМ СПИСКИ ЮРЛИЦ И СОТРУДНИКОВ
                    loadClientSelectsForCard(card, o.client_id);
                }
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

                showNotification('Сохранено', 'success');

                // ВАЖНО: полностью перерисовываем tbody через refreshTable().
                //
                // Зачем: серверная сортировка заказов внутри каждого статуса
                // идёт по возрастанию оставшихся рабочих часов
                // (см. views.py::index и api_rows — sorted(... key=o.get_working_hours_remaining)).
                // При изменении срока готовности это значение меняется, и
                // карточка должна «переехать» на новое место в списке.
                //
                // Локального обновления бейджа (без refreshTable) недостаточно:
                // бейдж покажет правильные часы, но позиция карточки останется
                // прежней — до следующей полной перезагрузки страницы.
                //
                // refreshTable сохраняет открытые карточки (expandedIds —
                // см. её реализацию), так что раскрытые заказы не «схлопнутся».
                return refreshTable();
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
        // Игнорируем клики по кнопке оплаты (чтобы не раскрывался заказ)
        if (event.target.closest('.list-orders-payment-btn')) return;
        if (event.target.closest('.list-orders-delivery-btn')) return;
        if (event.target.closest('.list-orders-delivery-status-btn')) return;
        if (event.target.closest('.list-orders-delivery-input')) return;

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

    // ========================================================================
    // 12. БЛОК ОПЛАТЫ
    // ========================================================================

    /**
     * Обработка ДВОЙНОГО клика по кнопке "Оплачен / Не оплачен".
     */
    function handlePaymentToggleDblClick(event) {
        const btn = event.target.closest('.list-orders-payment-btn');
        if (!btn) return;
        
        event.stopPropagation(); // Чтобы не сворачивалась карточка заказа
        
        const orderId = btn.dataset.orderId;
        if (!orderId) return;
        
        // Определяем текущее состояние и переключаем
        const isCurrentlyPaid = btn.classList.contains('list-orders-payment-btn--on');
        const newIsPaid = !isCurrentlyPaid;
        
        // Находим карточку и ВСЕ кнопки оплаты внутри неё (в шапке и в раскрытом блоке)
        const card = btn.closest('.list-orders-card');
        const allPaymentBtns = card.querySelectorAll('.list-orders-payment-btn');
        
        // Меняем UI для всех кнопок сразу
        allPaymentBtns.forEach(function(b) {
            if (newIsPaid) {
                b.classList.add('list-orders-payment-btn--on');
                b.textContent = 'Оплачен';
            } else {
                b.classList.remove('list-orders-payment-btn--on');
                b.textContent = 'Не оплачен';
            }
        });
        
        // Сохраняем на сервере
        savePaymentField(orderId, 'is_paid', newIsPaid);
    }

    /**
     * Обработка изменений в выпадающих списках и инпутах оплаты (тип, счет, способ).
     */
    function handlePaymentFieldChange(event) {
        const target = event.target;
        const orderId = target.dataset.orderId;
        if (!orderId) return;

        const fieldName = target.dataset.field;
        if (fieldName) {
            const fieldValue = target.value;

            // Логика переключения видимости полей при смене типа плательщика
            if (fieldName === 'payer_type') {
                const card = target.closest('.list-orders-card');
                const legalDiv = card.querySelector(`#payment-detail-legal-${orderId}`);
                const individualDiv = card.querySelector(`#payment-detail-individual-${orderId}`);
                const docsDiv = card.querySelector(`#payment-detail-docs-${orderId}`); // <-- НОВОЕ
                
                if (legalDiv) legalDiv.classList.toggle('hidden', fieldValue !== 'legal');
                if (individualDiv) individualDiv.classList.toggle('hidden', fieldValue !== 'individual');
                if (docsDiv) docsDiv.classList.toggle('hidden', fieldValue === ''); // Показываем, если выбран хоть какой-то тип
            }

            savePaymentField(orderId, fieldName, fieldValue);
        }
    }

    /**
     * Сохраняет поле оплаты на сервере.
     */
    function savePaymentField(orderId, fieldName, fieldValue) {
        const fd = new FormData();
        fd.append('field_name', fieldName);
        fd.append('field_value', fieldValue);

        fetch('/orders/api/order/' + orderId + '/update-field/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                showNotification(data.error || 'Ошибка сохранения', 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showNotification('Ошибка сети при сохранении', 'error');
        });
    }

    /**
     * Сохраняет поле оплаты на сервере (через существующий API обновления поля).
     */
    function savePaymentField(orderId, fieldName, fieldValue) {
        const fd = new FormData();
        fd.append('field_name', fieldName);
        fd.append('field_value', fieldValue);

        fetch('/orders/api/order/' + orderId + '/update-field/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                showNotification(data.error || 'Ошибка сохранения', 'error');
                // Если ошибка — можно было бы откатить UI, но для простоты 
                // просто показываем уведомление.
            }
        })
        .catch(err => {
            console.error(err);
            showNotification('Ошибка сети при сохранении', 'error');
        });
    }

    // ========================================================================
    // 13. БЛОК ДОСТАВКИ
    // ========================================================================

    function handleDeliveryToggleDblClick(event) {
        const btn = event.target.closest('.list-orders-delivery-btn');
        if (!btn) return;
        
        event.stopPropagation(); // Чтобы не сворачивалась карточка
        const orderId = btn.dataset.orderId;
        if (!orderId) return;

        const card = btn.closest('.list-orders-card');
        const details = card.querySelector(`#delivery-details-${orderId}`);
        
        // Находим карточку и ВСЕ кнопки доставки внутри неё (свёрнутую и раскрытую)
        const allDeliveryBtns = card.querySelectorAll('.list-orders-delivery-btn');

        // Определяем текущее состояние по первой попавшейся кнопке
        let currentState = 'none';
        if (allDeliveryBtns[0].classList.contains('list-orders-delivery-btn--delivered')) {
            currentState = 'delivered';
        } else if (allDeliveryBtns[0].classList.contains('list-orders-delivery-btn--pending')) {
            currentState = 'pending';
        }

        // Определяем следующее состояние (циклично)
        let nextState = 'pending';
        if (currentState === 'none') nextState = 'pending';
        else if (currentState === 'pending') nextState = 'delivered';
        else if (currentState === 'delivered') nextState = 'none';

        // Обновляем ВСЕ кнопки разом
        allDeliveryBtns.forEach(function(b) {
            // Очищаем старые классы
            b.classList.remove('list-orders-delivery-btn--pending', 'list-orders-delivery-btn--delivered');
            
            // Проверяем, является ли эта кнопка компактной (в свёрнутой строке)
            const isCompact = b.classList.contains('list-orders-delivery-btn--compact');

            if (nextState === 'none') {
                b.textContent = 'Без доставки';
                if (isCompact) b.style.display = 'none'; // Прячем компактную кнопку
            } else if (nextState === 'pending') {
                b.textContent = 'Доставка';
                b.classList.add('list-orders-delivery-btn--pending');
                if (isCompact) b.style.display = ''; // Показываем компактную кнопку
            } else if (nextState === 'delivered') {
                b.textContent = 'Доставлено';
                b.classList.add('list-orders-delivery-btn--delivered');
                if (isCompact) b.style.display = ''; // Показываем компактную кнопку
            }
        });
        
        // Показываем/скрываем детали доставки в раскрытом виде
        if (nextState === 'none') {
            if (details) details.classList.add('hidden');
            savePaymentField(orderId, 'is_delivery', 'false');
        } else {
            if (details) details.classList.remove('hidden');
            savePaymentField(orderId, 'is_delivery', 'true');
            
            if (nextState === 'pending') {
                savePaymentField(orderId, 'delivery_status', 'pending');
            } else if (nextState === 'delivered') {
                savePaymentField(orderId, 'delivery_status', 'delivered');
            }
        }
    }



    function handleDeliveryFieldChange(event) {
        const target = event.target;
        if (!target.classList.contains('list-orders-delivery-input')) return;

        const orderId = target.dataset.orderId;
        const fieldName = target.dataset.field;
        const fieldValue = target.value;

        if (orderId && fieldName) {
            savePaymentField(orderId, fieldName, fieldValue);
        }
    }
    /**
     * Автоматическое форматирование номера телефона.
     * (Копия логики из baza_klientov/contacts.js для единообразия)
     */
    function formatPhoneNumber(value) {
        if (value === '+7' || value === '+7 (' || value === '+7 ( ') {
            return '';
        }

        let digits = value.replace(/\D/g, '');
        if (!digits) return '';

        if (digits.startsWith('8')) {
            digits = '7' + digits.slice(1);
        } else if (!digits.startsWith('7') && digits.length <= 10) {
            digits = '7' + digits;
        }

        if (digits.length > 11) {
            digits = digits.slice(0, 11);
        }

        let formatted = '+7';
        if (digits.length > 1) {
            formatted += ' (' + digits.slice(1, 4);
        } else {
            formatted += ' (';
        }

        if (digits.length >= 5) {
            formatted += ') ' + digits.slice(4, 7);
        }
        if (digits.length >= 8) {
            formatted += '-' + digits.slice(7, 9);
        }
        if (digits.length >= 10) {
            formatted += '-' + digits.slice(9, 11);
        }
        
        return formatted;
    }


    // ========================================================================
    // 14. ЮРЛИЦА И СОТРУДНИКИ (СЕЛЕКТЫ)
    // ========================================================================

    function initClientSelects() {
        // Находим все селекты на странице
        const leSelects = document.querySelectorAll('.list-orders-le-select');
        const cpSelects = document.querySelectorAll('.list-orders-cp-select');

        // Собираем уникальные ID клиентов, чтобы не делать лишние запросы
        const clientIds = new Set();
        leSelects.forEach(sel => { if (sel.dataset.clientId) clientIds.add(sel.dataset.clientId); });

        // Для каждого клиента делаем один запрос и заполняем его селекты
        clientIds.forEach(clientId => {
            fetch('/orders/api/client-details/' + clientId + '/')
                .then(r => r.json())
                .then(data => {
                    if (!data.success) return;
                    
                    // Заполняем все селекты юрлиц для этого клиента
                    document.querySelectorAll(`.list-orders-le-select[data-client-id="${clientId}"]`).forEach(sel => {
                        populateSelect(sel, data.legal_entities, '— Юрлицо —');
                    });

                    // Заполняем все селекты сотрудников для этого клиента
                    document.querySelectorAll(`.list-orders-cp-select[data-client-id="${clientId}"]`).forEach(sel => {
                        populateSelect(sel, data.contact_persons, '— Сотрудник —');
                    });
                })
                .catch(err => console.error('Ошибка загрузки данных клиента:', err));
        });
    }

    function populateSelect(selectEl, items, defaultText) {
        const currentId = selectEl.dataset.currentId;
        const orderId = selectEl.dataset.orderId;
        const fieldName = selectEl.dataset.field;

        let html = `<option value="">${defaultText}</option>`;
        
        let primaryId = null;
        items.forEach(item => {
            // Сохраняем телефон в data-атрибут опции (если он есть)
            const phoneAttr = item.phone ? ` data-phone="${item.phone}"` : '';
            html += `<option value="${item.id}" ${String(item.id) === String(currentId) ? 'selected' : ''}${phoneAttr}>${item.name}</option>`;
            if (item.is_primary) primaryId = item.id;
        });
        
        selectEl.innerHTML = html;

        // Если в заказе ничего не выбрано, но есть основной — выбираем его и сохраняем
        if (!currentId && primaryId) {
            selectEl.value = primaryId;
            selectEl.dataset.currentId = primaryId;
            
            // Тихо сохраняем на сервер
            const fd = new FormData();
            fd.append('field_name', fieldName);
            fd.append('field_value', primaryId);
            fetch('/orders/api/order/' + orderId + '/update-field/', {
                method: 'POST',
                body: fd,
                headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': getCsrfToken() }
            });

            // Если это сотрудник, подтягиваем его телефон в поле доставки
            if (fieldName === 'contact_person') {
                const selectedOption = selectEl.options[selectEl.selectedIndex];
                const phone = selectedOption.dataset.phone || '';
                const card = selectEl.closest('.list-orders-card');
                
                if (card && phone) {
                    const phoneInput = card.querySelector('.list-orders-delivery-phone');
                    if (phoneInput) {
                        phoneInput.value = phone;
                        savePaymentField(orderId, 'delivery_phone', phone);
                    }
                }
            }
        }
    }

    function handleClientSelectChange(event) {
        const target = event.target;
        if (target.classList.contains('list-orders-le-select') || target.classList.contains('list-orders-cp-select')) {
            const orderId = target.dataset.orderId;
            const fieldName = target.dataset.field;
            const fieldValue = target.value;
            
            target.dataset.currentId = fieldValue; // Обновляем локально

            // Если сменили сотрудника — обновляем телефон доставки
            if (fieldName === 'contact_person') {
                const card = target.closest('.list-orders-card');
                const selectedOption = target.options[target.selectedIndex];
                const phone = selectedOption.dataset.phone || '';
                
                const phoneInput = card.querySelector('.list-orders-delivery-phone');
                if (phoneInput) {
                    phoneInput.value = phone;
                    // Сохраняем новый телефон в базу
                    savePaymentField(orderId, 'delivery_phone', phone);
                }
            }
            
            savePaymentField(orderId, fieldName, fieldValue); // Сохраняем самого сотрудника
        }
    }

    /**
     * Загружает и заполняет списки юрлиц и сотрудников для конкретной карточки заказа.
     * Используется при смене клиента.
     */
    function loadClientSelectsForCard(card, clientId) {
        const leSelect = card.querySelector('.list-orders-le-select');
        const cpSelect = card.querySelector('.list-orders-cp-select');
        
        // Если клиент убран (пустая строка), очищаем селекты
        if (!clientId) {
            if (leSelect) leSelect.innerHTML = '<option value="">— Юрлицо —</option>';
            if (cpSelect) cpSelect.innerHTML = '<option value="">— Сотрудник —</option>';
            return;
        }

        // Обновляем data-атрибуты в селектах
        if (leSelect) leSelect.dataset.clientId = clientId;
        if (cpSelect) cpSelect.dataset.clientId = clientId;

        // Делаем запрос на сервер за новыми данными
        fetch('/orders/api/client-details/' + clientId + '/')
            .then(r => r.json())
            .then(data => {
                if (!data.success) return;
                
                if (leSelect) {
                    leSelect.dataset.currentId = ''; // Сбрасываем старый выбор, чтобы сработал автовыбор "основного"
                    populateSelect(leSelect, data.legal_entities, '— Юрлицо —');
                }
                if (cpSelect) {
                    cpSelect.dataset.currentId = ''; // Сбрасываем старый выбор
                    populateSelect(cpSelect, data.contact_persons, '— Сотрудник —');
                }
            })
            .catch(err => console.error('Ошибка загрузки данных клиента:', err));
    }

    // ========================================================================
    // 15. УМНОЕ РЕДАКТИРОВАНИЕ И КЛОНИРОВАНИЕ ИЗДЕЛИЙ
    // ========================================================================
    // Что здесь:
    //   • Кнопка «Редактировать» на карточке изделия — размораживает
    //     изделие в просчёт и редиректит на /proschety/.
    //   • Контекстное меню (правый клик + долгий тап на мобильных)
    //     с пунктом «Копировать изделие».
    //   • Модалка выбора заказа для копирования.
    //   • POST-запрос на клонирование.
    //
    // Всё — на делегированных обработчиках document, чтобы переживать
    // перерисовку tbody через refreshTable().

    // --- Глобальное состояние контекстного меню ---
    let contextMenuEl = null;         // DOM-элемент меню (создаётся один раз)
    let contextMenuProductId = null;  // ID изделия, к которому привязано меню

    // --- Глобальное состояние модалки клонирования ---
    let cloneModalEl = null;          // Затемняющий оверлей модалки (один раз)
    let pendingCloneProductId = null; // ID изделия, которое копируем
    let cloneOrdersCache = null;      // Кэш списка заказов (загружается один раз)

    // --- Глобальное состояние долгого тапа ---
    let longTapTimer = null;          // Таймер долгого тапа
    let longTapStartX = 0;            // X точки нажатия (для проверки сдвига)
    let longTapStartY = 0;            // Y точки нажатия
    let longTapProductItem = null;    // Карточка изделия, на которой держим палец
    let longTapTriggered = false;     // Сработал ли долгий тап (для подавления клика)

    /**
     * Инициализация всей «умной» функциональности изделий.
     * Вызывается один раз при DOMContentLoaded.
     *
     * Что делает:
     *   1. Создаёт DOM-элементы меню и модалки (программно — так проще,
     *      чем править шаблоны).
     *   2. Навешивает делегированные обработчики.
     *   3. Настраивает долгий тап для тач-устройств.
     */
    function initProductActions() {
        // Создаём меню и модалку (добавляются в body, скрыты по умолчанию).
        createContextMenu();
        createCloneModal();

        // Делегированные обработчики кликов.
        // «Редактировать» — по кнопке-карандашу на карточке изделия.
        document.addEventListener('click', handleProductEditClick);
        // Контекстное меню — правый клик на карточке изделия.
        document.addEventListener('contextmenu', handleProductContextMenu);
        // Клик по пункту контекстного меню.
        document.addEventListener('click', handleContextMenuAction);
        // Клик вне меню — скрыть меню.
        document.addEventListener('click', closeContextMenuOnOutsideClick);
        // Esc — скрыть меню.
        document.addEventListener('keydown', handleContextMenuEscape);

        // Обработчики модалки клонирования.
        const cancelBtn = document.getElementById('list-orders-clone-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', closeCloneModal);

        const confirmBtn = document.getElementById('list-orders-clone-confirm');
        if (confirmBtn) confirmBtn.addEventListener('click', handleCloneConfirm);

        if (cloneModalEl) {
            // Клик по оверлею (не по карточке) — закрыть.
            cloneModalEl.addEventListener('click', function (e) {
                if (e.target === cloneModalEl) closeCloneModal();
            });
        }

        // Долгий тап на тач-устройствах.
        initLongTap();
    }

    /**
     * Создаёт DOM-элемент контекстного меню и добавляет его в body.
     * Меню скрыто по умолчанию (display: none).
     *
     * Содержит два пункта:
     *   • «Копировать изделие» — data-action="copy"
     *   • «Редактировать»      — data-action="edit"
     *
     * Один экземпляр на всю страницу, переиспользуется для всех карточек.
     */
    function createContextMenu() {
        // Не создавать повторно.
        if (contextMenuEl) return;

        // Создаём контейнер меню.
        contextMenuEl = document.createElement('div');
        contextMenuEl.className = 'list-orders-context-menu';
        contextMenuEl.id = 'list-orders-context-menu';
        contextMenuEl.style.display = 'none';

        // Пункт «Копировать изделие».
        // textContent, а не innerHTML — защита от XSS (хотя здесь текст
        // статический, привычка полезна для будущего расширения).
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'list-orders-context-menu-item';
        copyBtn.dataset.action = 'copy';
        copyBtn.textContent = 'Копировать изделие';
        contextMenuEl.appendChild(copyBtn);

        // Пункт «Редактировать».
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'list-orders-context-menu-item';
        editBtn.dataset.action = 'edit';
        editBtn.textContent = 'Редактировать';
        contextMenuEl.appendChild(editBtn);

        // Добавляем в body.
        document.body.appendChild(contextMenuEl);
    }

    /**
     * Создаёт DOM-элемент модалки выбора заказа для копирования.
     * По структуре — как модалка подтверждения удаления (переиспользуем
     * стили .list-orders-confirm-overlay / .list-orders-confirm), но
     * добавлен <select> для выбора заказа.
     */
    function createCloneModal() {
        // Не создавать повторно.
        if (cloneModalEl) return;

        // Оверлей (затемнение).
        cloneModalEl = document.createElement('div');
        cloneModalEl.className = 'list-orders-confirm-overlay';
        cloneModalEl.id = 'list-orders-clone-overlay';
        cloneModalEl.style.display = 'none';

        // Карточка модалки.
        const modal = document.createElement('div');
        // Немного шире обычной (340px → 380px) — под select.
        modal.className = 'list-orders-confirm';
        modal.style.maxWidth = '380px';
        cloneModalEl.appendChild(modal);

        // Заголовок.
        const title = document.createElement('div');
        title.className = 'list-orders-confirm-title';
        title.textContent = 'Скопировать изделие';
        modal.appendChild(title);

        // Пояснительный текст.
        const text = document.createElement('div');
        text.className = 'list-orders-confirm-text';
        text.textContent = 'Выберите заказ, в который скопировать изделие:';
        modal.appendChild(text);

        // Селект заказов.
        const select = document.createElement('select');
        select.className = 'list-orders-clone-select';
        select.id = 'list-orders-clone-select';
        // Опция-заглушка, пока список не загружен.
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '— Загрузка —';
        select.appendChild(placeholder);
        modal.appendChild(select);

        // Кнопки.
        const actions = document.createElement('div');
        actions.className = 'list-orders-confirm-actions';
        actions.style.marginTop = '0.85rem';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'list-orders-confirm-btn list-orders-confirm-btn-no';
        cancelBtn.id = 'list-orders-clone-cancel';
        cancelBtn.textContent = 'Отмена';
        actions.appendChild(cancelBtn);

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        // Переиспользуем зелёную стилизацию кнопки «Удалить» — но здесь
        // это позитивное действие, поэтому добавим класс-модификатор
        // list-orders-confirm-btn--ok (см. CSS).
        confirmBtn.className = 'list-orders-confirm-btn list-orders-confirm-btn-yes list-orders-confirm-btn--ok';
        confirmBtn.id = 'list-orders-clone-confirm';
        confirmBtn.textContent = 'Скопировать';
        actions.appendChild(confirmBtn);

        modal.appendChild(actions);

        // Добавляем в body.
        document.body.appendChild(cloneModalEl);
    }

    // ------------------------------------------------------------------
    // 15.1. Кнопка «Редактировать» на карточке изделия.
    // ------------------------------------------------------------------

    /**
     * Обработчик клика по кнопке «Редактировать» (.list-orders-product-edit-btn).
     *
     * Логика:
     *   1. Найти кнопку, взять product_id из data-product-id.
     *   2. POST /orders/api/unfreeze-product/ с {product_id, return_to}.
     *   3. Получить {proschet_id, return_to}.
     *   4. Редирект на /proschety/?proschet_id=X&edit_product_id=Y&return_to=Z.
     *
     * return_to — текущий путь + query (window.location.pathname + search).
     * Это позволяет вернуть пользователя именно туда, откуда он пришёл
     * (в /orders/ с открытой карточкой или в /orders/45/).
     */
    function handleProductEditClick(event) {
        // Ищем кнопку «Редактировать».
        const btn = event.target.closest('.list-orders-product-edit-btn');
        if (!btn) return;

        // Останавливаем всплытие — клик не должен сворачивать карточку
        // или открывать контекстное меню.
        event.stopPropagation();

        const productId = btn.dataset.productId;
        if (!productId) return;

        // Сохраняем исходный текст — на случай ошибки.
        const originalText = btn.textContent;

        // Блокируем кнопку от повторного клика.
        btn.disabled = true;
        btn.textContent = '…';

        // Определяем, куда вернуться после сохранения.
        // На странице /orders/ ID заказа берём из DOM (карточки заказа,
        // в которой лежит изделие). Это нужно, чтобы:
        //   • после сохранения пользователь вернулся в /orders/
        //     с автораскрытием нужной карточки (?expanded_order=NN);
        //   • плашка на /proschety/ смогла показать номер заказа
        //     («Вы редактируете изделие из заказа ORD-45»).
        // Для страницы /orders/<id>/ (карточка заказа) этот код не
        // исполняется — там работает detail.js, где ID уже в пути.
        const currentOrderId = getCurrentOrderIdFromDOM(productId);
        const returnTo = currentOrderId
            ? '/orders/?expanded_order=' + currentOrderId
            : (window.location.pathname + window.location.search);

        // Отправляем запрос на разморозку.
        fetch('/orders/api/unfreeze-product/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                product_id: productId,
                return_to: returnTo
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                // Собираем URL страницы /proschety/.
                // encodeURIComponent — чтобы ? и = в return_to не сломали URL.
                const url = '/proschety/?proschet_id=' + encodeURIComponent(data.proschet_id) +
                            '&edit_product_id=' + encodeURIComponent(productId) +
                            '&return_to=' + encodeURIComponent(data.return_to);
                window.location.href = url;
            } else {
                // Ошибка от сервера — разблокируем кнопку и показываем тост.
                btn.disabled = false;
                btn.textContent = originalText;
                showNotification(data.error || 'Ошибка редактирования', 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            btn.disabled = false;
            btn.textContent = originalText;
            showNotification('Ошибка сети при редактировании', 'error');
        });
    }

    // ------------------------------------------------------------------
    // 15.2. Контекстное меню (правый клик + долгий тап).
    // ------------------------------------------------------------------

    /**
     * Обработчик правого клика на карточке изделия.
     *
     * Находим ближайший .list-orders-product-item, берём product_id
     * из data-product-id. Показываем меню в точке курсора.
     */
    function handleProductContextMenu(event) {
        const productItem = event.target.closest('.list-orders-product-item');
        if (!productItem) return;

        // Предотвращаем стандартное меню браузера.
        event.preventDefault();
        event.stopPropagation();

        const productId = productItem.dataset.productId;
        if (!productId) return;

        // Запоминаем, к какому изделию привязано меню.
        contextMenuProductId = productId;

        // Показываем меню в точке курсора.
        showContextMenuAt(event.clientX, event.clientY);
    }

    /**
     * Показывает контекстное меню в указанных координатах.
     * Координаты корректируются, чтобы меню не выходило за пределы экрана.
     */
    function showContextMenuAt(x, y) {
        if (!contextMenuEl) return;

        // Сначала показываем, чтобы браузер посчитал размеры.
        contextMenuEl.style.display = 'block';
        contextMenuEl.style.left = x + 'px';
        contextMenuEl.style.top  = y + 'px';

        // Замеряем размеры меню.
        const rect = contextMenuEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Если меню выходит за правый край — сдвигаем влево.
        if (rect.right > vw - 8) {
            contextMenuEl.style.left = (x - rect.width) + 'px';
        }
        // Если выходит за нижний край — сдвигаем вверх.
        if (rect.bottom > vh - 8) {
            contextMenuEl.style.top = (y - rect.height) + 'px';
        }
    }

    /**
     * Скрывает контекстное меню и сбрасывает привязку к изделию.
     */
    function hideContextMenu() {
        if (!contextMenuEl) return;
        contextMenuEl.style.display = 'none';
        contextMenuProductId = null;
    }

    /**
     * Клик по пункту контекстного меню.
     * В зависимости от data-action выполняем действие.
     */
    function handleContextMenuAction(event) {
        const item = event.target.closest('.list-orders-context-menu-item');
        if (!item) return;
        // Клик по пункту — не считаем как «клик вне меню».
        event.stopPropagation();

        const action = item.dataset.action;
        const productId = contextMenuProductId;

        // Меню больше не нужно — сразу скрываем.
        hideContextMenu();

        if (!productId) return;

        if (action === 'copy') {
            openCloneModal(productId);
        } else if (action === 'edit') {
            // Эмулируем клик по кнопке «Редактировать» —
            // но проще вызвать функцию напрямую, передав фейковый
            // target. Сделаем через прямой запрос (как в
            // handleProductEditClick), чтобы не плодить кнопок.
            unfreezeProductAndRedirect(productId);
        }
    }

    /**
     * Скрывает меню при клике вне него.
     * Вызывается на каждый клик по документу — очень дёшево.
     */
    function closeContextMenuOnOutsideClick(event) {
        if (!contextMenuEl) return;
        if (contextMenuEl.style.display === 'none') return;
        // Клик по самому меню (или его пунктам) — не закрываем.
        // Пункты обрабатываются в handleContextMenuAction (там hide).
        if (event.target.closest('#list-orders-context-menu')) return;
        hideContextMenu();
    }

    /**
     * Скрывает меню по Escape.
     */
    function handleContextMenuEscape(event) {
        if (event.key !== 'Escape') return;
        hideContextMenu();
    }

    /**
     * Программная разморозка изделия и редирект (для пункта «Редактировать»
     * в контекстном меню). Дублирует логику handleProductEditClick,
     * но без привязки к DOM-кнопке.
     */
    function unfreezeProductAndRedirect(productId) {
        // См. комментарий в handleProductEditClick — та же логика:
        // ID заказа берём из DOM, чтобы после сохранения вернуться
        // в /orders/?expanded_order=NN и показать номер в плашке.
        const currentOrderId = getCurrentOrderIdFromDOM(productId);
        const returnTo = currentOrderId
            ? '/orders/?expanded_order=' + currentOrderId
            : (window.location.pathname + window.location.search);

        fetch('/orders/api/unfreeze-product/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                product_id: productId,
                return_to: returnTo
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                const url = '/proschety/?proschet_id=' + encodeURIComponent(data.proschet_id) +
                            '&edit_product_id=' + encodeURIComponent(productId) +
                            '&return_to=' + encodeURIComponent(data.return_to);
                window.location.href = url;
            } else {
                showNotification(data.error || 'Ошибка редактирования', 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при редактировании', 'error');
        });
    }

    // ------------------------------------------------------------------
    // 15.3. Долгий тап (мобильные).
    // ------------------------------------------------------------------

    /**
     * Настраивает долгий тап на карточках изделий.
     *
     * Логика:
     *   • touchstart на .list-orders-product-item → запускаем таймер на 600 мс;
     *   • touchmove (сдвиг >10px) → отменяем таймер (это скролл, не тап);
     *   • по истечении 600 мс → показываем контекстное меню в точке нажатия,
     *     запоминаем, что «долгий тап сработал» (чтобы touchend не вызвал клик);
     *   • touchend → если таймер ещё жив, отменяем; если сработал долгий
     *     тап — preventDefault.
     */
    function initLongTap() {
        // Начало тапа.
        document.addEventListener('touchstart', function (e) {
            const productItem = e.target.closest('.list-orders-product-item');
            if (!productItem) return;
            if (e.touches.length !== 1) return; // мультитач игнорируем

            const productId = productItem.dataset.productId;
            if (!productId) return;

            // Запоминаем точку и контекст.
            longTapStartX = e.touches[0].clientX;
            longTapStartY = e.touches[0].clientY;
            longTapProductItem = productItem;
            longTapTriggered = false;

            // Запускаем таймер.
            longTapTimer = setTimeout(function () {
                longTapTimer = null;
                longTapTriggered = true;

                // Показываем меню.
                contextMenuProductId = productId;
                showContextMenuAt(longTapStartX, longTapStartY);
            }, 600);
        }, { passive: true });

        // Движение пальца — если сдвиг большой, отменяем тап.
        document.addEventListener('touchmove', function (e) {
            if (!longTapTimer) return;
            if (e.touches.length !== 1) return;

            const dx = Math.abs(e.touches[0].clientX - longTapStartX);
            const dy = Math.abs(e.touches[0].clientY - longTapStartY);
            if (dx > 10 || dy > 10) {
                clearTimeout(longTapTimer);
                longTapTimer = null;
            }
        }, { passive: true });

        // Отпускание пальца.
        document.addEventListener('touchend', function (e) {
            // Если таймер ещё жив — отменяем (тап был короткий).
            if (longTapTimer) {
                clearTimeout(longTapTimer);
                longTapTimer = null;
            }
            // Если сработал долгий тап — подавляем обычный клик.
            if (longTapTriggered) {
                e.preventDefault();
                longTapTriggered = false;
            }
            longTapProductItem = null;
        });
    }

    // ------------------------------------------------------------------
    // 15.4. Модалка клонирования.
    // ------------------------------------------------------------------

    /**
     * Открывает модалку копирования для указанного изделия.
     * Загружает список заказов (из кэша или с сервера), заполняет select.
     */
    function openCloneModal(productId) {
        if (!cloneModalEl) return;

        pendingCloneProductId = productId;
        cloneModalEl.style.display = 'flex';

        // Загружаем список заказов (с кэшем).
        loadOrdersForClone().then(function (orders) {
            const select = document.getElementById('list-orders-clone-select');
            if (!select) return;

            // Очищаем.
            select.innerHTML = '';

            // Опция-заглушка на случай, если заказов нет.
            // Но заказ хотя бы один есть — тот, в котором мы находимся.
            if (!orders || orders.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = '— Нет активных заказов —';
                select.appendChild(opt);
                return;
            }

            // Запоминаем ID текущего заказа (тот, в котором карточка)
            // — чтобы поставить его первым и подписать «(этот заказ)».
            const currentOrderId = getCurrentOrderIdFromDOM(pendingCloneProductId);

            // Сортируем: текущий заказ — первым.
            const sorted = orders.slice().sort(function (a, b) {
                if (String(a.id) === String(currentOrderId)) return -1;
                if (String(b.id) === String(currentOrderId)) return 1;
                return 0;
            });

            // Заполняем select.
            sorted.forEach(function (o) {
                const opt = document.createElement('option');
                opt.value = String(o.id);
                const isCurrent = String(o.id) === String(currentOrderId);
                opt.textContent = o.number + ' — ' + (o.client_name || 'без клиента') +
                                  (isCurrent ? ' (этот заказ)' : '');
                // Текущий заказ — выбран по умолчанию.
                if (isCurrent) opt.selected = true;
                select.appendChild(opt);
            });
        }).catch(function (err) {
            console.error(err);
            showNotification('Не удалось загрузить заказы', 'error');
        });
    }

    /**
     * Возвращает ID заказа, в котором находится изделие (по DOM).
     * Нужно, чтобы в модалке клонирования подсветить текущий заказ.
     *
     * Ищем карточку заказа, в которой лежит .list-orders-product-item
     * с указанным product_id, и читаем data-order-id.
     */
    function getCurrentOrderIdFromDOM(productId) {
        // Ищем все карточки изделий с нужным product_id.
        const items = document.querySelectorAll(
            '.list-orders-product-item[data-product-id="' + productId + '"]'
        );
        for (let i = 0; i < items.length; i++) {
            const card = items[i].closest('.list-orders-card');
            if (card && card.dataset.orderId) {
                return card.dataset.orderId;
            }
        }
        return null;
    }

    /**
     * Загружает список активных заказов. Кэширует результат.
     * Возвращает Promise<Array>.
     */
    function loadOrdersForClone() {
        // Если в кэше есть — возвращаем его.
        if (cloneOrdersCache) {
            return Promise.resolve(cloneOrdersCache);
        }

        return fetch('/orders/api/all-orders/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success && Array.isArray(data.orders)) {
                cloneOrdersCache = data.orders;
                return data.orders;
            }
            return [];
        });
    }

    /**
     * Сбрасывает кэш списка заказов.
     * Вызывается после создания/удаления заказа (через refreshTable),
     * чтобы при следующем копировании был свежий список.
     */
    function resetCloneOrdersCache() {
        cloneOrdersCache = null;
    }

    /**
     * Закрывает модалку копирования.
     */
    function closeCloneModal() {
        if (!cloneModalEl) return;
        cloneModalEl.style.display = 'none';
        pendingCloneProductId = null;

        // Сбрасываем состояние кнопки — на случай, если она была disabled.
        const confirmBtn = document.getElementById('list-orders-clone-confirm');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Скопировать';
        }
    }

    /**
     * Обработчик кнопки «Скопировать» в модалке.
     * Отправляет POST /orders/api/clone-product/ с {product_id, target_order_id}.
     */
    function handleCloneConfirm() {
        if (!pendingCloneProductId) return;

        const select = document.getElementById('list-orders-clone-select');
        if (!select) return;
        const targetOrderId = select.value;
        if (!targetOrderId) {
            showNotification('Выберите заказ', 'warning');
            return;
        }

        const confirmBtn = document.getElementById('list-orders-clone-confirm');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Копирование…';
        }

        fetch('/orders/api/clone-product/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                product_id: pendingCloneProductId,
                target_order_id: targetOrderId
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                // Если цена клона отличается от цены оригинала —
                // показываем разницу. Это бывает в двух случаях:
                //   • копирование в заказ другого клиента (разные скидки);
                //   • пересчёт цен по актуальным справочникам
                //     (изменились прайсы принтеров, бумаги и т.п.).
                // Если цены равны — просто «Изделие скопировано».
                if (data.price_changed) {
                    const oldP = parseFloat(data.old_price).toFixed(2);
                    const newP = parseFloat(data.new_price).toFixed(2);
                    showNotification(
                        'Скопировано в ' + data.order_number +
                        '. Цена изменилась: было ' + oldP +
                        ' ₽, стало ' + newP + ' ₽',
                        'success'
                    );
                } else {
                    showNotification('Изделие скопировано в ' + data.order_number, 'success');
                }
                closeCloneModal();
                // Сбрасываем кэш — список заказов мог измениться
                // (например, добавилось изделие в другой заказ, поменялись
                // products_count, total_price).
                resetCloneOrdersCache();
                return refreshTable();
            } else {
                showNotification(data.error || 'Ошибка копирования', 'error');
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Скопировать';
                }
            }
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при копировании', 'error');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Скопировать';
            }
        });
    }

})();