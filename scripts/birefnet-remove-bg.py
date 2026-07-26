#!/usr/bin/env python3
"""Remove image backgrounds with ZhengPeng7/BiRefNet (Hugging Face).

Requires the dungeon PBR venv (torch + transformers):
  apps/dungeon/.venv-pbr/Scripts/python.exe scripts/birefnet-remove-bg.py IN -o OUT
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="BiRefNet background removal")
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("-o", "--out-dir", type=Path, required=True)
    parser.add_argument("--device", default=None, help="cuda / cpu (default: auto)")
    args = parser.parse_args()

    try:
        import torch
        from PIL import Image
        from torchvision import transforms
        from transformers import AutoModelForImageSegmentation
    except ImportError as err:
        print(f"Missing dependency: {err}", file=sys.stderr)
        print("Use apps/dungeon/.venv-pbr/Scripts/python.exe", file=sys.stderr)
        return 1

    device = args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    print(f"device={device}")
    print("loading ZhengPeng7/BiRefNet …")
    model = AutoModelForImageSegmentation.from_pretrained(
        "ZhengPeng7/BiRefNet",
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    # Force full precision: HF weights can land as Half and break float inputs.
    model = model.to(device=device, dtype=torch.float32)
    model.eval()

    transform = transforms.Compose(
        [
            transforms.Resize((1024, 1024)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )

    args.out_dir.mkdir(parents=True, exist_ok=True)

    for src in args.inputs:
        image = Image.open(src).convert("RGB")
        original_size = image.size
        input_tensor = transform(image).unsqueeze(0).to(device=device, dtype=torch.float32)
        with torch.no_grad():
            preds = model(input_tensor)[-1].sigmoid().float().cpu()
        mask = preds[0].squeeze()
        mask_pil = transforms.ToPILImage()(mask)
        mask_pil = mask_pil.resize(original_size, Image.BILINEAR)
        # Harder alpha so the sprite is solid (user reported semi-transparent ghosts).
        mask_l = mask_pil.point(lambda v: 0 if v < 96 else (255 if v > 140 else int((v - 96) * (255 / 44))))
        mask_l = mask_l.convert("L")

        rgba = image.convert("RGBA")
        rgba.putalpha(mask_l)
        out_name = src.stem.replace("-src", "").replace("_src-", "") + ".png"
        if out_name.startswith("_"):
            out_name = out_name.lstrip("_")
        out_path = args.out_dir / out_name
        rgba.save(out_path)
        print(f"wrote {out_path} ({original_size[0]}x{original_size[1]})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
