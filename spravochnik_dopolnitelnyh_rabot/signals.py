"""
signals.py для приложения spravochnik_dopolnitelnyh_rabot.

Содержит сигналы, которые автоматически обновляют все дополнительные работы,
связанные с изменённой записью справочника (Work или WorkPrice).
Это гарантирует, что цены и названия в просчётах всегда актуальны.
"""

# Импортируем сигнал post_save – он срабатывает после сохранения объекта
from django.db.models.signals import post_save, post_delete  # добавили post_delete
# Импортируем декоратор receiver для подключения функции к сигналу
from django.dispatch import receiver

# Импортируем модели справочника (Work и WorkPrice)
from .models import Work, WorkPrice

# Импортируем модель дополнительной работы из приложения calculator
# Важно: используем прямой импорт, так как приложения связаны.
from calculator.models_list_proschet import AdditionalWork


@receiver(post_save, sender=Work)  # Декоратор: после сохранения любого объекта Work
def update_related_additional_works_on_work_save(sender, instance, **kwargs):
    """
    Сигнальная функция, вызываемая автоматически после сохранения объекта Work.
    Находит все дополнительные работы, у которых поле work ссылается на этот экземпляр,
    и обновляет их поля из справочника, после чего пересчитывает их общую стоимость.

    Аргументы:
        sender   – класс модели, отправившей сигнал (Work)
        instance – конкретный сохранённый объект Work
        **kwargs – прочие служебные параметры (created, update_fields и т.д.)
    """

    # 1. Получаем QuerySet всех дополнительных работ, связанных с этим объектом Work
    #    Связь: AdditionalWork.work = instance (ForeignKey)
    related_works = AdditionalWork.objects.filter(work=instance)

    # 2. Если связанных работ нет – сразу выходим, ничего делать не нужно
    if not related_works.exists():
        return

    # 3. Перебираем каждую найденную дополнительную работу
    for aw in related_works:
        # Копируем название из справочника (оно могло измениться)
        aw.title = instance.name

        # Копируем цену из справочника (она могла измениться)
        aw.price = instance.price

        # Копируем тип формулы (на случай, если он изменился)
        aw.formula_type = instance.formula_type

        # Копируем значения по умолчанию для линий реза и изделий на листе
        aw.lines_count = instance.default_lines_count
        aw.items_per_sheet = instance.default_items_per_sheet

        # 4. Сохраняем дополнительную работу. В её методе save() автоматически
        #    пересчитывается поле total_price на основе новых данных (цены, формулы,
        #    а также тиража и количества листов из связанного печатного компонента).
        aw.save()


# ===== НОВЫЙ СИГНАЛ ДЛЯ ОПОРНЫХ ТОЧЕК ЦЕН (WorkPrice) =====
@receiver(post_save, sender=WorkPrice)
@receiver(post_delete, sender=WorkPrice)
def update_related_additional_works_on_workprice_change(sender, instance, **kwargs):
    """
    Сигнал, вызываемый после сохранения или удаления опорной точки цены (WorkPrice).
    При изменении опорных точек цена работы (effective_price) может измениться,
    поэтому необходимо пересохранить все дополнительные работы, связанные с Work,
    к которому относится эта опорная точка. Пересохранение вызовет пересчёт total_price.

    Аргументы:
        sender   – класс модели (WorkPrice)
        instance – конкретный объект WorkPrice (сохранённый или удаляемый)
        **kwargs – дополнительные параметры (created для post_save и др.)
    """

    # Получаем Work, к которому относится изменённая опорная точка
    work = instance.work

    # Находим все дополнительные работы, связанные с этим Work
    related_works = AdditionalWork.objects.filter(work=work)

    # Если связанных работ нет – выходим
    if not related_works.exists():
        return

    # Для каждой работы просто вызываем save(), чтобы пересчитался total_price
    for aw in related_works:
        # Важно: не меняем никакие поля, просто сохраняем, чтобы сработал пересчёт.
        # В методе save() модели AdditionalWork будет вызвана функция _get_effective_price(),
        # которая использует актуальные опорные точки (через work) и пересчитает total_price.
        aw.save()