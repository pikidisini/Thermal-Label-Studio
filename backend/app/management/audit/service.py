"""Object-scoped before/after views and audit history reads."""
from ..presentation import public_source, public_sap

def audit_view(document, action, object_id):
    """Record only the changed object, not an ever-growing copy of all history."""
    if action.startswith('sap.'):
        kind = 'connections' if action.startswith('sap.connection.') else 'operations'
        identity = 'connection_id' if kind == 'connections' else 'operation_id'
        return next((item for item in public_sap(document.sap_rfc)[kind] if item[identity] == object_id), None)
    if action.startswith('printer.'):
        item = next((p for p in document.policy.targets if p.target_id == object_id), None)
        return None if item is None else item.model_dump(mode='json')
    if action.startswith('source.'):
        item = next((s for s in document.policy.sources if s.identity == object_id), None)
        return None if item is None else public_source(item)
    review = next((r for r in reversed(document.reviews) if
                   (r.label_code == object_id if action == 'review.submit' else r.review_id == object_id)), None)
    if review is None:
        return None
    grant = next((e for e in reversed(document.policy.audit) if e.label_code == review.label_code and
                  e.version == review.version and e.svg_sha256 == review.svg_sha256), None)
    return {'review': review.model_dump(mode='json'), 'grant': None if grant is None else grant.model_dump(mode='json')}



def read_audit(store):
    return [] if store is None else store.audit()
