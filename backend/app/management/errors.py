"""Shared management failures and bounded HTTP error responses."""
from fastapi.responses import JSONResponse
from app.observability import current_request_id

class ManagementError(RuntimeError):
    def __init__(self, code='management_unavailable', status=503):
        self.code, self.status = code, status
        super().__init__(code)



MESSAGES = {
    'sap_execution_not_allowed': 'This SAP target or RFC is not enabled for execution on the server.',
    'sap_configuration_disabled': 'Enable the SAP connection and RFC operation before fetching data.',
    'sap_password_required': 'Save the SAP account password in SAP Connections before fetching data.',
    'sap_target_mismatch': 'The SAP logon client does not match the configured target.',
    'sap_logon_failed': 'SAP logon failed. Check the username, password and client in SAP Connections.',
    'sap_communication_failed': 'SAP communication failed. No automatic retry was made.',
    'sap_function_failed': 'The SAP RFC call failed. No automatic retry was made.',
    'sap_timeout': 'SAP did not respond within 30 seconds. No automatic retry was made.',
    'sap_busy': 'SAP request capacity is busy. Wait for the running request to finish.',

    'sap_input_required': 'Fill every required RFC input. Placeholder examples are not submitted.',
    'sap_input_invalid': 'RFC inputs do not match the configured names or data types. Check operator inputs and constants.',
    'sap_status_failed': 'The RFC status does not indicate success. Check the configured status parameter and success value.',
    'sap_response_invalid': 'RFC response does not match the configured JSON or result fields. Check the response format and label data.',

    'sap_connection_not_found': 'SAP connection is not configured.',
    'sap_connection_in_use': 'Remove or reassign the RFC operations before deleting this SAP connection.',
    'sap_operation_not_found': 'RFC operation is not configured. Refresh the list.',
    'sap_contract_invalid': 'Sample does not match the configured inputs or response mapping. Check required fields, types and result path.',
    'sap_runtime_unavailable': 'SAP RFC connector is unavailable. Check server configuration and the native runtime.',

    'activity_unavailable': 'Activity storage is unavailable. Check provisioning and server configuration.',
    'printer_not_found': 'Printer no longer exists. Refresh the list.',
    'printer_in_use': 'This printer is assigned to integration sources. Change or remove their print destination before deleting it.',
    'source_exists': 'This source identity is already used. Choose another identity.',
    'key_not_recoverable': 'This key cannot be displayed. Replace it once to enable viewing and copying.',
    'key_encryption_unavailable': 'The server encryption key is not configured. Contact the server administrator.',
    'key_decryption_failed': 'The access key could not be decrypted. Check the server encryption configuration.',
    'access_key_required': 'Create an access key before enabling this source.',
    'access_key_exists': 'This source already has an access key. Use Replace key.',
    'access_key_duplicate': 'This access key is already assigned to another source.',
    'legacy_key_unavailable': 'The previous server key is unavailable. Create a new access key.',
    'source_not_found': 'Source no longer exists. Refresh the list.',
    'invalid_print_route': 'Use explicit permitted printer IDs; a default printer is not supported.',
    'management_unavailable': 'Management storage is unavailable. Provision the management schema before enabling changes.',
    'management_conflict': 'Configuration changed. Refresh before submitting again.',
    'management_local_only': 'Application Management is available on loopback during development.',
    'credential_not_configured': 'A unique sender credential must be provisioned on the server before saving this source.',
    'invalid_approval': 'Choose an enabled print source and printer permitted for this exact label version.',
    'review_conflict': 'The review status changed or this version already has a pending review.',
    'review_not_found': 'The review no longer exists.',
    'layout_changed': 'The stored template changed. Refresh before saving again.',
    'template_not_found': 'Template no longer exists. Refresh the list.',
    'template_conflict': 'Template changed or the label code is already used. Refresh and choose a unique code.',
    'management_capacity': 'Management history reached its capacity. Review retention before adding records.',
}


def management_exception(request, exc):
    return JSONResponse(status_code=exc.status, content={'detail': {'code': exc.code,
        'message': MESSAGES.get(exc.code, MESSAGES['management_unavailable'])}, 'request_id': current_request_id()})
