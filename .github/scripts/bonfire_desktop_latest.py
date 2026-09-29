#!/usr/bin/env python3
"""Write release/latest.json — the manual-updater manifest for Bonfire Desktop.

Usage: bonfire_desktop_latest.py --version V --tag TAG --repo OWNER/REPO --dir RELEASE_DIR
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

FORMATS = {
    'setup': '*-win-x64-setup.exe',
    'appimage': '*.AppImage',
    'deb': '*.deb',
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--dir', required=True)
    args = parser.parse_args()

    release_dir = Path(args.dir)
    files = {}
    for fmt, pattern in FORMATS.items():
        matches = sorted(p for p in release_dir.glob(pattern) if p.is_file())
        if len(matches) != 1:
            print(f'expected exactly one {fmt} artifact matching {pattern}, found {len(matches)}', file=sys.stderr)
            return 1
        name = matches[0].name
        files[fmt] = {
            'url': f'https://github.com/{args.repo}/releases/download/{args.tag}/{name}',
            'sha256': sha256_file(matches[0]),
        }

    manifest = {
        'version': args.version,
        'pub_date': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'files': files,
    }
    out = release_dir / 'latest.json'
    out.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'wrote {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
