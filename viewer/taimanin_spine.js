/* Local Spine 3.6 binary viewer adapter.
 * Game data is loaded only from taimanin_assets entries supplied by the
 * integrated viewer. The runtime is vendored locally under vendor/.
 */
(function () {
  'use strict';

  class TaimaninSpinePlayer {
    /**
     * JSON doc:
     * {
     *   "name": "constructor",
     *   "params": {
     *     "canvas": "HTMLCanvasElement — the canvas to render into",
     *     "options": "{ opaque?: boolean, stage?: boolean } — rendering flags"
     *   },
     *   "returns": "TaimaninSpinePlayer instance"
     * }
     *
     * Acquires the WebGL context and wires up the Spine shader/batcher/
     * renderer. The blend-func wrapper below is what keeps vendor/ untouched
     * while fixing the grey-seam alpha problem on transparent canvases.
     */
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.opaque = options.opaque === true;
      const contextOptions = {
        alpha: !this.opaque,
        // What the blend below actually LEAVES in the framebuffer is
        // premultiplied, so the canvas has to be declared that way. Saying
        // `false` here while writing premultiplied pixels is what put grey
        // fringes on every semi-transparent edge of the chibi and art cut-in
        // models: the browser multiplied by alpha a second time on composite.
        // The scene player never showed it because it passes {opaque:true},
        // and an alpha:false canvas is never composited at all.
        premultipliedAlpha: true,
      };
      this.gl = canvas.getContext('webgl', contextOptions)
        || canvas.getContext('experimental-webgl', contextOptions);
      if (!this.gl) throw new Error('WebGL is unavailable');
      console.log('[Trace:Spine] WebGL context acquired', { opaque: this.opaque });
      const gl = this.gl;
      // The ATLAS PNGs are straight-alpha, so uploads must not be premultiplied.
      // This is a separate question from the canvas mode above: textures go in
      // straight, and the blend is what premultiplies them on the way out.
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      // Spine 3.6's PolygonBatcher only ever calls gl.blendFunc, which applies
      // one pair of factors to colour AND alpha. With pma=false that is
      // (SRC_ALPHA, ONE_MINUS_SRC_ALPHA), so drawing over an empty framebuffer
      // accumulates alpha as As*As instead of As -- a half-transparent pixel
      // ends up a quarter opaque, and the edge reads as a grey seam.
      // Redirect it so colour keeps its factors and alpha uses (ONE,
      // ONE_MINUS_SRC_ALPHA), the standard "render to a transparent target"
      // pair. Wrapping the context is what keeps vendor/ untouched -- the
      // batcher re-issues blendFunc on every begin() and setBlendMode().
      const blendFunc = gl.blendFunc.bind(gl);
      gl.blendFunc = (src, dst) => {
        if (gl.blendFuncSeparate) gl.blendFuncSeparate(src, dst, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        else blendFunc(src, dst);
      };
      this.shader = spine.webgl.Shader.newTwoColoredTextured(gl);
      this.batcher = new spine.webgl.PolygonBatcher(gl);
      this.renderer = new spine.webgl.SkeletonRenderer(gl);
      this.mvp = new spine.webgl.Matrix4();
      this.assetManager = null;
      this.skeleton = null;
      this.state = null;
      this.bounds = null;
      this.pma = false;
      this.playing = true;
      this.disposed = false;
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.minZoom = 0.5; this.maxZoom = 12;
      this.worldPerPixel = 1;
      this.loadToken = 0;
      this.last = performance.now() / 1000;
      this.frame = requestAnimationFrame(t => this.draw(t));
    }

    /**
     * JSON doc:
     * {
     *   "name": "load",
     *   "params": {
     *     "model": "{ atlasURL, skelURL, pma?, stage? } — the model descriptor",
     *     "requestedAnimation": "string? — preferred animation name to start"
     *   },
     *   "returns": "Promise<string[]> — animation names available on the loaded skeleton"
     * }
     *
     * Loads the atlas + binary skeleton, builds the AnimationState, picks the
     * initial animation (requested > idle-like > first), and frames the model.
     * A loadToken guards against superseded loads finishing after a newer one.
     */
    async load(model, requestedAnimation) {
      const token = ++this.loadToken;
      console.log('[Trace:Spine] load start', { skelURL: model.skelURL, token });
      this.skeleton = null;
      this.state = null;
      this.pma = model.pma === true;
      if (this.assetManager) this.assetManager.dispose();
      const manager = new spine.webgl.AssetManager(this.gl);
      this.assetManager = manager;
      const atlasPromise = new Promise((resolve, reject) => {
        manager.loadTextureAtlas(model.atlasURL,
          (_path, atlas) => resolve(atlas),
          (_path, error) => reject(new Error(error)));
      });
      const binaryPromise = fetch(model.skelURL).then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${model.skelURL}`);
        return r.arrayBuffer();
      });
      const [atlas, binary] = await Promise.all([atlasPromise, binaryPromise]);
      if (this.disposed || token !== this.loadToken) {
        console.log('[Trace:Spine] load superseded, discarding', { token });
        return [];
      }

      const loader = new spine.AtlasAttachmentLoader(atlas);
      const parser = new spine.SkeletonBinary(loader);
      const data = parser.readSkeletonData(binary);
      const skeleton = new spine.Skeleton(data);
      if (data.skins && data.skins.length) {
        const skin = data.findSkin ? data.findSkin('default') : null;
        if (skin) skeleton.setSkinByName('default');
      }
      skeleton.setToSetupPose();
      skeleton.updateWorldTransform();

      const stateData = new spine.AnimationStateData(data);
      const state = new spine.AnimationState(stateData);
      const animations = (data.animations || []).map(a => a.name);
      const initial = this.findAnimation(animations, requestedAnimation)
        || animations.find(n => /idle|wait|stand|(^|_)wai(?:_|$)|(^|_)sle(?:_|$)/i.test(n))
        || animations[0];
      if (initial) state.setAnimation(0, initial, true);
      this.skeleton = skeleton;
      this.state = state;
      this.bounds = model.stage ? this.fitToStage(skeleton, data, initial)
                                : this.measureBounds(skeleton, data, initial);
      this.model = model;
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.playing = true;
      this.last = performance.now() / 1000;
      console.log('[Trace:Spine] load complete', { token, animations: animations.length, initial });
      return animations;
    }

    /**
     * JSON doc:
     * {
     *   "name": "fitToStage",
     *   "params": { "skeleton": "spine.Skeleton", "data": "spine.SkeletonData", "animName": "string?" },
     *   "returns": "{ offset: Vector2, size: Vector2 } — the measured bounds"
     * }
     *
     * Place a scene/event model on the fixed 1280x720 ADV stage.
     *
     * The legacy viewer hardcodes centre (640,360) at scale 0.75, and that was
     * copied here — but it only holds for the models that viewer shipped. It has
     * no scenes at all for newer content (1045, 1063, 1067 …), and every one of
     * the 25 event models measured overflows the stage at 0.75: they need 0.335
     * to 0.616, median 0.550. Rendering them at 0.75 pushed head and feet off
     * the stage and left a face filling the screen.
     *
     * So derive the scale from the model's own animated extent and centre THAT,
     * rather than assuming the skeleton origin is the visual centre. Capped at
     * 0.75 so a model that already fits is never enlarged past the authored size.
     */
    fitToStage(skeleton, data, animName) {
      const W = 1280, H = 720, MAX = 0.75;
      skeleton.x = 0; skeleton.y = 0;
      skeleton.scaleX = skeleton.scaleY = 1;
      const b = this.measureBounds(skeleton, data, animName);
      const w = b.size.x, h = b.size.y;
      const s = (w > 0 && h > 0) ? Math.min(W / w, H / h, MAX) : MAX;
      skeleton.scaleX = skeleton.scaleY = s;
      skeleton.x = W / 2 - (b.offset.x + w / 2) * s;
      skeleton.y = H / 2 - (b.offset.y + h / 2) * s;
      skeleton.updateWorldTransform();
      return b;
    }

    /**
     * JSON doc:
     * {
     *   "name": "measureBounds",
     *   "params": { "skeleton": "spine.Skeleton", "data": "spine.SkeletonData", "animName": "string?" },
     *   "returns": "{ offset: Vector2, size: Vector2 } — union AABB of the animation's sampled frames"
     * }
     *
     * Frame the animation, not the setup pose.
     *
     * These skeletons are not authored standing in their rest pose: the pose is
     * built by the animation, so a setup-pose AABB can be far smaller than what
     * is actually drawn. Measured across all 480 Cut_* (art-animation) models,
     * 319 animate BELOW their setup-pose box — Cut_Chr_0738 by a full frame
     * height, Cut_Chr_0116 by 80%. Fitting the viewport to that box is what cut
     * the legs off most art animations.
     *
     * So sample the animation over its duration and take the union. Sampling is
     * cheap (once per load / animation change, ~25 poses) and it is the only way
     * to know the real extent — Spine offers no static "animated bounds".
     * Falls back to the setup pose when there is no animation or the samples
     * yield nothing (a skeleton whose attachments are all in a non-default skin). */
    measureBounds(skeleton, data, animName) {
      const offset = new spine.Vector2(), size = new spine.Vector2();
      const setupPose = () => {
        skeleton.setToSetupPose();
        skeleton.updateWorldTransform();
        skeleton.getBounds(offset, size, []);
        return {offset, size};
      };
      const anim = animName && data.findAnimation ? data.findAnimation(animName) : null;
      if (!anim) return setupPose();

      // Sample on a time step rather than a fixed count: a long animation can
      // swing through an extreme between widely spaced samples. Cut_Chr_0764
      // (3s) needs ~90 to catch its lowest reach; 24 missed it by 20% of frame
      // height. ~30Hz, clamped so short clips stay cheap and nothing runs away.
      const duration = anim.duration || 0;
      const SAMPLES = Math.max(24, Math.min(120, Math.round(duration * 30)));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const o = new spine.Vector2(), s = new spine.Vector2();
      for (let i = 0; i <= SAMPLES; i++) {
        skeleton.setToSetupPose();
        anim.apply(skeleton, 0, duration * (i / SAMPLES), true, [], 1, false, false);
        skeleton.updateWorldTransform();
        skeleton.getBounds(o, s, []);
        if (!(s.x > 0 && s.y > 0)) continue;
        x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y);
        x1 = Math.max(x1, o.x + s.x); y1 = Math.max(y1, o.y + s.y);
      }
      // Leave the skeleton under the AnimationState's control, not mid-sample.
      skeleton.setToSetupPose();
      skeleton.updateWorldTransform();
      if (!isFinite(x0)) return setupPose();
      offset.x = x0; offset.y = y0;
      size.x = x1 - x0; size.y = y1 - y0;
      return {offset, size};
    }

    /**
     * JSON doc:
     * {
     *   "name": "findAnimation",
     *   "params": { "animations": "string[]", "requested": "string?" },
     *   "returns": "string | undefined — exact, then suffix, then substring match"
     * }
     *
     * Case-insensitive lookup so a user picking "idle" matches "Cut_Idle_01".
     */
    findAnimation(animations, requested) {
      if (!requested) return null;
      const want = String(requested).toLowerCase();
      return animations.find(n => n.toLowerCase() === want)
        || animations.find(n => n.toLowerCase().endsWith(want))
        || animations.find(n => n.toLowerCase().includes(want));
    }

    /**
     * JSON doc:
     * {
     *   "name": "setAnimation",
     *   "params": { "name": "string — animation name (or fuzzy match)" },
     *   "returns": "boolean — true if the animation was found and applied"
     * }
     *
     * Switches the running animation and re-fits the frame, because per-
     * animation extents differ enough that keeping the old framing mis-crops.
     */
    setAnimation(name) {
      if (!this.state || !this.skeleton) return false;
      const animations = this.skeleton.data.animations.map(a => a.name);
      const found = this.findAnimation(animations, name);
      if (!found) {
        console.log('[Trace:Spine] setAnimation: not found', { name });
        return false;
      }
      this.skeleton.setToSetupPose();
      this.state.setAnimation(0, found, true);
      // Extents are per-animation — the _05 variant of an event model can be
      // 10% larger than _01 — so re-fit rather than keep the old framing.
      this.bounds = this.model?.stage
        ? this.fitToStage(this.skeleton, this.skeleton.data, found)
        : this.measureBounds(this.skeleton, this.skeleton.data, found);
      this.resize();
      console.log('[Trace:Spine] setAnimation', { found });
      return true;
    }

    /**
     * JSON doc:
     * {
     *   "name": "setPlaying",
     *   "params": { "value": "boolean — true to animate, false to freeze" },
     *   "returns": "undefined"
     * }
     *
     * Toggles playback. Resets the last-timestamp so the next frame's delta
     * does not jump after a pause.
     */
    setPlaying(value) {
      this.playing = !!value;
      this.last = performance.now() / 1000;
    }

    /**
     * JSON doc:
     * {
     *   "name": "resize",
     *   "params": {},
     *   "returns": "undefined"
     * }
     *
     * Recomputes the canvas backing-store size and the orthographic MVP so the
     * model fits the viewport at the current zoom/pan. Stage models use a fixed
     * 1280x720 projection; non-stage models fit the measured bounds.
     */
    resize() {
      if (!this.bounds) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const cssW = Math.max(1, this.canvas.clientWidth);
      const cssH = Math.max(1, this.canvas.clientHeight);
      const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      if (this.model?.stage) {
        this.mvp.ortho2d(0, 0, 1280, 720);
        this.gl.viewport(0, 0, w, h);
        return;
      }
      // `zoom` shrinks the world-units-per-pixel, so >1 magnifies. `panX/panY`
      // are in world units and shift the camera, which is what lets a zoomed-in
      // view be dragged around instead of being stuck on the model's centre.
      const b = this.bounds;
      const centerX = b.offset.x + b.size.x / 2 + this.panX;
      const centerY = b.offset.y + b.size.y / 2 + this.panY;
      const fit = Math.max(b.size.x / w, b.size.y / h) * 1.12 || 1;
      const scale = fit / (this.zoom || 1);
      this.mvp.ortho2d(centerX - w * scale / 2, centerY - h * scale / 2,
        w * scale, h * scale);
      this.gl.viewport(0, 0, w, h);
      this.worldPerPixel = scale * dpr;  // for pointer-drag panning
    }

    /**
     * JSON doc:
     * {
     *   "name": "zoomAt",
     *   "params": {
     *     "factor": "number — multiplicative zoom delta (>1 in, <1 out)",
     *     "cssX": "number — cursor X in CSS pixels relative to canvas",
     *     "cssY": "number — cursor Y in CSS pixels relative to canvas"
     *   },
     *   "returns": "undefined"
     * }
     *
     * Zoom about a point given in CSS pixels relative to the canvas, so the
     * spot under the cursor stays put — anchoring on the centre instead makes
     * wheel-zoom feel like it drifts.
     */
    zoomAt(factor, cssX, cssY) {
      const prev = this.zoom;
      const next = Math.min(this.maxZoom, Math.max(this.minZoom, prev * factor));
      if (next === prev) return;
      const wpp = this.worldPerPixel || 1;
      const dx = (cssX - this.canvas.clientWidth / 2) * wpp;
      const dy = (this.canvas.clientHeight / 2 - cssY) * wpp;
      // world point under the cursor must map to itself after the zoom change
      this.panX += dx * (1 - prev / next);
      this.panY += dy * (1 - prev / next);
      this.zoom = next;
      this.resize();
    }

    /**
     * JSON doc:
     * {
     *   "name": "panBy",
     *   "params": { "dxCss": "number", "dyCss": "number" — drag delta in CSS pixels" },
     *   "returns": "undefined"
     * }
     *
     * Shifts the camera in world units by converting the CSS-pixel drag delta.
     */
    panBy(dxCss, dyCss) {
      const wpp = this.worldPerPixel || 1;
      this.panX -= dxCss * wpp;
      this.panY += dyCss * wpp;
      this.resize();
    }

    /**
     * JSON doc:
     * {
     *   "name": "resetView",
     *   "params": {},
     *   "returns": "undefined"
     * }
     *
     * Resets zoom/pan to the default fit and re-projects.
     */
    resetView() {
      this.zoom = 1; this.panX = 0; this.panY = 0;
      this.resize();
    }

    /**
     * JSON doc:
     * {
     *   "name": "draw",
     *   "params": { "timeMs": "number — DOMHighResTimeStamp from rAF" },
     *   "returns": "undefined"
     * }
     *
     * The rAF render loop: clears, steps the animation, applies it to the
     * skeleton, and draws. No-ops once disposed.
     */
    draw(timeMs) {
      if (this.disposed) return;
      this.frame = requestAnimationFrame(t => this.draw(t));
      const now = timeMs / 1000;
      const delta = Math.min(.1, Math.max(0, now - this.last));
      this.last = now;
      const gl = this.gl;
      gl.clearColor(0, 0, 0, this.opaque ? 1 : 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!this.skeleton || !this.state) return;
      this.resize();
      if (this.playing) this.state.update(delta);
      this.state.apply(this.skeleton);
      this.skeleton.updateWorldTransform();
      this.shader.bind();
      this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
      this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.mvp.values);
      this.batcher.begin(this.shader);
      this.renderer.premultipliedAlpha = this.pma;
      this.renderer.draw(this.batcher, this.skeleton);
      this.batcher.end();
      this.shader.unbind();
    }

    /**
     * JSON doc:
     * {
     *   "name": "dispose",
     *   "params": {},
     *   "returns": "undefined"
     * }
     *
     * Stops the render loop and invalidates any in-flight load so its result
     * is discarded rather than applied to a torn-down player.
     */
    dispose() {
      this.disposed = true;
      ++this.loadToken;
      cancelAnimationFrame(this.frame);
      if (this.assetManager) this.assetManager.dispose();
      console.log('[Trace:Spine] disposed');
    }
  }

  if (typeof window !== 'undefined') {
    window.TaimaninSpinePlayer = TaimaninSpinePlayer;
    console.log('[Trace:Init] TaimaninSpinePlayer registered');
  }
})();
