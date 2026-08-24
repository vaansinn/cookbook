"""
scripts/sync_glossary.py — Markdown -> Postgres sync for glossary entries.

Source: content/glossary/<slug>.<lang>.md — simple front matter (type,
title, trigger_words) + a plain-text body, no sections to parse.

Run with the Flask app context via `flask sync-glossary` (see app.py).
"""

import os
import re

import yaml

CONTENT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content")
GLOSSARY_DIR = os.path.join(CONTENT_DIR, "glossary")


class SyncError(Exception):
    pass


def parse_front_matter(text, path):
    m = re.match(r"^---\s*\n(.*?\n)---\s*\n(.*)$", text, re.DOTALL)
    if not m:
        raise SyncError(f"{path}: missing YAML front matter (--- ... ---)")
    meta = yaml.safe_load(m.group(1)) or {}
    body = m.group(2).strip()
    return meta, body


def find_glossary_files():
    if not os.path.isdir(GLOSSARY_DIR):
        return []
    out = []
    for fname in sorted(os.listdir(GLOSSARY_DIR)):
        if not fname.endswith(".md"):
            continue
        m = re.match(r"^([a-z0-9-]+)\.(en|de)\.md$", fname)
        if not m:
            raise SyncError(f"{fname}: filename must be '<slug>.<lang>.md'")
        out.append((m.group(1), m.group(2), os.path.join(GLOSSARY_DIR, fname)))
    return out


def sync(db, GlossaryEntry, verbose=print):
    files = find_glossary_files()
    if not files:
        verbose("No glossary files found — skipping.")
        return

    by_slug = {}
    for slug, lang, path in files:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        meta, body = parse_front_matter(text, path)
        for required in ("type", "title"):
            if required not in meta:
                raise SyncError(f"{path}: missing required front-matter field '{required}'")
        if meta["type"] not in ("technique", "nutrition"):
            raise SyncError(f"{path}: type must be 'technique' or 'nutrition', got {meta['type']!r}")

        entry = by_slug.setdefault(slug, {"type": meta["type"], "names": {}, "body": {}, "trigger_words": []})
        entry["names"][lang] = meta["title"]
        entry["body"][lang] = body
        if lang == "en":
            entry["trigger_words"] = [w.lower() for w in meta.get("trigger_words", [])]

    existing = {g.slug: g for g in GlossaryEntry.query.all()}
    for slug, data in by_slug.items():
        row = existing.get(slug)
        if row is None:
            row = GlossaryEntry(slug=slug)
            db.session.add(row)
        row.type = data["type"]
        row.names = data["names"]
        row.body = data["body"]
        row.trigger_words = data["trigger_words"]
        verbose(f"  {slug} ({data['type']}) — {len(data['names'])} language(s)")

    db.session.commit()
    verbose(f"Synced {len(by_slug)} glossary entries.")
