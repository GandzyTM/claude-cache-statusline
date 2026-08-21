"""
Generates the example status-line screenshots in this directory by feeding
statusline.sh crafted JSON input at a range of context percentages, then
rendering the resulting ANSI output as a terminal-look SVG/PNG via `rich`.

No real context is burned to produce these - it's all synthetic input.

Requirements: pip install rich; rsvg-convert on PATH (librsvg).
"""
import json
import os
import subprocess
import tempfile
import time

from rich.console import Console
from rich.text import Text

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "statusline.sh")
OUT_DIR = HERE

# (basename, context pct, cache idle seconds, five_hour pct, seven_day pct)
CASES = [
    ("context-30", 30, 300, 18, 40),
    ("context-60", 60, 600, 32, 55),
    ("context-80", 80, 900, 48, 61),
    ("context-92", 92, 2000, 55, 66),
    ("context-97", 97, 3700, 58, 68),
]


def build_input(cwd, ctx_pct, five_pct, seven_pct, transcript_path, session_id):
    now = int(time.time())
    return {
        "workspace": {"current_dir": cwd},
        "model": {"display_name": "Sonnet 5"},
        "effort": {"level": "medium"},
        "context_window": {"used_percentage": ctx_pct},
        "transcript_path": transcript_path,
        "session_id": session_id,
        "rate_limits": {
            "five_hour": {"used_percentage": five_pct, "resets_at": now + 3600 * 2 + 1500},
            "seven_day": {"used_percentage": seven_pct, "resets_at": now + 86400 * 3 + 3600 * 5},
        },
    }


def main():
    with tempfile.TemporaryDirectory() as tmp:
        state_dir = os.path.join(tmp, "statusline-cache")
        os.makedirs(state_dir, exist_ok=True)

        for basename, ctx_pct, idle_s, five_pct, seven_pct in CASES:
            session_id = f"demo-{ctx_pct}"
            transcript_path = os.path.join(tmp, f"transcript-{ctx_pct}.jsonl")
            with open(transcript_path, "w") as f:
                f.write('{"demo": true}\n')

            state_file = os.path.join(state_dir, f"{session_id}.state")
            size = os.path.getsize(transcript_path)
            last_activity = int(time.time()) - idle_s
            with open(state_file, "w") as f:
                f.write(f"{size} {last_activity}\n")

            payload = build_input(
                "/Users/demo/dev/my-project", ctx_pct, five_pct, seven_pct,
                transcript_path, session_id,
            )
            result = subprocess.run(
                ["bash", SCRIPT],
                input=json.dumps(payload),
                capture_output=True,
                text=True,
                env={**os.environ, "CLAUDE_CONFIG_DIR": tmp},
            )
            if result.returncode != 0:
                print("ERROR", basename, result.stderr)
                continue

            console = Console(record=True, width=140, force_terminal=True, color_system="256")
            console.print(Text.from_ansi(result.stdout), soft_wrap=True)
            svg = console.export_svg(title="Claude Code", theme=None, font_aspect_ratio=0.6)

            svg_path = os.path.join(OUT_DIR, f"{basename}.svg")
            png_path = os.path.join(OUT_DIR, f"{basename}.png")
            with open(svg_path, "w") as f:
                f.write(svg)
            subprocess.run(["rsvg-convert", "-w", "900", "-o", png_path, svg_path], check=True)
            os.remove(svg_path)
            print("wrote", png_path)


if __name__ == "__main__":
    main()
