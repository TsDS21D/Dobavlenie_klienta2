/* 
sections/price.js - JavaScript для секции "Цена"
ОБНОВЛЕНО:
- Исправлена ошибка "toFixed is not a function" – теперь все числовые поля явно преобразуются в числа с помощью parseFloat().
- Добавлен блок итогов для печатных компонентов с тремя значениями:
  общая себестоимость, общая прибыль, общая стоимость.
- Обновлены функции updatePrintComponentsDetails, calculatePrintComponentsTotals,
  updatePrintComponentsTotalsDisplay.
*/

(function() {
    "use strict";

    // ============================================================================
    // 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ СЕКЦИИ (хранят текущее состояние)
    // ============================================================================

    let priceCurrentProschetId = null;          // ID текущего выбранного просчёта
    let priceCurrentPrintComponents = [];       // Массив данных печатных компонентов (с сервера)
    let priceCurrentAdditionalWorks = [];       // Массив данных дополнительных работ (с сервера)
    let priceCurrentLamination = []; 

    // ============================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
    // ============================================================================

    document.addEventListener('DOMContentLoaded', function() {
        console.log('✅ Секция "Цена" загружена');
        
        // 1. Проверяем наличие всех критических элементов DOM
        checkDomElements();
        
        // 2. Настраиваем обработчики событий на кнопки внутри секции
        setupPriceEventListeners();
        
        // 3. Устанавливаем начальное состояние интерфейса (показываем сообщение "просчёт не выбран")
        initPriceInterface();
        
        // 4. Подписываемся на события от других секций
        setupPriceSubscriptions();
    });

    // ============================================================================
    // 2.1. ФУНКЦИЯ ПРОВЕРКИ ЭЛЕМЕНТОВ DOM (для отладки)
    // ============================================================================

    function checkDomElements() {
        console.log('🔍 Проверка элементов DOM для секции "Цена"...');
        const criticalElements = [
            'price-proschet-title',
            'no-proschet-selected-price',
            'price-summary-container',
            'calculate-price-btn',
            'print-components-count',
            'print-components-items',
            'print-components-total-container',
            'print-components-total-cost',
            'print-components-total-profit',
            'print-components-total-price',
            'additional-works-count',
            'additional-works-items',
            'additional-works-total-container',
            'additional-works-total-cost',
            'additional-works-total-profit',
            'additional-works-total-price',
            'total-order-price',
            'calculation-date',
            'export-price-btn',
            'print-price-btn',
            'create-invoice-btn',
            'print-components-headers'
        ];
        
        let missingElements = [];
        criticalElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (!element) {
                missingElements.push(elementId);
                console.warn(`❌ Элемент #${elementId} не найден в DOM`);
            } else {
                console.log(`✅ Элемент #${elementId} найден`);
            }
        });
        
        if (missingElements.length > 0) {
            console.error(`⚠️ Обнаружены отсутствующие элементы: ${missingElements.join(', ')}`);
        } else {
            console.log('✅ Все критические элементы DOM найдены');
        }
    }

    // ============================================================================
    // 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ НА КНОПКИ ВНУТРИ СЕКЦИИ
    // ============================================================================

    function setupPriceEventListeners() {
        console.log('Настраиваем обработчики событий для секции "Цена"...');
        
        const calculateBtn = document.getElementById('calculate-price-btn');
        if (calculateBtn) {
            calculateBtn.addEventListener('click', handleCalculatePrice);
            console.log('✅ Кнопка "Рассчитать" настроена');
        }
        
        const exportBtn = document.getElementById('export-price-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', handleExportPrice);
            console.log('✅ Кнопка "Экспорт в PDF" настроена');
        }
        
        const printBtn = document.getElementById('print-price-btn');
        if (printBtn) {
            printBtn.addEventListener('click', handlePrintPrice);
            console.log('✅ Кнопка "Распечатать" настроена');
        }
        
        const invoiceBtn = document.getElementById('create-invoice-btn');
        if (invoiceBtn) {
            invoiceBtn.addEventListener('click', handleCreateInvoice);
            console.log('✅ Кнопка "Создать счёт" настроена');
        }
    }

    // ============================================================================
    // 4. ПОДПИСКА НА СОБЫТИЯ ОТ ДРУГИХ СЕКЦИЙ
    // ============================================================================

    function setupPriceSubscriptions() {
        console.log('📡 Настройка подписок на события от других секций...');

        // Обновление дополнительных работ
        document.addEventListener('additionalWorksUpdated', function(event) {
            console.log('📥 Получено событие additionalWorksUpdated:', event.detail);
            if (event.detail && event.detail.proschetId) {
                priceCurrentAdditionalWorks = event.detail.works || [];
                console.log(`✅ Обновлены данные дополнительных работ: ${priceCurrentAdditionalWorks.length} работ`);
                if (priceCurrentProschetId) {
                    updatePriceDisplay();
                }
            }
        });

        // Обновление печатных компонентов
        document.addEventListener('printComponentsUpdated', function(event) {
            console.log('📥 Получено событие printComponentsUpdated:', event.detail);
            if (event.detail && event.detail.proschetId) {
                priceCurrentPrintComponents = event.detail.components || [];
                console.log(`✅ Обновлены данные печатных компонентов: ${priceCurrentPrintComponents.length} компонентов`);
                if (priceCurrentProschetId) {
                    updatePriceDisplay();
                }
            }
        });

        // Выбор просчёта
        document.addEventListener('proschetSelected', function(event) {
            if (event.detail && event.detail.proschetId) {
                console.log(`📥 Получено событие proschetSelected: ${event.detail.proschetId}`);
                if (priceCurrentProschetId !== event.detail.proschetId) {
                    priceCurrentProschetId = event.detail.proschetId;
                    loadPriceData(priceCurrentProschetId);
                }
            }
        });

        document.addEventListener('laminationUpdated', function(event) {
            console.log('📥 Получено событие laminationUpdated:', event.detail);
            if (event.detail && event.detail.proschetId === priceCurrentProschetId) {
                // Сохраняем данные ламинации в глобальную переменную (например, priceCurrentLamination)
                priceCurrentLamination = event.detail;
                updatePriceDisplay(); // перерисовываем секцию цены
            }
        });

        console.log('✅ Подписки на события настроены');
    }

    // ============================================================================
    // 5. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С СЕКЦИЕЙ
    // ============================================================================

    function initPriceInterface() {
        console.log('Инициализация интерфейса секции "Цена"');
        showNoProschetSelectedMessage();
    }

    function updatePriceForProschet(proschetId, rowElement) {
        console.log(`🔄 Обновление секции "Цена" для просчёта ID: ${proschetId}`);
        priceCurrentProschetId = proschetId;
        updatePriceProschetTitle(rowElement);
        showPriceSummaryContainer();
        updateCalculationDate();
        loadPriceData(proschetId);
    }

    function updatePriceProschetTitle(rowElement) {
        const proschetTitleElement = document.getElementById('price-proschet-title');
        if (!proschetTitleElement) {
            console.warn('❌ Элемент #price-proschet-title не найден');
            return;
        }
        const titleCell = rowElement.querySelector('.proschet-title');
        if (!titleCell) {
            console.warn('❌ Ячейка с названием просчёта не найдена');
            return;
        }
        const proschetTitle = titleCell.textContent.trim();
        proschetTitleElement.innerHTML = `
            <span class="proschet-title-active">
                ${proschetTitle}
            </span>
        `;
        console.log(`✅ Название просчёта обновлено в секции "Цена": "${proschetTitle}"`);
    }

    function loadPriceData(proschetId) {
        console.log(`Загрузка данных для расчета цены, просчёт ID: ${proschetId}`);
        showPriceLoadingState();
        fetchPriceDataFromServer(proschetId);
    }

    function fetchPriceDataFromServer(proschetId) {
        const url = `/calculator/get-proschet-price-data/${proschetId}/`;
        console.log(`🌐 Отправка запроса к серверу: ${url}`);
        
        fetch(url, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getPriceCsrfToken()
            }
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ошибка: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data.success) {
                priceCurrentPrintComponents = data.print_components || [];
                priceCurrentAdditionalWorks = data.additional_works || [];
                console.log(`✅ Данные загружены с сервера: ${priceCurrentPrintComponents.length} компонентов, ${priceCurrentAdditionalWorks.length} работ`);
                console.log('📊 Данные печатных компонентов:', priceCurrentPrintComponents);
                console.log('📊 Данные дополнительных работ:', priceCurrentAdditionalWorks);
                updatePriceDisplay();
            } else {
                console.error('Ошибка при загрузке данных для расчета:', data.message);
                showPriceErrorMessage('Не удалось загрузить данные для расчета');
            }
        })
        .catch(error => {
            console.error('Ошибка сети при загрузке данных для расчета:', error);
            showPriceErrorMessage('Ошибка сети при загрузке данных для расчета');
        });
    }

    // ============================================================================
    // 5.5. ФУНКЦИЯ ОБНОВЛЕНИЯ ОТОБРАЖЕНИЯ ЦЕНЫ
    // ============================================================================

    function updatePriceDisplay() {
        console.log('🔄 Обновление отображения цены');
        if (!priceCurrentProschetId) {
            console.warn('⚠️ Нет выбранного просчёта, отображение не обновляется');
            return;
        }
        updatePrintComponentsDetails();
        updateAdditionalWorksDetails();
        updateLaminationDetails();        // <-- добавить эту строку
        calculateAndDisplayTotals();
        showCalculateButton(true);
        
        // Генерируем событие об обновлении цены
        const event = new CustomEvent('priceUpdated', {
            detail: {
                proschetId: priceCurrentProschetId,
                printComponentsTotal: calculatePrintComponentsTotal(),
                additionalWorksTotal: calculateAdditionalWorksTotal(),
                laminationTotal: priceCurrentLamination?.total_price || 0,   // добавить
                totalPrice: calculateTotalPrice() + (priceCurrentLamination?.total_price || 0)
            }
        });
        document.dispatchEvent(event);
        console.log('📤 Событие priceUpdated отправлено');
    }

    // ============================================================================
    // 5.6. ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ ПЕЧАТНЫХ КОМПОНЕНТОВ (С ИСПРАВЛЕННЫМИ ПРЕОБРАЗОВАНИЯМИ)
    // ============================================================================

    function updatePrintComponentsDetails() {
        const itemsContainer = document.getElementById('print-components-items');
        const countElement = document.getElementById('print-components-count');
        const headersElement = document.getElementById('print-components-headers');
        const totalContainer = document.getElementById('print-components-total-container');
        
        if (!itemsContainer || !countElement) {
            console.warn('❌ Элементы для отображения печатных компонентов не найдены');
            return;
        }
        
        itemsContainer.innerHTML = '';
        const componentCount = priceCurrentPrintComponents.length;
        countElement.textContent = `${componentCount} ${getNoun(componentCount, 'компонент', 'компонента', 'компонентов')}`;
        console.log(`📊 Количество печатных компонентов: ${componentCount}`);
        
        // Показываем заголовок колонок и блок итогов только если есть компоненты
        if (headersElement) {
            headersElement.style.display = componentCount > 0 ? 'flex' : 'none';
        }
        if (totalContainer) {
            totalContainer.style.display = componentCount > 0 ? 'block' : 'none';
        }
        
        if (componentCount === 0) {
            itemsContainer.innerHTML = `
                <div class="category-empty">
                    <i class="fas fa-info-circle"></i>
                    <p>В просчёте нет печатных компонентов</p>
                </div>
            `;
            updatePrintComponentsTotalsDisplay(0, 0, 0);
            return;
        }
        
        // Переменные для накопления итогов
        let totalCostSum = 0;
        let totalProfitSum = 0;
        let totalPriceSum = 0;
        
        // Для каждого компонента создаём строку
        priceCurrentPrintComponents.forEach(component => {
            const itemElement = document.createElement('div');
            itemElement.className = 'category-item';
            
            // ===== ИСПРАВЛЕНИЕ: явное преобразование строк в числа =====
            const sheetCount = parseFloat(component.sheet_count) || 0;
            const runsCount = parseInt(component.runs_count, 10) || 0;
            const paperPrice = parseFloat(component.paper_price) || 0;
            const costPerUnit = parseFloat(component.cost) || 0;
            const componentTotalPrice = parseFloat(component.total_circulation_price) || 0;
            
            // Вычисляем общую себестоимость компонента:
            // себестоимость печати (costPerUnit * runsCount) + себестоимость бумаги (paperPrice * sheetCount)
            const componentTotalCost = costPerUnit * runsCount + paperPrice * sheetCount;
            const componentProfit = componentTotalPrice - componentTotalCost;
            
            // Форматируем для отображения (теперь все числа)
            const formattedCost = `${componentTotalCost.toFixed(2)} ₽`;
            const formattedProfit = `${componentProfit.toFixed(2)} ₽`;
            const formattedTotal = `${componentTotalPrice.toFixed(2)} ₽`;
            
            // Название компонента: номер + принтер (если есть)
            const componentName = component.number 
                ? `${component.number}: ${component.printer_name || 'Без принтера'}` 
                : `Компонент: ${component.printer_name || 'Без принтера'}`;
            
            // Собираем HTML строки
            itemElement.innerHTML = `
                <div class="item-left">
                    <i class="fas fa-print"></i>
                    <span class="item-name-text">${componentName}</span>
                </div>
                <div class="item-right">
                    <div class="item-cost">${formattedCost}</div>
                    <div class="item-profit">${formattedProfit}</div>
                    <div class="item-price">${formattedTotal}</div>
                </div>
            `;
            itemsContainer.appendChild(itemElement);
            
            // Накопление итогов
            totalCostSum += componentTotalCost;
            totalProfitSum += componentProfit;
            totalPriceSum += componentTotalPrice;
        });
        
        // Обновляем отображение итоговых сумм для печатных компонентов
        updatePrintComponentsTotalsDisplay(totalCostSum, totalProfitSum, totalPriceSum);

        // Принудительно показываем контейнер итогов печати, если есть компоненты
        const printTotalContainer = document.getElementById('print-components-total-container');
        if (printTotalContainer && componentCount > 0) {
            printTotalContainer.style.display = 'block';
            printTotalContainer.classList.remove('collapsed', 'hidden');
            console.log('🔓 Контейнер печатных компонентов принудительно показан');
        }
        
        console.log(`💰 Итоги печатных компонентов: себестоимость=${totalCostSum.toFixed(2)} ₽, прибыль=${totalProfitSum.toFixed(2)} ₽, общая стоимость=${totalPriceSum.toFixed(2)} ₽`);
    }

    function updatePrintComponentsTotalsDisplay(totalCost, totalProfit, totalPrice) {
        console.log('updatePrintComponentsTotalsDisplay вызвана, аргументы:', totalCost, totalProfit, totalPrice);
        
        const container = document.getElementById('print-components-total-container');
        if (!container) {
            console.error('❌ Контейнер #print-components-total-container не найден');
            return;
        }
        
        // Принудительно показываем контейнер
        container.style.display = 'block';
        container.classList.remove('collapsed', 'hidden');
        
        // Обновляем ВСЕ элементы с классом .total-price-value внутри контейнера
        const priceElements = container.querySelectorAll('.total-price-value');
        console.log(`Найдено элементов .total-price-value: ${priceElements.length}`);
        priceElements.forEach(el => {
            el.textContent = `${Number(totalPrice).toFixed(2)} ₽`;
        });
        
        // Обновляем себестоимость
        const costElements = container.querySelectorAll('.total-cost-value');
        costElements.forEach(el => {
            el.textContent = `${Number(totalCost).toFixed(2)} ₽`;
        });
        
        // Обновляем прибыль
        const profitElements = container.querySelectorAll('.total-profit-value');
        profitElements.forEach(el => {
            el.textContent = `${Number(totalProfit).toFixed(2)} ₽`;
        });
        
        console.log(`✅ Итоги печати обновлены: себестоимость=${totalCost}, прибыль=${totalProfit}, стоимость=${totalPrice}`);
    }

    // ============================================================================
    // 5.7. ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ ДОПОЛНИТЕЛЬНЫХ РАБОТ (С ИСПРАВЛЕННЫМИ ПРЕОБРАЗОВАНИЯМИ)
    // ============================================================================

    function updateAdditionalWorksDetails() {
        const itemsContainer = document.getElementById('additional-works-items');
        const countElement = document.getElementById('additional-works-count');
        const totalContainer = document.getElementById('additional-works-total-container');

        if (!itemsContainer || !countElement) {
            console.warn('❌ Элементы для отображения дополнительных работ не найдены');
            return;
        }

        itemsContainer.innerHTML = '';
        const worksCount = priceCurrentAdditionalWorks.length;
        countElement.textContent = `${worksCount} ${getNoun(worksCount, 'работа', 'работы', 'работ')}`;
        console.log(`📊 Количество дополнительных работ: ${worksCount}`);

        if (totalContainer) {
            totalContainer.style.display = worksCount > 0 ? 'block' : 'none';
        }

        if (worksCount === 0) {
            itemsContainer.innerHTML = `
                <div class="category-empty">
                    <i class="fas fa-info-circle"></i>
                    <p>В просчёте нет дополнительных работ</p>
                </div>
            `;
            updateAdditionalWorksTotalsDisplay(0, 0, 0);
            return;
        }

        let totalCostSum = 0;
        let totalProfitSum = 0;
        let totalPriceSum = 0;

        priceCurrentAdditionalWorks.forEach(work => {
            const itemElement = document.createElement('div');
            itemElement.className = 'category-item';

            // ===== ИСПРАВЛЕНИЕ: явное преобразование строк в числа =====
            const totalCost = parseFloat(work.total_cost) || 0;
            const totalPrice = parseFloat(work.total_price) || 0;
            const profit = totalPrice - totalCost;

            const formattedCost = work.formatted_total_cost || `${totalCost.toFixed(2)} ₽`;
            const formattedProfit = `${profit.toFixed(2)} ₽`;
            const formattedTotal = work.formatted_total_price || `${totalPrice.toFixed(2)} ₽`;

            const quantity = work.quantity || 1;
            const nameText = `${work.number || 'Без номера'}: ${work.title || 'Без названия'}`;
            const quantityText = quantity > 1 ? ` (${quantity} шт.)` : '';

            itemElement.innerHTML = `
                <div class="item-left">
                    <i class="fas fa-toolbox"></i>
                    <span class="item-name-text">${nameText}${quantityText}</span>
                </div>
                <div class="item-right">
                    <div class="item-cost">${formattedCost}</div>
                    <div class="item-profit">${formattedProfit}</div>
                    <div class="item-price">${formattedTotal}</div>
                </div>
            `;

            itemsContainer.appendChild(itemElement);

            totalCostSum += totalCost;
            totalProfitSum += profit;
            totalPriceSum += totalPrice;
        });

        updateAdditionalWorksTotalsDisplay(totalCostSum, totalProfitSum, totalPriceSum);
        console.log(`💰 Итоги дополнительных работ: себестоимость=${totalCostSum.toFixed(2)} ₽, прибыль=${totalProfitSum.toFixed(2)} ₽, общая стоимость=${totalPriceSum.toFixed(2)} ₽`);
    }






    function updateAdditionalWorksTotalsDisplay(totalCost, totalProfit, totalPrice) {
        const totalCostEl = document.getElementById('additional-works-total-cost');
        const totalProfitEl = document.getElementById('additional-works-total-profit');
        const totalPriceEl = document.getElementById('additional-works-total-price');
        
        const setValues = () => {
            if (totalCostEl) totalCostEl.textContent = `${totalCost.toFixed(2)} ₽`;
            if (totalProfitEl) totalProfitEl.textContent = `${totalProfit.toFixed(2)} ₽`;
            if (totalPriceEl) totalPriceEl.textContent = `${totalPrice.toFixed(2)} ₽`;
            console.log('✅ Обновлены итоги доп. работ:', { totalCost, totalProfit, totalPrice });
        };
        
        setValues();
        
        if (totalPriceEl) {
            const expected = `${totalPrice.toFixed(2)} ₽`;
            setTimeout(() => {
                if (totalPriceEl.textContent !== expected) totalPriceEl.textContent = expected;
            }, 150);
            requestAnimationFrame(() => {
                if (totalPriceEl.textContent !== expected) totalPriceEl.textContent = expected;
            });
        }
    }

    // ============================================================================
    // 5.8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ РАСЧЁТА СУММ (оставлены для совместимости)
    // ============================================================================

    function calculatePrintComponentsTotal() {
        let total = 0;
        priceCurrentPrintComponents.forEach(component => {
            total += parseFloat(component.total_circulation_price) || 0;
        });
        return total;
    }

    function calculateAdditionalWorksTotal() {
        let total = 0;
        priceCurrentAdditionalWorks.forEach(work => {
            total += parseFloat(work.total_price) || 0;
        });
        return total;
    }

    function calculateTotalPrice() {
        let total = calculatePrintComponentsTotal() + calculateAdditionalWorksTotal();
        if (priceCurrentLamination && priceCurrentLamination.enabled) {
            total += parseFloat(priceCurrentLamination.total_price) || 0;
        }
        return total;
    }

    function calculateAndDisplayTotals() {
        const printTotal = calculatePrintComponentsTotal();
        const worksTotal = calculateAdditionalWorksTotal();
        const total = printTotal + worksTotal;
        
        const totalPriceElement = document.getElementById('total-order-price');
        if (totalPriceElement) {
            const expected = `${total.toFixed(2)} ₽`;
            totalPriceElement.textContent = expected;
            setTimeout(() => {
                if (totalPriceElement.textContent !== expected) totalPriceElement.textContent = expected;
            }, 150);
            requestAnimationFrame(() => {
                if (totalPriceElement.textContent !== expected) totalPriceElement.textContent = expected;
            });
        }
        console.log(`💰 Общая стоимость заказа: ${total.toFixed(2)} ₽`);
    }

    function updateCalculationDate() {
        const dateElement = document.getElementById('calculation-date');
        if (dateElement) {
            const now = new Date();
            const formattedDate = `${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}.${now.getFullYear()}`;
            dateElement.textContent = formattedDate;
            console.log(`📅 Дата расчета установлена: ${formattedDate}`);
        }
    }


    // ============================================================================
    // 5.9. ОБНОВЛЕНИЕ ОТОБРАЖЕНИЯ ЛАМИНАЦИИ
    // ============================================================================

    function updateLaminationDetails() {
        const itemsContainer = document.getElementById('lamination-items');
        const statusSpan = document.getElementById('lamination-status');
        const totalContainer = document.getElementById('lamination-total-container');

        if (!itemsContainer || !statusSpan) {
            console.warn('❌ Элементы для отображения ламинации не найдены');
            return;
        }

        // Если ламинация не включена или нет данных
        if (!priceCurrentLamination || !priceCurrentLamination.enabled) {
            statusSpan.textContent = 'Выключена';
            itemsContainer.innerHTML = `
                <div class="category-empty">
                    <i class="fas fa-info-circle"></i>
                    <p>Ламинация не используется</p>
                </div>
            `;
            if (totalContainer) totalContainer.style.display = 'none';
            // Обнуляем итоги ламинации
            updateLaminationTotalsDisplay(0, 0, 0);
            return;
        }

        // Ламинация включена – отображаем детали
        statusSpan.textContent = 'Включена';
        
        // Извлекаем данные
        const laminatorName = priceCurrentLamination.laminator_name || 'Не выбран';
        const filmName = priceCurrentLamination.film_name || 'Не выбрана';
        const sheetCount = parseFloat(priceCurrentLamination.sheet_count) || 0;
        const laminatorPrice = parseFloat(priceCurrentLamination.laminator_price) || 0;
        const filmPrice = parseFloat(priceCurrentLamination.film_price) || 0;
        const totalPrice = parseFloat(priceCurrentLamination.total_price) || 0;
        
        // Для ламинации себестоимость = laminator_cost (берём из priceCurrentLamination, если есть)
        // Но в событие laminationUpdated не передаются cost и markup. Нужно расширить событие.
        // Пока используем приблизительные значения:
        const laminatorCost = parseFloat(priceCurrentLamination.laminator_cost) || 0;
        const laminatorMarkup = parseFloat(priceCurrentLamination.laminator_markup) || 0;
        
        // Общая себестоимость ламинации = (laminator_cost + film_price) * sheet_count
        const totalCost = (laminatorCost + filmPrice) * sheetCount;
        const totalProfit = totalPrice - totalCost;
        
        // Формируем HTML строки
        const itemHtml = `
            <div class="category-item">
                <div class="item-left">
                    <i class="fas fa-layer-group"></i>
                    <span class="item-name-text">
                        Ламинатор: ${laminatorName}<br>
                        Плёнка: ${filmName}<br>
                        Кол-во листов: ${sheetCount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                    </span>
                </div>
                <div class="item-right">
                    <div class="item-cost">${totalCost.toFixed(2)} ₽</div>
                    <div class="item-profit">${totalProfit.toFixed(2)} ₽</div>
                    <div class="item-price">${totalPrice.toFixed(2)} ₽</div>
                </div>
            </div>
        `;
        itemsContainer.innerHTML = itemHtml;
        
        // Показываем блок итогов
        if (totalContainer) {
            totalContainer.style.display = 'block';
            updateLaminationTotalsDisplay(totalCost, totalProfit, totalPrice);
        }
    }

    function updateLaminationTotalsDisplay(totalCost, totalProfit, totalPrice) {
        const totalCostEl = document.getElementById('lamination-total-cost');
        const totalProfitEl = document.getElementById('lamination-total-profit');
        const totalPriceEl = document.getElementById('lamination-total-price');
        
        if (totalCostEl) totalCostEl.textContent = `${totalCost.toFixed(2)} ₽`;
        if (totalProfitEl) totalProfitEl.textContent = `${totalProfit.toFixed(2)} ₽`;
        if (totalPriceEl) totalPriceEl.textContent = `${totalPrice.toFixed(2)} ₽`;
    }


    // ============================================================================
    // 6. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА
    // ============================================================================

    function showNoProschetSelectedMessage() {
        console.log('📄 Показ сообщения "Выберите просчёт"...');
        const noProschetMsg = document.getElementById('no-proschet-selected-price');
        const priceContainer = document.getElementById('price-summary-container');
        const calculateBtn = document.getElementById('calculate-price-btn');
        const headersElement = document.getElementById('print-components-headers');
        const printTotalContainer = document.getElementById('print-components-total-container');
        
        if (noProschetMsg) noProschetMsg.style.display = 'block';
        if (priceContainer) priceContainer.style.display = 'none';
        if (calculateBtn) calculateBtn.style.display = 'none';
        if (headersElement) headersElement.style.display = 'none';
        if (printTotalContainer) printTotalContainer.style.display = 'none';
        
        const proschetTitleElement = document.getElementById('price-proschet-title');
        if (proschetTitleElement) proschetTitleElement.innerHTML = `<span class="placeholder-text">(просчёт не выбран)</span>`;
        
        priceCurrentProschetId = null;
        priceCurrentPrintComponents = [];
        priceCurrentAdditionalWorks = [];
        console.log('✅ Состояние секции "Цена" сброшено');
    }

    function showPriceSummaryContainer() {
        console.log('📄 Показ контейнера с расчетом...');
        const noProschetMsg = document.getElementById('no-proschet-selected-price');
        const priceContainer = document.getElementById('price-summary-container');
        if (noProschetMsg) noProschetMsg.style.display = 'none';
        if (priceContainer) priceContainer.style.display = 'block';
    }

    function showPriceLoadingState() {
        console.log('⏳ Показ состояния загрузки...');
        const printItems = document.getElementById('print-components-items');
        const worksItems = document.getElementById('additional-works-items');
        const headersElement = document.getElementById('print-components-headers');
        const printTotalContainer = document.getElementById('print-components-total-container');
        
        if (printItems) {
            printItems.innerHTML = `
                <div class="category-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Загрузка данных печати...</p>
                </div>
            `;
        }
        if (worksItems) {
            worksItems.innerHTML = `
                <div class="category-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Загрузка данных работ...</p>
                </div>
            `;
        }
        if (headersElement) headersElement.style.display = 'none';
        if (printTotalContainer) printTotalContainer.style.display = 'none';
        
        const totalPriceElement = document.getElementById('total-order-price');
        if (totalPriceElement) totalPriceElement.textContent = '0.00 ₽';
    }

    function showPriceErrorMessage(message) {
        console.error(`❌ Показ сообщения об ошибке: ${message}`);
        const priceContainer = document.getElementById('price-summary-container');
        if (priceContainer) {
            priceContainer.innerHTML = `
                <div class="price-error">
                    <i class="fas fa-exclamation-triangle fa-2x"></i>
                    <h3>Ошибка загрузки данных</h3>
                    <p>${message}</p>
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

    function showCalculateButton(show) {
        const calculateBtn = document.getElementById('calculate-price-btn');
        if (calculateBtn) {
            calculateBtn.style.display = show ? 'inline-block' : 'none';
            calculateBtn.disabled = !show;
        }
    }

    // ============================================================================
    // 7. ОБРАБОТЧИКИ КНОПОК (заглушки для будущих функций)
    // ============================================================================

    function handleCalculatePrice() {
        console.log('🧮 Перерасчет стоимости');
        updatePriceDisplay();
        showPriceNotification('Стоимость пересчитана', 'success');
    }

    function handleExportPrice() {
        console.log('📄 Экспорт стоимости в PDF');
        showPriceNotification('Экспорт в PDF будет реализован позже', 'info');
    }

    function handlePrintPrice() {
        console.log('🖨️ Печать стоимости');
        window.print();
    }

    function handleCreateInvoice() {
        console.log('🧾 Создание счета');
        showPriceNotification('Создание счета будет реализовано позже', 'info');
    }

    // ============================================================================
    // 8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ============================================================================

    function getPriceCsrfToken() {
        const name = 'csrftoken';
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.startsWith(name + '=')) {
                return decodeURIComponent(cookie.substring(name.length + 1));
            }
        }
        console.warn('CSRF-токен не найден');
        return '';
    }

    function showPriceNotification(message, type = 'info') {
        console.log(`Показ уведомления [${type}]: ${message}`);
        const notification = document.createElement('div');
        notification.className = `price-notification notification-${type}`;
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';
        if (type === 'warning') icon = 'exclamation-triangle';
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${icon}"></i>
                <span>${message}</span>
            </div>
            <button type="button" class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.classList.remove('show');
                setTimeout(() => notification.parentNode?.removeChild(notification), 300);
            });
        }
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('show');
                setTimeout(() => notification.parentNode?.removeChild(notification), 300);
            }
        }, 5000);
    }

    function getNoun(number, one, two, five) {
        let n = Math.abs(number);
        n %= 100;
        if (n >= 5 && n <= 20) return five;
        n %= 10;
        if (n === 1) return one;
        if (n >= 2 && n <= 4) return two;
        return five;
    }

    // ============================================================================
    // 9. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С ДРУГИМИ СЕКЦИЯМИ
    // ============================================================================

    window.priceSection = {
        updateForProschet: function(proschetId, rowElement) {
            updatePriceForProschet(proschetId, rowElement);
        },
        reset: function() {
            showNoProschetSelectedMessage();
        },
        getCurrentProschetId: function() {
            return priceCurrentProschetId;
        },
        getCurrentData: function() {
            return {
                printComponents: priceCurrentPrintComponents,
                additionalWorks: priceCurrentAdditionalWorks
            };
        },
        refresh: function() {
            if (priceCurrentProschetId) updatePriceDisplay();
        },
        getTotals: function() {
            return {
                printComponentsTotal: calculatePrintComponentsTotal(),
                additionalWorksTotal: calculateAdditionalWorksTotal(),
                totalPrice: calculateTotalPrice()
            };
        }
    };

    console.log('✅ Секция "Цена" полностью реализована и готова к использованию');
})();