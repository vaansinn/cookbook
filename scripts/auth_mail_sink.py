"""Explicit development-only file mailbox; no SMTP, HTTP endpoint, or token logs."""
from email.message import EmailMessage
from pathlib import Path
import os
import secrets

ROOT = Path(__file__).resolve().parents[1]
INBOX = ROOT / ".local" / "auth-mail"


def local_mail_delivery(*, to, purpose, token):
    from flask import current_app
    if current_app.config.get("RUNTIME_ENV") != "development":
        raise RuntimeError("The local mailbox is unavailable outside development")
    if purpose not in {"reset", "verify"} or not isinstance(token, str):
        raise ValueError("Unsupported local message")
    message = EmailMessage()
    message["To"] = to
    message["From"] = "cookbook-local@example.test"
    message["Subject"] = "Cookbook development: " + ("reset password" if purpose == "reset" else "verify email")
    # Manual codes also work on the local-only Android build; domain app-links
    # will be configured separately. Never derive a link from a request Host.
    message.set_content("LOCAL TEST MESSAGE — not sent by email.\n\n"
        + ("Password reset" if purpose == "reset" else "Email verification")
        + " code (single use):\n\n" + token + "\n\n"
        + "Enter this code in the Cookbook account screen.\n")
    INBOX.mkdir(parents=True, exist_ok=True)
    path = INBOX / (secrets.token_hex(16) + ".eml")
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as output:
        output.write(message.as_bytes())
