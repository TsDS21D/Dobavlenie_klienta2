/*
index.js для приложения sheet_formats
JavaScript для главной страницы приложения sheet_formats.
Содержит логику работы с формой и взаимодействия с DOM.
*/

// ===== ОБРАБОТЧИКИ СОБЫТИЙ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

/**
 * Инициализирует приложение при загрузке DOM.
 * Назначает обработчики событий на элементы страницы.
 */
document.addEventListener('DOMContentLoaded', function() {
    console.log('Страница управления форматами листов загружена');
    
    // Инициализация формы
    initForm();
    
    // Инициализация таблицы
    initTable();
    
    // Настройка подтверждения удаления
    setupDeleteConfirmation();
    
    // Автоматически показываем форму, если есть ошибки
    autoShowFormOnErrors();
});

// ===== РАБОТА С ФОРМОЙ =====

/**
 * Инициализирует форму добавления формата.
 * Назначает обработчики событий на элементы формы.
 */
function initForm() {
    const form = document.getElementById('format-form');
    const nameInput = document.getElementById('id_name');
    const clearButton = document.querySelector('.btn-clear');
    
    // Проверяем, найдены ли необходимые элементы на странице
    if (!form || !nameInput) {
        console.warn('Форма или поле ввода не найдены');
        return;
    }
    
    // Автофокус на поле ввода названия формата при открытии формы
    // Фокус будет установлен, когда форма будет показана
    
    // Обработчик очистки формы
    if (clearButton) {
        clearButton.addEventListener('click', function(e) {
            e.preventDefault();
            clearForm();
        });
    }
    
    // Обработчик отправки формы
    form.addEventListener('submit', function(e) {
        // Валидация перед отправкой
        if (!validateForm()) {
            e.preventDefault();
            return false;
        }
        
        // Показываем индикатор загрузки
        showLoadingIndicator();
        
        // Возвращаем true, чтобы форма отправилась
        return true;
    });
}

/**
 * Проверяет валидность формы перед отправкой.
 * 
 * @returns {boolean} true если форма валидна, false если есть ошибки
 */
function validateForm() {
    const nameInput = document.getElementById('id_name');
    const widthInput = document.getElementById('id_width_mm');
    const heightInput = document.getElementById('id_height_mm');
    
    // Проверка названия формата
    const name = nameInput.value.trim();
    if (!name) {
        alert('⚠️ Пожалуйста, введите название формата!');
        nameInput.focus();
        return false;
    }
    
    // Проверка минимальной длины названия
    if (name.length < 2) {
        alert('⚠️ Название формата должно содержать минимум 2 символа!');
        nameInput.focus();
        return false;
    }
    
    // Проверка ширины
    const width = parseInt(widthInput.value);
    if (isNaN(width) || width <= 0) {
        alert('⚠️ Пожалуйста, введите корректную ширину листа (положительное число)!');
        widthInput.focus();
        widthInput.select();
        return false;
    }
    
    // Проверка высоты
    const height = parseInt(heightInput.value);
    if (isNaN(height) || height <= 0) {
        alert('⚠️ Пожалуйста, введите корректную высоту листа (положительное число)!');
        heightInput.focus();
        heightInput.select();
        return false;
    }
    
    return true;
}

/**
 * Очищает форму добавления формата.
 * Сбрасывает все поля к значениям по умолчанию.
 */
function clearForm() {
    const form = document.getElementById('format-form');
    const nameInput = document.getElementById('id_name');
    
    if (form) {
        form.reset();
    }
    
    // Устанавливаем фокус на поле названия
    if (nameInput) {
        nameInput.focus();
    }
    
    console.log('Форма очищена');
}

/**
 * Автоматически показывает форму, если на странице есть ошибки валидации.
 */
function autoShowFormOnErrors() {
    const errorMessages = document.querySelectorAll('.errorlist');
    
    // Если есть сообщения об ошибках, показываем форму
    if (errorMessages.length > 0) {
        // Вызываем функцию toggleForm, которая должна быть определена в шаблоне
        if (typeof window.toggleForm === 'function') {
            window.toggleForm();
        }
        
        // Прокручиваем страницу к форме
        const formSection = document.getElementById('format-form-section');
        if (formSection) {
            formSection.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

// ===== РАБОТА С ТАБЛИЦЕЙ =====

/**
 * Инициализирует таблицу форматов.
 * Добавляет обработчики событий и улучшает пользовательский опыт.
 */
function initTable() {
    const tableRows = document.querySelectorAll('.table-row');
    
    // Добавляем обработчики клика на строки таблицы
    tableRows.forEach(row => {
        // Пропускаем заголовок таблицы
        if (!row.classList.contains('table-header')) {
            row.addEventListener('click', function(e) {
                // Не обрабатываем клики по кнопкам действий
                if (!e.target.closest('.btn-action')) {
                    toggleRowDetails(this);
                }
            });
        }
    });
    
    // Добавляем поиск по таблице, если много записей
    if (tableRows.length > 5) {
        addTableSearch();
    }
}

/**
 * Переключает отображение деталей строки таблицы.
 * 
 * @param {HTMLElement} row - Строка таблицы для переключения
 */
function toggleRowDetails(row) {
    // Если у строки уже есть класс expanded, убираем его
    if (row.classList.contains('expanded')) {
        row.classList.remove('expanded');
        console.log('Детали строки скрыты');
    } else {
        // Убираем expanded у всех других строк
        document.querySelectorAll('.table-row.expanded').forEach(otherRow => {
            if (otherRow !== row) {
                otherRow.classList.remove('expanded');
            }
        });
        
        // Добавляем expanded к текущей строке
        row.classList.add('expanded');
        console.log('Детали строки показаны');
    }
}

/**
 * Добавляет поле поиска над таблицей форматов.
 * Позволяет фильтровать форматы по названию или размерам.
 */
function addTableSearch() {
    const formatsSection = document.querySelector('.printers-section');
    const table = document.querySelector('.printers-table');
    
    if (!formatsSection || !table) {
        return;
    }
    
    // Создаем контейнер для поиска
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.style.marginBottom = '1rem';
    
    // Создаем поле ввода для поиска
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Поиск форматов по названию или размерам...';
    searchInput.className = 'search-input';
    searchInput.style.cssText = `
        width: 100%;
        padding: 0.8rem;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        font-size: 1rem;
        transition: border-color 0.3s ease;
    `;
    
    // Обработчик события ввода
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const rows = document.querySelectorAll('.table-row:not(.table-header)');
        
        rows.forEach(row => {
            const formatName = row.querySelector('.printer-name')?.textContent.toLowerCase() || '';
            const dimensionsText = row.querySelector('.col-dimensions .param-badge')?.textContent.toLowerCase() || '';
            
            // Показываем строку, если она соответствует поисковому запросу
            if (formatName.includes(searchTerm) || dimensionsText.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });
    
    // Добавляем поле поиска в контейнер
    searchContainer.appendChild(searchInput);
    
    // Вставляем поиск перед таблицей
    formatsSection.insertBefore(searchContainer, table);
    
    console.log('Поиск по таблице добавлен');
}

// ===== ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ =====

/**
 * Настраивает подтверждение удаления форматов.
 * Добавляет обработчики на все кнопки удаления.
 */
function setupDeleteConfirmation() {
    const deleteButtons = document.querySelectorAll('.btn-delete');
    
    deleteButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Получаем название формата и размеры из строки таблицы
            const row = this.closest('.table-row');
            const formatName = row.querySelector('.printer-name').textContent;
            const formatDimensions = row.querySelector('.col-dimensions .param-badge').textContent;
            
            // Показываем подтверждение
            const confirmed = confirm(`Вы уверены, что хотите удалить формат "${formatName}" (${formatDimensions})?\n\nЭто действие нельзя отменить.`);
            
            // Если пользователь отказался, отменяем переход по ссылке
            if (!confirmed) {
                e.preventDefault();
                console.log('Удаление отменено пользователем');
            } else {
                console.log(`Подтверждено удаление формата: ${formatName} (${formatDimensions})`);
                showLoadingIndicator();
            }
        });
    });
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

/**
 * Показывает индикатор загрузки.
 * Используется при отправке формы или удалении формата.
 */
function showLoadingIndicator() {
    // Создаем элемент индикатора загрузки
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'loading-indicator';
    loadingIndicator.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.8);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        font-size: 1.2rem;
        color: #0B8661;
    `;
    
    // Добавляем анимированную иконку загрузки
    loadingIndicator.innerHTML = `
        <div style="margin-bottom: 1rem;">⏳ Обработка...</div>
        <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #0B8661; border-radius: 50%; animation: spin 1s linear infinite;"></div>
    `;
    
    // Добавляем стили для анимации
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    
    // Добавляем элементы на страницу
    document.head.appendChild(style);
    document.body.appendChild(loadingIndicator);
    
    // Автоматически скрываем через 3 секунды (на случай, если что-то пошло не так)
    setTimeout(() => {
        const indicator = document.getElementById('loading-indicator');
        if (indicator) {
            indicator.remove();
        }
    }, 3000);
}

/**
 * Удаляет индикатор загрузки.
 * Вызывается после завершения операции.
 */
function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

// ===== ОБРАБОТКА СООБЩЕНИЙ =====

/**
 * Автоматически скрывает системные сообщения через 5 секунд.
 */
function autoHideMessages() {
    const messages = document.querySelectorAll('.alert');
    
    messages.forEach(message => {
        setTimeout(() => {
            message.style.opacity = '0';
            message.style.transition = 'opacity 0.5s ease';
            
            // Удаляем сообщение после анимации
            setTimeout(() => {
                if (message.parentNode) {
                    message.remove();
                }
            }, 500);
        }, 5000); // 5 секунд
    });
}

// Автоматически скрываем сообщения при загрузке страницы
document.addEventListener('DOMContentLoaded', autoHideMessages);

// ===== ЭКСПОРТ ФУНКЦИЙ ДЛЯ ТЕСТИРОВАНИЯ =====

// В режиме разработки делаем функции доступными глобально
if (typeof window !== 'undefined') {
    window.sheetFormatsApp = {
        validateForm,
        clearForm,
        toggleRowDetails,
        showLoadingIndicator,
        hideLoadingIndicator,
        autoHideMessages,
        autoShowFormOnErrors,
    };
}

console.log('sheet_formats index.js загружен');