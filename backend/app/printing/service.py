"""Print sink consumes prepared bytes once through an injected transport."""
from dataclasses import dataclass, field
from typing import Literal, Protocol
from app.engine.output import PreparedOutput

class PrintInputError(ValueError):
    """Invalid prepared output; no submission attempted."""

class PrintSubmissionError(RuntimeError):
    """Submission failed or is uncertain; no retry or delivery confirmation."""

class BitmapTransport(Protocol):
    def submit(self, payload: bytes) -> None:
        """Return on local acceptance; never establish device delivery."""

@dataclass(frozen=True)
class PrintSubmission:
    output: PreparedOutput
    status: Literal["SUBMITTED"] = field(default="SUBMITTED", init=False)
    confirmed: Literal[False] = field(default=False, init=False)

def submit_prepared_output(output: PreparedOutput, transport: BitmapTransport) -> PrintSubmission:
    if type(output) is not PreparedOutput or type(output.payload) is not bytes or not output.payload:
        raise PrintInputError("Invalid prepared output.")
    if type(output.copies) is not int or not 1 <= output.copies <= 999:
        raise PrintInputError("Invalid print copies.")
    if output.language != "IPL":
        raise PrintInputError("Unsupported output language.")
    try:
        if transport.submit(output.payload) is not None:
            raise ValueError()
    except Exception:
        raise PrintSubmissionError("Submission failed or is uncertain; delivery is unconfirmed.") from None
    return PrintSubmission(output)
