/*
spravochnik_dopolnitelnyh_rabot.js
Основной JavaScript для справочника дополнительных работ.
Управление формой добавления, AJAX-запросами, удалением, уведомлениями.
Все функции и переменные находятся в объекте SpravochnikDopRabot.

ИСПРАВЛЕНО:
  - В форму добавления добавлено поле interpolation_method.
  - Функция renderWorkDetails теперь отображает метод интерполяции и блок расчёта произвольного количества листов.
  - Добавлена поддержка межвкладочной синхронизации (localStorage).
*/

const SpravochnikDopRabot = (function() {
    // Приватная переменная для отслеживания видимости формы
    let isFormVisible = false;

    /**
     * Инициализация при загрузке страницы.
     * Навешивает обработчики событий.
     */
    function init() {
        console.log('Справочник дополнительных работ: инициализация...');

        // Кнопка "Добавить работу"
        const addBtn = document.getElementById('spravochnik-add-btn');
        if (addBtn) addBtn.addEventListener('click', toggleForm);

        // Форма добавления (AJAX)
        const addForm = document.getElementById('spravochnik-add-form');
        if (addForm) addForm.addEventListener('submit', handleAddFormSubmit);

        // Обработчик поиска (Enter)
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault(); // предотвращаем стандартную отправку
                    this.form.submit(); // отправляем форму поиска
                }
            });
        }

        // Делегирование событий для кнопок удаления (работает для динамически добавленных кнопок)
        document.addEventListener('click', function(e) {
            const deleteBtn = e.target.closest('.btn-delete-work');
            if (deleteBtn) {
                handleDeleteWork(deleteBtn);
            }
        });

        // Отображение сообщений Django (flash-сообщения)
        showDjangoMessages();
    }

    /**
     * Переключение видимости формы добавления.
     */
    function toggleForm() {
        const formSection = document.getElementById('spravochnik-form-section');
        const addBtn = document.getElementById('spravochnik-add-btn');

        if (!formSection || !addBtn) return;

        isFormVisible = !isFormVisible;

        if (isFormVisible) {
            formSection.style.display = 'block';
            addBtn.innerHTML = '<i class="fas fa-times"></i> Отмена';
            addBtn.classList.add('btn-cancel');
            // Плавно прокручиваем к форме
            formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Устанавливаем фокус на первое поле ввода
            const firstInput = formSection.querySelector('input, textarea, select');
            if (firstInput) firstInput.focus();
        } else {
            formSection.style.display = 'none';
            addBtn.innerHTML = '+ Добавить работу';
            addBtn.classList.remove('btn-cancel');
            clearForm(); // очищаем форму при скрытии
        }
    }

    /**
     * Очистка формы добавления от введённых данных и ошибок.
     */
    function clearForm() {
        const form = document.getElementById('spravochnik-add-form');
        if (!form) return;
        form.reset(); // сброс значений полей
        // Удаляем все сообщения об ошибках
        form.querySelectorAll('.error-message').forEach(el => el.remove());
        // Убираем класс ошибки с полей
        form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
    }

    /**
     * Обработчик отправки формы добавления через AJAX.
     * @param {Event} e - событие submit
     */
    function handleAddFormSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);

        // --- Дополнительная обработка данных перед отправкой ---

        // 1. Заменяем запятую на точку в поле цены и коэффициента
        const priceValue = formData.get('price');
        if (priceValue && priceValue.includes(',')) {
            formData.set('price', priceValue.replace(',', '.'));
        }
        const kLinesValue = formData.get('k_lines');
        if (kLinesValue && kLinesValue.includes(',')) {
            formData.set('k_lines', kLinesValue.replace(',', '.'));
        }

        // 2. Убеждаемся, что поля формулы и параметров присутствуют
        if (!formData.has('formula_type') || formData.get('formula_type') === '') {
            formData.set('formula_type', '1');
        }
        if (!formData.has('default_lines_count') || formData.get('default_lines_count') === '') {
            formData.set('default_lines_count', '1');
        }
        if (!formData.has('default_items_per_sheet') || formData.get('default_items_per_sheet') === '') {
            formData.set('default_items_per_sheet', '1');
        }

        // 3. Добавляем метод интерполяции
        const interpolationSelect = document.getElementById('spravochnik-interpolation-method');
        if (interpolationSelect) {
            formData.set('interpolation_method', interpolationSelect.value);
        }

        // 4. Коэффициент резов уже должен быть в formData, но убедимся, что он есть
        // (он автоматически добавится из поля формы)

        // Валидация на клиенте (проверка названия и цены)
        if (!validateForm(form)) return;

        // Блокируем кнопку
        const submitBtn = form.querySelector('.btn-submit');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сохранение...';
        submitBtn.disabled = true;

        // Отправляем запрос
        fetch(form.action, {
            method: 'POST',
            body: formData,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification('Работа успешно добавлена!', 'success');
                clearForm();
                toggleForm(); // скрываем форму
                addWorkToList(data.work);
                selectWork(data.work);
            } else {
                console.log('Ошибки формы:', data.errors);
                showNotification('Ошибка при добавлении работы', 'error');
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

    /**
     * Добавляет элемент работы в список слева.
     * @param {Object} work - объект работы (из ответа сервера)
     */
    function addWorkToList(work) {
        const container = document.querySelector('.works-list');
        if (!container) return;

        // Получаем текущий поисковый запрос из URL, чтобы сохранить его в ссылке
        const urlParams = new URLSearchParams(window.location.search);
        const searchQuery = urlParams.get('search') || '';

        // Создаём элемент <a> для новой работы
        const workItem = document.createElement('a');
        workItem.href = `?work_id=${work.id}${searchQuery ? '&search=' + encodeURIComponent(searchQuery) : ''}`;
        workItem.className = 'work-item';
        workItem.setAttribute('data-work-id', work.id);

        // Заполняем внутреннее содержимое (название и цена)
        workItem.innerHTML = `
            <div class="work-info">
                <div class="work-name">
                    <i class="fas fa-cog"></i>
                    ${escapeHtml(work.name)}
                </div>
                <div class="work-price">
                    <i class="fas fa-ruble-sign"></i>
                    ${escapeHtml(work.price)}
                </div>
            </div>
        `;

        // Вставляем в начало списка (новые сверху)
        container.prepend(workItem);
    }

    /**
     * Отображает выбранную работу в правой колонке.
     * @param {Object} work - объект работы
     */
    function selectWork(work) {
        // Отменить текущее редактирование, если оно активно (из другого скрипта)
        if (window.InlineEdit && typeof window.InlineEdit.cancelEdit === 'function') {
            window.InlineEdit.cancelEdit();
        }

        // Обновляем URL (чтобы при перезагрузке страницы осталась выбранной)
        const url = new URL(window.location);
        url.searchParams.set('work_id', work.id);
        window.history.pushState({}, '', url);

        // Убираем класс selected у всех элементов списка
        document.querySelectorAll('.work-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Добавляем класс selected элементу с данным work.id
        const selectedItem = document.querySelector(`.work-item[data-work-id="${work.id}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        // Генерируем HTML для правой колонки и вставляем его
        const rightColumn = document.querySelector('.right-column');
        if (!rightColumn) return;

        rightColumn.innerHTML = renderWorkDetails(work);
    }

    /**
     * Генерирует HTML для правой колонки с деталями работы.
     * Теперь включает метод интерполяции и блок расчёта произвольного количества листов.
     * @param {Object} work - объект работы
     * @returns {string} HTML-строка
     */
    function renderWorkDetails(work) {
        return `
            <div class="section-header">
                <h2>
                    <i class="fas fa-info-circle"></i> Детали работы
                    <span class="selected-work">«${escapeHtml(work.name)}»</span>
                </h2>
                <div class="header-buttons">
                    <a href="/spravochnik_dopolnitelnyh_rabot/" 
                       class="btn-action btn-reset-filter" 
                       title="Сбросить выбор">
                        <i class="fas fa-times-circle"></i> Сбросить
                    </a>
                </div>
            </div>
            <div class="work-details-section">
                <div class="work-card">
                    <div class="work-header">
                        <span class="work-id">#${work.id}</span>
                        <div class="work-actions">
                            <button type="button"
                                    class="btn-action btn-delete-work"
                                    data-work-id="${work.id}"
                                    data-work-name="${escapeHtml(work.name)}">
                                <i class="fas fa-trash"></i> Удалить
                            </button>
                        </div>
                    </div>
                    <div class="work-body">
                        <!-- Название (редактируемое по двойному клику) -->
                        <div class="work-field">
                            <label>Название:</label>
                            <span class="editable-field spravochnik-name-field"
                                  data-field="name"
                                  data-work-id="${work.id}"
                                  data-original-value="${escapeHtml(work.name)}"
                                  title="Двойной клик для редактирования">
                                ${escapeHtml(work.name)}
                            </span>
                            <input type="text"
                                   class="inline-edit-input spravochnik-name-input"
                                   data-work-id="${work.id}"
                                   data-field="name"
                                   value="${escapeHtml(work.name)}"
                                   style="display: none;"
                                   placeholder="Введите название">
                        </div>
                        <!-- Цена (редактируемая по двойному клику) -->
                        <div class="work-field">
                            <label>Цена (руб):</label>
                            <span class="editable-field spravochnik-price-field"
                                  data-field="price"
                                  data-work-id="${work.id}"
                                  data-original-value="${escapeHtml(work.price)}"
                                  title="Двойной клик для редактирования">
                                ${escapeHtml(work.price)}
                            </span>
                            <input type="number"
                                   class="inline-edit-input spravochnik-price-input"
                                   data-work-id="${work.id}"
                                   data-field="price"
                                   value="${escapeHtml(work.price)}"
                                   step="0.01"
                                   min="0"
                                   style="display: none;"
                                   placeholder="0.00">
                        </div>

                        <!-- Формула расчёта (редактируемая по двойному клику) -->
                        <div class="work-field">
                            <label>Формула расчёта:</label>
                            <span class="editable-field spravochnik-formula-field"
                                  data-field="formula_type"
                                  data-work-id="${work.id}"
                                  data-original-value="${work.formula_type}"
                                  title="Двойной клик для редактирования">
                                ${escapeHtml(work.formula_display || '')}
                            </span>
                            <!-- Скрытый выпадающий список для редактирования -->
                            <select class="inline-edit-input spravochnik-formula-select"
                                    data-work-id="${work.id}"
                                    data-field="formula_type"
                                    style="display: none;">
                                ${generateFormulaOptions(work.formula_type)}
                            </select>
                        </div>

                        <!-- Линий реза (редактируемое по двойному клику) -->
                        <div class="work-field">
                            <label>Линий реза (по умолч.):</label>
                            <span class="editable-field spravochnik-lines-field"
                                  data-field="default_lines_count"
                                  data-work-id="${work.id}"
                                  data-original-value="${work.default_lines_count || '1'}"
                                  title="Двойной клик для редактирования">
                                ${escapeHtml(work.default_lines_count || '1')}
                            </span>
                            <input type="number"
                                   class="inline-edit-input spravochnik-lines-input"
                                   data-work-id="${work.id}"
                                   data-field="default_lines_count"
                                   value="${escapeHtml(work.default_lines_count || '1')}"
                                   min="1"
                                   step="1"
                                   style="display: none;"
                                   placeholder="1">
                        </div>

                        <!-- Изделий на листе (редактируемое по двойному клику) -->
                        <div class="work-field">
                            <label>Изделий на листе (по умолч.):</label>
                            <span class="editable-field spravochnik-items-field"
                                  data-field="default_items_per_sheet"
                                  data-work-id="${work.id}"
                                  data-original-value="${work.default_items_per_sheet || '1'}"
                                  title="Двойной клик для редактирования">
                                ${escapeHtml(work.default_items_per_sheet || '1')}
                            </span>
                            <input type="number"
                                   class="inline-edit-input spravochnik-items-input"
                                   data-work-id="${work.id}"
                                   data-field="default_items_per_sheet"
                                   value="${escapeHtml(work.default_items_per_sheet || '1')}"
                                   min="1"
                                   step="1"
                                   style="display: none;"
                                   placeholder="1">
                        </div>

                        <!-- Метод интерполяции (только для просмотра, можно будет добавить редактирование позже) -->
                        <div class="work-field">
                            <label>Метод интерполяции:</label>
                            <span class="readonly-field">
                                ${escapeHtml(work.interpolation_method_display || 'Линейная')}
                            </span>
                        </div>

                        <!-- Даты (только для просмотра) -->
                        <div class="work-field">
                            <label>Дата создания:</label>
                            <span class="readonly-field">${escapeHtml(work.created_at)}</span>
                        </div>
                        <div class="work-field">
                            <label>Последнее изменение:</label>
                            <span class="readonly-field">${escapeHtml(work.updated_at)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- БЛОК РАСЧЁТА ПРОИЗВОЛЬНОГО КОЛИЧЕСТВА ЛИСТОВ (НОВЫЙ) -->
            <div class="arbitrary-calculation-section" style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
                <h3><i class="fas fa-calculator"></i> Расчёт для произвольного количества листов</h3>
                <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <input type="number" id="arbitrary-sheets" min="1" step="1" value="100" 
                           style="width: 150px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;"
                           placeholder="Кол-во листов">
                    <button id="calculate-arbitrary-btn" class="btn-action" style="padding: 8px 15px;">
                        <i class="fas fa-play"></i> Рассчитать
                    </button>
                    <div id="arbitrary-result" style="font-weight: bold; font-size: 1.2rem; margin-left: 15px;">
                        <!-- сюда будет выведен результат -->
                    </div>
                </div>
                <p class="text-muted" style="margin-top: 10px; font-size: 0.9rem;">
                    Используется метод интерполяции: <strong>${escapeHtml(work.interpolation_method_display || 'Линейная')}</strong>
                </p>
            </div>
        `;
    }

    /**
     * Генерирует опции для выпадающего списка формул.
     * @param {number} selectedValue - текущее значение
     * @returns {string} HTML-строк с опциями
     */
    function generateFormulaOptions(selectedValue) {
        // Список формул должен строго соответствовать FORMULA_CHOICES из модели Work.
        // Каждый элемент: { value: числовой код, label: отображаемый текст }
        const formulas = [
            { value: 1, label: 'Фиксированная цена' },
            { value: 2, label: 'Тираж × Цена' },
            { value: 3, label: 'Цена × Количество листов × (Количество резов × Коэффициент)' }, // обновлено
            { value: 4, label: 'Количество листов × Цена × Количество резов (логарифмическая)' }, // обновлено
            { value: 5, label: 'Количество изделий на листе × Цена × Количество листов' },
            { value: 6, label: 'Количество изделий на листе × Цена × Тираж' }
        ];

        let options = '';
        for (let f of formulas) {
            // Если текущее значение совпадает с кодом, добавляем атрибут selected
            const selectedAttr = (f.value == selectedValue) ? 'selected' : '';
            options += `<option value="${f.value}" ${selectedAttr}>${escapeHtml(f.label)}</option>`;
        }
        return options;
    }

    /**
     * Очищает правую колонку (показывает сообщение о необходимости выбора).
     */
    function clearRightColumn() {
        // Отменить текущее редактирование, если оно активно
        if (window.InlineEdit && typeof window.InlineEdit.cancelEdit === 'function') {
            window.InlineEdit.cancelEdit();
        }

        const rightColumn = document.querySelector('.right-column');
        if (!rightColumn) return;

        rightColumn.innerHTML = `
            <div class="section-header">
                <h2><i class="fas fa-info-circle"></i> Детали работы</h2>
                <div class="header-buttons"></div>
            </div>
            <div class="empty-message">
                <i class="fas fa-hand-pointer"></i>
                Выберите работу слева для просмотра и редактирования.
            </div>
        `;
    }

    /**
     * Обработка удаления работы (вызывается через делегирование).
     * @param {HTMLElement} btn - кнопка удаления
     */
    function handleDeleteWork(btn) {
        const workId = btn.getAttribute('data-work-id');
        const workName = btn.getAttribute('data-work-name');

        if (!confirm(`Удалить работу «${workName}»?`)) return;

        // Блокируем кнопку
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        // Отправляем запрос на удаление
        fetch(`/spravochnik_dopolnitelnyh_rabot/delete/${workId}/`, {
            method: 'POST',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCookie('csrftoken')
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showNotification(data.message, 'success');
                // Удаляем элемент из списка
                const workItem = document.querySelector(`.work-item[data-work-id="${workId}"]`);
                if (workItem) workItem.remove();

                // Если текущая выбранная работа удалена – очищаем правую колонку и URL
                if (window.location.search.includes(`work_id=${workId}`)) {
                    const url = new URL(window.location);
                    url.searchParams.delete('work_id');
                    window.history.pushState({}, '', url);
                    clearRightColumn();
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
     * Валидация формы на клиенте.
     * @param {HTMLFormElement} form - форма
     * @returns {boolean} true, если валидация пройдена
     */
    function validateForm(form) {
        let isValid = true;
        const nameInput = form.querySelector('#spravochnik-name');
        const priceInput = form.querySelector('#spravochnik-price');

        // Проверка названия
        if (nameInput && !nameInput.value.trim()) {
            showFieldError(nameInput, 'Введите название работы');
            isValid = false;
        } else {
            clearFieldError(nameInput);
        }

        // Проверка цены
        if (priceInput) {
            const price = parseFloat(priceInput.value);
            if (isNaN(price) || price < 0) {
                showFieldError(priceInput, 'Введите корректную цену (≥ 0)');
                isValid = false;
            } else {
                clearFieldError(priceInput);
            }
        }
        return isValid;
    }

    /**
     * Показывает ошибку под полем.
     * @param {HTMLElement} field - элемент поля
     * @param {string} message - текст ошибки
     */
    function showFieldError(field, message) {
        clearFieldError(field);
        field.classList.add('error');
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.color = '#dc3545';
        errorDiv.style.fontSize = '0.85rem';
        errorDiv.style.marginTop = '0.25rem';
        errorDiv.textContent = message;
        field.parentNode.appendChild(errorDiv);
    }

    /**
     * Убирает ошибку под полем.
     * @param {HTMLElement} field - элемент поля
     */
    function clearFieldError(field) {
        field.classList.remove('error');
        const existing = field.parentNode.querySelector('.error-message');
        if (existing) existing.remove();
    }

    /**
     * Отображает ошибки, полученные от сервера, под соответствующими полями.
     * @param {HTMLFormElement} form - форма
     * @param {Object} errors - словарь ошибок (поле: список сообщений)
     */
    function displayFormErrors(form, errors) {
        // Удаляем старые ошибки
        form.querySelectorAll('.error-message').forEach(el => el.remove());
        form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));

        // Карта соответствия имён полей из модели и их ID в HTML
        const fieldIdMap = {
            'name': 'spravochnik-name',
            'price': 'spravochnik-price',
            'formula_type': 'spravochnik-formula-type',
            'interpolation_method': 'spravochnik-interpolation-method', // добавлено
            'default_lines_count': 'spravochnik-lines-count',
            'default_items_per_sheet': 'spravochnik-items-per-sheet'
        };

        // Для каждого поля с ошибкой
        for (const field in errors) {
            // Получаем правильный id из карты
            const inputId = fieldIdMap[field];
            if (!inputId) continue; // если поле не найдено в карте, пропускаем
            const input = form.querySelector(`#${inputId}`);
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
     * Загружает с сервера обновлённые данные для текущей выбранной работы
     * и обновляет правую колонку. Используется для синхронизации между вкладками.
     */
    function reloadCurrentWorkFromServer() {
        // Получаем ID текущей выбранной работы из URL
        const urlParams = new URLSearchParams(window.location.search);
        const workId = urlParams.get('work_id');
        if (!workId) return; // нет выбранной работы

        // Делаем AJAX-запрос к API для получения данных работы
        fetch(`/spravochnik_dopolnitelnyh_rabot/api/get/${workId}/`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Обновляем правую колонку, используя существующую функцию renderWorkDetails
                    const rightColumn = document.querySelector('.right-column');
                    if (rightColumn) {
                        rightColumn.innerHTML = renderWorkDetails(data.work);
                    }
                    // Также обновляем элемент в списке слева (название и цена)
                    updateWorkInList(data.work);
                }
            })
            .catch(error => console.error('Ошибка при обновлении данных:', error));
    }

    /**
     * Обновляет элемент работы в списке слева (используется после редактирования).
     * @param {Object} workData - обновлённые данные работы
     */
    function updateWorkInList(workData) {
        const workItem = document.querySelector(`.work-item[data-work-id="${workData.id}"]`);
        if (!workItem) return;

        const nameSpan = workItem.querySelector('.work-name');
        if (nameSpan) {
            // Сохраняем иконку, обновляем текст
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

    /**
     * Показывает всплывающее уведомление.
     * @param {string} message - текст
     * @param {string} type - тип (success, error, warning, info)
     */
    function showNotification(message, type = 'info') {
        // Удаляем предыдущие уведомления
        document.querySelectorAll('.notification').forEach(el => el.remove());

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        // Автоматически удаляем через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 5000);
    }

    /**
     * Показывает сообщения Django (flash-сообщения) как уведомления.
     */
    function showDjangoMessages() {
        const container = document.querySelector('.django-messages');
        if (!container) return;
        container.querySelectorAll('.django-message').forEach(msg => {
            const text = msg.textContent.trim();
            const type = msg.getAttribute('data-type') || 'info';
            if (text) showNotification(text, type);
        });
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
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }

    /**
     * Экранирование HTML-спецсимволов для предотвращения XSS.
     * Принимает любое значение, преобразует в строку.
     * @param {*} unsafe - входное значение
     * @returns {string} безопасная строка
     */
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) {
            return '';
        }
        const str = String(unsafe);
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Публичное API (доступные извне функции)
    return {
        init: init,
        toggleForm: toggleForm,
        clearForm: clearForm,
        showNotification: showNotification,
        reloadCurrentWorkFromServer: reloadCurrentWorkFromServer
    };
})();

// Запуск инициализации после полной загрузки DOM
document.addEventListener('DOMContentLoaded', SpravochnikDopRabot.init);