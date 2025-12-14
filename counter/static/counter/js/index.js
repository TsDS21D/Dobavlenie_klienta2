/*
index.js
JavaScript для главной страницы системы управления заказами типографии.
Содержит логику работы с WebSocket, управление DOM, обработку событий.
*/

// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (объявляем переменные, доступные во всех функциях) =====

// DOM элементы - получаем ссылки на HTML элементы страницы для дальнейшей работы с ними
const clientSelect = document.getElementById('client-select'); // Выпадающий список клиентов
const addClientBtn = document.getElementById('add-client-btn'); // Кнопка добавления клиента
const customerNameInput = document.getElementById('customer-name'); // Поле для ручного ввода клиента
const manualClientGroup = document.getElementById('manual-client-group'); // Группа полей ручного ввода
const descriptionInput = document.getElementById('description'); // Поле описания заказа
const readyDatetimeInput = document.getElementById('ready-datetime'); // Поле даты готовности
const submitBtn = document.getElementById('submit-btn'); // Кнопка отправки формы
const clearBtn = document.getElementById('clear-btn'); // Кнопка очистки формы

// Списки заказов - элементы для отображения активных и выполненных заказов
const activeOrdersList = document.getElementById('active-orders-list'); // Список активных заказов
const completedOrdersList = document.getElementById('completed-orders-list'); // Список выполненных заказов

// Элемент статуса подключения - для отображения состояния WebSocket соединения
const statusElement = document.getElementById('status'); // Блок статуса подключения

// Элементы модальных окон - ссылки на элементы окон редактирования и добавления клиента
const editModal = document.getElementById('editModal'); // Модальное окно редактирования заказа
const editCustomerNameInput = document.getElementById('edit-customer-name'); // Поле клиента в модальном окне
const editDescriptionInput = document.getElementById('edit-description'); // Поле описания в модальном окне
const editReadyDatetimeInput = document.getElementById('edit-ready-datetime'); // Поле даты в модальном окне
const saveEditBtn = document.getElementById('save-edit-btn'); // Кнопка сохранения в модальном окне
const cancelEditBtn = document.getElementById('cancel-edit-btn'); // Кнопка отмены в модальном окне

const addClientModal = document.getElementById('addClientModal'); // Модальное окно добавления клиента
const saveClientBtn = document.getElementById('save-client-btn'); // Кнопка сохранения клиента
const cancelClientBtn = document.getElementById('cancel-client-btn'); // Кнопка отмены добавления клиента

// Определяем URL для WebSocket соединения
// Используем безопасный протокол wss:// если страница загружена по https://, иначе ws://
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/ws/order`; // Полный URL WebSocket

// Переменные для управления состоянием приложения
let socket; // Объект WebSocket соединения
let reconnectInterval; // Идентификатор интервала для переподключения
let editingOrderNumber = null; // Номер заказа, который сейчас редактируется (null если нет)
let currentActiveOrders = []; // Массив текущих активных заказов
let currentCompletedOrders = []; // Массив текущих выполненных заказов
let currentClients = []; // Массив текущих клиентов
let sortBy = 'deadline'; // Текущий способ сортировки ('deadline' или 'number')
let sortDirection = 1; // Направление сортировки (1 - по возрастанию, -1 - по убыванию)

// ===== WEB SOCKET ФУНКЦИИ (работа с WebSocket соединением) =====

/**
 * Устанавливает соединение с WebSocket сервером
 * Создает новое WebSocket соединение и настраивает обработчики событий
 */
function connect() {
    console.log('Попытка подключения к WebSocket:', wsUrl); // Логируем попытку подключения
    
    // Создаем новое WebSocket соединение по указанному URL
    socket = new WebSocket(wsUrl);

    /**
     * Обработчик события открытия соединения
     * Вызывается когда соединение успешно установлено
     */
    socket.onopen = function(e) {
        console.log('✅ WebSocket подключен успешно'); // Логируем успешное подключение
        
        // Обновляем статус на странице
        statusElement.textContent = '✅ Подключено'; // Меняем текст статуса
        statusElement.className = 'status connected'; // Меняем CSS класс для зеленого фона
        
        // Если был установлен интервал переподключения, очищаем его
        if (reconnectInterval) {
            clearInterval(reconnectInterval); // Останавливаем интервал
            reconnectInterval = null; // Сбрасываем переменную
        }
    };

    /**
     * Обработчик входящих сообщений от сервера
     * Вызывается когда сервер отправляет данные через WebSocket
     * @param {MessageEvent} event - объект события с данными сообщения
     */
    socket.onmessage = function(event) {
        console.log('Получено сообщение от сервера:', event.data); // Логируем полученные данные
        
        // Парсим JSON данные из сообщения
        const data = JSON.parse(event.data);
        
        // Обрабатываем разные типы сообщений
        
        // Обновление заказов (начальная загрузка или обновление)
        if (data.type === 'initial_load' || data.type === 'order_update') {
            // Обновляем списки заказов на странице
            updateOrdersLists(data.active_orders, data.completed_orders);
            
            // Если в сообщении есть клиенты, обновляем их список
            if (data.clients) {
                updateClientsList(data.clients);
            }
        }
        
        // Обновление списка клиентов
        if (data.type === 'clients_update') {
            updateClientsList(data.clients); // Обновляем только список клиентов
        }
    };

    /**
     * Обработчик закрытия соединения
     * Вызывается когда соединение закрывается (по любой причине)
     * @param {CloseEvent} event - объект события закрытия
     */
    socket.onclose = function(event) {
        console.log('❌ WebSocket соединение закрыто'); // Логируем закрытие соединения
        
        // Обновляем статус на странице
        statusElement.textContent = '⏳ Переподключение...'; // Меняем текст статуса
        statusElement.className = 'status disconnected'; // Меняем CSS класс для красного фона

        // Если интервал переподключения еще не установлен, устанавливаем его
        if (!reconnectInterval) {
            // Устанавливаем интервал для попыток переподключения каждые 3 секунды
            reconnectInterval = setInterval(() => {
                console.log('Попытка переподключения...'); // Логируем попытку переподключения
                connect(); // Вызываем функцию подключения снова
            }, 3000); // 3000 миллисекунд = 3 секунды
        }
    };

    /**
     * Обработчик ошибок соединения
     * Вызывается при возникновении ошибки в WebSocket соединении
     * @param {ErrorEvent} error - объект ошибки
     */
    socket.onerror = function(error) {
        console.error('❌ Ошибка WebSocket:', error); // Логируем ошибку в консоль
    };
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С КЛИЕНТАМИ (управление списком клиентов) =====

/**
 * Обновляет выпадающий список клиентов на странице
 * Заполняет список <select> клиентами из полученного массива
 * @param {Array} clients - массив объектов клиентов
 */
function updateClientsList(clients) {
    console.log('Обновление списка клиентов:', clients); // Логируем полученных клиентов
    
    currentClients = clients; // Сохраняем клиентов в глобальную переменную
    
    // Сохраняем текущее выбранное значение (чтобы восстановить после обновления)
    const selectedValue = clientSelect.value;
    
    // Очищаем текущий список клиентов
    clientSelect.innerHTML = '<option value="">-- Выберите клиента --</option>';
    
    // Добавляем клиентов в список
    clients.forEach(client => {
        const option = document.createElement('option'); // Создаем новый элемент <option>
        option.value = client.id; // Устанавливаем значение (ID клиента)
        // Устанавливаем текст (имя клиента + пометка ЭДО если есть)
        option.textContent = `${client.name}${client.uses_edo ? ' [ЭДО]' : ''}`;
        
        // Добавляем дополнительную информацию в data-атрибуты
        option.dataset.phone = client.phone; // Телефон клиента
        option.dataset.email = client.email; // Email клиента
        option.dataset.usesEdo = client.uses_edo; // Флаг ЭДО
        
        clientSelect.appendChild(option); // Добавляем option в select
    });
    
    // Восстанавливаем выбранное значение, если оно было
    if (selectedValue) {
        clientSelect.value = selectedValue;
    }
    
    // Добавляем опцию для ручного ввода клиента
    const manualOption = document.createElement('option'); // Создаем option для ручного ввода
    manualOption.value = 'manual'; // Устанавливаем специальное значение
    manualOption.textContent = '-- Ввести вручную --'; // Устанавливаем текст
    clientSelect.appendChild(manualOption); // Добавляем option в select
    
    // Обновляем отображение поля ручного ввода (показываем/скрываем)
    toggleManualClientInput();
}

/**
 * Показывает или скрывает поле для ручного ввода клиента
 * Вызывается при изменении выбора в выпадающем списке клиентов
 */
function toggleManualClientInput() {
    // Если выбрана опция "Ввести вручную"
    if (clientSelect.value === 'manual') {
        manualClientGroup.style.display = 'block'; // Показываем поле ручного ввода
        customerNameInput.focus(); // Устанавливаем фокус на поле ввода
    } else {
        manualClientGroup.style.display = 'none'; // Скрываем поле ручного ввода
        customerNameInput.value = ''; // Очищаем значение поля
    }
}

/**
 * Открывает модальное окно для добавления нового клиента
 * Очищает поля формы и показывает модальное окно
 */
function openAddClientModal() {
    // Очищаем все поля формы добавления клиента
    document.getElementById('new-client-name').value = ''; // Поле имени
    document.getElementById('new-client-phone').value = ''; // Поле телефона
    document.getElementById('new-client-email').value = ''; // Поле email
    document.getElementById('new-client-edo').checked = false; // Чекбокс ЭДО
    document.getElementById('new-client-notes').value = ''; // Поле заметок
    
    // Показываем модальное окно добавления клиента
    addClientModal.classList.add('show'); // Добавляем класс 'show' для отображения
}

/**
 * Закрывает модальное окно добавления клиента
 * Скрывает модальное окно
 */
function closeAddClientModal() {
    addClientModal.classList.remove('show'); // Убираем класс 'show' для скрытия
}

/**
 * Отправляет данные нового клиента на сервер через WebSocket
 * Выполняет валидацию и отправляет запрос на добавление клиента
 */
function saveNewClient() {
    // Получаем значения из полей формы
    const name = document.getElementById('new-client-name').value.trim(); // Имя клиента
    const phone = document.getElementById('new-client-phone').value.trim(); // Телефон
    const email = document.getElementById('new-client-email').value.trim(); // Email
    const usesEdo = document.getElementById('new-client-edo').checked; // Флаг ЭДО
    const notes = document.getElementById('new-client-notes').value.trim(); // Заметки
    
    // Валидация: проверяем что имя клиента заполнено
    if (!name) {
        alert('⚠️ Пожалуйста, введите название клиента!'); // Показываем предупреждение
        return; // Прерываем выполнение функции
    }
    
    // Проверяем состояние WebSocket соединения
    if (socket.readyState !== WebSocket.OPEN) {
        alert('❌ Нет соединения с сервером.'); // Показываем ошибку
        return; // Прерываем выполнение функции
    }
    
    // Отправляем данные нового клиента на сервер через WebSocket
    socket.send(JSON.stringify({ // Преобразуем объект в JSON строку
        action: 'add_client', // Действие: добавление клиента
        client_data: { // Данные клиента
            name: name, // Имя клиента
            phone: phone, // Телефон
            email: email, // Email
            uses_edo: usesEdo, // Флаг ЭДО
            notes: notes // Заметки
        }
    }));
    
    // Закрываем модальное окно после отправки
    closeAddClientModal();
    
    // Показываем уведомление об успешном добавлении
    alert(`✅ Клиент "${name}" добавлен в базу данных!`);
}

/**
 * Получает выбранного клиента из формы заказа
 * Возвращает объект с данными клиента или null если клиент не выбран
 * @returns {Object|null} объект с данными клиента или null
 */
function getSelectedClient() {
    // Получаем выбранный option из select
    const selectedOption = clientSelect.options[clientSelect.selectedIndex];
    
    // Если выбран клиент из базы данных (не "ручной ввод")
    if (clientSelect.value && clientSelect.value !== 'manual') {
        return { // Возвращаем объект с данными клиента из базы
            id: clientSelect.value, // ID клиента
            name: selectedOption.textContent.replace(' [ЭДО]', ''), // Имя клиента (убираем пометку ЭДО)
            phone: selectedOption.dataset.phone, // Телефон из data-атрибута
            email: selectedOption.dataset.email, // Email из data-атрибута
            uses_edo: selectedOption.dataset.usesEdo === 'true' // Флаг ЭДО из data-атрибута
        };
    } 
    // Если выбран ручной ввод и поле заполнено
    else if (clientSelect.value === 'manual' && customerNameInput.value.trim()) {
        return { // Возвращаем объект с данными ручного ввода
            id: null, // ID нет (клиент не сохранен в базе)
            name: customerNameInput.value.trim(), // Имя из поля ввода
            phone: '', // Телефон не указан
            email: '', // Email не указан
            uses_edo: false // ЭДО не используется
        };
    }
    
    // Если клиент не выбран
    return null;
}

// ===== ФУНКЦИИ ДЛЯ РАБОТЫ С ЗАКАЗАМИ (отображение и управление заказами) =====

/**
 * Определяет CSS класс для блока с часами в зависимости от количества часов
 * Используется для цветового кодирования срочности заказа
 * @param {number} hours - количество оставшихся рабочих часов
 * @returns {string} CSS класс для элемента
 */
function getHoursClassName(hours) {
    if (hours <= 1) return 'order-hours critical'; // Меньше 1 часа - критический (красный)
    if (hours <= 3) return 'order-hours warning'; // 1-3 часа - предупреждение (оранжевый)
    return 'order-hours'; // Больше 3 часов - норма (зеленый)
}

/**
 * Возвращает класс для бейджа часов на основе количества часов
 * Используется для компактного отображения заказа
 * @param {number} hours - количество оставшихся часов
 * @returns {string} CSS класс для бейджа
 */
function getHoursBadgeClass(hours) {
    if (hours <= 1) return 'critical'; // Меньше 1 часа - критический
    if (hours <= 3) return 'warning'; // 1-3 часа - предупреждение
    return 'normal'; // Больше 3 часов - норма
}

/**
 * Обрезает текст до указанного количества слов
 * Используется для компактного отображения длинных описаний
 * @param {string} text - исходный текст
 * @param {number} wordCount - максимальное количество слов
 * @returns {string} обрезанный текст с многоточием
 */
function truncateWords(text, wordCount = 5) {
    // Разделяем текст на слова (по пробелам)
    const words = text.trim().split(/\s+/);
    // Если слов меньше или равно лимиту, возвращаем исходный текст
    if (words.length <= wordCount) {
        return text;
    }
    // Иначе возвращаем первые wordCount слов + многоточие
    return words.slice(0, wordCount).join(' ') + '...';
}

/**
 * Обновляет списки заказов на странице
 * Заменяет текущее содержимое списков новыми данными
 * @param {Array} activeOrders - массив активных заказов
 * @param {Array} completedOrders - массив выполненных заказов
 */
function updateOrdersLists(activeOrders, completedOrders) {
    console.log('Обновление списков заказов:', {activeOrders, completedOrders}); // Логируем данные
    
    // Сохраняем заказы в глобальные переменные
    currentActiveOrders = activeOrders;
    currentCompletedOrders = completedOrders;
    
    // Обновляем отображение заказов на странице
    renderActiveOrders(); // Рендерим активные заказы
    renderCompletedOrders(); // Рендерим выполненные заказы
}

/**
 * Отображает активные заказы на странице
 * Создает DOM элементы для каждого активного заказа и добавляет их в список
 */
function renderActiveOrders() {
    // Очищаем текущий список активных заказов
    activeOrdersList.innerHTML = '';

    // Если активных заказов нет, показываем сообщение
    if (currentActiveOrders.length === 0) {
        activeOrdersList.innerHTML = '<li class="empty-message">Нет активных заказов</li>';
        return; // Прерываем выполнение функции
    }

    // Создаем копию массива заказов для сортировки
    let sortedOrders = [...currentActiveOrders];
    
    // Приоритет статусов: 1. в работе, 2. готов, 3. принят
    const statusPriority = {
        'in_progress': 1,  // самый высокий приоритет
        'ready': 2,
        'accepted': 3       // самый низкий приоритет
    };

    // Сортируем заказы
    sortedOrders.sort((a, b) => {
        // Сначала по приоритету статуса
        const priorityA = statusPriority[a.status] || 4; // 4 для неизвестных статусов
        const priorityB = statusPriority[b.status] || 4;
        
        if (priorityA !== priorityB) {
            return (priorityA - priorityB) * sortDirection;
        }
        
        // Если статусы одинаковые, сортируем по выбранному способу
        
        // Сортировка по номеру заказа
        if (sortBy === 'number') {
            return (parseInt(a.order_number) - parseInt(b.order_number)) * sortDirection;
        } 
        // Сортировка по дате готовности (дедлайну)
        else if (sortBy === 'deadline') {
            // Парсим даты из формата "дд.мм.гггг чч:мм"
            const [dateA, timeA] = a.ready_datetime.split(' ');
            const [dateB, timeB] = b.ready_datetime.split(' ');
            const [dayA, monthA, yearA] = dateA.split('.');
            const [dayB, monthB, yearB] = dateB.split('.');
            
            // Создаем объекты Date для сравнения
            const dateObjA = new Date(`${yearA}-${monthA}-${dayA}T${timeA}`);
            const dateObjB = new Date(`${yearB}-${monthB}-${dayB}T${timeB}`);
            
            // Сравниваем даты с учетом направления сортировки
            return (dateObjA - dateObjB) * sortDirection;
        }
        
        return 0;
    });

    // Для каждого отсортированного заказа создаем DOM элементы
    sortedOrders.forEach((order) => {
        // Создаем элемент списка <li>
        const li = document.createElement('li');
        li.className = 'order-list-item'; // Добавляем CSS класс
        
        // Получаем количество оставшихся часов и классы для отображения
        const hours = order.working_hours_remaining;
        const hoursBadgeClass = getHoursBadgeClass(hours); // Класс для бейджа часов
        const hoursClassName = getHoursClassName(hours); // Класс для блока часов
        
        // Создаем компактное представление заказа (основная строка)
        const compactView = document.createElement('div');
        compactView.className = `order-compact status-${order.status}`; // CSS класс с учетом статуса
        compactView.dataset.orderNumber = order.order_number; // Сохраняем номер заказа в data-атрибут
        
        // Заполняем HTML компактного представления
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
                <div class="hours-badge ${hoursBadgeClass}">⏱️ ${hours}ч</div>
            </div>
        `;
        
        // Создаем полное представление заказа (скрытое по умолчанию)
        const fullView = document.createElement('div');
        fullView.className = `order-full status-${order.status}`; // CSS класс с учетом статуса
        fullView.id = `details-${order.order_number}`; // Уникальный ID для этого заказа
        
        // Начинаем заполнять HTML полного представления
        fullView.innerHTML = `
            <div class="order-header">
                <div class="order-number">№${order.order_number}</div>
                <div class="order-hours ${hoursClassName}">⏱️ ${hours}ч</div>
            </div>
        `;

        // Добавляем информацию о клиенте (если есть в базе)
        if (order.client) {
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
        } else {
            // Если клиент не из базы (ручной ввод)
            fullView.innerHTML += `<div class="customer-name"><h2>👤 ${order.customer_name}</h2></div>`;
        }

        // Добавляем остальную информацию о заказе
        fullView.innerHTML += `
            <div class="description">📝 ${order.description}</div>
            
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
        
        // Добавляем элементы в список
        li.appendChild(compactView); // Добавляем компактное представление
        li.appendChild(fullView); // Добавляем полное представление
        activeOrdersList.appendChild(li); // Добавляем элемент списка в DOM

        // Добавляем обработчик клика для раскрытия/скрытия деталей заказа
        compactView.addEventListener('click', function(e) {
            // Не раскрываем при клике на кнопки внутри (редактирование, удаление, изменение статуса)
            if (e.target.closest('.btn-edit, .btn-delete, .status-select, .order-hours')) {
                return; // Прерываем обработку
            }
            
            // Закрываем все другие открытые детали заказов
            document.querySelectorAll('.order-full.show').forEach(item => {
                if (item !== fullView) { // Если это не текущий элемент
                    item.classList.remove('show'); // Скрываем детали
                    item.previousElementSibling.classList.remove('expanded'); // Убираем стиль раскрытия
                }
            });
            
            // Переключаем отображение деталей текущего заказа
            fullView.classList.toggle('show'); // Показываем/скрываем детали
            compactView.classList.toggle('expanded'); // Добавляем/убираем стиль раскрытия
        });

        // Назначаем обработчик изменения статуса заказа
        fullView.querySelector('.status-select').addEventListener('change', function() {
            const orderNumber = this.getAttribute('data-order-number'); // Получаем номер заказа
            const newStatus = this.value; // Получаем новый статус
            changeOrderStatus(orderNumber, newStatus); // Вызываем функцию изменения статуса
        });

        // Назначаем обработчик кнопки редактирования заказа
        fullView.querySelector('.btn-edit').addEventListener('click', function(e) {
            e.stopPropagation(); // Предотвращаем всплытие события
            const orderNumber = this.getAttribute('data-order-number'); // Получаем номер заказа
            // Находим заказ в массиве текущих активных заказов
            const order = currentActiveOrders.find(o => o.order_number === orderNumber);
            if (order) {
                openEditModal(order); // Открываем модальное окно редактирования
            }
        });

        // Назначаем обработчик кнопки удаления заказа
        fullView.querySelector('.btn-delete').addEventListener('click', function(e) {
            e.stopPropagation(); // Предотвращаем всплытие события
            const orderNumber = this.getAttribute('data-order-number'); // Получаем номер заказа
            // Подтверждаем удаление
            if (confirm(`Вы уверены, что хотите удалить заказ №${orderNumber}?`)) {
                deleteOrder(orderNumber); // Вызываем функцию удаления
            }
        });
    });
}

/**
 * Отображает выполненные заказы на странице
 * Создает DOM элементы для каждого выполненного заказа
 */
function renderCompletedOrders() {
    // Очищаем текущий список выполненных заказов
    completedOrdersList.innerHTML = '';

    // Если выполненных заказов нет, показываем сообщение
    if (currentCompletedOrders.length === 0) {
        completedOrdersList.innerHTML = '<li class="empty-message">Нет выполненных заказов</li>';
        return; // Прерываем выполнение функции
    }

    // Для каждого выполненного заказа создаем DOM элементы
    currentCompletedOrders.forEach((order) => {
        // Создаем элемент списка <li> для выполненного заказа
        const li = document.createElement('li');
        li.className = 'completed-order-item'; // Добавляем CSS класс
        
        // Создаем компактное представление выполненного заказа
        const compactView = document.createElement('div');
        compactView.className = 'order-compact status-completed'; // CSS класс для выполненного статуса
        compactView.dataset.orderNumber = order.order_number; // Сохраняем номер заказа
        
        // Заполняем HTML компактного представления выполненного заказа
        compactView.innerHTML = `
            <div class="compact-number">№${order.order_number}</div>
            <div class="compact-client">
                ${order.client_display}
            </div>
            <div class="compact-description" title="${order.description}">
                ${truncateWords(order.description, 5)}
            </div>
            <div class="compact-status completed" title="Выдан">
                Выдан
            </div>
            <div class="compact-hours">
                <div class="hours-badge normal">✓</div>
            </div>
        `;
        
        // Создаем полное представление выполненного заказа (скрытое по умолчанию)
        const fullView = document.createElement('div');
        fullView.className = 'order-full status-completed'; // CSS класс для выполненного статуса
        fullView.id = `details-completed-${order.order_number}`; // Уникальный ID
        
        // Заполняем HTML полного представления выполненного заказа
        fullView.innerHTML = `
            <div class="order-header">
                <div class="order-number">№${order.order_number} (Выдан)</div>
                <div class="order-hours" style="background: #9E9E9E;">✓</div>
            </div>
            <div class="customer-name">👤 ${order.client_display}</div>
            <div class="description">📝 ${order.description}</div>
            
            <div class="order-details">
                <div class="detail-item">
                    <span class="detail-label">📅 Был готов:</span>
                    <span>${order.ready_datetime}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">🕐 Добавлен:</span>
                    <span>${order.created_at}</span>
                </div>
            </div>
        `;
        
        // Добавляем элементы в список
        li.appendChild(compactView); // Добавляем компактное представление
        li.appendChild(fullView); // Добавляем полное представление
        completedOrdersList.appendChild(li); // Добавляем элемент списка в DOM

        // Добавляем обработчик клика для раскрытия/скрытия деталей выполненного заказа
        compactView.addEventListener('click', function(e) {
            // Закрываем все другие открытые детали
            document.querySelectorAll('.order-full.show').forEach(item => {
                if (item !== fullView) { // Если это не текущий элемент
                    item.classList.remove('show'); // Скрываем детали
                    item.previousElementSibling.classList.remove('expanded'); // Убираем стиль раскрытия
                }
            });
            
            // Переключаем отображение деталей текущего выполненного заказа
            fullView.classList.toggle('show'); // Показываем/скрываем детали
            compactView.classList.toggle('expanded'); // Добавляем/убираем стиль раскрытия
        });
    });
}

/**
 * Открывает модальное окно для редактирования заказа
 * Заполняет поля формы данными выбранного заказа
 * @param {Object} order - объект заказа для редактирования
 */
function openEditModal(order) {
    editingOrderNumber = order.order_number; // Сохраняем номер редактируемого заказа
    
    // Заполняем поля формы данными заказа
    editCustomerNameInput.value = order.client_display; // Имя клиента
    editDescriptionInput.value = order.description; // Описание
    
    // Преобразуем дату из формата "дд.мм.гггг чч:мм" в формат "гггг-мм-ддTчч:мм"
    const [dateStr, timeStr] = order.ready_datetime.split(' '); // Разделяем дату и время
    const [day, month, year] = dateStr.split('.'); // Разделяем день, месяц, год
    const [hour, minute] = timeStr.split(':'); // Разделяем час, минуту
    
    // Устанавливаем значение в поле datetime-local
    editReadyDatetimeInput.value = `${year}-${month}-${day}T${hour}:${minute}`;
    
    editModal.classList.add('show'); // Показываем модальное окно
}

/**
 * Закрывает модальное окно редактирования заказа
 * Сбрасывает форму и скрывает модальное окно
 */
function closeEditModal() {
    editModal.classList.remove('show'); // Скрываем модальное окно
    editingOrderNumber = null; // Сбрасываем номер редактируемого заказа
    editCustomerNameInput.value = ''; // Очищаем поле клиента
    editDescriptionInput.value = ''; // Очищаем поле описания
    editReadyDatetimeInput.value = ''; // Очищаем поле даты
}

// ===== ФУНКЦИИ ДЛЯ ОТПРАВКИ СООБЩЕНИЙ НА СЕРВЕР (WebSocket взаимодействие) =====

/**
 * Отправляет запрос на изменение статуса заказа
 * @param {string} orderNumber - номер заказа
 * @param {string} newStatus - новый статус
 */
function changeOrderStatus(orderNumber, newStatus) {
    // Проверяем состояние WebSocket соединения
    if (socket.readyState !== WebSocket.OPEN) {
        alert('❌ Нет соединения с сервером.'); // Показываем ошибку
        return; // Прерываем выполнение функции
    }

    // Отправляем запрос на изменение статуса через WebSocket
    socket.send(JSON.stringify({ // Преобразуем объект в JSON
        action: 'change_status', // Действие: изменение статуса
        order_number: parseInt(orderNumber), // Номер заказа (преобразуем в число)
        status: newStatus // Новый статус
    }));
}

/**
 * Отправляет запрос на удаление заказа
 * @param {string} orderNumber - номер заказа для удаления
 */
function deleteOrder(orderNumber) {
    // Проверяем состояние WebSocket соединения
    if (socket.readyState !== WebSocket.OPEN) {
        alert('❌ Нет соединения с сервером.'); // Показываем ошибку
        return; // Прерываем выполнение функции
    }

    // Отправляем запрос на удаление через WebSocket
    socket.send(JSON.stringify({ // Преобразуем объект в JSON
        action: 'delete_order', // Действие: удаление заказа
        order_number: parseInt(orderNumber) // Номер заказа (преобразуем в число)
    }));
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ (назначение обработчиков на DOM элементы) =====

// Обработчик изменения выбора клиента в выпадающем списке
clientSelect.addEventListener('change', toggleManualClientInput);

// Обработчик клика по кнопке добавления клиента
addClientBtn.addEventListener('click', openAddClientModal);

// Обработчик клика по кнопке сохранения клиента в модальном окне
saveClientBtn.addEventListener('click', saveNewClient);

// Обработчик клика по кнопке отмены добавления клиента в модальном окне
cancelClientBtn.addEventListener('click', closeAddClientModal);

// Обработчик клика по кнопке "Добавить заказ" в основной форме
submitBtn.addEventListener('click', function() {
    // Получаем данные из формы
    const client = getSelectedClient(); // Выбранный клиент
    const description = descriptionInput.value.trim(); // Описание заказа
    const readyDatetime = readyDatetimeInput.value; // Дата готовности
    
    // Валидация формы
    if (!client) {
        alert('⚠️ Пожалуйста, выберите или введите клиента!'); // Проверяем клиента
        return; // Прерываем если клиент не выбран
    }
    
    if (!description || !readyDatetime) {
        alert('⚠️ Пожалуйста, заполните описание и дату готовности!'); // Проверяем обязательные поля
        return; // Прерываем если поля не заполнены
    }
    
    // Проверяем состояние WebSocket соединения
    if (socket.readyState !== WebSocket.OPEN) {
        alert('❌ Нет соединения с сервером. Попробуйте позже.'); // Показываем ошибку
        return; // Прерываем если нет соединения
    }
    
    // Отправляем данные на сервер в зависимости от типа клиента
    
    // Если клиент выбран из базы данных (есть ID)
    if (client.id) {
        socket.send(JSON.stringify({ // Преобразуем объект в JSON
            action: 'add_order', // Действие: добавление заказа
            client_id: parseInt(client.id), // ID клиента (преобразуем в число)
            description: description, // Описание заказа
            ready_datetime: readyDatetime // Дата готовности
        }));
    } else {
        // Если клиент введен вручную (нет ID)
        socket.send(JSON.stringify({ // Преобразуем объект в JSON
            action: 'add_order', // Действие: добавление заказа
            customer_name: client.name, // Имя клиента (ручной ввод)
            description: description, // Описание заказа
            ready_datetime: readyDatetime // Дата готовности
        }));
    }
    
    clearForm(); // Очищаем форму после отправки
});

// Обработчик клика по кнопке "Очистить" в основной форме
clearBtn.addEventListener('click', function() {
    clearForm(); // Вызываем функцию очистки формы
});

// Обработчик клика по кнопке "Сохранить" в модальном окне редактирования
saveEditBtn.addEventListener('click', function() {
    // Получаем данные из формы редактирования
    const customerName = editCustomerNameInput.value.trim(); // Имя клиента
    const description = editDescriptionInput.value.trim(); // Описание
    const readyDatetime = editReadyDatetimeInput.value; // Дата готовности

    // Валидация формы редактирования
    if (!customerName || !description || !readyDatetime) {
        alert('⚠️ Пожалуйста, заполните все поля!'); // Проверяем все поля
        return; // Прерываем если не все поля заполнены
    }

    // Проверяем состояние WebSocket соединения
    if (socket.readyState !== WebSocket.OPEN) {
        alert('❌ Нет соединения с сервером.'); // Показываем ошибку
        return; // Прерываем если нет соединения
    }

    // Отправляем запрос на обновление заказа через WebSocket
    socket.send(JSON.stringify({ // Преобразуем объект в JSON
        action: 'update_order', // Действие: обновление заказа
        order_number: editingOrderNumber, // Номер редактируемого заказа
        customer_name: customerName, // Новое имя клиента
        description: description, // Новое описание
        ready_datetime: readyDatetime // Новая дата готовности
    }));

    closeEditModal(); // Закрываем модальное окно после сохранения
});

// Обработчик клика по кнопке "Отменить" в модальном окне редактирования
cancelEditBtn.addEventListener('click', closeEditModal);

// Обработчик клика по фону модального окна редактирования (закрытие при клике вне окна)
editModal.addEventListener('click', function(e) {
    if (e.target === editModal) { // Если кликнули по фону (самому modal, а не content)
        closeEditModal(); // Закрываем модальное окно
    }
});

// Обработчик клика по фону модального окна добавления клиента (закрытие при клике вне окна)
addClientModal.addEventListener('click', function(e) {
    if (e.target === addClientModal) { // Если кликнули по фону
        closeAddClientModal(); // Закрываем модальное окно
    }
});

// Обработчики кнопок сортировки

// Обработчик кнопки сортировки по номеру заказа
document.getElementById('sort-by-number').addEventListener('click', function() {
    const btnNumber = document.getElementById('sort-by-number'); // Кнопка сортировки по номеру
    const btnDeadline = document.getElementById('sort-by-deadline'); // Кнопка сортировки по дедлайну
    
    // Если уже сортируем по номеру, меняем направление сортировки
    if (sortBy === 'number') {
        sortDirection *= -1; // Меняем направление на противоположное
    } else {
        // Если сортировали по другому признаку, переключаемся на сортировку по номеру
        sortBy = 'number'; // Устанавливаем способ сортировки
        sortDirection = 1; // Устанавливаем направление по возрастанию
        btnDeadline.classList.remove('active'); // Деактивируем кнопку сортировки по дедлайну
        btnNumber.classList.add('active'); // Активируем кнопку сортировки по номеру
    }
    
    renderActiveOrders(); // Перерисовываем активные заказы с новой сортировкой
});

// Обработчик кнопки сортировки по дедлайну
document.getElementById('sort-by-deadline').addEventListener('click', function() {
    const btnNumber = document.getElementById('sort-by-number'); // Кнопка сортировки по номеру
    const btnDeadline = document.getElementById('sort-by-deadline'); // Кнопка сортировки по дедлайну
    
    // Если уже сортируем по дедлайну, меняем направление сортировки
    if (sortBy === 'deadline') {
        sortDirection *= -1; // Меняем направление на противоположное
    } else {
        // Если сортировали по другому признаку, переключаемся на сортировку по дедлайну
        sortBy = 'deadline'; // Устанавливаем способ сортировки
        sortDirection = 1; // Устанавливаем направление по возрастанию
        btnNumber.classList.remove('active'); // Деактивируем кнопку сортировки по номеру
        btnDeadline.classList.add('active'); // Активируем кнопку сортировки по дедлайну
    }
    
    renderActiveOrders(); // Перерисовываем активные заказы с новой сортировкой
});

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (дополнительные утилиты) =====

/**
 * Очищает форму добавления заказа
 * Сбрасывает все поля формы к значениям по умолчанию
 */
function clearForm() {
    clientSelect.value = ''; // Сбрасываем выбор клиента
    customerNameInput.value = ''; // Очищаем поле ручного ввода клиента
    descriptionInput.value = ''; // Очищаем поле описания
    readyDatetimeInput.value = ''; // Очищаем поле даты готовности
    setDefaultDateTime(); // Устанавливаем дату по умолчанию
    toggleManualClientInput(); // Обновляем отображение поля ручного ввода
}

/**
 * Определяет следующий рабочий день (понедельник-пятница)
 * Используется для установки даты готовности по умолчанию
 * @returns {Date} дата следующего рабочего дня в 15:00
 */
function getNextBusinessDay() {
    const tomorrow = new Date(); // Начинаем с завтрашнего дня
    tomorrow.setDate(tomorrow.getDate() + 1); // Добавляем 1 день
    
    // Пропускаем выходные (суббота = 6, воскресенье = 0)
    while (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) {
        tomorrow.setDate(tomorrow.getDate() + 1); // Добавляем еще день
    }
    
    // Устанавливаем время на 15:00
    tomorrow.setHours(15, 0, 0, 0);
    
    return tomorrow; // Возвращаем дату
}

/**
 * Устанавливает дату по умолчанию в поле "Дата готовности"
 * Использует следующий рабочий день в 15:00 как значение по умолчанию
 */
function setDefaultDateTime() {
    const nextBusinessDay = getNextBusinessDay(); // Получаем следующий рабочий день
    
    // Форматируем дату в формат "гггг-мм-ддTчч:мм" для input[type="datetime-local"]
    const year = nextBusinessDay.getFullYear(); // Год (4 цифры)
    const month = String(nextBusinessDay.getMonth() + 1).padStart(2, '0'); // Месяц (01-12)
    const day = String(nextBusinessDay.getDate()).padStart(2, '0'); // День (01-31)
    const hours = String(nextBusinessDay.getHours()).padStart(2, '0'); // Часы (00-23)
    const minutes = String(nextBusinessDay.getMinutes()).padStart(2, '0'); // Минуты (00-59)
    
    // Устанавливаем значение в поле ввода
    readyDatetimeInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Запускает автоматическое обновление списка заказов
 * Отправляет запрос на обновление данных каждую минуту
 */
function startAutoRefresh() {
    // Устанавливаем интервал для автоматического обновления
    setInterval(() => {
        // Проверяем что WebSocket соединение открыто
        if (socket.readyState === WebSocket.OPEN) {
            // Отправляем запрос на обновление заказов
            socket.send(JSON.stringify({
                action: 'refresh_orders' // Действие: обновить заказы
            }));
        }
    }, 60000); // 60000 миллисекунд = 1 минута
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ (запуск при загрузке страницы) =====

// Устанавливаем соединение с WebSocket сервером
connect();

// Устанавливаем дату по умолчанию в поле даты готовности
setDefaultDateTime();

// Запускаем автоматическое обновление списка заказов
startAutoRefresh();

// Загружаем клиентов при загрузке страницы (с небольшой задержкой)
document.addEventListener('DOMContentLoaded', function() {
    // Устанавливаем задержку чтобы WebSocket успел подключиться
    setTimeout(() => {
        // Проверяем что WebSocket соединение открыто
        if (socket.readyState === WebSocket.OPEN) {
            // Запрашиваем обновление данных (включая клиентов)
            socket.send(JSON.stringify({
                action: 'refresh_orders' // Действие: обновить заказы
            }));
        }
    }, 1000); // 1000 миллисекунд = 1 секунда
});