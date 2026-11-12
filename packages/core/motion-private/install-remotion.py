#!/usr/bin/env python3
"""Install the pinned Remotion skills privately, without changing global skills or Git."""

import argparse
import hashlib
import io
from pathlib import Path, PurePosixPath
import stat
import sys
import urllib.request
import zipfile

REVISION = "7e541aa4d7361dfaca0780a565a47307eb7bdfbb"
ARCHIVE_SHA256 = "5e772fb6a1c4d9cf8bb9ab2a15e86be0955fd1f744d0fc1f1e85c74ed062005a"
URL = f"https://codeload.github.com/remotion-dev/skills/zip/{REVISION}"
PREFIX = f"skills-{REVISION}/skills/"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, default=Path(__file__).resolve().parent / "remotion" / "skills")
    args = parser.parse_args()
    destination = args.destination.resolve()
    request = urllib.request.Request(URL, headers={"User-Agent": "OpenCodex-private-skills-installer"})
    with urllib.request.urlopen(request, timeout=60) as response:
        contents = response.read()
    if hashlib.sha256(contents).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("Archive checksum mismatch; no skill files were written")

    with zipfile.ZipFile(io.BytesIO(contents)) as archive:
        files = []
        for item in archive.infolist():
            if item.is_dir() or not item.filename.startswith(PREFIX):
                continue
            relative = PurePosixPath(item.filename.removeprefix(PREFIX))
            mode = (item.external_attr >> 16) & 0xFFFF
            if relative.is_absolute() or ".." in relative.parts or stat.S_ISLNK(mode):
                raise ValueError(f"Unsupported archive entry: {item.filename}")
            files.append((relative, archive.read(item)))
        if not files or not any(str(name) == "remotion-best-practices/SKILL.md" for name, _ in files):
            raise ValueError("Pinned archive lacks the expected Remotion skill")

        # Never replace existing files: rerunning is safe, and local changes remain intact.
        for relative, data in files:
            target = destination.joinpath(*relative.parts)
            if target.exists() and (not target.is_file() or target.read_bytes() != data):
                raise FileExistsError(f"Existing file differs; preserved: {target}")
        for relative, data in files:
            target = destination.joinpath(*relative.parts)
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    print(f"Installed {len(files)} private Remotion files at {destination} ({REVISION})")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        sys.exit(f"Remotion installation failed: {error}")
