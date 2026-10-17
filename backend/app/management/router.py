"""Composition root for feature-owned management endpoints."""
from fastapi import APIRouter
from .overview.http import router as overview_router
from .templates.http import router as templates_router
from .printers.http import router as printers_router
from .integrations.http import router as integrations_router
from .integrations.sap_http import router as sap_router
from .audit.http import router as audit_router
from .activity.http import router as activity_router

router = APIRouter(prefix='/management', tags=['Application Management'])
for feature_router in (overview_router, templates_router, printers_router, integrations_router, sap_router, audit_router, activity_router):
    router.include_router(feature_router)
