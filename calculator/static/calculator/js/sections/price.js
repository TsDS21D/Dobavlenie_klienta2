/*
sections/price.js - JavaScript для секции "Цена"
ОБНОВЛЕНО: Используем total_price для дополнительных работ вместо price.
ИСПРАВЛЕНО: Синтаксические ошибки, удалены дублирующие проверки.
*/

(function() {
    "use strict";

    // ============================================================================
    // 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ СЕКЦИИ (хранят текущее состояние)
    // ============================================================================

    // ID текущего выбранного просчёта (устанавливается при выборе просчёта)
    let priceCurrentProschetId = null;

    // Массив данных печатных компонентов для текущего просчёта
    // Каждый элемент содержит id, number, printer, total_circulation_price и т.д.
    let priceCurrentPrintComponents = [];

    // Массив данных дополнительных работ для текущего просчёта (собирается из всех компонентов)
    // Каждый элемент содержит id, number, title, price, total_price и т.д.
    let priceCurrentAdditionalWorks = [];

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

    /**
     * Проверяет наличие всех критических DOM-элементов, необходимых для работы секции.
     * Выводит в консоль информацию об отсутствующих элементах.
     */
    function checkDomElements() {
        console.log('🔍 Проверка элементов DOM для секции "Цена"...');
        
        // Список ID элементов, которые обязательно должны существовать в HTML
        const criticalElements = [
            'price-proschet-title',          // заголовок с названием просчёта
            'no-proschet-selected-price',    // сообщение "просчёт не выбран"
            'price-summary-container',        // контейнер с итоговой информацией
            'calculate-price-btn',            // кнопка "Рассчитать"
            'print-components-count',         // счётчик печатных компонентов
            'print-components-items',          // контейнер для списка компонентов
            'additional-works-count',          // счётчик дополнительных работ
            'additional-works-items',           // контейнер для списка работ
            'price-print-components-total',     // итог по печатным компонентам
            'additional-works-total',           // итог по дополнительным работам
            'total-order-price',                // общая сумма заказа
            'calculation-date',                  // дата расчёта
            'export-price-btn',                   // кнопка экспорта в PDF
            'print-price-btn',                     // кнопка печати
            'create-invoice-btn'                    // кнопка создания счёта
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

    /**
     * Навешивает обработчики кликов на кнопки внутри секции "Цена".
     */
    function setupPriceEventListeners() {
        console.log('Настраиваем обработчики событий для секции "Цена"...');
        
        // Кнопка "Рассчитать" (пересчёт стоимости)
        const calculateBtn = document.getElementById('calculate-price-btn');
        if (calculateBtn) {
            calculateBtn.addEventListener('click', handleCalculatePrice);
            console.log('✅ Кнопка "Рассчитать" настроена');
        } else {
            console.warn('❌ Кнопка "Рассчитать" не найдена');
        }
        
        // Кнопка экспорта в PDF
        const exportBtn = document.getElementById('export-price-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', handleExportPrice);
            console.log('✅ Кнопка "Экспорт в PDF" настроена');
        }
        
        // Кнопка печати
        const printBtn = document.getElementById('print-price-btn');
        if (printBtn) {
            printBtn.addEventListener('click', handlePrintPrice);
            console.log('✅ Кнопка "Распечатать" настроена');
        }
        
        // Кнопка создания счёта
        const invoiceBtn = document.getElementById('create-invoice-btn');
        if (invoiceBtn) {
            invoiceBtn.addEventListener('click', handleCreateInvoice);
            console.log('✅ Кнопка "Создать счёт" настроена');
        }
    }

    // ============================================================================
    // 4. ПОДПИСКА НА СОБЫТИЯ ОТ ДРУГИХ СЕКЦИЙ
    // ============================================================================

    /**
     * Подписывается на глобальные события, которые генерируют другие секции:
     * - additionalWorksUpdated (секция "Дополнительные работы")
     * - printComponentsUpdated (секция "Печатные компоненты")
     * - proschetSelected (секция "Список просчётов")
     */
    function setupPriceSubscriptions() {
        console.log('📡 Настройка подписок на события от других секций...');

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

        document.addEventListener('proschetSelected', function(event) {
            if (event.detail && event.detail.proschetId) {
                console.log(`📥 Получено событие proschetSelected: ${event.detail.proschetId}`);
                if (priceCurrentProschetId !== event.detail.proschetId) {
                    priceCurrentProschetId = event.detail.proschetId;
                    loadPriceData(priceCurrentProschetId);
                }
            }
        });

        console.log('✅ Подписки на события настроены');
    }

    // ============================================================================
    // 5. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С СЕКЦИЕЙ
    // ============================================================================

    /**
     * Инициализация интерфейса при загрузке страницы.
     * Показывает сообщение о том, что просчёт не выбран.
     */
    function initPriceInterface() {
        console.log('Инициализация интерфейса секции "Цена"');
        showNoProschetSelectedMessage();
    }

    /**
     * Обновление секции при выборе просчёта (вызывается из глобального объекта window.priceSection).
     * @param {number} proschetId - ID выбранного просчёта
     * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом (для получения названия)
     */
    function updatePriceForProschet(proschetId, rowElement) {
        console.log(`🔄 Обновление секции "Цена" для просчёта ID: ${proschetId}`);
        
        // Сохраняем ID текущего просчёта
        priceCurrentProschetId = proschetId;
        
        // Обновляем заголовок секции (отображаем название просчёта)
        updatePriceProschetTitle(rowElement);
        
        // Показываем контейнер с итоговой информацией (скрываем сообщение "просчёт не выбран")
        showPriceSummaryContainer();
        
        // Устанавливаем текущую дату в блоке "Дата расчета"
        updateCalculationDate();
        
        // Загружаем данные для расчета с сервера (компоненты и работы)
        loadPriceData(proschetId);
    }

    /**
     * Обновляет заголовок секции, отображая название выбранного просчёта.
     * @param {HTMLElement} rowElement - строка таблицы просчётов, содержащая ячейку с названием
     */
    function updatePriceProschetTitle(rowElement) {
        const proschetTitleElement = document.getElementById('price-proschet-title');
        if (!proschetTitleElement) {
            console.warn('❌ Элемент #price-proschet-title не найден');
            return;
        }
        
        // Ищем ячейку с классом 'proschet-title' внутри переданной строки
        const titleCell = rowElement.querySelector('.proschet-title');
        if (!titleCell) {
            console.warn('❌ Ячейка с названием просчёта не найдена');
            return;
        }
        
        const proschetTitle = titleCell.textContent.trim();
        
        // Заменяем содержимое заголовка на активное название
        proschetTitleElement.innerHTML = `
            <span class="proschet-title-active">
                ${proschetTitle}
            </span>
        `;
        
        console.log(`✅ Название просчёта обновлено в секции "Цена": "${proschetTitle}"`);
    }

    /**
     * Загружает данные для расчёта цены с сервера.
     * @param {number} proschetId - ID просчёта
     */
    function loadPriceData(proschetId) {
        console.log(`Загрузка данных для расчета цены, просчёт ID: ${proschetId}`);
        
        // Показываем состояние загрузки (спиннеры, обнуление сумм)
        showPriceLoadingState();
        
        // Всегда загружаем данные с сервера для надежности (чтобы получить актуальные компоненты и работы)
        fetchPriceDataFromServer(proschetId);
    }

    /**
     * Выполняет AJAX-запрос к серверу для получения данных о просчёте.
     * @param {number} proschetId - ID просчёта
     */
    function fetchPriceDataFromServer(proschetId) {
        // URL для получения данных о просчёте (определён в urls.py)
        const url = `/calculator/get-proschet-price-data/${proschetId}/`;
        
        console.log(`🌐 Отправка запроса к серверу: ${url}`);
        
        fetch(url, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest', // указываем, что это AJAX
                'X-CSRFToken': getPriceCsrfToken()     // CSRF-токен для безопасности
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ошибка: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Сохраняем полученные данные в глобальные переменные
                priceCurrentPrintComponents = data.print_components || [];
                priceCurrentAdditionalWorks = data.additional_works || [];
                console.log(`✅ Данные загружены с сервера: ${priceCurrentPrintComponents.length} компонентов, ${priceCurrentAdditionalWorks.length} работ`);
                console.log('📊 Данные печатных компонентов:', priceCurrentPrintComponents);
                console.log('📊 Данные дополнительных работ:', priceCurrentAdditionalWorks);
                
                // Обновляем отображение (заполняем списки, суммы)
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

    /**
     * Обновляет весь интерфейс секции на основе текущих данных (priceCurrentPrintComponents и priceCurrentAdditionalWorks).
     * Вызывается после загрузки данных с сервера или после получения событий от других секций.
     */
    function updatePriceDisplay() {
        console.log('🔄 Обновление отображения цены');
        
        // Проверяем, есть ли выбранный просчёт (если нет, просто не обновляем)
        if (!priceCurrentProschetId) {
            console.warn('⚠️ Нет выбранного просчёта, отображение не обновляется');
            return;
        }
        
        // Обновляем детали печатных компонентов (список и счётчик)
        updatePrintComponentsDetails();
        
        // Обновляем детали дополнительных работ (список и счётчик)
        updateAdditionalWorksDetails();
        
        // Рассчитываем и обновляем итоговые суммы (печать, работы, общая)
        calculateAndDisplayTotals();
        
        // Показываем кнопку "Рассчитать" (она может быть скрыта, если просчёта нет)
        showCalculateButton(true);
        
        // Генерируем событие об обновлении цены (может использоваться другими модулями, например для автосохранения)
        const event = new CustomEvent('priceUpdated', {
            detail: {
                proschetId: priceCurrentProschetId,
                printComponentsTotal: calculatePrintComponentsTotal(),
                additionalWorksTotal: calculateAdditionalWorksTotal(),
                totalPrice: calculateTotalPrice()
            }
        });
        document.dispatchEvent(event);
        
        console.log('📤 Событие priceUpdated отправлено');
    }

    /**
     * Обновляет отображение списка печатных компонентов:
     * - очищает контейнер
     * - выводит количество компонентов
     * - для каждого компонента создаёт элемент с названием и ценой
     */
    function updatePrintComponentsDetails() {
        const itemsContainer = document.getElementById('print-components-items');
        const countElement = document.getElementById('print-components-count');
        
        if (!itemsContainer || !countElement) {
            console.warn('❌ Элементы для отображения печатных компонентов не найдены');
            return;
        }
        
        // Очищаем контейнер
        itemsContainer.innerHTML = '';
        
        // Обновляем количество (с правильным склонением слова "компонент")
        const componentCount = priceCurrentPrintComponents.length;
        countElement.textContent = `${componentCount} ${getNoun(componentCount, 'компонент', 'компонента', 'компонентов')}`;
        console.log(`📊 Количество печатных компонентов: ${componentCount}`);
        
        // Если компонентов нет, показываем специальное сообщение
        if (componentCount === 0) {
            itemsContainer.innerHTML = `
                <div class="category-empty">
                    <i class="fas fa-info-circle"></i>
                    <p>В просчёте нет печатных компонентов</p>
                </div>
            `;
            return;
        }
        
        // Добавляем детали по каждому компоненту
        let totalPrice = 0;
        priceCurrentPrintComponents.forEach(component => {
            const itemElement = document.createElement('div');
            itemElement.className = 'category-item';
            
            // Форматируем цену компонента (используем поле total_circulation_price из модели)
            const componentPrice = parseFloat(component.total_circulation_price) || 0;
            totalPrice += componentPrice;
            const formattedPrice = componentPrice.toFixed(2);
            
            // Безопасное получение имени принтера (может отсутствовать)
            const printerName = component.printer && component.printer.name ? component.printer.name : 'Без принтера';
            
            itemElement.innerHTML = `
                <div class="item-name">
                    <i class="fas fa-file-alt"></i>
                    <span>${component.number || 'Без номера'}: ${printerName}</span>
                </div>
                <div class="item-price">${formattedPrice} ₽</div>
            `;
            
            itemsContainer.appendChild(itemElement);
        });
        
        console.log(`💰 Общая стоимость печатных компонентов: ${totalPrice.toFixed(2)} ₽`);
    }

    /**
     * Обновляет отображение списка дополнительных работ:
     * - очищает контейнер
     * - выводит количество работ
     * - для каждой работы создаёт элемент с названием и ценой (используя total_price)
     */
    function updateAdditionalWorksDetails() {
        const itemsContainer = document.getElementById('additional-works-items');
        const countElement = document.getElementById('additional-works-count');

        if (!itemsContainer || !countElement) {
            console.warn('❌ Элементы для отображения дополнительных работ не найдены');
            return;
        }

        itemsContainer.innerHTML = '';
        const worksCount = priceCurrentAdditionalWorks.length;
        countElement.textContent = `${worksCount} ${getNoun(worksCount, 'работа', 'работы', 'работ')}`;
        console.log(`📊 Количество дополнительных работ: ${worksCount}`);

        if (worksCount === 0) {
            itemsContainer.innerHTML = `
                <div class="category-empty">
                    <i class="fas fa-info-circle"></i>
                    <p>В просчёте нет дополнительных работ</p>
                </div>
            `;
            return;
        }

        // Переменная для накопления суммы total_price (не price!)
        let totalPriceSum = 0;

        priceCurrentAdditionalWorks.forEach(work => {
            const itemElement = document.createElement('div');
            itemElement.className = 'category-item';

            // ИСПРАВЛЕНО: используем total_price (общая стоимость работы)
            const workTotal = parseFloat(work.total_price) || 0;
            totalPriceSum += workTotal;
            const formattedTotal = workTotal.toFixed(2);

            // Для информативности также можем показать количество и цену за единицу (опционально)
            const quantity = work.quantity || 1;
            const unitPrice = parseFloat(work.price) || 0;

            itemElement.innerHTML = `
                <div class="item-name">
                    <i class="fas fa-toolbox"></i>
                    <span>
                        ${work.number || 'Без номера'}: ${work.title || 'Без названия'}
                        ${quantity > 1 ? ` (${quantity} шт. по ${unitPrice.toFixed(2)} ₽)` : ''}
                    </span>
                </div>
                <div class="item-price">${formattedTotal} ₽</div>
            `;

            itemsContainer.appendChild(itemElement);
        });

        // Общая сумма работ (total_price) будет использована в calculateAndDisplayTotals
        console.log(`💰 Общая стоимость дополнительных работ (на основе total_price): ${totalPriceSum.toFixed(2)} ₽`);
    }

    /**
     * Вычисляет сумму всех печатных компонентов.
     * @returns {number} общая стоимость печатных компонентов
     */
    function calculatePrintComponentsTotal() {
        let total = 0;
        priceCurrentPrintComponents.forEach(component => {
            const price = parseFloat(component.total_circulation_price) || 0;
            total += price;
        });
        return total;
    }

    /**
     * Вычисляет сумму всех дополнительных работ.
     * @returns {number} общая стоимость дополнительных работ
     */
    function calculateAdditionalWorksTotal() {
        let total = 0;
        priceCurrentAdditionalWorks.forEach(work => {
            // ИСПРАВЛЕНО: используем total_price
            const workTotal = parseFloat(work.total_price) || 0;
            total += workTotal;
        });
        console.log(`🧮 Расчет суммы дополнительных работ (total_price): ${total.toFixed(2)} ₽`);
        return total;
    }

    /**
     * Вычисляет общую стоимость заказа (печать + работы).
     * @returns {number} общая сумма
     */
    function calculateTotalPrice() {
        return calculatePrintComponentsTotal() + calculateAdditionalWorksTotal();
    }

    // ============================================================================
    // 5.9. ФУНКЦИЯ РАСЧЕТА И ОТОБРАЖЕНИЯ ИТОГОВЫХ СУММ
    // ============================================================================

    /**
     * Рассчитывает итоговые суммы и обновляет соответствующие DOM-элементы.
     */
    function calculateAndDisplayTotals() {
        console.log('🧮 Начало расчета и отображения итоговых сумм...');

        const printComponentsTotal = calculatePrintComponentsTotal();
        const additionalWorksTotal = calculateAdditionalWorksTotal();  // теперь сумма total_price
        const totalPrice = calculateTotalPrice();

        console.log(`📊 Результаты расчета: 
            Печатные компоненты: ${printComponentsTotal.toFixed(2)} ₽
            Дополнительные работы: ${additionalWorksTotal.toFixed(2)} ₽
            Общая сумма: ${totalPrice.toFixed(2)} ₽`);

        const printTotalElement = document.getElementById('price-print-components-total');
        const worksTotalElement = document.getElementById('additional-works-total');
        const totalPriceElement = document.getElementById('total-order-price');

        if (printTotalElement) printTotalElement.textContent = `${printComponentsTotal.toFixed(2)} ₽`;
        if (worksTotalElement) worksTotalElement.textContent = `${additionalWorksTotal.toFixed(2)} ₽`;
        if (totalPriceElement) totalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;

        console.log(`✅ Расчет стоимости завершен`);
    }

    /**
     * Устанавливает текущую дату в элемент #calculation-date.
     */
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
    // 6. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА
    // ============================================================================

    /**
     * Показывает сообщение о том, что просчёт не выбран.
     * Скрывает контейнер с итоговой информацией и кнопку "Рассчитать".
     * Очищает заголовок и сбрасывает данные.
     */
    function showNoProschetSelectedMessage() {
        console.log('📄 Показ сообщения "Выберите просчёт"...');
        
        const noProschetMsg = document.getElementById('no-proschet-selected-price');
        const priceContainer = document.getElementById('price-summary-container');
        const calculateBtn = document.getElementById('calculate-price-btn');
        
        if (noProschetMsg) {
            noProschetMsg.style.display = 'block';
            console.log('✅ Сообщение "Выберите просчёт" показано');
        }
        
        if (priceContainer) {
            priceContainer.style.display = 'none';
            console.log('✅ Контейнер с расчетом скрыт');
        }
        
        if (calculateBtn) {
            calculateBtn.style.display = 'none';
            console.log('✅ Кнопка "Рассчитать" скрыта');
        }
        
        // Очищаем заголовок
        const proschetTitleElement = document.getElementById('price-proschet-title');
        if (proschetTitleElement) {
            proschetTitleElement.innerHTML = `<span class="placeholder-text">(просчёт не выбран)</span>`;
            console.log('✅ Заголовок просчёта очищен');
        }
        
        // Сбрасываем данные
        priceCurrentProschetId = null;
        priceCurrentPrintComponents = [];
        priceCurrentAdditionalWorks = [];
        
        console.log('✅ Состояние секции "Цена" сброшено');
    }

    /**
     * Показывает контейнер с итоговой информацией и скрывает сообщение "просчёт не выбран".
     */
    function showPriceSummaryContainer() {
        console.log('📄 Показ контейнера с расчетом...');
        
        const noProschetMsg = document.getElementById('no-proschet-selected-price');
        const priceContainer = document.getElementById('price-summary-container');
        
        if (noProschetMsg) {
            noProschetMsg.style.display = 'none';
            console.log('✅ Сообщение "Выберите просчёт" скрыто');
        }
        
        if (priceContainer) {
            priceContainer.style.display = 'block';
            console.log('✅ Контейнер с расчетом показан');
        }
    }

    /**
     * Показывает состояние загрузки:
     * - заменяет списки на индикаторы загрузки
     * - обнуляет суммы
     */
    function showPriceLoadingState() {
        console.log('⏳ Показ состояния загрузки...');
        
        // Элементы для деталей
        const printItems = document.getElementById('print-components-items');
        const worksItems = document.getElementById('additional-works-items');
        
        if (printItems) {
            printItems.innerHTML = `
                <div class="category-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Загрузка данных печати...</p>
                </div>
            `;
            console.log('✅ Индикатор загрузки для печатных компонентов показан');
        } else {
            console.warn('❌ Элемент print-components-items не найден');
        }
        
        if (worksItems) {
            worksItems.innerHTML = `
                <div class="category-loading">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Загрузка данных работ...</p>
                </div>
            `;
            console.log('✅ Индикатор загрузки для дополнительных работ показан');
        } else {
            console.warn('❌ Элемент additional-works-items не найден');
        }
        
        // Устанавливаем нулевые суммы
        const printTotalElement = document.getElementById('price-print-components-total');
        const worksTotalElement = document.getElementById('additional-works-total');
        const totalPriceElement = document.getElementById('total-order-price');
        
        if (printTotalElement) {
            printTotalElement.textContent = '0.00 ₽';
            console.log('✅ Установлено начальное значение для price-print-components-total: 0.00 ₽');
        } else {
            console.warn('❌ Элемент price-print-components-total не найден в showPriceLoadingState');
        }
        
        if (worksTotalElement) {
            worksTotalElement.textContent = '0.00 ₽';
            console.log('✅ Установлено начальное значение для additional-works-total: 0.00 ₽');
        } else {
            console.warn('❌ Элемент additional-works-total не найден в showPriceLoadingState');
        }
        
        if (totalPriceElement) {
            totalPriceElement.textContent = '0.00 ₽';
            console.log('✅ Установлено начальное значение для total-order-price: 0.00 ₽');
        }
    }

    /**
     * Показывает сообщение об ошибке при загрузке данных.
     * @param {string} message - текст ошибки
     */
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
            
            // Обработчик кнопки "Повторить"
            const retryBtn = document.getElementById('retry-price-load-btn');
            if (retryBtn && priceCurrentProschetId) {
                retryBtn.addEventListener('click', function() {
                    console.log('🔄 Повторная попытка загрузки данных...');
                    loadPriceData(priceCurrentProschetId);
                });
            }
        }
    }

    /**
     * Показывает или скрывает кнопку "Рассчитать".
     * @param {boolean} show - true, чтобы показать, false – скрыть
     */
    function showCalculateButton(show) {
        const calculateBtn = document.getElementById('calculate-price-btn');
        if (calculateBtn) {
            calculateBtn.style.display = show ? 'inline-block' : 'none';
            calculateBtn.disabled = !show;
            console.log(`✅ Кнопка "Рассчитать": ${show ? 'показана' : 'скрыта'}`);
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
        // Здесь будет логика экспорта в PDF
        showPriceNotification('Экспорт в PDF будет реализован позже', 'info');
    }

    function handlePrintPrice() {
        console.log('🖨️ Печать стоимости');
        window.print();
    }

    function handleCreateInvoice() {
        console.log('🧾 Создание счета');
        // Здесь будет логика создания счета
        showPriceNotification('Создание счета будет реализовано позже', 'info');
    }

    // ============================================================================
    // 8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // ============================================================================

    /**
     * Получает CSRF-токен из cookies.
     * Токен необходим для отправки POST-запросов в Django (защита от CSRF-атак).
     * @returns {string} CSRF-токен или пустая строка, если не найден
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
        
        console.warn('CSRF-токен не найден');
        return '';
    }

    /**
     * Показывает всплывающее уведомление.
     * @param {string} message - текст сообщения
     * @param {string} type - тип ('success', 'error', 'warning', 'info')
     */
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
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            });
        }
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 5000);
    }

    /**
     * Функция для правильного склонения существительных после числительных.
     * Например: 1 компонент, 2 компонента, 5 компонентов.
     * @param {number} number - количество
     * @param {string} one - форма для 1 (компонент)
     * @param {string} two - форма для 2-4 (компонента)
     * @param {string} five - форма для 5-20 (компонентов)
     * @returns {string} правильная форма
     */
    function getNoun(number, one, two, five) {
        let n = Math.abs(number);
        n %= 100;
        if (n >= 5 && n <= 20) {
            return five;
        }
        n %= 10;
        if (n === 1) {
            return one;
        }
        if (n >= 2 && n <= 4) {
            return two;
        }
        return five;
    }

    // ============================================================================
    // 9. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С ДРУГИМИ СЕКЦИЯМИ
    // ============================================================================

    /**
     * Глобальный объект, через который другие секции могут взаимодействовать с данной.
     * Например, секция "Список просчётов" вызывает updateForProschet при выборе просчёта.
     */
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
            if (priceCurrentProschetId) {
                updatePriceDisplay();
            }
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

// ============================================================================
// 10. ОТЛАДОЧНЫЕ ФУНКЦИИ (доступны в консоли браузера)
// ============================================================================

/**
 * Функция для отладки - проверяет состояние секции "Цена"
 * Можно вызвать в консоли: debugPriceSection()
 */
window.debugPriceSection = function() {
    console.log('=== ДЕБАГ СЕКЦИИ "ЦЕНА" ===');
    console.log('Текущий просчёт:', priceCurrentProschetId);
    console.log('Печатные компоненты:', priceCurrentPrintComponents.length, 'шт');
    console.log('Дополнительные работы:', priceCurrentAdditionalWorks.length, 'шт');
    console.log('Сумма печати:', calculatePrintComponentsTotal().toFixed(2), '₽');
    console.log('Сумма работ:', calculateAdditionalWorksTotal().toFixed(2), '₽');
    console.log('Общая сумма:', calculateTotalPrice().toFixed(2), '₽');
    
    // Проверяем элементы DOM
    const elements = [
        'price-print-components-total',
        'additional-works-total', 
        'total-order-price',
        'print-components-count',
        'additional-works-count'
    ];
    
    elements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`Элемент #${id}:`, element ? `найден (${element.textContent})` : 'НЕ НАЙДЕН');
    });
    
    console.log('=== КОНЕЦ ДЕБАГА ===');
};