/* work_price_arbitrary.js - расчёт цены для произвольного количества листов
 * 
 * Этот скрипт обрабатывает нажатие на кнопку "Рассчитать" в блоке
 * расчёта для произвольного количества листов.
 * Отправляет POST-запрос на сервер с CSRF-токеном и отображает результат.
 * 
 * ИСПРАВЛЕНО: корректное получение CSRF-токена из cookie.
 */

(function() {
    /**
     * Инициализация скрипта после загрузки DOM.
     */
    function init() {
        // Находим кнопку расчёта по её ID
        const calcBtn = document.getElementById('calculate-arbitrary-price');
        if (!calcBtn) return; // если кнопки нет, выходим (например, не та страница)

        // Находим элементы интерфейса
        const methodSelect = document.getElementById('interpolation-method-work'); // скрытое поле или select с методом
        const sheetsInput = document.getElementById('arbitrary-sheets'); // поле ввода количества листов
        const resultDiv = document.getElementById('arbitrary-result'); // блок для отображения результата

        // Вешаем обработчик клика на кнопку
        calcBtn.addEventListener('click', function() {
            // Получаем ID работы из data-атрибута элемента (если он есть)
            const workId = methodSelect.getAttribute('data-work-id');
            // Получаем введённое количество листов
            const sheets = sheetsInput.value.trim();

            // Проверка: введено ли количество листов
            if (!sheets) {
                showNotification('Введите количество листов', 'warning');
                return;
            }
            // Проверка: количество листов должно быть положительным целым числом
            if (parseInt(sheets) < 1) {
                showNotification('Количество листов должно быть ≥ 1', 'error');
                return;
            }

            // Блокируем кнопку и показываем спиннер
            calcBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Расчёт...';
            calcBtn.disabled = true;

            // Формируем данные для отправки
            const formData = new FormData();
            formData.append('arbitrary_sheets', sheets);
            // Добавляем CSRF-токен – он обязателен для POST-запросов в Django
            formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));

            // Отправляем POST-запрос на сервер
            fetch(`/spravochnik_dopolnitelnyh_rabot/api/calculate_arbitrary_price/${workId}/`, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' } // помечаем как AJAX
            })
            .then(response => response.json()) // парсим JSON-ответ
            .then(data => {
                if (data.success) {
                    // Обновляем содержимое блока результата
                    document.getElementById('result-method').textContent = data.interpolation_method_display;
                    document.getElementById('result-sheets').textContent = data.arbitrary_sheets + ' лист.';
                    document.getElementById('result-price').textContent = data.calculated_price_display;
                    resultDiv.style.display = 'block'; // показываем блок результата
                } else {
                    // Если сервер вернул ошибку, показываем уведомление
                    showNotification(data.error || 'Ошибка расчёта', 'error');
                }
            })
            .catch(() => showNotification('Ошибка соединения', 'error')) // ошибка сети
            .finally(() => {
                // В любом случае разблокируем кнопку и восстанавливаем её текст
                calcBtn.innerHTML = '<i class="fas fa-calculator"></i> Рассчитать';
                calcBtn.disabled = false;
            });
        });

        // Добавляем возможность нажать Enter в поле ввода для запуска расчёта
        sheetsInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault(); // предотвращаем возможную отправку формы
                calcBtn.click(); // программно кликаем по кнопке
            }
        });
    }

    /**
     * Функция получения CSRF-токена из cookie.
     * Django устанавливает cookie csrftoken при первом GET-запросе.
     * @param {string} name - имя cookie (обычно 'csrftoken')
     * @returns {string} значение токена или null, если не найдено
     */
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                // Ищем cookie с нужным именем
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    /**
     * Функция отображения уведомлений.
     * Использует глобальный объект SpravochnikDopRabot, если он доступен,
     * иначе показывает alert.
     * @param {string} message - текст уведомления
     * @param {string} type - тип ('success', 'error', 'warning', 'info')
     */
    function showNotification(message, type) {
        if (window.SpravochnikDopRabot && typeof window.SpravochnikDopRabot.showNotification === 'function') {
            window.SpravochnikDopRabot.showNotification(message, type);
        } else {
            alert(message); // запасной вариант
        }
    }

    // Запускаем инициализацию после полной загрузки DOM
    document.addEventListener('DOMContentLoaded', init);
})();