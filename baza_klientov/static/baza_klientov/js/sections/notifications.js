/*
baza_klientov/static/baza_klientov/js/sections/notifications.js
Глобальный модуль уведомлений.
*/

"use strict";

(function() {
    // Функция показа уведомления
    function showNotification(message, type) {
        const container = document.getElementById('baza-top-notifications');
        if (!container) return;

        // Создаем DOM-элемент уведомления
        const box = document.createElement('div');
        box.className = 'baza-notification';

        // Добавляем класс в зависимости от типа (success - по умолчанию)
        if (type === 'error') {
            box.classList.add('baza-notification-error');
        } else if (type === 'warning') {
            box.classList.add('baza-notification-warning');
        }

        box.textContent = message;
        container.appendChild(box);

        // Функция для плавного скрытия
        function hide() {
            // Если уведомление уже исчезает, не запускаем повторно
            if (box.classList.contains('baza-notification-out')) return;
            
            box.classList.add('baza-notification-out');
            
            // Удаляем из DOM после завершения анимации
            setTimeout(function() {
                if (box.parentNode) {
                    box.parentNode.removeChild(box);
                }
            }, 300);
        }

        // Клик по уведомлению закрывает его досрочно
        box.addEventListener('click', hide);

        // Автоматическое скрытие через 3.5 секунды
        setTimeout(hide, 3500);
    }

    // Экспортируем функцию в глобальную область видимости
    window.BazaNotify = {
        notify: showNotification
    };

})();