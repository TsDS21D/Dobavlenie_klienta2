/* work_price_inline_edit.js - Inline-редактирование опорных точек цен
 *
 * Позволяет редактировать поля "sheets" (количество листов) и "price" (цена)
 * прямо в таблице двойным кликом. При нажатии Enter сохраняет, Esc отменяет.
 * Также реализована межвкладочная синхронизация через localStorage.
 */

(function() {
    // ===== ПЕРЕМЕННЫЕ СОСТОЯНИЯ =====
    // Объект с информацией о текущем редактируемом поле
    let currentlyEditing = null;

    // Таймаут для игнорирования события blur при двойном клике
    let ignoreBlurTimeout = null;

    // Флаг, указывающий, что мы сейчас обрабатываем двойной клик
    let isProcessingDoubleClick = false;

    // Флаг, предотвращающий повторное завершение редактирования
    let isFinishing = false;

    // ===== ИНИЦИАЛИЗАЦИЯ =====
    function init() {
        console.log('WorkPrice inline-edit: инициализация...');

        // Контейнер, в котором находятся таблица и поля (правая колонка)
        // Используем делегирование, т.к. строки могут добавляться/удаляться
        const container = document.querySelector('.right-column');
        if (!container) return;

        // Обработчик двойного клика – начинаем редактирование
        container.addEventListener('dblclick', function(e) {
            // Ищем элемент с классом editable-field-price (это span, по которому можно кликнуть)
            const field = e.target.closest('.editable-field-price');
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
            // Если изменился наш ключ – обновляем данные текущей работы с сервера
            if (e.key === 'work_price_last_update') {
                console.log('Обнаружено изменение в другой вкладке, обновляем данные');
                // Используем функцию из основного модуля справочника (если доступна)
                if (window.SpravochnikDopRabot && typeof window.SpravochnikDopRabot.reloadCurrentWorkFromServer === 'function') {
                    window.SpravochnikDopRabot.reloadCurrentWorkFromServer();
                } else {
                    // Если нет – просто перезагружаем страницу
                    location.reload();
                }
            }
        });
    }

    // ===== НАЧАЛО РЕДАКТИРОВАНИЯ =====
    function startEdit(field) {
        // Если уже есть активное редактирование, завершаем его (сохраняем)
        if (currentlyEditing) {
            finishEdit();
        }

        // Получаем данные из data-атрибутов поля
        const priceId = field.getAttribute('data-price-id');
        const fieldType = field.getAttribute('data-field'); // 'sheets' или 'price'
        const originalValue = field.getAttribute('data-original-value') || field.textContent.trim();

        // Проверяем, что все необходимые атрибуты есть
        if (!priceId || !fieldType) return;

        // Находим соответствующий скрытый input в этой же строке
        // Для этого поднимаемся до .table-row, затем ищем input с соответствующим классом
        const row = field.closest('.table-row');
        if (!row) return;

        let inputField;
        if (fieldType === 'sheets') {
            inputField = row.querySelector('.sheets-input');
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
                inputField.select(); // выделяем текст для быстрой замены
            }
        }, 10);
    }

    // ===== ОБРАБОТЧИК ПОТЕРИ ФОКУСА =====
    function handleInputBlur(e) {
        if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);

        // Если мы обрабатывали двойной клик, даём небольшую задержку перед сохранением
        if (isProcessingDoubleClick) {
            ignoreBlurTimeout = setTimeout(() => finishEdit(e), 100);
        } else {
            finishEdit(e);
        }
    }

    // ===== ОБРАБОТЧИК НАЖАТИЯ КЛАВИШ =====
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

    // ===== ЗАВЕРШЕНИЕ РЕДАКТИРОВАНИЯ (СОХРАНЕНИЕ) =====
    function finishEdit(e) {
        if (!currentlyEditing || isFinishing) return;
        isFinishing = true;

        const { field, input, priceId, fieldType, originalValue } = currentlyEditing;
        let newValue = input.value.trim();

        // Валидация на клиенте перед отправкой
        if (fieldType === 'sheets') {
            const num = parseInt(newValue, 10);
            if (isNaN(num) || num < 1) {
                showNotification('Количество листов должно быть целым числом ≥ 1', 'error');
                input.value = originalValue;
                cancelEdit();
                isFinishing = false;
                return;
            }
            newValue = num; // целое число
        } else if (fieldType === 'price') {
            // Заменяем запятую на точку для корректного парсинга
            newValue = newValue.replace(',', '.');
            const num = parseFloat(newValue);
            if (isNaN(num) || num < 0) {
                showNotification('Цена должна быть числом ≥ 0', 'error');
                input.value = originalValue.replace(',', '.');
                cancelEdit();
                isFinishing = false;
                return;
            }
            // Оставляем как строку, на сервере преобразуется в Decimal
        }

        // Если значение не изменилось – просто отменяем редактирование
        if (newValue == originalValue) {
            cancelEdit();
            isFinishing = false;
            return;
        }

        // Показываем индикатор загрузки в span
        field.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        field.style.display = 'inline-block'; // показываем span (он скрыт)
        input.style.display = 'none'; // скрываем input

        // Формируем данные для отправки
        const formData = new FormData();
        formData.append('field_name', fieldType);
        formData.append('new_value', newValue);
        formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        // Отправляем AJAX-запрос
        fetch(`/spravochnik_dopolnitelnyh_rabot/api/work_price/update/${priceId}/`, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Успех: обновляем отображение поля
                if (fieldType === 'sheets') {
                    // Используем отформатированное значение из ответа (data.work_price.sheets_display)
                    field.textContent = data.work_price.sheets_display;
                    field.setAttribute('data-original-value', data.work_price.sheets);
                } else if (fieldType === 'price') {
                    field.textContent = data.work_price.price_display;
                    field.setAttribute('data-original-value', data.work_price.price);
                }

                // Генерируем событие обновления (для других компонентов на этой странице)
                const event = new CustomEvent('workPriceUpdated', {
                    detail: { priceId: priceId, workPrice: data.work_price }
                });
                document.dispatchEvent(event);

                // Записываем в localStorage метку времени для синхронизации между вкладками
                localStorage.setItem('work_price_last_update', Date.now().toString());
            } else {
                // Если сервер вернул ошибку, показываем её
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
            // Скрываем input, сбрасываем состояние
            input.style.display = 'none';
            currentlyEditing = null;
            isProcessingDoubleClick = false;
            isFinishing = false;
            if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);
        });
    }

    // ===== ОТМЕНА РЕДАКТИРОВАНИЯ (БЕЗ СОХРАНЕНИЯ) =====
    function cancelEdit() {
        if (!currentlyEditing) return;

        const { field, input } = currentlyEditing;
        // Возвращаем исходное состояние
        field.style.display = 'inline-block';
        input.style.display = 'none';
        // Сбрасываем значение input (на всякий случай)
        input.value = field.getAttribute('data-original-value') || '';

        currentlyEditing = null;
        isProcessingDoubleClick = false;
        isFinishing = false;
        if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);
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

    // Экспортируем функцию cancelEdit, чтобы основной скрипт мог её вызвать (например, при выборе другой работы)
    window.WorkPriceInlineEdit = {
        cancelEdit: cancelEdit
    };

    // Запуск инициализации
    document.addEventListener('DOMContentLoaded', init);
})();