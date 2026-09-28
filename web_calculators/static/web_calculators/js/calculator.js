/**
 * Файл: web_calculators/static/web_calculators/js/calculator.js
 * НАЗНАЧЕНИЕ: логика публичной страницы-калькулятора.
 *
 * РАБОТА:
 * 1. При загрузке страницы — запрашивает опции калькулятора
 *    (GET /web-calc/api/<slug>/options/) и строит форму.
 * 2. По кнопке «Рассчитать» — собирает payload и отправляет
 *    POST /web-calc/api/<slug>/price/.
 * 3. Показывает результат в правой панели.
 * 4. Рисует SVG-превью размера изделия.
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

/**
 * Хранилище всех данных страницы.
 * Доступ к нему — через замыкание (всё в одном IIFE ниже).
 */
var WC = {

    // URL из шаблона (window.WC_CONFIG, задан инлайн-скриптом в calculator.html).
    config: window.WC_CONFIG || {},

    // Данные от API options (полная структура).
    options: null,

    // Карта компонентов по id: {5: {...}, 7: {...}}.
    componentsById: {},

    // Текущее состояние формы по каждому компоненту:
    // {
    //   "5": {
    //     print_combo: "color_single",
    //     paper_id: 35,
    //     width_mm: 90,
    //     height_mm: 50,
    //     lamination_enabled: false,
    //     lamination_side: "single",
    //     film_id: null,
    //     work_ids: [35]
    //   },
    //   ...
    // }
    state: {},

    // Последний успешный результат расчёта (для отладки и корзины).
    lastResult: null,

    // ========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ
    // ========================================================================

    /**
     * Точка входа. Загружает опции и навешивает общие обработчики.
     */
    init: function () {
        console.log('🚀 Инициализация страницы-калькулятора', this.config);

        // Загружаем опции с сервера.
        this.loadOptions()
            .then(() => this.setupGeneralHandlers())
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

            // Заполняем карту компонентов.
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
            // Рендерим.
            container.appendChild(this.buildComponentBlock(comp));
        });

        // Инициализируем глобальный тираж (общий для всего заказа).
        // Значение по умолчанию — минимальный тираж.
        this.state.circulation = this.options.calculator.min_circulation;

        // Строим блок тиража (селект пресетов + поле ввода + подсказка).
        this.buildCirculationBlock();

        // Если калькулятор многостраничный — показываем блок многостраничных полей.
        if (this.options.calculator.product_type === 'multipage') {
            this.setupMultipageFields();
        }

        // Отрисовываем превью размера первого компонента.
        this.updateSizePreview();

        // Сбрасываем результат.
        this.resetResult();
    },

    /**
     * Строит DOM-блок одного печатного компонента.
     * Возвращает готовый <div class="wc-component">.
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

        // --- 1. Блок размера ---
        block.appendChild(this.buildSizeBlock(comp));

        // --- 2. Блок печати ---
        if (comp.print_options.length) {
            block.appendChild(this.buildPrintBlock(comp));
        }

        // --- 3. Блок бумаги ---
        if (comp.papers.length) {
            block.appendChild(this.buildPaperBlock(comp));
        }

        // --- 4. Блок ламинации ---
        if (comp.lamination && comp.lamination.enabled) {
            block.appendChild(this.buildLaminationBlock(comp));
        }

        // --- 5. Блок опциональных работ ---
        // Показываем только опциональные (галочки). Always-on в форме не отображаем,
        // но они участвуют в расчёте и показываются в результате.
        if (comp.works.length) {
            block.appendChild(this.buildWorksBlock(comp));
        }

        return block;
    },

    /**
     * Блок размера.
     * Логика (вариант A):
     * - Один выпадающий список: пресеты + опция «Свой размер».
     * - При выборе пресета — поля ширины/высоты скрыты, значения берутся из пресета.
     * - При выборе «Свой размер» — появляются два поля ввода (ширина, высота).
     * - Если у компонента нет пресетов — сразу показываем поля ввода.
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
            // Опции-пресеты.
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

        // --- Ряд полей ширины/высоты (скрыт, если пресеты есть и выбран пресет) ---
        var row = document.createElement('div');
        row.className = 'wc-size-row';
        if (hasPresets) row.classList.add('wc-hidden');

        var wInput = document.createElement('input');
        wInput.type = 'number';
        wInput.min = comp.size.min_width_mm;
        wInput.max = comp.size.max_width_mm;
        wInput.step = '1';
        wInput.value = this.state[comp.id].width_mm;
        wInput.dataset.field = 'width';
        wInput.dataset.componentId = comp.id;
        wInput.addEventListener('input', () => {
            this.state[comp.id].width_mm = parseFloat(wInput.value) || 0;
            this.updateSizePreview();
            this.resetResult();
        });
        row.appendChild(wInput);

        var sep = document.createElement('span');
        sep.className = 'wc-size-sep';
        sep.textContent = '×';
        row.appendChild(sep);

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
            this.resetResult();
        });
        row.appendChild(hInput);

        field.appendChild(row);

        // --- Обработчик изменения выпадающего списка ---
        select.addEventListener('change', () => {
            var value = select.value;
            if (value === 'custom') {
                // Показываем поля. Подставляем в них текущие значения, чтобы было что править.
                row.classList.remove('wc-hidden');
                wInput.value = this.state[comp.id].width_mm;
                hInput.value = this.state[comp.id].height_mm;
            } else {
                // Пресет: берём данные из option.
                var opt = select.options[select.selectedIndex];
                var pw = parseFloat(opt.dataset.w);
                var ph = parseFloat(opt.dataset.h);
                this.state[comp.id].width_mm = pw;
                this.state[comp.id].height_mm = ph;
                // Скрываем поля.
                row.classList.add('wc-hidden');
                this.updateSizePreview();
                this.resetResult();
            }
        });

        // Подсказка о диапазоне (без лишних нулей).
        var hint = document.createElement('div');
        hint.className = 'wc-hint';
        hint.textContent = 'от ' + this.formatMm(comp.size.min_width_mm) + '×' + this.formatMm(comp.size.min_height_mm) +
                          ' до ' + this.formatMm(comp.size.max_width_mm) + '×' + this.formatMm(comp.size.max_height_mm) + ' мм';
        field.appendChild(hint);

        return field;
    },


    /**
     * Блок печати: выпадающий список комбинаций (color_single, bw_duplex и т.п.).
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
            this.resetResult();
        });
        field.appendChild(select);

        return field;
    },

    /**
     * Блок бумаги: выпадающий список.
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
            o.textContent = p.name;
            select.appendChild(o);
        });
        select.value = this.state[comp.id].paper_id;
        select.addEventListener('change', () => {
            this.state[comp.id].paper_id = parseInt(select.value, 10);
            this.resetResult();
        });
        field.appendChild(select);

        return field;
    },

    /**
     * Блок ламинации: галочка «с ламинацией» + (если включена)
     * сторона и плёнка.
     */
    buildLaminationBlock: function (comp) {
        var field = document.createElement('div');
        field.className = 'wc-field';

        // Галочка «с ламинацией».
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

        // Контейнер с дополнительными полями — показываем только если галочка.
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
                this.resetResult();
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
                o.textContent = f.name;
                filmSelect.appendChild(o);
            });
            filmSelect.value = this.state[comp.id].film_id;
            filmSelect.addEventListener('change', () => {
                this.state[comp.id].film_id = parseInt(filmSelect.value, 10);
                this.resetResult();
            });
            filmField.appendChild(filmSelect);
            extra.appendChild(filmField);
        }

        // --- Обработчик галочки ---
        chkInput.addEventListener('change', () => {
            var enabled = chkInput.checked;
            this.state[comp.id].lamination_enabled = enabled;
            extra.style.display = enabled ? 'block' : 'none';
            this.resetResult();
        });

        field.appendChild(extra);

        return field;
    },

    /**
     * Блок дополнительных работ: чекбоксы.
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
                // Перерисовываем SVG-превью: некоторые работы могут
                // менять внешний вид изделия (например, скругление углов).
                this.updateSizePreview();
                this.resetResult();
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
    // ТИРАЖ: СЕЛЕКТ ПРЕСЕТОВ + ПОЛЕ ВВОДА
    // ========================================================================

    /**
     * Строит блок тиража:
     * - выпадающий список: [пресет1, пресет2, ..., «Свой тираж»];
     * - поле ввода (показывается только при выборе «Свой тираж»);
     * - подсказка под полем с диапазоном.
     *
     * По умолчанию выбирается первый пресет.
     */
    buildCirculationBlock: function () {
        var calc = this.options.calculator;
        var presets = calc.circulation_presets || [];
        var step = calc.circulation_step || 1;
        var minCirc = calc.min_circulation;
        var maxCirc = calc.max_circulation;

        // Контейнер полей тиража.
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

        // Значение по умолчанию для тиража.
        var defaultCirc = calc.default_circulation || minCirc;
        // Если дефолт не входит в список пресетов, добавим его туда.
        if (presets.indexOf(defaultCirc) === -1) {
            // Добавляем пресет так, чтобы не сломать сортировку.
            // (Он уже прошёл валидацию при сохранении в админке, так что кратен шагу.)
            presets.push(defaultCirc);
            presets.sort(function (a, b) { return a - b; });
            // Перестраиваем опции селекта.
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

        // === 3. Подсказка ===
        var hint = document.createElement('div');
        hint.className = 'wc-hint';
        hint.id = 'wc-circulation-hint';
        hint.textContent = 'от ' + minCirc + ' до ' + maxCirc + ' шт., кратно ' + step;
        wrap.appendChild(hint);

        // === 4. Обработчики ===
        var self = this;

        select.addEventListener('change', function () {
            if (select.value === 'custom') {
                inputWrap.style.display = 'block';
                input.value = presets.length ? presets[0] : minCirc;
            } else {
                inputWrap.style.display = 'none';
                self.applyCirculationRounding(parseInt(select.value, 10));
            }
            self.resetResult();
        });

        // Пока клиент печатает — ничего не делаем со значением.
        // Иначе нельзя ввести многозначное число: после первой цифры
        // оно бы сразу округлилось. Только сбрасываем результат расчёта,
        // чтобы не показывать устаревшую цену.
        input.addEventListener('input', function () {
            self.resetResult();
        });

        // Когда клиент ушёл из поля (blur) или нажал Enter (который
        // превращается в blur) — округляем значение, подставляем его
        // в поле и при необходимости показываем всплывающую подсказку.
        input.addEventListener('blur', function () {
            var v = parseInt(input.value, 10);

            // Если поле пустое или содержит мусор — подставляем минимум.
            if (isNaN(v)) {
                input.value = self.options.calculator.min_circulation;
                self.state.circulation = self.options.calculator.min_circulation;
                return;
            }

            // Округляем. Метод applyCirculationRounding сохранит
            // округлённое значение в state и покажет подсказку,
            // если значение изменилось.
            self.applyCirculationRounding(v);

            // Подставляем округлённое значение в поле.
            input.value = self.state.circulation;
        });

        // Enter = завершить ввод, как будто ушли из поля.
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
        });

        // Ставим в селект значение по умолчанию.
        select.value = defaultCirc;
        // И применяем округление (это запишет корректное значение в state).
        this.applyCirculationRounding(defaultCirc);
    },

    /**
     * Округляет тираж до ближайшего кратного шагу и показывает подсказку,
     * если округление произошло.
     * Записывает итоговое значение в this.state.circulation.
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

        // Подсказка об округлении (всплывающая на 3 секунды).
        if (original !== rounded) {
            this.showRoundingHint('Тираж изменён: количество должно быть кратно ' + step + ' шт.');
        }
    },

    /**
     * Показывает всплывающую подсказку над полем тиража на 3 секунды.
     * В зелёных тонах проекта.
     */
    showRoundingHint: function (message) {
        // Убираем предыдущую подсказку, если есть.
        var old = document.getElementById('wc-rounding-hint');
        if (old) old.parentNode.removeChild(old);

        var hint = document.createElement('div');
        hint.id = 'wc-rounding-hint';
        hint.textContent = message;
        // Позиционируется относительно родителя поля тиража.
        document.querySelector('.wc-field-circulation').appendChild(hint);

        // Автоскрытие через 3 секунды.
        setTimeout(function () {
            if (hint.parentNode) hint.parentNode.removeChild(hint);
        }, 3000);
    },


    // ========================================================================
    // 4. МНОГОСТРАНИЧНЫЕ ПОЛЯ
    // ========================================================================

    /**
     * Настраивает блок многостраничных параметров.
     * Вызывается только если product_type === 'multipage'.
     */
    setupMultipageFields: function () {
        var wrap = document.getElementById('wc-multipage-fields');
        wrap.style.display = 'block';

        // Найдём компонент, у которого задан binding (обычно первый).
        var bindingComp = null;
        for (var i = 0; i < this.options.components.length; i++) {
            var c = this.options.components[i];
            if (c.binding) { bindingComp = c; break; }
        }
        if (!bindingComp) return;

        // --- Ориентация ---
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
        orientSelect.addEventListener('change', () => this.resetResult());

        // --- Скрепление ---
        var bindSelect = document.getElementById('wc-binding');
        bindSelect.innerHTML = '';
        var opt = document.createElement('option');
        opt.value = bindingComp.binding.id;
        opt.textContent = bindingComp.binding.name;
        bindSelect.appendChild(opt);
        bindSelect.addEventListener('change', () => this.resetResult());

        // --- Страницы ---
        var pagesInput = document.getElementById('wc-total-pages');
        pagesInput.min = bindingComp.multipage.min_pages;
        pagesInput.max = bindingComp.multipage.max_pages;
        pagesInput.value = bindingComp.multipage.min_pages;
        document.getElementById('wc-total-pages-hint').textContent =
            'от ' + bindingComp.multipage.min_pages + ' до ' + bindingComp.multipage.max_pages;
        pagesInput.addEventListener('input', () => this.resetResult());
    },

    // ========================================================================
    // 5. ОБЩИЕ ОБРАБОТЧИКИ
    // ========================================================================

    setupGeneralHandlers: function () {
        // Кнопка "Рассчитать".
        document.getElementById('wc-calc-btn').addEventListener('click', () => this.onCalculate());

        // Кнопка "Добавить в корзину".
        document.getElementById('wc-add-to-cart-btn').addEventListener('click', () => {
            alert('Кнопка будет работать на основном сайте bukva-a.ru');
        });

        // Тираж: обработчики навешиваются в renderForm,
        // потому что там создаётся весь интерфейс поля.
    },

    // ========================================================================
    // 6. РАСЧЁТ
    // ========================================================================

    /**
     * Собирает payload из состояния и отправляет на сервер.
     */
    onCalculate: function () {
        // Тираж берём из state — он уже округлён до кратного шагу.
        var circulation = this.state.circulation;
        var min = this.options.calculator.min_circulation;
        var max = this.options.calculator.max_circulation;
        if (!circulation || circulation < min || circulation > max) {
            this.showError('Тираж должен быть от ' + min + ' до ' + max + ' шт.');
            return;
        }

        // Собираем компоненты.
        var components = [];
        var missing = null;
        this.options.components.forEach(comp => {
            var st = this.state[comp.id];
            // Проверка размера.
            if (st.width_mm < comp.size.min_width_mm || st.width_mm > comp.size.max_width_mm ||
                st.height_mm < comp.size.min_height_mm || st.height_mm > comp.size.max_height_mm) {
                missing = 'Размер компонента "' + comp.name + '" вне допустимого диапазона';
                return;
            }
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
        if (missing) { this.showError(missing); return; }

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

        // Кнопка — в состояние «считаю».
        var btn = document.getElementById('wc-calc-btn');
        var originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Считаю…';

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
            btn.disabled = false;
            btn.textContent = originalText;
        });
    },

    // ========================================================================
    // 7. ОТОБРАЖЕНИЕ РЕЗУЛЬТАТА
    // ========================================================================

    /**
     * Рисует блок результата в сайдбаре.
     */
    showResult: function (data, circulation) {
        var box = document.getElementById('wc-result');
        var html = '';

        // Цена за штуку — крупно, общая — мельче.
        html += '<div class="wc-result-price">' + this.formatPrice(data.price_per_unit) + '</div>';
        html += '<div class="wc-result-per-unit">за штуку</div>';

        html += '<div class="wc-result-details">';
        html += '<div class="row"><span>Тираж:</span><span>' + circulation + ' шт.</span></div>';
        html += '<div class="row"><span>Общая сумма:</span><span>' + this.formatPrice(data.total_price) + '</span></div>';
        html += '<div class="row"><span>Масса:</span><span>' + this.formatMass(data.total_mass_g) + '</span></div>';
        html += '<div class="row"><span>Объём:</span><span>' + this.formatVolume(data.total_volume_cm3) + '</span></div>';
        html += '</div>';


        // ===== Серверные работы (для отладки) =====
        // Показываем отдельно работы с trigger='always' и trigger='lamination'.
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


        // Стек.
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
    },

    /**
     * Сбрасывает результат в состояние «не рассчитано».
     */
    resetResult: function () {
        var box = document.getElementById('wc-result');
        box.innerHTML = '<div class="wc-result-placeholder">Заполните параметры и нажмите «Рассчитать»</div>';
        this.lastResult = null;
    },

    /**
     * Показывает ошибку в блоке результата.
     */
    showError: function (message) {
        var box = document.getElementById('wc-result');
        box.innerHTML = '<div class="wc-result-error">' + message + '</div>';
    },

    // ========================================================================
    // 8. ВИЗУАЛИЗАЦИЯ РАЗМЕРА (SVG)
    // ========================================================================

    /**
     * Рисует прямоугольник изделия в масштабе, с размерными линиями
     * сверху (ширина) и справа (высота).
     *
     * Как устроено:
     * - Прямоугольник вписывается в доступную область, сохраняя пропорции.
     * - Сверху — горизонтальная размерная линия с засечками и подписью ширины.
     * - Справа — вертикальная размерная линия с засечками и подписью высоты
     *   (повёрнута на +90°, читается сверху вниз).
     * - Если выбрана опция «Скругление углов» — прямоугольник рисуется
     *   со скруглениями (радиус 4 мм в реальном размере).
     */
    updateSizePreview: function () {
        var svg = document.getElementById('wc-size-preview');
        if (!svg) return;

        // Находим первый компонент.
        var firstId = this.options.components.length ? this.options.components[0].id : null;
        if (!firstId) return;
        var comp = null;
        for (var i = 0; i < this.options.components.length; i++) {
            if (this.options.components[i].id === firstId) { comp = this.options.components[i]; break; }
        }
        if (!comp) return;

        var st = this.state[firstId];
        var w = st.width_mm || 1;
        var h = st.height_mm || 1;

        // ==== ЛЕЙАУТ ====
        // Отступы от краёв viewBox 200×200. Сверху и справа больше —
        // там размещаются размерные линии и подписи.
        var padLeft = 20;
        var padRight = 40;
        var padTop = 35;
        var padBottom = 20;

        var availW = 200 - padLeft - padRight;
        var availH = 200 - padTop - padBottom;

        // Масштаб — вписываем изделие в доступную область, сохраняя пропорции.
        var scaleW = availW / w;
        var scaleH = availH / h;
        var scale = Math.min(scaleW, scaleH);

        var rw = w * scale;
        var rh = h * scale;

        var x = padLeft + (availW - rw) / 2;
        var y = padTop + (availH - rh) / 2;

        // ==== Скругление углов ====
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

        // ==== Единый серый цвет для размерных линий и подписей ====
        // Совпадает с цветом подписей полей формы (#555).
        var dimColor = '#555';

        // ==== Сборка SVG ====
        var svgContent = '';

        // 1. Прямоугольник изделия.
        svgContent += '<rect x="' + x + '" y="' + y + '" width="' + rw + '" height="' + rh +
                      '" rx="' + radiusPx + '" ry="' + radiusPx + '" ' +
                      'fill="#eaf6ef" stroke="#0B8661" stroke-width="1.5" />';

        // 2. Размерная линия по ширине (сверху).
        var dimY = y - 15;
        var tick = 4;

        svgContent += '<line x1="' + x + '" y1="' + dimY + '" x2="' + (x + rw) + '" y2="' + dimY +
                      '" stroke="' + dimColor + '" stroke-width="1" />';
        svgContent += '<line x1="' + x + '" y1="' + (dimY - tick) + '" x2="' + x + '" y2="' + (dimY + tick) +
                      '" stroke="' + dimColor + '" stroke-width="1" />';
        svgContent += '<line x1="' + (x + rw) + '" y1="' + (dimY - tick) + '" x2="' + (x + rw) + '" y2="' + (dimY + tick) +
                      '" stroke="' + dimColor + '" stroke-width="1" />';
        svgContent += '<text x="' + (x + rw / 2) + '" y="' + (dimY - 6) +
                      '" text-anchor="middle" font-size="11" fill="' + dimColor + '">' +
                      Math.round(w) + ' мм</text>';

        // 3. Размерная линия по высоте (справа).
        //    Подпись повёрнута на +90°, поэтому читается сверху вниз.
        var dimX = x + rw + 15;

        svgContent += '<line x1="' + dimX + '" y1="' + y + '" x2="' + dimX + '" y2="' + (y + rh) +
                      '" stroke="' + dimColor + '" stroke-width="1" />';
        svgContent += '<line x1="' + (dimX - tick) + '" y1="' + y + '" x2="' + (dimX + tick) + '" y2="' + y +
                      '" stroke="' + dimColor + '" stroke-width="1" />';
        svgContent += '<line x1="' + (dimX - tick) + '" y1="' + (y + rh) + '" x2="' + (dimX + tick) + '" y2="' + (y + rh) +
                      '" stroke="' + dimColor + '" stroke-width="1" />';
        svgContent += '<text x="' + (dimX + 10) + '" y="' + (y + rh / 2) +
                      '" text-anchor="middle" font-size="11" fill="' + dimColor + '" ' +
                      'transform="rotate(90, ' + (dimX + 10) + ', ' + (y + rh / 2) + ')">' +
                      Math.round(h) + ' мм</text>';

        svg.innerHTML = svgContent;
    },


    // ========================================================================
    // 9. ФОРМАТИРОВАНИЕ
    // ========================================================================
    /**
     * Форматирует размер в миллиметрах: убирает лишние нули после запятой.
     * Примеры:
     *   90       → "90"
     *   90.0     → "90"
     *   90.00    → "90"
     *   90.5     → "90.5"
     *   90.50    → "90.5"
     *   85.25    → "85.25"
     */
    formatMm: function (v) {
        // Округляем до 2 знаков и убираем хвостовые нули/точку.
        var s = (Math.round(v * 100) / 100).toString();
        return s;
    },


    formatPrice: function (v) {
        return (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' ₽';
    },

    formatMass: function (grams) {
        return (grams / 1000).toFixed(3).replace('.', ',') + ' кг';
    },

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