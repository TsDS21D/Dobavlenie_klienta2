/*
baza_klientov/static/baza_klientov/js/sections/confirm.js
Глобальный модуль красивых модалок подтверждения.
*/

"use strict";

(function() {
    let overlay, titleEl, textEl, btnYes, btnNo;
    let confirmCallback = null;

    document.addEventListener('DOMContentLoaded', function() {
        overlay = document.getElementById('baza-confirm-overlay');
        titleEl = document.getElementById('baza-confirm-title');
        textEl  = document.getElementById('baza-confirm-text');
        btnYes  = document.getElementById('baza-confirm-yes');
        btnNo   = document.getElementById('baza-confirm-no');

        if (!overlay) return;

        // Закрытие по кнопке "Отмена"
        btnNo.addEventListener('click', closeModal);
        
        // Закрытие по клику на фон
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeModal();
        });

        // Закрытие по кнопке "Удалить"
        btnYes.addEventListener('click', function() {
            // ИСПРАВЛЕНИЕ: Сохраняем коллбэк в локальную переменную,
            // так как closeModal() обнуляет глобальный confirmCallback
            const cb = confirmCallback;
            
            // Закрываем модалку
            closeModal();
            
            // Вызываем сохраненный коллбэк
            if (typeof cb === 'function') {
                cb();
            }
        });

        // Закрытие по Esc
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && overlay.style.display === 'flex') {
                closeModal();
            }
        });
    });

    function closeModal() {
        overlay.style.display = 'none';
        confirmCallback = null;
    }

    // Экспортируем глобальную функцию
    window.BazaConfirm = {
        /**
         * Показывает модалку.
         * @param {string} title - Заголовок (например, "Удалить клиента?")
         * @param {string} text - Текст под заголовком
         * @param {function} onConfirm - Функция, которая выполнится при нажатии "Удалить"
         */
        show: function(title, text, onConfirm) {
            if (!overlay) return;
            titleEl.textContent = title;
            textEl.textContent = text;
            confirmCallback = onConfirm;
            overlay.style.display = 'flex';
        }
    };
})();