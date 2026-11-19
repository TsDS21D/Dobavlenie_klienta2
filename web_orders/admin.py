"""
Административная панель приложения "web_orders" (Входящие заявки).
Позволяет менеджерам просматривать сырые заявки с сайта,
менять их статусы и видеть состав корзины.

Сюда же добавлены файлы макетов: их можно посмотреть и приложить
до того, как появится отдельный интерфейс в карточке заявки.
"""
from django.contrib import admin

from .models import (
    WebOrder,
    WebOrderItem,
    SiteOrderStatus,
    WebOrderItemFile,
    WebOrderItemFileComment,
)


class WebOrderItemInline(admin.TabularInline):
    """
    Позволяет просматривать товары (позиции) заявки
    прямо внутри карточки WebOrder.
    """
    model = WebOrderItem
    extra = 0  # Не добавлять пустые строки по умолчанию
    # Поля только для чтения, так как это "сырой" снимок с сайта
    readonly_fields = ('name', 'count', 'price', 'property', 'total_price')


@admin.register(WebOrder)
class WebOrderAdmin(admin.ModelAdmin):
    """
    Настройка списка и карточки входящих заявок в админке.
    """
    # Колонки в общем списке заявок
    list_display = (
        'id',
        'moguta_order_number',
        'fio',
        'email',
        'phone',
        'total_summ',
        'status',
        'created_at'
    )
    # Фильтры в правой панели
    list_filter = ('status', 'customer_type', 'site')
    # Поля для поиска
    search_fields = ('moguta_order_number', 'fio', 'email', 'phone')
    # Поля, которые нельзя редактировать вручную.
    # op_fields добавлен сюда по той же причине, что и raw_payload:
    # это снимок данных из Moguta, а не рабочее поле. В админке он
    # выводится как редактируемая текстовая область с JSON — если
    # менеджер случайно тронет кавычку, поле превратится в битую строку
    # и заявка перестанет разбираться. Только чтение.
    readonly_fields = ('created_at', 'updated_at', 'raw_payload', 'op_fields')
    # Встроенный список товаров
    inlines = [WebOrderItemInline]

    def items_summary(self, obj):
        return ', '.join(f'{i.name} ×{i.count}' for i in obj.items.all())
    items_summary.short_description = 'Состав'


class WebOrderItemFileInline(admin.TabularInline):
    """
    Файлы макетов внутри карточки позиции.

    Показываем только рабочие поля: сам файл или ссылку, тип,
    комментарий автора и видимость для клиента.
    """
    model = WebOrderItemFile
    extra = 0
    fields = (
        'kind',
        'file',
        'link_url',
        'comment',
        'author_kind',
        'is_client_visible',
        'original_name',
        'size',
    )
    # original_name редактируемое: если файл добавлен «не тем» путём
    # (импорт, старый код), имя можно поправить руками. Размер — только чтение,
    # он всегда должен совпадать с реальным файлом.
    readonly_fields = ('size',)


@admin.register(WebOrderItem)
class WebOrderItemAdmin(admin.ModelAdmin):
    """
    Отдельный список всех позиций заявок (для массового просмотра).
    Здесь же — файлы макетов этой позиции.
    """
    list_display = ('id', 'web_order', 'name', 'count', 'price', 'total_price')
    list_filter = ('web_order__status',)
    inlines = [WebOrderItemFileInline]

    def save_formset(self, request, form, formset, change):
        """
        Заполняет имя и размер файла при загрузке через inline-форму.

        ЗАЧЕМ ЭТО НУЖНО:
        Django сохраняет файл под сгенерированным именем (uuid.pdf), чтобы
        два «макет.pdf» не затёрли друг друга. Исходное имя при этом теряется,
        если не записать его вручную — и в интерфейсе клиент и менеджер
        видят вместо «Реквизиты счёта ИП … .pdf» строку вида
        «d338bdedfc5b44398cb457e67309cade.pdf».

        Здесь мы берём загруженный файл из cleaned_data формы (у него ещё
        есть исходное имя) и сохраняем его в поля модели.

        obj._state.adding — новая запись; файл мог быть добавлен и к
        существующей, поэтому проверяем оба случая.
        """
        for inline_form in formset.forms:
            instance = inline_form.instance

            if not isinstance(instance, WebOrderItemFile):
                continue

            if not hasattr(inline_form, 'cleaned_data'):
                continue

            uploaded = inline_form.cleaned_data.get('file')

            # У уже сохранённого файла uploaded будет FieldFile без исходного
            # имени — тогда просто пропускаем.
            if uploaded and hasattr(uploaded, 'name'):
                instance.original_name = uploaded.name
                instance.size = getattr(uploaded, 'size', 0) or 0
                instance.content_type = getattr(uploaded, 'content_type', '') or ''

        super().save_formset(request, form, formset, change)


class WebOrderItemFileCommentInline(admin.TabularInline):
    """Комментарии к файлу — диалог клиента и менеджера."""
    model = WebOrderItemFileComment
    extra = 0
    readonly_fields = ('created_at',)


@admin.register(WebOrderItemFile)
class WebOrderItemFileAdmin(admin.ModelAdmin):
    """
    Отдельный список файлов макетов: удобно искать по имени файла,
    заявке и типу.
    """
    list_display = (
        'id',
        'item',
        'kind',
        'author_kind',
        'original_name',
        'size',
        'is_client_visible',
        'created_at',
    )
    list_filter = ('kind', 'author_kind', 'is_client_visible')
    search_fields = (
        'original_name',
        'comment',
        'item__name',
        'item__web_order__moguta_order_number',
    )
    # Служебные поля заполняются автоматически при загрузке — руками их
    # править нельзя, иначе в списке будет мусор.
    readonly_fields = ('size', 'content_type', 'original_name', 'created_at')
    inlines = [WebOrderItemFileCommentInline]

    def save_model(self, request, obj, form, change):
        """
        При загрузке файла через админку заполняем служебные поля.

        ЗАЧЕМ: original_name и size нужны, чтобы показывать файл в списках
        и в интерфейсе заявки без обращения к файловой системе.
        """
        if obj.file and not obj.original_name:
            # Берём только имя файла без пути.
            obj.original_name = obj.file.name.rsplit('/', 1)[-1]
        if obj.file and not obj.size:
            try:
                obj.size = obj.file.size
            except (OSError, ValueError):
                obj.size = 0
        super().save_model(request, obj, form, change)


@admin.register(WebOrderItemFileComment)
class WebOrderItemFileCommentAdmin(admin.ModelAdmin):
    """Отдельный список комментариев к файлам."""
    list_display = ('id', 'file', 'author_kind', 'created_at')
    list_filter = ('author_kind',)
    search_fields = ('text',)
    readonly_fields = ('created_at',)

@admin.register(SiteOrderStatus)
class SiteOrderStatusAdmin(admin.ModelAdmin):
    """
    Статусы для сайта: ссылка на оплату и счёт (PDF).

    ЗАЧЕМ ОТДЕЛЬНАЯ АДМИНКА:
    до этого поля pay_link и invoice_file можно было заполнить только
    через manage.py shell — менеджер ссылку на оплату вставить не мог,
    а счёт загрузить тем более. Клиент в ЛК видел «Счёт скоро появится»,
    хотя счёт уже был выставлен.

    ГДЕ ЭТО В ИНТЕРФЕЙСЕ:
    заявка → «Статусы для сайта» → нужная запись. Искать удобно по номеру
    заявки в списке.
    """
    list_display = (
        'id',
        'web_order',
        'layout_status',
        'has_pay_link',
        'has_invoice',
        'updated_at',
    )
    list_filter = ('layout_status',)
    search_fields = (
        'web_order__moguta_order_number',
        'web_order__fio',
    )
    list_select_related = ('web_order',)

    # updated_at — auto_now, руками не правится.
    readonly_fields = ('updated_at',)

    fieldsets = (
        ('Заявка', {
            'fields': ('web_order',),
        }),
        ('Оплата', {
            'fields': ('pay_link', 'invoice_file'),
            'description': 'Ссылка на оплату (ЮKassa) — для физлица. '
                           'PDF счёта — для юрлица; клиент скачивает его '
                           'из личного кабинета на сайте.',
        }),
        ('Макет', {
            'fields': ('layout_status',),
            'description': 'Используется только для старых заявок без позиций. '
                           'У новых статус макета живёт у каждой позиции.',
        }),
        ('Служебное', {
            'fields': ('updated_at',),
        }),
    )

    @admin.display(description='Ссылка на оплату', boolean=True)
    def has_pay_link(self, obj):
        """Есть ли ссылка на оплату — видно в списке без открытия карточки."""
        return bool((obj.pay_link or '').strip())

    @admin.display(description='Счёт', boolean=True)
    def has_invoice(self, obj):
        """Загружен ли PDF счёта."""
        return bool(obj.invoice_file)