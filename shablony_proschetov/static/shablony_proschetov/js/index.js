/*
shablony_proschetov/static/shablony_proschetov/js/index.js
Интерактив страницы справочника шаблонов.

ОСНОВНЫЕ СЦЕНАРИИ:
- клик по категории → открывается всплывающая панель со списком её
  подкатегорий и шаблонов; дерево остаётся фиксированным (280px);
- клик по подкатегории внутри панели — заходим «внутрь» (панель
  перерисовывается содержимым подкатегории, добавляется запись в стек);
- кнопка «← Назад» и хлебные крошки — навигация по стеку;
- клик по шаблону (в дереве или панели) → превью справа;
- поиск → результаты показываются в той же панели;
- клик мимо панели и дерева — панель закрывается;
- кнопки «+» / «✎» / «✕» / «+ Категория» / «Переименовать шаблон» /
  «Удалить шаблон» / «Создать просчёт из шаблона» / «Сохранить шаблон»
  работают как раньше.
*/

"use strict";

var tplApp = {

    // Текущий выбранный id шаблона.
    currentTemplateId: null,
    // Кэш последнего JSON превью.
    currentTemplateData: null,

    // Колбэк, который вызовется при подтверждении модалки.
    modalOnConfirm: null,

    // Стек открытых категорий в панели.
    // Каждый элемент: { id: <string>, name: <string> }.
    // Нужен для кнопки «Назад» и хлебных крошек.
    popupStack: [],

    // ------------------------------------------------------------------
    // Инициализация.
    // ------------------------------------------------------------------
    init: function () {
        console.log('📚 init: страница шаблонов');

        // Клик по шаблону в дереве → превью.
        document.querySelectorAll('.tpl-template-item').forEach(function (el) {
            el.addEventListener('click', function () {
                const id = el.getAttribute('data-template-id');
                if (id) tplApp.selectTemplate(id);
            });
        });

        // Поле поиска.
        const searchInput = document.getElementById('tpl-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                tplApp.search(this.value);
            });
        }

        // Кнопка «Создать просчёт из шаблона».
        const createProschetBtn = document.getElementById('tpl-btn-create-proschet');
        if (createProschetBtn) {
            createProschetBtn.addEventListener('click', function () {
                tplApp.createProschetFromCurrentTemplate();
            });
        }

        // Кнопка «Переименовать / изменить комментарий».
        const renameTemplateBtn = document.getElementById('tpl-btn-rename-template');
        if (renameTemplateBtn) {
            renameTemplateBtn.addEventListener('click', function () {
                tplApp.openRenameTemplateModal();
            });
        }

        // Кнопка «Удалить шаблон».
        const deleteTemplateBtn = document.getElementById('tpl-btn-delete-template');
        if (deleteTemplateBtn) {
            deleteTemplateBtn.addEventListener('click', function () {
                tplApp.confirmDeleteTemplate();
            });
        }

        // «+ Категория» в панели инструментов — корневая категория.
        const addRootBtn = document.getElementById('tpl-btn-add-root-category');
        if (addRootBtn) {
            addRootBtn.addEventListener('click', function () {
                tplApp.openCreateCategoryModal(null);
            });
        }

        // Мини-кнопки на узлах дерева: + (подкатегория), ✎ (переименовать), ✕ (удалить).
        document.querySelectorAll('.tpl-btn-add-sub').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const catId = btn.getAttribute('data-category-id');
                tplApp.openCreateCategoryModal(catId);
            });
        });
        document.querySelectorAll('.tpl-btn-rename').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const catId = btn.getAttribute('data-category-id');
                const name = btn.getAttribute('data-category-name');
                tplApp.openRenameCategoryModal(catId, name);
            });
        });
        document.querySelectorAll('.tpl-btn-delete').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const catId = btn.getAttribute('data-category-id');
                const name = btn.getAttribute('data-category-name');
                tplApp.confirmDeleteCategory(catId, name);
            });
        });

        // Кнопки модального окна.
        document.getElementById('tpl-modal-close').addEventListener('click', function () { tplApp.closeModal(); });
        document.getElementById('tpl-modal-cancel').addEventListener('click', function () { tplApp.closeModal(); });
        document.getElementById('tpl-modal-confirm').addEventListener('click', function () { tplApp.confirmModal(); });
        document.getElementById('tpl-modal-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') tplApp.confirmModal();
            if (e.key === 'Escape') tplApp.closeModal();
        });
        document.getElementById('tpl-modal-overlay').addEventListener('click', function (e) {
            if (e.target === this) tplApp.closeModal();
        });

        // Кнопки всплывающей панели категории.
        const popupClose = document.getElementById('tpl-popup-close');
        if (popupClose) {
            popupClose.addEventListener('click', function () { tplApp.closePopup(); });
        }


        // Панель сохранения просчёта как шаблона.
        const savePanel = document.getElementById('tpl-save-panel');
        if (savePanel) {
            const btnConfirm = document.getElementById('tpl-save-confirm');
            const btnCancel  = document.getElementById('tpl-save-cancel');
            if (btnConfirm) btnConfirm.addEventListener('click', function () {
                tplApp.saveCurrentProschetAsTemplate();
            });
            if (btnCancel) btnCancel.addEventListener('click', function () {
                window.location.href = '/shablony/';
            });
        }

        // Обработчики клика по категориям (открытие панели).
        tplApp.setupTreeClick();

        // Клик вне панели и вне дерева — закрываем панель.
        // ВАЖНО: используем e.composedPath() вместо e.target.closest(...).
        // composedPath() фиксирует путь события в момент его возникновения
        // и НЕ ломается, если во время обработки элемента уже не стало в DOM.
        // Раньше из-за этого панель закрывалась сразу после клика по
        // подкатегории (элемент успевал перерисоваться до всплытия клика).
        document.addEventListener('click', function (e) {
            var path = (e.composedPath && e.composedPath()) || [];

            // Проверяем, был ли клик внутри панели или дерева.
            var insidePopup = path.some(function (el) {
                return el && el.id === 'tpl-category-popup';
            });
            var insideTree = path.some(function (el) {
                return el && el.classList && el.classList.contains('tpl-tree-pane');
            });

            if (insidePopup || insideTree) return;

            tplApp.closePopup();
        });

        // Восстанавливаем выделение последнего шаблона.
        tplApp.restoreLastSelectedTemplate();
    },

    // ==================================================================
    // ДЕРЕВО: КЛИК ПО КАТЕГОРИИ → ПАНЕЛЬ
    // ==================================================================

    /**
     * Вешаем обработчик клика на строку каждой категории.
     *
     * Логика (инлайн-раскрытие + панель для подкатегорий):
     * - Клик по КОРНЕВОЙ категории (level=0) — раскрывает её ветку инлайн
     *   (подкатегории и шаблоны видны прямо в дереве). Аккордеон: при
     *   раскрытии одной корневой остальные сворачиваются. Панель закрывается.
     * - Клик по ПОДКАТЕГОРИИ (level>=1) — открывает всплывающую панель
     *   с шаблонами этой подкатегории (без раскрытия ветки в дереве).
     */
    setupTreeClick: function () {
        document.querySelectorAll('.tpl-category-row').forEach(function (row) {
            row.addEventListener('click', function (e) {
                // Клики по мини-кнопкам +/✎/✕ не должны ничего делать.
                if (e.target.closest('.tpl-node-actions')) return;

                var node = row.closest('.tpl-tree-node');
                if (!node) return;

                var level = parseInt(node.getAttribute('data-node-level'), 10) || 0;

                // Для корневой категории — аккордеон + toggle ветки.
                if (level === 0) {
                    if (!node.classList.contains('expanded')) {
                        // Сворачиваем все другие корневые.
                        document.querySelectorAll('.tpl-tree-node[data-node-level="0"].expanded')
                            .forEach(function (other) {
                                if (other !== node) other.classList.remove('expanded');
                            });
                    }
                    node.classList.toggle('expanded');

                    // Если ветка свернулась повторным кликом — закрываем панель.
                    if (!node.classList.contains('expanded')) {
                        tplApp.closePopup();
                        return;
                    }
                }

                // И для корневой, и для подкатегории — открываем панель
                // с прямыми шаблонами этой категории.
                tplApp.openCategoryPanel(node);
            });
        });

        // Помечаем узлы с вложенным содержимым классом has-children —
        // для индикатора ▸/▾ рядом с именем.
        document.querySelectorAll('.tpl-tree-node').forEach(function (node) {
            var hasChildren = node.querySelector(':scope > .tpl-tree-children') !== null;
            var hasTemplates = node.querySelector(':scope > .tpl-templates-list') !== null;
            if (hasChildren || hasTemplates) {
                node.classList.add('has-children');
            }
        });
    },

    // ==================================================================
    // ПАНЕЛЬ: РЕНДЕР И НАВИГАЦИЯ
    // ==================================================================

    /**
     * Открывает всплывающую панель с прямыми шаблонами указанной
     * категории (любого уровня — корневой или подкатегории).
     *
     * @param {HTMLElement} node — DOM-узел .tpl-tree-node.
     */
    openCategoryPanel: function (node) {
        var popup = document.getElementById('tpl-category-popup');
        var body = document.getElementById('tpl-popup-body');
        var crumbs = document.getElementById('tpl-popup-breadcrumbs');
        if (!popup || !body || !crumbs) return;

        // Собираем путь от корня до этой подкатегории — для хлебных крошек.
        var path = this.getCategoryPath(node);

        // Собираем прямые шаблоны этой подкатегории (без подкатегорий).
        var templates = [];
        var tplList = node.querySelector(':scope > .tpl-templates-list');
        if (tplList) {
            tplList.querySelectorAll(':scope > .tpl-template-item').forEach(function (el) {
                var id = el.getAttribute('data-template-id');
                var nameEl = el.querySelector('.tpl-template-name');
                templates.push({
                    id: id,
                    name: nameEl ? nameEl.textContent : ''
                });
            });
        }

        // ===== Рендер тела панели =====
        var html = '';
        if (templates.length) {
            html += '<div class="tpl-popup-section-title">Шаблоны</div>';
            templates.forEach(function (t) {
                var active = (String(t.id) === String(tplApp.currentTemplateId)) ? ' active' : '';
                html += '<div class="tpl-popup-template' + active + '" data-template-id="' + t.id + '">' +
                            '<i class="fas fa-file-alt"></i>' +
                            '<span class="tpl-popup-template-name">' + t.name + '</span>' +
                        '</div>';
            });
        } else {
            html += '<div class="tpl-popup-empty">В этой категории пока нет шаблонов.</div>';
        }
        body.innerHTML = html;

        // ===== Хлебные крошки =====
        var crumbHtml = '';
        path.forEach(function (item, idx) {
            if (idx > 0) crumbHtml += '<span class="tpl-crumb-sep">›</span>';
            crumbHtml += '<span>' + item.name + '</span>';
        });
        crumbs.innerHTML = crumbHtml;

        // Кнопка «Назад» не нужна — в этом режиме только один уровень.
        var backBtn = document.getElementById('tpl-popup-back');
        if (backBtn) backBtn.style.display = 'none';

        // ===== Позиционирование панели на уровне своей категории =====
        // Вычисляем вертикальное смещение строки категории относительно
        // контейнера .tpl-layout (у него position: relative). Панель
        // открывается ровно напротив этой строки, а не сверху макета.
        var rowEl = node.querySelector(':scope > .tpl-category-row');
        if (rowEl) {
            var layoutEl = document.querySelector('.tpl-layout');
            if (layoutEl) {
                var layoutRect = layoutEl.getBoundingClientRect();
                var rowRect = rowEl.getBoundingClientRect();
                var top = rowRect.top - layoutRect.top;

                // Защита от «ухода» панели за нижний край окна:
                // если панель в своей полной высоте не помещается снизу,
                // поднимаем её на столько, чтобы нижний край панели остался
                // внутри окна (не выше верхней границы .tpl-layout).
                var maxAvailable = window.innerHeight - rowRect.top - 16;
                if (maxAvailable < 200) {
                    // Если места совсем мало — сдвигаем top настолько,
                    // чтобы панель открылась выше строки.
                    var wanted = Math.max(0, top - (200 - maxAvailable));
                    top = wanted;
                }
                popup.style.top = top + 'px';
            }
        }

        // Показываем панель.
        popup.style.display = 'block';

        // Подсветка активной подкатегории в дереве.
        document.querySelectorAll('.tpl-category-row.active').forEach(function (r) {
            r.classList.remove('active');
        });
        var row = node.querySelector(':scope > .tpl-category-row');
        if (row) row.classList.add('active');

        // Клик по шаблону в панели — превью справа.
        body.querySelectorAll('.tpl-popup-template').forEach(function (el) {
            el.addEventListener('click', function () {
                var tplId = el.getAttribute('data-template-id');
                if (tplId) tplApp.selectTemplate(tplId);
            });
        });
    },

    /**
     * Возвращает путь от корневой категории до указанного узла.
     * Используется для хлебных крошек.
     *
     * @param {HTMLElement} node — .tpl-tree-node.
     * @returns {Array<{id: string, name: string}>}
     */
    getCategoryPath: function (node) {
        var path = [];
        var current = node;
        while (current && current.classList && current.classList.contains('tpl-tree-node')) {
            var nameEl = current.querySelector(':scope > .tpl-category-row > .tpl-category-name');
            path.unshift({
                id: current.getAttribute('data-category-id'),
                name: nameEl ? nameEl.textContent : '?'
            });
            var parent = current.parentElement;
            current = parent ? parent.closest('.tpl-tree-node') : null;
        }
        return path;
    },

    /**
     * Закрыть панель.
     */
    closePopup: function () {
        var popup = document.getElementById('tpl-category-popup');
        if (popup) popup.style.display = 'none';
        this.popupStack = [];
        // Снять подсветку активной категории.
        document.querySelectorAll('.tpl-category-row.active').forEach(function (r) {
            r.classList.remove('active');
        });
    },

    // ==================================================================
    // УТИЛИТЫ
    // ==================================================================

    getCsrfToken: function () {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    },

    apiPost: function (url, payload) {
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(payload || {})
        }).then(function (r) {
            return r.json().then(function (data) {
                if (!r.ok) {
                    throw new Error(data.error || ('HTTP ' + r.status));
                }
                return data;
            });
        });
    },

    // ==================================================================
    // МОДАЛЬНОЕ ОКНО
    // ==================================================================

    openModal: function (title, value, onConfirm, mode, commentValue) {
        mode = mode || 'category';

        document.getElementById('tpl-modal-title').textContent = title;

        const nameInput = document.getElementById('tpl-modal-input');
        nameInput.value = value || '';

        const commentWrap = document.getElementById('tpl-modal-comment-wrapper');
        const commentInput = document.getElementById('tpl-modal-comment');
        if (mode === 'template') {
            commentWrap.style.display = 'block';
            commentInput.value = commentValue || '';
        } else {
            commentWrap.style.display = 'none';
            commentInput.value = '';
        }

        document.getElementById('tpl-modal-error').style.display = 'none';
        document.getElementById('tpl-modal-overlay').style.display = 'flex';
        setTimeout(function () { nameInput.focus(); nameInput.select(); }, 50);

        this.modalOnConfirm = onConfirm;
    },

    closeModal: function () {
        document.getElementById('tpl-modal-overlay').style.display = 'none';
        this.modalOnConfirm = null;
    },

    confirmModal: function () {
        const nameInput = document.getElementById('tpl-modal-input');
        const commentInput = document.getElementById('tpl-modal-comment');
        const name = nameInput.value.trim();
        const comment = commentInput ? commentInput.value.trim() : '';

        if (!name) {
            const err = document.getElementById('tpl-modal-error');
            err.textContent = 'Название не может быть пустым';
            err.style.display = 'block';
            return;
        }

        if (typeof this.modalOnConfirm === 'function') {
            const cb = this.modalOnConfirm;
            this.closeModal();
            cb(name, comment);
        }
    },

    showModalError: function (message) {
        const overlay = document.getElementById('tpl-modal-overlay');
        if (overlay.style.display === 'flex') {
            const err = document.getElementById('tpl-modal-error');
            err.textContent = message;
            err.style.display = 'block';
        } else {
            alert(message);
        }
    },

    // ==================================================================
    // КАТЕГОРИИ: СОЗДАНИЕ / ПЕРЕИМЕНОВАНИЕ / УДАЛЕНИЕ
    // ==================================================================

    openCreateCategoryModal: function (parentId) {
        const title = parentId ? 'Новая подкатегория' : 'Новая категория';
        tplApp.openModal(title, '', function (name) {
            tplApp.createCategory(name, parentId);
        });
    },

    createCategory: function (name, parentId) {
        this.apiPost('/shablony/api/category/create/', {
            name: name,
            parent_id: parentId || null
        })
        .then(function (data) {
            console.log('✅ Категория создана:', data.category);
            window.location.reload();
        })
        .catch(function (err) {
            console.error('Ошибка создания категории:', err);
            tplApp.showModalError(err.message);
        });
    },

    openRenameCategoryModal: function (catId, currentName) {
        tplApp.openModal('Переименовать категорию', currentName, function (newName) {
            tplApp.renameCategory(catId, newName);
        });
    },

    renameCategory: function (catId, newName) {
        this.apiPost('/shablony/api/category/' + catId + '/rename/', { name: newName })
        .then(function () {
            window.location.reload();
        })
        .catch(function (err) {
            console.error('Ошибка переименования:', err);
            tplApp.showModalError(err.message);
        });
    },

    confirmDeleteCategory: function (catId, name) {
        if (!window.confirm('Удалить категорию "' + name + '"?\n\n' +
                            'Удалить можно только пустую категорию — без вложенных категорий и шаблонов.')) {
            return;
        }
        this.apiPost('/shablony/api/category/' + catId + '/delete/', {})
        .then(function () {
            window.location.reload();
        })
        .catch(function (err) {
            console.error('Ошибка удаления:', err);
            alert(err.message);
        });
    },

    // ==================================================================
    // ШАБЛОНЫ: РЕДАКТИРОВАНИЕ И УДАЛЕНИЕ
    // ==================================================================

    openRenameTemplateModal: function () {
        if (!this.currentTemplateData) {
            alert('Сначала выберите шаблон');
            return;
        }
        const tpl = this.currentTemplateData;
        tplApp.openModal(
            'Редактирование шаблона',
            tpl.name,
            function (newName, newComment) {
                tplApp.updateTemplate(tpl.id, newName, newComment);
            },
            'template',
            tpl.comment || ''
        );
    },

    updateTemplate: function (templateId, newName, newComment) {
        this.apiPost('/shablony/api/template/' + templateId + '/update/', {
            name: newName,
            comment: newComment
        })
        .then(function (data) {
            if (!data.success) throw new Error(data.error || 'Ошибка обновления');

            try {
                localStorage.setItem('tpl_last_selected_template_id', String(templateId));
            } catch (e) {
                console.warn('localStorage недоступен:', e);
            }

            window.location.reload();
        })
        .catch(function (err) {
            console.error('Ошибка обновления шаблона:', err);
            tplApp.showModalError(err.message);
        });
    },

    confirmDeleteTemplate: function () {
        if (!this.currentTemplateData) {
            alert('Сначала выберите шаблон');
            return;
        }
        const tpl = this.currentTemplateData;

        if (!window.confirm(
            'Удалить шаблон «' + tpl.name + '»?\n\n' +
            'Будут удалены все сохранённые в нём компоненты, работы, ' +
            'ламинация и параметры расчёта. Существующие просчёты, ' +
            'созданные из этого шаблона, останутся без изменений.'
        )) {
            return;
        }

        this.apiPost('/shablony/api/template/' + tpl.id + '/delete/', {})
        .then(function (data) {
            if (!data.success) throw new Error(data.error || 'Ошибка удаления');

            try {
                const lastId = localStorage.getItem('tpl_last_selected_template_id');
                if (lastId && String(lastId) === String(tpl.id)) {
                    localStorage.removeItem('tpl_last_selected_template_id');
                }
            } catch (e) { /* пусто */ }

            window.location.reload();
        })
        .catch(function (err) {
            console.error('Ошибка удаления шаблона:', err);
            alert('Не удалось удалить шаблон: ' + err.message);
        });
    },

    // ==================================================================
    // ПОИСК ПО ДЕРЕВУ
    // ==================================================================

    /**
     * Поиск: собираем совпадения по шаблонам и категориям и показываем
     * их в той же панели (отдельным списком, без стека).
     */
    search: function (query) {
        const q = (query || '').trim().toLowerCase();
        const popup = document.getElementById('tpl-category-popup');
        const body = document.getElementById('tpl-popup-body');
        const crumbs = document.getElementById('tpl-popup-breadcrumbs');
        const backBtn = document.getElementById('tpl-popup-back');

        if (!popup || !body) return;

        // Пустой запрос — закрываем панель.
        if (!q) {
            this.closePopup();
            return;
        }

        // Сбрасываем стек — поиск не связан с навигацией по категориям.
        this.popupStack = [];

        // Собираем совпадения.
        const matchedTemplates = [];
        const matchedCategories = [];

        document.querySelectorAll('#tpl-tree-pane .tpl-template-item').forEach(function (tpl) {
            const nameEl = tpl.querySelector('.tpl-template-name');
            const name = (nameEl ? nameEl.textContent : '').toLowerCase();
            if (name.indexOf(q) !== -1) {
                matchedTemplates.push({
                    id: tpl.getAttribute('data-template-id'),
                    name: (nameEl ? nameEl.textContent : '')
                });
            }
        });

        document.querySelectorAll('#tpl-tree-pane .tpl-tree-node').forEach(function (node) {
            const nameEl = node.querySelector(':scope > .tpl-category-row > .tpl-category-name');
            const name = (nameEl ? nameEl.textContent : '').toLowerCase();
            if (name.indexOf(q) !== -1) {
                matchedCategories.push({
                    id: node.getAttribute('data-category-id'),
                    name: (nameEl ? nameEl.textContent : '')
                });
            }
        });

        // Рендер тела панели.
        let html = '';

        if (matchedCategories.length) {
            html += '<div class="tpl-popup-section-title">Категории</div>';
            matchedCategories.forEach(function (c) {
                html += '<div class="tpl-popup-subcat" data-category-id="' + c.id + '">' +
                            '<i class="fas fa-folder"></i>' +
                            '<span class="tpl-popup-subcat-name">' + c.name + '</span>' +
                        '</div>';
            });
        }

        if (matchedTemplates.length) {
            html += '<div class="tpl-popup-section-title">Шаблоны</div>';
            matchedTemplates.forEach(function (t) {
                var active = (String(t.id) === String(tplApp.currentTemplateId)) ? ' active' : '';
                html += '<div class="tpl-popup-template' + active + '" data-template-id="' + t.id + '">' +
                            '<i class="fas fa-file-alt"></i>' +
                            '<span class="tpl-popup-template-name">' + t.name + '</span>' +
                        '</div>';
            });
        }

        if (!matchedCategories.length && !matchedTemplates.length) {
            html += '<div class="tpl-popup-empty">Ничего не найдено.</div>';
        }

        body.innerHTML = html;

        // Хлебные крошки — надпись «Результаты поиска».
        if (crumbs) {
            crumbs.innerHTML = '<span>Результаты поиска</span>';
        }

        // Кнопка «Назад» в режиме поиска не нужна.
        if (backBtn) {
            backBtn.style.display = 'none';
        }

        // Показать панель.
        popup.style.display = 'block';

        // Клик по категории из результатов — программно кликаем по этой
        // категории в дереве, чтобы сработала та же логика (раскрытие
        // корневой / открытие панели подкатегории).
        body.querySelectorAll('.tpl-popup-subcat').forEach(function (el) {
            el.addEventListener('click', function () {
                var catId = el.getAttribute('data-category-id');
                var node = document.querySelector('.tpl-tree-node[data-category-id="' + catId + '"]');
                if (node) {
                    var row = node.querySelector(':scope > .tpl-category-row');
                    if (row) row.click();
                }
            });
        });

        // Клик по шаблону — превью.
        body.querySelectorAll('.tpl-popup-template').forEach(function (el) {
            el.addEventListener('click', function () {
                var tplId = el.getAttribute('data-template-id');
                if (tplId) tplApp.selectTemplate(tplId);
            });
        });
    },

    // ==================================================================
    // СОЗДАНИЕ ПРОСЧЁТА ИЗ ТЕКУЩЕГО ШАБЛОНА
    // ==================================================================

    createProschetFromCurrentTemplate: function () {
        if (!this.currentTemplateId) {
            alert('Сначала выберите шаблон в дереве слева');
            return;
        }
        const tplName = this.currentTemplateData ? this.currentTemplateData.name : 'без названия';

        if (!window.confirm('Создать новый просчёт из шаблона «' + tplName + '»?')) {
            return;
        }

        const url = '/shablony/api/template/' + this.currentTemplateId + '/create-proschet/';
        this.apiPost(url, {})
            .then(function (data) {
                if (!data.success) {
                    throw new Error(data.error || 'Ошибка создания просчёта');
                }
                console.log('✅ Просчёт создан:', data.proschet_id);
                window.location.href = '/calculator/?proschet_id=' + data.proschet_id;
            })
            .catch(function (err) {
                console.error('Ошибка создания просчёта:', err);
                alert('Не удалось создать просчёт: ' + err.message);
            });
    },

    // ==================================================================
    // СОХРАНЕНИЕ ПРОСЧЁТА КАК ШАБЛОНА
    // ==================================================================

    saveCurrentProschetAsTemplate: function () {
        const panel = document.getElementById('tpl-save-panel');
        if (!panel) return;

        const proschetId = panel.getAttribute('data-proschet-id');
        const nameEl     = document.getElementById('tpl-save-name');
        const commentEl  = document.getElementById('tpl-save-comment');
        const categoryEl = document.getElementById('tpl-save-category');

        const name        = nameEl ? nameEl.value.trim() : '';
        const comment     = commentEl ? commentEl.value.trim() : '';
        const categoryId  = categoryEl ? categoryEl.value : '';

        if (!name) {
            alert('Введите название шаблона');
            if (nameEl) nameEl.focus();
            return;
        }
        if (!categoryId) {
            alert('Выберите категорию для сохранения');
            if (categoryEl) categoryEl.focus();
            return;
        }

        if (!window.confirm('Сохранить просчёт как шаблон "' + name + '"?')) return;

        this.apiPost('/shablony/api/save-from-proschet/', {
            proschet_id: proschetId,
            name: name,
            comment: comment,
            category_id: categoryId
        })
        .then(function (data) {
            if (!data.success) throw new Error(data.error || 'Ошибка сохранения');
            alert(data.message || 'Шаблон сохранён');
            window.location.href = '/shablony/';
        })
        .catch(function (err) {
            console.error('Ошибка сохранения шаблона:', err);
            alert('Не удалось сохранить шаблон: ' + err.message);
        });
    },

    // ==================================================================
    // ПРЕВЬЮ ВЫБРАННОГО ШАБЛОНА
    // ==================================================================

    selectTemplate: function (templateId) {
        // Снимаем подсветку со всех шаблонов в дереве и в панели.
        document.querySelectorAll('.tpl-template-item.active').forEach(function (el) {
            el.classList.remove('active');
        });
        document.querySelectorAll('.tpl-popup-template.active').forEach(function (el) {
            el.classList.remove('active');
        });

        // Подсвечиваем выбранный в дереве.
        const selected = document.querySelector('.tpl-template-item[data-template-id="' + templateId + '"]');
        if (selected) selected.classList.add('active');

        // И в панели.
        const selectedPopup = document.querySelector('.tpl-popup-template[data-template-id="' + templateId + '"]');
        if (selectedPopup) selectedPopup.classList.add('active');

        this.currentTemplateId = templateId;

        // Запоминаем выделение в localStorage.
        try {
            localStorage.setItem('tpl_last_selected_template_id', String(templateId));
        } catch (e) {
            console.warn('localStorage недоступен:', e);
        }

        this.loadPreview(templateId);
    },

    restoreLastSelectedTemplate: function () {
        let lastId = null;
        try {
            lastId = localStorage.getItem('tpl_last_selected_template_id');
        } catch (e) {
            return;
        }
        if (!lastId) return;

        const el = document.querySelector('.tpl-template-item[data-template-id="' + lastId + '"]');
        if (!el) {
            try { localStorage.removeItem('tpl_last_selected_template_id'); } catch (e) {}
            return;
        }

        console.log('🔁 Восстанавливаем выделение шаблона id=' + lastId);
        this.selectTemplate(lastId);
    },

    loadPreview: function (templateId) {
        const url = '/shablony/api/template/' + templateId + '/preview/';
        const emptyBox = document.getElementById('tpl-preview-empty');
        const contentBox = document.getElementById('tpl-preview-content');
        if (emptyBox) {
            emptyBox.innerHTML = '<h3>Загрузка…</h3>';
            emptyBox.style.display = 'block';
        }
        if (contentBox) contentBox.style.display = 'none';

        fetch(url, { method: 'GET', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (data) {
            if (!data.success) throw new Error('Ошибка на сервере');
            tplApp.currentTemplateData = data.template;
            tplApp.renderPreview(data.template);
        })
        .catch(function (err) {
            console.error('Ошибка загрузки превью:', err);
            if (emptyBox) {
                emptyBox.innerHTML = '<h3>Не удалось загрузить шаблон</h3><p>' + err.message + '</p>';
                emptyBox.style.display = 'block';
            }
        });
    },

    renderPreview: function (tpl) {
        const emptyBox = document.getElementById('tpl-preview-empty');
        const contentBox = document.getElementById('tpl-preview-content');
        if (emptyBox) emptyBox.style.display = 'none';
        if (contentBox) contentBox.style.display = 'block';

        document.getElementById('tpl-preview-title').textContent = tpl.name;
        document.getElementById('tpl-preview-category').textContent = tpl.category;
        document.getElementById('tpl-preview-circulation').textContent = tpl.circulation + ' шт.';
        document.getElementById('tpl-preview-comment').textContent = tpl.comment || '';

        const compBox = document.getElementById('tpl-preview-components');
        compBox.innerHTML = '';
        if (!tpl.components.length) {
            compBox.innerHTML = '<p style="color:#999;">В шаблоне нет печатных компонентов.</p>';
            return;
        }
        tpl.components.forEach(function (c, idx) {
            compBox.appendChild(tplApp.renderComponent(c, idx + 1));
        });
    },

    renderComponent: function (c, index) {
        const card = document.createElement('div');
        card.className = 'tpl-component-card';

        let html = ''
            + '<div class="tpl-component-title">'
            +   '<span>Компонент #' + index + '</span>'
            +   '<span>' + (c.print_type_display || '') + ', ' + (c.printing_mode_display || '') + '</span>'
            + '</div>'
            + '<div class="tpl-component-row"><b>Принтер:</b> ' + (c.printer || '—') + '</div>'
            + '<div class="tpl-component-row"><b>Бумага:</b> ' + (c.paper || '—') + '</div>';

        if (c.works && c.works.length) {
            html += '<div class="tpl-section"><h4>Дополнительные работы</h4><ul class="tpl-works-list">';
            c.works.forEach(function (w) {
                html += '<li>• ' + w.title + ' × ' + w.quantity + ' — ' + w.price + ' ₽</li>';
            });
            html += '</ul></div>';
        }

        if (c.lamination) {
            html += '<div class="tpl-section"><h4>Ламинация</h4>';
            if (c.lamination.is_enabled) {
                html += '<div class="tpl-component-row"><b>Сторона:</b> ' + (c.lamination.side_display || '—') + '</div>'
                     +  '<div class="tpl-component-row"><b>Ламинатор:</b> ' + (c.lamination.laminator || '—') + '</div>'
                     +  '<div class="tpl-component-row"><b>Плёнка:</b> ' + (c.lamination.film || '—') + '</div>';
            } else {
                html += '<div class="tpl-component-row">Выключена</div>';
            }
            html += '</div>';
        }

        if (c.vichisliniya) {
            html += '<div class="tpl-section"><h4>Одностраничные вычисления</h4>'
                 +  '<div class="tpl-component-row"><b>Изделие:</b> '
                 +     c.vichisliniya.item_width + '×' + c.vichisliniya.item_height + ' мм</div>'
                 +  '<div class="tpl-component-row"><b>Зазор:</b> ' + c.vichisliniya.vyleta + ' мм</div>'
                 +  '<div class="tpl-component-row"><b>Цветность:</b> ' + c.vichisliniya.color + '</div>'
                 +  '</div>';
        }

        if (c.multipage) {
            html += '<div class="tpl-section"><h4>Многостраничные вычисления</h4>'
                 +  '<div class="tpl-component-row"><b>Скрепление:</b> ' + (c.multipage.binding || '—') + '</div>'
                 +  '<div class="tpl-component-row"><b>Страниц:</b> ' + c.multipage.total_pages + '</div>'
                 +  '<div class="tpl-component-row"><b>Страница:</b> '
                 +     c.multipage.finished_width + '×' + c.multipage.finished_height + ' мм</div>'
                 +  '</div>';
        }

        card.innerHTML = html;
        return card;
    }
};

document.addEventListener('DOMContentLoaded', function () {
    tplApp.init();
});

window.tplApp = tplApp;