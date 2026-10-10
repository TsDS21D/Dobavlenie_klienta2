/*
calculator/static/calculator/js/sections/price_orders.js
Подключает к секции «Цена» две новые кнопки:
- «Создать новый заказ» — создаёт заказ из текущего просчёта и уходит
  на страницу /orders/, где пользователь правит комментарий.
- «Добавить в имеющийся» — открывает модалку со списком всех активных
  (не удалённых) заказов. Если список пуст — показывает сообщение
  «подходящих активных заказов нет, создайте новый».

Файл работает как обёртка над API-эндпоинтами приложения orders:
    POST /orders/api/create-from-proschet/  — создать заказ из просчёта
    POST /orders/api/add-to-order/          — добавить изделие в заказ
    GET  /orders/api/all-orders/            — список активных заказов

Подробные комментарии к каждой строке — для понимания новичками.
*/

"use strict";

(function () {

    // ========================================================================
    // 1. КОНСТАНТЫ — URL-адреса API приложения orders
    // ========================================================================

    // Эндпоинт: создать НОВЫЙ заказ из просчёта.
    var API_CREATE_ORDER = '/orders/api/create-from-proschet/';

    // Эндпоинт: добавить изделие в СУЩЕСТВУЮЩИЙ заказ.
    var API_ADD_TO_ORDER = '/orders/api/add-to-order/';

    // Эндпоинт: список всех активных (не удалённых) заказов.
    var API_ALL_ORDERS = '/orders/api/all-orders/';


    // ========================================================================
    // 2. УТИЛИТЫ
    // ========================================================================

    /**
     * Возвращает CSRF-токен.
     * Сначала пытаемся взять из <meta name="csrf-token">, если её нет —
     * из cookie csrftoken (стандартный путь Django).
     *
     * @returns {string} CSRF-токен или пустая строка.
     */
    function getCsrfToken() {
        // Пытаемся найти мета-тег.
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) {
            return meta.getAttribute('content') || '';
        }
        // Если мета-тега нет — ищем в cookies.
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var c = cookies[i].trim();
            if (c.indexOf('csrftoken=') === 0) {
                return decodeURIComponent(c.substring('csrftoken='.length));
            }
        }
        // Ничего не нашли — возвращаем пустую строку.
        console.warn('CSRF-токен не найден');
        return '';
    }

    /**
     * Получает ID текущего выбранного просчёта.
     * Сначала через глобальный объект priceSection, затем — резервно
     * через DOM-элемент selected-proschet-badge.
     *
     * @returns {string|null} ID просчёта или null.
     */
    function getCurrentProschetId() {
        // Основной путь — через API секции «Цена».
        if (window.priceSection && typeof window.priceSection.getCurrentProschetId === 'function') {
            var id = window.priceSection.getCurrentProschetId();
            if (id) return id;
        }
        // Резервный путь — бейдж в секции «Клиент».
        var badge = document.getElementById('selected-proschet-badge');
        if (badge && badge.dataset && badge.dataset.proschetId) {
            return badge.dataset.proschetId;
        }
        return null;
    }

    /**
     * Показывает всплывающее уведомление в правом верхнем углу.
     * Стиль — минимальный, чтобы не конфликтовать с существующими.
     *
     * @param {string} message — текст сообщения.
     * @param {string} type — 'success' | 'error' | 'warning' | 'info'.
     */
    function showNotification(message, type) {
        // Цвет и иконка по типу сообщения.
        var bg = '#2196F3';        // синий по умолчанию
        var icon = 'ℹ️';
        if (type === 'success') { bg = '#0B8661'; icon = '✅'; }
        else if (type === 'error') { bg = '#e74c3c'; icon = '❌'; }
        else if (type === 'warning') { bg = '#f39c12'; icon = '⚠️'; }

        // Создаём контейнер уведомления.
        var box = document.createElement('div');
        box.style.cssText = [
            'position: fixed',
            'top: 20px',
            'right: 20px',
            'max-width: 340px',
            'padding: 12px 18px',
            'background: ' + bg,
            'color: #fff',
            'border-radius: 8px',
            'box-shadow: 0 6px 20px rgba(0,0,0,0.2)',
            'font-family: inherit',
            'font-size: 1rem',
            'z-index: 10000',
            'opacity: 0',
            'transition: opacity 0.25s ease',
            'cursor: pointer'
        ].join(';');
        box.textContent = icon + ' ' + message;
        document.body.appendChild(box);

        // Плавное появление.
        setTimeout(function () { box.style.opacity = '1'; }, 20);

        // Автоскрытие через 5 секунд (или раньше — по клику).
        var hide = function () {
            box.style.opacity = '0';
            setTimeout(function () {
                if (box.parentNode) box.parentNode.removeChild(box);
            }, 300);
        };
        box.addEventListener('click', hide);
        setTimeout(hide, 5000);
    }


    // ========================================================================
    // 3. КНОПКА «СОЗДАТЬ НОВЫЙ ЗАКАЗ»
    // ========================================================================

    /**
     * Обработчик клика по кнопке «Создать новый заказ».
     * 1. Проверяет, что просчёт выбран.
     * 2. Спрашивает подтверждение.
     * 3. Отправляет POST на /orders/api/create-from-proschet/.
     * 4. После успеха уходит на /orders/ (там правится комментарий).
     */
    function handleCreateNewOrder() {
        // 1. Проверяем, что просчёт выбран.
        var proschetId = getCurrentProschetId();
        if (!proschetId) {
            showNotification('Сначала выберите просчёт', 'warning');
            return;
        }


        // 3. POST-запрос к API.
        fetch(API_CREATE_ORDER, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ proschet_id: proschetId })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                showNotification('Ошибка: ' + (data.error || 'неизвестная ошибка'), 'error');
                return;
            }
            // Успех — показываем сообщение и через полсекунды уходим
            // на страницу заказов, где пользователь отредактирует комментарий.
            showNotification('Заказ ' + data.order_number + ' создан', 'success');
            setTimeout(function () {
                window.location.href = '/orders/';
            }, 600);
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при создании заказа', 'error');
        });
    }


    // ========================================================================
    // 4. МОДАЛКА ВЫБОРА ЗАКАЗА
    // ========================================================================

    /**
     * Открывает модалку со списком заказов для выбора.
     *
     * @param {Array} orders — массив объектов {id, number, client_name,
     *                        created_at, products_count, formatted_total_price}.
     * @param {string|number} proschetId — ID просчёта, из которого
     *                                     создаётся изделие.
     */
    function openOrderPickerModal(orders, proschetId) {

        // ===== Создаём оверлей (затемнённый фон) =====
        var overlay = document.createElement('div');
        overlay.style.cssText = [
            'position: fixed',
            'top: 0', 'left: 0', 'right: 0', 'bottom: 0',
            'background: rgba(0,0,0,0.45)',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'z-index: 10001',
            'font-family: inherit'
        ].join(';');

        // ===== Создаём карточку модалки =====
        var card = document.createElement('div');
        card.style.cssText = [
            'background: #fff',
            'border-radius: 12px',
            'max-width: 720px',
            'width: 90%',
            'max-height: 80vh',
            'display: flex',
            'flex-direction: column',
            'box-shadow: 0 12px 36px rgba(0,0,0,0.25)'
        ].join(';');

        // ----- Заголовок -----
        var header = document.createElement('div');
        header.style.cssText = [
            'padding: 1rem 1.5rem',
            'border-bottom: 1px solid #e0e0e0',
            'display: flex',
            'justify-content: space-between',
            'align-items: center'
        ].join(';');
        header.innerHTML =
            '<h3 style="margin:0;font-size:1.2rem;color:#333;">' +
                'Выберите заказ' +
            '</h3>';

        // Кнопка «закрыть» (крестик).
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.cssText = [
            'background: none',
            'border: none',
            'font-size: 1.8rem',
            'line-height: 1',
            'cursor: pointer',
            'color: #888',
            'padding: 0 6px'
        ].join(';');
        header.appendChild(closeBtn);

        card.appendChild(header);

        // ----- Тело: список заказов -----
        var body = document.createElement('div');
        body.style.cssText = [
            'padding: 1rem 1.5rem',
            'overflow-y: auto',
            'flex: 1'
        ].join(';');

        orders.forEach(function (order) {
            var row = document.createElement('div');
            row.style.cssText = [
                'padding: 0.8rem 1rem',
                'border: 1px solid #e0e0e0',
                'border-radius: 8px',
                'margin-bottom: 0.6rem',
                'cursor: pointer',
                'transition: border-color 0.15s ease, box-shadow 0.15s ease',
                'background: #fafafa'
            ].join(';');

            row.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">' +
                    '<div>' +
                        '<div style="font-weight:600;color:#0B8661;">' + order.number + '</div>' +
                        '<div style="font-size:0.9rem;color:#555;margin-top:2px;">' +
                            order.client_name +
                        '</div>' +
                        '<div style="font-size:0.85rem;color:#888;margin-top:2px;">' +
                            'от ' + order.created_at +
                        '</div>' +
                    '</div>' +
                    '<div style="text-align:right;">' +
                        '<div style="font-weight:600;">' + order.formatted_total_price + '</div>' +
                        '<div style="font-size:0.85rem;color:#888;">' +
                            'изделий: ' + order.products_count +
                        '</div>' +
                    '</div>' +
                '</div>';

            // Наведение — подсветка зелёной рамкой (акцентный цвет проекта).
            row.addEventListener('mouseenter', function () {
                row.style.borderColor = '#0B8661';
                row.style.boxShadow = '0 0 0 2px rgba(11,134,97,0.15)';
            });
            row.addEventListener('mouseleave', function () {
                row.style.borderColor = '#e0e0e0';
                row.style.boxShadow = 'none';
            });

            // Клик по заказу — отправляем изделие в этот заказ.
            row.addEventListener('click', function () {
                addToOrder(order, proschetId, overlay);
            });

            body.appendChild(row);
        });

        card.appendChild(body);

        // ----- Кнопка «Отмена» внизу -----
        var footer = document.createElement('div');
        footer.style.cssText = [
            'padding: 0.8rem 1.5rem',
            'border-top: 1px solid #e0e0e0',
            'text-align: right'
        ].join(';');

        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Отмена';
        cancelBtn.style.cssText = [
            'padding: 0.5rem 1.2rem',
            'border: 1px solid #ccc',
            'background: #fff',
            'border-radius: 6px',
            'cursor: pointer',
            'font-family: inherit',
            'font-size: 0.95rem',
            'color: #555'
        ].join(';');
        footer.appendChild(cancelBtn);
        card.appendChild(footer);

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // ----- Закрытие модалки -----
        function closeModal() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', function (e) {
            // Закрываем только если кликнули по самому оверлею, не по карточке.
            if (e.target === overlay) closeModal();
        });
    }


    // ========================================================================
    // 5. ДОБАВЛЕНИЕ ИЗДЕЛИЯ В ВЫБРАННЫЙ ЗАКАЗ
    // ========================================================================

    /**
     * Отправляет POST-запрос на /orders/api/add-to-order/.
     *
     * @param {Object} order — выбранный заказ.
     * @param {string|number} proschetId — ID просчёта-источника.
     * @param {HTMLElement} overlay — модальный оверлей (закроем при успехе).
     */
    function addToOrder(order, proschetId, overlay) {
        fetch(API_ADD_TO_ORDER, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                proschet_id: proschetId,
                order_id: order.id
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                showNotification('Ошибка: ' + (data.error || 'неизвестная ошибка'), 'error');
                return;
            }
            // Успех — закрываем модалку, показываем сообщение
            // и через полсекунды уходим на страницу заказов.
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            showNotification('Изделие добавлено в заказ ' + data.order_number, 'success');
            setTimeout(function () {
                window.location.href = '/orders/';
            }, 600);
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при добавлении в заказ', 'error');
        });
    }


    // ========================================================================
    // 6. КНОПКА «ДОБАВИТЬ В ИМЕЮЩИЙСЯ»
    // ========================================================================

    /**
     * Обработчик клика по кнопке «Добавить в имеющийся».
     * 1. Проверяет, что просчёт выбран.
     * 2. Загружает список активных заказов.
     * 3. Если список пуст — показывает сообщение.
     * 4. Иначе — открывает модалку выбора.
     */
    function handleAddToExisting() {
        // 1. Проверяем, что просчёт выбран.
        var proschetId = getCurrentProschetId();
        if (!proschetId) {
            showNotification('Сначала выберите просчёт', 'warning');
            return;
        }

        // 2. Загружаем список активных заказов.
        fetch(API_ALL_ORDERS, {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                showNotification('Не удалось загрузить список заказов', 'error');
                return;
            }

            // 3. Список пуст — сообщаем пользователю.
            if (!data.orders || data.orders.length === 0) {
                window.alert('Подходящих активных заказов нет, создайте новый.');
                return;
            }

            // 4. Открываем модалку выбора.
            openOrderPickerModal(data.orders, proschetId);
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при загрузке заказов', 'error');
        });
    }


    // ========================================================================
    // 7. ИНИЦИАЛИЗАЦИЯ — подписываемся на кнопки после загрузки DOM
    // ========================================================================

    document.addEventListener('DOMContentLoaded', function () {
        // Кнопка «Создать новый заказ».
        var createBtn = document.getElementById('create-new-order-btn');
        if (createBtn) {
            createBtn.addEventListener('click', handleCreateNewOrder);
        }

        // Кнопка «Добавить в имеющийся».
        var addBtn = document.getElementById('add-to-existing-order-btn');
        if (addBtn) {
            addBtn.addEventListener('click', handleAddToExisting);
        }
    });

})();