/* work_price.js - Управление опорными точками цен для дополнительных работ
 * 
 * Этот файл отвечает за:
 * - отображение/скрытие формы добавления новой цены,
 * - отправку AJAX-запроса при сохранении,
 * - удаление опорной точки,
 * - отображение ошибок валидации,
 * - расчёт цены для произвольного количества листов (интерполяция).
 * 
 * Все функции и переменные находятся в объекте WorkPrice, чтобы не засорять глобальную область.
 * После загрузки DOM вызывается WorkPrice.init().
 * 
 * ИСПРАВЛЕНИЕ: добавлена запись в localStorage при успешном создании/удалении цены,
 * чтобы уведомить другие вкладки (калькулятор) об изменении.
 */

(function() {
    // ===== ПРИВАТНЫЕ ПЕРЕМЕННЫЕ =====
    // Флаг, показывающий, видима ли форма добавления
    let isFormVisible = false;

    // ===== ИНИЦИАЛИЗАЦИЯ =====
    function init() {
        console.log('WorkPrice: инициализация...');

        // Находим кнопку "Добавить цену"
        const addBtn = document.getElementById('add-price-point-btn');
        if (addBtn) {
            addBtn.addEventListener('click', toggleForm);
        }

        // Находим форму добавления цены
        const form = document.getElementById('price-point-form');
        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        // Делегирование событий для кнопок удаления (они могут быть динамически добавлены)
        document.addEventListener('click', function(e) {
            const deleteBtn = e.target.closest('.btn-delete-price');
            if (deleteBtn) {
                handleDelete(deleteBtn);
            }
        });

        // Обработчик для кнопки "Рассчитать" произвольное количество листов
        document.addEventListener('click', function(e) {
            const calcBtn = e.target.closest('#calculate-arbitrary-btn');
            if (calcBtn) {
                e.preventDefault();
                calculateArbitrary();
            }
        });
    }

    // ===== ПЕРЕКЛЮЧЕНИЕ ВИДИМОСТИ ФОРМЫ =====
    function toggleForm() {
        const formSection = document.getElementById('price-point-form-section');
        const addBtn = document.getElementById('add-price-point-btn');

        if (!formSection || !addBtn) return;

        isFormVisible = !isFormVisible;

        if (isFormVisible) {
            formSection.style.display = 'block';
            addBtn.innerHTML = '− Скрыть форму';
            addBtn.classList.add('btn-cancel');
            formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const sheetsInput = document.getElementById('price-point-sheets');
            if (sheetsInput) sheetsInput.focus();
        } else {
            formSection.style.display = 'none';
            addBtn.innerHTML = '+ Добавить цену';
            addBtn.classList.remove('btn-cancel');
            clearForm();
        }
    }

    // ===== ОЧИСТКА ФОРМЫ =====
    function clearForm() {
        const form = document.getElementById('price-point-form');
        if (!form) return;

        form.reset();
        form.querySelectorAll('.error-message').forEach(el => el.remove());
        form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
    }

    // ===== ОБРАБОТКА ОТПРАВКИ ФОРМЫ (AJAX) =====
    function handleFormSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const formData = new FormData(form);

        // Замена запятой на точку в цене
        let priceValue = formData.get('price');
        if (priceValue && priceValue.includes(',')) {
            formData.set('price', priceValue.replace(',', '.'));
        }

        const submitBtn = form.querySelector('.btn-submit');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
        submitBtn.disabled = true;

        fetch(form.action, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Цена успешно добавлена!', 'success');
                // ===== ДОБАВЛЕНО: запись в localStorage для уведомления других вкладок =====
                localStorage.setItem('work_price_last_update', Date.now().toString());
                console.log('💾 В localStorage записан work_price_last_update');
                // ===== КОНЕЦ ДОБАВЛЕНИЯ =====
                if (isFormVisible) toggleForm();
                // Перезагружаем страницу, чтобы увидеть новую цену в таблице
                location.reload();
            } else {
                showNotification('Ошибка при добавлении цены', 'error');
                displayFormErrors(form, data.errors);
            }
        })
        .catch(error => {
            console.error('Ошибка AJAX:', error);
            showNotification('Ошибка соединения с сервером', 'error');
        })
        .finally(() => {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        });
    }

    // ===== ОТОБРАЖЕНИЕ ОШИБОК ВАЛИДАЦИИ =====
    function displayFormErrors(form, errors) {
        form.querySelectorAll('.error-message').forEach(el => el.remove());
        form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));

        for (const field in errors) {
            const input = form.querySelector(`[name="${field}"]`);
            if (input) {
                input.classList.add('error');
                const errorDiv = document.createElement('div');
                errorDiv.className = 'error-message';
                errorDiv.style.color = '#dc3545';
                errorDiv.style.fontSize = '0.85rem';
                errorDiv.style.marginTop = '0.25rem';
                errorDiv.innerHTML = errors[field].join('<br>');
                input.parentNode.appendChild(errorDiv);
            }
        }
    }

    // ===== ОБРАБОТКА УДАЛЕНИЯ ОПОРНОЙ ТОЧКИ =====
    function handleDelete(btn) {
        const priceId = btn.getAttribute('data-price-id');
        const sheets = btn.getAttribute('data-price-sheets');

        if (!confirm(`Удалить цену для ${sheets} листов?`)) return;

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        fetch(`/spravochnik_dopolnitelnyh_rabot/work_price/delete/${priceId}/`, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCookie('csrftoken')
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Цена удалена', 'success');
                // ===== ДОБАВЛЕНО: запись в localStorage при удалении =====
                localStorage.setItem('work_price_last_update', Date.now().toString());
                console.log('💾 В localStorage записан work_price_last_update (удаление)');
                // ===== КОНЕЦ ДОБАВЛЕНИЯ =====
                const row = btn.closest('.table-row');
                if (row) row.remove();

                const tableBody = document.querySelector('.price-points-table .table-body');
                if (tableBody && tableBody.children.length === 0) {
                    location.reload();
                }
            } else {
                showNotification('Ошибка при удалении', 'error');
            }
        })
        .catch(error => {
            console.error(error);
            showNotification('Ошибка соединения', 'error');
        })
        .finally(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
    }

    // ===== РАСЧЁТ ЦЕНЫ ДЛЯ ПРОИЗВОЛЬНОГО КОЛИЧЕСТВА ЛИСТОВ =====
    function calculateArbitrary() {
        // Получаем ID текущей работы из URL
        const urlParams = new URLSearchParams(window.location.search);
        const workId = urlParams.get('work_id');
        if (!workId) {
            showNotification('Сначала выберите работу', 'error');
            return;
        }

        // Получаем количество листов из поля ввода
        const sheetsInput = document.getElementById('arbitrary-sheets');
        if (!sheetsInput) {
            showNotification('Поле ввода количества листов не найдено', 'error');
            return;
        }
        const sheets = sheetsInput.value.trim();
        if (!sheets || parseInt(sheets) < 1) {
            showNotification('Введите корректное количество листов (≥ 1)', 'error');
            return;
        }

        // Показываем индикатор загрузки в блоке результата
        const resultDiv = document.getElementById('arbitrary-result');
        if (resultDiv) {
            resultDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Расчёт...';
        }

        // Отправляем GET-запрос на сервер
        fetch(`/spravochnik_dopolnitelnyh_rabot/api/calculate_arbitrary_sheets_price/${workId}/?arbitrary_sheets=${encodeURIComponent(sheets)}`, {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Отображаем результат
                if (resultDiv) {
                    resultDiv.innerHTML = `
                        <span style="color: #28a745;">
                            ${data.calculated_price_display}
                        </span>
                    `;
                }
                showNotification(data.message, 'success');
            } else {
                if (resultDiv) {
                    resultDiv.innerHTML = `<span style="color: #dc3545;">Ошибка</span>`;
                }
                showNotification(data.error || 'Ошибка расчёта', 'error');
            }
        })
        .catch(error => {
            console.error('Ошибка при расчёте:', error);
            if (resultDiv) {
                resultDiv.innerHTML = `<span style="color: #dc3545;">Ошибка сети</span>`;
            }
            showNotification('Ошибка соединения с сервером', 'error');
        });
    }

    // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
    function getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            document.cookie.split(';').forEach(c => {
                const cookie = c.trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                }
            });
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

    // ===== ЭКСПОРТ ПУБЛИЧНЫХ МЕТОДОВ =====
    window.WorkPrice = {
        init: init,
        clearForm: clearForm,
        toggleForm: toggleForm,
        calculateArbitrary: calculateArbitrary
    };

    // Запускаем инициализацию после полной загрузки DOM
    document.addEventListener('DOMContentLoaded', init);
})();