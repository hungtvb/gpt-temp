from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
errors: list[str] = []

if not skill.startswith("---\n"):
    errors.append("SKILL.md must start with YAML frontmatter")
match = re.match(r"---\n(.*?)\n---\n", skill, re.S)
if not match:
    errors.append("SKILL.md frontmatter is malformed")
else:
    frontmatter = match.group(1)
    name = re.search(r"^name:\s*(.+)$", frontmatter, re.M)
    description = re.search(r"^description:\s*(.+)$", frontmatter, re.M)
    if not name or not re.fullmatch(r"[a-z0-9-]+", name.group(1).strip()):
        errors.append("name must use lowercase letters, digits, and hyphens")
    if not description or not description.group(1).startswith("Use when "):
        errors.append("description must start with 'Use when '")
    if len(frontmatter) > 1024:
        errors.append("frontmatter must be at most 1024 characters")

required_phrases = [
    "Never request, print, store, or expose `ARTIFACT_GATEWAY_AGENT_KEY`",
    "Call `cleanup`",
    "full SHA-256",
    "50 MiB",
]
for phrase in required_phrases:
    if phrase not in skill:
        errors.append(f"missing required phrase: {phrase}")

for path in [
    ROOT / "scripts" / "assemble_chunks.py",
    ROOT / "scripts" / "verify_artifact.py",
    ROOT / "references" / "gateway-api.md",
]:
    if not path.is_file():
        errors.append(f"missing file: {path.relative_to(ROOT)}")

if errors:
    print("INVALID")
    for error in errors:
        print(f"- {error}")
    raise SystemExit(1)
print("VALID")
