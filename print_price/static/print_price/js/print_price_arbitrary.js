/*
print_price_arbitrary.js - JavaScript для расчета цены для произвольного тиража
*/

// Ждем полной загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('print_price_arbitrary.js загружен'); // Отладочное сообщение
    
    // ===== 1. ПЕРЕМЕННЫЕ ДЛЯ ЭЛЕМЕНТОВ ФОРМЫ =====
    const interpolationMethodSelect = document.getElementById('interpolation-method');
    const arbitraryCopiesInput = document.getElementById('arbitrary-copies');
    const calculateArbitraryPriceBtn = document.getElementById('calculate-arbitrary-price');
    const arbitraryResultSection = document.getElementById('arbitrary-result');
    
    // Элементы для отображения результата
    const resultInterpolationMethod = document.getElementById('result-interpolation-method');
    const resultCopies = document.getElementById('result-copies');
    const resultPricePerSheet = document.getElementById('result-price-per-sheet');
    const resultPointsInfo = document.getElementById('result-points-info');
    
    // ===== 2. ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ CSRF ТОКЕНА =====
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
    
    // ===== 3. ФУНКЦИЯ ДЛЯ ПОКАЗА УВЕДОМЛЕНИЙ =====
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
    
    // ===== 4. ОБРАБОТКА ИЗМЕНЕНИЯ МЕТОДА ИНТЕРПОЛЯЦИИ =====
    if (interpolationMethodSelect) {
        interpolationMethodSelect.addEventListener('change', function() {
            console.log('Метод интерполяции изменен на:', this.value);
            
            // Получаем ID принтера из data-атрибута
            const printerId = this.getAttribute('data-printer-id');
            const newMethod = this.value;
            
            if (!printerId) {
                console.error('ID принтера не найден');
                showNotification('Ошибка: не найден ID принтера', 'error');
                return;
            }
            
            // Показываем индикатор загрузки
            const originalText = this.options[this.selectedIndex].text;
            this.options[this.selectedIndex].text = 'Сохранение...';
            
            // Подготавливаем данные для отправки
            const formData = new FormData();
            formData.append('interpolation_method', newMethod);
            formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));
            
            // Отправляем AJAX-запрос для обновления метода интерполяции
            fetch(`/print_price/api/update_interpolation_method/${printerId}/`, {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ошибка! статус: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    console.log('Метод интерполяции обновлен:', data);
                    
                    // Восстанавливаем текст в выпадающем списке
                    this.options[this.selectedIndex].text = newMethod === 'linear' ? 'Линейная' : 'Логарифмическая';
                    
                    // Обновляем отображение метода в блоке результата
                    if (resultInterpolationMethod) {
                        resultInterpolationMethod.textContent = data.new_method_display;
                    }
                    
                    // Показываем уведомление об успехе
                    showNotification(`Метод интерполяции изменен на "${data.new_method_display}"`, 'success');
                } else {
                    // В случае ошибки восстанавливаем исходное значение
                    const previousMethod = this.getAttribute('data-previous-value') || 'linear';
                    this.value = previousMethod;
                    this.options[this.selectedIndex].text = previousMethod === 'linear' ? 'Линейная' : 'Логарифмическая';
                    
                    // Показываем ошибку
                    showNotification(`Ошибка: ${data.error || 'неизвестная ошибка'}`, 'error');
                }
            })
            .catch(error => {
                console.error('Ошибка при обновлении метода интерполяции:', error);
                
                // Восстанавливаем исходное значение
                const previousMethod = this.getAttribute('data-previous-value') || 'linear';
                this.value = previousMethod;
                this.options[this.selectedIndex].text = previousMethod === 'linear' ? 'Линейная' : 'Логарифмическая';
                
                showNotification('Ошибка при сохранении метода интерполяции', 'error');
            });
        });
        
        // Сохраняем исходное значение для возможного восстановления
        interpolationMethodSelect.setAttribute('data-previous-value', interpolationMethodSelect.value);
    }
    
    // ===== 5. ОБРАБОТКА КЛИКА ПО КНОПКЕ РАСЧЕТА =====
    if (calculateArbitraryPriceBtn && arbitraryCopiesInput) {
        calculateArbitraryPriceBtn.addEventListener('click', function() {
            console.log('Нажата кнопка "Рассчитать"');
            
            // Получаем ID принтера из выпадающего списка
            const printerId = interpolationMethodSelect ? interpolationMethodSelect.getAttribute('data-printer-id') : null;
            
            if (!printerId) {
                console.error('ID принтера не найден');
                showNotification('Ошибка: не найден ID принтера. Выберите принтер слева.', 'error');
                return;
            }
            
            // Получаем значение произвольного тиража
            const arbitraryCopies = arbitraryCopiesInput.value.trim();
            
            // Проверяем, что тираж указан
            if (!arbitraryCopies) {
                showNotification('Введите тираж для расчета', 'warning');
                arbitraryCopiesInput.focus();
                return;
            }
            
            // Проверяем, что тираж - положительное число
            const copiesNumber = parseInt(arbitraryCopies);
            if (isNaN(copiesNumber) || copiesNumber < 1) {
                showNotification('Тираж должен быть положительным числом', 'error');
                arbitraryCopiesInput.focus();
                arbitraryCopiesInput.select();
                return;
            }
            
            // Показываем индикатор загрузки
            const originalButtonText = this.textContent;
            this.textContent = 'Расчет...';
            this.disabled = true;
            
            // Получаем выбранный метод интерполяции
            const interpolationMethod = interpolationMethodSelect ? interpolationMethodSelect.value : 'linear';
            
            console.log('Параметры расчета:', {
                printerId,
                arbitraryCopies,
                interpolationMethod
            });
            
            // Подготавливаем данные для отправки
            const formData = new FormData();
            formData.append('arbitrary_copies', arbitraryCopies);
            formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));
            
            // Отправляем AJAX-запрос для расчета цены
            fetch(`/print_price/api/calculate_arbitrary_price/${printerId}/`, {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ошибка! статус: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Получен ответ расчета:', data);
                
                // Восстанавливаем кнопку
                this.textContent = originalButtonText;
                this.disabled = false;
                
                if (data.success) {
                    // Обновляем отображение результата
                    if (resultInterpolationMethod) {
                        resultInterpolationMethod.textContent = data.interpolation_method_display;
                    }
                    
                    if (resultCopies) {
                        resultCopies.textContent = `${data.arbitrary_copies} шт.`;
                    }
                    
                    if (resultPricePerSheet) {
                        resultPricePerSheet.textContent = data.calculated_price_display;
                    }
                    
                    // Показываем информацию об опорных точках
                    if (resultPointsInfo && data.points_count) {
                        resultPointsInfo.innerHTML = `
                            <small>
                                <i class="fas fa-info-circle"></i>
                                Рассчитано на основе ${data.points_count} опорных точек из таблицы выше
                            </small>
                        `;
                        resultPointsInfo.style.display = 'block';
                    }
                    
                    // Показываем блок с результатом
                    if (arbitraryResultSection) {
                        arbitraryResultSection.style.display = 'block';
                        
                        // Прокручиваем к результату
                        arbitraryResultSection.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest'
                        });
                    }
                    
                    // Показываем уведомление об успехе
                    showNotification(data.message, 'success');
                } else {
                    // Скрываем блок с результатом
                    if (arbitraryResultSection) {
                        arbitraryResultSection.style.display = 'none';
                    }
                    
                    // Показываем ошибку
                    showNotification(`Ошибка: ${data.error || 'неизвестная ошибка'}`, 'error');
                }
            })
            .catch(error => {
                console.error('Ошибка при расчете цены:', error);
                
                // Восстанавливаем кнопку
                this.textContent = originalButtonText;
                this.disabled = false;
                
                // Скрываем блок с результатом
                if (arbitraryResultSection) {
                    arbitraryResultSection.style.display = 'none';
                }
                
                showNotification('Ошибка при расчете. Проверьте подключение к интернету.', 'error');
            });
        });
    }
    
    // ===== 6. ОБРАБОТКА НАЖАТИЯ ENTER В ПОЛЕ ВВОДА ТИРАЖА =====
    if (arbitraryCopiesInput) {
        arbitraryCopiesInput.addEventListener('keypress', function(event) {
            // Если нажата клавиша Enter (код 13)
            if (event.keyCode === 13 || event.key === 'Enter') {
                event.preventDefault(); // Предотвращаем стандартное поведение
                
                // Вызываем клик по кнопке расчета
                if (calculateArbitraryPriceBtn) {
                    calculateArbitraryPriceBtn.click();
                }
            }
        });
    }
    
    // ===== 7. ПРОВЕРКА ВАЛИДНОСТИ ВВОДА В РЕАЛЬНОМ ВРЕМЕНИ =====
    if (arbitraryCopiesInput) {
        arbitraryCopiesInput.addEventListener('input', function() {
            const value = this.value.trim();
            
            // Если поле пустое, ничего не делаем
            if (!value) return;
            
            // Проверяем, что вводятся только цифры
            const numericValue = value.replace(/[^\d]/g, '');
            
            // Если значение изменилось (были нечисловые символы), обновляем поле
            if (numericValue !== value) {
                this.value = numericValue;
            }
            
            // Проверяем минимальное значение
            if (numericValue && parseInt(numericValue) < 1) {
                this.value = '1';
            }
        });
    }
    
    // ===== 8. АВТОМАТИЧЕСКИЙ РАСЧЕТ ПРИ ИЗМЕНЕНИИ ТИРАЖА (ОПЦИОНАЛЬНО) =====
    // Раскомментируйте, если хотите автоматический расчет при изменении значения
    /*
    if (arbitraryCopiesInput) {
        let calculationTimeout;
        
        arbitraryCopiesInput.addEventListener('input', function() {
            const value = this.value.trim();
            
            // Очищаем предыдущий таймаут
            if (calculationTimeout) {
                clearTimeout(calculationTimeout);
            }
            
            // Если поле не пустое и содержит число больше 0
            if (value && parseInt(value) > 0) {
                // Устанавливаем задержку 1 секунду перед расчетом
                calculationTimeout = setTimeout(() => {
                    if (calculateArbitraryPriceBtn) {
                        calculateArbitraryPriceBtn.click();
                    }
                }, 1000);
            }
        });
    }
    */
    
    // ===== 9. ИНИЦИАЛИЗАЦИЯ =====
    console.log('Модуль расчета произвольного тиража инициализирован');
    
    // Добавляем глобальные функции для отладки
    window.debugArbitraryCalc = function() {
        console.log('=== DEBUG ARBITRARY CALC ===');
        console.log('interpolationMethodSelect:', interpolationMethodSelect ? interpolationMethodSelect.value : 'не найден');
        console.log('arbitraryCopiesInput:', arbitraryCopiesInput ? arbitraryCopiesInput.value : 'не найден');
        console.log('calculateArbitraryPriceBtn:', calculateArbitraryPriceBtn ? 'найден' : 'не найден');
        console.log('arbitraryResultSection:', arbitraryResultSection ? 'найден' : 'не найден');
        console.log('============================');
    };
});