/*
orders/static/orders/js/detail.js
Интерактив страницы карточки заказа.

Сценарии:
1. Инлайн-редактирование комментария заказа
   (двойной клик → поле ввода → Enter сохраняет, Escape отменяет,
    клик вне поля сохраняет).

2. Раскрытие состава изделия
   (клик по заголовку карточки изделия → загрузка состава через API
    → рендер компонентов, работ, ламинации, расчётов → повторный клик
    сворачивает).

3. Кнопка «Создать просчёт из изделия»
   (POST-запрос → редирект на /calculator/?proschet_id=N).
*/

"use strict";

(function () {

    // ========================================================================
    // 1. КОНСТАНТЫ
    // ========================================================================

    // Обновление комментария заказа.
    var API_COMMENT_URL_TPL = '/orders/api/order/__ORDER_ID__/update-comment/';

    // Состав изделия.
    var API_PRODUCT_DETAILS_URL_TPL = '/orders/api/product/__PRODUCT_ID__/details/';

    // Создание просчёта из изделия.
    var API_PRODUCT_TO_PROSCHET = '/orders/api/proschet-from-product/';


    // ========================================================================
    // 2. УТИЛИТЫ
    // ========================================================================

    /**
     * Возвращает CSRF-токен: сначала из meta-тега, иначе — из cookies.
     */
    function getCsrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content') || '';
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var c = cookies[i].trim();
            if (c.indexOf('csrftoken=') === 0) {
                return decodeURIComponent(c.substring('csrftoken='.length));
            }
        }
        console.warn('CSRF-токен не найден');
        return '';
    }

    /**
     * Всплывающее уведомление в правом верхнем углу.
     */
    function showNotification(message, type) {
        var bg = '#2196F3'; var icon = 'ℹ️';
        if (type === 'success') { bg = '#0B8661'; icon = '✅'; }
        else if (type === 'error') { bg = '#e74c3c'; icon = '❌'; }
        else if (type === 'warning') { bg = '#f39c12'; icon = '⚠️'; }

        var box = document.createElement('div');
        box.style.cssText = [
            'position: fixed', 'top: 20px', 'right: 20px',
            'max-width: 340px', 'padding: 12px 18px',
            'background: ' + bg, 'color: #fff',
            'border-radius: 8px',
            'box-shadow: 0 6px 20px rgba(0,0,0,0.2)',
            'font-family: inherit', 'font-size: 1rem',
            'z-index: 10000', 'opacity: 0',
            'transition: opacity 0.25s ease',
            'cursor: pointer'
        ].join(';');
        box.textContent = icon + ' ' + message;
        document.body.appendChild(box);
        setTimeout(function () { box.style.opacity = '1'; }, 20);
        var hide = function () {
            box.style.opacity = '0';
            setTimeout(function () {
                if (box.parentNode) box.parentNode.removeChild(box);
            }, 300);
        };
        box.addEventListener('click', hide);
        setTimeout(hide, 5000);
    }

    /**
     * Экранирование HTML для защиты от XSS при вставке строк.
     */
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        var div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }


    // ========================================================================
    // 3. ИНЛАЙН-РЕДАКТИРОВАНИЕ КОММЕНТАРИЯ
    // ========================================================================

    function activateCommentEdit() {
        var display = document.getElementById('order-comment-display');
        var input = document.getElementById('order-comment-input');
        if (!display || !input) return;
        if (input.style.display === 'block') return;

        var originalValue = display.dataset.originalValue || '';
        input.value = originalValue;
        display.style.display = 'none';
        input.style.display = 'block';
        input.focus();
        input.select();
    }

    function cancelCommentEdit() {
        var display = document.getElementById('order-comment-display');
        var input = document.getElementById('order-comment-input');
        if (!display || !input) return;
        input.style.display = 'none';
        display.style.display = 'block';
    }

    function saveCommentEdit() {
        var display = document.getElementById('order-comment-display');
        var input = document.getElementById('order-comment-input');
        if (!display || !input) return;

        var orderId = display.dataset.orderId;
        if (!orderId) { cancelCommentEdit(); return; }

        var newValue = (input.value || '').trim();
        var oldValue = (display.dataset.originalValue || '').trim();

        if (newValue === oldValue) { cancelCommentEdit(); return; }

        var url = API_COMMENT_URL_TPL.replace('__ORDER_ID__', orderId);

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ comment: newValue })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                showNotification('Ошибка: ' + (data.error || 'неизвестная ошибка'), 'error');
                cancelCommentEdit();
                return;
            }
            display.dataset.originalValue = data.comment;
            if (data.comment) {
                display.textContent = data.comment;
            } else {
                display.innerHTML = '<span class="order-comment-empty">— (двойной клик, чтобы добавить) —</span>';
            }
            cancelCommentEdit();
            showNotification('Комментарий сохранён', 'success');
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при сохранении комментария', 'error');
            cancelCommentEdit();
        });
    }


    // ========================================================================
    // 4. РАСКРЫТИЕ СОСТАВА ИЗДЕЛИЯ
    // ========================================================================

    /**
     * Переключает карточку изделия: раскрыта / свёрнута.
     * При первом раскрытии — загружает состав с сервера и рендерит.
     */
    function toggleProductCard(card) {
        var productId = card.dataset.productId;
        if (!productId) return;

        var body = card.querySelector('.order-product-body');
        if (!body) return;

        // Если уже раскрыт — просто сворачиваем.
        if (card.classList.contains('expanded')) {
            card.classList.remove('expanded');
            body.style.display = 'none';
            return;
        }

        // Раскрываем карточку.
        card.classList.add('expanded');
        body.style.display = 'block';

        // Если состав ещё не загружен — загружаем.
        if (!body.dataset.loaded) {
            body.innerHTML = '<div class="order-product-loading">Загрузка состава…</div>';
            var url = API_PRODUCT_DETAILS_URL_TPL.replace('__PRODUCT_ID__', productId);

            fetch(url, {
                method: 'GET',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.success) {
                    body.innerHTML = '<div class="order-product-error">Не удалось загрузить состав</div>';
                    return;
                }
                renderProductBody(body, data.product);
                body.dataset.loaded = '1';
            })
            .catch(function (err) {
                console.error(err);
                body.innerHTML = '<div class="order-product-error">Ошибка сети при загрузке состава</div>';
            });
        }
    }

    /**
     * Рисует состав изделия внутри .order-product-body.
     */
    function renderProductBody(body, product) {
        var html = '';

        // ===== Компоненты =====
        if (product.components && product.components.length) {
            product.components.forEach(function (comp, idx) {
                html += renderComponent(comp, idx + 1);
            });
        } else {
            html += '<div class="order-product-empty">В изделии нет компонентов.</div>';
        }

        // ===== Итоговая строка =====
        html += '<div class="order-product-total">' +
                    '<span>Итого по изделию:</span>' +
                    '<b>' + escapeHtml(product.formatted_total_price) + '</b>' +
                '</div>';

        // ===== Кнопка «Создать просчёт из изделия» =====
        html += '<div class="order-product-actions">' +
                    '<button type="button" class="order-btn-create-proschet" ' +
                        'data-product-id="' + product.id + '">' +
                        'Создать просчёт из изделия' +
                    '</button>' +
                '</div>';

        body.innerHTML = html;

        // Обработчик на кнопку.
        var btn = body.querySelector('.order-btn-create-proschet');
        if (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();    // не сворачиваем карточку
                handleCreateProschetFromProduct(product.id, btn);
            });
        }
    }

    /**
     * Рендер одного компонента с вложенным составом.
     */
    function renderComponent(comp, idx) {
        var html = '';
        html += '<div class="order-component">';
        html += '<div class="order-component-header">' +
                    '<div class="order-component-title">Компонент #' + idx +
                        (comp.number ? ' (' + escapeHtml(comp.number) + ')' : '') +
                    '</div>' +
                    '<div class="order-component-price">' +
                        escapeHtml(comp.formatted_total_circulation_price) +
                    '</div>' +
                '</div>';

        // Основные параметры.
        html += '<div class="order-component-info">' +
                    '<span><b>Принтер:</b> ' + escapeHtml(comp.printer_name || '—') + '</span>' +
                    '<span><b>Бумага:</b> ' + escapeHtml(comp.paper_name || '—') + '</span>' +
                    '<span><b>Тип:</b> ' + escapeHtml(comp.print_type_display) + '</span>' +
                    '<span><b>Режим:</b> ' + escapeHtml(comp.printing_mode_display) + '</span>' +
                    '<span><b>Листов:</b> ' + escapeHtml(comp.formatted_sheet_count) + '</span>' +
                    '<span><b>Прогонов:</b> ' + escapeHtml(comp.runs_count) + '</span>' +
                    '<span><b>Цена за лист:</b> ' + escapeHtml(comp.formatted_price_per_sheet) + '</span>' +
                    '<span><b>Бумага, ₽/лист:</b> ' + escapeHtml(comp.formatted_material_price) + '</span>' +
                '</div>';

        // Одностраничный расчёт.
        if (comp.vichisliniya) {
            var v = comp.vichisliniya;
            html += '<div class="order-component-section">' +
                        '<div class="order-section-title">Расчёт листов (одностраничный)</div>' +
                        '<div class="order-section-body">' +
                            '<span>Изделие: ' + v.item_width + '×' + v.item_height + ' мм</span>' +
                            '<span>Зазор: ' + v.vyleta + ' мм</span>' +
                            '<span>Цветность: ' + escapeHtml(v.color) + '</span>' +
                            '<span>На листе: ' + v.fit_total + ' шт.</span>' +
                            '<span>Листов: ' + v.list_count + '</span>' +
                            '<span>Резов: ' + v.cuts_count + '</span>' +
                        '</div>' +
                    '</div>';
        }

        // Многостраничный расчёт.
        if (comp.multipage) {
            var m = comp.multipage;
            html += '<div class="order-component-section">' +
                        '<div class="order-section-title">Расчёт листов (многостраничный)</div>' +
                        '<div class="order-section-body">' +
                            '<span>Скрепление: ' + escapeHtml(m.binding_name || '—') + '</span>' +
                            '<span>Страниц: ' + m.total_pages + '</span>' +
                            '<span>Экземпляров: ' + m.copies + '</span>' +
                            '<span>Страница: ' + m.finished_width + '×' + m.finished_height + ' мм</span>' +
                            '<span>Листов: ' + m.sheet_count + '</span>' +
                            (m.is_active ? '<span class="order-section-badge">Активен</span>' : '') +
                        '</div>' +
                    '</div>';
        }

        // Ламинация.
        if (comp.lamination) {
            var lam = comp.lamination;
            html += '<div class="order-component-section">' +
                        '<div class="order-section-title">Ламинация</div>' +
                        '<div class="order-section-body">' +
                            '<span>Сторона: ' + escapeHtml(lam.side_display) + '</span>' +
                            '<span>Ламинатор: ' + escapeHtml(lam.laminator_name || '—') + '</span>' +
                            '<span>Плёнка: ' + escapeHtml(lam.film_name || '—') + '</span>' +
                            '<span>Цена ламинатора: ' + lam.laminator_price.toFixed(2) + ' ₽/лист</span>' +
                            '<span>Цена плёнки: ' + lam.film_price.toFixed(2) + ' ₽/лист</span>' +
                            '<span><b>Стоимость ламинации:</b> ' + escapeHtml(lam.formatted_total_price) + '</span>' +
                        '</div>' +
                    '</div>';
        }

        // Дополнительные работы.
        if (comp.works && comp.works.length) {
            html += '<div class="order-component-section">' +
                        '<div class="order-section-title">Дополнительные работы (' + comp.works.length + ')</div>' +
                        '<table class="order-works-table">' +
                            '<thead><tr>' +
                                '<th>№</th>' +
                                '<th>Название</th>' +
                                '<th>Себест.</th>' +
                                '<th>Наценка</th>' +
                                '<th>Цена</th>' +
                                '<th>Кол-во</th>' +
                                '<th>Стоимость</th>' +
                            '</tr></thead><tbody>';
            comp.works.forEach(function (w) {
                html += '<tr>' +
                            '<td>' + escapeHtml(w.number || '—') + '</td>' +
                            '<td>' + escapeHtml(w.title) + '</td>' +
                            '<td>' + w.cost.toFixed(2) + ' ₽</td>' +
                            '<td>' + w.markup_percent.toFixed(2) + '%</td>' +
                            '<td>' + w.price.toFixed(2) + ' ₽</td>' +
                            '<td>' + w.quantity + '</td>' +
                            '<td>' + escapeHtml(w.formatted_total_price) + '</td>' +
                        '</tr>';
            });
            html += '</tbody></table></div>';
        }

        html += '</div>';    // закрываем .order-component
        return html;
    }


    // ========================================================================
    // 5. СОЗДАНИЕ ПРОСЧЁТА ИЗ ИЗДЕЛИЯ
    // ========================================================================

    function handleCreateProschetFromProduct(productId, btn) {
        if (!window.confirm('Создать новый просчёт на основе этого изделия?\n\n' +
                            'Все параметры изделия будут перенесены в просчёт, ' +
                            'а цены пересчитаются на актуальные справочники.')) {
            return;
        }

        var originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Создание…';

        fetch(API_PRODUCT_TO_PROSCHET, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ product_id: productId })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                showNotification('Ошибка: ' + (data.error || 'неизвестная ошибка'), 'error');
                btn.disabled = false;
                btn.textContent = originalText;
                return;
            }
            showNotification('Просчёт ' + data.proschet_number + ' создан', 'success');
            setTimeout(function () {
                window.location.href = '/calculator/?proschet_id=' + data.proschet_id;
            }, 500);
        })
        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при создании просчёта', 'error');
            btn.disabled = false;
            btn.textContent = originalText;
        });
    }


    // ========================================================================
    // 6. ИНИЦИАЛИЗАЦИЯ
    // ========================================================================

    document.addEventListener('DOMContentLoaded', function () {

        // ===== Комментарий заказа =====
        var display = document.getElementById('order-comment-display');
        var input = document.getElementById('order-comment-input');
        if (display && input) {
            display.addEventListener('dblclick', activateCommentEdit);
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); saveCommentEdit(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelCommentEdit(); }
            });
            input.addEventListener('blur', function () {
                setTimeout(function () {
                    if (input.style.display === 'block') saveCommentEdit();
                }, 120);
            });
        }

        // ===== Карточки изделий: клик по заголовку =====
        document.querySelectorAll('.order-product-card').forEach(function (card) {
            var header = card.querySelector('.order-product-header');
            if (header) {
                header.style.cursor = 'pointer';
                header.addEventListener('click', function () {
                    toggleProductCard(card);
                });
            }
        });

        console.log('✅ Страница заказа инициализирована');
    });

})();