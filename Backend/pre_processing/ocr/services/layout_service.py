from paddleocr import LayoutDetection
from utils.logger import get_logger
logger = get_logger(__name__)


class LayoutService:

    def __init__(self, model_dir):
        self.model = LayoutDetection(
            model_dir=model_dir,
            device="cpu"
        )

    def detect(self, img):
        return self.model.predict(img)