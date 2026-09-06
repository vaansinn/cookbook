web: gunicorn app:app
release: flask db upgrade && flask sync-recipes && flask sync-glossary && flask sync-skills && flask sync-lessons
