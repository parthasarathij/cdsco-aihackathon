from utils.logger import get_logger
logger = get_logger(__name__)
DOCUMENT_SCHEMA = {
    "document_id": str,
    "pages": [
        {
            "page_id": str,
            "width": int,
            "height": int,

            "blocks": [
                {
                    "block_id": str,
                    "type": str,
                    "bbox": list,
                    "score": float,

                    "ocr": {
                        "lines": [
                            {
                                "line_id": str,
                                "text": str,
                                "bbox": list,
                                "confidence": float
                            }
                        ]
                    },

                    "table": {
                        "table_id": str,
                        "cells": [
                            {
                                "cell_id": str,
                                "bbox": list,
                                "ocr": {
                                    "lines": []
                                }
                            }
                        ]
                    },

                    "asset": {
                        "type": str,
                        "path": str
                    }
                }
            ],

            "unassigned_ocr": [
                {
                    "line_id": str,
                    "text": str,
                    "bbox": list,
                    "confidence": float
                }
            ]
        }
    ]
}