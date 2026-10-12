"""PyPI launcher for the Node-based BlackWire application."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Sequence

MINIMUM_NODE = (22, 5, 0)


def _node_version(node: str) -> tuple[int, int, int] | None:
    try:
        result = subprocess.run(
            [node, "--version"], check=True, capture_output=True, text=True, timeout=10
        )
        parts = result.stdout.strip().lstrip("v").split(".")
        return tuple(int(part) for part in parts[:3])  # type: ignore[return-value]
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def _run(bundle_name: str, arguments: Sequence[str] | None = None) -> int:
    node = shutil.which("node")
    version = _node_version(node) if node else None
    if not node or not version or version < MINIMUM_NODE:
        print(
            "BlackWire requires Node.js 22.5 or newer. Install Node, then run this command again.",
            file=sys.stderr,
        )
        return 1

    vendor = Path(__file__).resolve().parent / "vendor"
    bundle = vendor / bundle_name
    if not bundle.is_file():
        print("BlackWire installation is incomplete: bundled runtime is missing.", file=sys.stderr)
        return 1

    environment = os.environ.copy()
    environment.setdefault("BLACKWIRE_MCP_ENTRY", str(vendor / "mcp.mjs"))
    try:
        return subprocess.call([node, str(bundle), *(arguments or sys.argv[1:])], env=environment)
    except KeyboardInterrupt:
        return 130


def main() -> int:
    """Run the BlackWire CLI."""
    return _run("cli.mjs")


def main_mcp() -> int:
    """Run the bundled BlackWire MCP bridge."""
    return _run("mcp.mjs")
