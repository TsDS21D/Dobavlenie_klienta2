/*
index.js
JavaScript для главной страницы системы управления заказами типографии.
Содержит логику работы с WebSocket, управление DOM, обработку событий.

ВНЕСЁННЫЕ ИЗМЕНЕНИЯ:
1. Группировка активных заказов по статусам (в работе, принят, готов).
2. Фоновая окраска каждого статуса (через CSS).
3. Для заказов со статусом "готов" скрыто отображение часов до дедлайна.
4. Пагинация выполненных заказов: показываются последние 10, кнопка "Далее" подгружает следующие 10.
5. ИСПРАВЛЕНО: добавлено определение `completedOrdersList`, вызывавшее ошибку.

ДОБАВЛЕНЫ ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОКЕ ДЛЯ НАЧИНАЮЩИХ РАЗРАБОТЧИКОВ.
*/

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====

// --- DOM элементы ---
// Получаем ссылки на элементы формы и списков для дальнейшей работы с ними
const clientSelect = document.getElementById('client-select');          // выпадающий список клиентов
const addClientBtn = document.getElementById('add-client-btn');      // кнопка "Добавить клиента"
const descriptionInput = document.getElementById('description');     // поле ввода описания заказа
const readyDatetimeInput = document.getElementById('ready-datetime');// поле выбора даты/времени готовности
const submitBtn = document.getElementById('submit-btn');            // кнопка "Добавить заказ"
const clearBtn = document.getElementById('clear-btn');              // кнопка "Очистить"

// Списки активных заказов (группировка по статусам) — элементы <ul> для каждой группы
const inProgressOrdersList = document.getElementById('in-progress-orders-list'); // заказы в работе
const acceptedOrdersList = document.getElementById('accepted-orders-list');     // принятые заказы
const readyOrdersList = document.getElementById('ready-orders-list');           // готовые заказы

// ИСПРАВЛЕНО: список выполненных заказов (ранее отсутствовал, вызывал ошибку)
const completedOrdersList = document.getElementById('completed-orders-list');   // выполненные заказы

// Элемент статуса подключения WebSocket
const statusElement = document.getElementById('status');

// [НОВОЕ] Кнопка прокрутки к форме добавления заказа
const scrollToAddBtn = document.getElementById('scroll-to-add-btn');

// Модальные окна
const editModal = document.getElementById('editModal');               // модалка редактирования заказа
const editDescriptionInput = document.getElementById('edit-description'); // поле описания в модалке
const editReadyDatetimeInput = document.getElementById('edit-ready-datetime'); // поле даты в модалке
const saveEditBtn = document.getElementById('save-edit-btn');        // кнопка сохранения изменений
const cancelEditBtn = document.getElementById('cancel-edit-btn');    // кнопка отмены редактирования

const addClientModal = document.getElementById('addClientModal');     // модалка добавления клиента
const saveClientBtn = document.getElementById('save-client-btn');     // кнопка сохранения клиента
const cancelClientBtn = document.getElementById('cancel-client-btn'); // кнопка отмены добавления

// WebSocket
// Определяем протокол: wss для HTTPS, ws для HTTP
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
// Формируем полный URL для WebSocket-соединения (эндпоинт /ws/order/)
const wsUrl = `${protocol}//${window.location.host}/ws/order/`;

let socket;                     // объект WebSocket
let reconnectInterval;          // идентификатор интервала переподключения

// --- Данные приложения ---
let editingOrderNumber = null;  // номер заказа, который сейчас редактируется
let currentActiveOrders = [];   // массив активных заказов (полученных с сервера)
let currentCompletedOrders = [];// массив выполненных заказов
let currentClients = [];        // массив клиентов

// --- Сортировка ---
let sortBy = 'deadline';        // текущее поле сортировки ('deadline' или 'number')
let sortDirection = 1;         // направление: 1 = по возрастанию, -1 = по убыванию

// --- Пагинация выполненных заказов ---
let completedDisplayLimit = 10; // сколько выполненных заказов показывать сейчас
let totalCompletedOrders = 0;   // общее количество выполненных заказов (для проверки наличия)
const loadMoreBtn = document.getElementById('load-more-completed-btn'); // кнопка "Далее"

// ===== WEB SOCKET ФУНКЦИИ =====
/**
 * Устанавливает WebSocket-соединение с сервером.
 * При успехе: обновляет статус, запускает обмен данными.
 * При ошибке: пытается переподключаться каждые 3 секунды.
 */
function connect() {
    console.log('Попытка подключения к WebSocket:', wsUrl);
    socket = new WebSocket(wsUrl); // создаём новый WebSocket

    // Обработчик открытия соединения
    socket.onopen = function(e) {
        console.log('✅ WebSocket подключен успешно');
        statusElement.textContent = '✅ Подключено';          // меняем текст статуса
        statusElement.className = 'status connected';        // меняем класс для цвета
        if (reconnectInterval) {                             // если был интервал переподключения
            clearInterval(reconnectInterval);               // очищаем его
            reconnectInterval = null;
        }
    };

    // Обработчик получения сообщения от сервера
    socket.onmessage = function(event) {
        console.log('Получено сообщение от сервера:', event.data);
        const data = JSON.parse(event.data);                // парсим JSON-строку

        // Если пришли данные с типом 'initial_load' или 'order_update'
        if (data.type === 'initial_load' || data.type === 'order_update') {
            updateOrdersLists(data.active_orders, data.completed_orders); // обновляем списки заказов
            if (data.clients) {
                updateClientsList(data.clients);            // обновляем список клиентов
            }
        }
        // Если пришло обновление клиентов
        if (data.type === 'clients_update') {
            updateClientsList(data.clients);
        }
        // Если сервер вернул ошибку
        if (data.type === 'error') {
            alert(`❌ Ошибка: ${data.message}`);            // показываем сообщение об ошибке
        }
    };

    // Обработчик закрытия соединения
    socket.onclose = function(event) {
        console.log('❌ WebSocket соединение закрыто');
        statusElement.textContent = '⏳ Переподключение...'; // меняем статус
        statusElement.className = 'status disconnected';     // меняем класс на "отключено"
        if (!reconnectInterval) {                            // если ещё не запущен интервал переподключения
            reconnectInterval = setInterval(() => {          // запускаем попытки каждые 3 сек
                console.log('Попытка переподключения...');
                connect();                                  // рекурсивный вызов connect
            }, 3000);
        }
    };

    // Обработчик ошибок WebSocket
    socket.onerror = function(error) {
        console.error('❌ Ошибка WebSocket:', error);
    };
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С КЛИЕНТАМИ =====
/**
 * Обновляет выпадающий список клиентов.
 * @param {Array} clients - массив объектов клиентов с сервера
 */
function updateClientsList(clients) {
    console.log('Обновление списка клиентов:', clients);
    currentClients = clients;                               // сохраняем в глобальную переменную
    const selectedValue = clientSelect.value;              // запоминаем выбранное значение (если есть)
    clientSelect.innerHTML = '<option value="">-- Выберите клиента --</option>'; // очищаем список
    clients.forEach(client => {                            // перебираем всех клиентов
        const option = document.createElement('option');   // создаём элемент <option>
        option.value = client.id;                          // устанавливаем значение = ID клиента
        // Текст опции: название + [ЭДО] если включено
        option.textContent = `${client.name}${client.uses_edo ? ' [ЭДО]' : ''}`;
        // Сохраняем дополнительные данные в data-атрибутах
        option.dataset.phone = client.phone;              // телефон
        option.dataset.email = client.email;              // email
        option.dataset.usesEdo = client.uses_edo;        // флаг ЭДО
        clientSelect.appendChild(option);                // добавляем опцию в select
    });
    if (selectedValue) clientSelect.value = selectedValue; // восстанавливаем выбранное значение
}

/**
 * Открывает модальное окно для добавления нового клиента.
 * Очищает все поля перед открытием.
 */
function openAddClientModal() {
    document.getElementById('new-client-name').value = '';   // очищаем название
    document.getElementById('new-client-phone').value = '';  // очищаем телефон
    document.getElementById('new-client-email').value = '';  // очищаем email
    document.getElementById('new-client-edo').checked = false; // снимаем галочку ЭДО
    document.getElementById('new-client-notes').value = '';   // очищаем заметки
    addClientModal.classList.add('show');                    // показываем модалку (добавляем класс show)
}

/**
 * Закрывает модальное окно добавления клиента.
 */
function closeAddClientModal() {
    addClientModal.classList.remove('show');                 // убираем класс show -> скрываем
}

/**
 * Отправляет данные нового клиента на сервер через WebSocket.
 * Валидирует обязательное поле "Название".
 */
function saveNewClient() {
    const name = document.getElementById('new-client-name').value.trim();    // получаем название
    const phone = document.getElementById('new-client-phone').value.trim(); // телефон
    const email = document.getElementById('new-client-email').value.trim(); // email
    const usesEdo = document.getElementById('new-client-edo').checked;      // ЭДО (true/false)
    const notes = document.getElementById('new-client-notes').value.trim(); // заметки
    if (!name) {                                                           // если имя не заполнено
        alert('⚠️ Пожалуйста, введите название клиента!');
        return;
    }
    if (socket.readyState !== WebSocket.OPEN) {                           // проверяем соединение
        alert('❌ Нет соединения с сервером.');
        return;
    }
    // Отправляем JSON с действием 'add_client' и данными клиента
    socket.send(JSON.stringify({
        action: 'add_client',
        client_data: {
            name: name,
            phone: phone,
            email: email,
            uses_edo: usesEdo,
            notes: notes
        }
    }));
    closeAddClientModal();                                                 // закрываем модалку
    alert(`✅ Клиент "${name}" добавлен в базу данных!`);                 // уведомление пользователя
}

/**
 * Возвращает объект выбранного в данный момент клиента.
 * @returns {Object|null} объект с id, name, phone, email, uses_edo или null, если клиент не выбран
 */
function getSelectedClient() {
    const selectedOption = clientSelect.options[clientSelect.selectedIndex]; // выбранная опция
    if (clientSelect.value) {                                                // если есть значение
        return {
            id: clientSelect.value,
            name: selectedOption.textContent.replace(' [ЭДО]', ''),         // убираем суффикс ЭДО
            phone: selectedOption.dataset.phone,
            email: selectedOption.dataset.email,
            uses_edo: selectedOption.dataset.usesEdo === 'true'            // преобразуем строку в boolean
        };
    }
    return null;                                                            // ничего не выбрано
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ЗАКАЗАМИ =====

/**
 * Определяет CSS-класс для блока с часами в зависимости от количества оставшихся часов.
 * @param {number} hours - количество рабочих часов до дедлайна
 * @returns {string} имя класса ('order-hours', 'order-hours warning', 'order-hours critical')
 */
function getHoursClassName(hours) {
    if (hours <= 1) return 'order-hours critical';     // <=1 час — критично (красный)
    if (hours <= 3) return 'order-hours warning';      // <=3 часов — предупреждение (оранжевый)
    return 'order-hours';                             // норма (зелёный)
}

/**
 * Определяет CSS-класс для бейджа часов в компактном виде.
 * @param {number} hours 
 * @returns {string} 'critical', 'warning' или 'normal'
 */
function getHoursBadgeClass(hours) {
    if (hours <= 1) return 'critical';
    if (hours <= 3) return 'warning';
    return 'normal';
}

/**
 * Обрезает текст до указанного количества слов и добавляет многоточие.
 * @param {string} text - исходный текст
 * @param {number} wordCount - максимальное количество слов
 * @returns {string} сокращённый текст
 */
function truncateWords(text, wordCount = 5) {
    const words = text.trim().split(/\s+/);            // разбиваем по пробелам
    if (words.length <= wordCount) return text;        // если слов меньше лимита, возвращаем как есть
    return words.slice(0, wordCount).join(' ') + '...'; // берём первые wordCount слов и добавляем ...
}

/**
 * Создаёт DOM-элемент компактного отображения заказа (карточка).
 * @param {Object} order - объект заказа
 * @param {boolean} isReady - true, если статус "готов" (скрываем часы)
 * @returns {HTMLDivElement} элемент .order-compact
 */
function createCompactView(order, isReady = false) {
    const compactView = document.createElement('div');
    compactView.className = `order-compact status-${order.status}`; // класс с динамическим статусом
    compactView.dataset.orderNumber = order.order_number;          // сохраняем номер заказа в data-атрибут

    let hoursHtml = '';                                           // HTML для блока часов
    if (!isReady) {                                              // если статус не "готов"
        const hours = order.working_hours_remaining;             // оставшиеся часы
        const hoursBadgeClass = getHoursBadgeClass(hours);       // класс для бейджа
        hoursHtml = `<div class="hours-badge ${hoursBadgeClass}">⏱️ ${hours}ч</div>`;
    }

    // Заполняем внутреннюю структуру
    compactView.innerHTML = `
        <div class="compact-number">№${order.order_number}</div>
        <div class="compact-client">
            ${order.client_display}
            ${order.client && order.client.uses_edo ? '<span class="edo-badge">ЭДО</span>' : ''}
        </div>
        <div class="compact-description" title="${order.description}">
            ${truncateWords(order.description, 5)}
        </div>
        <div class="compact-status ${order.status}" title="${order.status_display}">
            ${order.status_display}
        </div>
        <div class="compact-hours">
            ${hoursHtml}
        </div>
    `;
    return compactView;
}

/**
 * Создаёт DOM-элемент полного (развёрнутого) отображения заказа.
 * @param {Object} order - объект заказа
 * @param {boolean} isReady - true для статуса "готов" (скрываем часы)
 * @param {boolean} isCompleted - true для выполненных заказов (особое оформление)
 * @returns {HTMLDivElement} элемент .order-full
 */
function createFullView(order, isReady = false, isCompleted = false) {
    const fullView = document.createElement('div');
    fullView.className = `order-full status-${order.status}`;     // класс с динамическим статусом
    fullView.id = isCompleted ? `details-completed-${order.order_number}` : `details-${order.order_number}`;



    // Блок информации о клиенте (только для активных заказов)
    if (!isCompleted && order.client) {
        fullView.innerHTML += `
            <div class="client-info">
                <div class="client-info-item">
                    <span class="client-info-label">👤 Клиент:</span>
                    <span class="client-info-value">
                        ${order.client.name}
                        ${order.client.uses_edo ? '<span class="client-edo-badge">ЭДО</span>' : ''}
                    </span>
                </div>
                ${order.client.phone ? `<div class="client-info-item">
                    <span class="client-info-label">📞 Телефон:</span>
                    <span class="client-info-value">${order.client.phone}</span>
                </div>` : ''}
                ${order.client.email ? `<div class="client-info-item">
                    <span class="client-info-label">✉️ Email:</span>
                    <span class="client-info-value">${order.client.email}</span>
                </div>` : ''}
            </div>
        `;
    } else if (!isCompleted) { // fallback, если клиент не привязан
        fullView.innerHTML += `<div class="customer-name"><h2>👤 ${order.customer_name || "Клиент не указан"}</h2></div>`;
    }

    // Полное описание заказа
    fullView.innerHTML += `<div class="description">📝 ${order.description}</div>`;

    // Детали: дата готовности и дата создания
    fullView.innerHTML += `
        <div class="order-details">
            <div class="detail-item">
                <span class="detail-label">📅 Готовность:</span>
                <span>${order.ready_datetime}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">🕐 Добавлен:</span>
                <span>${order.created_at}</span>
            </div>
        </div>
    `;

    // Для активных заказов добавляем выпадающий список статусов и кнопки редактирования/удаления
    if (!isCompleted) {
        fullView.innerHTML += `
            <div class="order-status">
                <span class="detail-label">📊 Статус:</span>
                <select class="status-select" data-order-number="${order.order_number}">
                    <option value="accepted" ${order.status === 'accepted' ? 'selected' : ''}>Принят</option>
                    <option value="in_progress" ${order.status === 'in_progress' ? 'selected' : ''}>В работе</option>
                    <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>Готов</option>
                    <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Выдан</option>
                </select>
                <span class="status-display">(${order.status_display})</span>
            </div>
            
            <div class="order-actions">
                <button class="btn-edit" data-order-number="${order.order_number}">✏️ Редактировать</button>
                <button class="btn-delete" data-order-number="${order.order_number}">🗑️ Удалить</button>
            </div>
        `;
    }

    return fullView;
}

/**
 * Обновляет списки заказов в интерфейсе на основе данных от сервера.
 * @param {Array} activeOrders - массив активных заказов
 * @param {Array} completedOrders - массив выполненных заказов
 */
function updateOrdersLists(activeOrders, completedOrders) {
    console.log('Обновление списков заказов:', { activeOrders, completedOrders });
    currentActiveOrders = activeOrders;          // сохраняем
    currentCompletedOrders = completedOrders;    // сохраняем
    totalCompletedOrders = completedOrders.length;
    completedDisplayLimit = 10;                 // сбрасываем пагинацию на 10
    renderActiveOrders();                       // отрисовываем активные
    renderCompletedOrders();                   // отрисовываем выполненные
}

/**
 * Отрисовывает группы активных заказов в соответствующих списках.
 * Применяет текущую сортировку.
 */
function renderActiveOrders() {
    // Очищаем все три списка
    inProgressOrdersList.innerHTML = '';
    acceptedOrdersList.innerHTML = '';
    readyOrdersList.innerHTML = '';

    // Фильтруем заказы по статусам
    const inProgressOrders = currentActiveOrders.filter(order => order.status === 'in_progress');
    const acceptedOrders = currentActiveOrders.filter(order => order.status === 'accepted');
    const readyOrders = currentActiveOrders.filter(order => order.status === 'ready');

    // Функция сортировки в зависимости от выбранного поля и направления
    const sortFunction = (a, b) => {
        if (sortBy === 'number') {
            return (parseInt(a.order_number) - parseInt(b.order_number)) * sortDirection;
        } else if (sortBy === 'deadline') {
            // Преобразуем строку даты "дд.мм.гггг чч:мм" в объект Date для сравнения
            const [dateA, timeA] = a.ready_datetime.split(' ');
            const [dateB, timeB] = b.ready_datetime.split(' ');
            const [dayA, monthA, yearA] = dateA.split('.');
            const [dayB, monthB, yearB] = dateB.split('.');
            const dateObjA = new Date(`${yearA}-${monthA}-${dayA}T${timeA}`);
            const dateObjB = new Date(`${yearB}-${monthB}-${dayB}T${timeB}`);
            return (dateObjA - dateObjB) * sortDirection;
        }
        return 0;
    };

    // Применяем сортировку к каждой группе
    inProgressOrders.sort(sortFunction);
    acceptedOrders.sort(sortFunction);
    readyOrders.sort(sortFunction);

    // Группа "В работе"
    if (inProgressOrders.length === 0) {
        inProgressOrdersList.innerHTML = '<li class="empty-message">Нет заказов в работе</li>';
    } else {
        inProgressOrders.forEach(order => {
            const li = createOrderListItem(order, false); // isReady = false (показываем часы)
            inProgressOrdersList.appendChild(li);
        });
    }

    // Группа "Принят"
    if (acceptedOrders.length === 0) {
        acceptedOrdersList.innerHTML = '<li class="empty-message">Нет принятых заказов</li>';
    } else {
        acceptedOrders.forEach(order => {
            const li = createOrderListItem(order, false);
            acceptedOrdersList.appendChild(li);
        });
    }

    // Группа "Готов" — скрываем часы (isReady = true)
    if (readyOrders.length === 0) {
        readyOrdersList.innerHTML = '<li class="empty-message">Нет готовых заказов</li>';
    } else {
        readyOrders.forEach(order => {
            const li = createOrderListItem(order, true); // isReady = true (часы не показываем)
            readyOrdersList.appendChild(li);
        });
    }
}

/**
 * Создаёт элемент <li>, содержащий компактную и полную версию одного заказа.
 * Навешивает обработчики событий: клик по карточке (разворот/сворачивание),
 * изменение статуса, редактирование, удаление.
 * @param {Object} order - объект заказа
 * @param {boolean} isReady - флаг для скрытия часов
 * @returns {HTMLLIElement} элемент списка
 */
function createOrderListItem(order, isReady) {
    const li = document.createElement('li');
    li.className = 'order-list-item';

    const compactView = createCompactView(order, isReady); // компактная карточка
    const fullView = createFullView(order, isReady, false); // полная карточка (не выполнена)

    li.appendChild(compactView);
    li.appendChild(fullView);

    // Обработчик клика по компактной карточке — разворачивает/сворачивает полную версию
    compactView.addEventListener('click', function(e) {
        // Игнорируем клики по интерактивным элементам внутри карточки (кнопки, селекты)
        if (e.target.closest('.btn-edit, .btn-delete, .status-select, .order-hours')) {
            return;
        }
        // Скрываем все другие развёрнутые карточки
        document.querySelectorAll('.order-full.show').forEach(item => {
            if (item !== fullView) {
                item.classList.remove('show');
                item.previousElementSibling.classList.remove('expanded');
            }
        });
        // Переключаем класс show у fullView и класс expanded у compactView
        fullView.classList.toggle('show');
        compactView.classList.toggle('expanded');
    });

    // Обработчик изменения статуса в выпадающем списке
    const statusSelect = fullView.querySelector('.status-select');
    if (statusSelect) {
        statusSelect.addEventListener('change', function() {
            const orderNumber = this.getAttribute('data-order-number');
            const newStatus = this.value;
            changeOrderStatus(orderNumber, newStatus); // отправляем на сервер
        });
    }

    // Обработчик кнопки "Редактировать"
    const editBtn = fullView.querySelector('.btn-edit');
    if (editBtn) {
        editBtn.addEventListener('click', function(e) {
            e.stopPropagation(); // предотвращаем всплытие, чтобы не сработал клик по карточке
            const orderNumber = this.getAttribute('data-order-number');
            const order = currentActiveOrders.find(o => o.order_number === orderNumber);
            if (order) openEditModal(order);
        });
    }

    // Обработчик кнопки "Удалить"
    const deleteBtn = fullView.querySelector('.btn-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const orderNumber = this.getAttribute('data-order-number');
            if (confirm(`Вы уверены, что хотите удалить заказ №${orderNumber}?`)) {
                deleteOrder(orderNumber);
            }
        });
    }

    return li;
}

/**
 * Отрисовывает список выполненных заказов с учётом пагинации.
 * Сортирует по дате создания (сначала новые).
 */
function renderCompletedOrders() {
    completedOrdersList.innerHTML = ''; // очищаем список

    if (currentCompletedOrders.length === 0) {
        completedOrdersList.innerHTML = '<li class="empty-message">Нет выполненных заказов</li>';
        if (loadMoreBtn) loadMoreBtn.style.display = 'none'; // скрываем кнопку "Далее"
        return;
    }

    // Сортируем выполненные заказы по дате создания (от новых к старым)
    const sortedCompleted = [...currentCompletedOrders].sort((a, b) => {
        const [dateA, timeA] = a.created_at.split(' ');
        const [dateB, timeB] = b.created_at.split(' ');
        const [dayA, monthA, yearA] = dateA.split('.');
        const [dayB, monthB, yearB] = dateB.split('.');
        const dateObjA = new Date(`${yearA}-${monthA}-${dayA}T${timeA}`);
        const dateObjB = new Date(`${yearB}-${monthB}-${dayB}T${timeB}`);
        return dateObjB - dateObjA; // обратный порядок (новые сверху)
    });

    // Берём только первые completedDisplayLimit элементов
    const displayOrders = sortedCompleted.slice(0, completedDisplayLimit);

    // Для каждого заказа создаём элемент списка
    displayOrders.forEach(order => {
        const li = document.createElement('li');
        li.className = 'completed-order-item';

        const compactView = createCompactView(order, true); // isReady = true (часы не показываем)
        // Корректируем отображение статуса и бейджа для выполненных
        compactView.querySelector('.compact-status').textContent = 'Выдан';
        compactView.querySelector('.compact-status').className = 'compact-status completed';
        const hoursDiv = compactView.querySelector('.compact-hours');
        if (hoursDiv) hoursDiv.innerHTML = '<div class="hours-badge normal">✓</div>'; // вместо часов ставим галочку

        const fullView = createFullView(order, true, true); // isCompleted = true

        li.appendChild(compactView);
        li.appendChild(fullView);

        // Обработчик клика для разворачивания выполненных заказов
        compactView.addEventListener('click', function(e) {
            document.querySelectorAll('.order-full.show').forEach(item => {
                if (item !== fullView) {
                    item.classList.remove('show');
                    item.previousElementSibling.classList.remove('expanded');
                }
            });
            fullView.classList.toggle('show');
            compactView.classList.toggle('expanded');
        });

        completedOrdersList.appendChild(li);
    });

    // Управление кнопкой "Далее"
    if (loadMoreBtn) {
        if (completedDisplayLimit < sortedCompleted.length) {
            loadMoreBtn.style.display = 'inline-block'; // показываем кнопку
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = '⬇️ Далее';
        } else {
            loadMoreBtn.style.display = 'none'; // скрываем, если все заказы уже показаны
        }
    }
}

/**
 * Загружает следующую порцию выполненных заказов (увеличивает лимит на 10).
 */
function loadMoreCompleted() {
    if (completedDisplayLimit < currentCompletedOrders.length) {
        completedDisplayLimit += 10; // увеличиваем лимит
        renderCompletedOrders();     // перерисовываем
    }
}

// Привязываем обработчик к кнопке "Далее", если она существует
if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', loadMoreCompleted);
}

/**
 * Открывает модальное окно редактирования заказа с предзаполненными полями.
 * @param {Object} order - объект заказа
 */
function openEditModal(order) {
    editingOrderNumber = order.order_number;                   // запоминаем номер редактируемого заказа
    editDescriptionInput.value = order.description;           // заполняем описание
    // Преобразуем формат даты из "дд.мм.гггг чч:мм" в "гггг-мм-ддTчч:мм"
    const [dateStr, timeStr] = order.ready_datetime.split(' ');
    const [day, month, year] = dateStr.split('.');
    const [hour, minute] = timeStr.split(':');
    editReadyDatetimeInput.value = `${year}-${month}-${day}T${hour}:${minute}`;
    editModal.classList.add('show');                         // показываем модалку
}

/**
 * Закрывает модальное окно редактирования и очищает поля.
 */
function closeEditModal() {
    editModal.classList.remove('show');
    editingOrderNumber = null;
    editDescriptionInput.value = '';
    editReadyDatetimeInput.value = '';
}

// ===== ФУНКЦИИ ДЛЯ ОТПРАВКИ СООБЩЕНИЙ НА СЕРВЕР =====
/**
 * Отправляет команду на изменение статуса заказа.
 * @param {string|number} orderNumber - номер заказа
 * @param {string} newStatus - новый статус ('accepted', 'in_progress', 'ready', 'completed')
 */
function changeOrderStatus(orderNumber, newStatus) {
    if (socket.readyState !== WebSocket.OPEN) {
        alert('❌ Нет соединения с сервером.');
        return;
    }
    socket.send(JSON.stringify({
        action: 'change_status',
        order_number: parseInt(orderNumber),
        status: newStatus
    }));
}

/**
 * Отправляет команду на удаление заказа.
 * @param {string|number} orderNumber 
 */
function deleteOrder(orderNumber) {
    if (socket.readyState !== WebSocket.OPEN) {
        alert('❌ Нет соединения с сервером.');
        return;
    }
    socket.send(JSON.stringify({
        action: 'delete_order',
        order_number: parseInt(orderNumber)
    }));
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
addClientBtn.addEventListener('click', openAddClientModal);
saveClientBtn.addEventListener('click', saveNewClient);
cancelClientBtn.addEventListener('click', closeAddClientModal);

// [НОВОЕ] Обработчик клика по кнопке "➕ Добавить" – плавная прокрутка к форме
if (scrollToAddBtn) {  // Проверяем, существует ли элемент на странице (на случай, если кнопку временно убрали)
    scrollToAddBtn.addEventListener('click', function(e) {
        e.preventDefault(); // Предотвращаем возможное стандартное поведение (если кнопка была бы в форме)
        
        // Находим блок с формой добавления заказа по его ID (добавлен в HTML)
        const addOrderSection = document.getElementById('add-order-section');
        
        if (addOrderSection) {
            // Используем метод scrollIntoView с плавной анимацией.
            // behavior: 'smooth' – плавная прокрутка (поддерживается современными браузерами).
            // block: 'start' – выравнивание блока по верхнему краю окна.
            addOrderSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        } else {
            console.warn('Элемент с id "add-order-section" не найден на странице.');
        }
    });
}


// Обработчик кнопки "Добавить заказ"
submitBtn.addEventListener('click', function() {
    const client = getSelectedClient();                       // получаем выбранного клиента
    const description = descriptionInput.value.trim();       // описание
    const readyDatetime = readyDatetimeInput.value;          // дата готовности
    if (!client) {
        alert('⚠️ Пожалуйста, выберите клиента из базы данных!');
        return;
    }
    if (!description || !readyDatetime) {
        alert('⚠️ Пожалуйста, заполните описание и дату готовности!');
        return;
    }
    if (socket.readyState !== WebSocket.OPEN) {
        alert('❌ Нет соединения с сервером. Попробуйте позже.');
        return;
    }
    // Отправляем данные нового заказа
    socket.send(JSON.stringify({
        action: 'add_order',
        client_id: parseInt(client.id),
        description: description,
        ready_datetime: readyDatetime
    }));
    clearForm(); // очищаем форму после отправки
});

clearBtn.addEventListener('click', clearForm);

// Обработчик кнопки сохранения изменений в модалке редактирования
saveEditBtn.addEventListener('click', function() {
    const description = editDescriptionInput.value.trim();
    const readyDatetime = editReadyDatetimeInput.value;
    if (!description || !readyDatetime) {
        alert('⚠️ Пожалуйста, заполните все поля!');
        return;
    }
    if (socket.readyState !== WebSocket.OPEN) {
        alert('❌ Нет соединения с сервером.');
        return;
    }
    socket.send(JSON.stringify({
        action: 'update_order',
        order_number: editingOrderNumber,
        description: description,
        ready_datetime: readyDatetime
    }));
    closeEditModal();
});

cancelEditBtn.addEventListener('click', closeEditModal);

// Закрытие модального окна редактирования при клике на затемнённую область
editModal.addEventListener('click', function(e) {
    if (e.target === editModal) closeEditModal();
});

// Закрытие модального окна добавления клиента при клике на затемнение
addClientModal.addEventListener('click', function(e) {
    if (e.target === addClientModal) closeAddClientModal();
});

// Обработчик кнопки сортировки по номеру
document.getElementById('sort-by-number').addEventListener('click', function() {
    const btnNumber = document.getElementById('sort-by-number');
    const btnDeadline = document.getElementById('sort-by-deadline');
    if (sortBy === 'number') {
        sortDirection *= -1; // меняем направление
    } else {
        sortBy = 'number';
        sortDirection = 1;
        btnDeadline.classList.remove('active'); // убираем активный класс у другой кнопки
        btnNumber.classList.add('active');
    }
    renderActiveOrders(); // перерисовываем с новой сортировкой
});

// Обработчик кнопки сортировки по дедлайну
document.getElementById('sort-by-deadline').addEventListener('click', function() {
    const btnNumber = document.getElementById('sort-by-number');
    const btnDeadline = document.getElementById('sort-by-deadline');
    if (sortBy === 'deadline') {
        sortDirection *= -1;
    } else {
        sortBy = 'deadline';
        sortDirection = 1;
        btnNumber.classList.remove('active');
        btnDeadline.classList.add('active');
    }
    renderActiveOrders();
});

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
/**
 * Очищает форму добавления нового заказа и устанавливает дату по умолчанию.
 */
function clearForm() {
    clientSelect.value = '';          // сбрасываем выбранного клиента
    descriptionInput.value = '';      // очищаем описание
    readyDatetimeInput.value = '';    // очищаем дату
    setDefaultDateTime();            // устанавливаем дату по умолчанию
}

/**
 * Возвращает следующий рабочий день (пн-пт) в 15:00.
 * @returns {Date} объект даты
 */
function getNextBusinessDay() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    // Пропускаем субботу (6) и воскресенье (0)
    while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
        tomorrow.setDate(tomorrow.getDate() + 1);
    }
    tomorrow.setHours(15, 0, 0, 0); // устанавливаем время 15:00
    return tomorrow;
}

/**
 * Устанавливает в поле readyDatetimeInput значение по умолчанию: следующий рабочий день в 15:00.
 */
function setDefaultDateTime() {
    const nextBusinessDay = getNextBusinessDay();
    const year = nextBusinessDay.getFullYear();
    const month = String(nextBusinessDay.getMonth() + 1).padStart(2, '0');
    const day = String(nextBusinessDay.getDate()).padStart(2, '0');
    const hours = String(nextBusinessDay.getHours()).padStart(2, '0');
    const minutes = String(nextBusinessDay.getMinutes()).padStart(2, '0');
    readyDatetimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Запускает автоматический запрос обновления заказов каждые 10 минут.
 */
function startAutoRefresh() {
    setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: 'refresh_orders' }));
        }
    }, 600000); // 600000 мс = 10 минут
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====
connect();                // устанавливаем WebSocket-соединение
setDefaultDateTime();    // устанавливаем дату по умолчанию в форму
startAutoRefresh();      // запускаем автообновление

// Дополнительный запрос обновления при полной загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: 'refresh_orders' }));
        }
    }, 1000); // через 1 секунду после загрузки страницы
});