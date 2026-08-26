"""
signals.py для приложения spravochnik_dopolnitelnyh_rabot.

Содержит сигналы, которые автоматически обновляют все дополнительные работы,
связанные с изменённой записью справочника (Work, WorkPrice, WorkCirculationPrice).
Теперь сигнал для Work копирует также cost и markup_percent.
"""

from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import Work, WorkPrice, WorkCirculationPrice
from calculator.models_list_proschet import AdditionalWork


@receiver(post_save, sender=Work)  # Декоратор: после сохранения любого объекта Work
def update_related_additional_works_on_work_save(sender, instance, **kwargs):
    """
    Сигнальная функция, вызываемая автоматически после сохранения объекта Work.
    Находит все дополнительные работы, у которых поле work ссылается на этот экземпляр,
    и обновляет их поля из справочника (включая cost, markup_percent, price),
    после чего пересчитывает их общую стоимость.

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

        # ===== НОВЫЕ ПОЛЯ: копируем себестоимость и наценку =====
        aw.cost = instance.cost
        aw.markup_percent = instance.markup_percent
        # Цена копируется из instance.price, которая уже пересчитана при сохранении Work
        aw.price = instance.price
        # ===== КОНЕЦ НОВЫХ ПОЛЕЙ =====

        # Копируем тип формулы (на случай, если он изменился)
        aw.formula_type = instance.formula_type

        # Копируем значения по умолчанию для линий реза и изделий на листе
        aw.lines_count = instance.default_lines_count
        aw.items_per_sheet = instance.default_items_per_sheet

        # 4. Сохраняем дополнительную работу. В её методе save() автоматически
        #    пересчитывается поле total_price на основе новых данных (цены, формулы,
        #    а также тиража и количества листов из связанного печатного компонента).
        aw.save()


@receiver(post_save, sender=WorkPrice)
@receiver(post_delete, sender=WorkPrice)
def update_related_additional_works_on_workprice_change(sender, instance, **kwargs):
    """
    Сигнал, вызываемый после сохранения или удаления опорной точки цены (WorkPrice).
    При изменении опорных точек цена работы (effective_price) может измениться,
    поэтому необходимо пересохранить все дополнительные работы, связанные с Work,
    к которому относится эта опорная точка. Пересохранение вызовет пересчёт total_price.
    """
    work = instance.work
    related_works = AdditionalWork.objects.filter(work=work)
    if not related_works.exists():
        return
    for aw in related_works:
        aw.save()


@receiver(post_save, sender=WorkCirculationPrice)
@receiver(post_delete, sender=WorkCirculationPrice)
def update_related_additional_works_on_circulation_price_change(sender, instance, **kwargs):
    """
    Сигнал, вызываемый после сохранения или удаления опорной точки цены по тиражу.
    Пересохраняет все дополнительные работы, связанные с Work, к которому относится эта точка,
    чтобы пересчитать их total_price (так как изменилась effective_price для формул, зависящих от тиража).
    """
    work = instance.work
    related_works = AdditionalWork.objects.filter(work=work)
    if not related_works.exists():
        return
    for aw in related_works:
        aw.save()