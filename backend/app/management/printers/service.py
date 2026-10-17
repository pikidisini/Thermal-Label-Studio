"""Printer policy changes; no printer transport."""
from ..errors import ManagementError

def upsert_target(document, target):
    targets = list(document.policy.targets)
    position = next((i for i, item in enumerate(targets) if item.target_id == target.target_id), None)
    if position is None:
        targets.append(target)
    else:
        targets[position] = target
    document.policy = document.policy.model_copy(update={'targets': tuple(targets)})



def delete_target(document, target_id):
    if not any(target.target_id == target_id for target in document.policy.targets):
        raise ManagementError('printer_not_found', 404)
    if any(not source.deleted and (source.print_target_id == target_id or target_id in source.allowed_print_target_ids) for source in document.policy.sources):
        raise ManagementError('printer_in_use', 422)
    document.policy = document.policy.model_copy(update={
        'targets': tuple(target for target in document.policy.targets if target.target_id != target_id),
    })
