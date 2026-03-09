/*
spravochnik_dopolnitelnyh_rabot_inline_edit.js
Inline-редактирование для справочника дополнительных работ.
Поля "название", "цена", "формула", "линии реза", "изделия на листе"
можно редактировать двойным кликом.
Использует делегирование через .right-column и экспортирует cancelEdit.
Добавлена запись в localStorage для межвкладочного взаимодействия и обработчик storage
для автоматического обновления данных в других вкладках.
*/

// Немедленно вызываемая функция (IIFE), чтобы не засорять глобальную область видимости
(function() {
    // ===== ПЕРЕМЕННЫЕ СОСТОЯНИЯ =====
    // Текущее редактируемое поле (объект с деталями: field, input, workId, fieldType, originalValue)
    let currentlyEditing = null;

    // Таймаут, используемый для игнорирования blur при двойном клике (чтобы не срабатывало сохранение преждевременно)
    let ignoreBlurTimeout = null;

    // Флаг, указывающий, что сейчас происходит обработка двойного клика (используется для таймаута)
    let isProcessingDoubleClick = false;

    // Флаг, указывающий, что процесс сохранения уже запущен (чтобы избежать повторных вызовов)
    let isFinishing = false;

    /**
     * Обработчик потери фокуса для input/select.
     * @param {Event} e - событие blur
     */
    function handleInputBlur(e) {
        // Если есть запланированный таймаут, отменяем его
        if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);

        // Если мы обрабатывали двойной клик, даём небольшой таймаут перед сохранением,
        // чтобы дать возможность обработать другие события (например, клик по кнопке)
        if (isProcessingDoubleClick) {
            ignoreBlurTimeout = setTimeout(() => finishEdit(e), 100);
        } else {
            // Иначе сразу завершаем редактирование (сохраняем)
            finishEdit(e);
        }
    }

    /**
     * Обработчик нажатия клавиш в input.
     * @param {KeyboardEvent} e
     */
    function handleInputKeyPress(e) {
        if (!currentlyEditing) return; // если ничего не редактируется, игнорируем

        if (e.key === 'Enter') {
            e.preventDefault();         // предотвращаем отправку формы (если вдруг)
            finishEdit();                // Enter сохраняет изменения
        } else if (e.key === 'Escape') {
            e.preventDefault();          // предотвращаем возможные действия браузера
            cancelEdit();                 // Escape отменяет редактирование
        }
    }

    /**
     * Инициализация обработчиков.
     * Вызывается после загрузки DOM.
     */
    function init() {
        console.log('Inline-редактирование справочника: инициализация...');

        const rightColumn = document.querySelector('.right-column');
        if (!rightColumn) return;

        rightColumn.addEventListener('dblclick', function(e) {
            const field = e.target.closest('.editable-field[data-work-id]');
            if (field) {
                startEdit(field);
            }
        });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && currentlyEditing) {
                cancelEdit();
            }
        });

        window.addEventListener('storage', function(e) {
            if (e.key === 'spravochnik_last_update') {
                console.log('Обнаружено изменение в другой вкладке, обновляем данные');
                if (window.SpravochnikDopRabot && typeof window.SpravochnikDopRabot.reloadCurrentWorkFromServer === 'function') {
                    window.SpravochnikDopRabot.reloadCurrentWorkFromServer();
                } else {
                    location.reload();
                }
            }
        });
    }

    function startEdit(field) {
        const workId = field.getAttribute('data-work-id');
        const fieldType = field.getAttribute('data-field');
        const originalValue = field.getAttribute('data-original-value') || field.textContent.trim();

        if (!workId || !fieldType) return;

        if (currentlyEditing) {
            finishEdit();
        }

        let inputField;
        if (fieldType === 'name') {
            inputField = field.parentNode.querySelector('.spravochnik-name-input');
        } else if (fieldType === 'price') {
            inputField = field.parentNode.querySelector('.spravochnik-price-input');
        } else if (fieldType === 'formula_type') {
            inputField = field.parentNode.querySelector('.spravochnik-formula-select');
        } else if (fieldType === 'default_lines_count') {
            inputField = field.parentNode.querySelector('.spravochnik-lines-input');
        } else if (fieldType === 'default_items_per_sheet') {
            inputField = field.parentNode.querySelector('.spravochnik-items-input');
        } else if (fieldType === 'k_lines') {  // ===== НОВОЕ ПОЛЕ =====
            inputField = field.parentNode.querySelector('.spravochnik-k-lines-input');
        }

        if (!inputField) return;

        if (!inputField.hasAttribute('data-initialized')) {
            inputField.addEventListener('blur', handleInputBlur);
            inputField.addEventListener('keydown', handleInputKeyPress);
            if (inputField.tagName === 'SELECT') {
                inputField.addEventListener('change', function(e) {
                    finishEdit(e);
                });
            }
            inputField.setAttribute('data-initialized', 'true');
        }

        currentlyEditing = {
            field: field,
            input: inputField,
            workId: workId,
            fieldType: fieldType,
            originalValue: originalValue
        };

        field.style.display = 'none';
        field.classList.add('editing');

        // Устанавливаем значение
        if (fieldType === 'price' || fieldType === 'k_lines') {
            // Для чисел заменяем запятую на точку
            inputField.value = originalValue.replace(',', '.');
        } else if (fieldType === 'formula_type') {
            inputField.value = originalValue;
        } else {
            inputField.value = originalValue;
        }

        inputField.style.display = 'block';

        setTimeout(() => {
            if (inputField.style.display === 'block') {
                inputField.focus();
                if (fieldType === 'name' || fieldType === 'price' || fieldType === 'k_lines') {
                    inputField.select();
                }
            }
        }, 10);
    }

    function finishEdit(e) {
        if (!currentlyEditing || isFinishing) return;
        isFinishing = true;

        const { field, input, workId, fieldType, originalValue } = currentlyEditing;
        let newValue;
        let newDisplayValue;

        if (input.tagName === 'SELECT') {
            newValue = input.value;
            const selectedOption = input.options[input.selectedIndex];
            newDisplayValue = selectedOption ? selectedOption.text : newValue;
            currentlyEditing.newDisplayValue = newDisplayValue;
        } else {
            newValue = input.value.trim();
        }

        // Если значение не изменилось
        if (newValue == originalValue) {
            cancelEdit();
            isFinishing = false;
            return;
        }

        // Валидация
        if (fieldType === 'price' || fieldType === 'k_lines') {
            const num = parseFloat(newValue.replace(',', '.'));
            if (isNaN(num) || (fieldType === 'price' && num < 0) || (fieldType === 'k_lines' && num < 0.1)) {
                showNotification('Некорректное значение', 'error');
                input.value = originalValue.replace(',', '.');
                cancelEdit();
                isFinishing = false;
                return;
            }
        } else if (fieldType === 'default_lines_count' || fieldType === 'default_items_per_sheet') {
            const num = parseInt(newValue, 10);
            if (isNaN(num) || num < 1) {
                showNotification('Значение должно быть целым числом ≥ 1', 'error');
                input.value = originalValue;
                cancelEdit();
                isFinishing = false;
                return;
            }
        } else if (fieldType === 'formula_type') {
            const num = parseInt(newValue, 10);
            if (isNaN(num) || num < 1 || num > 6) {
                showNotification('Недопустимый тип формулы', 'error');
                input.value = originalValue;
                cancelEdit();
                isFinishing = false;
                return;
            }
        }

        // Показываем спиннер
        field.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        field.style.display = 'inline-block';
        input.style.display = 'none';

        const formData = new FormData();
        formData.append('field_name', fieldType);
        formData.append('new_value', newValue);
        formData.append('csrfmiddlewaretoken', getCookie('csrftoken'));

        fetch(`/spravochnik_dopolnitelnyh_rabot/api/update/${workId}/`, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Обновляем отображение
                if (fieldType === 'formula_type' && currentlyEditing.newDisplayValue) {
                    field.textContent = currentlyEditing.newDisplayValue;
                    field.setAttribute('data-original-value', newValue);
                } else if (fieldType === 'name') {
                    field.textContent = data.work.name;
                    field.setAttribute('data-original-value', data.work.name);
                } else if (fieldType === 'price') {
                    field.textContent = data.work.price;
                    field.setAttribute('data-original-value', data.work.price);
                } else if (fieldType === 'default_lines_count') {
                    field.textContent = data.work.default_lines_count;
                    field.setAttribute('data-original-value', data.work.default_lines_count);
                } else if (fieldType === 'default_items_per_sheet') {
                    field.textContent = data.work.default_items_per_sheet;
                    field.setAttribute('data-original-value', data.work.default_items_per_sheet);
                } else if (fieldType === 'k_lines') {  // ===== НОВОЕ =====
                    field.textContent = data.work.k_lines;
                    field.setAttribute('data-original-value', data.work.k_lines);
                }

                updateWorkInList(data.work);

                const event = new CustomEvent('spravochnikWorkUpdated', {
                    detail: { workId: data.work_id || data.work.id, work: data.work }
                });
                document.dispatchEvent(event);

                localStorage.setItem('spravochnik_last_update', Date.now().toString());
            } else {
                throw new Error(data.error || 'Ошибка сохранения');
            }
        })
        .catch(error => {
            console.error(error);
            showNotification(error.message, 'error');
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
     * Обновление элемента в списке слева после редактирования (название и цена).
     * @param {Object} workData - обновлённые данные работы
     */
    function updateWorkInList(workData) {
        // Ищем элемент списка с соответствующим data-work-id
        const workItem = document.querySelector(`.work-item[data-work-id="${workData.id}"]`);
        if (!workItem) return;

        // Обновляем название
        const nameSpan = workItem.querySelector('.work-name');
        if (nameSpan) {
            const icon = nameSpan.querySelector('i'); // сохраняем иконку
            nameSpan.innerHTML = '';                   // очищаем содержимое
            if (icon) nameSpan.appendChild(icon);      // возвращаем иконку
            nameSpan.append(document.createTextNode(' ' + workData.name)); // добавляем новый текст
        }

        // Обновляем цену
        const priceSpan = workItem.querySelector('.work-price');
        if (priceSpan) {
            const icon = priceSpan.querySelector('i');
            priceSpan.innerHTML = '';
            if (icon) priceSpan.appendChild(icon);
            priceSpan.append(document.createTextNode(' ' + workData.price));
        }
    }

    /**
     * Отмена редактирования (без сохранения).
     */
    function cancelEdit() {
        if (!currentlyEditing) return;

        const { field, input } = currentlyEditing;
        // Возвращаем исходное состояние: показываем span, скрываем input
        field.style.display = 'inline-block';
        field.classList.remove('editing');
        input.style.display = 'none';

        // Сбрасываем состояние
        currentlyEditing = null;
        isProcessingDoubleClick = false;
        isFinishing = false;
        if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);
    }

    /**
     * Получение CSRF-токена из cookie.
     * @param {string} name - имя cookie (обычно 'csrftoken')
     * @returns {string} значение токена
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
     * Уведомление (переиспользуем функцию из основного файла spravochnik_dopolnitelnyh_rabot.js).
     * @param {string} message - текст уведомления
     * @param {string} type - тип (success, error, warning, info)
     */
    function showNotification(message, type) {
        if (window.SpravochnikDopRabot && typeof window.SpravochnikDopRabot.showNotification === 'function') {
            window.SpravochnikDopRabot.showNotification(message, type);
        } else {
            // Если основной модуль не загрузился – используем alert
            alert(message);
        }
    }

    // Экспортируем функцию cancelEdit в глобальный объект InlineEdit,
    // чтобы основной скрипт мог отменить редактирование при необходимости (например, при выборе другой работы)
    window.InlineEdit = {
        cancelEdit: cancelEdit
    };

    // Запускаем инициализацию после полной загрузки DOM
    document.addEventListener('DOMContentLoaded', init);
})();