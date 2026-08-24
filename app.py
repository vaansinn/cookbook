"""
app.py — Flask application factory.

Creates and configures the Flask app, registers API blueprints, and serves
the compiled React frontend from /static. Pattern lifted from the Clea
wedding-planner app (D:\\Projects\\meal-planner) — same auth/JWT/CORS shape,
trimmed for this project's current scope (Talisman/rate-limiting/email flows
are deferred until P5 hardening, see PIPELINE.md).
"""

from flask import Flask, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from dotenv import load_dotenv
from datetime import timedelta
import os

load_dotenv()

# Created outside create_app() so models can import them without a circular import.
db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
bcrypt = Bcrypt()


def create_app():
    app = Flask(__name__)

    # ── Database ──────────────────────────────────────────────────────────────
    db_url = os.environ.get("DATABASE_URL", "sqlite:///cookbook.db")
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # ── Auth ──────────────────────────────────────────────────────────────────
    is_dev = os.environ.get("FLASK_ENV") == "development"
    jwt_secret = os.environ.get("JWT_SECRET_KEY")
    if not jwt_secret:
        if not is_dev:
            raise RuntimeError("JWT_SECRET_KEY must be set in production")
        jwt_secret = "dev-secret"
    app.config["JWT_SECRET_KEY"] = jwt_secret
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=30)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    bcrypt.init_app(app)

    allowed_origins = [
        os.environ.get("FRONTEND_URL", "http://localhost:5173"),
        "http://localhost:5173",
    ]
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    # Trust Heroku's proxy headers so request.is_secure is correct behind the router.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    # ── Register API blueprints ───────────────────────────────────────────────
    from routes.auth import auth_bp
    from routes.recipes import recipes_bp
    from routes.groceries import groceries_bp
    from routes.progress import progress_bp
    from routes.glossary import glossary_bp
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(recipes_bp, url_prefix="/api")
    app.register_blueprint(groceries_bp, url_prefix="/api")
    app.register_blueprint(progress_bp, url_prefix="/api")
    app.register_blueprint(glossary_bp, url_prefix="/api")

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

    # ── React SPA catchall ────────────────────────────────────────────────────
    # The React app builds into /static (see frontend/vite.config.js). Any URL
    # that isn't an API call or a real static file gets index.html so React
    # Router can handle it client-side.
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_react(path):
        static_dir = os.path.join(os.path.dirname(__file__), "static")
        if path and os.path.exists(os.path.join(static_dir, path)):
            return send_from_directory(static_dir, path)
        return send_from_directory(static_dir, "index.html")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
