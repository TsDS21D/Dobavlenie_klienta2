/*
client.js – логика компактной секции "Клиент"
Ключевой момент: статус ЭДО всегда отображается текстом "ЭДО",
а цвет (зелёный/серый) задаётся классами edo-on/edo-off.

ИСПРАВЛЕНИЕ: теперь функция updateClientSectionData ВСЕГДА вызывает
ручное обновление updateManually после вызова менеджера (если он есть),
чтобы гарантировать правильный текст и классы для ЭДО.
*/

"use strict";

// Основная функция обновления (вызывается из других модулей)
function updateClientSectionData(proschetId, clientData) {
    console.log('updateClientSectionData:', proschetId, clientData);
    if (!proschetId) {
        console.error('Ошибка: не указан proschetId');
        return;
    }
    // Если есть менеджер секции – вызываем его (он может обновить данные по-своему)
    if (typeof window.clientSectionManager !== 'undefined' &&
        typeof window.clientSectionManager.update === 'function') {
        window.clientSectionManager.update(proschetId, clientData);
    }
    // В любом случае выполняем наше ручное обновление с правильным форматом
    updateManually(proschetId, clientData);
}

// Ручное обновление интерфейса (гарантирует текст "ЭДО" и нужные классы)
function updateManually(proschetId, clientData) {
    console.log('Ручное обновление (компактная версия)');

    // Скрываем сообщение "Выберите просчёт"
    const noProschetMsg = document.getElementById('no-proschet-selected');
    if (noProschetMsg) noProschetMsg.style.display = 'none';

    // Показываем интерфейс клиента
    const clientInterface = document.getElementById('client-selection-interface');
    if (clientInterface) {
        clientInterface.style.display = 'block';
        clientInterface.style.visibility = 'visible';
        clientInterface.style.opacity = '1';
    }

    const clientDisplay = document.getElementById('current-client-display');
    if (clientDisplay) {
        clientDisplay.dataset.proschetId = proschetId;
        clientDisplay.style.display = 'block';
        clientDisplay.style.visibility = 'visible';
        clientDisplay.style.opacity = '1';
    }

    // Показываем бейдж с номером просчёта
    const badge = document.getElementById('selected-proschet-badge');
    if (badge) {
        badge.dataset.proschetId = proschetId;
        badge.style.display = 'inline-block';
    }

    // Элементы для данных клиента
    const nameElement = document.getElementById('current-client-name');
    const discountElement = document.getElementById('current-client-discount');
    const edoElement = document.getElementById('current-client-edo');

    // Если есть данные клиента (не пустые)
    if (clientData && typeof clientData === 'object' &&
        clientData.name && clientData.name.trim() !== '' &&
        clientData.name !== '—') {

        // Имя клиента
        if (nameElement) {
            nameElement.textContent = clientData.name;
            nameElement.style.color = '';
            nameElement.style.fontStyle = '';
            if (clientData.id) {
                nameElement.dataset.clientId = clientData.id;
            } else {
                nameElement.removeAttribute('data-client-id');
            }
        }

        // Скидка (отображаем в скобках)
        if (discountElement) {
            const discount = clientData.discount ? clientData.discount : 0;
            discountElement.textContent = `(${discount}%)`;
        }

        // Статус ЭДО: всегда текст "ЭДО", меняем только класс
        if (edoElement) {
            edoElement.textContent = 'ЭДО';               // Текст всегда одинаковый
            if (clientData.has_edo) {
                // ЭДО есть – зелёный класс
                edoElement.classList.remove('edo-off');
                edoElement.classList.add('edo-on');
            } else {
                // ЭДО нет – серый класс
                edoElement.classList.remove('edo-on');
                edoElement.classList.add('edo-off');
            }
        }
    } else {
        // Клиента нет – прочерки и класс ЭДО по умолчанию (серый)
        console.log('Клиент не найден, устанавливаем прочерки');
        if (nameElement) {
            nameElement.textContent = '—';
            nameElement.style.color = '#777';
            nameElement.style.fontStyle = 'italic';
            nameElement.removeAttribute('data-client-id');
        }
        if (discountElement) {
            discountElement.textContent = '(0%)';
        }
        if (edoElement) {
            edoElement.textContent = 'ЭДО';
            edoElement.classList.remove('edo-on');
            edoElement.classList.add('edo-off');
        }
    }
}

// Сброс секции (когда просчёт снимается)
function resetClientSection() {
    console.log('Сброс секции клиента');
    if (typeof window.clientSectionManager !== 'undefined' &&
        typeof window.clientSectionManager.reset === 'function') {
        window.clientSectionManager.reset();
    } else {
        resetManually();
    }
}

function resetManually() {
    const clientInterface = document.getElementById('client-selection-interface');
    if (clientInterface) clientInterface.style.display = 'none';

    const badge = document.getElementById('selected-proschet-badge');
    if (badge) badge.style.display = 'none';

    const noProschetMsg = document.getElementById('no-proschet-selected');
    if (noProschetMsg) noProschetMsg.style.display = 'block';
}

// Экспортируем функции в глобальный объект для использования другими модулями
window.clientSectionAPI = {
    update: updateClientSectionData,
    reset: resetClientSection
};

console.log('✅ Компактная версия API для секции клиента загружена (с гарантированным текстом "ЭДО")');