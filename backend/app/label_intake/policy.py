"""Immutable server policy and pure print preflight; no storage or device effects."""
from dataclasses import dataclass, field
from datetime import datetime
import hashlib
import hmac
import json
import os
import re
from typing import Literal, Mapping
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.config import PrinterTarget
from .results import IntakeAdmissionError, IntakeRequest, TemplateEvidence, error

ID = r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
CODE = r'^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'


class PolicyModel(BaseModel):
    model_config = ConfigDict(extra='forbid', frozen=True, strict=True)


class AccessKey(PolicyModel):
    key_id: str = Field(pattern=ID)
    state: Literal['active', 'revoked']
    sha256: str | None = Field(default=None, pattern=r'^[0-9a-f]{64}$', repr=False)
    ciphertext: str | None = Field(default=None, max_length=1024, repr=False)
    created_at: datetime
    updated_at: datetime

    @model_validator(mode='after')
    def valid_key(self):
        if ((self.state == 'active') != (self.sha256 is not None)
                or (self.state == 'revoked' and self.ciphertext is not None)
                or self.created_at.utcoffset() is None or self.updated_at.utcoffset() is None
                or self.updated_at < self.created_at):
            raise ValueError('Invalid access key state.')
        return self


class Source(PolicyModel):
    identity: str = Field(pattern=ID)
    async_only: bool = False
    deleted: bool = False
    credential_env: str | None = Field(default=None, pattern=r'^TLS_INTAKE_TOKEN_[A-Z0-9_]{1,80}$')
    access_key: AccessKey | None = Field(default=None, repr=False)
    enabled: bool
    modes: tuple[Literal['simulation', 'print'], ...] = Field(max_length=2)
    # Retained for reading existing policy snapshots; template scope is unrestricted.
    label_codes: tuple[str, ...] = Field(default=(), max_length=1000)
    simulation_all_label_codes: bool = False
    # Legacy persisted metadata only: ignored by routing and rejected on source writes.
    print_target_id: str | None = Field(default=None, pattern=ID)
    allowed_print_target_ids: tuple[str, ...] = Field(default=(), max_length=1000)
    print_max_copies: int = Field(default=1, ge=1, le=999)

    @model_validator(mode='after')
    def unique_permissions(self):
        if self.deleted and (self.enabled or self.access_key is not None or self.credential_env is not None or self.modes):
            raise ValueError('Deleted source cannot retain credentials or permissions.')
        if (len(set(self.modes)) != len(self.modes)
                or len(set(self.allowed_print_target_ids)) != len(self.allowed_print_target_ids)
                or any(not re.fullmatch(ID, target) for target in self.allowed_print_target_ids)
                or len(set(self.label_codes)) != len(self.label_codes)
                or any(not re.fullmatch(CODE, code) for code in self.label_codes)):
            raise ValueError('Invalid source permissions.')
        return self


class Target(PolicyModel):
    target_id: str = Field(pattern=ID)
    host: str = Field(min_length=1, max_length=63)
    port: int = Field(ge=1, le=65535)
    enabled: bool

    @model_validator(mode='after')
    def numeric(self):
        PrinterTarget(self.host, self.port)
        return self


class ApprovalEvent(PolicyModel):
    event_id: str = Field(pattern=ID)
    actor: str = Field(pattern=ID)
    at: datetime
    action: Literal['approve', 'revoke']
    sender: str = Field(pattern=ID)
    label_code: str = Field(pattern=CODE)
    version: int = Field(ge=1)
    svg_sha256: str = Field(pattern=r'^[0-9a-f]{64}$')
    target_id: str = Field(pattern=ID)
    max_copies: int = Field(ge=1, le=999)

    @model_validator(mode='after')
    def timezone(self):
        if self.at.utcoffset() is None:
            raise ValueError('Audit timestamp requires a timezone.')
        return self

    def key(self):
        return self.sender, self.label_code, self.version, self.svg_sha256


class Policy(PolicyModel):
    revision: str = Field(pattern=ID)
    sources: tuple[Source, ...] = Field(max_length=1000)
    targets: tuple[Target, ...] = Field(max_length=1000)
    audit: tuple[ApprovalEvent, ...] = Field(max_length=10000)

    @model_validator(mode='after')
    def registry(self):
        for values in ([s.identity for s in self.sources], [s.credential_env for s in self.sources if s.credential_env],
                       [t.target_id for t in self.targets], [e.event_id for e in self.audit]):
            if len(set(values)) != len(values):
                raise ValueError('Duplicate policy identity.')
        if any(e.sender not in {s.identity for s in self.sources} for e in self.audit):
            raise ValueError('Unknown approval source.')
        if any(a.at > b.at for a, b in zip(self.audit, self.audit[1:])):
            raise ValueError('Audit events must be chronological.')
        return self


@dataclass(frozen=True)
class Admission:
    policy: Policy
    source: Source
    credential_sha256: bytes = field(repr=False)


@dataclass(frozen=True)
class PrintPin:
    sender: str
    label_code: str
    template: TemplateEvidence
    copies: int
    target_id: str
    policy_revision: str
    target: PrinterTarget = field(repr=False)
    requested_target_id: str | None = None


class PolicyDenied(ValueError):
    def __init__(self, code):
        self.detail = error('POLICY', code)
        super().__init__(self.detail.message)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate policy member.')
        result[key] = value
    return result


def load_policy(environment: Mapping[str, str] | None = None) -> Policy:
    """Read only explicitly mapped process config. Never load .env or provision keys."""
    values = os.environ if environment is None else environment
    raw = values.get('TLS_INTAKE_POLICY_JSON', '')
    try:
        if not raw or len(raw.encode('utf-8')) > 1024 * 1024:
            raise ValueError('Missing or oversized policy.')
        # Check duplicates separately; model_validate_json retains strict JSON tuple/datetime semantics.
        json.loads(raw, object_pairs_hook=_unique_object)
        return Policy.model_validate_json(raw)
    except (ValueError, TypeError, RecursionError):
        raise IntakeAdmissionError(503, 'policy_unavailable') from None


def validate_transition(previous: Policy, current: Policy) -> Policy:
    """Retain audit prefix and require a new revision for every policy edit."""
    if (current.audit[:len(previous.audit)] != previous.audit
            or (current != previous and current.revision == previous.revision)):
        raise IntakeAdmissionError(503, 'policy_unavailable')
    return current


def credential_digest(source: Source, environment: Mapping[str, str] | None = None) -> bytes | None:
    """Managed state takes precedence, including revocation: never fall back to env."""
    if source.deleted:
        return None
    if source.access_key is not None:
        return bytes.fromhex(source.access_key.sha256) if source.access_key.sha256 else None
    values = os.environ if environment is None else environment
    secret = values.get(source.credential_env, '') if source.credential_env else ''
    return hashlib.sha256(secret.encode('ascii')).digest() if re.fullmatch(r'[A-Za-z0-9_-]{32,256}', secret) else None


def authenticate(policy: Policy, authorization: str, environment: Mapping[str, str] | None = None) -> Admission:
    values = os.environ if environment is None else environment
    parts = authorization.split(' ')
    if len(parts) != 2 or parts[0].lower() != 'bearer' or not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', parts[1]):
        raise IntakeAdmissionError(401, 'unauthenticated')
    digest = hashlib.sha256(parts[1].encode('ascii')).digest()
    matches = []
    for source in policy.sources:
        expected = credential_digest(source, values)
        if expected is not None and hmac.compare_digest(digest, expected):
            matches.append(source)
    if len(matches) != 1:
        raise IntakeAdmissionError(401, 'unauthenticated')
    source = matches[0]
    if not source.enabled:
        raise IntakeAdmissionError(403, 'sender_not_allowed')
    return Admission(policy, source, digest)


def authorize(admission: Admission, request: IntakeRequest):
    source = admission.source
    if not source.enabled or source.identity != request.sender['system']:
        raise IntakeAdmissionError(403, 'sender_not_allowed')
    if request.mode not in source.modes:
        raise IntakeAdmissionError(403, 'mode_not_allowed')
    try:
        select_print_target(admission, request.target_id)
    except PolicyDenied:
        raise IntakeAdmissionError(403, 'target_not_allowed') from None


def select_print_target(admission: Admission, requested_target_id: str | None = None):
    source = admission.source
    selected = requested_target_id
    permitted = set(source.allowed_print_target_ids)
    if selected not in permitted:
        raise PolicyDenied('target_not_allowed')
    target = next((t for t in admission.policy.targets if t.target_id == selected and t.enabled), None)
    if target is None:
        raise PolicyDenied('target_not_allowed')
    return target


def preflight_print(admission: Admission, label_code: str, template: TemplateEvidence, copies: int,
                    requested_target_id: str | None = None) -> PrintPin:
    """Resolve configured source routing for ALL items before render; no approval workflow."""
    source, policy = admission.source, admission.policy
    if not source.enabled or 'print' not in source.modes:
        raise PolicyDenied('template_not_allowed')
    if type(copies) is not int or not 1 <= copies <= source.print_max_copies:
        raise PolicyDenied('copies_not_allowed')
    target = select_print_target(admission, requested_target_id)
    return PrintPin(source.identity, label_code, template, copies, target.target_id,
                    policy.revision, PrinterTarget(target.host, target.port), requested_target_id)


def revalidate_claim(pin: PrintPin, original: Admission, current: Policy,
                     environment: Mapping[str, str] | None = None) -> PrintPin:
    """T10 must call immediately BEFORE ledger.claim_send, never after socket creation."""
    values = os.environ if environment is None else environment
    source = next((s for s in current.sources if s.identity == pin.sender), None)
    if source is None or not source.enabled:
        raise PolicyDenied('template_not_allowed')
    expected = credential_digest(source, values)
    if expected is None or not hmac.compare_digest(original.credential_sha256, expected):
        raise PolicyDenied('template_not_allowed')
    checked = preflight_print(Admission(current, source, original.credential_sha256),
                              pin.label_code, pin.template, pin.copies, pin.requested_target_id)
    if (pin.sender != original.source.identity or checked.policy_revision != pin.policy_revision
            or checked.target_id != pin.target_id or checked.target != pin.target):
        raise PolicyDenied('target_not_allowed')
    return checked
