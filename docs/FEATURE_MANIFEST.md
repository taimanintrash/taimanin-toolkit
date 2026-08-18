# Feature Manifest

This document lists the Taimanin RPGX asset viewer's user-facing features, the
**main function** that implements each, and the **pipeline** of functions that
pipeline runs. It is derived from the static call graph in
[`FUNCTION_MANIFEST.md`](./FUNCTION_MANIFEST.md) and grouped by feature area.

> **Convention used below:** when a feature reuses another feature's pipeline
> (e.g. animation switching reuses the bounds-measurement pipeline), it says
> **"uses the &lt;Feature&gt; pipeline"** and does not re-list those functions,
> because they are already documented under that feature.

**Module key (for the `function` column):**

`server` = `viewer/taimanin_server.py` · `spine` = `viewer/taimanin_spine.js`

---

## 1. Server Bootstrap

The single entry point. Binds the read-only loopback HTTP server, prints the
viewer URL, and opens it in a browser.

| Item | Value |
|---|---|
| **Main function** | `main` |
| **Module** | `server` |

**Pipeline:**

1. `server.main` (binds `ThreadingHTTPServer` with `ViewerHandler`, opens browser)

### Request Routing

| Item | Value |
|---|---|
| **Main function** | `ViewerHandler.do_GET` |
| **Module** | `server` |

**Pipeline:** `server.ViewerHandler.do_GET` → (index) `server.make_index` · (list) `server.safe_path` → `server.ViewerHandler.send_json` → `server.ViewerHandler.end_headers`

---

## 2. Asset Indexing

Walks `taimanin_assets/` once on each `/__taimanin_index__` request, classifies
every entry (regular asset, lazy-listed large dir, unit scene, story scene), and
emits the JSON the viewer's HTML consumes.

| Item | Value |
|---|---|
| **Main function** | `make_index` |
| **Module** | `server` |

**Pipeline:** `server.make_index` → `server.walk` → (`server._collect_actor_refs`, `server._story_label`)

### Path Safety

| Item | Value |
|---|---|
| **Main function** | `safe_path` |
| **Module** | `server` |

**Pipeline:** `server.safe_path` — resolves the request relative to ROOT and
returns `None` for any path that escapes the package root (no callees).

---

## 3. Spine Model Loading

Loads the atlas + binary skeleton supplied by the viewer, builds the
AnimationState, selects the initial animation, and frames the model.

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.load` |
| **Module** | `spine` |

**Pipeline:**

1. `spine.TaimaninSpinePlayer.load`
2. `spine.TaimaninSpinePlayer.dispose` (tears down prior AssetManager)
3. `spine.TaimaninSpinePlayer.findAnimation` (pick requested/idle/first)
4. `spine.TaimaninSpinePlayer.fitToStage` or `TaimaninSpinePlayer.measureBounds` (frame)

### Bounds Measurement

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.measureBounds` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.measureBounds` — samples the animation
over its duration and takes the union AABB; falls back to the setup pose.

### Stage Fitting

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.fitToStage` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.fitToStage` → `spine.TaimaninSpinePlayer.measureBounds`

---

## 4. Animation Playback Control

Switches the running animation and re-fits the frame, since per-animation
extents differ enough that keeping the old framing mis-crops.

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.setAnimation` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.setAnimation` → `spine.TaimaninSpinePlayer.findAnimation` → (`spine.TaimaninSpinePlayer.fitToStage` / `TaimaninSpinePlayer.measureBounds`) → `spine.TaimaninSpinePlayer.resize`

### Play / Pause

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.setPlaying` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.setPlaying` — toggles `playing` and
resets the timestamp (no callees).

### Render Loop

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.draw` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.draw` → `spine.TaimaninSpinePlayer.resize` (self-scheduling via `requestAnimationFrame`)

---

## 5. Viewport Interaction

Zoom about the cursor, drag-pan, and reset-to-fit. All converge on `resize`,
which recomputes the canvas backing-store size and orthographic MVP.

### Zoom

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.zoomAt` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.zoomAt` → `spine.TaimaninSpinePlayer.resize`

### Pan

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.panBy` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.panBy` → `spine.TaimaninSpinePlayer.resize`

### Reset View

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.resetView` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.resetView` → `spine.TaimaninSpinePlayer.resize`

### Resize (shared)

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.resize` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.resize` — sets canvas size + viewport +
MVP (no callees among tracked methods).

---

## 6. Teardown

Stops the render loop and invalidates any in-flight load so its result is
discarded rather than applied to a torn-down player.

| Item | Value |
|---|---|
| **Main function** | `TaimaninSpinePlayer.dispose` |
| **Module** | `spine` |

**Pipeline:** `spine.TaimaninSpinePlayer.dispose` — cancels the rAF and disposes
the AssetManager (no tracked callees).
