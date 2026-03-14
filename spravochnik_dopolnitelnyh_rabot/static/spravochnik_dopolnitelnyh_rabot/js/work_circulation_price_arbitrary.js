/* work_circulation_price_arbitrary.js - расчёт цены для произвольного тиража
 *
 * Этот скрипт обрабатывает нажатие на кнопку "Рассчитать" в блоке
 * расчёта для произвольного тиража.
 * Отправляет GET-запрос на сервер и отображает результат.
 */

(function() {
    /**
     * Инициализация после загрузки DOM.
     */
    function init() {
        const calcBtn = document.getElementById('calculate-arbitrary-circulation-price');
        if (!calcBtn) return;

        const circulationInput = document.getElementById('arbitrary-circulation');
        const resultDiv = document.getElementById('arbitrary-circulation-result');
        const methodSelect = document.getElementById('interpolation-method-circulation');

        calcBtn.addEventListener('click', function() {
            const workId = methodSelect.getAttribute('data-work-id');
            const circulation = circulationInput.value.trim();

            if (!circulation) {
                showNotification('Введите тираж', 'warning');
                return;
            }
            if (parseInt(circulation) < 1) {
                showNotification('Тираж должен быть ≥ 1', 'error');
                return;
            }

            calcBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Расчёт...';
            calcBtn.disabled = true;

            // Отправляем GET-запрос
            fetch(`/spravochnik_dopolnitelnyh_rabot/api/calculate_arbitrary_circulation_price/${workId}/?arbitrary_circulation=${encodeURIComponent(circulation)}`, {
                method: 'GET',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('result-circulation-method').textContent = data.interpolation_method_display;
                    document.getElementById('result-circulation-value').textContent = data.arbitrary_circulation + ' экз.';
                    document.getElementById('result-circulation-price').textContent = data.calculated_price_display;
                    resultDiv.style.display = 'block';
                } else {
                    showNotification(data.error || 'Ошибка расчёта', 'error');
                    resultDiv.style.display = 'none';
                }
            })
            .catch(() => showNotification('Ошибка соединения', 'error'))
            .finally(() => {
                calcBtn.innerHTML = '<i class="fas fa-calculator"></i> Рассчитать';
                calcBtn.disabled = false;
            });
        });

        // Нажатие Enter в поле ввода запускает расчёт
        circulationInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                calcBtn.click();
            }
        });
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