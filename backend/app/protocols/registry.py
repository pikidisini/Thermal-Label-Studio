"""Fail-closed selection of implemented output languages."""
from app.protocols.ipl.encoder import encode_png
from app.protocols.ipl.decoder import decode_png

class UnsupportedLanguageError(ValueError):
    """The selected language has no implemented codec."""

def codec_for(language: str):
    if language != "IPL":
        raise UnsupportedLanguageError("Unsupported output language.")
    return encode_png, decode_png
