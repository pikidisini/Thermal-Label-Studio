"""Template metadata admission; binding/raster/sinks are later consumers."""
from .models import BindingSpec, TemplateManifest, TemplateAdmissionError
from .validation import admit_template
from .service import bind_template, bind_text_template, BoundTemplate, BoundMedia
from .symbols import SymbolEvidence
from .composition import BindingError
from .text import FontProfile
__all__ = ['BindingSpec', 'TemplateManifest', 'TemplateAdmissionError', 'admit_template', 'bind_template', 'bind_text_template', 'BoundTemplate', 'BoundMedia', 'BindingError', 'FontProfile', 'SymbolEvidence']
