import json
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from utils.logger import get_logger

from renderer.utils import (
    scale_bbox,
    to_pdf_y,
    sort_blocks,
    sort_lines,
    fit_font_size
)


class PDFRenderer:

    def __init__(self, json_path, output_pdf):

        self.json_path = json_path
        
        # Ensure output_pdf path ends with .pdf and convert to string
        output_pdf_path = Path(output_pdf)
        if output_pdf_path.suffix.lower() != '.pdf':
            output_pdf_path = output_pdf_path.with_suffix('.pdf')
        
        self.output_pdf = str(output_pdf_path)

        self.pdf_w, self.pdf_h = A4
        self.c = canvas.Canvas(self.output_pdf, pagesize=A4)

        self.logger = get_logger("PDF_RENDERER")

    # LOAD JSON
    def load(self):
        with open(self.json_path, "r", encoding="utf-8") as f:
            self.data = json.load(f)

        self.pages = self.data["pages"]

    # TEXT RENDER
    def draw_text_lines(self, lines, sx, sy, bold=False):

        if not lines:
            return

        font_name = "Helvetica-Bold" if bold else "Helvetica"

        lines = sort_lines(lines)

        for ln in lines:

            x1, y1, x2, y2 = scale_bbox(ln["bbox"], sx, sy)

            text = ln["text"]
            pdf_y = to_pdf_y(y2, self.pdf_h)

            max_width = x2 - x1 - 2

            font_size = min(max((y2 - y1) * 0.8, 6), 14)
            font_size = fit_font_size(self.c, text, font_name, max_width, font_size)

            self.c.setFont(font_name, font_size)
            self.c.drawString(x1, pdf_y, text)

    # TABLE
    def draw_table(self, block, sx, sy):

        for cell in block["table"]["cells"]:

            x1, y1, x2, y2 = scale_bbox(cell["bbox"], sx, sy)
            pdf_y = to_pdf_y(y2, self.pdf_h)

            self.c.rect(x1, pdf_y, x2 - x1, y2 - y1)

            self.draw_text_lines(cell["ocr"]["lines"], sx, sy)

    # IMAGE
    def draw_image(self, block, sx, sy):

        x1, y1, x2, y2 = scale_bbox(block["bbox"], sx, sy)
        pdf_y = to_pdf_y(y2, self.pdf_h)

        try:
            self.c.drawImage(
                block["asset"]["path"],
                x1,
                pdf_y,
                width=(x2 - x1),
                height=(y2 - y1)
            )
        except:
            pass

    # PAGE RENDER
    def render_page(self, page):

        sx = self.pdf_w / page["width"]
        sy = self.pdf_h / page["height"]

        blocks = sort_blocks(page["blocks"])
        unassigned = page.get("unassigned_ocr", [])

        # 1. TABLES
        for b in blocks:
            if b["type"] == "table":
                self.draw_table(b, sx, sy)

        # 2. IMAGES / SEALS
        for b in blocks:
            if b["type"] in ["image", "seal"]:
                self.draw_image(b, sx, sy)

        # 3. TEXT BLOCKS
        for b in blocks:
            if b["type"] not in ["table", "image", "seal"]:

                bold = b["type"] in [
                    "header",
                    "doc_title",
                    "paragraph_title",
                    "figure_table_title"
                ]

                self.draw_text_lines(
                    b.get("ocr", {}).get("lines", []),
                    sx,
                    sy,
                    bold
                )

        # 4. LEFTOVER OCR
        self.draw_text_lines(unassigned, sx, sy, bold=False)

        self.c.showPage()

    # RUN
    def run(self):

        self.logger.info("Loading JSON")
        self.load()

        self.logger.info(f"Pages found: {len(self.pages)}")

        for i, page in enumerate(self.pages):
            self.logger.info(f"Rendering page {i+1}/{len(self.pages)}")
            self.render_page(page)

        # Save the canvas and ensure file is written
        self.c.save()
        
        # Verify file exists with .pdf extension
        if not Path(self.output_pdf).exists():
            raise RuntimeError(f"PDF file was not created: {self.output_pdf}")

        self.logger.info(f"PDF saved: {self.output_pdf}")
        self.logger.info("PDF rendering completed successfully")

