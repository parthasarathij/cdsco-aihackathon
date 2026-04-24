import os
import uuid
import cv2
import logging
from utils.logger import get_logger

from ocr.services.layout_service import LayoutService
from ocr.services.table_service import TableService
from ocr.services.ocr_service import OCRService

from ocr.processors.block_processor import BlockProcessor
from ocr.processors.table_processor import TableProcessor
from ocr.processors.ocr_assigner import OCRAssigner

from ocr.utils.image_utils import resize_image

logger = get_logger(__name__)

class DocumentPipeline:

    def __init__(self, layout_model_dir, table_model_dir):
        """
        Initialize the OCR pipeline with layout and table models.
        """
        self.layout_service = LayoutService(layout_model_dir)
        self.table_service = TableService(table_model_dir)
        self.ocr_service = OCRService()

        self.block_processor = BlockProcessor()
        self.table_processor = TableProcessor()
        self.ocr_assigner = OCRAssigner()

    def process_page(self, image_path, page_idx, asset_dir=None):
        """
        asset_dir: folder where image/seal crops for this page are saved.
                   Passed through to BlockProcessor.build_blocks so that
                   every job writes assets to its own isolated directory.
        """
        orig_img = cv2.imread(image_path)
        resized_img, _ = resize_image(orig_img)
        h, w = resized_img.shape[:2]

        layout_results = self.layout_service.detect(resized_img)

        # Pass asset_dir explicitly — never relies on instance state
        blocks = self.block_processor.build_blocks(
            layout_results,
            resized_img,
            page_idx,
            asset_dir=asset_dir
        )

        blocks = self.block_processor.remove_nested(blocks)

        blocks = self.table_processor.add_cells(
            blocks,
            resized_img,
            page_idx,
            self.table_service
        )

        blocks, unassigned = self.ocr_assigner.process(
            blocks,
            resized_img,
            self.ocr_service,
            w,
            h
        )

        return {
            "page_id": f"p{page_idx}",
            "width": w,
            "height": h,
            "blocks": blocks,
            "unassigned_ocr": unassigned
        }

    def run(self, image_files, asset_dir=None):
        """
        image_files: list of image paths (one per page).
        asset_dir:   folder where ALL asset crops for this run are saved.
                     When None, falls back to BlockProcessor's default ("assets").
        """
        pages = []

        for idx, img_path in enumerate(image_files, start=1):
            logger.info(f"Processing page {idx}: {img_path}")

            page = self.process_page(img_path, idx, asset_dir=asset_dir)
            pages.append(page)

        return {
            "document_id": str(uuid.uuid4()),
            "pages": pages
        }