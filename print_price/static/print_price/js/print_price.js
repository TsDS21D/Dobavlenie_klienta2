/*
print_price.js - Основной JavaScript для приложения справочника цен на печать (себестоимость + наценка)
*/

// Ждём полной загрузки DOM
document.addEventListener('DOMContentLoaded', function() {

    // ===== 1. ПОКАЗ/СКРЫТИЕ ФОРМЫ ДОБАВЛЕНИЯ ЦЕНЫ =====
    const addPriceBtn = document.getElementById('add-price-btn');
    const priceFormSection = document.getElementById('price-form-section');

    if (addPriceBtn && priceFormSection) {
        addPriceBtn.addEventListener('click', function() {
            if (priceFormSection.style.display === 'none') {
                priceFormSection.style.display = 'block';
                addPriceBtn.textContent = '− Скрыть форму';
            } else {
                priceFormSection.style.display = 'none';
                addPriceBtn.textContent = '+ Добавить цену';
            }
        });
    }

    // ===== 2. РАСЧЁТ ИТОГОВОЙ ЦЕНЫ ЗА ЛИСТ В РЕАЛЬНОМ ВРЕМЕНИ =====
    const costInput = document.getElementById('price-cost');
    const markupInput = document.getElementById('price-markup');
    const totalPricePreview = document.getElementById('total-price-preview');
    const totalPriceValue = document.getElementById('total-price-value');

    function updateTotalPrice() {
        const cost = parseFloat(costInput.value) || 0;
        const markup = parseFloat(markupInput.value) || 0;
        if (cost > 0 && markup >= 0) {
            const price = cost + (cost * markup / 100);
            totalPricePreview.style.display = 'block';
            totalPriceValue.textContent = `${price.toFixed(2)} руб./лист`;
            // Добавляем подсказку под полем наценки
            let hint = document.getElementById('price-markup-hint');
            if (!hint) {
                hint = document.createElement('div');
                hint.id = 'price-markup-hint';
                hint.className = 'help-text';
                markupInput.parentNode.appendChild(hint);
            }
            hint.textContent = `Итоговая цена за лист: ${price.toFixed(2)} руб.`;
            hint.style.color = '#0B8661';
            hint.style.fontWeight = '600';
        } else {
            totalPricePreview.style.display = 'none';
            const hint = document.getElementById('price-markup-hint');
            if (hint) hint.remove();
        }
    }

    if (costInput && markupInput) {
        costInput.addEventListener('input', updateTotalPrice);
        markupInput.addEventListener('input', updateTotalPrice);
        updateTotalPrice();
    }

    // ===== 3. ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ ЦЕНЫ =====
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-delete')) {
            const priceId = e.target.getAttribute('data-price-id');
            const copies = e.target.getAttribute('data-price-copies');
            if (confirm(`Вы уверены, что хотите удалить цену для тиража ${copies} шт.?`)) {
                fetch(`/print_price/delete/${priceId}/`, {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken'),
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const row = document.querySelector(`.table-row[data-price-id="${priceId}"]`);
                        if (row) {
                            row.style.opacity = '0.5';
                            setTimeout(() => {
                                row.remove();
                                showNotification('Цена удалена', 'success');
                                setTimeout(() => window.location.reload(), 1000);
                            }, 300);
                        } else {
                            showNotification('Цена удалена. Обновляем страницу...', 'success');
                            setTimeout(() => window.location.reload(), 1000);
                        }
                    } else {
                        showNotification('Ошибка при удалении: ' + (data.message || 'неизвестная ошибка'), 'error');
                    }
                })
                .catch(error => {
                    console.error('Error:', error);
                    showNotification('Ошибка при удалении. Попробуйте обновить страницу.', 'error');
                });
            }
        }
    });

    // ===== 4. ОЧИСТКА ФОРМЫ =====
    window.clearPriceForm = function() {
        if (costInput) costInput.value = '';
        if (markupInput) markupInput.value = '';
        if (totalPricePreview) totalPricePreview.style.display = 'none';
        const hint = document.getElementById('price-markup-hint');
        if (hint) hint.remove();
        showNotification('Форма очищена', 'info');
    };

    // ===== 5. ОБРАБОТКА СООБЩЕНИЙ DJANGO =====
    const djangoMessages = document.querySelector('.django-messages');
    if (djangoMessages) {
        const messages = djangoMessages.querySelectorAll('.django-message');
        messages.forEach(message => {
            const type = message.getAttribute('data-type');
            const text = message.textContent;
            if (text.trim()) {
                let notificationType = 'info';
                if (type === 'error' || type === 'danger') notificationType = 'error';
                else if (type === 'warning') notificationType = 'warning';
                else if (type === 'success') notificationType = 'success';
                showNotification(text, notificationType);
            }
        });
    }

    // ===== 6. AJAX-ОТПРАВКА ФОРМЫ ДОБАВЛЕНИЯ =====
    const priceForm = document.getElementById('price-form');
    if (priceForm) {
        priceForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const submitBtn = priceForm.querySelector('.btn-submit');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Сохранение...';
            submitBtn.disabled = true;

            const formData = new FormData(priceForm);

            fetch(priceForm.action, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Цена успешно добавлена!', 'success');
                    clearPriceForm();
                    if (priceFormSection) {
                        priceFormSection.style.display = 'none';
                        if (addPriceBtn) addPriceBtn.textContent = '+ Добавить цену';
                    }
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    let errorMessage = 'Ошибка при сохранении: ';
                    if (data.errors) {
                        for (let field in data.errors) {
                            errorMessage += data.errors[field].join(', ') + ' ';
                        }
                    }
                    showNotification(errorMessage, 'error');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                showNotification('Ошибка при сохранении. Попробуйте еще раз.', 'error');
            })
            .finally(() => {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            });
        });
    }

    // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    function showNotification(message, type = 'info') {
        const oldNotifications = document.querySelectorAll('.notification');
        oldNotifications.forEach(n => n.remove());
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            if (notification.parentNode) notification.parentNode.removeChild(notification);
        }, 5000);
    }
});