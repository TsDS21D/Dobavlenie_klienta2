/*
sections/price.js - JavaScript для секции "Цена"
ОБНОВЛЕНО: Полная реализация расчета стоимости печатных компонентов и дополнительных работ
ИСПРАВЛЕНО: Правильная обработка событий от других секций
ДОБАВЛЕНО: Подробная отладка для всех элементов DOM
*/

(function() {
    "use strict";

    // ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ДЛЯ СЕКЦИИ (с уникальными именами) =====

    // ID текущего выбранного просчёта
    let priceCurrentProschetId = null;

    // Данные печатных компонентов и дополнительных работ
    let priceCurrentPrintComponents = [];
    let priceCurrentAdditionalWorks = [];

    // ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

    document.addEventListener('DOMContentLoaded', function() {
        console.log('✅ Секция "Цена" загружена');
        
        // Проверяем наличие всех критических элементов DOM
        checkDomElements();
        
        // Настраиваем обработчики событий
        setupPriceEventListeners();
        
        // Инициализируем интерфейс
        initPriceInterface();
        
        // Подписываемся на события от других секций
        setupPriceSubscriptions();
    });

    // ===== 2.1. ФУНКЦИЯ ПРОВЕРКИ ЭЛЕМЕНТОВ DOM =====

    function checkDomElements() {
        console.log('🔍 Проверка элементов DOM для секции "Цена"...');
        
        // Критические элементы из price.html
        const criticalElements = [
            'price-proschet-title',
            'no-proschet-selected-price',
            'price-summary-container',
            'calculate-price-btn',
            'print-components-count',
            'print-components-items',
            'additional-works-count',
            'additional-works-items',
            'price-print-components-total',     // ВАЖНО: цена печатных компонентов
            'additional-works-total',           // ВАЖНО: цена дополнительных работ
            'total-order-price',
            'calculation-date',
            'export-price-btn',
            'print-price-btn',
            'create-invoice-btn'
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

    // ===== 3. НАСТРОЙКА ОБРАБОТЧИКОВ СОБЫТИЙ =====

    function setupPriceEventListeners() {
        console.log('Настраиваем обработчики событий для секции "Цена"...');
        
        // Кнопка расчета
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
        
        // Кнопка создания счета
        const invoiceBtn = document.getElementById('create-invoice-btn');
        if (invoiceBtn) {
            invoiceBtn.addEventListener('click', handleCreateInvoice);
            console.log('✅ Кнопка "Создать счёт" настроена');
        }
    }

    // ===== 4. ПОДПИСКА НА СОБЫТИЯ ОТ ДРУГИХ СЕКЦИЙ =====

    function setupPriceSubscriptions() {
        console.log('📡 Настройка подписок на события от других секций...');
        
        // Подписка на события от секции "Дополнительные работы"
        document.addEventListener('additionalWorksUpdated', function(event) {
            console.log('📥 Получено событие additionalWorksUpdated:', event.detail);
            
            if (event.detail && event.detail.proschetId) {
                // ВАЖНО: Исправлено - сохраняем работы независимо от ID просчёта
                // потому что данные могут приходить до того как секция "Цена" обновится
                priceCurrentAdditionalWorks = event.detail.works || [];
                console.log(`✅ Обновлены данные дополнительных работ: ${priceCurrentAdditionalWorks.length} работ`);
                
                // ВАЖНО: Исправлено - обновляем отображение ВСЕГДА, если у нас есть текущий просчёт
                // Это гарантирует, что сумма дополнительных работ будет обновлена
                if (priceCurrentProschetId) {
                    console.log(`✅ Текущий просчёт: ${priceCurrentProschetId}, обновляю отображение`);
                    updatePriceDisplay();
                } else {
                    console.log(`ℹ️ Секция "Цена" еще не инициализирована, сохраняем данные для будущего использования`);
                }
            } else {
                console.warn('⚠️ Событие additionalWorksUpdated без деталей или без proschetId');
            }
        });
        
        // Подписка на события от секции "Печатные компоненты"
        document.addEventListener('printComponentsUpdated', function(event) {
            console.log('📥 Получено событие printComponentsUpdated:', event.detail);
            
            if (event.detail && event.detail.proschetId) {
                priceCurrentPrintComponents = event.detail.components || [];
                console.log(`✅ Обновлены данные печатных компонентов: ${priceCurrentPrintComponents.length} компонентов`);
                
                // ВАЖНО: Исправлено - обновляем отображение ВСЕГДА, если у нас есть текущий просчёт
                if (priceCurrentProschetId) {
                    console.log(`✅ Текущий просчёт: ${priceCurrentProschetId}, обновляю отображение`);
                    updatePriceDisplay();
                } else {
                    console.log(`ℹ️ Секция "Цена" еще не инициализирована, сохраняем данные для будущего использования`);
                }
            }
        });
        
        // Подписка на событие выбора просчёта
        document.addEventListener('proschetSelected', function(event) {
            if (event.detail && event.detail.proschetId) {
                console.log(`📥 Получено событие proschetSelected: ${event.detail.proschetId}`);
                
                // Если переключились на другой просчёт, обновляем отображение
                if (priceCurrentProschetId !== event.detail.proschetId) {
                    console.log(`🔄 Переключение с просчёта ${priceCurrentProschetId} на ${event.detail.proschetId}`);
                    priceCurrentProschetId = event.detail.proschetId;
                    updatePriceDisplay();
                }
            }
        });
        
        console.log('✅ Подписки на события настроены');
    }

    // ===== 5. ОСНОВНЫЕ ФУНКЦИИ ДЛЯ РАБОТЫ С СЕКЦИЕЙ =====

    function initPriceInterface() {
        console.log('Инициализация интерфейса секции "Цена"');
        showNoProschetSelectedMessage();
    }

    function updatePriceForProschet(proschetId, rowElement) {
        console.log(`🔄 Обновление секции "Цена" для просчёта ID: ${proschetId}`);
        
        // Сохраняем ID текущего просчёта
        priceCurrentProschetId = proschetId;
        
        // Обновляем заголовок секции
        updatePriceProschetTitle(rowElement);
        
        // Показываем контейнер с расчетом
        showPriceSummaryContainer();
        
        // Устанавливаем текущую дату
        updateCalculationDate();
        
        // Загружаем данные для расчета
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
        
        // Показываем состояние загрузки
        showPriceLoadingState();
        
        // Всегда загружаем данные с сервера для надежности
        fetchPriceDataFromServer(proschetId);
    }

    function fetchPriceDataFromServer(proschetId) {
        // URL для получения данных о просчёте
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
            if (!response.ok) {
                throw new Error(`HTTP ошибка: ${response.status}`);
            }
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

    // ===== 5.5. ФУНКЦИЯ ОБНОВЛЕНИЯ ОТОБРАЖЕНИЯ ЦЕНЫ =====

    function updatePriceDisplay() {
        console.log('🔄 Обновление отображения цены', {
            proschetId: priceCurrentProschetId,
            componentsCount: priceCurrentPrintComponents.length,
            worksCount: priceCurrentAdditionalWorks.length
        });
        
        // Проверяем, есть ли выбранный просчёт
        if (!priceCurrentProschetId) {
            console.warn('⚠️ Нет выбранного просчёта, отображение не обновляется');
            return;
        }
        
        // Обновляем детали печатных компонентов
        updatePrintComponentsDetails();
        
        // Обновляем детали дополнительных работ
        updateAdditionalWorksDetails();
        
        // Рассчитываем и обновляем итоговые суммы
        calculateAndDisplayTotals();
        
        // Показываем кнопку расчета
        showCalculateButton(true);
        
        // Генерируем событие об обновлении цены
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

    function updatePrintComponentsDetails() {
        const itemsContainer = document.getElementById('print-components-items');
        const countElement = document.getElementById('print-components-count');
        
        if (!itemsContainer || !countElement) {
            console.warn('❌ Элементы для отображения печатных компонентов не найдены');
            return;
        }
        
        // Очищаем контейнер
        itemsContainer.innerHTML = '';
        
        // Обновляем количество
        const componentCount = priceCurrentPrintComponents.length;
        countElement.textContent = `${componentCount} ${getNoun(componentCount, 'компонент', 'компонента', 'компонентов')}`;
        console.log(`📊 Количество печатных компонентов: ${componentCount}`);
        
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
            
            // Форматируем цену компонента
            const componentPrice = parseFloat(component.total_circulation_price) || 0;
            totalPrice += componentPrice;
            const formattedPrice = componentPrice.toFixed(2);
            
            // Безопасное получение имени принтера
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

    function updateAdditionalWorksDetails() {
        const itemsContainer = document.getElementById('additional-works-items');
        const countElement = document.getElementById('additional-works-count');
        
        if (!itemsContainer || !countElement) {
            console.warn('❌ Элементы для отображения дополнительных работ не найдены');
            return;
        }
        
        // Очищаем контейнер
        itemsContainer.innerHTML = '';
        
        // Обновляем количество
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
        
        // Добавляем детали по каждой работе
        let totalPrice = 0;
        priceCurrentAdditionalWorks.forEach(work => {
            const itemElement = document.createElement('div');
            itemElement.className = 'category-item';
            
            // Форматируем цену работы
            const workPrice = parseFloat(work.price) || 0;
            totalPrice += workPrice;
            const formattedPrice = workPrice.toFixed(2);
            
            itemElement.innerHTML = `
                <div class="item-name">
                    <i class="fas fa-toolbox"></i>
                    <span>${work.number || 'Без номера'}: ${work.title || 'Без названия'}</span>
                </div>
                <div class="item-price">${formattedPrice} ₽</div>
            `;
            
            itemsContainer.appendChild(itemElement);
        });
        
        console.log(`💰 Общая стоимость дополнительных работ: ${totalPrice.toFixed(2)} ₽`);
    }

    function calculatePrintComponentsTotal() {
        let total = 0;
        priceCurrentPrintComponents.forEach(component => {
            const price = parseFloat(component.total_circulation_price) || 0;
            total += price;
        });
        console.log(`🧮 Расчет суммы печатных компонентов: ${total.toFixed(2)} ₽`);
        return total;
    }

    function calculateAdditionalWorksTotal() {
        let total = 0;
        priceCurrentAdditionalWorks.forEach(work => {
            const price = parseFloat(work.price) || 0;
            total += price;
        });
        console.log(`🧮 Расчет суммы дополнительных работ: ${total.toFixed(2)} ₽`);
        return total;
    }

    function calculateTotalPrice() {
        const total = calculatePrintComponentsTotal() + calculateAdditionalWorksTotal();
        console.log(`🧮 Общая сумма: ${total.toFixed(2)} ₽`);
        return total;
    }

    // ===== 5.9. ФУНКЦИЯ РАСЧЕТА И ОТОБРАЖЕНИЯ ИТОГОВЫХ СУММ =====

    function calculateAndDisplayTotals() {
        console.log('🧮 Начало расчета и отображения итоговых сумм...');
        
        // Рассчитываем суммы
        const printComponentsTotal = calculatePrintComponentsTotal();
        const additionalWorksTotal = calculateAdditionalWorksTotal();
        const totalPrice = calculateTotalPrice();
        
        console.log(`📊 Результаты расчета: 
            Печатные компоненты: ${printComponentsTotal.toFixed(2)} ₽
            Дополнительные работы: ${additionalWorksTotal.toFixed(2)} ₽
            Общая сумма: ${totalPrice.toFixed(2)} ₽`);
        
        // ВАЖНО: Поиск элементов в DOM с повторными попытками
        const printTotalElement = document.getElementById('price-print-components-total');
        const worksTotalElement = document.getElementById('additional-works-total');
        const totalPriceElement = document.getElementById('total-order-price');
        
        // Обновляем элемент суммы печатных компонентов
        if (printTotalElement) {
            printTotalElement.textContent = `${printComponentsTotal.toFixed(2)} ₽`;
            console.log(`✅ Обновлен price-print-components-total: ${printComponentsTotal.toFixed(2)} ₽`);
        } else {
            console.error('❌ Элемент price-print-components-total не найден!');
            // Пробуем найти через 100мс (на случай если DOM еще не полностью загружен)
            setTimeout(() => {
                const retryElement = document.getElementById('price-print-components-total');
                if (retryElement) {
                    retryElement.textContent = `${printComponentsTotal.toFixed(2)} ₽`;
                    console.log(`✅ Элемент price-print-components-total найден при повторной попытке`);
                }
            }, 100);
        }
        
        // ВАЖНО: Обновляем элемент суммы дополнительных работ
        if (worksTotalElement) {
            worksTotalElement.textContent = `${additionalWorksTotal.toFixed(2)} ₽`;
            console.log(`✅ Обновлен additional-works-total: ${additionalWorksTotal.toFixed(2)} ₽`);
        } else {
            console.error('❌ Элемент additional-works-total не найден!');
            // Пробуем найти через 100мс
            setTimeout(() => {
                const retryElement = document.getElementById('additional-works-total');
                if (retryElement) {
                    retryElement.textContent = `${additionalWorksTotal.toFixed(2)} ₽`;
                    console.log(`✅ Элемент additional-works-total найден при повторной попытке`);
                }
            }, 100);
        }
        
        // Обновляем элемент общей суммы
        if (totalPriceElement) {
            totalPriceElement.textContent = `${totalPrice.toFixed(2)} ₽`;
            console.log(`✅ Обновлен total-order-price: ${totalPrice.toFixed(2)} ₽`);
        }
        
        console.log(`✅ Расчет стоимости завершен`);
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

    // ===== 6. ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ СОСТОЯНИЯМИ ИНТЕРФЕЙСА =====

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
        // ВАЖНО: Используем правильные ID из СЕКЦИИ "ЦЕНА"
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
                retryBtn.addEventListener('click', function() {
                    console.log('🔄 Повторная попытка загрузки данных...');
                    loadPriceData(priceCurrentProschetId);
                });
            }
        }
    }

    function showCalculateButton(show) {
        const calculateBtn = document.getElementById('calculate-price-btn');
        if (calculateBtn) {
            calculateBtn.style.display = show ? 'inline-block' : 'none';
            calculateBtn.disabled = !show;
            console.log(`✅ Кнопка "Рассчитать": ${show ? 'показана' : 'скрыта'}`);
        }
    }

    // ===== 7. ОБРАБОТЧИКИ КНОПОК =====

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

    // ===== 8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

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

    // Функция для правильного склонения существительных
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

    // ===== 9. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВЗАИМОДЕЙСТВИЯ С ДРУГИМИ СЕКЦИЯМИ =====

    window.priceSection = {
        /**
         * Основная функция для обновления секции при выборе просчёта
         * @param {number} proschetId - ID выбранного просчёта
         * @param {HTMLElement} rowElement - DOM-элемент строки таблицы с просчётом
         */
        updateForProschet: function(proschetId, rowElement) {
            updatePriceForProschet(proschetId, rowElement);
        },
        
        /**
         * Функция сброса секции (когда просчёт не выбран)
         */
        reset: function() {
            showNoProschetSelectedMessage();
        },
        
        /**
         * Функция для получения текущего просчёта
         * @returns {number|null} ID текущего просчёта или null
         */
        getCurrentProschetId: function() {
            return priceCurrentProschetId;
        },
        
        /**
         * Функция для получения текущих данных
         * @returns {Object} Данные для расчета цены
         */
        getCurrentData: function() {
            return {
                printComponents: priceCurrentPrintComponents,
                additionalWorks: priceCurrentAdditionalWorks
            };
        },
        
        /**
         * Функция для ручного обновления отображения
         */
        refresh: function() {
            if (priceCurrentProschetId) {
                updatePriceDisplay();
            }
        },
        
        /**
         * Функция для получения общей стоимости
         * @returns {Object} Общие суммы
         */
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


// ===== 10. ОТЛАДОЧНЫЕ ФУНКЦИИ =====

/**
 * Функция для отладки - проверяет состояние секции "Цена"
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