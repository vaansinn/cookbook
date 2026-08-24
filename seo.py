"""
seo.py — Lightweight per-request meta/schema.org injection for /dish/<slug>.

This is not full SSR — React still renders the actual page client-side. It's
a cheap, scoped trick: swap the <title>/<meta description> and add a
schema.org Recipe JSON-LD block into the *served* index.html for recipe
URLs, so search engines and link previews see real content and structured
data even before JS runs. English only for now (bots get the EN version;
a logged-in user's own language preference still applies once the SPA
hydrates) — see PIPELINE.md.
"""

import json
import html as html_escape


def build_recipe_head(dish, tier):
    """Returns (title, description, json_ld_script_tag) for a dish's cheapest
    available tier — Basic if it exists, otherwise whatever's there."""
    title = f"{tier.title} — Recipe Drawer"
    ingredients_preview = ", ".join(i["text"] for i in (tier.ingredients or [])[:3])
    description = f"{tier.title} ({tier.level}) — {dish.cuisine}. " \
                  f"Serves {tier.serves}, ~{tier.time_min} min. {ingredients_preview}."

    nutrition = tier.nutrition or {}
    schema = {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": tier.title,
        "recipeCuisine": dish.cuisine,
        "recipeCategory": dish.meal_type,
        "recipeYield": f"{tier.serves} servings",
        "totalTime": f"PT{tier.time_min}M" if tier.time_min else None,
        "recipeIngredient": [i["text"] for i in (tier.ingredients or [])],
        "recipeInstructions": [{"@type": "HowToStep", "text": s} for s in (tier.steps or [])],
        "keywords": ", ".join(tier.tags or []),
    }
    if nutrition:
        schema["nutrition"] = {
            "@type": "NutritionInformation",
            "calories": f"{nutrition.get('kcal')} calories" if nutrition.get("kcal") else None,
            "proteinContent": f"{nutrition.get('protein_g')}g" if nutrition.get("protein_g") else None,
            "carbohydrateContent": f"{nutrition.get('carbs_g')}g" if nutrition.get("carbs_g") else None,
            "fiberContent": f"{nutrition.get('fiber_g')}g" if nutrition.get("fiber_g") else None,
        }
        schema["nutrition"] = {k: v for k, v in schema["nutrition"].items() if v is not None}
    schema = {k: v for k, v in schema.items() if v is not None}

    script_tag = f'<script type="application/ld+json">{json.dumps(schema)}</script>'
    return title, description, script_tag


def inject_head(html_text, title, description, json_ld_script):
    """String-replaces the default <title>/<meta description> in index.html
    and appends the JSON-LD block before </head>. Best-effort: if the markers
    aren't found (e.g. a build changed the shell), returns html unchanged."""
    esc_title = html_escape.escape(title)
    esc_desc = html_escape.escape(description)

    out = html_text
    if "<title>Recipe Drawer</title>" in out:
        out = out.replace("<title>Recipe Drawer</title>", f"<title>{esc_title}</title>", 1)
    if 'name="description"' in out:
        import re
        out = re.sub(
            r'<meta name="description" content="[^"]*"\s*/?>',
            f'<meta name="description" content="{esc_desc}" />',
            out,
            count=1,
        )
    if "</head>" in out:
        out = out.replace("</head>", f"{json_ld_script}</head>", 1)
    return out
