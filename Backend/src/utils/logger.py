from __future__ import annotations

import logging

# Reuse the shared backend logger (no console logging; blob/file only).
from utils.logger import get_logger as _get_logger


def get_logger(name: str) -> logging.Logger:
    return _get_logger(name)
