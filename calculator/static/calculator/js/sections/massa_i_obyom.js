/**
 * ФАЙЛ: massa_i_obyom.js
 * НАЗНАЧЕНИЕ: Секция "Масса и объём" – расчёт общей массы и объёма бумаги и плёнки
 *             для выбранного просчёта на основе реальных данных из базы.
 * 
 * ИСПРАВЛЕНИЯ (08.04.2026):
 * - Добавлена отправка события 'massa_i_obyom_updated' после каждого пересчёта,
 *   чтобы другие секции (например, "Цена") могли отображать массу и объём.
 * - В функции reset также отправляется событие с нулевыми значениями.
 * - Сохранены все предыдущие исправления: коэффициент 2% на краску/упаковку,
 *   автоконвертация плотности, форматирование в кг и л.
 * 
 * ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ – для понимания новичками.
 */

"use strict";

// ============================================================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ С ПРЕФИКСОМ massa_i_obyom_
// ============================================================================

/** @type {number|null} ID текущего выбранного просчёта */
let massa_i_obyom_currentProschetId = null;

/** @type {boolean} Флаг, инициализирована ли секция */
let massa_i_obyom_initialized = false;

/** @type {AbortController|null} Для отмены запросов */
let massa_i_obyom_abortController = null;

// ============================================================================
// 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ
// ============================================================================

// Событие DOMContentLoaded гарантирует, что DOM полностью загружен
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция "Масса и объём" загружена');
    massa_i_obyom_init(); // Запускаем инициализацию секции
});

/**
 * Инициализация секции: настройка обработчиков событий и начального состояния.
 */
function massa_i_obyom_init() {
    // Предотвращаем повторную инициализацию
    if (massa_i_obyom_initialized) return;
    console.log('🔧 Инициализация секции "Масса и объём"...');
    
    // 1. Настраиваем обработчики событий от других секций
    massa_i_obyom_setupEventListeners();
    
    // 2. Проверяем, не выбран ли уже какой-то просчёт при загрузке страницы
    massa_i_obyom_checkForSelectedProschet();
    
    // 3. Показываем сообщение "просчёт не выбран", если ничего не выбрано
    if (!massa_i_obyom_currentProschetId) {
        massa_i_obyom_showNoProschetMessage();
    }
    
    massa_i_obyom_initialized = true;
    console.log('✅ Секция "Масса и объём" инициализирована');
}

// ============================================================================
// 3. ПРОВЕРКА УЖЕ ВЫБРАННОГО ПРОСЧЁТА ПРИ ЗАГРУЗКЕ
// ============================================================================

/**
 * Проверяет, есть ли в таблице просчётов строка с классом 'selected'.
 * Если есть – получает ID просчёта и инициализирует секцию.
 */
function massa_i_obyom_checkForSelectedProschet() {
    // Ищем выбранную строку в теле таблицы просчётов
    const selectedRow = document.querySelector('#proschet-table-body .proschet-row.selected');
    if (selectedRow && selectedRow.dataset.proschetId) {
        const proschetId = parseInt(selectedRow.dataset.proschetId, 10);
        console.log(`🔍 Найден выбранный просчёт при загрузке: ID ${proschetId}`);
        massa_i_obyom_currentProschetId = proschetId;
        
        // Обновляем заголовок секции, вставляя название просчёта
        const titleElement = document.getElementById('massa-i-obyom-proschet-title');
        if (titleElement) {
            const titleCell = selectedRow.querySelector('.proschet-title');
            if (titleCell) {
                titleElement.innerHTML = `<span class="proschet-title-active">${titleCell.textContent.trim()}</span>`;
            }
        }
        
        // Запускаем расчёт массы и объёма
        massa_i_obyom_recalculate();
    } else {
        console.log('ℹ️ Выбранный просчёт при загрузке не найден');
    }
}

// ============================================================================
// 4. ПОДПИСКА НА СОБЫТИЯ ОТ ДРУГИХ СЕКЦИЙ
// ============================================================================

/**
 * Настраивает обработчики событий, которые вызывают пересчёт массы и объёма.
 */
function massa_i_obyom_setupEventListeners() {
    console.log('🔗 Настройка обработчиков событий для секции "Масса и объём"...');
    
    // 1. ОСНОВНОЕ СОБЫТИЕ: готовность секции "Изделие" (генерируется в product.js)
    //    Это событие приходит после того, как выбран просчёт и загружены его данные.
    document.addEventListener('productSectionReady', function(event) {
        if (event.detail && event.detail.proschetId) {
            const newProschetId = event.detail.proschetId;
            if (massa_i_obyom_currentProschetId !== newProschetId) {
                massa_i_obyom_currentProschetId = newProschetId;
                console.log(`📥 Получено событие productSectionReady для просчёта ID ${newProschetId}`);
                massa_i_obyom_recalculate();
            }
        }
    });
    
    // 2. ОТМЕНА ВЫБОРА ПРОСЧЁТА (если событие генерируется)
    document.addEventListener('proschetDeselected', function() {
        console.log('📥 Получено событие proschetDeselected – сброс секции');
        massa_i_obyom_reset();
    });
    
    // 3. Изменение тиража
    document.addEventListener('productCirculationSaved', function(event) {
        if (event.detail && event.detail.proschetId === massa_i_obyom_currentProschetId) {
            console.log('🔄 Тираж изменился, пересчёт массы и объёма');
            massa_i_obyom_recalculate();
        }
    });
    
    // 4. Изменение печатных компонентов (добавление, удаление, редактирование)
    document.addEventListener('printComponentsUpdated', function(event) {
        if (event.detail && event.detail.proschetId === massa_i_obyom_currentProschetId) {
            console.log('🔄 Печатные компоненты обновлены, пересчёт массы и объёма');
            massa_i_obyom_recalculate();
        }
    });
    
    // 5. Изменение размеров изделия (секция вычислений листов)
    document.addEventListener('vichisliniyaListovUpdated', function(event) {
        if (event.detail && event.detail.printComponentId && massa_i_obyom_currentProschetId) {
            console.log(`🔄 Размеры изделия изменились для компонента ${event.detail.printComponentId}, пересчёт массы и объёма`);
            massa_i_obyom_recalculate();
        }
    });
    
    // 6. Изменение ламинации
    document.addEventListener('laminationUpdated', function(event) {
        if (event.detail && event.detail.componentId && massa_i_obyom_currentProschetId) {
            console.log(`🔄 Ламинация изменилась для компонента ${event.detail.componentId}, пересчёт массы и объёма`);
            massa_i_obyom_recalculate();
        }
    });
    
    // 7. Кнопка сворачивания секции
    const collapseBtn = document.querySelector('#massa-i-obyom-section .btn-collapse-section');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', function() {
            const section = document.getElementById('massa-i-obyom-section');
            section.classList.toggle('collapsed');
            const icon = this.querySelector('i');
            if (section.classList.contains('collapsed')) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-right');
            } else {
                icon.classList.remove('fa-chevron-right');
                icon.classList.add('fa-chevron-down');
            }
        });
    }
    
    console.log('✅ Обработчики событий для секции "Масса и объём" настроены');
}

// ============================================================================
// 5. ОСНОВНАЯ ФУНКЦИЯ ПЕРЕСЧЁТА
// ============================================================================

/**
 * Пересчитывает массу и объём для текущего просчёта.
 * Запрашивает с сервера все необходимые данные (печатные компоненты, их параметры,
 * данные вычислений листов, ламинацию) и суммирует.
 */
function massa_i_obyom_recalculate() {
    if (!massa_i_obyom_currentProschetId) {
        console.warn('⚠️ Нет выбранного просчёта для расчёта массы и объёма');
        massa_i_obyom_showNoProschetMessage();
        return;
    }
    
    console.log(`📊 Пересчёт массы и объёма для просчёта ID: ${massa_i_obyom_currentProschetId}`);
    
    // Отменяем предыдущий запрос, если он был (предотвращает гонку запросов)
    if (massa_i_obyom_abortController) {
        massa_i_obyom_abortController.abort();
    }
    massa_i_obyom_abortController = new AbortController();
    const signal = massa_i_obyom_abortController.signal;
    
    // Запрашиваем данные для расчёта цены (они содержат все компоненты, ламинации, размеры)
    fetch(`/calculator/get-proschet-price-data/${massa_i_obyom_currentProschetId}/`, {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': massa_i_obyom_getCsrfToken()
        },
        signal: signal
    })
    .then(response => {
        if (signal.aborted) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    })
    .then(data => {
        if (signal.aborted || !data) return;
        if (data.success) {
            // Выполняем расчёт на основе полученных данных
            const result = massa_i_obyom_calculateFromData(data);
            // Обновляем интерфейс
            massa_i_obyom_updateDisplay(result);
            // Показываем контейнер с результатами
            massa_i_obyom_showResults();
            
            // ===== НОВОЕ: отправляем событие с данными массы и объёма =====
            massa_i_obyom_dispatchUpdateEvent(result.totalMass, result.totalVolume);
        } else {
            console.error('Ошибка загрузки данных:', data.message);
            massa_i_obyom_showError('Не удалось загрузить данные для расчёта');
        }
    })
    .catch(error => {
        if (error.name === 'AbortError') return;
        console.error('Ошибка сети:', error);
        massa_i_obyom_showError('Ошибка сети при загрузке данных');
    })
    .finally(() => {
        if (massa_i_obyom_abortController === signal.controller) {
            massa_i_obyom_abortController = null;
        }
    });
}

// ============================================================================
// 6. РАСЧЁТ МАССЫ И ОБЪЁМА НА ОСНОВЕ ДАННЫХ СЕРВЕРА (РЕАЛЬНЫЕ ДАННЫЕ)
// ============================================================================

/**
 * Выполняет расчёт массы и объёма на основе данных, полученных с сервера.
 * Использует реальные поля: paper_density, paper_thickness, item_width, item_height,
 * film_thickness, side, circulation.
 * 
 * ФОРМУЛЫ:
 * - Масса бумаги (г) = площадь_м² × плотность_г_на_м² × тираж
 * - Объём бумаги (см³) = (ширина_мм × высота_мм × толщина_мм × тираж) / 1000
 * - Масса плёнки (г) = площадь_м² × тираж × толщина_мкм × 0.1 × коэффициент_стороны
 * - Объём плёнки (см³) = (ширина_мм × высота_мм × толщина_мкм × тираж) / 1_000_000
 * 
 * НОВОЕ: к итоговой массе (бумага + плёнка) применяется коэффициент 1.02 (+2%)
 * для учёта краски и упаковки.
 * 
 * @param {Object} data - Данные от API get-proschet-price-data
 * @returns {Object} Результаты расчёта: paperMass, filmMass, totalMass, paperVolume, filmVolume, totalVolume
 */
function massa_i_obyom_calculateFromData(data) {
    // Итоговые суммы (в граммах и кубических сантиметрах)
    let totalPaperMassGrams = 0;   // масса бумаги в граммах
    let totalFilmMassGrams = 0;    // масса плёнки в граммах
    let totalPaperVolume = 0;      // объём бумаги в см³
    let totalFilmVolume = 0;       // объём плёнки в см³
    
    // Получаем тираж просчёта (используется для всех компонентов)
    const circulation = data.proschet ? data.proschet.circulation : 1;
    
    console.log(`📊 Расчёт для тиража ${circulation} шт.`);
    
    // Перебираем все печатные компоненты
    const components = data.print_components || [];
    for (const component of components) {
        // 1. Размеры изделия (из VichisliniyaListovModel)
        const itemWidthMm = component.item_width || 0;
        const itemHeightMm = component.item_height || 0;
        if (itemWidthMm <= 0 || itemHeightMm <= 0) {
            console.warn(`⚠️ Для компонента ${component.id} не заданы размеры изделия, пропускаем`);
            continue;
        }
        
        // Площадь изделия в квадратных метрах
        const areaM2 = (itemWidthMm * itemHeightMm) / 1_000_000;
        
        // 2. Бумага
        let paperDensity = component.paper_density || 0;   // г/м² (из базы)
        const paperThicknessMm = component.paper_thickness || 0; // мм
        
        // ===== АВТОКОНВЕРТАЦИЯ: если плотность пришла в кг/м² (значение < 100), переводим в г/м² =====
        // В базе данных density обычно хранится в г/м² (например, 350). Но если значение маленькое (0.35),
        // значит, оно в кг/м². Тогда умножаем на 1000.
        if (paperDensity > 0 && paperDensity < 100) {
            console.log(`   Компонент ${component.id}: плотность ${paperDensity} кг/м² → переводим в г/м²: ${paperDensity * 1000}`);
            paperDensity = paperDensity * 1000;
        }
        
        // Масса бумаги в граммах: площадь_м² × плотность_г_на_м² × тираж
        const paperMassGrams = areaM2 * paperDensity * circulation;
        // Объём бумаги (см³): (ширина_мм × высота_мм × толщина_мм × тираж) / 1000
        const paperVolume = (itemWidthMm * itemHeightMm * paperThicknessMm * circulation) / 1000;
        
        console.log(`   Компонент ${component.id}: бумага ${component.paper_name || '?'} — масса ${paperMassGrams.toFixed(2)} г, объём ${paperVolume.toFixed(2)} см³`);
        
        totalPaperMassGrams += paperMassGrams;
        totalPaperVolume += paperVolume;
        
        // 3. Ламинация – ищем запись для этого компонента
        let lamination = null;
        if (data.laminations && Array.isArray(data.laminations)) {
            lamination = data.laminations.find(l => l.component_id == component.id);
        }
        
        let filmMassGrams = 0;
        let filmVolume = 0;
        if (lamination && lamination.is_enabled === true && lamination.film_thickness) {
            const filmThicknessUm = lamination.film_thickness;   // мкм
            const sideMultiplier = (lamination.side === 'duplex') ? 2 : 1;
            
            // Масса плёнки (г): площадь_м² × тираж × толщина_мкм × 0.1 × коэффициент_стороны
            filmMassGrams = areaM2 * circulation * filmThicknessUm * 0.1 * sideMultiplier;
            // Объём плёнки (см³): (ширина_мм × высота_мм × толщина_мкм × тираж) / 1_000_000
            filmVolume = (itemWidthMm * itemHeightMm * filmThicknessUm * circulation) / 1_000_000;
            
            console.log(`   Компонент ${component.id}: плёнка ${lamination.film_name || '?'} (${lamination.side === 'duplex' ? 'двусторонняя' : 'односторонняя'}) — масса ${filmMassGrams.toFixed(2)} г, объём ${filmVolume.toFixed(2)} см³`);
        }
        
        totalFilmMassGrams += filmMassGrams;
        totalFilmVolume += filmVolume;
    }
    
    // Округляем до двух знаков
    totalPaperMassGrams = Math.round(totalPaperMassGrams * 100) / 100;
    totalFilmMassGrams = Math.round(totalFilmMassGrams * 100) / 100;
    totalPaperVolume = Math.round(totalPaperVolume * 100) / 100;
    totalFilmVolume = Math.round(totalFilmVolume * 100) / 100;
    
    // ===== НОВЫЙ КОЭФФИЦИЕНТ: добавляем 2% на краску и упаковку =====
    const PACKAGING_COEFFICIENT = 1.02;
    const totalMassGrams = (totalPaperMassGrams + totalFilmMassGrams) * PACKAGING_COEFFICIENT;
    // Округляем итоговую массу после применения коэффициента
    const finalTotalMassGrams = Math.round(totalMassGrams * 100) / 100;
    
    console.log(`📦 ИТОГО: бумага ${totalPaperMassGrams} г, плёнка ${totalFilmMassGrams} г, ` +
                `сумма до коэффициента: ${totalPaperMassGrams + totalFilmMassGrams} г, ` +
                `с коэффициентом 1.02: ${finalTotalMassGrams} г`);
    console.log(`📦 Объём: бумага ${totalPaperVolume} см³, плёнка ${totalFilmVolume} см³, всего ${totalPaperVolume + totalFilmVolume} см³`);
    
    return {
        paperMass: totalPaperMassGrams,
        filmMass: totalFilmMassGrams,
        totalMass: finalTotalMassGrams,               // уже с учётом +2%
        paperVolume: totalPaperVolume,
        filmVolume: totalFilmVolume,
        totalVolume: totalPaperVolume + totalFilmVolume
    };
}

// ============================================================================
// 7. ОБНОВЛЕНИЕ ИНТЕРФЕЙСА И ОТПРАВКА СОБЫТИЯ
// ============================================================================

/**
 * Обновляет отображение результатов в карточках.
 * @param {Object} result - Объект с результатами расчёта.
 */
function massa_i_obyom_updateDisplay(result) {
    // Форматирование массы: всегда в килограммах с тремя знаками после запятой
    const formatMass = (grams) => {
        const kg = grams / 1000;
        return kg.toFixed(3) + ' кг';
    };
    
    // Форматирование объёма: всегда в литрах с тремя знаками после запятой
    const formatVolume = (cm3) => {
        const liters = cm3 / 1000;
        return liters.toFixed(3) + ' л';
    };
    
    // Получаем ссылки на DOM-элементы, куда будем выводить результаты
    const paperMassEl = document.getElementById('massa-i-obyom-paper-mass');
    const filmMassEl = document.getElementById('massa-i-obyom-film-mass');
    const totalMassEl = document.getElementById('massa-i-obyom-total-mass');
    const paperVolumeEl = document.getElementById('massa-i-obyom-paper-volume');
    const filmVolumeEl = document.getElementById('massa-i-obyom-film-volume');
    const totalVolumeEl = document.getElementById('massa-i-obyom-total-volume');
    
    // Обновляем значения (если элементы существуют)
    if (paperMassEl) paperMassEl.textContent = formatMass(result.paperMass);
    if (filmMassEl) filmMassEl.textContent = formatMass(result.filmMass);
    if (totalMassEl) totalMassEl.textContent = formatMass(result.totalMass);
    if (paperVolumeEl) paperVolumeEl.textContent = formatVolume(result.paperVolume);
    if (filmVolumeEl) filmVolumeEl.textContent = formatVolume(result.filmVolume);
    if (totalVolumeEl) totalVolumeEl.textContent = formatVolume(result.totalVolume);
}

/**
 * Отправляет событие с данными о массе и объёме для других секций (например, "Цена").
 * @param {number} totalMassGrams - Общая масса в граммах
 * @param {number} totalVolumeCm3 - Общий объём в кубических сантиметрах
 */
function massa_i_obyom_dispatchUpdateEvent(totalMassGrams, totalVolumeCm3) {
    const event = new CustomEvent('massa_i_obyom_updated', {
        detail: {
            totalMass: totalMassGrams,
            totalVolume: totalVolumeCm3,
            proschetId: massa_i_obyom_currentProschetId,
            timestamp: new Date().toISOString()
        }
    });
    document.dispatchEvent(event);
    console.log(`📤 Событие massa_i_obyom_updated отправлено: масса=${totalMassGrams} г, объём=${totalVolumeCm3} см³`);
}

// ============================================================================
// 8. УПРАВЛЕНИЕ СОСТОЯНИЯМИ ИНТЕРФЕЙСА
// ============================================================================

/**
 * Показывает сообщение "Выберите просчёт" и скрывает контейнер с результатами.
 */
function massa_i_obyom_showNoProschetMessage() {
    const noProschetMsg = document.getElementById('massa-i-obyom-no-proschet-message');
    const resultsContainer = document.getElementById('massa-i-obyom-results-container');
    if (noProschetMsg) noProschetMsg.style.display = 'block';
    if (resultsContainer) resultsContainer.style.display = 'none';
}

/**
 * Показывает контейнер с результатами и скрывает сообщение о выборе просчёта.
 */
function massa_i_obyom_showResults() {
    const noProschetMsg = document.getElementById('massa-i-obyom-no-proschet-message');
    const resultsContainer = document.getElementById('massa-i-obyom-results-container');
    if (noProschetMsg) noProschetMsg.style.display = 'none';
    if (resultsContainer) resultsContainer.style.display = 'flex';
}

/**
 * Показывает сообщение об ошибке.
 */
function massa_i_obyom_showError(message) {
    console.error(message);
    // Используем глобальную функцию показа уведомлений, если она есть
    if (typeof showNotification === 'function') {
        showNotification(message, 'error');
    } else {
        alert(message);
    }
}

/**
 * Полностью сбрасывает секцию (при отмене выбора просчёта).
 */
function massa_i_obyom_reset() {
    // Сбрасываем ID текущего просчёта
    massa_i_obyom_currentProschetId = null;
    // Показываем сообщение "Выберите просчёт"
    massa_i_obyom_showNoProschetMessage();
    
    // Обнуляем заголовок секции
    const titleElement = document.getElementById('massa-i-obyom-proschet-title');
    if (titleElement) {
        titleElement.innerHTML = '<span class="placeholder-text">(просчёт не выбран)</span>';
    }
    
    // Обнуляем значения в карточках (единицы измерения кг и л)
    const zeroMass = '0.000 кг';
    const zeroVolume = '0.000 л';
    const paperMassEl = document.getElementById('massa-i-obyom-paper-mass');
    const filmMassEl = document.getElementById('massa-i-obyom-film-mass');
    const totalMassEl = document.getElementById('massa-i-obyom-total-mass');
    const paperVolumeEl = document.getElementById('massa-i-obyom-paper-volume');
    const filmVolumeEl = document.getElementById('massa-i-obyom-film-volume');
    const totalVolumeEl = document.getElementById('massa-i-obyom-total-volume');
    if (paperMassEl) paperMassEl.textContent = zeroMass;
    if (filmMassEl) filmMassEl.textContent = zeroMass;
    if (totalMassEl) totalMassEl.textContent = zeroMass;
    if (paperVolumeEl) paperVolumeEl.textContent = zeroVolume;
    if (filmVolumeEl) filmVolumeEl.textContent = zeroVolume;
    if (totalVolumeEl) totalVolumeEl.textContent = zeroVolume;
    
    // Отправляем событие с нулевыми значениями (чтобы секция "Цена" тоже обнулилась)
    massa_i_obyom_dispatchUpdateEvent(0, 0);
}

// ============================================================================
// 9. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Получает CSRF-токен из cookies.
 * @returns {string} CSRF-токен или пустая строка.
 */
function massa_i_obyom_getCsrfToken() {
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith(name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }
    console.warn('⚠️ CSRF-токен не найден');
    return '';
}

// ============================================================================
// 10. ЭКСПОРТ ФУНКЦИЙ ДЛЯ ВНЕШНЕГО ИСПОЛЬЗОВАНИЯ
// ============================================================================

// Делаем объект доступным глобально, чтобы другие секции могли вызывать его методы
window.massa_i_obyom = {
    recalculate: massa_i_obyom_recalculate,   // Принудительный пересчёт
    reset: massa_i_obyom_reset                 // Сброс секции
};

console.log('✅ Модуль "Масса и объём" полностью загружен (с событием для секции "Цена", единицы: кг и л)');