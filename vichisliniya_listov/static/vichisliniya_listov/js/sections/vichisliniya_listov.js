/**
 * ФАЙЛ: vichisliniya_listov.js
 * НАЗНАЧЕНИЕ: JavaScript для секции "Вычисления листов"
 * 
 * ОСНОВНАЯ ЗАДАЧА: Рассчитывать количество листов на основе параметров (вылеты, полосы, цветность)
 * и тиража из связанного просчёта.
 * 
 * ВАЖНО: При любом изменении параметров или тиража автоматически выполняется расчёт,
 * результат отображается в поле 'result-value' и отправляется событие 'vichisliniyaListovUpdated',
 * которое перехватывается секцией "Печатные компоненты" для пересчёта стоимости.
 * 
 * ИЗМЕНЕНО (для исправления проблемы с отображением количества листов):
 * - В функции loadVichisliniyaListovParameters после загрузки данных с сервера добавлен вызов
 *   this.calculateVichisliniyaListovListCount(), который пересчитывает количество листов на основе
 *   текущего тиража и загруженных параметров. Это гарантирует, что после выбора печатного компонента
 *   отображаемое количество листов всегда будет актуальным, даже если тираж изменился с момента
 *   последнего сохранения параметров.
 * 
 * КЛЮЧЕВЫЕ МОМЕНТЫ:
 * 1. При изменении любого поля (или тиража) запускается handleFieldChange().
 * 2. handleFieldChange() проверяет наличие выбранного компонента и тиража, затем вызывает calculateVichisliniyaListovListCount().
 * 3. calculateVichisliniyaListovListCount() выполняет локальный расчёт, обновляет интерфейс, отправляет событие и сохраняет данные на сервер.
 * 4. Все кнопки управления удалены – всё происходит автоматически.
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
     * Используется для отображения в интерфейсе.
     * @type {string|null}
     */
    currentPrintComponentNumber: null,

    /**
     * ID просчёта, к которому принадлежит текущий печатный компонент.
     * Нужен для совместимости с другими секциями.
     * @type {string|null}
     */
    currentProschetId: null,

    /**
     * Текущее значение тиража из связанного просчёта.
     * Хранится как число для использования в вычислениях.
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
     * Объект хранит значения, введённые пользователем или загруженные из базы данных.
     * @property {number} vyleta - Вылеты (по умолчанию 1)
     * @property {number} polosa_count - Количество полос (по умолчанию 1)
     * @property {string} color - Цветность (по умолчанию '4+0')
     * @property {number} list_count - Количество листов (вычисляемое значение, по умолчанию 0.00)
     */
    currentParameters: {
        vyleta: 1,
        polosa_count: 1,
        color: '4+0',
        list_count: 0.00
    },

    /**
     * Флаг, указывающий, были ли параметры изменены пользователем.
     * Используется для отслеживания необходимости сохранения.
     * @type {boolean}
     */
    isParametersModified: false,

    // ============================================================================
    // ===== РАЗДЕЛ 2: ОСНОВНЫЕ ФУНКЦИИ ИНИЦИАЛИЗАЦИИ =====
    // ============================================================================

    /**
     * Инициализация секции вычислений листов.
     * Эта функция должна быть вызвана при загрузке страницы.
     * @returns {void}
     */
    init: function() {
        console.log('🚀 Инициализация секции "Вычисления листов" (работа с печатными компонентами)...');
        
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
        console.log('✅ Секция "Вычисления листов" успешно инициализирована для работы с печатными компонентами');
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
     * Для полей ввода добавлены обработчики 'change' (срабатывает при потере фокуса)
     * и 'keypress' для обработки нажатия Enter.
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
                    event.target.blur(); // Потеря фокуса вызовет событие change
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
                this.handleFieldChange(); // сразу после выбора цветности запускаем расчёт
            });
            console.log('✅ Обработчики для поля "Цветность" установлены');
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

        // ------------------------------------------------------------
        // 1. ВЫБОР ПЕЧАТНОГО КОМПОНЕНТА – обновляем секцию данными
        // ------------------------------------------------------------
        document.addEventListener('printComponentSelected', (event) => {
            console.log('📥 Получено событие выбора печатного компонента:', event.detail);
            if (event.detail && event.detail.printComponentId) {
                this.updateFromPrintComponent(event.detail);
            }
        });

        // ------------------------------------------------------------
        // 2. ОТМЕНА ВЫБОРА ПЕЧАТНОГО КОМПОНЕНТА – сбрасываем секцию
        // ------------------------------------------------------------
        document.addEventListener('printComponentDeselected', (event) => {
            console.log('📥 Получено событие отмены выбора печатного компонента:', event.detail);
            this.resetSection();
            this.showNotification('Печатный компонент не выбран. Выберите компонент для расчёта.', 'info');
        });

        // ------------------------------------------------------------
        // 3. ВЫБОР ПРОСЧЁТА (без выбранного компонента) – сбрасываем секцию
        // ------------------------------------------------------------
        document.addEventListener('proschetSelected', (event) => {
            console.log('📥 Получено событие выбора просчёта:', event.detail);
            if (!this.currentPrintComponentId) {
                console.log('⚠️ Выбран просчёт, но печатный компонент не выбран – сбрасываем секцию');
                this.resetSection();
                this.showNotification('Для выполнения вычислений листов выберите печатный компонент в секции "Печатные компоненты"', 'info');
            }
        });

        // ------------------------------------------------------------
        // 4. ОБНОВЛЕНИЕ ТИРАЖА – обновляем отображение и пересчитываем листы
        // ------------------------------------------------------------
        document.addEventListener('productCirculationUpdated', (event) => {
            console.log('📥 Получено событие обновления тиража:', event.detail);
            if (event.detail && event.detail.proschetId === this.currentProschetId) {
                // 1. Обновляем отображение тиража и сохраняем новое значение в this.currentCirculation
                this.updateCirculationDisplay(event.detail.circulation);
                // 2. Запускаем автоматический пересчёт количества листов (если выбран печатный компонент)
                //    Метод handleFieldChange сам проверит наличие компонента и тиража, затем вызовет расчёт и сохранение.
                this.handleFieldChange();
            }
        });

        // ------------------------------------------------------------
        // 5. ОТМЕНА ВЫБОРА ПРОСЧЁТА – сбрасываем секцию
        // ------------------------------------------------------------
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
                this.updateFromPrintComponent({
                    printComponentId: componentId,
                    printComponentNumber: componentNumber,
                    printerName: printerName,
                    paperName: paperName,
                    proschetId: proschetId
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

        this.updateUI(printComponentData);
        this.loadVichisliniyaListovParameters(this.currentPrintComponentId, printComponentData);

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
     * @returns {void}
     */
    loadVichisliniyaListovParameters: function(printComponentId, componentInfo = {}) {
        console.log(`📡 Загрузка параметров вычислений листов для печатного компонента ID: ${printComponentId}...`);
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
            if (!response.ok) {
                throw new Error(`Ошибка HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                console.log('✅ Параметры вычислений листов успешно загружены:', data);
                if (data.circulation) {
                    this.currentCirculation = data.circulation;
                    this.updateCirculationDisplay(data.circulation);
                }
                this.updateVichisliniyaListovParameters(data);
                this.updateVichisliniyaListovUI();
                if (!data.is_default) {
                    this.showSavedData(data);
                }
                if (data.list_count !== undefined) {
                    this.currentParameters.list_count = data.list_count;
                    this.updateResultValue(data.list_count);
                }
                this.isParametersModified = false;
                this.updateProschetInfo(data);
                
                // ===== ИСПРАВЛЕНИЕ: после загрузки параметров пересчитываем количество листов =====
                // Это гарантирует, что отображаемое количество листов будет соответствовать
                // текущему тиражу, даже если тираж изменился с момента последнего сохранения.
                // Метод calculateVichisliniyaListovListCount выполнит расчёт, обновит интерфейс
                // и сохранит актуальное значение на сервер.
                this.calculateVichisliniyaListovListCount();
                
            } else {
                console.error('❌ Ошибка при загрузке параметров:', data.message);
                this.showNotification(`Ошибка: ${data.message}`, 'error');
            }
        })
        .catch(error => {
            console.error('❌ Ошибка сети при загрузке параметров:', error);
            this.showNotification('Ошибка сети при загрузке параметров', 'error');
        });
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
        this.updateResultValue(this.currentParameters.list_count);
        this.updateBreakdownDisplay();
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
        this.updateFormulaDisplay();
    },

    /**
     * Обновление отображения формулы расчёта.
     * @returns {void}
     */
    updateFormulaDisplay: function() {
        console.log('🧮 Обновление отображения формулы расчёта...');
        const formulaElement = document.getElementById('vichisliniya-listov-formula-text');
        if (formulaElement && this.currentCirculation) {
            const formula = `(${this.currentCirculation} / ${this.currentParameters.polosa_count}) + ${this.currentParameters.vyleta}`;
            formulaElement.textContent = formula;
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
            color: this.currentParameters.color
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
     * Обновляет currentParameters и флаг модификации, но не запускает расчёт/сохранение.
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
        this.updateFormulaDisplay();
        // Расчёт и сохранение не вызываем — они произойдут по событию change (потеря фокуса или Enter)
    },

    /**
     * Обработчик изменения поля "Количество полос".
     * Обновляет currentParameters и флаг модификации, но не запускает расчёт/сохранение.
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
        this.updateFormulaDisplay();
    },

    /**
     * Обработчик изменения поля "Цветность".
     * Обновляет currentParameters и флаг модификации.
     * @param {Event} event - Событие изменения поля выбора
     * @returns {void}
     */
    handleColorSelectChange: function(event) {
        console.log('✏️ Изменение поля "Цветность":', event.target.value);
        this.currentParameters.color = event.target.value;
        this.isParametersModified = true;
        const colorElement = document.getElementById('vichisliniya-listov-breakdown-color');
        if (colorElement) colorElement.textContent = event.target.value;
        // Расчёт и сохранение будут вызваны из отдельного обработчика change для select,
        // который вызывает handleFieldChange() после этого метода.
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
        // Если параметры не были изменены, возможно, расчёт уже актуален, но мы всё равно пересчитаем
        this.calculateVichisliniyaListovListCount();
    },

    // ============================================================================
    // ===== РАЗДЕЛ 8: ФУНКЦИИ ВЫЧИСЛЕНИЯ И РАСЧЁТА =====
    // ============================================================================

    /**
     * Вычисление количества листов на основе текущих параметров и тиража (локально).
     * @returns {void}
     */
    calculateVichisliniyaListovListCount: function() {
        console.log('🧮 Вычисление количества листов локально...');

        if (!this.currentCirculation) {
            console.warn('⚠️ Невозможно выполнить расчёт: не указан тираж');
            return;
        }

        const calculated = (this.currentCirculation / this.currentParameters.polosa_count) + this.currentParameters.vyleta;

        this.currentParameters.list_count = calculated;

        const resultData = {
            calculated_list_count: calculated,
            circulation: this.currentCirculation,
            formula: `(${this.currentCirculation} / ${this.currentParameters.polosa_count}) + ${this.currentParameters.vyleta}`,
            vyleta: this.currentParameters.vyleta,
            polosa_count: this.currentParameters.polosa_count,
            color: this.currentParameters.color
        };

        this.updateCalculationResult(resultData);

        if (this.currentPrintComponentId) {
            // Генерируем событие, которое будет обработано в print_components.js
            const event = new CustomEvent('vichisliniyaListovUpdated', {
                detail: {
                    printComponentId: this.currentPrintComponentId,
                    listCount: calculated,
                    timestamp: new Date().toISOString()
                }
            });
            document.dispatchEvent(event);
            console.log(`📤 Событие vichisliniyaListovUpdated отправлено для компонента ${this.currentPrintComponentId}`);
        }

        // После расчёта сразу сохраняем параметры на сервер
        this.saveVichisliniyaListovParameters();

        this.showNotification('Расчёт выполнен успешно', 'success');
    },

    /**
     * Обновление отображения результата расчёта.
     * @param {Object} data - Данные с результатом расчёта (могут быть локальными или с сервера)
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
    // ===== РАЗДЕЛ 9: СБРОС СЕКЦИИ =====
    // ============================================================================

    /**
     * Полный сброс секции "Вычисления листов".
     * @returns {void}
     */
    resetSection: function() {
        console.log('🔄 Сброс секции "Вычисления листов"');

        this.currentPrintComponentId = null;
        this.currentPrintComponentNumber = null;
        this.currentProschetId = null;
        this.currentCirculation = null;
        this.currentProschetTitle = null;
        this.currentPrintComponentInfo = null;
        this.isDataLoaded = false;

        this.resetToDefaults();

        const titleElement = document.getElementById('vichisliniya-listov-proschet-title');
        if (titleElement) {
            titleElement.innerHTML = `<span class="placeholder-text">(печатный компонент не выбран)</span>`;
        }

        this.toggleSectionDisplay(false);
        this.resetPrintComponentInfo();

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
     * Сброс параметров к значениям по умолчанию (используется внутри resetSection).
     * @returns {void}
     */
    resetToDefaults: function() {
        console.log('🔄 Сброс параметров к значениям по умолчанию');
        this.currentParameters = {
            vyleta: 1,
            polosa_count: 1,
            color: '4+0',
            list_count: 0.00
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
    // ===== РАЗДЕЛ 10: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
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
    window.vichisliniyaListov = vichisliniyaListov; // делаем объект глобальным
    console.log('✅ Секция "Вычисления листов" готова к работе с печатными компонентами');
});