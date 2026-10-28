"""Public management projections: stored key digests never leave the server."""
from app.label_intake.policy import credential_digest


def public_source(source):
    value = source.model_dump(mode='json', exclude={'access_key'})
    key = source.access_key
    value['access_key'] = None if key is None else key.model_dump(mode='json', exclude={'sha256', 'ciphertext'})
    if key is not None:
        value['access_key']['reveal_available'] = key.state == 'active' and bool(key.ciphertext)
    status = 'missing'
    if key:
        status = key.state
    elif credential_digest(source):
        status = 'legacy'
    value['key_status'] = status
    return value


def public_document(document):
    value = document.model_dump(mode='json', exclude={'policy': {'sources'}, 'sap_rfc': True})
    value['sap_rfc'] = public_sap(document.sap_rfc)
    value['policy']['sources'] = [public_source(source) for source in document.policy.sources if not source.deleted]
    return value


def public_sap(configuration):
    value = configuration.model_dump(mode='json', exclude={'connections': {'__all__': {'password_ciphertext'}}})
    for item, stored in zip(value['connections'], configuration.connections):
        item['password_configured'] = bool(stored.password_ciphertext)
        item['status'] = 'not_verified'
    for item in value['operations']:
        item['status'] = 'draft' if not item['enabled'] else 'not_verified'
    return value
