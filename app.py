"""
app.py — Flask application factory.

Creates and configures the Flask app, registers API blueprints, and serves
the compiled React frontend from /static. Pattern lifted from the Clea
wedding-planner app (D:\\Projects\\meal-planner) — same auth/JWT/CORS shape,
trimmed for this project's current scope (Talisman/rate-limiting/email flows
are deferred until P5 hardening, see PIPELINE.md).
"""

from flask import Flask, Response, abort, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_compress import Compress
from werkzeug.middleware.proxy_fix import ProxyFix
from dotenv import load_dotenv
from datetime import timedelta
import os
import re

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from runtime_config import PROXY_HEADERS, build_runtime_config, runtime_environment

# Created outside create_app() so models can import them without a circular import.
db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
bcrypt = Bcrypt()
compress = Compress()


def create_app(*, environment=None):
    mode = runtime_environment(os.environ, environment)
    if mode == "development" and os.environ.get("FLASK_SKIP_DOTENV") != "1":
        load_dotenv()
    # Validate every runtime setting before initializing extensions. Engine
    # construction is lazy with respect to connections; startup never probes DB.
    config = build_runtime_config(environment=mode)
    app = Flask(__name__)
    app.config.update(config)
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=30)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    from auth_identity import install_identity_checks
    install_identity_checks(jwt)
    bcrypt.init_app(app)
    compress.init_app(app)

    allowed_origins = app.config["API_CORS_ORIGINS"]
    if allowed_origins:
        CORS(app, resources={r"^/api(?:/|$)": {
            "origins": [re.compile(re.escape(origin) + r"\Z", re.IGNORECASE) for origin in allowed_origins],
        }}, always_send=False)

    app.wsgi_app = ProxyFix(app.wsgi_app, **{
        f"x_{header}": app.config[f"PROXY_FIX_X_{header.upper()}"]
        for header in PROXY_HEADERS
    })

    def is_api_request():
        return request.path == "/api" or request.path.startswith("/api/")

    @app.before_request
    def enforce_request_limit():
        if request.content_length is not None and request.content_length > app.config["MAX_CONTENT_LENGTH"]:
            abort(413)

    # Preserve HTTP status/headers, and leave JWT callbacks with the auth owner.
    def api_http_error(error):
        response = error.get_response()
        if is_api_request():
            response.set_data(app.json.dumps({"error": error.name}))
            response.mimetype = "application/json"
        return response

    for status in (404, 405, 413):
        app.register_error_handler(status, api_http_error)

    @app.after_request
    def defensive_api_headers(response):
        if is_api_request() or request.path in {"/health/live", "/health/ready"}:
            # A conservative default also covers optional-auth content and errors.
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.get("/health/live")
    def liveness():
        return jsonify(status="ok")

    @app.get("/health/ready")
    def readiness():
        try:
            # Separate connection: no user query, schema access, or session writes.
            with db.engine.connect() as connection:
                if connection.execute(text("SELECT 1")).scalar_one() != 1:
                    return jsonify(status="unavailable"), 503
        except SQLAlchemyError:
            # Do not echo or log driver messages, URLs, SQL, or credentials.
            return jsonify(status="unavailable"), 503
        return jsonify(status="ok")

    # ── Register API blueprints ───────────────────────────────────────────────
    from routes.auth import auth_bp
    from routes.recipes import recipes_bp
    from routes.groceries import groceries_bp
    from routes.progress import progress_bp
    from routes.glossary import glossary_bp
    from routes.favorites import favorites_bp
    from routes.meal_plans import meal_plans_bp
    from routes.snapshots import snapshots_bp
    from routes.lessons import lessons_bp
    from routes.reflections import reflections_bp
    from routes.planning import planning_bp
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(recipes_bp, url_prefix="/api")
    app.register_blueprint(groceries_bp, url_prefix="/api")
    app.register_blueprint(progress_bp, url_prefix="/api")
    app.register_blueprint(glossary_bp, url_prefix="/api")
    app.register_blueprint(favorites_bp, url_prefix="/api")
    app.register_blueprint(meal_plans_bp, url_prefix="/api")
    app.register_blueprint(snapshots_bp, url_prefix="/api")
    app.register_blueprint(lessons_bp, url_prefix="/api")
    app.register_blueprint(reflections_bp, url_prefix="/api")
    app.register_blueprint(planning_bp, url_prefix="/api/planning/v1")

    # ── CLI: flask sync-recipes ───────────────────────────────────────────────
    # Re-parses content/recipes/**/*.md + content/foods.json into Postgres.
    # Run manually after content changes — see scripts/sync_recipes.py.
    @app.cli.command("sync-recipes")
    def sync_recipes_cmd():
        from scripts.sync_recipes import sync, SyncError
        from models import Dish, RecipeTier, FoodItem
        try:
            sync(db, Dish, RecipeTier, FoodItem)
        except SyncError as e:
            print(f"Sync failed: {e}")
            raise SystemExit(1)

    # ── CLI: flask sync-glossary ──────────────────────────────────────────────
    @app.cli.command("sync-glossary")
    def sync_glossary_cmd():
        from scripts.sync_glossary import sync, SyncError
        from models import GlossaryEntry
        try:
            sync(db, GlossaryEntry)
        except SyncError as e:
            print(f"Sync failed: {e}")
            raise SystemExit(1)

    # ── CLI: flask sync-skills / flask sync-lessons ───────────────────────────
    # Re-parses content/lessons/**/*.md into Postgres (models.py's Skill +
    # Lesson tables). sync-lessons validates every lesson's recipe/step link
    # against actually-synced RecipeTier data and aborts the whole sync (no
    # partial publish) if any link doesn't resolve — see scripts/sync_learning.py.
    @app.cli.command("sync-skills")
    def sync_skills_cmd():
        from scripts.sync_learning import sync_skills, SyncError
        from models import Skill
        try:
            sync_skills(db, Skill)
        except SyncError as e:
            print(f"Sync failed: {e}")
            raise SystemExit(1)

    @app.cli.command("sync-lessons")
    def sync_lessons_cmd():
        from scripts.sync_learning import sync_lessons, SyncError
        from models import Skill, Lesson, RecipeTier
        try:
            sync_lessons(db, Skill, Lesson, RecipeTier)
        except SyncError as e:
            print(f"Sync failed: {e}")
            raise SystemExit(1)

    # ── SEO: sitemap + robots ──────────────────────────────────────────────────
    @app.route("/sitemap.xml")
    def sitemap():
        from models import Dish
        origin = os.environ.get("FRONTEND_URL", "https://" + os.environ.get("HEROKU_APP_NAME", "localhost"))
        urls = [origin + "/"] + [origin + f"/dish/{d.slug}" for d in Dish.query.all()]
        body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        body += "".join(f"  <url><loc>{u}</loc></url>\n" for u in urls)
        body += "</urlset>"
        return Response(body, mimetype="application/xml")

    @app.route("/robots.txt")
    def robots():
        origin = os.environ.get("FRONTEND_URL", "https://" + os.environ.get("HEROKU_APP_NAME", "localhost"))
        return Response(f"User-agent: *\nAllow: /\nSitemap: {origin}/sitemap.xml\n", mimetype="text/plain")

    # ── React SPA catchall ────────────────────────────────────────────────────
    # The React app builds into /static (see frontend/vite.config.js). Any URL
    # that isn't an API call or a real static file gets index.html so React
    # Router can handle it client-side. /dish/<slug> gets its <title>/<meta
    # description>/JSON-LD swapped in server-side first — see seo.py.
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_react(path):
        if path == "api" or path.startswith("api/"):
            abort(404)
        static_dir = app.static_folder
        if path and os.path.exists(os.path.join(static_dir, path)):
            # Only audited, account-independent build resources opt into the
            # worker's fallback cache. Dynamic recipe/SPA routes stay uncached.
            if re.fullmatch(r"assets/index-[A-Za-z0-9_-]{8,}\.(js|css)", path):
                return send_from_directory(static_dir, path, max_age=31536000)
            if path in {"index.html", "manifest.json", "icons/favicon-32.png", "icons/icon-192.png",
                        "icons/icon-512.png", "icons/icon-512-maskable.png",
                        "fonts/plus-jakarta-sans-variable.ttf", "fonts/plus-jakarta-sans-italic-variable.ttf",
                        "fonts/bricolage-grotesque-variable.ttf"}:
                return send_from_directory(static_dir, path, max_age=60)
            return send_from_directory(static_dir, path)

        index_path = os.path.join(static_dir, "index.html")
        parts = path.split("/") if path else []
        if len(parts) == 2 and parts[0] == "dish":
            from models import Dish
            from seo import build_recipe_head, inject_head
            dish = Dish.query.filter_by(slug=parts[1]).first()
            if dish:
                tier = next(
                    (t for t in dish.tiers if t.lang == "en" and t.level == "basic"),
                    next((t for t in dish.tiers if t.lang == "en"), None),
                )
                if tier:
                    with open(index_path, "r", encoding="utf-8") as f:
                        html_text = f.read()
                    title, description, json_ld = build_recipe_head(dish, tier)
                    return inject_head(html_text, title, description, json_ld)

        return send_from_directory(static_dir, "index.html", max_age=60 if not path else None)

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=app.config["RUNTIME_ENV"] == "development")
