"""
snapshots.py — recipe content snapshot capture/reuse + read-time authorization.

docs/contracts/pilot-fixtures.md §1. A cook session must be able to show and
replay the *actual instructions the user cooked from*, even after the recipe
is edited or the browser is closed — so the server stores the full content,
not a digest of it. Kept as a standalone module (like access.py) rather than
folded into routes/ since both the HTTP endpoints (routes/snapshots.py) and
any other future internal caller need the same capture/reuse + auth logic.
"""

import hashlib
import json

from app import db
from models import Dish, RecipeContentSnapshot
from access import tier_access


def _digest(content):
    return hashlib.sha256(json.dumps(content, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def capture_or_reuse_snapshot(dish_slug, level, lang):
    """Implements the contract's exact capture/reuse rule: compute the digest
    of the current RecipeTier content, reuse an existing row with the same
    (dish_slug, level, lang, content_digest) if one exists, otherwise insert.
    Returns (snapshot, error) — error is one of "dish_not_found"/"tier_not_found"
    when there's no such content to capture, snapshot is None in that case."""
    dish = Dish.query.filter_by(slug=dish_slug).first()
    if not dish:
        return None, "dish_not_found"
    tier = next((t for t in dish.tiers if t.level == level and t.lang == lang), None)
    if not tier:
        return None, "tier_not_found"

    content = tier.to_dict(full=True)
    digest = _digest(content)

    existing = RecipeContentSnapshot.query.filter_by(
        dish_slug=dish_slug, level=level, lang=lang, content_digest=digest
    ).first()
    if existing:
        return existing, None

    row = RecipeContentSnapshot(dish_slug=dish_slug, level=level, lang=lang, content=content, content_digest=digest)
    db.session.add(row)
    db.session.commit()
    return row, None


def check_snapshot_access(snapshot, user):
    """Re-runs access.py's tier/premium check against the snapshot's own
    dish_slug/level and the requester's *current* access — never whatever
    access they had when the session started (contract §1: a lapsed premium
    subscription must fail the very next read of an advanced snapshot, even
    though the client already holds the snapshot_id). Returns (allowed, reason)."""
    return tier_access(snapshot.level, user)
