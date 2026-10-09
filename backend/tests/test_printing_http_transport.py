"""Real print wiring uses only injected fakes; no physical/network effects."""
from io import BytesIO
import socket
from PIL import Image
from fastapi.testclient import TestClient
import pytest
from app.config import PrinterTarget, get_settings
from app.engine.bitmap import RenderedLabel
from app.engine.pipeline import prepare_bitmap
from app.main import app
from app.printing import http, transport

REAL_TCP_SUBMIT = transport.TcpRawTransport.submit

SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'
REQUEST = {"svg": SVG, "width_mm": 20., "height_mm": 12., "dpi": 203.2, "encoder": "IPL"}

@pytest.fixture(autouse=True)
def no_printer_network(monkeypatch):
    monkeypatch.setattr(transport.TcpRawTransport, "submit", lambda *a, **k: pytest.fail("Actual printer network attempted"))
    app.dependency_overrides[http.configured_target] = lambda: PrinterTarget("192.0.2.44")
    yield
    app.dependency_overrides.clear()

def output():
    stream = BytesIO()
    Image.new("1", (160, 96), 255).save(stream, format="PNG", dpi=(203.2, 203.2))
    return prepare_bitmap(RenderedLabel("editor", "current", 160, 96, 203.2, stream.getvalue()))

class FakeTransport:
    def __init__(self, failure=None): self.calls = []; self.failure = failure
    def submit(self, payload):
        self.calls.append(payload)
        if self.failure: raise self.failure

@pytest.mark.parametrize("host", ["192.0.2.44", "2001:db8::1", "2001:0db8:0000:0000:0000:0000:0000:0001"])
def test_numeric_target_config(host):
    target = get_settings({"TLS_PRINTER_HOST": host}).printer
    assert target == PrinterTarget(host, 9100)
    assert get_settings({}).printer is None
    assert get_settings({"TLS_PRINTER_HOST": ""}).printer is None

@pytest.mark.parametrize("values", [
    {"TLS_PRINTER_HOST": "printer.local"}, {"TLS_PRINTER_HOST": "192.0.2.4 "},
    {"TLS_PRINTER_HOST": "http://192.0.2.4"}, {"TLS_PRINTER_HOST": "fe80::1%1"},
    {"TLS_PRINTER_HOST": "0.0.0.0"}, {"TLS_PRINTER_HOST": "224.0.0.1"},
    {"TLS_PRINTER_PORT": "0"}, {"TLS_PRINTER_PORT": "65536"}, {"TLS_PRINTER_PORT": " 9100"},
    {"TLS_PRINTER_PORT": "９１００"}, {"TLS_PRINTER_PORT": "tcp"},
])
def test_invalid_server_target(values):
    with pytest.raises(ValueError): get_settings(values)

class FakeSocket:
    def __init__(self, failure=None): self.operations = []; self.closed = False; self.failure = failure
    def __enter__(self): return self
    def __exit__(self, *args): self.closed = True
    def settimeout(self, value): self.operations.append(("timeout", value))
    def connect(self, address):
        self.operations.append(("connect", address))
        if self.failure == "connect": raise TimeoutError("private target")
    def sendall(self, payload):
        self.operations.append(("sendall", payload))
        if self.failure == "send": raise OSError("private target")

@pytest.mark.parametrize("host, family, destination", [
    ("192.0.2.44", socket.AF_INET, ("192.0.2.44", 9100)),
    ("2001:db8::1", socket.AF_INET6, ("2001:db8::1", 9100, 0, 0)),
])
@pytest.mark.parametrize("failure", [None, "connect", "send"])
def test_tcp_exact_bytes_once_timeouts_and_close(monkeypatch, host, family, destination, failure):
    connection = FakeSocket(failure)
    launches = []
    def factory(*args): launches.append(args); return connection
    monkeypatch.setattr(transport.socket, "socket", factory)
    payload = b"<STX>exact bytes<ETX>"
    sender = transport.TcpRawTransport(PrinterTarget(host))
    # Exercise the implementation while socket construction remains an injected fake.
    monkeypatch.setattr(transport.TcpRawTransport, "submit", REAL_TCP_SUBMIT)
    if failure:
        with pytest.raises((OSError, TimeoutError)): sender.submit(payload)
    else: sender.submit(payload)
    assert launches == [(family, socket.SOCK_STREAM)]
    assert connection.operations[:2] == [("timeout", 3), ("connect", destination)]
    if failure != "connect":
        assert connection.operations[2:] == [("timeout", 10), ("sendall", payload)]
        assert connection.operations[-1][1] is payload
    else: assert len(connection.operations) == 2
    assert connection.closed

def test_target_inspection_no_network_and_unconfigured_print_stops_before_raster(monkeypatch):
    app.dependency_overrides[http.configured_target] = lambda: None
    monkeypatch.setattr(http, "prepare_editor_output", lambda *a, **k: pytest.fail("No target rendered"))
    client = TestClient(app)
    response = client.get("/api/v1/printing/target")
    assert response.json() == {"available": False, "host": None, "port": None, "encoder": "IPL"}
    response = client.post("/api/v1/printing/editor", json=REQUEST)
    assert response.status_code == 503 and response.json()["detail"]["code"] == "printer_unavailable"

def test_configured_target_get_does_not_probe():
    app.dependency_overrides[http.configured_target] = lambda: PrinterTarget("192.0.2.44")
    assert TestClient(app).get("/api/v1/printing/target").json() == {"available": True, "host": "192.0.2.44", "port": 9100, "encoder": "IPL"}

def test_editor_http_prepares_once_submits_exact_payload_and_reports_unconfirmed(monkeypatch):
    prepared = output(); fake = FakeTransport(); calls = []
    def prepare(*args, **kwargs): calls.append((args, kwargs)); return prepared
    monkeypatch.setattr(http, "prepare_editor_output", prepare)
    app.dependency_overrides[http.print_transport_factory] = lambda: lambda target: fake
    response = TestClient(app).post("/api/v1/printing/editor", json=REQUEST)
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "SUBMITTED" and result["confirmed"] is False
    assert result["copies"] == 1
    assert (result["width_px"], result["height_px"], result["dpi"]) == (160, 96, 203.2)
    assert result["payload_bytes"] == len(prepared.payload)
    assert len(calls) == 1 and calls[0] == ((SVG, 20., 12., 203.2), {"language": "IPL", "copies": 1})
    assert fake.calls == [prepared.payload] and fake.calls[0] is prepared.payload

@pytest.mark.parametrize("extra", [{"host": "192.0.2.99"}, {"port": 9101}, {"encoder": "ZPL"}, {"copies_extra": 2}])
def test_unknown_top_level_destination_fields_rejected(monkeypatch, extra):
    fake = FakeTransport()
    app.dependency_overrides[http.print_transport_factory] = lambda: lambda target: fake
    monkeypatch.setattr(http, "prepare_editor_output", lambda *a, **k: pytest.fail("Invalid request rendered"))
    response = TestClient(app).post("/api/v1/printing/editor", json={**REQUEST, **extra})
    assert response.status_code == 422 and fake.calls == []

def test_invalid_svg_never_submits():
    fake = FakeTransport(); app.dependency_overrides[http.print_transport_factory] = lambda: lambda target: fake
    response = TestClient(app).post("/api/v1/printing/editor", json={**REQUEST, "svg": '<svg><script>bad</script></svg>'})
    assert response.status_code == 422 and fake.calls == []

def test_send_failure_has_bounded_uncertain_result_without_retry(monkeypatch):
    prepared = output(); fake = FakeTransport(TimeoutError("private host"))
    app.dependency_overrides[http.print_transport_factory] = lambda: lambda target: fake
    monkeypatch.setattr(http, "prepare_editor_output", lambda *a, **k: prepared)
    response = TestClient(app).post("/api/v1/printing/editor", json=REQUEST)
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "print_submission_uncertain"
    assert "private" not in response.text and "Check the printer" in response.json()["detail"]["message"]
    assert len(fake.calls) == 1


@pytest.mark.parametrize("failure", [http.RasterError("private path"), http.IplError("private input")])
def test_known_preparation_failure_returns_500_before_submission(monkeypatch, failure):
    fake = FakeTransport()
    app.dependency_overrides[http.print_transport_factory] = lambda: lambda target: fake
    def fail(*args, **kwargs): raise failure
    monkeypatch.setattr(http, "prepare_editor_output", fail)
    response = TestClient(app).post("/api/v1/printing/editor", json=REQUEST)
    assert response.status_code == 500 and response.json()["detail"]["code"] == "print_preparation_failed"
    assert fake.calls == [] and "private" not in response.text


@pytest.mark.parametrize("default", [None, PrinterTarget("192.0.2.44")])
def test_explicit_action_target_overrides_optional_default(monkeypatch, default):
    fake = FakeTransport(); constructed = []
    app.dependency_overrides[http.configured_target] = lambda: default
    def factory(target): constructed.append(target); return fake
    app.dependency_overrides[http.print_transport_factory] = lambda: factory
    monkeypatch.setattr(http, "prepare_editor_output", lambda *a, **k: output())
    response = TestClient(app).post("/api/v1/printing/editor", json={**REQUEST, "target": {"host": "2001:db8::44", "port": 9200}})
    assert response.status_code == 200
    assert constructed == [PrinterTarget("2001:db8::44", 9200)] and len(fake.calls) == 1
    assert response.json()["target"] == {"host": "2001:db8::44", "port": 9200}
    assert default == (None if default is None else PrinterTarget("192.0.2.44"))

@pytest.mark.parametrize("target", [
    {"host": "printer.local", "port": 9100}, {"host": "http://192.0.2.4", "port": 9100},
    {"host": "fe80::1%1", "port": 9100}, {"host": "::", "port": 9100},
    {"host": "ff02::1", "port": 9100}, {"host": "0.0.0.0", "port": 9100},
    {"host": "224.0.0.1", "port": 9100}, {"host": "192.0.2.4", "port": "9100"},
    {"host": "192.0.2.4", "port": True}, {"host": "192.0.2.4", "port": 0},
    {"host": "192.0.2.4", "port": 65536}, {"host": "192.0.2.4", "port": 9100, "copies": 2},
])
def test_invalid_action_target_fails_before_raster_and_transport(monkeypatch, target):
    app.dependency_overrides[http.print_transport_factory] = lambda: lambda *a: pytest.fail("Invalid target constructed transport")
    monkeypatch.setattr(http, "prepare_editor_output", lambda *a, **k: pytest.fail("Invalid target rendered"))
    response = TestClient(app).post("/api/v1/printing/editor", json={**REQUEST, "target": target})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "invalid_printer_target"
    assert "printer.local" not in response.text


@pytest.mark.parametrize("copies", [0, 1000, -1, True, 1.5, "3", None])
def test_invalid_copies_rejected_before_prepare_and_transport(monkeypatch, copies):
    app.dependency_overrides[http.print_transport_factory] = lambda: lambda *a: pytest.fail("Invalid copies created transport")
    monkeypatch.setattr(http, "prepare_editor_output", lambda *a, **k: pytest.fail("Invalid copies prepared"))
    response = TestClient(app).post("/api/v1/printing/editor", json={**REQUEST, "copies": copies})
    assert response.status_code == 422 and response.json()["detail"]["code"] == "invalid_print_copies"


def test_multiple_copies_prepare_encode_and_send_once_using_native_quantity(monkeypatch):
    from app.engine import pipeline
    from app.protocols import registry
    prepared = output(); fake = FakeTransport(); rendered = []; encoded = []
    real_encoder = registry.encode_png
    def render(*args): rendered.append(args); return prepared.bitmap.bitmap_png
    def encode(*args, **kwargs): encoded.append(kwargs); return real_encoder(*args, **kwargs)
    monkeypatch.setattr(pipeline, "render_svg_bitmap", render)
    monkeypatch.setattr(registry, "encode_png", encode)
    app.dependency_overrides[http.print_transport_factory] = lambda: lambda target: fake
    response = TestClient(app).post("/api/v1/printing/editor", json={**REQUEST, "copies": 3})
    assert response.status_code == 200 and response.json()["copies"] == 3
    assert len(rendered) == 1 and encoded == [{"copies": 3}] and len(fake.calls) == 1
    assert b"<RS>3" in fake.calls[0] and fake.calls[0].count(b"<STX><ETB>") == 1


def test_print_copy_error_mapping_does_not_change_other_request_contracts():
    from app.main import request_validation_detail
    error = [{"loc": ("body", "copies"), "type": "int_type"}]
    assert request_validation_detail(error)["code"] == "invalid_request"
    assert request_validation_detail(error, print_request=True)["code"] == "invalid_print_copies"
    nested = [{"loc": ("body", "target", "copies"), "type": "extra_forbidden"}]
    assert request_validation_detail(nested, print_request=True)["code"] == "invalid_printer_target"
