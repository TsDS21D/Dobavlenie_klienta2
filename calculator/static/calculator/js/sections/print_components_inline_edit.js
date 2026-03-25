/**
 * print_components_inline_edit.js - JavaScript для inline-редактирования компонентов печати
 * 
 * ИСПРАВЛЕНИЯ (26.03.2026):
 * - Исправлена проблема с автоматическим закрытием выпадающих списков при двойном клике.
 *   В обработчик blur добавлена проверка: если новый активный элемент находится внутри
 *   редактируемой ячейки (например, сам select или его выпадающая часть), редактирование
 *   не завершается.
 * - Для элементов <select> добавлен обработчик change, который сохраняет изменения
 *   при выборе значения из списка.
 * - Сброс состояния редактирования теперь происходит корректно после успешного сохранения.
 * 
 * ОСНОВНЫЕ ВОЗМОЖНОСТИ:
 * - Двойной клик по ячейкам таблицы для редактирования принтера, бумаги, режима печати.
 * - Выпадающие списки для выбора принтера и бумаги (данные загружаются с сервера).
 * - Модальное окно для добавления нового компонента печати.
 * - Автоматический расчёт цены за лист при выборе принтера в модальном окне.
 * - Удаление компонентов с подтверждением.
 */

"use strict";

// ============================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ
// ============================================================================

/**
 * Объект с URL-ами API эндпоинтов для работы с компонентами печати.
 * @constant {Object}
 */
const print_components_api_urls = {
    add: '/calculator/add-print-component/',
    update: '/calculator/update-print-component/',
    delete: '/calculator/delete-print-component/',
    getPrinters: '/calculator/get-printers/',
    getPapers: '/calculator/get-papers/',
    getComponents: '/calculator/get-print-components/',
};

// Переменные для inline-редактирования
let print_components_current_editing_id = null;          // ID редактируемого компонента
let print_components_current_editing_element = null;     // DOM-элемент ячейки
let print_components_original_value = null;              // Исходное значение (для отмены)
let print_components_current_field_type = null;          // Тип поля ('printer', 'paper', 'printing_mode')
let print_components_is_editing = false;                 // Флаг, идёт ли редактирование
let print_components_initialized = false;                // Флаг инициализации
let print_components_dblclick_lock = false;              // Блокировка двойного клика
let print_components_data_loaded = false;                // Загружены ли списки

// Кэши данных для выпадающих списков
let print_components_printers_list = [];
let print_components_papers_list = [];

// ============================================================================
// 2. ФУНКЦИЯ ДЛЯ РАСЧЁТА ЦЕНЫ (используется в модальном окне)
// ============================================================================

function print_components_calculate_price_for_circulation(printerId, circulation, modalId) {
    console.log(`💰 Запрос расчёта цены: принтер=${printerId}, тираж=${circulation}`);

    if (!printerId || !circulation) {
        console.warn('❌ Не указан принтер или тираж для расчёта цены');
        return Promise.resolve(null);
    }

    const circulationNumber = parseInt(circulation);
    if (isNaN(circulationNumber) || circulationNumber <= 0) {
        console.warn(`⚠️ Некорректный тираж для расчёта: ${circulation}`);
        return Promise.resolve(null);
    }

    const priceInput = document.getElementById(`component-price-per-sheet-${modalId}`);
    if (!priceInput) {
        console.error('❌ Поле ввода цены не найдено');
        return Promise.resolve(null);
    }

    const calculationInfo = document.getElementById(`price-calculation-info-${modalId}`);
    const calculationDetails = document.getElementById(`calculation-details-${modalId}`);

    if (priceInput) {
        priceInput.value = 'Расчёт...';
        priceInput.style.color = '#666';
        priceInput.style.fontStyle = 'italic';
    }
    if (calculationInfo) calculationInfo.style.display = 'block';
    if (calculationDetails) {
        calculationDetails.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Расчёт цены для тиража ${circulationNumber} шт...
        `;
    }

    const formData = new FormData();
    formData.append('arbitrary_copies', circulationNumber);
    formData.append('csrfmiddlewaretoken', print_components_get_csrf_token());

    return fetch(`/print_price/api/calculate_arbitrary_price/${printerId}/`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: formData
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP ошибка: ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (data.success) {
            const formattedPrice = parseFloat(data.calculated_price).toFixed(2);
            if (priceInput) {
                priceInput.value = formattedPrice;
                priceInput.style.color = '#0B8661';
                priceInput.style.fontStyle = 'normal';
                priceInput.style.fontWeight = 'bold';
            }
            if (calculationInfo && calculationDetails) {
                calculationDetails.innerHTML = `
                    <i class="fas fa-check-circle" style="color: #4CAF50;"></i>
                    Цена рассчитана для тиража ${circulationNumber} шт: <strong>${formattedPrice} руб./лист</strong>
                    <br><small>На основе ${data.points_count || 0} опорных точек (${data.interpolation_method_display || 'линейная интерполяция'})</small>
                `;
                calculationInfo.style.backgroundColor = '#e8f5e9';
                calculationInfo.style.borderLeftColor = '#4CAF50';
            }
            print_components_show_notification(`Цена рассчитана: ${formattedPrice} руб./лист для тиража ${circulationNumber} шт`, 'success');
            return formattedPrice;
        } else {
            if (priceInput) {
                priceInput.value = '0.00';
                priceInput.style.color = '#e74c3c';
                priceInput.style.fontStyle = 'normal';
            }
            if (calculationInfo && calculationDetails) {
                calculationDetails.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
                    Не удалось рассчитать цену: ${data.error || 'неизвестная ошибка'}
                `;
                calculationInfo.style.backgroundColor = '#ffebee';
                calculationInfo.style.borderLeftColor = '#e74c3c';
            }
            print_components_show_notification(`Не удалось рассчитать цену: ${data.error || 'неизвестная ошибка'}`, 'warning');
            return null;
        }
    })
    .catch(error => {
        console.error('❌ Ошибка сети при расчёте цены:', error);
        if (priceInput) {
            priceInput.value = '0.00';
            priceInput.style.color = '#e74c3c';
            priceInput.style.fontStyle = 'normal';
        }
        if (calculationInfo && calculationDetails) {
            calculationDetails.innerHTML = `
                <i class="fas fa-exclamation-triangle" style="color: #e74c3c;"></i>
                Ошибка сети при расчёте цены. Проверьте подключение к интернету.
            `;
            calculationInfo.style.backgroundColor = '#ffebee';
            calculationInfo.style.borderLeftColor = '#e74c3c';
        }
        print_components_show_notification('Ошибка сети при расчёте цены. Проверьте подключение.', 'error');
        return null;
    });
}

// ============================================================================
// 3. ФУНКЦИЯ СОЗДАНИЯ МОДАЛЬНОГО ОКНА ДЛЯ ДОБАВЛЕНИЯ КОМПОНЕНТА
// ============================================================================

function print_components_create_add_modal(proschetId) {
    console.log(`🖨️ Создание модального окна добавления компонента для просчёта ID: ${proschetId}`);
    const modalId = `print-components-modal-${Date.now()}`;
    let proschetCirculation = 1;

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
            proschetCirculation = data.proschet.circulation || 1;
            console.log(`✅ Получен тираж просчёта: ${proschetCirculation} шт.`);
        } else {
            console.warn('⚠️ Не удалось получить данные просчёта, используем тираж по умолчанию: 1');
        }
    })
    .catch(error => console.error('❌ Ошибка при получении данных просчёта:', error))
    .finally(() => {
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
                            <div class="form-group">
                                <label for="component-printer-${modalId}">
                                    <i class="fas fa-print"></i> Принтер * <span class="required-mark">*</span>
                                </label>
                                <select id="component-printer-${modalId}" class="modal-select" required>
                                    <option value="">-- Выберите принтер --</option>
                                </select>
                                <small class="form-hint">При выборе принтера цена за лист будет рассчитана автоматически</small>
                            </div>
                            <div class="form-group">
                                <label for="component-paper-${modalId}">
                                    <i class="fas fa-file-alt"></i> Бумага * <span class="required-mark">*</span>
                                </label>
                                <select id="component-paper-${modalId}" class="modal-select" required>
                                    <option value="">-- Выберите бумагу --</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="component-price-per-sheet-${modalId}">
                                    <i class="fas fa-ruble-sign"></i> Цена за лист (₽) * <span class="required-mark">*</span>
                                </label>
                                <input type="text" id="component-price-per-sheet-${modalId}" 
                                       class="modal-input price-readonly" 
                                       value="0.00" required readonly
                                       title="Цена рассчитывается автоматически при выборе принтера">
                                <div class="price-calculation-info" id="price-calculation-info-${modalId}" 
                                     style="display: none; margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px; border-left: 3px solid #2196F3;">
                                    <div id="calculation-details-${modalId}" style="font-size: 0.9em; color: #555;"></div>
                                </div>
                                <small class="form-hint">
                                    Цена автоматически рассчитывается на основе принтера и тиража ${proschetCirculation} шт.
                                </small>
                            </div>
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

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHTML;
        document.body.appendChild(modalContainer);

        const printerSelect = document.getElementById(`component-printer-${modalId}`);
        const paperSelect = document.getElementById(`component-paper-${modalId}`);
        const priceInput = document.getElementById(`component-price-per-sheet-${modalId}`);
        const calculationInfo = document.getElementById(`price-calculation-info-${modalId}`);
        const calculationDetails = document.getElementById(`calculation-details-${modalId}`);
        const submitBtn = document.getElementById(`modal-submit-btn-${modalId}`);

        if (printerSelect) {
            print_components_printers_list.forEach(printer => {
                const option = document.createElement('option');
                option.value = printer.id;
                option.textContent = printer.name;
                printerSelect.appendChild(option);
            });
            if (print_components_printers_list.length === 0) {
                const noPrinterOption = document.createElement('option');
                noPrinterOption.value = '';
                noPrinterOption.textContent = 'Нет доступных принтеров';
                noPrinterOption.disabled = true;
                printerSelect.appendChild(noPrinterOption);
            }
        }

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

        if (printerSelect) {
            printerSelect.addEventListener('change', function() {
                const selectedPrinterId = this.value;
                if (selectedPrinterId) {
                    if (priceInput) {
                        priceInput.value = 'Расчёт...';
                        priceInput.style.color = '#666';
                    }
                    if (calculationInfo && calculationDetails) {
                        calculationInfo.style.display = 'block';
                        calculationDetails.innerHTML = `
                            <i class="fas fa-spinner fa-spin"></i>
                            Расчёт цены для принтера "${this.options[this.selectedIndex]?.textContent}" и тиража ${proschetCirculation} шт...
                        `;
                    }
                    print_components_calculate_price_for_circulation(selectedPrinterId, proschetCirculation, modalId)
                        .then(calculatedPrice => {
                            if (calculatedPrice !== null && submitBtn) submitBtn.disabled = false;
                            else submitBtn.disabled = true;
                        });
                } else {
                    if (priceInput) {
                        priceInput.value = '0.00';
                        priceInput.style.color = '';
                    }
                    if (calculationInfo) calculationInfo.style.display = 'none';
                    if (submitBtn) submitBtn.disabled = true;
                }
            });
        }

        const overlay = document.getElementById(modalId);
        const closeBtn = document.getElementById(`modal-close-btn-${modalId}`);
        const cancelBtn = document.getElementById(`modal-cancel-btn-${modalId}`);
        const form = document.getElementById(`print-components-add-form-${modalId}`);

        const closeModal = () => {
            if (overlay && overlay.parentNode) {
                overlay.classList.remove('active');
                const modal = overlay.querySelector('.print-components-modal');
                if (modal) modal.classList.remove('active');
                setTimeout(() => {
                    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                }, 300);
            }
        };

        if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        if (form && submitBtn) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const printerId = printerSelect?.value || '';
                const paperId = paperSelect?.value || '';
                const pricePerSheet = priceInput?.value || '';

                if (!printerId) { print_components_show_notification('Выберите принтер', 'warning'); printerSelect.focus(); return; }
                if (!paperId) { print_components_show_notification('Выберите бумагу', 'warning'); paperSelect.focus(); return; }
                if (!pricePerSheet || pricePerSheet === '0.00' || pricePerSheet === 'Расчёт...') {
                    print_components_show_notification('Цена за лист не рассчитана. Выберите принтер для расчета.', 'warning');
                    printerSelect.focus();
                    return;
                }
                const priceNumber = parseFloat(pricePerSheet);
                if (isNaN(priceNumber) || priceNumber <= 0) {
                    print_components_show_notification('Некорректная цена за лист', 'warning');
                    return;
                }

                const formData = new FormData();
                formData.append('proschet_id', proschetId);
                formData.append('printer_id', printerId);
                formData.append('paper_id', paperId);
                formData.append('price_per_sheet', priceNumber.toFixed(2));

                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
                submitBtn.disabled = true;

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
                        closeModal();
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
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    print_components_show_notification('Ошибка сети при добавлении', 'error');
                });
            });
        }

        console.log('✅ Модальное окно добавления компонента создано с функцией авторасчёта цены');
    });
}

// ============================================================================
// 4. ОБРАБОТЧИК НАЖАТИЯ НА КНОПКУ ДОБАВЛЕНИЯ КОМПОНЕНТА
// ============================================================================

function print_components_handle_add_component() {
    console.log('🖨️ Обработчик добавления компонента печати вызван');
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

function print_components_show_notification(message, type = 'info') {
    const notification = document.createElement('div');
    let backgroundColor = '#2196F3';
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

function print_components_init_inline_edit() {
    console.log('🔧 Инициализация inline-редактирования...');
    if (print_components_initialized) return;
    print_components_load_dropdown_data();
    print_components_setup_table_event_listeners();
    print_components_setup_global_delete_handler();
    print_components_initialized = true;
    console.log('✅ Inline-редактирование инициализировано');
}

function print_components_load_dropdown_data() {
    console.log('📥 Загрузка данных для выпадающих списков...');
    if (print_components_data_loaded) return;

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
// 7. НАСТРОЙКА ОБРАБОТЧИКОВ ТАБЛИЦЫ (исправлены индексы колонок)
// ============================================================================

function print_components_setup_table_event_listeners() {
    const tableBody = document.getElementById('print-components-table-body');
    if (!tableBody) {
        setTimeout(print_components_setup_table_event_listeners, 500);
        return;
    }

    tableBody.addEventListener('dblclick', function(event) {
        if (print_components_dblclick_lock) return;
        print_components_dblclick_lock = true;
        setTimeout(() => { print_components_dblclick_lock = false; }, 300);

        const cell = event.target.closest('td');
        const row = event.target.closest('tr');
        if (!cell || !row || cell.classList.contains('component-actions')) return;

        const componentId = row.dataset.componentId;
        if (!componentId) return;

        const cellIndex = Array.from(row.children).indexOf(cell);
        // Индексы с учётом 11 колонок:
        // 0 – № компонента (не редактируется)
        // 1 – Принтер (редактируется)
        // 2 – Бумага (редактируется)
        // 3 – Листов (не редактируется)
        // 4 – Себестоимость (не редактируется)
        // 5 – Наценка (не редактируется)
        // 6 – Цена (не редактируется)
        // 7 – Прибыль (не редактируется)
        // 8 – Режим (редактируется)
        // 9 – Стоимость (не редактируется)
        // 10 – Действия (не редактируется)

        let fieldName = '', fieldType = '';
        switch (cellIndex) {
            case 0: return;
            case 1: fieldName = 'printer'; fieldType = 'printer'; break;
            case 2: fieldName = 'paper'; fieldType = 'paper'; break;
            case 3: return;
            case 4: return;
            case 5: return;
            case 6: return;
            case 7: return;
            case 8: fieldName = 'printing_mode'; fieldType = 'printing_mode'; break;
            case 9: return;
            case 10: return;
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
// 8. ГЛОБАЛЬНЫЙ ОБРАБОТЧИК ДЛЯ КНОПОК УДАЛЕНИЯ
// ============================================================================

function print_components_setup_global_delete_handler() {
    const tableContainer = document.getElementById('print-components-container');
    if (!tableContainer) {
        setTimeout(print_components_setup_global_delete_handler, 500);
        return;
    }
    tableContainer.removeEventListener('click', print_components_handle_delete_click_global);
    tableContainer.addEventListener('click', print_components_handle_delete_click_global);
}

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
// 9. ФУНКЦИИ INLINE-РЕДАКТИРОВАНИЯ (исправлена проблема с blur)
// ============================================================================

function print_components_start_edit(cell, componentId, fieldName, fieldType, row) {
    console.log(`✏️ Начало редактирования: поле=${fieldName}, тип=${fieldType}, ID=${componentId}`);
    if (print_components_is_editing && print_components_current_editing_element !== cell) {
        print_components_finish_edit(true);
    }
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

    print_components_current_editing_id = componentId;
    print_components_current_editing_element = cell;
    if (fieldType === 'paper') {
        print_components_original_value = print_components_extract_paper_name(cell.innerHTML);
    } else {
        print_components_original_value = cell.textContent.trim();
    }
    print_components_current_field_type = fieldType;
    print_components_is_editing = true;
    cell.classList.add('editing-cell');
    cell.innerHTML = '';

    let inputElement;
    if (fieldType === 'printer') {
        inputElement = print_components_create_printer_dropdown(cell);
    } else if (fieldType === 'paper') {
        inputElement = print_components_create_paper_dropdown(cell);
    } else if (fieldType === 'printing_mode') {
        inputElement = print_components_create_mode_dropdown(cell);
    } else {
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = print_components_original_value;
        inputElement.className = 'inline-edit-input';
    }

    cell.appendChild(inputElement);

    // ===== ИСПРАВЛЕНИЕ: для select добавляем обработчик change =====
    if (inputElement.tagName === 'SELECT') {
        inputElement.addEventListener('change', function() {
            // При выборе значения из списка сразу сохраняем
            print_components_finish_edit(true);
        });
    }

    // ===== ИСПРАВЛЕНИЕ: в обработчике blur проверяем, куда ушёл фокус =====
    inputElement.addEventListener('blur', function(e) {
        // Ждём, чтобы дать время новому элементу получить фокус
        setTimeout(() => {
            // Если редактирование всё ещё активно и ячейка не изменилась
            if (print_components_is_editing && print_components_current_editing_element === cell) {
                const activeElement = document.activeElement;
                // Если новый активный элемент находится внутри редактируемой ячейки,
                // значит, фокус перешёл на сам select или его выпадающую часть – не закрываем.
                if (activeElement && cell.contains(activeElement)) {
                    return;
                }
                // Иначе завершаем редактирование с сохранением
                print_components_finish_edit(true);
            }
        }, 100);
    });

    inputElement.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            print_components_finish_edit(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            print_components_finish_edit(false);
        }
    });

    setTimeout(() => {
        inputElement.focus();
        if (inputElement.tagName === 'INPUT') inputElement.select();
    }, 10);
}

function print_components_extract_paper_name(html) {
    const brIndex = html.indexOf('<br');
    if (brIndex !== -1) return html.substring(0, brIndex).trim();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent.trim();
}

function print_components_create_printer_dropdown(cell) {
    const select = document.createElement('select');
    select.className = 'inline-edit-select';
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
    if (currentValue && currentValue.toLowerCase().includes('двуст')) optionDuplex.selected = true;
    else optionSingle.selected = true;
    return select;
}

function print_components_extract_number(text) {
    const numberString = text.replace(/[^\d]/g, '');
    return numberString ? parseInt(numberString, 10) : 1;
}

function print_components_extract_price(text) {
    const priceString = text.replace(/[^\d.,]/g, '').replace(',', '.');
    return priceString ? parseFloat(priceString) : 0.00;
}

// ============================================================================
// 10. ЗАВЕРШЕНИЕ РЕДАКТИРОВАНИЯ (СОХРАНЕНИЕ ИЛИ ОТМЕНА)
// ============================================================================

function print_components_finish_edit(save) {
    if (!print_components_is_editing || !print_components_current_editing_element) return;

    const cell = print_components_current_editing_element;
    const componentId = print_components_current_editing_id;
    const fieldType = print_components_current_field_type;

    const cellIndex = Array.from(cell.parentElement.children).indexOf(cell);
    let fieldName = '';
    switch (cellIndex) {
        case 1: fieldName = 'printer'; break;
        case 2: fieldName = 'paper'; break;
        case 8: fieldName = 'printing_mode'; break;
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

        let newValue = '', displayText = '';
        if (inputElement.tagName === 'SELECT') {
            const selectedOption = inputElement.options[inputElement.selectedIndex];
            newValue = selectedOption.value;
            displayText = selectedOption.textContent;
            if (newValue === '') {
                displayText = fieldType === 'printer' ? 'Принтер не выбран' : 'Бумага не выбрана';
            }
        } else {
            newValue = inputElement.value.trim();
            displayText = newValue;
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

function print_components_validate_value(value, fieldType) {
    if (fieldType === 'printer' || fieldType === 'paper') return true;
    if (!value && value !== '0') return false;
    if (fieldType === 'printing_mode') return true; // любое из двух допустимо
    return value.length > 0;
}

function print_components_has_value_changed(newValue, fieldType) {
    if (fieldType === 'printing_mode') {
        const originalText = print_components_original_value;
        const newText = (newValue === 'duplex') ? 'Двуст.' : 'Одност.';
        return originalText !== newText;
    }
    return newValue !== print_components_original_value;
}

// ============================================================================
// 11. СОХРАНЕНИЕ НА СЕРВЕР
// ============================================================================

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
            // Сбрасываем состояние редактирования, чтобы не мешать перерисовке
            print_components_reset_editing_state();

            // Обновляем секцию вычислений листов (пересчитывает количество листов)
            if (window.vichisliniyaListov && typeof window.vichisliniyaListov.loadVichisliniyaListovParameters === 'function') {
                window.vichisliniyaListov.loadVichisliniyaListovParameters(componentId);
                console.log(`📤 Обновлена секция вычислений листов для компонента ${componentId}`);
            }

            // ===== ИСПРАВЛЕНИЕ: полная перезагрузка данных для текущего просчёта с восстановлением выбора =====
            const proschetId = window.printComponentsSection?.getCurrentProschetId();
            if (proschetId) {
                const proschetRow = document.querySelector('.proschet-row.selected');
                if (proschetRow && window.printComponentsSection?.updateForProschet) {
                    // Сохраняем ID редактируемого компонента до перезагрузки
                    const editedComponentId = componentId;
                    window.printComponentsSection.updateForProschet(proschetId, proschetRow);
                    // После перезагрузки (задержка, чтобы DOM успел обновиться) восстанавливаем выбор
                    setTimeout(() => {
                        const componentRow = document.querySelector(`tr[data-component-id="${editedComponentId}"]`);
                        if (componentRow) {
                            componentRow.click(); // симулируем клик для выбора
                            console.log(`✅ Восстановлен выбор компонента ${editedComponentId}`);
                        } else {
                            console.warn(`⚠️ Не удалось найти строку компонента ${editedComponentId} после перезагрузки`);
                        }
                    }, 500);
                } else {
                    console.warn('⚠️ Не удалось найти строку просчёта для перезагрузки');
                }
            } else {
                console.warn('⚠️ Не удалось получить ID просчёта для перезагрузки');
            }

            // Восстанавливаем ячейку с новым значением (будет перезаписано при перезагрузке, но для отзывчивости)
            cell.innerHTML = displayValue;
            cell.classList.remove('editing-cell');
        } else {
            // Ошибка на сервере
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
        console.error('❌ Ошибка при сохранении:', error);
        cell.innerHTML = `<span style="color: #e74c3c;">Ошибка сети</span>`;
        print_components_show_notification('Ошибка сети при сохранении', 'error');
        setTimeout(() => {
            cell.innerHTML = print_components_original_value;
            cell.classList.remove('editing-cell');
            print_components_reset_editing_state();
        }, 2000);
    });
}

// ============================================================================
// 12. ОТМЕНА РЕДАКТИРОВАНИЯ И СБРОС СОСТОЯНИЯ
// ============================================================================

function print_components_cancel_edit() {
    if (!print_components_is_editing || !print_components_current_editing_element) return;
    const cell = print_components_current_editing_element;
    cell.innerHTML = print_components_original_value;
    cell.classList.remove('editing-cell');
    print_components_reset_editing_state();
}

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

function print_components_delete_component(componentId, row) {
    const originalHTML = row.innerHTML;
    row.innerHTML = '<td colspan="11" style="text-align: center;"><i class="fas fa-spinner fa-spin"></i> Удаление...<\/td>';
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
        row.innerHTML = originalHTML;
        print_components_show_notification('Ошибка сети при удалении', 'error');
    });
}

// ============================================================================
// 14. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

function print_components_get_csrf_token() {
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) return metaToken.getAttribute('content');
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith('csrftoken=')) return decodeURIComponent(cookie.substring('csrftoken='.length));
    }
    return '';
}

// ============================================================================
// 15. ЭКСПОРТ СОСТОЯНИЯ РЕДАКТИРОВАНИЯ ДЛЯ ДРУГИХ МОДУЛЕЙ
// ============================================================================

window.printComponentsInlineEditState = {
    isEditing: () => print_components_is_editing,
    getEditingComponentId: () => print_components_current_editing_id
};

// ============================================================================
// 16. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ DOM
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
// 17. ПЕРЕОПРЕДЕЛЕНИЕ updateForProschet (сохраняем инициализацию после перезагрузки)
// ============================================================================

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