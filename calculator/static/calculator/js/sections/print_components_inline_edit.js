/**
 * print_components_inline_edit.js - JavaScript для inline-редактирования компонентов печати
 * 
 * ИСПРАВЛЕНИЕ (24.02.2026):
 * - Добавлен экспорт состояния редактирования (printComponentsInlineEditState) для использования в print_components.js.
 *   Это позволит основному модулю проверять, не редактируется ли сейчас компонент, и не перезаписывать его DOM.
 * - Удалён глобальный обработчик mousedown, который преждевременно завершал редактирование при клике на выпадающий список.
 * - Вместо этого добавлен обработчик blur на редактируемый элемент (input/select). Теперь редактирование завершается только при потере фокуса или по клавишам Enter/Escape.
 * - Исправлено предзаполнение выпадающего списка бумаги (paper) при двойном клике: теперь корректно извлекается название бумаги из ячейки без примеси цены.
 * - Добавлены подробные комментарии для понимания кода новичками.
 * 
 * ОСНОВНЫЕ ВОЗМОЖНОСТИ:
 * 1. Двойной клик по ячейкам таблицы для редактирования принтера, бумаги, цены за лист.
 * 2. Выпадающие списки для выбора принтера и бумаги (данные загружаются с сервера).
 * 3. Модальное окно для добавления нового компонента печати.
 * 4. Автоматический расчёт цены за лист при выборе принтера в модальном окне.
 * 5. Удаление компонентов с подтверждением.
 * 
 * ИСПРАВЛЕНИЕ ПРОБЛЕМЫ С ОТОБРАЖЕНИЕМ КОЛИЧЕСТВА ЛИСТОВ:
 * - После успешного сохранения изменений (например, смена принтера) теперь полностью перезагружается
 *   таблица компонентов для текущего просчёта (вызов updateForProschet). Это гарантирует, что все данные,
 *   включая количество листов, цену за лист и общую стоимость, будут получены с сервера заново и отображены корректно.
 */

"use strict"; // Строгий режим – запрещает использование необъявленных переменных

// ============================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ
// ============================================================================

/**
 * Объект с URL-ами API эндпоинтов для работы с компонентами печати.
 * Все эндпоинты находятся в приложении calculator.
 * @constant {Object}
 */
const print_components_api_urls = {
    add: '/calculator/add-print-component/',           // POST: добавить компонент
    update: '/calculator/update-print-component/',      // POST: обновить поле компонента
    delete: '/calculator/delete-print-component/',      // POST: удалить компонент
    getPrinters: '/calculator/get-printers/',           // GET: список принтеров
    getPapers: '/calculator/get-papers/',               // GET: список бумаги
    getComponents: '/calculator/get-print-components/', // GET: компоненты для просчёта (используется в основном скрипте)
};

// Переменные для inline-редактирования

/** ID компонента, который сейчас редактируется (если есть). @type {string|null} */
let print_components_current_editing_id = null;

/** DOM-элемент ячейки, которая сейчас редактируется. @type {HTMLElement|null} */
let print_components_current_editing_element = null;

/** Исходное значение ячейки до начала редактирования (для отмены). @type {string|null} */
let print_components_original_value = null;

/** Тип редактируемого поля ('printer', 'paper', 'price' и т.д.). @type {string|null} */
let print_components_current_field_type = null;

/** Кэш списка принтеров, загруженных с сервера. @type {Array} */
let print_components_printers_list = [];

/** Кэш списка материалов (бумаги), загруженных с сервера. @type {Array} */
let print_components_papers_list = [];

/** Флаг, указывающий, что inline-редактирование уже инициализировано. @type {boolean} */
let print_components_initialized = false;

/** Блокировка повторного двойного клика (чтобы не открыть два редактора). @type {boolean} */
let print_components_dblclick_lock = false;

/** Флаг, указывающий, что в данный момент идёт редактирование. @type {boolean} */
let print_components_is_editing = false;

/** Флаг, что данные для выпадающих списков уже загружены. @type {boolean} */
let print_components_data_loaded = false;

// ============================================================================
// 2. ФУНКЦИЯ ДЛЯ РАСЧЁТА ЦЕНЫ НА ОСНОВЕ ТИРАЖА И ПРИНТЕРА
// ============================================================================

/**
 * Функция для автоматического расчёта цены за лист на основе:
 * 1. ID выбранного принтера
 * 2. Тиража из просчёта (circulation)
 * Использует API приложения print_price для расчёта по методу интерполяции
 * 
 * @param {number|string} printerId - ID выбранного принтера
 * @param {number|string} circulation - Тиража из просчёта
 * @param {string} modalId - Уникальный ID модального окна (для обновления поля)
 * @returns {Promise} - Promise с результатом расчёта (строка с ценой или null)
 */
function print_components_calculate_price_for_circulation(printerId, circulation, modalId) {
    // Логируем начало расчёта
    console.log(`💰 Запрос расчёта цены: принтер=${printerId}, тираж=${circulation}`);

    // Проверяем обязательные параметры
    if (!printerId || !circulation) {
        console.warn('❌ Не указан принтер или тираж для расчёта цены');
        return Promise.resolve(null); // Возвращаем Promise с null
    }

    // Преобразуем тираж в целое число
    const circulationNumber = parseInt(circulation);
    if (isNaN(circulationNumber) || circulationNumber <= 0) {
        console.warn(`⚠️ Некорректный тираж для расчёта: ${circulation}`);
        return Promise.resolve(null);
    }

    // Находим поле ввода цены по modalId (это поле будет обновлено)
    const priceInput = document.getElementById(`component-price-per-sheet-${modalId}`);
    if (!priceInput) {
        console.error('❌ Поле ввода цены не найдено');
        return Promise.resolve(null);
    }

    // Находим элементы для отображения информации о расчёте
    const calculationInfo = document.getElementById(`price-calculation-info-${modalId}`);
    const calculationDetails = document.getElementById(`calculation-details-${modalId}`);

    // Показываем статус "Расчёт..." в поле цены
    if (priceInput) {
        priceInput.value = 'Расчёт...';
        priceInput.style.color = '#666';      // Серый цвет текста
        priceInput.style.fontStyle = 'italic'; // Курсив
    }

    // Отображаем блок с информацией о расчёте
    if (calculationInfo) {
        calculationInfo.style.display = 'block';
    }

    // Вставляем сообщение о начале расчёта
    if (calculationDetails) {
        calculationDetails.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Расчёт цены для тиража ${circulationNumber} шт...
        `;
    }

    // Подготавливаем данные для отправки в API print_price
    const formData = new FormData();
    formData.append('arbitrary_copies', circulationNumber); // переданное количество копий (тираж)
    formData.append('csrfmiddlewaretoken', print_components_get_csrf_token()); // CSRF-токен

    console.log(`📤 Отправка запроса в print_price API: /print_price/api/calculate_arbitrary_price/${printerId}/`);

    // Отправляем POST-запрос в приложение print_price для расчёта цены
    return fetch(`/print_price/api/calculate_arbitrary_price/${printerId}/`, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest' // Помечаем как AJAX-запрос
        },
        body: formData
    })
    .then(response => {
        // Проверяем, что ответ успешный (статус 2xx)
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }
        return response.json(); // Парсим JSON-ответ
    })
    .then(data => {
        console.log('📊 Ответ от API расчёта цены:', data);

        if (data.success) {
            // Успешный расчёт – получаем рассчитанную цену
            const calculatedPrice = data.calculated_price;

            // Форматируем цену до двух знаков после запятой
            const formattedPrice = parseFloat(calculatedPrice).toFixed(2);

            // Обновляем поле ввода цены
            if (priceInput) {
                priceInput.value = formattedPrice;
                priceInput.style.color = '#0B8661';      // Зелёный цвет
                priceInput.style.fontStyle = 'normal';    // Обычный стиль
                priceInput.style.fontWeight = 'bold';     // Жирный шрифт
            }

            // Обновляем информацию о расчёте (успех)
            if (calculationInfo && calculationDetails) {
                calculationDetails.innerHTML = `
                    <i class="fas fa-check-circle" style="color: #4CAF50;"></i>
                    Цена рассчитана для тиража ${circulationNumber} шт: <strong>${formattedPrice} руб./лист</strong>
                    <br><small>На основе ${data.points_count || 0} опорных точек (${data.interpolation_method_display || 'линейная интерполяция'})</small>
                `;
                calculationInfo.style.backgroundColor = '#e8f5e9'; // Светло-зелёный фон
                calculationInfo.style.borderLeftColor = '#4CAF50'; // Зелёная полоса слева
            }

            console.log(`✅ Цена успешно рассчитана: ${formattedPrice} руб./лист`);
            print_components_show_notification(
                `Цена рассчитана: ${formattedPrice} руб./лист для тиража ${circulationNumber} шт`, 
                'success'
            );

            return formattedPrice; // Возвращаем цену как строку
        } else {
            // Ошибка расчёта (например, нет цен для принтера)
            console.warn('⚠️ Не удалось рассчитать цену:', data.error);

            // Восстанавливаем поле ввода
            if (priceInput) {
                priceInput.value = '0.00';
                priceInput.style.color = '#e74c3c'; // Красный цвет
                priceInput.style.fontStyle = 'normal';
            }

            // Обновляем информацию об ошибке
            if (calculationInfo && calculationDetails) {
                calculationDetails.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
                    Не удалось рассчитать цену: ${data.error || 'неизвестная ошибка'}
                `;
                calculationInfo.style.backgroundColor = '#ffebee'; // Светло-красный фон
                calculationInfo.style.borderLeftColor = '#e74c3c'; // Красная полоса
            }

            print_components_show_notification(
                `Не удалось рассчитать цену: ${data.error || 'неизвестная ошибка'}`,
                'warning'
            );

            return null;
        }
    })
    .catch(error => {
        // Ошибка сети или другой сбой
        console.error('❌ Ошибка сети при расчёте цены:', error);

        // Восстанавливаем поле ввода
        if (priceInput) {
            priceInput.value = '0.00';
            priceInput.style.color = '#e74c3c';
            priceInput.style.fontStyle = 'normal';
        }

        // Обновляем информацию об ошибке
        if (calculationInfo && calculationDetails) {
            calculationDetails.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
                Ошибка сети при расчёте цены. Проверьте подключение к интернету.
            `;
            calculationInfo.style.backgroundColor = '#ffebee';
            calculationInfo.style.borderLeftColor = '#e74c3c';
        }

        print_components_show_notification(
            'Ошибка сети при расчёте цены. Проверьте подключение.',
            'error'
        );

        return null;
    });
}

// ============================================================================
// 3. ФУНКЦИЯ СОЗДАНИЯ МОДАЛЬНОГО ОКНА ДЛЯ ДОБАВЛЕНИЯ КОМПОНЕНТА
// ============================================================================

/**
 * Функция создания модального окна для добавления компонента печати.
 * ОБНОВЛЕНО: Поле "Количество листов" удалено, так как оно теперь определяется
 * через приложение vichisliniya_listov после создания компонента.
 * 
 * @param {number|string} proschetId - ID просчёта, для которого добавляется компонент
 */
function print_components_create_add_modal(proschetId) {
    console.log(`🖨️ Создание модального окна добавления компонента для просчёта ID: ${proschetId}`);

    // Создаём уникальный идентификатор для этого модального окна (на основе времени)
    const modalId = `print-components-modal-${Date.now()}`;

    // Переменная для хранения тиража просчёта (значение по умолчанию 1)
    let proschetCirculation = 1;

    // Сначала получаем данные просчёта, чтобы узнать тираж
    console.log(`📋 Запрос данных просчёта ID: ${proschetId} для получения тиража`);

    fetch(`/calculator/get-proschet/${proschetId}/`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': print_components_get_csrf_token()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.proschet) {
            // Извлекаем тираж из ответа
            proschetCirculation = data.proschet.circulation || 1;
            console.log(`✅ Получен тираж просчёта: ${proschetCirculation} шт.`);
        } else {
            console.warn('⚠️ Не удалось получить данные просчёта, используем тираж по умолчанию: 1');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка при получении данных просчёта:', error);
    })
    .finally(() => {
        // Создаём HTML-структуру модального окна
        // Обратите внимание: поле "Количество листов" (sheet-count) отсутствует!
        const modalHTML = `
            <div class="print-components-modal-overlay active" id="${modalId}">
                <div class="print-components-modal active">
                    <div class="modal-header">
                        <h3>
                            <i class="fas fa-plus-circle"></i> 
                            Добавить компонент печати
                            <small style="font-size: 0.8em; color: #666; margin-left: 10px;">
                                (Тираж просчёта: ${proschetCirculation} шт.)
                            </small>
                        </h3>
                        <button type="button" class="modal-close-btn" id="modal-close-btn-${modalId}">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <form id="print-components-add-form-${modalId}" class="print-components-add-form">
                            <!-- Принтер (обязательное поле для расчёта цены) -->
                            <div class="form-group">
                                <label for="component-printer-${modalId}">
                                    <i class="fas fa-print"></i>
                                    Принтер *
                                    <span class="required-mark">*</span>
                                </label>
                                <select id="component-printer-${modalId}" class="modal-select" required>
                                    <option value="">-- Выберите принтер --</option>
                                    <!-- Принтеры будут добавлены динамически из JavaScript -->
                                </select>
                                <small class="form-hint">
                                    При выборе принтера цена за лист будет рассчитана автоматически
                                </small>
                            </div>
                            
                            <!-- Бумага (обязательное поле) -->
                            <div class="form-group">
                                <label for="component-paper-${modalId}">
                                    <i class="fas fa-file-alt"></i>
                                    Бумага *
                                    <span class="required-mark">*</span>
                                </label>
                                <select id="component-paper-${modalId}" class="modal-select" required>
                                    <option value="">-- Выберите бумагу --</option>
                                    <!-- Бумага будет добавлена динамически -->
                                </select>
                            </div>
                            
                            <!-- Цена за лист (автоматически рассчитывается, только для чтения) -->
                            <div class="form-group">
                                <label for="component-price-per-sheet-${modalId}">
                                    <i class="fas fa-ruble-sign"></i>
                                    Цена за лист (₽) *
                                    <span class="required-mark">*</span>
                                </label>
                                <input type="text" id="component-price-per-sheet-${modalId}" 
                                       class="modal-input price-readonly" 
                                       value="0.00"
                                       required 
                                       readonly
                                       title="Цена рассчитывается автоматически при выборе принтера">
                                
                                <!-- Блок информации о расчёте (изначально скрыт) -->
                                <div class="price-calculation-info" id="price-calculation-info-${modalId}" 
                                     style="display: none; margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px; border-left: 3px solid #2196F3;">
                                    <div id="calculation-details-${modalId}" style="font-size: 0.9em; color: #555;">
                                        <!-- Сюда будет вставляться информация о ходе расчёта -->
                                    </div>
                                </div>
                                
                                <small class="form-hint">
                                    Цена автоматически рассчитывается на основе принтера и тиража ${proschetCirculation} шт.
                                </small>
                            </div>
                            
                            <!-- Кнопки формы -->
                            <div class="form-footer">
                                <button type="button" class="modal-cancel-btn" id="modal-cancel-btn-${modalId}">
                                    <i class="fas fa-times"></i> Отмена
                                </button>
                                <button type="submit" class="modal-submit-btn" id="modal-submit-btn-${modalId}" disabled>
                                    <i class="fas fa-check"></i> Добавить
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // Создаём контейнер для модального окна и вставляем HTML
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer);

        // Получаем элементы формы по уникальным ID
        const printerSelect = document.getElementById(`component-printer-${modalId}`);
        const paperSelect = document.getElementById(`component-paper-${modalId}`);
        const priceInput = document.getElementById(`component-price-per-sheet-${modalId}`);
        const calculationInfo = document.getElementById(`price-calculation-info-${modalId}`);
        const calculationDetails = document.getElementById(`calculation-details-${modalId}`);
        const submitBtn = document.getElementById(`modal-submit-btn-${modalId}`);

        // Заполняем список принтеров данными из кэша
        if (printerSelect) {
            print_components_printers_list.forEach(printer => {
                const option = document.createElement('option');
                option.value = printer.id;
                option.textContent = printer.name;
                printerSelect.appendChild(option);
            });

            // Если принтеров нет, добавляем заглушку
            if (print_components_printers_list.length === 0) {
                const noPrinterOption = document.createElement('option');
                noPrinterOption.value = '';
                noPrinterOption.textContent = 'Нет доступных принтеров';
                noPrinterOption.disabled = true;
                printerSelect.appendChild(noPrinterOption);
            }
        }

        // Заполняем список бумаги данными из кэша
        if (paperSelect) {
            print_components_papers_list.forEach(paper => {
                const option = document.createElement('option');
                option.value = paper.id;
                option.textContent = paper.name;
                paperSelect.appendChild(option);
            });

            if (print_components_papers_list.length === 0) {
                const noPaperOption = document.createElement('option');
                noPaperOption.value = '';
                noPaperOption.textContent = 'Нет доступной бумаги';
                noPaperOption.disabled = true;
                paperSelect.appendChild(noPaperOption);
            }
        }

        // Обработчик изменения выбора принтера
        if (printerSelect) {
            printerSelect.addEventListener('change', function() {
                const selectedPrinterId = this.value;
                const selectedPrinterName = this.options[this.selectedIndex]?.textContent || '';

                if (selectedPrinterId) {
                    console.log(`🖨️ Выбран принтер: ${selectedPrinterName} (ID: ${selectedPrinterId})`);

                    // Сбрасываем цену перед новым расчётом
                    if (priceInput) {
                        priceInput.value = 'Расчёт...';
                        priceInput.style.color = '#666';
                    }

                    // Показываем блок информации о расчёте
                    if (calculationInfo && calculationDetails) {
                        calculationInfo.style.display = 'block';
                        calculationDetails.innerHTML = `
                            <i class="fas fa-spinner fa-spin"></i>
                            Расчёт цены для принтера "${selectedPrinterName}" и тиража ${proschetCirculation} шт...
                        `;
                    }

                    // Вызываем функцию расчёта цены
                    print_components_calculate_price_for_circulation(
                        selectedPrinterId, 
                        proschetCirculation, 
                        modalId
                    ).then(calculatedPrice => {
                        // Если цена рассчитана успешно, разблокируем кнопку отправки
                        if (calculatedPrice !== null && submitBtn) {
                            submitBtn.disabled = false;
                        } else {
                            submitBtn.disabled = true;
                        }
                    });
                } else {
                    // Если принтер снят, сбрасываем цену и блокируем кнопку
                    if (priceInput) {
                        priceInput.value = '0.00';
                        priceInput.style.color = '';
                        priceInput.style.fontStyle = '';
                    }
                    if (calculationInfo) {
                        calculationInfo.style.display = 'none';
                    }
                    if (submitBtn) {
                        submitBtn.disabled = true;
                    }
                }
            });
        }

        // Получаем элементы для управления модальным окном (оверлей, кнопки)
        const overlay = document.getElementById(modalId);
        const closeBtn = document.getElementById(`modal-close-btn-${modalId}`);
        const cancelBtn = document.getElementById(`modal-cancel-btn-${modalId}`);
        const form = document.getElementById(`print-components-add-form-${modalId}`);

        /**
         * Функция закрытия модального окна с анимацией
         */
        const closeModal = () => {
            if (overlay && overlay.parentNode) {
                overlay.classList.remove('active'); // убираем класс active для анимации
                const modal = overlay.querySelector('.print-components-modal');
                if (modal) modal.classList.remove('active');

                // Удаляем элемент из DOM после завершения анимации (300 мс)
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                }, 300);
            }
        };

        // Закрытие при клике на оверлей (вне окна)
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal();
                }
            });
        }

        // Закрытие по кнопке "крестик"
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        // Закрытие по кнопке "Отмена"
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }

        // Обработчик отправки формы (добавление компонента)
        if (form && submitBtn) {
            form.addEventListener('submit', (e) => {
                e.preventDefault(); // Предотвращаем стандартную отправку формы

                // Получаем значения из формы
                const printerId = printerSelect?.value || '';
                const paperId = paperSelect?.value || '';
                // ВАЖНО: поле sheet_count больше не используется, удалено из формы
                const pricePerSheet = priceInput?.value || '';

                // Валидация обязательных полей
                if (!printerId) {
                    print_components_show_notification('Выберите принтер', 'warning');
                    printerSelect.focus();
                    return;
                }
                if (!paperId) {
                    print_components_show_notification('Выберите бумагу', 'warning');
                    paperSelect.focus();
                    return;
                }
                if (!pricePerSheet || pricePerSheet === '0.00' || pricePerSheet === 'Расчёт...') {
                    print_components_show_notification('Цена за лист не рассчитана. Выберите принтер для расчета.', 'warning');
                    printerSelect.focus();
                    return;
                }

                // Преобразуем цену в число для проверки
                const priceNumber = parseFloat(pricePerSheet);
                if (isNaN(priceNumber) || priceNumber <= 0) {
                    print_components_show_notification('Некорректная цена за лист', 'warning');
                    return;
                }

                // Подготавливаем данные для отправки на сервер
                const formData = new FormData();
                formData.append('proschet_id', proschetId);
                formData.append('printer_id', printerId);
                formData.append('paper_id', paperId);
                // sheet_count не передаём – сервер установит None (будет получено из vichisliniya_listov)
                formData.append('price_per_sheet', priceNumber.toFixed(2));

                // Сохраняем исходный текст кнопки для восстановления
                const originalText = submitBtn.innerHTML;

                // Блокируем кнопку и меняем текст на индикатор загрузки
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
                submitBtn.disabled = true;

                // Отправляем POST-запрос на сервер
                fetch(print_components_api_urls.add, {
                    method: 'POST',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRFToken': print_components_get_csrf_token()
                    },
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        // Успех – показываем уведомление и закрываем окно
                        print_components_show_notification('Компонент успешно добавлен', 'success');
                        closeModal();

                        // Обновляем таблицу компонентов, вызывая функцию из основного скрипта
                        const proschetRow = document.querySelector('.proschet-row.selected');
                        if (proschetRow && window.printComponentsSection?.updateForProschet) {
                            window.printComponentsSection.updateForProschet(proschetId, proschetRow);
                        }
                    } else {
                        // Ошибка на сервере – восстанавливаем кнопку и показываем сообщение
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                        print_components_show_notification('Ошибка добавления: ' + data.message, 'error');
                    }
                })
                .catch(error => {
                    // Ошибка сети – восстанавливаем кнопку и показываем сообщение
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    print_components_show_notification('Ошибка сети при добавлении', 'error');
                });
            });
        }

        console.log('✅ Модальное окно добавления компонента создано с функцией авторасчёта цены');
    }); // конец .finally()
}

// ============================================================================
// 4. ОБРАБОТЧИК НАЖАТИЯ НА КНОПКУ ДОБАВЛЕНИЯ КОМПОНЕНТА
// ============================================================================

/**
 * Обработчик нажатия на кнопку добавления компонента печати.
 * Проверяет, что просчёт выбран, и вызывает создание модального окна.
 */
function print_components_handle_add_component() {
    console.log('🖨️ Обработчик добавления компонента печати вызван');

    // Получаем ID текущего просчёта из основного объекта printComponentsSection
    const currentProschetId = window.printComponentsSection?.getCurrentProschetId();

    if (!currentProschetId) {
        print_components_show_notification('Сначала выберите просчёт', 'warning');
        return;
    }

    // Дополнительная проверка готовности секции (если есть метод isReady)
    if (window.printComponentsSection?.isReady && !window.printComponentsSection.isReady()) {
        print_components_show_notification('Подождите, секция ещё загружается...', 'warning');
        return;
    }

    console.log(`🖨️ Создание модального окна для просчёта ID: ${currentProschetId}`);

    // Вызываем функцию создания модального окна
    print_components_create_add_modal(currentProschetId);
}

// ============================================================================
// 5. ФУНКЦИИ УВЕДОМЛЕНИЙ (всплывающие сообщения)
// ============================================================================

/**
 * Показывает временное уведомление в правом верхнем углу экрана.
 * 
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип сообщения: 'success', 'error', 'warning', 'info'
 */
function print_components_show_notification(message, type = 'info') {
    console.log(`💬 Уведомление [${type}]: ${message}`);

    // Создаём элемент уведомления
    const notification = document.createElement('div');

    // Определяем цвет фона и иконку в зависимости от типа
    let backgroundColor = '#2196F3'; // info – синий
    if (type === 'success') backgroundColor = '#4CAF50'; // зелёный
    else if (type === 'error') backgroundColor = '#f44336'; // красный
    else if (type === 'warning') backgroundColor = '#ff9800'; // оранжевый

    // Применяем стили
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

    notification.textContent = message; // Текст сообщения
    document.body.appendChild(notification); // Добавляем в DOM

    // Плавное появление
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);

    // Автоматическое скрытие через 3 секунды
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ============================================================================
// 6. ИНИЦИАЛИЗАЦИЯ INLINE-РЕДАКТИРОВАНИЯ
// ============================================================================

/**
 * Инициализация inline-редактирования компонентов печати.
 * Загружает данные для выпадающих списков, настраивает обработчики.
 */
function print_components_init_inline_edit() {
    console.log('🔧 Инициализация inline-редактирования...');

    // Предотвращаем повторную инициализацию
    if (print_components_initialized) {
        return;
    }

    // Загружаем списки принтеров и бумаги
    print_components_load_dropdown_data();

    // Настраиваем обработчики событий для таблицы
    print_components_setup_table_event_listeners();

    // Настраиваем глобальный обработчик для кнопок удаления
    print_components_setup_global_delete_handler();

    print_components_initialized = true;
    console.log('✅ Inline-редактирование инициализировано');
}

/**
 * Загрузка данных для выпадающих списков (принтеры и бумага) с сервера.
 */
function print_components_load_dropdown_data() {
    console.log('📥 Загрузка данных для выпадающих списков...');

    // Если данные уже загружены, не загружаем повторно
    if (print_components_data_loaded) {
        return;
    }

    // Запрос на получение списка принтеров
    fetch(print_components_api_urls.getPrinters, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': print_components_get_csrf_token()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            print_components_printers_list = data.printers || [];
            console.log(`✅ Загружено принтеров: ${print_components_printers_list.length} шт.`);
        } else {
            console.warn('⚠️ Не удалось загрузить список принтеров');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка загрузки принтеров:', error);
    });

    // Запрос на получение списка бумаги
    fetch(print_components_api_urls.getPapers, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': print_components_get_csrf_token()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            print_components_papers_list = data.papers || [];
            console.log(`✅ Загружено видов бумаги: ${print_components_papers_list.length} шт.`);
        } else {
            console.warn('⚠️ Не удалось загрузить список бумаги');
        }
    })
    .catch(error => {
        console.error('❌ Ошибка загрузки бумаги:', error);
    })
    .finally(() => {
        // Помечаем, что данные загружены (даже если ошибка, чтобы не пытаться снова)
        print_components_data_loaded = true;
    });
}

/**
 * Настройка обработчиков событий на таблице компонентов.
 * Двойной клик для редактирования, клик для выделения строки.
 */
function print_components_setup_table_event_listeners() {
    const tableBody = document.getElementById('print-components-table-body');

    if (!tableBody) {
        setTimeout(print_components_setup_table_event_listeners, 500);
        return;
    }

    tableBody.addEventListener('dblclick', function(event) {
        if (print_components_dblclick_lock) {
            return;
        }
        print_components_dblclick_lock = true;
        setTimeout(() => {
            print_components_dblclick_lock = false;
        }, 300);

        const cell = event.target.closest('td');
        const row = event.target.closest('tr');

        if (!cell || !row || cell.classList.contains('component-actions')) {
            return;
        }

        const componentId = row.dataset.componentId;
        if (!componentId) {
            return;
        }

        // Определяем индекс колонки
        const cellIndex = Array.from(row.children).indexOf(cell);
        let fieldName = '';
        let fieldType = 'text';

        // Соответствие индексов (с учётом новой колонки "Режим")
        // 0 – № компонента (не редактируется)
        // 1 – Принтер
        // 2 – Бумага
        // 3 – Количество листов (не редактируется)
        // 4 – Цена за лист (не редактируется)
        // 5 – Режим (НОВАЯ) – редактируем
        // 6 – Стоимость (не редактируется)
        // 7 – Действия (кнопки)
        switch (cellIndex) {
            case 0: return;
            case 1: fieldName = 'printer'; fieldType = 'printer'; break;
            case 2: fieldName = 'paper'; fieldType = 'paper'; break;
            case 3: return; // количество листов
            case 4: return; // цена за лист
            case 5: fieldName = 'printing_mode'; fieldType = 'printing_mode'; break; // НОВОЕ
            case 6: return; // стоимость
            case 7: return; // действия
            default: return;
        }

        print_components_start_edit(cell, componentId, fieldName, fieldType, row);
    });

    tableBody.addEventListener('click', function(event) {
        const row = event.target.closest('tr');
        if (row && !event.target.closest('.delete-component-btn')) {
            const allRows = tableBody.querySelectorAll('tr');
            allRows.forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
        }
    });
}

// ============================================================================
// 7. ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ КНОПОК УДАЛЕНИЯ
// ============================================================================

/**
 * Настройка глобального обработчика кликов для кнопок удаления компонентов.
 * Используется, потому что кнопки могут быть динамически пересозданы.
 */
function print_components_setup_global_delete_handler() {
    console.log('🔧 Настройка глобального обработчика для кнопок удаления...');

    const tableContainer = document.getElementById('print-components-container');

    // Если контейнер таблицы ещё не загружен, пробуем снова через 500 мс
    if (!tableContainer) {
        console.warn('❌ Контейнер таблицы не найден, пытаемся снова через 500мс');
        setTimeout(print_components_setup_global_delete_handler, 500);
        return;
    }

    // Удаляем предыдущий обработчик, если был, чтобы не было дубликатов
    tableContainer.removeEventListener('click', print_components_handle_delete_click_global);

    // Добавляем новый обработчик
    tableContainer.addEventListener('click', print_components_handle_delete_click_global);

    console.log('✅ Глобальный обработчик для кнопок удаления настроен');
}

/**
 * Обработчик клика по кнопке удаления компонента.
 * @param {Event} event - объект события
 */
function print_components_handle_delete_click_global(event) {
    const deleteBtn = event.target.closest('.delete-component-btn');

    if (deleteBtn) {
        event.preventDefault();      // предотвращаем возможные действия по умолчанию
        event.stopPropagation();     // не даём событию всплыть выше

        const componentId = deleteBtn.dataset.componentId;
        const row = deleteBtn.closest('tr');

        if (!componentId) {
            console.error('❌ Не удалось получить ID компонента из кнопки удаления');
            return;
        }

        // Запрашиваем подтверждение
        if (confirm('Вы уверены, что хотите удалить этот компонент печати?')) {
            print_components_delete_component(componentId, row);
        }
    }
}

// ============================================================================
// 8. ФУНКЦИИ INLINE-РЕДАКТИРОВАНИЯ
// ============================================================================

/**
 * Начинает редактирование ячейки.
 * 
 * @param {HTMLElement} cell - ячейка таблицы, которую редактируем
 * @param {string} componentId - ID компонента
 * @param {string} fieldName - имя поля ('printer', 'paper', 'price_per_sheet')
 * @param {string} fieldType - тип поля ('printer', 'paper', 'price')
 * @param {HTMLElement} row - строка таблицы
 */
function print_components_start_edit(cell, componentId, fieldName, fieldType, row) {
    console.log(`✏️ Начало редактирования: поле=${fieldName}, тип=${fieldType}, ID=${componentId}`);

    // Если уже редактируется другая ячейка, завершаем её с сохранением
    if (print_components_is_editing && print_components_current_editing_element !== cell) {
        print_components_finish_edit(true);
    }

    // Если это выпадающий список (принтер/бумага), а данные ещё не загружены – загружаем и ждём
    if ((fieldType === 'printer' || fieldType === 'paper') && !print_components_data_loaded) {
        cell.innerHTML = '<div style="padding: 5px; color: #666;"><i class="fas fa-spinner fa-spin"></i> Загрузка данных...</div>';

        // Загружаем данные с небольшой задержкой и пробуем снова
        setTimeout(() => {
            print_components_load_dropdown_data();
            setTimeout(() => {
                print_components_start_edit(cell, componentId, fieldName, fieldType, row);
            }, 1000);
        }, 300);
        return;
    }

    // Сохраняем текущее состояние редактирования
    print_components_current_editing_id = componentId;
    print_components_current_editing_element = cell;
    
    // ВАЖНО: для поля бумаги нам нужно сохранить только название, без цены, чтобы правильно выбрать опцию в выпадающем списке.
    // Ячейка бумаги может содержать HTML вида "Бумага офсетная<br><small>25.00 ₽/лист</small>".
    // Используем специальную функцию для извлечения чистого названия.
    if (fieldType === 'paper') {
        print_components_original_value = print_components_extract_paper_name(cell.innerHTML);
    } else {
        print_components_original_value = cell.textContent.trim(); // исходное значение для отмены
    }
    
    print_components_current_field_type = fieldType;
    print_components_is_editing = true;

    // Добавляем класс для стилизации редактируемой ячейки
    cell.classList.add('editing-cell');

    // Очищаем содержимое ячейки
    cell.innerHTML = '';

    let inputElement;

    // Создаём соответствующий элемент ввода в зависимости от типа поля
    if (fieldType === 'printer') {
        inputElement = print_components_create_printer_dropdown(cell);
    } else if (fieldType === 'paper') {
        inputElement = print_components_create_paper_dropdown(cell);
    } else if (fieldType === 'printing_mode') {          // <--- ДОБАВЛЕННАЯ ВЕТКА
        inputElement = print_components_create_mode_dropdown(cell);
    } else if (fieldType === 'number') {
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.min = '1';
        inputElement.step = '1';
        inputElement.value = print_components_extract_number(print_components_original_value);
        inputElement.className = 'inline-edit-input';
    } else if (fieldType === 'price') {
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.min = '0';
        inputElement.step = '0.01';
        inputElement.value = print_components_extract_price(print_components_original_value);
        inputElement.className = 'inline-edit-input';
    } else {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = print_components_original_value;
        inputElement.className = 'inline-edit-input';
    }

    // Добавляем элемент в ячейку
    cell.appendChild(inputElement);

    // Добавляем обработчик blur для завершения редактирования
    inputElement.addEventListener('blur', function() {
        setTimeout(() => {
            if (print_components_is_editing && print_components_current_editing_element === cell) {
                print_components_finish_edit(true);
            }
        }, 100);
    });

    // Обработчик клавиш внутри поля ввода
    inputElement.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            print_components_finish_edit(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            print_components_finish_edit(false);
        }
    });

    // Устанавливаем фокус на элемент ввода после небольшой задержки
    setTimeout(() => {
        inputElement.focus();
        if (inputElement.tagName === 'INPUT') {
            inputElement.select(); // выделяем текст
        }
    }, 10);
}

/**
 * Извлекает чистое название бумаги из HTML-содержимого ячейки.
 * Предполагается, что ячейка имеет формат: "Название бумаги<br><small>цена</small>"
 * @param {string} html - innerHTML ячейки
 * @returns {string} - название бумаги (без цены)
 */
function print_components_extract_paper_name(html) {
    // Пытаемся найти текст до тега <br>
    const brIndex = html.indexOf('<br');
    if (brIndex !== -1) {
        return html.substring(0, brIndex).trim();
    }
    // Если нет <br>, просто возвращаем текст без HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent.trim();
}

/**
 * Создаёт выпадающий список для выбора принтера.
 * @param {HTMLElement} cell - ячейка, в которую будет вставлен список (не используется, но передаётся для контекста)
 * @returns {HTMLSelectElement} элемент select
 */
function print_components_create_printer_dropdown(cell) {
    const select = document.createElement('select');
    select.className = 'inline-edit-select';

    // Пустой пункт для возможности снять выбор
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Выберите принтер';
    select.appendChild(emptyOption);

    if (print_components_printers_list.length === 0) {
        // Если принтеров нет, показываем заглушку
        const noDataOption = document.createElement('option');
        noDataOption.value = '';
        noDataOption.textContent = 'Нет доступных принтеров';
        noDataOption.disabled = true;
        select.appendChild(noDataOption);
    } else {
        const currentValue = print_components_original_value; // исходное название принтера
        let found = false;

        // Добавляем все принтеры из списка
        print_components_printers_list.forEach(printer => {
            const option = document.createElement('option');
            option.value = printer.id;
            option.textContent = printer.name;

            // Если название совпадает с текущим значением, делаем его выбранным
            if (currentValue && printer.name === currentValue) {
                option.selected = true;
                found = true;
            }

            select.appendChild(option);
        });

        // Если текущее значение не соответствует ни одному принтеру (например, удалённый принтер),
        // добавляем его как заблокированный вариант
        if (currentValue && !found && currentValue !== 'Принтер не выбран') {
            const disabledOption = document.createElement('option');
            disabledOption.value = '';
            disabledOption.textContent = currentValue;
            disabledOption.selected = true;
            disabledOption.disabled = true;
            disabledOption.style.color = '#999';
            select.appendChild(disabledOption);
        }
    }

    return select;
}

/**
 * Создаёт выпадающий список для выбора бумаги.
 * @param {HTMLElement} cell - ячейка
 * @returns {HTMLSelectElement}
 */
function print_components_create_paper_dropdown(cell) {
    const select = document.createElement('select');
    select.className = 'inline-edit-select';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Выберите бумагу';
    select.appendChild(emptyOption);

    if (print_components_papers_list.length === 0) {
        const noDataOption = document.createElement('option');
        noDataOption.value = '';
        noDataOption.textContent = 'Нет доступной бумаги';
        noDataOption.disabled = true;
        select.appendChild(noDataOption);
    } else {
        // currentValue содержит название бумаги (без цены), извлечённое ранее
        const currentValue = print_components_original_value;
        let found = false;

        print_components_papers_list.forEach(paper => {
            const option = document.createElement('option');
            option.value = paper.id;
            option.textContent = paper.name;

            // Сравниваем название (регистронезависимо, с обрезанием пробелов)
            if (currentValue && paper.name.trim().toLowerCase() === currentValue.trim().toLowerCase()) {
                option.selected = true;
                found = true;
            }

            select.appendChild(option);
        });

        // Если текущее значение не соответствует ни одной бумаге, добавляем его как недоступный вариант
        if (currentValue && !found && currentValue !== 'Бумага не выбрана') {
            const disabledOption = document.createElement('option');
            disabledOption.value = '';
            disabledOption.textContent = currentValue;
            disabledOption.selected = true;
            disabledOption.disabled = true;
            disabledOption.style.color = '#999';
            select.appendChild(disabledOption);
        }
    }

    return select;
}

/**
 * НОВАЯ ФУНКЦИЯ: создаёт выпадающий список для выбора режима печати.
 * @param {HTMLElement} cell - ячейка
 * @returns {HTMLSelectElement}
 */
function print_components_create_mode_dropdown(cell) {
    const select = document.createElement('select');
    select.className = 'inline-edit-select';

    const optionSingle = document.createElement('option');
    optionSingle.value = 'single';
    optionSingle.textContent = 'Односторонняя';
    select.appendChild(optionSingle);

    const optionDuplex = document.createElement('option');
    optionDuplex.value = 'duplex';
    optionDuplex.textContent = 'Двусторонняя';
    select.appendChild(optionDuplex);

    // Устанавливаем выбранное значение на основе исходного
    const currentValue = print_components_original_value;
    if (currentValue && currentValue.toLowerCase().includes('двуст')) {
        optionDuplex.selected = true;
    } else {
        optionSingle.selected = true;
    }

    return select;
}


/**
 * Извлекает целое число из текста (удаляет всё, кроме цифр).
 * @param {string} text - исходный текст
 * @returns {number} извлечённое число или 1, если не удалось
 */
function print_components_extract_number(text) {
    const numberString = text.replace(/[^\d]/g, ''); // оставляем только цифры
    return numberString ? parseInt(numberString, 10) : 1;
}

/**
 * Извлекает десятичное число (цену) из текста.
 * @param {string} text - исходный текст (например, "150.50 ₽")
 * @returns {number} цена или 0.00
 */
function print_components_extract_price(text) {
    // Убираем всё, кроме цифр, точки и запятой; заменяем запятую на точку
    const priceString = text.replace(/[^\d.,]/g, '').replace(',', '.');
    return priceString ? parseFloat(priceString) : 0.00;
}

/**
 * Завершает редактирование ячейки.
 * @param {boolean} save - true – сохранить изменения, false – отменить
 */
function print_components_finish_edit(save) {
    if (!print_components_is_editing || !print_components_current_editing_element) {
        return;
    }

    const cell = print_components_current_editing_element;
    const componentId = print_components_current_editing_id;
    const fieldType = print_components_current_field_type;

    // Определяем имя поля по индексу колонки (с учётом новой колонки)
    let fieldName = '';
    const cellIndex = Array.from(cell.parentElement.children).indexOf(cell);

    switch (cellIndex) {
        case 1: fieldName = 'printer'; break;
        case 2: fieldName = 'paper'; break;
        case 3: return;
        case 4: return;
        case 5: fieldName = 'printing_mode'; break; // НОВОЕ
        case 6: return;
        case 7: return;
        default:
            print_components_cancel_edit();
            return;
    }

    if (save) {
        let inputElement = cell.querySelector('input, select');

        if (!inputElement) {
            console.log('⚠️ Элемент ввода не найден, отменяем редактирование');
            print_components_cancel_edit();
            return;
        }

        let newValue = '';
        let displayText = '';

        if (inputElement.tagName === 'SELECT') {
            const selectedOption = inputElement.options[inputElement.selectedIndex];
            newValue = selectedOption.value;
            displayText = selectedOption.textContent;

            if (newValue === '') {
                displayText = fieldType === 'printer' ? 'Принтер не выбран' : 'Бумага не выбрана';
            }
        } else {
            newValue = inputElement.value.trim();

            if (fieldType === 'number') {
                displayText = newValue;
            } else if (fieldType === 'price') {
                displayText = `${parseFloat(newValue || 0).toFixed(2)} ₽`;
            } else {
                displayText = newValue;
            }
        }

        if (!print_components_validate_value(newValue, fieldType)) {
            print_components_show_notification('Некорректное значение', 'error');
            inputElement.focus();
            return;
        }

        if (print_components_has_value_changed(newValue, fieldType)) {
            print_components_save_to_server(componentId, fieldName, newValue, displayText, cell);
        } else {
            print_components_cancel_edit();
        }
    } else {
        print_components_cancel_edit();
    }
}

/**
 * Проверяет корректность введённого значения.
 * @param {string} value - введённое значение
 * @param {string} fieldType - тип поля
 * @returns {boolean} true, если значение допустимо
 */
function print_components_validate_value(value, fieldType) {
    // Для выпадающих списков любое значение допустимо (даже пустое)
    if (fieldType === 'printer' || fieldType === 'paper') {
        return true;
    }

    // Пустое значение не допускается (кроме '0' для цены)
    if (!value && value !== '0') {
        return false;
    }

    switch (fieldType) {
        case 'number':
            const intValue = parseInt(value, 10);
            return !isNaN(intValue) && intValue > 0;
        case 'price':
            const floatValue = parseFloat(value);
            return !isNaN(floatValue) && floatValue >= 0;
        default:
            return value.length > 0;
    }
}

/**
 * Проверяет, изменилось ли значение по сравнению с исходным.
 * @param {string} newValue - новое значение
 * @param {string} fieldType - тип поля
 * @returns {boolean} true, если значение изменилось
 */
function print_components_has_value_changed(newValue, fieldType) {
    if (fieldType === 'number') {
        const originalNumber = print_components_extract_number(print_components_original_value);
        return parseInt(newValue, 10) !== originalNumber;
    }

    if (fieldType === 'price') {
        const originalPrice = print_components_extract_price(print_components_original_value);
        return parseFloat(newValue) !== originalPrice;
    }

    if (fieldType === 'printing_mode') {
        // Сравниваем строки
        const originalText = print_components_original_value;
        const newText = (newValue === 'duplex') ? 'Двуст.' : 'Одност.';
        return originalText !== newText;
    }

    return newValue !== print_components_original_value;
}

/**
 * Отправляет изменённое значение на сервер и обновляет ячейку.
 * @param {string} componentId - ID компонента
 * @param {string} fieldName - имя поля
 * @param {string} fieldValue - новое значение (для сервера)
 * @param {string} displayValue - текст для отображения в ячейке
 * @param {HTMLElement} cell - ячейка, которую обновляем
 */
function print_components_save_to_server(componentId, fieldName, fieldValue, displayValue, cell) {
    // Показываем индикатор сохранения
    cell.innerHTML = '<div style="padding: 5px; color: #3498db;"><i class="fas fa-spinner fa-spin"></i> Сохранение...</div>';

    // Подготавливаем данные для отправки
    const formData = new FormData();
    formData.append('component_id', componentId);
    formData.append('field_name', fieldName);
    formData.append('field_value', fieldValue);

    // Отправляем POST-запрос на сервер
    fetch(print_components_api_urls.update, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': print_components_get_csrf_token()
        },
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errData => {
                throw new Error(errData.message || `HTTP ошибка: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            // Успех – показываем уведомление
            print_components_show_notification('Изменения сохранены', 'success');

            // Сбрасываем состояние редактирования
            print_components_reset_editing_state();

            // ===== 1. НЕМЕДЛЕННОЕ ОБНОВЛЕНИЕ СЕКЦИИ "ВЫЧИСЛЕНИЯ ЛИСТОВ" =====
            if (window.vichisliniyaListov && typeof window.vichisliniyaListov.loadVichisliniyaListovParameters === 'function') {
                window.vichisliniyaListov.loadVichisliniyaListovParameters(componentId);
                console.log(`📤 Обновлена секция вычислений листов для компонента ${componentId}`);
            } else {
                console.warn('⚠️ Функция loadVichisliniyaListovParameters не найдена в объекте vichisliniyaListov');
            }

            // ===== 2. МАССОВЫЙ ПЕРЕСЧЁТ ДЛЯ ОБНОВЛЕНИЯ ТАБЛИЦЫ КОМПОНЕНТОВ =====
            const proschetId = window.printComponentsSection?.getCurrentProschetId();
            const circulation = window.productSection?.getCurrentCirculation();
            if (proschetId && circulation) {
                // Вызываем массовый пересчёт – он обновит все компоненты и отправит события
                window.printComponentsSection.recalculateAllComponentsForCirculation(proschetId, circulation);
                console.log(`📤 Запущен массовый пересчёт для просчёта ${proschetId} после изменения компонента ${componentId}`);
            } else {
                // Если не удалось получить ID просчёта или тираж, просто перезагружаем таблицу
                console.warn('⚠️ Не удалось получить ID просчёта или тираж, выполняем обычную перезагрузку компонентов');
                if (proschetId) {
                    const proschetRow = document.querySelector('.proschet-row.selected');
                    if (proschetRow && window.printComponentsSection?.updateForProschet) {
                        window.printComponentsSection.updateForProschet(proschetId, proschetRow);
                    }
                }
            }

            // Восстанавливаем содержимое ячейки (отображаем новое значение)
            cell.innerHTML = displayValue;
            cell.classList.remove('editing-cell');
        } else {
            // Ошибка на сервере – показываем исходное значение красным
            cell.innerHTML = `<span style="color: #e74c3c;">${print_components_original_value}</span>`;
            print_components_show_notification('Ошибка сохранения: ' + data.message, 'error');

            setTimeout(() => {
                cell.innerHTML = print_components_original_value;
                cell.classList.remove('editing-cell');
                print_components_reset_editing_state();
            }, 2000);
        }
    })
    .catch(error => {
        // Ошибка сети – показываем сообщение
        console.error('❌ Ошибка при сохранении:', error);
        cell.innerHTML = `<span style="color: #e74c3c;">Ошибка сети</span>`;
        print_components_show_notification('Ошибка сети при сохранении', 'error');

        setTimeout(() => {
            cell.innerHTML = print_components_original_value;
            cell.classList.remove('editing-cell');
            print_components_reset_editing_state();
        }, 2000);
    })
    .finally(() => {
        print_components_reset_editing_state();
    });
}

/**
 * Отменяет редактирование без сохранения.
 */
function print_components_cancel_edit() {
    if (!print_components_is_editing || !print_components_current_editing_element) {
        return;
    }

    const cell = print_components_current_editing_element;
    cell.innerHTML = print_components_original_value; // возвращаем исходное значение
    cell.classList.remove('editing-cell');

    print_components_reset_editing_state();
}

/**
 * Сбрасывает все переменные состояния редактирования.
 */
function print_components_reset_editing_state() {
    print_components_current_editing_id = null;
    print_components_current_editing_element = null;
    print_components_original_value = null;
    print_components_current_field_type = null;
    print_components_is_editing = false;
}

// ============================================================================
// 9. ФУНКЦИИ УДАЛЕНИЯ КОМПОНЕНТОВ
// ============================================================================

/**
 * Удаляет компонент печати (мягкое удаление).
 * @param {string} componentId - ID компонента
 * @param {HTMLElement} row - строка таблицы, которая удаляется (для визуальной обратной связи)
 */
function print_components_delete_component(componentId, row) {
    const originalHTML = row.innerHTML; // сохраняем для восстановления в случае ошибки
    row.innerHTML = '<td colspan="7" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Удаление...</td>';

    const formData = new FormData();
    formData.append('component_id', componentId);

    fetch(print_components_api_urls.delete, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': print_components_get_csrf_token()
        },
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            print_components_show_notification('Компонент успешно удален', 'success');

            // Обновляем таблицу компонентов для текущего просчёта
            const currentProschetId = window.printComponentsSection?.getCurrentProschetId();
            if (currentProschetId) {
                const proschetRow = document.querySelector('.proschet-row.selected');
                if (proschetRow && window.printComponentsSection?.updateForProschet) {
                    window.printComponentsSection.updateForProschet(currentProschetId, proschetRow);
                }
            }
        } else {
            // Восстанавливаем строку при ошибке
            row.innerHTML = originalHTML;
            print_components_show_notification('Ошибка удаления: ' + data.message, 'error');
        }
    })
    .catch(error => {
        row.innerHTML = originalHTML;
        print_components_show_notification('Ошибка сети при удалении', 'error');
    });
}

// ============================================================================
// 10. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Получает CSRF-токен из meta-тега или cookies.
 * @returns {string} CSRF-токен
 */
function print_components_get_csrf_token() {
    // Пробуем получить из meta-тега
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) {
        return metaToken.getAttribute('content');
    }

    // Ищем в cookies
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith('csrftoken=')) {
            return decodeURIComponent(cookie.substring('csrftoken='.length));
        }
    }

    return '';
}

// ============================================================================
// 11. ЭКСПОРТ СОСТОЯНИЯ РЕДАКТИРОВАНИЯ ДЛЯ ДРУГИХ МОДУЛЕЙ
// ============================================================================

// ИСПРАВЛЕНИЕ: экспортируем объект с функциями доступа к состоянию редактирования.
// Это позволит основному модулю print_components.js проверять, не редактируется ли компонент,
// и не перезаписывать его DOM во время обновлений.
window.printComponentsInlineEditState = {
    isEditing: () => print_components_is_editing,
    getEditingComponentId: () => print_components_current_editing_id
};

// ============================================================================
// 12. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ DOM
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Загрузка inline-редактирования компонентов печати...');

    setTimeout(() => {
        print_components_init_inline_edit();

        window.print_components_handle_add_component = print_components_handle_add_component;
        window.print_components_create_add_modal = print_components_create_add_modal;
        window.print_components_show_notification = print_components_show_notification;

        window.printComponentsInlineEdit = {
            init: print_components_init_inline_edit,
            showNotification: print_components_show_notification,
            handleAddComponent: print_components_handle_add_component,
            createAddModal: print_components_create_add_modal
        };

        console.log('✅ Inline-редактирование компонентов печати готово');
    }, 1000);
});

// ============================================================================
// 13. МОДИФИКАЦИЯ ФУНКЦИИ ОБНОВЛЕНИЯ (для поддержки динамической перезагрузки)
// ============================================================================

/**
 * Этот блок переопределяет метод updateForProschet из основного скрипта,
 * чтобы после обновления таблицы заново инициализировать inline-редактирование.
 * Это гарантирует, что новые строки таблицы будут реагировать на двойной клик.
 */
setTimeout(() => {
    const originalUpdateFunction = window.printComponentsSection?.updateForProschet;

    if (originalUpdateFunction) {
        window.printComponentsSection.updateForProschet = function(proschetId, rowElement) {
            originalUpdateFunction.call(this, proschetId, rowElement);
            setTimeout(() => {
                print_components_initialized = false;
                print_components_init_inline_edit();
            }, 500);
        };
    }
}, 2000);