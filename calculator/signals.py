# calculator/signals.py
"""
Сигналы для приложения calculator.
Здесь определяются действия, которые автоматически выполняются при сохранении моделей.
"""

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from .models_list_proschet import Proschet, PrintComponent
from print_price.utils import calculate_price_for_printer_and_copies


@receiver(pre_save, sender=Proschet)
def proschet_pre_save(sender, instance, **kwargs):
    """
    Сохраняем старое значение тиража перед сохранением просчёта.
    Это нужно, чтобы в post_save знать, изменился ли тираж.
    """
    if instance.pk:
        try:
            old_instance = Proschet.objects.get(pk=instance.pk)
            instance._old_circulation = old_instance.circulation
        except Proschet.DoesNotExist:
            instance._old_circulation = None
    else:
        instance._old_circulation = None


# ============================================================================
# ИСПРАВЛЕНИЕ: Сигнал update_print_components_on_circulation_change
# полностью закомментирован, потому что он дублирует массовый пересчёт,
# который выполняется из print_components.js при событии productCirculationSaved.
# Оставляем только логирование (если нужно), но не обновляем цены компонентов.
# ============================================================================
# @receiver(post_save, sender=Proschet)
# def update_print_components_on_circulation_change(sender, instance, created, **kwargs):
#     """
#     При изменении тиража в просчёте автоматически обновляем цены во всех связанных компонентах печати.
#     !!! ЭТОТ СИГНАЛ ОТКЛЮЧЁН, чтобы избежать двойного пересчёта !!!
#     """
#     # Если тираж изменился (или это новый просчёт с тиражом)
#     if not created and hasattr(instance, '_old_circulation'):
#         old_circulation = instance._old_circulation
#         new_circulation = instance.circulation
#         
#         if old_circulation != new_circulation and new_circulation is not None:
#             print(f"🔄 Тираж просчёта {instance.number} изменился: {old_circulation} → {new_circulation}")
#             
#             # Получаем все компоненты печати, связанные с этим просчётом
#             components = PrintComponent.objects.filter(
#                 proschet=instance, 
#                 printer__isnull=False,
#                 is_deleted=False
#             )
#             
#             updated_count = 0
#             for component in components:
#                 if component.printer:
#                     try:
#                         calculated_price = calculate_price_for_printer_and_copies(
#                             component.printer, 
#                             new_circulation
#                         )
#                         if component.price_per_sheet != calculated_price:
#                             component.price_per_sheet = calculated_price
#                             component.is_price_calculated = True
#                             component.save(update_fields=['price_per_sheet', 'is_price_calculated'])
#                             updated_count += 1
#                             print(f"  ✅ Обновлена цена для компонента {component.number}: {calculated_price} руб./лист")
#                     except Exception as e:
#                         print(f"  ❌ Ошибка при обновлении компонента {component.number}: {str(e)}")
#             
#             print(f"✅ Обновлено {updated_count} компонентов печати")
#     
#     elif created and instance.circulation is not None:
#         print(f"📝 Создан новый просчёт {instance.number} с тиражом {instance.circulation}")


# Сигнал для логирования создания/обновления компонентов – оставляем без изменений
@receiver(post_save, sender=PrintComponent)
def print_component_post_save(sender, instance, created, **kwargs):
    """
    Логирование создания/обновления компонента печати.
    """
    if created:
        print(f"📄 Создан компонент печати {instance.number} для просчёта {instance.proschet.number}")
    else:
        print(f"✏️ Обновлен компонент печати {instance.number}")