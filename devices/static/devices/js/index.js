/*
index.js для приложения devices
JavaScript для главной страницы управления принтерами
Содержит вспомогательные функции и обработчики событий
*/

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

/**
 * Валидирует форму добавления принтера перед отправкой
 * @returns {boolean} - true если форма валидна
 */
function validateAddForm() {
    const form = document.getElementById('printer-form');
    if (!form) return true;
    
    // Проверка названия
    const nameInput = form.querySelector('#id_name');
    if (nameInput && (!nameInput.value || nameInput.value.trim().length < 2)) {
        alert('❌ Название принтера должно содержать минимум 2 символа');
        nameInput.focus();
        return false;
    }
    
    // Проверка формата
    const formatSelect = form.querySelector('#id_sheet_format');
    if (formatSelect && !formatSelect.value) {
        alert('❌ Выберите формат листа из списка');
        formatSelect.focus();
        return false;
    }
    
    // Проверка полей
    const marginInput = form.querySelector('#id_margin_mm');
    if (marginInput) {
        const margin = parseInt(marginInput.value);
        if (isNaN(margin) || margin < 0 || margin > 50) {
            alert('❌ Поля должны быть в диапазоне от 0 до 50 мм');
            marginInput.focus();
            marginInput.select();
            return false;
        }
    }
    
    // Проверка коэффициента
    const coeffInput = form.querySelector('#id_duplex_coefficient');
    if (coeffInput) {
        const coeff = parseFloat(coeffInput.value);
        if (isNaN(coeff) || coeff < 1.0 || coeff > 10.0) {
            alert('❌ Коэффициент должен быть в диапазоне от 1.0 до 10.0');
            coeffInput.focus();
            coeffInput.select();
            return false;
        }
    }
    
    return true;
}

/**
 * Очищает форму добавления принтера
 */
function clearAddForm() {
    const form = document.getElementById('printer-form');
    if (form) {
        form.reset();
        
        // Устанавливаем фокус на первое поле
        const firstInput = form.querySelector('input, select');
        if (firstInput) {
            firstInput.focus();
        }
    }
}

/**
 * Показывает индикатор загрузки для всей страницы
 */
function showPageLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'page-loading-indicator';
    loadingDiv.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255, 255, 255, 0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        font-size: 1.2rem;
        color: #0B8661;
    `;
    
    loadingDiv.innerHTML = `
        <div style="margin-bottom: 1rem;">⏳ Загрузка...</div>
        <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #0B8661; border-radius: 50%; animation: spin 1s linear infinite;"></div>
    `;
    
    document.body.appendChild(loadingDiv);
}

/**
 * Скрывает индикатор загрузки страницы
 */
function hidePageLoading() {
    const loadingDiv = document.getElementById('page-loading-indicator');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

/**
 * Добавляет поиск по таблице принтеров
 */
function addTableSearch() {
    const printersSection = document.querySelector('.printers-section');
    const table = document.querySelector('.printers-table');
    
    if (!printersSection || !table) return;
    
    // Создаем контейнер для поиска
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.style.cssText = `
        margin-bottom: 1rem;
        display: flex;
        gap: 0.5rem;
    `;
    
    // Создаем поле поиска
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Поиск принтеров по названию или формату...';
    searchInput.className = 'search-input';
    searchInput.style.cssText = `
        flex: 1;
        padding: 0.8rem;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        font-size: 1rem;
        transition: border-color 0.3s ease;
    `;
    
    // Кнопка очистки поиска
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.textContent = 'Очистить';
    clearButton.className = 'btn-action';
    clearButton.style.cssText = `
        padding: 0.8rem 1.5rem;
        background: #6c757d;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
    `;
    
    // Обработчик поиска
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        const rows = document.querySelectorAll('.table-row[data-printer-id]');
        
        let visibleCount = 0;
        
        rows.forEach(row => {
            const name = row.querySelector('.printer-name')?.textContent.toLowerCase() || '';
            const format = row.querySelector('.col-format .param-badge')?.textContent.toLowerCase() || '';
            
            if (name.includes(searchTerm) || format.includes(searchTerm)) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });
        
        // Показываем количество найденных
        if (searchTerm) {
            const resultsInfo = document.querySelector('.search-results-info') || 
                               document.createElement('div');
            resultsInfo.className = 'search-results-info';
            resultsInfo.textContent = `Найдено: ${visibleCount} принтеров`;
            resultsInfo.style.cssText = `
                margin-top: 0.5rem;
                font-size: 0.9rem;
                color: #666;
            `;
            
            if (!document.querySelector('.search-results-info')) {
                searchContainer.appendChild(resultsInfo);
            }
        } else {
            const resultsInfo = document.querySelector('.search-results-info');
            if (resultsInfo) {
                resultsInfo.remove();
            }
        }
    });
    
    // Обработчик очистки
    clearButton.addEventListener('click', function() {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
        searchInput.focus();
    });
    
    // Добавляем элементы
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(clearButton);
    
    // Вставляем перед таблицей
    printersSection.insertBefore(searchContainer, table);
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

document.addEventListener('DOMContentLoaded', function() {
    console.log('devices/index.js загружен');
    
    // Валидация формы добавления при отправке
    const addForm = document.getElementById('printer-form');
    if (addForm) {
        addForm.addEventListener('submit', function(e) {
            if (!validateAddForm()) {
                e.preventDefault();
                return false;
            }
            
            // Показываем индикатор загрузки
            showPageLoading();
            return true;
        });
    }
    
    // Обработчик кнопки очистки формы
    const clearButton = document.querySelector('.btn-clear');
    if (clearButton) {
        clearButton.addEventListener('click', function(e) {
            e.preventDefault();
            clearAddForm();
        });
    }
    
    // Добавляем поиск по таблице, если много записей
    const printerRows = document.querySelectorAll('.table-row[data-printer-id]');
    if (printerRows.length > 5) {
        addTableSearch();
    }
});

// ===== ЭКСПОРТ ФУНКЦИЙ ДЛЯ ТЕСТИРОВАНИЯ =====

// Делаем функции доступными глобально (для отладки)
if (typeof window !== 'undefined') {
    window.devicesApp = {
        validateAddForm,
        clearAddForm,
        showPageLoading,
        hidePageLoading,
    };
}

console.log('devices index.js инициализирован');