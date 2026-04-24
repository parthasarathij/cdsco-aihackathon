from utils.logger import get_logger
logger = get_logger(__name__)
def expand_bbox(bbox, pad, w, h):
    x1, y1, x2, y2 = bbox
    return [
        max(0, x1 - pad),
        max(0, y1 - pad),
        min(w, x2 + pad),
        min(h, y2 + pad)
    ]


def center_inside(child, parent):
    cx = (child[0] + child[2]) / 2
    cy = (child[1] + child[3]) / 2
    return parent[0] <= cx <= parent[2] and parent[1] <= cy <= parent[3]


def iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    inter = max(0, xB - xA) * max(0, yB - yA)
    areaA = (boxA[2]-boxA[0])*(boxA[3]-boxA[1])
    areaB = (boxB[2]-boxB[0])*(boxB[3]-boxB[1])

    return inter / (areaA + areaB - inter + 1e-6)

    