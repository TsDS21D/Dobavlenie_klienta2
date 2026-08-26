/**
 * print_components_inline_edit.js - JavaScript для inline-редактирования компонентов печати
 * 
 * ОСНОВНЫЕ ВОЗМОЖНОСТИ:
 * - Двойной клик по ячейкам таблицы для редактирования принтера, бумаги, типа печати, режима печати.
 * - Выпадающие списки для выбора принтера, бумаги, типа печати, режима печати.
 * - Модальное окно для добавления нового компонента печати (с выбором типа печати).
 * - Автоматический расчёт цены за лист при выборе принтера и типа печати в модальном окне.
 * - Удаление компонентов с подтверждением.
 * 
 * ИСПРАВЛЕНИЯ ДЛЯ ПОДДЕРЖКИ Ч/Б ПЕЧАТИ (06.04.2026):
 * - В модальное окно добавления компонента добавлен выпадающий список "Тип печати".
 * - При изменении принтера или типа печати цена пересчитывается с учётом выбранного типа.
 * - В inline-редактирование добавлена возможность редактировать тип печати.
 * - Индексы колонок в switch приведены в соответствие с новой структурой таблицы:
 *   0 - № компонента (не редактируется)
 *   1 - Принтер (редактируется)
 *   2 - Бумага (редактируется)
 *   3 - Тип печати (редактируется)  <-- НОВАЯ КОЛОНКА
 *   4 - Листов (не редактируется)
 *   5 - Себестоимость (не редактируется)
 *   6 - Наценка (не редактируется)
 *   7 - Цена (не редактируется)
 *   8 - Прибыль (не редактируется)
 *   9 - Режим печати (редактируется)
 *   10 - Стоимость (не редактируется)
 *   11 - Действия (не редактируется)
 * 
 * ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ для понимания новичками.
 */

// Режим строгого соответствия стандартам JavaScript – помогает отлавливать ошибки
"use strict";

// ============================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ
// ============================================================================

/**
 * Объект с URL-ами API эндпоинтов для работы с компонентами печати.
 * @constant {Object}
 */
const print_components_api_urls = {
    add: '/calculator/add-print-component/',           // Добавление нового компонента
    update: '/calculator/update-print-component/',    // Обновление существующего компонента
    delete: '/calculator/delete-print-component/',    // Удаление компонента
    getPrinters: '/calculator/get-printers/',         // Получение списка принтеров
    getPapers: '/calculator/get-papers/',             // Получение списка бумаги
    getComponents: '/calculator/get-print-components/', // Получение списка компонентов
};

// Переменные для inline-редактирования (хранят состояние текущего редактирования)
let print_components_current_editing_id = null;          // ID редактируемого компонента
let print_components_current_editing_element = null;     // DOM-элемент ячейки, которую редактируем
let print_components_original_value = null;              // Исходное значение (для отмены)
let print_components_current_field_type = null;          // Тип поля ('printer', 'paper', 'print_type', 'printing_mode')
let print_components_is_editing = false;                 // Флаг, идёт ли редактирование (блокирует другие операции)
let print_components_initialized = false;                // Флаг инициализации модуля
let print_components_dblclick_lock = false;              // Блокировка двойного клика (чтобы не срабатывал дважды)
let print_components_data_loaded = false;                // Загружены ли справочные данные (принтеры, бумага)

// Кэши данных для выпадающих списков (чтобы не загружать с сервера каждый раз)
let print_components_printers_list = [];                 // Список принтеров {id, name, ...}
let print_components_papers_list = [];                   // Список бумаги {id, name, price, ...}

// ============================================================================
// 2. ФУНКЦИЯ ДЛЯ РАСЧЁТА ЦЕНЫ (используется в модальном окне)
// ============================================================================

/**
 * Рассчитывает цену за лист для заданного принтера, типа печати и тиража.
 * Вызывается при выборе принтера или типа печати в модальном окне.
 *
 * @param {string|number} printerId - ID выбранного принтера
 * @param {string} printType - Тип печати ('color' или 'bw')
 * @param {number} circulation - Тираж просчёта (количество экземпляров)
 * @param {string} modalId - Уникальный идентификатор модального окна (для поиска элементов)
 * @returns {Promise<number|null>} - Обещание с рассчитанной ценой или null при ошибке
 */
function print_components_calculate_price_for_circulation(printerId, printType, circulation, modalId) {
    // Логируем начало запроса для отладки
    console.log(`💰 Запрос расчёта цены: принтер=${printerId}, тип=${printType}, тираж=${circulation}`);

    // Находим элементы в модальном окне, куда будем выводить цену и информацию о расчёте
    const priceInput = document.getElementById(`component-price-per-sheet-${modalId}`);
    const calculationInfo = document.getElementById(`price-calculation-info-${modalId}`);
    const calculationDetails = document.getElementById(`calculation-details-${modalId}`);

    // --- Блокируем поля и показываем индикатор "Расчёт..." ---
    if (priceInput) {
        priceInput.value = 'Расчёт...';          // Временный текст
        priceInput.style.color = '#666';         // Серый цвет – ожидание
        priceInput.disabled = true;              // Запрещаем ручное редактирование
    }
    if (calculationInfo) calculationInfo.style.display = 'block'; // Показываем блок с деталями
    if (calculationDetails) {
        calculationDetails.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Расчёт цены для тиража ${circulation} шт., тип: ${printType === 'color' ? 'цветная' : 'ч/б'}...`;
    }

    // --- Подготавливаем данные для отправки на сервер ---
    const formData = new FormData();
    formData.append('arbitrary_copies', circulation);
    formData.append('print_type', printType);           // Передаём тип печати (цветная/ч/б)
    formData.append('csrfmiddlewaretoken', print_components_get_csrf_token());

    // --- Отправляем POST-запрос к эндпоинту print_price ---
    return fetch(`/print_price/api/calculate_arbitrary_price/${printerId}/`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: formData
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`); // Если ответ не 2xx – ошибка
        return response.json(); // Парсим JSON
    })
    .then(data => {
        // ========== ОСНОВНОЕ ИСПРАВЛЕНИЕ ==========
        // Сервер возвращает success: true и поле calculated_price_display (строку с ценой и "руб./лист").
        // Числового поля calculated_price может не быть, поэтому извлекаем цену из строки.
        if (data.success) {
            let price = null;

            // 1) Пытаемся взять числовое поле calculated_price (если сервер его добавит в будущем)
            if (data.calculated_price !== undefined && data.calculated_price !== null) {
                price = parseFloat(data.calculated_price);
            }
            // 2) Если не получилось – извлекаем число из calculated_price_display
            else if (data.calculated_price_display) {
                // Ищем первое число в строке (целое или дробное, с точкой или запятой)
                const match = data.calculated_price_display.match(/(\d+(?:[.,]\d+)?)/);
                if (match) {
                    // Заменяем запятую на точку (для парсинга дробных чисел)
                    price = parseFloat(match[1].replace(',', '.'));
                }
            }

            // Если цену удалось получить и это валидное число – отображаем результат
            if (price !== null && !isNaN(price)) {
                const formattedPrice = price.toFixed(2); // Округляем до двух знаков
                if (priceInput) {
                    priceInput.value = formattedPrice;
                    priceInput.style.color = '#0B8661';   // Зелёный – успех
                    priceInput.disabled = false;          // Разблокируем (хотя оно readonly)
                }
                if (calculationDetails) {
                    calculationDetails.innerHTML = `
                        <i class="fas fa-check-circle" style="color: #4CAF50;"></i>
                        Цена рассчитана: <strong>${formattedPrice} руб./лист</strong>
                        <br><small>${data.interpolation_method_display || 'Метод интерполяции'} (тираж ${circulation} шт.)</small>
                    `;
                    calculationInfo.style.backgroundColor = '#e8f5e9'; // Светло-зелёный фон
                }
                return price; // Возвращаем число – успешное завершение
            }
        }

        // Если мы здесь – значит не удалось извлечь цену (data.success === false или нет данных)
        const errorMsg = data.error || data.message || 'Не удалось рассчитать цену';
        console.error('Ошибка расчёта цены от сервера:', errorMsg, data);
        throw new Error(errorMsg);
    })
    .catch(error => {
        // Обрабатываем любые ошибки: сетевые, от сервера, парсинга и т.д.
        console.error('Ошибка расчёта цены:', error);
        if (priceInput) {
            priceInput.value = '0.00';
            priceInput.style.color = '#e74c3c';       // Красный – ошибка
            priceInput.disabled = false;
        }
        if (calculationDetails) {
            calculationDetails.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i> ${error.message}`;
            calculationInfo.style.backgroundColor = '#ffebee'; // Светло-красный фон
        }
        return null; // Возвращаем null, сигнализируя о неудаче
    });
}

// ============================================================================
// 3. ФУНКЦИЯ СОЗДАНИЯ МОДАЛЬНОГО ОКНА ДЛЯ ДОБАВЛЕНИЯ КОМПОНЕНТА
// ============================================================================

/**
 * Создаёт модальное окно для добавления нового компонента печати.
 * Сначала загружает тираж просчёта, затем создаёт окно с переданным тиражом.
 * 
 * @param {string|number} proschetId - ID просчёта, для которого добавляется компонент
 */
function print_components_create_add_modal(proschetId) {
    console.log(`🖨️ Создание модального окна добавления компонента для просчёта ID: ${proschetId}`);
    const modalId = `print-components-modal-${Date.now()}`; // Уникальный ID для каждого окна (на основе текущего времени)
    
    // Загружаем данные просчёта (тираж) с сервера
    fetch(`/calculator/get-proschet/${proschetId}/`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': print_components_get_csrf_token()
        }
    })
    .then(response => response.json())
    .then(data => {
        let proschetCirculation = 1;
        if (data.success && data.proschet) {
            proschetCirculation = data.proschet.circulation || 1;
            console.log(`✅ Получен тираж просчёта: ${proschetCirculation} шт.`);
        } else {
            console.warn('⚠️ Не удалось получить данные просчёта, используем тираж по умолчанию: 1');
        }
        // Создаём модальное окно с полученным тиражом
        createModalWithCirculation(proschetId, proschetCirculation, modalId);
    })
    .catch(error => {
        console.error('❌ Ошибка при получении данных просчёта:', error);
        // Всё равно создаём модальное окно с тиражом по умолчанию
        createModalWithCirculation(proschetId, 1, modalId);
    });
}

/**
 * Создаёт HTML модального окна и настраивает все обработчики.
 * 
 * @param {string|number} proschetId - ID просчёта
 * @param {number} proschetCirculation - Тираж просчёта
 * @param {string} modalId - Уникальный ID модального окна
 */
function createModalWithCirculation(proschetId, proschetCirculation, modalId) {
    // Шаблон HTML для модального окна (используем обратные кавычки для многострочной строки)
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
                        <!-- Поле выбора принтера -->
                        <div class="form-group">
                            <label for="component-printer-${modalId}">
                                <i class="fas fa-print"></i> Принтер * <span class="required-mark">*</span>
                            </label>
                            <select id="component-printer-${modalId}" class="modal-select" required>
                                <option value="">-- Выберите принтер --</option>
                            </select>
                            <small class="form-hint">При выборе принтера цена за лист будет рассчитана автоматически</small>
                        </div>
                        <!-- Поле выбора бумаги -->
                        <div class="form-group">
                            <label for="component-paper-${modalId}">
                                <i class="fas fa-file-alt"></i> Бумага * <span class="required-mark">*</span>
                            </label>
                            <select id="component-paper-${modalId}" class="modal-select" required>
                                <option value="">-- Выберите бумагу --</option>
                            </select>
                        </div>
                        <!-- НОВОЕ ПОЛЕ: тип печати (цветная / ч/б) -->
                        <div class="form-group">
                            <label for="component-print-type-${modalId}">
                                <i class="fas fa-palette"></i> Тип печати * <span class="required-mark">*</span>
                            </label>
                            <select id="component-print-type-${modalId}" class="modal-select" required>
                                <option value="color">Цветная</option>
                                <option value="bw">Чёрно-белая</option>
                            </select>
                            <small class="form-hint">Выберите цветную или чёрно-белую печать</small>
                        </div>
                        <!-- Поле отображения рассчитанной цены за лист -->
                        <div class="form-group">
                            <label for="component-price-per-sheet-${modalId}">
                                <i class="fas fa-ruble-sign"></i> Цена за лист (₽) * <span class="required-mark">*</span>
                            </label>
                            <input type="text" id="component-price-per-sheet-${modalId}" 
                                   class="modal-input price-readonly" 
                                   value="0.00" required readonly
                                   title="Цена рассчитывается автоматически при выборе принтера и типа печати">
                            <div class="price-calculation-info" id="price-calculation-info-${modalId}" 
                                 style="display: none; margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px; border-left: 3px solid #2196F3;">
                                <div id="calculation-details-${modalId}" style="font-size: 0.9em; color: #555;"></div>
                            </div>
                            <small class="form-hint">
                                Цена автоматически рассчитывается на основе принтера, типа печати и тиража ${proschetCirculation} шт.
                            </small>
                        </div>
                        <!-- Кнопки внизу формы -->
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

    // Добавляем HTML в body (создаём контейнер и вставляем разметку)
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer);

    // Получаем ссылки на все элементы формы по их ID
    const printerSelect = document.getElementById(`component-printer-${modalId}`);
    const paperSelect = document.getElementById(`component-paper-${modalId}`);
    const printTypeSelect = document.getElementById(`component-print-type-${modalId}`); // НОВОЕ
    const priceInput = document.getElementById(`component-price-per-sheet-${modalId}`);
    const calculationInfo = document.getElementById(`price-calculation-info-${modalId}`);
    const calculationDetails = document.getElementById(`calculation-details-${modalId}`);
    const submitBtn = document.getElementById(`modal-submit-btn-${modalId}`);

    // Заполняем выпадающий список принтеров из кэша
    if (printerSelect) {
        // Перебираем массив загруженных принтеров и добавляем option
        print_components_printers_list.forEach(printer => {
            const option = document.createElement('option');
            option.value = printer.id;
            option.textContent = printer.name;
            printerSelect.appendChild(option);
        });
        // Если список пуст, добавляем сообщение
        if (print_components_printers_list.length === 0) {
            const noPrinterOption = document.createElement('option');
            noPrinterOption.value = '';
            noPrinterOption.textContent = 'Нет доступных принтеров';
            noPrinterOption.disabled = true;
            printerSelect.appendChild(noPrinterOption);
        }
    }

    // Заполняем выпадающий список бумаги из кэша
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

    // Функция для пересчёта цены при изменении принтера или типа печати
    function recalcPrice() {
        const printerId = printerSelect?.value;
        const printType = printTypeSelect?.value;
        if (printerId && printType) {
            submitBtn.disabled = true;  // Блокируем кнопку до завершения расчёта
            print_components_calculate_price_for_circulation(printerId, printType, proschetCirculation, modalId)
                .then(calculatedPrice => {
                    if (calculatedPrice !== null && !isNaN(calculatedPrice)) {
                        submitBtn.disabled = false;  // Разблокируем после успешного расчёта
                    } else {
                        submitBtn.disabled = true;
                        print_components_show_notification('Не удалось рассчитать цену для выбранного принтера и типа', 'error');
                    }
                })
                .catch(() => { submitBtn.disabled = true; });
        } else {
            if (priceInput) priceInput.value = '';
            submitBtn.disabled = true;
            if (calculationInfo) calculationInfo.style.display = 'none';
        }
    }

    // Обработчики изменений принтера и типа печати (при изменении пересчитываем цену)
    if (printerSelect) printerSelect.addEventListener('change', recalcPrice);
    if (printTypeSelect) printTypeSelect.addEventListener('change', recalcPrice);

    // Обработчики закрытия модального окна (крестик, кнопка "Отмена", клик по overlay)
    const overlay = document.getElementById(modalId);
    const closeBtn = document.getElementById(`modal-close-btn-${modalId}`);
    const cancelBtn = document.getElementById(`modal-cancel-btn-${modalId}`);
    const form = document.getElementById(`print-components-add-form-${modalId}`);

    const closeModal = () => {
        if (overlay && overlay.parentNode) {
            overlay.classList.remove('active');            // Убираем класс активного окна
            const modal = overlay.querySelector('.print-components-modal');
            if (modal) modal.classList.remove('active');
            setTimeout(() => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay); // Удаляем из DOM
            }, 300);
        }
    };

    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Обработчик отправки формы (добавление компонента)
    if (form && submitBtn) {
        form.addEventListener('submit', (e) => {
            e.preventDefault(); // Отменяем стандартную отправку формы

            const printerId = printerSelect?.value || '';
            const paperId = paperSelect?.value || '';
            const printType = printTypeSelect?.value || 'color';
            const pricePerSheet = priceInput?.value || '';

            // Валидация: все поля должны быть заполнены
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
                print_components_show_notification('Цена за лист не рассчитана. Выберите принтер и тип печати.', 'warning');
                printerSelect.focus();
                return;
            }
            const priceNumber = parseFloat(pricePerSheet);
            if (isNaN(priceNumber) || priceNumber <= 0) {
                print_components_show_notification('Цена за лист не рассчитана или некорректна', 'warning');
                return;
            }

            // Подготавливаем данные для отправки на сервер
            const formData = new FormData();
            formData.append('proschet_id', proschetId);
            formData.append('printer_id', printerId);
            formData.append('paper_id', paperId);
            formData.append('print_type', printType);          // НОВОЕ ПОЛЕ
            formData.append('price_per_sheet', priceNumber.toFixed(2));

            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
            submitBtn.disabled = true;

            // Отправляем POST-запрос на добавление компонента
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
                    print_components_show_notification('Компонент успешно добавлен', 'success');
                    closeModal(); // Закрываем модальное окно
                    // Обновляем секцию "Печатные компоненты" для текущего просчёта
                    const proschetRow = document.querySelector('.proschet-row.selected');
                    if (proschetRow && window.printComponentsSection?.updateForProschet) {
                        window.printComponentsSection.updateForProschet(proschetId, proschetRow);
                    }
                } else {
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    print_components_show_notification('Ошибка добавления: ' + data.message, 'error');
                }
            })
            .catch(error => {
                console.error('Ошибка сети:', error);
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
                print_components_show_notification('Ошибка сети при добавлении', 'error');
            });
        });
    }

    console.log('✅ Модальное окно добавления компонента создано с поддержкой типа печати');
}

// ============================================================================
// 4. ОБРАБОТЧИК НАЖАТИЯ НА КНОПКУ ДОБАВЛЕНИЯ КОМПОНЕНТА
// ============================================================================

/**
 * Глобальная функция, вызываемая при нажатии кнопки "Добавить компонент".
 * Проверяет, выбран ли просчёт, и создаёт модальное окно.
 */
function print_components_handle_add_component() {
    console.log('🖨️ Обработчик добавления компонента печати вызван');
    // Получаем ID текущего просчёта из глобального объекта printComponentsSection
    const currentProschetId = window.printComponentsSection?.getCurrentProschetId();
    if (!currentProschetId) {
        print_components_show_notification('Сначала выберите просчёт', 'warning');
        return;
    }
    if (window.printComponentsSection?.isReady && !window.printComponentsSection.isReady()) {
        print_components_show_notification('Подождите, секция ещё загружается...', 'warning');
        return;
    }
    console.log(`🖨️ Создание модального окна для просчёта ID: ${currentProschetId}`);
    print_components_create_add_modal(currentProschetId);
}

// ============================================================================
// 5. ФУНКЦИИ УВЕДОМЛЕНИЙ
// ============================================================================

/**
 * Показывает всплывающее уведомление в правом верхнем углу.
 * 
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип: 'success', 'error', 'warning', 'info'
 */
function print_components_show_notification(message, type = 'info') {
    const notification = document.createElement('div');
    let backgroundColor = '#2196F3'; // синий по умолчанию
    if (type === 'success') backgroundColor = '#4CAF50';
    else if (type === 'error') backgroundColor = '#f44336';
    else if (type === 'warning') backgroundColor = '#ff9800';
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 12px 20px;
        background: ${backgroundColor}; color: white; border-radius: 4px;
        z-index: 10000; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        max-width: 300px; word-wrap: break-word; transition: opacity 0.3s; opacity: 0;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.style.opacity = '1', 10);
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.parentNode?.removeChild(notification), 300);
    }, 3000);
}

// ============================================================================
// 6. ИНИЦИАЛИЗАЦИЯ INLINE-РЕДАКТИРОВАНИЯ
// ============================================================================

/**
 * Инициализирует модуль inline-редактирования: загружает справочные данные,
 * настраивает обработчики событий на таблице.
 */
function print_components_init_inline_edit() {
    console.log('🔧 Инициализация inline-редактирования...');
    if (print_components_initialized) return; // Уже инициализировано
    print_components_load_dropdown_data();     // Загружаем списки принтеров и бумаги
    print_components_setup_table_event_listeners(); // Настраиваем двойной клик по таблице
    print_components_setup_global_delete_handler();  // Настраиваем удаление
    print_components_initialized = true;
    console.log('✅ Inline-редактирование инициализировано');
}

/**
 * Загружает списки принтеров и бумаги с сервера и сохраняет в кэш.
 * Вызывается один раз при инициализации.
 */
function print_components_load_dropdown_data() {
    console.log('📥 Загрузка данных для выпадающих списков...');
    if (print_components_data_loaded) return;

    // Загрузка принтеров
    fetch(print_components_api_urls.getPrinters, {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': print_components_get_csrf_token() }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            print_components_printers_list = data.printers || [];
            console.log(`✅ Загружено принтеров: ${print_components_printers_list.length} шт.`);
        } else console.warn('⚠️ Не удалось загрузить список принтеров');
    })
    .catch(error => console.error('❌ Ошибка загрузки принтеров:', error));

    // Загрузка бумаги
    fetch(print_components_api_urls.getPapers, {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRFToken': print_components_get_csrf_token() }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            print_components_papers_list = data.papers || [];
            console.log(`✅ Загружено видов бумаги: ${print_components_papers_list.length} шт.`);
        } else console.warn('⚠️ Не удалось загрузить список бумаги');
    })
    .catch(error => console.error('❌ Ошибка загрузки бумаги:', error))
    .finally(() => { print_components_data_loaded = true; });
}

// ============================================================================
// 7. НАСТРОЙКА ОБРАБОТЧИКОВ ТАБЛИЦЫ (двойной клик) – ИСПРАВЛЕННЫЕ ИНДЕКСЫ
// ============================================================================

/**
 * Настраивает обработчики двойного клика и клика по строкам таблицы.
 * Определяет, по какой ячейке кликнули, и запускает соответствующее редактирование.
 */
function print_components_setup_table_event_listeners() {
    // Находим тело таблицы (если таблица ещё не загружена, пробуем снова через 500 мс)
    const tableBody = document.getElementById('print-components-table-body');
    if (!tableBody) {
        setTimeout(print_components_setup_table_event_listeners, 500);
        return;
    }

    // Обработчик двойного клика
    tableBody.addEventListener('dblclick', function(event) {
        // Блокируем повторный двойной клик на короткое время (чтобы не срабатывал дважды)
        if (print_components_dblclick_lock) return;
        print_components_dblclick_lock = true;
        setTimeout(() => { print_components_dblclick_lock = false; }, 300);

        // Находим ячейку (td) и строку (tr), по которым кликнули
        const cell = event.target.closest('td');
        const row = event.target.closest('tr');
        // Если клик не по ячейке или по колонке действий – игнорируем
        if (!cell || !row || cell.classList.contains('component-actions')) return;

        const componentId = row.dataset.componentId;
        if (!componentId) return;

        // Определяем индекс колонки (начиная с 0)
        const cellIndex = Array.from(row.children).indexOf(cell);
        // Новая структура колонок (с учётом добавленной колонки "Тип"):
        // 0 - № компонента (не редактируется)
        // 1 - Принтер (редактируется)
        // 2 - Бумага (редактируется)
        // 3 - Тип печати (редактируется)  <-- НОВОЕ
        // 4 - Листов (не редактируется)
        // 5 - Себестоимость (не редактируется)
        // 6 - Наценка (не редактируется)
        // 7 - Цена (не редактируется)
        // 8 - Прибыль (не редактируется)
        // 9 - Режим печати (редактируется)
        // 10 - Стоимость (не редактируется)
        // 11 - Действия (не редактируется)

        let fieldName = '', fieldType = '';
        switch (cellIndex) {
            case 0: return;                          // Номер компонента
            case 1: fieldName = 'printer'; fieldType = 'printer'; break;
            case 2: fieldName = 'paper'; fieldType = 'paper'; break;
            case 3: fieldName = 'print_type'; fieldType = 'print_type'; break; // НОВОЕ
            case 4: return;                          // Листов
            case 5: return;                          // Себестоимость
            case 6: return;                          // Наценка
            case 7: return;                          // Цена
            case 8: return;                          // Прибыль
            case 9: fieldName = 'printing_mode'; fieldType = 'printing_mode'; break;
            case 10: return;                         // Стоимость
            case 11: return;                         // Действия
            default: return;
        }

        // Запускаем режим редактирования
        print_components_start_edit(cell, componentId, fieldName, fieldType, row);
    });

    // Обработчик клика по строке для выделения (без изменений)
    tableBody.addEventListener('click', function(event) {
        const row = event.target.closest('tr');
        if (row && !event.target.closest('.delete-component-btn')) {
            // Снимаем выделение со всех строк
            const allRows = tableBody.querySelectorAll('tr');
            allRows.forEach(r => r.classList.remove('selected'));
            // Выделяем текущую строку
            row.classList.add('selected');
        }
    });
}

// ============================================================================
// 8. ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ КНОПОК УДАЛЕНИЯ
// ============================================================================

/**
 * Настраивает делегирование событий для кнопок удаления.
 * Кнопки удаления могут быть динамически добавлены/удалены, поэтому используем делегирование.
 */
function print_components_setup_global_delete_handler() {
    const tableContainer = document.getElementById('print-components-container');
    if (!tableContainer) {
        setTimeout(print_components_setup_global_delete_handler, 500);
        return;
    }
    // Удаляем старый обработчик, чтобы не накапливать, и добавляем новый
    tableContainer.removeEventListener('click', print_components_handle_delete_click_global);
    tableContainer.addEventListener('click', print_components_handle_delete_click_global);
}

/**
 * Обработчик клика по кнопке удаления.
 * 
 * @param {Event} event - Объект события
 */
function print_components_handle_delete_click_global(event) {
    const deleteBtn = event.target.closest('.delete-component-btn');
    if (deleteBtn) {
        event.preventDefault();
        event.stopPropagation();
        const componentId = deleteBtn.dataset.componentId;
        const row = deleteBtn.closest('tr');
        if (!componentId) return;
        if (confirm('Вы уверены, что хотите удалить этот компонент печати?')) {
            print_components_delete_component(componentId, row);
        }
    }
}

// ============================================================================
// 9. ФУНКЦИИ INLINE-РЕДАКТИРОВАНИЯ
// ============================================================================

/**
 * Начинает редактирование ячейки.
 * 
 * @param {HTMLElement} cell - Ячейка таблицы (td)
 * @param {string|number} componentId - ID компонента
 * @param {string} fieldName - Имя поля для отправки на сервер
 * @param {string} fieldType - Тип поля ('printer', 'paper', 'print_type', 'printing_mode')
 * @param {HTMLElement} row - Строка таблицы (tr)
 */
function print_components_start_edit(cell, componentId, fieldName, fieldType, row) {
    console.log(`✏️ Начало редактирования: поле=${fieldName}, тип=${fieldType}, ID=${componentId}`);
    
    // Если уже редактируем другую ячейку, сначала завершаем (сохраняем изменения)
    if (print_components_is_editing && print_components_current_editing_element !== cell) {
        print_components_finish_edit(true);
    }
    
    // Для выпадающих списков (принтер, бумага) убеждаемся, что данные загружены
    // Если данные ещё не загружены – показываем спиннер и загружаем
    if ((fieldType === 'printer' || fieldType === 'paper') && !print_components_data_loaded) {
        cell.innerHTML = '<div style="padding: 5px; color: #666;"><i class="fas fa-spinner fa-spin"></i> Загрузка данных...</div>';
        setTimeout(() => {
            print_components_load_dropdown_data();
            setTimeout(() => {
                print_components_start_edit(cell, componentId, fieldName, fieldType, row);
            }, 1000);
        }, 300);
        return;
    }

    // Сохраняем состояние редактирования в глобальные переменные
    print_components_current_editing_id = componentId;
    print_components_current_editing_element = cell;
    // Извлекаем исходное значение (для бумаги нужно парсить HTML, так как там может быть <br><small>)
    if (fieldType === 'paper') {
        print_components_original_value = print_components_extract_paper_name(cell.innerHTML);
    } else {
        print_components_original_value = cell.textContent.trim();
    }
    print_components_current_field_type = fieldType;
    print_components_is_editing = true;
    cell.classList.add('editing-cell'); // Добавляем класс для стилизации
    cell.innerHTML = ''; // Очищаем ячейку

    // Создаём соответствующий элемент ввода (select или input)
    let inputElement;
    if (fieldType === 'printer') {
        inputElement = print_components_create_printer_dropdown(cell);
    } else if (fieldType === 'paper') {
        inputElement = print_components_create_paper_dropdown(cell);
    } else if (fieldType === 'print_type') {
        inputElement = print_components_create_print_type_dropdown(cell);
    } else if (fieldType === 'printing_mode') {
        inputElement = print_components_create_mode_dropdown(cell);
    } else {
        // Для других полей (не используется) – текстовое поле
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = print_components_original_value;
        inputElement.className = 'inline-edit-input';
    }

    cell.appendChild(inputElement);

    // Для select добавляем обработчик change (сохраняет при выборе значения)
    if (inputElement.tagName === 'SELECT') {
        inputElement.addEventListener('change', function() {
            print_components_finish_edit(true);
        });
    }

    // Обработчик потери фокуса (blur) – сохраняем, если фокус ушёл за пределы ячейки
    inputElement.addEventListener('blur', function(e) {
        setTimeout(() => {
            if (print_components_is_editing && print_components_current_editing_element === cell) {
                const activeElement = document.activeElement;
                // Если новый активный элемент находится внутри ячейки (например, выпадающий список), не закрываем
                if (activeElement && cell.contains(activeElement)) {
                    return;
                }
                print_components_finish_edit(true);
            }
        }, 100);
    });

    // Обработчик нажатия клавиш Enter и Escape
    inputElement.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            print_components_finish_edit(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            print_components_finish_edit(false);
        }
    });

    // Фокусируемся и выделяем текст (для input)
    setTimeout(() => {
        inputElement.focus();
        if (inputElement.tagName === 'INPUT') inputElement.select();
    }, 10);
}

/**
 * Извлекает название бумаги из HTML-содержимого ячейки.
 * Ячейка бумаги может содержать "<имя><br><small>цена</small>".
 * 
 * @param {string} html - HTML содержимое ячейки
 * @returns {string} Название бумаги
 */
function print_components_extract_paper_name(html) {
    const brIndex = html.indexOf('<br');
    if (brIndex !== -1) return html.substring(0, brIndex).trim();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent.trim();
}

/**
 * Создаёт выпадающий список принтеров для inline-редактирования.
 * 
 * @param {HTMLElement} cell - Ячейка таблицы (не используется, но оставлено для единообразия)
 * @returns {HTMLSelectElement} Элемент select
 */
function print_components_create_printer_dropdown(cell) {
    const select = document.createElement('select');
    select.className = 'inline-edit-select';
    // Пустой пункт (для возможности отмены выбора)
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = 'Выберите принтер';
    select.appendChild(emptyOption);
    
    if (print_components_printers_list.length === 0) {
        const noDataOption = document.createElement('option');
        noDataOption.value = '';
        noDataOption.textContent = 'Нет доступных принтеров';
        noDataOption.disabled = true;
        select.appendChild(noDataOption);
    } else {
        const currentValue = print_components_original_value;
        let found = false;
        print_components_printers_list.forEach(printer => {
            const option = document.createElement('option');
            option.value = printer.id;
            option.textContent = printer.name;
            if (currentValue && printer.name === currentValue) {
                option.selected = true;
                found = true;
            }
            select.appendChild(option);
        });
        // Если текущее значение не найдено в списке (например, принтер удалён), добавляем его как disabled
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
 * Создаёт выпадающий список бумаги для inline-редактирования.
 * 
 * @param {HTMLElement} cell - Ячейка таблицы
 * @returns {HTMLSelectElement} Элемент select
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
        const currentValue = print_components_original_value;
        let found = false;
        print_components_papers_list.forEach(paper => {
            const option = document.createElement('option');
            option.value = paper.id;
            option.textContent = paper.name;
            if (currentValue && paper.name.trim().toLowerCase() === currentValue.trim().toLowerCase()) {
                option.selected = true;
                found = true;
            }
            select.appendChild(option);
        });
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
 * НОВАЯ ФУНКЦИЯ: создаёт выпадающий список типов печати для inline-редактирования.
 * 
 * @param {HTMLElement} cell - Ячейка таблицы
 * @returns {HTMLSelectElement} Элемент select
 */
function print_components_create_print_type_dropdown(cell) {
    const select = document.createElement('select');
    select.className = 'inline-edit-select';
    const optionColor = document.createElement('option');
    optionColor.value = 'color';
    optionColor.textContent = 'Цветная';
    select.appendChild(optionColor);
    const optionBW = document.createElement('option');
    optionBW.value = 'bw';
    optionBW.textContent = 'Ч/б';
    select.appendChild(optionBW);
    
    const currentValue = print_components_original_value;
    if (currentValue && currentValue.toLowerCase().includes('ч/б')) {
        optionBW.selected = true;
    } else {
        optionColor.selected = true;
    }
    return select;
}

/**
 * Создаёт выпадающий список режимов печати (односторонняя/двусторонняя).
 * 
 * @param {HTMLElement} cell - Ячейка таблицы
 * @returns {HTMLSelectElement} Элемент select
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
    
    const currentValue = print_components_original_value;
    if (currentValue && currentValue.toLowerCase().includes('двуст')) {
        optionDuplex.selected = true;
    } else {
        optionSingle.selected = true;
    }
    return select;
}

// ============================================================================
// 10. ЗАВЕРШЕНИЕ РЕДАКТИРОВАНИЯ (СОХРАНЕНИЕ ИЛИ ОТМЕНА)
// ============================================================================

/**
 * Завершает редактирование: либо сохраняет изменения, либо отменяет.
 * 
 * @param {boolean} save - true – сохранить, false – отменить
 */
function print_components_finish_edit(save) {
    if (!print_components_is_editing || !print_components_current_editing_element) return;

    const cell = print_components_current_editing_element;
    const componentId = print_components_current_editing_id;
    const fieldType = print_components_current_field_type;

    // Определяем имя поля для отправки на сервер (по индексу колонки)
    const cellIndex = Array.from(cell.parentElement.children).indexOf(cell);
    let fieldName = '';
    switch (cellIndex) {
        case 1: fieldName = 'printer'; break;
        case 2: fieldName = 'paper'; break;
        case 3: fieldName = 'print_type'; break;   // НОВОЕ
        case 9: fieldName = 'printing_mode'; break;
        default:
            print_components_cancel_edit();
            return;
    }

    if (save) {
        // Находим элемент ввода (input или select) внутри ячейки
        let inputElement = cell.querySelector('input, select');
        if (!inputElement) {
            console.log('⚠️ Элемент ввода не найден, отменяем редактирование');
            print_components_cancel_edit();
            return;
        }

        let newValue = '', displayText = '';
        if (inputElement.tagName === 'SELECT') {
            const selectedOption = inputElement.options[inputElement.selectedIndex];
            newValue = selectedOption.value;
            displayText = selectedOption.textContent;
            if (newValue === '') {
                displayText = fieldType === 'printer' ? 'Принтер не выбран' : 
                             (fieldType === 'paper' ? 'Бумага не выбрана' : 'Не выбрано');
            }
        } else {
            newValue = inputElement.value.trim();
            displayText = newValue;
        }

        // Валидация (проверка корректности)
        if (!print_components_validate_value(newValue, fieldType)) {
            print_components_show_notification('Некорректное значение', 'error');
            inputElement.focus();
            return;
        }

        // Если значение изменилось – отправляем на сервер, иначе просто отменяем редактирование
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
 * Проверяет корректность нового значения.
 * 
 * @param {string} value - Новое значение
 * @param {string} fieldType - Тип поля
 * @returns {boolean} true, если значение корректно
 */
function print_components_validate_value(value, fieldType) {
    if (fieldType === 'printer' || fieldType === 'paper' || fieldType === 'print_type') return true;
    if (!value && value !== '0') return false;
    if (fieldType === 'printing_mode') return true; // любое из двух допустимо
    return value.length > 0;
}

/**
 * Проверяет, изменилось ли значение по сравнению с исходным.
 * 
 * @param {string} newValue - Новое значение
 * @param {string} fieldType - Тип поля
 * @returns {boolean} true, если изменилось
 */
function print_components_has_value_changed(newValue, fieldType) {
    if (fieldType === 'printing_mode') {
        const originalText = print_components_original_value;
        const newText = (newValue === 'duplex') ? 'Двуст.' : 'Одност.';
        return originalText !== newText;
    }
    if (fieldType === 'print_type') {
        const originalText = print_components_original_value;
        const newText = (newValue === 'bw') ? 'Ч/б' : 'Цветная';
        return originalText !== newText;
    }
    return newValue !== print_components_original_value;
}

// ============================================================================
// 11. СОХРАНЕНИЕ НА СЕРВЕР
// ============================================================================

/**
 * Отправляет изменения на сервер и обновляет интерфейс.
 * 
 * @param {string|number} componentId - ID компонента
 * @param {string} fieldName - Имя поля
 * @param {string} fieldValue - Новое значение
 * @param {string} displayValue - Отображаемое значение (восстанавливается в ячейку при успехе)
 * @param {HTMLElement} cell - Ячейка таблицы
 */
function print_components_save_to_server(componentId, fieldName, fieldValue, displayValue, cell) {
    // Показываем индикатор сохранения
    cell.innerHTML = '<div style="padding: 5px; color: #3498db;"><i class="fas fa-spinner fa-spin"></i> Сохранение...</div>';

    const formData = new FormData();
    formData.append('component_id', componentId);
    formData.append('field_name', fieldName);
    formData.append('field_value', fieldValue);

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
            print_components_show_notification('Изменения сохранены', 'success');
            print_components_reset_editing_state();

            // Обновляем локальный массив компонентов (если есть доступ)
            const currentComponents = window.printComponentsSection?.getCurrentComponents();
            if (currentComponents) {
                const index = currentComponents.findIndex(c => c.id == componentId);
                if (index !== -1 && data.updated_data) {
                    currentComponents[index] = { ...currentComponents[index], ...data.updated_data };
                }
            }

            // Обновляем отображение в строке таблицы (изменённая ячейка)
            const row = document.querySelector(`tr[data-component-id="${componentId}"]`);
            if (row) {
                if (fieldName === 'printing_mode') {
                    const modeCell = row.querySelector('.component-mode');
                    if (modeCell) {
                        const modeDisplay = data.updated_data.printing_mode === 'duplex' ? 'Двуст.' : 'Одност.';
                        modeCell.textContent = modeDisplay;
                    }
                } else if (fieldName === 'printer') {
                    const printerCell = row.querySelector('.component-printer');
                    if (printerCell && data.updated_data.printer_name) {
                        printerCell.textContent = data.updated_data.printer_name;
                    }
                } else if (fieldName === 'paper') {
                    const paperCell = row.querySelector('.component-paper');
                    if (paperCell && data.updated_data.paper_name) {
                        const paperPrice = parseFloat(data.updated_data.paper_price) || 0;
                        paperCell.innerHTML = `
                            ${data.updated_data.paper_name}
                            ${paperPrice ? `<br><small>${paperPrice.toFixed(2)} ₽/лист</small>` : ''}
                        `;
                    }
                } else if (fieldName === 'print_type') {
                    const printTypeCell = row.querySelector('.component-print-type');
                    if (printTypeCell && data.updated_data.print_type_display) {
                        printTypeCell.textContent = data.updated_data.print_type_display;
                    }
                }
            }

            // Если редактировали выбранный компонент – обновляем событие для зависимых секций
            const selectedComponentId = window.printComponentsSection?.getSelectedComponentId();
            if (selectedComponentId == componentId) {
                const updatedComponent = currentComponents?.find(c => c.id == componentId);
                if (updatedComponent) {
                    const eventDetail = {
                        printComponentId: updatedComponent.id,
                        printComponentNumber: updatedComponent.number,
                        printerName: updatedComponent.printer_name,
                        paperName: updatedComponent.paper_name,
                        paperPrice: parseFloat(updatedComponent.paper_price) || 0,
                        proschetId: window.printComponentsSection?.getCurrentProschetId(),
                        sheetCount: updatedComponent.sheet_count || 0,
                        pricePerSheet: parseFloat(updatedComponent.price_per_sheet) || 0,
                        printingMode: updatedComponent.printing_mode,
                        printType: updatedComponent.print_type,
                        printTypeDisplay: updatedComponent.print_type_display,
                        formula: '(price_per_sheet * runs_count) + (paper_price * sheet_count)'
                    };
                    document.dispatchEvent(new CustomEvent('printComponentSelected', { detail: eventDetail }));
                }
            }

            // Пересчитываем стоимость компонента (если изменился принтер или тип печати)
            if (fieldName === 'printer' || fieldName === 'print_type') {
                let sheetCount = null;
                if (window.vichisliniyaListov?.currentParameters) {
                    sheetCount = window.vichisliniyaListov.currentParameters.list_count;
                }
                if (sheetCount === null || sheetCount === undefined) {
                    const sheetCountElement = document.getElementById('vichisliniya-listov-result-value');
                    if (sheetCountElement) {
                        sheetCount = parseFloat(sheetCountElement.textContent);
                    }
                }
                if (sheetCount === null || isNaN(sheetCount)) {
                    sheetCount = 0;
                }
                if (window.printComponentsSection?.recalculateComponentPrice) {
                    window.printComponentsSection.recalculateComponentPrice(componentId, sheetCount);
                }
            }

            // Восстанавливаем исходное отображение ячейки
            cell.innerHTML = displayValue;
            cell.classList.remove('editing-cell');
        } else {
            // Ошибка от сервера
            cell.innerHTML = `<span style="color: #e74c3c;">${displayValue}</span>`;
            print_components_show_notification('Ошибка сохранения: ' + data.message, 'error');
            setTimeout(() => {
                cell.innerHTML = displayValue;
                cell.classList.remove('editing-cell');
                print_components_reset_editing_state();
            }, 2000);
        }
    })
    .catch(error => {
        console.error('❌ Ошибка при сохранении:', error);
        cell.innerHTML = `<span style="color: #e74c3c;">Ошибка сети</span>`;
        print_components_show_notification('Ошибка сети при сохранении', 'error');
        setTimeout(() => {
            cell.innerHTML = displayValue;
            cell.classList.remove('editing-cell');
            print_components_reset_editing_state();
        }, 2000);
    });
}

// ============================================================================
// 12. ОТМЕНА РЕДАКТИРОВАНИЯ И СБРОС СОСТОЯНИЯ
// ============================================================================

/**
 * Отменяет редактирование и восстанавливает исходное содержимое ячейки.
 */
function print_components_cancel_edit() {
    if (!print_components_is_editing || !print_components_current_editing_element) return;
    const cell = print_components_current_editing_element;
    cell.innerHTML = print_components_original_value;
    cell.classList.remove('editing-cell');
    print_components_reset_editing_state();
}

/**
 * Сбрасывает глобальные переменные состояния редактирования.
 */
function print_components_reset_editing_state() {
    print_components_current_editing_id = null;
    print_components_current_editing_element = null;
    print_components_original_value = null;
    print_components_current_field_type = null;
    print_components_is_editing = false;
}

// ============================================================================
// 13. ФУНКЦИИ УДАЛЕНИЯ КОМПОНЕНТОВ
// ============================================================================

/**
 * Удаляет компонент печати с сервера и обновляет интерфейс.
 * 
 * @param {string|number} componentId - ID компонента
 * @param {HTMLElement} row - Строка таблицы, которую нужно удалить
 */
function print_components_delete_component(componentId, row) {
    const originalHTML = row.innerHTML;
    // Показываем индикатор удаления (на всю строку)
    row.innerHTML = '<td colspan="12" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Удаление...<\/td>';
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
            // Обновляем секцию (перезагружаем список компонентов)
            const currentProschetId = window.printComponentsSection?.getCurrentProschetId();
            if (currentProschetId) {
                const proschetRow = document.querySelector('.proschet-row.selected');
                if (proschetRow && window.printComponentsSection?.updateForProschet) {
                    window.printComponentsSection.updateForProschet(currentProschetId, proschetRow);
                }
            }
        } else {
            row.innerHTML = originalHTML;
            print_components_show_notification('Ошибка удаления: ' + data.message, 'error');
        }
    })
    .catch(error => {
        console.error('Ошибка сети:', error);
        row.innerHTML = originalHTML;
        print_components_show_notification('Ошибка сети при удалении', 'error');
    });
}

// ============================================================================
// 14. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (CSRF-токен)
// ============================================================================

/**
 * Получает CSRF-токен из meta-тега или из cookie.
 * 
 * @returns {string} CSRF-токен
 */
function print_components_get_csrf_token() {
    // Сначала пробуем взять из meta-тега (если есть)
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) return metaToken.getAttribute('content');
    
    // Иначе ищем в cookies
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith('csrftoken=')) {
            return decodeURIComponent(cookie.substring('csrftoken='.length));
        }
    }
    console.warn('⚠️ CSRF токен не найден');
    return '';
}

// ============================================================================
// 15. ЭКСПОРТ СОСТОЯНИЯ РЕДАКТИРОВАНИЯ ДЛЯ ДРУГИХ МОДУЛЕЙ
// ============================================================================

/**
 * Предоставляет внешнему миру информацию о текущем состоянии редактирования.
 * Используется в print_components.js для предотвращения перерисовки таблицы во время редактирования.
 */
window.printComponentsInlineEditState = {
    isEditing: () => print_components_is_editing,
    getEditingComponentId: () => print_components_current_editing_id
};

// ============================================================================
// 16. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ DOM
// ============================================================================

// Ждём полной загрузки DOM, затем инициализируем модуль с небольшой задержкой
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Загрузка inline-редактирования компонентов печати...');
    // Небольшая задержка для полной загрузки остальных скриптов
    setTimeout(() => {
        print_components_init_inline_edit();
        // Делаем функцию добавления компонента доступной глобально (для print_components.js)
        window.print_components_handle_add_component = print_components_handle_add_component;
        window.print_components_create_add_modal = print_components_create_add_modal;
        window.print_components_show_notification = print_components_show_notification;
        // Экспортируем объект для внешнего использования
        window.printComponentsInlineEdit = {
            init: print_components_init_inline_edit,
            showNotification: print_components_show_notification,
            handleAddComponent: print_components_handle_add_component,
            createAddModal: print_components_create_add_modal
        };
        console.log('✅ Inline-редактирование компонентов печати готово (с поддержкой ч/б)');
    }, 1000);
});

// ============================================================================
// 17. ПЕРЕОПРЕДЕЛЕНИЕ updateForProschet (сохраняем инициализацию после перезагрузки)
// ============================================================================

/**
 * После загрузки нового просчёта переинициализируем inline-редактирование,
 * чтобы обработчики снова привязались к новой таблице.
 */
setTimeout(() => {
    const originalUpdateFunction = window.printComponentsSection?.updateForProschet;
    if (originalUpdateFunction) {
        window.printComponentsSection.updateForProschet = function(proschetId, rowElement) {
            // Вызываем оригинальную функцию (из print_components.js)
            originalUpdateFunction.call(this, proschetId, rowElement);
            // После загрузки данных переинициализируем inline-редактирование
            setTimeout(() => {
                print_components_initialized = false;
                print_components_init_inline_edit();
            }, 500);
        };
    }
}, 2000);