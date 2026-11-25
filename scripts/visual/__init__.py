"""What the picture of a video adds: frames, on-screen text (OCR), and a vision model's scene labels.

Plan: ~/.claude/plans (2026-11-25), research note docs/research/2026-11-25-video-visual.md. Everything these scripts
write goes to a private store beside the repo (../.visual/<id>/), never into it: frames and raw model output stay
private; only reviewed text and labels are ever published.
"""
