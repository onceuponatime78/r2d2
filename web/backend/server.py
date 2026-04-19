"""
R2-D2 Web UI - FastAPI backend
Handles: UDP discovery, static file serving
"""

from __future__ import annotations

import asyncio
import json
import socket
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
HERE = Path(__file__).parent
STATIC_DIR = HERE / "static"  # built frontend (npm run build → dist/ → static/)

app = FastAPI(title="R2-D2 Controller")


# ---------------------------------------------------------------------------
# UDP discovery
# ---------------------------------------------------------------------------
BROADCAST_PORT = 8090
DISCOVERY_TIMEOUT = 3.0  # seconds to listen


async def _discover_robots() -> list[dict]:
    loop = asyncio.get_event_loop()

    def _listen():
        found: dict[str, dict] = {}
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            s.settimeout(DISCOVERY_TIMEOUT)
            try:
                s.bind(("", BROADCAST_PORT))
            except OSError:
                return []

            # figure out our own IPs to skip echo
            own_ips: set[str] = set()
            try:
                tmp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                tmp.connect(("8.8.8.8", 80))
                own_ips.add(tmp.getsockname()[0])
                tmp.close()
            except Exception:
                pass

            import time

            end = time.monotonic() + DISCOVERY_TIMEOUT
            while time.monotonic() < end:
                try:
                    data, addr = s.recvfrom(4096)
                    if addr[0] in own_ips:
                        continue
                    try:
                        msg = json.loads(data.decode())
                        if msg.get("cmd") == "updBroadcast":
                            robot_uuid = msg.get("uuid", addr[0])
                            found[robot_uuid] = {
                                "uuid": robot_uuid,
                                "name": msg.get("name", "R2-D2"),
                                "ip": msg.get("ip", addr[0]),
                                "ap_mode": msg.get("ap_mode", False),
                            }
                    except Exception:
                        pass
                except socket.timeout:
                    break
            return list(found.values())

    return await loop.run_in_executor(None, _listen)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------
@app.get("/api/discover")
async def discover():
    robots = await _discover_robots()
    return robots


# ---------------------------------------------------------------------------
# Static file serving (built frontend)
# ---------------------------------------------------------------------------
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:

    @app.get("/")
    async def root():
        return {
            "message": "Frontend not built. Run: cd frontend && npm run build && cp -r dist/* ../backend/static/"
        }


# ---------------------------------------------------------------------------
# Dev entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
