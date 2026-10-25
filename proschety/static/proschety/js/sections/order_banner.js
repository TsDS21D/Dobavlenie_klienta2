/*
proschety/static/proschety/js/sections/order_banner.js
Логика плашки «Создание просчёта для заказа».
*/

"use strict";

(function () {
    // Получаем ID заказа из URL (если есть)
    const urlParams = new URLSearchParams(window.location.search);
    const targetOrderId = urlParams.get('order_id');

    if (!targetOrderId) return; // Если нет order_id — скрипт не работает

    // Записываем ID заказа в скрытое поле формы создания просчёта.
    // Теперь при нажатии «Создать просчёт» сервер узнает, к какому заказу он привязан.
    const sourceOrderInput = document.getElementById('list-proschet-create-source-order');
    if (sourceOrderInput) {
        sourceOrderInput.value = targetOrderId;
    }

    const bannerEl = document.getElementById('proschety-order-banner');
    const orderNumberEl = document.getElementById('proschety-order-number');
    const btnAddToOrder = document.getElementById('proschety-btn-add-to-order');

    if (!bannerEl || !orderNumberEl || !btnAddToOrder) return;

    // 1. Показываем плашку и запрашиваем номер заказа
    bannerEl.style.display = 'flex';
    
    fetch('/orders/api/order-info/' + targetOrderId + '/', {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            orderNumberEl.textContent = data.order.number;
            
            // ПРЕДЗАПОЛНЕНИЕ КЛИЕНТА
            if (data.order.client_id) {
                const clientSelect = document.getElementById('list-proschet-create-client');
                if (clientSelect) {
                    // Устанавливаем выбранное значение
                    clientSelect.value = String(data.order.client_id);
                    
                    // Если форма создания закрыта, можно её даже не открывать, 
                    // значение уже будет выбрано при клике на "Создать".
                }
            }
        } else {
            orderNumberEl.textContent = '#' + targetOrderId;
        }
    })
    .catch(() => {
        orderNumberEl.textContent = '#' + targetOrderId;
    });

    // 2. Обработчик кнопки «Сохранить как изделие в заказ»
    btnAddToOrder.addEventListener('click', function () {
        // Получаем ID текущего активного просчёта
        // (переменная currentProschetId живет внутри proschet_summary.js)
        let proschetId = null;
        if (window.priceSection && typeof window.priceSection.getCurrentProschetId === 'function') {
            proschetId = window.priceSection.getCurrentProschetId();
        }

        if (!proschetId) {
            showNotification('Сначала выберите или создайте просчёт', 'warning');
            return;
        }

        const originalText = btnAddToOrder.textContent;
        btnAddToOrder.disabled = true;
        btnAddToOrder.textContent = 'Добавление...';

        // Отправляем запрос в orders
        fetch('/orders/api/add-to-order/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken() // Берем токен из глобальной функции
            },
            body: JSON.stringify({
                proschet_id: proschetId,
                order_id: targetOrderId
            })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                showNotification('Изделие успешно добавлено в заказ ' + orderNumberEl.textContent, 'success');
                btnAddToOrder.textContent = 'Добавлено!';
                
                // ПЕРЕНАПРАВЛЕНИЕ В СПИСОК ЗАКАЗОВ С АВТОРАСКРЫТИЕМ
                setTimeout(() => {
                    window.location.href = '/orders/?expanded_order=' + targetOrderId;
                }, 500);
                
            } else {
                showNotification(data.error || 'Ошибка добавления', 'error');
                btnAddToOrder.disabled = false;
                btnAddToOrder.textContent = originalText;
            }
        })
        .catch(err => {
            console.error(err);
            showNotification('Ошибка сети при добавлении', 'error');
            btnAddToOrder.disabled = false;
            btnAddToOrder.textContent = originalText;
        });
    });

    // Вспомогательная функция для CSRF (если она не глобальная)
    function getCsrfToken() {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const c = cookies[i].trim();
            if (c.indexOf('csrftoken=') === 0) {
                return decodeURIComponent(c.substring('csrftoken='.length));
            }
        }
        return '';
    }

    // Вспомогательная функция для уведомлений (если её нет глобально)
    // В proschety она скорее всего уже есть, но на всякий случай используем ту, что в proschet.js
    function showNotification(msg, type) {
        // Если в proschety есть глобальная функция — используем её
        if (typeof window.showTopNotification === 'function') {
            window.showTopNotification(msg, type);
            return;
        }
        // Иначе используем стандартный контейнер
        const container = document.getElementById('proschety-top-notifications');
        if (!container) return;
        const box = document.createElement('div');
        box.className = 'proschety-top-notification';
        if (type === 'error') box.classList.add('proschety-top-notification-error');
        if (type === 'warning') box.classList.add('proschety-top-notification-warning');
        box.textContent = msg;
        container.appendChild(box);
        setTimeout(() => {
            box.classList.add('proschety-top-notification-out');
            setTimeout(() => box.remove(), 300);
        }, 2500);
    }

})();