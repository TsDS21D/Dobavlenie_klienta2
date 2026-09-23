/*
shablony_proschetov/static/shablony_proschetov/js/index.js
Интерактив страницы справочника шаблонов.

Реализовано на этом шаге (ШАГ 5.3):
- клик по шаблону → превью справа;
- кнопка "+ Категория" → создание корневой категории;
- кнопка "+" рядом с категорией → создание подкатегории;
- кнопка "✎" рядом с категорией → переименование;
- кнопка "✕" рядом с категорией → удаление (с подтверждением);
- модальное окно для ввода названия (общая для трёх сценариев).

Что будет дальше:
- поиск по дереву (ШАГ 5.4);
- создание/удаление/переименование шаблонов и кнопка
  "Создать просчёт из шаблона" (ШАГ 6).
*/

"use strict";

var tplApp = {

    // Текущий выбранный id шаблона.
    currentTemplateId: null,
    // Кэш последнего JSON превью.
    currentTemplateData: null,

    // Колбэк, который вызовется при подтверждении модалки.
    modalOnConfirm: null,

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

        // Поле поиска по дереву.
        const searchInput = document.getElementById('tpl-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                tplApp.search(this.value);
            });
        }

        // Кнопка "Создать просчёт из шаблона" в блоке превью.
        const createProschetBtn = document.getElementById('tpl-btn-create-proschet');
        if (createProschetBtn) {
            createProschetBtn.addEventListener('click', function () {
                tplApp.createProschetFromCurrentTemplate();
            });
        }
        // Кнопка "Переименовать / изменить комментарий" в превью шаблона.
        const renameTemplateBtn = document.getElementById('tpl-btn-rename-template');
        if (renameTemplateBtn) {
            renameTemplateBtn.addEventListener('click', function () {
                tplApp.openRenameTemplateModal();
            });
        }
        // Кнопка "Удалить шаблон" в превью.
        const deleteTemplateBtn = document.getElementById('tpl-btn-delete-template');
        if (deleteTemplateBtn) {
            deleteTemplateBtn.addEventListener('click', function () {
                tplApp.confirmDeleteTemplate();
            });
        }

        // "+ Категория" в панели инструментов — создать корневую категорию.
        const addRootBtn = document.getElementById('tpl-btn-add-root-category');
        if (addRootBtn) {
            addRootBtn.addEventListener('click', function () {
                tplApp.openCreateCategoryModal(null);
            });
        }

        // Кнопки на каждом узле: + (подкатегория), ✎ (переименовать), ✕ (удалить).
        document.querySelectorAll('.tpl-btn-add-sub').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();     // чтобы клик не всплыл до шаблона/категории
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
        // Enter в поле ввода = подтверждение.
        document.getElementById('tpl-modal-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') tplApp.confirmModal();
            if (e.key === 'Escape') tplApp.closeModal();
        });
        // Клик по фону модалки закрывает её.
        document.getElementById('tpl-modal-overlay').addEventListener('click', function (e) {
            if (e.target === this) tplApp.closeModal();
        });
        // Панель сохранения просчёта как шаблона.
        // Если она есть — навешиваем обработчики.
        const savePanel = document.getElementById('tpl-save-panel');
        if (savePanel) {
            const btnConfirm = document.getElementById('tpl-save-confirm');
            const btnCancel  = document.getElementById('tpl-save-cancel');
            if (btnConfirm) btnConfirm.addEventListener('click', function () {
                tplApp.saveCurrentProschetAsTemplate();
            });
            if (btnCancel) btnCancel.addEventListener('click', function () {
                // Отмена — просто уходим со страницы с чистым URL.
                window.location.href = '/shablony/';
            });
        }
        // Восстанавливаем выделение последнего шаблона (если он сохранён в localStorage).
        tplApp.restoreLastSelectedTemplate();        
    },

    // ------------------------------------------------------------------
    // Утилита: получить CSRF-токен из meta-тега.
    // ------------------------------------------------------------------
    getCsrfToken: function () {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    },

    // ------------------------------------------------------------------
    // Утилита: POST JSON на сервер и вернуть распарсенный JSON ответа.
    // ------------------------------------------------------------------
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
            // Читаем JSON в любом случае: сервер возвращает ошибки тоже JSON-ом.
            return r.json().then(function (data) {
                if (!r.ok) {
                    // Прокидываем ошибку выше с сообщением из ответа.
                    throw new Error(data.error || ('HTTP ' + r.status));
                }
                return data;
            });
        });
    },

    // ==================================================================
    // МОДАЛЬНОЕ ОКНО
    // ==================================================================

    /**
     * Открывает модалку с заданным заголовком, значениями полей и колбэком.
     *
     * @param {string} title        — заголовок окна
     * @param {string} value        — начальное значение поля «Название»
     * @param {Function} onConfirm  — функция, вызываемая при подтверждении.
     *                                 Принимает (name, comment).
     * @param {string} mode         — 'category' (только название) или 'template' (название + комментарий)
     * @param {string} commentValue — начальное значение комментария (для mode='template')
     */
    openModal: function (title, value, onConfirm, mode, commentValue) {
        mode = mode || 'category';

        // Заголовок.
        document.getElementById('tpl-modal-title').textContent = title;

        // Поле названия.
        const nameInput = document.getElementById('tpl-modal-input');
        nameInput.value = value || '';

        // Поле комментария — показываем/скрываем в зависимости от режима.
        const commentWrap = document.getElementById('tpl-modal-comment-wrapper');
        const commentInput = document.getElementById('tpl-modal-comment');
        if (mode === 'template') {
            commentWrap.style.display = 'block';
            commentInput.value = commentValue || '';
        } else {
            commentWrap.style.display = 'none';
            commentInput.value = '';
        }

        // Сброс ошибок и показ модалки.
        document.getElementById('tpl-modal-error').style.display = 'none';
        document.getElementById('tpl-modal-overlay').style.display = 'flex';
        setTimeout(function () { nameInput.focus(); nameInput.select(); }, 50);

        // Колбэк для подтверждения.
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
        // Показываем ошибку прямо в модалке, если она ещё открыта.
        const overlay = document.getElementById('tpl-modal-overlay');
        if (overlay.style.display === 'flex') {
            const err = document.getElementById('tpl-modal-error');
            err.textContent = message;
            err.style.display = 'block';
        } else {
            // Модалка уже закрыта — просто alert.
            alert(message);
        }
    },

    // ==================================================================
    // КАТЕГОРИИ: СОЗДАНИЕ / ПЕРЕИМЕНОВАНИЕ / УДАЛЕНИЕ
    // ==================================================================

    /**
     * Открыть модалку создания категории.
     * @param {string|null} parentId — id родителя или null для корневой.
     */
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
            // Перезагружаем страницу — самый простой и надёжный способ
            // отрисовать обновлённое дерево, не дублируя логику рендера.
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

    /**
     * Открыть модалку переименования / изменения комментария шаблона.
     * Данные берём из текущего превью (tplApp.currentTemplateData).
     */
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

    /**
     * Спрашивает подтверждение и удаляет текущий шаблон.
     * После успеха — чистит запись о выделенном шаблоне в localStorage
     * и перезагружает страницу, чтобы дерево обновилось.
     */
    confirmDeleteTemplate: function () {
        if (!this.currentTemplateData) {
            alert('Сначала выберите шаблон');
            return;
        }
        const tpl = this.currentTemplateData;

        // Подтверждение с явным предупреждением.
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

            // Чистим запись о выделенном шаблоне, чтобы при перезагрузке
            // не пытались выделить уже удалённый.
            try {
                const lastId = localStorage.getItem('tpl_last_selected_template_id');
                if (lastId && String(lastId) === String(tpl.id)) {
                    localStorage.removeItem('tpl_last_selected_template_id');
                }
            } catch (e) { /* localStorage может быть недоступен — не страшно */ }

            // Перезагружаем страницу — дерево обновится.
            window.location.reload();
        })
        .catch(function (err) {
            console.error('Ошибка удаления шаблона:', err);
            alert('Не удалось удалить шаблон: ' + err.message);
        });
    },


    /**
     * Отправляет изменения шаблона на сервер и обновляет превью.
     */
    updateTemplate: function (templateId, newName, newComment) {
        this.apiPost('/shablony/api/template/' + templateId + '/update/', {
            name: newName,
            comment: newComment
        })
        .then(function (data) {
            if (!data.success) throw new Error(data.error || 'Ошибка обновления');

            // ===== Запоминаем id обновлённого шаблона, =====
            // чтобы после перезагрузки страницы автоматически
            // выделить именно его в дереве.
            try {
                localStorage.setItem('tpl_last_selected_template_id', String(templateId));
            } catch (e) {
                console.warn('localStorage недоступен:', e);
            }

            // Обновляем превью локально (на случай, если перезагрузка задержится).
            tplApp.currentTemplateData.name = data.template.name;
            tplApp.currentTemplateData.comment = data.template.comment;
            document.getElementById('tpl-preview-title').textContent = data.template.name;
            document.getElementById('tpl-preview-comment').textContent = data.template.comment || '';

            // Перезагружаем страницу — чтобы дерево тоже обновилось.
            window.location.reload();
        })
        .catch(function (err) {
            console.error('Ошибка обновления шаблона:', err);
            tplApp.showModalError(err.message);
        });
    },


    confirmDeleteCategory: function (catId, name) {
        // Простое подтверждение. Можно заменить на красивую модалку позже.
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
    // ПОИСК ПО ДЕРЕВУ
    // ==================================================================

    /**
     * Фильтрует дерево по строке запроса.
     *
     * Логика (вариант 2):
     * 1. Если совпало имя ШАБЛОНА — показываем сам шаблон и всех его родителей.
     * 2. Если совпало имя КАТЕГОРИИ — показываем:
     *      - саму категорию и всех её родителей,
     *      - всех её потомков (подкатегории любого уровня),
     *      - все шаблоны внутри неё и внутри её потомков.
     *    Так запрос «меловк» покажет не только категорию «Меловка 350 г/кв.м»,
     *    но и все шаблоны, лежащие в ней (и в её подкатегориях).
     * 3. Всё, что не попало в результаты, скрывается классом .tpl-hidden.
     * 4. Пустой запрос — показываем дерево целиком.
     *
     * @param {string} query — текст из поля поиска.
     */
    search: function (query) {
        const q = (query || '').trim().toLowerCase();
        const treePane = document.getElementById('tpl-tree-pane');
        if (!treePane) return;

        // Сбрасываем прошлое состояние: убираем класс .tpl-hidden со всех элементов.
        treePane.querySelectorAll('.tpl-hidden').forEach(function (el) {
            el.classList.remove('tpl-hidden');
        });

        // Пустой запрос — оставляем дерево как есть.
        if (!q) return;

        // Наборы, которые нужно оставить видимыми.
        const matchingTemplates = new Set();      // какие .tpl-template-item показываем
        const visibleCategories = new Set();       // какие .tpl-tree-node показываем

        // --- 1. ШАБЛОНЫ: совпадение по имени ---
        treePane.querySelectorAll('.tpl-template-item').forEach(function (tpl) {
            const nameEl = tpl.querySelector('.tpl-template-name');
            const name = (nameEl ? nameEl.textContent : '').toLowerCase();
            if (name.indexOf(q) !== -1) {
                matchingTemplates.add(tpl);
            }
        });

        // --- 2. КАТЕГОРИИ: совпадение по имени ---
        // Собираем совпавшие категории в отдельный Set — нам нужно потом
        // отдельно по каждой пройтись, чтобы добавить потомков и шаблоны.
        const matchingCategories = new Set();
        treePane.querySelectorAll('.tpl-tree-node').forEach(function (node) {
            const nameEl = node.querySelector('.tpl-category-name');
            const name = (nameEl ? nameEl.textContent : '').toLowerCase();
            if (name.indexOf(q) !== -1) {
                matchingCategories.add(node);
            }
        });

        // --- 3. Каждую совпавшую категорию «раскрываем целиком» ---
        matchingCategories.forEach(function (catNode) {
            // 3.1. Помечаем саму категорию и всех её предков как видимые.
            tplApp.markCategoryAndAncestors(catNode, visibleCategories);

            // 3.2. Помечаем всех потомков (подкатегории любого уровня) как видимые.
            //      querySelectorAll('.tpl-tree-node') внутри узла вернёт только потомков.
            catNode.querySelectorAll('.tpl-tree-node').forEach(function (child) {
                visibleCategories.add(child);
            });

            // 3.3. Помечаем все шаблоны внутри этой категории и всех её потомков
            //      как «найденные». Они будут показаны, даже если не совпали по имени.
            catNode.querySelectorAll('.tpl-template-item').forEach(function (tpl) {
                matchingTemplates.add(tpl);
            });
        });

        // --- 4. Для каждого шаблона, попавшего в результаты, ---
        //     помечаем его родительскую категорию и всех её предков как видимые.
        //     Это нужно на случай, если шаблон совпал по имени, а его категория — нет.
        matchingTemplates.forEach(function (tpl) {
            const tplNode = tpl.closest('.tpl-tree-node');
            if (tplNode) {
                tplApp.markCategoryAndAncestors(tplNode, visibleCategories);
            }
        });

        // --- 5. Скрываем все категории, не попавшие в visibleCategories ---
        treePane.querySelectorAll('.tpl-tree-node').forEach(function (node) {
            if (!visibleCategories.has(node)) {
                node.classList.add('tpl-hidden');
            }
        });

        // --- 6. Скрываем все шаблоны, кроме найденных ---
        treePane.querySelectorAll('.tpl-template-item').forEach(function (tpl) {
            if (!matchingTemplates.has(tpl)) {
                tpl.classList.add('tpl-hidden');
            }
        });
    },

    /**
     * Добавляет узел категории и всех его предков в переданный Set.
     * Используется при поиске, чтобы совпавший узел не «терялся» в дереве.
     *
     * @param {HTMLElement} node — элемент .tpl-tree-node.
     * @param {Set} visibleSet — множество, куда складываем видимые узлы.
     */
    markCategoryAndAncestors: function (node, visibleSet) {
        let current = node;
        // Идём вверх по дереву: пока текущий элемент — .tpl-tree-node.
        while (current && current.classList && current.classList.contains('tpl-tree-node')) {
            visibleSet.add(current);
            // parentElement?.closest — находим ближайшего предка-категорию.
            const parent = current.parentElement;
            current = parent ? parent.closest('.tpl-tree-node') : null;
        }
    },

    // ==================================================================
    // СОЗДАНИЕ ПРОСЧЁТА ИЗ ТЕКУЩЕГО ШАБЛОНА
    // ==================================================================

    /**
     * Берёт текущий выбранный шаблон и создаёт на его основе реальный просчёт.
     * После успеха — редирект в калькулятор с параметром ?proschet_id=<id>,
     * чтобы калькулятор сразу открыл и выделил этот просчёт.
     */
    createProschetFromCurrentTemplate: function () {
        // 1. Проверяем, что шаблон выбран.
        if (!this.currentTemplateId) {
            alert('Сначала выберите шаблон в дереве слева');
            return;
        }
        const tplName = this.currentTemplateData ? this.currentTemplateData.name : 'без названия';

        // 2. Спрашиваем подтверждение.
        if (!window.confirm('Создать новый просчёт из шаблона «' + tplName + '»?')) {
            return;
        }

        // 3. Отправляем POST-запрос.
        const url = '/shablony/api/template/' + this.currentTemplateId + '/create-proschet/';
        this.apiPost(url, {})
            .then(function (data) {
                if (!data.success) {
                    throw new Error(data.error || 'Ошибка создания просчёта');
                }
                console.log('✅ Просчёт создан:', data.proschet_id);

                // 4. Редирект в калькулятор с параметром proschet_id.
                //    Калькулятор должен прочитать этот параметр и выделить
                //    соответствующий просчёт (это будет дописано в ШАГЕ 6.3).
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

    /**
     * Отправляет на сервер данные из панели сохранения: id просчёта,
     * название, комментарий, id категории.
     * После успеха — редирект на чистый /shablony/ (чтобы скрыть панель
     * и увидеть обновлённое дерево с новым шаблоном).
     */
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

        // Валидация на клиенте.
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

        // Подтверждение.
        if (!window.confirm('Сохранить просчёт как шаблон "' + name + '"?')) return;

        // POST на сервер.
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
    // ШАБЛОНЫ: ПРЕВЬЮ (без изменений с ШАГА 5.1)
    // ==================================================================

    selectTemplate: function (templateId) {
        document.querySelectorAll('.tpl-template-item.active').forEach(function (el) {
            el.classList.remove('active');
        });
        const selected = document.querySelector('.tpl-template-item[data-template-id="' + templateId + '"]');
        if (selected) selected.classList.add('active');

        this.currentTemplateId = templateId;

        // ===== Запоминаем выделение в localStorage. =====
        // При следующей загрузке страницы (в том числе после перезагрузки)
        // мы выделим этот же шаблон автоматически.
        try {
            localStorage.setItem('tpl_last_selected_template_id', String(templateId));
        } catch (e) {
            console.warn('localStorage недоступен:', e);
        }

        this.loadPreview(templateId);
    },
    /**
     * Восстанавливает выделение последнего выбранного шаблона.
     * Берёт id из localStorage; если такой шаблон есть в дереве — выделяет его
     * и подгружает превью. Вызывается при загрузке страницы.
     */
    restoreLastSelectedTemplate: function () {
        let lastId = null;
        try {
            lastId = localStorage.getItem('tpl_last_selected_template_id');
        } catch (e) {
            return;
        }
        if (!lastId) return;

        // Есть ли такой шаблон на странице?
        const el = document.querySelector('.tpl-template-item[data-template-id="' + lastId + '"]');
        if (!el) {
            // Шаблона больше нет (удалён, перенесён) — чистим запись.
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