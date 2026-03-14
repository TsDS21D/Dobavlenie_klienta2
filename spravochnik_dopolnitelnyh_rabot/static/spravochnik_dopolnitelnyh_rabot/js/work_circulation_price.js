/* work_circulation_price.js - Управление опорными точками цен по тиражу
 *
 * Этот файл отвечает за:
 * - отображение/скрытие формы добавления новой цены по тиражу,
 * - отправку AJAX-запроса при сохранении,
 * - удаление опорной точки,
 * - отображение ошибок валидации.
 */

(function() {
    let isFormVisible = false;  // флаг видимости формы добавления

    /**
     * Инициализация при загрузке DOM.
     */
    function init() {
        console.log('WorkCirculationPrice: инициализация...');

        // Находим кнопку "Добавить цену по тиражу"
        const addBtn = document.getElementById('add-circulation-price-btn');
        if (addBtn) addBtn.addEventListener('click', toggleForm);

        // Находим форму добавления
        const form = document.getElementById('circulation-price-form');
        if (form) form.addEventListener('submit', handleFormSubmit);

        // Делегирование событий для кнопок удаления (они могут быть динамически добавлены)
        document.addEventListener('click', function(e) {
            const deleteBtn = e.target.closest('.btn-delete-circulation-price');
            if (deleteBtn) handleDelete(deleteBtn);
        });
    }

    /**
     * Переключение видимости формы добавления.
     */
    function toggleForm() {
        const formSection = document.getElementById('circulation-price-form-section');
        const addBtn = document.getElementById('add-circulation-price-btn');
        if (!formSection || !addBtn) return;

        isFormVisible = !isFormVisible;
        if (isFormVisible) {
            formSection.style.display = 'block';
            addBtn.innerHTML = '− Скрыть форму';
            addBtn.classList.add('btn-cancel');
            // Плавная прокрутка к форме
            formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Устанавливаем фокус на поле ввода тиража
            document.getElementById('work-circulation-price-circulation').focus();
        } else {
            formSection.style.display = 'none';
            addBtn.innerHTML = '+ Добавить цену по тиражу';
            addBtn.classList.remove('btn-cancel');
            clearForm();
        }
    }

    /**
     * Очистка формы от введённых данных и ошибок.
     */
    function clearForm() {
        const form = document.getElementById('circulation-price-form');
        if (!form) return;
        form.reset();
        form.querySelectorAll('.error-message').forEach(el => el.remove());
        form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
    }

    /**
     * Обработка отправки формы через AJAX.
     * @param {Event} e - событие submit
     */
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
                showNotification('Цена по тиражу добавлена!', 'success');
                // Записываем метку времени в localStorage для синхронизации между вкладками
                localStorage.setItem('work_price_last_update', Date.now().toString());
                if (isFormVisible) toggleForm();
                // Перезагружаем страницу для отображения новой цены (можно обновить таблицу динамически, но для простоты reload)
                location.reload();
            } else {
                showNotification('Ошибка при добавлении', 'error');
                displayFormErrors(form, data.errors);
            }
        })
        .catch(error => {
            console.error('Ошибка AJAX:', error);
            showNotification('Ошибка соединения', 'error');
        })
        .finally(() => {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        });
    }

    /**
     * Отображение ошибок валидации под соответствующими полями.
     * @param {HTMLFormElement} form - форма
     * @param {Object} errors - словарь ошибок
     */
    function displayFormErrors(form, errors) {
        // Удаляем старые сообщения об ошибках
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

    /**
     * Обработка удаления опорной точки.
     * @param {HTMLElement} btn - кнопка удаления
     */
    function handleDelete(btn) {
        const priceId = btn.getAttribute('data-price-id');
        const circulation = btn.getAttribute('data-price-circulation');
        if (!confirm(`Удалить цену для тиража ${circulation}?`)) return;

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        fetch(`/spravochnik_dopolnitelnyh_rabot/circulation_price/delete/${priceId}/`, {
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
                localStorage.setItem('work_price_last_update', Date.now().toString()); // синхронизация
                const row = btn.closest('.table-row');
                if (row) row.remove(); // удаляем строку из таблицы
                // Если таблица стала пустой, можно перезагрузить страницу или показать сообщение
                const tableBody = document.querySelector('.price-points-container .table-body');
                if (tableBody && tableBody.children.length === 0) {
                    location.reload(); // для простоты перезагружаем
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

    /**
     * Получение CSRF-токена из cookie.
     * @returns {string} токен
     */
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

    /**
     * Показ уведомления (использует глобальный объект SpravochnikDopRabot, если доступен).
     * @param {string} message - текст
     * @param {string} type - тип ('success', 'error', 'warning', 'info')
     */
    function showNotification(message, type) {
        if (window.SpravochnikDopRabot && typeof window.SpravochnikDopRabot.showNotification === 'function') {
            window.SpravochnikDopRabot.showNotification(message, type);
        } else {
            alert(message);
        }
    }

    // Экспортируем публичные методы
    window.WorkCirculationPrice = {
        init: init,
        clearForm: clearForm,
        toggleForm: toggleForm
    };

    document.addEventListener('DOMContentLoaded', init);
})();