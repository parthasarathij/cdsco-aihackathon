import cv2
from ocr.utils.image_utils import crop
from utils.logger import get_logger
logger = get_logger(__name__)


class TableProcessor:

    def add_cells(self, blocks, image, page_idx, table_service):

        for block in blocks:

            if block["type"] != "table":
                continue

            x1, y1, x2, y2 = map(int, block["bbox"])
            crop_img = image[y1:y2, x1:x2]

            results = table_service.detect(crop_img)

            cid = 1

            for res in results:
                for c in res["boxes"]:

                    cx1, cy1, cx2, cy2 = c["coordinate"]

                    gx1 = cx1 + x1
                    gy1 = cy1 + y1
                    gx2 = cx2 + x1
                    gy2 = cy2 + y1

                    block["table"]["cells"].append({
                        "cell_id": f"{block['block_id']}_c{cid}",
                        "bbox": [gx1, gy1, gx2, gy2],
                        "ocr": {"lines": []}
                    })

                    cid += 1

        return blocks