/*
spravochnik_dopolnitelnyh_rabot.js
Основной JavaScript для справочника дополнительных работ.
Управление формой добавления, AJAX-запросами, удалением, уведомлениями.
Реализовано отображение трёх блоков себестоимости и цены для разных типов формул.
Блоки отображаются постоянно, обновляются при загрузке работы и при изменении данных.

ИСПРАВЛЕНО: исправлены URL для запросов расчёта (были неверные пути).
*/

const SpravochnikDopRabot = (function() {
    let isFormVisible = false;

    function init() {
        console.log('Справочник дополнительных работ: инициализация...');

        const addBtn = document.getElementById('spravochnik-add-btn');
        if (addBtn) addBtn.addEventListener('click', toggleForm);

        const addForm = document.getElementById('spravochnik-add-form');
        if (addForm) addForm.addEventListener('submit', handleAddFormSubmit);

        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.form.submit();
                }
            });
        }

        document.addEventListener('click', function(e) {
            const deleteBtn = e.target.closest('.btn-delete-work');
            if (deleteBtn) handleDeleteWork(deleteBtn);
        });

        // Слушаем событие изменения формулы (отправляется из inline-edit)
        document.addEventListener('formulaTypeChanged', function(e) {
            if (e.detail && e.detail.workId == document.getElementById('current-work-id')?.value) {
                document.getElementById('current-formula-type').value = e.detail.formulaType;
                // При изменении формулы обновляем расчётные блоки (они не зависят от текущей формулы)
                updateAllCalculatedValues();
            }
        });

        // Слушаем событие обновления данных работы (из справочника или при изменении цены)
        document.addEventListener('spravochnikWorkUpdated', function(e) {
            if (e.detail && e.detail.workId == document.getElementById('current-work-id')?.value) {
                updateAllCalculatedValues();
            }
        });

        showDjangoMessages();

        // При загрузке, если есть выбранная работа, обновляем расчётные значения
        setTimeout(() => {
            if (document.getElementById('current-work-id')) {
                updateAllCalculatedValues();
            }
        }, 100);
    }

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

    function clearForm() {
        const form = document.getElementById('spravochnik-add-form');
        if (!form) return;
        form.reset();
        form.querySelectorAll('.error-message').forEach(el => el.remove());
        form.querySelectorAll('.form-control.error').forEach(el => el.classList.remove('error'));
    }

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
        // После вставки HTML обновляем расчётные значения
        updateAllCalculatedValues();
    }

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
                        <!-- Поле "Название" -->
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

                        <!-- ========== БЛОК 1: Для формулы 1 ========== -->
                        <div class="work-field-group">
                            <h4>📌 Для формулы 1 (фиксированная цена)</h4>
                            <div class="work-field">
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
                            <div class="work-field">
                                <label>Цена (руб):</label>
                                <span class="readonly-field">${work.price}</span>
                            </div>
                        </div>

                        <!-- ========== БЛОК 2: Для формул 2 и 3 ========== -->
                        <div class="work-field-group">
                            <h4>📌 Для формул 2 и 3 (зависимость от тиража)</h4>
                            <div class="work-field">
                                <label>Себестоимость (для тиража 1):</label>
                                <span id="calculated-cost-circulation-display" class="readonly-field">--</span>
                            </div>
                            <div class="work-field">
                                <label>Цена (руб):</label>
                                <span id="calculated-price-circulation-display" class="readonly-field">--</span>
                            </div>
                        </div>

                        <!-- ========== БЛОК 3: Для формул 4,5,6 ========== -->
                        <div class="work-field-group">
                            <h4>📌 Для формул 4,5,6 (зависимость от листов)</h4>
                            <div class="work-field">
                                <label>Себестоимость (для 1 листа):</label>
                                <span id="calculated-cost-sheets-display" class="readonly-field">--</span>
                            </div>
                            <div class="work-field">
                                <label>Цена (руб):</label>
                                <span id="calculated-price-sheets-display" class="readonly-field">--</span>
                            </div>
                        </div>

                        <!-- Скрытые поля для передачи данных -->
                        <input type="hidden" id="current-work-id" value="${work.id}">
                        <input type="hidden" id="current-formula-type" value="${work.formula_type}">

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
                        updateAllCalculatedValues();
                    }
                    updateWorkInList(data.work);
                }
            })
            .catch(error => console.error('Ошибка при обновлении данных:', error));
    }

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
     * Обновляет все расчётные блоки: для тиража 1 и для 1 листа.
     * Вызывается при загрузке работы и при любых изменениях, влияющих на эти значения.
     */
    function updateAllCalculatedValues() {
        updateCalculatedForCirculation();
        updateCalculatedForSheets();
    }

    /**
     * Запрашивает себестоимость и цену для тиража = 1 (формулы 2,3)
     * и обновляет соответствующие поля.
     * ИСПРАВЛЕНО: используется правильный URL из urls.py.
     */
    function updateCalculatedForCirculation() {
        const workId = document.getElementById('current-work-id')?.value;
        if (!workId) return;

        // Внимание: в urls.py путь: api/calculate_arbitrary_circulation_price/<int:work_id>/
        const url = `/spravochnik_dopolnitelnyh_rabot/api/calculate_arbitrary_circulation_price/${workId}/?arbitrary_circulation=1`;

        fetch(url, { method: 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    const costSpan = document.getElementById('calculated-cost-circulation-display');
                    const priceSpan = document.getElementById('calculated-price-circulation-display');
                    if (costSpan) costSpan.textContent = data.cost_display;
                    if (priceSpan) priceSpan.textContent = data.final_price_display;
                } else {
                    console.error('Ошибка расчёта для тиража:', data.error);
                    const costSpan = document.getElementById('calculated-cost-circulation-display');
                    const priceSpan = document.getElementById('calculated-price-circulation-display');
                    if (costSpan) costSpan.textContent = 'Ошибка расчёта';
                    if (priceSpan) priceSpan.textContent = 'Ошибка расчёта';
                }
            })
            .catch(error => {
                console.error('Ошибка сети при загрузке данных для тиража:', error);
                const costSpan = document.getElementById('calculated-cost-circulation-display');
                const priceSpan = document.getElementById('calculated-price-circulation-display');
                if (costSpan) costSpan.textContent = 'Ошибка сети';
                if (priceSpan) priceSpan.textContent = 'Ошибка сети';
            });
    }

    /**
     * Запрашивает себестоимость и цену для 1 листа (формулы 4,5,6)
     * и обновляет соответствующие поля.
     * ИСПРАВЛЕНО: используется правильный URL из urls.py.
     */
    function updateCalculatedForSheets() {
        const workId = document.getElementById('current-work-id')?.value;
        if (!workId) return;

        // Внимание: в urls.py путь: api/calculate_arbitrary_price/<int:work_id>/
        const url = `/spravochnik_dopolnitelnyh_rabot/api/calculate_arbitrary_price/${workId}/?arbitrary_sheets=1`;

        fetch(url, { method: 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    const costSpan = document.getElementById('calculated-cost-sheets-display');
                    const priceSpan = document.getElementById('calculated-price-sheets-display');
                    if (costSpan) costSpan.textContent = data.cost_display;
                    if (priceSpan) priceSpan.textContent = data.final_price_display;
                } else {
                    console.error('Ошибка расчёта для листов:', data.error);
                    const costSpan = document.getElementById('calculated-cost-sheets-display');
                    const priceSpan = document.getElementById('calculated-price-sheets-display');
                    if (costSpan) costSpan.textContent = 'Ошибка расчёта';
                    if (priceSpan) priceSpan.textContent = 'Ошибка расчёта';
                }
            })
            .catch(error => {
                console.error('Ошибка сети при загрузке данных для листов:', error);
                const costSpan = document.getElementById('calculated-cost-sheets-display');
                const priceSpan = document.getElementById('calculated-price-sheets-display');
                if (costSpan) costSpan.textContent = 'Ошибка сети';
                if (priceSpan) priceSpan.textContent = 'Ошибка сети';
            });
    }

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

    function showDjangoMessages() {
        const container = document.querySelector('.django-messages');
        if (!container) return;
        container.querySelectorAll('.django-message').forEach(msg => {
            const text = msg.textContent.trim();
            const type = msg.getAttribute('data-type') || 'info';
            if (text) showNotification(text, type);
        });
    }

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

    return {
        init: init,
        toggleForm: toggleForm,
        clearForm: clearForm,
        showNotification: showNotification,
        reloadCurrentWorkFromServer: reloadCurrentWorkFromServer,
        updateAllCalculatedValues: updateAllCalculatedValues
    };
})();

document.addEventListener('DOMContentLoaded', SpravochnikDopRabot.init);