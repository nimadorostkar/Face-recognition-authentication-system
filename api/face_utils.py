"""
Face recognition utilities using dlib and OpenCV.

This module provides the core face pipeline:
- Image decoding (with EXIF orientation handling and size guards)
- Robust face detection with an enhanced fallback for hard frames
  (low light, small/angled faces, mild blur)
- Optional face-quality gating (blur / brightness / size)
- Optional passive anti-spoofing (screen / print replay heuristic)
- 128D face embedding extraction (optionally jittered for robustness)
- Distance / confidence helpers

Design notes
------------
The *normal* recognition path is intentionally kept identical to the
original implementation so that embeddings already stored in the database
remain comparable.  All accuracy/robustness additions are either:
  * additive fallbacks that only run when the normal path fails, or
  * opt-in features controlled by environment variables (default off /
    lenient) so they can be rolled out safely in production.

Tunable environment variables (all optional):
  FACE_DETECTION_MODEL      "hog" (default, CPU) | "cnn" (GPU)
  FACE_DETECT_UPSAMPLE      base upsample passes for detection (default 1)
  FACE_MAX_DIM              max image dimension before downscale (default 1024)
  FACE_ENHANCE_FALLBACK     enable CLAHE/upsample retry on miss (default 1)
  FACE_NUM_JITTERS          embedding jitters; higher = more robust/slower (default 1)
  FACE_QUALITY_GATE         "off" | "register" | "all"  (default "register")
  FACE_MIN_BLUR             min Laplacian variance, lower = blurrier (default 45.0)
  FACE_MIN_BRIGHTNESS       min mean luma 0-255 (default 40.0)
  FACE_MAX_BRIGHTNESS       max mean luma 0-255 (default 235.0)
  FACE_MIN_SIZE             min face box side in px (default 70)
  FACE_ANTISPOOF            enable passive anti-spoof check (default 0)
  FACE_ANTISPOOF_MIN_SCORE  min liveness score 0-1 to accept (default 0.45)
"""

import base64
import io
import logging
import os
from typing import List, Optional, Tuple

import cv2
import face_recognition
import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger(__name__)


# ── Configuration (env-tunable, safe defaults) ─────────────────────────

def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


DETECTION_MODEL = os.getenv("FACE_DETECTION_MODEL", "hog")
DETECT_UPSAMPLE = _env_int("FACE_DETECT_UPSAMPLE", 1)
MAX_DIM = _env_int("FACE_MAX_DIM", 1024)
# Detection runs on a downscaled copy for speed (HOG cost grows with pixel
# count). The embedding is still extracted from the full-resolution image, so
# stored embeddings stay comparable. 640px keeps a centered webcam face well
# above the detector's minimum while roughly halving detection latency.
DETECT_MAX_DIM = _env_int("FACE_DETECT_MAX_DIM", 640)
ENHANCE_FALLBACK = _env_bool("FACE_ENHANCE_FALLBACK", True)
NUM_JITTERS = max(1, _env_int("FACE_NUM_JITTERS", 1))
QUALITY_GATE = os.getenv("FACE_QUALITY_GATE", "register").strip().lower()
MIN_BLUR = _env_float("FACE_MIN_BLUR", 45.0)
MIN_BRIGHTNESS = _env_float("FACE_MIN_BRIGHTNESS", 40.0)
MAX_BRIGHTNESS = _env_float("FACE_MAX_BRIGHTNESS", 235.0)
MIN_FACE_SIZE = _env_int("FACE_MIN_SIZE", 70)
ANTISPOOF = _env_bool("FACE_ANTISPOOF", False)
ANTISPOOF_MIN_SCORE = _env_float("FACE_ANTISPOOF_MIN_SCORE", 0.45)


# ── Exceptions ─────────────────────────────────────────────────────────

class FaceRecognitionError(Exception):
    """Base class for face recognition errors."""
    pass


class NoFaceDetectedError(FaceRecognitionError):
    """Raised when no face is detected in the image."""
    pass


class MultipleFacesDetectedError(FaceRecognitionError):
    """Raised when multiple faces are detected (single face expected)."""
    pass


class InvalidImageError(FaceRecognitionError):
    """Raised when image format is invalid or corrupted."""
    pass


class LowQualityFaceError(FaceRecognitionError):
    """Raised when the detected face fails quality checks (blur/lighting/size)."""
    pass


class SpoofDetectedError(FaceRecognitionError):
    """Raised when the image is suspected to be a spoof (photo/screen replay)."""
    pass


# ── Decoding / preprocessing ───────────────────────────────────────────

def decode_image(base64_string: str) -> np.ndarray:
    """
    Decode a base64 string to an RGB numpy array.

    Handles data-URL prefixes, applies EXIF orientation (phones often store
    rotated images), and downscales very large images for speed/memory.
    """
    try:
        if ',' in base64_string:
            base64_string = base64_string.split(',', 1)[1]

        img_bytes = base64.b64decode(base64_string)
        pil_image = Image.open(io.BytesIO(img_bytes))

        # Respect EXIF orientation so sideways phone photos still detect faces.
        pil_image = ImageOps.exif_transpose(pil_image)

        img_array = np.array(pil_image.convert('RGB'))
    except Exception as e:
        raise InvalidImageError(f"Failed to decode image: {str(e)}")

    if img_array.size == 0:
        raise InvalidImageError("Decoded image is empty")

    # Downscale oversized images (keeps detection fast and memory bounded).
    h, w = img_array.shape[:2]
    longest = max(h, w)
    if MAX_DIM and longest > MAX_DIM:
        scale = MAX_DIM / float(longest)
        img_array = cv2.resize(
            img_array,
            (int(round(w * scale)), int(round(h * scale))),
            interpolation=cv2.INTER_AREA,
        )

    return img_array


def preprocess_image(image: np.ndarray, target_size: Optional[Tuple[int, int]] = None) -> np.ndarray:
    """Ensure the image is RGB and optionally resize it."""
    if target_size:
        image = cv2.resize(image, target_size, interpolation=cv2.INTER_AREA)

    if len(image.shape) == 2:  # Grayscale -> RGB
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:  # RGBA -> RGB
        image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)

    return image


def enhance_for_lowlight(image: np.ndarray) -> np.ndarray:
    """
    Improve contrast/brightness for hard frames using CLAHE on the luminance
    channel.  Only used as a *fallback* when normal detection finds no face,
    so it never alters the embeddings of cleanly-detected faces.
    """
    try:
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        l = clahe.apply(l)
        merged = cv2.merge((l, a, b))
        return cv2.cvtColor(merged, cv2.COLOR_LAB2RGB)
    except Exception:
        return image


# ── Detection ──────────────────────────────────────────────────────────

def detect_faces(
    image: np.ndarray,
    model: str = None,
    upsample: int = None,
) -> List[Tuple[int, int, int, int]]:
    """
    Detect faces, returning (top, right, bottom, left) boxes.

    `upsample` (number_of_times_to_upsample) improves detection of small or
    slightly off-angle faces at the cost of speed.
    """
    model = model or DETECTION_MODEL
    upsample = DETECT_UPSAMPLE if upsample is None else upsample
    return face_recognition.face_locations(
        image, number_of_times_to_upsample=upsample, model=model
    )


def _box_area(box: Tuple[int, int, int, int]) -> int:
    top, right, bottom, left = box
    return max(0, bottom - top) * max(0, right - left)


def _largest_face(boxes: List[Tuple[int, int, int, int]]) -> Tuple[int, int, int, int]:
    """Pick the most prominent (closest) face — the intended subject."""
    return max(boxes, key=_box_area)


def _downscale_for_detection(image: np.ndarray) -> Tuple[np.ndarray, float]:
    """
    Return a (possibly) downscaled copy of the image for fast detection plus
    the scale factor applied (small_dim = scale * full_dim).  Detection on a
    smaller image is dramatically cheaper for the HOG detector; boxes are
    mapped back to full resolution before embedding extraction.
    """
    h, w = image.shape[:2]
    longest = max(h, w)
    if not DETECT_MAX_DIM or longest <= DETECT_MAX_DIM:
        return image, 1.0
    scale = DETECT_MAX_DIM / float(longest)
    small = cv2.resize(
        image,
        (int(round(w * scale)), int(round(h * scale))),
        interpolation=cv2.INTER_AREA,
    )
    return small, scale


def _rescale_boxes(
    boxes: List[Tuple[int, int, int, int]],
    scale: float,
    bounds: Tuple[int, int],
) -> List[Tuple[int, int, int, int]]:
    """Map detection boxes from the downscaled image back to full resolution."""
    if scale == 1.0:
        return boxes
    h, w = bounds
    inv = 1.0 / scale
    out = []
    for top, right, bottom, left in boxes:
        out.append((
            max(0, min(h, int(round(top * inv)))),
            max(0, min(w, int(round(right * inv)))),
            max(0, min(h, int(round(bottom * inv)))),
            max(0, min(w, int(round(left * inv)))),
        ))
    return out


def detect_faces_robust(image: np.ndarray) -> Tuple[np.ndarray, List[Tuple[int, int, int, int]]]:
    """
    Multi-stage detection that returns the full-resolution image actually used
    and boxes in full-resolution coordinates.  Detection itself runs on a
    downscaled copy for speed; the embedding is always extracted from the
    full-res image so it stays comparable with previously enrolled users.

    Stages escalate only when needed, so the common case stays fast:
      1. Normal detection on the downscaled frame (fast path).
      2. Extra upsampling pass (small / angled faces).
      3. CLAHE low-light enhancement + upsampling (dim frames).
    """
    bounds = image.shape[:2]
    small, scale = _downscale_for_detection(image)

    boxes = detect_faces(small)
    if boxes:
        return image, _rescale_boxes(boxes, scale, bounds)

    # Stage 2: more upsampling (helps small/angled faces).
    boxes = detect_faces(small, upsample=DETECT_UPSAMPLE + 1)
    if boxes:
        return image, _rescale_boxes(boxes, scale, bounds)

    # Stage 3: low-light enhancement fallback (on full image, then downscale).
    if ENHANCE_FALLBACK:
        enhanced = enhance_for_lowlight(image)
        e_small, e_scale = _downscale_for_detection(enhanced)
        boxes = detect_faces(e_small, upsample=DETECT_UPSAMPLE + 1)
        if boxes:
            return enhanced, _rescale_boxes(boxes, e_scale, enhanced.shape[:2])

    return image, []


# ── Quality assessment ─────────────────────────────────────────────────

def _crop(image: np.ndarray, box: Tuple[int, int, int, int]) -> np.ndarray:
    top, right, bottom, left = box
    top, left = max(0, top), max(0, left)
    return image[top:bottom, left:right]


def assess_quality(image: np.ndarray, box: Tuple[int, int, int, int]) -> dict:
    """
    Compute simple, fast quality metrics for the detected face crop.

    Returns a dict with: blur (Laplacian variance), brightness (mean luma),
    size (min box side, px) and an `ok`/`reason` verdict against thresholds.
    """
    face = _crop(image, box)
    if face.size == 0:
        return {"ok": False, "reason": "empty_crop", "blur": 0.0, "brightness": 0.0, "size": 0}

    gray = cv2.cvtColor(face, cv2.COLOR_RGB2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    top, right, bottom, left = box
    size = int(min(bottom - top, right - left))

    ok, reason = True, None
    if size < MIN_FACE_SIZE:
        ok, reason = False, "face_too_small"
    elif blur < MIN_BLUR:
        ok, reason = False, "too_blurry"
    elif brightness < MIN_BRIGHTNESS:
        ok, reason = False, "too_dark"
    elif brightness > MAX_BRIGHTNESS:
        ok, reason = False, "overexposed"

    return {"ok": ok, "reason": reason, "blur": blur, "brightness": brightness, "size": size}


# ── Passive anti-spoofing (heuristic) ──────────────────────────────────

def liveness_score(image: np.ndarray, box: Tuple[int, int, int, int]) -> float:
    """
    Lightweight passive liveness/anti-spoof score in [0, 1].

    Heuristic only (no extra model): printed photos and phone/monitor
    replays tend to be either unusually flat in micro-texture or contain
    high-frequency screen-door / moiré energy and clipped colour.  We combine
    a texture-richness term and a high-frequency-energy penalty.  This is a
    deterrent, not a guarantee — for high-security deployments pair it with a
    dedicated CNN liveness model or active challenge-response.

    Returns ~1.0 for likely-live faces, lower for suspected replays.
    """
    face = _crop(image, box)
    if face.size == 0:
        return 0.0

    gray = cv2.cvtColor(face, cv2.COLOR_RGB2GRAY).astype(np.float32)
    gray = cv2.resize(gray, (128, 128), interpolation=cv2.INTER_AREA)

    # Texture richness: live skin has moderate-to-high local variance.
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    texture_term = min(1.0, lap_var / 150.0)  # saturates around a healthy value

    # High-frequency energy ratio: screen replays push energy into very high
    # frequencies (pixel grid / moiré). Excess => penalty.
    f = np.fft.fftshift(np.fft.fft2(gray))
    mag = np.abs(f)
    total = float(mag.sum()) + 1e-6
    cy, cx = 64, 64
    yy, xx = np.ogrid[:128, :128]
    high = (yy - cy) ** 2 + (xx - cx) ** 2 > (45 ** 2)
    high_ratio = float(mag[high].sum()) / total
    hf_penalty = min(1.0, max(0.0, (high_ratio - 0.35) / 0.4))

    score = max(0.0, min(1.0, 0.65 * texture_term + 0.35 * (1.0 - hf_penalty)))
    return score


# ── Embedding ──────────────────────────────────────────────────────────

def extract_face_embedding(
    image: np.ndarray,
    face_location: Tuple[int, int, int, int],
    num_jitters: int = None,
) -> List[float]:
    """
    Extract a 128D embedding for the given face box.

    `num_jitters` re-samples the face with small perturbations and averages
    the results for a more stable embedding (slower).  Default keeps the
    original single-pass behaviour for backward compatibility.
    """
    num_jitters = NUM_JITTERS if num_jitters is None else num_jitters
    # NOTE: the landmark model is left at the library default so embeddings
    # stay comparable with users enrolled before this change. num_jitters
    # defaults to 1 (identical output); raising it improves robustness but
    # changes embeddings, so re-enrollment is needed if you increase it.
    encodings = face_recognition.face_encodings(
        image, [face_location], num_jitters=num_jitters
    )
    if len(encodings) == 0:
        raise NoFaceDetectedError("Failed to extract face encoding")
    return encodings[0].tolist()


def get_face_embedding_from_image(
    base64_image: str,
    require_single_face: bool = True,
    enforce_quality: Optional[bool] = None,
    enforce_liveness: Optional[bool] = None,
    purpose: str = "recognize",
) -> List[float]:
    """
    End-to-end pipeline: base64 image -> 128D embedding.

    Backward compatible: existing callers get the same behaviour plus the new
    robust detection fallback.  Quality/liveness enforcement is opt-in and
    governed by environment configuration unless explicitly overridden.

    Args:
        base64_image: Base64-encoded image.
        require_single_face: Reject images with more than one face.
        enforce_quality: Force-enable/disable quality gate (overrides config).
        enforce_liveness: Force-enable/disable anti-spoof (overrides config).
        purpose: "register" or "recognize" — controls default quality gating.

    Raises:
        InvalidImageError, NoFaceDetectedError, MultipleFacesDetectedError,
        LowQualityFaceError, SpoofDetectedError
    """
    image = decode_image(base64_image)
    image = preprocess_image(image)

    # Robust, escalating detection (uses enhanced image only if needed).
    used_image, face_locations = detect_faces_robust(image)

    if len(face_locations) == 0:
        raise NoFaceDetectedError("No face detected in the image")

    if len(face_locations) > 1 and require_single_face:
        raise MultipleFacesDetectedError(
            f"Multiple faces detected ({len(face_locations)}). "
            "Please provide an image with a single face."
        )

    # Choose the most prominent face (robust even if require_single_face=False).
    face_location = _largest_face(face_locations)

    # ── Quality gate ──
    if enforce_quality is None:
        enforce_quality = QUALITY_GATE == "all" or (
            QUALITY_GATE == "register" and purpose == "register"
        )
    if enforce_quality:
        q = assess_quality(used_image, face_location)
        if not q["ok"]:
            raise LowQualityFaceError(
                f"Face quality insufficient ({q['reason']}): "
                f"blur={q['blur']:.0f}, brightness={q['brightness']:.0f}, size={q['size']}px"
            )

    # ── Passive anti-spoof ──
    if enforce_liveness is None:
        enforce_liveness = ANTISPOOF
    if enforce_liveness:
        score = liveness_score(used_image, face_location)
        if score < ANTISPOOF_MIN_SCORE:
            raise SpoofDetectedError(
                f"Liveness check failed (score={score:.2f} < {ANTISPOOF_MIN_SCORE:.2f}). "
                "Please look directly at the camera in good lighting."
            )

    return extract_face_embedding(used_image, face_location)


# ── Distance / confidence ──────────────────────────────────────────────

def calculate_face_distance(embedding1: List[float], embedding2: List[float]) -> float:
    """Euclidean (L2) distance between two embeddings (lower = more similar)."""
    emb1 = np.asarray(embedding1, dtype=np.float64)
    emb2 = np.asarray(embedding2, dtype=np.float64)
    return float(np.linalg.norm(emb1 - emb2))


def get_confidence_level(distance: float) -> str:
    """
    Map an L2 distance (matching the DB `<->` query) to a confidence label.

    dlib/face_recognition embeddings: same-person L2 distances are typically
    well under ~0.4, the library's default decision tolerance is 0.6.

    - < 0.35: high
    - 0.35-0.45: medium
    - >= 0.45: low
    """
    if distance < 0.35:
        return "high"
    elif distance < 0.45:
        return "medium"
    return "low"
