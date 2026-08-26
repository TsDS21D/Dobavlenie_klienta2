/**
 * ФАЙЛ: vichisliniya_listov_multipage.js
 * НАЗНАЧЕНИЕ: Логика многостраничного режима (брошюры) в секции "Вычисления листов".
 *
 * ОСНОВНЫЕ ФУНКЦИИ:
 * - Переключение между одностраничным и многостраничным режимом с сохранением выбора на сервере.
 * - Загрузка параметров брошюры (способ скрепления, количество страниц, размеры, зазор и т.д.).
 * - Расчёт размещения страниц/разворотов на печатном листе (с учётом способа скрепления и ориентации брошюры).
 * - Автоматический пересчёт количества печатных листов при изменении параметров.
 * - Отображение схемы размещения на canvas (лицевая и оборотная стороны).
 * - Интеграция с секцией "Печатные компоненты" через события.
 *
 * ИСПРАВЛЕНИЕ ДЛЯ УЧЁТА РЕЖИМА ПЕЧАТИ И КРАТНОСТИ СТРАНИЦ (2026-08-12):
 * - В методе calculateSheetCount() изменена логика:
 *   1. total_pages округляется вверх до кратного page_multiple (из способа скрепления).
 *   2. Для двусторонней печати effectivePagesPerSheet = pagesPerSheet * 2,
 *      потому что pagesPerSheet (fit_total) – это количество страниц на ОДНОЙ стороне.
 *   3. Для односторонней печати effectivePagesPerSheet = pagesPerSheet.
 * - Формула: sheetCount = ceil( (adjustedPages * circulation) / effectivePagesPerSheet )
 *
 * ДОБАВЛЕНИЕ (2026-08-13): визуализация маркеров пружины для способа скрепления "пружина".
 * - Маркеры перфорации рисуются на КАЖДОЙ отдельной странице (внутри страницы).
 * - Для портретной ориентации брошюры маркеры расположены по левому краю каждой страницы (внутри).
 * - Для ландшафтной – по нижнему краю каждой страницы (внутри).
 * - Количество маркеров на странице = 3 (можно настроить).
 *
 * ИСПРАВЛЕНИЕ (2026-08-13): маркеры рисуются после основного цикла страниц,
 * чтобы не затирать цвет заливки страниц. Также маркеры размещены внутри страниц.
 *
 * ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ – для понимания новичками.
 */

"use strict";

// ============================================================================
// 1. ОСНОВНОЙ ОБЪЕКТ МОДУЛЯ – содержит все переменные и методы.
// ============================================================================

var vichisliniyaMultipage = {
    // ------------------------------------------------------------------------
    // 1.1. СОСТОЯНИЕ МОДУЛЯ (текущий режим, данные, флаги)
    // ------------------------------------------------------------------------

    // Текущий активный режим: 'single' (одностраничный) или 'multipage' (многостраничный).
    currentMode: 'single',

    // ID выбранного печатного компонента (число или строка).
    printComponentId: null,

    // Текущий тираж (количество экземпляров брошюры) – берётся из просчёта.
    circulation: null,

    // Данные многостраничного расчёта, полученные с сервера (объект).
    multipageData: null,

    // Объект для хранения ссылок на DOM-элементы (кэширование для быстрого доступа).
    elements: {},

    // Карта (Map) способов скрепления, загруженных с сервера (id -> объект).
    bindingsMap: null,

    // Данные о печатном листе (размеры, поля) – копируются из одностраничной секции.
    sheetData: {
        sheet_width: null,
        sheet_height: null,
        margin: null,
        sheet_name: null
    },

    // Текущие параметры многостраничного расчёта (используются для отображения и расчётов).
    currentParams: {
        item_width: 210,      // ширина страницы (мм)
        item_height: 297,     // высота страницы (мм)
        vyleta: 4,            // зазор между страницами/разворотами (мм)
        total_pages: 4,       // общее количество страниц в брошюре
        fit_landscape_total: 0,  // количество страниц/разворотов при альбомной ориентации (на одной стороне)
        fit_portrait_total: 0,    // количество страниц/разворотов при портретной ориентации (на одной стороне)
        fit_horizontal: 0,        // количество по горизонтали (на одной стороне)
        fit_vertical: 0,          // количество по вертикали (на одной стороне)
        fit_total: 0,             // общее количество страниц на ОДНОЙ стороне листа
        fit_selected_orientation: 'auto'  // выбранная ориентация размещения ('landscape', 'portrait', 'auto')
    },

    // Детали размещения для альбомной ориентации (количество разворотов по X и Y на одной стороне).
    landscapeDetails: { x: 0, y: 0 },

    // Детали размещения для портретной ориентации.
    portraitDetails: { x: 0, y: 0 },

    // Ссылки на canvas для визуализации лицевой и оборотной сторон.
    canvasFront: null,
    canvasBack: null,

    // Режим печати текущего компонента ('single' – односторонняя, 'duplex' – двусторонняя).
    printingMode: 'single',

    // Ориентация готовой брошюры ('portrait' – вертикальная, 'landscape' – горизонтальная).
    bookletOrientation: 'portrait',

    // Флаг, что модуль инициализирован (предотвращает повторную инициализацию).
    isInitialized: false,

    // Таймер для автоматического сохранения (autosave) при изменении параметров.
    saveTimeout: null,

    // Флаг, что выполняется сохранение на сервер (блокирует повторные сохранения).
    isSaving: false,

    // Флаг для синхронизации радиокнопок (чтобы не вызывать переключение рекурсивно).
    syncingRadio: false,

    // Текущее рассчитанное количество печатных листов (для отображения).
    currentSheetCount: 0,

    // Флаг, что выполняется загрузка данных (предотвращает множественные запросы).
    isLoading: false,

    // ------------------------------------------------------------------------
    // 1.2. ИНИЦИАЛИЗАЦИЯ МОДУЛЯ (вызывается при загрузке страницы)
    // ------------------------------------------------------------------------

    /**
     * Инициализирует многостраничный модуль:
     * - Находит DOM-элементы и сохраняет ссылки.
     * - Настраивает обработчики событий (переключение режимов, выбор компонента, обновление тиража и т.д.).
     * - Загружает справочник способов скрепления.
     */
    init: function() {
        console.log('📚 Инициализация многостраничного модуля (исправленная версия с правильной формулой)');

        // 1. Находим основные контейнеры в DOM по их ID.
        this.elements.singleModeDiv = document.getElementById('vichisliniya-listov-single-mode');
        this.elements.multipageModeDiv = document.getElementById('vichisliniya-listov-multipage-mode');

        // 2. Находим радиокнопки переключения режимов.
        this.elements.radioSingle = document.querySelector('input[name="product_mode"][value="single"]');
        this.elements.radioMultipage = document.querySelector('input[name="product_mode"][value="multipage"]');

        // Если радиокнопки ещё не загружены в DOM (страница не полностью готова),
        // пробуем снова через 200 мс (рекурсивный вызов).
        if (!this.elements.radioSingle || !this.elements.radioMultipage) {
            setTimeout(() => this.init(), 200);
            return;
        }

        // 3. Навешиваем обработчики на радиокнопки – при переключении сохраняем режим на сервере.
        // Для одностраничного режима.
        this.elements.radioSingle.addEventListener('change', () => {
            if (this.syncingRadio) return;  // Если синхронизация, игнорируем (чтобы не зациклиться).
            this.switchModeAndSave('single');
        });
        // Для многостраничного режима.
        this.elements.radioMultipage.addEventListener('change', () => {
            if (this.syncingRadio) return;
            this.switchModeAndSave('multipage');
        });

        // 4. Находим все элементы управления многостраничного режима (поля ввода, select, canvas).
        this.elements.bindingSelect = document.getElementById('multipage-binding-select');
        this.elements.totalPages = document.getElementById('multipage-total-pages');
        this.elements.multipageItemWidth = document.getElementById('multipage-item-width');
        this.elements.multipageItemHeight = document.getElementById('multipage-item-height');
        this.elements.vyleta = document.getElementById('multipage-vyleta');
        this.elements.bookletOrientation = document.getElementById('multipage-booklet-orientation');
        this.elements.sheetDimensions = document.getElementById('multipage-sheet-dimensions');
        this.elements.marginSpan = document.getElementById('multipage-margin');
        this.elements.printableDimensions = document.getElementById('multipage-printable-dimensions');
        this.elements.landscapeCount = document.getElementById('multipage-landscape-count');
        this.elements.landscapeDetails = document.getElementById('multipage-landscape-details');
        this.elements.portraitCount = document.getElementById('multipage-portrait-count');
        this.elements.portraitDetails = document.getElementById('multipage-portrait-details');
        this.elements.selectedOrientationName = document.getElementById('multipage-selected-orientation-name');
        this.elements.selectedFitTotal = document.getElementById('multipage-selected-fit-total');
        this.canvasFront = document.getElementById('multipage-canvas-front');
        this.canvasBack = document.getElementById('multipage-canvas-back');
        this.elements.warningSpan = document.getElementById('multipage-warning');

        // 5. Загружаем список способов скрепления с сервера (справочник).
        this.loadBindings();

        // 6. Подписываемся на события от других секций.
        // Событие выбора печатного компонента (генерируется в print_components.js).
        document.addEventListener('printComponentSelected', (event) => {
            // Если уже идёт загрузка – пропускаем, чтобы избежать гонки.
            if (this.isLoading) return;
            // Проверяем, что в событии передан ID компонента.
            if (event.detail?.printComponentId) {
                // Сохраняем ID компонента (как строку).
                this.printComponentId = String(event.detail.printComponentId);
                // Получаем тираж из события (если передан) или из секции "Изделие".
                let newCirculation = event.detail.circulation || 1;
                if (event.detail.circulation !== undefined) {
                    this.circulation = event.detail.circulation;
                } else if (window.productSection && typeof window.productSection.getCurrentCirculation === 'function') {
                    this.circulation = window.productSection.getCurrentCirculation() || 1;
                } else {
                    this.circulation = 1;
                }
                // Сохраняем режим печати (односторонняя/двусторонняя).
                this.printingMode = event.detail.printingMode || 'single';
                // Загружаем многостраничные данные для этого компонента.
                this.loadMultipageData();
            }
        });

        // Событие отмены выбора печатного компонента – сбрасываем состояние.
        document.addEventListener('printComponentDeselected', () => this.resetAll());

        // Событие загрузки данных о печатном листе (из одностраничной секции).
        document.addEventListener('vichisliniyaListovSheetDataLoaded', (event) => {
            if (event.detail) {
                // Копируем данные о листе в наш объект.
                this.sheetData = { ...event.detail };
                // Обновляем отображение информации о листе в многостраничном блоке.
                this.updateSheetInfoDisplay();
                // Если сейчас активен многостраничный режим – перерисовываем схему и пересчитываем.
                if (this.currentMode === 'multipage') {
                    this.calculateFitting();
                    this.calculateSheetCount();
                    this.drawBothSides();
                }
            }
        });

        // Событие сохранения тиража (из секции "Изделие") – обновляем данные.
        document.addEventListener('productCirculationSaved', (event) => {
            const currentProschetId = this.getCurrentProschetIdFromComponent();
            if (currentProschetId && event.detail?.proschetId == currentProschetId) {
                this.circulation = event.detail.circulation;
                if (this.currentMode === 'multipage') {
                    // Перезагружаем данные с сервера (где уже пересчитано количество листов).
                    this.loadMultipageData();
                }
            }
        });

        // 7. Настраиваем обработчики событий на полях ввода (автосохранение при изменении).
        // Список полей, которые нужно отслеживать.
        const paramFields = ['multipageItemWidth', 'multipageItemHeight', 'vyleta', 'totalPages', 'bindingSelect'];
        paramFields.forEach(field => {
            const el = this.elements[field];
            if (el) {
                // Обработчик события 'input' – срабатывает при каждом изменении значения.
                el.addEventListener('input', () => {
                    // Обновляем локальные параметры из формы.
                    this.updateParamsFromForm();
                    // Если активен многостраничный режим – выполняем пересчёт и отрисовку.
                    if (this.currentMode === 'multipage') {
                        this.calculateFitting();
                        this.calculateSheetCount();
                        this.drawBothSides();
                        this.scheduleSave();  // Отложенное сохранение.
                    }
                });
                // Обработчик 'change' – для надёжности (срабатывает после завершения ввода).
                el.addEventListener('change', () => {
                    this.updateParamsFromForm();
                    if (this.currentMode === 'multipage') {
                        this.calculateFitting();
                        this.calculateSheetCount();
                        this.drawBothSides();
                        this.scheduleSave();
                    }
                });
            }
        });

        // Обработчик изменения ориентации брошюры (выпадающий список).
        if (this.elements.bookletOrientation) {
            this.elements.bookletOrientation.addEventListener('change', () => {
                this.bookletOrientation = this.elements.bookletOrientation.value;
                if (this.currentMode === 'multipage') {
                    this.calculateFitting();
                    this.calculateSheetCount();
                    this.drawBothSides();
                    this.scheduleSave();
                }
            });
        }

        // Обработчик клика по блоку выбора ориентации размещения (альбомная/портретная).
        // Пользователь может кликнуть по блоку "Альбомная" или "Портретная".
        const fittingOptions = document.getElementById('multipage-fitting-options');
        if (fittingOptions) {
            fittingOptions.addEventListener('click', (event) => {
                const option = event.target.closest('.fitting-option');
                if (option) {
                    const orientation = option.dataset.orientation;
                    if (orientation) this.selectOrientation(orientation);
                }
            });
        }

        // Скрываем кнопку "Сохранить" (используется автосохранение, отдельная кнопка не нужна).
        const saveBtn = document.getElementById('multipage-save-btn');
        if (saveBtn) saveBtn.style.display = 'none';

        // По умолчанию показываем одностраничный режим (до выбора компонента).
        this.switchMode('single');
        this.isInitialized = true;
        console.log('✅ Многостраничный модуль готов');
    },

    // ------------------------------------------------------------------------
    // 1.3. ЗАГРУЗКА СПРАВОЧНИКА СПОСОБОВ СКРЕПЛЕНИЯ
    // ------------------------------------------------------------------------

    /**
     * Загружает список способов скрепления с сервера и заполняет выпадающий список.
     */
    loadBindings: function() {
        // Отправляем GET-запрос к API для получения списка способов скрепления.
        fetch('/vichisliniya_listov/multipage/bindings/')
            .then(r => r.json()) // Преобразуем ответ в JSON.
            .then(data => {
                // Если запрос успешен и данные есть, заполняем select.
                if (data.success && data.bindings && this.elements.bindingSelect) {
                    const select = this.elements.bindingSelect;
                    // Очищаем select и добавляем пустую опцию.
                    select.innerHTML = '<option value="">-- выберите --</option>';
                    this.bindingsMap = new Map(); // Создаём Map для быстрого доступа по id.
                    // Перебираем полученные способы скрепления.
                    data.bindings.forEach(b => {
                        const option = document.createElement('option');
                        option.value = b.id;
                        option.textContent = `${b.name} (кратность ${b.page_multiple})`;
                        select.appendChild(option);
                        this.bindingsMap.set(b.id, b);
                    });
                }
            })
            .catch(err => console.error('Ошибка загрузки способов скрепления:', err));
    },

    // ------------------------------------------------------------------------
    // 1.4. ЗАГРУЗКА ДАННЫХ МНОГОСТРАНИЧНОГО РАСЧЁТА С СЕРВЕРА
    // ------------------------------------------------------------------------

    /**
     * Загружает сохранённые многостраничные данные для текущего компонента.
     * ВАЖНО: после загрузки, если данные существуют, пересчитывает sheet_count
     * с учётом текущего режима печати (это исправление для случая, когда режим изменился).
     */
    loadMultipageData: function() {
        // Если ID компонента не задан – выходим.
        if (!this.printComponentId) return;
        // Если уже идёт загрузка – пропускаем (предотвращаем множественные запросы).
        if (this.isLoading) {
            console.log('⏳ Уже идёт загрузка, пропускаем');
            return;
        }
        // Устанавливаем флаг загрузки.
        this.isLoading = true;
        // Отправляем GET-запрос на сервер для получения данных.
        fetch(`/vichisliniya_listov/multipage/get/${this.printComponentId}/`)
            .then(r => r.json())
            .then(data => {
                this.isLoading = false; // Снимаем флаг загрузки.
                if (data.success) {
                    if (data.exists) {
                        // Данные существуют – сохраняем их.
                        this.multipageData = data;
                        // Заполняем форму значениями из данных.
                        this.populateForm(data);
                        const isActive = data.is_active === true;
                        // Синхронизируем радиокнопки без вызова обработчиков.
                        this.syncingRadio = true;
                        if (isActive) {
                            // Активируем многостраничный режим.
                            this.elements.radioMultipage.checked = true;
                            this.switchMode('multipage');
                            // Используем серверные значения fit_* (они уже рассчитаны).
                            this.currentParams.fit_total = data.fit_total;
                            this.currentParams.fit_horizontal = data.fit_horizontal;
                            this.currentParams.fit_vertical = data.fit_vertical;
                            this.currentParams.fit_landscape_total = data.fit_landscape_total;
                            this.currentParams.fit_portrait_total = data.fit_portrait_total;
                            this.currentParams.fit_selected_orientation = data.fit_selected_orientation;
                            // Пересчитываем количество листов по новой формуле с учётом текущего режима.
                            this.calculateSheetCount();
                            this.updateFittingUI();
                            this.drawBothSides();
                        } else {
                            // Иначе – одностраничный режим.
                            this.elements.radioSingle.checked = true;
                            this.switchMode('single');
                        }
                        this.syncingRadio = false;
                    } else {
                        // Данных нет – сбрасываем форму и переключаемся в одностраничный режим.
                        this.multipageData = null;
                        this.resetForm();
                        this.syncingRadio = true;
                        this.elements.radioSingle.checked = true;
                        this.syncingRadio = false;
                        this.switchMode('single');
                    }
                    // Обновляем параметры из формы.
                    this.updateParamsFromForm();
                    if (this.currentMode === 'multipage') {
                        this.drawBothSides();
                    }
                    // Если есть данные о листе из одностраничной секции – обновляем отображение.
                    if (window.vichisliniyaListov?.sheetData?.sheet_width) {
                        this.sheetData = { ...window.vichisliniyaListov.sheetData };
                        this.updateSheetInfoDisplay();
                        if (this.currentMode === 'multipage') {
                            this.drawBothSides();
                        }
                    }
                }
            })
            .catch(err => {
                this.isLoading = false;
                console.error('Ошибка загрузки многостраничных данных:', err);
            });
    },

    /**
     * Заполняет поля формы значениями из объекта данных (полученного с сервера).
     * @param {Object} data - Объект с данными многостраничного расчёта.
     */
    populateForm: function(data) {
        if (this.elements.bindingSelect) this.elements.bindingSelect.value = data.binding_id || '';
        if (this.elements.totalPages) this.elements.totalPages.value = data.total_pages;
        if (this.elements.multipageItemWidth) this.elements.multipageItemWidth.value = data.finished_width;
        if (this.elements.multipageItemHeight) this.elements.multipageItemHeight.value = data.finished_height;
        if (this.elements.vyleta) this.elements.vyleta.value = data.vyleta;
        if (this.elements.bookletOrientation && data.booklet_orientation) {
            this.bookletOrientation = data.booklet_orientation;
            this.elements.bookletOrientation.value = data.booklet_orientation;
        }
        // Сохраняем параметры размещения.
        if (data.fit_selected_orientation) this.currentParams.fit_selected_orientation = data.fit_selected_orientation;
        if (data.fit_horizontal !== undefined) this.currentParams.fit_horizontal = data.fit_horizontal;
        if (data.fit_vertical !== undefined) this.currentParams.fit_vertical = data.fit_vertical;
        if (data.fit_total !== undefined) this.currentParams.fit_total = data.fit_total;
        if (data.fit_landscape_total !== undefined) this.currentParams.fit_landscape_total = data.fit_landscape_total;
        if (data.fit_portrait_total !== undefined) this.currentParams.fit_portrait_total = data.fit_portrait_total;
    },

    /**
     * Обновляет локальные параметры currentParams из полей формы.
     */
    updateParamsFromForm: function() {
        this.currentParams.item_width = parseFloat(this.elements.multipageItemWidth?.value) || 210;
        this.currentParams.item_height = parseFloat(this.elements.multipageItemHeight?.value) || 297;
        this.currentParams.vyleta = parseInt(this.elements.vyleta?.value) || 4;
        this.currentParams.total_pages = parseInt(this.elements.totalPages?.value) || 4;
    },

    /**
     * Сбрасывает поля формы к значениям по умолчанию.
     */
    resetForm: function() {
        if (this.elements.bindingSelect) this.elements.bindingSelect.value = '';
        if (this.elements.totalPages) this.elements.totalPages.value = 4;
        if (this.elements.multipageItemWidth) this.elements.multipageItemWidth.value = 210;
        if (this.elements.multipageItemHeight) this.elements.multipageItemHeight.value = 297;
        if (this.elements.vyleta) this.elements.vyleta.value = 4;
        if (this.elements.bookletOrientation) {
            this.bookletOrientation = 'portrait';
            this.elements.bookletOrientation.value = 'portrait';
        }
        this.currentParams.fit_selected_orientation = 'auto';
        this.currentParams.fit_total = 0;
        this.currentParams.fit_horizontal = 0;
        this.currentParams.fit_vertical = 0;
        this.currentParams.fit_landscape_total = 0;
        this.currentParams.fit_portrait_total = 0;
        this.landscapeDetails = { x: 0, y: 0 };
        this.portraitDetails = { x: 0, y: 0 };
        this.updateFittingUI();
    },

    /**
     * Обновляет отображение информации о печатном листе (размеры, поля).
     */
    updateSheetInfoDisplay: function() {
        if (this.elements.sheetDimensions && this.sheetData.sheet_width && this.sheetData.sheet_height) {
            this.elements.sheetDimensions.textContent = `${this.sheetData.sheet_width}×${this.sheetData.sheet_height} мм`;
        } else if (this.elements.sheetDimensions) {
            this.elements.sheetDimensions.textContent = '—';
        }
        if (this.elements.marginSpan && this.sheetData.margin !== null) {
            this.elements.marginSpan.textContent = this.sheetData.margin;
        } else if (this.elements.marginSpan) {
            this.elements.marginSpan.textContent = '—';
        }
        if (this.elements.printableDimensions && this.sheetData.sheet_width && this.sheetData.sheet_height && this.sheetData.margin !== null) {
            const pw = this.sheetData.sheet_width - 2 * this.sheetData.margin;
            const ph = this.sheetData.sheet_height - 2 * this.sheetData.margin;
            this.elements.printableDimensions.textContent = `${pw}×${ph} мм`;
        } else if (this.elements.printableDimensions) {
            this.elements.printableDimensions.textContent = '—';
        }
    },

    // ------------------------------------------------------------------------
    // 1.5. РАСЧЁТ РАЗМЕЩЕНИЯ СТРАНИЦ/РАЗВОРОТОВ НА ЛИСТЕ
    // ------------------------------------------------------------------------

    /**
     * Рассчитывает оптимальное размещение страниц (или разворотов) на печатном листе.
     * Учитывает способ скрепления (скрепка требует особой логики с разворотами).
     * Обновляет поля fit_landscape_total, fit_portrait_total, fit_horizontal, fit_vertical, fit_total.
     * ВАЖНО: этот метод вызывается только при изменении параметров пользователем,
     * но НЕ при загрузке данных с сервера (чтобы не перебивать серверные значения).
     */
    calculateFitting: function() {
        console.log('📐 Расчёт размещения страниц/разворотов на листе...');

        // Если данных о листе нет, пробуем скопировать из одностраничной секции.
        if ((!this.sheetData.sheet_width || !this.sheetData.sheet_height || this.sheetData.margin === null) &&
            window.vichisliniyaListov?.sheetData) {
            this.sheetData = { ...window.vichisliniyaListov.sheetData };
            this.updateSheetInfoDisplay();
        }

        // Если данных о листе всё ещё нет – выводим сообщение и выходим.
        if (!this.sheetData.sheet_width || !this.sheetData.sheet_height || this.sheetData.margin === null) {
            console.warn('⚠️ Нет данных о листе.');
            this.drawNoSheetDataMessage();
            this.currentParams.fit_landscape_total = 0;
            this.currentParams.fit_portrait_total = 0;
            this.currentParams.fit_total = 0;
            this.currentParams.fit_horizontal = 0;
            this.currentParams.fit_vertical = 0;
            this.updateFittingUI();
            return;
        }

        // Определяем, выбран ли способ скрепления "скрепка".
        const bindingId = this.elements.bindingSelect?.value;
        const isStapled = bindingId && this.bindingsMap?.get(parseInt(bindingId))?.name === 'скрепка';

        // Печатная область (с учётом полей).
        const printableWidth = this.sheetData.sheet_width - 2 * this.sheetData.margin;
        const printableHeight = this.sheetData.sheet_height - 2 * this.sheetData.margin;

        if (printableWidth <= 0 || printableHeight <= 0) {
            console.warn('⚠️ Печатная область неположительна.');
            this.currentParams.fit_landscape_total = 0;
            this.currentParams.fit_portrait_total = 0;
            this.currentParams.fit_total = 0;
            this.currentParams.fit_horizontal = 0;
            this.currentParams.fit_vertical = 0;
            this.updateFittingUI();
            this.drawBothSides();
            return;
        }

        const gap = this.currentParams.vyleta;

        // Вспомогательная функция: сколько элементов помещается по одному измерению.
        const countItems = (available, itemSize, gap) => {
            if (itemSize <= 0) return 0;
            const step = itemSize + gap;
            if (step <= 0) return 0;
            return Math.floor((available + gap) / step);
        };

        // ----- ЛОГИКА ДЛЯ СПОСОБА "СКРЕПКА" (развороты) -----
        if (isStapled) {
            // Размер разворота зависит от ориентации брошюры.
            let spreadWidthBase, spreadHeightBase;
            if (this.bookletOrientation === 'portrait') {
                // Вертикальная брошюра: две страницы рядом.
                spreadWidthBase = this.currentParams.item_width * 2;
                spreadHeightBase = this.currentParams.item_height;
            } else {
                // Горизонтальная брошюра: две страницы одна над другой.
                spreadWidthBase = this.currentParams.item_width;
                spreadHeightBase = this.currentParams.item_height * 2;
            }

            // Альбомная ориентация размещения (разворот не повёрнут).
            let countXLand = countItems(printableWidth, spreadWidthBase, gap);
            let countYLand = countItems(printableHeight, spreadHeightBase, gap);
            let totalLandSpreads = countXLand * countYLand;

            // Портретная ориентация (разворот повёрнут на 90°).
            let countXPort = countItems(printableWidth, spreadHeightBase, gap);
            let countYPort = countItems(printableHeight, spreadWidthBase, gap);
            let totalPortSpreads = countXPort * countYPort;

            this.currentParams.fit_landscape_total = totalLandSpreads;
            this.currentParams.fit_portrait_total = totalPortSpreads;
            this.landscapeDetails = { x: countXLand, y: countYLand };
            this.portraitDetails = { x: countXPort, y: countYPort };

            // Выбираем оптимальную ориентацию.
            let orientation = this.currentParams.fit_selected_orientation;
            if (orientation === 'auto') orientation = (totalLandSpreads >= totalPortSpreads) ? 'landscape' : 'portrait';

            if (orientation === 'landscape') {
                this.currentParams.fit_horizontal = countXLand;
                this.currentParams.fit_vertical = countYLand;
                // fit_total – количество страниц на ОДНОЙ стороне листа.
                // Для скрепки это количество разворотов * 2 (страниц в развороте).
                this.currentParams.fit_total = totalLandSpreads * 2;
                this.currentParams.fit_selected_orientation = 'landscape';
            } else {
                this.currentParams.fit_horizontal = countXPort;
                this.currentParams.fit_vertical = countYPort;
                this.currentParams.fit_total = totalPortSpreads * 2;
                this.currentParams.fit_selected_orientation = 'portrait';
            }

            this.updateFittingUI();
            this.drawBothSides();
            return;
        }

        // ----- ЛОГИКА ДЛЯ ДРУГИХ СПОСОБОВ СКРЕПЛЕНИЯ (обычные страницы) -----
        const itemW = this.currentParams.item_width;
        const itemH = this.currentParams.item_height;

        let countXLand = countItems(printableWidth, itemW, gap);
        let countYLand = countItems(printableHeight, itemH, gap);
        let totalLand = countXLand * countYLand;

        let countXPort = countItems(printableWidth, itemH, gap);
        let countYPort = countItems(printableHeight, itemW, gap);
        let totalPort = countXPort * countYPort;

        this.currentParams.fit_landscape_total = totalLand;
        this.currentParams.fit_portrait_total = totalPort;
        this.landscapeDetails = { x: countXLand, y: countYLand };
        this.portraitDetails = { x: countXPort, y: countYPort };

        let selectedOrientation = this.currentParams.fit_selected_orientation;
        if (selectedOrientation === 'auto') selectedOrientation = (totalLand >= totalPort) ? 'landscape' : 'portrait';

        if (selectedOrientation === 'landscape') {
            this.currentParams.fit_horizontal = countXLand;
            this.currentParams.fit_vertical = countYLand;
            this.currentParams.fit_total = totalLand;
            this.currentParams.fit_selected_orientation = 'landscape';
        } else if (selectedOrientation === 'portrait') {
            this.currentParams.fit_horizontal = countXPort;
            this.currentParams.fit_vertical = countYPort;
            this.currentParams.fit_total = totalPort;
            this.currentParams.fit_selected_orientation = 'portrait';
        } else {
            this.currentParams.fit_horizontal = 0;
            this.currentParams.fit_vertical = 0;
            this.currentParams.fit_total = 0;
            this.currentParams.fit_selected_orientation = 'auto';
        }

        this.updateFittingUI();
        this.drawBothSides();
    },

    /**
     * Отображает сообщение об отсутствии данных о листе на canvas.
     */
    drawNoSheetDataMessage: function() {
        if (this.canvasFront) {
            const ctx = this.canvasFront.getContext('2d');
            ctx.clearRect(0, 0, this.canvasFront.width, this.canvasFront.height);
            ctx.font = '12px Arial';
            ctx.fillStyle = '#e74c3c';
            ctx.fillText('Нет данных о печатном листе. Выберите компонент с принтером, содержащим формат листа.', 10, 20);
        }
        if (this.canvasBack) {
            const ctx = this.canvasBack.getContext('2d');
            ctx.clearRect(0, 0, this.canvasBack.width, this.canvasBack.height);
            ctx.font = '12px Arial';
            ctx.fillStyle = '#e74c3c';
            ctx.fillText('Нет данных о печатном листе.', 10, 20);
        }
    },

    /**
     * Обновляет интерфейс блока размещения (цифры вариантов, выделение активного).
     */
    updateFittingUI: function() {
        if (this.elements.landscapeCount) this.elements.landscapeCount.textContent = this.currentParams.fit_landscape_total;
        if (this.elements.landscapeDetails) this.elements.landscapeDetails.textContent = `${this.landscapeDetails.x}×${this.landscapeDetails.y}`;
        if (this.elements.portraitCount) this.elements.portraitCount.textContent = this.currentParams.fit_portrait_total;
        if (this.elements.portraitDetails) this.elements.portraitDetails.textContent = `${this.portraitDetails.x}×${this.portraitDetails.y}`;
        const optLand = document.getElementById('multipage-option-landscape');
        const optPort = document.getElementById('multipage-option-portrait');
        if (optLand && optPort) {
            optLand.classList.remove('active');
            optPort.classList.remove('active');
            if (this.currentParams.fit_selected_orientation === 'landscape') optLand.classList.add('active');
            else if (this.currentParams.fit_selected_orientation === 'portrait') optPort.classList.add('active');
        }
        if (this.elements.selectedOrientationName) {
            if (this.currentParams.fit_selected_orientation === 'landscape') this.elements.selectedOrientationName.textContent = 'альбомная';
            else if (this.currentParams.fit_selected_orientation === 'portrait') this.elements.selectedOrientationName.textContent = 'портретная';
            else this.elements.selectedOrientationName.textContent = 'автоматически';
        }
        if (this.elements.selectedFitTotal) this.elements.selectedFitTotal.textContent = this.currentParams.fit_total;
    },

    /**
     * Обработчик выбора ориентации размещения пользователем.
     * @param {string} orientation - 'landscape' или 'portrait'.
     */
    selectOrientation: function(orientation) {
        this.currentParams.fit_selected_orientation = orientation;
        this.calculateFitting();
        this.calculateSheetCount();
        this.drawBothSides();
        if (this.currentMode === 'multipage') this.scheduleSave();
    },

    // ------------------------------------------------------------------------
    // 1.6. РАСЧЁТ КОЛИЧЕСТВА ПЕЧАТНЫХ ЛИСТОВ
    // ------------------------------------------------------------------------

    /**
     * Рассчитывает количество печатных листов для заданного тиража.
     * ПРАВИЛЬНАЯ ФОРМУЛА (с учётом кратности страниц и режима печати):
     *   1. total_pages округляется вверх до кратного page_multiple (из способа скрепления).
     *   2. Для двусторонней печати effectivePagesPerSheet = pagesPerSheet * 2,
     *      потому что pagesPerSheet (fit_total) – это количество страниц на ОДНОЙ стороне.
     *   3. Для односторонней печати effectivePagesPerSheet = pagesPerSheet.
     *   4. sheetCount = ceil( (adjustedPages * circulation) / effectivePagesPerSheet )
     * ВАЖНО: этот метод используется как для локального пересчёта при изменении параметров,
     * так и при загрузке данных с сервера для пересчёта sheet_count с учётом текущего режима.
     */
    calculateSheetCount: function() {
        let sheetCount = 0;
        let formulaText = '';

        if (this.printComponentId && this.circulation) {
            let totalPages = 0;
            let pagesPerSheet = 0;
            // Приоритет: берём из multipageData (загружено с сервера), иначе из currentParams.
            if (this.multipageData && this.multipageData.total_pages !== undefined && this.multipageData.fit_total !== undefined) {
                totalPages = this.multipageData.total_pages;
                pagesPerSheet = this.multipageData.fit_total;
                console.log(`📊 Расчёт из multipageData: totalPages=${totalPages}, fit_total=${pagesPerSheet}`);
            } else {
                totalPages = this.currentParams.total_pages;
                pagesPerSheet = this.currentParams.fit_total;
                console.log(`📊 Расчёт из currentParams: totalPages=${totalPages}, fit_total=${pagesPerSheet}`);
            }

            // ===== ШАГ 1: Корректировка количества страниц до кратности =====
            let adjustedPages = totalPages;
            if (this.elements.bindingSelect && this.bindingsMap) {
                const bindingId = this.elements.bindingSelect.value;
                if (bindingId) {
                    const binding = this.bindingsMap.get(parseInt(bindingId));
                    if (binding && binding.page_multiple > 0) {
                        const multiple = binding.page_multiple;
                        adjustedPages = Math.ceil(totalPages / multiple) * multiple;
                        console.log(`🔄 Округление страниц: ${totalPages} → ${adjustedPages} (кратно ${multiple})`);
                    }
                }
            }

            // ===== ШАГ 2: Определение режима печати =====
            const isDuplex = (this.printingMode === 'duplex');

            // ===== ШАГ 3: Эффективное количество страниц на физическом листе =====
            let effectivePagesPerSheet = pagesPerSheet;
            if (isDuplex) {
                // Двусторонняя печать: на листе две стороны → страниц вдвое больше.
                effectivePagesPerSheet = pagesPerSheet * 2;
                console.log(`🔄 Двусторонняя печать: effectivePagesPerSheet = ${effectivePagesPerSheet}`);
            } else {
                // Односторонняя печать: остаётся как есть.
                effectivePagesPerSheet = pagesPerSheet;
                console.log(`🔄 Односторонняя печать: effectivePagesPerSheet = ${effectivePagesPerSheet}`);
            }

            if (effectivePagesPerSheet > 0) {
                // Общее количество страниц во всём тираже (скорректированное).
                const totalPagesAll = adjustedPages * this.circulation;
                // Количество физических листов = округление вверх.
                sheetCount = Math.ceil(totalPagesAll / effectivePagesPerSheet);
                // Формируем текст формулы для отображения.
                formulaText = `${totalPagesAll} / ${effectivePagesPerSheet} (окр. вверх) = ${sheetCount}`;
                console.log(`✅ Многостраничный расчёт: ${formulaText}`);
            } else {
                formulaText = 'Невозможно рассчитать (страниц на листе = 0)';
                console.warn(formulaText);
            }
        } else {
            formulaText = 'Нет данных о тираже или компоненте';
            console.warn(formulaText);
        }

        this.currentSheetCount = sheetCount;
        this.sendListCountUpdate(sheetCount);
        this.updateGlobalResult(sheetCount, formulaText);

        // Проверка кратности страниц для выбранного способа скрепления (выводим предупреждение).
        const bindingId = this.elements.bindingSelect?.value;
        if (bindingId && this.bindingsMap && this.elements.warningSpan) {
            const binding = this.bindingsMap.get(parseInt(bindingId));
            if (binding && binding.page_multiple > 0) {
                const totalPages = (this.multipageData && this.multipageData.total_pages) ? this.multipageData.total_pages : this.currentParams.total_pages;
                if (totalPages % binding.page_multiple !== 0) {
                    this.elements.warningSpan.textContent = `Внимание! Количество страниц (${totalPages}) не кратно ${binding.page_multiple} для способа "${binding.name}". Рекомендуется добавить пустые страницы.`;
                    this.elements.warningSpan.style.display = 'block';
                } else {
                    this.elements.warningSpan.style.display = 'none';
                }
            } else {
                this.elements.warningSpan.style.display = 'none';
            }
        } else if (this.elements.warningSpan) {
            this.elements.warningSpan.style.display = 'none';
        }
    },

    /**
     * Обновляет глобальный блок результатов в секции "Вычисления листов".
     * @param {number} sheetCount - Количество печатных листов.
     * @param {string} formulaText - Текст формулы для отображения.
     */
    updateGlobalResult: function(sheetCount, formulaText) {
        // Если доступна функция updateCalculationResult из основного модуля – используем её.
        if (window.vichisliniyaListov && typeof window.vichisliniyaListov.updateCalculationResult === 'function') {
            window.vichisliniyaListov.updateCalculationResult({
                calculated_list_count: sheetCount,
                circulation: this.circulation,
                formula: formulaText,
                vyleta: this.currentParams.vyleta,
                polosa_count: 1,
                color: this.multipageData?.color || '4+0'
            });
        } else {
            // Резервное обновление, если функция недоступна.
            const resultSpan = document.getElementById('vichisliniya-listov-result-value');
            if (resultSpan) resultSpan.textContent = sheetCount.toFixed(2);
            const formulaSpan = document.getElementById('vichisliniya-listov-formula-text');
            if (formulaSpan) formulaSpan.textContent = formulaText || '—';
            const circSpan = document.getElementById('vichisliniya-listov-breakdown-circulation');
            if (circSpan) circSpan.textContent = this.circulation || 0;
            const vyletaSpan = document.getElementById('vichisliniya-listov-breakdown-vyleta');
            if (vyletaSpan) vyletaSpan.textContent = this.currentParams.vyleta;
            const colorSpan = document.getElementById('vichisliniya-listov-breakdown-color');
            if (colorSpan) colorSpan.textContent = this.multipageData?.color || '4+0';
            const fitTotalSpan = document.getElementById('vichisliniya-listov-breakdown-fit-total');
            if (fitTotalSpan) fitTotalSpan.textContent = this.currentParams.fit_total;
            const cutsSpan = document.getElementById('vichisliniya-listov-breakdown-cuts-count');
            if (cutsSpan) cutsSpan.textContent = '0';
            const timestampSpan = document.getElementById('vichisliniya-listov-result-timestamp');
            if (timestampSpan) timestampSpan.innerHTML = `<i class="fas fa-clock"></i> Последний расчёт: ${new Date().toLocaleString()}`;
            const badge = document.getElementById('vichisliniya-listov-result-badge');
            if (badge) {
                badge.textContent = 'расчёт выполнен (многостраничный)';
                badge.className = 'result-badge success';
            }
        }
    },

    /**
     * Отправляет событие обновления количества листов для других секций (например, печатные компоненты).
     * @param {number} listCount - Количество листов.
     */
    sendListCountUpdate: function(listCount) {
        if (!this.printComponentId) return;
        const event = new CustomEvent('vichisliniyaListovUpdated', {
            detail: {
                printComponentId: this.printComponentId,
                listCount: listCount,
                timestamp: new Date().toISOString(),
                source: 'multipage'
            }
        });
        document.dispatchEvent(event);
    },

    // ------------------------------------------------------------------------
    // 1.7. СОХРАНЕНИЕ ДАННЫХ НА СЕРВЕР (AUTOSAVE)
    // ------------------------------------------------------------------------

    /**
     * Запускает отложенное сохранение (autosave) через 500 мс после последнего изменения.
     */
    scheduleSave: function() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveData(), 500);
    },

    /**
     * Сохраняет текущие многостраничные данные на сервер (обычный вызов, без Promise).
     */
    saveData: function() {
        if (!this.printComponentId || this.isSaving) return;
        this.isSaving = true;
        const payload = {
            print_component_id: this.printComponentId,
            binding_id: this.elements.bindingSelect?.value || null,
            total_pages: this.currentParams.total_pages,
            finished_width: this.currentParams.item_width,
            finished_height: this.currentParams.item_height,
            vyleta: this.currentParams.vyleta,
            booklet_orientation: this.bookletOrientation,
            fit_selected_orientation: this.currentParams.fit_selected_orientation,
            fit_horizontal: this.currentParams.fit_horizontal,
            fit_vertical: this.currentParams.fit_vertical,
            fit_total: this.currentParams.fit_total,
            fit_landscape_total: this.currentParams.fit_landscape_total,
            fit_portrait_total: this.currentParams.fit_portrait_total,
            color: (window.vichisliniyaListov?.currentParameters?.color) || '4+0',
            is_active: (this.currentMode === 'multipage')
        };
        fetch('/vichisliniya_listov/multipage/save/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.getCsrfToken() },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(data => {
            this.isSaving = false;
            if (data.success) {
                this.multipageData = data.data;
                if (data.warning) console.warn(data.warning);
            } else {
                console.error('Ошибка сохранения:', data.message);
            }
        })
        .catch(err => {
            this.isSaving = false;
            console.error('Ошибка сохранения:', err);
        });
    },

    /**
     * Сохраняет данные на сервер и возвращает Promise (используется при переключении режима).
     * @returns {Promise} - Обещание, которое разрешается после успешного сохранения.
     */
    saveDataPromise: function() {
        return new Promise((resolve, reject) => {
            if (!this.printComponentId) {
                reject(new Error('Нет ID компонента'));
                return;
            }
            if (this.isSaving) {
                reject(new Error('Уже идёт сохранение'));
                return;
            }
            this.isSaving = true;
            const payload = {
                print_component_id: this.printComponentId,
                binding_id: this.elements.bindingSelect?.value || null,
                total_pages: this.currentParams.total_pages,
                finished_width: this.currentParams.item_width,
                finished_height: this.currentParams.item_height,
                vyleta: this.currentParams.vyleta,
                booklet_orientation: this.bookletOrientation,
                fit_selected_orientation: this.currentParams.fit_selected_orientation,
                fit_horizontal: this.currentParams.fit_horizontal,
                fit_vertical: this.currentParams.fit_vertical,
                fit_total: this.currentParams.fit_total,
                fit_landscape_total: this.currentParams.fit_landscape_total,
                fit_portrait_total: this.currentParams.fit_portrait_total,
                color: (window.vichisliniyaListov?.currentParameters?.color) || '4+0',
                is_active: (this.currentMode === 'multipage')
            };
            fetch('/vichisliniya_listov/multipage/save/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.getCsrfToken() },
                body: JSON.stringify(payload)
            })
            .then(r => r.json())
            .then(data => {
                this.isSaving = false;
                if (data.success) {
                    this.multipageData = data.data;
                    if (data.warning) console.warn(data.warning);
                    resolve(data);
                } else {
                    reject(new Error(data.message || 'Ошибка сохранения'));
                }
            })
            .catch(err => {
                this.isSaving = false;
                reject(err);
            });
        });
    },

    // ------------------------------------------------------------------------
    // 1.8. ОТРИСОВКА СХЕМ НА CANVAS
    // ------------------------------------------------------------------------

    /**
     * Рисует обе стороны листа (лицевую и оборотную) на соответствующих canvas.
     * Учитывает режим печати (односторонняя/двусторонняя) и способ скрепления.
     */
    drawBothSides: function() {
        if (!this.canvasFront || !this.canvasBack) return;
        if (!this.sheetData.sheet_width || !this.sheetData.sheet_height || this.sheetData.margin === null) {
            this.drawNoSheetDataMessage();
            return;
        }
        const bindingId = this.elements.bindingSelect?.value;
        const isStapled = bindingId && this.bindingsMap?.get(parseInt(bindingId))?.name === 'скрепка';
        const fillBack = (this.printingMode === 'duplex');
        if (isStapled) {
            // Для скрепки рисуем развороты.
            this.drawSpreadOnCanvas(this.canvasFront, true);
            this.drawSpreadOnCanvas(this.canvasBack, fillBack);
        } else {
            // Для обычных страниц.
            this.drawPlacementOnCanvas(this.canvasFront, true);
            this.drawPlacementOnCanvas(this.canvasBack, fillBack);
        }
    },

    /**
     * Рисует размещение обычных страниц на одной стороне canvas.
     * ДОБАВЛЕНО: отображение маркеров пружины на КАЖДОЙ отдельной странице (внутри страницы).
     * Маркеры рисуются ПОСЛЕ основного цикла, чтобы не затирать цвет заливки страниц.
     * @param {HTMLCanvasElement} canvas - Элемент canvas.
     * @param {boolean} fill - Нужно ли заливать страницы цветом (true – лицевая сторона, false – оборотная).
     */
    drawPlacementOnCanvas: function(canvas, fill) {
        // Получаем контекст рисования.
        const ctx = canvas.getContext('2d');
        // Очищаем canvas.
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Проверяем наличие данных о листе.
        if (!this.sheetData.sheet_width || !this.sheetData.sheet_height || this.sheetData.margin === null) {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#999';
            ctx.fillText('Нет данных о листе', 10, 20);
            return;
        }

        // Проверяем, выбрана ли ориентация размещения страниц.
        const orientation = this.currentParams.fit_selected_orientation;
        if (orientation === 'auto') {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#999';
            ctx.fillText('Ориентация не выбрана', 10, 20);
            return;
        }

        // Определяем размеры страницы и количество по горизонтали/вертикали.
        let itemW, itemH, fitH, fitV;
        if (orientation === 'landscape') {
            itemW = this.currentParams.item_width;
            itemH = this.currentParams.item_height;
            fitH = this.currentParams.fit_horizontal;
            fitV = this.currentParams.fit_vertical;
        } else {
            itemW = this.currentParams.item_height;
            itemH = this.currentParams.item_width;
            fitH = this.currentParams.fit_horizontal;
            fitV = this.currentParams.fit_vertical;
        }

        const gap = this.currentParams.vyleta;
        const margin = this.sheetData.margin;
        const sheetW = this.sheetData.sheet_width;
        const sheetH = this.sheetData.sheet_height;

        if (fitH === 0 || fitV === 0) {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#999';
            ctx.fillText('Страницы не помещаются на листе', 10, 20);
            return;
        }

        // Масштаб для отображения на canvas.
        const padding = 10;
        const scale = Math.min((canvas.width - 2 * padding) / sheetW, (canvas.height - 2 * padding) / sheetH);

        ctx.save();
        ctx.translate(padding, padding);

        // Контур листа.
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, sheetW * scale, sheetH * scale);

        // Печатная область (пунктир).
        ctx.strokeStyle = '#999';
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(margin * scale, margin * scale, (sheetW - 2 * margin) * scale, (sheetH - 2 * margin) * scale);
        ctx.setLineDash([]);

        // Тип печати для цвета заливки.
        let printType = 'color';
        if (window.printComponentsSection && window.printComponentsSection.getSelectedComponentId() === this.printComponentId) {
            const selectedComponent = window.printComponentsSection.getCurrentComponents().find(c => c.id == this.printComponentId);
            if (selectedComponent) printType = selectedComponent.print_type || 'color';
        }

        let fillColor, strokeColor;
        if (printType === 'color') {
            fillColor = fill ? 'rgba(52, 152, 219, 0.3)' : 'transparent';
            strokeColor = fill ? '#2980b9' : '#a0c4ff';
        } else {
            fillColor = fill ? 'rgba(200, 200, 200, 0.4)' : 'transparent';
            strokeColor = fill ? '#999999' : '#cccccc';
        }

        // Проверка на пружину.
        const bindingId = this.elements.bindingSelect?.value;
        let isPunched = false;
        if (bindingId && this.bindingsMap) {
            const binding = this.bindingsMap.get(parseInt(bindingId));
            if (binding && binding.name && binding.name.toLowerCase() === 'пружина') {
                isPunched = true;
                console.log('🔩 Обнаружена пружина, рисуем маркеры перфорации на каждой странице');
            }
        }

        // ===== 1) Рисуем все страницы =====
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;

        // Сохраняем координаты каждой страницы для второго прохода (маркеры).
        const pagePositions = [];

        for (let row = 0; row < fitV; row++) {
            for (let col = 0; col < fitH; col++) {
                const x = margin + col * (itemW + gap);
                const y = margin + row * (itemH + gap);
                pagePositions.push({ x, y });

                if (fill) {
                    ctx.fillRect(x * scale, y * scale, itemW * scale, itemH * scale);
                }
                ctx.strokeRect(x * scale, y * scale, itemW * scale, itemH * scale);
            }
        }

        // ===== 2) Рисуем маркеры перфорации (если пружина) =====
        if (isPunched) {
            const isPortrait = this.bookletOrientation === 'portrait';
            const numMarks = 3;
            const markSize = 3;
            // Цвет маркеров – тёмно-серый (не влияет на заливку страниц).
            ctx.fillStyle = '#555';
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 0.5;

            for (let pos of pagePositions) {
                const x = pos.x;
                const y = pos.y;
                // Координаты страницы в пикселях.
                const left = x * scale;
                const right = (x + itemW) * scale;
                const top = y * scale;
                const bottom = (y + itemH) * scale;

                if (isPortrait) {
                    // Для портретной брошюры корешок слева. Размещаем маркеры внутри страницы, у левого края.
                    // Отступ от левого края – 10% ширины страницы (но не менее 2 пикселей).
                    const offsetX = Math.max(2, itemW * 0.1) * scale;
                    // Маркеры равномерно распределены по вертикали, с отступом 10% от краёв.
                    const startY = top + (bottom - top) * 0.1;
                    const endY = bottom - (bottom - top) * 0.1;
                    const step = (endY - startY) / (numMarks + 1);
                    for (let i = 1; i <= numMarks; i++) {
                        const yPos = startY + i * step;
                        ctx.fillRect(left + offsetX - markSize/2, yPos - markSize/2, markSize, markSize);
                    }
                } else {
                    // Для ландшафтной брошюры корешок снизу. Маркеры внутри страницы, у нижнего края.
                    const offsetY = Math.max(2, itemH * 0.1) * scale;
                    const startX = left + (right - left) * 0.1;
                    const endX = right - (right - left) * 0.1;
                    const step = (endX - startX) / (numMarks + 1);
                    for (let i = 1; i <= numMarks; i++) {
                        const xPos = startX + i * step;
                        ctx.fillRect(xPos - markSize/2, bottom - offsetY - markSize/2, markSize, markSize);
                    }
                }
            }
        }

        ctx.restore();
    },

    /**
     * Рисует размещение разворотов для способа "скрепка".
     * @param {HTMLCanvasElement} canvas - Элемент canvas.
     * @param {boolean} fill - Нужно ли заливать развороты цветом.
     */
    drawSpreadOnCanvas: function(canvas, fill) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!this.sheetData.sheet_width || !this.sheetData.sheet_height || this.sheetData.margin === null) {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#999';
            ctx.fillText('Нет данных о листе', 10, 20);
            return;
        }
        const margin = this.sheetData.margin;
        const sheetW = this.sheetData.sheet_width;
        const sheetH = this.sheetData.sheet_height;
        const gap = this.currentParams.vyleta;
        const pageW = this.currentParams.item_width;
        const pageH = this.currentParams.item_height;
        let spreadWidthBase, spreadHeightBase;
        if (this.bookletOrientation === 'portrait') {
            spreadWidthBase = pageW * 2;
            spreadHeightBase = pageH;
        } else {
            spreadWidthBase = pageW;
            spreadHeightBase = pageH * 2;
        }
        let spreadWidth, spreadHeight;
        if (this.currentParams.fit_selected_orientation === 'landscape') {
            spreadWidth = spreadWidthBase;
            spreadHeight = spreadHeightBase;
        } else {
            spreadWidth = spreadHeightBase;
            spreadHeight = spreadWidthBase;
        }
        const fitH = this.currentParams.fit_horizontal;
        const fitV = this.currentParams.fit_vertical;
        if (fitH === 0 || fitV === 0) {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#e74c3c';
            ctx.fillText('Развороты не помещаются на листе', 10, 20);
            return;
        }
        const padding = 10;
        const scale = Math.min((canvas.width - 2 * padding) / sheetW, (canvas.height - 2 * padding) / sheetH);
        ctx.save();
        ctx.translate(padding, padding);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, sheetW * scale, sheetH * scale);
        ctx.strokeStyle = '#999';
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(margin * scale, margin * scale, (sheetW - 2 * margin) * scale, (sheetH - 2 * margin) * scale);
        ctx.setLineDash([]);
        let printType = 'color';
        if (window.printComponentsSection && window.printComponentsSection.getSelectedComponentId() === this.printComponentId) {
            const selectedComponent = window.printComponentsSection.getCurrentComponents().find(c => c.id == this.printComponentId);
            if (selectedComponent) printType = selectedComponent.print_type || 'color';
        }
        let fillColor, strokeColor;
        if (printType === 'color') {
            fillColor = fill ? 'rgba(52, 152, 219, 0.3)' : 'transparent';
            strokeColor = fill ? '#2980b9' : '#a0c4ff';
        } else {
            fillColor = fill ? 'rgba(200, 200, 200, 0.4)' : 'transparent';
            strokeColor = fill ? '#999999' : '#cccccc';
        }
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 0.5;
        const originalPagePlacement = (this.bookletOrientation === 'portrait') ? 'horizontal' : 'vertical';
        const isPortraitPlacement = (this.currentParams.fit_selected_orientation === 'portrait');
        const effectivePagePlacement = isPortraitPlacement ? (originalPagePlacement === 'horizontal' ? 'vertical' : 'horizontal') : originalPagePlacement;
        const effectivePageW = isPortraitPlacement ? pageH : pageW;
        const effectivePageH = isPortraitPlacement ? pageW : pageH;
        for (let row = 0; row < fitV; row++) {
            for (let col = 0; col < fitH; col++) {
                const x = margin + col * (spreadWidth + gap);
                const y = margin + row * (spreadHeight + gap);
                if (effectivePagePlacement === 'horizontal') {
                    const leftX = x;
                    const rightX = x + effectivePageW;
                    const pageY = y;
                    if (fill) ctx.fillRect(leftX * scale, pageY * scale, effectivePageW * scale, effectivePageH * scale);
                    ctx.strokeRect(leftX * scale, pageY * scale, effectivePageW * scale, effectivePageH * scale);
                    if (fill) ctx.fillRect(rightX * scale, pageY * scale, effectivePageW * scale, effectivePageH * scale);
                    ctx.strokeRect(rightX * scale, pageY * scale, effectivePageW * scale, effectivePageH * scale);
                    ctx.save();
                    ctx.strokeStyle = '#e67e22';
                    ctx.fillStyle = '#e67e22';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo((x + effectivePageW) * scale, y * scale);
                    ctx.lineTo((x + effectivePageW) * scale, (y + effectivePageH) * scale);
                    ctx.stroke();
                    const stapleY1 = y + effectivePageH * 0.25;
                    const stapleY2 = y + effectivePageH * 0.75;
                    ctx.beginPath();
                    ctx.arc((x + effectivePageW) * scale, stapleY1 * scale, 2, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc((x + effectivePageW) * scale, stapleY2 * scale, 2, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.restore();
                } else {
                    const topY = y;
                    const bottomY = y + effectivePageH;
                    const pageX = x;
                    if (fill) ctx.fillRect(pageX * scale, topY * scale, effectivePageW * scale, effectivePageH * scale);
                    ctx.strokeRect(pageX * scale, topY * scale, effectivePageW * scale, effectivePageH * scale);
                    if (fill) ctx.fillRect(pageX * scale, bottomY * scale, effectivePageW * scale, effectivePageH * scale);
                    ctx.strokeRect(pageX * scale, bottomY * scale, effectivePageW * scale, effectivePageH * scale);
                    ctx.save();
                    ctx.strokeStyle = '#e67e22';
                    ctx.fillStyle = '#e67e22';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(x * scale, (y + effectivePageH) * scale);
                    ctx.lineTo((x + effectivePageW) * scale, (y + effectivePageH) * scale);
                    ctx.stroke();
                    const stapleX1 = x + effectivePageW * 0.25;
                    const stapleX2 = x + effectivePageW * 0.75;
                    ctx.beginPath();
                    ctx.arc(stapleX1 * scale, (y + effectivePageH) * scale, 2, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(stapleX2 * scale, (y + effectivePageH) * scale, 2, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.restore();
                }
            }
        }
        ctx.restore();
    },

    /**
     * Очищает оба canvas.
     */
    clearCanvas: function() {
        if (this.canvasFront) this.canvasFront.getContext('2d').clearRect(0, 0, this.canvasFront.width, this.canvasFront.height);
        if (this.canvasBack) this.canvasBack.getContext('2d').clearRect(0, 0, this.canvasBack.width, this.canvasBack.height);
    },

    // ------------------------------------------------------------------------
    // 1.9. ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ (С СОХРАНЕНИЕМ)
    // ------------------------------------------------------------------------

    /**
     * Переключает отображение UI между одностраничным и многостраничным режимами (без сохранения).
     * @param {string} mode - 'single' или 'multipage'.
     */
    switchMode: function(mode) {
        this.currentMode = mode;
        if (mode === 'single') {
            if (this.elements.singleModeDiv) this.elements.singleModeDiv.style.display = 'block';
            if (this.elements.multipageModeDiv) this.elements.multipageModeDiv.style.display = 'none';
        } else {
            if (this.elements.singleModeDiv) this.elements.singleModeDiv.style.display = 'none';
            if (this.elements.multipageModeDiv) this.elements.multipageModeDiv.style.display = 'block';
            if (window.vichisliniyaListov?.sheetData) {
                this.sheetData = { ...window.vichisliniyaListov.sheetData };
                this.updateSheetInfoDisplay();
            }
            if (this.multipageData) {
                this.populateForm(this.multipageData);
            } else {
                this.resetForm();
            }
            this.updateParamsFromForm();
            this.calculateFitting();
            this.calculateSheetCount();
            this.drawBothSides();
        }
    },

    /**
     * Переключает режим и сохраняет выбранный режим на сервере.
     * @param {string} mode - 'single' или 'multipage'.
     */
    switchModeAndSave: function(mode) {
        if (mode === this.currentMode) return;
        console.log(`🔄 Переключение режима на ${mode} с сохранением...`);
        const oldMode = this.currentMode;
        this.currentMode = mode; // временно для формирования payload.

        // Если переключаемся в многостраничный и нет данных, создаём запись по умолчанию.
        if (mode === 'multipage' && !this.multipageData) {
            this.createDefaultMultipageData()
                .then(() => this.switchModeAndSave(mode))
                .catch(err => console.error('Ошибка создания данных по умолчанию:', err));
            return;
        }

        this.saveDataPromise()
            .then(() => {
                this.switchMode(mode);
                if (mode === 'single') {
                    // Принудительно загружаем одностраничные данные.
                    if (window.vichisliniyaListov && this.printComponentId) {
                        window.vichisliniyaListov.updateFromPrintComponent({ printComponentId: this.printComponentId });
                    }
                }
                // Уведомляем печатные компоненты.
                if (window.printComponentsSection?.updateForProschet) {
                    const proschetId = this.getCurrentProschetIdFromComponent();
                    if (proschetId) {
                        const row = document.querySelector('.proschet-row.selected');
                        setTimeout(() => window.printComponentsSection.updateForProschet(proschetId, row), 500);
                    }
                }
            })
            .catch(err => {
                console.error('Ошибка при сохранении режима:', err);
                this.currentMode = oldMode;
                this.showNotification('Не удалось сохранить режим', 'error');
            });
    },

    /**
     * Создаёт запись многостраничных данных по умолчанию для текущего компонента.
     * @returns {Promise} Обещание, разрешающееся после создания.
     */
    createDefaultMultipageData: function() {
        if (!this.printComponentId) return Promise.reject('Нет ID компонента');
        const payload = {
            print_component_id: this.printComponentId,
            binding_id: null,
            total_pages: 4,
            finished_width: 210,
            finished_height: 297,
            vyleta: 4,
            booklet_orientation: 'portrait',
            fit_selected_orientation: 'auto',
            fit_horizontal: 0,
            fit_vertical: 0,
            fit_total: 0,
            fit_landscape_total: 0,
            fit_portrait_total: 0,
            color: window.vichisliniyaListov?.currentParameters?.color || '4+0',
            is_active: true
        };
        return fetch('/vichisliniya_listov/multipage/save/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': this.getCsrfToken() },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                this.multipageData = data.data;
                this.populateForm(this.multipageData);
                this.calculateFitting();
                this.calculateSheetCount();
                this.drawBothSides();
                return data;
            } else {
                throw new Error(data.message);
            }
        });
    },

    // ------------------------------------------------------------------------
    // 1.10. СБРОС ВСЕХ ДАННЫХ (при отмене выбора компонента)
    // ------------------------------------------------------------------------

    /**
     * Полностью сбрасывает состояние модуля (при отмене выбора печатного компонента).
     */
    resetAll: function() {
        this.printComponentId = null;
        this.circulation = null;
        this.multipageData = null;
        this.resetForm();
        this.clearCanvas();
        this.updateGlobalResult(0, 'Нет выбранного компонента');
        this.syncingRadio = true;
        if (this.elements.radioSingle) this.elements.radioSingle.checked = true;
        this.syncingRadio = false;
        this.switchMode('single');
    },

    // ------------------------------------------------------------------------
    // 1.11. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ------------------------------------------------------------------------

    /**
     * Получает ID просчёта из текущего печатного компонента.
     * @returns {number|null} ID просчёта или null.
     */
    getCurrentProschetIdFromComponent: function() {
        if (this.printComponentId && window.printComponentsSection) {
            const comp = window.printComponentsSection.getCurrentComponents().find(c => c.id == this.printComponentId);
            return comp ? comp.proschetId : null;
        }
        return null;
    },

    /**
     * Получает CSRF-токен из meta-тега или cookies.
     * @returns {string} CSRF-токен.
     */
    getCsrfToken: function() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.getAttribute('content');
        const cookies = document.cookie.split(';');
        for (let c of cookies) {
            if (c.trim().startsWith('csrftoken=')) return decodeURIComponent(c.trim().substring(10));
        }
        return '';
    },

    /**
     * Показывает всплывающее уведомление.
     * @param {string} message - Текст сообщения.
     * @param {string} type - Тип: 'success', 'error', 'warning', 'info'.
     */
    showNotification: function(message, type = 'info') {
        const notification = document.createElement('div');
        let backgroundColor = '#2196F3';
        if (type === 'success') backgroundColor = '#4CAF50';
        else if (type === 'error') backgroundColor = '#f44336';
        else if (type === 'warning') backgroundColor = '#ff9800';
        notification.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 12px 20px; background: ${backgroundColor}; color: white; border-radius: 4px; z-index: 10000; box-shadow: 0 2px 5px rgba(0,0,0,0.2); max-width: 300px; transition: opacity 0.3s; opacity: 0;`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.style.opacity = '1', 10);
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.parentNode?.removeChild(notification), 300);
        }, 3000);
    }
};

// ============================================================================
// 2. ЗАПУСК ИНИЦИАЛИЗАЦИИ ПРИ ЗАГРУЗКЕ DOM
// ============================================================================

document.addEventListener('DOMContentLoaded', () => vichisliniyaMultipage.init());