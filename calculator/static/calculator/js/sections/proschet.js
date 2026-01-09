/*
static/js/proschet.js
Обновленный JavaScript для управления просчётами с поддержкой нового дизайна
*/

// Глобальные переменные для управления просчетами
let proschetManager = {
    currentProschet: null,      // Текущий активный просчет
    proschetsList: [],          // Список всех просчетов
    currentPage: 1,            // Текущая страница пагинации
    proschetsPerPage: 10,      // Количество просчетов на странице
    totalPages: 1              // Всего страниц
};

// Ждем полной загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('Секция "Просчёт" с новым дизайном загружена');
    
    // Инициализация секции
    initializeProschetSection();
    
    // Настройка обработчиков событий
    setupProschetEventListeners();
    
    // Загрузка данных из localStorage или сервера
    loadProschetData();
    
    // Загрузка списка просчетов
    loadProschetsList();
});

/**
 * Инициализация секции "Просчёт"
 */
function initializeProschetSection() {
    console.log('Инициализация новой секции "Просчёт"...');
    
    // Устанавливаем текущую дату по умолчанию
    const currentDate = getCurrentDate();
    const dateDisplay = document.getElementById('proschet-date-display');
    if (dateDisplay) {
        dateDisplay.textContent = currentDate;
        dateDisplay.setAttribute('data-original-value', currentDate);
        
        // Устанавливаем дату в input
        const dateInput = document.getElementById('proschet-date-input');
        if (dateInput) {
            const dateParts = currentDate.split('.');
            if (dateParts.length === 3) {
                dateInput.value = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
            }
        }
    }
    
    // Инициализируем номер просчета
    const numberDisplay = document.getElementById('proschet-number-display');
    if (numberDisplay && (!numberDisplay.textContent || numberDisplay.textContent.trim() === '')) {
        numberDisplay.textContent = 'ЧЗ-0000';
        numberDisplay.setAttribute('data-original-value', 'ЧЗ-0000');
    }
    
    // Инициализируем статус
    const statusDisplay = document.getElementById('proschet-status-display');
    if (statusDisplay && (!statusDisplay.textContent || statusDisplay.textContent.trim() === '')) {
        updateStatusDisplay('draft', '');
    }
    
    // Инициализируем клиента
    const clientDisplay = document.getElementById('proschet-client-display');
    if (clientDisplay && (!clientDisplay.textContent || clientDisplay.textContent.trim() === '')) {
        clientDisplay.textContent = 'Не указан';
        clientDisplay.setAttribute('data-original-value', '');
    }
    
    // Проверяем наличие данных в localStorage
    checkForSavedProschets();
}

/**
 * Настройка обработчиков событий
 */
function setupProschetEventListeners() {
    console.log('Настройка обработчиков событий для новой секции...');
    
    // ===== ОСНОВНЫЕ КНОПКИ =====
    
    // Кнопка создания нового просчёта
    const createBtn = document.getElementById('create-proschet-btn');
    if (createBtn) {
        createBtn.addEventListener('click', createNewProschet);
    }
    
    // Кнопка копирования текущего просчёта
    const copyBtn = document.getElementById('copy-proschet-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyCurrentProschet);
    }
    
    // Кнопка удаления текущего просчёта
    const deleteBtn = document.getElementById('delete-proschet-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', showDeleteConfirmation);
    }
    
    // Кнопка обновления списка просчётов
    const refreshBtn = document.getElementById('refresh-proschets-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadProschetsList);
    }
    
    // ===== КНОПКИ ПАГИНАЦИИ =====
    
    // Кнопка предыдущей страницы
    const prevPageBtn = document.getElementById('prev-page-btn');
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', function() {
            if (proschetManager.currentPage > 1) {
                proschetManager.currentPage--;
                renderProschetsTable();
            }
        });
    }
    
    // Кнопка следующей страницы
    const nextPageBtn = document.getElementById('next-page-btn');
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', function() {
            if (proschetManager.currentPage < proschetManager.totalPages) {
                proschetManager.currentPage++;
                renderProschetsTable();
            }
        });
    }
    
    // ===== МОДАЛЬНОЕ ОКНО ПОДТВЕРЖДЕНИЯ =====
    
    // Кнопка подтверждения удаления в модальном окне
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteCurrentProschet);
    }
    
    // Кнопка отмены в модальном окне
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', hideConfirmationModal);
    }
    
    // Закрытие модального окна при клике вне его
    const modal = document.getElementById('confirmation-modal');
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                hideConfirmationModal();
            }
        });
    }
    
    // ===== СОБЫТИЯ ДЛЯ ОБНОВЛЕНИЯ ДАННЫХ =====
    
    // Обновление общей суммы при изменении данных
    document.addEventListener('proschetDataChanged', function() {
        updateTotalAmount();
    });
    
    // Загрузка просчета при клике на строку в таблице
    document.addEventListener('click', function(event) {
        // Проверяем, был ли клик на строке таблицы (но не на кнопке действия)
        const tableRow = event.target.closest('.table-row');
        if (tableRow && !event.target.closest('.col-actions')) {
            const proschetId = tableRow.getAttribute('data-proschet-id');
            if (proschetId) {
                loadProschetById(proschetId);
            }
        }
    });
}

/**
 * Создает новый просчёт
 */
function createNewProschet() {
    console.log('Создание нового просчёта...');
    
    // Генерируем уникальный ID и номер
    const proschetId = 'proschet_' + Date.now();
    const proschetNumber = generateProschetNumber();
    const currentDate = getCurrentDate();
    
    // Создаем объект нового просчета
    const newProschet = {
        id: proschetId,
        number: proschetNumber,
        date: currentDate,
        status: 'draft',
        client: '',
        total: 0.00,
        items: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    // Устанавливаем как текущий просчет
    setCurrentProschet(newProschet);
    
    // Обновляем отображение
    updateProschetDisplay(newProschet);
    
    // Сбрасываем data-proschet-id у полей текущего просчета
    resetCurrentProschetFieldsId(proschetId);
    
    // Добавляем в список просчетов
    addToProschetsList(newProschet);
    
    // Включаем кнопки управления
    enableProschetButtons();
    
}

/**
 * Сбрасывает data-proschet-id у полей текущего просчета
 * @param {string} proschetId - ID просчёта
 */
function resetCurrentProschetFieldsId(proschetId) {
    const fields = document.querySelectorAll('#proschet-info .editable-field');
    fields.forEach(field => {
        field.setAttribute('data-proschet-id', proschetId);
    });
    
    const inputs = document.querySelectorAll('#proschet-info .inline-edit-input');
    inputs.forEach(input => {
        input.setAttribute('data-proschet-id', proschetId);
    });
}

/**
 * Генерирует номер нового просчёта
 * @returns {string} Номер просчёта
 */
function generateProschetNumber() {
    // Получаем последний номер из localStorage
    let lastNumber = localStorage.getItem('last_proschet_number');
    if (!lastNumber) {
        lastNumber = 0;
    } else {
        lastNumber = parseInt(lastNumber);
    }
    
    // Увеличиваем номер
    const newNumber = lastNumber + 1;
    
    // Сохраняем новый последний номер
    localStorage.setItem('last_proschet_number', newNumber.toString());
    
    // Форматируем номер: ЧЗ-0001, ЧЗ-0002 и т.д.
    const formattedNumber = newNumber.toString().padStart(4, '0');
    return `ЧЗ-${formattedNumber}`;
}

/**
 * Устанавливает текущий просчёт
 * @param {Object} proschet - Объект просчёта
 */
function setCurrentProschet(proschet) {
    proschetManager.currentProschet = proschet;
    
    // Сохраняем в localStorage
    localStorage.setItem('current_proschet', JSON.stringify(proschet));
    
    // Устанавливаем ID в скрытое поле
    const dataElement = document.getElementById('proschet-data');
    if (dataElement) {
        dataElement.setAttribute('data-current-proschet-id', proschet.id);
    }
}

/**
 * Обновляет отображение текущего просчёта
 * @param {Object} proschet - Объект просчёта
 */
function updateProschetDisplay(proschet) {
    // Обновляем номер просчёта
    const numberDisplay = document.getElementById('proschet-number-display');
    if (numberDisplay) {
        numberDisplay.textContent = proschet.number;
        numberDisplay.setAttribute('data-original-value', proschet.number);
        numberDisplay.setAttribute('data-proschet-id', proschet.id);
    }
    
    const numberInput = document.getElementById('proschet-number-input');
    if (numberInput) {
        numberInput.value = proschet.number;
        numberInput.setAttribute('data-proschet-id', proschet.id);
    }
    
    // Обновляем дату
    const dateDisplay = document.getElementById('proschet-date-display');
    if (dateDisplay) {
        dateDisplay.textContent = proschet.date;
        dateDisplay.setAttribute('data-original-value', proschet.date);
        dateDisplay.setAttribute('data-proschet-id', proschet.id);
    }
    
    const dateInput = document.getElementById('proschet-date-input');
    if (dateInput) {
        // Преобразуем дату из формата ДД.ММ.ГГГГ в ГГГГ-ММ-ДД
        const dateParts = proschet.date.split('.');
        if (dateParts.length === 3) {
            const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
            dateInput.value = formattedDate;
        }
        dateInput.setAttribute('data-proschet-id', proschet.id);
    }
    
    // Обновляем статус
    updateStatusDisplay(proschet.status, proschet.id);
    
    // Обновляем клиента
    const clientDisplay = document.getElementById('proschet-client-display');
    if (clientDisplay) {
        clientDisplay.textContent = proschet.client || 'Не указан';
        clientDisplay.setAttribute('data-original-value', proschet.client || '');
        clientDisplay.setAttribute('data-proschet-id', proschet.id);
    }
    
    const clientInput = document.getElementById('proschet-client-input');
    if (clientInput) {
        clientInput.value = proschet.client || '';
        clientInput.setAttribute('data-proschet-id', proschet.id);
    }
    
    // Обновляем общую сумму
    updateTotalAmount();
}

/**
 * Обновляет отображение статуса
 * @param {string} status - Статус просчёта
 * @param {string} proschetId - ID просчёта
 */
function updateStatusDisplay(status, proschetId) {
    const statusDisplay = document.getElementById('proschet-status-display');
    const statusSelect = document.getElementById('proschet-status-select');
    
    if (!statusDisplay || !statusSelect) return;
    
    // Удаляем все классы статусов
    statusDisplay.className = 'proschet-value editable-field status-badge';
    
    // Устанавливаем текст и класс в зависимости от статуса
    let statusText = '';
    let statusClass = '';
    
    switch (status) {
        case 'draft':
            statusText = 'Черновик';
            statusClass = 'status-draft';
            break;
        case 'active':
            statusText = 'Активный';
            statusClass = 'status-active';
            break;
        case 'saved':
            statusText = 'Сохраненный';
            statusClass = 'status-saved';
            break;
        case 'cancelled':
            statusText = 'Отмененный';
            statusClass = 'status-cancelled';
            break;
        default:
            statusText = 'Черновик';
            statusClass = 'status-draft';
    }
    
    // Обновляем отображение
    statusDisplay.textContent = statusText;
    statusDisplay.classList.add(statusClass);
    statusDisplay.setAttribute('data-original-value', status);
    statusDisplay.setAttribute('data-proschet-id', proschetId);
    
    // Обновляем выпадающий список
    statusSelect.value = status;
    statusSelect.setAttribute('data-proschet-id', proschetId);
}

/**
 * Обновляет общую сумму просчёта
 */
function updateTotalAmount() {
    if (!proschetManager.currentProschet) return;
    
    // В реальном приложении здесь будет расчет суммы на основе позиций
    // Пока используем фиктивное значение или значение из текущего просчета
    const total = proschetManager.currentProschet.total || 0;
    
    // Форматируем сумму
    const formattedTotal = formatCurrency(total);
    
    // Обновляем отображение
    const totalDisplay = document.getElementById('proschet-total-display');
    if (totalDisplay) {
        totalDisplay.textContent = formattedTotal;
    }
    
    // Обновляем значение в объекте просчета
    proschetManager.currentProschet.total = total;
    
    // Сохраняем изменения
    saveProschetChanges();
}

/**
 * Форматирует число как валюту
 * @param {number} amount - Сумма
 * @returns {string} Отформатированная сумма
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount) + ' ₽';
}

/**
 * Загружает список просчётов
 */
function loadProschetsList() {
    console.log('Загрузка списка просчётов...');
    
    // Получаем сохраненные просчеты из localStorage
    const savedProschets = getSavedProschets();
    
    // Сортируем по дате обновления (новые сверху)
    savedProschets.sort((a, b) => {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    
    // Сохраняем в менеджере
    proschetManager.proschetsList = savedProschets;
    proschetManager.totalPages = Math.ceil(savedProschets.length / proschetManager.proschetsPerPage);
    
    // Отрисовываем таблицу
    renderProschetsTable();
    
}

/**
 * Отрисовывает таблицу просчётов с пагинацией
 */
function renderProschetsTable() {
    console.log('Отрисовка таблицы просчётов, страница', proschetManager.currentPage);
    
    const tableBody = document.getElementById('proschets-table-body');
    const emptyMessage = document.getElementById('empty-proschets-message');
    const paginationContainer = document.getElementById('proschets-pagination');
    
    if (!tableBody) return;
    
    // Очищаем таблицу
    tableBody.innerHTML = '';
    
    // Если нет просчетов, показываем сообщение
    if (proschetManager.proschetsList.length === 0) {
        if (emptyMessage) {
            tableBody.appendChild(emptyMessage);
            emptyMessage.style.display = 'block';
        }
        if (paginationContainer) {
            paginationContainer.style.display = 'none';
        }
        return;
    }
    
    // Скрываем сообщение о пустом списке
    if (emptyMessage) {
        emptyMessage.style.display = 'none';
    }
    
    // Рассчитываем индексы для текущей страницы
    const startIndex = (proschetManager.currentPage - 1) * proschetManager.proschetsPerPage;
    const endIndex = Math.min(startIndex + proschetManager.proschetsPerPage, proschetManager.proschetsList.length);
    
    // Получаем просчеты для текущей страницы
    const pageProschets = proschetManager.proschetsList.slice(startIndex, endIndex);
    
    // Добавляем каждый просчет в таблицу
    pageProschets.forEach(proschet => {
        const tableRow = createProschetTableRow(proschet);
        tableBody.appendChild(tableRow);
    });
    
    // Обновляем пагинацию
    updatePagination();
}

/**
 * Создает строку таблицы для просчёта
 * @param {Object} proschet - Объект просчёта
 * @returns {HTMLElement} Элемент строки таблицы
 */
function createProschetTableRow(proschet) {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.setAttribute('data-proschet-id', proschet.id);
    
    // Добавляем класс selected, если это текущий просчет
    if (proschetManager.currentProschet && proschetManager.currentProschet.id === proschet.id) {
        row.classList.add('selected');
    }
    
    // Форматируем дату для input
    const dateParts = proschet.date ? proschet.date.split('.') : [];
    const inputDate = dateParts.length === 3 ? `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}` : '';
    
    // Преобразуем значение статуса для select
    const statusValue = proschet.status || 'draft';
    
    // Создаем ячейки с inline-редактированием
    row.innerHTML = `
        <div class="col-number">
            <div class="editable-field-container">
                <span class="editable-field" 
                      data-field="number"
                      data-proschet-id="${proschet.id}"
                      data-original-value="${proschet.number}"
                      title="Двойной клик для редактирования">
                    ${proschet.number}
                </span>
                <input type="text" 
                       class="form-control inline-edit-input" 
                       data-field="number"
                       data-proschet-id="${proschet.id}"
                       value="${proschet.number}"
                       style="display: none;">
            </div>
        </div>
        <div class="col-date">
            <div class="editable-field-container">
                <span class="editable-field" 
                      data-field="date"
                      data-proschet-id="${proschet.id}"
                      data-original-value="${proschet.date}"
                      title="Двойной клик для редактирования">
                    ${proschet.date}
                </span>
                <input type="date" 
                       class="form-control inline-edit-input" 
                       data-field="date"
                       data-proschet-id="${proschet.id}"
                       value="${inputDate}"
                       style="display: none;">
            </div>
        </div>
        <div class="col-client">
            <div class="editable-field-container">
                <span class="editable-field" 
                      data-field="client"
                      data-proschet-id="${proschet.id}"
                      data-original-value="${proschet.client || ''}"
                      title="Двойной клик для редактирования">
                    ${proschet.client || 'Не указан'}
                </span>
                <input type="text" 
                       class="form-control inline-edit-input" 
                       data-field="client"
                       data-proschet-id="${proschet.id}"
                       value="${proschet.client || ''}"
                       style="display: none;">
            </div>
        </div>
        <div class="col-total">
            <span class="total-price-badge">
                ${formatCurrency(proschet.total || 0)}
            </span>
        </div>
        <div class="col-actions">
            <button class="btn-load-proschet" 
                    data-proschet-id="${proschet.id}"
                    title="Загрузить просчёт">
                <i class="fas fa-folder-open"></i>
            </button>
            <button class="btn-delete" 
                    data-proschet-id="${proschet.id}"
                    title="Удалить просчёт">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `;
    
    // Добавляем обработчики для кнопок действий
    const loadBtn = row.querySelector('.btn-load-proschet');
    const deleteBtn = row.querySelector('.btn-delete');
    
    if (loadBtn) {
        loadBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            const proschetId = this.getAttribute('data-proschet-id');
            loadProschetById(proschetId);
        });
    }
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function(event) {
            event.stopPropagation();
            const proschetId = this.getAttribute('data-proschet-id');
            showDeleteConfirmationForProschet(proschetId);
        });
    }
    
    return row;
}

/**
 * Обновляет пагинацию
 */
function updatePagination() {
    const paginationContainer = document.getElementById('proschets-pagination');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const pageInfo = document.getElementById('page-info');
    
    if (!paginationContainer || !prevBtn || !nextBtn || !pageInfo) return;
    
    // Показываем пагинацию, если есть больше одной страницы
    if (proschetManager.totalPages > 1) {
        paginationContainer.style.display = 'flex';
    } else {
        paginationContainer.style.display = 'none';
        return;
    }
    
    // Обновляем информацию о странице
    pageInfo.textContent = `Страница ${proschetManager.currentPage} из ${proschetManager.totalPages}`;
    
    // Обновляем состояние кнопок
    prevBtn.disabled = proschetManager.currentPage === 1;
    nextBtn.disabled = proschetManager.currentPage === proschetManager.totalPages;
}

/**
 * Загружает просчёт по ID
 * @param {string} proschetId - ID просчёта
 */
function loadProschetById(proschetId) {
    console.log('Загрузка просчёта с ID:', proschetId);
    
    // Проверяем, что ID не undefined
    if (!proschetId || proschetId === 'undefined') {
        console.warn('Попытка загрузить просчёт с неопределенным ID');
        showNotification('Не удалось загрузить просчёт: неверный идентификатор', 'error');
        return;
    }
    
    // Находим просчет в списке
    const proschet = proschetManager.proschetsList.find(p => p.id === proschetId);
    
    if (!proschet) {
        showNotification('Просчёт не найден', 'error');
        return;
    }
    
    // Устанавливаем как текущий
    setCurrentProschet(proschet);
    
    // Обновляем отображение
    updateProschetDisplay(proschet);
    
    // Обновляем выделение в таблице
    updateTableSelection(proschetId);
    
    // Включаем кнопки управления
    enableProschetButtons();
    
    // Показываем уведомление
    showNotification(`Просчёт "${proschet.number}" загружен`, 'success');
}

/**
 * Обновляет выделение строки в таблице
 * @param {string} proschetId - ID выделяемого просчёта
 */
function updateTableSelection(proschetId) {
    // Убираем выделение со всех строк
    const allRows = document.querySelectorAll('.table-row');
    allRows.forEach(row => {
        row.classList.remove('selected');
    });
    
    // Добавляем выделение к выбранной строке
    const selectedRow = document.querySelector(`.table-row[data-proschet-id="${proschetId}"]`);
    if (selectedRow) {
        selectedRow.classList.add('selected');
    }
}

/**
 * Копирует текущий просчёт
 */
function copyCurrentProschet() {
    if (!proschetManager.currentProschet) {
        showNotification('Нет активного просчёта для копирования', 'warning');
        return;
    }
    
    console.log('Копирование текущего просчёта...');
    
    // Создаем копию текущего просчета
    const originalProschet = proschetManager.currentProschet;
    const newProschetId = 'proschet_copy_' + Date.now();
    const newProschetNumber = generateProschetNumber();
    
    // Создаем глубокую копию (если нужно копировать и позиции)
    const copiedProschet = {
        ...originalProschet,
        id: newProschetId,
        number: newProschetNumber,
        date: getCurrentDate(),
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    // Удаляем старый ID из копии
    delete copiedProschet.id;
    copiedProschet.id = newProschetId;
    
    // Устанавливаем как текущий просчет
    setCurrentProschet(copiedProschet);
    
    // Обновляем отображение
    updateProschetDisplay(copiedProschet);
    
    // Добавляем в список просчетов
    addToProschetsList(copiedProschet);
    
    // Показываем уведомление
    showNotification(`Копия просчёта создана: "${newProschetNumber}"`, 'success');
}

/**
 * Показывает модальное окно подтверждения удаления
 */
function showDeleteConfirmation() {
    if (!proschetManager.currentProschet) {
        showNotification('Нет активного просчёта для удаления', 'warning');
        return;
    }
    
    // Заполняем текст подтверждения
    const modalBody = document.getElementById('confirmation-modal-body');
    if (modalBody && proschetManager.currentProschet) {
        modalBody.innerHTML = `
            <p>Вы уверены, что хотите удалить просчёт <strong>${proschetManager.currentProschet.number}</strong>?</p>
            <p>Это действие нельзя отменить. Все данные, связанные с этим просчётом, будут удалены.</p>
        `;
    }
    
    // Показываем модальное окно
    const modal = document.getElementById('confirmation-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * Показывает модальное окно подтверждения удаления конкретного просчёта
 * @param {string} proschetId - ID просчёта для удаления
 */
function showDeleteConfirmationForProschet(proschetId) {
    // Находим просчет
    const proschet = proschetManager.proschetsList.find(p => p.id === proschetId);
    if (!proschet) return;
    
    // Заполняем текст подтверждения
    const modalBody = document.getElementById('confirmation-modal-body');
    if (modalBody) {
        modalBody.innerHTML = `
            <p>Вы уверены, что хотите удалить просчёт <strong>${proschet.number}</strong>?</p>
            <p>Это действие нельзя отменить. Все данные, связанные с этим просчётом, будут удалены.</p>
        `;
    }
    
    // Устанавливаем ID просчета для удаления в data-атрибут кнопки подтверждения
    const confirmBtn = document.getElementById('confirm-delete-btn');
    if (confirmBtn) {
        confirmBtn.setAttribute('data-proschet-id-to-delete', proschetId);
    }
    
    // Показываем модальное окно
    const modal = document.getElementById('confirmation-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * Скрывает модальное окно подтверждения
 */
function hideConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Очищаем data-атрибут кнопки подтверждения
    const confirmBtn = document.getElementById('confirm-delete-btn');
    if (confirmBtn) {
        confirmBtn.removeAttribute('data-proschet-id-to-delete');
    }
}

/**
 * Удаляет текущий просчёт
 */
function deleteCurrentProschet() {
    const confirmBtn = document.getElementById('confirm-delete-btn');
    let proschetIdToDelete;
    
    // Проверяем, есть ли конкретный ID для удаления
    if (confirmBtn && confirmBtn.hasAttribute('data-proschet-id-to-delete')) {
        proschetIdToDelete = confirmBtn.getAttribute('data-proschet-id-to-delete');
    } else if (proschetManager.currentProschet) {
        proschetIdToDelete = proschetManager.currentProschet.id;
    } else {
        showNotification('Не указан просчёт для удаления', 'error');
        hideConfirmationModal();
        return;
    }
    
    console.log('Удаление просчёта с ID:', proschetIdToDelete);
    
    // Находим просчет для удаления
    const proschetToDelete = proschetManager.proschetsList.find(p => p.id === proschetIdToDelete);
    if (!proschetToDelete) {
        showNotification('Просчёт не найден', 'error');
        hideConfirmationModal();
        return;
    }
    
    // Удаляем из списка
    proschetManager.proschetsList = proschetManager.proschetsList.filter(p => p.id !== proschetIdToDelete);
    
    // Если удаляем текущий просчет, сбрасываем текущий
    if (proschetManager.currentProschet && proschetManager.currentProschet.id === proschetIdToDelete) {
        proschetManager.currentProschet = null;
        resetProschetDisplay();
        disableProschetButtons();
    }
    
    // Сохраняем обновленный список
    saveProschetsList();
    
    // Пересчитываем пагинацию
    proschetManager.totalPages = Math.ceil(proschetManager.proschetsList.length / proschetManager.proschetsPerPage);
    if (proschetManager.currentPage > proschetManager.totalPages && proschetManager.totalPages > 0) {
        proschetManager.currentPage = proschetManager.totalPages;
    } else if (proschetManager.totalPages === 0) {
        proschetManager.currentPage = 1;
    }
    
    // Обновляем таблицу
    renderProschetsTable();
    
    // Скрываем модальное окно
    hideConfirmationModal();
    
    // Показываем уведомление
    showNotification(`Просчёт "${proschetToDelete.number}" удалён`, 'success');
}

/**
 * Сбрасывает отображение текущего просчёта к значениям по умолчанию
 */
function resetProschetDisplay() {
    const currentDate = getCurrentDate();
    
    // Устанавливаем значения по умолчанию
    document.getElementById('proschet-number-display').textContent = 'ЧЗ-0000';
    document.getElementById('proschet-number-display').setAttribute('data-original-value', 'ЧЗ-0000');
    document.getElementById('proschet-number-display').removeAttribute('data-proschet-id');
    
    document.getElementById('proschet-date-display').textContent = currentDate;
    document.getElementById('proschet-date-display').setAttribute('data-original-value', currentDate);
    document.getElementById('proschet-date-display').removeAttribute('data-proschet-id');
    
    updateStatusDisplay('draft', '');
    
    document.getElementById('proschet-client-display').textContent = 'Не указан';
    document.getElementById('proschet-client-display').setAttribute('data-original-value', '');
    document.getElementById('proschet-client-display').removeAttribute('data-proschet-id');
    
    document.getElementById('proschet-total-display').textContent = '0.00 ₽';
    
    // Очищаем поля ввода
    document.getElementById('proschet-number-input').value = '';
    document.getElementById('proschet-number-input').removeAttribute('data-proschet-id');
    
    document.getElementById('proschet-date-input').value = '';
    document.getElementById('proschet-date-input').removeAttribute('data-proschet-id');
    
    document.getElementById('proschet-status-select').value = 'draft';
    document.getElementById('proschet-status-select').removeAttribute('data-proschet-id');
    
    document.getElementById('proschet-client-input').value = '';
    document.getElementById('proschet-client-input').removeAttribute('data-proschet-id');
}

/**
 * Включает кнопки управления просчётом
 */
function enableProschetButtons() {
    const copyBtn = document.getElementById('copy-proschet-btn');
    const deleteBtn = document.getElementById('delete-proschet-btn');
    
    if (copyBtn) copyBtn.disabled = false;
    if (deleteBtn) deleteBtn.disabled = false;
}

/**
 * Отключает кнопки управления просчётом
 */
function disableProschetButtons() {
    const copyBtn = document.getElementById('copy-proschet-btn');
    const deleteBtn = document.getElementById('delete-proschet-btn');
    
    if (copyBtn) copyBtn.disabled = true;
    if (deleteBtn) deleteBtn.disabled = true;
}

/**
 * Добавляет просчёт в список
 * @param {Object} proschet - Объект просчёта
 */
function addToProschetsList(proschet) {
    // Проверяем, нет ли уже просчета с таким ID
    const existingIndex = proschetManager.proschetsList.findIndex(p => p.id === proschet.id);
    
    if (existingIndex >= 0) {
        // Обновляем существующий просчет
        proschetManager.proschetsList[existingIndex] = proschet;
    } else {
        // Добавляем новый просчет в начало списка
        proschetManager.proschetsList.unshift(proschet);
    }
    
    // Сохраняем обновленный список
    saveProschetsList();
    
    // Обновляем таблицу
    renderProschetsTable();
}

/**
 * Сохраняет список просчётов в localStorage
 */
function saveProschetsList() {
    localStorage.setItem('proschets_list', JSON.stringify(proschetManager.proschetsList));
    console.log('Список просчётов сохранён в localStorage');
}

/**
 * Получает сохранённые просчёты из localStorage
 * @returns {Array} Массив просчётов
 */
function getSavedProschets() {
    try {
        const savedProschets = localStorage.getItem('proschets_list');
        return savedProschets ? JSON.parse(savedProschets) : [];
    } catch (error) {
        console.error('Ошибка при загрузке просчётов из localStorage:', error);
        return [];
    }
}

/**
 * Сохраняет изменения текущего просчёта
 */
function saveProschetChanges() {
    if (!proschetManager.currentProschet) return;
    
    // Обновляем дату изменения
    proschetManager.currentProschet.updatedAt = new Date().toISOString();
    
    // Сохраняем текущий просчет
    setCurrentProschet(proschetManager.currentProschet);
    
    // Обновляем в списке
    addToProschetsList(proschetManager.currentProschet);
    
    console.log('Изменения просчёта сохранены:', proschetManager.currentProschet);
}

/**
 * Загружает данные просчёта при инициализации
 */
function loadProschetData() {
    console.log('Загрузка данных просчёта...');
    
    // Пытаемся загрузить текущий просчет из localStorage
    try {
        const savedCurrentProschet = localStorage.getItem('current_proschet');
        if (savedCurrentProschet) {
            const currentProschet = JSON.parse(savedCurrentProschet);
            setCurrentProschet(currentProschet);
            updateProschetDisplay(currentProschet);
            enableProschetButtons();
            console.log('Текущий просчёт загружен из localStorage:', currentProschet);
        }
    } catch (error) {
        console.error('Ошибка при загрузке текущего просчёта:', error);
    }
}

/**
 * Проверяет наличие сохранённых просчётов
 */
function checkForSavedProschets() {
    const proschetsList = getSavedProschets();
    if (proschetsList.length > 0) {
        proschetManager.proschetsList = proschetsList;
        renderProschetsTable();
    }
}

/**
 * Возвращает текущую дату в формате ДД.ММ.ГГГГ
 * @returns {string} Текущая дата
 */
function getCurrentDate() {
    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear();
    return `${day}.${month}.${year}`;
}

/**
 * Показывает уведомление
 * @param {string} message - Текст сообщения
 * @param {string} type - Тип уведомления (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
    // Используем существующую функцию из print_price_inline_edit.js
    if (window.showInlineEditNotification) {
        window.showInlineEditNotification(message, type);
    } else {
        // Создаем простую реализацию, если функция не найдена
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        const notification = document.createElement('div');
        notification.className = `inline-edit-notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 5px;
            color: white;
            font-weight: bold;
            z-index: 10000;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }
}

// Экспортируем функции для использования в других модулях
window.proschetManager = {
    createNewProschet: createNewProschet,
    copyCurrentProschet: copyCurrentProschet,
    deleteCurrentProschet: deleteCurrentProschet,
    loadProschetById: loadProschetById,
    loadProschetsList: loadProschetsList,
    saveProschetChanges: saveProschetChanges,
    showNotification: showNotification
};