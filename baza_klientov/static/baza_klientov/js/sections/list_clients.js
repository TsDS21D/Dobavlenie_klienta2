/*
baza_klientov/static/baza_klientov/js/sections/list_clients.js
JavaScript секции «Список клиентов» страницы /baza_klientov/.
*/

"use strict";

(function () {

    // ========================================================================
    // 1. DOM-ЭЛЕМЕНТЫ.
    // ========================================================================

    let inputAll       = null; // Поле "Общий поиск"
    let inputLe        = null; // Поле "Поиск по юрлицам"
    let inputContact   = null; // Поле "Поиск по сотрудникам"
    let tableBody      = null; // Тело таблицы клиентов
    let noResultsBlock = null; // Сообщение "Ничего не найдено"
    let createBtn      = null; // Кнопка "Создать" в шапке

    // ========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ.
    // ========================================================================

    document.addEventListener('DOMContentLoaded', function () {
        console.log('✅ Модуль «Список клиентов» загружен');

        // Находим основные DOM-элементы страницы.
        inputAll       = document.getElementById('list-clients-search-input');
        inputLe        = document.getElementById('list-clients-search-le');
        inputContact   = document.getElementById('list-clients-search-contact');
        tableBody      = document.getElementById('list-clients-table-body');
        noResultsBlock = document.getElementById('list-clients-no-results');
        createBtn      = document.getElementById('list-clients-create-btn');

        // Навешиваем обработчики на поля поиска.
        if (inputAll)     inputAll.addEventListener('input', handleSearch);
        if (inputLe)      inputLe.addEventListener('input', handleSearch);
        if (inputContact) inputContact.addEventListener('input', handleSearch);

        // Делегируем клик по строкам таблицы на document (на случай, если tbody перерисуется).
        document.addEventListener('click', handleRowClick);

        // Восстанавливаем выделение строки, если в URL есть ?client_id=N.
        // Оборачиваем в setTimeout, чтобы другие модули (client_detail.js и т.д.)
        // успели подписаться на событие clientSelected в своих DOMContentLoaded.
        setTimeout(restoreSelectionFromUrl, 0);

        // Инициализируем модалку добавления юрлица (она осталась).
        initLeModal();

        // Инициализируем инлайн-форму создания клиента.
        initCreateClientForm();
        // Экспортируем функцию обновления таблицы в глобальную область,
        // чтобы другие модули (contacts.js, legal_entities.js) могли её вызывать.
        window.BazaListClients = {
            refreshTable: refreshTable
        };

        console.log('✅ Инициализация модуля завершена');
    });

    // ========================================================================
    // 3. ПОИСК (КЛИЕНТСКИЙ).
    // ========================================================================

    function handleSearch() {
        if (!tableBody) return;

        // Считываем значения из трех полей поиска и приводим к нижнему регистру.
        const qAll     = inputAll     ? (inputAll.value || '').trim().toLowerCase() : '';
        const qLe      = inputLe      ? (inputLe.value || '').trim().toLowerCase() : '';
        const qContact = inputContact ? (inputContact.value || '').trim().toLowerCase() : '';

        // Получаем все строки таблицы.
        const rows = tableBody.querySelectorAll('.list-clients-row');
        let visibleCount = 0; // Счетчик видимых строк

        rows.forEach(function (row) {
            // Текст всей строки + скрытый адрес доставки (для общего поиска).
            const fullText = (row.textContent + " " + (row.dataset.clientAddress || "")).toLowerCase();
            
            // Ищем ячейки для точечного поиска.
            const leCell = row.querySelector('.col-legal-entities');
            const contactCell = row.querySelector('.col-employees');

            const leText = leCell ? leCell.textContent.toLowerCase() : '';
            const contactText = contactCell ? contactCell.textContent.toLowerCase() : '';

            // Проверяем, подходит ли строка под каждый из непустых фильтров.
            const passAll     = !qAll || fullText.indexOf(qAll) !== -1;
            const passLe      = !qLe || leText.indexOf(qLe) !== -1;
            const passContact = !qContact || contactText.indexOf(qContact) !== -1;

            // Если строка подходит под ВСЕ фильтры — показываем её.
            if (passAll && passLe && passContact) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        // Показываем сообщение "Ничего не найдено", если есть запрос, но нет результатов.
        const anyQuery = qAll || qLe || qContact;
        if (noResultsBlock) {
            noResultsBlock.style.display = (anyQuery && visibleCount === 0) ? 'block' : 'none';
        }
    }

    // ========================================================================
    // 4. КЛИК ПО СТРОКЕ — ВЫБОР КЛИЕНТА.
    // ========================================================================

    function handleRowClick(event) {
        // Если клик был по элементам управления юрлицом, не выделяем строку.
        if (event.target.closest('.legal-entity-control')) return;

        // Ищем ближайшую строку таблицы.
        const row = event.target.closest('.list-clients-row');
        if (!row) return;
        if (!tableBody || !tableBody.contains(row)) return;

        // Снимаем класс 'selected' со всех строк.
        tableBody.querySelectorAll('.list-clients-row').forEach(function (r) {
            r.classList.remove('selected');
        });
        // Добавляем класс 'selected' кликнутой строке.
        row.classList.add('selected');

        // Отправляем событие выбора клиента.
        emitClientSelected(row, null);
    }

    /**
     * Генерирует пользовательское событие clientSelected с данными из data-атрибутов строки.
     * Это событие слушают другие модули (client_detail.js, contacts.js, legal_entities.js).
     */
    function emitClientSelected(row, legalEntity) {
        const d = row.dataset; // Все data-атрибуты строки
        document.dispatchEvent(new CustomEvent('clientSelected', {
            detail: {
                clientId:       d.clientId || '',
                clientNumber:   d.clientNumber || '',
                clientName:     d.clientName || '',
                clientDiscount: d.clientDiscount || '0',
                clientComment:  d.clientComment || '',
                clientAddress:  d.clientAddress || '',
                legalEntity:    legalEntity // Передаем объект юрлица (если есть)
            }
        }));
    }

    // ========================================================================
    // 5. МОДАЛКА ДОБАВЛЕНИЯ ЮРЛИЦА (ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ).
    // ========================================================================

    let currentLeClientId = null;
    let leModalOverlay = null;
    let leModalClose = null;
    let leModalCancel = null;
    let leModalSubmit = null;
    let leForm = null;
    let leNameInput = null;
    let leRequisitesInput = null;
    let leHasEdoInput = null;
    let leClientIdInput = null;

    function initLeModal() {
        // Находим элементы модалки.
        leModalOverlay = document.getElementById('baza-le-modal-overlay');
        leModalClose = document.getElementById('baza-le-modal-close');
        leModalCancel = document.getElementById('baza-le-modal-cancel');
        leModalSubmit = document.getElementById('baza-le-modal-submit');
        leForm = document.getElementById('baza-le-form');
        leNameInput = document.getElementById('baza-le-name');
        leRequisitesInput = document.getElementById('baza-le-requisites');
        leHasEdoInput = document.getElementById('baza-le-has-edo');
        leClientIdInput = document.getElementById('baza-le-client-id');

        if (!leModalOverlay) return;

        // Обработчики кнопок.
        if (leModalClose) leModalClose.addEventListener('click', closeLeModal);
        if (leModalCancel) leModalCancel.addEventListener('click', closeLeModal);
        if (leModalSubmit) leModalSubmit.addEventListener('click', submitLeForm);

        // Закрытие по клику на фон.
        leModalOverlay.addEventListener('click', function (e) {
            if (e.target === leModalOverlay) closeLeModal();
        });

        // Закрытие по клавише Escape.
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && leModalOverlay.style.display === 'flex') {
                closeLeModal();
            }
        });
    }

    function closeLeModal() {
        if (!leModalOverlay) return;
        leModalOverlay.style.display = 'none';
        currentLeClientId = null;
    }

    function submitLeForm() {
        if (!currentLeClientId) return;

        const name = leNameInput.value.trim();
        if (name.length < 1) {
            showNotification('Введите название юрлица', 'error');
            leNameInput.focus();
            return;
        }

        const originalText = leModalSubmit.textContent;
        leModalSubmit.disabled = true;
        leModalSubmit.textContent = 'Сохранение...';

        const fd = new FormData();
        fd.append('client_id', currentLeClientId);
        fd.append('name', name);
        fd.append('requisites', leRequisitesInput.value.trim());
        if (leHasEdoInput.checked) {
            fd.append('has_edo', 'on');
        }

        fetch('/baza_klientov/api/create_legal_entity/', {
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
                showNotification('Юрлицо добавлено', 'success');
                closeLeModal();
                // Задерживаем перезагрузку на 1 секунду, чтобы увидеть уведомление
                setTimeout(function() {
                    window.location.reload();
                }, 1000);
            } else {
                showNotification(data.error || 'Ошибка при сохранении', 'error');
            }
        })

        .catch(function (err) {
            console.error(err);
            showNotification('Ошибка сети при сохранении', 'error');
        })
        .finally(function () {
            leModalSubmit.disabled = false;
            leModalSubmit.textContent = originalText;
        });
    }

    // ========================================================================
    // 6. ИНЛАЙН-ФОРМА СОЗДАНИЯ КЛИЕНТА (НОВОЕ).
    // ========================================================================

    let createFormWrapper = null; // Контейнер формы
    let createFormEl = null;      // Сам тег <form>
    let createCancelBtn = null;   // Кнопка "Отмена"
    let createSubmitBtn = null;   // Кнопка "Создать клиента"

    function initCreateClientForm() {
        // Находим элементы формы.
        createFormWrapper = document.getElementById('list-clients-create-form');
        createFormEl = document.getElementById('list-clients-create-form-el');
        createCancelBtn = document.getElementById('list-clients-create-cancel');
        createSubmitBtn = document.getElementById('list-clients-create-submit');

        if (!createFormWrapper) return;

        // 1. Клик по кнопке "Создать" в шапке — открываем форму.
        if (createBtn) {
            createBtn.addEventListener('click', openCreateForm);
        }

        // 2. Клик по кнопке "Отмена" — закрываем форму.
        if (createCancelBtn) {
            createCancelBtn.addEventListener('click', closeCreateForm);
        }

        // 3. Отправка формы (submit).
        if (createFormEl) {
            createFormEl.addEventListener('submit', handleCreateSubmit);
        }
    }

    function openCreateForm() {
        if (!createFormWrapper) return;
        // Очищаем форму от предыдущих вводов (если открывали ранее).
        if (createFormEl) createFormEl.reset();
        
        // Ставим скидку по умолчанию в 0.
        const discountInput = document.getElementById('create-client-discount');
        if (discountInput) discountInput.value = '0';

        // Показываем форму.
        createFormWrapper.style.display = 'block';
        
        // Фокусируемся на первом поле для удобства.
        const nameInput = document.getElementById('create-client-name');
        if (nameInput) nameInput.focus();
    }

    function closeCreateForm() {
        if (!createFormWrapper) return;
        // Скрываем форму.
        createFormWrapper.style.display = 'none';
        // Очищаем поля.
        if (createFormEl) createFormEl.reset();
    }

    function handleCreateSubmit(event) {
        // Предотвращаем стандартное поведение браузера (перезагрузку страницы).
        event.preventDefault();

        // Считываем данные из полей формы.
        const nameInput = document.getElementById('create-client-name');
        const name = nameInput ? nameInput.value.trim() : '';

        // Валидация: проверяем, что название не пустое.
        if (!name) {
            showNotification('Введите название клиента', 'error');
            if (nameInput) nameInput.focus();
            return;
        }

        // Меняем текст кнопки, чтобы показать процесс сохранения.
        const originalText = createSubmitBtn.textContent;
        createSubmitBtn.disabled = true;
        createSubmitBtn.textContent = 'Создание...';

        // Собираем данные для отправки.
        const fd = new FormData();
        fd.append('name', name);
        fd.append('discount', document.getElementById('create-client-discount').value || '0');
        fd.append('address', document.getElementById('create-client-address').value.trim());
        fd.append('comment', document.getElementById('create-client-comment').value.trim());
        fd.append('csrfmiddlewaretoken', getCsrfToken());

        // Отправляем AJAX-запрос на сервер.
        fetch('/baza_klientov/api/create_client/', {
            method: 'POST',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                // Показываем уведомление об успехе
                showNotification('Клиент успешно создан', 'success');
                // Закрываем форму
                closeCreateForm();
                
                // Перезагружаем страницу, передавая ID нового клиента в URL,
                // чтобы он автоматически подсветился и открылся в карточке.
                setTimeout(function() {
                    if (data.client && data.client.id) {
                        window.location.href = '/baza_klientov/?client_id=' + data.client.id;
                    } else {
                        window.location.reload(); // Страховка, если id вдруг не пришел
                    }
                }, 1000);
            } else {
                // Если ошибка валидации — показываем первое сообщение об ошибке.
                let errMsg = 'Ошибка при создании';
                if (data.errors) {
                    const firstKey = Object.keys(data.errors)[0];
                    errMsg = data.errors[firstKey][0];
                }
                showNotification(errMsg, 'error');
            }
        })
        .catch(function (err) {
            console.error('Ошибка fetch:', err);
            showNotification('Ошибка сети. Проверьте консоль (F12).', 'error');
        })
        .finally(function () {
            // Возвращаем кнопке исходный вид в любом случае.
            createSubmitBtn.disabled = false;
            createSubmitBtn.textContent = originalText;
        });
    }

    // ========================================================================
    // 7. ВОССТАНОВЛЕНИЕ ВЫДЕЛЕНИЯ ПО URL.
    // ========================================================================

    function restoreSelectionFromUrl() {
        if (!tableBody) return;

        const params = new URLSearchParams(window.location.search);
        const urlClientId = params.get('client_id');
        if (!urlClientId) return;

        const row = tableBody.querySelector(
            '.list-clients-row[data-client-id="' + urlClientId + '"]'
        );
        if (!row) return;

        row.classList.add('selected');
        emitClientSelected(row, null);
    }

    // ========================================================================
    // 7.1 ОБНОВЛЕНИЕ ТАБЛИЦЫ.
    // ========================================================================

    function refreshTable() {
        if (!tableBody) return;

        // Запоминаем ID выбранного клиента, чтобы после перерисовки снова его выделить.
        let selectedId = null;
        const selectedRow = tableBody.querySelector('.list-clients-row.selected');
        if (selectedRow) selectedId = selectedRow.dataset.clientId;

        fetch('/baza_klientov/api/client_rows/', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function(r) { return r.text(); })
        .then(function(html) {
            // Подменяем содержимое таблицы.
            tableBody.innerHTML = html;

            // Восстанавливаем выделение.
            if (selectedId) {
                const newRow = tableBody.querySelector('.list-clients-row[data-client-id="' + selectedId + '"]');
                if (newRow) newRow.classList.add('selected');
            }

            // Переприменяем поиск (если он был введен).
            handleSearch();
        })
        .catch(function(err) {
            console.error('Ошибка обновления таблицы:', err);
        });
    }

    // ========================================================================
    // 8. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ.
    // ========================================================================

    function getCsrfToken() {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const c = cookies[i].trim();
            if (c.indexOf('csrftoken=') === 0) {
                return decodeURIComponent(c.substring('csrftoken='.length));
            }
        }
        return '';
    }

    function showNotification(msg, type) {
        if (window.BazaNotify && typeof window.BazaNotify.notify === 'function') {
            window.BazaNotify.notify(msg, type);
        } else {
            console.log('[notify]', type || 'info', msg);
            alert(msg); // Временная заглушка, пока не сделали красивые тосты
        }
    }

})();