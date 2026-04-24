from paddleocr import PaddleOCR
from utils.logger import get_logger
logger = get_logger(__name__)


class OCRService:

    def __init__(self):
        self.engine = PaddleOCR(
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False, # For GPU setup keep True
            use_doc_unwarping=False,            # For GPU setup keep True
            use_textline_orientation=False,     # For GPU setup keep True
            device="cpu"
        )

    def run(self, img):
        results = self.engine.predict(img)

        lines = []
        lid = 1

        for res in results:
            for box, text, score in zip(
                res['rec_boxes'],
                res['rec_texts'],
                res['rec_scores']
            ):
                if score < 0.7:
                    continue

                x1, y1, x2, y2 = box

                lines.append({
                    "line_id": f"l{lid}",
                    "text": text.strip(),
                    "bbox": [float(x1), float(y1), float(x2), float(y2)],
                    "confidence": float(score)
                })
                lid += 1

        return lines