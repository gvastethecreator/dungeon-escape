#!/usr/bin/env python3
"""Build local visual-review reports for video-derived biome enemies."""

from __future__ import annotations

import argparse
from html import escape
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


BIOME_ORDER = (
    "molten",
    "frost",
    "grim",
    "verdant",
    "ash",
    "iron",
    "obsidian",
    "sunken",
    "fungal",
    "backrooms",
)
CARD_WIDTH = 720
CARD_HEIGHT = 430
BOARD_COLUMNS = 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--runs-root",
        type=Path,
        default=Path(".scratch/biome-enemy-animation-video-batch/runs"),
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path(".scratch/biome-enemy-animation-video-batch/reports"),
    )
    parser.add_argument(
        "--biomes",
        help="Optional comma-separated biome subset.",
    )
    return parser.parse_args()


def relative_href(report_dir: Path, artifact: Path) -> str:
    return os.path.relpath(artifact, report_dir).replace("\\", "/")


def load_json(path: Path) -> dict[str, object]:
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def run_status(run_dir: Path) -> tuple[str, str, str]:
    validation = load_json(run_dir / "qa" / "run-validation-report.json")
    status = str(validation.get("status", "missing"))
    stage = str(validation.get("stage", "unvalidated"))
    provenance = load_json(run_dir / "source-provenance.json")
    source_type = str(provenance.get("source_type", "unknown"))
    return status, stage, source_type


def artifact_tag(report_dir: Path, run_dir: Path, path: str, label: str) -> str:
    artifact = run_dir / path
    if not artifact.is_file():
        return (
            '<figure class="missing"><div>Falta evidencia</div>'
            f"<figcaption>{escape(label)}</figcaption></figure>"
        )
    href = escape(relative_href(report_dir, artifact), quote=True)
    return (
        f'<figure><a href="{href}"><img src="{href}" alt="{escape(label)}" '
        'loading="lazy"></a>'
        f"<figcaption>{escape(label)}</figcaption></figure>"
    )


def build_board(biome: str, runs: list[Path], output: Path) -> None:
    rows = (len(runs) + BOARD_COLUMNS - 1) // BOARD_COLUMNS
    board = Image.new(
        "RGB",
        (CARD_WIDTH * BOARD_COLUMNS, CARD_HEIGHT * rows),
        (15, 18, 24),
    )
    draw = ImageDraw.Draw(board)
    font = ImageFont.load_default()
    for index, run_dir in enumerate(runs):
        column = index % BOARD_COLUMNS
        row = index // BOARD_COLUMNS
        left = column * CARD_WIDTH
        top = row * CARD_HEIGHT
        draw.rectangle(
            (left + 6, top + 6, left + CARD_WIDTH - 7, top + CARD_HEIGHT - 7),
            outline=(54, 63, 78),
            width=2,
        )
        status, stage, source_type = run_status(run_dir)
        label = f"{biome} / {run_dir.name} | {status} {stage} | {source_type}"
        draw.text((left + 18, top + 16), label, fill=(232, 236, 244), font=font)
        contact = run_dir / "qa" / "all-contact.png"
        if not contact.is_file():
            draw.text(
                (left + 18, top + 50),
                "missing qa/all-contact.png",
                fill=(251, 113, 133),
                font=font,
            )
            continue
        with Image.open(contact) as opened:
            image = opened.convert("RGB")
            max_width = CARD_WIDTH - 36
            max_height = CARD_HEIGHT - 70
            scale = min(max_width / image.width, max_height / image.height)
            size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
            image = image.resize(size, Image.Resampling.LANCZOS)
        x = left + (CARD_WIDTH - image.width) // 2
        y = top + 52 + (max_height - image.height) // 2
        board.paste(image, (x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    board.save(output, optimize=True)


def build_biome_report(report_dir: Path, biome: str, biome_dir: Path) -> dict[str, object]:
    runs = sorted((path for path in biome_dir.iterdir() if path.is_dir()), key=lambda path: path.name)
    board_path = report_dir / f"{biome}-overview.png"
    build_board(biome, runs, board_path)
    cards: list[str] = []
    pass_count = 0
    for run_dir in runs:
        status, stage, source_type = run_status(run_dir)
        if status == "pass" and stage == "pre-package":
            pass_count += 1
        repair = run_dir / "qa" / "quota-sealed-repair-plan.json"
        repair_badge = '<span class="badge repair">ImageGen repair</span>' if repair.is_file() else ""
        cards.append(
            "".join(
                [
                    '<article class="enemy">',
                    '<header><div><h2>',
                    escape(run_dir.name),
                    '</h2><p class="meta">',
                    escape(f"{status} · {stage} · {source_type}"),
                    "</p></div>",
                    repair_badge,
                    "</header>",
                    '<div class="grid">',
                    artifact_tag(report_dir, run_dir, "qa/all-contact.png", "Frames registrados"),
                    artifact_tag(report_dir, run_dir, "qa/background-matte-review.png", "Lucida matte"),
                    artifact_tag(report_dir, run_dir, "qa/idle-step-onion.png", "Movimiento onion"),
                    artifact_tag(report_dir, run_dir, "qa/attack-onion.png", "Ataque onion"),
                    artifact_tag(
                        report_dir,
                        run_dir,
                        "qa/runtime-preview/idle-step-playback.gif",
                        "Movimiento runtime",
                    ),
                    artifact_tag(
                        report_dir,
                        run_dir,
                        "qa/runtime-preview/attack-playback.gif",
                        "Ataque runtime",
                    ),
                    "</div>",
                    '<p class="links">',
                    f'<a href="{escape(relative_href(report_dir, run_dir / "qa" / "preview-workbench" / "index.html"), quote=True)}">Abrir editor</a>',
                    " · ",
                    f'<a href="{escape(relative_href(report_dir, run_dir / "sprite-sheet-alpha.png"), quote=True)}">Atlas fuente</a>',
                    "</p></article>",
                ]
            )
        )

    title = f"{biome.title()} enemy animation review"
    overview_href = escape(relative_href(report_dir, board_path), quote=True)
    html = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title>
<style>
:root {{ color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background:#0b0d12; color:#edf1f7; }}
* {{ box-sizing:border-box; }} body {{ margin:0; }}
main {{ width:min(1680px,100%); margin:auto; padding:28px; }}
h1,h2,p {{ margin:0; }} .lead {{ color:#9da9bb; margin-top:8px; }}
.summary {{ display:flex; gap:12px; align-items:center; margin:20px 0 28px; }}
.badge {{ border:1px solid #3b4658; border-radius:999px; padding:5px 9px; color:#bac5d5; font-size:12px; }}
.repair {{ color:#fbcf75; border-color:#7b5d25; }}
.overview {{ width:100%; border:1px solid #293243; border-radius:12px; margin-bottom:30px; }}
.enemy {{ border:1px solid #273040; background:#11151d; border-radius:14px; padding:18px; margin-bottom:24px; }}
.enemy header {{ display:flex; align-items:start; justify-content:space-between; gap:14px; margin-bottom:14px; }}
.meta {{ color:#93a0b4; margin-top:4px; font-size:13px; }}
.grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }}
figure {{ margin:0; background:#080a0f; border:1px solid #252e3e; border-radius:10px; overflow:hidden; }}
figure img {{ display:block; width:100%; aspect-ratio:16/9; object-fit:contain; background:#0a0c12; image-rendering:auto; }}
figcaption {{ padding:7px 9px; color:#aab5c6; font-size:12px; }}
.missing div {{ display:grid; place-items:center; aspect-ratio:16/9; color:#fb7185; }}
.links {{ margin-top:12px; }} a {{ color:#86b7ff; }}
@media (max-width:900px) {{ main {{ padding:16px; }} .grid {{ grid-template-columns:1fr; }} }}
</style>
</head>
<body><main>
<h1>{escape(title)}</h1>
<p class="lead">Lucida + segmentación adaptativa + registro + selector completo de video.</p>
<div class="summary"><span class="badge">{len(runs)} enemigos</span><span class="badge">{pass_count} pre-package</span></div>
<a href="{overview_href}"><img class="overview" src="{overview_href}" alt="Resumen {escape(biome)}"></a>
{''.join(cards)}
</main></body></html>
"""
    report_path = report_dir / f"{biome}.html"
    report_path.write_text(html, encoding="utf-8")
    return {
        "biome": biome,
        "runs": len(runs),
        "pre_package_pass": pass_count,
        "report": str(report_path),
        "overview": str(board_path),
    }


def main() -> int:
    args = parse_args()
    runs_root = args.runs_root.expanduser().resolve()
    report_dir = args.out_dir.expanduser().resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    requested = (
        tuple(item.strip() for item in args.biomes.split(",") if item.strip())
        if args.biomes
        else BIOME_ORDER
    )
    reports: list[dict[str, object]] = []
    for biome in requested:
        biome_dir = runs_root / biome
        if not biome_dir.is_dir():
            raise SystemExit(f"missing biome runs: {biome_dir}")
        reports.append(build_biome_report(report_dir, biome, biome_dir))

    links = "\n".join(
        f'<li><a href="{escape(str(item["biome"]), quote=True)}.html">{escape(str(item["biome"]).title())}</a> · {item["runs"]} runs · {item["pre_package_pass"]} pre-package</li>'
        for item in reports
    )
    index = f"""<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Biome enemy animation reports</title><style>:root{{color-scheme:dark;font-family:system-ui;background:#0b0d12;color:#edf1f7}}main{{max-width:880px;margin:auto;padding:32px}}li{{margin:12px 0}}a{{color:#86b7ff}}</style></head><body><main><h1>Biome enemy animation reports</h1><ul>{links}</ul></main></body></html>"""
    (report_dir / "index.html").write_text(index, encoding="utf-8")
    print(json.dumps({"ok": True, "reports": reports}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
