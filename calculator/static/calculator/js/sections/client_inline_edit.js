/*
calculator/static/calculator/js/sections/client_inline_edit.js
КОМПАКТНАЯ ВЕРСИЯ ДЛЯ СЕКЦИИ КЛИЕНТА:
- Все данные в одной строке: название, скидка в скобках, статус ЭДО (всегда текст "ЭДО").
- Статус ЭДО отображается зелёным (edo-on) или серым (edo-off).
- Сохранены: двойной клик для выбора клиента, предзаполнение текущим значением, синхронизация с сервером.
*/

"use strict";

// ===== 1. ОСНОВНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ СЕКЦИИ КЛИЕНТА =====
// Вызывается при выборе просчёта в списке просчётов
function updateClientSection(proschetId, clientData) {
    console.log('📋 Обновление секции клиента:', { proschetId, clientData });

    // 1. Скрываем сообщение "Выберите просчёт"
    const noProschetMessage = document.getElementById('no-proschet-selected');
    if (noProschetMessage) noProschetMessage.style.display = 'none';

    // 2. Показываем интерфейс клиента
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

    // 4. Обновляем бейдж с номером просчёта
    const badge = document.getElementById('selected-proschet-badge');
    if (badge) {
        badge.dataset.proschetId = proschetId;
        badge.style.display = 'inline-block';
    }

    // 5. Получаем элементы для отображения данных клиента
    const clientNameElement = document.getElementById('current-client-name');
    const clientDiscountElement = document.getElementById('current-client-discount');
    const clientEdoElement = document.getElementById('current-client-edo');

    // 6. Проверяем, есть ли данные клиента
    if (clientData && typeof clientData === 'object' && 
        clientData.name && clientData.name.trim() !== '' && 
        clientData.name !== '—') {
        // Случай 1: Клиент есть
        console.log('Показываем данные существующего клиента:', clientData.name);

        // Имя клиента
        if (clientNameElement) {
            clientNameElement.textContent = clientData.name;
            clientNameElement.style.color = '';          // убираем серый цвет
            clientNameElement.style.fontStyle = '';      // убираем курсив
            // Сохраняем ID клиента для предзаполнения при редактировании
            if (clientData.id) {
                clientNameElement.dataset.clientId = clientData.id;
            } else {
                clientNameElement.removeAttribute('data-client-id');
            }
        }

        // Скидка (в скобках)
        if (clientDiscountElement) {
            const discount = clientData.discount ? clientData.discount : 0;
            clientDiscountElement.textContent = `(${discount}%)`;
        }

        // Статус ЭДО – всегда текст "ЭДО", цвет через классы
        if (clientEdoElement) {
            clientEdoElement.textContent = 'ЭДО';                 // всегда одинаковый текст
            if (clientData.has_edo) {
                // ЭДО есть – зелёный
                clientEdoElement.classList.remove('edo-off');
                clientEdoElement.classList.add('edo-on');
            } else {
                // ЭДО нет – серый
                clientEdoElement.classList.remove('edo-on');
                clientEdoElement.classList.add('edo-off');
            }
        }
    } else {
        // Случай 2: Клиента нет – устанавливаем значения по умолчанию (прочерки)
        console.log('Клиент не найден, устанавливаем прочерки');

        if (clientNameElement) {
            clientNameElement.textContent = '—';                   // прочерк
            clientNameElement.style.color = '#777';                // серый цвет
            clientNameElement.style.fontStyle = 'italic';          // курсив
            clientNameElement.removeAttribute('data-client-id');   // удаляем ID
        }

        if (clientDiscountElement) {
            clientDiscountElement.textContent = '(0%)';            // скидка 0% в скобках
        }

        if (clientEdoElement) {
            clientEdoElement.textContent = 'ЭДО';                  // всегда текст "ЭДО"
            clientEdoElement.classList.remove('edo-on');
            clientEdoElement.classList.add('edo-off');             // серый по умолчанию
        }
    }
}

// ===== 2. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ Секция клиента загружена (компактная версия)');

    // Настраиваем обработчик двойного клика для изменения клиента
    setupDoubleClickHandler();

    // Инициализируем начальное состояние секции
    initializeClientSection();

    // Подписываемся на события выбора просчёта
    setupProschetSelectionListener();
});

// ===== 3. ИНИЦИАЛИЗАЦИЯ НАЧАЛЬНОГО СОСТОЯНИЯ =====
function initializeClientSection() {
    // При загрузке страницы показываем сообщение "Выберите просчёт"
    const noProschetMessage = document.getElementById('no-proschet-selected');
    const clientInterface = document.getElementById('client-selection-interface');

    if (noProschetMessage) noProschetMessage.style.display = 'block';
    if (clientInterface) clientInterface.style.display = 'none';
}

// ===== 4. НАСТРОЙКА ОБРАБОТЧИКА ДВОЙНОГО КЛИКА =====
function setupDoubleClickHandler() {
    const clientSection = document.getElementById('client-section');
    if (!clientSection) return;

    clientSection.addEventListener('dblclick', function(event) {
        const target = event.target;

        // Проверяем, кликнули ли по имени клиента (элемент с id="current-client-name")
        if (target.id === 'current-client-name') {
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

// ===== 5. ПОДПИСКА НА СОБЫТИЯ ВЫБОРА ПРОСЧЁТА =====
function setupProschetSelectionListener() {
    const proschetTable = document.getElementById('proschet-table-body');
    if (!proschetTable) {
        console.warn('Таблица просчётов не найдена');
        return;
    }

    // Добавляем обработчик клика на строки таблицы просчётов
    proschetTable.addEventListener('click', function(event) {
        const row = event.target.closest('.proschet-row');
        if (!row) return;

        const proschetId = row.dataset.proschetId;
        if (!proschetId) return;

        console.log(`Пользователь выбрал просчёт ID: ${proschetId}`);

        // Запрашиваем данные просчёта с сервера
        fetch(`/calculator/get-proschet/${proschetId}/`, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(response => {
            if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Обновляем секцию клиента (передаём данные клиента или null)
                updateClientSection(proschetId, data.proschet.client || null);
            } else {
                console.error('Ошибка при получении данных просчёта:', data.message);
                updateClientSection(proschetId, null);
            }
        })
        .catch(error => {
            console.error('Ошибка сети при получении данных просчёта:', error);
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
            // Показываем выпадающий список, передавая ID текущего клиента для предзаполнения
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
            clientNameElement.style.color = '#777';
            clientNameElement.style.fontStyle = 'italic';
        }
    });
}

function showClientDropdown(clients, proschetId) {
    const clientNameElement = document.getElementById('current-client-name');
    if (!clientNameElement) return;

    // Получаем ID текущего клиента из data-атрибута (если есть)
    const currentClientId = clientNameElement.dataset.clientId;
    console.log('Текущий ID клиента для предзаполнения:', currentClientId);

    // Создаём выпадающий список
    const select = document.createElement('select');
    select.className = 'client-inline-select';

    // Опция "Не выбран"
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '-- Не выбран --';
    // По умолчанию выбираем "Не выбран", но позже переопределим, если есть текущий клиент
    emptyOption.selected = true;
    select.appendChild(emptyOption);

    // Добавляем клиентов из списка
    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `${client.client_number}: ${client.name}`;

        // Если этот клиент совпадает с текущим – выбираем его
        if (currentClientId && client.id == currentClientId) {
            console.log('Найден текущий клиент для предзаполнения:', client.name);
            option.selected = true;
            emptyOption.selected = false; // снимаем выбор с "Не выбран"
        }

        // Сохраняем полные данные клиента в dataset для быстрого доступа
        option.dataset.clientData = JSON.stringify({
            name: client.name,
            discount: client.discount || 0,
            has_edo: client.has_edo || false
        });

        select.appendChild(option);
    });

    // Заменяем имя на выпадающий список
    clientNameElement.innerHTML = '';
    clientNameElement.appendChild(select);
    select.focus();

    // Настраиваем обработчики событий для select
    setupSelectListeners(select, proschetId);
}

function setupSelectListeners(select, proschetId) {
    // При изменении выбора
    select.addEventListener('change', function() {
        const selectedValue = this.value;
        const selectedOption = this.options[this.selectedIndex];

        if (!selectedValue) {
            // Выбрано "Не выбран" – удаляем клиента из просчёта
            updateClientOnServer(proschetId, null);
        } else {
            // Выбран конкретный клиент
            const clientData = JSON.parse(selectedOption.dataset.clientData);
            updateClientOnServer(proschetId, {
                id: selectedValue,
                ...clientData
            });
        }

        // Завершаем редактирование
        finishSelection(select, proschetId);
    });

    // При потере фокуса (клик вне поля)
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
            // Отмена – возвращаем исходное имя
            const clientNameElement = document.getElementById('current-client-name');
            if (clientNameElement) {
                // Восстанавливаем текст из текущего выбранного элемента
                const selectedOption = this.options[this.selectedIndex];
                if (selectedOption.value === '') {
                    clientNameElement.textContent = '—';
                    clientNameElement.style.color = '#777';
                    clientNameElement.style.fontStyle = 'italic';
                } else {
                    const clientData = JSON.parse(selectedOption.dataset.clientData);
                    clientNameElement.textContent = clientData.name;
                    clientNameElement.style.color = '';
                    clientNameElement.style.fontStyle = '';
                }
            }
            // Удаляем select
            finishSelection(this, proschetId);
        }
    });
}

function updateClientOnServer(proschetId, clientData) {
    console.log('Обновление клиента на сервере:', { proschetId, clientData });

    // Отправляем запрос на сервер
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
            // После успешного сохранения обновляем секцию клиента
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

    // Если select всё ещё в DOM, удаляем его и восстанавливаем текстовое представление
    // (обычно это уже сделано, но на всякий случай)
    if (clientNameElement.contains(select)) {
        // Определяем, что отображать после завершения
        const selectedOption = select.options[select.selectedIndex];
        if (selectedOption.value === '') {
            clientNameElement.textContent = '—';
            clientNameElement.style.color = '#777';
            clientNameElement.style.fontStyle = 'italic';
            clientNameElement.removeAttribute('data-client-id');
        } else {
            const clientData = JSON.parse(selectedOption.dataset.clientData);
            clientNameElement.textContent = clientData.name;
            clientNameElement.style.color = '';
            clientNameElement.style.fontStyle = '';
            clientNameElement.dataset.clientId = selectedOption.value;
        }
    }
}

// ===== 7. ФУНКЦИЯ СБРОСА СЕКЦИИ =====
function resetClientSection() {
    console.log('Сброс секции клиента');

    const clientInterface = document.getElementById('client-selection-interface');
    if (clientInterface) clientInterface.style.display = 'none';

    const badge = document.getElementById('selected-proschet-badge');
    if (badge) badge.style.display = 'none';

    const noProschetMessage = document.getElementById('no-proschet-selected');
    if (noProschetMessage) noProschetMessage.style.display = 'block';
}

// ===== 8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function getCurrentProschetId() {
    const badge = document.getElementById('selected-proschet-badge');
    if (badge && badge.style.display !== 'none') {
        return badge.dataset.proschetId || null;
    }
    const clientDisplay = document.getElementById('current-client-display');
    if (clientDisplay) {
        return clientDisplay.dataset.proschetId || null;
    }
    return null;
}

function getCsrfToken() {
    const csrfTokenElement = document.querySelector('[name=csrfmiddlewaretoken]');
    if (csrfTokenElement) return csrfTokenElement.value;

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
    update: updateClientSection,
    reset: resetClientSection
};

console.log('✅ Модуль управления секцией клиента (компактная версия) загружен');