/* ============================================================================
   web_orders/static/web_orders/js/upload.js
   Загрузка файла макета к позиции заявки — прямо из карточки.
   ============================================================================
   Отдельный самодостаточный скрипт: общается с сервером сам и после успеха
   перезагружает страницу, чтобы список файлов перерисовал Django-шаблон.

   ПОЧЕМУ XHR, А НЕ fetch:
   только XHR умеет отдавать событие progress по выгрузке файла.
   Без него при макете на 300 МБ менеджер не поймёт, идёт загрузка
   или зависла.
   ========================================================================== */
(function () {
    'use strict';

    // Собирает DOM-узел комментария к файлу.
    function buildCommentNode(data) {
        var note = document.createElement('div');
        note.className = 'web-orders-file-note';

        var author = document.createElement('span');
        author.className = 'web-orders-file-note-author';
        author.textContent = data.author_kind_display || 'Менеджер';
        note.appendChild(author);

        var date = document.createElement('span');
        date.className = 'web-orders-file-note-date';
        date.textContent = data.created_at || '';
        note.appendChild(date);

        if (data.is_client_visible === false) {
            var internal = document.createElement('span');
            internal.className = 'web-orders-file-internal';
            internal.textContent = 'внутренний';
            note.appendChild(internal);
        }

        var text = document.createElement('div');
        text.className = 'web-orders-file-note-text';
        text.textContent = data.text || '';
        note.appendChild(text);

        return note;
    }

    // Собирает DOM-узел строки файла — такой же, как в шаблоне.
    // Через текстовые узлы, а не innerHTML: комментарий и имя файла
    // вводит пользователь, вставлять их как HTML нельзя.
    function buildFileNode(data) {
        var wrap = document.createElement('div');
        wrap.className = 'web-orders-file';

        var head = document.createElement('div');
        head.className = 'web-orders-file-head';

        var kind = document.createElement('span');
        kind.className = 'web-orders-file-kind';
        kind.textContent = data.kind_display || 'Макет';
        head.appendChild(kind);

        if (data.url) {
            var link = document.createElement('a');
            link.className = 'web-orders-file-name';
            // Скачивание идёт через Django-эндпоинт: он отдаёт файл
            // с исходным именем и только авторизованным сотрудникам.
            link.href = '/web-orders/files/' + data.id + '/download/';
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = data.display_name || 'файл';
            head.appendChild(link);

            var size = document.createElement('span');
            size.className = 'web-orders-file-size';
            size.textContent = formatBytes(data.display_size || 0);
            head.appendChild(size);
        } else if (data.link_url) {
            var extLink = document.createElement('a');
            extLink.className = 'web-orders-file-name';
            extLink.href = data.link_url;
            extLink.target = '_blank';
            extLink.rel = 'noopener';
            extLink.textContent = 'ссылка на макет';
            head.appendChild(extLink);
        }

        var author = document.createElement('span');
        author.className = 'web-orders-file-author';
        author.textContent = data.author_kind_display || '';
        head.appendChild(author);

        if (data.is_client_visible === false) {
            var internal = document.createElement('span');
            internal.className = 'web-orders-file-internal';
            internal.title = 'Клиент этот файл не видит';
            internal.textContent = 'внутренний';
            head.appendChild(internal);
        }

        var date = document.createElement('span');
        date.className = 'web-orders-file-date';
        date.textContent = data.created_at || '';
        head.appendChild(date);

        wrap.appendChild(head);

        if (data.comment) {
            var comment = document.createElement('div');
            comment.className = 'web-orders-file-comment';
            comment.textContent = data.comment;
            wrap.appendChild(comment);
        }

        // ====================================================================
        // ФОРМА КОММЕНТАРИЯ ДЛЯ НОВОГО ФАЙЛА
        // ====================================================================
        // В шаблоне эта форма есть у каждого файла, отрисованного сервером.
        // Файл, добавленный через JS, сервером не перерисовывается — значит
        // форму нужно создать здесь, иначе у нового файла нельзя оставить
        // комментарий без перезагрузки страницы.
        // Структура и классы повторяют шаблон, чтобы работал один и тот же
        // обработчик клика (.web-orders-comment-btn).
        // ====================================================================
        var reply = document.createElement('div');
        reply.className = 'web-orders-file-reply';

        var replyInput = document.createElement('input');
        replyInput.type = 'text';
        replyInput.className = 'web-orders-comment-input';
        replyInput.placeholder = 'Комментарий к файлу…';
        replyInput.maxLength = 5000;
        reply.appendChild(replyInput);

        var replyLabel = document.createElement('label');
        replyLabel.className = 'web-orders-upload-visible-label';
        replyLabel.title = 'Клиент увидит комментарий в личном кабинете';

        var replyCheckbox = document.createElement('input');
        replyCheckbox.type = 'checkbox';
        replyCheckbox.className = 'web-orders-comment-visible';
        replyCheckbox.checked = true;
        replyLabel.appendChild(replyCheckbox);
        replyLabel.appendChild(document.createTextNode(' клиенту'));

        reply.appendChild(replyLabel);

        var replyButton = document.createElement('button');
        replyButton.type = 'button';
        replyButton.className = 'web-orders-comment-btn';
        replyButton.setAttribute('data-file-id', data.id);
        replyButton.textContent = 'Ответить';
        reply.appendChild(replyButton);

        var replyStatus = document.createElement('span');
        replyStatus.className = 'web-orders-comment-status';
        reply.appendChild(replyStatus);

        wrap.appendChild(reply);

        // Кнопка удаления — у файлов, только что добавленных через JS,
        // её тоже нужно создать: шаблон для них не перерисовывается.
        var deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'web-orders-file-delete-btn';
        deleteButton.setAttribute('data-file-id', data.id);
        deleteButton.title = 'Удалить файл';
        deleteButton.textContent = '×';
        head.appendChild(deleteButton);

        return wrap;
    }

    
    function getCsrfToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 Б';
        var units = ['Б', 'КБ', 'МБ', 'ГБ'];
        var i = 0;
        var value = bytes;
        while (value >= 1024 && i < units.length - 1) {
            value = value / 1024;
            i++;
        }
        return value.toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    document.addEventListener('click', function (event) {
        var button = event.target.closest('.web-orders-upload-btn');
        if (!button) return;

        var wrap = button.closest('.web-orders-item-upload');
        if (!wrap) return;

        var itemId = wrap.getAttribute('data-item-id');
        var fileInput = wrap.querySelector('.web-orders-upload-file');
        var linkInput = wrap.querySelector('.web-orders-upload-link');
        var commentInput = wrap.querySelector('.web-orders-upload-comment');
        var kindSelect = wrap.querySelector('.web-orders-upload-kind');
        var visibleCheckbox = wrap.querySelector('.web-orders-upload-visible');

        var progressWrap = wrap.querySelector('.web-orders-upload-progress');
        var progressBar = wrap.querySelector('.web-orders-upload-bar');
        var status = wrap.querySelector('.web-orders-upload-status');

        var file = fileInput && fileInput.files ? fileInput.files[0] : null;
        var link = linkInput ? linkInput.value.trim() : '';

        status.className = 'web-orders-upload-status';
        status.textContent = '';

        if (!file && !link) {
            status.className = 'web-orders-upload-status is-error';
            status.textContent = 'Выберите файл или укажите ссылку';
            return;
        }

        // ====================================================================
        // ПРОВЕРКА ФАЙЛА ДО ОТПРАВКИ
        // ====================================================================
        // Сервер всё равно отклонит неподходящий файл, но при размере
        // в сотни мегабайт это значит: сначала полностью загрузить его,
        // потом получить ошибку. Проверяем в браузере — экономим трафик
        // и время менеджера.
        //
        // Списки должны совпадать с настройками ИС:
        //   WEB_ORDER_ALLOWED_FILE_EXTENSIONS
        //   WEB_ORDER_MAX_FILE_SIZE
        // ====================================================================

        var ALLOWED_EXTENSIONS = [
            '.pdf', '.ai', '.eps', '.cdr', '.indd', '.psd',
            '.zip', '.rar', '.7z',
            '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.svg'
        ];

        var MAX_FILE_SIZE = 512 * 1024 * 1024; // 512 МБ

        if (file) {
            var lowerName = file.name.toLowerCase();
            var lastDot = lowerName.lastIndexOf('.');
            var extension = lastDot >= 0 ? lowerName.slice(lastDot) : '';

            if (ALLOWED_EXTENSIONS.indexOf(extension) === -1) {
                status.className = 'web-orders-upload-status is-error';
                status.textContent = extension
                    ? ('Недопустимый тип файла: ' + extension)
                    : 'У файла нет расширения — выберите макет в другом формате';
                return;
            }

            if (file.size > MAX_FILE_SIZE) {
                status.className = 'web-orders-upload-status is-error';
                status.textContent = 'Файл больше 512 МБ (сейчас ' + formatBytes(file.size) + ')';
                return;
            }
        }

        var formData = new FormData();
        if (file) formData.append('file', file);
        if (link) formData.append('link_url', link);
        if (commentInput) formData.append('comment', commentInput.value.trim());
        if (kindSelect) formData.append('kind', kindSelect.value);
        if (visibleCheckbox && visibleCheckbox.checked) formData.append('is_client_visible', '1');

        var xhr = new XMLHttpRequest();
        var url = '/web-orders/api/item/' + itemId + '/files/upload/';

        xhr.open('POST', url, true);
        xhr.setRequestHeader('X-CSRFToken', getCsrfToken());
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        button.disabled = true;
        progressWrap.hidden = false;
        progressBar.style.width = '0%';
        status.textContent = 'Загрузка…';

        xhr.upload.onprogress = function (e) {
            if (!e.lengthComputable) return;
            var percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = percent + '%';
            status.textContent = 'Загружено ' + formatBytes(e.loaded) + ' из ' + formatBytes(e.total) + ' (' + percent + '%)';
        };

        xhr.onload = function () {
            button.disabled = false;

            var data = null;
            try {
                data = JSON.parse(xhr.responseText);
            } catch (err) {
                data = null;
            }

            if (xhr.status >= 200 && xhr.status < 300 && data && data.success) {
                progressBar.style.width = '100%';
                status.className = 'web-orders-upload-status is-ok';
                status.textContent = 'Файл загружен';
                window.webOrdersToast('Файл загружен', 'success');

                // Контейнер файлов у позиции существует всегда (см. шаблон),
                // поэтому вставляем строку прямо в него — без перезагрузки.
                // ВАЖНО: контейнер файлов — СОСЕД формы загрузки, а не её
                // потомок. Структура такая:
                //   .web-orders-item
                //       .web-orders-item-files   ← список файлов
                //       .web-orders-item-upload  ← эта форма
                // Поэтому идём вверх до строки позиции и уже в ней ищем список.
                var itemRow = wrap.closest('.web-orders-item');
                var filesWrap = itemRow ? itemRow.querySelector('.web-orders-item-files') : null;

                if (filesWrap) {
                    filesWrap.appendChild(buildFileNode(data));
                } else {
                    // Диагностика: если разметка изменится, это будет видно
                    // в консоли, а не проявится «молчаливым» отсутствием файла.
                    console.warn('web-orders: не найден контейнер .web-orders-item-files');
                }

                // Очищаем поля формы, чтобы случайно не отправить то же дважды.
                if (fileInput) fileInput.value = '';
                if (linkInput) linkInput.value = '';
                if (commentInput) commentInput.value = '';

                // Прячем прогресс через секунду — результат уже в списке.
                window.setTimeout(function () {
                    progressWrap.hidden = true;
                    progressBar.style.width = '0%';
                }, 1200);

                return;
            }

            var message = (data && data.error) ? data.error : ('Ошибка ' + xhr.status);

            if (xhr.status === 413) {
                message = 'Файл слишком большой для сервера (nginx). Нужно увеличить client_max_body_size.';
            }

            status.className = 'web-orders-upload-status is-error';
            status.textContent = message;
            window.webOrdersToast(message, 'error');
        };

        xhr.onerror = function () {
            button.disabled = false;
            status.className = 'web-orders-upload-status is-error';
            status.textContent = 'Ошибка сети при загрузке файла';
            window.webOrdersToast('Ошибка сети при загрузке файла', 'error');
        };

        xhr.send(formData);
    });

    // ========================================================================
    // КОММЕНТАРИЙ К ФАЙЛУ
    // ========================================================================
    document.addEventListener('click', function (event) {
        var button = event.target.closest('.web-orders-comment-btn');
        if (!button) return;

        var fileCard = button.closest('.web-orders-file');
        if (!fileCard) return;

        var fileId = button.getAttribute('data-file-id');
        var input = fileCard.querySelector('.web-orders-comment-input');
        var visibleCheckbox = fileCard.querySelector('.web-orders-comment-visible');
        var status = fileCard.querySelector('.web-orders-comment-status');

        var text = input ? input.value.trim() : '';

        status.className = 'web-orders-comment-status';
        status.textContent = '';

        if (!text) {
            status.className = 'web-orders-comment-status is-error';
            status.textContent = 'Введите текст';
            return;
        }

        var formData = new FormData();
        formData.append('text', text);
        if (visibleCheckbox && visibleCheckbox.checked) {
            formData.append('is_client_visible', '1');
        }

        button.disabled = true;
        status.textContent = 'Отправка…';

        fetch('/web-orders/api/file/' + fileId + '/comments/add/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                button.disabled = false;

                if (!data || !data.success) {
                    status.className = 'web-orders-comment-status is-error';
                    status.textContent = (data && data.error) ? data.error : 'Не удалось отправить';
                    window.webOrdersToast(status.textContent, 'error');
                    return;
                }

                // Вставляем комментарий перед формой ответа — так он
                // оказывается в хронологическом порядке (сверху старые).
                var replyForm = fileCard.querySelector('.web-orders-file-reply');
                if (replyForm) {
                    fileCard.insertBefore(buildCommentNode(data), replyForm);
                } else {
                    fileCard.appendChild(buildCommentNode(data));
                }

                if (input) input.value = '';
                status.className = 'web-orders-comment-status is-ok';
                status.textContent = 'Добавлено';
                window.webOrdersToast('Комментарий добавлен', 'success');

                window.setTimeout(function () { status.textContent = ''; }, 1500);
            })
            .catch(function () {
                button.disabled = false;
                status.className = 'web-orders-comment-status is-error';
                status.textContent = 'Ошибка сети';
                window.webOrdersToast('Ошибка сети', 'error');
            });
    });

    // ========================================================================
    // УДАЛЕНИЕ ФАЙЛА — со своей модалкой подтверждения
    // ========================================================================
    // window.confirm нельзя стилизовать, и он выбивается из оформления ИС.
    // Показываем свою модалку (разметка в шаблоне, id="web-orders-file-confirm").
    // Кнопку, по которой кликнули, запоминаем: после «Удалить» нужно знать,
    // какую именно строку убирать из списка.

    var pendingDeleteButton = null;

    function openDeleteConfirm(button) {
        var overlay = document.getElementById('web-orders-file-confirm');

        // Если модалки нет (шаблон не обновлён) — не ломаем удаление,
        // спрашиваем по-старому.
        if (!overlay) {
            if (window.confirm('Удалить файл? Действие необратимо.')) {
                performFileDelete(button);
            }
            return;
        }

        pendingDeleteButton = button;
        overlay.style.display = 'flex';
    }

    function closeDeleteConfirm() {
        var overlay = document.getElementById('web-orders-file-confirm');
        if (overlay) overlay.style.display = 'none';
        pendingDeleteButton = null;
    }

    function performFileDelete(button) {
        var fileId = button.getAttribute('data-file-id');
        var fileCard = button.closest('.web-orders-file');

        button.disabled = true;

        fetch('/web-orders/files/' + fileId + '/delete/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                if (!data || !data.success) {
                    button.disabled = false;
                    window.webOrdersToast(
                        (data && data.error) ? data.error : 'Не удалось удалить файл',
                        'error'
                    );
                    return;
                }

                // Убираем строку файла из списка без перезагрузки страницы.
                if (fileCard) {
                    fileCard.parentNode.removeChild(fileCard);
                }

                // Красное уведомление — как «Просчёт удалён» на /proschety/:
                // это удаление данных, зелёный цвет здесь путает.
                window.webOrdersToast('Файл удалён', 'error');
            })
            .catch(function () {
                button.disabled = false;
                window.webOrdersToast('Ошибка сети при удалении файла', 'error');
            });
    }

    document.addEventListener('click', function (event) {
        // «×» у файла — открываем подтверждение.
        var deleteButton = event.target.closest('.web-orders-file-delete-btn');
        if (deleteButton) {
            openDeleteConfirm(deleteButton);
            return;
        }

        // «Удалить» в модалке.
        if (event.target.closest('#web-orders-file-confirm [data-confirm="yes"]')) {
            var buttonToDelete = pendingDeleteButton;
            closeDeleteConfirm();
            if (buttonToDelete) performFileDelete(buttonToDelete);
            return;
        }

        // «Отмена».
        if (event.target.closest('#web-orders-file-confirm [data-confirm="no"]')) {
            closeDeleteConfirm();
            return;
        }

        // Клик по затемнению вокруг карточки — тоже закрывает.
        var overlay = document.getElementById('web-orders-file-confirm');
        if (overlay && event.target === overlay) {
            closeDeleteConfirm();
        }
    });

    // ========================================================================
    // СТАТУС МАКЕТА У ПОЗИЦИИ
    // ========================================================================
    // Менеджер меняет статус вручную: «проверен» — утвердить,
    // «содержит ошибки» — вернуть на правку.
    // Автоматически статус ставит сама загрузка файла клиентом,
    // здесь — только осознанное решение менеджера.

    // Запоминаем исходное значение, чтобы вернуть его при ошибке.
    document.querySelectorAll('.web-orders-item-status-select').forEach(function (select) {
        select.setAttribute('data-saved', select.value);
        applyStatusStyle(select);
    });

    function applyStatusStyle(select) {
        select.classList.remove('is-checked', 'is-errors', 'is-checking');

        if (select.value === 'checked') select.classList.add('is-checked');
        if (select.value === 'errors') select.classList.add('is-errors');
        if (select.value === 'checking') select.classList.add('is-checking');
    }

    document.addEventListener('change', function (event) {
        var select = event.target.closest('.web-orders-item-status-select');
        if (!select) return;

        var itemId = select.getAttribute('data-item-id');
        var status = select.value;
        var savedValue = select.getAttribute('data-saved') || '';

        select.disabled = true;

        var formData = new FormData();
        formData.append('status', status);

        fetch('/web-orders/api/item/' + itemId + '/layout-status/', {
            method: 'POST',
            headers: {
                'X-CSRFToken': getCsrfToken(),
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: formData
        })
            .then(function (response) { return response.json(); })
            .then(function (data) {
                select.disabled = false;

                if (!data || !data.success) {
                    // Возвращаем прежнее значение — нельзя оставлять
                    // в списке статус, который не сохранился.
                    select.value = savedValue;
                    applyStatusStyle(select);
                    window.webOrdersToast(
                        (data && data.error) ? data.error : 'Не удалось сохранить статус',
                        'error'
                    );
                    return;
                }

                select.setAttribute('data-saved', data.status);
                applyStatusStyle(select);
                window.webOrdersToast('Статус макета: ' + data.status_label, 'success');
            })
            .catch(function () {
                select.disabled = false;
                select.value = savedValue;
                applyStatusStyle(select);
                window.webOrdersToast('Ошибка сети при сохранении статуса', 'error');
            });
    });
})();