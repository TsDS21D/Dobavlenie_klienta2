/*
proschety/static/proschety/js/sections/order_banner.js
Логика плашки «Создание просчёта для заказа» и «Редактирование изделия».

ДВА РЕЖИМА:
  1. Создание просчёта для заказа — в URL только ?order_id=X.
     Логика: плашка «Создать просчёт для Заказа ORD-N» + кнопка
     «Сохранить как изделие в заказ», которая добавляет изделие
     через /orders/api/add-to-order/.

  2. Редактирование изделия — в URL есть ?edit_product_id=Y&proschet_id=X.
     Логика: плашка «Вы редактируете изделие из заказа ORD-N» +
     две кнопки: «Сохранить как изделие» (замена) и «Отмена».
     Сохранение идёт через /orders/api/replace-product-in-order/,
     отмена — через /orders/api/cancel-edit/.

Режимы взаимоисключающие: если есть edit_product_id — работаем
в режиме 2, а в режим 1 (даже если там есть order_id) не идём.
*/

"use strict";

(function () {

    // ВРЕМЕННАЯ ДИАГНОСТИКА — удалить после проверки.
    console.log('🔍 order_banner.js: старт');
    console.log('🔍 URL:', window.location.search);

    // ========================================================================
    // 1. ЧТЕНИЕ URL-ПАРАМЕТРОВ.
    // ========================================================================

    // Единый объект URLSearchParams — читаем все параметры один раз.
    const urlParams = new URLSearchParams(window.location.search);

    // ID заказа (для режима «Создание просчёта для заказа»).
    const targetOrderId = urlParams.get('order_id');

    // ID изделия, которое редактируется (для режима «Редактирование»).
    const editProductId = urlParams.get('edit_product_id');

    // ID размороженного просчёта (для режима «Редактирование»).
    const proschetIdFromUrl = urlParams.get('proschet_id');

    // Куда вернуться после сохранения/отмены (для режима «Редактирование»).
    const returnTo = urlParams.get('return_to');


    // ========================================================================
    // 2. РЕЖИМ «РЕДАКТИРОВАНИЕ ИЗДЕЛИЯ».
    // ========================================================================
    // Включается, если в URL есть и edit_product_id, и proschet_id.

    if (editProductId && proschetIdFromUrl) {
        // ВРЕМЕННАЯ ДИАГНОСТИКА — удалить после проверки.
        console.log('🔍 order_banner.js: режим редактирования активен',
                    { editProductId, proschetIdFromUrl, returnTo });

        // --- Локальная вспомогательная функция ---
        // Извлекает order_id из return_to. Поддерживает два формата:
        //   /orders/45/                → '45'
        //   /orders/?expanded_order=45 → '45'
        // Если формат незнаком — возвращает null.
        function extractOrderIdFromReturnTo(rt) {
            if (!rt) return null;
            // Первый вариант: /orders/45/ — ID в сегменте пути.
            let m = rt.match(/\/orders\/(\d+)\//);
            if (m) return m[1];
            // Второй вариант: ?expanded_order=45 — ID в query.
            m = rt.match(/[?&]expanded_order=(\d+)/);
            if (m) return m[1];
            // Не распознали — null.
            return null;
        }

        // --- Находим плашку ---
        // В шаблоне proschety/index.html есть <div id="proschety-order-banner">.
        // Если её нет — молча выходим (значит, шаблон другой).
        const bannerEl = document.getElementById('proschety-order-banner');
        if (!bannerEl) return;

        // --- Определяем order_id из return_to ---
        // Пригодится, чтобы показать номер заказа в тексте плашки.
        const orderIdFromReturn = extractOrderIdFromReturnTo(returnTo);

        // --- Принудительно показываем плашку ---
        // В шаблоне она по умолчанию скрыта (display: none).
        bannerEl.style.display = 'flex';

        // --- Перезаписываем содержимое плашки ---
        // Старая разметка (создание просчёта) в этом режиме не нужна —
        // очищаем и строим новую программно. Это безопасно: режим
        // «Создание» и «Редактирование» взаимоисключающие, и старый код
        // до этой ветки уже не дойдёт (см. return в конце блока).

        bannerEl.innerHTML = '';                          // Чистим старые узлы.
        bannerEl.style.alignItems = 'center';             // Выравнивание по центру.
        bannerEl.style.gap = '0.8rem';                    // Отступы между элементами.
        bannerEl.style.flexWrap = 'wrap';                 // Перенос на узком экране.

        // --- Текст плашки: «Вы редактируете изделие из заказа ORD-N» ---
        // Строим через DOM-узлы, а не через innerHTML со строкой:
        // так проще поддерживать и безопаснее (нет риска XSS).
        const textEl = document.createElement('span');
        // Показываем префикс.
        textEl.textContent = 'Вы редактируете изделие из заказа ';

        // Спан для номера заказа — сейчас пустой, заполним после запроса
        // (или оставим пустым, если order_id не удалось извлечь).
        const orderNumSpan = document.createElement('strong');
        orderNumSpan.id = 'proschety-edit-order-number';
        // Моноширинный шрифт — как у номеров ORD-N в /orders/.
        orderNumSpan.style.fontFamily = "'Courier New', monospace";
        // Если order_id известен — сразу ставим «ORD-N» (без запроса).
        // Запрос ниже уточнит настоящий номер (на случай, если ID != номер,
        // хотя в модели Order number = "ORD-<id>").
        if (orderIdFromReturn) {
            orderNumSpan.textContent = 'ORD-' + orderIdFromReturn;
        }
        textEl.appendChild(orderNumSpan);
        bannerEl.appendChild(textEl);

        // --- Кнопка «Сохранить как изделие» ---
        // Классы копируем у существующей кнопки #proschety-btn-add-to-order
        // (она в шаблоне и стилизована). Так новая кнопка будет выглядеть
        // единообразно, без риска рассинхронизации стилей.
        const btnSave = document.createElement('button');
        btnSave.type = 'button';
        const existingAddBtn = document.getElementById('proschety-btn-add-to-order');
        if (existingAddBtn) {
            btnSave.className = existingAddBtn.className;
        }
        btnSave.textContent = 'Сохранить как изделие';
        bannerEl.appendChild(btnSave);

        // --- Кнопка «Отмена» ---
        // Стилизуем inline: у нас нет в proschety/css готового класса
        // для secondary-кнопки. Inline даёт независимость от CSS.
        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.textContent = 'Отмена';
        btnCancel.style.cssText = [
            'padding: 6px 14px',
            'background: #fff',
            'color: #555',
            'border: 1px solid #d0d0d0',
            'border-radius: 6px',
            'font-size: 0.85rem',
            'font-weight: 600',
            'cursor: pointer',
            'font-family: inherit',
            'margin-left: 0.5rem'
        ].join(';');
        bannerEl.appendChild(btnCancel);

        // --- Уточняем номер заказа запросом (если знаем order_id) ---
        // Это не критично: если запрос упадёт, в span уже стоит «ORD-<id>».
        if (orderIdFromReturn) {
            fetch('/orders/api/order-info/' + orderIdFromReturn + '/', {
                method: 'GET',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success && data.order && data.order.number) {
                    orderNumSpan.textContent = data.order.number;
                }
            })
            .catch(function () { /* молча — fallback уже стоит */ });
        }

        // --- Обработчик кнопки «Сохранить как изделие» ---
        btnSave.addEventListener('click', function () {
            // Блокируем обе кнопки — чтобы не было двойного клика.
            const originalText = btnSave.textContent;
            btnSave.disabled = true;
            btnCancel.disabled = true;
            btnSave.textContent = 'Сохранение…';

            // POST /orders/api/replace-product-in-order/.
            // Передаём:
            //   • proschet_id    — отредактированный просчёт (из URL);
            //   • old_product_id — изделие, которое заменяем (из URL).
            fetch('/orders/api/replace-product-in-order/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': getCsrfToken()   // см. функцию внизу файла
                },
                body: JSON.stringify({
                    proschet_id: proschetIdFromUrl,
                    old_product_id: editProductId
                })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    // Уведомление о разнице цен (если есть).
                    if (data.price_changed) {
                        // Сервер возвращает old_price / new_price как строки
                        // «1250.00» / «1330.50». Приводим к числу и форматируем.
                        const oldP = parseFloat(data.old_price).toFixed(2);
                        const newP = parseFloat(data.new_price).toFixed(2);
                        showNotification(
                            'Цена изменилась с ' + oldP + ' ₽ на ' + newP + ' ₽',
                            'success'
                        );
                    } else {
                        showNotification('Изделие обновлено', 'success');
                    }

                    // Редирект на return_to (или fallback в /orders/).
                    // Задержка 600 мс — чтобы пользователь увидел уведомление.
                    const redirectUrl = returnTo || (
                        orderIdFromReturn
                            ? '/orders/?expanded_order=' + orderIdFromReturn
                            : '/orders/'
                    );
                    setTimeout(function () {
                        window.location.href = redirectUrl;
                    }, 600);
                } else {
                    // Ошибка сервера — разблокируем кнопки.
                    showNotification(data.error || 'Ошибка сохранения', 'error');
                    btnSave.disabled = false;
                    btnCancel.disabled = false;
                    btnSave.textContent = originalText;
                }
            })
            .catch(function (err) {
                console.error(err);
                showNotification('Ошибка сети при сохранении', 'error');
                btnSave.disabled = false;
                btnCancel.disabled = false;
                btnSave.textContent = originalText;
            });
        });

        // --- Обработчик кнопки «Отмена» ---
        btnCancel.addEventListener('click', function () {
            btnSave.disabled = true;
            btnCancel.disabled = true;
            btnCancel.textContent = 'Отмена…';

            // POST /orders/api/cancel-edit/ — мягко удаляет временный просчёт.
            fetch('/orders/api/cancel-edit/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({ proschet_id: proschetIdFromUrl })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                // Редирект на return_to. Fallback:
                //   • return_to из URL;
                //   • data.return_to с сервера (он формируется по source_order);
                //   • /orders/.
                const redirectUrl = returnTo
                    || (data && data.success && data.return_to)
                    || '/orders/';
                window.location.href = redirectUrl;
            })
            .catch(function (err) {
                console.error(err);
                // Даже при ошибке возвращаем пользователя — не оставляем
                // его в подвешенном состоянии на странице просчёта.
                window.location.href = returnTo || '/orders/';
            });
        });

        // ВАЖНО: выходим из IIFE. Ниже идёт режим «Создание»,
        // который нам не нужен.
        return;
    }


    // ========================================================================
    // 3. РЕЖИМ «СОЗДАНИЕ ПРОСЧЁТА ДЛЯ ЗАКАЗА» (как раньше).
    // ========================================================================
    // Включается, если есть order_id и НЕТ edit_product_id
    // (иначе до этого места мы бы не дошли — return выше).

    if (!targetOrderId) return; // Если order_id нет — скрипт не работает.

    // Записываем ID заказа в скрытое поле формы создания просчёта.
    // Теперь при нажатии «Создать просчёт» сервер узнает, к какому заказу он привязан.
    const sourceOrderInput = document.getElementById('list-proschet-create-source-order');
    if (sourceOrderInput) {
        sourceOrderInput.value = targetOrderId;
    }

    const bannerEl = document.getElementById('proschety-order-banner');
    const orderNumberEl = document.getElementById('proschety-order-number');
    const btnAddToOrder = document.getElementById('proschety-btn-add-to-order');

    if (!bannerEl || !orderNumberEl || !btnAddToOrder) return;

    // 1. Показываем плашку и запрашиваем номер заказа.
    bannerEl.style.display = 'flex';

    fetch('/orders/api/order-info/' + targetOrderId + '/', {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
        if (data.success) {
            orderNumberEl.textContent = data.order.number;

            // ПРЕДЗАПОЛНЕНИЕ КЛИЕНТА.
            if (data.order.client_id) {
                const clientSelect = document.getElementById('list-proschet-create-client');
                if (clientSelect) {
                    clientSelect.value = String(data.order.client_id);
                }
            }
        } else {
            orderNumberEl.textContent = '#' + targetOrderId;
        }
    })
    .catch(function () {
        orderNumberEl.textContent = '#' + targetOrderId;
    });

    // 2. Обработчик кнопки «Сохранить как изделие в заказ».
    btnAddToOrder.addEventListener('click', function () {
        // Получаем ID текущего активного просчёта
        // (переменная currentProschetId живёт внутри proschet_summary.js).
        let proschetId = null;
        if (window.priceSection && typeof window.priceSection.getCurrentProschetId === 'function') {
            proschetId = window.priceSection.getCurrentProschetId();
        }

        if (!proschetId) {
            showNotification('Сначала выберите или создайте просчёт', 'warning');
            return;
        }

        const originalText = btnAddToOrder.textContent;
        btnAddToOrder.disabled = true;
        btnAddToOrder.textContent = 'Добавление...';

        // Отправляем запрос в orders.
        fetch('/orders/api/add-to-order/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                proschet_id: proschetId,
                order_id: targetOrderId
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                showNotification('Изделие успешно добавлено в заказ ' + orderNumberEl.textContent, 'success');
                btnAddToOrder.textContent = 'Добавлено!';

                // ПЕРЕНАПРАВЛЕНИЕ В СПИСОК ЗАКАЗОВ С АВТОРАСКРЫТИЕМ.
                setTimeout(function () {
                    window.location.href = '/orders/?expanded_order=' + targetOrderId;
                }, 500);
            } else {
                showNotification(data.error || 'Ошибка добавления', 'error');
                btnAddToOrder.disabled = false;
                btnAddToOrder.textContent = originalText;
            }
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при добавлении', 'error');
            btnAddToOrder.disabled = false;
            btnAddToOrder.textContent = originalText;
        });
    });


    // ========================================================================
    // 4. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ.
    // ========================================================================

    /**
     * Достаёт CSRF-токен из cookie csrftoken.
     * Используется во всех POST-запросах этого файла.
     */
    function getCsrfToken() {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const c = cookies[i].trim();
            if (c.indexOf('csrftoken=') === 0) {
                return decodeURIComponent(c.substring('csrftoken='.length));
            }
        }
        return '';
    }

    /**
     * Показывает кратковременное уведомление.
     * Приоритет — глобальная window.showTopNotification (если есть
     * в proschety). Иначе — локальная реализация через контейнер
     * #proschety-top-notifications.
     */
    function showNotification(msg, type) {
        // Если в proschety есть глобальная функция — используем её.
        if (typeof window.showTopNotification === 'function') {
            window.showTopNotification(msg, type);
            return;
        }
        // Локальная реализация.
        const container = document.getElementById('proschety-top-notifications');
        if (!container) return;
        const box = document.createElement('div');
        box.className = 'proschety-top-notification';
        if (type === 'error') box.classList.add('proschety-top-notification-error');
        if (type === 'warning') box.classList.add('proschety-top-notification-warning');
        box.textContent = msg;
        container.appendChild(box);
        setTimeout(function () {
            box.classList.add('proschety-top-notification-out');
            setTimeout(function () { box.remove(); }, 300);
        }, 2500);
    }

})();