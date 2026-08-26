/**
 * ФАЙЛ: vichisliniya_listov.js
 * НАЗНАЧЕНИЕ: JavaScript для секции "Вычисления листов"
 * 
 * ИСПРАВЛЕНИЕ (20.04.2026): 
 * - В обработчике события productCirculationUpdated убран вызов this.handleFieldChange(),
 *   который приводил к деактивации многостраничного режима при изменении тиража.
 *   Теперь при изменении тиража в многостраничном режиме режим сохраняется,
 *   а для одностраничного режима пересчёт листов выполняется через массовый пересчёт
 *   компонентов (событие vichisliniyaListovUpdated).
 * 
 * ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ – для понимания новичками.
 */

"use strict";

/**
 * Глобальный объект vichisliniyaListov – основной объект для работы секции "Вычисления листов".
 * Все функции и переменные собраны внутри этого объекта, чтобы не засорять глобальную область видимости.
 */
var vichisliniyaListov = {
    // ============================================================================
    // ===== РАЗДЕЛ 1: ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ =====
    // ============================================================================

    /**
     * ID текущего выбранного печатного компонента.
     * @type {string|null}
     */
    currentPrintComponentId: null,

    /**
     * Номер текущего выбранного печатного компонента (например "KP-1").
     * @type {string|null}
     */
    currentPrintComponentNumber: null,

    /**
     * ID просчёта, к которому принадлежит текущий печатный компонент.
     * @type {string|null}
     */
    currentProschetId: null,

    /**
     * Текущее значение тиража из связанного просчёта.
     * @type {number|null}
     */
    currentCirculation: null,

    /**
     * Название текущего просчёта для отображения в заголовке.
     * @type {string|null}
     */
    currentProschetTitle: null,

    /**
     * Информация о текущем печатном компоненте (полный объект из события).
     * @type {Object|null}
     */
    currentPrintComponentInfo: null,

    /**
     * Флаг, указывающий что секция инициализирована и готова к работе.
     * @type {boolean}
     */
    isInitialized: false,

    /**
     * Флаг, указывающий что данные печатного компонента загружены.
     * @type {boolean}
     */
    isDataLoaded: false,

    /**
     * Текущие параметры вычислений листов.
     * @property {number} vyleta - Вылеты (расстояние между изделиями)
     * @property {number} polosa_count - Количество полос
     * @property {string} color - Цветность
     * @property {number} list_count - Количество листов
     * @property {number} item_width - Ширина изделия (мм)
     * @property {number} item_height - Высота изделия (мм)
     * @property {number} fit_horizontal - Количество по горизонтали (выбранный вариант)
     * @property {number} fit_vertical - Количество по вертикали
     * @property {number} fit_total - Всего изделий на листе
     * @property {number} fit_landscape_total - Всего при альбомной ориентации
     * @property {number} fit_portrait_total - Всего при портретной ориентации
     * @property {string} fit_selected_orientation - Выбранная ориентация
     * @property {number} cuts_count - Количество резов
     */
    currentParameters: {
        vyleta: 1,
        polosa_count: 1,
        color: '4+0',
        list_count: 0.00,
        item_width: 90.0,
        item_height: 50.0,
        fit_horizontal: 0,
        fit_vertical: 0,
        fit_total: 0,
        fit_landscape_total: 0,
        fit_portrait_total: 0,
        fit_selected_orientation: 'auto',
        cuts_count: 0
    },

    /**
     * Данные о печатном листе (получаются с сервера при загрузке параметров).
     * @property {number|null} sheet_width - Ширина листа (мм)
     * @property {number|null} sheet_height - Высота листа (мм)
     * @property {number|null} margin - Поля принтера (мм)
     * @property {string|null} sheet_name - Название формата
     */
    sheetData: {
        sheet_width: null,
        sheet_height: null,
        margin: null,
        sheet_name: null
    },

    /**
     * Флаг, указывающий, были ли параметры изменены пользователем.
     * @type {boolean}
     */
    isParametersModified: false,

    // Для хранения деталей размещения (количество по рядам) для отображения
    landscapeDetails: { x: 0, y: 0 },
    portraitDetails: { x: 0, y: 0 },

    /**
     * Ссылка на canvas элемент для лицевой стороны.
     * @type {HTMLCanvasElement|null}
     */
    canvasFront: null,

    /**
     * Ссылка на canvas элемент для оборотной стороны.
     * @type {HTMLCanvasElement|null}
     */
    canvasBack: null,

    /**
     * Режим печати текущего выбранного компонента: 'single' (односторонняя) или 'duplex' (двусторонняя).
     * Получается из события printComponentSelected.
     * @type {string}
     */
    currentPrintingMode: 'single',   // по умолчанию односторонняя

    /**
     * Тип печати текущего выбранного компонента: 'color' (цветная) или 'bw' (ч/б).
     * Получается из события printComponentSelected.
     * @type {string}
     */
    currentPrintType: 'color',       // по умолчанию цветная

    /**
     * Уникальный идентификатор последнего отправленного запроса загрузки параметров.
     * Используется для игнорирования устаревших ответов (вместо AbortController).
     * @type {number}
     */
    lastRequestId: 0,

    // ============================================================================
    // ===== РАЗДЕЛ 2: ОСНОВНЫЕ ФУНКЦИИ ИНИЦИАЛИЗАЦИИ =====
    // ============================================================================

    /**
     * Инициализация секции вычислений листов.
     * Вызывается при загрузке страницы.
     * @returns {void}
     */
    init: function() {
        console.log('🚀 Инициализация секции "Вычисления листов" (с поддержкой цветной/ч/б печати)...');
        
        // Получаем ссылки на canvas для визуализации
        this.canvasFront = document.getElementById('vichisliniya-listov-canvas-front');
        this.canvasBack = document.getElementById('vichisliniya-listov-canvas-back');
        
        // Устанавливаем обработчики событий для кнопок и полей ввода внутри секции
        this.setupEventListeners();
        
        // Настраиваем обработчики событий от других секций
        this.setupIntersectionHandlers();
        
        // Проверяем, есть ли уже выбранный печатный компонент на странице
        this.checkForSelectedPrintComponent();
        
        // Проверяем инициализацию кнопки сворачивания через 300 мс
        setTimeout(() => {
            this.checkCollapseButton();
        }, 300);
        
        this.isInitialized = true;
        console.log('✅ Секция инициализирована');
    },

    /**
     * Проверка, что кнопка сворачивания правильно настроена.
     * @returns {void}
     */
    checkCollapseButton: function() {
        const section = document.getElementById('vichisliniya-listov-section');
        const collapseButton = section ? section.querySelector('.btn-collapse-section') : null;
        if (collapseButton) {
            console.log('✅ Кнопка сворачивания для секции "Вычисления листов" найдена');
        } else {
            console.warn('⚠️ Кнопка сворачивания для секции "Вычисления листов" не найдена!');
        }
    },

    // ============================================================================
    // ===== РАЗДЕЛ 3: ОБРАБОТЧИКИ СОБЫТИЙ ВНУТРИ СЕКЦИИ =====
    // ============================================================================

    /**
     * Установка обработчиков событий для элементов секции.
     * @returns {void}
     */
    setupEventListeners: function() {
        console.log('🛠️ Настройка обработчиков событий для секции "Вычисления листов"...');

        // ----- Поле "Вылеты" -----
        const vyletaInput = document.getElementById('vichisliniya-listov-vyleta-input');
        if (vyletaInput) {
            vyletaInput.addEventListener('input', (event) => this.handleVyletaInputChange(event));
            vyletaInput.addEventListener('change', (event) => this.handleFieldChange());
            vyletaInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.target.blur();
                }
            });
            console.log('✅ Обработчики для поля "Вылеты" установлены');
        }

        // ----- Поле "Количество полос" -----
        const polosaCountInput = document.getElementById('vichisliniya-listov-polosa-count-input');
        if (polosaCountInput) {
            polosaCountInput.addEventListener('input', (event) => this.handlePolosaCountInputChange(event));
            polosaCountInput.addEventListener('change', (event) => this.handleFieldChange());
            polosaCountInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.target.blur();
                }
            });
            console.log('✅ Обработчики для поля "Количество полос" установлены');
        }

        // ----- Поле "Цветность" (select) -----
        const colorSelect = document.getElementById('vichisliniya-listov-color-select');
        if (colorSelect) {
            colorSelect.addEventListener('change', (event) => {
                this.handleColorSelectChange(event);
                this.handleFieldChange();
            });
            console.log('✅ Обработчики для поля "Цветность" установлены');
        }

        // ----- НОВЫЕ ПОЛЯ: ширина изделия -----
        const itemWidthInput = document.getElementById('vichisliniya-listov-item-width-input');
        if (itemWidthInput) {
            itemWidthInput.addEventListener('input', (event) => this.handleItemWidthInputChange(event));
            itemWidthInput.addEventListener('change', (event) => this.handleFieldChange());
            itemWidthInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') event.target.blur();
            });
            console.log('✅ Обработчики для поля "Ширина изделия" установлены');
        }

        // ----- НОВЫЕ ПОЛЯ: высота изделия -----
        const itemHeightInput = document.getElementById('vichisliniya-listov-item-height-input');
        if (itemHeightInput) {
            itemHeightInput.addEventListener('input', (event) => this.handleItemHeightInputChange(event));
            itemHeightInput.addEventListener('change', (event) => this.handleFieldChange());
            itemHeightInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') event.target.blur();
            });
            console.log('✅ Обработчики для поля "Высота изделия" установлены');
        }

        // Обработчик для выбора ориентации (клик по всей области)
        const fittingOptions = document.querySelector('.fitting-options');
        if (fittingOptions) {
            fittingOptions.addEventListener('click', (event) => {
                const option = event.target.closest('.fitting-option');
                if (option) {
                    const orientation = option.dataset.orientation;
                    if (orientation) {
                        this.selectOrientation(orientation);
                    }
                }
            });
            console.log('✅ Обработчики для кнопок выбора ориентации установлены');
        }

        console.log('✅ Все обработчики событий успешно настроены');
    },

    // ============================================================================
    // ===== РАЗДЕЛ 4: ОБРАБОТЧИКИ ВЗАИМОДЕЙСТВИЯ С ДРУГИМИ СЕКЦИЯМИ =====
    // ============================================================================

    /**
     * Настройка обработчиков для взаимодействия с другими секциями.
     * @returns {void}
     */
    setupIntersectionHandlers: function() {
        console.log('🔗 Настройка обработчиков взаимодействия с другими секциями...');

        // 1. ВЫБОР ПЕЧАТНОГО КОМПОНЕНТА – обновляем секцию данными
        document.addEventListener('printComponentSelected', (event) => {
            console.log('📥 Получено событие выбора печатного компонента:', event.detail);
            if (event.detail && event.detail.printComponentId) {
                const newComponentId = String(event.detail.printComponentId);
                // Обновляем режим печати (односторонняя/двусторонняя)
                const newPrintingMode = event.detail.printingMode || event.detail.printing_mode || 'single';
                // Получаем тип печати (цветная/ч/б) из события
                const newPrintType = event.detail.printType || event.detail.print_type || 'color';
                
                // Сохраняем режим и тип печати в глобальных переменных
                this.currentPrintingMode = newPrintingMode;
                this.currentPrintType = newPrintType;
                console.log(`🖨️ Установлен режим печати: ${this.currentPrintingMode}, тип печати: ${this.currentPrintType}`);
                
                // Принудительная перерисовка обеих сторон с учётом новых параметров
                this.drawBothSides();

                // Всегда загружаем свежие параметры с сервера (гарантирует актуальность данных о листе)
                console.log(`🔄 Обновление данных для компонента ${newComponentId} (даже если он уже выбран)`);
                
                // Вызываем обновление с уникальным идентификатором запроса
                this.updateFromPrintComponent(event.detail);
            }
        });

        // 2. ОТМЕНА ВЫБОРА ПЕЧАТНОГО КОМПОНЕНТА – сбрасываем секцию
        document.addEventListener('printComponentDeselected', (event) => {
            console.log('📥 Получено событие отмены выбора печатного компонента:', event.detail);
            this.resetSection();
            this.showNotification('Печатный компонент не выбран. Выберите компонент для расчёта.', 'info');
        });

        // 3. ВЫБОР ПРОСЧЁТА (без выбранного компонента) – сбрасываем секцию
        document.addEventListener('proschetSelected', (event) => {
            console.log('📥 Получено событие выбора просчёта:', event.detail);
            if (!this.currentPrintComponentId) {
                console.log('⚠️ Выбран просчёт, но печатный компонент не выбран – сбрасываем секцию');
                this.resetSection();
                this.showNotification('Для выполнения вычислений листов выберите печатный компонент в секции "Печатные компоненты"', 'info');
            }
        });

        // 4. ОБНОВЛЕНИЕ ТИРАЖА – обновляем отображение и (только для одностраничного режима) пересчитываем листы
        // ===== ИСПРАВЛЕНИЕ: убран вызов this.handleFieldChange(), чтобы не деактивировать многостраничный режим =====
        // Раньше здесь вызывался this.handleFieldChange(), который сохранял одностраничные данные и деактивировал multipage.
        // Теперь при изменении тиража мы только обновляем отображение, а пересчёт листов происходит через массовый пересчёт
        // компонентов (событие vichisliniyaListovUpdated) или через многостраничный модуль.
        document.addEventListener('productCirculationUpdated', (event) => {
            console.log('📥 Получено событие обновления тиража:', event.detail);
            if (event.detail && event.detail.proschetId === this.currentProschetId) {
                // Обновляем отображение тиража в секции (для расшифровки)
                this.updateCirculationDisplay(event.detail.circulation);
                // ВАЖНО: НЕ вызываем this.handleFieldChange(), так как это приводит к сохранению одностраничных данных
                // и деактивации многостраничного режима. Для одностраничного режима пересчёт листов будет выполнен
                // через событие vichisliniyaListovUpdated (которое генерируется при массовом пересчёте компонентов).
                // Для многостраничного режима пересчёт выполняется в многостраничном модуле (обработчик productCirculationSaved).
            }
        });

        // 5. ОТМЕНА ВЫБОРА ПРОСЧЁТА – сбрасываем секцию
        document.addEventListener('proschetDeselected', () => {
            console.log('📥 Получено событие отмены выбора просчёта');
            this.resetSection();
        });

        console.log('✅ Обработчики взаимодействия с другими секциями настроены');
    },

    // ============================================================================
    // ===== РАЗДЕЛ 5: ФУНКЦИИ ДЛЯ РАБОТЫ С ПЕЧАТНЫМИ КОМПОНЕНТАМИ =====
    // ============================================================================

    /**
     * Проверка, есть ли уже выбранный печатный компонент на странице при загрузке.
     * @returns {void}
     */
    checkForSelectedPrintComponent: function() {
        console.log('🔍 Проверка выбранного печатного компонента на странице...');
        const selectedRow = document.querySelector('#print-components-table-body tr.selected');
        if (selectedRow) {
            const componentId = selectedRow.dataset.componentId;
            if (componentId) {
                console.log(`✅ Найден выбранный печатный компонент ID: ${componentId}`);
                const componentNumber = selectedRow.querySelector('.component-number')?.textContent;
                const printerName = selectedRow.querySelector('.component-printer')?.textContent;
                const paperName = selectedRow.querySelector('.component-paper')?.textContent;
                const proschetId = window.printComponentsSection ? window.printComponentsSection.getCurrentProschetId() : null;
                // Пытаемся получить режим печати из строки таблицы
                let printingMode = 'single';
                const modeCell = selectedRow.querySelector('.component-mode');
                if (modeCell && modeCell.textContent.includes('Двуст')) printingMode = 'duplex';
                // Пытаемся получить тип печати из строки таблицы
                let printType = 'color';
                const typeCell = selectedRow.querySelector('.component-print-type');
                if (typeCell && typeCell.textContent.includes('Ч/б')) printType = 'bw';
                
                this.currentPrintingMode = printingMode;
                this.currentPrintType = printType;
                
                this.updateFromPrintComponent({
                    printComponentId: componentId,
                    printComponentNumber: componentNumber,
                    printerName: printerName,
                    paperName: paperName,
                    proschetId: proschetId,
                    printingMode: printingMode,
                    printType: printType
                });
            }
        } else {
            console.log('ℹ️ Выбранный печатный компонент не найден');
            this.checkForSelectedProschet();
        }
    },

    /**
     * Проверка выбранного просчёта (для обратной совместимости).
     * @returns {void}
     */
    checkForSelectedProschet: function() {
        console.log('🔍 Проверка выбранного просчёта (для обратной совместимости)...');
        const selectedProschetRow = document.querySelector('.proschet-row.selected');
        if (selectedProschetRow) {
            const proschetId = selectedProschetRow.dataset.proschetId;
            if (proschetId) {
                console.log(`✅ Найден выбранный просчёт ID: ${proschetId}`);
                this.resetSection();
                this.showNotification('Для выполнения вычислений листов выберите печатный компонент в секции "Печатные компоненты"', 'info');
            }
        }
    },

    /**
     * Обновление секции данными печатного компонента.
     * @param {Object} printComponentData - Объект с данными печатного компонента
     * @returns {void}
     */
    updateFromPrintComponent: function(printComponentData) {
        console.log('🔄 Обновление секции данными печатного компонента:', printComponentData);
        if (!printComponentData || !printComponentData.printComponentId) {
            console.error('❌ Некорректные данные печатного компонента');
            return;
        }

        this.currentPrintComponentId = String(printComponentData.printComponentId);
        this.currentPrintComponentNumber = printComponentData.printComponentNumber || 'N/A';
        this.currentProschetId = printComponentData.proschetId || null;
        this.currentPrintComponentInfo = printComponentData;
        this.currentCirculation = printComponentData.circulation || 1;
        // Режим и тип печати уже обновлены в обработчике, но для надёжности ещё раз:
        if (printComponentData.printingMode) this.currentPrintingMode = printComponentData.printingMode;
        if (printComponentData.printType) this.currentPrintType = printComponentData.printType;

        this.updateUI(printComponentData);
        // Передаём уникальный идентификатор запроса для игнорирования устаревших ответов
        const requestId = ++this.lastRequestId;
        this.loadVichisliniyaListovParameters(this.currentPrintComponentId, printComponentData, requestId);

        this.showNotification(`Данные печатного компонента "${printComponentData.printComponentNumber}" загружены`, 'success');
        console.log(`✅ Секция обновлена для печатного компонента ID: ${this.currentPrintComponentId}`);
    },

    /**
     * Обновление пользовательского интерфейса секции данными печатного компонента.
     * @param {Object} printComponentData - Данные печатного компонента
     * @returns {void}
     */
    updateUI: function(printComponentData) {
        console.log('🎨 Обновление пользовательского интерфейса секции для печатного компонента...');
        this.updatePrintComponentTitle(printComponentData);
        this.updateCirculationDisplay(printComponentData.circulation || 1);
        this.updatePrintComponentInfo(printComponentData);
        this.toggleSectionDisplay(true);
    },

    /**
     * Обновление заголовка секции с информацией о печатном компоненте.
     * @param {Object} printComponentData - Данные печатного компонента
     * @returns {void}
     */
    updatePrintComponentTitle: function(printComponentData) {
        console.log('📝 Обновление заголовка секции для печатного компонента...');
        const titleElement = document.getElementById('vichisliniya-listov-proschet-title');
        if (titleElement) {
            let fullTitle = '';
            if (printComponentData.printComponentNumber) {
                fullTitle += `Компонент: ${printComponentData.printComponentNumber}`;
            }
            if (printComponentData.proschetTitle) {
                fullTitle += ` | ${printComponentData.proschetTitle}`;
            }
            titleElement.innerHTML = `
                <span class="proschet-title-active">
                    ${fullTitle || 'Печатный компонент не выбран'}
                </span>
            `;
            console.log(`✅ Заголовок обновлен: "${fullTitle}"`);
        }
    },

    /**
     * Обновление отображения тиража в секции.
     * @param {number} circulation - Новое значение тиража
     * @returns {void}
     */
    updateCirculationDisplay: function(circulation) {
        console.log(`📊 Обновление отображения тиража: ${circulation}`);
        this.currentCirculation = circulation;

        const circulationElement = document.getElementById('vichisliniya-listov-circulation');
        const formattedElement = document.getElementById('vichisliniya-listov-circulation-formatted');
        if (circulationElement) {
            circulationElement.textContent = circulation;
        }
        if (formattedElement && circulation) {
            const formattedCirculation = circulation.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            formattedElement.textContent = `(${formattedCirculation} шт.)`;
        }

        const breakdownCirculationElement = document.getElementById('vichisliniya-listov-breakdown-circulation');
        if (breakdownCirculationElement) {
            breakdownCirculationElement.textContent = circulation;
        }
    },

    /**
     * Обновление информации о печатном компоненте в блоке "Информация".
     * @param {Object} printComponentData - Данные печатного компонента
     * @returns {void}
     */
    updatePrintComponentInfo: function(printComponentData) {
        console.log('📊 Обновление информации о печатном компоненте...');
        const componentNumberElement = document.getElementById('vichisliniya-listov-print-component-number');
        if (componentNumberElement) {
            componentNumberElement.textContent = printComponentData.printComponentNumber || 'Не указан';
        }
        const printerElement = document.getElementById('vichisliniya-listov-printer-name');
        if (printerElement) {
            printerElement.textContent = printComponentData.printerName || 'Не указан';
        }
        const paperElement = document.getElementById('vichisliniya-listov-paper-name');
        if (paperElement) {
            paperElement.textContent = printComponentData.paperName || 'Не указана';
        }
    },

    /**
     * Переключение отображения секции (показ/скрытие контента).
     * @param {boolean} show - Показывать ли контент (true) или сообщение о выборе компонента (false)
     * @returns {void}
     */
    toggleSectionDisplay: function(show) {
        console.log(`🔄 Переключение отображения секции: ${show ? 'показать контент' : 'показать сообщение'}`);
        const noComponentMessage = document.getElementById('vichisliniya-listov-no-print-component-selected');
        const container = document.getElementById('vichisliniya-listov-container');

        if (noComponentMessage && container) {
            if (show) {
                if (this.currentPrintComponentId) {
                    noComponentMessage.style.display = 'none';
                    container.style.display = 'block';
                } else {
                    console.warn('⚠️ Попытка показать контент без выбранного компонента – блокируем');
                    noComponentMessage.style.display = 'block';
                    container.style.display = 'none';
                }
            } else {
                noComponentMessage.style.display = 'block';
                container.style.display = 'none';
            }
        }
    },

    // ============================================================================
    // ===== РАЗДЕЛ 6: ФУНКЦИИ ДЛЯ РАБОТЫ С ПАРАМЕТРАМИ ВЫЧИСЛЕНИЙ =====
    // ============================================================================

    /**
     * Загрузка параметров вычислений листов с сервера для печатного компонента.
     * @param {string|number} printComponentId - ID печатного компонента
     * @param {Object} componentInfo - Дополнительная информация о компоненте
     * @param {number} requestId - Уникальный идентификатор запроса (для игнорирования устаревших)
     * @returns {void}
     */
    loadVichisliniyaListovParameters: function(printComponentId, componentInfo = {}, requestId) {
        console.log(`📡 Загрузка параметров для компонента ${printComponentId}, requestId=${requestId}`);
        const url = `/vichisliniya_listov/get-data/${printComponentId}/`;
        const csrfToken = this.getCsrfToken();

        fetch(url, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrfToken
            }
        })
        .then(response => {
            if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (requestId !== this.lastRequestId) {
                console.log(`ℹ️ Игнорируем устаревший ответ (requestId=${requestId})`);
                return;
            }
            if (data.success) {
                console.log('✅ Параметры загружены:', data);

                if (data.sheet_width) this.sheetData.sheet_width = data.sheet_width;
                if (data.sheet_height) this.sheetData.sheet_height = data.sheet_height;
                if (data.margin) this.sheetData.margin = data.margin;
                if (data.sheet_name) this.sheetData.sheet_name = data.sheet_name;
                this.updateSheetInfoDisplay();
                document.dispatchEvent(new CustomEvent('vichisliniyaListovSheetDataLoaded', {
                    detail: { ...this.sheetData }
                }));

                if (data.circulation) {
                    this.currentCirculation = data.circulation;
                    this.updateCirculationDisplay(data.circulation);
                }

                // Проверяем, активен ли многостраничный режим
                if (data.is_multipage_active && window.vichisliniyaMultipage) {
                    console.log('🔄 Многостраничный режим активен – загружаем multipage данные');
                    this.updateProschetInfo(data);
                    window.vichisliniyaMultipage.loadMultipageData();
                    return; // не обновляем одностраничный UI
                }

                this.updateVichisliniyaListovParameters(data);
                this.updateVichisliniyaListovUI();
                if (!data.is_default) this.showSavedData(data);
                this.calculateFitting();
                this.calculateVichisliniyaListovListCount();
                this.isParametersModified = false;
                this.updateProschetInfo(data);
            } else {
                console.error('❌ Ошибка загрузки:', data.message);
                this.showNotification(`Ошибка: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            if (requestId !== this.lastRequestId) return;
            console.error('❌ Ошибка сети:', error);
            this.showNotification('Ошибка сети при загрузке параметров', 'error');
        });
    },

    /**
     * Обновляет отображение информации о печатном листе в интерфейсе.
     * @returns {void}
     */
    updateSheetInfoDisplay: function() {
        const sheetDimEl = document.getElementById('vichisliniya-listov-sheet-dimensions');
        const marginEl = document.getElementById('vichisliniya-listov-margin');
        const printableEl = document.getElementById('vichisliniya-listov-printable-dimensions');

        if (sheetDimEl && this.sheetData.sheet_width && this.sheetData.sheet_height) {
            sheetDimEl.textContent = `${this.sheetData.sheet_width}×${this.sheetData.sheet_height} мм`;
        } else {
            sheetDimEl.textContent = '—';
        }

        if (marginEl && this.sheetData.margin !== null) {
            marginEl.textContent = this.sheetData.margin;
        } else {
            marginEl.textContent = '—';
        }

        if (printableEl && this.sheetData.sheet_width && this.sheetData.sheet_height && this.sheetData.margin !== null) {
            const printableWidth = this.sheetData.sheet_width - 2 * this.sheetData.margin;
            const printableHeight = this.sheetData.sheet_height - 2 * this.sheetData.margin;
            printableEl.textContent = `${printableWidth}×${printableHeight} мм`;
        } else {
            printableEl.textContent = '—';
        }
    },

    /**
     * Обновление информации о просчёте на основе данных с сервера.
     * @param {Object} data - Данные с сервера, содержащие информацию о просчёте
     * @returns {void}
     */
    updateProschetInfo: function(data) {
        console.log('📊 Обновление информации о просчёте...');
        const proschetNumberElement = document.getElementById('vichisliniya-listov-proschet-number');
        if (proschetNumberElement && data.proschet_number) {
            proschetNumberElement.textContent = data.proschet_number;
        }
        const proschetNameElement = document.getElementById('vichisliniya-listov-proschet-name');
        if (proschetNameElement && data.proschet_title) {
            proschetNameElement.textContent = data.proschet_title;
            this.currentProschetTitle = data.proschet_title;
        }
        const clientElement = document.getElementById('vichisliniya-listov-client-name');
        if (clientElement && data.client_name) {
            clientElement.textContent = data.client_name;
        }
        const dateElement = document.getElementById('vichisliniya-listov-created-at');
        if (dateElement && data.created_at) {
            dateElement.textContent = data.created_at;
        }
    },

    /**
     * Обновление текущих параметров вычислений листов данными с сервера.
     * @param {Object} data - Данные с сервера
     * @returns {void}
     */
    updateVichisliniyaListovParameters: function(data) {
        console.log('🔄 Обновление параметров вычислений листов данными с сервера:', data);
        if (data.vyleta !== undefined) this.currentParameters.vyleta = data.vyleta;
        if (data.polosa_count !== undefined) this.currentParameters.polosa_count = data.polosa_count;
        if (data.color) this.currentParameters.color = data.color;
        if (data.list_count !== undefined) this.currentParameters.list_count = data.list_count;
        // Новые поля
        if (data.item_width !== undefined) this.currentParameters.item_width = data.item_width;
        if (data.item_height !== undefined) this.currentParameters.item_height = data.item_height;
        if (data.fit_horizontal !== undefined) this.currentParameters.fit_horizontal = data.fit_horizontal;
        if (data.fit_vertical !== undefined) this.currentParameters.fit_vertical = data.fit_vertical;
        if (data.fit_total !== undefined) this.currentParameters.fit_total = data.fit_total;
        if (data.fit_landscape_total !== undefined) this.currentParameters.fit_landscape_total = data.fit_landscape_total;
        if (data.fit_portrait_total !== undefined) this.currentParameters.fit_portrait_total = data.fit_portrait_total;
        if (data.fit_selected_orientation) this.currentParameters.fit_selected_orientation = data.fit_selected_orientation;
        if (data.cuts_count !== undefined) this.currentParameters.cuts_count = data.cuts_count;
    },

    /**
     * Обновление пользовательского интерфейса формы параметров вычислений листов.
     * Заполняет поля формы текущими значениями параметров.
     * @returns {void}
     */
    updateVichisliniyaListovUI: function() {
        console.log('🎨 Обновление интерфейса формы параметров вычислений листов...');
        const vyletaInput = document.getElementById('vichisliniya-listov-vyleta-input');
        if (vyletaInput) vyletaInput.value = this.currentParameters.vyleta;

        const polosaCountInput = document.getElementById('vichisliniya-listov-polosa-count-input');
        if (polosaCountInput) polosaCountInput.value = this.currentParameters.polosa_count;

        const colorSelect = document.getElementById('vichisliniya-listov-color-select');
        if (colorSelect) colorSelect.value = this.currentParameters.color;

        // Новые поля
        const itemWidthInput = document.getElementById('vichisliniya-listov-item-width-input');
        if (itemWidthInput) itemWidthInput.value = this.currentParameters.item_width;

        const itemHeightInput = document.getElementById('vichisliniya-listov-item-height-input');
        if (itemHeightInput) itemHeightInput.value = this.currentParameters.item_height;

        this.updateResultValue(this.currentParameters.list_count);
        this.updateBreakdownDisplay();
        this.updateFittingUI();
        console.log('✅ Интерфейс формы параметров вычислений листов обновлён');
    },

    /**
     * Обновление отображения параметров в блоке расшифровки расчёта.
     * @returns {void}
     */
    updateBreakdownDisplay: function() {
        console.log('📝 Обновление отображения параметров в блоке расшифровки...');
        const vyletaElement = document.getElementById('vichisliniya-listov-breakdown-vyleta');
        if (vyletaElement) vyletaElement.textContent = this.currentParameters.vyleta;

        const polosaCountElement = document.getElementById('vichisliniya-listov-breakdown-polosa-count');
        if (polosaCountElement) polosaCountElement.textContent = this.currentParameters.polosa_count;

        const colorElement = document.getElementById('vichisliniya-listov-breakdown-color');
        if (colorElement) colorElement.textContent = this.currentParameters.color;

        const breakdownFitEl = document.getElementById('vichisliniya-listov-breakdown-fit-total');
        if (breakdownFitEl) breakdownFitEl.textContent = this.currentParameters.fit_total;

        const cutsCountElement = document.getElementById('vichisliniya-listov-breakdown-cuts-count');
        if (cutsCountElement) cutsCountElement.textContent = this.currentParameters.cuts_count;

        this.updateFormulaDisplay();
    },

    /**
     * Обновление отображения формулы расчёта.
     * @returns {void}
     */
    updateFormulaDisplay: function() {
        console.log('🧮 Обновление отображения формулы расчёта...');
        const formulaElement = document.getElementById('vichisliniya-listov-formula-text');
        if (formulaElement && this.currentCirculation && this.currentParameters.fit_total > 0) {
            const formula = `${this.currentCirculation} / ${this.currentParameters.fit_total} (окр. вверх)`;
            formulaElement.textContent = formula;
        } else if (formulaElement) {
            formulaElement.textContent = '—';
        }
    },

    /**
     * Обновление отображаемого значения количества листов.
     * @param {number} value - Количество листов
     * @returns {void}
     */
    updateResultValue: function(value) {
        const resultValueElement = document.getElementById('vichisliniya-listov-result-value');
        if (resultValueElement) {
            resultValueElement.textContent = value.toFixed(2);
        }
    },

    /**
     * Сохранение параметров вычислений листов на сервере для печатного компонента.
     * @returns {void}
     */
    saveVichisliniyaListovParameters: function() {
        if (!this.currentPrintComponentId) {
            this.showNotification('Для сохранения необходимо выбрать печатный компонент', 'warning');
            console.warn('⚠️ Невозможно сохранить: не выбран печатный компонент');
            return;
        }

        console.log(`💾 Сохранение параметров вычислений листов для печатного компонента ID: ${this.currentPrintComponentId}...`);
        const url = '/vichisliniya_listov/save-data/';
        const requestData = {
            print_component_id: this.currentPrintComponentId,
            list_count: this.currentParameters.list_count,
            vyleta: this.currentParameters.vyleta,
            polosa_count: this.currentParameters.polosa_count,
            color: this.currentParameters.color,
            item_width: this.currentParameters.item_width,
            item_height: this.currentParameters.item_height,
            fit_horizontal: this.currentParameters.fit_horizontal,
            fit_vertical: this.currentParameters.fit_vertical,
            fit_total: this.currentParameters.fit_total,
            fit_landscape_total: this.currentParameters.fit_landscape_total,
            fit_portrait_total: this.currentParameters.fit_portrait_total,
            fit_selected_orientation: this.currentParameters.fit_selected_orientation,
            cuts_count: this.currentParameters.cuts_count
        };
        const csrfToken = this.getCsrfToken();

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data.success) {
                console.log('✅ Параметры успешно сохранены:', data);
                this.showSavedData(data);
                this.isParametersModified = false;
                this.showNotification('Параметры успешно сохранены', 'success');

                // Отправляем событие для других секций
                const event = new CustomEvent('vichisliniyaListovUpdated', {
                    detail: {
                        printComponentId: this.currentPrintComponentId,
                        listCount: data.list_count,
                        cutsCount: data.cuts_count,
                        timestamp: new Date().toISOString()
                    }
                });
                document.dispatchEvent(event);
                console.log(`📤 Событие vichisliniyaListovUpdated отправлено после сохранения для компонента ${this.currentPrintComponentId}`);
            } else {
                console.error('❌ Ошибка при сохранении параметров:', data.message);
                this.showNotification(`Ошибка: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('❌ Ошибка сети при сохранении параметров:', error);
            this.showNotification('Ошибка сети при сохранении параметров', 'error');
        });
    },

    /**
     * Показ информации о сохранённых данных.
     * @param {Object} data - Данные с сервера о сохранённых параметрах
     * @returns {void}
     */
    showSavedData: function(data) {
        console.log('💾 Показ информации о сохранённых данных:', data);
        const savedDataContainer = document.getElementById('vichisliniya-listov-saved-data-container');
        const updatedElement = document.getElementById('vichisliniya-listov-saved-data-updated');
        if (savedDataContainer && updatedElement) {
            savedDataContainer.style.display = 'block';
            if (data.updated_at) updatedElement.textContent = data.updated_at;
            const timestampElement = document.getElementById('vichisliniya-listov-result-timestamp');
            if (timestampElement) {
                timestampElement.innerHTML = `<i class="fas fa-clock"></i> Последний расчёт: ${new Date().toLocaleString()}`;
            }
        }
    },

    // ============================================================================
    // ===== РАЗДЕЛ 7: ОБРАБОТЧИКИ ИЗМЕНЕНИЙ ПОЛЕЙ ВВОДА =====
    // ============================================================================

    /**
     * Обработчик изменения поля "Вылеты".
     * @param {Event} event - Событие изменения поля ввода
     * @returns {void}
     */
    handleVyletaInputChange: function(event) {
        console.log('✏️ Изменение поля "Вылеты":', event.target.value);
        let newValue = parseInt(event.target.value) || 1;
        if (newValue < 1 || newValue > 100) {
            this.showNotification('Вылеты должны быть в диапазоне от 1 до 100', 'warning');
            event.target.value = Math.max(1, Math.min(100, newValue));
            return;
        }
        this.currentParameters.vyleta = newValue;
        this.isParametersModified = true;
        const vyletaElement = document.getElementById('vichisliniya-listov-breakdown-vyleta');
        if (vyletaElement) vyletaElement.textContent = newValue;
    },

    /**
     * Обработчик изменения поля "Количество полос".
     * @param {Event} event - Событие изменения поля ввода
     * @returns {void}
     */
    handlePolosaCountInputChange: function(event) {
        console.log('✏️ Изменение поля "Количество полос":', event.target.value);
        let newValue = parseInt(event.target.value) || 1;
        if (newValue < 1 || newValue > 64) {
            this.showNotification('Количество полос должно быть в диапазоне от 1 до 64', 'warning');
            event.target.value = Math.max(1, Math.min(64, newValue));
            return;
        }
        this.currentParameters.polosa_count = newValue;
        this.isParametersModified = true;
        const polosaCountElement = document.getElementById('vichisliniya-listov-breakdown-polosa-count');
        if (polosaCountElement) polosaCountElement.textContent = newValue;
    },

    /**
     * Обработчик изменения поля "Цветность".
     * @param {Event} event - Событие изменения поля выбора
     * @returns {void}
     */
    handleColorSelectChange: function(event) {
        console.log('✏️ Изменение поля "Цветность":', event.target.value);
        this.currentParameters.color = event.target.value;
        this.isParametersModified = true;
        const colorElement = document.getElementById('vichisliniya-listov-breakdown-color');
        if (colorElement) colorElement.textContent = event.target.value;
    },

    /**
     * Обработчик изменения ширины изделия.
     * @param {Event} event - Событие ввода
     */
    handleItemWidthInputChange: function(event) {
        console.log('✏️ Изменение ширины изделия:', event.target.value);
        let newValue = parseFloat(event.target.value) || 1;
        if (newValue < 1 || newValue > 1000) {
            this.showNotification('Ширина должна быть от 1 до 1000 мм', 'warning');
            event.target.value = Math.max(1, Math.min(1000, newValue));
            return;
        }
        this.currentParameters.item_width = newValue;
        this.isParametersModified = true;
    },

    /**
     * Обработчик изменения высоты изделия.
     * @param {Event} event - Событие ввода
     */
    handleItemHeightInputChange: function(event) {
        console.log('✏️ Изменение высоты изделия:', event.target.value);
        let newValue = parseFloat(event.target.value) || 1;
        if (newValue < 1 || newValue > 1000) {
            this.showNotification('Высота должна быть от 1 до 1000 мм', 'warning');
            event.target.value = Math.max(1, Math.min(1000, newValue));
            return;
        }
        this.currentParameters.item_height = newValue;
        this.isParametersModified = true;
    },

    /**
     * Обработчик подтверждения изменения поля (событие change или нажатие Enter).
     * Выполняет расчёт количества листов и сохраняет параметры.
     * @returns {void}
     */
    handleFieldChange: function() {
        console.log('✅ Подтверждение изменения поля — запуск расчёта и сохранения');
        if (!this.currentPrintComponentId) {
            this.showNotification('Для расчёта необходимо выбрать печатный компонент', 'warning');
            return;
        }
        if (!this.currentCirculation) {
            this.showNotification('Для расчёта необходимо указать тираж', 'warning');
            return;
        }

        // Пересчитываем размещение
        this.calculateFitting();

        // Пересчитываем количество листов
        this.calculateVichisliniyaListovListCount();

        // Сохраняем все параметры на сервер
        this.saveVichisliniyaListovParameters();
    },

    // ============================================================================
    // ===== РАЗДЕЛ 8: ФУНКЦИИ ВЫЧИСЛЕНИЯ И РАСЧЁТА =====
    // ============================================================================

    /**
     * Основная функция расчёта размещения.
     * Вызывается при изменении любого параметра (размеры изделия, vyleta, данные листа).
     * В конце вызывает перерисовку схемы для обеих сторон и обновление количества резов.
     * @returns {void}
     */
    calculateFitting: function() {
        console.log('📐 Расчёт размещения изделий на листе...');

        // Проверяем наличие всех необходимых данных
        if (!this.sheetData.sheet_width || !this.sheetData.sheet_height || this.sheetData.margin === null) {
            console.warn('⚠️ Нет данных о листе. Расчёт невозможен.');
            this.drawBothSides();  // рисуем то, что есть (возможно пустое)
            return;
        }

        if (!this.currentParameters.item_width || !this.currentParameters.item_height) {
            console.warn('⚠️ Не заданы размеры изделия.');
            this.drawBothSides();
            return;
        }

        // Размер печатной области
        const printableWidth = this.sheetData.sheet_width - 2 * this.sheetData.margin;
        const printableHeight = this.sheetData.sheet_height - 2 * this.sheetData.margin;

        if (printableWidth <= 0 || printableHeight <= 0) {
            console.warn('⚠️ Печатная область имеет неположительные размеры.');
            this.currentParameters.fit_landscape_total = 0;
            this.currentParameters.fit_portrait_total = 0;
            this.currentParameters.fit_total = 0;
            this.currentParameters.fit_horizontal = 0;
            this.currentParameters.fit_vertical = 0;
            this.updateFittingUI();
            this.drawBothSides();
            return;
        }

        // Параметры изделия и зазор
        const itemW = this.currentParameters.item_width;
        const itemH = this.currentParameters.item_height;
        const gap = this.currentParameters.vyleta;

        // Вспомогательная функция для расчёта количества по одному измерению
        function countItems(available, itemSize, gap) {
            if (itemSize <= 0) return 0;
            const step = itemSize + gap;
            if (step <= 0) return 0;
            return Math.floor((available + gap) / step);
        }

        // Альбомная ориентация (изделие не повёрнуто)
        let countXLand = countItems(printableWidth, itemW, gap);
        let countYLand = countItems(printableHeight, itemH, gap);
        let totalLand = countXLand * countYLand;

        // Портретная ориентация (изделие повёрнуто на 90°)
        let countXPort = countItems(printableWidth, itemH, gap);
        let countYPort = countItems(printableHeight, itemW, gap);
        let totalPort = countXPort * countYPort;

        // Сохраняем оба варианта
        this.currentParameters.fit_landscape_total = totalLand;
        this.currentParameters.fit_portrait_total = totalPort;

        // Детали для отображения (количество по рядам)
        this.landscapeDetails = { x: countXLand, y: countYLand };
        this.portraitDetails = { x: countXPort, y: countYPort };

        // Определяем выбранную ориентацию
        let selectedOrientation = this.currentParameters.fit_selected_orientation;
        if (selectedOrientation === 'auto') {
            if (totalLand >= totalPort) {
                selectedOrientation = 'landscape';
            } else {
                selectedOrientation = 'portrait';
            }
        }

        // Применяем выбранную ориентацию
        this.applySelectedOrientation(selectedOrientation);

        // Обновляем интерфейс
        this.updateFittingUI();

        // Перерисовываем схему для обеих сторон (с учётом режима и типа печати)
        this.drawBothSides();
    },

    /**
     * Применяет выбранную ориентацию и заполняет поля fit_horizontal, fit_vertical, fit_total.
     * @param {string} orientation - 'landscape' или 'portrait'
     * @returns {void}
     */
    applySelectedOrientation: function(orientation) {
        if (orientation === 'landscape') {
            this.currentParameters.fit_horizontal = this.landscapeDetails.x;
            this.currentParameters.fit_vertical = this.landscapeDetails.y;
            this.currentParameters.fit_total = this.currentParameters.fit_landscape_total;
            this.currentParameters.fit_selected_orientation = 'landscape';
        } else if (orientation === 'portrait') {
            this.currentParameters.fit_horizontal = this.portraitDetails.x;
            this.currentParameters.fit_vertical = this.portraitDetails.y;
            this.currentParameters.fit_total = this.currentParameters.fit_portrait_total;
            this.currentParameters.fit_selected_orientation = 'portrait';
        } else {
            this.currentParameters.fit_horizontal = 0;
            this.currentParameters.fit_vertical = 0;
            this.currentParameters.fit_total = 0;
            this.currentParameters.fit_selected_orientation = 'auto';
        }

        // Обновляем количество резов
        this.updateCutsCount();

        // Обновляем отображение выбранной ориентации
        const selectedNameEl = document.getElementById('vichisliniya-listov-selected-orientation-name');
        if (selectedNameEl) {
            if (orientation === 'landscape') selectedNameEl.textContent = 'альбомная';
            else if (orientation === 'portrait') selectedNameEl.textContent = 'портретная';
            else selectedNameEl.textContent = 'автоматически';
        }

        const selectedTotalEl = document.getElementById('vichisliniya-listov-selected-fit-total');
        if (selectedTotalEl) {
            selectedTotalEl.textContent = this.currentParameters.fit_total;
        }

        // Обновляем расшифровку в результатах
        const breakdownFitEl = document.getElementById('vichisliniya-listov-breakdown-fit-total');
        if (breakdownFitEl) {
            breakdownFitEl.textContent = this.currentParameters.fit_total;
        }
    },

    /**
     * Обновляет количество резов на основе текущих fit_horizontal и fit_vertical.
     * Формула: (fit_horizontal + 1) + (fit_vertical + 1)
     * @returns {void}
     */
    updateCutsCount: function() {
        this.currentParameters.cuts_count = (this.currentParameters.fit_horizontal + 1) + (this.currentParameters.fit_vertical + 1);
        const cutsEl = document.getElementById('vichisliniya-listov-breakdown-cuts-count');
        if (cutsEl) {
            cutsEl.textContent = this.currentParameters.cuts_count;
        }
        console.log(`✂️ Количество резов обновлено: ${this.currentParameters.cuts_count}`);
    },

    /**
     * Обновляет интерфейс блока размещения (цифры вариантов, выделение активного).
     * @returns {void}
     */
    updateFittingUI: function() {
        // Альбомный вариант
        const landscapeCountEl = document.getElementById('vichisliniya-listov-landscape-count');
        const landscapeDetailsEl = document.getElementById('vichisliniya-listov-landscape-details');
        if (landscapeCountEl) landscapeCountEl.textContent = this.currentParameters.fit_landscape_total;
        if (landscapeDetailsEl && this.landscapeDetails) {
            landscapeDetailsEl.textContent = `${this.landscapeDetails.x}×${this.landscapeDetails.y}`;
        }

        // Портретный вариант
        const portraitCountEl = document.getElementById('vichisliniya-listov-portrait-count');
        const portraitDetailsEl = document.getElementById('vichisliniya-listov-portrait-details');
        if (portraitCountEl) portraitCountEl.textContent = this.currentParameters.fit_portrait_total;
        if (portraitDetailsEl && this.portraitDetails) {
            portraitDetailsEl.textContent = `${this.portraitDetails.x}×${this.portraitDetails.y}`;
        }

        // Подсветка выбранного варианта
        const optionLand = document.getElementById('vichisliniya-listov-option-landscape');
        const optionPort = document.getElementById('vichisliniya-listov-option-portrait');
        if (optionLand && optionPort) {
            optionLand.classList.remove('active');
            optionPort.classList.remove('active');
            if (this.currentParameters.fit_selected_orientation === 'landscape') {
                optionLand.classList.add('active');
            } else if (this.currentParameters.fit_selected_orientation === 'portrait') {
                optionPort.classList.add('active');
            }
        }

        // Обновляем выбранный текст
        const selectedNameEl = document.getElementById('vichisliniya-listov-selected-orientation-name');
        const selectedTotalEl = document.getElementById('vichisliniya-listov-selected-fit-total');
        if (selectedNameEl) {
            if (this.currentParameters.fit_selected_orientation === 'landscape') selectedNameEl.textContent = 'альбомная';
            else if (this.currentParameters.fit_selected_orientation === 'portrait') selectedNameEl.textContent = 'портретная';
            else selectedNameEl.textContent = 'автоматически';
        }
        if (selectedTotalEl) {
            selectedTotalEl.textContent = this.currentParameters.fit_total;
        }
    },

    /**
     * Обработчик выбора ориентации пользователем.
     * @param {string} orientation - 'landscape', 'portrait' или 'auto'
     * @returns {void}
     */
    selectOrientation: function(orientation) {
        console.log(`🎯 Выбрана ориентация: ${orientation}`);
        this.currentParameters.fit_selected_orientation = orientation;
        this.applySelectedOrientation(orientation);
        this.isParametersModified = true;
        this.handleFieldChange();
    },

    /**
     * Вычисление количества листов на основе текущих параметров и тиража (локально).
     * Новая формула: количество листов = ceil(тираж / количество_изделий_на_листе)
     * @returns {void}
     */
    calculateVichisliniyaListovListCount: function() {
        console.log('🧮 Вычисление количества листов локально по новой формуле...');

        if (!this.currentCirculation) {
            console.warn('⚠️ Невозможно выполнить расчёт: не указан тираж');
            return;
        }

        const fitTotal = this.currentParameters.fit_total;

        if (!fitTotal || fitTotal <= 0) {
            console.warn('⚠️ Невозможно выполнить расчёт: количество изделий на листе равно 0');
            this.currentParameters.list_count = 0.00;
            this.updateResultValue(0.00);
            const resultBadgeElement = document.getElementById('vichisliniya-listov-result-badge');
            if (resultBadgeElement) {
                resultBadgeElement.textContent = 'ошибка: fit_total=0';
                resultBadgeElement.className = 'result-badge error';
            }
            return;
        }

        const rawCount = this.currentCirculation / fitTotal;
        const calculated = Math.ceil(rawCount);

        this.currentParameters.list_count = calculated;

        const formula = `${this.currentCirculation} / ${fitTotal} (окр. вверх) = ${calculated}`;

        const resultData = {
            calculated_list_count: calculated,
            circulation: this.currentCirculation,
            formula: formula,
            vyleta: this.currentParameters.vyleta,
            polosa_count: this.currentParameters.polosa_count,
            color: this.currentParameters.color
        };

        this.updateCalculationResult(resultData);

        // Отправляем событие (предварительное)
        if (this.currentPrintComponentId) {
            const event = new CustomEvent('vichisliniyaListovUpdated', {
                detail: {
                    printComponentId: this.currentPrintComponentId,
                    listCount: calculated,
                    timestamp: new Date().toISOString()
                }
            });
            document.dispatchEvent(event);
            console.log(`📤 Событие vichisliniyaListovUpdated отправлено для компонента ${this.currentPrintComponentId} (предварительное)`);
        }
    },

    /**
     * Обновление отображения результата расчёта.
     * @param {Object} data - Данные с результатом расчёта (локальные или с сервера)
     * @returns {void}
     */
    updateCalculationResult: function(data) {
        console.log('📊 Обновление отображения результата расчёта:', data);
        const resultValueElement = document.getElementById('vichisliniya-listov-result-value');
        if (resultValueElement && data.calculated_list_count !== undefined) {
            resultValueElement.textContent = data.calculated_list_count.toFixed(2);
        }

        const resultBadgeElement = document.getElementById('vichisliniya-listov-result-badge');
        if (resultBadgeElement) {
            resultBadgeElement.textContent = 'расчёт выполнен';
            resultBadgeElement.className = 'result-badge success';
        }
        const formulaElement = document.getElementById('vichisliniya-listov-formula-text');
        if (formulaElement && data.formula) {
            formulaElement.textContent = data.formula;
        }
        const timestampElement = document.getElementById('vichisliniya-listov-result-timestamp');
        if (timestampElement) {
            timestampElement.innerHTML = `<i class="fas fa-clock"></i> Последний расчёт: ${new Date().toLocaleString()}`;
        }
        const circulationElement = document.getElementById('vichisliniya-listov-breakdown-circulation');
        if (circulationElement && data.circulation) {
            circulationElement.textContent = data.circulation;
        }
        const vyletaElement = document.getElementById('vichisliniya-listov-breakdown-vyleta');
        if (vyletaElement && data.vyleta !== undefined) vyletaElement.textContent = data.vyleta;
        const polosaCountElement = document.getElementById('vichisliniya-listov-breakdown-polosa-count');
        if (polosaCountElement && data.polosa_count !== undefined) polosaCountElement.textContent = data.polosa_count;
        const colorElement = document.getElementById('vichisliniya-listov-breakdown-color');
        if (colorElement && data.color) colorElement.textContent = data.color;
    },

    // ============================================================================
    // ===== НОВЫЙ РАЗДЕЛ 9: ВИЗУАЛИЗАЦИЯ ДВУХ СТОРОН ЛИСТА С ПОДДЕРЖКОЙ ЦВЕТА/Ч/Б =====
    // ============================================================================

    /**
     * Рисует обе стороны листа (лицевую и оборотную) на соответствующих canvas.
     * Для каждой стороны определяет, нужно ли заливать изделия цветом, и какой цвет использовать.
     * @returns {void}
     */
    drawBothSides: function() {
        console.log(`🎨 Отрисовка обеих сторон листа (режим: ${this.currentPrintingMode}, тип: ${this.currentPrintType})`);
        
        // Определяем, нужна ли заливка для лицевой стороны (всегда true)
        const fillFront = true;
        // Для оборотной стороны заливка нужна только при двусторонней печати
        const fillBack = (this.currentPrintingMode === 'duplex');
        
        // Рисуем лицевую сторону с заливкой и учётом типа печати
        this.drawPlacementForSide(this.canvasFront, 'front', fillFront, this.currentPrintType);
        // Рисуем оборотную сторону с заливкой (если двусторонняя) и учётом типа печати
        this.drawPlacementForSide(this.canvasBack, 'back', fillBack, this.currentPrintType);
    },

    /**
     * Рисует одну сторону листа на заданном canvas.
     * @param {HTMLCanvasElement} canvas - элемент canvas для рисования
     * @param {string} side - 'front' или 'back' (используется для подписей)
     * @param {boolean} fill - нужно ли заливать изделия цветом
     * @param {string} printType - тип печати: 'color' (цветная) или 'bw' (чёрно-белая)
     * @returns {void}
     */
    drawPlacementForSide: function(canvas, side, fill, printType) {
        // Если canvas не существует, выходим
        if (!canvas) {
            console.warn(`⚠️ Canvas для стороны ${side} не найден`);
            return;
        }

        const ctx = canvas.getContext('2d');
        // Очищаем canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Проверяем наличие данных о листе
        if (!this.sheetData.sheet_width || !this.sheetData.sheet_height || this.sheetData.margin === null) {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#999';
            ctx.fillText('Нет данных о листе', 10, 20);
            return;
        }

        const orientation = this.currentParameters.fit_selected_orientation;
        if (orientation === 'auto') {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#999';
            ctx.fillText('Ориентация не выбрана', 10, 20);
            return;
        }

        // Определяем размеры изделия в зависимости от ориентации
        let itemW, itemH, fitH, fitV;
        if (orientation === 'landscape') {
            // Альбомная: изделие не повёрнуто
            itemW = this.currentParameters.item_width;
            itemH = this.currentParameters.item_height;
            fitH = this.currentParameters.fit_horizontal;
            fitV = this.currentParameters.fit_vertical;
        } else { // portrait
            // Портретная: изделие повёрнуто на 90°, поэтому меняем местами ширину и высоту
            itemW = this.currentParameters.item_height;
            itemH = this.currentParameters.item_width;
            fitH = this.currentParameters.fit_horizontal;
            fitV = this.currentParameters.fit_vertical;
        }

        const gap = this.currentParameters.vyleta;
        const margin = this.sheetData.margin;
        const sheetW = this.sheetData.sheet_width;
        const sheetH = this.sheetData.sheet_height;

        // Если изделия не помещаются, выводим сообщение
        if (fitH === 0 || fitV === 0) {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#999';
            ctx.fillText('Изделия не помещаются на листе', 10, 20);
            return;
        }

        // Масштабирование: отступ от краёв canvas (10 пикселей)
        const padding = 10;
        const scale = Math.min(
            (canvas.width - 2 * padding) / sheetW,
            (canvas.height - 2 * padding) / sheetH
        );

        ctx.save();
        ctx.translate(padding, padding);

        // 1. Рисуем контур листа (чёрный, толщина 1)
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, sheetW * scale, sheetH * scale);

        // 2. Рисуем печатную область (пунктирная линия, серая)
        ctx.strokeStyle = '#999';
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(
            margin * scale,
            margin * scale,
            (sheetW - 2 * margin) * scale,
            (sheetH - 2 * margin) * scale
        );
        ctx.setLineDash([]); // возвращаем сплошную линию

        // 3. Рисуем изделия (если они помещаются)
        if (fitH > 0 && fitV > 0) {
            // ===== ОПРЕДЕЛЯЕМ ЦВЕТА В ЗАВИСИМОСТИ ОТ ТИПА ПЕЧАТИ И ЗАЛИВКИ =====
            let fillColor, strokeColor;
            
            if (printType === 'color') {
                // Цветная печать
                if (fill) {
                    fillColor = 'rgba(52, 152, 219, 0.3)';   // Полупрозрачный синий
                    strokeColor = '#2980b9';                 // Тёмно-синий контур
                } else {
                    fillColor = 'transparent';                // Без заливки
                    strokeColor = '#a0c4ff';                  // Светло-синий контур (для оборотной стороны)
                }
            } else { // 'bw' – чёрно-белая печать
                if (fill) {
                    fillColor = 'rgba(200, 200, 200, 0.4)';   // Полупрозрачный светло-серый
                    strokeColor = '#999999';                  // Серый контур
                } else {
                    fillColor = 'transparent';
                    strokeColor = '#cccccc';                  // Очень светлый серый контур (для оборотной стороны)
                }
            }
            
            ctx.fillStyle = fillColor;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 0.5;

            // Перебираем все изделия по сетке (ряды и колонки)
            for (let row = 0; row < fitV; row++) {
                for (let col = 0; col < fitH; col++) {
                    // Вычисляем координаты верхнего левого угла изделия
                    const x = margin + col * (itemW + gap);
                    const y = margin + row * (itemH + gap);
                    
                    // Рисуем прямоугольник изделия
                    if (fill) {
                        ctx.fillRect(x * scale, y * scale, itemW * scale, itemH * scale);
                    }
                    ctx.strokeRect(x * scale, y * scale, itemW * scale, itemH * scale);
                }
            }
        } else {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#e74c3c';
            ctx.fillText('Не помещается', 20 * scale, 50 * scale);
        }

        ctx.restore();

        // Обновляем метку ориентации (один раз, для обеих сторон одинаково)
        if (side === 'front') {
            const label = document.getElementById('vichisliniya-listov-viz-orientation-label');
            if (label) {
                label.textContent = orientation === 'landscape' ? '(альбомная)' : '(портретная)';
            }
        }
    },

    /**
     * Очищает оба canvas (при сбросе секции).
     * @returns {void}
     */
    clearCanvas: function() {
        if (this.canvasFront) {
            const ctxFront = this.canvasFront.getContext('2d');
            ctxFront.clearRect(0, 0, this.canvasFront.width, this.canvasFront.height);
        }
        if (this.canvasBack) {
            const ctxBack = this.canvasBack.getContext('2d');
            ctxBack.clearRect(0, 0, this.canvasBack.width, this.canvasBack.height);
        }
    },

    // ============================================================================
    // ===== РАЗДЕЛ 10: СБРОС СЕКЦИИ =====
    // ============================================================================

    /**
     * Полный сброс секции "Вычисления листов".
     * Очищает canvas, сбрасывает режим и тип печати, а также все параметры.
     * @returns {void}
     */
    resetSection: function() {
        console.log('🔄 Сброс секции "Вычисления листов"');

        // Сбрасываем счётчик запросов, чтобы устаревшие ответы игнорировались
        this.lastRequestId = 0;

        this.currentPrintComponentId = null;
        this.currentPrintComponentNumber = null;
        this.currentProschetId = null;
        this.currentCirculation = null;
        this.currentProschetTitle = null;
        this.currentPrintComponentInfo = null;
        this.isDataLoaded = false;
        this.currentPrintingMode = 'single';   // сбрасываем режим печати
        this.currentPrintType = 'color';       // сбрасываем тип печати

        this.sheetData = { sheet_width: null, sheet_height: null, margin: null, sheet_name: null };

        this.resetToDefaults();

        const titleElement = document.getElementById('vichisliniya-listov-proschet-title');
        if (titleElement) {
            titleElement.innerHTML = `<span class="placeholder-text">(печатный компонент не выбран)</span>`;
        }

        this.toggleSectionDisplay(false);
        this.resetPrintComponentInfo();

        this.updateSheetInfoDisplay();

        this.clearCanvas();

        console.log('✅ Секция сброшена – ожидание выбора печатного компонента');
    },

    /**
     * Сброс отображения информации о печатном компоненте в интерфейсе.
     * @returns {void}
     */
    resetPrintComponentInfo: function() {
        console.log('🔄 Сброс информации о печатном компоненте в интерфейсе');
        const elements = {
            componentNumber: 'vichisliniya-listov-print-component-number',
            printer: 'vichisliniya-listov-printer-name',
            paper: 'vichisliniya-listov-paper-name',
            circulation: 'vichisliniya-listov-circulation',
            circulationFormatted: 'vichisliniya-listov-circulation-formatted',
            proschetNumber: 'vichisliniya-listov-proschet-number',
            proschetName: 'vichisliniya-listov-proschet-name',
            client: 'vichisliniya-listov-client-name',
            createdAt: 'vichisliniya-listov-created-at'
        };

        for (const [key, id] of Object.entries(elements)) {
            const el = document.getElementById(id);
            if (el) {
                if (key === 'circulationFormatted') {
                    el.textContent = '';
                } else {
                    el.textContent = 'Не указан' + (key.includes('paper') ? 'а' : key.includes('created') ? 'а' : '');
                }
            }
        }

        const savedDataContainer = document.getElementById('vichisliniya-listov-saved-data-container');
        if (savedDataContainer) savedDataContainer.style.display = 'none';

        const resultBadge = document.getElementById('vichisliniya-listov-result-badge');
        if (resultBadge) {
            resultBadge.textContent = 'ожидает расчёта';
            resultBadge.className = 'result-badge';
        }

        const timestamp = document.getElementById('vichisliniya-listov-result-timestamp');
        if (timestamp) {
            timestamp.innerHTML = `<i class="fas fa-clock"></i> Последний расчёт: не выполнялся`;
        }
    },

    /**
     * Сброс параметров к значениям по умолчанию.
     * @returns {void}
     */
    resetToDefaults: function() {
        console.log('🔄 Сброс параметров к значениям по умолчанию');
        this.currentParameters = {
            vyleta: 1,
            polosa_count: 1,
            color: '4+0',
            list_count: 0.00,
            item_width: 90.0,
            item_height: 50.0,
            fit_horizontal: 0,
            fit_vertical: 0,
            fit_total: 0,
            fit_landscape_total: 0,
            fit_portrait_total: 0,
            fit_selected_orientation: 'auto',
            cuts_count: 0
        };
        this.isParametersModified = false;
        this.updateVichisliniyaListovUI();
        this.updateFormulaDisplay();
        const savedDataContainer = document.getElementById('vichisliniya-listov-saved-data-container');
        if (savedDataContainer) savedDataContainer.style.display = 'none';
        const timestampElement = document.getElementById('vichisliniya-listov-result-timestamp');
        if (timestampElement) {
            timestampElement.innerHTML = `<i class="fas fa-clock"></i> Последний расчёт: не выполнялся`;
        }
    },

    // ============================================================================
    // ===== РАЗДЕЛ 11: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
    // ============================================================================

    /**
     * Получение CSRF-токена для AJAX-запросов.
     * @returns {string} CSRF-токен
     */
    getCsrfToken: function() {
        console.log('🔑 Получение CSRF-токена...');
        const metaToken = document.querySelector('meta[name="csrf-token"]');
        if (metaToken && metaToken.getAttribute('content')) {
            console.log('✅ CSRF-токен получен из meta-тега');
            return metaToken.getAttribute('content');
        }
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith('csrftoken=')) {
                const token = decodeURIComponent(cookie.substring('csrftoken='.length));
                console.log('✅ CSRF-токен получен из cookies');
                return token;
            }
        }
        console.warn('⚠️ CSRF-токен не найден');
        return '';
    },

    /**
     * Показ уведомления на странице.
     * @param {string} message - Текст сообщения
     * @param {string} type - Тип сообщения: 'success', 'error', 'warning', 'info'
     * @returns {void}
     */
    showNotification: function(message, type = 'info') {
        console.log(`💬 Показ уведомления [${type}]: ${message}`);
        const notification = document.createElement('div');
        let backgroundColor = '#2196F3';
        let icon = 'ℹ️';
        if (type === 'success') { backgroundColor = '#4CAF50'; icon = '✅'; }
        else if (type === 'error') { backgroundColor = '#F44336'; icon = '❌'; }
        else if (type === 'warning') { backgroundColor = '#FF9800'; icon = '⚠️'; }
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${backgroundColor};
            color: white;
            border-radius: 4px;
            z-index: 10000;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            max-width: 300px;
            word-wrap: break-word;
            font-family: Arial, sans-serif;
            transition: opacity 0.3s;
            opacity: 0;
        `;
        notification.textContent = `${icon} ${message}`;
        document.body.appendChild(notification);
        setTimeout(() => { notification.style.opacity = '1'; }, 10);
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => { if (notification.parentNode) notification.parentNode.removeChild(notification); }, 300);
        }, 5000);
    }
};

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 DOM загружен, инициализация секции "Вычисления листов"...');
    vichisliniyaListov.init();
    window.vichisliniyaListov = vichisliniyaListov;
    console.log('✅ Секция "Вычисления листов" готова к работе с поддержкой цветной/ч/б печати и фиксом сброса многостраничного режима');
});