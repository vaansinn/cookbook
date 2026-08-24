"""
scripts/sync_recipes.py — Markdown → Postgres sync for dishes/recipe tiers.

Source of truth: content/recipes/<dish-slug>/<level>.<lang>.md (YAML front
matter + markdown sections) and content/foods.json (per-100g nutrition table).

Ingredient line format (one per line under ## Ingredients):
    - <qty_g_or_ml>|<display text>|<food slug, or ~ to exclude from nutrition>
e.g.
    - 220|220 g dry spaghetti|pasta_dry
    - 0|Fresh coriander to serve (optional)|~

Every ingredient line MUST resolve to a known food slug or an explicit `~` —
a line with neither fails the sync loudly (with the exact file + line), so
the food table can never silently drift behind the recipes.

Run with the Flask app context (see the `sync-recipes` CLI command in app.py):
    flask sync-recipes
"""

import json
import os
import re
import sys

import yaml

CONTENT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content")
RECIPES_DIR = os.path.join(CONTENT_DIR, "recipes")
FOODS_PATH = os.path.join(CONTENT_DIR, "foods.json")

LEVEL_ORDER = ["basic", "intermediate", "advanced"]


class SyncError(Exception):
    pass


def load_foods():
    with open(FOODS_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def parse_front_matter(text, path):
    m = re.match(r"^---\s*\n(.*?\n)---\s*\n(.*)$", text, re.DOTALL)
    if not m:
        raise SyncError(f"{path}: missing YAML front matter (--- ... ---)")
    meta = yaml.safe_load(m.group(1)) or {}
    body = m.group(2)
    return meta, body


def parse_ingredient_line(line, path, line_no, foods):
    parts = line.split("|")
    if len(parts) != 3:
        raise SyncError(
            f"{path}:{line_no}: ingredient line must be 'qty|display text|food_slug or ~', got: {line!r}"
        )
    qty_raw, display, food_slug = (p.strip() for p in parts)
    try:
        qty_g = float(qty_raw)
    except ValueError:
        raise SyncError(f"{path}:{line_no}: quantity {qty_raw!r} is not a number")

    if food_slug == "~":
        food_slug = None
    elif food_slug not in foods:
        raise SyncError(
            f"{path}:{line_no}: unknown food slug '{food_slug}' — add it to content/foods.json "
            f"or mark this line with ~ if it should not count toward nutrition"
        )
    return {"qty_g": qty_g, "text": display, "food_slug": food_slug}


def parse_body(body, path, foods):
    lines = body.split("\n")
    section = None
    prep, ingredients, steps, notes = [], [], [], []
    for i, raw in enumerate(lines, start=1):
        line = raw.strip()
        if not line:
            continue
        if re.match(r"^##\s*prep", line, re.I):
            section = "prep"; continue
        if re.match(r"^##\s*ingredients", line, re.I):
            section = "ing"; continue
        if re.match(r"^##\s*instructions", line, re.I):
            section = "steps"; continue
        if re.match(r"^##\s*notes", line, re.I):
            section = "notes"; continue
        if line.startswith("##"):
            section = None; continue

        if section == "prep" and re.match(r"^[-*]\s+", line):
            prep.append(re.sub(r"^[-*]\s+", "", line))
        elif section == "ing" and re.match(r"^[-*]\s+", line):
            ingredients.append(parse_ingredient_line(re.sub(r"^[-*]\s+", "", line), path, i, foods))
        elif section == "steps" and re.match(r"^\d+[.)]\s+", line):
            steps.append(re.sub(r"^\d+[.)]\s+", "", line))
        elif section == "notes" and re.match(r"^[-*]\s+", line):
            notes.append(re.sub(r"^[-*]\s+", "", line))

    return prep, ingredients, steps, notes


def compute_nutrition(ingredients, serves, foods):
    totals = {"kcal": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0, "fiber_g": 0.0, "iron_mg": 0.0}
    for ing in ingredients:
        if not ing["food_slug"]:
            continue
        per100 = foods[ing["food_slug"]]["per_100g"]
        factor = ing["qty_g"] / 100.0
        for key in totals:
            totals[key] += per100.get(key, 0) * factor
    per_serving = {k: round(v / max(serves, 1), 1) for k, v in totals.items()}
    per_serving["kcal"] = round(per_serving["kcal"])  # whole calories read better
    return per_serving


def find_recipe_files():
    if not os.path.isdir(RECIPES_DIR):
        return []
    out = []
    for dish_slug in sorted(os.listdir(RECIPES_DIR)):
        dish_dir = os.path.join(RECIPES_DIR, dish_slug)
        if not os.path.isdir(dish_dir):
            continue
        for fname in sorted(os.listdir(dish_dir)):
            if not fname.endswith(".md"):
                continue
            m = re.match(r"^(basic|intermediate|advanced)\.(en|de)\.md$", fname)
            if not m:
                raise SyncError(f"{dish_dir}/{fname}: filename must be '<level>.<lang>.md'")
            out.append((dish_slug, m.group(1), m.group(2), os.path.join(dish_dir, fname)))
    return out


def sync(db, Dish, RecipeTier, FoodItem, verbose=print):
    foods = load_foods()

    # Upsert food_items table from foods.json
    existing_foods = {f.slug: f for f in FoodItem.query.all()}
    for slug, data in foods.items():
        row = existing_foods.get(slug)
        if row is None:
            row = FoodItem(slug=slug)
            db.session.add(row)
        row.names = data.get("names", {})
        row.per_100g = data["per_100g"]
        row.grams_per_unit = data.get("grams_per_unit", {})
    db.session.flush()

    files = find_recipe_files()
    if not files:
        raise SyncError(f"No recipe files found under {RECIPES_DIR}")

    seen_dishes = set()
    for dish_slug, level, lang, path in files:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        meta, body = parse_front_matter(text, path)
        for required in ("title", "cuisine", "meal_type", "serves", "tier_summary"):
            if required not in meta:
                raise SyncError(f"{path}: missing required front-matter field '{required}'")

        prep, ingredients, steps, notes = parse_body(body, path, foods)
        if not ingredients:
            raise SyncError(f"{path}: no ingredients parsed — check '## Ingredients' section")
        if not steps:
            raise SyncError(f"{path}: no instructions parsed — check '## Instructions' section")

        dish = Dish.query.filter_by(slug=dish_slug).first()
        if dish is None:
            dish = Dish(slug=dish_slug)
            db.session.add(dish)
        dish.cuisine = meta["cuisine"]
        dish.meal_type = meta["meal_type"]
        dish.methods = meta.get("methods", [])
        seen_dishes.add(dish_slug)
        db.session.flush()

        tier = RecipeTier.query.filter_by(dish_id=dish.id, level=level, lang=lang).first()
        if tier is None:
            tier = RecipeTier(dish_id=dish.id, level=level, lang=lang)
            db.session.add(tier)

        tier.title = meta["title"]
        tier.tier_summary = meta["tier_summary"]
        tier.serves = meta["serves"]
        tier.time_min = meta.get("time_min")
        tier.equipment = meta.get("equipment", [])
        tier.diet_flags = meta.get("diet_flags", [])
        tier.allergens = meta.get("allergens", [])
        tier.tags = meta.get("tags", [])
        tier.prep = prep
        tier.ingredients = [
            {"qty_g": i["qty_g"], "text": i["text"], "food_slug": i["food_slug"]} for i in ingredients
        ]
        tier.steps = steps
        tier.notes = notes
        tier.nutrition = compute_nutrition(ingredients, meta["serves"], foods)

        verbose(f"  {dish_slug} / {level} / {lang} — {tier.nutrition['kcal']} kcal/serving")

    db.session.commit()
    verbose(f"Synced {len(files)} recipe tiers across {len(seen_dishes)} dishes.")


if __name__ == "__main__":
    # Allows `python scripts/sync_recipes.py` for a quick dry parse-check
    # without touching the DB (front-matter + ingredient validation only).
    foods = load_foods()
    files = find_recipe_files()
    errors = 0
    for dish_slug, level, lang, path in files:
        try:
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
            meta, body = parse_front_matter(text, path)
            prep, ingredients, steps, notes = parse_body(body, path, foods)
            nutrition = compute_nutrition(ingredients, meta.get("serves", 2), foods)
            print(f"OK  {path} — {nutrition['kcal']} kcal/serving")
        except SyncError as e:
            print(f"ERR {e}")
            errors += 1
    sys.exit(1 if errors else 0)
