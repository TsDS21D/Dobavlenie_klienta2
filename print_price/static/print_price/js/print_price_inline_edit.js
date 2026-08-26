/*
print_price_inline_edit.js - JavaScript для in-line редактирования цен на печать (себестоимость + наценка)
*/

// Ждём полной загрузки DOM (Document Object Model) перед выполнением скрипта
document.addEventListener('DOMContentLoaded', function() {
    // Выводим в консоль сообщение о загрузке скрипта (для отладки)
    console.log('print_price_inline_edit.js загружен');

    // Переменная для хранения информации о текущем редактируемом поле
    let currentlyEditing = null;   // null означает, что редактирование не активно

    // Функция переключения в режим редактирования
    function enableEditMode(fieldElement) {
        // Если уже идёт редактирование другого поля – показываем предупреждение и выходим
        if (currentlyEditing) {
            showNotification('Завершите редактирование текущего поля', 'warning');
            return;
        }

        // Получаем атрибуты из элемента, по которому был двойной клик
        const fieldName = fieldElement.getAttribute('data-field');          // Название поля (copies, cost, markup_percent)
        const priceId = fieldElement.getAttribute('data-price-id');        // ID записи в базе данных
        const originalValue = fieldElement.getAttribute('data-original-value'); // Исходное значение

        // Если не удалось получить обязательные атрибуты – выходим
        if (!fieldName || !priceId) return;

        // Находим скрытое поле ввода, соответствующее этому элементу
        // Селектор: элемент с классом inline-edit-input, у которого data-price-id и data-field совпадают
        const inputSelector = `.inline-edit-input[data-price-id="${priceId}"][data-field="${fieldName}"]`;
        const targetInput = document.querySelector(inputSelector);
        if (!targetInput) {
            // Если поле ввода не найдено – ошибка
            console.error('Input not found');
            showNotification('Ошибка: поле ввода не найдено', 'error');
            return;
        }

        // Подготавливаем значение для поля ввода:
        let valueForInput = originalValue;
        // Для полей cost и markup_percent заменяем запятую на точку (если пользователь ввёл через запятую)
        if (fieldName === 'cost' || fieldName === 'markup_percent') {
            valueForInput = originalValue.replace(',', '.');
        }
        // Для тиража преобразуем в целое число
        if (fieldName === 'copies') {
            valueForInput = parseInt(valueForInput) || 1;
        }
        // Устанавливаем значение в поле ввода
        targetInput.value = valueForInput;

        // Запоминаем текущее редактирование
        currentlyEditing = {
            fieldElement: fieldElement,   // Элемент, отображающий значение (span)
            inputElement: targetInput,    // Поле ввода
            fieldName: fieldName,
            priceId: priceId,
            originalValue: originalValue
        };

        // Прячем отображаемый элемент (span) и показываем поле ввода
        fieldElement.style.display = 'none';
        targetInput.style.display = 'inline-block';
        targetInput.focus();              // Устанавливаем фокус
        targetInput.select();             // Выделяем текст

        // Добавляем класс 'editing' к строке таблицы для визуального выделения
        const row = fieldElement.closest('.table-row');
        if (row) row.classList.add('editing');

        // Показываем подсказку
        showNotification('Введите новое значение и нажмите Enter для сохранения', 'info');
    }

    // Функция выхода из режима редактирования (с сохранением или без)
    function disableEditMode(saveChanges) {
        // Если редактирование не активно – ничего не делаем
        if (!currentlyEditing) return;

        // Сохраняем ссылку на объект редактирования в локальную переменную,
        // чтобы при асинхронных операциях он не изменился
        const editing = currentlyEditing;
        const { fieldElement, inputElement, fieldName, priceId, originalValue } = editing;

        // Получаем новое значение из поля ввода
        const newValue = inputElement.value.trim();

        // Если требуется сохранить и значение изменилось
        if (saveChanges && newValue !== originalValue) {
            // Валидация в зависимости от типа поля
            if (fieldName === 'copies') {
                const copies = parseInt(newValue);
                if (isNaN(copies) || copies < 1) {
                    showNotification('Тираж должен быть целым числом ≥ 1', 'error');
                    cancelEdit();  // отменяем редактирование без сохранения
                    return;
                }
            }
            if (fieldName === 'cost') {
                const cost = parseFloat(newValue);
                if (isNaN(cost) || cost < 0) {
                    showNotification('Себестоимость должна быть ≥ 0', 'error');
                    cancelEdit();
                    return;
                }
            }
            if (fieldName === 'markup_percent') {
                const markup = parseFloat(newValue);
                if (isNaN(markup) || markup < 0) {
                    showNotification('Наценка должна быть ≥ 0', 'error');
                    cancelEdit();
                    return;
                }
            }

            // Отправляем AJAX-запрос на сохранение
            saveFieldValue(fieldName, priceId, newValue);
        } else {
            // Если сохранение не требуется (отмена или значение не изменилось)
            cancelEdit();
            if (!saveChanges) showNotification('Редактирование отменено', 'info');
        }
    }

    // Функция отмены редактирования без сохранения
    function cancelEdit() {
        if (!currentlyEditing) return;

        const { fieldElement, inputElement } = currentlyEditing;
        // Прячем поле ввода, показываем отображаемый элемент
        fieldElement.style.display = 'inline-block';
        inputElement.style.display = 'none';

        // Убираем класс 'editing' со строки таблицы
        const row = fieldElement.closest('.table-row');
        if (row) row.classList.remove('editing');

        // Сбрасываем глобальную переменную
        currentlyEditing = null;
    }

    // Функция отправки нового значения на сервер и обновления интерфейса
    function saveFieldValue(fieldName, priceId, newValue) {
        // Сохраняем ссылку на объект редактирования до того, как обнулим currentlyEditing
        const editing = currentlyEditing;
        if (!editing) return;

        const { fieldElement, inputElement } = editing;

        // Временно показываем индикатор загрузки вместо отображаемого элемента
        fieldElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        fieldElement.style.display = 'inline-block';
        inputElement.style.display = 'none';

        // Формируем данные для отправки
        const formData = new FormData();
        formData.append('field_name', fieldName);
        formData.append('new_value', newValue);
        formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        // Отправляем POST-запрос на сервер
        fetch(`/print_price/api/update/${priceId}/`, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Обновляем отображение значений в таблице
                updateFieldDisplay(fieldName, priceId, data.print_price);
                showNotification('Значение успешно обновлено', 'success');

                // Сбрасываем состояние редактирования
                currentlyEditing = null;
                const row = document.querySelector(`.table-row[data-price-id="${priceId}"]`);
                if (row) row.classList.remove('editing');
            } else {
                // В случае ошибки показываем сообщение и отменяем редактирование
                showNotification(`Ошибка: ${data.error}`, 'error');
                cancelEdit();
            }
        })
        .catch(error => {
            console.error(error);
            showNotification('Ошибка при сохранении', 'error');
            cancelEdit();
        });
    }

    // Функция обновления отображения строки таблицы после успешного сохранения
    function updateFieldDisplay(fieldName, priceId, priceData) {
        const row = document.querySelector(`.table-row[data-price-id="${priceId}"]`);
        if (!row) return;

        // В зависимости от поля обновляем соответствующий элемент
        if (fieldName === 'copies') {
            const badge = row.querySelector('.copies-badge');
            if (badge) {
                badge.textContent = priceData.copies_display;
                badge.setAttribute('data-original-value', priceData.copies);
            }
            const input = row.querySelector('.copies-input');
            if (input) input.value = priceData.copies;
            const deleteBtn = row.querySelector('.btn-delete');
            if (deleteBtn) deleteBtn.setAttribute('data-price-copies', priceData.copies);
        } else if (fieldName === 'cost') {
            const badge = row.querySelector('.cost-badge');
            if (badge) {
                badge.textContent = priceData.cost_display;
                badge.setAttribute('data-original-value', priceData.cost);
            }
            const input = row.querySelector('.cost-input');
            if (input) input.value = priceData.cost;
        } else if (fieldName === 'markup_percent') {
            const badge = row.querySelector('.markup-badge');
            if (badge) {
                badge.textContent = priceData.markup_percent_display;
                badge.setAttribute('data-original-value', priceData.markup_percent);
            }
            const input = row.querySelector('.markup-input');
            if (input) input.value = priceData.markup_percent;
        }

        // Обновляем отображение цены за лист и общей стоимости (они могли измениться)
        const priceBadge = row.querySelector('.price-per-sheet-badge');
        if (priceBadge) priceBadge.textContent = priceData.price_per_sheet_display;
        const totalBadge = row.querySelector('.total-price-badge');
        if (totalBadge) totalBadge.textContent = priceData.total_price_display;
    }

    // Вспомогательная функция для получения CSRF-токена из cookie
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

    // Функция отображения всплывающих уведомлений
    function showNotification(message, type = 'info') {
        // Удаляем старые уведомления, чтобы не накапливались
        const old = document.querySelectorAll('.inline-edit-notification');
        old.forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `inline-edit-notification notification-${type}`;
        notification.textContent = message;
        // Стили уведомления
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            padding: 10px 20px; border-radius: 5px;
            color: white; font-weight: bold; z-index: 10000;
            animation: fadeInOut 5s ease-in-out;
            background-color: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#F44336' : type === 'warning' ? '#FF9800' : '#2196F3'};
        `;

        // Добавляем CSS-анимацию, если её ещё нет
        if (!document.getElementById('inline-edit-notification-style')) {
            const style = document.createElement('style');
            style.id = 'inline-edit-notification-style';
            style.textContent = `@keyframes fadeInOut {0%{opacity:0;transform:translateY(-20px)}10%{opacity:1;transform:translateY(0)}90%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-20px)}}`;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);
        // Автоматическое удаление через 5 секунд
        setTimeout(() => notification.remove(), 5000);
    }

    // ===== ОБРАБОТЧИКИ СОБЫТИЙ =====

    // Обработка двойного клика по редактируемому полю
    document.addEventListener('dblclick', function(e) {
        // Находим ближайший элемент с классом editable-field
        const editable = e.target.closest('.editable-field');
        if (editable) {
            e.stopPropagation();
            e.preventDefault();
            enableEditMode(editable);
        }
    });

    // Обработка нажатия клавиш Enter и Escape во время редактирования
    document.addEventListener('keydown', function(e) {
        if (currentlyEditing && currentlyEditing.inputElement) {
            if (e.key === 'Enter') {
                disableEditMode(true);   // Сохраняем изменения
                e.preventDefault();
            } else if (e.key === 'Escape') {
                disableEditMode(false);  // Отменяем редактирование
                e.preventDefault();
            }
        }
    });

    // Обработка потери фокуса полем ввода (focusout)
    document.addEventListener('focusout', function(e) {
        // Сохраняем локальную копию currentlyEditing, чтобы она не изменилась до завершения таймаута
        const editing = currentlyEditing;
        if (editing && editing.inputElement === e.target) {
            // Используем таймаут, чтобы дать возможность сфокусироваться на другом элементе
            setTimeout(() => {
                // Проверяем, что объект редактирования всё ещё тот же и активный элемент не является полем ввода
                if (currentlyEditing === editing && editing.inputElement && document.activeElement !== editing.inputElement) {
                    disableEditMode(true);
                }
            }, 100);
        }
    });

    // Обработка клика вне поля редактирования
    document.addEventListener('click', function(e) {
        if (currentlyEditing && currentlyEditing.inputElement) {
            // Проверяем, что клик произошёл внутри поля ввода или внутри отображаемого элемента
            const isInside = currentlyEditing.inputElement.contains(e.target) ||
                             currentlyEditing.fieldElement.contains(e.target);
            if (!isInside) {
                disableEditMode(true);
            }
        }
    });

    console.log('In-line редактирование инициализировано');
});