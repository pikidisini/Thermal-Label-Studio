"""Request-local, allowlisted activity metadata; never retain business values."""
from contextvars import ContextVar
from datetime import datetime, timezone
from time import monotonic
from app.label_intake.results import MESSAGES

current_activity = ContextVar('activity', default=None)
STAGES = frozenset({'REQUEST_RECEIVED', 'REQUEST_COMPLETED', 'REQUEST_FAILED', 'RECEIVED',
    'RESOLVING_LAYOUT', 'BINDING_TEMPLATE', 'BOUND', 'RASTERIZING', 'RASTERIZED', 'PREPARED',
    'FETCH_DATA', 'VALIDATE_DATA', 'RESOLVE_LAYOUT', 'BIND_TEMPLATE', 'RASTERIZE',
    'ENCODE_IPL', 'DECODE_IPL', 'ACCEPT_PREVIEW', 'CHECKING_STATUS', 'STATUS_CHECKED',
    'PREVIEWED', 'FAILED_BEFORE_SEND', 'NOT_ATTEMPTED', 'CAPTURED', 'SIMULATED', 'SEND_CLAIMED', 'SUBMITTING', 'SUBMITTED', 'UNCERTAIN', 'FAILED', 'SKIPPED', 'REPLAY'})
ERROR_CODES = frozenset(MESSAGES) | {'invalid_editor_layout', 'editor_preview_failed',
    'invalid_print_layout', 'print_preparation_failed', 'print_submission_uncertain',
    'invalid_print_copies', 'invalid_printer_target', 'printer_unavailable', 'invalid_template_or_facts',
    'preview_busy', 'print_busy', 'preview_expired', 'printer_configuration_changed',
    'invalid_print_artifact', 'invalid_print_payload', 'print_package_too_large', 'preview_local_only',
    'batch_not_found', 'binding_failed', 'renderer_unavailable', 'preview_failed',
    'layout_not_found', 'layout_unavailable', 'management_conflict', 'management_unavailable',
    'dataset_required', 'dataset_not_found', 'dataset_persistence_unavailable', 'invalid_dataset',
    'invalid_sap_request', 'invalid_batches', 'sap_operation_required', 'sap_operation_not_found',
    'sap_label_contract_required', 'sap_status_failed', 'sap_response_invalid', 'sap_timeout',
    'sap_execution_not_allowed', 'sap_runtime_unavailable', 'sap_logon_failed', 'sap_function_failed',
    'sap_configuration_disabled', 'sap_password_required', 'key_decryption_failed',
    'sap_input_required', 'sap_input_invalid', 'sap_busy', 'sap_communication_failed', 'sap_target_mismatch'}


def stage(name, *, item_index=None, error_code=None):
    activity = current_activity.get()
    if activity is None or name not in STAGES:
        return
    if len(activity['events']) >= 1024:
        activity['events_truncated'] = True
        return
    event = {'event': name, 'at': datetime.now(timezone.utc).isoformat(), 'elapsed_ms': round((monotonic() - activity['started']) * 1000, 2)}
    item_index = item_index if item_index is not None else activity.get('item_index')
    if type(item_index) is int and 0 <= item_index < 100:
        event['item_index'] = item_index
    if error_code in ERROR_CODES:
        event['error_code'] = error_code
    activity['events'].append(event)


def select_item(index):
    activity = current_activity.get()
    if activity is not None:
        activity['item_index'] = index


def studio_identity(request):
    activity = current_activity.get()
    if activity is not None:
        activity['operation'] = getattr(request, 'purpose', 'print')
        activity['copies'] = request.copies
        if getattr(request, 'target', None) is not None:
            activity['target'] = {'host': request.target.host, 'port': request.target.port}


def intake_identity(request, admission):
    activity = current_activity.get()
    if activity is not None:
        activity.update(source=admission.source.identity, external_request_id=request.request_id,
                        mode=request.mode, policy_revision=admission.policy.revision)


def intake_outcome(result):
    activity = current_activity.get()
    if activity is None:
        return
    activity.update(status=result.status, replayed=result.replayed,
                    original_trace_id=result.original_trace_id,
                    summary=result.summary.model_dump())
    activity.pop('item_index', None)
    if result.replayed:
        stage('REPLAY')
    items = []
    for item in result.results:
        value = {key: getattr(item, key) for key in ('item_index', 'label_code', 'copies', 'status')}
        value['template'] = item.template.model_dump() if item.template else None
        if item.error:
            value['error'] = {'code': item.error.code, 'stage': item.error.stage}
        if result.mode == 'print':
            value.update(target_id=item.target_id, confirmed=item.confirmed)
        elif item.simulation:
            value.update(payload_bytes=item.simulation.payload_bytes,
                         payload_sha256=item.simulation.payload_sha256)
        items.append(value)
    activity['items'] = items
    for item in items:
        stage(item['status'], item_index=item['item_index'],
              error_code=item.get('error', {}).get('code'))
    activity.pop('item_index', None)


def studio_outcome(result):
    activity = current_activity.get()
    if activity is None:
        return
    activity.update(status='SUBMITTED' if activity['mode'] == 'print' else 'SIMULATED',
                    template_sha256=result.template_sha256,
                    width_px=result.width_px, height_px=result.height_px, dpi=result.dpi)
    if activity['mode'] == 'print':
        activity.update(copies=result.copies, payload_bytes=result.payload_bytes,
                        confirmed=False, target={'host': result.target.host, 'port': result.target.port})


def label_print_identity(*, operation, count=None, source=None, target_id=None, copies=None):
    """Explicit projection: never inspect request bodies, batch values or artifacts."""
    activity = current_activity.get()
    if activity is None:
        return
    activity['operation'] = operation
    if count is not None: activity['item_count'] = count
    if source in ('sap', 'dataset', 'fixture'): activity['data_source'] = source
    if target_id is not None: activity['target_id'] = target_id
    if copies is not None: activity['copies'] = copies


def label_preview_outcome(items):
    activity = current_activity.get()
    if activity is None:
        return
    safe = []
    for item in items:
        value = {'item_index': item.index, 'status': 'NOT_ATTEMPTED' if item.not_attempted else item.status}
        if item.error_code in ERROR_CODES: value['error_code'] = item.error_code
        if item.failed_stage: value['failed_stage'] = item.failed_stage
        safe.append(value)
    ready = sum(item['status'] == 'PREVIEWED' for item in safe)
    status = 'FAILED'
    if ready == len(safe):
        status = 'PREVIEWED'
    elif ready:
        status = 'PARTIAL'
    activity.update(status=status,
                    summary={'total': len(safe), 'ready': ready, 'failed': sum((item['status'] == 'FAILED' for item in safe)), 'not_attempted': sum((item['status'] == 'NOT_ATTEMPTED' for item in safe))}, items=safe)
    for item in safe:
        stage(item['status'], item_index=item['item_index'], error_code=item.get('error_code'))


def label_delivery_outcome(items):
    activity = current_activity.get()
    if activity is None:
        return
    safe = [{'item_index': item['index'], 'status': item['status']} for item in items]
    status = 'STOPPED'
    if all(item['status'] == 'SUBMITTED' for item in safe):
        status = 'SUBMITTED'
    elif any(item['status'] == 'UNCERTAIN' for item in safe):
        status = 'UNCERTAIN'
    activity.update(status=status,
                    confirmed=False, items=safe)
    for item in safe: stage(item['status'], item_index=item['item_index'])


def label_status_outcome(result):
    activity = current_activity.get()
    if activity is None:
        return
    # Only the trusted probe's fixed enums are recorded, never raw device text.
    states = {'RESPONDING', 'ATTENTION', 'UNREACHABLE', 'UNAVAILABLE'}
    if result['state'] in states:
        activity.update(status='CHECKED', printer_state=result['state'], confirmed=False)
        reasons = {'ready_or_printing', 'buffer_full', 'paused_offline_or_buffer_full',
                   'printhead_test_failed', 'label_path_open_or_ribbon_fault', 'media_out',
                   'printhead_hot', 'takeup_reel_full', 'label_at_strip_pin', 'rfid_write_error',
                   'rfid_read_error', 'rfid_write_ok', 'connection_failed', 'no_status_response',
                   'unrecognized_response'}
        if result.get('reason') in reasons: activity['printer_reason'] = result['reason']
    stage('STATUS_CHECKED')
