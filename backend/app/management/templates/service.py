"""Template review and exact-version print approval decisions."""
from app.auth.service import actor_id
from datetime import datetime, timezone
from uuid import uuid4
from app.label_intake.policy import ApprovalEvent
from ..errors import ManagementError
from .records import Review

def update_template_references(document, command):
    """Keep configured source references current, retaining historical approval evidence."""
    sources = []
    for source in document.policy.sources:
        codes = tuple(dict.fromkeys(
            command.new_code if code == command.label_code else code
            for code in source.label_codes
            if not (command.action == 'delete' and code == command.label_code)))
        sources.append(source.model_copy(update={'label_codes': codes}))
    document.policy = document.policy.model_copy(update={'sources': tuple(sources)})

def submit_review(document, command):
    if any(item.label_code == command.label_code and item.version == command.version and
           item.svg_sha256 == command.svg_sha256 and item.status in ('Pending review', 'Approved') for item in document.reviews):
        raise ManagementError('review_conflict', 409)
    document.reviews.append(Review(review_id=uuid4().hex, label_code=command.label_code,
        version=command.version, svg_sha256=command.svg_sha256, status='Pending review',
        note=command.note, at=datetime.now(timezone.utc)))



def decide_review(document, review_id, command):
    review = next((item for item in document.reviews if item.review_id == review_id), None)
    if review is None:
        raise ManagementError('review_not_found', 404)
    expected = 'Approved' if command.action == 'revoke' else 'Pending review'
    if review.status != expected:
        raise ManagementError('review_conflict', 409)
    if command.action == 'reject':
        review.status, review.note = 'Rejected', command.note
        return
    source = next((item for item in document.policy.sources if item.identity == command.sender), None)
    target = next((item for item in document.policy.targets if item.target_id == command.target_id), None)
    if source is None or target is None:
        raise ManagementError('invalid_approval', 422)
    if command.action == 'approve' and (not source.enabled or not target.enabled or
            'print' not in source.modes or review.label_code not in source.label_codes):
        raise ManagementError('invalid_approval', 422)
    if command.action == 'revoke':
        # Revoke the grant actually issued for this review; request cannot redirect it.
        matching = [e for e in document.policy.audit if e.label_code == review.label_code and
                    e.version == review.version and e.svg_sha256 == review.svg_sha256 and e.sender == command.sender]
        if not matching or matching[-1].action != 'approve' or matching[-1].target_id != command.target_id:
            raise ManagementError('invalid_approval', 422)
    event = ApprovalEvent(event_id='E_' + uuid4().hex, actor=actor_id.get() or 'DEVELOPMENT_UNAUTHENTICATED',
        at=datetime.now(timezone.utc), action=command.action, sender=command.sender,
        label_code=review.label_code, version=review.version, svg_sha256=review.svg_sha256,
        target_id=command.target_id, max_copies=command.max_copies)
    document.policy = document.policy.model_copy(update={'audit': (*document.policy.audit, event)})
    review.status = 'Approved' if command.action == 'approve' else 'Revoked'
    review.note = command.note
