/*
 * sklad.js
 * Клиентская логика страницы «Склад материалов».
 * Полностью переписана по образу tovary/js.
 *
 * Основные функции:
 * - Переключение типа (Бумага/Плёнка) через URL.
 * - Модалки для категорий (добавить, переименовать, удалить).
 * - Модалка удаления материала.
 * - Инлайн-редактирование всех полей по blur/Enter (без двойных кликов).
 * - Динамический пересчёт цены при изменении себестоимости или наценки.
 * - Динамическая иконка (Favicon) для WebSocket.
 */
"use strict";

// ============================================================================
// 1. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

/**
 * Получает CSRF-токен из скрытого поля формы.
 */
function getCsrfToken() {
    const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    return input ? input.value : '';
}

/**
 * Форматирует цену (себестоимость + наценка) для отображения.
 * Возвращает строку вида "15.60 руб./лист".
 */
function formatPrice(costStr, markupStr, unit) {
    const cost = parseFloat(String(costStr).replace(',', '.')) || 0;
    const markup = parseFloat(String(markupStr).replace(',', '.')) || 0;
    const price = cost * (1 + markup / 100);
    return price.toFixed(2) + ' руб./' + (unit || 'лист');
}

// ============================================================================
// 2. ИНИЦИАЛИЗАЦИЯ
// ============================================================================

document.addEventListener('DOMContentLoaded', function () {
    initTypeSwitcher();
    initInlineEditing();
    initDragAndDrop(); // <-- ДОБАВЛЕНА НОВАЯ СТРОКА
    initFaviconWebSocket();
});

// ============================================================================
// 3. ПЕРЕКЛЮЧАТЕЛЬ ТИПА (БУМАГА / ПЛЁНКА)
// ============================================================================

function initTypeSwitcher() {
    const switcher = document.getElementById('type-switcher');
    if (!switcher) return;

    switcher.querySelectorAll('.type-switcher-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const type = this.getAttribute('data-type');
            // Сбрасываем выбранную категорию при смене типа,
            // так как категории бумаги и плёнки — это разные ветки.
            window.location.href = '/sklad/?type=' + type;
        });
    });
}

// ============================================================================
// 4. ИНЛАЙН-РЕДАКТИРОВАНИЕ ПОЛЕЙ (BLUR / ENTER)
// ============================================================================

// Функция переключения аккордеона
window.toggleMaterialCard = function(headerElement) {
    const card = headerElement.closest('.material-row-card');
    if (!card) return;
    card.classList.toggle('is-open');
};

function initInlineEditing() {
    // Находим все редактируемые ячейки в карточках материалов
    document.querySelectorAll('.material-row-card .tovary-cell[data-field]').forEach(input => {
        const row = input.closest('.material-row-card');
        if (!row) return;
        const materialId = row.getAttribute('data-material-id');

        // Сохранение по Enter
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur(); // Вызовет сохранение
            } else if (e.key === 'Escape') {
                e.preventDefault();
                // Откат к старому значению
                input.value = input.getAttribute('data-original-value') || '';
                input.blur();
            }
        });

        // Сохранение по потере фокуса
        input.addEventListener('blur', function () {
            const field = input.getAttribute('data-field');
            const newValue = input.value;
            const oldValue = input.getAttribute('data-original-value') || '';

            // Если значение не изменилось — ничего не делаем
            if (newValue === oldValue) return;

            // Визуально показываем сохранение
            input.style.opacity = '0.5';

            // Отправляем AJAX-запрос
            fetch('/sklad/material/' + materialId + '/update-field/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    field_name: field,
                    field_value: newValue
                })
            })
            .then(r => r.json())
            .then(data => {
                input.style.opacity = '1';

                if (data.success) {
                    // Обновляем оригинальное значение
                    input.setAttribute('data-original-value', newValue);
                    
                    // Короткое мигание зелёным (успех)
                    input.style.backgroundColor = '#eaf6ef';
                    setTimeout(() => input.style.backgroundColor = '', 500);

                    // ===== ДИНАМИЧЕСКИЙ ПЕРЕСЧЁТ ЦЕНЫ =====
                    // Если изменили себестоимость, наценку или единицу измерения,
                    // нужно обновить отображаемую розничную цену (зелёный текст).
                    if (['cost', 'markup_percent', 'unit'].includes(field)) {
                        const costInput = row.querySelector('input[data-field="cost"]');
                        const markupInput = row.querySelector('input[data-field="markup_percent"]');
                        const unitInput = row.querySelector('input[data-field="unit"]');
                        const priceDisplay = row.querySelector('.material-header-price');

                        if (costInput && markupInput && unitInput && priceDisplay) {
                            const cost = costInput.value;
                            const markup = markupInput.value;
                            const unit = unitInput.value;
                            
                            // Пересчитываем цену на клиенте (по той же формуле, что в моделях)
                            priceDisplay.textContent = formatPrice(cost, markup, unit);
                        }
                    }
                } else {
                    // Ошибка (например, пустое имя или кривая цена)
                    alert('Ошибка: ' + data.error);
                    input.value = oldValue; // Откат
                }
            })
            .catch(err => {
                console.error('Ошибка сети:', err);
                input.style.opacity = '1';
                alert('Ошибка сети при сохранении');
                input.value = oldValue; // Откат
            });
        });
    });
}

// ============================================================================
// 5. ПЕРЕТАСКИВАНИЕ КАРТОЧЕК (DRAG AND DROP)
// ============================================================================

function initDragAndDrop() {
    const list = document.querySelector('.materials-list');
    if (!list) return;

    const cards = list.querySelectorAll('.material-row-card');
    let draggedItem = null;

    cards.forEach(card => {
        // ===== ЗАЩИТА ОТ ПЕРЕТАСКИВАНИЯ ПРИ КЛИКЕ НА ПОЛЯ =====
        // Когда пользователь нажимает кнопку мыши, проверяем, куда именно он кликнул.
        // Если на инпут, кнопку или текст — отключаем перетаскивание карточки.
        card.addEventListener('mousedown', function (e) {
            const isInteractive = e.target.closest('input, button, textarea, .tovary-category-text');
            if (isInteractive) {
                this.setAttribute('draggable', 'false');
            } else {
                this.setAttribute('draggable', 'true');
            }
        });

        // Как только отпускаем кнопку мыши — возвращаем возможность перетаскивания
        card.addEventListener('mouseup', function () {
            this.setAttribute('draggable', 'true');
        });

        // Начало перетаскивания
        card.addEventListener('dragstart', function (e) {
            draggedItem = this;
            this.classList.add('dragging');
            
            // Обязательно для Firefox
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', this.getAttribute('data-material-id')); 
        });

        // Конец перетаскивания (когда отпустили мышь)
        card.addEventListener('dragend', function () {
            this.classList.remove('dragging');
            // Убираем классы подсветки со всех карточек
            cards.forEach(c => c.classList.remove('drag-over'));
            draggedItem = null;
        });

        // Находимся над карточкой
        card.addEventListener('dragover', function (e) {
            e.preventDefault(); // Разрешаем сброс
            e.dataTransfer.dropEffect = 'move';
            
            if (this !== draggedItem) {
                this.classList.add('drag-over');
            }
        });

        // Ушли с карточки
        card.addEventListener('dragleave', function () {
            this.classList.remove('drag-over');
        });

        // Отпустили над карточкой
        card.addEventListener('drop', function (e) {
            e.preventDefault();
            this.classList.remove('drag-over');

            if (this !== draggedItem && draggedItem) {
                const rect = this.getBoundingClientRect();
                const offset = e.clientY - rect.top;
                
                if (offset > rect.height / 2) {
                    list.insertBefore(draggedItem, this.nextSibling);
                } else {
                    list.insertBefore(draggedItem, this);
                }
                saveNewOrder(list);
            }
        });
    });

    // ===== ЛОГИКА ПЕРЕНОСА В ДЕРЕВО КАТЕГОРИЙ =====
    const categoryNodes = document.querySelectorAll('.category-node');
    
    categoryNodes.forEach(node => {
        node.addEventListener('dragover', function (e) {
            e.preventDefault();
            this.classList.add('drag-over-category');
        });

        node.addEventListener('dragleave', function (e) {
            this.classList.remove('drag-over-category');
        });

        node.addEventListener('drop', function (e) {
            e.preventDefault();
            this.classList.remove('drag-over-category');

            if (draggedItem) {
                const materialId = draggedItem.getAttribute('data-material-id');
                const categoryId = this.getAttribute('data-category-id');

                if (materialId && categoryId) {
                    moveMaterialToCategory(materialId, categoryId);
                }
            }
        });
    });
}

// Функция переноса в другую категорию
function moveMaterialToCategory(materialId, categoryId) {
    fetch('/sklad/material/' + materialId + '/update-category/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ category_id: categoryId })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            // Перезагружаем страницу, чтобы обновить список материалов
            window.location.reload();
        } else {
            alert('Ошибка переноса: ' + data.error);
        }
    })
    .catch(err => {
        console.error('Ошибка сети:', err);
        alert('Ошибка сети при переносе материала');
    });
}

// Отправка нового порядка на сервер
function saveNewOrder(list) {
    // Собираем ID всех карточек в новом порядке
    const cards = list.querySelectorAll('.material-row-card');
    const order = Array.from(cards).map(card => card.getAttribute('data-material-id'));

    fetch('/sklad/materials/update-order/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({ order: order })
    })
    .then(r => r.json())
    .then(data => {
        if (!data.success) {
            alert('Ошибка сохранения порядка: ' + (data.error || 'неизвестная ошибка'));
            window.location.reload(); // Перезагружаем, чтобы вернуть как было
        }
    })
    .catch(err => {
        console.error('Ошибка сети при сохранении порядка:', err);
        alert('Ошибка сети при сохранении порядка');
        window.location.reload();
    });
}


// ============================================================================
// 5. ДЕЙСТВИЯ С КАТЕГОРИЯМИ
// ============================================================================

// ----- 5.1. Добавление категории -----

function addCategory() {
    document.getElementById('add-cat-name').value = ''; // Очищаем поле
    document.getElementById('add-category-overlay').style.display = 'flex';
    setTimeout(function () {
        document.getElementById('add-cat-name').focus();
    }, 50);
}

function closeAddCategoryModal() {
    document.getElementById('add-category-overlay').style.display = 'none';
}

// ----- 5.2. Переименование категории -----

function renameCategory(categoryId, currentName) {
    document.getElementById('rename-cat-name').value = currentName;
    document.getElementById('rename-category-form').action = '/sklad/category/' + categoryId + '/update/';
    document.getElementById('rename-category-overlay').style.display = 'flex';
    
    setTimeout(function () {
        const input = document.getElementById('rename-cat-name');
        input.focus();
        input.select(); // Выделяем текст
    }, 50);
}

function closeRenameCategoryModal() {
    document.getElementById('rename-category-overlay').style.display = 'none';
}

// ----- 5.3. Удаление категории -----

let pendingDeleteCategoryId = null;

function deleteCategory(categoryId, categoryName) {
    pendingDeleteCategoryId = categoryId;
    document.getElementById('delete-cat-name').textContent = '«' + categoryName + '»';
    document.getElementById('delete-category-overlay').style.display = 'flex';
}

function closeDeleteCategoryModal() {
    pendingDeleteCategoryId = null;
    document.getElementById('delete-category-overlay').style.display = 'none';
}

function confirmDeleteCategory() {
    if (!pendingDeleteCategoryId) return;
    // Отправляем POST-запрос через скрытую форму (так как view требует @require_POST)
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/sklad/category/' + pendingDeleteCategoryId + '/delete/';
    
    const csrf = document.createElement('input');
    csrf.type = 'hidden';
    csrf.name = 'csrfmiddlewaretoken';
    csrf.value = getCsrfToken();
    
    form.appendChild(csrf);
    document.body.appendChild(form);
    form.submit();
}

// ============================================================================
// 6. ДЕЙСТВИЯ С МАТЕРИАЛАМИ
// ============================================================================

// ----- 6.1. Удаление материала -----

let pendingDeleteMaterialId = null;

function deleteMaterial(materialId, materialName) {
    pendingDeleteMaterialId = materialId;
    document.getElementById('delete-material-name').textContent = '«' + materialName + '»';
    document.getElementById('delete-material-overlay').style.display = 'flex';
}

function closeDeleteMaterialModal() {
    pendingDeleteMaterialId = null;
    document.getElementById('delete-material-overlay').style.display = 'none';
}

function confirmDeleteMaterial() {
    if (!pendingDeleteMaterialId) return;
    // Отправляем POST-запрос через скрытую форму
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/sklad/material/' + pendingDeleteMaterialId + '/delete/';
    
    const csrf = document.createElement('input');
    csrf.type = 'hidden';
    csrf.name = 'csrfmiddlewaretoken';
    csrf.value = getCsrfToken();
    
    form.appendChild(csrf);
    document.body.appendChild(form);
    form.submit();
}

// ============================================================================
// 7. ДИНАМИЧЕСКАЯ ИКОНКА (WEB SOCKET)
// ============================================================================

function initFaviconWebSocket() {
    const favicon = document.getElementById('sklad-favicon');
    if (!favicon) return;

    function setFaviconStatus(status) {
        let color = '%23999'; // Серый (подключение)
        if (status === 'online') color = '%230B8661'; // Зеленый (онлайн)
        if (status === 'offline') color = '%23f44336'; // Красный (оффлайн)
        
        // Используем иконку "склад" (коробка) с заданным цветом
        favicon.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${color}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'></path><polyline points='3.27 6.96 12 12.01 20.73 6.96'></polyline><line x1='12' y1='22.08' x2='12' y2='12'></line></svg>`;
    }

    // Подключаемся к тому же WS-каналу, что и заказы (чтобы отслеживать статус)
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const url = protocol + window.location.host + '/ws/orders/';
    let ws;

    try {
        ws = new WebSocket(url);
    } catch (e) {
        setFaviconStatus('offline');
        return;
    }

    ws.onopen = function () {
        setFaviconStatus('online');
    };

    ws.onclose = function () {
        setFaviconStatus('offline');
        // Переподключение через 3 секунды
        setTimeout(initFaviconWebSocket, 3000);
    };

    ws.onerror = function () {
        setFaviconStatus('offline');
    };
}

// ============================================================================
// 8. ЭКСПОРТ ГЛОБАЛЬНЫХ ФУНКЦИЙ (для вызова из inline onclick в HTML)
// ============================================================================

window.addCategory = addCategory;
window.closeAddCategoryModal = closeAddCategoryModal;
window.renameCategory = renameCategory;
window.closeRenameCategoryModal = closeRenameCategoryModal;
window.deleteCategory = deleteCategory;
window.closeDeleteCategoryModal = closeDeleteCategoryModal;
window.confirmDeleteCategory = confirmDeleteCategory;

window.deleteMaterial = deleteMaterial;
window.closeDeleteMaterialModal = closeDeleteMaterialModal;
window.confirmDeleteMaterial = confirmDeleteMaterial;