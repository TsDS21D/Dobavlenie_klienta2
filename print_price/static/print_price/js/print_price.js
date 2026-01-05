/*
print_price.js - Основной JavaScript для приложения справочника цен на печать (цена за 1 лист)
*/

// Ждем полной загрузки DOM
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
    
    // ===== 2. РАСЧЕТ ОБЩЕЙ СТОИМОСТИ В РЕАЛЬНОМ ВРЕМЕНИ =====
    const priceCopiesInput = document.getElementById('price-copies');
    const pricePerSheetInput = document.getElementById('price-per-sheet');
    const totalPricePreview = document.getElementById('total-price-preview');
    const totalPriceValue = document.getElementById('total-price-value');
    
    // Функция для расчета и отображения общей стоимости
    function updateTotalPrice() {
        const copies = parseFloat(priceCopiesInput.value) || 0;
        const pricePerSheet = parseFloat(pricePerSheetInput.value) || 0;
        
        if (copies > 0 && pricePerSheet > 0) {
            const totalPrice = (pricePerSheet * copies).toFixed(2);
            
            // Показываем блок с расчетом
            totalPricePreview.style.display = 'block';
            totalPriceValue.textContent = `${totalPrice} руб.`;
            
            // Подсказка под полем ввода цены
            let hint = document.getElementById('price-per-sheet-hint');
            if (!hint) {
                hint = document.createElement('div');
                hint.id = 'price-per-sheet-hint';
                hint.className = 'help-text';
                pricePerSheetInput.parentNode.appendChild(hint);
            }
            
            hint.textContent = `При тираже ${copies} шт. общая стоимость составит ${totalPrice} руб.`;
            hint.style.color = '#0B8661';
            hint.style.fontWeight = '600';
        } else {
            // Скрываем блок, если данные неполные
            totalPricePreview.style.display = 'none';
            
            // Убираем подсказку
            const hint = document.getElementById('price-per-sheet-hint');
            if (hint) hint.remove();
        }
    }
    
    // Слушаем изменения в полях ввода
    if (priceCopiesInput && pricePerSheetInput) {
        priceCopiesInput.addEventListener('input', updateTotalPrice);
        pricePerSheetInput.addEventListener('input', updateTotalPrice);
        
        // Вызываем один раз для начального состояния
        updateTotalPrice();
    }
    
    // ===== 3. ПОДТВЕРЖДЕНИЕ УДАЛЕНИЯ ЦЕНЫ =====
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('btn-delete')) {
            const priceId = e.target.getAttribute('data-price-id');
            const copies = e.target.getAttribute('data-price-copies');
            
            if (confirm(`Вы уверены, что хотите удалить цену для тиража ${copies} шт.?`)) {
                // Отправляем запрос на удаление
                fetch(`/print_price/delete/${priceId}/`, {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCookie('csrftoken'),
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                })
                .then(response => {
                    if (response.ok) {
                        return response.json();
                    }
                    throw new Error('Network response was not ok.');
                })
                .then(data => {
                    if (data.success) {
                        // Удаляем строку из таблицы
                        const row = document.querySelector(`.table-row[data-price-id="${priceId}"]`);
                        if (row) {
                            row.style.opacity = '0.5';
                            setTimeout(() => {
                                row.remove();
                                // Показываем уведомление
                                showNotification('Цена успешно удалена', 'success');
                                
                                // Перезагружаем страницу через 1 секунду для обновления статистики
                                setTimeout(() => {
                                    window.location.reload();
                                }, 1000);
                            }, 300);
                        } else {
                            // Если строка не найдена (возможно, уже удалена), просто обновляем страницу
                            showNotification('Цена удалена. Обновляем страницу...', 'success');
                            setTimeout(() => {
                                window.location.reload();
                            }, 1000);
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
        if (priceCopiesInput) priceCopiesInput.value = '';
        if (pricePerSheetInput) pricePerSheetInput.value = '';
        
        // Скрываем блок с расчетом
        if (totalPricePreview) totalPricePreview.style.display = 'none';
        
        // Убираем подсказку
        const hint = document.getElementById('price-per-sheet-hint');
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
                // Преобразуем теги Django в наши
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
            
            // Показываем индикатор загрузки
            const submitBtn = priceForm.querySelector('.btn-submit');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Сохранение...';
            submitBtn.disabled = true;
            
            // Собираем данные формы
            const formData = new FormData(priceForm);
            
            // Отправляем AJAX-запрос
            fetch(priceForm.action, {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    showNotification('Цена успешно добавлена!', 'success');
                    
                    // Очищаем форму
                    clearPriceForm();
                    
                    // Скрываем форму
                    if (priceFormSection) {
                        priceFormSection.style.display = 'none';
                        if (addPriceBtn) addPriceBtn.textContent = '+ Добавить цену';
                    }
                    
                    // Перезагружаем страницу через 1 секунду
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } else {
                    // Показываем ошибки
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
                // Восстанавливаем кнопку
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            });
        });
    }
    
    // ===== 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
    
    // Функция для получения CSRF токена
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
    
    // Функция для показа уведомлений
    function showNotification(message, type = 'info') {
        // Удаляем старые уведомления
        const oldNotifications = document.querySelectorAll('.notification');
        oldNotifications.forEach(n => n.remove());
        
        // Создаем новое уведомление
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Добавляем на страницу
        document.body.appendChild(notification);
        
        // Удаляем через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
});