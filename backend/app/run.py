"""Phase 7 fixture runtime entry; invocation, never import, starts the server."""

import logging
import os
import sys

import uvicorn


def main() -> None:
    events = logging.getLogger("thermal_label_studio.events")
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    events.handlers = [handler]
    events.setLevel(logging.INFO)
    events.propagate = False
    # Access logs include arbitrary request paths; bounded correlated HTTP
    # events already provide status. Container termination owns shutdown.
    uvicorn.run("app.main:app", host=os.environ.get("TLS_BIND_HOST", "127.0.0.1"), port=8000, workers=1,
                access_log=False, proxy_headers=False, server_header=False)


if __name__ == "__main__":
    main()
