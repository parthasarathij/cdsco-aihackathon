import cv2
from utils.logger import get_logger
logger = get_logger(__name__)

MAX_SIZE = 4000 

def resize_image(img):
    h, w = img.shape[:2]
    scale = 1.0
    if max(h, w) > MAX_SIZE:
        scale = MAX_SIZE / max(h, w)
        img = cv2.resize(img, None, fx=scale, fy=scale)
    return img, scale


def crop(img, bbox):
    x1, y1, x2, y2 = map(int, bbox)
    return img[y1:y2, x1:x2], x1, y1