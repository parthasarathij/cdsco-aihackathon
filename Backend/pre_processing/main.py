import os
import json

from api import app
from ocr.pipeline import DocumentPipeline
from ocr.utils.sort_utils import natural_sort_key
from ocr.utils.json_utils import clean_for_json
from renderer.pdf_renderer import PDFRenderer
from utils.logger import get_logger
from utils.blob_storage import (
    upload_file,
    upload_directory,
    blob_input_path,
    blob_output_json_path,
    blob_output_pdf_path,
    blob_logs_path,
    get_blob_url
)

from config import settings   



# LOGGER
logger = get_logger(settings.LOG_NAME)



# CREATE OUTPUT DIRS
if not settings.USE_AZURE_BLOB:
    os.makedirs(os.path.join(settings.OUTPUT_DIR, "json"), exist_ok=True)
    os.makedirs(os.path.join(settings.OUTPUT_DIR, "pdf"), exist_ok=True)


# MAIN PIPELINE
def process_folder(image_dir):
    # AUTO OUTPUT FILE NAMES
    folder_name = os.path.basename(os.path.normpath(image_dir))

    OUTPUT_JSON = os.path.join(settings.OUTPUT_DIR, "json", f"{folder_name}.json")
    OUTPUT_PDF = os.path.join(settings.OUTPUT_DIR, "pdf", f"{folder_name}.pdf")

    logger.info(f"Starting OCR Pipeline for folder: {folder_name}")

    image_files = sorted([
        f for f in os.listdir(image_dir)
        if f.lower().endswith((".png", ".jpg", ".jpeg"))
    ], key=natural_sort_key)

    if not image_files:
        logger.warning(f"No images found in {image_dir}, skipping.")
        return

    image_paths = [
        os.path.join(image_dir, f)
        for f in image_files
    ]

    pipeline = DocumentPipeline(
        layout_model_dir=settings.LAYOUT_MODEL_DIR,
        table_model_dir=settings.TABLE_MODEL_DIR
    )

    if settings.USE_AZURE_BLOB:
        asset_dir_config = {
            "use_blob": True,
            "job_name": folder_name
        }
    else:
        asset_dir_config = os.path.join(settings.ASSETS_DIR, folder_name)

    logger.info(f"Running OCR extraction stage for {len(image_paths)} images")
    document = pipeline.run(image_paths, asset_dir=asset_dir_config)

    logger.info("Saving JSON output")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(clean_for_json(document), f, indent=2)

    logger.info(f"JSON saved: {OUTPUT_JSON}")

    logger.info("Starting PDF rendering stage")

    renderer = PDFRenderer(
        json_path=OUTPUT_JSON,
        output_pdf=OUTPUT_PDF
    )

    renderer.run()

    logger.info(f"PDF generated: {OUTPUT_PDF}")

    if settings.USE_AZURE_BLOB:
        try:
            logger.info("Uploading results to Azure Blob Storage ...")
            
            # Upload JSON
            json_blob_url = upload_file(
                OUTPUT_JSON,
                blob_output_json_path(os.path.basename(OUTPUT_JSON)),
                content_type="application/json"
            )
            logger.info(f"JSON uploaded: {json_blob_url}")

            # Upload PDF
            pdf_blob_url = upload_file(
                OUTPUT_PDF,
                blob_output_pdf_path(os.path.basename(OUTPUT_PDF)),
                content_type="application/pdf"
            )
            logger.info(f"PDF uploaded: {pdf_blob_url}")

            # Upload input images
            upload_directory(
                image_dir,
                blob_input_path(folder_name)
            )
            logger.info(f"Input images uploaded for: {folder_name}")

            # Get log URL for reference
            if hasattr(logger, "log_filename"):
                log_url = get_blob_url(blob_logs_path(logger.log_filename))
                logger.info(f"Logs available at: {log_url}")

            #  cleanup local temp files after successful blob upload 
            try:
                import shutil
                from pathlib import Path
                
                logger.info("Cleaning up local temporary files...")
                
                # Remove output files
                if os.path.exists(OUTPUT_JSON):
                    os.remove(OUTPUT_JSON)
                if os.path.exists(OUTPUT_PDF):
                    os.remove(OUTPUT_PDF)
                    
                # Remove input image directory if it's not the root input dir
                if os.path.exists(image_dir) and image_dir != settings.INPUT_DIR:
                    shutil.rmtree(image_dir)
                    
                # Remove assets directory for this run if we can determine it
                asset_dir = os.path.join(settings.ASSETS_DIR, folder_name)
                if os.path.exists(asset_dir):
                    shutil.rmtree(asset_dir)
                    
                # Clean up empty parent directories
                for d in [os.path.join(settings.OUTPUT_DIR, "json"), 
                          os.path.join(settings.OUTPUT_DIR, "pdf"),
                          settings.INPUT_DIR,
                          settings.ASSETS_DIR]:
                    path = Path(d)
                    if path.exists() and not any(path.iterdir()):
                        try:
                            path.rmdir()
                        except Exception:
                            pass
                            
                logger.info("Local cleanup completed successfully.")
            except Exception as e:
                logger.warning(f"Local cleanup failed: {e}")

        except Exception as e:
            logger.error(f"Blob upload failed: {e}", exc_info=True)


def main():
    if settings.IMAGE_DIR:
        process_folder(settings.IMAGE_DIR)
    else:
        input_dir = "data/input"
        if os.path.exists(input_dir):
            subfolders = [os.path.join(input_dir, f) for f in os.listdir(input_dir) if os.path.isdir(os.path.join(input_dir, f))]
            if subfolders:
                logger.info(f"Found {len(subfolders)} subfolders in {input_dir}")
                for folder in subfolders:
                    process_folder(folder)
            else:
                # Try to process the input_dir itself if it contains images
                process_folder(input_dir)
        else:
            raise ValueError(f"{input_dir} directory not found")

    logger.info("All pipeline tasks completed successfully")




if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8080, reload=True)
