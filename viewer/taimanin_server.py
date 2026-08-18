#!/usr/bin/env python3
"""Serve the integrated Taimanin viewer with automatic, read-only file access.

Run:
    py -3 viewer/taimanin_server.py       (or open_viewer.bat)

The server opens viewer/taimanin_viewer.html and exposes only files below the
package root (this script's parent directory).  Media remains on disk and is fetched by the browser on demand; no
files are copied or uploaded anywhere.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

# The package root, one level up: this script lives in viewer/ but the
# tree it serves - and taimanin_assets/ inside it - starts at the parent.
ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "taimanin_assets"
LAZY_DIRS = {"images", "voices", "audioclip"}
SKIP_DIRS = {".state", "__pycache__", "bundles"}
SKIP_SUFFIXES = {".bundle", ".har", ".pkl", ".pyc"}


def safe_path(relative: str) -> Path | None:
    try:
        target = (ROOT / unquote(relative).replace("/", os.sep)).resolve()
        target.relative_to(ROOT)
        return target
    except (OSError, ValueError):
        return None


_STORY_NAME = re.compile(r"//\s*(?:シーン名|タイトル)"
                         r"\s*[:：]\s*(.+)")


def _story_label(raw: bytes) -> str:
    """The scene's own title from its header comment (`//シーン名：プロローグ`).

    Story files are named c001_s01a, which says nothing; the header comment is
    the only human-readable name these scenes carry.
    """
    try:
        head = raw[:2048].decode("utf-8", "ignore")
    except Exception:
        return ""
    m = _STORY_NAME.search(head)
    return m.group(1).strip().strip("/").strip() if m else ""


_ACTOR_REF = re.compile(rb"^<ACTOR>([^\r\n]*)", re.MULTILINE)


def _collect_actor_refs(raw: bytes, into: set[str]) -> None:
    """Sprite names an ADV script actually puts on stage.

    A bundle also contains groupings that are never staged — `a_t021` holds
    a_t021a..h, eight ALTERNATIVE poses, and compositing it stacks all eight at
    once. Structurally it is indistinguishable from a real body+face pose (both
    are a parent whose children are all leaf Sprites), so the only sound test for
    "is this a pose" is whether a script ever asks for it.
    """
    for m in _ACTOR_REF.finditer(raw):
        try:
            parts = m.group(1).decode("utf-8", "ignore").split(",")
        except Exception:
            continue
        if len(parts) > 1 and parts[1].strip():
            into.add(parts[1].strip().lower())


def make_index() -> dict[str, object]:
    files: list[str] = []
    lazy: list[str] = []
    adv_scripts: dict[str, dict[str, object]] = {}
    adv_pairs: dict[str, str] = {}
    actors_used: set[str] = set()

    def walk(directory: Path) -> None:
        try:
            entries = sorted(directory.iterdir(), key=lambda p: p.name.lower())
        except OSError:
            return
        for path in entries:
            rel = path.relative_to(ROOT).as_posix()
            if path.is_dir():
                lower = path.name.lower()
                if lower in SKIP_DIRS:
                    continue
                if rel.lower().startswith(
                        "taimanin rpgx viewer/profilesmediarpgx"):
                    continue  # duplicate subset of the standalone profile viewer
                if (directory.name.lower() == "voice"
                        and path.name.isdigit()):
                    lazy.append(rel)
                    continue
                if lower in LAZY_DIRS:
                    lazy.append(rel)
                else:
                    walk(path)
                continue
            if path.suffix.lower() in SKIP_SUFFIXES:
                continue
            # Scene mode is intentionally limited to unit scenes. General ADV
            # contains story/event chapters and made the unit-scene browser both
            # noisy and incorrectly linked. Unit scenes live in r18_adv as a
            # pairList plus a matching __adv_scenario_r18 script.
            if (not path.suffix
                    and "extracted/adv/r18_adv/" in f"/{rel.lower()}"):
                match = re.match(
                    r"^(chr_(\d{4,5})(?:_(\d+))?_r18)"
                    r"(__adv_scenario_r18)?$",
                    path.name,
                    re.IGNORECASE,
                )
                if not match:
                    continue
                try:
                    raw = path.read_bytes()
                except OSError:
                    continue
                key = match.group(1).lower()
                scene_id = match.group(2)
                if match.group(3):
                    scene_id += f"_{match.group(3)}"
                # Older exports use the base file for JSON pairList metadata
                # and put the scenario in __adv_scenario_r18. Newer exports
                # store the scenario directly at the base name, so classify
                # by content instead of assuming every base file is pairList.
                is_pair = raw.lstrip().startswith(b"{")
                _collect_actor_refs(raw, actors_used)
                if match.group(4) or not is_pair:
                    adv_scripts[key] = {
                        "id": scene_id,
                        "script": rel,
                        "kind": "unit",
                        "spine": b"<SPINE>" in raw,
                        "cg": b"<EV>" in raw,
                    }
                    files.append(rel)
                else:
                    adv_pairs[key] = rel
                continue
            # General story / event ADV. These are the NPC and chapter scenes;
            # they are kept in a separate `story` set so the unit-scene browser
            # stays exactly as narrow as it was. Layout mirrors r18_adv but the
            # script carries an `__all` suffix and the bare name is the pairList.
            if (not path.suffix
                    and "extracted/adv/adv/" in f"/{rel.lower()}"):
                name = path.name
                base = name[:-5] if name.endswith("__all") else name
                try:
                    raw = path.read_bytes()
                except OSError:
                    continue
                _collect_actor_refs(raw, actors_used)
                key = f"story:{base.lower()}"
                if raw.lstrip().startswith(b"{"):
                    adv_pairs[key] = rel          # pairList sidecar
                else:
                    adv_scripts[key] = {
                        "id": base,
                        "script": rel,
                        "kind": "story",
                        "spine": b"<SPINE>" in raw,
                        "cg": b"<EV>" in raw,
                        "label": _story_label(raw),
                    }
                    files.append(rel)
                continue
            # Extraction sidecars and the large auxiliary tables are not read
            # by the viewer. Keep the one metadata table it does consume.
            if (path.suffix.lower() == ".json"
                    and path.name.lower() not in {"units.json", "positions.json",
                                                  "strings_en.json",
                                                  "actor_sources.json"}):
                continue
            files.append(rel)

    walk(ASSET_ROOT)
    scenes = [{
        **scene,
        "pair": adv_pairs.get(key),
    } for key, scene in sorted(adv_scripts.items())]
    return {"files": files, "lazy": lazy, "scenes": scenes,
            "actors_used": sorted(actors_used)}


class ViewerHandler(SimpleHTTPRequestHandler):
    server_version = "TaimaninLocal/1.0"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, value) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/__taimanin_index__":
            self.send_json(make_index())
            return
        if parsed.path == "/__taimanin_list__":
            requested = parse_qs(parsed.query).get("path", [""])[0]
            directory = safe_path(requested)
            if (directory is None or not directory.is_dir()
                    or not directory.is_relative_to(ASSET_ROOT)):
                self.send_error(404, "Directory not found")
                return
            try:
                names = sorted(p.name for p in directory.iterdir() if p.is_file())
            except OSError:
                self.send_error(403, "Directory is not readable")
                return
            self.send_json(names)
            return
        super().do_GET()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Open the Taimanin viewer with automatic local-file loading.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true",
                        help="start the server without opening a browser")
    args = parser.parse_args()

    os.chdir(ROOT)
    server = ThreadingHTTPServer((args.host, args.port), ViewerHandler)
    url = f"http://{args.host}:{args.port}/viewer/taimanin_viewer.html"
    print(f"Taimanin viewer: {url}")
    print("Read-only local server; press Ctrl+C to stop.")
    if not args.no_open:
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
