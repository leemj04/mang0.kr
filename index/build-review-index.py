from __future__ import annotations

import json
from pathlib import Path

root_dir = Path(__file__).parent
review_dir = root_dir / "review"
writeup_dir = root_dir / "writeup"
out_file = root_dir / "review-index.json"

def parse_date_label(name: str) -> tuple[str | None, str | None, int | None]:
    stem = Path(name).stem
    if len(stem) == 6 and stem.isdigit():
        yy = int(stem[0:2])
        mm = int(stem[2:4])
        dd = int(stem[4:6])
        year = 2000 + yy
        label = f"{year:04d}.{mm:02d}.{dd:02d}."
        key = year * 10000 + mm * 100 + dd
        return label, stem, key
    return None, None, None


entries_by_id: dict[str, dict] = {}

def add_entry(path: Path, content_type: str) -> None:
    if path.name.lower() == "template.md":
        return
    stem = path.stem
    lang = "ko"
    base = stem
    if stem.endswith("-en"):
        lang = "en"
        base = stem[:-3]

    first_line = path.read_text(encoding="utf-8").splitlines()[:1]
    title = (first_line[0] if first_line else path.name).lstrip("#").strip()
    title = title if title else path.name
    date_label, date_raw, sort_key = parse_date_label(base)

    entry = entries_by_id.get(base)
    if not entry:
        entry = {
            "id": base,
            "type": content_type,
            "title": {},
            "files": {},
            "dateLabel": date_label,
            "dateRaw": date_raw,
            "sortKey": sort_key,
        }
        entries_by_id[base] = entry

    entry["title"][lang] = title
    file_path = path.name if content_type == "review" else f"writeup/{path.name}"
    entry["files"][lang] = file_path
    if entry["dateLabel"] is None and date_label:
        entry["dateLabel"] = date_label
    if entry["dateRaw"] is None and date_raw:
        entry["dateRaw"] = date_raw
    if entry["sortKey"] is None and sort_key:
        entry["sortKey"] = sort_key

for path in review_dir.glob("*.md"):
    add_entry(path, "review")

if writeup_dir.exists():
    for path in writeup_dir.glob("*.md"):
        add_entry(path, "writeup")

entries = list(entries_by_id.values())
entries.sort(key=lambda item: (item["sortKey"] or 0), reverse=True)

out_file.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(entries)} entries to {out_file}")
