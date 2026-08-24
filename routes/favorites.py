"""
routes/favorites.py — Per-user dish favorites (heart button).
"""

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from models import Favorite, Dish

favorites_bp = Blueprint("favorites", __name__)


@favorites_bp.route("/favorites", methods=["GET"])
@jwt_required()
def list_favorites():
    user_id = int(get_jwt_identity())
    slugs = [f.dish_slug for f in Favorite.query.filter_by(user_id=user_id).all()]
    return jsonify({"dish_slugs": slugs})


@favorites_bp.route("/favorites/<slug>", methods=["POST"])
@jwt_required()
def add_favorite(slug):
    user_id = int(get_jwt_identity())
    if not Dish.query.filter_by(slug=slug).first():
        return jsonify({"error": "Dish not found"}), 404
    if not Favorite.query.filter_by(user_id=user_id, dish_slug=slug).first():
        db.session.add(Favorite(user_id=user_id, dish_slug=slug))
        db.session.commit()
    return jsonify({"favorited": True}), 201


@favorites_bp.route("/favorites/<slug>", methods=["DELETE"])
@jwt_required()
def remove_favorite(slug):
    user_id = int(get_jwt_identity())
    Favorite.query.filter_by(user_id=user_id, dish_slug=slug).delete()
    db.session.commit()
    return jsonify({"favorited": False})
