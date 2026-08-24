"""
models.py — SQLAlchemy database models.

Table overview:
  users — registered accounts

Dish/recipe/nutrition/glossary/household tables land in P2-P3 once the
markdown-sync pipeline is built (see PIPELINE.md and the blueprint artifact).
"""

from app import db
from datetime import datetime


class User(db.Model):
    __tablename__ = "users"
    id            = db.Column(db.Integer, primary_key=True)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    display_name  = db.Column(db.String(100))
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)

    # Free tier is always Basic-only; paid unlocks Intermediate/Advanced.
    # Whether/when that gate actually gets enforced is still open (see blueprint P6).
    plan = db.Column(db.String(20), default="free", nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name,
            "plan": self.plan,
        }
