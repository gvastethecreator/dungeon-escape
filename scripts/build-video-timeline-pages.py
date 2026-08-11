#!/usr/bin/env python3
"""Render every decoded video frame into numbered review pages."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import imageio.v3 as iio
from PIL import Image, ImageDraw


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--columns", type=int, default=5)
    parser.add_argument("--rows", type=int, default=5)
    parser.add_argument("--cell", type=int, default=160)
    args = parser.parse_args()

    frames = [Image.fromarray(frame).convert("RGB") for frame in iio.imiter(args.video)]
    if not frames:
        raise ValueError(f"video has no frames: {args.video}")
    per_page = args.columns * args.rows
    args.out_dir.mkdir(parents=True, exist_ok=True)
    pages = []
    for page_index, start in enumerate(range(0, len(frames), per_page), start=1):
        page = Image.new(
            "RGB", (args.columns * args.cell, args.rows * args.cell), (8, 8, 8)
        )
        draw = ImageDraw.Draw(page)
        end = min(start + per_page, len(frames))
        for slot, frame_index in enumerate(range(start, end)):
            frame = frames[frame_index]
            available = args.cell - 18
            scale = min(available / frame.width, available / frame.height)
            thumb = frame.resize(
                (max(1, round(frame.width * scale)), max(1, round(frame.height * scale))),
                Image.Resampling.LANCZOS,
            )
            column = slot % args.columns
            row = slot // args.columns
            x = column * args.cell + (args.cell - thumb.width) // 2
            y = row * args.cell + 16 + (available - thumb.height) // 2
            page.paste(thumb, (x, y))
            draw.text((column * args.cell + 4, row * args.cell + 3), f"F{frame_index}", fill=(255, 220, 60))
        output = args.out_dir / f"timeline-page-{page_index:02d}.png"
        page.save(output, optimize=True)
        pages.append({"path": output.name, "first": start, "last": end - 1})
    report = {
        "version": 1,
        "kind": "full-video-frame-review-pages",
        "video": str(args.video.resolve()),
        "frame_count": len(frames),
        "pages": pages,
    }
    (args.out_dir / "timeline-pages.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
