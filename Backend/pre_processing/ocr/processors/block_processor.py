import os
import cv2
from utils.logger import get_logger
logger = get_logger(__name__)

from ocr.utils.image_utils import crop
from ocr.utils.bbox_utils import iou


class BlockProcessor:

    def __init__(self, asset_dir="assets"):
        # default kept for CLI / main.py compatibility
        self.asset_dir = asset_dir

    def build_blocks(self, layout_results, image, page_idx, asset_dir=None):
        """
        Build layout blocks from detection results.

        asset_dir: where image/seal crops are saved for THIS call.
                   When provided it takes priority over self.asset_dir,
                   which ensures each API job writes to its own isolated
                   folder and the paths stored in block["asset"]["path"]
                   always point to the correct job directory.
        """
        active_asset_dir = asset_dir if asset_dir is not None else self.asset_dir
        if not isinstance(active_asset_dir, dict):
            os.makedirs(active_asset_dir, exist_ok=True)

        blocks = []
        bid, tid = 1, 1

        for res in layout_results:
            for box in res["boxes"]:
                bbox = list(map(float, box["coordinate"]))

                block = {
                    "block_id": f"b{bid}",
                    "type": box["label"],
                    "bbox": bbox,
                    "score": float(box["score"])
                }

                if block["type"] == "table":
                    block["table"] = {
                        "table_id": f"t{tid}",
                        "cells": []
                    }
                    tid += 1

                elif block["type"] in ["image", "seal"]:
                    crop_img, _, _ = crop(image, bbox)

                    # If asset_dir is a dict, it's a signal to upload directly to blob
                    if isinstance(asset_dir, dict) and asset_dir.get("use_blob"):
                        from utils.blob_storage import upload_bytes, blob_assets_path
                        
                        job_name = asset_dir.get("job_name", "unknown_job")
                        filename = f"p{page_idx}_{block['block_id']}.png"
                        blob_path = blob_assets_path(job_name, filename)
                        
                        # Encode image to bytes
                        success, encoded_img = cv2.imencode('.png', crop_img)
                        if success:
                            img_bytes = encoded_img.tobytes()
                            # Upload directly to blob storage
                            url = upload_bytes(img_bytes, blob_path, content_type="image/png")
                            
                            block["asset"] = {
                                "type": block["type"],
                                "path": url,
                                "is_blob": True
                            }
                        else:
                            block["asset"] = {"type": block["type"], "path": ""}
                            
                    else:
                        # Fallback to local save
                        active_asset_dir = asset_dir if asset_dir is not None else self.asset_dir
                        if not isinstance(active_asset_dir, dict):
                            os.makedirs(active_asset_dir, exist_ok=True)
                            path = os.path.join(
                                active_asset_dir,
                                f"p{page_idx}_{block['block_id']}.png"
                            )
                            cv2.imwrite(path, crop_img)

                            block["asset"] = {
                                "type": block["type"],
                                "path": path
                            }
                        else:
                            block["asset"] = {"type": block["type"], "path": ""}

                else:
                    block["ocr"] = {"lines": []}


                blocks.append(block)
                bid += 1

        return blocks

    def remove_nested(self, blocks, iou_thresh=0.8):
        filtered = []

        for i, b1 in enumerate(blocks):
            keep = True

            for j, b2 in enumerate(blocks):
                if i == j:
                    continue

                if b1["type"] != b2["type"]:
                    continue

                iou_val = iou(b1["bbox"], b2["bbox"])

                if iou_val > iou_thresh:
                    area1 = (
                        (b1["bbox"][2] - b1["bbox"][0]) *
                        (b1["bbox"][3] - b1["bbox"][1])
                    )
                    area2 = (
                        (b2["bbox"][2] - b2["bbox"][0]) *
                        (b2["bbox"][3] - b2["bbox"][1])
                    )

                    if area1 < area2:
                        keep = False
                        break

            if keep:
                filtered.append(b1)

        return filtered