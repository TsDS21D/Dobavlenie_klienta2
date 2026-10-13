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
    // 1а. СТАТИЧЕСКИЙ СПИСОК ФОРМАТОВ ИЗДЕЛИЯ (одностраничный режим).
    // ========================================================================
    // Значения — в миллиметрах. При выборе формата ширина и высота
    // подставляются в соответствующие поля. При загрузке карточки
    // подходящий формат определяется по паре (ширина, высота).
    const PROSHETY_ITEM_FORMATS = [
        { name: 'Визитка 90×50', width: 90,  height: 50  },
        { name: 'Визитка 85×55', width: 85,  height: 55  },
        { name: 'A7 74×105',     width: 74,  height: 105 },
        { name: 'A6 105×148',    width: 105, height: 148 },
        { name: 'A5 148×210',    width: 148, height: 210 },
        { name: 'A4 210×297',    width: 210, height: 297 },
        { name: 'A3 297×420',    width: 297, height: 420 },
    ];

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
        // Клик по названию — раскрыть/свернуть полный текст.
        // В обычном состоянии название обрезано до 3 строк (line-clamp в CSS).
        // По клику класс .expanded снимает обрезку и показывает текст целиком.
        if (proschetNameEl) {
            proschetNameEl.addEventListener('click', handleProschetNameClick);
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
        // Загружаем справочники (один раз, кэшируем внутри функций).
        loadPrinters();
        loadPapers();
        loadLaminators();
        loadFilms();

        // Делегированные обработчики для селектов внутри карточек компонентов.
        // Работают на весь контейнер #proschet-components-section —
        // не нужно навешивать на каждую карточку отдельно.
        if (componentsSection) {
            componentsSection.addEventListener('dblclick', handleComponentFieldDblClick);
            // Переключатели «Тип» и «Односторонняя / Двусторонняя» —
            // тоже по двойному клику: защита от случайного нажатия.
            componentsSection.addEventListener('dblclick', handleComponentModeSwitchClick);
            componentsSection.addEventListener('change',   handleComponentFieldChange);
            componentsSection.addEventListener('blur',     handleComponentFieldBlur, true);

            // Поля второй строки (Формат / Ширина / Высота / Вылеты).
            //   • change  — выбор формата из селекта (подставляет Ш/В и сохраняет);
            //   • blur    — сохранение числового поля при уходе фокуса;
            //   • keydown — Enter сохраняет немедленно.
            // Событие input намеренно НЕ подписано: пока пользователь
            // печатает, ничего не пересчитывается и не сохраняется.
            componentsSection.addEventListener('change',  handleVichFormatChange);
            componentsSection.addEventListener('blur',    handleVichFieldBlur, true);
            componentsSection.addEventListener('keydown', handleVichFieldKeydown);

            // Третья строка: переключатель ориентации. Реагирует на ДВОЙНОЙ
            // клик — защита от случайного переключения.
            componentsSection.addEventListener('dblclick', handleOrientationSwitchClick);

            // Четвёртая строка: переключатель «Ламинация: включена / выключена».
            // Тоже по двойному клику.
            componentsSection.addEventListener('dblclick', handleLaminationSwitchClick);
        }

        // Кнопка «+ Добавить печатный компонент».
        const addComponentBtn = document.getElementById('proschet-btn-add-component');
        if (addComponentBtn) {
            addComponentBtn.addEventListener('click', handleAddComponent);
        }

        // Кнопка-стрелка под полем «Тираж»: разворачивает/сворачивает
        // блок добавления печатного компонента. По умолчанию блок скрыт.
        const toggleComponentsBtn = document.getElementById('proschet-toggle-components');
        if (toggleComponentsBtn) {
            toggleComponentsBtn.addEventListener('click', handleToggleComponentsClick);
        }

        // Удаление печатного компонента: делегированный клик по крестику
        // внутри любой карточки. Обработчик вешаем на контейнер
        // #proschet-components-section — он живёт всё время, а карточки
        // пересоздаются при каждой перезагрузке списка.
        if (componentsSection) {
            componentsSection.addEventListener('click', handleComponentDeleteClick);
        }

        // --- Модалка подтверждения удаления печатного компонента ---
        const compConfirmOverlay = document.getElementById('proschet-component-confirm-overlay');
        const compConfirmNo      = document.getElementById('proschet-component-confirm-no');
        const compConfirmYes     = document.getElementById('proschet-component-confirm-yes');

        if (compConfirmNo)  compConfirmNo.addEventListener('click', closeComponentConfirmModal);
        if (compConfirmYes) compConfirmYes.addEventListener('click', confirmComponentDeleteYes);
        if (compConfirmOverlay) {
            compConfirmOverlay.addEventListener('click', function (e) {
                if (e.target === compConfirmOverlay) closeComponentConfirmModal();
            });
        }
        // Esc закрывает модалку компонента, если она открыта.
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (!compConfirmOverlay) return;
            if (compConfirmOverlay.style.display !== 'flex') return;
            closeComponentConfirmModal();
        });

        console.log('✅ Секция «Просчёт» инициализирована');
    });

    // ========================================================================
    // 3. СОБЫТИЯ ОТ СПИСКА ПРОСЧЁТОВ.
    // ========================================================================

    function handleProschetSelected(event) {
        const d = event.detail || {};
        const prevId = activeProschet ? String(activeProschet.id) : null;
        const newId  = String(d.proschetId || '');

        activeProschet = {
            id:          newId,
            number:      d.proschetNumber || '',
            title:       d.proschetTitle  || '',
            circulation: d.proschetCirculation || '',
            comment:     d.proschetComment || '',
            discount:    d.proschetDiscount || ''
        };

        renderAll();

        // Загружаем печатные компоненты. Когда они придут — смотрим:
        //   • ни одного компонента → раскрываем блок добавления,
        //     чтобы сразу можно было добавить первый;
        //   • хотя бы один есть → блок остаётся скрытым.
        //
        // Так делаем ТОЛЬКО при смене просчёта — при обновлении данных
        // того же самого (например, после WebSocket-события) состояние
        // блока не трогаем, иначе он будет «моргать».
        loadComponents(activeProschet.id).then(function (components) {
            if (prevId === newId) return;
            const list = components || [];
            setComponentsBlockOpen(list.length === 0);
        });
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

        // Сбрасываем «раскрытое» состояние — при смене просчёта название
        // должно снова показываться обрезанным до 3 строк.
        proschetNameEl.classList.remove('expanded');

        if (!activeProschet || (!activeProschet.number && !activeProschet.title)) {
            proschetNumberEl.textContent = '—';
            proschetNameEl.textContent   = '—';
            return;
        }

        // Номер и название — в две отдельные строки, без разделителя.
        proschetNumberEl.textContent = activeProschet.number || '—';
        proschetNameEl.textContent   = activeProschet.title  || '—';
    }

    /**
     * Клик по названию просчёта — переключает «обрезано / раскрыто».
     * В обычном виде название обрезано до 3 строк через line-clamp в CSS.
     * Класс .expanded снимает обрезку и показывает полный текст.
     * Повторный клик возвращает обрезку.
     */
    function handleProschetNameClick() {
        if (!proschetNameEl) return;

        if (proschetNameEl.classList.contains('expanded')) {
            // Сворачиваем обратно — возвращается обрезка в 3 строки.
            proschetNameEl.classList.remove('expanded');
        } else {
            // Раскрываем — показываем весь текст целиком.
            proschetNameEl.classList.add('expanded');
        }
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

        // Если редактор комментария УЖЕ ОТКРЫТ (класс .editing) — не трогаем
        // содержимое. Это защита от асинхронного обновления данных просчёта:
        // двойной клик по комментарию в списке вызывает refreshProschetData,
        // прилетает второй proschetSelected — и без этой проверки
        // renderComment перезаписал бы textarea, редактор «закрылся бы».
        //
        // ВАЖНО: проверяем именно класс .editing, а НЕ наличие textarea.
        // cancelComment() и saveComment() сначала снимают класс, потом
        // вызывают renderComment — с проверкой по классу всё корректно
        // перерисовывается. С проверкой по textarea мы бы никогда не смогли
        // закрыть редактор: textarea-то всё ещё внутри.
        if (commentBody.classList.contains('editing')) {
            return;
        }

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

                // Обновляем ячейку комментария в списке просчётов —
                // чтобы начало комментария появилось сразу, без перезагрузки.
                const row = document.querySelector(
                    '.list-proschet-row[data-proschet-id="' + activeProschet.id + '"]'
                );
                if (row) {
                    const cell = row.querySelector('.col-comment');
                    if (cell) {
                        cell.textContent = activeProschet.comment || '—';
                    }
                }

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

    // Флаг, что список ламинаторов уже загружен.
    let laminatorsLoaded = false;

    /**
     * Загружает список ламинаторов (для поля «Ламинатор» в строке
     * «Ламинация» карточки). Использует API приложения print_price.
     */
    function loadLaminators() {
        if (laminatorsLoaded) return;

        fetch('/print_price/laminators/api/get_laminators/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !Array.isArray(data.laminators)) {
                console.warn('Не удалось получить список ламинаторов');
                return;
            }
            window.PROSHETY_LAMINATORS = data.laminators;
            laminatorsLoaded = true;
            console.log('✅ Загружено ламинаторов:', data.laminators.length);
        })
        .catch(function (err) {
            console.error('Ошибка загрузки ламинаторов:', err);
        });
    }

    // Флаг, что список плёнок уже загружен.
    let filmsLoaded = false;

    /**
     * Загружает список плёнок (sklad.Material, type='film').
     * Использует API приложения sklad.
     */
    function loadFilms() {
        if (filmsLoaded) return;

        fetch('/sklad/api/films/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success || !Array.isArray(data.films)) {
                console.warn('Не удалось получить список плёнок');
                return;
            }
            window.PROSHETY_FILMS = data.films;
            filmsLoaded = true;
            console.log('✅ Загружено плёнок:', data.films.length);
        })
        .catch(function (err) {
            console.error('Ошибка загрузки плёнок:', err);
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
        const mode      = modeSwitch ? (modeSwitch.dataset.mode || '') : '';

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
        if (!mode) {
            showNotification('Выберите режим', 'error');
            // Подсвечиваем переключатель на 1.2 сек — визуальный аналог
            // того, как браузер фокусирует поле принтера/бумаги.
            highlightModeSwitch();
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

            // Сбрасываем выбор режима — обе половины переключателя
            // снова серые. Пока пользователь явно не выберет
            // одно-/многостраничный, кнопка не подсвечивается.
            if (modeSwitch) {
                modeSwitch.querySelectorAll('.proschet-mode-btn').forEach(function (b) {
                    b.classList.remove('active');
                });
                modeSwitch.dataset.mode = '';
            }

            // Обновляем таблицу компонентов.
            if (activeProschet && activeProschet.id) {
                loadComponents(activeProschet.id);
                // Уведомляем другие окна, что печатные компоненты изменились.
                notifyChange(activeProschet.id, 'print_component_added');
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
        // Функция возвращает промис, который резолвится массивом
        // загруженных компонентов (или [] при ошибке).
        // Это нужно, чтобы вызывающий код мог дождаться загрузки и,
        // например, принять решение об открытии/закрытии блока
        // добавления печатного компонента.
        if (!componentsSection) return Promise.resolve([]);
        if (!proschetId) return Promise.resolve([]);

        return fetch('/calculator/get-print-components/' + proschetId + '/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.success) {
                console.warn('Не удалось загрузить компоненты:', data.message);
                return [];
            }
            const components = data.components || [];

            // Для каждого компонента подгружаем вычисления листов
            // (ширина, высота, вылеты и т.д.) и складываем в comp._vich.
            // Эта информация понадобится карточке для полей
            // «Формат / Ширина / Высота / Вылеты».
            return Promise.all(components.map(function (comp) {
                // Параллельно подтягиваем два блока данных для компонента:
                //   1) вычисления листов (ширина/высота/вылеты, раскладка);
                //   2) ламинацию (включена/выключена и её параметры).
                // Оба ответа складываем в сам объект компонента —
                // так карточке всё под рукой.

                // --- 1) Вычисления листов ---
                const vichPromise = fetch('/vichisliniya_listov/get-data/' + comp.id + '/', {
                    method: 'GET',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                })
                .then(function (r) { return r.json(); })
                .then(function (vich) {
                    if (vich && vich.success) {
                        comp._vich = {
                            item_width:               vich.item_width,
                            item_height:              vich.item_height,
                            vyleta:                   vich.vyleta,
                            color:                    vich.color,
                            polosa_count:             vich.polosa_count,
                            fit_horizontal:           vich.fit_horizontal,
                            fit_vertical:             vich.fit_vertical,
                            fit_total:                vich.fit_total,
                            fit_landscape_total:      vich.fit_landscape_total,
                            fit_portrait_total:       vich.fit_portrait_total,
                            fit_selected_orientation: vich.fit_selected_orientation,
                            list_count:               vich.list_count,
                            cuts_count:               vich.cuts_count,
                            // Данные о печатном листе — нужны для отрисовки
                            // мини-схемы размещения в карточке компонента.
                            sheet_width:              vich.sheet_width,
                            sheet_height:             vich.sheet_height,
                            margin:                   vich.margin,
                        };
                    }
                    return comp;
                })
                .catch(function () { return comp; });

                // --- 2) Ламинация ---
                const lamPromise = fetch('/calculator/get-lamination/' + comp.id + '/', {
                    method: 'GET',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                })
                .then(function (r) { return r.json(); })
                .then(function (lam) {
                    if (lam && lam.success) {
                        comp._lamination = lam.lamination;
                    }
                    return comp;
                })
                .catch(function () { return comp; });

                // Ждём оба запроса, потом отдаём компонент.
                return Promise.all([vichPromise, lamPromise]).then(function () {
                    return comp;
                });
            }));
        })
        .then(function (components) {
            renderComponents(components);
            return components;
        })
        .catch(function (err) {
            console.error('Ошибка загрузки компонентов:', err);
            return [];
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

        // После вставки в DOM рисуем мини-схемы размещения.
        // requestAnimationFrame — чтобы браузер успел применить стили
        // и корректно прочитать размеры canvas.
        requestAnimationFrame(function () {
            if (!list) return;
            list.querySelectorAll('.proschet-component-card').forEach(function (c) {
                drawComponentPlacement(c);
                updateOrientationOptimalMark(c);
            });
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

        // --- Переключатель «Одна сторона / Вторая сторона» (без метки) ---
        // Визуально это две ячейки:
        //   • левая  — «Одна сторона»: печатается всегда, поэтому
        //              всегда с классом .active (зелёная);
        //   • правая — при двустороннем режиме «Вторая сторона»
        //              (тоже зелёная, .active); при одностороннем —
        //              «Не печатается» серым на белом (без .active).
        const isDuplex = (comp.printing_mode || 'single') === 'duplex';
        // Тип печати — цветная (color) или ч/б (bw). От него зависит
        // фон ОБЕИХ кнопок сторон: и «Первой», и «Второй».
        const isColorPrint = (comp.print_type || 'color') === 'color';
        const sideBgClass = isColorPrint
            ? 'proschet-mode-btn--side-color'
            : 'proschet-mode-btn--side-bw';

        const modeField = document.createElement('div');
        modeField.className = 'proschet-inline-field';
        const modeSwitchEl = document.createElement('div');
        modeSwitchEl.className = 'proschet-mode-switch';
        modeSwitchEl.dataset.field = 'printing_mode';
        modeSwitchEl.dataset.value = comp.printing_mode || 'single';

        // Левая кнопка:
        //   single — «Односторонняя печать»;
        //   duplex — «Двусторонняя» (в паре с правой «печать» читается
        //            как одна фраза «Двусторонняя печать»).
        const btnSingle = document.createElement('button');
        btnSingle.type = 'button';
        btnSingle.className = 'proschet-mode-btn';
        btnSingle.dataset.value = 'single';
        btnSingle.textContent = isDuplex ? 'Двусторонняя' : 'Односторонняя печать';
        btnSingle.classList.add('active');         // печатается всегда
        btnSingle.classList.add(sideBgClass);      // фон по типу печати
        modeSwitchEl.appendChild(btnSingle);

        // Правая кнопка:
        //   single — «Двусторонняя печать» (неактивна, серым на белом) —
        //            обозначает, что можно включить двусторонний режим;
        //   duplex — «печать» (активна, фон по типу печати) — вместе
        //            с левой «Двусторонняя» читается как одна фраза.
        const btnDuplex = document.createElement('button');
        btnDuplex.type = 'button';
        btnDuplex.className = 'proschet-mode-btn';
        btnDuplex.dataset.value = 'duplex';
        btnDuplex.textContent = isDuplex ? 'печать' : 'Двусторонняя печать';
        if (isDuplex) {
            btnDuplex.classList.add('active');
            btnDuplex.classList.add(sideBgClass);  // фон по типу печати
        } else {
            // Односторонний режим: правая половина пустая, но обозначена
            // тонкой серой рамкой — как «место под второй проход».
            btnDuplex.classList.add('proschet-mode-btn--side-empty');
        }
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

        // --- Вторая строка: Формат / Ширина / Высота / Вылеты ---
        // Только для одностраничного режима (is_multipage === false).
        // Для многостраничного пока ничего не показываем — там свои поля.
        if (!comp.is_multipage) {
            const row2 = document.createElement('div');
            row2.className = 'proschet-component-card-row2';

            // Левая колонка — поля Формат/Ширина/Высота/Вылеты
            // И переключатель ориентации под ними.
            // Справа от колонки встанет мини-схема, и переключатель
            // окажется ровно под строкой полей, а не под схемой.
            const fieldsCol = document.createElement('div');
            fieldsCol.className = 'proschet-component-card-fields';

            const fieldsRow = document.createElement('div');
            fieldsRow.className = 'proschet-component-card-fields-row';

            const vich = comp._vich || {};
            const w = vich.item_width  !== undefined ? Number(vich.item_width)  : '';
            const h = vich.item_height !== undefined ? Number(vich.item_height) : '';
            const v = vich.vyleta      !== undefined ? Number(vich.vyleta)      : '';

            // --- Формат (селект) ---
            const fmtField = document.createElement('div');
            fmtField.className = 'proschet-inline-field';
            const fmtLabel = document.createElement('label');
            fmtLabel.className = 'proschet-inline-field-label';
            fmtLabel.textContent = 'Формат:';
            fmtField.appendChild(fmtLabel);

            const fmtSelect = document.createElement('select');
            fmtSelect.className = 'proschet-vich-format';
            fmtSelect.dataset.vichField = 'format';

            const optNone = document.createElement('option');
            optNone.value = '';
            optNone.textContent = '— Не выбран —';
            fmtSelect.appendChild(optNone);

            // Подбираем текущий формат по паре (ширина, высота).
            let matchedFormatName = '';
            PROSHETY_ITEM_FORMATS.forEach(function (f) {
                const opt = document.createElement('option');
                opt.value = f.name;
                opt.textContent = f.name;
                opt.dataset.width  = f.width;
                opt.dataset.height = f.height;
                if (Number(f.width) === Number(w) && Number(f.height) === Number(h)) {
                    opt.selected = true;
                    matchedFormatName = f.name;
                }
                fmtSelect.appendChild(opt);
            });
            fmtField.appendChild(fmtSelect);
            fieldsRow.appendChild(fmtField);

            // --- Ширина (мм) ---
            fieldsRow.appendChild(createVichNumberField('Ширина:', 'item_width',  w, 'мм'));
            // --- Высота (мм) ---
            fieldsRow.appendChild(createVichNumberField('Высота:',  'item_height', h, 'мм'));
            // --- Вылеты (мм) ---
            fieldsRow.appendChild(createVichNumberField('Вылеты:',  'vyleta',      v, 'мм'));

            // Строка полей готова — кладём её в левую колонку.
            fieldsCol.appendChild(fieldsRow);

            // --- Мини-схема размещения на листе ---
            // Две стороны листа: лицевая и обратная. Отрисовка — в функции
            // drawComponentPlacement() после вставки карточки в DOM
            // (иначе canvas может не иметь размеров в момент создания).
            const viz = document.createElement('div');
            viz.className = 'proschet-component-viz';

            // Лицевая сторона.
            const vizFront = document.createElement('div');
            vizFront.className = 'proschet-component-viz-side';
            const lblFront = document.createElement('div');
            lblFront.className = 'proschet-component-viz-label';
            lblFront.textContent = 'Лицевая';
            const cvFront = document.createElement('canvas');
            cvFront.className = 'proschet-component-viz-canvas proschet-component-viz-canvas--front';
            cvFront.width = 240;
            cvFront.height = 180;
            vizFront.appendChild(lblFront);
            vizFront.appendChild(cvFront);
            viz.appendChild(vizFront);

            // Обратная сторона.
            const vizBack = document.createElement('div');
            vizBack.className = 'proschet-component-viz-side';
            const lblBack = document.createElement('div');
            lblBack.className = 'proschet-component-viz-label';
            lblBack.textContent = 'Обратная';
            const cvBack = document.createElement('canvas');
            cvBack.className = 'proschet-component-viz-canvas proschet-component-viz-canvas--back';
            cvBack.width = 240;
            cvBack.height = 180;
            vizBack.appendChild(lblBack);
            vizBack.appendChild(cvBack);
            viz.appendChild(vizBack);

            row2.appendChild(viz);

            card.appendChild(row2);

            // --- Строка ориентации (Пересчитать / Альбомная / Портретная) ---
            // Идёт в той же левой колонке, сразу под строкой полей.
            // Разделительной черты тут нет — она одна, над всей row2.
            const row3 = document.createElement('div');
            row3.className = 'proschet-component-card-row3';

            const orientLabel = document.createElement('span');
            orientLabel.className = 'proschet-inline-field-label';
            orientLabel.textContent = 'Ориентация:';
            row3.appendChild(orientLabel);

            const orientSwitch = document.createElement('div');
            orientSwitch.className = 'proschet-mode-switch proschet-mode-switch--three';
            orientSwitch.dataset.field = 'fit_selected_orientation';
            orientSwitch.dataset.value = vich.fit_selected_orientation || 'auto';

            const orientVariants = [
                { value: 'auto',      text: 'Пересчитать' },
                { value: 'landscape', text: 'Альбомная' },
                { value: 'portrait',  text: 'Портретная' },
            ];
            orientVariants.forEach(function (variant) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'proschet-mode-btn';
                btn.dataset.value = variant.value;
                btn.textContent = variant.text;
                if ((vich.fit_selected_orientation || 'auto') === variant.value) {
                    btn.classList.add('active');
                }
                orientSwitch.appendChild(btn);
            });

            row3.appendChild(orientSwitch);
            fieldsCol.appendChild(row3);

            // --- Строка «Ламинация» ---
            // Пунктирная черта сверху (border-top в CSS) + label +
            // переключатель «Включена / Выключена». Переключается
            // по двойному клику — как и остальные переключатели.
            const row4 = document.createElement('div');
            row4.className = 'proschet-component-card-row4';

            // Верхняя подстрока: «Ламинация:» + кнопка вкл/выкл.
            const row4Line1 = document.createElement('div');
            row4Line1.className = 'proschet-component-card-row4-line';

            const lamLabel = document.createElement('span');
            lamLabel.className = 'proschet-inline-field-label';
            lamLabel.textContent = 'Ламинация:';
            row4Line1.appendChild(lamLabel);

            // Одна кнопка-переключатель: «Без ламинации» (светлая) или
            // «Включена» (зелёная). Начальное состояние берём из данных
            // ламинации, подтянутых в loadComponents.
            const isLamEnabled = !!(comp._lamination && comp._lamination.is_enabled);

            const lamSwitch = document.createElement('div');
            lamSwitch.className = 'proschet-lamination-toggle';
            lamSwitch.dataset.field = 'lamination_enabled';
            lamSwitch.dataset.value = isLamEnabled ? 'on' : 'off';

            const lamBtn = document.createElement('button');
            lamBtn.type = 'button';
            lamBtn.className = 'proschet-lamination-btn';
            if (isLamEnabled) {
                lamBtn.classList.add('proschet-lamination-btn--on');
                lamBtn.textContent = 'Включена';
            } else {
                lamBtn.textContent = 'Без ламинации';
            }
            lamSwitch.appendChild(lamBtn);
            row4Line1.appendChild(lamSwitch);

            // Верхняя подстрока готова — кладём её в row4.
            row4.appendChild(row4Line1);

            // Нижняя подстрока: Ламинатор / Плёнка / Односторонняя-Двусторонняя.
            // Показываем её только когда ламинация включена — иначе она
            // не имеет смысла и только загромождает карточку.
            const row4Line2 = document.createElement('div');
            row4Line2.className = 'proschet-component-card-row4-line';
            if (!isLamEnabled) {
                row4Line2.style.display = 'none';
            }

            // Значения полей ламинации из уже подгруженного comp._lamination.
            const lamData = comp._lamination || {};

            // --- Ламинатор ---
            const laminatorField = createInlineField('Ламинатор');
            laminatorField.dataset.field = 'laminator';
            laminatorField.title = 'Двойной клик для редактирования';
            const laminatorSelectEl = document.createElement('select');
            laminatorSelectEl.className = 'proschet-field-select is-locked';
            laminatorSelectEl.dataset.field = 'laminator';
            fillLaminatorOptions(laminatorSelectEl, lamData.laminator_name);
            laminatorField.appendChild(laminatorSelectEl);
            row4Line2.appendChild(laminatorField);

            // --- Плёнка ---
            const filmField = createInlineField('Плёнка');
            filmField.dataset.field = 'film';
            filmField.title = 'Двойной клик для редактирования';
            const filmSelectEl = document.createElement('select');
            filmSelectEl.className = 'proschet-field-select is-locked';
            filmSelectEl.dataset.field = 'film';
            fillFilmOptions(filmSelectEl, lamData.film_name);
            filmField.appendChild(filmSelectEl);
            row4Line2.appendChild(filmField);

            // --- Переключатель сторон: Односторонняя / Двусторонняя ---
            const sideIsDuplex = (lamData.side || 'single') === 'duplex';

            const sideField = document.createElement('div');
            sideField.className = 'proschet-inline-field';
            const sideSwitch = document.createElement('div');
            sideSwitch.className = 'proschet-mode-switch';
            sideSwitch.dataset.field = 'side';
            sideSwitch.dataset.value = lamData.side || 'single';

            const sideBtnSingle = document.createElement('button');
            sideBtnSingle.type = 'button';
            sideBtnSingle.className = 'proschet-mode-btn';
            sideBtnSingle.dataset.value = 'single';
            sideBtnSingle.textContent = 'Односторонняя';
            if (!sideIsDuplex) sideBtnSingle.classList.add('active');
            sideSwitch.appendChild(sideBtnSingle);

            const sideBtnDuplex = document.createElement('button');
            sideBtnDuplex.type = 'button';
            sideBtnDuplex.className = 'proschet-mode-btn';
            sideBtnDuplex.dataset.value = 'duplex';
            sideBtnDuplex.textContent = 'Двусторонняя';
            if (sideIsDuplex) sideBtnDuplex.classList.add('active');
            sideSwitch.appendChild(sideBtnDuplex);

            sideField.appendChild(sideSwitch);
            row4Line2.appendChild(sideField);

            // Нижняя подстрока готова — кладём её в row4.
            row4.appendChild(row4Line2);

            // Строка «Ламинация» идёт в ЛЕВУЮ колонку — сразу под
            // ориентацией, а не отдельным блоком карточки. Пунктирная
            // черта отделит её от row3 (см. CSS .proschet-component-card-row4).
            fieldsCol.appendChild(row4);

            // Левая колонка собрана — кладём её в row2,
            // следом за ней в row2 идёт viz (схема).
            row2.appendChild(fieldsCol);

            // Строка «Ламинация» — ОТДЕЛЬНАЯ строка карточки,
            // на всю ширину, ниже row2. Не в fieldsCol (иначе она
            // растянула бы левую колонку и viz уехала бы вниз).
            // row4 идёт В ЛЕВУЮ КОЛОНКУ, а не в карточку отдельным блоком.
            // Так она встанет сразу под ориентацией, отделённая пунктиром.
            fieldsCol.appendChild(row4);

            // Сохраняем полный объект _vich на DOM-элементе карточки —
            // понадобится при сохранении, чтобы отправить на сервер
            // полный набор полей (иначе сервер перепишет остальное
            // значениями по умолчанию).
            card._vich = {
                item_width:               Number(w) || 0,
                item_height:              Number(h) || 0,
                vyleta:                   Number(v) || 1,
                color:                    vich.color || '4+0',
                polosa_count:             vich.polosa_count || 1,
                fit_horizontal:           vich.fit_horizontal || 0,
                fit_vertical:             vich.fit_vertical || 0,
                fit_total:                vich.fit_total || 0,
                fit_landscape_total:      vich.fit_landscape_total || 0,
                fit_portrait_total:       vich.fit_portrait_total || 0,
                fit_selected_orientation: vich.fit_selected_orientation || 'auto',
                list_count:               vich.list_count || 0,
                cuts_count:               vich.cuts_count || 0,
                // Данные о печатном листе — для отрисовки мини-схемы.
                sheet_width:              vich.sheet_width,
                sheet_height:             vich.sheet_height,
                margin:                   vich.margin,
            };
        }

        return card;
    }

    /**
     * Создаёт одно inline-поле с числовым вводом для второй строки
     * карточки компонента (Ширина / Высота / Вылеты).
     *
     * @param {string} labelText — подпись поля (например, «Ширина:»).
     * @param {string} field     — имя поля в объекте _vich (item_width/…).
     * @param {number|string} value — текущее значение (может быть '').
     * @param {string} unit      — единица измерения (подпись после input).
     */
    function createVichNumberField(labelText, field, value, unit) {
        const wrap = document.createElement('div');
        wrap.className = 'proschet-inline-field';

        const label = document.createElement('label');
        label.className = 'proschet-inline-field-label';
        label.textContent = labelText;
        wrap.appendChild(label);

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'proschet-vich-input';
        input.dataset.vichField = field;
        input.min = '0';
        input.step = '1';
        input.value = (value === '' || value === null || value === undefined) ? '' : value;
        wrap.appendChild(input);

        const unitSpan = document.createElement('span');
        unitSpan.className = 'proschet-vich-unit';
        unitSpan.textContent = unit;
        wrap.appendChild(unitSpan);

        return wrap;
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

    /**
     * Заполняет селект ламинаторами из глобального списка.
     * @param {HTMLSelectElement} selectEl
     * @param {string} currentName — имя ламинатора, который должен быть выбран.
     */
    function fillLaminatorOptions(selectEl, currentName) {
        const optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = '— Выберите ламинатор —';
        selectEl.appendChild(optEmpty);

        (window.PROSHETY_LAMINATORS || []).forEach(function (l) {
            const opt = document.createElement('option');
            opt.value = String(l.id);
            opt.textContent = l.name;
            if (currentName && l.name === currentName) {
                opt.selected = true;
            }
            selectEl.appendChild(opt);
        });
    }

    /**
     * Заполняет селект плёнками из глобального списка.
     */
    function fillFilmOptions(selectEl, currentName) {
        const optEmpty = document.createElement('option');
        optEmpty.value = '';
        optEmpty.textContent = '— Выберите плёнку —';
        selectEl.appendChild(optEmpty);

        (window.PROSHETY_FILMS || []).forEach(function (f) {
            const opt = document.createElement('option');
            opt.value = String(f.id);
            opt.textContent = f.name;
            if (currentName && f.name === currentName) {
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
     * Клик по одной из кнопок переключателя внутри карточки:
     *   • «Тип» — Цветная / Ч/б;
     *   • «Односторонняя / Двусторонняя».
     *
     * Логика:
     *   - клик по уже активной кнопке — ничего не делаем;
     *   - иначе: снимаем .active со всех кнопок этой группы, ставим
     *     на кликнутую, обновляем data-value у группы, отправляем
     *     изменение на сервер (существующий API
     *     POST /calculator/update-print-component/), после успеха
     *     перезагружаем карточки (смена типа/режима меняет цену).
     */
    function handleComponentModeSwitchClick(event) {
        const btn = event.target.closest('.proschet-mode-btn');
        if (!btn) return;

        // Группа-переключатель.
        const switchEl = btn.closest('.proschet-mode-switch');
        if (!switchEl) return;

        // Переключатель должен быть внутри карточки компонента.
        const card = switchEl.closest('.proschet-component-card');
        if (!card) return;
        const componentId = card.dataset.componentId;
        if (!componentId) return;

        // Обрабатываем только три переключателя: тип печати, режим
        // печати и сторону ламинации.
        const fieldName = switchEl.dataset.field;
        if (fieldName !== 'print_type' &&
            fieldName !== 'printing_mode' &&
            fieldName !== 'side') return;

        const newValue = btn.dataset.value;
        if (!newValue) return;

        // Если значение уже выбрано — ничего не переключаем.
        // Проверка по data-value группы, а не по классу .active:
        // у printing_mode левая кнопка всегда .active, поэтому
        // проверка «btn.classList.contains('active')» тут не подходит.
        if (switchEl.dataset.value === newValue) return;

        // --- Визуально переключаем сразу, не ждём ответа сервера ---
        if (fieldName === 'side') {
            // Переключатель стороны ламинации: две взаимно исключающие
            // половины — Односторонняя / Двусторонняя.
            switchEl.querySelectorAll('.proschet-mode-btn').forEach(function (b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');
        } else if (fieldName === 'printing_mode') {
            // Две ячейки: у левой .active постоянный.
            // Меняем текст левой и активность+текст правой.
            const isDuplexNow = (newValue === 'duplex');
            const leftBtn  = switchEl.querySelector('.proschet-mode-btn[data-value="single"]');
            const rightBtn = switchEl.querySelector('.proschet-mode-btn[data-value="duplex"]');
            if (leftBtn) {
                leftBtn.classList.add('active');
                // single — «Односторонняя печать», duplex — «Двусторонняя».
                leftBtn.textContent = isDuplexNow ? 'Двусторонняя' : 'Односторонняя печать';
            }
            if (rightBtn) {
                rightBtn.textContent = isDuplexNow ? 'печать' : 'Двусторонняя печать';
                if (isDuplexNow) {
                    // Включаем правую сторону — ей тоже нужен фон по типу печати.
                    // Тип печати берём из соседнего переключателя print_type.
                    const typeSwitch = card.querySelector(
                        '.proschet-mode-switch[data-field="print_type"]'
                    );
                    const isColorNow = typeSwitch
                        ? (typeSwitch.dataset.value === 'color')
                        : true;
                    rightBtn.classList.remove('proschet-mode-btn--side-color');
                    rightBtn.classList.remove('proschet-mode-btn--side-bw');
                    rightBtn.classList.remove('proschet-mode-btn--side-empty');
                    rightBtn.classList.add(isColorNow
                        ? 'proschet-mode-btn--side-color'
                        : 'proschet-mode-btn--side-bw');
                    rightBtn.classList.add('active');
                } else {
                    // Выключаем правую сторону — убираем классы фона и .active,
                    // добавляем «пустой» модификатор (тонкая серая рамка).
                    rightBtn.classList.remove('proschet-mode-btn--side-color');
                    rightBtn.classList.remove('proschet-mode-btn--side-bw');
                    rightBtn.classList.remove('active');
                    rightBtn.classList.add('proschet-mode-btn--side-empty');
                }
            }
        } else {
            // print_type: взаимно исключающие половины — снять все,
            // поставить на выбранную.
            switchEl.querySelectorAll('.proschet-mode-btn').forEach(function (b) {
                b.classList.remove('active');
            });
            btn.classList.add('active');

            // Перекрашиваем ОБЕ кнопки сторон в соседнем переключателе
            // printing_mode — их фон зависит от типа печати.
            const sideButtons = card.querySelectorAll(
                '.proschet-mode-switch[data-field="printing_mode"] .proschet-mode-btn'
            );
            const bgColor = (newValue === 'bw')
                ? 'proschet-mode-btn--side-bw'
                : 'proschet-mode-btn--side-color';
            sideButtons.forEach(function (b) {
                b.classList.remove('proschet-mode-btn--side-color');
                b.classList.remove('proschet-mode-btn--side-bw');
                // Класс фона вешаем только на активные кнопки:
                // левая активна всегда, правая — только в duplex.
                if (b.classList.contains('active')) {
                    b.classList.add(bgColor);
                }
            });
        }
        switchEl.dataset.value = newValue;

        // Отправляем на сервер. Для поля «side» используется другой
        // эндпоинт — обновление ламинации.
        if (fieldName === 'side') {
            fetch('/calculator/update-lamination/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    print_component_id: componentId,
                    field_name:         'side',
                    field_value:        newValue
                })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    showNotification('Сохранено', 'success');
                    if (activeProschet && activeProschet.id) {
                        loadComponents(activeProschet.id);
                        notifyChange(activeProschet.id, 'print_component_changed');
                    }
                } else {
                    showNotification(data.error || data.message || 'Ошибка сохранения', 'error');
                    if (activeProschet && activeProschet.id) {
                        loadComponents(activeProschet.id);
                    }
                }
            })
            .catch(function (err) {
                console.error('Ошибка сохранения стороны ламинации:', err);
                showNotification('Ошибка сети при сохранении', 'error');
            });
            return;
        }

        // Остальные переключатели (print_type, printing_mode) —
        // через update-print-component.
        const fd = new FormData();
        fd.append('component_id', componentId);
        fd.append('field_name',   fieldName);
        fd.append('field_value',  newValue);

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
            if (data.success) {
                showNotification('Сохранено', 'success');
                // Смена типа/режима влияет на цену — перезагружаем карточки.
                if (activeProschet && activeProschet.id) {
                    loadComponents(activeProschet.id);
                    // Уведомляем другие окна.
                    notifyChange(activeProschet.id, 'print_component_changed');
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
            if (activeProschet && activeProschet.id) {
                loadComponents(activeProschet.id);
            }
        });
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

        // Поля «ламинатор» и «плёнка» живут в другой сущности (Laminate)
        // и сохраняются через /calculator/update-lamination/ (JSON).
        // Все остальные поля (printer, paper) — через update-print-component.
        if (fieldName === 'laminator' || fieldName === 'film') {
            fetch('/calculator/update-lamination/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    print_component_id: componentId,
                    field_name:         fieldName,
                    field_value:        current
                })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    showNotification('Сохранено', 'success');
                    if (activeProschet && activeProschet.id) {
                        loadComponents(activeProschet.id);
                        notifyChange(activeProschet.id, 'print_component_changed');
                    }
                } else {
                    showNotification(data.error || data.message || 'Ошибка сохранения', 'error');
                    if (activeProschet && activeProschet.id) {
                        loadComponents(activeProschet.id);
                    }
                }
            })
            .catch(function (err) {
                console.error('Ошибка сохранения ламинации:', err);
                showNotification('Ошибка сети при сохранении', 'error');
            })
            .finally(function () {
                select.classList.add('is-locked');
            });
            return;
        }

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
                    // Уведомляем другие окна.
                    notifyChange(activeProschet.id, 'print_component_changed');
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
    // ========================================================================
    // 14. УДАЛЕНИЕ ПЕЧАТНОГО КОМПОНЕНТА.
    // ========================================================================

    // ID компонента, ожидающего подтверждения удаления.
    // Заполняется при клике на крестик, читается в confirmComponentDeleteYes.
    let pendingDeleteComponentId = null;

    /**
     * Делегированный клик по крестику удаления внутри карточки.
     * Открывает модалку подтверждения; сам запрос на удаление
     * уходит только после нажатия «Удалить» в модалке.
     */
    function handleComponentDeleteClick(event) {
        const btn = event.target.closest('.proschet-component-delete-btn');
        if (!btn) return;
        event.stopPropagation();

        const card = btn.closest('.proschet-component-card');
        if (!card) return;
        const componentId = card.dataset.componentId;
        if (!componentId) return;

        // Запоминаем, кого будем удалять, и показываем модалку.
        pendingDeleteComponentId = componentId;

        const overlay = document.getElementById('proschet-component-confirm-overlay');
        if (overlay) overlay.style.display = 'flex';
    }

    /**
     * Закрывает модалку удаления компонента и сбрасывает ожидание.
     */
    function closeComponentConfirmModal() {
        const overlay = document.getElementById('proschet-component-confirm-overlay');
        if (overlay) overlay.style.display = 'none';
        pendingDeleteComponentId = null;
    }

    /**
     * Клик по «Удалить» в модалке: закрываем модалку и запускаем
     * само удаление.
     */
    function confirmComponentDeleteYes() {
        if (!pendingDeleteComponentId) {
            closeComponentConfirmModal();
            return;
        }
        const componentId = pendingDeleteComponentId;
        closeComponentConfirmModal();
        deletePrintComponent(componentId);
    }

    /**
     * Отправляет POST /calculator/delete-print-component/ с component_id.
     * Это существующий API приложения calculator — мягкое удаление
     * (is_deleted=True). После успеха перезагружаем список компонентов.
     */
    function deletePrintComponent(componentId) {
        const fd = new FormData();
        fd.append('component_id', componentId);

        fetch('/calculator/delete-print-component/', {
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
                // Красное уведомление — как у удаления просчёта.
                showNotification('Печатный компонент удалён', 'error');
                // Перезагружаем карточки.
                if (activeProschet && activeProschet.id) {
                    loadComponents(activeProschet.id);
                    // Уведомляем другие окна.
                    notifyChange(activeProschet.id, 'print_component_deleted');
                }
            } else {
                showNotification(data.message || 'Ошибка удаления компонента', 'error');
            }
        })
        .catch(function (err) {
            console.error('Ошибка удаления компонента:', err);
            showNotification('Ошибка сети при удалении компонента', 'error');
        });
    }
    // ========================================================================
    // 14а. РАЗВОРАЧИВАНИЕ/СВОРАЧИВАНИЕ БЛОКА ДОБАВЛЕНИЯ КОМПОНЕНТА.
    // ========================================================================

    /**
     * Клик по стрелке под полем «Тираж».
     * Если блок скрыт — открываем (плавно выезжает вниз),
     * если открыт — сворачиваем (плавно уезжает вверх).
     */
    function handleToggleComponentsClick() {
        if (!componentsBlock) return;
        const isOpen = componentsBlock.classList.contains('is-open');
        setComponentsBlockOpen(!isOpen);
    }

    /**
     * Устанавливает состояние открытости блока добавления компонента.
     * @param {boolean} open — true — открыть, false — свернуть.
     */
    function setComponentsBlockOpen(open) {
        if (!componentsBlock) return;

        const toggleBtn = document.getElementById('proschet-toggle-components');

        if (open) {
            componentsBlock.classList.add('is-open');
            if (toggleBtn) toggleBtn.classList.add('proschet-toggle-components--open');
        } else {
            componentsBlock.classList.remove('is-open');
            if (toggleBtn) toggleBtn.classList.remove('proschet-toggle-components--open');
        }
    }

    /**
     * Кратковременно подсвечивает переключатель режима красной рамкой —
     * визуальный отклик на «Выберите режим» при попытке создать
     * печатный компонент без выбора одно-/многостраничного режима.
     */
    function highlightModeSwitch() {
        if (!modeSwitch) return;
        modeSwitch.classList.add('proschet-mode-switch--invalid');
        setTimeout(function () {
            if (modeSwitch) {
                modeSwitch.classList.remove('proschet-mode-switch--invalid');
            }
        }, 1200);
    }

    // ========================================================================
    // 15. ПОЛЯ «ФОРМАТ / ШИРИНА / ВЫСОТА / ВЫЛЕТЫ» (одностраничный режим).
    // ========================================================================

    /**
     * Селект «Формат» — пользователь выбрал формат из списка.
     * Подставляем ширину и высоту в соответствующие поля карточки
     * и сохраняем результат на сервере.
     */
    function handleVichFormatChange(event) {
        const select = event.target.closest('.proschet-vich-format');
        if (!select) return;

        const card = select.closest('.proschet-component-card');
        if (!card) return;
        const componentId = card.dataset.componentId;
        if (!componentId) return;

        const opt = select.options[select.selectedIndex];
        if (!opt) return;

        const width  = parseFloat(opt.dataset.width);
        const height = parseFloat(opt.dataset.height);
        if (isNaN(width) || isNaN(height)) return;   // «— Не выбран —»

        // Обновляем значения в полях и в локальном объекте _vich.
        const wInput = card.querySelector('.proschet-vich-input[data-vich-field="item_width"]');
        const hInput = card.querySelector('.proschet-vich-input[data-vich-field="item_height"]');
        if (wInput) wInput.value = width;
        if (hInput) hInput.value = height;

        if (card._vich) {
            card._vich.item_width  = width;
            card._vich.item_height = height;
        }

        // Выбор формата — тоже смена размеров, поэтому сбрасываем
        // ориентацию на «Авто»: программа заново подберёт оптимальную.
        resetOrientationToAuto(card);

        // Пересчитываем раскладку и количество листов.
        recalculateVichFitting(card);
        recalculateVichListCount(card);

        // Мгновенная перерисовка — не ждём ответа сервера.
        updateOrientationOptimalMark(card);
        drawComponentPlacement(card);

        // Отправляем на сервер (асинхронно).
        saveVichData(componentId, card);
    }

    /**
     * Потеря фокуса на числовом поле. Сохраняем, если значение изменилось.
     * Задержка 120 мс — чтобы дать отработать другим обработчикам
     * (например, клику по кнопке удаления).
     */
    function handleVichFieldBlur(event) {
        const input = event.target.closest('.proschet-vich-input');
        if (!input) return;

        setTimeout(function () {
            saveVichField(input);
        }, 120);
    }

    /**
     * Enter в числовом поле — сохранить немедленно.
     */
    function handleVichFieldKeydown(event) {
        if (event.key !== 'Enter') return;
        const input = event.target.closest('.proschet-vich-input');
        if (!input) return;
        event.preventDefault();
        saveVichField(input);
    }

    /**
     * Сохраняет одно числовое поле из карточки (Ширина / Высота / Вылеты).
     */
    function saveVichField(input) {
        const card = input.closest('.proschet-component-card');
        if (!card) return;
        const componentId = card.dataset.componentId;
        if (!componentId) return;

        const field = input.dataset.vichField;
        if (field !== 'item_width' && field !== 'item_height' && field !== 'vyleta') return;

        const raw = (input.value || '').trim();
        const num = parseFloat(raw);
        if (isNaN(num) || num < 0) {
            // Некорректное значение — откатываем к сохранённому.
            if (card._vich && card._vich[field] !== undefined) {
                input.value = card._vich[field];
            }
            return;
        }

        // Значение могло быть уже обновлено локально обработчиком input.
        // Всё равно сохраняем на сервер — просто чтобы гарантированно
        // синхронизировать БД с тем, что видит пользователь.
        if (card._vich) card._vich[field] = num;

        // Если поменяли ширину/высоту:
        //   • синхронизируем селект «Формат» с новыми размерами;
        //   • сбрасываем ориентацию на «Авто» — при новых размерах старая
        //     ориентация может перестать быть оптимальной.
        // При изменении только «Вылетов» ориентация не трогается: зазор
        // не «поворачивает» изделие, пользовательский выбор сохраняется.
        if (field === 'item_width' || field === 'item_height') {
            try {
                syncFormatSelect(card);
            } catch (e) {
                console.warn('syncFormatSelect не удался:', e);
            }
            resetOrientationToAuto(card);
        }

        // Пересчитываем раскладку и количество листов.
        recalculateVichFitting(card);
        recalculateVichListCount(card);

        // Мгновенная перерисовка — не ждём ответа сервера.
        updateOrientationOptimalMark(card);
        drawComponentPlacement(card);

        // Отправляем на сервер (асинхронно).
        saveVichData(componentId, card);
    }

    /**
     * Синхронизирует селект «Формат» с текущими значениями ширины/высоты.
     * Если пара (ширина, высота) совпадает с одним из пресетов — выбираем
     * его, иначе сбрасываем на «— Не выбран —».
     */
    function syncFormatSelect(card) {
        const select = card.querySelector('.proschet-vich-format');
        if (!select || !card._vich) return;

        const w = Number(card._vich.item_width);
        const h = Number(card._vich.item_height);
        let matchedValue = '';

        Array.from(select.options).forEach(function (opt) {
            const ow = parseFloat(opt.dataset.width);
            const oh = parseFloat(opt.dataset.height);
            if (Number(ow) === w && Number(oh) === h) {
                matchedValue = opt.value;
            }
        });

        select.value = matchedValue;
    }

    /**
     * Сбрасывает выбранную ориентацию на «Авто» и синхронизирует UI.
     * Вызывается при изменении размеров изделия (ширина / высота) или
     * выборе формата из пресета — старая ориентация может перестать
     * быть оптимальной, поэтому даём программе выбрать заново.
     */
    function resetOrientationToAuto(card) {
        if (!card || !card._vich) return;

        // 1. Меняем значение в локальной модели.
        card._vich.fit_selected_orientation = 'auto';

        // 2. Синхронизируем UI переключателя — активной становится «Авто».
        const switchEl = card.querySelector(
            '.proschet-mode-switch[data-field="fit_selected_orientation"]'
        );
        if (switchEl) {
            switchEl.dataset.value = 'auto';
            switchEl.querySelectorAll('.proschet-mode-btn').forEach(function (b) {
                if (b.dataset.value === 'auto') {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
        }
    }

    /**
     * Клик по кнопке в переключателе ориентации (Авто / Альбомная / Портретная).
     * Обновляет активную кнопку, пересчитывает раскладку и сохраняет на сервере.
     */
    function handleOrientationSwitchClick(event) {
        const btn = event.target.closest('.proschet-mode-btn');
        if (!btn) return;

        const switchEl = btn.closest('.proschet-mode-switch');
        if (!switchEl) return;
        // Нас интересует только переключатель ориентации.
        if (switchEl.dataset.field !== 'fit_selected_orientation') return;

        const card = switchEl.closest('.proschet-component-card');
        if (!card) return;
        const componentId = card.dataset.componentId;
        if (!componentId) return;

        const newValue = btn.dataset.value;
        if (!newValue) return;

        // Уже выбрано — ничего не делаем.
        if (switchEl.dataset.value === newValue) return;

        // Визуально переключаем.
        switchEl.querySelectorAll('.proschet-mode-btn').forEach(function (b) {
            b.classList.remove('active');
        });
        btn.classList.add('active');
        switchEl.dataset.value = newValue;

        // Сохраняем значение в локальный объект.
        if (card._vich) {
            card._vich.fit_selected_orientation = newValue;
        }

        // Пересчёт раскладки и количества листов.
        recalculateVichFitting(card);
        recalculateVichListCount(card);

        // Обновляем метку «оптимальности» на кнопке «Авто» и перерисовываем
        // мини-схемы — чтобы пользователь сразу видел результат переключения,
        // не дожидаясь ответа сервера.
        updateOrientationOptimalMark(card);
        drawComponentPlacement(card);

        // Отправка на сервер.
        saveVichData(componentId, card);
    }

    /**
     * Клик по одной из кнопок переключателя «Ламинация» —
     * «Включена» или «Выключена».
     * Пока это чисто визуальное переключение: на сервер ничего не уходит.
     * Сохранение в БД и обновление цены подключим отдельной задачей.
     */
    function handleLaminationSwitchClick(event) {
        const btn = event.target.closest('.proschet-lamination-btn');
        if (!btn) return;

        const switchEl = btn.closest('.proschet-lamination-toggle');
        if (!switchEl) return;
        // Нас интересует только переключатель ламинации.
        if (switchEl.dataset.field !== 'lamination_enabled') return;

        const card = switchEl.closest('.proschet-component-card');
        if (!card) return;
        const componentId = card.dataset.componentId;
        if (!componentId) return;

        // Меняем состояние на противоположное.
        const isOn = switchEl.dataset.value === 'on';
        const newBool = !isOn;
        const newValue = newBool ? 'on' : 'off';

        // Визуально переключаем сразу — не ждём ответа сервера.
        switchEl.dataset.value = newValue;
        btn.textContent = newBool ? 'Включена' : 'Без ламинации';
        if (newBool) {
            btn.classList.add('proschet-lamination-btn--on');
        } else {
            btn.classList.remove('proschet-lamination-btn--on');
        }

        // Показ/скрытие нижней подстроки (ламинатор / плёнка / стороны).
        // Она нужна только когда ламинация включена.
        const row4El = switchEl.closest('.proschet-component-card-row4');
        const line2  = row4El
            ? row4El.querySelector('.proschet-component-card-row4-line + .proschet-component-card-row4-line')
            : null;
        if (line2) {
            line2.style.display = newBool ? 'flex' : 'none';
        }

        // Отправляем на сервер изменение поля is_enabled ламинации.
        // Используем существующий эндпоинт приложения calculator:
        //   POST /calculator/update-lamination/
        // с телом { print_component_id, field_name: 'is_enabled', field_value: bool }.
        fetch('/calculator/update-lamination/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                print_component_id: componentId,
                field_name:         'is_enabled',
                field_value:        newBool
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                // Обновляем локальный кэш — чтобы при следующей отрисовке
                // карточки кнопка получила актуальное состояние.
                if (card._lamination) {
                    card._lamination.is_enabled = newBool;
                }
                showNotification(
                    newBool ? 'Ламинация включена' : 'Ламинация выключена',
                    'success'
                );
                // Сообщаем другим окнам, что состав компонента изменился.
                if (activeProschet && activeProschet.id) {
                    notifyChange(activeProschet.id, 'print_component_changed');
                }
            } else {
                // Ошибка сервера — откатываем визуальное переключение.
                switchEl.dataset.value = isOn ? 'on' : 'off';
                btn.textContent = isOn ? 'Включена' : 'Без ламинации';
                if (isOn) btn.classList.add('proschet-lamination-btn--on');
                else      btn.classList.remove('proschet-lamination-btn--on');
                showNotification(data.error || data.message || 'Ошибка сохранения ламинации', 'error');
            }
        })
        .catch(function (err) {
            console.error('Ошибка сохранения ламинации:', err);
            // Ошибка сети — тоже откатываем.
            switchEl.dataset.value = isOn ? 'on' : 'off';
            btn.textContent = isOn ? 'Включена' : 'Без ламинации';
            if (isOn) btn.classList.add('proschet-lamination-btn--on');
            else      btn.classList.remove('proschet-lamination-btn--on');
            showNotification('Ошибка сети при сохранении ламинации', 'error');
        });
    }

    /**
     * Пересчитывает раскладку изделий на листе для карточки.
     * Обновляет в card._vich поля:
     *   fit_horizontal, fit_vertical, fit_total,
     *   fit_landscape_total, fit_portrait_total.
     *
     * Логика совпадает с vichisliniya_listov/calculateFitting.
     * Если fit_selected_orientation === 'auto', фактическая ориентация
     * выбирается автоматически — там, где изделий на листе больше.
     * Само значение 'auto' при этом сохраняется как есть.
     */
    function recalculateVichFitting(card) {
        if (!card || !card._vich) return;
        const v = card._vich;

        const sheetW = Number(v.sheet_width);
        const sheetH = Number(v.sheet_height);
        const margin = Number(v.margin);
        const itemW  = Number(v.item_width);
        const itemH  = Number(v.item_height);
        const gap    = Number(v.vyleta);

        // Недостаточно данных для расчёта — обнуляем fit_*.
        if (!sheetW || !sheetH || isNaN(margin) || !itemW || !itemH) {
            v.fit_horizontal      = 0;
            v.fit_vertical        = 0;
            v.fit_total           = 0;
            v.fit_landscape_total = 0;
            v.fit_portrait_total  = 0;
            return;
        }

        const printableW = sheetW - 2 * margin;
        const printableH = sheetH - 2 * margin;
        if (printableW <= 0 || printableH <= 0) {
            v.fit_horizontal      = 0;
            v.fit_vertical        = 0;
            v.fit_total           = 0;
            v.fit_landscape_total = 0;
            v.fit_portrait_total  = 0;
            return;
        }

        // Сколько изделий помещается по одному измерению.
        function countItems(available, size, gap) {
            if (size <= 0) return 0;
            const step = size + gap;
            if (step <= 0) return 0;
            return Math.floor((available + gap) / step);
        }

        // Альбомная — изделие не повёрнуто.
        const cntXLand = countItems(printableW, itemW, gap);
        const cntYLand = countItems(printableH, itemH, gap);
        const totalLand = cntXLand * cntYLand;

        // Портретная — изделие повёрнуто на 90°.
        const cntXPort = countItems(printableW, itemH, gap);
        const cntYPort = countItems(printableH, itemW, gap);
        const totalPort = cntXPort * cntYPort;

        v.fit_landscape_total = totalLand;
        v.fit_portrait_total  = totalPort;

        // Определяем, какую ориентацию использовать фактически.
        // Если пользователь выбрал auto — берём ту, где больше изделий.
        const selected = v.fit_selected_orientation || 'auto';
        const effective = (selected === 'auto')
            ? (totalLand >= totalPort ? 'landscape' : 'portrait')
            : selected;

        if (effective === 'landscape') {
            v.fit_horizontal = cntXLand;
            v.fit_vertical   = cntYLand;
            v.fit_total      = totalLand;
        } else {
            v.fit_horizontal = cntXPort;
            v.fit_vertical   = cntYPort;
            v.fit_total      = totalPort;
        }

        // Значение в БД сохраняем как есть — auto остаётся auto.
        v.fit_selected_orientation = selected;
    }

    /**
     * Пересчитывает количество листов для карточки:
     *   list_count = ceil(circulation / fit_total)
     * Тираж берём из активного просчёта.
     */
    function recalculateVichListCount(card) {
        if (!card || !card._vich) return;
        const v = card._vich;

        const circulation = activeProschet
            ? parseInt(activeProschet.circulation, 10)
            : 0;

        if (!circulation || !v.fit_total || v.fit_total <= 0) {
            v.list_count = 0;
            return;
        }

        v.list_count = Math.ceil(circulation / v.fit_total);
    }


    /**
     * Отправляет полный набор одностраничных параметров на сервер.
     * Использует существующий эндпоинт
     *   POST /vichisliniya_listov/save-data/
     * ВАЖНО: передаём ВСЕ поля, иначе сервер перепишет недостающие
     * дефолтами (см. views.py vichisliniya_listov_save_data).
     */
    function saveVichData(componentId, card) {
        if (!card._vich) return;

        const body = Object.assign({}, card._vich, {
            print_component_id: componentId
        });

        // Отладочный лог — чтобы видеть, что именно уходит на сервер.
        // (После проверки можно убрать.)
        console.log('📤 saveVichData — отправка:', body);

        // Оптимистично показываем «Сохраняем…» — просто через уведомление.
        fetch('/vichisliniya_listov/save-data/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify(body)
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                // Обновляем локальный объект значениями, которые пересчитал
                // сервер: list_count, fit_total, cuts_count.
                card._vich.list_count = data.list_count;
                card._vich.fit_total  = data.fit_total;
                card._vich.cuts_count = data.cuts_count;
                card._vich.fit_horizontal = data.fit_horizontal;
                card._vich.fit_vertical   = data.fit_vertical;
                card._vich.fit_landscape_total = data.fit_landscape_total;
                card._vich.fit_portrait_total  = data.fit_portrait_total;
                card._vich.list_count = data.list_count;

                showNotification('Сохранено', 'success');

                // Пересчитываем компонент: количество листов изменилось —
                // значит, цена печати и общая стоимость тоже изменились.
                if (activeProschet && activeProschet.id) {
                    loadComponents(activeProschet.id);
                    notifyChange(activeProschet.id, 'print_component_changed');
                }
            } else {
                showNotification(data.message || 'Ошибка сохранения', 'error');
            }
        })
        .catch(function (err) {
            console.error('Ошибка сохранения:', err);
            showNotification('Ошибка сети при сохранении', 'error');
        });
    }

    // ========================================================================
    // 16. МИНИ-СХЕМА РАЗМЕЩЕНИЯ НА ЛИСТЕ.
    // ========================================================================

    /**
     * Обновляет метку «оптимальности» на кнопке «Авто» в переключателе
     * ориентации.
     *
     * Логика:
     *   • optimal — ориентация (landscape/portrait), где изделий на листе больше;
     *   • effective — фактическая ориентация: при выборе «Авто» это optimal,
     *     при ручном выборе — то, что выбрал пользователь;
     *   • если effective совпадает с optimal — на кнопку «Авто» навешивается
     *     класс .proschet-mode-btn--optimal (зелёная рамка);
     *   • иначе класс снимается.
     *
     * @param {HTMLElement} card — DOM-элемент карточки печатного компонента.
     */
    function updateOrientationOptimalMark(card) {
        if (!card || !card._vich) return;

        const switchEl = card.querySelector(
            '.proschet-mode-switch[data-field="fit_selected_orientation"]'
        );
        if (!switchEl) return;

        const autoBtn = switchEl.querySelector('.proschet-mode-btn[data-value="auto"]');
        if (!autoBtn) return;

        const v = card._vich;
        const totalLand = Number(v.fit_landscape_total) || 0;
        const totalPort = Number(v.fit_portrait_total) || 0;

        // Оптимальная ориентация — та, где изделий на листе больше.
        const optimal = (totalLand >= totalPort) ? 'landscape' : 'portrait';

        // Фактическая ориентация: при выборе «Авто» берём optimal,
        // иначе — выбранную пользователем.
        const selected = v.fit_selected_orientation || 'auto';
        const effective = (selected === 'auto') ? optimal : selected;

        // Если фактическая ориентация совпадает с оптимальной — метим «Авто».
        if (effective === optimal) {
            autoBtn.classList.add('proschet-mode-btn--optimal');
        } else {
            autoBtn.classList.remove('proschet-mode-btn--optimal');
        }
    }

    /**
     * Рисует мини-схемы размещения на листе для одной карточки компонента:
     *   • лицевая сторона  — всегда с заливкой;
     *   • обратная сторона — с заливкой только при двусторонней печати.
     *
     * Цвет заливки зависит от типа печати:
     *   • color — синие прямоугольники;
     *   • bw    — серые прямоугольники.
     *
     * @param {HTMLElement} card — DOM-элемент карточки печатного компонента.
     */
    function drawComponentPlacement(card) {
        if (!card) return;

        const cvFront = card.querySelector('.proschet-component-viz-canvas--front');
        const cvBack  = card.querySelector('.proschet-component-viz-canvas--back');
        if (!cvFront || !cvBack) return;

        const vich = card._vich || {};

        const sheetW = Number(vich.sheet_width);
        const sheetH = Number(vich.sheet_height);
        const margin = Number(vich.margin);
        const itemW  = Number(vich.item_width);
        const itemH  = Number(vich.item_height);
        const gap    = Number(vich.vyleta);
        const orient = vich.fit_selected_orientation;
        const fitH   = Number(vich.fit_horizontal);
        const fitV   = Number(vich.fit_vertical);

        // Режим и тип печати берём из DOM карточки — там актуальное состояние.
        const modeSwitch = card.querySelector('.proschet-mode-switch[data-field="printing_mode"]');
        const typeSwitch = card.querySelector('.proschet-mode-switch[data-field="print_type"]');
        const isDuplex = !!(modeSwitch && modeSwitch.dataset.value === 'duplex');
        const isColor  = !typeSwitch || typeSwitch.dataset.value === 'color';

        // Лицевая — всегда с заливкой. Обратная — только если двусторонняя.
        drawOneSide(cvFront, sheetW, sheetH, margin, itemW, itemH, gap,
                    orient, fitH, fitV, true, isColor);
        drawOneSide(cvBack,  sheetW, sheetH, margin, itemW, itemH, gap,
                    orient, fitH, fitV, isDuplex, isColor);
    }

    /**
     * Рисует одну сторону листа на маленьком canvas.
     * Логика отрисовки совпадает с секцией «Вычисления листов»,
     * но выполняется в компактном размере.
     */
    function drawOneSide(canvas, sheetW, sheetH, margin, itemW, itemH, gap,
                         orientation, fitH, fitV, fill, isColor) {
        const ctx = canvas.getContext('2d');

        // Размер canvas подгоняем под пропорции листа: большая сторона
        // листа займёт MAX пикселей (минус 2 отступа), меньшая — столько,
        // сколько нужно по пропорциям. Тогда отступы со всех сторон
        // будут ровно PADDING, и пустого места справа не останется.
        const MAX = 240;
        const PADDING = 4;

        // Нет данных о листе — сбрасываем canvas в исходные размеры
        // и показываем сообщение.
        if (!sheetW || !sheetH || isNaN(margin)) {
            canvas.width  = MAX;
            canvas.height = Math.round(MAX * 0.75);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.font = '10px Arial';
            ctx.fillStyle = '#999999';
            ctx.fillText('Нет данных о листе', PADDING, 15);
            return;
        }

        // Считаем масштаб по большей стороне листа.
        const maxSheetDim = Math.max(sheetW, sheetH);
        const scale = (MAX - 2 * PADDING) / maxSheetDim;

        // Подгоняем размер canvas — с обеих сторон остаётся ровно PADDING.
        canvas.width  = Math.round(sheetW * scale + 2 * PADDING);
        canvas.height = Math.round(sheetH * scale + 2 * PADDING);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Нет выбранной ориентации или нечего рисовать.
        if (!orientation || orientation === 'auto' || !fitH || !fitV) {
            ctx.font = '10px Arial';
            ctx.fillStyle = '#999999';
            ctx.fillText('Нет размещения', PADDING, 15);
            return;
        }

        // При портретной ориентации изделие «повёрнуто» на листе —
        // меняем ширину и высоту местами при отрисовке.
        let drawItemW = itemW;
        let drawItemH = itemH;
        if (orientation === 'portrait') {
            drawItemW = itemH;
            drawItemH = itemW;
        }

        // Масштаб и padding уже посчитаны выше (по размерам canvas).
        // translate ставит точку отсчёта в левый верхний отступ.
        ctx.save();
        ctx.translate(PADDING, PADDING);

        // Контур листа.
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(0, 0, sheetW * scale, sheetH * scale);

        // Печатная область — пунктиром.
        ctx.strokeStyle = '#999999';
        ctx.setLineDash([2, 1]);
        ctx.strokeRect(
            margin * scale,
            margin * scale,
            (sheetW - 2 * margin) * scale,
            (sheetH - 2 * margin) * scale
        );
        ctx.setLineDash([]);

        // Цвета заливки и контура по типу печати.
        let fillColor, strokeColor;
        if (isColor) {
            fillColor   = fill ? 'rgba(52, 152, 219, 0.3)' : 'transparent';
            strokeColor = fill ? '#2980b9'                  : '#a0c4ff';
        } else {
            fillColor   = fill ? 'rgba(200, 200, 200, 0.4)' : 'transparent';
            strokeColor = fill ? '#999999'                  : '#cccccc';
        }
        ctx.fillStyle   = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth   = 0.5;

        // Сами изделия — сеткой.
        for (let row = 0; row < fitV; row++) {
            for (let col = 0; col < fitH; col++) {
                const x = margin + col * (drawItemW + gap);
                const y = margin + row * (drawItemH + gap);
                if (fill) {
                    ctx.fillRect(x * scale, y * scale, drawItemW * scale, drawItemH * scale);
                }
                ctx.strokeRect(x * scale, y * scale, drawItemW * scale, drawItemH * scale);
            }
        }

        ctx.restore();
    }
})();