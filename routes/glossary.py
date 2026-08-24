"""routes/glossary.py — Technique & nutrition glossary, public read-only."""

from flask import Blueprint, request, jsonify
from models import GlossaryEntry

glossary_bp = Blueprint("glossary", __name__)


@glossary_bp.route("/glossary", methods=["GET"])
def list_glossary():
    lang = request.args.get("lang", "en")
    entries = GlossaryEntry.query.all()
    return jsonify([e.to_dict(lang) for e in entries])


@glossary_bp.route("/glossary/<slug>", methods=["GET"])
def get_glossary_entry(slug):
    lang = request.args.get("lang", "en")
    entry = GlossaryEntry.query.filter_by(slug=slug).first()
    if not entry:
        return jsonify({"error": "Not found"}), 404
    return jsonify(entry.to_dict(lang))
