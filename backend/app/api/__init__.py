"""
API Routes Package.
"""

from .routes_templates import router as templates_router
from .routes_render import router as render_router
from .routes_print import router as print_router
from .routes_inspect import router as inspect_router
from .routes_sap import router as sap_router
from .routes_print_agent import router as print_agent_router
from .routes_safe_demo import safe_demo_router
from .routes_sap_shadow import simulation_router
from .routes_auth import auth_router

__all__ = [
    "auth_router",
    "templates_router",
    "render_router",
    "print_router",
    "inspect_router",
    "sap_router",
    "print_agent_router",
    "safe_demo_router",
    "simulation_router",
]
