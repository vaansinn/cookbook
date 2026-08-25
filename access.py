"""
access.py — Recipe tier access control (P6 paywall).

Basic is public to everyone, including anonymous visitors. Intermediate
needs an account (any plan). Advanced needs a premium account. Every
route that serves or accepts recipe-tier content calls tier_access() so
the grocery list, week planner, and cook log can't be used as a side
door around the paywall the recipe page enforces.
"""


def tier_access(level, user):
    """Returns (allowed: bool, reason: str|None). reason is 'account' or
    'premium' when allowed is False -- what the user needs to unlock it."""
    if level == "basic":
        return True, None
    if level == "intermediate":
        if user:
            return True, None
        return False, "account"
    if level == "advanced":
        if user and user.plan == "premium":
            return True, None
        return False, "account" if not user else "premium"
    return True, None
