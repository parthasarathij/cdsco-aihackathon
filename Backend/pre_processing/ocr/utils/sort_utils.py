import re
from utils.logger import get_logger
logger = get_logger(__name__)

def natural_sort_key(s):
    return [
        int(text) if text.isdigit() else text.lower()
        for text in re.split('([0-9]+)', s)
    ]