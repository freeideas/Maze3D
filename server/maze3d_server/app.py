"""The Monster Maze server: one process that serves the pages and runs the game, forever.

  /             static files from app/: one subdirectory per page (app/README.md)
  /api/summary  best times by level and how many are playing, for the welcome page
  /ws           the game: one WebSocket (a lasting two-way connection) per player

Settings, all optional, from the environment: PORT (8770), HOST (127.0.0.1), DATA_ROOT (data/ in the
repository: each guest's progress and the best times, kept out of Git).
"""

import asyncio
import json
import logging
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from .game import Game, Store

ROOT = Path(__file__).resolve().parents[2]
APP_DIR = ROOT / "app"
DATA_ROOT = Path(os.environ.get("DATA_ROOT", ROOT / "data"))
TICK = 1 / 20
CACHE_PAGE = "public, max-age=300"
CACHE_VENDOR = "public, max-age=86400"

log = logging.getLogger("maze3d")


class FileStore(Store):
    """The Store, kept as two JSON files in DATA_ROOT, written whole and swapped in so a crash never leaves half a file."""

    def __init__(self, folder: Path) -> None:
        super().__init__()
        self.folder = folder
        folder.mkdir(parents=True, exist_ok=True)
        self.progress = self.read("progress.json")
        self.best = self.read("best.json")

    def read(self, name: str) -> dict:
        try:
            return json.loads((self.folder / name).read_text())
        except FileNotFoundError:
            return {}

    def write(self, name: str, value: dict) -> None:
        part = self.folder / (name + ".part")
        part.write_text(json.dumps(value))
        part.replace(self.folder / name)

    def saved(self) -> None:
        self.write("progress.json", self.progress)
        self.write("best.json", self.best)


game = Game(FileStore(DATA_ROOT))


async def run_forever() -> None:
    last = time.monotonic()
    while True:
        await asyncio.sleep(TICK)
        now = time.monotonic()
        try:
            game.tick(now, min(now - last, 0.25))
            game.broadcast(now)
        except Exception:
            log.exception("tick failed")
        last = now


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(run_forever())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.get("/api/summary")
def summary():
    return JSONResponse(game.summary(), headers={"Cache-Control": "no-store"})


@app.websocket("/ws")
async def play(ws: WebSocket):
    """The browser first sends {"t": "hello", "guest": <its guest ID or nothing>}; after that, Start
    ({"t": "start"}) and positions ({"t": "at", "x", "y", "h"}). See specs/protocol.md."""
    await ws.accept()
    outbox: asyncio.Queue = asyncio.Queue()
    player = None

    async def writer():
        while True:
            await ws.send_text(json.dumps(await outbox.get()))

    sending = asyncio.create_task(writer())
    try:
        while True:
            message = await ws.receive_json()
            if not isinstance(message, dict):
                continue
            now = time.monotonic()
            kind = message.get("t")
            if player is None:
                if kind != "hello":
                    continue
                guest = message.get("guest")
                if not isinstance(guest, str) or not re.fullmatch(r"[0-9a-f]{32}", guest):
                    guest = secrets.token_hex(16)
                player = game.join(secrets.token_hex(4), guest, outbox.put_nowait, now)
            elif kind == "start":
                game.start(player, now)
            elif kind == "at":
                try:
                    x, y, h = float(message["x"]), float(message["y"]), int(message["h"])
                except (KeyError, TypeError, ValueError):
                    continue
                game.report(player, x, y, h, now)
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        sending.cancel()
        if player:
            game.leave(player)


@app.api_route("/{path:path}", methods=["GET", "HEAD"])
def static(path: str):
    """Serve app/<path>; a directory serves its index.html (redirecting to the slash form first so
    page-relative URLs resolve inside the directory). README.md files are never served."""
    if ".." in path.split("/"):
        raise HTTPException(404)
    target = (APP_DIR / path) if path else APP_DIR
    try:
        target.resolve().relative_to(APP_DIR.resolve())
    except ValueError:
        raise HTTPException(404) from None
    if target.is_dir():
        if path and not path.endswith("/"):
            return RedirectResponse(url=f"{path.rsplit('/', 1)[-1]}/", status_code=301)
        target = target / "index.html"
    if not target.is_file() or target.name == "README.md":
        raise HTTPException(404)
    cache = CACHE_VENDOR if path.startswith("vendor/") else CACHE_PAGE
    return FileResponse(target, headers={"Cache-Control": cache})


def main() -> None:
    """The `maze3d-server` entry point (see deploy/maze3d.service)."""
    import uvicorn

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    host, port = os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", 8770))
    log.info("listening host=%s port=%s data_root=%s", host, port, DATA_ROOT)
    uvicorn.run(app, host=host, port=port, proxy_headers=True)
