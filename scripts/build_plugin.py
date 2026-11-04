"""Build only the public agent-plugin allowlist, never a repository archive."""

from __future__ import annotations

import argparse
import io
import os
import tempfile
import zipfile
from pathlib import Path

FILES = (
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    ".codex-plugin/plugin.json",
    ".mcp.json",
    "README.md",
    "LICENSE",
    "skills/setup/SKILL.md",
    "skills/setup/agents/openai.yaml",
    "scripts/check-plugin-version.mjs",
    "skills/doctor/SKILL.md",
    "skills/doctor/agents/openai.yaml",
    "skills/setup-google-play-reports/SKILL.md",
    "skills/setup-google-play-reports/agents/openai.yaml",
    "skills/setup-app-store-reports/SKILL.md",
    "skills/setup-app-store-reports/agents/openai.yaml",
    "skills/setup-app-store-reports/scripts/apple-bootstrap.mjs",
    "assets/icon.png",
)


def build_plugin(source: Path, destination: Path) -> None:
    source = Path(source).resolve()
    payload = []
    for name in FILES:
        path = source / name
        if not path.is_file() or any(
            p.is_symlink()
            for p in [path, *path.parents]
            if p != source and source in p.parents
        ):
            raise ValueError("Plugin input must be a regular allowlisted file: " + name)
        payload.append((name, path.read_bytes()))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in payload:
            entry = zipfile.ZipInfo(
                "installtally-ai-plugin/" + name, date_time=(2026, 1, 1, 0, 0, 0)
            )
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=destination.parent, delete=False
        ) as output:
            temporary = Path(output.name)
            output.write(buffer.getvalue())
        temporary.chmod(0o644)
        os.replace(temporary, destination)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path, default=Path(__file__).resolve().parents[1]
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build_plugin(args.source, args.output)


if __name__ == "__main__":
    main()
