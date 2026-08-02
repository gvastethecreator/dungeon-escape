"""Cut out pickup HUD icons with Lucida (preferred) or rembg/black-flood fallbacks.

Follows the spritesheet-expert Lucida contract:
  model egeorcun/lucida @ 6ee11122534c8de59402a589d2293c198cfbf848
  soft alpha for illustrated icons (glow-friendly)

Usage:
  python scripts/process-pickup-icons.py
  python scripts/process-pickup-icons.py --method lucida
  python scripts/process-pickup-icons.py --method rembg
  python scripts/process-pickup-icons.py --method black-flood
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets-source" / "imagegen" / "pickup-icons-v2"
OUT = ROOT / "public" / "assets" / "ui" / "pickup-icons"
MANIFEST = ROOT / "assets-source" / "runtime-metadata" / "ui" / "pickup-icons" / "manifest.json"
CELL = 128
PADDING = 0.08  # fraction of cell left empty around subject

# Lucida pin from spritesheet-expert.
LUCIDA_MODEL = "egeorcun/lucida"
LUCIDA_REVISION = "6ee11122534c8de59402a589d2293c198cfbf848"
LUCIDA_INPUT = 1024

ICONS = [
    "cull-brand",
    "mirror-curse",
    "spin-curse",
    "phoenix-egg",
]


def square_crop(image: Image.Image) -> Image.Image:
    width, height = image.size
    side = min(width, height)
    left = (width - side) // 2
    top = (height - side) // 2
    return image.crop((left, top, left + side, top + side))


def is_near_black(r: int, g: int, b: int, limit: int = 22) -> bool:
    return max(r, g, b) <= limit


def flood_key_black(image: Image.Image, limit: int = 22) -> Image.Image:
    """Clear near-black plate connected to edges (good for solid #000 sources)."""
    rgba = square_crop(image.convert("RGBA"))
    pixels = rgba.load()
    assert pixels is not None
    width, height = rgba.size
    for y in range(height):
        for x in range(width):
            r, g, b, _a = pixels[x, y]
            pixels[x, y] = (r, g, b, 255)

    seeds: list[tuple[int, int]] = []
    for x in range(width):
        seeds.append((x, 0))
        seeds.append((x, height - 1))
    for y in range(height):
        seeds.append((0, y))
        seeds.append((width - 1, y))

    seen: set[tuple[int, int]] = set()
    stack = list(seeds)
    while stack:
        x, y = stack.pop()
        if (x, y) in seen or x < 0 or y < 0 or x >= width or y >= height:
            continue
        seen.add((x, y))
        r, g, b, a = pixels[x, y]
        if a == 0 or not is_near_black(r, g, b, limit):
            continue
        pixels[x, y] = (0, 0, 0, 0)
        stack.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    clear: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0 or max(r, g, b) > 40:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] == 0:
                    clear.append((x, y))
                    break
    for x, y in clear:
        pixels[x, y] = (0, 0, 0, 0)
    return rgba


_LUCIDA_SESSION: dict[str, object] = {}


def lucida_key(image: Image.Image, device: str | None = None) -> Image.Image:
    import torch
    from torchvision import transforms
    from transformers import AutoModelForImageSegmentation

    device_name = device or ("cuda" if torch.cuda.is_available() else "cpu")
    session_key = f"{LUCIDA_MODEL}:{LUCIDA_REVISION}:{device_name}"
    model = _LUCIDA_SESSION.get(session_key)
    if model is None:
        loaded = AutoModelForImageSegmentation.from_pretrained(
            LUCIDA_MODEL,
            revision=LUCIDA_REVISION,
            trust_remote_code=True,
        )
        loaded = loaded.to(device=device_name)
        loaded.eval()
        _LUCIDA_SESSION[session_key] = loaded
        model = loaded
    rgb = square_crop(image.convert("RGB"))
    preprocess = transforms.Compose(
        [
            transforms.Resize((LUCIDA_INPUT, LUCIDA_INPUT)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )
    with torch.inference_mode():
        pred = model(preprocess(rgb).unsqueeze(0).to(device_name))[-1].sigmoid()  # type: ignore[operator]
    alpha_t = pred.detach().float().cpu()[0]
    alpha_t = transforms.functional.resize(
        alpha_t, [rgb.height, rgb.width], antialias=True
    ).clamp(0.0, 1.0)
    alpha = transforms.functional.to_pil_image(alpha_t).convert("L")
    # Soft alpha preserves glow; clamp very low noise.
    alpha = alpha.point(lambda v: 0 if v < 18 else (255 if v > 220 else v))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    # Clean residual pure-black plate still attached to edges.
    return flood_key_black(out, limit=14)


def rembg_key(image: Image.Image) -> Image.Image:
    from rembg import remove

    rgb = square_crop(image.convert("RGB"))
    cut = remove(rgb)
    if not isinstance(cut, Image.Image):
        cut = Image.open(cut)  # type: ignore[arg-type]
    cut = cut.convert("RGBA")
    return flood_key_black(cut, limit=14)


def fit_to_cell(image: Image.Image, cell: int = CELL, padding: float = PADDING) -> Image.Image:
    """Center the opaque subject in a transparent cell with even padding."""
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    subject = rgba.crop(bbox)
    max_side = int(cell * (1.0 - padding * 2))
    sw, sh = subject.size
    scale = min(max_side / max(sw, 1), max_side / max(sh, 1))
    nw = max(1, int(round(sw * scale)))
    nh = max(1, int(round(sh * scale)))
    subject = subject.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    ox = (cell - nw) // 2
    oy = (cell - nh) // 2
    canvas.paste(subject, (ox, oy), subject)
    return canvas


def resolve_method(preferred: str) -> str:
    if preferred != "auto":
        return preferred
    try:
        import torch  # noqa: F401
        from transformers import AutoModelForImageSegmentation  # noqa: F401

        return "lucida"
    except Exception:
        pass
    try:
        import rembg  # noqa: F401

        return "rembg"
    except Exception:
        return "black-flood"


def process_one(path: Path, method: str, device: str | None) -> tuple[Image.Image, str]:
    with Image.open(path) as image:
        used = method
        if method == "lucida":
            try:
                keyed = lucida_key(image, device)
            except Exception as err:  # noqa: BLE001
                print(f"  Lucida failed ({err}); trying rembg")
                try:
                    keyed = rembg_key(image)
                    used = "rembg-fallback"
                except Exception as err2:  # noqa: BLE001
                    print(f"  rembg failed ({err2}); black-flood")
                    keyed = flood_key_black(image)
                    used = "black-flood-fallback"
        elif method == "rembg":
            try:
                keyed = rembg_key(image)
            except Exception as err:  # noqa: BLE001
                print(f"  rembg failed ({err}); black-flood")
                keyed = flood_key_black(image)
                used = "black-flood-fallback"
        else:
            keyed = flood_key_black(image)
            used = "black-flood"
        return fit_to_cell(keyed), used


def main() -> None:
    parser = argparse.ArgumentParser(description="Process pickup HUD icons")
    parser.add_argument(
        "--method",
        choices=("auto", "lucida", "rembg", "black-flood"),
        default="auto",
    )
    parser.add_argument("--device", default=None)
    parser.add_argument(
        "--icons",
        nargs="*",
        default=ICONS,
        help="Icon ids under assets-source/imagegen/pickup-icons-v2",
    )
    args = parser.parse_args()
    method = resolve_method(args.method)
    print(f"method={method}")

    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    entries = []

    for icon_id in args.icons:
        # Prefer black-bg regenerations; accept png/jpg.
        candidates = [
            SOURCE / f"{icon_id}-src.jpg",
            SOURCE / f"{icon_id}-src.png",
            SOURCE / f"{icon_id}.jpg",
            SOURCE / f"{icon_id}.png",
        ]
        source = next((p for p in candidates if p.exists()), None)
        if source is None:
            raise FileNotFoundError(f"Missing source for {icon_id} under {SOURCE}")
        print(f"{icon_id}: {source.name}")
        keyed, used = process_one(source, method, args.device)
        png_path = SOURCE / f"{icon_id}-cutout.png"
        webp_path = OUT / f"{icon_id}.webp"
        keyed.save(png_path, "PNG", optimize=True)
        keyed.save(webp_path, "WEBP", quality=90, method=6)
        entries.append(
            {
                "id": icon_id,
                "source": str(source.relative_to(ROOT)).replace("\\", "/"),
                "cutout": str(png_path.relative_to(ROOT)).replace("\\", "/"),
                "runtime": f"/assets/ui/pickup-icons/{icon_id}.webp",
                "cell": CELL,
                "method": used,
            }
        )
        print(f"  -> {webp_path.name} ({used}, {webp_path.stat().st_size} bytes)")

    MANIFEST.write_text(json.dumps({"version": 1, "cell": CELL, "icons": entries}, indent=2), encoding="utf-8")
    print(f"wrote {MANIFEST}")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:  # noqa: BLE001
        print(f"error: {err}", file=sys.stderr)
        raise
