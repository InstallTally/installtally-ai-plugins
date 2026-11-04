"""The distributable agent plugin must never contain private repository files."""

import shutil
import zipfile
from pathlib import Path

import pytest

from scripts.build_plugin import build_plugin, FILES


@pytest.fixture
def package(tmp_path):
    source = tmp_path / "plugin"
    source.mkdir()
    root = Path(__file__).resolve().parents[1]
    for name in FILES:
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / name, target)
    (source / "reports").mkdir()
    (source / "reports/customer.sqlite").write_bytes(b"PRIVATE_CUSTOMER_DATA")
    (source / ".env").write_text("PRIVATE_TOKEN=do-not-distribute")
    (source / "skills/setup/private.json").write_text("PRIVATE_CREDENTIAL")
    return source


def test_actual_package_build_is_reproducible_and_excludes_private_files(
    package, tmp_path
):
    first = tmp_path / "first.zip"
    second = tmp_path / "second.zip"
    build_plugin(package, first)
    build_plugin(package, second)
    assert first.read_bytes() == second.read_bytes()
    assert first.stat().st_mode & 0o444 == 0o444, (
        "The non-root web server must be able to read the public artifact"
    )
    with zipfile.ZipFile(first) as archive:
        names = archive.namelist()
        assert "installtally-ai-plugin/skills/setup/SKILL.md" in names
        assert "installtally-ai-plugin/skills/doctor/SKILL.md" in names
        assert "installtally-ai-plugin/skills/setup-google-play-reports/SKILL.md" in names
        assert "installtally-ai-plugin/skills/setup-app-store-reports/SKILL.md" in names
        assert "installtally-ai-plugin/skills/setup-app-store-reports/scripts/apple-bootstrap.mjs" in names
        assert "installtally-ai-plugin/.mcp.json" in names
        assert not any(
            "private" in name or name.endswith(".env") or name.startswith("installtally-ai-plugin/reports/")
            for name in names
        )
        for name in names:
            assert b"PRIVATE_" not in archive.read(name)


def test_invalid_package_cannot_replace_previous_artifact(package, tmp_path):
    target = tmp_path / "release.zip"
    target.write_bytes(b"previous-artifact")
    (package / ".mcp.json").unlink()
    with pytest.raises(ValueError):
        build_plugin(package, target)
    assert target.read_bytes() == b"previous-artifact"


def test_symlink_cannot_smuggle_private_file_into_an_allowed_path(package, tmp_path):
    secret = tmp_path / "private-key"
    secret.write_bytes(b"PRIVATE_CREDENTIAL")
    target = package / "skills/setup/SKILL.md"
    target.unlink()
    target.symlink_to(secret)
    with pytest.raises(ValueError):
        build_plugin(package, tmp_path / "release.zip")


def test_cli_builds_from_outside_repository(tmp_path):
    import subprocess
    import sys

    root = Path(__file__).resolve().parents[1]
    target = tmp_path / "plugin.zip"
    result = subprocess.run(
        [sys.executable, str(root / "scripts/build_plugin.py"), "--output", str(target)],
        cwd=tmp_path, capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stderr
    with zipfile.ZipFile(target) as archive:
        assert archive.read("installtally-ai-plugin/.mcp.json") == (root / ".mcp.json").read_bytes()
        assert set(archive.namelist()) == {"installtally-ai-plugin/" + name for name in FILES}
