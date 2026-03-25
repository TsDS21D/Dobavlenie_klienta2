/*
print_price_arbitrary.js - JavaScript для расчета цены для произвольного тиража (себестоимость + наценка)
*/

document.addEventListener('DOMContentLoaded', function() {
    console.log('print_price_arbitrary.js загружен');

    const interpolationMethodSelect = document.getElementById('interpolation-method');
    const arbitraryCopiesInput = document.getElementById('arbitrary-copies');
    const calculateBtn = document.getElementById('calculate-arbitrary-price');
    const resultSection = document.getElementById('arbitrary-result');
    const resultInterpolationMethod = document.getElementById('result-interpolation-method');
    const resultCopies = document.getElementById('result-copies');
    const resultCost = document.getElementById('result-cost');
    const resultMarkup = document.getElementById('result-markup');
    const resultPricePerSheet = document.getElementById('result-price-per-sheet');

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

    // Обработка изменения метода интерполяции
    if (interpolationMethodSelect) {
        interpolationMethodSelect.addEventListener('change', function() {
            const printerId = this.getAttribute('data-printer-id');
            const newMethod = this.value;
            if (!printerId) {
                showNotification('Ошибка: не найден ID принтера', 'error');
                return;
            }
            const formData = new FormData();
            formData.append('interpolation_method', newMethod);
            formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));
            fetch(`/print_price/api/update_interpolation_method/${printerId}/`, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (resultInterpolationMethod) resultInterpolationMethod.textContent = data.new_method_display;
                    showNotification(`Метод интерполяции изменен на "${data.new_method_display}"`, 'success');
                } else {
                    // Восстанавливаем старое значение
                    const prevMethod = this.getAttribute('data-previous-value') || 'linear';
                    this.value = prevMethod;
                    showNotification(`Ошибка: ${data.error || 'неизвестная ошибка'}`, 'error');
                }
            })
            .catch(error => {
                console.error(error);
                showNotification('Ошибка при сохранении метода интерполяции', 'error');
            });
        });
        interpolationMethodSelect.setAttribute('data-previous-value', interpolationMethodSelect.value);
    }

    // Обработка расчета
    if (calculateBtn && arbitraryCopiesInput) {
        calculateBtn.addEventListener('click', function() {
            const printerId = interpolationMethodSelect ? interpolationMethodSelect.getAttribute('data-printer-id') : null;
            if (!printerId) {
                showNotification('Ошибка: не найден ID принтера. Выберите принтер слева.', 'error');
                return;
            }
            const arbitraryCopies = arbitraryCopiesInput.value.trim();
            if (!arbitraryCopies) {
                showNotification('Введите тираж для расчета', 'warning');
                arbitraryCopiesInput.focus();
                return;
            }
            const copiesNumber = parseInt(arbitraryCopies);
            if (isNaN(copiesNumber) || copiesNumber < 1) {
                showNotification('Тираж должен быть положительным числом', 'error');
                arbitraryCopiesInput.focus();
                return;
            }

            const originalText = this.textContent;
            this.textContent = 'Расчет...';
            this.disabled = true;

            const formData = new FormData();
            formData.append('arbitrary_copies', arbitraryCopies);
            formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));

            fetch(`/print_price/api/calculate_arbitrary_price/${printerId}/`, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (resultInterpolationMethod) resultInterpolationMethod.textContent = data.interpolation_method_display;
                    if (resultCopies) resultCopies.textContent = `${data.arbitrary_copies} шт.`;
                    if (resultCost) resultCost.textContent = data.cost_display;
                    if (resultMarkup) resultMarkup.textContent = data.markup_percent_display;
                    if (resultPricePerSheet) resultPricePerSheet.textContent = data.calculated_price_display;
                    if (resultSection) resultSection.style.display = 'block';
                    showNotification(data.message, 'success');
                } else {
                    if (resultSection) resultSection.style.display = 'none';
                    showNotification(`Ошибка: ${data.error || 'неизвестная ошибка'}`, 'error');
                }
            })
            .catch(error => {
                console.error(error);
                showNotification('Ошибка при расчете. Проверьте подключение.', 'error');
                if (resultSection) resultSection.style.display = 'none';
            })
            .finally(() => {
                this.textContent = originalText;
                this.disabled = false;
            });
        });

        arbitraryCopiesInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                calculateBtn.click();
            }
        });

        arbitraryCopiesInput.addEventListener('input', function() {
            const value = this.value.trim();
            const numericValue = value.replace(/[^\d]/g, '');
            if (numericValue !== value) this.value = numericValue;
            if (numericValue && parseInt(numericValue) < 1) this.value = '1';
        });
    }

    console.log('Модуль расчета произвольного тиража инициализирован');
});