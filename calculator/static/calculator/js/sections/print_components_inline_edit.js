/*
print_components_inline_edit.js - JavaScript для inline-редактирования компонентов печати
ОБНОВЛЕНО: Исправлено открытие модального окна добавления компонента
ИСПРАВЛЕНИЕ: Добавлен комментарий о том, что колонка "Тираж" не редактируется
*/

"use strict";

// ===== 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КОНСТАНТЫ =====

const print_components_api_urls = {
    add: '/calculator/add-print-component/',
    update: '/calculator/update-print-component/',
    delete: '/calculator/delete-print-component/',
    getPrinters: '/calculator/get-printers/',
    getPapers: '/calculator/get-papers/',
    getComponents: '/calculator/get-print-components/',
};

let print_components_current_editing_id = null;
let print_components_current_editing_element = null;
let print_components_original_value = null;
let print_components_current_field_type = null;
let print_components_printers_list = [];
let print_components_papers_list = [];
let print_components_initialized = false;
let print_components_dblclick_lock = false;
let print_components_is_editing = false;
let print_components_data_loaded = false;



// ===== 2. ФУНКЦИЯ ДЛЯ РАСЧЁТА ЦЕНЫ НА ОСНОВЕ ТИРАЖА И ПРИНТЕРА =====

/**
 * Функция для автоматического расчёта цены за лист на основе:
 * 1. ID выбранного принтера
 * 2. Тиража из просчёта (circulation)
 * Использует API приложения print_price для расчёта по методу интерполяции
 * 
 * @param {number|string} printerId - ID выбранного принтера
 * @param {number|string} circulation - Тиража из просчёта
 * @param {string} modalId - Уникальный ID модального окна (для обновления поля)
 * @returns {Promise} - Promise с результатом расчёта
 */
function print_components_calculate_price_for_circulation(printerId, circulation, modalId) {
    console.log(`💰 Запрос расчёта цены: принтер=${printerId}, тираж=${circulation}`);
    
    // Проверяем обязательные параметры
    if (!printerId || !circulation) {
        console.warn('❌ Не указан принтер или тираж для расчёта цены');
        return Promise.resolve(null);
    }
    
    // Преобразуем тираж в число
    const circulationNumber = parseInt(circulation);
    if (isNaN(circulationNumber) || circulationNumber <= 0) {
        console.warn(`⚠️ Некорректный тираж для расчёта: ${circulation}`);
        return Promise.resolve(null);
    }
    
    // Находим поле ввода цены по modalId
    const priceInput = document.getElementById(`component-price-per-sheet-${modalId}`);
    if (!priceInput) {
        console.error('❌ Поле ввода цены не найдено');
        return Promise.resolve(null);
    }
    
    // Находим элемент с информацией о расчёте
    const calculationInfo = document.getElementById(`price-calculation-info-${modalId}`);
    const calculationDetails = document.getElementById(`calculation-details-${modalId}`);
    
    // Показываем статус "Расчёт..."
    if (priceInput) {
        priceInput.value = 'Расчёт...';
        priceInput.style.color = '#666';
        priceInput.style.fontStyle = 'italic';
    }
    
    if (calculationInfo) {
        calculationInfo.style.display = 'block';
    }
    
    if (calculationDetails) {
        calculationDetails.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            Расчёт цены для тиража ${circulationNumber} шт...
        `;
    }
    
    // Подготавливаем данные для отправки в API print_price
    const formData = new FormData();
    formData.append('arbitrary_copies', circulationNumber);
    formData.append('csrfmiddlewaretoken', print_components_get_csrf_token());
    
    console.log(`📤 Отправка запроса в print_price API: /print_price/api/calculate_arbitrary_price/${printerId}/`);
    
    // Отправляем запрос в приложение print_price для расчёта цены
    return fetch(`/print_price/api/calculate_arbitrary_price/${printerId}/`, {
        method: 'POST',
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ошибка: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('📊 Ответ от API расчёта цены:', data);
        
        if (data.success) {
            // Успешный расчёт - получаем рассчитанную цену
            const calculatedPrice = data.calculated_price;
            
            // Форматируем цену до 2 знаков после запятой
            const formattedPrice = parseFloat(calculatedPrice).toFixed(2);
            
            // Обновляем поле ввода цены
            if (priceInput) {
                priceInput.value = formattedPrice;
                priceInput.style.color = '#0B8661';
                priceInput.style.fontStyle = 'normal';
                priceInput.style.fontWeight = 'bold';
            }
            
            // Обновляем информацию о расчёте
            if (calculationInfo && calculationDetails) {
                calculationDetails.innerHTML = `
                    <i class="fas fa-check-circle" style="color: #4CAF50;"></i>
                    Цена рассчитана для тиража ${circulationNumber} шт: <strong>${formattedPrice} руб./лист</strong>
                    <br><small>На основе ${data.points_count || 0} опорных точек (${data.interpolation_method_display || 'линейная интерполяция'})</small>
                `;
                calculationInfo.style.backgroundColor = '#e8f5e9';
                calculationInfo.style.borderLeftColor = '#4CAF50';
            }
            
            console.log(`✅ Цена успешно рассчитана: ${formattedPrice} руб./лист`);
            print_components_show_notification(
                `Цена рассчитана: ${formattedPrice} руб./лист для тиража ${circulationNumber} шт`, 
                'success'
            );
            
            return formattedPrice;
        } else {
            // Ошибка расчёта
            console.warn('⚠️ Не удалось рассчитать цену:', data.error);
            
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
                    Не удалось рассчитать цену: ${data.error || 'неизвестная ошибка'}
                `;
                calculationInfo.style.backgroundColor = '#ffebee';
                calculationInfo.style.borderLeftColor = '#e74c3c';
            }
            
            print_components_show_notification(
                `Не удалось рассчитать цену: ${data.error || 'неизвестная ошибка'}`,
                'warning'
            );
            
            return null;
        }
    })
    .catch(error => {
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

// ===== 3. ОБНОВЛЁННАЯ ФУНКЦИЯ СОЗДАНИЯ МОДАЛЬНОГО ОКНА =====

/**
 * Функция создания модального окна для добавления компонента печати
 * ОБНОВЛЕНО: Добавлен автоматический расчёт цены при выборе принтера
 * 
 * @param {number|string} proschetId - ID просчёта, для которого добавляется компонент
 */
function print_components_create_add_modal(proschetId) {
    console.log(`🖨️ Создание модального окна добавления компонента для просчёта ID: ${proschetId}`);
    
    // Создаем уникальный идентификатор для модального окна
    const modalId = `print-components-modal-${Date.now()}`;
    
    // Переменная для хранения тиража просчёта
    let proschetCirculation = 1; // Значение по умолчанию
    
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
            // Получаем тираж из данных просчёта
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
        // Создаем HTML для модального окна
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
                                    <!-- Принтеры будут добавлены динамически -->
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
                            
                            <!-- Количество листов (необязательное поле) -->
                            <div class="form-group">
                                <label for="component-sheet-count-${modalId}">
                                    <i class="fas fa-copy"></i>
                                    Количество листов
                                </label>
                                <input type="number" id="component-sheet-count-${modalId}" 
                                       class="modal-input" min="1" value="1">
                                <small class="form-hint">
                                    Количество листов для печати. Необязательное поле.
                                </small>
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
                                
                                <!-- Блок информации о расчёте -->
                                <div class="price-calculation-info" id="price-calculation-info-${modalId}" 
                                     style="display: none; margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 4px; border-left: 3px solid #2196F3;">
                                    <div id="calculation-details-${modalId}" style="font-size: 0.9em; color: #555;">
                                        <!-- Здесь будет отображаться информация о расчёте -->
                                    </div>
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
        
        // Создаем контейнер для модального окна
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
        
        // Заполняем список принтеров
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
        
        // Заполняем список бумаги
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
                    
                    // Показываем информацию о расчёте
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
                        // Включаем кнопку отправки, если цена рассчитана
                        if (calculatedPrice !== null && submitBtn) {
                            submitBtn.disabled = false;
                        } else {
                            submitBtn.disabled = true;
                        }
                    });
                } else {
                    // Если принтер не выбран, сбрасываем цену
                    if (priceInput) {
                        priceInput.value = '0.00';
                        priceInput.style.color = '';
                        priceInput.style.fontStyle = '';
                    }
                    
                    // Скрываем информацию о расчёте
                    if (calculationInfo) {
                        calculationInfo.style.display = 'none';
                    }
                    
                    // Блокируем кнопку отправки
                    if (submitBtn) {
                        submitBtn.disabled = true;
                    }
                }
            });
        }
        
        // Получаем элементы для управления модальным окном
        const overlay = document.getElementById(modalId);
        const closeBtn = document.getElementById(`modal-close-btn-${modalId}`);
        const cancelBtn = document.getElementById(`modal-cancel-btn-${modalId}`);
        const form = document.getElementById(`print-components-add-form-${modalId}`);
        
        // Функция закрытия модального окна
        const closeModal = () => {
            if (overlay && overlay.parentNode) {
                overlay.classList.remove('active');
                const modal = overlay.querySelector('.print-components-modal');
                if (modal) modal.classList.remove('active');
                
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                    }
                }, 300);
            }
        };
        
        // Обработчик клика по оверлею (закрытие при клике вне окна)
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal();
                }
            });
        }
        
        // Обработчик кнопки закрытия
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }
        
        // Обработчик кнопки отмены
        if (cancelBtn) {
            cancelBtn.addEventListener('click', closeModal);
        }
        
        // Обработчик отправки формы
        if (form && submitBtn) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                
                // Получаем значения из формы
                const printerId = printerSelect?.value || '';
                const paperId = paperSelect?.value || '';
                const sheetCount = document.getElementById(`component-sheet-count-${modalId}`)?.value || '';
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
                
                // Подготавливаем данные для отправки
                const formData = new FormData();
                formData.append('proschet_id', proschetId);
                formData.append('printer_id', printerId);
                formData.append('paper_id', paperId);
                formData.append('sheet_count', sheetCount || 1);
                formData.append('price_per_sheet', priceNumber.toFixed(2));
                
                // Сохраняем исходный текст кнопки
                const originalText = submitBtn.innerHTML;
                
                // Изменяем текст кнопки и блокируем её
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Добавление...';
                submitBtn.disabled = true;
                
                // Отправляем данные на сервер
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
                        // Показываем уведомление об успехе
                        print_components_show_notification('Компонент успешно добавлен', 'success');
                        
                        // Закрываем модальное окно
                        closeModal();
                        
                        // Обновляем таблицу компонентов
                        const proschetRow = document.querySelector('.proschet-row.selected');
                        if (proschetRow && window.printComponentsSection?.updateForProschet) {
                            window.printComponentsSection.updateForProschet(proschetId, proschetRow);
                        }
                    } else {
                        // Восстанавливаем кнопку
                        submitBtn.innerHTML = originalText;
                        submitBtn.disabled = false;
                        
                        // Показываем ошибку
                        print_components_show_notification('Ошибка добавления: ' + data.message, 'error');
                    }
                })
                .catch(error => {
                    // Восстанавливаем кнопку
                    submitBtn.innerHTML = originalText;
                    submitBtn.disabled = false;
                    
                    // Показываем ошибку сети
                    print_components_show_notification('Ошибка сети при добавлении', 'error');
                });
            });
        }
        
        console.log('✅ Модальное окно добавления компонента создано с функцией авторасчёта цены');
    });
}

// ===== 4. ОБНОВЛЁННАЯ ФУНКЦИЯ ОБРАБОТЧИКА ДОБАВЛЕНИЯ =====

/**
 * Обработчик нажатия на кнопку добавления компонента печати
 * Теперь включает получение тиража просчёта перед созданием модального окна
 */
function print_components_handle_add_component() {
    console.log('🖨️ Обработчик добавления компонента печати вызван');
    
    // Получаем ID текущего просчёта
    const currentProschetId = window.printComponentsSection?.getCurrentProschetId();
    
    if (!currentProschetId) {
        print_components_show_notification('Сначала выберите просчёт', 'warning');
        return;
    }

    // ДОБАВЛЕНО: Проверяем, что секция "Печатные компоненты" готова
    if (window.printComponentsSection?.isReady && !window.printComponentsSection.isReady()) {
        print_components_show_notification('Подождите, секция ещё загружается...', 'warning');
        return;
    }    

    console.log(`🖨️ Создание модального окна для просчёта ID: ${currentProschetId}`);
    
    // Вызываем функцию создания модального окна
    print_components_create_add_modal(currentProschetId);
}




// ===== 2. ФУНКЦИИ УВЕДОМЛЕНИЙ =====

function print_components_show_notification(message, type = 'info') {
    console.log(`💬 Уведомление [${type}]: ${message}`);
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === 'success' ? '#4CAF50' : 
                     type === 'error' ? '#f44336' : 
                     type === 'warning' ? '#ff9800' : '#2196F3'};
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
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 10);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ===== 3. ИНИЦИАЛИЗАЦИЯ =====

function print_components_init_inline_edit() {
    console.log('🔧 Инициализация inline-редактирования...');
    
    if (print_components_initialized) {
        return;
    }
    
    print_components_load_dropdown_data();
    print_components_setup_table_event_listeners();
    print_components_setup_global_delete_handler();
    print_components_setup_global_click_handler();
    
    print_components_initialized = true;
    console.log('✅ Inline-редактирование инициализировано');
}

function print_components_load_dropdown_data() {
    console.log('📥 Загрузка данных для выпадающих списков...');
    
    if (print_components_data_loaded) {
        return;
    }
    
    // Загрузка принтеров
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
    
    // Загрузка бумаги
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
        print_components_data_loaded = true;
    });
}

function print_components_setup_table_event_listeners() {
    const tableBody = document.getElementById('print-components-table-body');
    
    if (!tableBody) {
        setTimeout(print_components_setup_table_event_listeners, 500);
        return;
    }
    
    // Двойной клик для начала редактирования
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
        
        const cellIndex = Array.from(row.children).indexOf(cell);
        let fieldName = '';
        let fieldType = 'text';
        
        switch (cellIndex) {
            case 0: return; // № компонента - не редактируем
            case 1: fieldName = 'printer'; fieldType = 'printer'; break; // Принтер
            case 2: fieldName = 'paper'; fieldType = 'paper'; break; // Бумага
            case 3: return; // ИСПРАВЛЕНО: Колонка "Тираж" - не редактируем, так как берется из просчёта
            case 4: fieldName = 'price_per_sheet'; fieldType = 'price'; break; // Цена за лист
            case 5: return; // Стоимость - не редактируем (вычисляемое поле)
            case 6: return; // Действия - не редактируем
            default: return;
        }
        
        print_components_start_edit(cell, componentId, fieldName, fieldType, row);
    });
    
    // Выделение строки
    tableBody.addEventListener('click', function(event) {
        const row = event.target.closest('tr');
        if (row && !event.target.closest('.delete-component-btn')) {
            const allRows = tableBody.querySelectorAll('tr');
            allRows.forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
        }
    });
}

// ===== ИСПРАВЛЕНИЕ: Глобальный обработчик для кнопок удаления =====

function print_components_setup_global_delete_handler() {
    console.log('🔧 Настройка глобального обработчика для кнопок удаления...');
    
    const tableContainer = document.getElementById('print-components-container');
    
    if (!tableContainer) {
        console.warn('❌ Контейнер таблицы не найден, пытаемся снова через 500мс');
        setTimeout(print_components_setup_global_delete_handler, 500);
        return;
    }
    
    tableContainer.removeEventListener('click', print_components_handle_delete_click_global);
    
    tableContainer.addEventListener('click', print_components_handle_delete_click_global);
    
    console.log('✅ Глобальный обработчик для кнопок удаления настроен');
}

function print_components_handle_delete_click_global(event) {
    const deleteBtn = event.target.closest('.delete-component-btn');
    
    if (deleteBtn) {
        event.preventDefault();
        event.stopPropagation();
        
        const componentId = deleteBtn.dataset.componentId;
        const row = deleteBtn.closest('tr');
        
        if (!componentId) {
            console.error('❌ Не удалось получить ID компонента из кнопки удаления');
            return;
        }
        
        if (confirm('Вы уверены, что хотите удалить этот компонент печати?')) {
            print_components_delete_component(componentId, row);
        }
    }
}

function print_components_setup_global_click_handler() {
    document.addEventListener('mousedown', function(event) {
        if (!print_components_is_editing || !print_components_current_editing_element) {
            return;
        }
        
        const clickedElement = event.target;
        const editingCell = print_components_current_editing_element;
        
        const clickedInside = editingCell.contains(clickedElement);
        
        if (!clickedInside) {
            print_components_finish_edit(true);
        }
    });
    
    document.addEventListener('keydown', function(event) {
        if (!print_components_is_editing) {
            return;
        }
        
        if (event.key === 'Enter') {
            event.preventDefault();
            print_components_finish_edit(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            print_components_finish_edit(false);
        }
    });
}

// ===== 4. ФУНКЦИИ INLINE-РЕДАКТИРОВАНИЯ =====

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
    print_components_original_value = cell.textContent.trim();
    print_components_current_field_type = fieldType;
    print_components_is_editing = true;
    
    cell.classList.add('editing-cell');
    
    cell.innerHTML = '';
    
    let inputElement;
    
    if (fieldType === 'printer') {
        inputElement = print_components_create_printer_dropdown(cell);
    } else if (fieldType === 'paper') {
        inputElement = print_components_create_paper_dropdown(cell);
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
    
    cell.appendChild(inputElement);
    
    setTimeout(() => {
        inputElement.focus();
        if (inputElement.tagName === 'INPUT') {
            inputElement.select();
        }
    }, 10);
    
    inputElement.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            print_components_finish_edit(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            print_components_finish_edit(false);
        }
    });
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
            
            if (currentValue && paper.name === currentValue) {
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

function print_components_extract_number(text) {
    const numberString = text.replace(/[^\d]/g, '');
    return numberString ? parseInt(numberString, 10) : 1;
}

function print_components_extract_price(text) {
    const priceString = text.replace(/[^\d.,]/g, '').replace(',', '.');
    return priceString ? parseFloat(priceString) : 0.00;
}

function print_components_finish_edit(save) {
    if (!print_components_is_editing || !print_components_current_editing_element) {
        return;
    }
    
    const cell = print_components_current_editing_element;
    const componentId = print_components_current_editing_id;
    const fieldType = print_components_current_field_type;
    
    let fieldName = '';
    const cellIndex = Array.from(cell.parentElement.children).indexOf(cell);
    
    switch (cellIndex) {
        case 1: fieldName = 'printer'; break;
        case 2: fieldName = 'paper'; break;
        case 3: return; // ИСПРАВЛЕНО: Колонка "Тираж" - не редактируется, не сохраняем
        case 4: fieldName = 'price_per_sheet'; break;
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

function print_components_validate_value(value, fieldType) {
    if (fieldType === 'printer' || fieldType === 'paper') {
        return true;
    }
    
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

function print_components_has_value_changed(newValue, fieldType) {
    if (fieldType === 'number') {
        const originalNumber = print_components_extract_number(print_components_original_value);
        return parseInt(newValue, 10) !== originalNumber;
    }
    
    if (fieldType === 'price') {
        const originalPrice = print_components_extract_price(print_components_original_value);
        return parseFloat(newValue) !== originalPrice;
    }
    
    return newValue !== print_components_original_value;
}

function print_components_save_to_server(componentId, fieldName, fieldValue, displayValue, cell) {
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
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            cell.innerHTML = displayValue;
            cell.classList.remove('editing-cell');
            
            print_components_show_notification('Изменения сохранены', 'success');
            
            const currentProschetId = window.printComponentsSection?.getCurrentProschetId();
            if (currentProschetId) {
                setTimeout(() => {
                    const proschetRow = document.querySelector('.proschet-row.selected');
                    if (proschetRow && window.printComponentsSection?.updateForProschet) {
                        window.printComponentsSection.updateForProschet(currentProschetId, proschetRow);
                    }
                }, 300);
            }
        } else {
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

function print_components_cancel_edit() {
    if (!print_components_is_editing || !print_components_current_editing_element) {
        return;
    }
    
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

// ===== 5. ФУНКЦИИ УДАЛЕНИЯ =====

function print_components_delete_component(componentId, row) {
    const originalHTML = row.innerHTML;
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

// ===== 6. ФУНКЦИИ ДОБАВЛЕНИЯ - ИСПРАВЛЕННАЯ ВЕРСИЯ =====

/**
 * Обработчик нажатия на кнопку добавления компонента печати
 */
function print_components_handle_add_component() {
    console.log('🖨️ Обработчик добавления компонента печати вызван');
    
    const currentProschetId = window.printComponentsSection?.getCurrentProschetId();
    
    if (!currentProschetId) {
        print_components_show_notification('Сначала выберите просчёт', 'warning');
        return;
    }
    
    console.log(`🖨️ Создание модального окна для просчёта ID: ${currentProschetId}`);
    
    print_components_create_add_modal(currentProschetId);
}


// ===== 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

function print_components_get_csrf_token() {
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) {
        return metaToken.getAttribute('content');
    }
    
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith('csrftoken=')) {
            return decodeURIComponent(cookie.substring('csrftoken='.length));
        }
    }
    
    return '';
}

// ===== 8. ИНИЦИАЛИЗАЦИЯ И ЭКСПОРТ ФУНКЦИЙ =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 Загрузка inline-редактирования компонентов печати...');
    
    // Инициализируем inline-редактирование
    setTimeout(() => {
        print_components_init_inline_edit();
        
        // Экспортируем функции для использования в print_components.js
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

// ===== 9. МОДИФИКАЦИЯ ФУНКЦИИ ОБНОВЛЕНИЯ =====

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