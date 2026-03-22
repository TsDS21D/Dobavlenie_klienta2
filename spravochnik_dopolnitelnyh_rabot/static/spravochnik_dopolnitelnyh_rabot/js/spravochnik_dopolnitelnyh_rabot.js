/*
spravochnik_dopolnitelnyh_rabot.js
Основной JavaScript для справочника дополнительных работ.
Управление формой добавления, AJAX-запросами, удалением, уведомлениями.
Все функции и переменные находятся в объекте SpravochnikDopRabot.

ИСПРАВЛЕНО:
  - В форму добавления добавлены поля cost и markup_percent.
  - Функция handleAddFormSubmit теперь передаёт cost и markup_percent.
  - Функция renderWorkDetails отображает cost и markup_percent.
  - Добавлена функция updateCalculatedCost для отображения расчётной себестоимости.
  - Добавлен вызов toggleCostFieldVisibility при загрузке страницы.
  - Добавлены отладочные console.log.
*/

// Создаём объект SpravochnikDopRabot, используя немедленно вызываемую функцию (IIFE),
// чтобы не засорять глобальную область видимости. Все внутренние переменные и функции
// остаются приватными, наружу выходят только те, что перечислены в return.
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
            if (deleteBtn) handleDeleteWork(deleteBtn);
        });

        // Слушаем событие изменения формулы (отправляется из inline-edit)
        document.addEventListener('formulaTypeChanged', function(e) {
            // Если событие содержит ID работы, совпадающий с текущим ID в скрытом поле,
            // обновляем значение скрытого поля и пересчитываем себестоимость.
            if (e.detail && e.detail.workId == document.getElementById('current-work-id')?.value) {
                document.getElementById('current-formula-type').value = e.detail.formulaType;
                toggleCostFieldVisibility(); // переключаем видимость полей
            }
        });

        // Отображение сообщений Django (flash-сообщения) как уведомлений
        showDjangoMessages();

        // ===== ДОБАВЛЕНО: при загрузке страницы, если есть выбранная работа, обновляем себестоимость =====
        setTimeout(() => {
            if (document.getElementById('current-work-id')) {
                console.log('🔄 Найдена выбранная работа, переключаем видимость полей себестоимости');
                toggleCostFieldVisibility();
            }
        }, 100);
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
            formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            const firstInput = formSection.querySelector('input, textarea, select');
            if (firstInput) firstInput.focus();
        } else {
            formSection.style.display = 'none';
            addBtn.innerHTML = '+ Добавить работу';
            addBtn.classList.remove('btn-cancel');
            clearForm();
        }
    }

    /**
     * Очистка формы добавления от введённых данных и ошибок.
     */
    function clearForm() {
        const form = document.getElementById('spravochnik-add-form');
        if (!form) return;
        form.reset();
        form.querySelectorAll('.error-message').forEach(el => el.remove());
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

        const costInput = document.getElementById('spravochnik-cost');
        const markupInput = document.getElementById('spravochnik-markup-percent');
        if (costInput && costInput.value !== '') {
            formData.set('cost', costInput.value.replace(',', '.'));
        }
        if (markupInput && markupInput.value !== '') {
            formData.set('markup_percent', markupInput.value.replace(',', '.'));
        }

        const priceValue = formData.get('price');
        if (priceValue && priceValue.includes(',')) {
            formData.set('price', priceValue.replace(',', '.'));
        }
        const kLinesValue = formData.get('k_lines');
        if (kLinesValue && kLinesValue.includes(',')) {
            formData.set('k_lines', kLinesValue.replace(',', '.'));
        }

        if (!formData.has('formula_type') || formData.get('formula_type') === '') {
            formData.set('formula_type', '1');
        }
        if (!formData.has('default_lines_count') || formData.get('default_lines_count') === '') {
            formData.set('default_lines_count', '1');
        }
        if (!formData.has('default_items_per_sheet') || formData.get('default_items_per_sheet') === '') {
            formData.set('default_items_per_sheet', '1');
        }

        const interpolationSelect = document.getElementById('spravochnik-interpolation-method');
        if (interpolationSelect) {
            formData.set('interpolation_method', interpolationSelect.value);
        }

        if (!validateForm(form)) return;

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
                showNotification('Работа успешно добавлена!', 'success');
                clearForm();
                toggleForm();
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

        const urlParams = new URLSearchParams(window.location.search);
        const searchQuery = urlParams.get('search') || '';

        const workItem = document.createElement('a');
        workItem.href = `?work_id=${work.id}${searchQuery ? '&search=' + encodeURIComponent(searchQuery) : ''}`;
        workItem.className = 'work-item';
        workItem.setAttribute('data-work-id', work.id);

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

        container.prepend(workItem);
    }

    /**
     * Отображает выбранную работу в правой колонке.
     * @param {Object} work - объект работы
     */
    function selectWork(work) {
        if (window.InlineEdit && typeof window.InlineEdit.cancelEdit === 'function') {
            window.InlineEdit.cancelEdit();
        }

        const url = new URL(window.location);
        url.searchParams.set('work_id', work.id);
        window.history.pushState({}, '', url);

        document.querySelectorAll('.work-item').forEach(item => {
            item.classList.remove('selected');
        });

        const selectedItem = document.querySelector(`.work-item[data-work-id="${work.id}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        const rightColumn = document.querySelector('.right-column');
        if (!rightColumn) return;

        rightColumn.innerHTML = renderWorkDetails(work);

        // После вставки HTML вызываем переключение видимости и расчёт себестоимости
        toggleCostFieldVisibility();
        // updateCalculatedCost вызывается внутри toggleCostFieldVisibility для формул != 1
    }

    /**
     * Генерирует HTML для правой колонки с деталями работы.
     * @param {Object} work - объект работы
     * @returns {string} HTML-строка
     */
    function renderWorkDetails(work) {
        const formulaOptions = generateFormulaOptions(work.formula_type);

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
                        <!-- Поле "Название" (редактируемое) -->
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

                        <!-- Поле "Себестоимость" (редактируемое, только для формулы 1) -->
                        <div class="work-field" id="cost-edit-field" style="display: none;">
                            <label>Себестоимость (руб):</label>
                            <span class="editable-field spravochnik-cost-field"
                                  data-field="cost"
                                  data-work-id="${work.id}"
                                  data-original-value="${work.cost}"
                                  title="Двойной клик для редактирования">
                                ${work.cost}
                            </span>
                            <input type="number"
                                   class="inline-edit-input spravochnik-cost-input"
                                   data-work-id="${work.id}"
                                   data-field="cost"
                                   value="${work.cost}"
                                   step="0.01"
                                   min="0"
                                   style="display: none;">
                        </div>

                        <!-- Поле "Себестоимость" (расчётное, для формул 2-6) -->
                        <div class="work-field" id="cost-calc-field">
                            <label>Себестоимость (руб):</label>
                            <span id="calculated-cost-display" class="readonly-field">--</span>
                            <input type="hidden" id="current-work-id" value="${work.id}">
                            <input type="hidden" id="current-formula-type" value="${work.formula_type}">
                        </div>

                        <!-- Поле "Наценка %" -->
                        <div class="work-field">
                            <label>Наценка (%):</label>
                            <span class="editable-field spravochnik-markup-field"
                                  data-field="markup_percent"
                                  data-work-id="${work.id}"
                                  data-original-value="${work.markup_percent}"
                                  title="Двойной клик для редактирования">
                                ${work.markup_percent}
                            </span>
                            <input type="number"
                                   class="inline-edit-input spravochnik-markup-input"
                                   data-work-id="${work.id}"
                                   data-field="markup_percent"
                                   value="${work.markup_percent}"
                                   step="0.01"
                                   min="0"
                                   style="display: none;">
                        </div>

                        <!-- Поле "Цена" (только чтение) -->
                        <div class="work-field">
                            <label>Цена (руб):</label>
                            <span class="readonly-field">${work.price}</span>
                        </div>

                        <!-- Поле "Формула расчёта" -->
                        <div class="work-field">
                            <label>Формула расчёта:</label>
                            <span class="editable-field spravochnik-formula-field"
                                  data-field="formula_type"
                                  data-work-id="${work.id}"
                                  data-original-value="${work.formula_type}"
                                  title="Двойной клик для редактирования">
                                ${escapeHtml(work.formula_display || '')}
                            </span>
                            <select class="inline-edit-input spravochnik-formula-select"
                                    data-work-id="${work.id}"
                                    data-field="formula_type"
                                    style="display: none;">
                                ${formulaOptions}
                            </select>
                        </div>

                        <!-- Поле "Линий реза" -->
                        <div class="work-field">
                            <label>Линий реза (по умолч.):</label>
                            <span class="editable-field spravochnik-lines-field"
                                  data-field="default_lines_count"
                                  data-work-id="${work.id}"
                                  data-original-value="${work.default_lines_count || '1'}"
                                  title="Двойной клик для редактирования">
                                ${work.default_lines_count || '1'}
                            </span>
                            <input type="number"
                                   class="inline-edit-input spravochnik-lines-input"
                                   data-work-id="${work.id}"
                                   data-field="default_lines_count"
                                   value="${work.default_lines_count || '1'}"
                                   min="1"
                                   step="1"
                                   style="display: none;"
                                   placeholder="1">
                        </div>

                        <!-- Поле "Изделий на листе" -->
                        <div class="work-field">
                            <label>Изделий на листе (по умолч.):</label>
                            <span class="editable-field spravochnik-items-field"
                                  data-field="default_items_per_sheet"
                                  data-work-id="${work.id}"
                                  data-original-value="${work.default_items_per_sheet || '1'}"
                                  title="Двойной клик для редактирования">
                                ${work.default_items_per_sheet || '1'}
                            </span>
                            <input type="number"
                                   class="inline-edit-input spravochnik-items-input"
                                   data-work-id="${work.id}"
                                   data-field="default_items_per_sheet"
                                   value="${work.default_items_per_sheet || '1'}"
                                   min="1"
                                   step="1"
                                   style="display: none;"
                                   placeholder="1">
                        </div>

                        <!-- Поле "Коэффициент резов" -->
                        <div class="work-field">
                            <label>Коэффициент резов:</label>
                            <span class="editable-field spravochnik-k-lines-field"
                                  data-field="k_lines"
                                  data-work-id="${work.id}"
                                  data-original-value="${work.k_lines}"
                                  title="Двойной клик для редактирования">
                                ${work.k_lines}
                            </span>
                            <input type="number"
                                   class="inline-edit-input spravochnik-k-lines-input"
                                   data-work-id="${work.id}"
                                   data-field="k_lines"
                                   value="${work.k_lines}"
                                   step="0.1"
                                   min="0.1"
                                   style="display: none;"
                                   placeholder="2.0">
                        </div>

                        <!-- Поле "Метод интерполяции" -->
                        <div class="work-field">
                            <label>Метод интерполяции:</label>
                            <span class="readonly-field">
                                ${escapeHtml(work.interpolation_method_display || 'Линейная')}
                            </span>
                        </div>

                        <!-- Даты -->
                        <div class="work-field">
                            <label>Дата создания:</label>
                            <span class="readonly-field">${work.created_at}</span>
                        </div>
                        <div class="work-field">
                            <label>Последнее изменение:</label>
                            <span class="readonly-field">${work.updated_at}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Генерирует опции для выпадающего списка формул.
     */
    function generateFormulaOptions(selectedValue) {
        const formulas = [
            { value: 1, label: 'Фиксированная цена' },
            { value: 2, label: 'Тираж × Цена' },
            { value: 3, label: 'Цена × Количество листов × (Количество резов × Коэффициент)' },
            { value: 4, label: 'Количество листов × Цена × Количество резов (логарифмическая)' },
            { value: 5, label: 'Количество изделий на листе × Цена × Количество листов' },
            { value: 6, label: 'Количество изделий на листе × Цена × Тираж' }
        ];
        let options = '';
        for (let f of formulas) {
            const selectedAttr = (f.value == selectedValue) ? 'selected' : '';
            options += `<option value="${f.value}" ${selectedAttr}>${escapeHtml(f.label)}</option>`;
        }
        return options;
    }

    /**
     * Очищает правую колонку (показывает сообщение о необходимости выбора).
     */
    function clearRightColumn() {
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
     * Обработка удаления работы.
     */
    function handleDeleteWork(btn) {
        const workId = btn.getAttribute('data-work-id');
        const workName = btn.getAttribute('data-work-name');

        if (!confirm(`Удалить работу «${workName}»?`)) return;

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

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
                const workItem = document.querySelector(`.work-item[data-work-id="${workId}"]`);
                if (workItem) workItem.remove();

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
     */
    function validateForm(form) {
        let isValid = true;
        const nameInput = form.querySelector('#spravochnik-name');
        const costInput = form.querySelector('#spravochnik-cost');
        const markupInput = form.querySelector('#spravochnik-markup-percent');

        if (nameInput && !nameInput.value.trim()) {
            showFieldError(nameInput, 'Введите название работы');
            isValid = false;
        } else {
            clearFieldError(nameInput);
        }

        if (costInput) {
            const cost = parseFloat(costInput.value);
            if (isNaN(cost) || cost < 0) {
                showFieldError(costInput, 'Введите корректную себестоимость (≥ 0)');
                isValid = false;
            } else {
                clearFieldError(costInput);
            }
        }

        if (markupInput) {
            const markup = parseFloat(markupInput.value);
            if (isNaN(markup) || markup < 0) {
                showFieldError(markupInput, 'Введите корректную наценку (≥ 0)');
                isValid = false;
            } else {
                clearFieldError(markupInput);
            }
        }

        return isValid;
    }

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

    function clearFieldError(field) {
        field.classList.remove('error');
        const existing = field.parentNode.querySelector('.error-message');
        if (existing) existing.remove();
    }

    function displayFormErrors(form, errors) {
        form.querySelectorAll('.error-message').forEach(el => el.remove());
        form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));

        const fieldIdMap = {
            'name': 'spravochnik-name',
            'cost': 'spravochnik-cost',
            'markup_percent': 'spravochnik-markup-percent',
            'price': 'spravochnik-price',
            'formula_type': 'spravochnik-formula-type',
            'interpolation_method': 'spravochnik-interpolation-method',
            'default_lines_count': 'spravochnik-lines-count',
            'default_items_per_sheet': 'spravochnik-items-per-sheet'
        };

        for (const field in errors) {
            const inputId = fieldIdMap[field];
            if (!inputId) continue;
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
     * Загружает с сервера обновлённые данные для текущей выбранной работы.
     */
    function reloadCurrentWorkFromServer() {
        const urlParams = new URLSearchParams(window.location.search);
        const workId = urlParams.get('work_id');
        if (!workId) return;

        fetch(`/spravochnik_dopolnitelnyh_rabot/api/get/${workId}/`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const rightColumn = document.querySelector('.right-column');
                    if (rightColumn) {
                        rightColumn.innerHTML = renderWorkDetails(data.work);
                        updateCalculatedCost();
                    }
                    updateWorkInList(data.work);
                }
            })
            .catch(error => console.error('Ошибка при обновлении данных:', error));
    }

    /**
     * Обновляет элемент работы в списке слева.
     */
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

    /**
     * Переключает видимость полей себестоимости в зависимости от формулы.
     */
    function toggleCostFieldVisibility() {
        const formulaType = parseInt(document.getElementById('current-formula-type')?.value);
        const editField = document.getElementById('cost-edit-field');
        const calcField = document.getElementById('cost-calc-field');

        console.log(`🔄 toggleCostFieldVisibility: formulaType = ${formulaType}, editField = ${!!editField}, calcField = ${!!calcField}`);

        if (!editField || !calcField) {
            console.warn('⚠️ toggleCostFieldVisibility: не найдены поля cost-edit-field или cost-calc-field');
            return;
        }

        if (formulaType === 1) {
            editField.style.display = 'block';
            calcField.style.display = 'none';
            console.log('✅ Формула 1: показано редактируемое поле себестоимости');
        } else {
            editField.style.display = 'none';
            calcField.style.display = 'block';
            console.log('✅ Формула != 1: показано расчётное поле себестоимости, вызываем updateCalculatedCost()');
            updateCalculatedCost();
        }
    }

    /**
     * Обновляет отображение рассчитанной себестоимости.
     */
    function updateCalculatedCost() {
        const workId = document.getElementById('current-work-id')?.value;
        const formulaType = parseInt(document.getElementById('current-formula-type')?.value);
        console.log(`📊 updateCalculatedCost: workId=${workId}, formulaType=${formulaType}`);

        if (!workId || isNaN(formulaType)) return;

        if (formulaType === 1) return;

        const usesCirculation = [2, 3].includes(formulaType);
        const paramValue = 1;
        const url = usesCirculation
            ? `/spravochnik_dopolnitelnyh_rabot/api/calculate_arbitrary_circulation_price/${workId}/?arbitrary_circulation=${paramValue}`
            : `/spravochnik_dopolnitelnyh_rabot/api/calculate_arbitrary_sheets_price/${workId}/?arbitrary_sheets=${paramValue}`;

        console.log(`📡 Запрос к ${url}`);

        fetch(url, {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(response => response.json())
        .then(data => {
            console.log('📥 Ответ сервера:', data);
            if (data.success) {
                const costDisplay = document.getElementById('calculated-cost-display');
                if (costDisplay) {
                    costDisplay.textContent = data.cost_display;
                    console.log(`✅ Себестоимость обновлена: ${data.cost_display}`);
                } else {
                    console.warn('⚠️ Элемент #calculated-cost-display не найден');
                }
            } else {
                console.error('❌ Ошибка расчёта:', data.error);
                const costDisplay = document.getElementById('calculated-cost-display');
                if (costDisplay) costDisplay.textContent = 'Ошибка расчёта';
            }
        })
        .catch(error => {
            console.error('❌ Ошибка сети:', error);
            const costDisplay = document.getElementById('calculated-cost-display');
            if (costDisplay) costDisplay.textContent = 'Ошибка сети';
        });
    }

    /**
     * Показывает всплывающее уведомление.
     */
    function showNotification(message, type = 'info') {
        document.querySelectorAll('.notification').forEach(el => el.remove());

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 5000);
    }

    /**
     * Показывает сообщения Django.
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
     * Экранирование HTML-спецсимволов.
     */
    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        const str = String(unsafe);
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Публичное API
    return {
        init: init,
        toggleForm: toggleForm,
        clearForm: clearForm,
        showNotification: showNotification,
        reloadCurrentWorkFromServer: reloadCurrentWorkFromServer,
        updateCalculatedCost: updateCalculatedCost
    };
})();

// Запуск инициализации после полной загрузки DOM
document.addEventListener('DOMContentLoaded', SpravochnikDopRabot.init);