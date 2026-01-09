/*
calculator/static/calculator/js/sections/client_inline_edit.js
ИСПРАВЛЕННАЯ ВЕРСИЯ с предзаполнением текущим значением:
1. ВСЕГДА обновляет значения при выборе любого просчёта
2. Если клиента нет - принудительно устанавливает прочерки
3. Полностью удалено кэширование старых значений
4. Добавлена интеграция с list_proschet.js
5. ДОБАВЛЕНО: Предзаполнение текущим значением при редактировании по двойному клику
*/

"use strict"; // Строгий режим JavaScript для предотвращения ошибок

// ===== 1. ОСНОВНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ СЕКЦИИ КЛИЕНТА =====
// Эта функция вызывается при выборе просчёта в списке просчётов
function updateClientSection(proschetId, clientData) {
    console.log('📋 Обновление секции клиента:', { proschetId, clientData });
    
    // ВАЖНОЕ ИСПРАВЛЕНИЕ: теперь при любом выборе просчёта показываем карточку клиента
    // и ОБЯЗАТЕЛЬНО обновляем значения, даже если клиент не определен
    
    // 1. ВСЕГДА скрываем сообщение "Выберите просчёт" при выборе просчёта
    const noProschetMessage = document.getElementById('no-proschet-selected');
    if (noProschetMessage) {
        noProschetMessage.style.display = 'none';
    }
    
    // 2. ВАЖНОЕ ИСПРАВЛЕНИЕ: ПОКАЗЫВАЕМ КАРТОЧКУ КЛИЕНТА ВСЕГДА при выборе просчёта
    const clientInterface = document.getElementById('client-selection-interface');
    if (clientInterface) {
        // Принудительно показываем интерфейс клиента
        clientInterface.style.display = 'block';
        clientInterface.style.visibility = 'visible';
        clientInterface.style.opacity = '1';
    }
    
    // 3. Устанавливаем ID просчёта в карточку клиента
    const clientDisplay = document.getElementById('current-client-display');
    if (clientDisplay) {
        clientDisplay.dataset.proschetId = proschetId;
        // Делаем карточку видимой
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
    const clientNameElement = document.getElementById('current-client-name');
    const clientDiscountElement = document.getElementById('current-client-discount');
    const clientEdoElement = document.getElementById('current-client-edo');
    
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: проверяем наличие данных клиента
    // Условие: clientData должен быть объектом, иметь имя, имя не должно быть пустым и не должно быть прочерком
    if (clientData && typeof clientData === 'object' && 
        clientData.name && clientData.name.trim() !== '' && 
        clientData.name !== '—') {
        // СЛУЧАЙ 1: Клиент ЕСТЬ - отображаем его данные
        console.log('Показываем данные существующего клиента:', clientData.name);
        
        // Обновляем имя клиента
        if (clientNameElement) {
            clientNameElement.textContent = clientData.name;
            clientNameElement.style.color = ''; // Сбрасываем серый цвет
            clientNameElement.style.fontStyle = ''; // Сбрасываем курсив
            
            // ВАЖНОЕ ДОБАВЛЕНИЕ: Сохраняем ID клиента в data-атрибут
            // Это критически важно для предзаполнения при редактировании по двойному клику
            if (clientData.id) {
                clientNameElement.dataset.clientId = clientData.id; // Сохраняем ID клиента
            } else {
                clientNameElement.removeAttribute('data-client-id'); // Удаляем атрибут, если ID нет
            }
        }
        
        // Обновляем скидку клиента
        if (clientDiscountElement) {
            clientDiscountElement.textContent = clientData.discount ? `${clientData.discount}%` : '0%';
        }
        
        // Обновляем информацию об ЭДО
        if (clientEdoElement) {
            clientEdoElement.textContent = clientData.has_edo ? 'Да' : 'Нет';
        }
    } else {
        // СЛУЧАЙ 2: Клиента НЕТ - устанавливаем значения по умолчанию (прочерки)
        console.log('Клиент не найден, устанавливаем прочерки');
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: принудительно устанавливаем значения
        // независимо от того, что было до этого
        
        // Устанавливаем прочерк вместо имени
        if (clientNameElement) {
            clientNameElement.textContent = '—'; // Прочерк
            clientNameElement.style.color = '#777'; // Серый цвет
            clientNameElement.style.fontStyle = 'italic'; // Курсив
            // Очищаем все возможные вложенные элементы
            clientNameElement.innerHTML = '—';
            // Важно: удаляем data-client-id, так как клиента нет
            clientNameElement.removeAttribute('data-client-id');
        }
        
        // Устанавливаем скидку по умолчанию
        if (clientDiscountElement) {
            clientDiscountElement.textContent = '0%';
            clientDiscountElement.innerHTML = '0%';
        }
        
        // Устанавливаем ЭДО по умолчанию
        if (clientEdoElement) {
            clientEdoElement.textContent = 'Нет';
            clientEdoElement.innerHTML = 'Нет';
        }
    }
    
    // 6. Дополнительная проверка: если после обновления карточка все еще не видна, принудительно показываем
    setTimeout(() => {
        if (clientInterface && clientInterface.style.display !== 'block') {
            console.warn('Карточка клиента не отобразилась, принудительно показываем...');
            clientInterface.style.display = 'block';
            clientInterface.style.visibility = 'visible';
            clientInterface.style.opacity = '1';
        }
        
        // Гарантируем, что значения установлены
        if (clientNameElement && !clientNameElement.textContent) {
            clientNameElement.textContent = '—';
        }
    }, 50); // Небольшая задержка для гарантии выполнения
}

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====
// Выполняется после полной загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция клиента загружена');
    
    // Настраиваем обработчик двойного клика для изменения клиента
    setupDoubleClickHandler();
    
    // Инициализируем начальное состояние секции
    initializeClientSection();
    
    // ВАЖНОЕ ДОПОЛНЕНИЕ: Подписываемся на события выбора просчёта
    setupProschetSelectionListener();
});

// ===== 3. ИНИЦИАЛИЗАЦИЯ НАЧАЛЬНОГО СОСТОЯНИЯ =====
function initializeClientSection() {
    // При загрузке страницы устанавливаем начальное состояние
    // Убеждаемся, что сообщение "Выберите просчёт" видно
    const noProschetMessage = document.getElementById('no-proschet-selected');
    const clientInterface = document.getElementById('client-selection-interface');
    
    if (noProschetMessage) {
        noProschetMessage.style.display = 'block';
    }
    if (clientInterface) {
        clientInterface.style.display = 'none';
    }
}

// ===== 4. НАСТРОЙКА ОБРАБОТЧИКА ДВОЙНОГО КЛИКА =====
function setupDoubleClickHandler() {
    // Вешаем обработчик на всю секцию клиента
    const clientSection = document.getElementById('client-section');
    if (!clientSection) return;
    
    clientSection.addEventListener('dblclick', function(event) {
        const target = event.target;
        
        // Проверяем, кликнули ли по имени клиента
        if (target.id === 'current-client-name' || 
            (target.classList.contains('client-value') && 
             target.previousElementSibling && 
             target.previousElementSibling.textContent.includes('Название/ФИО'))) {
            
            console.log('Двойной клик по имени клиента');
            
            // Получаем ID текущего просчёта
            const proschetId = getCurrentProschetId();
            if (!proschetId) {
                alert('Сначала выберите просчёт в списке просчётов');
                return;
            }
            
            // Запускаем процесс выбора клиента
            startClientSelection(proschetId);
        }
    });
}

// ===== 5. ВАЖНОЕ ДОПОЛНЕНИЕ: ПОДПИСКА НА СОБЫТИЯ ВЫБОРА ПРОСЧЁТА =====
function setupProschetSelectionListener() {
    // Находим таблицу просчётов
    const proschetTable = document.getElementById('proschet-table-body');
    if (!proschetTable) {
        console.warn('Таблица просчётов не найдена');
        return;
    }
    
    // Добавляем обработчик клика на строки таблицы просчётов
    proschetTable.addEventListener('click', function(event) {
        // Находим ближайшую строку просчёта
        const row = event.target.closest('.proschet-row');
        if (!row) return; // Если кликнули не по строке - выходим
        
        // Получаем ID просчёта из атрибута data
        const proschetId = row.dataset.proschetId;
        if (!proschetId) return; // Если нет ID - выходим
        
        console.log(`Пользователь выбрал просчёт ID: ${proschetId}`);
        
        // ВАЖНО: Делаем запрос на сервер для получения данных просчёта
        fetch(`/calculator/get-proschet/${proschetId}/`, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Ошибка HTTP: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // ВАЖНОЕ ИСПРАВЛЕНИЕ: передаем данные клиента (даже если их нет)
                // data.proschet.client может быть null или undefined
                updateClientSection(proschetId, data.proschet.client || null);
            } else {
                console.error('Ошибка при получении данных просчёта:', data.message);
                // Даже при ошибке обновляем секцию (с прочерками)
                updateClientSection(proschetId, null);
            }
        })
        .catch(error => {
            console.error('Ошибка сети при получении данных просчёта:', error);
            // Даже при ошибке сети обновляем секцию (с прочерками)
            updateClientSection(proschetId, null);
        });
    });
    
    console.log('✅ Обработчик выбора просчёта настроен');
}

// ===== 6. ФУНКЦИЯ ВЫБОРА КЛИЕНТА (инлайн-редактирование) =====
function startClientSelection(proschetId) {
    console.log('Начало выбора клиента для просчёта:', proschetId);
    
    // Показываем индикатор загрузки
    const clientNameElement = document.getElementById('current-client-name');
    if (clientNameElement) {
        clientNameElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
    }
    
    // Загружаем список клиентов с сервера
    fetch('/calculator/get-clients/', {
        method: 'GET',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCsrfToken()
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.clients) {
            // КРИТИЧЕСКО ВАЖНО: передаем данные текущего клиента для предзаполнения
            showClientDropdown(data.clients, proschetId);
        } else {
            throw new Error(data.message || 'Ошибка загрузки клиентов');
        }
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Ошибка загрузки клиентов: ' + error.message);
        // Восстанавливаем текст
        if (clientNameElement) {
            clientNameElement.textContent = '—';
        }
    });
}

function showClientDropdown(clients, proschetId) {
    const clientNameElement = document.getElementById('current-client-name');
    if (!clientNameElement) return;
    
    // ВАЖНОЕ ИСПРАВЛЕНИЕ: получаем ID текущего клиента из data-атрибута
    // Это ключевой момент для предзаполнения текущим значением
    const currentClientId = clientNameElement.dataset.clientId;
    console.log('Текущий ID клиента для предзаполнения:', currentClientId);
    
    // Получаем текущее текстовое значение (может быть прочерком или именем клиента)
    const currentText = clientNameElement.textContent || '—';
    
    // Создаём выпадающий список для выбора клиента
    const select = document.createElement('select');
    select.className = 'client-inline-select';
    
    // Добавляем опцию "Не выбран" (для случая когда клиент не назначен)
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- Не выбран --';
    
    // ВАЖНОЕ ИСПРАВЛЕНИЕ: по умолчанию выбираем "Не выбран"
    // Но дальше мы переопределим выбор, если нашли текущего клиента
    emptyOption.selected = true;
    
    select.appendChild(emptyOption);
    
    // Добавляем клиентов из списка
    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `${client.client_number}: ${client.name}`;
        
        // ВАЖНОЕ ИСПРАВЛЕНИЕ: проверяем, является ли этот клиент текущим
        // Сравниваем по ID клиента, который сохранен в data-client-id
        if (currentClientId && client.id == currentClientId) {
            console.log('Найден текущий клиент для предзаполнения:', client.name);
            option.selected = true; // Выбираем текущего клиента
            emptyOption.selected = false; // Снимаем выбор с "Не выбран"
        }
        
        // Сохраняем данные клиента в dataset для быстрого доступа
        option.dataset.clientData = JSON.stringify({
            name: client.name,
            discount: client.discount || 0,
            has_edo: client.has_edo || false
        });
        
        select.appendChild(option);
    });
    
    // Заменяем текст на select для редактирования
    clientNameElement.innerHTML = '';
    clientNameElement.appendChild(select);
    
    // Фокусируемся на select для удобства пользователя
    select.focus();
    
    // Настраиваем обработчики событий для select
    setupSelectListeners(select, proschetId);
}

function setupSelectListeners(select, proschetId) {
    // При изменении выбора в выпадающем списке
    select.addEventListener('change', function() {
        const selectedValue = this.value;
        const selectedOption = this.options[this.selectedIndex];
        
        if (!selectedValue) {
            // Если выбрано "Не выбран" - удаляем клиента из просчёта
            updateClientOnServer(proschetId, null);
        } else {
            // Если выбран клиент - обновляем просчёт
            const clientData = JSON.parse(selectedOption.dataset.clientData);
            updateClientOnServer(proschetId, {
                id: selectedValue,
                ...clientData
            });
        }
        
        // Возвращаем текстовое представление после выбора
        finishSelection(select, proschetId);
    });
    
    // При потере фокуса (пользователь кликнул вне поля)
    select.addEventListener('blur', function() {
        setTimeout(() => {
            finishSelection(this, proschetId);
        }, 200);
    });
    
    // Обработка клавиш Enter/Escape
    select.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            finishSelection(this, proschetId);
        } else if (e.key === 'Escape') {
            const clientNameElement = document.getElementById('current-client-name');
            if (clientNameElement) {
                const currentText = select.options[select.selectedIndex].textContent;
                if (currentText === '-- Не выбран --') {
                    clientNameElement.textContent = '—';
                    clientNameElement.style.color = '#777';
                    clientNameElement.style.fontStyle = 'italic';
                } else {
                    clientNameElement.textContent = currentText;
                    clientNameElement.style.color = '';
                    clientNameElement.style.fontStyle = '';
                }
            }
        }
    });
}

function updateClientOnServer(proschetId, clientData) {
    console.log('Обновление клиента на сервере:', { proschetId, clientData });
    
    // Отправляем запрос на сервер для обновления клиента в просчёте
    fetch(`/calculator/update-proschet-client/${proschetId}/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRFToken': getCsrfToken(),
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: `client_id=${clientData ? clientData.id : ''}`
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            updateClientSection(proschetId, clientData);
        } else {
            alert('Ошибка сохранения: ' + (data.message || 'Неизвестная ошибка'));
        }
    })
    .catch(error => {
        console.error('Ошибка сохранения:', error);
        alert('Ошибка сохранения клиента');
    });
}

function finishSelection(select, proschetId) {
    const clientNameElement = document.getElementById('current-client-name');
    if (!clientNameElement) return;
    
    // Получаем выбранное значение из select
    const selectedOption = select.options[select.selectedIndex];
    let displayText = '—';
    
    if (selectedOption.value) {
        const clientData = JSON.parse(selectedOption.dataset.clientData);
        displayText = clientData.name;
    } else {
        displayText = '—';
    }
    
    // Возвращаем текстовое представление
    clientNameElement.textContent = displayText;
    
    // Если прочерк, добавляем стили
    if (displayText === '—') {
        clientNameElement.style.color = '#777';
        clientNameElement.style.fontStyle = 'italic';
    } else {
        clientNameElement.style.color = '';
        clientNameElement.style.fontStyle = '';
    }
}

// ===== 7. ФУНКЦИЯ СБРОСА СЕКЦИИ =====
function resetClientSection() {
    console.log('Сброс секции клиента');
    
    // 1. Скрываем основной интерфейс клиента
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
    const noProschetMessage = document.getElementById('no-proschet-selected');
    if (noProschetMessage) {
        noProschetMessage.style.display = 'block';
    }
}

// ===== 8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function getCurrentProschetId() {
    // Пытаемся получить ID из бейджа
    const badge = document.getElementById('selected-proschet-badge');
    if (badge && badge.style.display !== 'none') {
        return badge.dataset.proschetId || null;
    }
    
    // Или из карточки клиента
    const clientDisplay = document.getElementById('current-client-display');
    if (clientDisplay) {
        return clientDisplay.dataset.proschetId || null;
    }
    
    return null;
}

function getCsrfToken() {
    // Пытаемся получить CSRF токен из скрытого поля формы
    const csrfTokenElement = document.querySelector('[name=csrfmiddlewaretoken]');
    if (csrfTokenElement) {
        return csrfTokenElement.value;
    }
    
    // Или из cookies
    const name = 'csrftoken';
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.startsWith(name + '=')) {
            return decodeURIComponent(cookie.substring(name.length + 1));
        }
    }
    
    return '';
}

// ===== 9. ЭКСПОРТ ФУНКЦИЙ =====
window.clientSectionManager = {
    update: updateClientSection,  // Функция обновления при выборе просчёта
    reset: resetClientSection     // Функция сброса при отмене выбора
};

console.log('✅ Модуль управления секцией клиента загружен (исправленная версия с предзаполнением)');