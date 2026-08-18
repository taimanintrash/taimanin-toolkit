# Taimanin RPGX asset viewer — Security Audit

> **Scope note:** This audit was run against a **local downloader tool** that is
> **not** part of this repository and is not distributed with it. The downloader
> is a separate, privately-held tool used to populate the `taimanin_assets/`
> folder that the viewer reads. This repository ships **only the viewer**
> (`viewer/` + `open_viewer.bat`); it contains no downloader, no asset-fetch
> code, and no assets. The network behavior documented below describes the
> local downloader tool that was audited — it is recorded here for reference
> only, and the viewer itself performs **none** of these network calls.

## External Endpoint Manifest

Every network egress the **local downloader tool** can perform, derived from
the audited source. All endpoints are on a single CloudFront distribution. The
viewer shipped in this repo (localhost) makes **no** outbound calls.

| # | Host / Origin | Path / Pattern | Protocol | Auth | Touched By | Purpose |
|---|---|---|---|---|---|---|
| 1 | `dntgnyxcho2sk.cloudfront.net` | `/version.json` | HTTPS GET | None (public) | local downloader `fetch_version()` | Resolve current game/catalog version string |
| 2 | `dntgnyxcho2sk.cloudfront.net` | `/asset_bundles/WebGL/LIVE/{catalog}.bin` (`catalog_rpgx`, `catalog_basicimage`, `catalog_r18image`, `catalog_table`) | HTTPS GET | None (public) | local downloader `catalog_names()`, `find_table_bundle()` | Fetch the 4 Addressables catalogs; uses `If-None-Match` (ETag) for 304 caching |
| 3 | `dntgnyxcho2sk.cloudfront.net` | `/asset_bundles/WebGL/LIVE/{Basic\|R18\|Table\|System}/<name>_<md5>.bundle` | HTTPS GET | None (public, CDN serves without auth) | local downloader `build_bundle_items()` | Download Unity asset bundles (art/spine/adv/tables) |
| 4 | `dntgnyxcho2sk.cloudfront.net` | `/asset_bundles/DirectDownloadBundles/Audio/Voice/uni<id>_<form>/uni<id>_<form>_<type>_1.ogg` (+ `_2.._N` probed) | HTTPS GET | None (public; 403/404 remembered as absent) | local downloader `build_voice_items()` | Download base voice clips |
| 5 | `dntgnyxcho2sk.cloudfront.net` | `/asset_bundles/DirectDownloadBundles/Audio/Voice_r18/uni<id>_<form>_hom_r18_<idx>.ogg` | HTTPS GET | None (public; 403/404 remembered as absent) | local downloader `build_r18_voice_items()` | Download R18 voice clips |
| 6 | `taimanin-rpg.com` | *(Referer/Origin HTTP headers only — no request made to this host)* | — | — | local downloader `HEADERS` | Spoofed request headers to mimic the game client; no traffic is sent to this origin |
| 7 | `127.0.0.1:8765` | `/*` (read-only, sandboxed to package root) | HTTP (localhost) | None | `viewer/taimanin_server.py` (shipped here) | Local viewer server; bound to loopback only; `safe_path()` blocks traversal |

**Header set sent on all CDN requests** (local downloader):

```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/154.0
Accept: */*
Referer: https://taimanin-rpg.com/
Origin: https://taimanin-rpg.com
```

No `Authorization`, `Cookie`, `Bearer`, API key, or credential is ever sent or stored.

**Endpoints verified absent** (scanned the local downloader + this repo): no telemetry, analytics, webhook, update-check, or any third-party host. The viewer's `fetch()` calls go only to `/__taimanin_index__`, `/__taimanin_list__`, and relative `/<path>` on the local server.

---

## Static Source Audit

**Scope reviewed:**

- A **local downloader tool** (privately held, not in this repo): its `taimanin_dl.py`, `taimanin_tables.py`, `taimanin_actors.py`, and `tools/build_actor_sources.py`
- This repository's shipped viewer: `viewer/taimanin_server.py`, `viewer/taimanin_viewer.html`, `viewer/taimanin_spine.js`
- `viewer/vendor/spine-3.6-binary/spine-webgl.js` (+ its LICENSE) — third-party Spine 3.6 runtime
- `open_viewer.bat`, `requirements.txt`, `README.md`, `.gitattributes`

**Safety checks:**

- No `eval`/`exec`/`new Function`/`os.system`/`subprocess`/`__import__` anywhere in project code.
- No `base64` decoding of payloads — the lone `import base64` in the local downloader is **dead/unused**; the only base64 in the vendor runtime is two embedded PNGs (loading-screen spinner + Spine logo), standard for the official Spine runtime.
- No encoded/hex-obfuscated strings, no blob payloads.
- All viewer `fetch()` calls target the local server (`/__taimanin_index__`, `/__taimanin_list__`, or `remoteURL()` → relative `/<path>`); the spine `fetch()` loads a local `.skel`.
- No external hosts beyond the one CDN (downloader only) and localhost (viewer). The only URLs in the repo are the CDN, the game's marketing domain (sent as `Referer`), `127.0.0.1`, and schema/W3C references.
- No credentials, API keys, tokens, or cookies — "secret"/"token" hits are game dialogue (a ninja game) and local request-counter variables.
- `open_viewer.bat` only invokes `py -3` on the local viewer server; nothing auto-runs, downloads extra code, or phones home.
- Vendor runtime matches the genuine Esoteric Software Spine 3.6 WebGL build with its intact license.

---

## Asset Download Test Results (local downloader tool, live CDN)

The download test was run using the **local downloader tool** (not shipped in
this repo). It was the equivalent of the tool's dry-run + a single bundle
download. Dependencies (`requests`, `UnityPy`, `Pillow`, `msgpack`) were
installed fresh in an isolated environment for the test.

### Test 1 — dry-run work list

Command: `python3 taimanin_dl.py --list` (local downloader)

| Item | Result |
|---|---|
| `version.json` fetch | OK — resolved catalog version `1.25.48.1.20.16.1106` |
| `catalog_rpgx.bin` | OK — 30,102,275 bytes → 11,741 bundle names |
| `catalog_basicimage.bin` | OK — 6,697,180 bytes → 9,387 bundle names |
| `catalog_r18image.bin` | OK — 3,033,311 bytes → 4,328 bundle names |
| `catalog_table.bin` | OK — 3,007 bytes → 1 bundle name |
| Unique bundles discovered | 25,457 |
| Total work items | 31,235 (adv 9,102 · spine 1,511 · unit_art 6,879 · unit_icon 4 · voice 13,739) |
| Bytes downloaded in dry-run | 0 (catalogs only; `--list` downloads no bundles) |
| Exit code | 0 |
| Malicious payload in catalog bytes | None — catalogs consumed only by a `<name>_<md5>.bundle` regex match |

### Test 2 — single bundle download + raw-byte inspection

Downloaded the table bundle (chosen as the most code-like asset: metadata only, no NSFW image data).

| Item | Result |
|---|---|
| URL | `https://dntgnyxcho2sk.cloudfront.net/asset_bundles/WebGL/LIVE/Table/table_assets_all_319bc5476895b1ba3e6707062689915a.bundle` |
| HTTP status | 200 |
| Size | 10,864,120 bytes (~10.4 MiB) |
| SHA-256 | `8311b0728c5176910c122e6fef6038d793aaf8bd300fe571ffa58a3f1d80a152` |
| File magic | `UnityFS` — genuine Unity 5.x asset bundle (not a disguised executable) |
| UnityPy parse | OK — 1 `AssetBundle` header + 12 `TextAsset` objects |
| TextAsset contents | All decode as MessagePack arrays of game tables (e.g. `GameContents` list[5], `GameBTEvent` list[53], `GameItem` list[33]) — exactly as documented |
| Executable-string scan (full 10.8 MB) | **0 matches** for: `eval(`, `exec(`, `subprocess`, `os.system`, `popen`, `child_process`, `__import__`, `powershell`, `/bin/sh`, `cmd.exe`, `wscript`, `createobject`, `<script`, `javascript:`, `frombase64`, `window.location`, `document.cookie` |

### Tests not performed (per scope)

- Image / voice bundles (the NSFW content) were not downloaded or analyzed — only the metadata table bundle was fetched and scanned. Those bundles are Unity `Texture2D`/`AudioClip` objects processed by the audited `UnityPy`/`Pillow` extraction path, which executes no code from asset bytes.

### Cleanup

All test artifacts (`/tmp/scan/`, `taimanin_assets/.state/`, `__pycache__`) were removed.

---

## Conclusion

This repository ships only the **viewer**, which makes zero outbound calls.
The network behavior documented above was measured against a separate,
privately-held **local downloader tool** that is not part of this repo and is
not distributed with it. That tool contacts exactly one external host — the
`dntgnyxcho2sk.cloudfront.net` CDN — over HTTPS with no credentials, plus the
loopback viewer server. The live download test produced clean Unity bundles
with no malicious payloads in the catalog or sampled bundle bytes.
