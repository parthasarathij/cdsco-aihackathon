from utils.logger import get_logger
logger = get_logger(__name__)

import cv2

from ocr.utils.image_utils import crop
from ocr.utils.bbox_utils import expand_bbox, iou, center_inside
from ocr.utils.dedup_utils import (
    deduplicate_lines,
    deduplicate_lines_strict,
)


class OCRAssigner:

    def __init__(self):
        self.global_seen = []

    def is_duplicate(self, bbox, thresh=0.85):
        bbox = tuple(map(float, bbox))
        for b in self.global_seen:
            if iou(bbox, b) > thresh:
                return True
        return False

    def process(self, blocks, image, ocr_service, w, h):

        self.global_seen = []

        unassigned = []

        # STAGE 1: GLOBAL OCR
        mask_img = image.copy()

        for block in blocks:

            if block["type"] in ["image", "seal", "table"]:
                x1, y1, x2, y2 = map(int, expand_bbox(block["bbox"], 5, w, h))
                cv2.rectangle(mask_img, (x1, y1), (x2, y2), (255, 255, 255), -1)

        ocr_lines = deduplicate_lines(ocr_service.run(mask_img))

        for line in ocr_lines:

            if self.is_duplicate(line["bbox"]):
                continue

            best_block = None
            best_score = 0

            for block in blocks:

                if block["type"] in ["table", "image", "seal"]:
                    continue

                score = iou(line["bbox"], block["bbox"])

                if center_inside(line["bbox"], block["bbox"]):
                    score += 0.5

                if score > best_score:
                    best_score = score
                    best_block = block

            if best_block and best_score > 0.3:
                best_block["ocr"]["lines"].append(line)
                self.global_seen.append(tuple(map(float, line["bbox"])))
            else:
                unassigned.append(line)

        # STAGE 2: TABLE OCR
        for block in blocks:

            if block["type"] != "table":
                continue

            for cell in block["table"]["cells"]:

                pad = 3
                padded = expand_bbox(cell["bbox"], pad, w, h)

                crop_img, ox, oy = crop(image, padded)

                lines = deduplicate_lines_strict(ocr_service.run(crop_img))

                cell_lines = []

                for ln in lines:

                    x1, y1, x2, y2 = ln["bbox"]

                    ln["bbox"] = [
                        x1 + ox,
                        y1 + oy,
                        x2 + ox,
                        y2 + oy
                    ]

                    cell_lines.append(ln)
                    self.global_seen.append(tuple(map(float, ln["bbox"])))

                cell["ocr"]["lines"] = deduplicate_lines(cell_lines)

        return blocks, unassigned