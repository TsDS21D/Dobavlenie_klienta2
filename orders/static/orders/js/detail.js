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


    /**
     * Форматирует число размера стопки: убирает лишние нули после запятой.
     *   90.0    → "90"
     *   90.5    → "90.5"
     *   400.00  → "400"
     */
    function formatStackNumber(v) {
        var n = parseFloat(v);
        if (isNaN(n)) return '—';
        var r = Math.round(n * 10) / 10;
        return (r % 1 === 0) ? String(r) : r.toFixed(1);
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

        // ===== Масса и объём (замороженные при создании изделия) =====
        // Формат — как в секции «Масса и объём» калькулятора:
        // масса в кг с 3 знаками, объём в литрах с 3 знаками.
        var massG = parseFloat(product.frozen_total_mass_g) || 0;
        var volumeCm3 = parseFloat(product.frozen_total_volume_cm3) || 0;
        var massKg = (massG / 1000).toFixed(3);
        var volumeL = (volumeCm3 / 1000).toFixed(3);

        var stacks = product.frozen_stacks || [];

        html += '<div class="order-product-mass-volume">';
        html += '  <div class="order-mv-title">Масса и объём</div>';
        html += '  <div class="order-mv-row">';
        html += '    <span class="order-mv-label">Общая масса:</span>';
        html += '    <span class="order-mv-value">' + massKg + ' кг</span>';
        html += '  </div>';
        html += '  <div class="order-mv-row">';
        html += '    <span class="order-mv-label">Общий объём:</span>';
        html += '    <span class="order-mv-value">' + volumeL + ' л</span>';
        html += '  </div>';

        // Размер стопки — по каждому компоненту.
        if (stacks.length) {
            html += '  <div class="order-mv-stacks">';
            html += '    <div class="order-mv-stacks-title">Размер стопки</div>';
            stacks.forEach(function (s) {
                if (!s.valid) {
                    html += '<div class="order-mv-stack-row order-mv-stack-empty">' +
                                escapeHtml(s.label) + ': размеры не заданы' +
                            '</div>';
                    return;
                }
                // Форматируем: без лишних .0 для целых.
                var w = formatStackNumber(s.width_mm);
                var h = formatStackNumber(s.height_mm);
                var sh = formatStackNumber(s.stack_height_mm);
                var sizeText = w + ' × ' + h + ' × ' + sh + ' мм';
                html += '<div class="order-mv-stack-row">' +
                            '<span class="order-mv-stack-label">' + escapeHtml(s.label) + '</span>' +
                            '<span class="order-mv-stack-value">' + sizeText + '</span>' +
                        '</div>';
            });
            html += '  </div>';
        }

        html += '</div>';

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
        // Рисуем все canvas-схемы для компонентов.
        drawComponentVisualizations(product.components || []);

        // Обработчик на кнопку.
        var btn = body.querySelector('.order-btn-create-proschet');
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

        // Определяем, какой режим расчёта листов был активен при
        // создании изделия. Если в снимке есть comp.multipage —
        // значит, при создании был активен многостраничный режим,
        // и в калькуляторе цена считалась именно по нему. Тогда
        // одностраничный блок показывать не надо.
        var isMultipageActive = !!comp.multipage;

        // Одностраничный расчёт — показываем ТОЛЬКО если многостраничный
        // НЕ активен.
        if (comp.vichisliniya && !isMultipageActive) {
            var v = comp.vichisliniya;
            html += '<div class="order-component-section">' +
                        '<div class="order-section-title">Расчёт листов (одностраничный)</div>' +
                        '<div class="order-section-body">' +
                            '<span>Изделие: ' + v.item_width + '×' + v.item_height + ' мм</span>' +
                            '<span>Зазор: ' + v.vyleta + ' мм</span>' +
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

        // ===== Схема размещения на листе (уменьшенные canvas) =====
        // Рисуем две схемы: лицевую и оборотную, как в секции «Вычисления листов».
        // Canvas уменьшен в 2 раза (200×150 вместо 400×300), стилизация такая же.
        html += '<div class="order-component-visualization">';
        html += '  <div class="order-viz-title">Схема размещения на листе</div>';
        html += '  <div class="order-dual-canvas">';
        html += '    <div class="order-canvas-side">';
        html += '      <div class="order-canvas-title">Лицевая сторона</div>';
        html += '      <canvas class="order-viz-canvas" ' +
                    'id="order-canvas-front-' + comp.id + '" ' +
                    'data-component-id="' + comp.id + '" ' +
                    'data-side="front" ' +
                    'width="200" height="150"></canvas>';
        html += '    </div>';
        html += '    <div class="order-canvas-side">';
        html += '      <div class="order-canvas-title">Оборотная сторона</div>';
        html += '      <canvas class="order-viz-canvas" ' +
                    'id="order-canvas-back-' + comp.id + '" ' +
                    'data-component-id="' + comp.id + '" ' +
                    'data-side="back" ' +
                    'width="200" height="150"></canvas>';
        html += '    </div>';
        html += '  </div>';
        html += '  <p class="order-canvas-note">* Схематичное отображение. Масштаб может не соблюдаться.</p>';
        html += '</div>';

        html += '</div>';    // закрываем .order-component
        return html;
    }

    // ========================================================================
    // 4b. РИСОВАНИЕ СХЕМ РАСКЛАДКИ НА ЛИСТЕ
    // ========================================================================

    /**
     * Рисует canvas-схемы для всех компонентов.
     * Для каждого компонента выбирает режим раскладки:
     *   • если есть comp.multipage — рисуем МНОГОСТРАНИЧНУЮ раскладку
     *     (та же логика, что в vichisliniya_listov_multipage.js:
     *      для «скрепки» — развороты, для «пружины» — страницы с
     *      маркерами перфорации, для остальных — просто страницы);
     *   • иначе — ОДНОСТРАНИЧНУЮ (как в vichisliniya_listov.js).
     *
     * @param {Array} components — компоненты из API.
     */
    function drawComponentVisualizations(components) {
        components.forEach(function (comp) {
            var frontCanvas = document.getElementById('order-canvas-front-' + comp.id);
            var backCanvas = document.getElementById('order-canvas-back-' + comp.id);
            if (!frontCanvas || !backCanvas) return;

            var printType = comp.print_type || 'color';
            var fillBack = (comp.printing_mode === 'duplex');

            // Режим: многостраничный (если есть снимок multipage) или
            // одностраничный.
            if (comp.multipage) {
                drawComponentMultipageSide(frontCanvas, comp, true, printType);
                drawComponentMultipageSide(backCanvas, comp, fillBack, printType);
            } else {
                drawComponentSinglePageSide(frontCanvas, comp, true, printType);
                drawComponentSinglePageSide(backCanvas, comp, fillBack, printType);
            }
        });
    }


    // ========================================================================
    // ОДНОСТРАНИЧНАЯ РАСКЛАДКА (как в vichisliniya_listov.js)
    // ========================================================================

    /**
     * Рисует одну сторону листа для ОДНОСТРАНИЧНОГО изделия.
     * Логика копирует drawPlacementForSide из vichisliniya_listov.js,
     * только работает вне объекта vichisliniyaListov и берёт данные
     * из объекта компонента.
     */
    function drawComponentSinglePageSide(canvas, comp, fill, printType) {
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var v = comp.vichisliniya;
        if (!v) {
            ctx.font = '11px Arial'; ctx.fillStyle = '#999';
            ctx.fillText('Нет данных о раскладке', 10, 20);
            return;
        }
        if (!comp.sheet_width || !comp.sheet_height ||
            comp.margin === null || comp.margin === undefined) {
            ctx.font = '11px Arial'; ctx.fillStyle = '#999';
            ctx.fillText('Нет данных о листе', 10, 20);
            return;
        }

        var orientation = v.fit_selected_orientation;
        var itemW, itemH, fitH, fitV;
        if (orientation === 'landscape') {
            itemW = v.item_width; itemH = v.item_height;
            fitH = v.fit_horizontal; fitV = v.fit_vertical;
        } else if (orientation === 'portrait') {
            itemW = v.item_height; itemH = v.item_width;
            fitH = v.fit_horizontal; fitV = v.fit_vertical;
        } else {
            ctx.font = '11px Arial'; ctx.fillStyle = '#999';
            ctx.fillText('Ориентация не выбрана', 10, 20);
            return;
        }
        if (fitH === 0 || fitV === 0) {
            ctx.font = '11px Arial'; ctx.fillStyle = '#999';
            ctx.fillText('Изделия не помещаются', 10, 20);
            return;
        }

        var gap = v.vyleta || 0;
        var margin = comp.margin;
        var sheetW = comp.sheet_width;
        var sheetH = comp.sheet_height;

        var padding = 8;
        var scale = Math.min(
            (canvas.width - 2 * padding) / sheetW,
            (canvas.height - 2 * padding) / sheetH
        );

        ctx.save();
        ctx.translate(padding, padding);

        // Контур листа.
        ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8;
        ctx.strokeRect(0, 0, sheetW * scale, sheetH * scale);

        // Пунктир печатной области.
        ctx.strokeStyle = '#aaa'; ctx.setLineDash([3, 2]);
        ctx.strokeRect(margin * scale, margin * scale,
                       (sheetW - 2 * margin) * scale, (sheetH - 2 * margin) * scale);
        ctx.setLineDash([]);

        // Цвет заливки/контура.
        var fillColor, strokeColor;
        if (printType === 'color') {
            fillColor = fill ? 'rgba(52, 152, 219, 0.3)' : 'transparent';
            strokeColor = fill ? '#2980b9' : '#a0c4ff';
        } else {
            fillColor = fill ? 'rgba(200, 200, 200, 0.4)' : 'transparent';
            strokeColor = fill ? '#999999' : '#cccccc';
        }
        ctx.fillStyle = fillColor; ctx.strokeStyle = strokeColor; ctx.lineWidth = 0.4;

        // Сетка изделий.
        for (var row = 0; row < fitV; row++) {
            for (var col = 0; col < fitH; col++) {
                var x = margin + col * (itemW + gap);
                var y = margin + row * (itemH + gap);
                if (fill) ctx.fillRect(x * scale, y * scale, itemW * scale, itemH * scale);
                ctx.strokeRect(x * scale, y * scale, itemW * scale, itemH * scale);
            }
        }

        ctx.restore();
    }


    // ========================================================================
    // МНОГОСТРАНИЧНАЯ РАСКЛАДКА (как в vichisliniya_listov_multipage.js)
    // ========================================================================

    /**
     * Рисует одну сторону листа для МНОГОСТРАНИЧНОГО изделия.
     * Определяет, использовать ли логику «скрепки» (развороты) или
     * «обычных страниц» (с маркерами пружины при необходимости).
     */
    function drawComponentMultipageSide(canvas, comp, fill, printType) {
        var mp = comp.multipage;
        if (!mp) return;

        // Определяем способ скрепления по названию.
        var bindingName = (mp.binding_name || '').toLowerCase();
        var isStapled = (bindingName === 'скрепка');
        var isPunched = (bindingName === 'пружина');

        if (isStapled) {
            drawComponentSpread(canvas, comp, fill, printType);
        } else {
            drawComponentPages(canvas, comp, fill, printType, isPunched);
        }
    }

    /**
     * Раскладка «скрепка» — рисуем развороты.
     * Логика копирует drawSpreadOnCanvas из vichisliniya_listov_multipage.js.
     */
    function drawComponentSpread(canvas, comp, fill, printType) {
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var mp = comp.multipage;
        if (!comp.sheet_width || !comp.sheet_height ||
            comp.margin === null || comp.margin === undefined) {
            ctx.font = '11px Arial'; ctx.fillStyle = '#999';
            ctx.fillText('Нет данных о листе', 10, 20);
            return;
        }

        var margin = comp.margin;
        var sheetW = comp.sheet_width;
        var sheetH = comp.sheet_height;
        var gap = mp.vyleta || 0;
        var pageW = mp.finished_width;
        var pageH = mp.finished_height;

        // Размер разворота зависит от ориентации брошюры.
        var spreadWidthBase, spreadHeightBase;
        if (mp.booklet_orientation === 'portrait') {
            spreadWidthBase = pageW * 2;
            spreadHeightBase = pageH;
        } else {
            spreadWidthBase = pageW;
            spreadHeightBase = pageH * 2;
        }

        // Выбранная ориентация размещения: если «portrait», разворот повёрнут.
        var spreadWidth, spreadHeight;
        if (mp.fit_selected_orientation === 'landscape') {
            spreadWidth = spreadWidthBase;
            spreadHeight = spreadHeightBase;
        } else {
            spreadWidth = spreadHeightBase;
            spreadHeight = spreadWidthBase;
        }

        var fitH = mp.fit_horizontal;
        var fitV = mp.fit_vertical;
        if (fitH === 0 || fitV === 0) {
            ctx.font = '11px Arial'; ctx.fillStyle = '#999';
            ctx.fillText('Развороты не помещаются', 10, 20);
            return;
        }

        var padding = 8;
        var scale = Math.min(
            (canvas.width - 2 * padding) / sheetW,
            (canvas.height - 2 * padding) / sheetH
        );

        ctx.save();
        ctx.translate(padding, padding);

        // Контур листа.
        ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8;
        ctx.strokeRect(0, 0, sheetW * scale, sheetH * scale);

        // Пунктир печатной области.
        ctx.strokeStyle = '#aaa'; ctx.setLineDash([3, 2]);
        ctx.strokeRect(margin * scale, margin * scale,
                       (sheetW - 2 * margin) * scale, (sheetH - 2 * margin) * scale);
        ctx.setLineDash([]);

        // Цвета.
        var fillColor, strokeColor;
        if (printType === 'color') {
            fillColor = fill ? 'rgba(52, 152, 219, 0.3)' : 'transparent';
            strokeColor = fill ? '#2980b9' : '#a0c4ff';
        } else {
            fillColor = fill ? 'rgba(200, 200, 200, 0.4)' : 'transparent';
            strokeColor = fill ? '#999999' : '#cccccc';
        }
        ctx.fillStyle = fillColor; ctx.strokeStyle = strokeColor; ctx.lineWidth = 0.4;

        // Как ориентированы страницы внутри разворота.
        var originalPagePlacement = (mp.booklet_orientation === 'portrait')
            ? 'horizontal' : 'vertical';
        var isPortraitPlacement = (mp.fit_selected_orientation === 'portrait');
        var effectivePagePlacement = isPortraitPlacement
            ? (originalPagePlacement === 'horizontal' ? 'vertical' : 'horizontal')
            : originalPagePlacement;
        var effectivePageW = isPortraitPlacement ? pageH : pageW;
        var effectivePageH = isPortraitPlacement ? pageW : pageH;

        // Рисуем развороты сеткой.
        for (var row = 0; row < fitV; row++) {
            for (var col = 0; col < fitH; col++) {
                var x = margin + col * (spreadWidth + gap);
                var y = margin + row * (spreadHeight + gap);

                if (effectivePagePlacement === 'horizontal') {
                    // Две страницы рядом (вертикальная брошюра).
                    var leftX = x;
                    var rightX = x + effectivePageW;
                    var pageY = y;
                    if (fill) ctx.fillRect(leftX * scale, pageY * scale,
                                           effectivePageW * scale, effectivePageH * scale);
                    ctx.strokeRect(leftX * scale, pageY * scale,
                                   effectivePageW * scale, effectivePageH * scale);
                    if (fill) ctx.fillRect(rightX * scale, pageY * scale,
                                           effectivePageW * scale, effectivePageH * scale);
                    ctx.strokeRect(rightX * scale, pageY * scale,
                                   effectivePageW * scale, effectivePageH * scale);

                    // Пунктир сгиба + две скрепки (кружки).
                    ctx.save();
                    ctx.strokeStyle = '#e67e22'; ctx.fillStyle = '#e67e22';
                    ctx.lineWidth = 0.8; ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo((x + effectivePageW) * scale, y * scale);
                    ctx.lineTo((x + effectivePageW) * scale, (y + effectivePageH) * scale);
                    ctx.stroke();
                    var stapleY1 = y + effectivePageH * 0.25;
                    var stapleY2 = y + effectivePageH * 0.75;
                    ctx.beginPath();
                    ctx.arc((x + effectivePageW) * scale, stapleY1 * scale, 1.8, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc((x + effectivePageW) * scale, stapleY2 * scale, 1.8, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.restore();
                } else {
                    // Две страницы друг над другом (альбомная брошюра).
                    var topY = y;
                    var bottomY = y + effectivePageH;
                    var pageX = x;
                    if (fill) ctx.fillRect(pageX * scale, topY * scale,
                                           effectivePageW * scale, effectivePageH * scale);
                    ctx.strokeRect(pageX * scale, topY * scale,
                                   effectivePageW * scale, effectivePageH * scale);
                    if (fill) ctx.fillRect(pageX * scale, bottomY * scale,
                                           effectivePageW * scale, effectivePageH * scale);
                    ctx.strokeRect(pageX * scale, bottomY * scale,
                                   effectivePageW * scale, effectivePageH * scale);

                    // Пунктир сгиба + две скрепки.
                    ctx.save();
                    ctx.strokeStyle = '#e67e22'; ctx.fillStyle = '#e67e22';
                    ctx.lineWidth = 0.8; ctx.setLineDash([4, 4]);
                    ctx.beginPath();
                    ctx.moveTo(x * scale, (y + effectivePageH) * scale);
                    ctx.lineTo((x + effectivePageW) * scale, (y + effectivePageH) * scale);
                    ctx.stroke();
                    var stapleX1 = x + effectivePageW * 0.25;
                    var stapleX2 = x + effectivePageW * 0.75;
                    ctx.beginPath();
                    ctx.arc(stapleX1 * scale, (y + effectivePageH) * scale, 1.8, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(stapleX2 * scale, (y + effectivePageH) * scale, 1.8, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.restore();
                }
            }
        }

        ctx.restore();
    }

    /**
     * Раскладка страниц (не «скрепка»).
     * Если isPunched — рисуем маркеры перфорации пружины.
     * Логика копирует drawPlacementOnCanvas из vichisliniya_listov_multipage.js.
     */
    function drawComponentPages(canvas, comp, fill, printType, isPunched) {
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var mp = comp.multipage;
        if (!comp.sheet_width || !comp.sheet_height ||
            comp.margin === null || comp.margin === undefined) {
            ctx.font = '11px Arial'; ctx.fillStyle = '#999';
            ctx.fillText('Нет данных о листе', 10, 20);
            return;
        }

        var orientation = mp.fit_selected_orientation;
        if (orientation === 'auto') {
            ctx.font = '11px Arial'; ctx.fillStyle = '#999';
            ctx.fillText('Ориентация не выбрана', 10, 20);
            return;
        }

        var itemW, itemH, fitH, fitV;
        if (orientation === 'landscape') {
            itemW = mp.finished_width; itemH = mp.finished_height;
            fitH = mp.fit_horizontal; fitV = mp.fit_vertical;
        } else {
            itemW = mp.finished_height; itemH = mp.finished_width;
            fitH = mp.fit_horizontal; fitV = mp.fit_vertical;
        }

        if (fitH === 0 || fitV === 0) {
            ctx.font = '11px Arial'; ctx.fillStyle = '#999';
            ctx.fillText('Страницы не помещаются', 10, 20);
            return;
        }

        var gap = mp.vyleta || 0;
        var margin = comp.margin;
        var sheetW = comp.sheet_width;
        var sheetH = comp.sheet_height;

        var padding = 8;
        var scale = Math.min(
            (canvas.width - 2 * padding) / sheetW,
            (canvas.height - 2 * padding) / sheetH
        );

        ctx.save();
        ctx.translate(padding, padding);

        // Контур листа.
        ctx.strokeStyle = '#333'; ctx.lineWidth = 0.8;
        ctx.strokeRect(0, 0, sheetW * scale, sheetH * scale);

        // Пунктир печатной области.
        ctx.strokeStyle = '#aaa'; ctx.setLineDash([3, 2]);
        ctx.strokeRect(margin * scale, margin * scale,
                       (sheetW - 2 * margin) * scale, (sheetH - 2 * margin) * scale);
        ctx.setLineDash([]);

        // Цвета.
        var fillColor, strokeColor;
        if (printType === 'color') {
            fillColor = fill ? 'rgba(52, 152, 219, 0.3)' : 'transparent';
            strokeColor = fill ? '#2980b9' : '#a0c4ff';
        } else {
            fillColor = fill ? 'rgba(200, 200, 200, 0.4)' : 'transparent';
            strokeColor = fill ? '#999999' : '#cccccc';
        }
        ctx.fillStyle = fillColor; ctx.strokeStyle = strokeColor; ctx.lineWidth = 0.4;

        // Первый проход: рисуем все страницы, запоминаем позиции для маркеров.
        var pagePositions = [];
        for (var row = 0; row < fitV; row++) {
            for (var col = 0; col < fitH; col++) {
                var x = margin + col * (itemW + gap);
                var y = margin + row * (itemH + gap);
                pagePositions.push({ x: x, y: y });
                if (fill) ctx.fillRect(x * scale, y * scale, itemW * scale, itemH * scale);
                ctx.strokeRect(x * scale, y * scale, itemW * scale, itemH * scale);
            }
        }

        // Второй проход (только для пружины): маркеры перфорации.
        if (isPunched) {
            var isBookletPortrait = (mp.booklet_orientation === 'portrait');
            var isRotated = (mp.fit_selected_orientation === 'portrait');
            var side = 'left';
            if (isBookletPortrait && !isRotated) side = 'left';
            else if (isBookletPortrait && isRotated) side = 'top';
            else if (!isBookletPortrait && !isRotated) side = 'bottom';
            else side = 'left';

            var numMarks = 8;
            var markSize = 2.2;
            ctx.fillStyle = '#555';

            for (var i = 0; i < pagePositions.length; i++) {
                var pos = pagePositions[i];
                var left = pos.x * scale;
                var right = (pos.x + itemW) * scale;
                var top = pos.y * scale;
                var bottom = (pos.y + itemH) * scale;
                var m, j, step, xPos, yPos;

                if (side === 'left') {
                    var offsetX = Math.max(2, itemW * 0.1) * scale;
                    var startY = top + (bottom - top) * 0.1;
                    var endY = bottom - (bottom - top) * 0.1;
                    step = (endY - startY) / (numMarks + 1);
                    for (j = 1; j <= numMarks; j++) {
                        yPos = startY + j * step;
                        ctx.fillRect(left + offsetX - markSize / 2,
                                     yPos - markSize / 2, markSize, markSize);
                    }
                } else if (side === 'top') {
                    var offsetY = Math.max(2, itemH * 0.1) * scale;
                    var startX = left + (right - left) * 0.1;
                    var endX = right - (right - left) * 0.1;
                    step = (endX - startX) / (numMarks + 1);
                    for (j = 1; j <= numMarks; j++) {
                        xPos = startX + j * step;
                        ctx.fillRect(xPos - markSize / 2,
                                     top + offsetY - markSize / 2,
                                     markSize, markSize);
                    }
                } else {
                    var offsetY2 = Math.max(2, itemH * 0.1) * scale;
                    var startX2 = left + (right - left) * 0.1;
                    var endX2 = right - (right - left) * 0.1;
                    step = (endX2 - startX2) / (numMarks + 1);
                    for (j = 1; j <= numMarks; j++) {
                        xPos = startX2 + j * step;
                        ctx.fillRect(xPos - markSize / 2,
                                     bottom - offsetY2 - markSize / 2,
                                     markSize, markSize);
                    }
                }
            }
        }

        ctx.restore();
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