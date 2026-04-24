from reportlab.pdfgen import canvas
from utils.logger import get_logger
logger = get_logger(__name__)


# BBOX UTIL
def scale_bbox(bbox, sx, sy):
    x1, y1, x2, y2 = bbox
    return [
        x1 * sx,
        y1 * sy,
        x2 * sx,
        y2 * sy
    ]


def to_pdf_y(y, pdf_h):
    return pdf_h - y


# SORTING UTIL
def sort_blocks(blocks):
    return sorted(blocks, key=lambda b: (b["bbox"][1], b["bbox"][0]))


def sort_lines(lines):
    return sorted(lines, key=lambda l: l["bbox"][1])


# TEXT FIT UTIL
def fit_font_size(canvas, text, font_name, max_width, start_size=12):

    size = start_size

    while size > 5:
        if canvas.stringWidth(text, font_name, size) <= max_width:
            return size
        size -= 0.5

    return size