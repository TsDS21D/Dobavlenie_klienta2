/*
calculator/static/calculator/js/base.js
ИСПРАВЛЕННАЯ ВЕРСИЯ - РАБОТАЕТ С data-target И data-section
*/

// Ждем полной загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Калькулятор типографии загружен!');
    
    // Даем время всем скриптам загрузиться
    setTimeout(function() {
        console.log('🔄 Запуск инициализации калькулятора...');
        initializeCalculator();
        processDjangoMessages();
        setupCollapseButtons();
    }, 100);
});

/**
 * ИНИЦИАЛИЗАЦИЯ КАЛЬКУЛЯТОРА
 */
function initializeCalculator() {
    console.log('🔧 Инициализация калькулятора...');
    
    // Находим все секции калькулятора
    const sections = document.querySelectorAll('.calculator-section');
    console.log(`📊 Найдено ${sections.length} секций калькулятора`);
    
    // Проверяем каждую секцию
    sections.forEach((section, index) => {
        const sectionId = section.id || `section-${index}`;
        console.log(`   ${index + 1}. Секция: ${sectionId}`);
        
        // Добавляем плавное появление
        section.style.opacity = '0';
        section.style.transform = 'translateY(10px)';
        
        setTimeout(() => {
            section.style.opacity = '1';
            section.style.transform = 'translateY(0)';
            section.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        }, index * 50);
    });
}

/**
 * НАСТРОЙКА КНОПОК СВОРАЧИВАНИЯ - ИСПРАВЛЕННАЯ ВЕРСИЯ
 * Теперь работает с data-target ИЛИ data-section
 */
function setupCollapseButtons() {
    console.log('🔧 Настройка кнопок сворачивания...');
    
    // Находим ВСЕ кнопки сворачивания на странице
    const collapseButtons = document.querySelectorAll('.btn-collapse-section');
    console.log(`🔘 Найдено ${collapseButtons.length} кнопок сворачивания`);
    
    // Если кнопок нет, выходим
    if (collapseButtons.length === 0) {
        console.warn('⚠️ Кнопки сворачивания не найдены! Проверьте HTML-разметку.');
        return;
    }
    
    // Для каждой кнопки
    collapseButtons.forEach((button, index) => {
        console.log(`   ${index + 1}. Настройка кнопки:`, button);
        
        // ===== ВАЖНОЕ ИСПРАВЛЕНИЕ: ПРОВЕРЯЕМ ОБА АТРИБУТА =====
        // Сначала проверяем data-target
        let targetId = button.getAttribute('data-target');
        
        // Если нет data-target, проверяем data-section
        if (!targetId) {
            targetId = button.getAttribute('data-section');
            console.log(`   Нет data-target, но есть data-section: "${targetId}"`);
        }
        
        // Если все еще нет targetId, ищем родительскую секцию
        if (!targetId) {
            console.log(`   Нет ни data-target, ни data-section, ищем родительскую секцию...`);
            
            // Ищем ближайшую родительскую секцию
            const parentSection = button.closest('.calculator-section');
            
            if (parentSection && parentSection.id) {
                targetId = parentSection.id;
                console.log(`   Найдена родительская секция с ID: ${targetId}`);
            } else if (parentSection) {
                // Если у секции нет ID, создаем временный
                const tempId = `temp-section-${index}`;
                parentSection.id = tempId;
                targetId = tempId;
                console.log(`   Присвоен временный ID: ${tempId}`);
            }
        }
        
        // ===== ОТЛАДКА: ВЫВОДИМ ВСЕ АТРИБУТЫ КНОПКИ =====
        console.log(`   Атрибуты кнопки:`);
        console.log(`     - data-target: "${button.getAttribute('data-target')}"`);
        console.log(`     - data-section: "${button.getAttribute('data-section')}"`);
        console.log(`     - title: "${button.getAttribute('title')}"`);
        console.log(`     - class: "${button.getAttribute('class')}"`);
        console.log(`   Используемый targetId: "${targetId}"`);
        
        // Находим секцию
        let targetSection = null;
        if (targetId) {
            targetSection = document.getElementById(targetId);
            
            if (!targetSection) {
                console.warn(`   ⚠️ Секция с ID "${targetId}" не найдена!`);
                // Попробуем найти по классу
                targetSection = document.querySelector(`[data-section="${targetId}"]`);
                if (targetSection) {
                    console.log(`   ✅ Найдена секция по data-section="${targetId}"`);
                }
            }
        }
        
        // Если не нашли по ID, используем родительскую секцию
        if (!targetSection) {
            targetSection = button.closest('.calculator-section');
            if (targetSection) {
                console.log(`   ✅ Используем родительскую секцию:`, targetSection);
            }
        }
        
        // Если так и не нашли секцию, пропускаем эту кнопку
        if (!targetSection) {
            console.warn(`   ⚠️ Не удалось найти секцию для кнопки ${index + 1}`);
            return;
        }
        
        // ===== ИСПРАВЛЕНИЕ: ДОБАВЛЯЕМ ОБА АТРИБУТА ЕСЛИ ИХ НЕТ =====
        // Чтобы в будущем не было проблем, добавляем оба атрибута
        if (!button.hasAttribute('data-target')) {
            button.setAttribute('data-target', targetSection.id || targetId);
        }
        if (!button.hasAttribute('data-section')) {
            button.setAttribute('data-section', targetSection.id || targetId);
        }
        
        // Получаем текущее состояние секции
        const isCollapsed = targetSection.classList.contains('collapsed');
        console.log(`   Секция "${targetSection.id || 'без ID'}" изначально: ${isCollapsed ? 'свернута' : 'развернута'}`);
        
        // Обновляем иконку кнопки в соответствии с начальным состоянием
        updateCollapseButtonIcon(button, isCollapsed);
        
        // Добавляем обработчик клика
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            console.log(`🖱️ Клик по кнопке сворачивания!`);
            console.log(`   data-target: "${this.getAttribute('data-target')}"`);
            console.log(`   data-section: "${this.getAttribute('data-section')}"`);
            
            // ===== ИСПРАВЛЕНИЕ: ИЩЕМ ЦЕЛЕВУЮ СЕКЦИЮ КАЖДЫЙ РАЗ =====
            // На случай, если DOM изменился
            const btnTargetId = this.getAttribute('data-target') || this.getAttribute('data-section');
            let btnTargetSection = null;
            
            if (btnTargetId) {
                btnTargetSection = document.getElementById(btnTargetId);
                if (!btnTargetSection) {
                    // Попробуем найти по data-section
                    btnTargetSection = document.querySelector(`[data-section="${btnTargetId}"]`);
                }
            }
            
            // Если не нашли, используем ближайшую секцию
            if (!btnTargetSection) {
                btnTargetSection = this.closest('.calculator-section');
            }
            
            if (!btnTargetSection) {
                console.error('❌ Не удалось найти секцию для сворачивания!');
                return;
            }
            
            // Переключаем состояние
            btnTargetSection.classList.toggle('collapsed');
            
            // Обновляем иконку
            const nowCollapsed = btnTargetSection.classList.contains('collapsed');
            updateCollapseButtonIcon(this, nowCollapsed);
            
            console.log(`   Секция "${btnTargetSection.id || 'без ID'}" теперь: ${nowCollapsed ? 'свернута' : 'развернута'}`);
            
            // Сохраняем состояние, если есть ID
            if (btnTargetSection.id) {
                saveSectionState(btnTargetSection.id, nowCollapsed);
            }
        });
        
        console.log(`   ✅ Кнопка ${index + 1} настроена успешно`);
    });
    
    // Загружаем сохраненные состояния
    loadSectionStates();
}

/**
 * ОБНОВЛЕНИЕ ИКОНКИ КНОПКИ СВОРАЧИВАНИЯ
 * @param {HTMLElement} button - Кнопка сворачивания
 * @param {boolean} isCollapsed - Свернута ли секция
 */
function updateCollapseButtonIcon(button, isCollapsed) {
    // Находим иконку внутри кнопки
    const icon = button.querySelector('i');
    
    if (!icon) {
        console.warn('   ⚠️ Иконка не найдена в кнопке:', button);
        // Если иконки нет, создаем ее
        const newIcon = document.createElement('i');
        newIcon.className = 'fas fa-chevron-down';
        button.prepend(newIcon);
        console.log('   ✅ Создана новая иконка');
        return;
    }
    
    if (isCollapsed) {
        // Свернутое состояние: стрелка вправо
        icon.className = 'fas fa-chevron-right';
        button.setAttribute('title', 'Развернуть секцию');
        console.log('   Иконка изменена на: fa-chevron-right (свернуто)');
    } else {
        // Развернутое состояние: стрелка вниз
        icon.className = 'fas fa-chevron-down';
        button.setAttribute('title', 'Свернуть секцию');
        console.log('   Иконка изменена на: fa-chevron-down (развернуто)');
    }
}

/**
 * СОХРАНЕНИЕ СОСТОЯНИЯ СЕКЦИИ
 */
function saveSectionState(sectionId, isCollapsed) {
    try {
        const savedStates = JSON.parse(localStorage.getItem('calculator_sections')) || {};
        savedStates[sectionId] = isCollapsed;
        localStorage.setItem('calculator_sections', JSON.stringify(savedStates));
        console.log(`💾 Сохранено: ${sectionId} = ${isCollapsed ? 'свернута' : 'развернута'}`);
    } catch (error) {
        console.error('Ошибка при сохранении в localStorage:', error);
    }
}

/**
 * ЗАГРУЗКА СОХРАНЕННЫХ СОСТОЯНИЙ
 */
function loadSectionStates() {
    try {
        const savedStates = JSON.parse(localStorage.getItem('calculator_sections'));
        if (!savedStates) {
            console.log('📂 Нет сохраненных состояний секций');
            return;
        }
        
        console.log('📂 Загрузка сохраненных состояний:', savedStates);
        
        Object.keys(savedStates).forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section && savedStates[sectionId]) {
                section.classList.add('collapsed');
                
                // Находим кнопку для этой секции
                // Проверяем оба атрибута
                const button = document.querySelector(`.btn-collapse-section[data-target="${sectionId}"], .btn-collapse-section[data-section="${sectionId}"]`);
                if (button) {
                    updateCollapseButtonIcon(button, true);
                }
                
                console.log(`   ✅ Восстановлено: ${sectionId} = свернута`);
            }
        });
    } catch (error) {
        console.error('Ошибка при загрузке из localStorage:', error);
    }
}

/**
 * ОБРАБОТКА СООБЩЕНИЙ DJANGO
 */
function processDjangoMessages() {
    const djangoMessages = document.querySelector('.django-messages');
    if (djangoMessages) {
        const messages = djangoMessages.querySelectorAll('.django-message');
        console.log(`📨 Найдено ${messages.length} сообщений Django`);
        
        messages.forEach(message => {
            const type = message.getAttribute('data-type') || 'info';
            const text = message.textContent.trim();
            
            if (text) {
                console.log(`   📨 [${type}] ${text}`);
                showNotification(text, type);
            }
        });
    }
}

/**
 * ПОКАЗ УВЕДОМЛЕНИЯ
 */
function showNotification(message, type = 'info') {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `calculator-notification notification-${type}`;
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
        animation: fadeInOut 5s ease-in-out;
    `;
    
    // Добавляем анимацию в стили
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(-20px); }
            10% { opacity: 1; transform: translateY(0); }
            90% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Удаляем через 5 секунд
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

/**
 * РАСЧЕТ ЦЕНЫ
 */
function calculateTotalPrice() {
    console.log('🧮 Расчет стоимости...');
    showNotification('Функция расчета будет реализована позже', 'info');
}

// Делаем глобально доступным
window.calculateTotalPrice = calculateTotalPrice;

// Сохраняем состояние перед закрытием
window.addEventListener('beforeunload', function() {
    console.log('💾 Сохранение состояний...');
    
    const sections = document.querySelectorAll('.calculator-section');
    sections.forEach(section => {
        if (section.id) {
            saveSectionState(section.id, section.classList.contains('collapsed'));
        }
    });
});



