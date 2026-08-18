# Function Manifest

This document describes every module in the Taimanin RPGX asset viewer, the
functions/methods it contains, and the static call graph between them.

**File load order:** `open_viewer.bat` launches `viewer/taimanin_server.py`,
which serves `viewer/taimanin_viewer.html` read-only on `127.0.0.1:8765`. The
HTML page loads `viewer/taimanin_spine.js` (an IIFE registering
`window.TaimaninSpinePlayer`) and the vendored Spine 3.6 runtime under
`viewer/vendor/spine-3.6-binary/spine-webgl.js`. The viewer's `fetch()` calls
go only to the local server's `/__taimanin_index__`, `/__taimanin_list__`, and
relative `/<path>` endpoints — never off-host.

**Convention:** each function's description is taken from its JSON doc comment
(`JSON doc:` block: `name` / `params` / `returns`). Callers and callees are
derived from the static call graph.

---

## viewer/taimanin_server.py — Read-only local HTTP server + asset index

Serves the package folder read-only on loopback, builds the file/scene index
by walking `taimanin_assets/`, and exposes two JSON endpoints the viewer's
HTML consumes. No outbound network calls.

### safe_path — Resolve a browser-requested relative path and reject traversal

#### What function call it:
- viewer/taimanin_server.py (do_GET)

#### What functions are used in it :
- (none)

### _story_label — The scene's own title from its header comment (`//シーン名：プロローグ`)

#### What function call it:
- viewer/taimanin_server.py (walk)

#### What functions are used in it :
- (none)

### _collect_actor_refs — Sprite names an ADV script actually puts on stage

#### What function call it:
- viewer/taimanin_server.py (walk)

#### What functions are used in it :
- (none)

### make_index — Build the viewer's file/scene index by walking taimanin_assets/

#### What function call it:
- viewer/taimanin_server.py (do_GET)

#### What functions are used in it :
- viewer/taimanin_server.py (walk)

### walk — Recursive descent that classifies each asset entry (files, lazy dirs, scenes)

#### What function call it:
- viewer/taimanin_server.py (make_index)

#### What functions are used in it :
- viewer/taimanin_server.py (_collect_actor_refs, _story_label)

### ViewerHandler.end_headers — Finalise response headers with a no-cache directive

#### What function call it:
- viewer/taimanin_server.py (send_json) · base class SimpleHTTPRequestHandler

#### What functions are used in it :
- (none)

### ViewerHandler.send_json — Serialise a Python value as a 200 JSON response

#### What function call it:
- viewer/taimanin_server.py (do_GET)

#### What functions are used in it :
- viewer/taimanin_server.py (end_headers)

### ViewerHandler.do_GET — Route the two JSON endpoints, fall back to static files

#### What function call it:
- (HTTP request loop; invoked by ThreadingHTTPServer)

#### What functions are used in it :
- viewer/taimanin_server.py (make_index, safe_path, send_json)

### main — Parse CLI args, bind the loopback server, open the browser, serve

#### What function call it:
- `__main__` entry point (raise SystemExit(main()))

#### What functions are used in it :
- (none directly; constructs ThreadingHTTPServer with ViewerHandler)

---

## viewer/taimanin_spine.js — Local Spine 3.6 binary viewer adapter

An IIFE that defines `TaimaninSpinePlayer` and registers it on `window`. Loads
atlas + binary skeleton data supplied by the viewer, renders via the vendored
Spine WebGL runtime, and handles zoom/pan/playback. No outbound network calls
beyond the viewer-supplied `fetch()` of local `.skel`/`.atlas` URLs.

### TaimaninSpinePlayer.constructor — Acquire the WebGL context and wire up the Spine renderer

#### What function call it:
- viewer/taimanin_viewer.html (instantiates the player)

#### What functions are used in it :
- viewer/taimanin_spine.js (draw)

### TaimaninSpinePlayer.load — Load atlas + binary skeleton, build AnimationState, pick initial animation

#### What function call it:
- viewer/taimanin_viewer.html (on model selection)

#### What functions are used in it :
- viewer/taimanin_spine.js (dispose, findAnimation, fitToStage, measureBounds, setAnimation)

### TaimaninSpinePlayer.fitToStage — Place a scene/event model on the fixed 1280×720 ADV stage

#### What function call it:
- viewer/taimanin_spine.js (load, setAnimation)

#### What functions are used in it :
- viewer/taimanin_spine.js (measureBounds)

### TaimaninSpinePlayer.measureBounds — Frame the animation's extent by sampling, not the setup pose

#### What function call it:
- viewer/taimanin_spine.js (fitToStage, load, setAnimation)

#### What functions are used in it :
- (none among tracked methods)

### TaimaninSpinePlayer.findAnimation — Case-insensitive animation name lookup (exact > suffix > substring)

#### What function call it:
- viewer/taimanin_spine.js (load, setAnimation)

#### What functions are used in it :
- (none)

### TaimaninSpinePlayer.setAnimation — Switch the running animation and re-fit the frame

#### What function call it:
- viewer/taimanin_spine.js (load) · viewer/taimanin_viewer.html (animation picker)

#### What functions are used in it :
- viewer/taimanin_spine.js (findAnimation, fitToStage, measureBounds, resize)

### TaimaninSpinePlayer.setPlaying — Toggle playback, resetting the last-timestamp to avoid a delta jump

#### What function call it:
- viewer/taimanin_viewer.html (play/pause control)

#### What functions are used in it :
- (none)

### TaimaninSpinePlayer.resize — Recompute canvas backing-store size and the orthographic MVP

#### What function call it:
- viewer/taimanin_spine.js (draw, panBy, resetView, setAnimation, zoomAt)

#### What functions are used in it :
- (none)

### TaimaninSpinePlayer.zoomAt — Zoom about the cursor point so the spot under it stays put

#### What function call it:
- viewer/taimanin_viewer.html (wheel-zoom)

#### What functions are used in it :
- viewer/taimanin_spine.js (resize)

### TaimaninSpinePlayer.panBy — Shift the camera by a CSS-pixel drag delta converted to world units

#### What function call it:
- viewer/taimanin_viewer.html (pointer-drag)

#### What functions are used in it :
- viewer/taimanin_spine.js (resize)

### TaimaninSpinePlayer.resetView — Reset zoom/pan to the default fit and re-project

#### What function call it:
- viewer/taimanin_viewer.html (reset button)

#### What functions are used in it :
- viewer/taimanin_spine.js (resize)

### TaimaninSpinePlayer.draw — The rAF render loop: clear, step animation, apply, draw

#### What function call it:
- viewer/taimanin_spine.js (constructor, self via requestAnimationFrame)

#### What functions are used in it :
- viewer/taimanin_spine.js (resize)

### TaimaninSpinePlayer.dispose — Stop the render loop and invalidate any in-flight load

#### What function call it:
- viewer/taimanin_viewer.html (player teardown)

#### What functions are used in it :
- (none)
