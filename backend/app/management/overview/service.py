"""Read-only environment fallback and writable management snapshot."""
from app.label_intake.policy import Policy, load_policy
from app.label_intake.results import IntakeAdmissionError
from ..models import Document
from ..presentation import public_document

def empty_document():
    return Document(policy=Policy(revision='UNCONFIGURED', sources=(), targets=(), audit=()))



def read_snapshot(store):
    if store is not None:
        document = store.read()
        return {'writable': True, 'policy_origin': 'management', 'document': public_document(document)}
    document = empty_document()
    origin = 'unconfigured'
    try:
        document.policy = load_policy()
        origin = 'environment'
    except IntakeAdmissionError:
        pass
    return {'writable': False, 'policy_origin': origin, 'document': public_document(document)}
