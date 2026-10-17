"""Ownership gates for management composition, without operational storage."""
import ast
from pathlib import Path
import subprocess
import sys

from fastapi import FastAPI
from app.management.router import router
from app.management.overview.http import router as overview_router
from app.management.templates.http import router as templates_router
from app.management.printers.http import router as printers_router
from app.management.integrations.http import router as integrations_router
from app.management.integrations.sap_http import router as sap_router
from app.management.audit.http import router as audit_router
from app.management.activity.http import router as activity_router


def test_management_routes_are_owned_by_their_features():
    expected = {
        ('GET', '/management/snapshot'): 'overview',
        ('GET', '/management/audit'): 'audit',
        ('GET', '/management/activity'): 'activity',
        ('PUT', '/management/printers'): 'printers',
        ('DELETE', '/management/printers/{target_id}'): 'printers',
        ('PUT', '/management/sap-connections'): 'integrations',
        ('DELETE', '/management/sap-connections/{identity}'): 'integrations',
        ('PUT', '/management/sap-operations'): 'integrations',
        ('DELETE', '/management/sap-operations/{identity}'): 'integrations',
        ('POST', '/management/sap-operations/{identity}/sample'): 'integrations',
        ('GET', '/management/sap-operations'): 'integrations',
        ('POST', '/management/sap-operations/{identity}/execute'): 'integrations',
        ('PUT', '/management/sources'): 'integrations',
        ('DELETE', '/management/sources/{identity}'): 'integrations',
        ('POST', '/management/sources/{identity}/key'): 'integrations',
        ('POST', '/management/templates/{label_code}'): 'templates',
    }
    actual = {(method, '/management' + route.path): route.endpoint.__module__
              for feature_router in (overview_router, templates_router, printers_router,
                                     integrations_router, sap_router, audit_router, activity_router)
              for route in feature_router.routes for method in route.methods}
    assert actual == {key: (f'app.management.{feature}.sap_http' if key[1].startswith('/management/sap-') else f'app.management.{feature}.http')
                      for key, feature in expected.items()}
    application = FastAPI()
    application.include_router(router)
    mounted = {(method.upper(), path) for path, operations in application.openapi()['paths'].items()
               for method in operations}
    assert mounted == set(expected)


def test_intake_management_boundary_does_not_load_http_composition():
    result = subprocess.run(
        [sys.executable, '-B', '-c',
         'from app.management import configured_store, ManagementError; '
         'import sys; '
         'assert "app.management.router" not in sys.modules; '
         'assert not any(name.startswith("app.management.") and '
         'name.endswith(".http") for name in sys.modules)'],
        capture_output=True, text=True, timeout=15,
    )
    assert result.returncode == 0, result.stderr


def test_feature_rules_do_not_own_database_or_transport():
    root = Path(__file__).resolve().parents[1] / 'app' / 'management'
    for feature in ('templates', 'printers', 'integrations'):
        tree = ast.parse((root / feature / 'service.py').read_text())
        imports = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom):
                imports.append(node.module or '')
        assert not any(name.startswith(('psycopg', 'socket', 'app.printing'))
                       or name in ('store', 'http') for name in imports)
