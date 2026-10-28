from types import SimpleNamespace
import pytest
from local_agent import transport


def test_ethernet_numeric_target_and_single_send(monkeypatch):
    calls = []
    class Socket:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def settimeout(self, timeout): calls.append(('timeout', timeout))
        def connect(self, address): calls.append(('connect', address))
        def sendall(self, payload): calls.append(('send', payload))
    monkeypatch.setattr(transport.socket, 'socket', lambda *args: Socket())
    transport.ethernet({'host': '192.0.2.44', 'port': 9100}, b'\x02IPL\x03')
    assert [call for call in calls if call[0] == 'connect'] == [('connect', ('192.0.2.44', 9100))]
    assert [call for call in calls if call[0] == 'send'] == [('send', b'\x02IPL\x03')]


@pytest.mark.parametrize('phase', ['connect', 'send'])
def test_network_failure_classification_without_retry(monkeypatch, phase):
    calls = []
    class Socket:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def settimeout(self, value): pass
        def connect(self, address):
            calls.append('connect')
            if phase == 'connect': raise OSError()
        def sendall(self, payload): calls.append('send'); raise OSError()
    monkeypatch.setattr(transport.socket, 'socket', lambda *args: Socket())
    with pytest.raises(transport.BeforeSendError if phase == 'connect' else OSError):
        transport.ethernet({'host': '192.0.2.44', 'port': 9100}, b'IPL')
    assert calls == (['connect'] if phase == 'connect' else ['connect', 'send'])


@pytest.mark.parametrize('fail_at', [None, 'OpenPrinterW', 'WritePrinter'])
def test_windows_raw_queue_lifecycle_with_fake_winspool(monkeypatch, fail_at):
    calls = []
    class Function:
        def __init__(self, name): self.name = name
        def __call__(self, *args):
            calls.append(self.name)
            if self.name == fail_at: return 0
            if self.name == 'WritePrinter': args[3]._obj.value = args[2]
            return 1
    spool = SimpleNamespace(**{name: Function(name) for name in ['OpenPrinterW', 'StartDocPrinterW', 'StartPagePrinter', 'WritePrinter', 'EndPagePrinter', 'EndDocPrinter', 'ClosePrinter']})
    monkeypatch.setattr(transport, 'os', SimpleNamespace(name='nt'))
    monkeypatch.setattr(transport.ctypes, 'WinDLL', lambda *args, **kwargs: spool, raising=False)
    if fail_at:
        with pytest.raises(transport.BeforeSendError if fail_at == 'OpenPrinterW' else RuntimeError):
            transport.windows_raw({'queue': 'Fake USB queue'}, b'IPL')
    else:
        transport.windows_raw({'queue': 'Fake USB queue'}, b'IPL')
    if fail_at == 'OpenPrinterW': assert calls == ['OpenPrinterW']
    else: assert calls[-1] == 'ClosePrinter'; assert calls.count('WritePrinter') == 1
