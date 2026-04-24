from .bbox_utils import iou
from utils.logger import get_logger
logger = get_logger(__name__)


def filter_noise(lines):
    filtered = []
    for ln in lines:
        x1, y1, x2, y2 = ln["bbox"]
        w = x2 - x1
        h = y2 - y1

        if w < 5 or h < 5:
            continue

        ratio = max(w / (h + 1e-6), h / (w + 1e-6))
        if ratio > 20:
            continue

        if ln["confidence"] < 0.7:
            continue

        filtered.append(ln)

    return filtered


def deduplicate_lines(lines, iou_thresh=0.8):
    unique = []

    for ln in lines:
        duplicate = False

        for u in unique:
            if iou(ln["bbox"], u["bbox"]) > iou_thresh:
                duplicate = True
                break

        if not duplicate:
            unique.append(ln)

    return unique


def deduplicate_lines_strict(lines):
    unique = []

    for ln in lines:
        duplicate = False

        for u in unique:
            iou_score = iou(ln["bbox"], u["bbox"])

            if iou_score > 0.5:
                duplicate = True
                break

            cx1 = (ln["bbox"][0] + ln["bbox"][2]) / 2
            cy1 = (ln["bbox"][1] + ln["bbox"][3]) / 2

            cx2 = (u["bbox"][0] + u["bbox"][2]) / 2
            cy2 = (u["bbox"][1] + u["bbox"][3]) / 2

            if abs(cx1 - cx2) < 5 and abs(cy1 - cy2) < 5:
                duplicate = True
                break

        if not duplicate:
            unique.append(ln)

    return unique