"""Bounded local fixture preview through the shared binding/codec pipeline."""
import base64
import hashlib
import ipaddress
from threading import Lock
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from app.config import PrinterTarget
from app.printing.http import print_transport_factory
from app.printing.service import PrintBeforeSendError
from .delivery import wire_payload
from pydantic import BaseModel, ConfigDict, Field
from app.engine.editor_request import EditorOutputRequest
from app.engine.pipeline import prepare_draft_output
from app.simulation.service import simulate_prepared_output
from app.template_binding.models import TemplateAdmissionError
from app.template_binding.composition import BindingError
from app.engine.raster import RasterError
from app.protocols.ipl.errors import IplError
from .fixtures import BATCHES, LABEL_CODE, TEMPLATE, TEMPLATE_VERSION
from app.studio_datasets.service import DatasetPersistenceError, DatasetNotFoundError
from app.layouts.service import LayoutPersistenceError, LayoutNotFoundError, LayoutArtifactError
from app.label_data import validate_payload
from app.management import configured_store, read_snapshot, execute_operation, ManagementError
from .diagnostics import PreviewStep, Progress, StageName
from .artifacts import artifacts
from app.activity.context import (label_print_identity, label_preview_outcome,
                                  label_delivery_outcome, label_status_outcome,
                                  select_item, stage)

router = APIRouter()
_preview_lock = Lock()

class BatchPreviewRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    source: Literal['fixture', 'dataset', 'sap']
    operation_id: str | None = Field(default=None, pattern=r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
    revision: str | None = Field(default=None, min_length=1, max_length=128)
    batch_parameter: str | None = Field(default=None, pattern=r'^[A-Za-z_][A-Za-z0-9_]{0,29}$')
    dataset_id: str | None = Field(default=None, pattern=r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
    encoder: Literal['IPL']
    batches: list[str] = Field(min_length=1, max_length=100)

class PreviewItem(BaseModel):
    index: int
    batch: str
    status: Literal['PREVIEWED', 'FAILED']
    label_code: str | None = None
    template_version: str | None = None
    template_sha256: str | None = None
    payload_sha256: str | None = None
    width_px: int | None = None
    height_px: int | None = None
    dpi: float | None = None
    png_base64: str | None = None
    error_code: str | None = None
    failed_stage: StageName | None = None
    steps: list[PreviewStep] = Field(default_factory=list)
    not_attempted: bool = False
    print_artifact: str | None = None

class BatchPreviewResponse(BaseModel):
    source: Literal['fixture', 'dataset', 'sap'] = 'fixture'
    operation_id: str | None = None
    operation_revision: str | None = None
    dataset_updated_at: str | None = None
    encoder: Literal['IPL'] = 'IPL'
    items: list[PreviewItem]

def local_preview_access(request: Request):
    from app.management.access import local_access
    local_access(request)

@router.get('/label-print/printers')
def configured_printers(request: Request):
    """Configuration only. Never probe a printer or imply agent readiness."""
    local_preview_access(request)
    snapshot = read_snapshot(configured_store(request))
    targets = snapshot['document']['policy']['targets']
    return {'policy_origin': snapshot['policy_origin'], 'printers': [
        {'target_id': target['target_id'], 'host': target['host'], 'port': target['port'],
         'enabled': target['enabled'], 'language': 'IPL', 'connection': 'Ethernet', 'transport': 'TCP/RAW'}
        for target in targets
    ]}

@router.post('/label-print/preview', response_model=BatchPreviewResponse)
def preview_batches(body: BatchPreviewRequest, request: Request, response: Response):
    response.headers['Cache-Control'] = 'no-store'
    local_preview_access(request)
    label_print_identity(operation='preview', count=len(body.batches), source=body.source)
    dataset = None
    layouts = None
    if body.source == 'sap':
        if not body.operation_id or not body.revision or not body.batch_parameter or body.dataset_id is not None:
            raise HTTPException(422, detail={'code': 'sap_operation_required'})
        store = configured_store(request)
        if store is None: raise HTTPException(503, detail={'code': 'management_unavailable'})
        document = store.read()
        if document.policy.revision != body.revision: raise HTTPException(409, detail={'code': 'management_conflict'})
        operation = next((entry for entry in document.sap_rfc.operations if entry.operation_id == body.operation_id), None)
        if operation is None: raise HTTPException(404, detail={'code': 'sap_operation_not_found'})
        parameters = [p for p in operation.parameters if p.source == 'operator']
        if operation.response_mode != 'label_json' or len(parameters) != 1 or parameters[0].name != body.batch_parameter or parameters[0].kind != 'string':
            raise HTTPException(422, detail={'code': 'sap_label_contract_required'})
        layouts = getattr(request.app.state, 'layout_service', None)
        if layouts is None: raise HTTPException(503, detail={'code': 'layout_unavailable'})
    elif any(value is not None for value in (body.operation_id, body.revision, body.batch_parameter)):
        raise HTTPException(422, detail={'code': 'invalid_sap_request'})
    if body.source == 'dataset':
        datasets = getattr(request.app.state, 'studio_dataset_service', None)
        layouts = getattr(request.app.state, 'layout_service', None)
        if body.dataset_id is None: raise HTTPException(422, detail={'code': 'dataset_required'})
        if datasets is None or layouts is None: raise HTTPException(503, detail={'code': 'dataset_persistence_unavailable'})
        try:
            dataset = datasets.get(UUID(body.dataset_id))
            validate_payload(dataset['payload'])
        except DatasetNotFoundError:
            raise HTTPException(404, detail={'code': 'dataset_not_found'}) from None
        except (DatasetPersistenceError, ValueError):
            raise HTTPException(503, detail={'code': 'dataset_persistence_unavailable'}) from None
    elif body.dataset_id is not None:
        raise HTTPException(422, detail={'code': 'invalid_dataset'})
    if any(not 1 <= len(batch) <= 64 or batch != batch.strip()
           or any(ord(char) < 33 or ord(char) > 126 for char in batch) for batch in body.batches):
        raise HTTPException(422, detail={'code': 'invalid_batches'})
    if not _preview_lock.acquire(blocking=False):
        raise HTTPException(429, detail={'code': 'preview_busy'})
    try:
        items = []
        sap_blocked = None
        data_items = {entry['item_id']: entry for entry in dataset['payload']['items']} if dataset else {}
        pinned = {}
        prepared_items = {}
        for index, batch in enumerate(body.batches):
            select_item(index)
            stage('FETCH_DATA')
            progress = Progress()
            item = PreviewItem(index=index, batch=batch, status='FAILED', steps=progress.steps)
            if sap_blocked:
                item.error_code = sap_blocked
                item.not_attempted = True
                items.append(item)
                continue
            if body.source != 'sap' and batch not in (data_items if dataset else BATCHES):
                item.error_code = 'batch_not_found'
                item.failed_stage = progress.failed()
                items.append(item)
                continue
            try:
                code, version, svg, width, height, dpi = LABEL_CODE, TEMPLATE_VERSION, TEMPLATE, 80, 60, 203.2
                data = {'BATCH': batch, 'MATERIAL': BATCHES.get(batch)}
                if dataset or body.source == 'sap':
                    if body.source == 'sap':
                        result = execute_operation(body.operation_id, body.revision, {body.batch_parameter: batch}, request, on_stage=progress.event)
                        resolved = result.get('items')
                        if not isinstance(resolved, list) or len(resolved) != 1:
                            raise ManagementError('sap_response_invalid', 422)
                        entry = resolved[0]
                    else:
                        entry = data_items[batch]
                        progress.event('FETCHED')
                    code = entry['label_code']
                    item.label_code = code
                    progress.passed('VALIDATE_DATA', 'RESOLVE_LAYOUT')
                    if code not in pinned: pinned[code] = layouts.get_layout(code)
                    layout = pinned[code]
                    version, svg = str(layout.version), layout.svg
                    item.template_version = version
                    width, height, dpi = layout.width_mm, layout.height_mm, layout.dpi
                    data = entry['data']
                else:
                    progress.event('FETCHED')
                    progress.passed('VALIDATE_DATA', 'RESOLVE_LAYOUT')
                item.label_code = code
                item.template_version = version
                item.template_sha256 = hashlib.sha256(svg.encode('utf-8')).hexdigest()
                progress.passed('RESOLVE_LAYOUT', 'BIND_TEMPLATE')
                draft = EditorOutputRequest(
                    draft=dict(svg=svg, width_mm=width, height_mm=height, dpi=dpi, binding_version=1),
                    data=data, encoder='IPL', copies=1,
                )
                bound, prepared = prepare_draft_output(draft, on_stage=progress.event)
                item.template_sha256 = bound.manifest.svg_sha256
                item.payload_sha256 = hashlib.sha256(prepared.payload).hexdigest()
                bitmap = simulate_prepared_output(prepared)
                progress.passed('DECODE_IPL', 'ACCEPT_PREVIEW')
                item.width_px, item.height_px, item.dpi = bitmap.width_px, bitmap.height_px, bitmap.dpi
                item.png_base64 = base64.b64encode(bitmap.bitmap_png).decode('ascii')
                progress.set_status('ACCEPT_PREVIEW', 'PASSED')
                item.status = 'PREVIEWED'
                prepared_items[index] = prepared
            except (BindingError, TemplateAdmissionError):
                item.error_code = 'binding_failed'
            except RasterError:
                item.error_code = 'renderer_unavailable'
            except ManagementError as exc:
                item.error_code = exc.code
                if exc.code in {'management_conflict', 'management_unavailable', 'sap_runtime_unavailable', 'sap_execution_not_allowed', 'sap_logon_failed', 'sap_configuration_disabled', 'sap_password_required', 'key_decryption_failed', 'sap_timeout', 'sap_communication_failed', 'sap_target_mismatch'}:
                    sap_blocked = exc.code
            except LayoutNotFoundError:
                item.error_code = 'layout_not_found'
            except (LayoutPersistenceError, LayoutArtifactError):
                item.error_code = 'layout_unavailable'
            except (IplError, ValueError, RuntimeError):
                item.error_code = 'preview_failed'
            if item.error_code:
                item.failed_stage = progress.failed()
            items.append(item)
        stamp = dataset['updated_at'] if dataset else None
        if sap_blocked == 'management_conflict':
            for item in items:
                if item.status == 'PREVIEWED':
                    item.status = 'FAILED'
                    item.png_base64 = None
                    item.error_code = 'management_conflict'
                    item.failed_stage = 'ACCEPT_PREVIEW'
                    next(step for step in item.steps if step.stage == 'ACCEPT_PREVIEW').status = 'FAILED'
        for item in items:
            if item.status == 'PREVIEWED' and body.source != 'fixture':
                item.print_artifact = artifacts.put(prepared_items[item.index], request.state.auth_user['id'])
        label_preview_outcome(items)
        return BatchPreviewResponse(source=body.source, operation_id=body.operation_id, operation_revision=body.revision, dataset_updated_at=str(stamp) if stamp is not None else None, items=items)
    finally:
        _preview_lock.release()


class PrintPackageRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    artifacts: list[str] = Field(min_length=1, max_length=100)
    copies: int = Field(ge=1, le=999)
    target_id: str = Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')


@router.post('/label-print/print-package')
def print_package(body: PrintPackageRequest, request: Request, response: Response):
    """Prepare local-agent payloads only. This route never submits to a printer."""
    local_preview_access(request)
    response.headers['Cache-Control'] = 'no-store'
    snapshot = read_snapshot(configured_store(request))
    target = next((entry for entry in snapshot['document']['policy']['targets']
                   if entry['target_id'] == body.target_id and entry['enabled']), None)
    if target is None:
        raise HTTPException(409, detail={'code': 'printer_configuration_changed'})
    if any(len(identity) != 43 for identity in body.artifacts):
        raise HTTPException(422, detail={'code': 'invalid_print_artifact'})
    try:
        outputs = artifacts.get_many(body.artifacts, body.copies, request.state.auth_user['id'])
    except KeyError:
        raise HTTPException(410, detail={'code': 'preview_expired'}) from None
    if sum(len(output.payload) for output in outputs) > 12 * 1024 * 1024:
        raise HTTPException(413, detail={'code': 'print_package_too_large'})
    return {'language': 'IPL', 'copies': body.copies, 'target': {'target_id': target['target_id'], 'host': target['host'], 'port': target['port']}, 'items': [
        {'payload_base64': base64.b64encode(output.payload).decode('ascii'),
         'sha256': hashlib.sha256(output.payload).hexdigest()} for output in outputs]}


class ServerPrintRequest(PrintPackageRequest):
    job_id: str = Field(pattern=r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    expected_host: str = Field(min_length=1, max_length=63)
    expected_port: int = Field(ge=1, le=65535)


_server_print_lock = Lock()


@router.post('/label-print/print')
def print_registered_labels(body: ServerPrintRequest, request: Request, response: Response,
                            factory=Depends(print_transport_factory)):
    """Explicit single-attempt LAN delivery using only a registered target."""
    label_print_identity(operation='print', count=len(body.artifacts), target_id=body.target_id, copies=body.copies)
    package = print_package(body, request, response)
    target = package['target']
    if (target['host'], target['port']) != (body.expected_host, body.expected_port):
        raise HTTPException(409, detail={'code': 'printer_configuration_changed'})
    try:
        payloads = [wire_payload(base64.b64decode(item['payload_base64'])) for item in package['items']]
    except ValueError:
        raise HTTPException(422, detail={'code': 'invalid_print_payload'}) from None
    if not _server_print_lock.acquire(blocking=False):
        raise HTTPException(429, detail={'code': 'print_busy'})
    try:
        results = []
        stopped = False
        for index, payload in enumerate(payloads):
            status = 'NOT_ATTEMPTED'
            if not stopped:
                try:
                    transport = factory(PrinterTarget(target['host'], target['port']))
                except Exception:
                    status = 'FAILED_BEFORE_SEND'
                    stopped = True
                else:
                    try:
                        stage('SUBMITTING', item_index=index)
                        transport.submit(payload)
                        status = 'SUBMITTED'
                    except PrintBeforeSendError:
                        status = 'FAILED_BEFORE_SEND'
                        stopped = True
                    except Exception:
                        status = 'UNCERTAIN'
                        stopped = True
            results.append({'index': index, 'status': status})
        label_delivery_outcome(results)
        return {'job_id': str(body.job_id), 'status': 'STOPPED' if stopped else 'SUBMITTED',
                'confirmed': False, 'items': results}
    finally:
        _server_print_lock.release()


class PrinterStatusRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    target_id: str = Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
    expected_host: str = Field(min_length=1, max_length=63)
    expected_port: int = Field(ge=1, le=65535)


def printer_status_probe():
    from .printer_status import query_ipl_status
    return query_ipl_status


@router.post('/label-print/printer-status')
def registered_printer_status(body: PrinterStatusRequest, request: Request, response: Response,
                              probe=Depends(printer_status_probe)):
    local_preview_access(request)
    label_print_identity(operation='printer_status', target_id=body.target_id)
    response.headers['Cache-Control'] = 'no-store'
    snapshot = read_snapshot(configured_store(request))
    target = next((entry for entry in snapshot['document']['policy']['targets']
                   if entry['target_id'] == body.target_id and entry['enabled']), None)
    if target is None or (target['host'], target['port']) != (body.expected_host, body.expected_port):
        raise HTTPException(409, detail={'code': 'printer_configuration_changed'})
    # Share serialization with LAN printing: do not query during a submission.
    if not _server_print_lock.acquire(blocking=False):
        raise HTTPException(429, detail={'code': 'print_busy'})
    try:
        stage('CHECKING_STATUS')
        result = probe(PrinterTarget(target['host'], target['port']))
        label_status_outcome(result)
        return {**result, 'target_id': target['target_id'], 'host': target['host'], 'port': target['port']}
    finally:
        _server_print_lock.release()


@router.get('/label-print/operations')
def operator_operations(request: Request):
    from app.management.integrations.sap_http import operation_catalog
    return operation_catalog(request)
