/* work_price_arbitrary.js - расчёт цены для произвольного количества листов
 *
 * Этот скрипт обрабатывает нажатие на кнопку "Рассчитать" в блоке
 * расчёта для произвольного количества листов.
 * Отправляет POST-запрос на сервер с CSRF-токеном и отображает результат.
 */

(function() {
    function init() {
        const calcBtn = document.getElementById('calculate-arbitrary-price');
        if (!calcBtn) return;

        const methodSelect = document.getElementById('interpolation-method-work');
        const sheetsInput = document.getElementById('arbitrary-sheets');
        const resultDiv = document.getElementById('arbitrary-result');

        calcBtn.addEventListener('click', function() {
            const workId = methodSelect.getAttribute('data-work-id');
            const sheets = sheetsInput.value.trim();

            if (!sheets) {
                showNotification('Введите количество листов', 'warning');
                return;
            }
            if (parseInt(sheets) < 1) {
                showNotification('Количество листов должно быть ≥ 1', 'error');
                return;
            }

            calcBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Расчёт...';
            calcBtn.disabled = true;

            const formData = new FormData();
            formData.append('arbitrary_sheets', sheets);
            formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));

            fetch(`/spravochnik_dopolnitelnyh_rabot/api/calculate_arbitrary_price/${workId}/`, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('result-method').textContent = data.interpolation_method_display;
                    document.getElementById('result-sheets').textContent = data.arbitrary_sheets + ' лист.';
                    // ИСПРАВЛЕНО: используем final_price_display вместо calculated_price_display
                    document.getElementById('result-price').textContent = data.final_price_display;
                    resultDiv.style.display = 'block';
                } else {
                    showNotification(data.error || 'Ошибка расчёта', 'error');
                }
            })
            .catch(() => showNotification('Ошибка соединения', 'error'))
            .finally(() => {
                calcBtn.innerHTML = '<i class="fas fa-calculator"></i> Рассчитать';
                calcBtn.disabled = false;
            });
        });

        sheetsInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                calcBtn.click();
            }
        });
    }

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

    function showNotification(message, type) {
        if (window.SpravochnikDopRabot && typeof window.SpravochnikDopRabot.showNotification === 'function') {
            window.SpravochnikDopRabot.showNotification(message, type);
        } else {
            alert(message);
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();