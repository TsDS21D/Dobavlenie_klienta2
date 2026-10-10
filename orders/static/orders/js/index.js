/*
orders/static/orders/js/index.js
Интерактив главной страницы заказов.

Что делает:
- Клик по строке таблицы заказов → переход на карточку заказа /orders/<id>/.
- Курсор-указатель на строках для визуальной подсказки.
*/

"use strict";

(function () {

    document.addEventListener('DOMContentLoaded', function () {

        // Находим все кликабельные строки таблицы заказов.
        var rows = document.querySelectorAll('.orders-row-clickable');
        if (!rows.length) return;

        rows.forEach(function (row) {
            // Ставим курсор-указатель — намекаем, что строка кликабельна.
            row.style.cursor = 'pointer';

            // Клик по строке — переход на карточку заказа.
            row.addEventListener('click', function () {
                var orderId = this.dataset.orderId;
                if (!orderId) return;
                window.location.href = '/orders/' + orderId + '/';
            });

            // Подсветка строки при наведении — мягкий серый фон.
            row.addEventListener('mouseenter', function () {
                this.style.background = '#f0f9f5';
            });
            row.addEventListener('mouseleave', function () {
                this.style.background = '';
            });
        });

        console.log('✅ Страница заказов инициализирована, строк:', rows.length);
    });

})();