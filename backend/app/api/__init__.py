"""
API Routes Package.
"""

from .routes_templates import router as templates_router
from .routes_render import router as render_router
from .routes_print import router as print_router
from .routes_inspect import router as inspect_router
from .routes_sap import router as sap_router

__all__ = ["templates_router", "render_router", "print_router", "inspect_router", "sap_router"]
