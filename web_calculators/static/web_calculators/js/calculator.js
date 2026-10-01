/**
 * Файл: web_calculators/static/web_calculators/js/calculator.js
 * НАЗНАЧЕНИЕ: логика публичной страницы-калькулятора.
 *
 * РАБОТА:
 * 1. При загрузке страницы — запрашивает опции (GET /web-calc/api/<slug>/options/),
 *    строит форму и СРАЗУ делает первый расчёт по параметрам по умолчанию.
 * 2. Автопересчёт через 1 секунду после любого изменения формы
 *    (debounce — срабатывает только последнее изменение).
 * 3. Отдельно — быстрый пересчёт по blur/Enter (когда клиент ушёл из поля).
 * 4. Валидация размеров: не подставляет границы, а подсвечивает поле
 *    красной рамкой и показывает подсказку. Пока есть ошибка — цена
 *    не считается, в блоке результата «Ожидание расчёта».
 * 5. Показывает результат: крупно — цена за тираж, мельче — за штуку,
 *    кнопка «Добавить в корзину», затем детали.
 * 6. Рисует SVG-превью размера изделия с размерными линиями.
 *
 * ВСЁ СОСТОЯНИЕ — в объекте state. DOM-элементы создаются через JS,
 * потому что структура формы зависит от ответа API.
 *
 * Подробные комментарии к каждой строке — для понимания новичками.
 */

"use strict";

// ============================================================================
// 1. ОБЪЕКТ СОСТОЯНИЯ
// ============================================================================

var WC = {

    // URL из шаблона (window.WC_CONFIG, задан инлайн-скриптом в calculator.html).
    config: window.WC_CONFIG || {},

    // Данные от API options (полная структура).
    options: null,

    // Карта компонентов по id: {5: {...}, 7: {...}} — удобно искать по id.
    componentsById: {},

    // Состояние формы.
    // Для каждого компонента: { "5": { print_combo, paper_id, width_mm, height_mm, ... } }.
    // Общее: circulation, needsRecalc, recalcInProgress.
    state: {},

    // Последний успешный результат (на будущее, для «корзины»).
    lastResult: null,

    // Таймер debounce для автопересчёта (общий для всех полей).
    _debounceTimer: null,


    // ========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ
    // ========================================================================

    /**
     * Точка входа. Загружает опции, строит форму, делает первый расчёт.
     */
    init: function () {
        console.log('🚀 Инициализация страницы-калькулятора', this.config);

        // Загружаем опции с сервера.
        this.loadOptions()
            .then(() => {
                // Навешиваем общие обработчики (debounce, focusout, Enter).
                this.setupGeneralHandlers();

                // Сразу считаем цену по параметрам по умолчанию,
                // чтобы клиент не видел «Ожидание расчёта» при загрузке.
                this.onCalculate();
            })
            .catch(err => {
                console.error('Ошибка загрузки опций:', err);
                this.showError('Не удалось загрузить параметры калькулятора. Обновите страницу.');
            });
    },

    /**
     * Загружает опции калькулятора (GET).
     * Возвращает Promise, чтобы после загрузки можно было строить форму.
     */
    loadOptions: function () {
        return fetch(this.config.optionsUrl, {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(data => {
            if (!data.success) throw new Error(data.error || 'API вернул success: false');
            this.options = data;

            // Заполняем карту компонентов для быстрого доступа по id.
            this.componentsById = {};
            data.components.forEach(c => { this.componentsById[c.id] = c; });

            // Рендерим форму.
            this.renderForm();
        });
    },


    // ========================================================================
    // 3. РЕНДЕР ФОРМЫ
    // ========================================================================

    /**
     * Строит форму по каждому компоненту.
     */
    renderForm: function () {
        var container = document.getElementById('wc-components-container');
        container.innerHTML = '';

        // Для каждого компонента — свой блок.
        this.options.components.forEach(comp => {
            // Инициализируем состояние компонента.
            this.state[comp.id] = {
                print_combo: comp.print_options.length ? comp.print_options[0].value : null,
                paper_id: comp.papers.length ? comp.papers[0].id : null,
                width_mm: comp.size.presets.length ? comp.size.presets[0].w : comp.size.min_width_mm,
                height_mm: comp.size.presets.length ? comp.size.presets[0].h : comp.size.min_height_mm,
                lamination_enabled: false,
                lamination_side: (comp.lamination && comp.lamination.sides.length) ? comp.lamination.sides[0].value : 'single',
                film_id: (comp.lamination && comp.lamination.films.length) ? comp.lamination.films[0].id : null,
                work_ids: []
            };
            // Рендерим блок компонента и добавляем в контейнер.
            container.appendChild(this.buildComponentBlock(comp));
        });

        // Инициализируем глобальный тираж (общий для всего заказа).
        this.state.circulation = this.options.calculator.min_circulation;

        // Строим блок тиража (селект пресетов + поле ввода + подсказка).
        this.buildCirculationBlock();

        // Если калькулятор многостраничный — показываем блок многостраничных полей.
        if (this.options.calculator.product_type === 'multipage') {
            this.setupMultipageFields();
        }

        // Первичная отрисовка SVG-превью.
        this.updateSizePreview();

        // Показываем «Ожидание расчёта» (знак вопроса + серая неактивная кнопка).
        // Реальную цену подставит первый вызов onCalculate() из init().
        this.resetResult();

        // Флаги для авто-пересчёта.
        // needsRecalc — были ли изменения формы с момента последнего расчёта.
        // recalcInProgress — защита от параллельных запросов.
        this.state.needsRecalc = false;
        this.state.recalcInProgress = false;
    },

    /**
     * Строит DOM-блок одного печатного компонента.
     */
    buildComponentBlock: function (comp) {
        var block = document.createElement('div');
        block.className = 'wc-component';
        block.dataset.componentId = comp.id;

        // Заголовок компонента.
        var title = document.createElement('h3');
        title.className = 'wc-component-title';
        title.textContent = comp.name;
        block.appendChild(title);

        // 1. Блок размера (селект пресетов + поля ширины/высоты).
        block.appendChild(this.buildSizeBlock(comp));

        // 2. Блок печати (выбор комбинации color/bw + single/duplex).
        if (comp.print_options.length) {
            block.appendChild(this.buildPrintBlock(comp));
        }

        // 3. Блок бумаги (выпадающий список доступных бумаг).
        if (comp.papers.length) {
            block.appendChild(this.buildPaperBlock(comp));
        }

        // 4. Блок ламинации (галочка + сторона + плёнка).
        if (comp.lamination && comp.lamination.enabled) {
            block.appendChild(this.buildLaminationBlock(comp));
        }

        // 5. Блок опциональных работ (галочки).
        // Always-on работы в форме не показываем, но они участвуют в расчёте.
        if (comp.works.length) {
            block.appendChild(this.buildWorksBlock(comp));
        }

        return block;
    },

    /**
     * Блок размера.
     * Логика:
     * - Выпадающий список: пресеты + «Свой размер».
     * - При выборе пресета поля ширины/высоты скрыты.
     * - При выборе «Свой размер» — появляются два поля ввода.
     * - Валидация: при вводе меньше min / больше max — красная рамка
     *   и постоянная подсказка. Значение НЕ подставляется.
     */
    buildSizeBlock: function (comp) {
        var field = document.createElement('div');
        field.className = 'wc-field';

        var label = document.createElement('label');
        label.textContent = 'Размер (мм)';
        field.appendChild(label);

        var hasPresets = comp.size.presets.length > 0;

        // --- Выпадающий список ---
        var select = document.createElement('select');
        select.className = 'wc-size-select';

        if (hasPresets) {
            // Опции-пресеты (90×50, 85×55 и т.п.).
            var self = this;
            comp.size.presets.forEach(function (p, index) {
                var opt = document.createElement('option');
                opt.value = 'preset_' + index;
                // Форматируем размер: 90.00 × 50.00 → "90×50".
                opt.textContent = self.formatMm(p.w) + '×' + self.formatMm(p.h);
                opt.dataset.w = p.w;
                opt.dataset.h = p.h;
                select.appendChild(opt);
            });
            // Опция «Свой размер».
            var customOpt = document.createElement('option');
            customOpt.value = 'custom';
            customOpt.textContent = 'Свой размер';
            select.appendChild(customOpt);
        } else {
            // Если пресетов нет — единственная опция «Свой размер».
            var onlyCustom = document.createElement('option');
            onlyCustom.value = 'custom';
            onlyCustom.textContent = 'Свой размер';
            select.appendChild(onlyCustom);
        }

        field.appendChild(select);

        // --- Ряд полей ширины/высоты (скрыт, если выбран пресет) ---
        var row = document.createElement('div');
        row.className = 'wc-size-row';
        if (hasPresets) row.classList.add('wc-hidden');

        // ===== ЯЧЕЙКА ШИРИНЫ =====
        var wCell = document.createElement('div');
        wCell.className = 'wc-size-cell';

        var wInput = document.createElement('input');
        wInput.type = 'number';
        wInput.min = comp.size.min_width_mm;
        wInput.max = comp.size.max_width_mm;
        wInput.step = '1';
        wInput.value = this.state[comp.id].width_mm;
        wInput.dataset.field = 'width';
        wInput.dataset.componentId = comp.id;

        // При каждом изменении:
        //  - обновляем state,
        //  - перерисовываем превью,
        //  - помечаем форму изменённой (сбрасывает цену на «Ожидание расчёта»),
        //  - валидируем (красная рамка + подсказка при ошибке),
        //  - ставим таймер на автопересчёт (debounce 1 секунда).
        wInput.addEventListener('input', () => {
            this.state[comp.id].width_mm = parseFloat(wInput.value) || 0;
            this.updateSizePreview();
            this.markDirty();
            this.validateSizeField(comp, 'width', wInput, wCell);
            this.scheduleAutoRecalc();
        });
        // Enter = завершить ввод (для удобства и для запуска быстрого пересчёта).
        wInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); wInput.blur(); }
        });
        wCell.appendChild(wInput);
        row.appendChild(wCell);

        // Разделитель «×» между полями ширины и высоты.
        var sep = document.createElement('span');
        sep.className = 'wc-size-sep';
        sep.textContent = '×';
        row.appendChild(sep);

        // ===== ЯЧЕЙКА ВЫСОТЫ =====
        var hCell = document.createElement('div');
        hCell.className = 'wc-size-cell';

        var hInput = document.createElement('input');
        hInput.type = 'number';
        hInput.min = comp.size.min_height_mm;
        hInput.max = comp.size.max_height_mm;
        hInput.step = '1';
        hInput.value = this.state[comp.id].height_mm;
        hInput.dataset.field = 'height';
        hInput.dataset.componentId = comp.id;

        hInput.addEventListener('input', () => {
            this.state[comp.id].height_mm = parseFloat(hInput.value) || 0;
            this.updateSizePreview();
            this.markDirty();
            this.validateSizeField(comp, 'height', hInput, hCell);
            this.scheduleAutoRecalc();
        });
        hInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); hInput.blur(); }
        });
        hCell.appendChild(hInput);
        row.appendChild(hCell);

        field.appendChild(row);

        // --- Обработчик выбора пресета/своего размера ---
        select.addEventListener('change', () => {
            var value = select.value;
            if (value === 'custom') {
                // Показываем поля ввода. Подставляем текущие значения,
                // чтобы клиент мог их сразу править.
                row.classList.remove('wc-hidden');
                wInput.value = this.state[comp.id].width_mm;
                hInput.value = this.state[comp.id].height_mm;
            } else {
                // Пресет — берём ширину/высоту из data-атрибутов.
                var opt = select.options[select.selectedIndex];
                var pw = parseFloat(opt.dataset.w);
                var ph = parseFloat(opt.dataset.h);
                this.state[comp.id].width_mm = pw;
                this.state[comp.id].height_mm = ph;
                // Скрываем поля (значения всё равно берутся из state).
                row.classList.add('wc-hidden');
                this.updateSizePreview();
            }
            this.markDirty();
            // Смена пресета — тоже триггер автопересчёта.
            this.scheduleAutoRecalc();
        });

        // Подсказка о допустимом диапазоне размеров.
        var hint = document.createElement('div');
        hint.className = 'wc-hint';
        hint.textContent = 'от ' + this.formatMm(comp.size.min_width_mm) + '×' + this.formatMm(comp.size.min_height_mm) +
                          ' до ' + this.formatMm(comp.size.max_width_mm) + '×' + this.formatMm(comp.size.max_height_mm) + ' мм';
        field.appendChild(hint);

        return field;
    },

    /**
     * Блок выбора комбинации печати (color_single, bw_duplex и т.п.).
     */
    buildPrintBlock: function (comp) {
        var field = document.createElement('div');
        field.className = 'wc-field';

        var label = document.createElement('label');
        label.textContent = 'Печать';
        field.appendChild(label);

        var select = document.createElement('select');
        comp.print_options.forEach(opt => {
            var o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            select.appendChild(o);
        });
        select.value = this.state[comp.id].print_combo;
        select.addEventListener('change', () => {
            this.state[comp.id].print_combo = select.value;
            this.markDirty();
        });
        field.appendChild(select);

        return field;
    },

    /**
     * Блок бумаги (выпадающий список).
     */
    buildPaperBlock: function (comp) {
        var field = document.createElement('div');
        field.className = 'wc-field';

        var label = document.createElement('label');
        label.textContent = 'Бумага';
        field.appendChild(label);

        var select = document.createElement('select');
        comp.papers.forEach(p => {
            var o = document.createElement('option');
            o.value = p.id;
            o.textContent = p.name;   // здесь уже клиентское название, если задано
            select.appendChild(o);
        });
        select.value = this.state[comp.id].paper_id;
        select.addEventListener('change', () => {
            this.state[comp.id].paper_id = parseInt(select.value, 10);
            this.markDirty();
        });
        field.appendChild(select);

        return field;
    },

    /**
     * Блок ламинации: галочка «С ламинацией» + выбор стороны и плёнки.
     */
    buildLaminationBlock: function (comp) {
        var field = document.createElement('div');
        field.className = 'wc-field';

        // Галочка «С ламинацией».
        var chk = document.createElement('label');
        chk.className = 'wc-checkbox';

        var chkInput = document.createElement('input');
        chkInput.type = 'checkbox';
        chkInput.checked = this.state[comp.id].lamination_enabled;
        chk.appendChild(chkInput);

        var chkText = document.createElement('span');
        chkText.textContent = 'С ламинацией';
        chk.appendChild(chkText);

        field.appendChild(chk);

        // Дополнительные поля (сторона, плёнка) — видимы, только если галочка.
        var extra = document.createElement('div');
        extra.style.display = this.state[comp.id].lamination_enabled ? 'block' : 'none';
        extra.style.marginTop = '0.75rem';

        // --- Сторона (если разрешено больше одной) ---
        if (comp.lamination.sides.length > 1) {
            var sideField = document.createElement('div');
            sideField.className = 'wc-field';

            var sideLabel = document.createElement('label');
            sideLabel.textContent = 'Сторона';
            sideField.appendChild(sideLabel);

            var sideSelect = document.createElement('select');
            comp.lamination.sides.forEach(s => {
                var o = document.createElement('option');
                o.value = s.value;
                o.textContent = s.label;
                sideSelect.appendChild(o);
            });
            sideSelect.value = this.state[comp.id].lamination_side;
            sideSelect.addEventListener('change', () => {
                this.state[comp.id].lamination_side = sideSelect.value;
                this.markDirty();
            });
            sideField.appendChild(sideSelect);
            extra.appendChild(sideField);
        }

        // --- Плёнка ---
        if (comp.lamination.films.length) {
            var filmField = document.createElement('div');
            filmField.className = 'wc-field';

            var filmLabel = document.createElement('label');
            filmLabel.textContent = 'Плёнка';
            filmField.appendChild(filmLabel);

            var filmSelect = document.createElement('select');
            comp.lamination.films.forEach(f => {
                var o = document.createElement('option');
                o.value = f.id;
                o.textContent = f.name;   // клиентское название, если задано
                filmSelect.appendChild(o);
            });
            filmSelect.value = this.state[comp.id].film_id;
            filmSelect.addEventListener('change', () => {
                this.state[comp.id].film_id = parseInt(filmSelect.value, 10);
                this.markDirty();
            });
            filmField.appendChild(filmSelect);
            extra.appendChild(filmField);
        }

        // --- Обработчик галочки ---
        chkInput.addEventListener('change', () => {
            var enabled = chkInput.checked;
            this.state[comp.id].lamination_enabled = enabled;
            extra.style.display = enabled ? 'block' : 'none';
            this.markDirty();
        });

        field.appendChild(extra);

        return field;
    },

    /**
     * Блок опциональных работ (галочки).
     */
    buildWorksBlock: function (comp) {
        var field = document.createElement('div');
        field.className = 'wc-field';

        var label = document.createElement('label');
        label.textContent = 'Дополнительные работы';
        field.appendChild(label);

        comp.works.forEach(w => {
            var wrap = document.createElement('label');
            wrap.className = 'wc-checkbox';

            var input = document.createElement('input');
            input.type = 'checkbox';
            input.value = w.id;
            input.addEventListener('change', () => {
                var st = this.state[comp.id];
                var wid = w.id;
                if (input.checked) {
                    if (st.work_ids.indexOf(wid) === -1) st.work_ids.push(wid);
                } else {
                    st.work_ids = st.work_ids.filter(id => id !== wid);
                }
                // Работа может влиять на превью (например, скругление углов).
                this.updateSizePreview();
                this.markDirty();
            });
            wrap.appendChild(input);

            var span = document.createElement('span');
            span.textContent = w.name;
            wrap.appendChild(span);

            field.appendChild(wrap);
        });

        return field;
    },


    // ========================================================================
    // 4. ТИРАЖ: СЕЛЕКТ ПРЕСЕТОВ + ПОЛЕ ВВОДА
    // ========================================================================

    /**
     * Строит блок тиража:
     * - выпадающий список: [пресет1, пресет2, ..., «Свой тираж»];
     * - поле ввода (показывается только при выборе «Свой тираж»);
     * - подсказка о диапазоне.
     *
     * Тираж округляется до кратного circulation_step только при blur/Enter.
     */
    buildCirculationBlock: function () {
        var calc = this.options.calculator;
        var presets = calc.circulation_presets || [];
        var step = calc.circulation_step || 1;
        var minCirc = calc.min_circulation;
        var maxCirc = calc.max_circulation;

        // Контейнер полей тиража (объявлен в HTML).
        var wrap = document.getElementById('wc-circulation-container');
        wrap.innerHTML = '';

        // === 1. Селект ===
        var select = document.createElement('select');
        select.id = 'wc-circulation-select';
        select.className = 'wc-circulation-select';

        if (presets.length) {
            presets.forEach(function (v) {
                var o = document.createElement('option');
                o.value = v;
                o.textContent = v + ' шт.';
                select.appendChild(o);
            });
        }
        // Опция «Свой тираж».
        var customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = 'Свой тираж';
        select.appendChild(customOpt);

        wrap.appendChild(select);

        // Значение по умолчанию.
        var defaultCirc = calc.default_circulation || minCirc;
        // Если дефолт не входит в список пресетов — добавляем и сортируем.
        if (presets.indexOf(defaultCirc) === -1) {
            presets.push(defaultCirc);
            presets.sort(function (a, b) { return a - b; });
            select.innerHTML = '';
            presets.forEach(function (v) {
                var o = document.createElement('option');
                o.value = v;
                o.textContent = v + ' шт.';
                select.appendChild(o);
            });
            var customOpt2 = document.createElement('option');
            customOpt2.value = 'custom';
            customOpt2.textContent = 'Свой тираж';
            select.appendChild(customOpt2);
        }

        // === 2. Поле ввода (скрыто, если выбран пресет) ===
        var inputWrap = document.createElement('div');
        inputWrap.id = 'wc-circulation-input-wrap';
        inputWrap.style.display = presets.length ? 'none' : 'block';
        inputWrap.style.marginTop = '0.6rem';

        var input = document.createElement('input');
        input.type = 'number';
        input.id = 'wc-circulation-input';
        input.min = minCirc;
        input.max = maxCirc;
        input.step = step;
        input.value = defaultCirc;
        inputWrap.appendChild(input);

        wrap.appendChild(inputWrap);

        // === 3. Подсказка о диапазоне ===
        var hint = document.createElement('div');
        hint.className = 'wc-hint';
        hint.id = 'wc-circulation-hint';
        hint.textContent = 'от ' + minCirc + ' до ' + maxCirc + ' шт., кратно ' + step;
        wrap.appendChild(hint);

        // === 4. Обработчики ===
        var self = this;

        // Смена пресета.
        select.addEventListener('change', function () {
            if (select.value === 'custom') {
                // Показываем поле ручного ввода.
                inputWrap.style.display = 'block';
                // Подставляем ТЕКУЩЕЕ значение тиража (то, что было выбрано
                // в пресете), а не первый пресет из списка. Так при
                // переключении с пресета 1000 на «Свой тираж» в поле
                // окажется 1000 — цена не будет сбивать с толку.
                input.value = self.state.circulation;
            } else {
                // Пресет выбран — поле скрываем, значение округляем.
                inputWrap.style.display = 'none';
                self.applyCirculationRounding(parseInt(select.value, 10));
            }
            self.markDirty();
        });

        // Ввод в поле тиража.
        // ВАЖНО: state.circulation обновляем сразу — чтобы debounce-пересчёт
        // (через 1 секунду) и фокус-пересчёт взяли актуальное значение.
        // Округление до кратного и подстановку границ делаем только на blur —
        // это позволяет спокойно печатать многозначное число.
        input.addEventListener('input', function () {
            var v = parseInt(input.value, 10);
            if (!isNaN(v) && v > 0) {
                self.state.circulation = v;
            }
            self.markDirty();
        });

        // Blur/Enter: округляем до кратного и записываем в state.
        input.addEventListener('blur', function () {
            var v = parseInt(input.value, 10);

            // Пустое или мусор — подставляем минимум.
            if (isNaN(v)) {
                input.value = self.options.calculator.min_circulation;
                self.state.circulation = self.options.calculator.min_circulation;
                return;
            }

            // Округляем с временной подсказкой, если значение изменилось.
            self.applyCirculationRounding(v);

            // Подставляем округлённое значение в поле.
            input.value = self.state.circulation;
        });

        // Enter = завершить ввод (превращается в blur).
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
        });

        // Ставим значение по умолчанию в селект.
        select.value = defaultCirc;
        // И применяем округление (записывает корректное значение в state).
        this.applyCirculationRounding(defaultCirc);
    },

    /**
     * Округляет тираж до ближайшего кратного шагу.
     * Если значение изменилось — показывает ВРЕМЕННУЮ подсказку.
     */
    applyCirculationRounding: function (value) {
        var step = this.options.calculator.circulation_step || 1;
        var minCirc = this.options.calculator.min_circulation;
        var maxCirc = this.options.calculator.max_circulation;

        var original = value;
        var rounded = value;

        if (step > 1) {
            // Округление к ближайшему кратному: 74 → 50, 75 → 100.
            rounded = Math.round(value / step) * step;
        }
        if (rounded < minCirc) rounded = minCirc;
        if (rounded > maxCirc) rounded = Math.floor(maxCirc / step) * step;

        this.state.circulation = rounded;

        // Если значение изменилось — всплывающая подсказка на 3 секунды.
        if (original !== rounded) {
            var circField = document.querySelector('.wc-field-circulation');
            this.flashFieldHint(circField, 'Тираж изменён: количество должно быть кратно ' + step + ' шт.');
        }
    },


    // ========================================================================
    // 5. ВАЛИДАЦИЯ И ПОДСКАЗКИ
    // ========================================================================

    /**
     * Проверяет размер (ширину или высоту).
     * НЕ подставляет граничное значение, а только подсвечивает поле
     * красной рамкой и показывает постоянную подсказку.
     *
     * @returns {boolean} — true, если значение валидно.
     */
    validateSizeField: function (comp, dimension, input, fieldWrap) {
        var minVal, maxVal, label, labelAccusative;
        if (dimension === 'width') {
            minVal = comp.size.min_width_mm;
            maxVal = comp.size.max_width_mm;
            label = 'Ширина';                 // для подсказок «Ширина не может…»
            labelAccusative = 'ширину';       // для «Введите ширину»
        } else {
            minVal = comp.size.min_height_mm;
            maxVal = comp.size.max_height_mm;
            label = 'Высота';
            labelAccusative = 'высоту';
        }

        var v = parseFloat(input.value);
        var hintText = '';

        if (isNaN(v)) {
            hintText = 'Введите ' + labelAccusative;
        } else if (v < minVal) {
            hintText = label + ' не может быть меньше ' + this.formatMm(minVal) + ' мм';
        } else if (v > maxVal) {
            hintText = label + ' не может быть больше ' + this.formatMm(maxVal) + ' мм';
        }

        if (hintText) {
            // Ошибка: подсветка + постоянная подсказка.
            fieldWrap.classList.add('wc-has-error');
            this.showFieldHint(fieldWrap, hintText);
            return false;
        }

        // Ошибки нет: снимаем подсветку и убираем подсказку.
        fieldWrap.classList.remove('wc-has-error');
        this.hideFieldHint(fieldWrap);
        return true;
    },

    /**
     * Показывает ПОСТОЯННУЮ подсказку под элементом.
     * Если подсказка уже есть — обновляем текст, не пересоздавая DOM
     * (иначе мигало бы при каждом нажатии клавиши).
     */
    showFieldHint: function (anchorField, message) {
        if (!anchorField) return;
        var hint = anchorField.querySelector('.wc-field-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.className = 'wc-field-hint';
            anchorField.appendChild(hint);
        }
        hint.textContent = message;
    },

    /**
     * Убирает постоянную подсказку под элементом.
     */
    hideFieldHint: function (anchorField) {
        if (!anchorField) return;
        var hint = anchorField.querySelector('.wc-field-hint');
        if (hint) hint.parentNode.removeChild(hint);
    },

    /**
     * Показывает ВРЕМЕННУЮ подсказку (автоскрытие через 3 секунды).
     * Используется для подсказки об округлении тиража.
     */
    flashFieldHint: function (anchorField, message) {
        if (!anchorField) return;
        var hint = anchorField.querySelector('.wc-field-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.className = 'wc-field-hint';
            anchorField.appendChild(hint);
        }
        hint.textContent = message;
        // Сбрасываем предыдущий таймер — если подсказка мигнула ещё раз,
        // отсчёт начинается заново.
        clearTimeout(hint._hideTimer);
        hint._hideTimer = setTimeout(function () {
            if (hint.parentNode) hint.parentNode.removeChild(hint);
        }, 3000);
    },

    /**
     * Запускает отложенный автопересчёт (debounce).
     * При каждом новом вызове таймер перезапускается — срабатывает
     * только последнее изменение. Классический debounce на 1 секунду.
     */
    scheduleAutoRecalc: function (delay) {
        var self = this;
        delay = delay || 1000;
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(function () {
            if (self.state.needsRecalc && !self.state.recalcInProgress) {
                self.onCalculate();
            }
        }, delay);
    },


    // ========================================================================
    // 6. МНОГОСТРАНИЧНЫЕ ПОЛЯ (для брошюр)
    // ========================================================================

    /**
     * Настраивает блок многостраничных параметров.
     * Вызывается только если product_type === 'multipage'.
     */
    setupMultipageFields: function () {
        var wrap = document.getElementById('wc-multipage-fields');
        wrap.style.display = 'block';

        // Ищем компонент, у которого задан binding (обычно первый/обложка).
        var bindingComp = null;
        for (var i = 0; i < this.options.components.length; i++) {
            var c = this.options.components[i];
            if (c.binding) { bindingComp = c; break; }
        }
        if (!bindingComp) return;

        // --- Ориентация брошюры ---
        var orientSelect = document.getElementById('wc-booklet-orientation');
        orientSelect.innerHTML = '';
        if (bindingComp.multipage.allow_portrait) {
            var o1 = document.createElement('option');
            o1.value = 'portrait';
            o1.textContent = 'Вертикальная (портретная)';
            orientSelect.appendChild(o1);
        }
        if (bindingComp.multipage.allow_landscape) {
            var o2 = document.createElement('option');
            o2.value = 'landscape';
            o2.textContent = 'Горизонтальная (альбомная)';
            orientSelect.appendChild(o2);
        }
        orientSelect.addEventListener('change', () => this.markDirty());

        // --- Способ скрепления ---
        var bindSelect = document.getElementById('wc-binding');
        bindSelect.innerHTML = '';
        var opt = document.createElement('option');
        opt.value = bindingComp.binding.id;
        opt.textContent = bindingComp.binding.name;
        bindSelect.appendChild(opt);
        bindSelect.addEventListener('change', () => this.markDirty());

        // --- Количество страниц ---
        var pagesInput = document.getElementById('wc-total-pages');
        pagesInput.min = bindingComp.multipage.min_pages;
        pagesInput.max = bindingComp.multipage.max_pages;
        pagesInput.value = bindingComp.multipage.min_pages;
        document.getElementById('wc-total-pages-hint').textContent =
            'от ' + bindingComp.multipage.min_pages + ' до ' + bindingComp.multipage.max_pages;
        pagesInput.addEventListener('input', () => this.markDirty());
    },


    // ========================================================================
    // 7. ОБЩИЕ ОБРАБОТЧИКИ
    // ========================================================================

    setupGeneralHandlers: function () {
        // Кнопка «Добавить в корзину» — внутри блока #wc-result.
        // Навешиваем через делегирование, потому что содержимое #wc-result
        // перерисовывается после каждого расчёта.
        var resultBox = document.getElementById('wc-result');
        if (resultBox) {
            resultBox.addEventListener('click', function (e) {
                if (e.target.closest('.wc-result-add-to-cart')) {
                    alert('Кнопка будет работать на основном сайте bukva-a.ru');
                }
            });
        }

        var self = this;
        var form = document.getElementById('wc-form');

        if (form) {
            // (1) Быстрый пересчёт при уходе фокуса из поля.
            // focusout всплывает, поэтому один обработчик на всю форму.
            form.addEventListener('focusout', function () {
                // Небольшая задержка, чтобы клик по кнопке не превратился в лишний запрос.
                setTimeout(function () {
                    if (self.state.needsRecalc && !self.state.recalcInProgress) {
                        self.onCalculate();
                    }
                }, 150);
            });

            // (2) Enter в любом поле = завершение ввода (как blur).
            form.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
                    // Для checkbox и кнопок Enter — это обычное действие, не мешаем.
                    if (e.target.type === 'checkbox' || e.target.type === 'button') return;
                    e.preventDefault();
                    e.target.blur();
                }
            });

            // (3) Debounce-автопересчёт: любое input или change
            // перезапускает таймер на 1 секунду. Срабатывает только
            // последнее изменение. Работает для всех полей формы.
            form.addEventListener('input', function () {
                self.scheduleAutoRecalc();
            });
            form.addEventListener('change', function () {
                self.scheduleAutoRecalc();
            });
        }
    },


    // ========================================================================
    // 8. РАСЧЁТ
    // ========================================================================

    /**
     * Проверяет валидность формы перед отправкой запроса.
     * Возвращает true, если можно отправлять.
     */
    checkFormValidity: function () {
        // 1. Тираж в диапазоне?
        var circulation = this.state.circulation;
        var min = this.options.calculator.min_circulation;
        var max = this.options.calculator.max_circulation;
        if (!circulation || circulation < min || circulation > max) {
            return false;
        }

        // 2. Размеры всех компонентов в диапазоне?
        for (var i = 0; i < this.options.components.length; i++) {
            var comp = this.options.components[i];
            var st = this.state[comp.id];
            if (st.width_mm < comp.size.min_width_mm || st.width_mm > comp.size.max_width_mm ||
                st.height_mm < comp.size.min_height_mm || st.height_mm > comp.size.max_height_mm) {
                return false;
            }
        }

        return true;
    },

    /**
     * Собирает payload из состояния и отправляет на сервер.
     */
    onCalculate: function () {
        // Защита от параллельных запросов.
        if (this.state.recalcInProgress) {
            return;
        }

        // Проверяем валидность: если что-то не так — не отправляем запрос,
        // оставляем «Ожидание расчёта». Когда клиент исправит,
        // debounce или focusout вызовут onCalculate() снова.
        if (!this.checkFormValidity()) {
            this.resetResult();
            return;
        }

        // Снимаем флаг «есть изменения» — актуальность соблюдается.
        this.state.needsRecalc = false;
        this.state.recalcInProgress = true;

        // Тираж берём из state — он уже округлён до кратного шагу.
        var circulation = this.state.circulation;

        // Собираем компоненты в payload.
        var components = [];
        this.options.components.forEach(comp => {
            var st = this.state[comp.id];
            var item = {
                component_id: comp.id,
                print_combo: st.print_combo,
                paper_id: st.paper_id,
                width_mm: st.width_mm,
                height_mm: st.height_mm,
                lamination_enabled: st.lamination_enabled,
                work_ids: st.work_ids
            };
            if (st.lamination_enabled) {
                item.lamination_side = st.lamination_side;
                item.film_id = st.film_id;
            }
            components.push(item);
        });

        // Payload.
        var payload = {
            circulation: circulation,
            components: components
        };

        // Многостраничные поля.
        if (this.options.calculator.product_type === 'multipage') {
            payload.total_pages = parseInt(document.getElementById('wc-total-pages').value, 10);
            payload.booklet_orientation = document.getElementById('wc-booklet-orientation').value;
            payload.binding_id = parseInt(document.getElementById('wc-binding').value, 10);
        }

        // Отправляем.
        fetch(this.config.priceUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(data => {
            if (!data.success) {
                this.showError(data.error || 'Ошибка расчёта');
                return;
            }
            this.lastResult = data;
            this.showResult(data, circulation);
        })
        .catch(err => {
            console.error(err);
            this.showError('Ошибка сети при расчёте');
        })
        .finally(() => {
            this.state.recalcInProgress = false;
        });
    },


    // ========================================================================
    // 9. ОТОБРАЖЕНИЕ РЕЗУЛЬТАТА
    // ========================================================================

    /**
     * Плавно «проявляет» блок результата после подмены содержимого.
     * Использует Web Animations API — работает в Chrome, Firefox, Safari, Edge.
     * Анимация короткая (220 мс) и не мешает восприятию цифр.
     */
    animateResult: function () {
        var box = document.getElementById('wc-result');
        if (!box || !box.animate) return;   // на всякий случай проверяем поддержку
        box.animate(
            [
                { opacity: 0.4, transform: 'translateY(4px)' },
                { opacity: 1,   transform: 'translateY(0)'   }
            ],
            { duration: 220, easing: 'ease-out' }
        );
    },



    /**
     * Рисует блок результата.
     * Структура:
     *   - крупно: цена за тираж,
     *   - мельче: цена за штуку,
     *   - зелёная кнопка «Добавить в корзину»,
     *   - детали (тираж, масса, объём, стек).
     */
    showResult: function (data, circulation) {
        var box = document.getElementById('wc-result');
        var html = '';

        // Цена за тираж (крупно) и за штуку (мельче).
        html += '<div class="wc-result-price">' + this.formatPrice(data.total_price) + '</div>';
        html += '<div class="wc-result-per-unit">' + this.formatPrice(data.price_per_unit) + ' за штуку</div>';

        // Кнопка «Добавить в корзину» — активна, когда есть расчёт.
        html += '<button type="button" class="wc-btn wc-btn-primary wc-result-add-to-cart">'
             +  'Добавить в корзину'
             +  '</button>';

        // Детали (без «Общей суммы» — она крупно выше).
        html += '<div class="wc-result-details">';
        html += '<div class="row"><span>Тираж:</span><span>' + circulation + ' шт.</span></div>';
        html += '<div class="row"><span>Масса:</span><span>' + this.formatMass(data.total_mass_g) + '</span></div>';
        html += '<div class="row"><span>Объём:</span><span>' + this.formatVolume(data.total_volume_cm3) + '</span></div>';
        html += '</div>';

        // Отладочные строки: серверные работы (always и lamination).
        if (data.components && data.components.length) {
            var alwaysOn = [];
            var laminationOn = [];
            data.components.forEach(function (c) {
                if (c.always_on_works && c.always_on_works.length) {
                    c.always_on_works.forEach(function (w) {
                        if (w.trigger === 'always') alwaysOn.push(w.name);
                        else if (w.trigger === 'lamination') laminationOn.push(w.name);
                    });
                }
            });
            if (alwaysOn.length) {
                html += '<div class="wc-result-details" style="margin-top: 0.5rem;">';
                html += '<div class="row"><span>Всегда включено:</span></div>';
                html += '<div class="row" style="justify-content: flex-start; font-size: 0.8rem; color: #666;">'
                     + alwaysOn.join(', ') + '</div>';
                html += '</div>';
            }
            if (laminationOn.length) {
                html += '<div class="wc-result-details" style="margin-top: 0.5rem;">';
                html += '<div class="row"><span>Включено с ламинацией:</span></div>';
                html += '<div class="row" style="justify-content: flex-start; font-size: 0.8rem; color: #666;">'
                     + laminationOn.join(', ') + '</div>';
                html += '</div>';
            }
        }

        // Стопка (если сервер её посчитал).
        if (data.stacks && data.stacks.length) {
            html += '<div class="wc-result-details" style="margin-top: 0.5rem;">';
            data.stacks.forEach(function (s) {
                var label = 'Стопка (' + s.label + ')';
                var val = Math.round(s.width_mm) + '×' + Math.round(s.height_mm) + '×' + Math.round(s.stack_height_mm) + ' мм';
                html += '<div class="row"><span>' + label + ':</span><span>' + val + '</span></div>';
            });
            html += '</div>';
        }

        box.innerHTML = html;
        // Плавное проявление после смены содержимого.
        this.animateResult();
    },

    /**
     * Помечает форму как «изменённую» и сбрасывает цену в «Ожидание расчёта».
     * Вызывается из обработчиков всех полей при изменении.
     */
    markDirty: function () {
        this.state.needsRecalc = true;
        this.resetResult();
    },

    /**
     * Показывает «Ожидание расчёта»: знак вопроса + серая неактивная кнопка.
     *
     * ВАЖНО: перед заменой содержимого мы замеряем текущую высоту блока
     * и фиксируем её как min-height. Это нужно, чтобы при проскролленной
     * странице блок не «сжимался» до размера placeholder и не дёргал
     * весь документ вверх-вниз. Если блок был высотой, скажем, 380 px
     * (с ценой и деталями) — он таким и останется во время «Ожидания».
     * Когда придёт новый результат, он либо займёт ту же высоту, либо
     * чуть больше (min-height только увеличивает, но никогда не уменьшает).
     */
    resetResult: function () {
        var box = document.getElementById('wc-result');

        // Замеряем текущую высоту. При первой загрузке она = 0,
        // поэтому min-height не будет установлен — это нормально.
        var currentHeight = box.offsetHeight;
        if (currentHeight > 0) {
            box.style.minHeight = currentHeight + 'px';
        }

        // Формируем placeholder.
        var html = '';
        html += '<div class="wc-result-price wc-result-price-pending">?</div>';
        html += '<div class="wc-result-per-unit wc-result-per-unit-pending">Ожидание расчёта</div>';
        html += '<button type="button" class="wc-btn wc-btn-primary wc-result-add-to-cart" disabled>'
             +  'Добавить в корзину'
             +  '</button>';
        box.innerHTML = html;
        this.lastResult = null;

        // Плавное проявление знака вопроса.
        this.animateResult();
    },

    /**
     * Показывает текстовую ошибку в блоке результата
     * (например, при сетевой ошибке).
     */
    showError: function (message) {
        var box = document.getElementById('wc-result');
        box.innerHTML = '<div class="wc-result-error">' + message + '</div>';
        this.animateResult();
    },


    // ========================================================================
    // 10. ВИЗУАЛИЗАЦИЯ РАЗМЕРА (SVG)
    // ========================================================================

     /**
     * Рисует прямоугольник изделия в масштабе, с размерными линиями.
     *
     * ИЗМЕНЕНИЕ: SVG-структура создаётся один раз, а при последующих
     * вызовах мы только обновляем атрибуты (x, y, width, height, x1, y1, ...).
     * CSS-transition на этих атрибутах (см. calculator.css) сглаживает
     * изменения — прямоугольник «плывёт» от старого размера к новому,
     * без мигания и полной перерисовки.
     */
    updateSizePreview: function () {
        var svg = document.getElementById('wc-size-preview');
        if (!svg) return;

        // Первый компонент — обычно единственный для одностраничных изделий.
        var firstId = this.options.components.length ? this.options.components[0].id : null;
        if (!firstId) return;
        var comp = this.componentsById[firstId];
        if (!comp) return;

        var st = this.state[firstId];
        var w = st.width_mm || 0;
        var h = st.height_mm || 0;

        // ===== Проверка валидности размеров =====
        // Если размер вне допустимого диапазона — НЕ показываем сообщение
        // сразу. Ждём 2 секунды: пока клиент печатает, промежуточные
        // значения могут быть невалидными (например, он стёр «0» в «90»
        // и собирается ввести «5»). Если за 2 секунды он не завершил ввод —
        // показываем сообщение и стираем превью. Как только значение
        // станет валидным — таймер отменяется, рисуется превью.
        var isValid = (
            w >= comp.size.min_width_mm && w <= comp.size.max_width_mm &&
            h >= comp.size.min_height_mm && h <= comp.size.max_height_mm
        );

        if (!isValid) {
            var self = this;
            clearTimeout(this._previewErrorTimer);
            this._previewErrorTimer = setTimeout(function () {
                // Показываем заглушку только если размер всё ещё невалидный.
                var stNow = self.state[firstId];
                var wNow = stNow.width_mm || 0;
                var hNow = stNow.height_mm || 0;
                var stillInvalid = !(
                    wNow >= comp.size.min_width_mm && wNow <= comp.size.max_width_mm &&
                    hNow >= comp.size.min_height_mm && hNow <= comp.size.max_height_mm
                );
                if (stillInvalid) {
                    svg.innerHTML = '<text x="100" y="100" text-anchor="middle" ' +
                                    'font-size="12" fill="#999" font-style="italic">' +
                                    'Введите допустимые значения</text>';
                }
            }, 2000);
            return;
        }

        // Значение валидное: отменяем таймер ошибки (если он был запущен),
        // чтобы через 2 секунды не мигнула заглушка поверх нормального превью.
        clearTimeout(this._previewErrorTimer);
        this._previewErrorTimer = null;

        // Отступы от краёв viewBox 200×200.
        // Сверху и справа больше — там размещаются размерные линии.
        var padLeft = 20;
        var padRight = 40;
        var padTop = 35;
        var padBottom = 20;

        var availW = 200 - padLeft - padRight;
        var availH = 200 - padTop - padBottom;

        // Масштаб с сохранением пропорций.
        var scaleW = availW / w;
        var scaleH = availH / h;
        var scale = Math.min(scaleW, scaleH);

        var rw = w * scale;
        var rh = h * scale;

        var x = padLeft + (availW - rw) / 2;
        var y = padTop + (availH - rh) / 2;

        // Проверяем, выбрана ли работа с эффектом rounded_corners.
        var hasRoundedCorners = false;
        if (comp.works && st.work_ids && st.work_ids.length) {
            comp.works.forEach(function (work) {
                if (st.work_ids.indexOf(work.id) !== -1 &&
                    work.preview_effect === 'rounded_corners') {
                    hasRoundedCorners = true;
                }
            });
        }
        var radiusPx = hasRoundedCorners ? (4 * scale) : 0;

        // Серый цвет для размерных линий (совпадает с подписями полей формы).
        var dimColor = '#555';

        var dimY = y - 15;
        var tick = 4;
        var dimX = x + rw + 15;

        // ===== 1. Создаём скелет SVG один раз =====
        // Порядок элементов:
        //   rect        — прямоугольник изделия
        //   line[0..2]  — размерная линия ширины + две засечки
        //   line[3..5]  — размерная линия высоты + две засечки
        //   text[0]     — подпись ширины
        //   text[1]     — подпись высоты
        if (!svg.querySelector('rect')) {
            var html = '';
            html += '<rect fill="#eaf6ef" stroke="#0B8661" stroke-width="1.5" />';
            html += '<line stroke="' + dimColor + '" stroke-width="1" />';
            html += '<line stroke="' + dimColor + '" stroke-width="1" />';
            html += '<line stroke="' + dimColor + '" stroke-width="1" />';
            html += '<line stroke="' + dimColor + '" stroke-width="1" />';
            html += '<line stroke="' + dimColor + '" stroke-width="1" />';
            html += '<line stroke="' + dimColor + '" stroke-width="1" />';
            html += '<text text-anchor="middle" font-size="11" fill="' + dimColor + '"></text>';
            html += '<text text-anchor="middle" font-size="11" fill="' + dimColor + '"></text>';
            svg.innerHTML = html;
        }

        var rect = svg.querySelector('rect');
        var lines = svg.querySelectorAll('line');
        var texts = svg.querySelectorAll('text');

        // ===== 2. Обновляем атрибуты — CSS transition сам сгладит переход =====

        // Прямоугольник изделия.
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', rw);
        rect.setAttribute('height', rh);
        rect.setAttribute('rx', radiusPx);
        rect.setAttribute('ry', radiusPx);

        // Размерная линия ширины (сверху).
        lines[0].setAttribute('x1', x);
        lines[0].setAttribute('y1', dimY);
        lines[0].setAttribute('x2', x + rw);
        lines[0].setAttribute('y2', dimY);

        // Левая засечка.
        lines[1].setAttribute('x1', x);
        lines[1].setAttribute('y1', dimY - tick);
        lines[1].setAttribute('x2', x);
        lines[1].setAttribute('y2', dimY + tick);

        // Правая засечка.
        lines[2].setAttribute('x1', x + rw);
        lines[2].setAttribute('y1', dimY - tick);
        lines[2].setAttribute('x2', x + rw);
        lines[2].setAttribute('y2', dimY + tick);

        // Размерная линия высоты (справа).
        lines[3].setAttribute('x1', dimX);
        lines[3].setAttribute('y1', y);
        lines[3].setAttribute('x2', dimX);
        lines[3].setAttribute('y2', y + rh);

        // Верхняя засечка.
        lines[4].setAttribute('x1', dimX - tick);
        lines[4].setAttribute('y1', y);
        lines[4].setAttribute('x2', dimX + tick);
        lines[4].setAttribute('y2', y);

        // Нижняя засечка.
        lines[5].setAttribute('x1', dimX - tick);
        lines[5].setAttribute('y1', y + rh);
        lines[5].setAttribute('x2', dimX + tick);
        lines[5].setAttribute('y2', y + rh);

        // Подпись ширины (сверху).
        texts[0].setAttribute('x', x + rw / 2);
        texts[0].setAttribute('y', dimY - 6);
        texts[0].textContent = Math.round(w) + ' мм';

        // Подпись высоты (справа, повёрнута).
        texts[1].setAttribute('x', dimX + 10);
        texts[1].setAttribute('y', y + rh / 2);
        texts[1].setAttribute('transform', 'rotate(90, ' + (dimX + 10) + ', ' + (y + rh / 2) + ')');
        texts[1].textContent = Math.round(h) + ' мм';
    },


    // ========================================================================
    // 11. ФОРМАТИРОВАНИЕ
    // ========================================================================

    /**
     * Форматирует миллиметры: убирает лишние нули.
     *   90       → "90"
     *   90.00    → "90"
     *   90.5     → "90.5"
     *   85.25    → "85.25"
     */
    formatMm: function (v) {
        var s = (Math.round(v * 100) / 100).toString();
        return s;
    },

    /**
     * Форматирует цену: "1234,56 ₽".
     */
    formatPrice: function (v) {
        return (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' ₽';
    },

    /**
     * Форматирует массу: граммы → килограммы с 3 знаками.
     */
    formatMass: function (grams) {
        return (grams / 1000).toFixed(3).replace('.', ',') + ' кг';
    },

    /**
     * Форматирует объём: см³ → литры с 3 знаками.
     */
    formatVolume: function (cm3) {
        return (cm3 / 1000).toFixed(3).replace('.', ',') + ' л';
    }

};

// ============================================================================
// ЗАПУСК
// ============================================================================

document.addEventListener('DOMContentLoaded', function () {
    WC.init();
});