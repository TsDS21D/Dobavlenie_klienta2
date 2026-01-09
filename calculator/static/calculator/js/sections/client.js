/*
calculator/static/calculator/js/sections/client.js
ИСПРАВЛЕННАЯ ВЕРСИЯ с предзаполнением текущим значением:
Теперь корректно обновляет данные при выборе любого просчёта
Сбрасывает значения на прочерки, если клиент не определён
*/

"use strict"; // Строгий режим JavaScript для предотвращения ошибок

// ===== 1. ОСНОВНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ СЕКЦИИ КЛИЕНТА =====
// Вызывается при выборе просчёта в списке просчётов
function updateClientSectionData(proschetId, clientData) {
    console.log('Вызов updateClientSectionData:', proschetId, clientData);
    
    // Проверяем, что ID просчёта передан
    if (!proschetId) {
        console.error('Ошибка: не указан proschetId');
        return;
    }
    
    // Проверяем, загружен ли модуль управления секцией клиента
    if (typeof window.clientSectionManager !== 'undefined' && 
        typeof window.clientSectionManager.update === 'function') {
        // Если модуль загружен, вызываем его метод update
        window.clientSectionManager.update(proschetId, clientData);
    } else {
        // Если модуль не загружен, выполняем ручное обновление
        updateManually(proschetId, clientData);
    }
}

// ===== 2. ФУНКЦИЯ РУЧНОГО ОБНОВЛЕНИЯ =====
// Выполняет обновление интерфейса без использования модуля
function updateManually(proschetId, clientData) {
    console.log('Простое ручное обновление');
    
    // 1. ВСЕГДА скрываем сообщение "Выберите просчёт"
    const noProschetMsg = document.getElementById('no-proschet-selected');
    if (noProschetMsg) {
        noProschetMsg.style.display = 'none';
    }
    
    // 2. ВСЕГДА показываем интерфейс клиента при выборе просчёта
    const clientInterface = document.getElementById('client-selection-interface');
    if (clientInterface) {
        clientInterface.style.display = 'block';
        clientInterface.style.visibility = 'visible';
        clientInterface.style.opacity = '1';
    }
    
    // 3. Устанавливаем ID просчёта в карточку клиента
    const clientDisplay = document.getElementById('current-client-display');
    if (clientDisplay) {
        clientDisplay.dataset.proschetId = proschetId;
        clientDisplay.style.display = 'block';
        clientDisplay.style.visibility = 'visible';
        clientDisplay.style.opacity = '1';
    }
    
    // 4. ВСЕГДА обновляем бейдж с номером просчёта
    const badge = document.getElementById('selected-proschet-badge');
    if (badge) {
        badge.dataset.proschetId = proschetId;
        badge.style.display = 'inline-block';
    }
    
    // 5. Получаем элементы для отображения данных клиента
    const nameElement = document.getElementById('current-client-name');
    const discountElement = document.getElementById('current-client-discount');
    const edoElement = document.getElementById('current-client-edo');
    
    // КРИТИЧЕСКО ВАЖНО: Проверяем, есть ли данные клиента
    // Условие: clientData должен быть объектом, иметь имя, имя не должно быть пустым и не должно быть прочерком
    if (clientData && typeof clientData === 'object' && 
        clientData.name && clientData.name.trim() !== '' && 
        clientData.name !== '—') {
        // СЛУЧАЙ 1: Клиент ЕСТЬ - отображаем его данные
        
        // Обновляем имя клиента
        if (nameElement) {
            nameElement.textContent = clientData.name; // Устанавливаем имя
            nameElement.style.color = ''; // Сбрасываем серый цвет
            nameElement.style.fontStyle = ''; // Сбрасываем курсив
            
            // ВАЖНОЕ ДОБАВЛЕНИЕ: Сохраняем ID клиента в data-атрибут
            // Это нужно для предзаполнения при редактировании
            if (clientData.id) {
                nameElement.dataset.clientId = clientData.id; // Сохраняем ID клиента
            } else {
                nameElement.removeAttribute('data-client-id'); // Удаляем атрибут, если ID нет
            }
        }
        
        // Обновляем скидку клиента
        if (discountElement) {
            discountElement.textContent = clientData.discount ? `${clientData.discount}%` : '0%';
        }
        
        // Обновляем информацию об ЭДО
        if (edoElement) {
            edoElement.textContent = clientData.has_edo ? 'Да' : 'Нет';
        }
    } else {
        // СЛУЧАЙ 2: Клиента НЕТ - устанавливаем значения по умолчанию (прочерки)
        console.log('Клиент не найден, устанавливаем прочерки');
        
        // Принудительно устанавливаем прочерк вместо имени
        if (nameElement) {
            nameElement.textContent = '—'; // Прочерк
            nameElement.style.color = '#777'; // Серый цвет для прочерка
            nameElement.style.fontStyle = 'italic'; // Курсив для обозначения отсутствия
            // Очищаем все возможные вложенные элементы
            nameElement.innerHTML = '—';
            // Важно: удаляем data-client-id, так как клиента нет
            nameElement.removeAttribute('data-client-id');
        }
        
        // Принудительно устанавливаем скидку по умолчанию
        if (discountElement) {
            discountElement.textContent = '0%';
            discountElement.innerHTML = '0%';
        }
        
        // Принудительно устанавливаем ЭДО по умолчанию
        if (edoElement) {
            edoElement.textContent = 'Нет';
            edoElement.innerHTML = 'Нет';
        }
    }
}

// ===== 3. ФУНКЦИЯ СБРОСА СЕКЦИИ =====
// Вызывается при отмене выбора просчёта (например, при нажатии "Отмена")
function resetClientSection() {
    console.log('Сброс секции клиента');
    
    // Проверяем, загружен ли модуль управления секцией
    if (typeof window.clientSectionManager !== 'undefined' && 
        typeof window.clientSectionManager.reset === 'function') {
        // Если модуль загружен, вызываем его метод reset
        window.clientSectionManager.reset();
    } else {
        // Если модуль не загружен, выполняем ручной сброс
        resetManually();
    }
}

// ===== 4. ФУНКЦИЯ РУЧНОГО СБРОСА =====
function resetManually() {
    // 1. Скрываем интерфейс клиента
    const clientInterface = document.getElementById('client-selection-interface');
    if (clientInterface) {
        clientInterface.style.display = 'none';
    }
    
    // 2. Скрываем бейдж с номером просчёта
    const badge = document.getElementById('selected-proschet-badge');
    if (badge) {
        badge.style.display = 'none';
    }
    
    // 3. Показываем сообщение "Выберите просчёт"
    const noProschetMsg = document.getElementById('no-proschet-selected');
    if (noProschetMsg) {
        noProschetMsg.style.display = 'block';
    }
}

// ===== 5. ЭКСПОРТ ФУНКЦИЙ В ГЛОБАЛЬНУЮ ОБЛАСТЬ ВИДИМОСТИ =====
// Создаем глобальный объект для доступа к функциям из других модулей
window.clientSectionAPI = {
    update: updateClientSectionData, // Метод для обновления секции
    reset: resetClientSection        // Метод для сброса секции
};

console.log('✅ Простой API для секции клиента загружен (исправленная версия)');