/*
proschety/static/proschety/js/sections/proschet_summary.js
JavaScript блока «Итоги просчёта».

ЧТО ДЕЛАЕТ:
  - Подписывается на событие proschetSelected (его генерирует
    секция «Список просчётов» при клике по строке);
  - Дёргает СУЩЕСТВУЮЩИЙ API приложения calculator:
        GET /calculator/get-proschet-price-data/<proschet_id>/
    и берёт из ответа блоки mass_volume и summary;
  - Раскладывает 4 показателя по карточкам: масса, объём,
    высота стопки, полная стоимость;
  - Показывает секцию (display: block). Пока просчёт не выбран —
    секция скрыта.

Логику calculator/ не трогаем — только читаем существующий эндпоинт.

ПОДРОБНЫЕ КОММЕНТАРИИ К КАЖДОЙ СТРОЧКЕ.
*/

"use strict";

(function () {

    // ========================================================================
    // 1. DOM-ЭЛЕМЕНТЫ И СОСТОЯНИЕ.
    // ========================================================================

    // Сама секция (для show/hide).
    let summarySection = null;

    // Спаны со значениями показателей.
    let massEl  = null;
    let volumeEl = null;
    let stackEl = null;
    let priceEl = null;
    // Новые элементы для скидки
    let priceLabel = null;
    let priceBlock = null;
    let discountBlock = null;
    let discountPercentEl = null;
    let discountAmountEl = null;

    // ID текущего просчёта — чтобы не дёргать сервер дважды на одно
    // и то же событие при быстром переключении.
    let currentProschetId = null;

    // AbortController для отмены предыдущего запроса, если пользователь
    // успел кликнуть по другому просчёту, пока первый ещё грузился.
    let abortController = null;

    // ========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ.
    // ========================================================================

    document.addEventListener('DOMContentLoaded', function () {
        console.log('✅ Модуль «Итоги просчёта» загружен');

        // Находим DOM-элементы по их ID.
        summarySection = document.getElementById('proschet-summary-section');
        massEl         = document.getElementById('proschet-summary-mass');
        volumeEl       = document.getElementById('proschet-summary-volume');
        stackEl        = document.getElementById('proschet-summary-stack');
        priceEl        = document.getElementById('proschet-summary-price');
        priceLabel        = document.getElementById('proschet-summary-price-label');
        priceBlock        = document.getElementById('proschet-summary-price-block');
        discountBlock     = document.getElementById('proschet-summary-discount-block');
        discountPercentEl = document.getElementById('proschet-summary-discount-percent');
        discountAmountEl  = document.getElementById('proschet-summary-discount-amount');

        // Если секции на странице нет — молча выходим.
        if (!summarySection) return;

        // Подписываемся на событие выбора просчёта — его генерирует
        // list_proschet.js (секция «Список просчётов»).
        document.addEventListener('proschetSelected', handleProschetSelected);

        // Подписываемся на перерисовку карточек компонентов — её генерирует
        // proschet.js (секция «Просчёт») после любого действия, которое
        // меняет состав/параметры компонентов (тираж, компонент, ламинация,
        // работы, ширина/высота/вылеты и т.д.). Без этой подписки блок
        // итогов не узнавал бы об изменениях и показывал старые цифры.
        document.addEventListener('proschetComponentsRendered', handleComponentsRendered);

        // Мостик для существующего модуля price_orders.js (из calculator).
        // Он умеет работать с кнопками «Создать новый заказ» и
        // «Добавить в имеющийся», но ищет ID просчёта через
        // window.priceSection.getCurrentProschetId(). На странице
        // /proschety/ такого объекта нет, поэтому определяем его здесь.
        // Если на странице уже есть priceSection (например, при переходе
        // со старого калькулятора) — не перетираем, а дополняем методом.
        if (!window.priceSection) window.priceSection = {};
        window.priceSection.getCurrentProschetId = function () {
            return currentProschetId;
        };
        // === Кнопка «Создать шаблон» ===
        // Перенаправляет в справочник шаблонов с ID текущего просчёта.
        // Справочник сам откроет нужную панель и сохранит шаблон.
        const createTemplateBtn = document.getElementById('create-template-btn');
        if (createTemplateBtn) {
            createTemplateBtn.addEventListener('click', function () {
                // currentProschetId точно есть, так как блок виден только при выбранном просчёте.
                if (currentProschetId) {
                    window.location.href = '/shablony/?proschet_id=' + encodeURIComponent(currentProschetId);
                }
            });
        }
    });

    // ========================================================================
    // 3. ОБРАБОТЧИК ВЫБОРА ПРОСЧЁТА.
    // ========================================================================

    function handleProschetSelected(event) {
        const d = event.detail || {};
        const proschetId = d.proschetId;
        if (!proschetId) return;

        // Если это тот же просчёт, что уже открыт, — перезагружаем данные
        // (могли поменяться после правок в других секциях).
        currentProschetId = String(proschetId);
        fetchSummary(currentProschetId);
    }

    // ========================================================================
    // 3б. ОБРАБОТЧИК ПЕРЕРИСОВКИ КАРТОЧЕК КОМПОНЕНТОВ.
    // ========================================================================

    /**
     * Реагирует на событие proschetComponentsRendered — просто
     * перезагружает данные с того же эндпоинта. Так блок итогов
     * обновляется после любого изменения тиража/состава/параметров.
     */
    function handleComponentsRendered(event) {
        const d = event.detail || {};
        const id = d.proschetId;
        if (!id) return;

        // Защита от гонки: если пришло событие для старого просчёта,
        // пока пользователь уже переключился на новый — игнорируем.
        if (String(id) !== String(currentProschetId)) return;

        fetchSummary(String(id));
    }    

    // ========================================================================
    // 4. ЗАГРУЗКА ДАННЫХ С СЕРВЕРА.
    // ========================================================================

    function fetchSummary(proschetId) {
        // Отменяем предыдущий запрос — если пользователь быстро кликает
        // по разным строкам, ответ старого запроса нам уже не нужен.
        if (abortController) abortController.abort();
        abortController = new AbortController();
        const signal = abortController.signal;

        fetch('/proschety/api/price-data/' + proschetId + '/', {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            signal: signal
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (signal.aborted) return;
            if (!data || !data.success) return;
            renderSummary(data);
        })
        .catch(function (err) {
            // AbortError — это нормально (мы сами отменили).
            if (err && err.name === 'AbortError') return;
            console.warn('Не удалось загрузить итоги просчёта:', err);
        });
    }

    // ========================================================================
    // 5. ОТРИСОВКА ЗНАЧЕНИЙ.
    // ========================================================================

    function renderSummary(data) {
        const mv = data.mass_volume || {};
        const summary = data.summary || {};

        // --- Масса: граммы → килограммы, 3 знака после запятой ---
        const massKg = (Number(mv.total_mass_g) || 0) / 1000;
        if (massEl) massEl.textContent = massKg.toFixed(3) + ' кг';

        // --- Объём: кубические сантиметры → литры, 3 знака ---
        const volumeL = (Number(mv.total_volume_cm3) || 0) / 1000;
        if (volumeEl) volumeEl.textContent = volumeL.toFixed(3) + ' л';

        // --- Высота стопки: сумма по валидным записям stacks ---
        // В mv.stacks лежат стопки по каждому компоненту.
        // Берём только те, где valid=true и stack_height_mm — число.
        let totalStackMm = 0;
        (mv.stacks || []).forEach(function (s) {
            if (s && s.valid && s.stack_height_mm != null) {
                totalStackMm += Number(s.stack_height_mm) || 0;
            }
        });
        if (stackEl) {
            stackEl.textContent = totalStackMm > 0
                ? formatMm(totalStackMm)
                : '—';
        }

        // --- Полная стоимость (с учётом скидки) ---
        // Бэкенд (proschety/views.py) уже вернул нам цену со скидкой в summary.total_price,
        // а старую цену без скидки — в summary.original_total_price (если скидка есть).
        // --- Цена за штуку и итоговая стоимость (с учётом скидки и округления) ---
        const rawTotalPrice = Number(summary.total_price) || 0; // Сумма со скидкой
        const originalTotalPrice = Number(summary.original_total_price) || rawTotalPrice;
        const discountPercent = Number(data.discount_percent) || 0;
        
        // Получаем тираж из данных ответа
        const circulation = Number(data.proschet.circulation) || 1;

        // 1. Округляем цену за штуку в БОЛЬШУЮ сторону до 2-х знаков
        let unitPrice = 0;
        let finalTotalPrice = rawTotalPrice;
        
        if (circulation > 0) {
            // Math.ceil((rawTotalPrice / circulation) * 100) / 100
            unitPrice = Math.ceil((rawTotalPrice / circulation) * 100) / 100;
            // 2. Пересчитываем итог, умножая цену за шт на тираж
            finalTotalPrice = unitPrice * circulation;
        }

        // Выводим цену за штуку
        const unitPriceEl = document.getElementById('proschet-summary-unit-price');
        if (unitPriceEl) {
            unitPriceEl.textContent = formatMoney(unitPrice);
        }

        if (discountPercent > 0) {
            if (priceLabel) priceLabel.textContent = 'К оплате:';
            if (priceEl) priceEl.textContent = formatMoney(finalTotalPrice);
            
            if (discountBlock) {
                discountBlock.style.display = 'inline-flex';
                if (discountPercentEl) discountPercentEl.textContent = discountPercent;
                if (discountAmountEl) {
                    const discountAmount = originalTotalPrice - rawTotalPrice;
                    discountAmountEl.textContent = formatMoney(discountAmount);
                }
            }
        } else {
            if (priceLabel) priceLabel.textContent = 'К оплате:';
            if (priceEl) priceEl.textContent = formatMoney(finalTotalPrice);
            if (discountBlock) discountBlock.style.display = 'none';
        }

        // Показываем секцию.
        summarySection.style.display = 'block';
    }

    // ========================================================================
    // 6. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ФОРМАТИРОВАНИЯ.
    // ========================================================================

    /**
     * Форматирует миллиметры: до одного знака после запятой;
     * если значение целое — без «.0».
     */
    function formatMm(v) {
        const r = Math.round(v * 10) / 10;
        return (r % 1 === 0 ? String(r) : r.toFixed(1)) + ' мм';
    }


    /**
     * Форматирует сумму в «1 234.56 ₽» — с пробелами как разделителями
     * тысяч и двумя знаками после запятой.
     */
    function formatMoney(v) {
        return (Math.round(v * 100) / 100)
            .toFixed(2)
            .replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽';
    }


})();