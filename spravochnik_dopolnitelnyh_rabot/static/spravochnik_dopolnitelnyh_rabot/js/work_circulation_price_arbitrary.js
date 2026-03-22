/* work_circulation_price_arbitrary.js - расчёт цены для произвольного тиража
 *
 * Этот скрипт обрабатывает нажатие на кнопку "Рассчитать" в блоке
 * расчёта для произвольного тиража.
 * Отправляет GET-запрос на сервер и отображает результат.
 */

(function() {
    function init() {
        const calcBtn = document.getElementById('calculate-arbitrary-circulation-price');
        if (!calcBtn) {
            console.log('Кнопка #calculate-arbitrary-circulation-price не найдена');
            return;
        }

        const circulationInput = document.getElementById('arbitrary-circulation');
        const resultDiv = document.getElementById('arbitrary-circulation-result');
        const methodSelect = document.getElementById('interpolation-method-circulation');

        if (!circulationInput) console.warn('Поле #arbitrary-circulation не найдено');
        if (!resultDiv) console.warn('Блок #arbitrary-circulation-result не найден');

        calcBtn.addEventListener('click', function() {
            const workId = methodSelect?.getAttribute('data-work-id');
            const circulation = circulationInput?.value.trim();

            console.log(`🔄 Расчёт для тиража ${circulation}, workId=${workId}`);

            if (!circulation) {
                showNotification('Введите тираж', 'warning');
                return;
            }
            const circNum = parseInt(circulation, 10);
            if (isNaN(circNum) || circNum < 1) {
                showNotification('Тираж должен быть целым числом ≥ 1', 'error');
                return;
            }

            calcBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Расчёт...';
            calcBtn.disabled = true;

            const url = `/spravochnik_dopolnitelnyh_rabot/api/calculate_arbitrary_circulation_price/${workId}/?arbitrary_circulation=${encodeURIComponent(circulation)}`;
            console.log(`📡 Запрос к ${url}`);

            fetch(url, {
                method: 'GET',
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                console.log('📥 Ответ сервера:', data);
                if (data.success) {
                    const methodSpan = document.getElementById('result-circulation-method');
                    const valueSpan = document.getElementById('result-circulation-value');
                    const priceSpan = document.getElementById('result-circulation-price');

                    if (methodSpan) methodSpan.textContent = data.interpolation_method_display;
                    if (valueSpan) valueSpan.textContent = data.arbitrary_circulation + ' экз.';
                    if (priceSpan) {
                        // Используем final_price_display – итоговая цена с наценкой
                        priceSpan.textContent = data.final_price_display;
                        console.log(`✅ Цена отображена: ${data.final_price_display}`);
                    } else {
                        console.warn('⚠️ Элемент #result-circulation-price не найден');
                    }
                    if (resultDiv) resultDiv.style.display = 'block';
                } else {
                    showNotification(data.error || 'Ошибка расчёта', 'error');
                    if (resultDiv) resultDiv.style.display = 'none';
                }
            })
            .catch(error => {
                console.error('❌ Ошибка:', error);
                showNotification('Ошибка соединения', 'error');
                if (resultDiv) resultDiv.style.display = 'none';
            })
            .finally(() => {
                calcBtn.innerHTML = '<i class="fas fa-calculator"></i> Рассчитать';
                calcBtn.disabled = false;
            });
        });

        circulationInput?.addEventListener('keypress', function(e) {
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