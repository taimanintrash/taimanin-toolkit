#!/usr/bin/env bash
#
# scan_missing.sh — Function manifest audit for the Taimanin viewer.
#
# Scans viewer/taimanin_server.py (Python) and viewer/taimanin_spine.js (JS)
# for every function/method, checks that each has a JSON doc comment
# ("JSON doc:" block with name/params/returns) and is listed in
# docs/FUNCTION_MANIFEST.md, then writes an agent-actionable report to
# docs/missing_report.md.
#
# Adapted from the RPGX-Translation-Tool docs/scan_missing.sh for a
# Python + JS (not pure-JS) repository.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST="$SCRIPT_DIR/FUNCTION_MANIFEST.md"
VIEWER_DIR="$SCRIPT_DIR/../viewer"
REPORT="$SCRIPT_DIR/missing_report.md"

if [ ! -f "$MANIFEST" ]; then
    echo "Error: Manifest file '$MANIFEST' not found!" >&2
    exit 1
fi

if [ ! -d "$VIEWER_DIR" ]; then
    echo "Error: Viewer directory '$VIEWER_DIR' does not exist!" >&2
    exit 1
fi

echo "==> Generating Agent-actionable report at $REPORT..."

export MANIFEST_PATH="$MANIFEST"
export VIEWER_DIR_PATH="$VIEWER_DIR"

python3 << 'EOF' > "$REPORT"
import re, os
from pathlib import Path

manifest_path = os.environ.get("MANIFEST_PATH", "")
viewer_dir = os.environ.get("VIEWER_DIR_PATH", "")

with open(manifest_path, "r", encoding="utf-8") as m:
    manifest_text = m.read()

# 1. Parse Manifest — collect documented function names.
#    Headings look like "### safe_path" or "### TaimaninSpinePlayer.load".
#    We store both the qualified name and its bare trailing component so a
#    JS method "load" matches "### TaimaninSpinePlayer.load".
manifest_funcs = set()
manifest_bare = set()
for m in re.finditer(r"(?m)^###\s+(\S.*?)\s*$", manifest_text):
    heading = m.group(1).strip()
    # drop a trailing " — desc" if present (split on em-dash or " - ")
    name = re.split(r"\s+[—-]\s+", heading, maxsplit=1)[0].strip()
    manifest_funcs.add(name)
    bare = name.split(".")[-1]
    manifest_bare.add(bare)

# 2. Extract functions from source.
functions = {}  # name -> {file, has_doc, desc}

def first_desc_line(doc_text):
    """First non-empty line that is not the JSON block itself."""
    for line in doc_text.split("\n"):
        s = line.strip()
        if not s:
            continue
        if s.startswith("JSON doc:") or s.startswith("{") or s.startswith("}") or s.startswith('"'):
            continue
        return s
    return ""

# --- Python: taimanin_server.py ---
py_path = os.path.join(viewer_dir, "taimanin_server.py")
if os.path.isfile(py_path):
    with open(py_path, "r", encoding="utf-8") as f:
        src = f.read()
    # Module-level defs: match the FULL signature up to the terminating ':'
    # so the docstring search starts after it, not mid-signature.
    for d in re.finditer(r"(?m)^def\s+(?P<name>\w+)\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:", src):
        name = d.group("name")
        after = src[d.end():]
        dm = re.match(r'\s*"""(.*?)"""', after, re.DOTALL)
        has_doc = bool(dm)
        desc = first_desc_line(dm.group(1)) if dm else ""
        functions[name] = {"file": "taimanin_server.py", "has_doc": has_doc, "desc": desc}
    # Class methods (indented def under a class).
    for d in re.finditer(r"(?m)^    def\s+(?P<name>\w+)\s*\([^)]*\)\s*(?:->\s*[^:]+)?\s*:", src):
        name = d.group("name")
        after = src[d.end():]
        dm = re.match(r'\s*"""(.*?)"""', after, re.DOTALL)
        has_doc = bool(dm)
        desc = first_desc_line(dm.group(1)) if dm else ""
        functions[name] = {"file": "taimanin_server.py", "has_doc": has_doc, "desc": desc}

# --- JS: taimanin_spine.js (class methods) ---
js_path = os.path.join(viewer_dir, "taimanin_spine.js")
if os.path.isfile(js_path):
    with open(js_path, "r", encoding="utf-8") as f:
        src = f.read()
    for d in re.finditer(r"(?m)^    (?:async\s+)?(?P<name>[a-zA-Z_]\w*)\s*\(", src):
        name = d.group("name")
        if name in {"if", "for", "while", "switch", "catch", "return"}:
            continue
        # JSDoc immediately above: look back for the nearest /** ... */
        prefix = src[:d.start()].rstrip()
        jm = re.search(r"/\*\*(.*?)\*/\s*$", prefix, re.DOTALL)
        has_doc = bool(jm)
        desc = ""
        if jm:
            inner = jm.group(1)
            for line in inner.split("\n"):
                s = line.strip().lstrip("*").strip()
                if s and not s.lower().startswith("json doc:"):
                    desc = s
                    break
        functions[name] = {"file": "taimanin_spine.js", "has_doc": has_doc, "desc": desc}

# 3. Generate Agent-Ready Report
print("# Function Manifest Audit Report\n")
print("This report contains machine-parseable update directives for the source "
      "files and `FUNCTION_MANIFEST.md`.\n")
print("-" * 50 + "\n")

missing_count = 0
issue_count = 0

for name, info in sorted(functions.items()):
    errors = []
    # A function is "in manifest" if either its name or a qualified form
    # (Class.name) appears in the manifest headings.
    in_manifest = name in manifest_funcs or name in manifest_bare
    if not info["has_doc"]:
        errors.append("No JSON doc comment detected.")
        issue_count += 1
    if not info["desc"]:
        errors.append("No description detected in doc comment.")
        issue_count += 1
    if not in_manifest:
        missing_count += 1
        errors.append("Missing from FUNCTION_MANIFEST.md.")

    if errors:
        status = "[MISSING]" if not in_manifest else "[ACTION REQUIRED]"
        print(f"### {status} {name}")
        print(f"- **Target File:** `viewer/{info['file']}`")
        for err in errors:
            print(f"- **Error:** {err}")
        best_desc = info["desc"] or "No description provided."
        print("\n**Suggested Manifest Block (for FUNCTION_MANIFEST.md):**")
        print("```markdown")
        print(f"### {name} — {best_desc}")
        print("#### What function call it:")
        print(f"- viewer/{info['file']} ()")
        print("#### What functions are used in it :")
        print("- (none)")
        print("```\n")
        print("---\n")

print(f"**Scan Summary:** Found {missing_count} missing function(s) and {issue_count} issue(s).")
EOF

echo "==> Report successfully written to $REPORT"
