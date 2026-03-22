/* work_price.js - Управление опорными точками цен для дополнительных работ
 * 
 * Этот файл отвечает за:
 * - отображение/скрытие формы добавления новой цены,
 * - отправку AJAX-запроса при сохранении,
 * - удаление опорной точки,
 * - отображение ошибок валидации,
 * - расчёт цены для произвольного количества листов.
 */

(function() {
    let isFormVisible = false;

    function init() {
        console.log('WorkPrice: инициализация...');

        const addBtn = document.getElementById('add-price-point-btn');
        if (addBtn) addBtn.addEventListener('click', toggleForm);

        const form = document.getElementById('price-point-form');
        if (form) form.addEventListener('submit', handleFormSubmit);

        document.addEventListener('click', function(e) {
            const deleteBtn = e.target.closest('.btn-delete-price');
            if (deleteBtn) handleDelete(deleteBtn);
        });
    }

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

    function clearForm() {
        const form = document.getElementById('price-point-form');
        if (!form) return;
        form.reset();
        form.querySelectorAll('.error-message').forEach(el => el.remove());
        form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
    }

    function handleFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);

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
                localStorage.setItem('work_price_last_update', Date.now().toString());
                console.log('💾 В localStorage записан work_price_last_update');
                if (isFormVisible) toggleForm();
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
                localStorage.setItem('work_price_last_update', Date.now().toString());
                console.log('💾 В localStorage записан work_price_last_update (удаление)');
                const row = btn.closest('.table-row');
                if (row) row.remove();

                const tableBody = document.querySelector('.price-points-table .table-body');
                if (tableBody && tableBody.children.length === 0) {
                    location.reload();
                }
                // ===== ДОБАВЛЕНО: обновляем себестоимость текущей работы =====
                if (window.SpravochnikDopRabot && window.SpravochnikDopRabot.updateCalculatedCost) {
                    window.SpravochnikDopRabot.updateCalculatedCost();
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

    window.WorkPrice = {
        init: init,
        clearForm: clearForm,
        toggleForm: toggleForm
    };

    document.addEventListener('DOMContentLoaded', init);
})();