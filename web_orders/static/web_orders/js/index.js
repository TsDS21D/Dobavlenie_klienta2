/* ============================================================
   web_orders/static/web_orders/js/index.js
   Логика страницы «Заявки с сайта» (/web-orders/).

   ЧТО ДЕЛАЕТ СЕЙЧАС:
     - «Отклонить» — переводит заявку в статус «Отклонена» (AJAX);
     - «Вернуть»   — возвращает отклонённую заявку в «Новые» (AJAX);
     - после любого действия страница обновляется без перезагрузки.

   ЧЕГО ПОКА НЕТ:
     - «Конвертировать в заказ» — кнопка неактивна;
     - WebSocket-обновлений (появятся вместе с иконкой-глобусом).

   ПОЧЕМУ IIFE:
   файл подключается обычным <script>, без модулей, поэтому вся логика
   завёрнута в функцию, чтобы не засорять глобальную область видимости
   (в проекте так же сделаны list_orders.js и detail.js).
   ============================================================ */

(function () {
    'use strict';

    /* ------------------------------------------------------------
       ОПИСАНИЕ ДЕЙСТВИЙ.

       Оба действия устроены одинаково: POST на свой адрес, JSON в ответ,
       затем перерисовка. Поэтому держим их в одном словаре, а не пишем
       две почти одинаковые функции.

       url          — адрес API, к которому дописывается <id>/;
       cssClass     — класс кнопки, по которому ловим клик;
       confirmText  — текст подтверждения; null = спросить не надо;
       successText  — что показать в тосте после успеха.
       ------------------------------------------------------------ */
    var ACTIONS = {
        reject: {
            url: '/web-orders/api/reject/',
            cssClass: 'web-orders-btn--reject',
            // Отклонение меняет статус, и вернуть заявку можно только
            // кнопкой «Вернуть» (в админку ходить не нужно), но
            // подтверждение всё равно полезно: карточка уезжает из
            // рабочей группы, и это легко заметить не сразу.
            confirmText: 'Отклонить заявку?',
            successText: 'Заявка отклонена'
        },
        restore: {
            url: '/web-orders/api/restore/',
            cssClass: 'web-orders-btn--restore',
            // Возврат — безопасное действие, оно ничего не теряет,
            // поэтому лишний диалог только мешает.
            confirmText: null,
            successText: 'Заявка возвращена в работу'
        },
        convert: {
            url: '/web-orders/api/convert/',
            cssClass: 'web-orders-btn--convert',
            // Подтверждение отключено по решению заказчика: диалог
            // на каждую конвертацию мешает работе.
            // ВАЖНО: действие необратимо — заявка уходит в «Конвертирована»,
            // создаётся заказ, вернуть заявку в работу нельзя.
            confirmText: null,
            // Текст собираем из ответа сервера: номер заказа (ORD-N)
            // заранее неизвестен, его присваивает база.
            successText: function (data) {
                return 'Создан заказ ' + data.order_number;
            }
        },
        delete: {
            url: '/web-orders/api/delete/',
            cssClass: 'web-orders-btn--delete',
            // Подтверждение — своя модалка (разметка в шаблоне), а не
            // window.confirm: браузерный диалог выбивается из оформления ИС.
            confirmModalId: 'web-orders-delete-confirm',
            successText: 'Заявка удалена'
        }
    };

    /* ------------------------------------------------------------
       CSRF-токен.

       ЗАЧЕМ: запрос идёт со своей страницы, поэтому Django проверяет
       CSRF. Токен уже лежит в <meta name="csrf-token"> (это в
       orders/base.html), остаётся прочитать его и положить в заголовок
       X-CSRFToken.

       ПОЧЕМУ НЕ ИЗ ПЕЧЕНЬКИ: cookie csrftoken существует, но читать её
       из JS неудобно (нужен разбор document.cookie), а meta — надёжнее
       и работает даже если cookie названа иначе (CSRF_COOKIE_NAME).
       ------------------------------------------------------------ */
    function getCsrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    /* ------------------------------------------------------------
       Всплывающее уведомление (тост).

       Рисуем в правом нижнем углу, чтобы не перекрывать карточки и
       правую панель навигации. Стили — в index.css, здесь только
       разметка и таймер.

       type: 'success' (зелёный) или 'error' (красный).
       ------------------------------------------------------------ */
    function showToast(message, type) {
        // Контейнер создаём один раз и переиспользуем: так тосты
        // выстраиваются друг под другом, а не накладываются.
        var container = document.querySelector('.web-orders-toasts');
        if (!container) {
            container = document.createElement('div');
            container.className = 'web-orders-toasts';
            document.body.appendChild(container);
        }

        var toast = document.createElement('div');
        toast.className = 'web-orders-toast web-orders-toast--' + (type || 'success');
        toast.textContent = message;
        container.appendChild(toast);

        // Убираем через 2.5 секунды. Сначала добавляем класс анимации
        // исчезновения, потом (через 200 мс) удаляем элемент из DOM.
        setTimeout(function () {
            toast.classList.add('web-orders-toast--hide');
            setTimeout(function () {
                toast.remove();
            }, 200);
        }, 2500);
    }

    /* ------------------------------------------------------------
       Обновление содержимого страницы без полной перезагрузки.

       КАК РАБОТАЕТ:
         1. запрашиваем ту же страницу обычным GET;
         2. парсим HTML в отдельный документ;
         3. берём из него свежий <section id="web-orders-page">
            и подменяем им текущий.

       ПОЧЕМУ ТАК, А НЕ РУЧНОЕ ПЕРЕМЕЩЕНИЕ КАРТОЧКИ:
       при ручном перемещении пришлось бы вручную же пересчитывать
       счётчики групп, чипы, скрывать опустевшие группы и создавать
       отсутствующие. Это десятки строк хрупкого кода, который
       разъедется с шаблоном при первой правке вёрстки. Здесь же
       источник истины один — Django-шаблон: что он отрисовал, то и
       показано. Плата — один лишний GET на редкое действие.
       ------------------------------------------------------------ */
    function refreshSection(openCardIds) {
        return fetch(window.location.pathname, {
            method: 'GET',
            // Заголовок нужен, чтобы сервер (и прокси) точно не отдали
            // закэшированную копию страницы.
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            cache: 'no-store'
        })
            .then(function (response) { return response.text(); })
            .then(function (html) {
                var parser = new DOMParser();
                var freshDoc = parser.parseFromString(html, 'text/html');

                var freshSection = freshDoc.querySelector('#web-orders-page');
                var currentSection = document.querySelector('#web-orders-page');

                // Если разметка почему-то не совпала (например, сервер
                // вернул страницу ошибки) — молча выходим: карточка
                // останется на месте, пользователь ничего не потеряет.
                if (!freshSection || !currentSection) {
                    return;
                }

                currentSection.replaceWith(freshSection);

                // Возвращаем раскрытыми те карточки, которые были
                // раскрыты до обновления: иначе у менеджера «схлопнется»
                // всё, что он открыл, и это будет раздражать.
                (openCardIds || []).forEach(function (id) {
                    var card = freshSection.querySelector(
                        '.web-orders-card[data-order-id="' + id + '"]'
                    );
                    if (card) {
                        card.open = true;
                    }
                });

                // После перерисовки количество «Новых» могло измениться —
                // пересчитываем и обновляем иконку вкладки.
                updateFavicon();
            });
    }

    /* ------------------------------------------------------------
       ПОДТВЕРЖДЕНИЕ ЧЕРЕЗ МОДАЛКУ.

       window.confirm нельзя стилизовать, он выбивается из оформления ИС.
       Поэтому показываем свою модалку и ждём ответа кнопки:
       data-confirm="yes" — подтвердили, "no" — отказались.

       Возвращает Promise<boolean>: обработчик действия ждёт ответа,
       прежде чем отправлять запрос.
       ------------------------------------------------------------ */
    function askConfirm(modalId) {
        return new Promise(function (resolve) {
            var overlay = document.getElementById(modalId);

            // Модалки нет (старый шаблон из кэша) — не ломаем удаление,
            // спрашиваем по-старому.
            if (!overlay) {
                resolve(window.confirm('Удалить заявку?'));
                return;
            }

            overlay.style.display = 'flex';

            function finish(answer) {
                overlay.style.display = 'none';
                overlay.removeEventListener('click', onClick);
                document.removeEventListener('keydown', onKey);
                resolve(answer);
            }

            function onClick(event) {
                // Клик по фону — отмена, как в модалке удаления файла.
                if (event.target === overlay) {
                    finish(false);
                    return;
                }

                var btn = event.target.closest('[data-confirm]');
                if (!btn) {
                    return;
                }

                finish(btn.getAttribute('data-confirm') === 'yes');
            }

            function onKey(event) {
                if (event.key === 'Escape') {
                    finish(false);
                }
            }

            overlay.addEventListener('click', onClick);
            document.addEventListener('keydown', onKey);
        });
    }


    /* ------------------------------------------------------------
       Выполнение действия над заявкой.

       button — нажатая кнопка;
       action — элемент словаря ACTIONS (reject или restore).

       Порядок:
         1. при необходимости спрашиваем подтверждение;
         2. блокируем кнопку на время запроса — защита от двойного клика;
         3. отправляем POST;
         4. при успехе — тост, перерисовка, разблокировка;
         5. при ошибке — красный тост с текстом от сервера.
       ------------------------------------------------------------ */
    async function runAction(button, action) {
        var card = button.closest('.web-orders-card');
        if (!card) {
            return;
        }

        var orderId = card.getAttribute('data-order-id');

        // Подтверждение: своя модалка, если она указана в действии.
        // Асинхронно — ждём ответа, и только потом идём в API.
        if (action.confirmModalId) {
            var confirmed = await askConfirm(action.confirmModalId);
            if (!confirmed) {
                return;
            }
        } else if (action.confirmText && !window.confirm(action.confirmText)) {
            return;
        }

        // Запоминаем, какие карточки раскрыты, чтобы вернуть их состояние
        // после перерисовки.
        var openCardIds = Array.prototype.map.call(
            document.querySelectorAll('.web-orders-card[open]'),
            function (el) { return el.getAttribute('data-order-id'); }
        );

        button.disabled = true;

        fetch(action.url + orderId + '/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'Content-Type': 'application/json',
                // Своя вкладка: сервер положит этот id в событие, и клиент
                // не будет показывать тост о собственном действии.
                'X-Tab-Id': (window.getTabId ? window.getTabId() : '')
            },
            // Пустое тело: комментарий менеджера пока не спрашиваем.
            // Оба представления спокойно относятся к пустому телу.
            body: '{}'
        })
            .then(function (response) {
                // Сервер отвечает JSON и при ошибках — читаем его всегда,
                // чтобы показать текст именно от сервера, а не «HTTP 409».
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .then(function (result) {
                if (!result.ok || !result.data.success) {
                    button.disabled = false;
                    showToast(result.data.error || 'Не удалось выполнить действие', 'error');
                    return;
                }

                // Текст тоста может быть строкой или функцией от ответа
                // сервера: для конвертации нужно показать номер заказа,
                // который заранее неизвестен.
                var toastText = (typeof action.successText === 'function')
                    ? action.successText(result.data)
                    : action.successText;

                showToast(toastText, 'success');

                // Перерисовку не ждём в цепочке: тост уже показан,
                // а кнопка исчезнет вместе со старым DOM.
                refreshSection(openCardIds).catch(function () {
                    // Если перерисовать не удалось — не страшно:
                    // достаточно перезагрузить страницу вручную.
                    showToast('Обновите страницу, чтобы увидеть изменения', 'error');
                });
            })
            .catch(function () {
                button.disabled = false;
                showToast('Ошибка сети. Проверьте соединение.', 'error');
            });
    }

    /* ------------------------------------------------------------
       Делегирование клика.

       ПОЧЕМУ НЕ addEventListener НА САМУ КНОПКУ: после refreshSection()
       все кнопки — новые элементы, и обработчики на них пришлось бы
       навешивать заново. Обработчик на document переживает любую
       перерисовку.

       Один обработчик обслуживает оба действия: определяем, какому
       элементу ACTIONS соответствует нажатая кнопка.
       ------------------------------------------------------------ */
    document.addEventListener('click', function (event) {
        var button = event.target.closest('.web-orders-btn');
        if (!button || button.disabled) {
            return;
        }

        // Ищем действие, у которого класс кнопки совпадает с нажатой.
        var actionKey = Object.keys(ACTIONS).filter(function (key) {
            return button.classList.contains(ACTIONS[key].cssClass);
        })[0];

        if (!actionKey) {
            return;
        }

        // preventDefault — на случай, если кнопка когда-нибудь окажется
        // внутри формы и попытается её отправить.
        event.preventDefault();
        runAction(button, ACTIONS[actionKey]).catch(function (err) {
            // runAction стал асинхронным (ждёт подтверждения в модалке).
            // Без этого catch любая ошибка внутри осталась бы незамеченной.
            console.error(err);
            showToast('Не удалось выполнить действие', 'error');
        });
    });

    /* ============================================================
       WEBSOCKET + ИКОНКА ВКЛАДКИ
       ============================================================

       ЗАЧЕМ: менеджер держит /web-orders/ открытой. Новая заявка с сайта
       должна появиться сама, без F5, а иконка вкладки — показать, есть ли
       работа.

       ЦВЕТА (приоритет сверху вниз):
         синий   — есть непросмотренные заявки (статус «Новая»).
                   Показывается НЕЗАВИСИМО от связи: работа важнее техники.
         зелёный — непросмотренных нет, соединение есть;
         красный — непросмотренных нет, соединения нет;
         серый   — идёт подключение (и непросмотренных нет).

       ПРО ОГРАНИЧЕНИЕ: количество «Новых» известно на момент загрузки
       страницы и обновляется по WebSocket-событиям. Если связь уже
       оборвана, новые заявки прийти не могут — иконка покажет то, что
       было известно к моменту обрыва.
       ============================================================ */

    // Адрес сокета на сервере (см. web_orders/routing.py).
    var WS_PATH = '/ws/web-orders/';

    // Пауза перед переподключением после обрыва.
    var WS_RECONNECT_DELAY_MS = 3000;

    // Текущее состояние соединения: 'connecting' | 'connected' | 'disconnected'.
    // Храним отдельно от цвета, потому что цвет зависит ещё и от количества
    // непросмотренных заявок.
    var wsState = 'connecting';

    /* ------------------------------------------------------------
       Иконка вкладки — глобус.

       Цвет в data URI кодируется как %23RRGGBB: решётка # внутри
       data:-ссылки должна быть экранирована, иначе браузер обрежет
       остаток строки. Подставляем нужный цвет вместо COLOR.
       ------------------------------------------------------------ */
    var GLOBE_SVG =
        "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' " +
        // stroke-width=2 — линии тоньше, чем 2.5 у иконок из base.html:
        // на размере 16×16 толстые линии выглядят жирно.
        "fill='none' stroke='COLOR' stroke-width='2' stroke-linecap='round' " +
        "stroke-linejoin='round'><circle cx='12' cy='12' r='10'></circle>" +
        "<line x1='2' y1='12' x2='22' y2='12'></line>" +
        "<path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 " +
        "15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'></path></svg>";

    var FAVICON_COLORS = {
        new: '%232a6fc9',           // синий  — есть непросмотренные заявки
        connected: '%230B8661',     // зелёный
        connecting: '%23999999',    // серый
        disconnected: '%23c0392b'   // красный
    };

    /**
     * Считает количество заявок в статусе «Новая» по текущей разметке.
     *
     * ПОЧЕМУ ИЗ DOM, А НЕ ОТДЕЛЬНЫМ ЗАПРОСОМ: список уже отрисован сервером,
     * и цифра в заголовке группы — это и есть актуальное число. Отдельный
     * fetch дал бы лишний запрос на каждое обновление.
     *
     * Если группы «Новая» нет (например, все заявки обработаны) —
     * возвращаем 0.
     */
    function getNewOrdersCount() {
        var group = document.getElementById('web-orders-group-new');
        if (!group) {
            return 0;
        }

        var counter = group.querySelector('.web-orders-group-count');
        if (!counter) {
            return 0;
        }

        // В разметке может быть «5» или « 5 » — parseInt справится,
        // а нечисло даст NaN, который мы превращаем в 0.
        var value = parseInt(counter.textContent, 10);
        return isNaN(value) ? 0 : value;
    }

    /**
     * Ставит иконке нужный цвет по приоритету: работа → связь.
     * Вызывается при смене состояния сокета и после перерисовки списка.
     */
    function updateFavicon() {
        var state;

        if (getNewOrdersCount() > 0) {
            // Есть непросмотренные заявки — синий, независимо от связи.
            state = 'new';
        } else {
            state = wsState;
        }

        var link = document.getElementById('dynamic-favicon');
        if (!link) {
            // Страница открыта вне base.html — просто ничего не делаем.
            return;
        }

        link.setAttribute(
            'href',
            GLOBE_SVG.replace('COLOR', FAVICON_COLORS[state] || FAVICON_COLORS.connecting)
        );
    }

    /* ------------------------------------------------------------
       НИЖНЕЕ «ВИСЯЩЕЕ» УВЕДОМЛЕНИЕ О ЧУЖОМ ДЕЙСТВИИ.

       В отличие от showToast (верхний угол, исчезает сам), оно:
         • живёт до закрытия крестиком или перезагрузки страницы;
         • содержит имя инициатора и кнопку «Обновить данные».

       Текст собираем здесь, а не на сервере: сервер отдаёт факты
       (событие, номер, имя, файл), а формулировки — дело интерфейса.
       ------------------------------------------------------------ */
    function showPersistentToast(payload) {
        var container = document.getElementById('web-orders-bottom-toasts');
        if (!container) {
            // Шаблон не обновлён — не ломаем страницу, показываем обычный тост.
            showToast('Есть изменения в заявках', 'success');
            return;
        }

        // Кто выполнил: имя менеджера из профиля Django, а если действие
        // пришло с сайта — «Клиент» (макет) или «Сайт» (заявка).
        var actor = payload.actor_username || '';
        if (!actor) {
            actor = (payload.event === 'file_added') ? 'Клиент' : 'Сайт';
        }

        var number = payload.number || '';
        var action = '';
        var kind = 'updated';

        if (payload.event === 'created') {
            action = 'создал(а) заявку';
            kind = 'created';
        } else if (payload.event === 'converted') {
            action = 'конвертировал(а) заявку';
        } else if (payload.event === 'deleted') {
            action = 'удалил(а) заявку';
            kind = 'deleted';
        } else if (payload.event === 'delivery_updated') {
            // Клиент поменял доставку в личном кабинете сайта.
            action = 'изменил(а) доставку заявки';
        } else if (payload.event === 'file_added') {
            action = 'приложил макет';
            kind = 'file';
        } else {
            action = 'изменил(а) заявку';
        }

        // Одинаковые уведомления не дублируем (бывает при переподключении сокета).
        var key = [payload.event, number, payload.file_name || ''].join('|');
        if (container.querySelector('[data-toast-key="' + key + '"]')) {
            return;
        }

        var toast = document.createElement('div');
        toast.className = 'web-orders-bottom-toast web-orders-bottom-toast--' + kind;
        toast.setAttribute('data-toast-key', key);

        var actorSpan = document.createElement('span');
        actorSpan.className = 'web-orders-bottom-toast-actor';
        actorSpan.textContent = actor;
        toast.appendChild(actorSpan);

        toast.appendChild(document.createTextNode(' ' + action));

        if (payload.event === 'file_added' && payload.file_name) {
            var fileSpan = document.createElement('span');
            fileSpan.className = 'web-orders-bottom-toast-file';
            fileSpan.textContent = ' «' + payload.file_name + '»';
            toast.appendChild(fileSpan);
        }

        if (number) {
            toast.appendChild(document.createTextNode(' '));
            var numberSpan = document.createElement('span');
            numberSpan.className = 'web-orders-bottom-toast-number';
            numberSpan.textContent = number;
            toast.appendChild(numberSpan);
        }

        // Крестик.
        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'web-orders-bottom-toast-close';
        closeBtn.title = 'Закрыть';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
                layoutBottomToasts();
            }
        });
        toast.appendChild(closeBtn);

        // Кнопка «Обновить данные».
        var refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'web-orders-bottom-toast-refresh';
        refreshBtn.textContent = 'Обновить данные';
        refreshBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            refreshBtn.disabled = true;

            var openCardIds = Array.prototype.map.call(
                document.querySelectorAll('.web-orders-card[open]'),
                function (el) { return el.getAttribute('data-order-id'); }
            );

            refreshSection(openCardIds)
                .then(function () {
                    // Закрываем ВСЕ плашки: список перерисован по свежим данным,
                    // остальные уведомления описывают то же самое.
                    container.innerHTML = '';
                })
                .catch(function (err) {
                    console.error(err);
                    refreshBtn.disabled = false;
                    showToast('Не удалось обновить список', 'error');
                });
        });
        toast.appendChild(refreshBtn);

        // Клик по плашке поднимает её над стопкой (как в /orders/).
        toast.addEventListener('click', function () {
            if (toast.classList.contains('web-orders-bottom-toast--raised')) {
                toast.classList.remove('web-orders-bottom-toast--raised');
                layoutBottomToasts();
            } else {
                container.querySelectorAll('.web-orders-bottom-toast--raised')
                    .forEach(function (t) {
                        t.classList.remove('web-orders-bottom-toast--raised');
                    });

                toast.classList.add('web-orders-bottom-toast--raised');
                layoutBottomToasts();
            }
        });

        // Новая плашка — в начало контейнера, чтобы оказаться на виду.
        container.insertBefore(toast, container.firstChild);
        layoutBottomToasts();
    }

    /* ------------------------------------------------------------
       Раскладка стопки: плашки накладываются друг на друга,
       каждая следующая сдвинута вниз на половину высоты предыдущей.
       Кнопка «Обновить данные» видна только у самой свежей (первой в DOM).
       ------------------------------------------------------------ */
    function layoutBottomToasts() {
        var container = document.getElementById('web-orders-bottom-toasts');
        if (!container) {
            return;
        }

        var toasts = Array.prototype.slice.call(
            container.querySelectorAll('.web-orders-bottom-toast')
        );

        toasts.forEach(function (toast, index) {
            var btn = toast.querySelector('.web-orders-bottom-toast-refresh');
            if (!btn) {
                return;
            }
            btn.hidden = (index !== 0);
        });

        var offset = 0;
        var z = 1000;

        for (var i = toasts.length - 1; i >= 0; i--) {
            var toast = toasts[i];
            var height = toast.offsetHeight || 50;

            var isRaised = toast.classList.contains('web-orders-bottom-toast--raised');

            var top = -(offset + height);
            var toastZ = z;

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
     * Реакция на событие от другого пользователя/вкладки.
     */
    function handleRemoteEvent(payload) {
        // Своё собственное действие: back-end положил наш X-Tab-Id в событие.
        // Данные в этой вкладке уже обновлены локально — повторно
        // перерисовывать и показывать тост не нужно.
        var myTabId = (typeof window.getTabId === 'function') ? window.getTabId() : '';
        if (payload.actor_tab_id && payload.actor_tab_id === myTabId) {
            return;
        }

        // Чужое действие: показываем «висящее» уведомление внизу слева.
        // Оно не исчезнет само — менеджер закроет его сам или обновит страницу.
        showPersistentToast(payload);

        // Раскрытые карточки запоминаем, чтобы не схлопнуть их после
        // перерисовки — менеджер мог читать состав заявки.
        var openCardIds = Array.prototype.map.call(
            document.querySelectorAll('.web-orders-card[open]'),
            function (el) { return el.getAttribute('data-order-id'); }
        );

        // refreshSection сам вызовет updateFavicon() после перерисовки,
        // поэтому отдельно пересчитывать «Новые» здесь не нужно.
        refreshSection(openCardIds).catch(function () {
            showToast('Не удалось обновить список — нажмите F5', 'error');
        });
    }

    /**
     * Подключение и переподключение к сокету.
     */
    function connectWebSocket() {
        // wss:// на HTTPS, ws:// на локальной разработке.
        var scheme = (window.location.protocol === 'https:') ? 'wss://' : 'ws://';
        var socket;

        try {
            socket = new WebSocket(scheme + window.location.host + WS_PATH);
        } catch (e) {
            // Некорректный URL — не роняем страницу, попробуем позже.
            wsState = 'disconnected';
            updateFavicon();
            setTimeout(connectWebSocket, WS_RECONNECT_DELAY_MS);
            return;
        }

        wsState = 'connecting';
        updateFavicon();

        socket.onopen = function () {
            wsState = 'connected';
            updateFavicon();
        };

        socket.onmessage = function (event) {
            var payload;
            try {
                payload = JSON.parse(event.data);
            } catch (e) {
                return;   // не наш формат — игнорируем
            }

            if (payload.type !== 'web_order_event') {
                return;
            }

            handleRemoteEvent(payload);
        };

        socket.onclose = function () {
            // Сюда попадаем и при обрыве, и при закрытии страницы.
            // Переподключаемся: вкладка должна жить.
            wsState = 'disconnected';
            updateFavicon();
            setTimeout(connectWebSocket, WS_RECONNECT_DELAY_MS);
        };

        socket.onerror = function () {
            // onerror всегда сопровождается onclose, поэтому переподключение
            // запустится там. Здесь только гасим событие.
            socket.close();
        };
    }

    // Первичная отрисовка иконки: если на странице уже есть «Новые»,
    // синий должен появиться сразу, не дожидаясь сокета.
    updateFavicon();

    // Запускаем соединение: скрипт подключён в конце body, DOM уже готов.
    connectWebSocket();

    // Отдаём функцию уведомлений наружу: её использует upload.js.
    // Стили и поведение те же, что у уведомлений от WebSocket.
    window.webOrdersToast = showToast;

    // ========================================================================
    // ОПЛАТА И СЧЁТ ДЛЯ КЛИЕНТА
    // ========================================================================
    // Менеджер заполняет то, что клиент видит в ЛК сайта:
    // ссылку на оплату (ЮKassa) и PDF счёта.
    // Отправляем одним запросом: пустое поле ссылки — это осознанная
    // очистка, поэтому pay_link передаём всегда, а файл — только если выбран.
    document.addEventListener('click', function (event) {
        var button = event.target.closest('.web-orders-billing-save');
        if (!button) return;

        var block = button.closest('.web-orders-billing');
        if (!block) return;

        var orderId = block.getAttribute('data-order-id');
        if (!orderId) return;

        var payLinkInput = block.querySelector('.web-orders-billing-paylink');
        var invoiceInput = block.querySelector('.web-orders-billing-invoice');
        var status = block.querySelector('.web-orders-billing-status');
        var currentCell = block.querySelector('.web-orders-billing-invoice-name');

        var formData = new FormData();
        formData.append('pay_link', payLinkInput ? payLinkInput.value.trim() : '');

        if (invoiceInput && invoiceInput.files && invoiceInput.files[0]) {
            formData.append('invoice_file', invoiceInput.files[0]);
        }

        button.disabled = true;
        status.className = 'web-orders-billing-status';
        status.textContent = 'Сохранение…';

        fetch('/web-orders/api/order/' + orderId + '/site-status/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                button.disabled = false;

                if (!data || !data.success) {
                    status.className = 'web-orders-billing-status is-error';
                    status.textContent = (data && data.error) ? data.error : 'Не удалось сохранить';
                    window.webOrdersToast(status.textContent, 'error');
                    return;
                }

                status.className = 'web-orders-billing-status is-ok';
                status.textContent = 'Сохранено';
                window.setTimeout(function () { status.textContent = ''; }, 2000);

                // Показываем актуальный счёт без перезагрузки страницы.
                if (currentCell && data.invoice_url) {
                    currentCell.textContent = '';

                    var link = document.createElement('a');
                    link.className = 'web-orders-billing-invoice-link';
                    link.href = data.invoice_url;
                    link.target = '_blank';
                    link.rel = 'noopener';
                    link.textContent = data.invoice_name || 'счёт';
                    currentCell.appendChild(link);
                } else if (currentCell && !data.invoice_url) {
                    // Файл не загружали и его нет — так и пишем.
                    currentCell.textContent = 'не загружен';
                }

                if (invoiceInput) invoiceInput.value = '';

                window.webOrdersToast('Оплата и счёт сохранены', 'success');
            })
            .catch(function () {
                button.disabled = false;
                status.className = 'web-orders-billing-status is-error';
                status.textContent = 'Ошибка сети';
                window.webOrdersToast('Ошибка сети при сохранении', 'error');
            });
    });
})();