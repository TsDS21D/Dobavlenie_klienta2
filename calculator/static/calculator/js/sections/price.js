/*
 * ============================================================================
 * Файл: price.js
 * Назначение: Секция "Цена" – отображает итоговую стоимость заказа с полной
 *             детализацией по каждому печатному компоненту, включая ламинацию
 *             и дополнительные работы.
 *
 * ВЕРСИЯ 4.0 (08.04.2026)
 * ============================================================================
 *
 * НОВЫЕ ФУНКЦИИ:
 * - Отображение общей массы и объёма заказа (данные из секции massa_i_obyom).
 * - Подписка на событие 'massa_i_obyom_updated' для обновления массы/объёма.
 * - При выборе просчёта инициируется пересчёт массы/объёма.
 *
 * ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ – для понимания новичками.
 * ============================================================================
 */

(function() {
    "use strict";

    // ============================================================================
    // 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ (СОСТОЯНИЕ СЕКЦИИ)
    // ============================================================================

    // ID текущего выбранного просчёта (число или null)
    let priceCurrentProschetId = null;

    // Массив печатных компонентов (полный объект с сервера) для текущего просчёта
    // Каждый компонент содержит: id, number, printer_name, paper_name,
    // sheet_count, price_per_sheet, total_circulation_price, cost, markup_percent,
    // profit_per_unit, runs_count, paper_price, printing_mode и т.д.
    let priceCurrentPrintComponents = [];

    // ===== ХРАНЕНИЕ ДОПОЛНИТЕЛЬНЫХ РАБОТ =====
    // Словарь: { component_id: [work1, work2, ...] }
    // Каждая работа – это объект, возвращённый сервером (с полями total_cost, total_price и т.д.)
    let priceAdditionalWorksByComponent = {};

    // ===== ХРАНЕНИЕ ЛАМИНАЦИЙ =====
    // Словарь: { component_id: laminationObject }
    // laminationObject содержит поля: is_enabled, total_price, laminator_price,
    // film_price, sheet_count, laminator_name, film_name, laminator_cost,
    // laminator_markup, laminator_cost_display, laminator_markup_display,
    // laminator_price_display, film_price_display, total_price_display,
    // sheet_count_display.
    // ВАЖНО: запись существует для КАЖДОГО печатного компонента (даже если ламинация выключена).
    let priceLaminationsByComponent = {};

    // ============================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
    // ============================================================================

    // Событие DOMContentLoaded гарантирует, что DOM полностью загружен
    document.addEventListener('DOMContentLoaded', function() {
        console.log('✅ Секция "Цена" загружена (исправленная версия – общая стоимость не зависит от выбранного компонента, добавлены масса и объём)');

        // Проверяем наличие всех необходимых DOM-элементов
        checkDomElements();

        // Настраиваем обработчики событий для кнопок внутри секции
        setupPriceEventListeners();

        // Показываем начальное состояние (сообщение "просчёт не выбран")
        initPriceInterface();

        // Подписываемся на события от других секций
        setupPriceSubscriptions();
    });

    // ============================================================================
    // 3. ПРОВЕРКА DOM-ЭЛЕМЕНТОВ
    // ============================================================================

    /**
     * Проверяет наличие всех критических DOM-элементов, необходимых для работы секции.
     * Если какой-то элемент отсутствует, выводит предупреждение в консоль.
     * Это помогает быстро обнаружить проблемы в вёрстке.
     */
    function checkDomElements() {
        console.log('🔍 Проверка элементов DOM для секции "Цена"...');

        // Список ID элементов, которые должны существовать на странице
        const criticalElements = [
            'price-proschet-title',           // Заголовок с названием просчёта
            'no-proschet-selected-price',     // Сообщение "просчёт не выбран"
            'price-summary-container',        // Основной контейнер с итогами
            'calculate-price-btn',            // Кнопка "Рассчитать"
            'price-components-container',     // Контейнер для списка компонентов
            'total-order-price',              // Элемент с общей стоимостью заказа
            'total-order-cost',               // Элемент с общей себестоимостью
            'total-order-profit',             // Элемент с общей прибылью
            'calculation-date',               // Элемент с датой расчёта
            'total-order-mass',               // НОВЫЙ: элемент с общей массой
            'total-order-volume'              // НОВЫЙ: элемент с общим объёмом
        ];

        // Проходим по каждому ID и проверяем существование элемента
        criticalElements.forEach(id => {
            if (!document.getElementById(id)) {
                console.warn(`❌ Элемент #${id} не найден в DOM!`);
            }
        });
    }

    // ============================================================================
    // 4. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ НА КНОПКИ
    // ============================================================================

    /**
     * Навешивает обработчики событий на кнопки внутри секции.
     * Все обработчики пока являются заглушками (функционал будет добавлен позже).
     */
    function setupPriceEventListeners() {
        // Кнопка "Рассчитать" – принудительно пересчитывает стоимость
        const calculateBtn = document.getElementById('calculate-price-btn');
        if (calculateBtn) {
            calculateBtn.addEventListener('click', handleCalculatePrice);
        }

        // Кнопка "Экспорт в PDF" – заглушка
        const exportBtn = document.getElementById('export-price-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', handleExportPrice);
        }

        // Кнопка "Распечатать" – использует стандартное окно печати браузера
        const printBtn = document.getElementById('print-price-btn');
        if (printBtn) {
            printBtn.addEventListener('click', handlePrintPrice);
        }

        // Кнопка "Создать счёт" – заглушка
        const invoiceBtn = document.getElementById('create-invoice-btn');
        if (invoiceBtn) {
            invoiceBtn.addEventListener('click', handleCreateInvoice);
        }
    }

    // ============================================================================
    // 5. ПОДПИСКА НА СОБЫТИЯ ОТ ДРУГИХ СЕКЦИЙ (ГЛАВНАЯ ИНТЕГРАЦИЯ)
    // ============================================================================

    /**
     * Подписывается на события, генерируемые другими секциями калькулятора.
     * При получении каждого события обновляет соответствующие данные и
     * перерисовывает интерфейс.
     */
    function setupPriceSubscriptions() {
        console.log('📡 Настройка подписок на события...');

        // ------------------------------------------------------------
        // 1. СОБЫТИЕ ОБНОВЛЕНИЯ ДОПОЛНИТЕЛЬНЫХ РАБОТ
        // Генерируется секцией additional_works.js
        // ------------------------------------------------------------
        document.addEventListener('additionalWorksUpdated', function(event) {
            const detail = event.detail;
            if (!detail) return;
            // Проверяем, что событие относится к текущему просчёту
            if (detail.proschetId !== priceCurrentProschetId) return;

            const componentId = detail.componentId;
            const works = detail.works || [];

            // Обновляем словарь: для этого компонента сохраняем новый массив работ
            priceAdditionalWorksByComponent[componentId] = works;

            console.log(`📥 Обновлены дополнительные работы для компонента ${componentId}: ${works.length} работ`);
            renderPriceDisplay(); // полная перерисовка интерфейса
        });

        // ------------------------------------------------------------
        // 2. СОБЫТИЕ ОБНОВЛЕНИЯ ПЕЧАТНЫХ КОМПОНЕНТОВ
        // Генерируется секцией print_components.js
        // ------------------------------------------------------------
        document.addEventListener('printComponentsUpdated', function(event) {
            if (event.detail && event.detail.proschetId === priceCurrentProschetId) {
                priceCurrentPrintComponents = event.detail.components || [];
                renderPriceDisplay(); // полная перерисовка
            }
        });

        // ------------------------------------------------------------
        // 3. СОБЫТИЕ ВЫБОРА ПРОСЧЁТА
        // Генерируется секцией list_proschet.js
        // ------------------------------------------------------------
        document.addEventListener('proschetSelected', function(event) {
            if (event.detail && event.detail.proschetId) {
                // Если выбран новый просчёт (отличный от текущего)
                if (priceCurrentProschetId !== event.detail.proschetId) {
                    priceCurrentProschetId = event.detail.proschetId;
                    // Сбрасываем все словари (будут заполнены при загрузке с сервера)
                    priceCurrentPrintComponents = [];
                    priceAdditionalWorksByComponent = {};
                    priceLaminationsByComponent = {};
                    // Загружаем данные с сервера для нового просчёта
                    loadPriceData(priceCurrentProschetId);

                    // ===== НОВОЕ: инициируем пересчёт массы и объёма =====
                    if (window.massa_i_obyom && typeof window.massa_i_obyom.recalculate === 'function') {
                        console.log('🔄 Запуск пересчёта массы и объёма для просчёта', priceCurrentProschetId);
                        window.massa_i_obyom.recalculate();
                    } else {
                        console.warn('⚠️ Секция "Масса и объём" не найдена или не инициализирована');
                    }
                }
            }
        });

        // ------------------------------------------------------------
        // 4. СОБЫТИЕ ОБНОВЛЕНИЯ ЛАМИНАЦИИ
        // Генерируется секцией lamination.js
        // ИСПРАВЛЕНИЕ: обновляем ламинацию для указанного component_id,
        // но НЕ УДАЛЯЕМ запись, даже если ламинация выключена.
        // Это гарантирует, что словарь всегда содержит запись для каждого компонента.
        // ------------------------------------------------------------
        document.addEventListener('laminationUpdated', function(event) {
            const detail = event.detail;
            if (!detail) return;
            const componentId = detail.componentId;
            if (!componentId) return;

            // Сохраняем (или обновляем) ламинацию для этого компонента
            // В detail содержится флаг is_enabled. Если ламинация выключена,
            // мы всё равно сохраняем запись, но при расчёте общей стоимости
            // будем проверять is_enabled.
            priceLaminationsByComponent[componentId] = detail;

            console.log(`📥 Обновлена ламинация для компонента ${componentId}, enabled=${detail.is_enabled}`);
            renderPriceDisplay(); // полная перерисовка интерфейса
        });

        // ------------------------------------------------------------
        // 5. СОБЫТИЕ ОБНОВЛЕНИЯ ТИРАЖА – перезагружаем все данные
        // ------------------------------------------------------------
        document.addEventListener('productCirculationSaved', function(event) {
            if (event.detail && event.detail.proschetId === priceCurrentProschetId) {
                // Тираж изменился – перезагружаем все данные с сервера
                loadPriceData(priceCurrentProschetId);
                // Также обновляем массу/объём
                if (window.massa_i_obyom && typeof window.massa_i_obyom.recalculate === 'function') {
                    window.massa_i_obyom.recalculate();
                }
            }
        });

        // ===== НОВОЕ: 6. СОБЫТИЕ ОБНОВЛЕНИЯ МАССЫ И ОБЪЁМА =====
        document.addEventListener('massa_i_obyom_updated', function(event) {
            const detail = event.detail;
            if (!detail) return;
            console.log(`📥 Получены данные массы/объёма: масса=${detail.totalMass} г, объём=${detail.totalVolume} см³`);
            updateMassAndVolumeDisplay(detail.totalMass, detail.totalVolume);
        });
    }

    // ============================================================================
    // 6. ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ МАССЫ И ОБЪЁМА
    // ============================================================================

    /**
     * Обновляет поля общей массы и объёма в секции "Цена".
     * @param {number} totalMassGrams - Общая масса в граммах
     * @param {number} totalVolumeCm3 - Общий объём в кубических сантиметрах
     */
    function updateMassAndVolumeDisplay(totalMassGrams, totalVolumeCm3) {
        const massElement = document.getElementById('total-order-mass');
        const volumeElement = document.getElementById('total-order-volume');

        // Форматирование массы: всегда в килограммах с 3 знаками
        const massKg = totalMassGrams / 1000;
        if (massElement) massElement.textContent = `${massKg.toFixed(3)} кг`;

        // Форматирование объёма: всегда в литрах с 3 знаками
        const volumeLiters = totalVolumeCm3 / 1000;
        if (volumeElement) volumeElement.textContent = `${volumeLiters.toFixed(3)} л`;
    }

    // ============================================================================
    // 7. ИНИЦИАЛИЗАЦИЯ ИНТЕРФЕЙСА
    // ============================================================================

    /**
     * Показывает начальное состояние секции (сообщение "просчёт не выбран").
     * Скрывает контейнер с итогами и кнопку "Рассчитать".
     */
    function initPriceInterface() {
        showNoProschetSelectedMessage();
    }

    /**
     * Показывает сообщение о том, что просчёт не выбран.
     * Скрывает все остальные элементы интерфейса.
     */
    function showNoProschetSelectedMessage() {
        const noProschetMsg = document.getElementById('no-proschet-selected-price');
        const priceContainer = document.getElementById('price-summary-container');
        const calculateBtn = document.getElementById('calculate-price-btn');
        const componentsContainer = document.getElementById('price-components-container');

        if (noProschetMsg) noProschetMsg.style.display = 'block';
        if (priceContainer) priceContainer.style.display = 'none';
        if (calculateBtn) calculateBtn.style.display = 'none';
        if (componentsContainer) componentsContainer.innerHTML = '';

        const proschetTitleElement = document.getElementById('price-proschet-title');
        if (proschetTitleElement) {
            proschetTitleElement.innerHTML = '<span class="placeholder-text">(просчёт не выбран)</span>';
        }

        // Сбрасываем глобальные переменные
        priceCurrentProschetId = null;
        priceCurrentPrintComponents = [];
        priceAdditionalWorksByComponent = {};
        priceLaminationsByComponent = {};

        // Обнуляем массу и объём
        updateMassAndVolumeDisplay(0, 0);
    }

    /**
     * Показывает контейнер с итогами (когда просчёт выбран).
     */
    function showPriceSummaryContainer() {
        const noProschetMsg = document.getElementById('no-proschet-selected-price');
        const priceContainer = document.getElementById('price-summary-container');

        if (noProschetMsg) noProschetMsg.style.display = 'none';
        if (priceContainer) priceContainer.style.display = 'block';
    }

    // ============================================================================
    // 8. ЗАГРУЗКА ДАННЫХ С СЕРВЕРА
    // ============================================================================

    /**
     * Загружает все данные для расчёта цены с сервера.
     * @param {number} proschetId - ID просчёта
     */
    function loadPriceData(proschetId) {
        console.log(`Загрузка данных для расчёта цены, просчёт ID: ${proschetId}`);
        showPriceLoadingState();
        fetchPriceDataFromServer(proschetId);
    }

    /**
     * Выполняет AJAX-запрос к серверу для получения данных просчёта.
     * @param {number} proschetId - ID просчёта
     */
    function fetchPriceDataFromServer(proschetId) {
        const url = `/calculator/get-proschet-price-data/${proschetId}/`;

        fetch(url, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getPriceCsrfToken()
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ошибка! статус: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Сохраняем печатные компоненты
                priceCurrentPrintComponents = data.print_components || [];

                // ===== ИНИЦИАЛИЗИРУЕМ СЛОВАРЬ ДОПОЛНИТЕЛЬНЫХ РАБОТ =====
                priceAdditionalWorksByComponent = {};
                if (data.additional_works && Array.isArray(data.additional_works)) {
                    data.additional_works.forEach(work => {
                        const compId = work.component_id;
                        if (!priceAdditionalWorksByComponent[compId]) {
                            priceAdditionalWorksByComponent[compId] = [];
                        }
                        priceAdditionalWorksByComponent[compId].push(work);
                    });
                }

                // ===== ИНИЦИАЛИЗИРУЕМ СЛОВАРЬ ЛАМИНАЦИЙ =====
                // ИСПРАВЛЕНИЕ: теперь сервер возвращает данные для ВСЕХ компонентов
                // (включая выключенную ламинацию). Мы сохраняем ВСЕ записи.
                priceLaminationsByComponent = {};
                if (data.laminations && Array.isArray(data.laminations)) {
                    data.laminations.forEach(lam => {
                        if (lam && lam.component_id) {
                            // Сохраняем запись для компонента (даже если is_enabled === false)
                            priceLaminationsByComponent[lam.component_id] = lam;
                        }
                    });
                }

                console.log(`✅ Данные загружены: ${priceCurrentPrintComponents.length} компонентов, ` +
                           `работ по компонентам: ${Object.keys(priceAdditionalWorksByComponent).length}, ` +
                           `ламинаций: ${Object.keys(priceLaminationsByComponent).length}`);

                // Показываем контейнер с итогами
                showPriceSummaryContainer();

                // Обновляем дату расчёта
                updateCalculationDate();

                // Отображаем данные
                renderPriceDisplay();

                // Показываем кнопку "Рассчитать"
                showCalculateButton(true);
            } else {
                console.error('Ошибка загрузки данных:', data.message);
                showPriceErrorMessage('Не удалось загрузить данные для расчёта');
            }
        })
        .catch(error => {
            console.error('Ошибка сети:', error);
            showPriceErrorMessage('Ошибка сети при загрузке данных');
        });
    }

    // ============================================================================
    // 9. ОСНОВНАЯ ФУНКЦИЯ ОТОБРАЖЕНИЯ (ГЛАВНАЯ)
    // ============================================================================

    /**
     * Главная функция рендеринга. Собирает все данные и отображает их в интерфейсе.
     * ВАЖНО: не зависит от выбранного компонента – отображаются ВСЕ компоненты просчёта.
     */
    function renderPriceDisplay() {
        // Если просчёт не выбран, ничего не делаем
        if (!priceCurrentProschetId) return;

        // Получаем контейнер для компонентов
        const container = document.getElementById('price-components-container');
        if (!container) return;

        // Очищаем контейнер
        container.innerHTML = '';

        // Если нет компонентов – показываем сообщение
        if (priceCurrentPrintComponents.length === 0) {
            container.innerHTML = `
                <div class="category-empty">
                    <i class="fas fa-info-circle"></i>
                    <p>В просчёте нет печатных компонентов</p>
                </div>
            `;
            // Обновляем итоговые суммы (будут 0)
            updateTotalOrderPrice();
            updateTotalCostAndProfit();
            return;
        }

        // Перебираем ВСЕ печатные компоненты (независимо от выбранного в таблице)
        for (const component of priceCurrentPrintComponents) {
            // Берём ламинацию для ЭТОГО компонента из словаря (если есть)
            // Если записи нет (что не должно происходить после исправления на сервере),
            // создаём фиктивную выключенную ламинацию.
            const laminationData = priceLaminationsByComponent[component.id];
            // если данных нет – ламинация отсутствует, ничего не делаем

            // Берём дополнительные работы для ЭТОГО компонента из словаря (если есть)
            const componentWorks = priceAdditionalWorksByComponent[component.id] || [];

            // Создаём карточку компонента
            const componentCard = createComponentCard(component, laminationData, componentWorks);
            container.appendChild(componentCard);
        }

        // Обновляем итоговые суммы (общая стоимость, себестоимость, прибыль)
        updateTotalOrderPrice();
        updateTotalCostAndProfit();
    }

    // ============================================================================
    // 10. СОЗДАНИЕ КАРТОЧКИ ПЕЧАТНОГО КОМПОНЕНТА
    // ============================================================================

    /**
     * Создаёт DOM-элемент карточки для одного печатного компонента.
     * @param {Object} component - Данные печатного компонента
     * @param {Object} laminationData - Данные ламинации (всегда есть, может быть выключена)
     * @param {Array} works - Массив дополнительных работ для этого компонента
     * @returns {HTMLElement} DOM-элемент карточки компонента
     */
    function createComponentCard(component, laminationData, works) {
        // Создаём основной контейнер карточки
        const card = document.createElement('div');
        card.className = 'price-component-card';
        card.dataset.componentId = component.id;

        // ===== 1. ЗАГОЛОВОК КОМПОНЕНТА =====
        const header = createComponentHeader(component);
        card.appendChild(header);

        // ===== 2. БЛОК ПЕЧАТИ =====
        const printBlock = createPrintBlock(component);
        card.appendChild(printBlock);

        // ===== 3. БЛОК ЛАМИНАЦИИ (только если включена) =====
        // ИСПРАВЛЕНИЕ: проверяем флаг is_enabled. Если ламинация выключена – не показываем блок.
        if (laminationData && laminationData.is_enabled === true) {
            const laminationBlock = createLaminationBlock(laminationData);
            card.appendChild(laminationBlock);
        }

        // ===== 4. БЛОК ДОПОЛНИТЕЛЬНЫХ РАБОТ (если есть) =====
        if (works && works.length > 0) {
            const worksBlock = createWorksBlock(works);
            card.appendChild(worksBlock);
        }

        // ===== 5. ИТОГИ ПО КОМПОНЕНТУ =====
        const componentTotal = createComponentTotal(component, laminationData, works);
        card.appendChild(componentTotal);

        return card;
    }

    /**
     * Создаёт заголовок карточки компонента.
     * @param {Object} component - Данные печатного компонента
     * @returns {HTMLElement} DOM-элемент заголовка
     */
    function createComponentHeader(component) {
        const header = document.createElement('div');
        header.className = 'component-card-header';

        // Формируем название компонента
        const componentNumber = escapeHtml(component.number || 'Без номера');
        const printerName = escapeHtml(component.printer_name || 'Принтер не выбран');
        const paperName = escapeHtml(component.paper_name || 'Бумага не выбрана');

        header.innerHTML = `
            <div class="component-header-left">
                <i class="fas fa-print"></i>
                <span class="component-number">${componentNumber}</span>
                <span class="component-printer">(${printerName})</span>
                <span class="component-paper">- ${paperName}</span>
            </div>
            <div class="component-header-right">
                <span class="component-sheet-count" title="Количество листов">
                    <i class="fas fa-copy"></i> ${formatSheetCount(component.sheet_count)}
                </span>
                <span class="component-runs-count" title="Количество прогонов принтера">
                    <i class="fas fa-sync-alt"></i> ${component.runs_count || 0}
                </span>
            </div>
        `;
        return header;
    }

    /**
     * Создаёт блок с данными о печати (себестоимость, прибыль, цена).
     * @param {Object} component - Данные печатного компонента
     * @returns {HTMLElement} DOM-элемент блока печати
     */
    function createPrintBlock(component) {
        const block = document.createElement('div');
        block.className = 'component-print-block';

        // Извлекаем нужные значения
        const sheetCount = parseFloat(component.sheet_count) || 0;
        const runsCount = parseInt(component.runs_count, 10) || 0;
        const paperPrice = parseFloat(component.paper_price) || 0;
        const costPerUnit = parseFloat(component.cost) || 0;
        const pricePerUnit = parseFloat(component.price_per_sheet) || 0;

        // Рассчитываем себестоимость печати для всего тиража
        // Формула: (себестоимость за лист × количество прогонов) + (цена бумаги за лист × количество листов)
        const printCost = costPerUnit * runsCount;
        const materialCost = paperPrice * sheetCount;
        const totalCost = printCost + materialCost;

        // Рассчитываем общую стоимость печати для всего тиража
        const totalPrice = parseFloat(component.total_circulation_price) || 0;

        // Рассчитываем прибыль = стоимость - себестоимость
        const profit = totalPrice - totalCost;

        block.innerHTML = `
            <div class="block-title">
                <i class="fas fa-print"></i> Печать
                <small class="block-subtitle">(Цена печати за лист: ${pricePerUnit.toFixed(2)} ₽)</small>
            </div>
            <div class="block-row">
                <div class="block-label">Себестоимость печати:</div>
                <div class="block-value cost-value">${totalCost.toFixed(2)} ₽</div>
            </div>
            <div class="block-row">
                <div class="block-label">Прибыль от печати:</div>
                <div class="block-value profit-value">${profit.toFixed(2)} ₽</div>
            </div>
            <div class="block-row">
                <div class="block-label">Стоимость печати:</div>
                <div class="block-value price-value">${totalPrice.toFixed(2)} ₽</div>
            </div>
            <div class="block-details">
                <small>
                    Расчёт: (${costPerUnit.toFixed(2)} руб./лист × ${runsCount} прогонов) + 
                    (${paperPrice.toFixed(2)} руб./бумага × ${sheetCount.toFixed(2)} листов)
                </small>
            </div>
        `;
        return block;
    }

    /**
     * Создаёт блок с данными о ламинации (только если is_enabled === true).
     * @param {Object} lamination - Данные ламинации
     * @returns {HTMLElement} DOM-элемент блока ламинации
     */
    function createLaminationBlock(lamination) {
        const block = document.createElement('div');
        block.className = 'component-lamination-block';

        // Извлекаем данные
        const laminatorName = escapeHtml(lamination.laminator_name || 'Не выбран');
        const filmName = escapeHtml(lamination.film_name || 'Не выбрана');
        const sheetCount = parseFloat(lamination.sheet_count) || 0;
        const laminatorCost = parseFloat(lamination.laminator_cost) || 0;
        const laminatorPrice = parseFloat(lamination.laminator_price) || 0;
        const filmPrice = parseFloat(lamination.film_price) || 0;
        const totalPrice = parseFloat(lamination.total_price) || 0;

        // Рассчитываем себестоимость ламинации: (себестоимость ламинатора + цена плёнки) × количество листов
        const totalCost = (laminatorCost + filmPrice) * sheetCount;
        const profit = totalPrice - totalCost;

        block.innerHTML = `
            <div class="block-title">
                <i class="fas fa-layer-group"></i> Ламинация
                <small class="block-subtitle">(${laminatorName} + ${filmName})</small>
            </div>
            <div class="block-row">
                <div class="block-label">Себестоимость ламинации:</div>
                <div class="block-value cost-value">${totalCost.toFixed(2)} ₽</div>
            </div>
            <div class="block-row">
                <div class="block-label">Прибыль от ламинации:</div>
                <div class="block-value profit-value">${profit.toFixed(2)} ₽</div>
            </div>
            <div class="block-row">
                <div class="block-label">Стоимость ламинации:</div>
                <div class="block-value price-value">${totalPrice.toFixed(2)} ₽</div>
            </div>
            <div class="block-details">
                <small>
                    Расчёт: (${laminatorCost.toFixed(2)} руб./лист + ${filmPrice.toFixed(2)} руб./лист) × ${sheetCount.toFixed(2)} листов
                </small>
            </div>
        `;
        return block;
    }

    /**
     * Создаёт блок со списком дополнительных работ.
     * @param {Array} works - Массив дополнительных работ
     * @returns {HTMLElement} DOM-элемент блока дополнительных работ
     */
    function createWorksBlock(works) {
        const block = document.createElement('div');
        block.className = 'component-works-block';

        // Заголовок блока
        const title = document.createElement('div');
        title.className = 'block-title';
        title.innerHTML = `<i class="fas fa-tools"></i> Дополнительные работы (${works.length})`;
        block.appendChild(title);

        // Таблица для отображения работ
        const table = document.createElement('table');
        table.className = 'works-table';

        // Заголовки таблицы
        table.innerHTML = `
            <thead>
                <tr>
                    <th>№</th>
                    <th>Название работы</th>
                    <th>Себестоимость</th>
                    <th>Наценка</th>
                    <th>Цена за ед.</th>
                    <th>Прибыль за ед.</th>
                    <th>Кол-во</th>
                    <th>Общая себестоимость</th>
                    <th>Общая прибыль</th>
                    <th>Общая стоимость</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        let totalCostSum = 0;
        let totalPriceSum = 0;

        // Заполняем строки таблицы
        for (const work of works) {
            const totalCost = parseFloat(work.total_cost) || 0;
            const totalPrice = parseFloat(work.total_price) || 0;
            const profit = totalPrice - totalCost;
            const profitPerUnit = parseFloat(work.profit_per_unit) || 0;
            const effectivePrice = parseFloat(work.effective_price) || 0;
            const cost = parseFloat(work.cost) || 0;
            const markup = parseFloat(work.markup_percent) || 0;
            const quantity = work.quantity || 1;

            totalCostSum += totalCost;
            totalPriceSum += totalPrice;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="work-number">${escapeHtml(work.number || '—')}<\/td>
                <td class="work-title" title="${escapeHtml(work.title || '')}">${escapeHtml(work.title || '—')}<\/td>
                <td class="work-cost">${cost.toFixed(2)} ₽<\/td>
                <td class="work-markup">${markup}%<\/td>
                <td class="work-price">${effectivePrice.toFixed(2)} ₽<\/td>
                <td class="work-profit-per-unit">${profitPerUnit.toFixed(2)} ₽<\/td>
                <td class="work-quantity">${quantity}<\/td>
                <td class="work-total-cost">${totalCost.toFixed(2)} ₽<\/td>
                <td class="work-total-profit">${profit.toFixed(2)} ₽<\/td>
                <td class="work-total-price">${totalPrice.toFixed(2)} ₽<\/td>
            `;
            tbody.appendChild(row);
        }

        block.appendChild(table);

        // Итоги по дополнительным работам
        const summary = document.createElement('div');
        summary.className = 'works-summary';
        summary.innerHTML = `
            <div class="summary-row">
                <span class="summary-label">Итого по дополнительным работам:</span>
                <div class="summary-values">
                    <span class="summary-cost">Себестоимость: ${totalCostSum.toFixed(2)} ₽</span>
                    <span class="summary-profit">Прибыль: ${(totalPriceSum - totalCostSum).toFixed(2)} ₽</span>
                    <span class="summary-price">Стоимость: ${totalPriceSum.toFixed(2)} ₽</span>
                </div>
            </div>
        `;
        block.appendChild(summary);

        return block;
    }

    /**
     * Создаёт блок с итоговыми суммами по компоненту.
     * @param {Object} component - Данные печатного компонента
     * @param {Object} laminationData - Данные ламинации (может быть выключена)
     * @param {Array} works - Массив дополнительных работ
     * @returns {HTMLElement} DOM-элемент итогов по компоненту
     */
    function createComponentTotal(component, laminationData, works) {
        const totalBlock = document.createElement('div');
        totalBlock.className = 'component-total-block';

        // Считаем итоговую стоимость компонента (печать)
        let totalPrice = parseFloat(component.total_circulation_price) || 0;
        let totalCost = 0;

        // Добавляем себестоимость печати
        const sheetCount = parseFloat(component.sheet_count) || 0;
        const runsCount = parseInt(component.runs_count, 10) || 0;
        const paperPrice = parseFloat(component.paper_price) || 0;
        const costPerUnit = parseFloat(component.cost) || 0;
        totalCost = (costPerUnit * runsCount) + (paperPrice * sheetCount);

        // Добавляем ламинацию (только если включена)
        if (laminationData && laminationData.is_enabled === true) {
            totalPrice += parseFloat(laminationData.total_price) || 0;
            const laminatorCost = parseFloat(laminationData.laminator_cost) || 0;
            const filmPrice = parseFloat(laminationData.film_price) || 0;
            const lamSheetCount = parseFloat(laminationData.sheet_count) || 0;
            totalCost += (laminatorCost + filmPrice) * lamSheetCount;
        }

        // Добавляем дополнительные работы
        for (const work of works) {
            totalPrice += parseFloat(work.total_price) || 0;
            totalCost += parseFloat(work.total_cost) || 0;
        }

        const profit = totalPrice - totalCost;

        totalBlock.innerHTML = `
            <div class="total-row-compact">
                <div class="total-label">Итого по компоненту:</div>
                <div class="total-values">
                    <span class="total-cost">Себестоимость: ${totalCost.toFixed(2)} ₽</span>
                    <span class="total-profit">Прибыль: ${profit.toFixed(2)} ₽</span>
                    <span class="total-price">Стоимость: ${totalPrice.toFixed(2)} ₽</span>
                </div>
            </div>
        `;
        return totalBlock;
    }

    // ============================================================================
    // 11. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ФОРМАТИРОВАНИЯ И РАСЧЁТОВ
    // ============================================================================

    /**
     * Форматирует количество листов с пробелами как разделителями тысяч.
     * @param {number|string} sheetCount - Количество листов
     * @returns {string} Отформатированная строка
     */
    function formatSheetCount(sheetCount) {
        const num = parseFloat(sheetCount);
        if (isNaN(num) || num === 0) return '0.00';
        return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    /**
     * Рассчитывает общую себестоимость заказа.
     * Суммирует себестоимость печатных компонентов, ламинации (только включённой) и дополнительных работ.
     * @returns {number} Общая себестоимость
     */
    function calculateTotalCost() {
        let totalCost = 0;

        // 1. Себестоимость печатных компонентов
        for (const component of priceCurrentPrintComponents) {
            const sheetCount = parseFloat(component.sheet_count) || 0;
            const runsCount = parseInt(component.runs_count, 10) || 0;
            const paperPrice = parseFloat(component.paper_price) || 0;
            const costPerUnit = parseFloat(component.cost) || 0;
            totalCost += (costPerUnit * runsCount) + (paperPrice * sheetCount);
        }

        // 2. Себестоимость ламинации (только включённой)
        for (const compId in priceLaminationsByComponent) {
            const lam = priceLaminationsByComponent[compId];
            // ИСПРАВЛЕНИЕ: проверяем is_enabled
            if (lam && lam.is_enabled === true) {
                const laminatorCost = parseFloat(lam.laminator_cost) || 0;
                const filmPrice = parseFloat(lam.film_price) || 0;
                const sheetCount = parseFloat(lam.sheet_count) || 0;
                totalCost += (laminatorCost + filmPrice) * sheetCount;
            }
        }

        // 3. Себестоимость дополнительных работ
        for (const compId in priceAdditionalWorksByComponent) {
            const works = priceAdditionalWorksByComponent[compId];
            for (const work of works) {
                totalCost += parseFloat(work.total_cost) || 0;
            }
        }

        return totalCost;
    }

    /**
     * Рассчитывает общую стоимость заказа.
     * Суммирует стоимость печатных компонентов, ламинации (только включённой) и дополнительных работ.
     * @returns {number} Общая стоимость
     */
    function calculateTotalPrice() {
        let total = 0;

        // 1. Стоимость печатных компонентов
        for (const component of priceCurrentPrintComponents) {
            total += parseFloat(component.total_circulation_price) || 0;
        }

        // 2. Стоимость ламинации (только включённой)
        for (const compId in priceLaminationsByComponent) {
            const lam = priceLaminationsByComponent[compId];
            if (lam && lam.is_enabled === true) {
                total += parseFloat(lam.total_price) || 0;
            }
        }

        // 3. Стоимость дополнительных работ
        for (const compId in priceAdditionalWorksByComponent) {
            const works = priceAdditionalWorksByComponent[compId];
            for (const work of works) {
                total += parseFloat(work.total_price) || 0;
            }
        }

        return total;
    }

    /**
     * Рассчитывает общую прибыль заказа (общая стоимость - общая себестоимость).
     * @returns {number} Общая прибыль
     */
    function calculateTotalProfit() {
        return calculateTotalPrice() - calculateTotalCost();
    }

    /**
     * Обновляет отображение общей стоимости заказа.
     */
    function updateTotalOrderPrice() {
        const totalElement = document.getElementById('total-order-price');
        if (!totalElement) return;
        const total = calculateTotalPrice();
        totalElement.textContent = `${total.toFixed(2)} ₽`;
        console.log(`💰 Общая стоимость заказа: ${total.toFixed(2)} ₽`);
    }

    /**
     * Обновляет отображение общей себестоимости и общей прибыли.
     */
    function updateTotalCostAndProfit() {
        const totalCostElement = document.getElementById('total-order-cost');
        const totalProfitElement = document.getElementById('total-order-profit');
        const totalCost = calculateTotalCost();
        const totalProfit = calculateTotalProfit();
        if (totalCostElement) totalCostElement.textContent = `${totalCost.toFixed(2)} ₽`;
        if (totalProfitElement) totalProfitElement.textContent = `${totalProfit.toFixed(2)} ₽`;
        console.log(`💰 Общая себестоимость: ${totalCost.toFixed(2)} ₽, Общая прибыль: ${totalProfit.toFixed(2)} ₽`);
    }

    /**
     * Обновляет дату расчёта на текущую.
     */
    function updateCalculationDate() {
        const dateElement = document.getElementById('calculation-date');
        if (dateElement) {
            const now = new Date();
            const day = now.getDate().toString().padStart(2, '0');
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const year = now.getFullYear();
            dateElement.textContent = `${day}.${month}.${year}`;
        }
    }

    // ============================================================================
    // 12. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ UI (ЗАГРУЗКА, ОШИБКИ, УВЕДОМЛЕНИЯ)
    // ============================================================================

    /**
     * Показывает индикатор загрузки в контейнере компонентов.
     */
    function showPriceLoadingState() {
        const container = document.getElementById('price-components-container');
        if (container) {
            container.innerHTML = `
                <div class="category-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Загрузка данных...</p>
                </div>
            `;
        }
    }

    /**
     * Показывает сообщение об ошибке загрузки данных.
     * @param {string} message - Текст ошибки
     */
    function showPriceErrorMessage(message) {
        const container = document.getElementById('price-components-container');
        if (container) {
            container.innerHTML = `
                <div class="price-error">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <h3>Ошибка загрузки данных</h3>
                    <p>${escapeHtml(message)}</p>
                    <button type="button" id="retry-price-load-btn" class="btn-action">
                        <i class="fas fa-redo"></i> Повторить попытку
                    </button>
                </div>
            `;
            const retryBtn = document.getElementById('retry-price-load-btn');
            if (retryBtn && priceCurrentProschetId) {
                retryBtn.addEventListener('click', () => loadPriceData(priceCurrentProschetId));
            }
        }
    }

    /**
     * Показывает или скрывает кнопку "Рассчитать".
     * @param {boolean} show - true – показать, false – скрыть
     */
    function showCalculateButton(show) {
        const calculateBtn = document.getElementById('calculate-price-btn');
        if (calculateBtn) {
            calculateBtn.style.display = show ? 'inline-block' : 'none';
        }
    }

    /**
     * Обработчик кнопки "Рассчитать" – принудительно пересчитывает и отображает стоимость.
     */
    function handleCalculatePrice() {
        console.log('🧮 Принудительный перерасчёт стоимости');
        renderPriceDisplay();
        showPriceNotification('Стоимость пересчитана', 'success');
        // Также пересчитываем массу и объём
        if (window.massa_i_obyom && typeof window.massa_i_obyom.recalculate === 'function') {
            window.massa_i_obyom.recalculate();
        }
    }

    /**
     * Обработчик кнопки "Экспорт в PDF" (заглушка).
     */
    function handleExportPrice() {
        showPriceNotification('Экспорт в PDF будет реализован позже', 'info');
    }

    /**
     * Обработчик кнопки "Распечатать" – открывает стандартное окно печати браузера.
     */
    function handlePrintPrice() {
        window.print();
    }

    /**
     * Обработчик кнопки "Создать счёт" (заглушка).
     */
    function handleCreateInvoice() {
        showPriceNotification('Создание счета будет реализовано позже', 'info');
    }

    // ============================================================================
    // 13. ФУНКЦИИ ДЛЯ РАБОТЫ С CSRF-ТОКЕНОМ И УВЕДОМЛЕНИЯМИ
    // ============================================================================

    /**
     * Получает CSRF-токен из cookies.
     * @returns {string} CSRF-токен или пустая строка
     */
    function getPriceCsrfToken() {
        const name = 'csrftoken';
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(name + '=')) {
                return decodeURIComponent(cookie.substring(name.length + 1));
            }
        }
        console.warn('⚠️ CSRF-токен не найден');
        return '';
    }

    /**
     * Показывает всплывающее уведомление.
     * @param {string} message - Текст сообщения
     * @param {string} type - Тип: 'success', 'error', 'warning', 'info'
     */
    function showPriceNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `price-notification notification-${type}`;

        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        if (type === 'warning') icon = 'exclamation-triangle';

        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${icon}"></i>
                <span>${escapeHtml(message)}</span>
            </div>
            <button type="button" class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        document.body.appendChild(notification);

        // Анимация появления
        setTimeout(() => notification.classList.add('show'), 10);

        // Закрытие по кнопке
        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            });
        }

        // Автоматическое закрытие через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    /**
     * Экранирует HTML-символы в строке (защита от XSS).
     * @param {string} text - Исходный текст
     * @returns {string} Экранированный текст
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ============================================================================
    // 14. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ
    // ============================================================================

    // Делаем объект priceSection доступным глобально, чтобы другие секции могли
    // вызывать его методы (например, при принудительном обновлении)
    window.priceSection = {
        // Обновляет секцию для выбранного просчёта
        updateForProschet: function(proschetId, rowElement) {
            priceCurrentProschetId = proschetId;
            updateCalculationDate();

            // Обновляем заголовок с названием просчёта
            const titleCell = rowElement.querySelector('.proschet-title');
            const title = titleCell ? titleCell.textContent.trim() : '';
            const titleElement = document.getElementById('price-proschet-title');
            if (titleElement) {
                titleElement.innerHTML = `<span class="proschet-title-active">${escapeHtml(title)}</span>`;
            }

            showPriceSummaryContainer();
            loadPriceData(proschetId);

            // Запускаем пересчёт массы и объёма
            if (window.massa_i_obyom && typeof window.massa_i_obyom.recalculate === 'function') {
                window.massa_i_obyom.recalculate();
            }
        },

        // Сбрасывает секцию (показывает сообщение "просчёт не выбран")
        reset: showNoProschetSelectedMessage,

        // Возвращает ID текущего просчёта
        getCurrentProschetId: () => priceCurrentProschetId,

        // Принудительно обновляет данные (перезагружает с сервера)
        refresh: function() {
            if (priceCurrentProschetId) {
                loadPriceData(priceCurrentProschetId);
                if (window.massa_i_obyom && typeof window.massa_i_obyom.recalculate === 'function') {
                    window.massa_i_obyom.recalculate();
                }
            }
        }
    };

    console.log('✅ Секция "Цена" полностью обновлена: общая стоимость заказа теперь НЕ ЗАВИСИТ от выбранного компонента, ламинация отображается для всех компонентов просчёта (только включённая учитывается в сумме), добавлены масса и объём');
})();