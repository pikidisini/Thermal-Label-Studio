"""One supervised execution per worker container; never reclaim stale owners.

Run two containers with distinct TLS_QUEUE_WORKER_ID. Linux cgroup v2 memory.max
must fence this container and all descendants at <=128 MiB. No Docker socket,
privileged mode, startup migration or automatic physical-send retry.
"""
import hmac
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time
from threading import Event, Thread
from uuid import UUID
from .runtime import create_queue, current_policy
from .printers import job_owner
from .store import destination

MEMORY_BYTES = 128 * 1024 * 1024
PREPARATION_SECONDS = 60


def committed_heartbeat(queue, worker_id, current=None):
    queue.heartbeat(worker_id,current)
    # The dedicated container runs this supervisor as PID 1. Never publish from
    # child jobs or host-side unit tests. Its private tmpfs is fresh per container.
    if sys.platform == 'linux' and os.getpid() == 1:
        import json
        from .health import HEALTH_FILE
        temporary = HEALTH_FILE.with_suffix('.new')
        temporary.write_text(json.dumps({'worker_id': worker_id, 'pid': 1, 'monotonic': time.monotonic()}))
        temporary.replace(HEALTH_FILE)


class OwnerNotStopped(RuntimeError):
    """Fatal: exit the worker container rather than run another execution."""


def require_memory_fence():
    if sys.platform != 'linux':
        raise RuntimeError('Queue execution requires Linux cgroup v2 memory enforcement.')
    try:
        maximum = Path('/sys/fs/cgroup/memory.max').read_text().strip()
        if maximum == 'max' or not 0 < int(maximum) <= MEMORY_BYTES:
            raise ValueError()
    except Exception:
        raise RuntimeError('Queue aggregate memory fence is unavailable.') from None


def execute(ledger_id, worker_id):
    from app.config import get_settings
    from app.layouts.service import LayoutService
    from app.label_intake.policy import Admission, authorize, credential_digest, select_print_target
    from app.label_intake.print_service import print_durable
    from app.label_intake.durable_service import simulate_durable
    from app.printing.transport import TcpRawTransport
    queue = create_queue()
    request,receipt,digest,revision,address,sender = queue.load(ledger_id,worker_id)
    policy = current_policy()
    source = next((source for source in policy.sources if source.identity == sender),None)
    expected = credential_digest(source) if source is not None else None
    if expected is None or not hmac.compare_digest(expected,digest) or revision != policy.revision:
        raise RuntimeError('Queued permission changed.')
    admission = Admission(policy,source,digest)
    authorize(admission,request)
    target = select_print_target(admission,request.target_id)
    if destination(target.host,target.port) != address:
        raise RuntimeError('Queued destination changed.')
    settings = get_settings()
    if settings.persistence is None:
        raise RuntimeError('Stored layouts are unavailable.')
    layouts = LayoutService(settings.persistence)  # No initialize()/DDL/bucket creation.
    token = job_owner.set(ledger_id)
    try:
        if request.mode == 'print':
            print_durable(request,admission,layouts,queue.ledger,receipt.original_trace_id,
                          TcpRawTransport,current_policy,receipt=receipt,
                          before_send=lambda: print('SENDING',flush=True))
        else:
            simulate_durable(request,sender,layouts,queue.ledger,receipt.original_trace_id,receipt=receipt)
    finally:
        job_owner.reset(token)


def kill_and_reap(process):
    # Even a successful direct child can leave descendants. Kill its process group.
    try:
        os.killpg(process.pid,signal.SIGKILL)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=10)
    except Exception:
        raise OwnerNotStopped('Execution owner is not proven stopped.') from None
    # PID 1 adopts descendants in the dedicated worker container. Do not release
    # ownership while any descendant in this job's process group still exists.
    until = time.monotonic()+10
    while True:
        try:
            while True:
                child,_ = os.waitpid(-process.pid,os.WNOHANG)
                if child == 0:
                    break
        except ChildProcessError:
            pass
        try:
            os.killpg(process.pid,0)
        except ProcessLookupError:
            return
        if time.monotonic()>=until:
            raise OwnerNotStopped('Execution descendants are not proven stopped.')
        time.sleep(.05)


def start_heartbeat(queue, worker_id, ledger_id):
    heartbeat_stop,heartbeat_failed = Event(),Event()
    def pulse():
        while not heartbeat_stop.is_set():
            try:
                committed_heartbeat(queue,worker_id,ledger_id)
            except Exception:
                heartbeat_failed.set()
                return
            heartbeat_stop.wait(5)
    heartbeat_thread = Thread(target=pulse,daemon=True)
    heartbeat_thread.start()
    return heartbeat_stop, heartbeat_failed, heartbeat_thread


def monitor_execution(process, selector, started, heartbeat_failed, stop):
    preparing, failed = True, False
    deadline = started + PREPARATION_SECONDS
    signals = b''
    try:
        while process.poll() is None:
            now = time.monotonic()
            if stop() or heartbeat_failed.is_set() or now>=deadline:
                failed = True
                break
            for key,_ in selector.select(timeout=min(1,max(0,deadline-now))):
                line = os.read(key.fd,64)
                signals = (signals+line)[-128:]
                if preparing and b'SENDING\n' in signals:
                    preparing = False
                    deadline = time.monotonic()+2400
        if process.poll() is not None and process.returncode != 0:
            failed = True
    except Exception:
        failed = True
    return failed


def supervise(queue, ledger_id, worker_id, *, stop=lambda: False):
    process = subprocess.Popen([sys.executable,'-B','-m','app.intake_queue.worker','--job',ledger_id,worker_id],
        stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
        start_new_session=True,bufsize=0)
    selector = selectors.DefaultSelector()
    selector.register(process.stdout,selectors.EVENT_READ)
    started = time.monotonic()
    heartbeat_stop, heartbeat_failed, heartbeat_thread = start_heartbeat(queue, worker_id, ledger_id)
    try:
        failed = monitor_execution(process, selector, started, heartbeat_failed, stop)
    finally:
        try:
            kill_and_reap(process)
        except Exception:
            raise OwnerNotStopped('Execution ownership cannot be released safely.') from None
        finally:
            heartbeat_stop.set()
            heartbeat_thread.join(timeout=14)
            selector.close()
            process.stdout.close()
    # Recovery runs only AFTER this supervisor has terminated/reaped the owner.
    # No restart/heartbeat-based ownership theft and no automatic resend.
    if failed:
        queue.ledger.recover_quiesced(ledger_id)
    queue.finish(ledger_id)


def wait_for_stop(stopped):
    for _ in range(5):
        if stopped():
            break
        time.sleep(1)


def run():
    require_memory_fence()
    worker_id = os.environ.get('TLS_QUEUE_WORKER_ID','')
    if worker_id not in ('worker-1','worker-2'):
        raise RuntimeError('An explicit distinct worker identity is required.')
    queue = create_queue()
    if queue is None:
        raise RuntimeError('Queue is disabled.')
    stopped = False
    def shutdown(_signal,_frame):
        nonlocal stopped
        stopped = True
    signal.signal(signal.SIGTERM,shutdown)
    signal.signal(signal.SIGINT,shutdown)
    while not stopped:
        try:
            committed_heartbeat(queue,worker_id)
            job = queue.claim(worker_id)
            if job:
                supervise(queue,job,worker_id,stop=lambda:stopped)
            else:
                time.sleep(1)
        except OwnerNotStopped:
            raise
        except Exception:
            # Static error only; DSN, payload, source tokens and key material never log.
            print('Queue operation unavailable; no ownership was reclaimed.',file=sys.stderr,flush=True)
            wait_for_stop(lambda: stopped)


def main():
    try:
        if len(sys.argv) == 4 and sys.argv[1] == '--job':
            require_memory_fence()
            execute(str(UUID(sys.argv[2])),sys.argv[3])
        elif len(sys.argv) == 1:
            run()
        else:
            return 64
        return 0
    except Exception:
        print('Queue worker is unavailable. Inspect configured operational gates.',file=sys.stderr)
        return 70


if __name__ == '__main__':
    raise SystemExit(main())
