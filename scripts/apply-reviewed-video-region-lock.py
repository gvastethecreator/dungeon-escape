#!/usr/bin/env python3
"""Keep reviewed video motion only inside explicit polygons.

This is a fail-closed repair for a valid limb pose inside a video whose static
anatomy drifted. The exact first frame remains the base for every edited slot.
The script updates the raw sheet hashes and writes a separate evidence record;
it never changes the selected video indices or marks an automatic selection as
reviewed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any

import imageio_ffmpeg
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageStat


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-dir", required=True, type=Path)
    parser.add_argument("--state", required=True)
    parser.add_argument("--spec", required=True, type=Path)
    return parser.parse_args()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_object(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object: {path}")
    return payload


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def json_bytes(payload: dict[str, Any]) -> bytes:
    return (json.dumps(payload, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def resolve_record_path(run_dir: Path, value: str) -> Path:
    candidate = Path(value)
    return candidate.resolve() if candidate.is_absolute() else (run_dir / candidate).resolve()


def decode_frames(video_path: Path, wanted: set[int]) -> tuple[dict[int, Image.Image], float]:
    reader = imageio_ffmpeg.read_frames(str(video_path), pix_fmt="rgb24")
    metadata = next(reader)
    size = tuple(int(value) for value in metadata["size"])
    fps = float(metadata["fps"])
    decoded: dict[int, Image.Image] = {}
    try:
        for index, data in enumerate(reader):
            if index in wanted:
                decoded[index] = Image.frombytes("RGB", size, data).convert("RGBA")
            if len(decoded) == len(wanted):
                break
    finally:
        reader.close()
    missing = sorted(wanted.difference(decoded))
    if missing:
        raise ValueError(f"video does not contain requested frames: {missing}")
    return decoded, fps


def normalized_polygon(points: Any, size: tuple[int, int]) -> list[tuple[int, int]]:
    if not isinstance(points, list) or len(points) < 3:
        raise ValueError("each polygon must contain at least three points")
    width, height = size
    result: list[tuple[int, int]] = []
    for point in points:
        if not isinstance(point, list) or len(point) != 2:
            raise ValueError("polygon points must be [x, y]")
        x, y = float(point[0]), float(point[1])
        if not 0.0 <= x <= 1.0 or not 0.0 <= y <= 1.0:
            raise ValueError("polygon coordinates must be normalized to 0..1")
        result.append((round(x * (width - 1)), round(y * (height - 1))))
    return result


def compose_phase(
    exact_first: Image.Image,
    video_frame: Image.Image,
    polygons: list[Any],
    feather_px: float,
    *,
    target_scale: float = 1.0,
    exclude_polygons: list[Any] | None = None,
    match_reference_luma: bool = False,
) -> tuple[Image.Image, Image.Image]:
    target = video_frame.resize(exact_first.size, Image.Resampling.LANCZOS)
    if not 0.1 <= target_scale <= 2.0:
        raise ValueError("target_scale must be in the range 0.1..2.0")
    if target_scale != 1.0:
        scaled_size = (
            max(1, round(exact_first.width * target_scale)),
            max(1, round(exact_first.height * target_scale)),
        )
        scaled = target.resize(scaled_size, Image.Resampling.LANCZOS)
        centered = Image.new("RGBA", exact_first.size, (0, 0, 0, 255))
        centered.alpha_composite(
            scaled,
            (
                (exact_first.width - scaled.width) // 2,
                (exact_first.height - scaled.height) // 2,
            ),
        )
        target = centered
    if match_reference_luma:
        reference_luma = exact_first.convert("L")
        target_luma = target.convert("L")
        reference_mask = reference_luma.point(
            [0 if value <= 16 else 255 for value in range(256)]
        )
        target_mask = target_luma.point(
            [0 if value <= 16 else 255 for value in range(256)]
        )
        reference_mean = ImageStat.Stat(reference_luma, mask=reference_mask).mean[0]
        target_mean = ImageStat.Stat(target_luma, mask=target_mask).mean[0]
        if target_mean > 0:
            ratio = max(0.4, min(2.5, reference_mean / target_mean))
            alpha = target.getchannel("A")
            target = ImageEnhance.Brightness(target.convert("RGB")).enhance(ratio).convert("RGBA")
            target.putalpha(alpha)
    mask = Image.new("L", exact_first.size, 0)
    for polygon in polygons:
        points = polygon.get("points") if isinstance(polygon, dict) else polygon
        geometry = Image.new("L", exact_first.size, 0)
        ImageDraw.Draw(geometry).polygon(
            normalized_polygon(points, exact_first.size),
            fill=255,
        )
        if isinstance(polygon, dict) and polygon.get("luma_min") is not None:
            threshold = int(polygon["luma_min"])
            if not 0 <= threshold <= 255:
                raise ValueError("luma_min must be in the range 0..255")
            base_luma = exact_first.convert("L")
            target_luma = target.convert("L")
            semantic = ImageChops.lighter(base_luma, target_luma).point(
                [0 if value < threshold else 255 for value in range(256)]
            )
            dilate = int(polygon.get("dilate_px_at_reference_size", 0))
            if dilate > 0:
                semantic = semantic.filter(ImageFilter.MaxFilter(dilate * 2 + 1))
            geometry = ImageChops.multiply(geometry, semantic)
        mask = ImageChops.lighter(mask, geometry)
    for polygon in exclude_polygons or []:
        points = polygon.get("points") if isinstance(polygon, dict) else polygon
        geometry = Image.new("L", exact_first.size, 0)
        ImageDraw.Draw(geometry).polygon(
            normalized_polygon(points, exact_first.size),
            fill=255,
        )
        mask = ImageChops.subtract(mask, geometry)
    if feather_px > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather_px))
    return Image.composite(target, exact_first, mask), mask


def png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=False)
    return output.getvalue()


def main() -> int:
    args = parse_args()
    run_dir = args.run_dir.expanduser().resolve()
    spec_path = args.spec.expanduser().resolve()
    spec = load_object(spec_path)
    if spec.get("version") != 1 or spec.get("state") != args.state:
        raise ValueError("region-lock spec version/state mismatch")

    report_path = run_dir / "provider" / "grok-imagine" / args.state / "video-source.json"
    provenance_path = run_dir / "source-provenance.json"
    request_path = run_dir / "sprite-request.json"
    raw_path = run_dir / "raw" / f"{args.state}.png"
    selector_path = run_dir / "qa" / f"{args.state}-video-frame-selector" / "selector.evidence.json"
    report = load_object(report_path)
    provenance = load_object(provenance_path)
    request = load_object(request_path)
    selector = load_object(selector_path)

    if report.get("selection_reviewed") is not True:
        raise ValueError("video selection must be explicitly reviewed before region locking")
    selected = report.get("sampled_video_indices")
    if selector.get("selected_indices") != selected:
        raise ValueError("selector evidence does not match the provider report")
    if not isinstance(selected, list):
        raise ValueError("provider report has no selected frame list")

    edits = spec.get("phase_frames")
    if not isinstance(edits, list) or not edits:
        raise ValueError("region-lock spec has no phase_frames")
    wanted: set[int] = set()
    slots: set[int] = set()
    for edit in edits:
        if not isinstance(edit, dict):
            raise ValueError("phase_frames entries must be objects")
        slot = int(edit["slot"])
        video_index = int(edit["video_index"])
        if slot in slots or slot < 0 or slot >= len(selected):
            raise ValueError(f"invalid or repeated output slot: {slot}")
        if int(selected[slot]) != video_index:
            raise ValueError(f"slot {slot} is not bound to reviewed video frame {video_index}")
        if slot in report.get("exact_idle_slots", []):
            raise ValueError(f"cannot edit exact idle slot {slot}")
        if not isinstance(edit.get("polygons"), list) or not edit["polygons"]:
            raise ValueError(f"slot {slot} has no polygons")
        slots.add(slot)
        wanted.add(video_index)

    first_path = resolve_record_path(run_dir, report["first_frame"]["path"])
    video_path = resolve_record_path(run_dir, report["video"]["path"])
    with Image.open(first_path) as opened:
        opened.load()
        exact_first = opened.convert("RGBA")
    decoded, fps = decode_frames(video_path, wanted)

    frames = [exact_first.copy() for _ in selected]
    masks: dict[int, Image.Image] = {}
    feather = float(spec.get("feather_px_at_reference_size", 0.0))
    for edit in edits:
        slot = int(edit["slot"])
        video_index = int(edit["video_index"])
        frames[slot], masks[slot] = compose_phase(
            exact_first,
            decoded[video_index],
            edit["polygons"],
            feather,
            target_scale=float(edit.get("target_scale", 1.0)),
            exclude_polygons=edit.get("exclude_polygons"),
            match_reference_luma=bool(edit.get("match_reference_luma", False)),
        )

    state_request = request["states"][args.state]
    layout = state_request["raw_layout"]
    columns, rows = int(layout["columns"]), int(layout["rows"])
    if columns * rows != len(frames):
        raise ValueError("raw layout does not match selected frame count")
    sheet = Image.new("RGBA", (exact_first.width * columns, exact_first.height * rows))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((index % columns) * exact_first.width, (index // columns) * exact_first.height))
    raw_data = png_bytes(sheet)
    prior_raw_hash = digest(raw_path.read_bytes()) if raw_path.exists() else None
    atomic_write(raw_path, raw_data)

    report["sampling_mode"] = "reviewed-explicit-region-lock"
    report["sampled_timestamps_seconds"] = [round(int(index) / fps, 6) for index in selected]
    report["output"] = {
        "path": f"raw/{args.state}.png",
        "sha256": digest(raw_data),
        "size_bytes": len(raw_data),
        "width": sheet.width,
        "height": sheet.height,
    }
    report_data = json_bytes(report)
    atomic_write(report_path, report_data)
    source_report = selector.get("source_report")
    if not isinstance(source_report, dict) or source_report.get("path") != report_path.relative_to(run_dir).as_posix():
        raise ValueError("selector source_report path does not match the edited provider report")
    source_report["sha256"] = digest(report_data)
    atomic_write(selector_path, json_bytes(selector))

    updated = False
    for accepted in provenance.get("accepted_sources", []):
        if args.state in accepted.get("states", []):
            accepted["sha256"] = digest(raw_data)
            accepted["size_bytes"] = len(raw_data)
            updated = True
    if not updated:
        raise ValueError("source provenance has no entry for the edited state")
    evidence_rel = f"qa/{args.state}-video-frame-selector/region-lock.evidence.json"
    note = f"reviewed video selection with deterministic region lock; evidence: {evidence_rel}"
    prior_note = str(provenance.get("notes") or "").strip()
    provenance["notes"] = prior_note if note in prior_note else (f"{prior_note}; {note}" if prior_note else note)
    atomic_write(provenance_path, json_bytes(provenance))

    evidence_path = run_dir / evidence_rel
    mask_records: list[dict[str, Any]] = []
    for slot, mask in sorted(masks.items()):
        mask_data = png_bytes(mask.convert("RGBA"))
        mask_path = evidence_path.parent / f"region-lock-slot-{slot}.png"
        atomic_write(mask_path, mask_data)
        mask_records.append({
            "slot": slot,
            "path": mask_path.relative_to(run_dir).as_posix(),
            "sha256": digest(mask_data),
            "size_bytes": len(mask_data),
        })
    evidence = {
        "version": 1,
        "kind": "reviewed-video-region-lock",
        "status": "review-required",
        "state": args.state,
        "selected_video_indices": selected,
        "video": report["video"],
        "exact_first_frame": report["first_frame"],
        "spec": {
            "path": str(spec_path),
            "sha256": digest(spec_path.read_bytes()),
            "size_bytes": spec_path.stat().st_size,
        },
        "prior_raw_sha256": prior_raw_hash,
        "output": report["output"],
        "masks": mask_records,
        "review_note": str(spec.get("review_note") or ""),
    }
    atomic_write(evidence_path, json_bytes(evidence))
    print(json.dumps({
        "status": "review-required",
        "raw": str(raw_path),
        "evidence": str(evidence_path),
        "sha256": report["output"]["sha256"],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
