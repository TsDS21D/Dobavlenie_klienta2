/*
proschety/static/proschety/js/sections/proschet.js
JavaScript секции «Просчёт» новой страницы /proschety/.

РЕАЛИЗОВАНО:
  - Подписка на proschetSelected / proschetTitleChanged.
  - Отображение: номер+название, тираж, скидка, комментарий.
  - Редактирование по двойному клику:
      • тираж — input, сохранение через существующий API
        POST /calculator/update-proschet-circulation/<id>/;
      • комментарий — textarea, сохранение через свой API
        POST /proschety/api/update-proschet-comment/<id>/.
    После сохранения — data-атрибуты строки в списке обновляются,
    чтобы при следующем клике по ней в секцию пришли свежие данные.

ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ.
*/

"use strict";

(function () {

    // ========================================================================
    // 1. СОСТОЯНИЕ И DOM.
    // ========================================================================

    // Активный просчёт. Поля: id, number, title, circulation, discount, comment.
    let activeProschet = null;

    // DOM-элементы.
    let proschetNumberEl   = null;
    let proschetNameEl     = null;
    let circulationSpan    = null;
    let discountSpan       = null;
    let commentBody        = null;
    let bodyGrid           = null;
    let emptyBlock         = null;
    let componentsBlock    = null;   // блок управления печатными компонентами
    let modeSwitch         = null;   // переключатель одно-/многостраничный
    let printerSelect      = null;   // <select> со списком принтеров
    let paperSelect        = null;   // <select> со списком бумаги
    let componentsSection  = null;   // блок «Печатные компоненты»
    let componentsEmpty    = null;   // сообщение «Компонентов нет»

    // ========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ.
    // ========================================================================

    document.addEventListener('DOMContentLoaded', function () {
        console.log('✅ Модуль «Просчёт» загружен');

        proschetNumberEl = document.getElementById('proschet-section-proschet-number');
        proschetNameEl   = document.getElementById('proschet-section-proschet-name');
        circulationSpan = document.getElementById('proschet-section-circulation');
        discountSpan    = document.getElementById('proschet-section-discount');
        commentBody     = document.getElementById('proschet-section-comment-body');
        bodyGrid        = document.getElementById('proschet-section-body');
        emptyBlock      = document.getElementById('proschet-section-empty');
        componentsBlock = document.getElementById('proschet-section-components');
        modeSwitch      = document.getElementById('proschet-mode-switch');
        printerSelect   = document.getElementById('proschet-print-component-printer');
        paperSelect     = document.getElementById('proschet-print-component-paper');
        componentsSection = document.getElementById('proschet-components-section');
        componentsEmpty   = document.getElementById('proschet-components-empty');    

        if (!proschetNumberEl || !proschetNameEl) {
            console.warn('⚠️ Элементы заголовка секции «Просчёт» не найдены');
            return;
        }

        // События от списка просчётов.
        document.addEventListener('proschetSelected', handleProschetSelected);
        document.addEventListener('proschetTitleChanged', handleProschetTitleChanged);

        // Редактирование по двойному клику.
        if (circulationSpan) {
            circulationSpan.addEventListener('dblclick', handleCirculationDblClick);
        }
        if (commentBody) {
            commentBody.addEventListener('dblclick', handleCommentDblClick);
        }
        // Переключатель режима — по ДВОЙНОМУ клику (защита от случайного).
        if (modeSwitch) {
            modeSwitch.addEventListener('dblclick', handleModeSwitchDblClick);
        }
        // Загружаем список принтеров и бумаг (один раз, кэшируем внутри функций).
        loadPrinters();
        loadPapers();

        // Делегированные обработчики для селектов внутри карточек компонентов.
        // Работают на весь контейнер #proschet-components-section —
        // не нужно навешивать на каждую карточку отдельно.
        if (componentsSection) {
            componentsSection.addEventListener('dblclick', handleComponentFieldDblClick);
            componentsSection.addEventListener('change',   handleComponentFieldChange);
            componentsSection.addEventListener('blur',     handleComponentFieldBlur, true);
        }

        // Кнопка «+ Добавить печатный компонент».
        const addComponentBtn = document.getElementById('proschet-btn-add-component');
        if (addComponentBtn) {
            addComponentBtn.addEventListener('click', handleAddComponent);
        }

        console.log('✅ Секция «Просчёт» инициализирована');
    });

    // ========================================================================
    // 3. СОБЫТИЯ ОТ СПИСКА ПРОСЧЁТОВ.
    // ========================================================================

    function handleProschetSelected(event) {
        const d = event.detail || {};

        activeProschet = {
            id:          String(d.proschetId || ''),
            number:      d.proschetNumber || '',
            title:       d.proschetTitle  || '',
            circulation: d.proschetCirculation || '',
            comment:     d.proschetComment || '',
            discount:    d.proschetDiscount || ''
        };

        renderAll();

        // Загружаем таблицу печатных компонентов для этого просчёта.
        loadComponents(activeProschet.id);
    }

    function handleProschetTitleChanged(event) {
        const d = event.detail || {};
        if (!activeProschet) return;
        if (String(d.proschetId) !== String(activeProschet.id)) return;

        activeProschet.title = d.proschetTitle || '';
        renderTitle();
    }

    // ========================================================================
    // 4. ОТРИСОВКА.
    // ========================================================================

    function renderAll() {
        if (!activeProschet || (!activeProschet.number && !activeProschet.title)) {
            if (bodyGrid)          bodyGrid.style.display = 'none';
            if (componentsBlock)   componentsBlock.style.display = 'none';
            if (componentsSection) componentsSection.style.display = 'none';
            if (emptyBlock)        emptyBlock.style.display = 'block';
            return;
        }

        if (bodyGrid)        bodyGrid.style.display = 'grid';
        if (componentsBlock) componentsBlock.style.display = 'block';
        if (emptyBlock)      emptyBlock.style.display = 'none';

        renderTitle();
        renderCirculation();
        renderDiscount();
        renderComment();
    }

    function renderTitle() {
        if (!proschetNumberEl || !proschetNameEl) return;

        if (!activeProschet || (!activeProschet.number && !activeProschet.title)) {
            proschetNumberEl.textContent = '—';
            proschetNameEl.textContent   = '—';
            return;
        }

        // Номер и название — в две отдельные строки, без разделителя.
        proschetNumberEl.textContent = activeProschet.number || '—';
        proschetNameEl.textContent   = activeProschet.title  || '—';
    }

    function renderCirculation() {
        if (!circulationSpan) return;
        const c = activeProschet ? activeProschet.circulation : '';
        if (c === '' || c === null || c === undefined) {
            circulationSpan.textContent = '—';
        } else {
            circulationSpan.textContent = c;
        }
    }

    function renderDiscount() {
        if (!discountSpan) return;
        const v = activeProschet ? activeProschet.discount : '';
        if (v === '' || v === null || v === undefined) {
            discountSpan.textContent = '—';
        } else {
            discountSpan.textContent = v + '%';
        }
    }

    function renderComment() {
        if (!commentBody) return;
        const c = activeProschet ? activeProschet.comment : '';
        if (!c) {
            commentBody.textContent = '—';
            commentBody.classList.add('proschet-section-comment-empty');
        } else {
            commentBody.textContent = c;
            commentBody.classList.remove('proschet-section-comment-empty');
        }
    }

    // ========================================================================
    // 5. РЕДАКТИРОВАНИЕ ТИРАЖА (двойной клик по значению).
    // ========================================================================

    function handleCirculationDblClick(event) {
        event.stopPropagation();

        if (!activeProschet || !activeProschet.id) return;
        if (circulationSpan.querySelector('input')) return; // уже редактируется

        const original = activeProschet.circulation || '';

        // Подменяем содержимое на input.
        circulationSpan.textContent = '';
        circulationSpan.classList.remove('proschet-section-comment-empty');

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'proschet-inline-input';
        input.value = original;
        input.min = '1';
        input.max = '1000000';
        input.step = '1';
        circulationSpan.appendChild(input);

        input.focus();
        input.select();

        let finished = false;

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                saveCirculation(input, original);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                cancelCirculation(original);
            }
        });

        input.addEventListener('blur', function () {
            setTimeout(function () {
                if (finished) return;
                finished = true;
                saveCirculation(input, original);
            }, 100);
        });
    }

    function saveCirculation(input, original) {
        const newValue = (input.value || '').trim();

        // Ничего не изменилось — просто возвращаем прежнее значение.
        if (String(newValue) === String(original)) {
            cancelCirculation(original);
            return;
        }

        // Валидация.
        const n = parseInt(newValue, 10);
        if (isNaN(n) || n <= 0) {
            showNotification('Тираж должен быть целым положительным числом', 'error');
            input.focus();
            return;
        }
        if (n > 1000000) {
            showNotification('Тираж не может превышать 1 000 000', 'error');
            input.focus();
            return;
        }

        // Показываем «Сохранение...».
        circulationSpan.innerHTML =
            '<span class="proschet-inline-saving">Сохранение...</span>';

        const fd = new FormData();
        fd.append('circulation', n);

        fetch('/calculator/update-proschet-circulation/' + activeProschet.id + '/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                // Обновляем локальное состояние.
                activeProschet.circulation = String(data.circulation);
                circulationSpan.textContent = String(data.circulation);

                // Обновляем data-атрибут в строке списка.
                updateRowDataAttribute(activeProschet.id, 'circulation', String(data.circulation));

                showNotification('Тираж обновлён', 'success');
                notifyChange(activeProschet.id, 'circulation');
            } else {
                circulationSpan.textContent = original || '—';
                showNotification(data.message || 'Ошибка сохранения тиража', 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            circulationSpan.textContent = original || '—';
            showNotification('Ошибка сети при сохранении тиража', 'error');
        });
    }

    function cancelCirculation(original) {
        circulationSpan.textContent = (original === '' || original === null || original === undefined)
            ? '—'
            : String(original);
    }

    // ========================================================================
    // 6. РЕДАКТИРОВАНИЕ КОММЕНТАРИЯ (двойной клик по блоку).
    // ========================================================================

    function handleCommentDblClick(event) {
        event.stopPropagation();

        if (!activeProschet || !activeProschet.id) return;
        if (commentBody.querySelector('textarea')) return; // уже редактируется

        const original = activeProschet.comment || '';

        // Фиксируем текущую высоту родителя — чтобы при входе в редактирование
        // ничего не «прыгало». Запоминаем в inline style.
        const startHeight = commentBody.offsetHeight;
        commentBody.style.height = startHeight + 'px';

        // Подменяем содержимое на textarea.
        commentBody.textContent = '';
        commentBody.classList.remove('proschet-section-comment-empty');
        commentBody.classList.add('editing');

        // Плавное появление нового содержимого (textarea).
        triggerCommentFadeIn();

        const textarea = document.createElement('textarea');
        textarea.className = 'proschet-inline-textarea';
        textarea.value = original;
        textarea.placeholder = 'Введите комментарий…';
        // Сразу вписываем textarea в высоту родителя — не растём
        // в момент открытия.
        textarea.style.height = startHeight + 'px';
        commentBody.appendChild(textarea);

        // Подсказка под полем.
        const hint = document.createElement('span');
        hint.className = 'proschet-inline-hint';
        hint.textContent = 'Esc — отмена · клик вне поля — сохранить';
        commentBody.appendChild(hint);

        // Авто-высота при вводе. Работает только «в плюс»: если текст влезает,
        // высота не меняется; если нет — родитель и textarea плавно растут.
        textarea.addEventListener('input', function () {
            autoResizeTextarea(textarea);
        });

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        let finished = false;

        textarea.addEventListener('keydown', function (e) {
            // Ctrl+Enter — сохранить.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (finished) return;
                finished = true;
                saveComment(textarea, original);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                if (finished) return;
                finished = true;
                cancelComment(original);
            }
        });

        // При потере фокуса — сохраняем (как у тиража).
        textarea.addEventListener('blur', function () {
            setTimeout(function () {
                if (finished) return;
                finished = true;
                saveComment(textarea, original);
            }, 100);
        });
    }

    function saveComment(textarea, original) {
        const newValue = (textarea.value || '').trim();

        // Ничего не изменилось — возвращаемся к отображению.
        if (newValue === original) {
            cancelComment(original);
            return;
        }

        // Показываем «Сохранение...».
        commentBody.innerHTML =
            '<span class="proschet-inline-saving">Сохранение...</span>';

        const fd = new FormData();
        fd.append('comment', newValue);

        fetch('/proschety/api/update-proschet-comment/' + activeProschet.id + '/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                commentBody.classList.remove('editing');
                commentBody.style.height = '';   // снимаем фикс. высоту
                activeProschet.comment = data.comment || '';
                renderComment();
                triggerCommentFadeIn();

                // Обновляем data-атрибут в строке списка.
                updateRowDataAttribute(activeProschet.id, 'comment', activeProschet.comment);

                showNotification('Комментарий обновлён', 'success');
                notifyChange(activeProschet.id, 'comment');
            } else {
                commentBody.classList.remove('editing');
                commentBody.style.height = '';
                commentBody.textContent = original || '—';
                commentBody.classList.toggle('proschet-section-comment-empty', !original);
                triggerCommentFadeIn();
                showNotification(data.message || 'Ошибка сохранения комментария', 'error');
            }
        })
        .catch(function (err) {
            console.error(err);
            commentBody.classList.remove('editing');
            commentBody.style.height = '';
            commentBody.textContent = original || '—';
            commentBody.classList.toggle('proschet-section-comment-empty', !original);
            triggerCommentFadeIn();
            showNotification('Ошибка сети при сохранении комментария', 'error');
        });
    }

    function cancelComment(original) {
        commentBody.classList.remove('editing');
        commentBody.style.height = '';   // снимаем фикс. высоту
        activeProschet.comment = original || '';
        renderComment();
        triggerCommentFadeIn();
    }

    // ========================================================================
    // 7. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ.
    // ========================================================================

    /**
     * Обновляет data-атрибут строки активного просчёта в списке.
     * Нужно, чтобы при следующем клике по этой строке в секцию
     * «Просчёт» пришли свежие данные.
     */
    function updateRowDataAttribute(proschetId, attrName, value) {
        const row = document.querySelector(
            '.list-proschet-row[data-proschet-id="' + proschetId + '"]'
        );
        if (!row) return;
        if (attrName === 'circulation') row.dataset.circulation = value;
        if (attrName === 'comment')     row.dataset.comment     = value;
    }

    function getCsrfToken() {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const c = cookies[i].trim();
            if (c.indexOf('csrftoken=') === 0) {
                return decodeURIComponent(c.substring('csrftoken='.length));
            }
        }
        console.warn('CSRF-токен не найден');
        return '';
    }

    /**
     * Показывает кратковременное всплывающее сообщение в левом верхнем углу.
     * Автоматически исчезает через ~2.5 сек. Клик по сообщению скрывает
     * его сразу.
     *
     * Внешне напоминает тосты событий снизу (те же цвета и скругления),
     * но это отдельная система — о действиях в нашем же окне.
     *
     * @param {string} message
     * @param {string} type — 'success' | 'error' | 'warning' | 'info'
     */
    function showNotification(message, type) {
        const container = document.getElementById('proschety-top-notifications');
        if (!container) return;

        const box = document.createElement('div');
        box.className = 'proschety-top-notification';

        // Модификатор по типу (success — базовый стиль зелёный).
        if (type === 'error')   box.classList.add('proschety-top-notification-error');
        if (type === 'warning') box.classList.add('proschety-top-notification-warning');

        box.textContent = message;
        container.appendChild(box);

        function hide() {
            box.classList.add('proschety-top-notification-out');
            setTimeout(function () {
                if (box.parentNode) box.parentNode.removeChild(box);
            }, 300);
        }

        box.addEventListener('click', hide);
        setTimeout(hide, 2500);
    }

    /**
     * Уведомляет сервер об изменении поля просчёта, чтобы тот разослал
     * WebSocket-событие другим открытым окнам.
     */
    function notifyChange(proschetId, fieldName) {
        const fd = new FormData();
        fd.append('field_name', fieldName);
        fetch('/proschety/api/notify-change/' + proschetId + '/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        }).catch(function (err) {
            console.warn('Не удалось уведомить об изменении:', err);
        });
    }    
    /**
     * Автоматически подгоняет высоту textarea под её содержимое.
     *
     * Логика: сначала сбрасываем height в 'auto' (иначе браузер
     * не пересчитает scrollHeight — он берёт максимум из height и
     * содержимого), затем ставим height = scrollHeight.
     *
     * Верхний предел ограничен CSS-свойством max-height у textarea
     * (у нас это 12rem) — при превышении появится внутренний скролл
     * внутри textarea.
     */
    /**
     * Автоувеличение textarea при вводе.
     *
     * Работает только «в плюс»:
     *   - если текст влезает — высота не меняется (никаких скачков);
     *   - если текст больше высоты родителя — родитель и textarea плавно растут
     *     до максимума (8rem, ограничение CSS).
     *
     * Если пользователь стирает текст — высота не уменьшается (иначе
     * были бы резкие скачки при каждом backspace). Сжатие произойдёт
     * после сохранения — родитель вернётся к auto-размеру по контенту.
     */
    function autoResizeTextarea(textarea) {
        const parent = textarea.parentElement;
        if (!parent) return;

        // Максимальная высота родителя в пикселях (8rem ≈ 128px).
        const maxHeight = 8 * 16;

        // Считаем, сколько нужно тексту.
        textarea.style.height = 'auto';
        const scrollH = textarea.scrollHeight;
        const currentH = parent.offsetHeight;

        // Не сжимаем ниже текущего размера — только растём.
        const wanted = Math.max(scrollH, currentH);
        const finalH = Math.min(wanted, maxHeight);

        // Устанавливаем целевую высоту — transition сработает за счёт CSS.
        textarea.style.height = finalH + 'px';
        parent.style.height = finalH + 'px';
    }
    /**
     * Запускает короткую CSS-анимацию fade-in на контейнере комментария.
     *
     * Хитрость: чтобы анимация сработала заново (даже если класс уже был),
     * сначала удаляем класс, форсируем reflow, потом добавляем снова.
     * Без этого повторное применение того же класса не перезапускает
     * keyframes-анимацию.
     */
    function triggerCommentFadeIn() {
        if (!commentBody) return;

        // Снимаем класс (если был) — иначе анимация не перезапустится.
        commentBody.classList.remove('proschet-comment-fade-in');

        // Форсируем reflow — браузер обрабатывает удаление класса.
        void commentBody.offsetWidth;

        // Добавляем класс заново — теперь анимация стартует.
        commentBody.classList.add('proschet-comment-fade-in');
    }

    // ========================================================================
    // 8. ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМА (ОДНО-/МНОГОСТРАНИЧНЫЙ).
    // ========================================================================

    /**
     * Двойной клик по одной из половинок переключателя.
     *
     * Логика:
     *   - если кликнули по УЖЕ активной половине — ничего не делаем;
     *   - если по неактивной — снимаем активность со всех, ставим на неё,
     *     обновляем data-атрибут mode у контейнера.
     *
     * На этом шаге это чисто визуальное переключение. Сохранение
     * в БД и создание PrintComponent будут подключены на следующем шаге.
     */
    function handleModeSwitchDblClick(event) {
        const btn = event.target.closest('.proschet-mode-btn');
        if (!btn) return;

        // Уже активная — не переключаем.
        if (btn.classList.contains('active')) return;

        // Снимаем активность со всех кнопок.
        modeSwitch.querySelectorAll('.proschet-mode-btn').forEach(function (b) {
            b.classList.remove('active');
        });

        // Ставим на кликнутую.
        btn.classList.add('active');

        // Запоминаем выбранное значение в data-mode контейнера.
        modeSwitch.dataset.mode = btn.dataset.value;

        console.log('Режим переключён на:', btn.dataset.value);
    }

    // ========================================================================
    // 9. СПИСОК ПРИНТЕРОВ В БЛОКЕ УПРАВЛЕНИЯ ПЕЧАТНЫМИ КОМПОНЕНТАМИ.
    // ========================================================================

    // Флаг, что список принтеров уже загружен и не надо дёргать сервер снова.
    let printersLoaded = false;

    /**
     * Загружает список принтеров с сервера (один раз) и заполняет <select>.
     * Использует существующий API приложения calculator:
     *   GET /calculator/get-printers/
     * Возвращает: {success: true, printers: [{id, name, ...}]}
     */
    function loadPrinters() {
        if (!printerSelect) return;
        if (printersLoaded) return;

        fetch('/calculator/get-printers/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !Array.isArray(data.printers)) {
                console.warn('Не удалось получить список принтеров');
                return;
            }

            // Очищаем и заново наполняем (оставляем первым placeholder).
            printerSelect.innerHTML = '<option value="">— Выберите принтер —</option>';

            data.printers.forEach(function (p) {
                const opt = document.createElement('option');
                opt.value = String(p.id);
                opt.textContent = p.name;
                printerSelect.appendChild(opt);
            });

            // Сохраняем список в глобальную переменную — пригодится
            // при рендере карточек компонентов (там нужно заполнять селекты).
            window.PROSHETY_PRINTERS = data.printers;

            printersLoaded = true;
            console.log('✅ Загружено принтеров:', data.printers.length);
        })
        .catch(function (err) {
            console.error('Ошибка загрузки принтеров:', err);
        });
    }  
    // Флаг, что бумаги уже загружены.
    let papersLoaded = false;

    /**
     * Загружает список бумаг (sklad.Material, type='paper').
     * Использует существующий API приложения calculator:
     *   GET /calculator/get-papers/
     * Возвращает: {success: true, papers: [{id, name, price, unit}]}
     */
    function loadPapers() {
        if (!paperSelect) return;
        if (papersLoaded) return;

        fetch('/calculator/get-papers/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !Array.isArray(data.papers)) {
                console.warn('Не удалось получить список бумаг');
                return;
            }

            paperSelect.innerHTML = '<option value="">— Выберите бумагу —</option>';

            data.papers.forEach(function (p) {
                const opt = document.createElement('option');
                opt.value = String(p.id);
                opt.textContent = p.name;
                paperSelect.appendChild(opt);
            });

            // Сохраняем список в глобальную переменную.
            window.PROSHETY_PAPERS = data.papers;

            papersLoaded = true;
            console.log('✅ Загружено бумаг:', data.papers.length);
        })
        .catch(function (err) {
            console.error('Ошибка загрузки бумаг:', err);
        });
    } 
    // ========================================================================
    // 10. СОЗДАНИЕ ПЕЧАТНОГО КОМПОНЕНТА.
    // ========================================================================

    /**
     * Обработчик клика по кнопке «+ Добавить печатный компонент».
     *
     * Логика:
     *   1. Проверяем, что выбран просчёт, принтер и бумага.
     *   2. POST /calculator/add-print-component/ — создаёт PrintComponent
     *      и одностраничный VichisliniyaListovModel.
     *   3. Если режим «Многостраничный» — дополнительно
     *      POST /vichisliniya_listov/save/ с is_active=true,
     *      чтобы активировать многостраничный расчёт.
     *   4. Очищаем выбор принтера и бумаги — чтобы случайно
     *      не создать дубликат тем же кликом.
     *
     * Список печатных компонентов под кнопкой появится на следующем шаге —
     * сейчас мы просто создаём компонент и показываем уведомление.
     */
    function handleAddComponent() {
        // Проверяем активный просчёт.
        if (!activeProschet || !activeProschet.id) {
            showNotification('Сначала выберите просчёт', 'warning');
            return;
        }

        // Читаем значения из полей.
        const printerId = printerSelect ? printerSelect.value : '';
        const paperId   = paperSelect   ? paperSelect.value   : '';
        const mode      = modeSwitch ? (modeSwitch.dataset.mode || 'single') : 'single';

        if (!printerId) {
            showNotification('Выберите принтер', 'error');
            if (printerSelect) printerSelect.focus();
            return;
        }
        if (!paperId) {
            showNotification('Выберите бумагу', 'error');
            if (paperSelect) paperSelect.focus();
            return;
        }

        // Блокируем кнопку от двойного клика.
        const addBtn = document.getElementById('proschet-btn-add-component');
        const originalText = addBtn ? addBtn.textContent : '';
        if (addBtn) {
            addBtn.disabled = true;
            addBtn.textContent = 'Добавление...';
        }

        // --- Шаг 1: создаём PrintComponent (и одностраничный расчёт). ---
        const fd = new FormData();
        fd.append('proschet_id', activeProschet.id);
        fd.append('printer_id',  printerId);
        fd.append('paper_id',    paperId);
        fd.append('print_type',  'color');   // по умолчанию — цветная; смена типа позже

        fetch('/calculator/add-print-component/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                throw new Error(data.message || 'Не удалось создать печатный компонент');
            }
            const componentId = data.component ? data.component.id : null;
            if (!componentId) {
                throw new Error('Сервер не вернул id созданного компонента');
            }

            // --- Шаг 2: если выбран многостраничный режим — активируем его. ---
            if (mode === 'multi') {
                return activateMultipage(componentId).then(function () {
                    return componentId;
                });
            }
            return componentId;
        })
        .then(function (componentId) {
            showNotification('Печатный компонент добавлен', 'success');
            console.log('✅ Печатный компонент создан, id =', componentId);

            // Сбрасываем выбор полей, чтобы случайный клик не создал дубль.
            if (printerSelect) printerSelect.value = '';
            if (paperSelect)   paperSelect.value   = '';

            // Обновляем таблицу компонентов.
            if (activeProschet && activeProschet.id) {
                loadComponents(activeProschet.id);
            }
        })
        .catch(function (err) {
            console.error(err);
            showNotification(err.message || 'Ошибка при добавлении печатного компонента', 'error');
        })
        .finally(function () {
            if (addBtn) {
                addBtn.disabled = false;
                addBtn.textContent = originalText;
            }
        });
    }

    /**
     * Активирует многостраничный режим для указанного печатного компонента.
     *
     * Вызывает существующий эндпоинт приложения vichisliniya_listov:
     *   POST /vichisliniya_listov/save/
     * с телом { print_component_id, is_active: true }.
     *
     * Все остальные параметры многостраничного расчёта (total_pages=4,
     * A4, portrait, vyleta=1, color=4+0) подставятся дефолтами из view
     * multipage_save_data.
     */
    function activateMultipage(componentId) {
        return fetch('/vichisliniya_listov/save/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                print_component_id: componentId,
                is_active: true
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                throw new Error(data.message || 'Не удалось активировать многостраничный режим');
            }
            return data;
        });
    }    
    // ========================================================================
    // 11. ТАБЛИЦА ПЕЧАТНЫХ КОМПОНЕНТОВ.
    // ========================================================================

    /**
     * Загружает печатные компоненты для указанного просчёта.
     * Использует существующий API приложения calculator:
     *   GET /calculator/get-print-components/<proschet_id>/
     */
    function loadComponents(proschetId) {
        if (!componentsSection) return;
        if (!proschetId) return;

        fetch('/calculator/get-print-components/' + proschetId + '/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                console.warn('Не удалось загрузить компоненты:', data.message);
                return;
            }
            renderComponents(data.components || []);
        })
        .catch(function (err) {
            console.error('Ошибка загрузки компонентов:', err);
        });
    }

    /**
     * Рендерит таблицу компонентов.
     * Если массив пустой — показываем сообщение, саму таблицу скрываем.
     */
    function renderComponents(components) {
        if (!componentsSection) return;

        // Показываем секцию.
        componentsSection.style.display = 'block';

        // Очищаем контейнер от старых карточек.
        const list = document.getElementById('proschet-components-list');
        if (list) list.innerHTML = '';

        if (components.length === 0) {
            if (componentsEmpty) componentsEmpty.style.display = 'block';
            if (list) list.style.display = 'none';
            return;
        }

        if (componentsEmpty) componentsEmpty.style.display = 'none';
        if (list) list.style.display = 'flex';

        components.forEach(function (comp) {
            const card = createComponentCard(comp);
            if (list) list.appendChild(card);
        });
    }

    // ========================================================================
    // 12. КАРТОЧКА ПЕЧАТНОГО КОМПОНЕНТА (одна строка, как блок управления).
    // ========================================================================

    /**
     * Создаёт карточку одного печатного компонента — в одну строку.
     * Разметка и классы совпадают с блоком управления печатными компонентами,
     * чтобы визуально всё было единообразно.
     *
     * Пока это визуальный каркас — селекты и переключатели не имеют
     * обработчиков, кроме кнопки удаления (тоже пока без действия).
     */
    function createComponentCard(comp) {
        const card = document.createElement('div');
        // Базовый класс + модификатор фона по режиму:
        // single (одностраничный) — светло-зелёный;
        // multi (многостраничный) — светло-голубой.
        const modeClass = comp.is_multipage
            ? 'proschet-component-card--multi'
            : 'proschet-component-card--single';
        card.className = 'proschet-component-card ' + modeClass;
        card.dataset.componentId = comp.id;

        // Номер компонента (KP-N) создаём здесь, но вставим его
        // в конец — перед кнопкой удаления (см. ниже).
        const numberEl = document.createElement('span');
        numberEl.className = 'proschet-component-number';
        numberEl.textContent = comp.number || '—';

        // --- Поле «Принтер»: селект с принтерами ---
        // До двойного клика селект «заморожен» классом is-locked
        // (pointer-events: none) — защита от случайного сбития.
        const printerField = createInlineField('Принтер');
        printerField.dataset.field = 'printer';
        printerField.title = 'Двойной клик для редактирования';
        const printerSelectEl = document.createElement('select');
        printerSelectEl.className = 'proschet-field-select is-locked';
        printerSelectEl.dataset.field = 'printer';
        fillPrinterOptions(printerSelectEl, comp.printer_name);
        printerField.appendChild(printerSelectEl);
        card.appendChild(printerField);

        // --- Поле «Бумага»: селект с бумагами ---
        // До двойного клика селект «заморожен» классом is-locked.
        const paperField = createInlineField('Бумага');
        paperField.dataset.field = 'paper';
        paperField.title = 'Двойной клик для редактирования';
        const paperSelectEl = document.createElement('select');
        paperSelectEl.className = 'proschet-field-select is-locked';
        paperSelectEl.dataset.field = 'paper';
        fillPaperOptions(paperSelectEl, comp.paper_name);
        paperField.appendChild(paperSelectEl);

        // Добавляем бумагу в карточку сразу после принтера (по порядку).
        card.appendChild(paperField);

        // Цена бумаги — сразу после селекта бумаги, мелко серым.
        if (comp.paper_price) {
            const priceSpan = document.createElement('span');
            priceSpan.className = 'proschet-component-paper-price';
            priceSpan.textContent = Number(comp.paper_price).toFixed(2) + ' ₽/лист';
            card.appendChild(priceSpan);
        }

        // --- Поле «Тип»: переключатель Цветная / Ч/б ---
        const typeField = createInlineField('Тип');
        const typeSwitch = document.createElement('div');
        typeSwitch.className = 'proschet-mode-switch';
        typeSwitch.dataset.field = 'print_type';
        typeSwitch.dataset.value = comp.print_type || 'color';

        const btnColor = document.createElement('button');
        btnColor.type = 'button';
        btnColor.className = 'proschet-mode-btn';
        btnColor.dataset.value = 'color';
        btnColor.textContent = 'Цветная';
        if ((comp.print_type || 'color') === 'color') btnColor.classList.add('active');
        typeSwitch.appendChild(btnColor);

        const btnBw = document.createElement('button');
        btnBw.type = 'button';
        btnBw.className = 'proschet-mode-btn';
        btnBw.dataset.value = 'bw';
        btnBw.textContent = 'Ч/б';
        if (comp.print_type === 'bw') btnBw.classList.add('active');
        typeSwitch.appendChild(btnBw);

        typeField.appendChild(typeSwitch);
        card.appendChild(typeField);

        // --- Поле «Режим»: переключатель Односторонний / Двусторонний ---
        const modeField = createInlineField('Режим');
        const modeSwitchEl = document.createElement('div');
        modeSwitchEl.className = 'proschet-mode-switch';
        modeSwitchEl.dataset.field = 'printing_mode';
        modeSwitchEl.dataset.value = comp.printing_mode || 'single';

        const btnSingle = document.createElement('button');
        btnSingle.type = 'button';
        btnSingle.className = 'proschet-mode-btn';
        btnSingle.dataset.value = 'single';
        btnSingle.textContent = 'Односторонний';
        if ((comp.printing_mode || 'single') === 'single') btnSingle.classList.add('active');
        modeSwitchEl.appendChild(btnSingle);

        const btnDuplex = document.createElement('button');
        btnDuplex.type = 'button';
        btnDuplex.className = 'proschet-mode-btn';
        btnDuplex.dataset.value = 'duplex';
        btnDuplex.textContent = 'Двусторонний';
        if (comp.printing_mode === 'duplex') btnDuplex.classList.add('active');
        modeSwitchEl.appendChild(btnDuplex);

        modeField.appendChild(modeSwitchEl);
        card.appendChild(modeField);

        // --- Номер компонента (вставляем перед кнопкой удаления) ---
        card.appendChild(numberEl);

        // --- Кнопка удаления (пока без обработчика) ---
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'proschet-component-delete-btn';
        delBtn.title = 'Удалить печатный компонент';
        delBtn.textContent = '×';
        card.appendChild(delBtn);

        return card;
    }

    /**
     * Создаёт обёртку одного inline-поля (label + контролы).
     * Использует те же классы, что и блок управления.
     */
    function createInlineField(labelText) {
        const wrap = document.createElement('div');
        wrap.className = 'proschet-inline-field';
        const label = document.createElement('label');
        label.className = 'proschet-inline-field-label';
        label.textContent = labelText + ':';
        wrap.appendChild(label);
        return wrap;
    }

    /**
     * Заполняет селект принтерами из глобального списка printersList.
     * @param {HTMLSelectElement} selectEl
     * @param {string} currentPrinterName — имя принтера, который должен быть выбран.
     */
    function fillPrinterOptions(selectEl, currentPrinterName) {
        const optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = '— Выберите принтер —';
        selectEl.appendChild(optEmpty);

        (window.PROSHETY_PRINTERS || []).forEach(function (p) {
            const opt = document.createElement('option');
            opt.value = String(p.id);
            opt.textContent = p.name;
            if (currentPrinterName && p.name === currentPrinterName) {
                opt.selected = true;
            }
            selectEl.appendChild(opt);
        });
    }

    /**
     * Заполняет селект бумагами из глобального списка papersList.
     */
    function fillPaperOptions(selectEl, currentPaperName) {
        const optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = '— Выберите бумагу —';
        selectEl.appendChild(optEmpty);

        (window.PROSHETY_PAPERS || []).forEach(function (p) {
            const opt = document.createElement('option');
            opt.value = String(p.id);
            opt.textContent = p.name;
            if (currentPaperName && p.name === currentPaperName) {
                opt.selected = true;
            }
            selectEl.appendChild(opt);
        });
    }

    // ========================================================================
    // 13. РЕДАКТИРОВАНИЕ ПОЛЕЙ КАРТОЧКИ (принтер, бумага).
    // ========================================================================

    /**
     * Двойной клик по обёртке поля (.proschet-inline-field с data-field).
     * Если внутри лежит ВЫКЛЮЧЕННЫЙ селект — включаем, фокусируем
     * и пытаемся открыть список (showPicker в новых Chrome/Edge).
     *
     * Пока селект выключен, клики в него не проходят (disabled),
     * поэтому двойной клик всегда приходит на обёртку — это и нужно.
     */
    function handleComponentFieldDblClick(event) {
        const fieldWrap = event.target.closest('.proschet-inline-field[data-field]');
        if (!fieldWrap) return;

        const select = fieldWrap.querySelector('select.proschet-field-select');
        if (!select) return;

        // Уже разблокирован — не трогаем.
        if (!select.classList.contains('is-locked')) return;

        // Запоминаем текущее значение.
        select.dataset.originalValue = select.value;

        // Снимаем класс is-locked — селект становится активным.
        select.classList.remove('is-locked');

        // Фокусируем и пытаемся открыть список.
        select.focus();
        try {
            if (typeof select.showPicker === 'function') {
                select.showPicker();
            }
        } catch (e) { /* не критично */ }
    }

    /**
     * Пользователь изменил значение в селекте принтера/бумаги.
     * Если оно отличается от исходного — отправляем на сервер.
     */
    function handleComponentFieldChange(event) {
        const select = event.target.closest('select.proschet-field-select');
        if (!select) return;
        if (select.classList.contains('is-locked')) return;

        const original = select.dataset.originalValue || '';
        const current  = select.value;

        // Значение не изменилось — просто замораживаем селект обратно.
        if (String(original) === String(current)) {
            select.classList.add('is-locked');
            return;
        }

        const card = select.closest('.proschet-component-card');
        if (!card) return;
        const componentId = card.dataset.componentId;
        if (!componentId) return;

        const fieldName = select.dataset.field;

        const fd = new FormData();
        fd.append('component_id', componentId);
        fd.append('field_name',   fieldName);
        fd.append('field_value',  current);

        console.log('Отправляю изменение компонента:', componentId, fieldName, current);

        fetch('/calculator/update-print-component/', {
            method: 'POST',
            body: fd,
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            console.log('Ответ сервера:', data);
            if (data.success) {
                showNotification('Сохранено', 'success');
                if (activeProschet && activeProschet.id) {
                    loadComponents(activeProschet.id);
                }
            } else {
                showNotification(data.message || 'Ошибка сохранения', 'error');
                if (activeProschet && activeProschet.id) {
                    loadComponents(activeProschet.id);
                }
            }
        })
        .catch(function (err) {
            console.error('Ошибка сохранения:', err);
            showNotification('Ошибка сети при сохранении', 'error');
        })
        .finally(function () {
            select.classList.add('is-locked');
        });
    }

    /**
     * Селект потерял фокус (кликнули мимо, не изменив значение).
     * С задержкой, чтобы change успел сработать первым.
     * Если через 150 мс селект всё ещё включён и не был обработан change —
     * просто выключаем его без сохранения.
     */
    function handleComponentFieldBlur(event) {
        const select = event.target.closest('select.proschet-field-select');
        if (!select) return;
        if (select.classList.contains('is-locked')) return;

        setTimeout(function () {
            if (!select.classList.contains('is-locked')) {
                select.classList.add('is-locked');
            }
        }, 150);
    }
})();