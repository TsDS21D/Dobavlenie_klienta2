/*
orders/static/orders/js/common/tab_id.js

Уникальный идентификатор вкладки браузера + автоматическая прокидка
его в заголовке X-Tab-Id во все fetch-запросы.

ЗАЧЕМ:
  Django session_key общий для всех вкладок одного браузера. Поэтому по нему
  нельзя отличить «своё действие в этой вкладке» от «своё действие в другой
  вкладке того же пользователя». А нам нужно именно это — чтобы не дёргать
  страницу повторной перерисовкой, когда мы сами только что что-то сохранили.

  tab_id генерируется один раз на вкладку и хранится в sessionStorage.
  sessionStorage изолирован между вкладками (в отличие от localStorage),
  но сохраняется при перезагрузке внутри одной вкладки. Это именно то,
  что нужно: вкладка A и вкладка B получат разные tab_id, а при F5
  внутри вкладки A — тот же самый.

  Дальше:
    1. Все POST-запросы к нашему API автоматически получают заголовок
       X-Tab-Id (см. monkey-patch fetch ниже).
    2. views._send_order_event читает X-Tab-Id и кладёт в WS-событие
       как actor_tab_id.
    3. На клиенте в onmessage проверяем: если actor_tab_id совпадает
       с нашим — это наше собственное действие в этой же вкладке, значит
       данные уже локально обновлены и перерисовывать страницу не нужно.

ВАЖНО:
  Monkey-patch на window.fetch сработает ТОЛЬКО для относительных URL
  (начинающихся с '/'). Внешние запросы и запросы с объектом Headers
  не трогаем — там наш заголовок не нужен и может помешать.
*/

"use strict";

(function () {

    // Ключ в sessionStorage, под которым храним tab_id.
    var STORAGE_KEY = 'beauty_tab_id';

    /**
     * Генерирует случайный идентификатор вкладки.
     * Формат: "tab-" + случайная строка + "-" + timestamp.
     * Достаточно уникально для практических задач, не пересекается
     * между вкладками даже при одновременной загрузке.
     */
    function generateTabId() {
        var randomPart = Math.random().toString(36).substring(2, 10);
        var timePart = Date.now().toString(36);
        return 'tab-' + randomPart + '-' + timePart;
    }

    /**
     * Возвращает tab_id текущей вкладки.
     * При первом вызове — генерирует и сохраняет в sessionStorage.
     * При повторных вызовах — возвращает сохранённый.
     *
     * sessionStorage изолирован между вкладками, но сохраняется
     * при перезагрузке внутри одной вкладки. Значит:
     *   • вкладка A: getTabId() → "tab-abc-123" (сохранится)
     *   • вкладка B: getTabId() → "tab-xyz-789" (другое значение!)
     *   • F5 в A:    getTabId() → "tab-abc-123" (то же самое)
     */
    function getTabId() {
        var existing = sessionStorage.getItem(STORAGE_KEY);
        if (existing) {
            return existing;
        }
        var fresh = generateTabId();
        sessionStorage.setItem(STORAGE_KEY, fresh);
        return fresh;
    }

    // Экспортируем getTabId в window — чтобы list_orders.js и detail.js
    // могли его использовать в onmessage (сравнивать с actor_tab_id).
    window.getTabId = getTabId;

    // ===== MONKEY-PATCH FETCH =====
    // Сохраняем оригинальный fetch. Дальше все вызовы пойдут через наш
    // wrapper, который автоматически добавляет X-Tab-Id к POST/PUT/PATCH/
    // DELETE-запросам на относительные URL.
    //
    // ПОЧЕМУ monkey-patch, а не обёртка apiFetch:
    //   В проекте десятки мест с fetch('/orders/api/...', {...}).
    //   Заменять их все — риск ошибки и шум. Monkey-patch — одна точка
    //   правки: все существующие и будущие вызовы получат заголовок
    //   автоматически. Внешние URL (https://...) и GET-запросы (без тела)
    //   пропускаются — для них заголовок не нужен.
    var originalFetch = window.fetch;

    window.fetch = function (url, options) {
        options = options || {};

        // Интересуют только относительные URL нашего сайта.
        // Абсолютные (https://...) и относительные без слеша (foo/bar) — пропускаем.
        var isRelativeUrl = (typeof url === 'string' && url.charAt(0) === '/');

        if (isRelativeUrl) {
            var method = (options.method || 'GET').toUpperCase();
            var isMutation = (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE');

            if (isMutation) {
                // Приводим headers к обычному объекту.
                // В нашем коде headers всегда объект-литерал, но на всякий
                // случай обработаем и Headers-инстанс (вдруг кто-то
                // в будущем добавит).
                var headers;
                if (options.headers instanceof Headers) {
                    headers = {};
                    options.headers.forEach(function (value, key) {
                        headers[key] = value;
                    });
                } else {
                    headers = Object.assign({}, options.headers || {});
                }

                // Добавляем X-Tab-Id, только если его там ещё нет.
                // Это защита от двойного патча (например, если скрипт
                // случайно подключится дважды).
                if (!headers['X-Tab-Id']) {
                    headers['X-Tab-Id'] = getTabId();
                }

                options.headers = headers;
            }
        }

        return originalFetch.call(this, url, options);
    };

})();