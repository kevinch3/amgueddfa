import pytest


@pytest.fixture(autouse=True)
def _fixed_common_words(monkeypatch):
    """Window keys must not depend on this machine's dictionary or on the published transcripts."""
    from scripts.reconstruct import context
    monkeypatch.setattr(context, "common_words", lambda: frozenset({"tiene", "danza", "nancy", "buenas", "noches"}))
