/*
spravochnik_dopolnitelnyh_rabot_inline_edit.js
Inline-редактирование для справочника дополнительных работ.
Поля "название", "цена", "себестоимость", "наценка", "формула", "линии реза", "изделия на листе"
можно редактировать двойным кликом.
Исправлено: для полей cost и markup_percent корректно заменяем запятую на точку.
Добавлено: при изменении поля formula_type отправляется событие formulaTypeChanged.
*/

// Немедленно вызываемая функция (IIFE), чтобы не засорять глобальную область видимости
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

    // ===== ОБРАБОТЧИК ПОТЕРИ ФОКУСА =====
    function handleInputBlur(e) {
        // Если есть запланированный таймаут, отменяем его
        if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);

        // Если мы обрабатывали двойной клик, даём небольшую задержку перед сохранением,
        // чтобы дать возможность обработать другие события (например, клик по кнопке)
        if (isProcessingDoubleClick) {
            ignoreBlurTimeout = setTimeout(() => finishEdit(e), 100);
        } else {
            // Иначе сразу завершаем редактирование (сохраняем)
            finishEdit(e);
        }
    }

    // ===== ОБРАБОТЧИК НАЖАТИЯ КЛАВИШ =====
    function handleInputKeyPress(e) {
        if (!currentlyEditing) return; // если ничего не редактируется, игнорируем

        if (e.key === 'Enter') {
            e.preventDefault();         // предотвращаем отправку формы (если вдруг)
            finishEdit();               // Enter сохраняет изменения
        } else if (e.key === 'Escape') {
            e.preventDefault();         // предотвращаем возможные действия браузера
            cancelEdit();              // Escape отменяет редактирование
        }
    }

    // ===== ИНИЦИАЛИЗАЦИЯ =====
    function init() {
        console.log('Inline-редактирование справочника: инициализация...');

        // Контейнер, в котором находятся поля для редактирования (правая колонка)
        const rightColumn = document.querySelector('.right-column');
        if (!rightColumn) return;

        // Обработчик двойного клика – начинаем редактирование
        rightColumn.addEventListener('dblclick', function(e) {
            const field = e.target.closest('.editable-field[data-work-id]');
            if (field) startEdit(field);
        });

        // Глобальная клавиша Escape для отмены редактирования из любого места
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && currentlyEditing) cancelEdit();
        });

        // Слушаем изменения в localStorage для синхронизации между вкладками
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

    // ===== НАЧАЛО РЕДАКТИРОВАНИЯ =====
    function startEdit(field) {
        const workId = field.getAttribute('data-work-id');
        const fieldType = field.getAttribute('data-field');
        const originalValue = field.getAttribute('data-original-value') || field.textContent.trim();

        if (!workId || !fieldType) return;

        // Если уже есть активное редактирование, завершаем его (сохраняем)
        if (currentlyEditing) finishEdit();

        // Находим соответствующий скрытый input в этой же строке
        let inputField;
        if (fieldType === 'name') {
            inputField = field.parentNode.querySelector('.spravochnik-name-input');
        } else if (fieldType === 'price') {
            inputField = field.parentNode.querySelector('.spravochnik-price-input');
        } else if (fieldType === 'cost') {
            inputField = field.parentNode.querySelector('.spravochnik-cost-input');
        } else if (fieldType === 'markup_percent') {
            inputField = field.parentNode.querySelector('.spravochnik-markup-input');
        } else if (fieldType === 'formula_type') {
            inputField = field.parentNode.querySelector('.spravochnik-formula-select');
        } else if (fieldType === 'default_lines_count') {
            inputField = field.parentNode.querySelector('.spravochnik-lines-input');
        } else if (fieldType === 'default_items_per_sheet') {
            inputField = field.parentNode.querySelector('.spravochnik-items-input');
        } else if (fieldType === 'k_lines') {
            inputField = field.parentNode.querySelector('.spravochnik-k-lines-input');
        }

        if (!inputField) return;

        // Добавляем обработчики событий на input, если они ещё не добавлены
        if (!inputField.hasAttribute('data-initialized')) {
            inputField.addEventListener('blur', handleInputBlur);
            inputField.addEventListener('keydown', handleInputKeyPress);
            if (inputField.tagName === 'SELECT') {
                inputField.addEventListener('change', function(e) { finishEdit(e); });
            }
            inputField.setAttribute('data-initialized', 'true');
        }

        // Сохраняем состояние
        currentlyEditing = {
            field: field,
            input: inputField,
            workId: workId,
            fieldType: fieldType,
            originalValue: originalValue
        };

        // Скрываем span
        field.style.display = 'none';
        field.classList.add('editing');

        // Устанавливаем значение в input с заменой запятой на точку для числовых полей
        const numericFields = ['price', 'cost', 'k_lines', 'markup_percent'];
        if (numericFields.includes(fieldType)) {
            inputField.value = originalValue.replace(',', '.');
        } else if (fieldType === 'formula_type') {
            inputField.value = originalValue;
        } else {
            inputField.value = originalValue;
        }

        // Показываем input
        inputField.style.display = 'block';

        // Ставим фокус и выделяем текст
        setTimeout(() => {
            if (inputField.style.display === 'block') {
                inputField.focus();
                if (numericFields.includes(fieldType) || fieldType === 'name') {
                    inputField.select();
                }
            }
        }, 10);
    }

    // ===== ЗАВЕРШЕНИЕ РЕДАКТИРОВАНИЯ (СОХРАНЕНИЕ) =====
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

        // Если значение не изменилось – просто отменяем редактирование
        if (newValue == originalValue) {
            cancelEdit();
            isFinishing = false;
            return;
        }

        // Валидация на клиенте перед отправкой
        const numericFields = ['price', 'cost', 'k_lines', 'markup_percent'];
        if (numericFields.includes(fieldType)) {
            const num = parseFloat(newValue.replace(',', '.'));
            if (isNaN(num) || (fieldType === 'price' && num < 0) ||
                (fieldType === 'cost' && num < 0) ||
                (fieldType === 'markup_percent' && num < 0) ||
                (fieldType === 'k_lines' && num < 0.1)) {
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
        fetch(`/spravochnik_dopolnitelnyh_rabot/api/update/${workId}/`, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Успех: обновляем отображение поля
                if (fieldType === 'formula_type' && currentlyEditing.newDisplayValue) {
                    field.textContent = currentlyEditing.newDisplayValue;
                    field.setAttribute('data-original-value', newValue);
                } else if (fieldType === 'name') {
                    field.textContent = data.work.name;
                    field.setAttribute('data-original-value', data.work.name);
                } else if (fieldType === 'price') {
                    field.textContent = data.work.price;
                    field.setAttribute('data-original-value', data.work.price);
                } else if (fieldType === 'cost') {
                    field.textContent = data.work.cost;
                    field.setAttribute('data-original-value', data.work.cost);
                } else if (fieldType === 'markup_percent') {
                    field.textContent = data.work.markup_percent;
                    field.setAttribute('data-original-value', data.work.markup_percent);
                } else if (fieldType === 'default_lines_count') {
                    field.textContent = data.work.default_lines_count;
                    field.setAttribute('data-original-value', data.work.default_lines_count);
                } else if (fieldType === 'default_items_per_sheet') {
                    field.textContent = data.work.default_items_per_sheet;
                    field.setAttribute('data-original-value', data.work.default_items_per_sheet);
                } else if (fieldType === 'k_lines') {
                    field.textContent = data.work.k_lines;
                    field.setAttribute('data-original-value', data.work.k_lines);
                }

                // Обновляем элемент в списке слева (название и цена)
                updateWorkInList(data.work);

                // ===== ДОБАВЛЕНО: отправляем событие, если изменилась формула =====
                if (fieldType === 'formula_type') {
                    const event = new CustomEvent('formulaTypeChanged', {
                        detail: {
                            workId: workId,
                            formulaType: newValue
                        }
                    });
                    document.dispatchEvent(event);
                    console.log(`📢 Событие formulaTypeChanged отправлено для работы ${workId}, новая формула: ${newValue}`);
                }

                // Генерируем общее событие обновления справочника
                const updateEvent = new CustomEvent('spravochnikWorkUpdated', {
                    detail: { workId: data.work_id || data.work.id, work: data.work }
                });
                document.dispatchEvent(updateEvent);

                // Записываем метку времени в localStorage для синхронизации между вкладками
                localStorage.setItem('spravochnik_last_update', Date.now().toString());
            } else {
                throw new Error(data.error || 'Ошибка сохранения');
            }
        })
        .catch(error => {
            console.error(error);
            showNotification(error.message, 'error');
            // Восстанавливаем исходное значение
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

    // ===== ОБНОВЛЕНИЕ ЭЛЕМЕНТА В СПИСКЕ СЛЕВА =====
    function updateWorkInList(workData) {
        const workItem = document.querySelector(`.work-item[data-work-id="${workData.id}"]`);
        if (!workItem) return;

        const nameSpan = workItem.querySelector('.work-name');
        if (nameSpan) {
            const icon = nameSpan.querySelector('i');
            nameSpan.innerHTML = '';
            if (icon) nameSpan.appendChild(icon);
            nameSpan.append(document.createTextNode(' ' + workData.name));
        }

        const priceSpan = workItem.querySelector('.work-price');
        if (priceSpan) {
            const icon = priceSpan.querySelector('i');
            priceSpan.innerHTML = '';
            if (icon) priceSpan.appendChild(icon);
            priceSpan.append(document.createTextNode(' ' + workData.price));
        }
    }

    // ===== ОТМЕНА РЕДАКТИРОВАНИЯ (БЕЗ СОХРАНЕНИЯ) =====
    function cancelEdit() {
        if (!currentlyEditing) return;

        const { field, input } = currentlyEditing;
        field.style.display = 'inline-block';
        field.classList.remove('editing');
        input.style.display = 'none';

        currentlyEditing = null;
        isProcessingDoubleClick = false;
        isFinishing = false;
        if (ignoreBlurTimeout) clearTimeout(ignoreBlurTimeout);
    }

    // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
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

    function showNotification(message, type) {
        if (window.SpravochnikDopRabot && typeof window.SpravochnikDopRabot.showNotification === 'function') {
            window.SpravochnikDopRabot.showNotification(message, type);
        } else {
            alert(message);
        }
    }

    // Экспортируем функцию cancelEdit в глобальный объект InlineEdit,
    // чтобы основной скрипт мог отменить редактирование при необходимости (например, при выборе другой работы)
    window.InlineEdit = { cancelEdit: cancelEdit };

    // Запускаем инициализацию после полной загрузки DOM
    document.addEventListener('DOMContentLoaded', init);
})();