# Taimanin RPGX asset viewer

A local, offline viewer for TaimaninRPGX WebGL assets. It serves a read-only
folder on `127.0.0.1` and lets you browse the art, voice clips and story
scripts in your `taimanin_assets/` directory. The viewer makes **no outbound
calls** — it only reads files off your disk.

There is no login, no account and no game client involved.

## What's in this repo

    viewer/            the local viewer, reads taimanin_assets/ and nothing else
      taiman_server.py       read-only localhost server
      taimanin_viewer.html     the viewer
      taimin_spine.js        spine skeleton playback
      vendor/                Spine 3.6 WebGL runtime (see its LICENSE)
    open_viewer.bat    serves the package folder read-only and opens the viewer

This repository contains **only the viewer**. It does not include any assets,
and it does not include any way to obtain them — no downloader, no CDN fetch
logic, no asset-fetching code of any kind. If you want assets to view, you
have to find them on your own by your own means. This tool will not help you
get them.

## Getting assets to view

The viewer reads from a `taimanin_assets/` folder at the package root. That
folder is **not** part of this repo and is **not** provided here in any form.
You must obtain it yourself, separately, by whatever means you choose.

Once you have a `taimanin_assets/` directory, place it next to `viewer/` and
the viewer will index it automatically.

## View them

    open_viewer.bat

This serves the package folder read-only on `127.0.0.1:8765` and opens the
viewer. Media stays on disk and is fetched by the browser as you click; nothing
is copied or uploaded anywhere. Ctrl+C in the console stops it.

## Setup

The viewer needs nothing beyond the Python standard library — Python 3.10 or
newer is enough to run `open_viewer.bat`.

(`requirements.txt` is intentionally empty of runtime deps; it exists only to
document that the viewer has none.)

## English text

If your `taimanin_assets/` includes a `tables/strings_en.json` (a flat
{japanese: english} map), the viewer's EN/JA toggle is driven by it. It is
keyed by the Japanese source string, not by unit id, so it lines up with
whatever `units.json` your own copy produces — no version matching needed.
Anything not in that map falls through to the original Japanese. That file is
not included here; bring your own.

## A note on the files you'll view

These are copyrighted assets belonging to their publisher. This tool fetches
nothing and includes nothing — it only reads files you already have on disk
for personal, offline viewing. Don't redistribute what you've obtained.

The game is rated 18+ and your `taimanin_assets/` may carry the r18 art and
voice lines alongside the rest; the viewer does not filter them out.
