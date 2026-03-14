/* work_circulation_price_inline_edit.js - Inline-редактирование опорных точек цен по тиражу
 *
 * Позволяет редактировать поля "circulation" (тираж) и "price" (цена)
 * прямо в таблице двойным кликом. При нажатии Enter сохраняет, Esc отменяет.
 * Также реализована межвкладочная синхронизация через localStorage.
 */

(function() {
    // Переменные состояния
    let currentlyEditing = null;
    let ignoreBlurTimeout = null;
    let isProcessingDoubleClick = false;
    let isFinishing = false;

    /**
     * Инициализация после загрузки DOM.
     */
    function init() {
        console.log('WorkCirculationPrice inline-edit: инициализация...');

        // Контейнер, в котором находятся таблица и поля (правая колонка)
        const container = document.querySelector('.right-column');
        if (!container) return;

        // Обработчик двойного клика – начинаем редактирование
        container.addEventListener('dblclick', function(e) {
            // Ищем элемент с классом editable-field-circulation-price (это span, по которому можно кликнуть)
            const field = e.target.closest('.editable-field-circulation-price');
            if (field) {
                startEdit(field);
            }
        });

        // Глобальная клавиша Escape для отмены редактирования из любого места
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && currentlyEditing) {
                cancelEdit();
            }
        });

        // Слушаем изменения в localStorage для синхронизации между вкладками
        window.addEventListener('storage', function(e) {
            if (e.key === 'work_price_last_update') {
                console.log('Обнаружено изменение в другой вкладке, обновляем данные');
                if (window.SpravochnikDopRabot && typeof window.SpravochnikDopRabot.reloadCurrentWorkFromServer === 'function') {
                    window.SpravochnikDopRabot.reloadCurrentWorkFromServer();
                } else {
                    location.reload();
                }
            }
        });
    }

    /**
     * Начало редактирования.
     * @param {HTMLElement} field - элемент span, по которому дважды кликнули
     */
    function startEdit(field) {
        // Если уже есть активное редактирование, завершаем его (сохраняем)
        if (currentlyEditing) {
            finishEdit();
        }

        // Получаем данные из data-атрибутов поля
        const priceId = field.getAttribute('data-price-id');
        const fieldType = field.getAttribute('data-field'); // 'circulation' или 'price'
        const originalValue = field.getAttribute('data-original-value') || field.textContent.trim();

        if (!priceId || !fieldType) return;

        // Находим соответствующий скрытый input в этой же строке
        const row = field.closest('.table-row');
        if (!row) return;

        let inputField;
        if (fieldType === 'circulation') {
            inputField = row.querySelector('.circulation-input');
        } else if (fieldType === 'price') {
            inputField = row.querySelector('.price-input');
        }

        if (!inputField) return;

        // Добавляем обработчики событий на input, если они ещё не добавлены
        if (!inputField.hasAttribute('data-initialized')) {
            inputField.addEventListener('blur', handleInputBlur);
            inputField.addEventListener('keydown', handleInputKeyPress);
            inputField.setAttribute('data-initialized', 'true');
        }

        // Сохраняем состояние
        currentlyEditing = {
            field: field,
            input: inputField,
            row: row,
            priceId: priceId,
            fieldType: fieldType,
            originalValue: originalValue
        };

        // Скрываем span
        field.style.display = 'none';
        // Показываем input
        inputField.style.display = 'inline-block';
        // Устанавливаем значение в input (с учётом особенностей)
        if (fieldType === 'price') {
            // Для цены заменяем возможную запятую на точку для корректного отображения в input type="number"
            inputField.value = originalValue.replace(',', '.');
        } else {
            inputField.value = originalValue;
        }

        // Ставим фокус и выделяем текст
        setTimeout(() => {
            if (inputField.style.display === 'inline-block') {
                inputField.focus();
                inputField.select();
            }
        }, 10);
    }

    /**
     * Обработчик потери фокуса для input.
     * @param {Event} e - событие blur
     */
    function handleInputBlur(e) {
        if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);

        if (isProcessingDoubleClick) {
            ignoreBlurTimeout = setTimeout(() => finishEdit(e), 100);
        } else {
            finishEdit(e);
        }
    }

    /**
     * Обработчик нажатия клавиш в input.
     * @param {KeyboardEvent} e
     */
    function handleInputKeyPress(e) {
        if (!currentlyEditing) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            finishEdit(); // Enter сохраняет
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit(); // Escape отменяет
        }
    }

    /**
     * Завершение редактирования (сохранение).
     */
    function finishEdit(e) {
        if (!currentlyEditing || isFinishing) return;
        isFinishing = true;

        const { field, input, priceId, fieldType, originalValue } = currentlyEditing;
        let newValue = input.value.trim();

        // Валидация на клиенте перед отправкой
        if (fieldType === 'circulation') {
            const num = parseInt(newValue, 10);
            if (isNaN(num) || num < 1) {
                showNotification('Тираж должен быть целым числом ≥ 1', 'error');
                input.value = originalValue;
                cancelEdit();
                isFinishing = false;
                return;
            }
            newValue = num;
        } else if (fieldType === 'price') {
            newValue = newValue.replace(',', '.');
            const num = parseFloat(newValue);
            if (isNaN(num) || num < 0) {
                showNotification('Цена должна быть числом ≥ 0', 'error');
                input.value = originalValue.replace(',', '.');
                cancelEdit();
                isFinishing = false;
                return;
            }
        }

        // Если значение не изменилось – просто отменяем редактирование
        if (newValue == originalValue) {
            cancelEdit();
            isFinishing = false;
            return;
        }

        // Показываем индикатор загрузки в span
        field.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        field.style.display = 'inline-block';
        input.style.display = 'none';

        // Формируем данные для отправки
        const formData = new FormData();
        formData.append('field_name', fieldType);
        formData.append('new_value', newValue);
        formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        // Отправляем AJAX-запрос
        fetch(`/spravochnik_dopolnitelnyh_rabot/api/circulation_price/update/${priceId}/`, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Успех: обновляем отображение поля
                if (fieldType === 'circulation') {
                    field.textContent = data.circulation_price.circulation_display;
                    field.setAttribute('data-original-value', data.circulation_price.circulation);
                } else if (fieldType === 'price') {
                    field.textContent = data.circulation_price.price_display;
                    field.setAttribute('data-original-value', data.circulation_price.price);
                }

                // Генерируем событие обновления (для других компонентов на этой странице)
                const event = new CustomEvent('workPriceUpdated', {
                    detail: { priceId: priceId, workPrice: data.circulation_price }
                });
                document.dispatchEvent(event);

                // Записываем в localStorage метку времени для синхронизации между вкладками
                localStorage.setItem('work_price_last_update', Date.now().toString());
            } else {
                throw new Error(data.error || 'Ошибка сохранения');
            }
        })
        .catch(error => {
            console.error(error);
            showNotification(error.message, 'error');
            // Возвращаем исходное значение в span
            field.textContent = originalValue;
            field.style.display = 'inline-block';
        })
        .finally(() => {
            input.style.display = 'none';
            currentlyEditing = null;
            isProcessingDoubleClick = false;
            isFinishing = false;
            if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);
        });
    }

    /**
     * Отмена редактирования (без сохранения).
     */
    function cancelEdit() {
        if (!currentlyEditing) return;

        const { field, input } = currentlyEditing;
        field.style.display = 'inline-block';
        input.style.display = 'none';
        input.value = field.getAttribute('data-original-value') || '';

        currentlyEditing = null;
        isProcessingDoubleClick = false;
        isFinishing = false;
        if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);
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

    // Экспортируем функцию cancelEdit, чтобы основной скрипт мог её вызвать
    window.WorkCirculationPriceInlineEdit = {
        cancelEdit: cancelEdit
    };

    document.addEventListener('DOMContentLoaded', init);
})();