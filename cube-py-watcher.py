#!/usr/bin/env python3

import os
import signal
import subprocess
import sys
import time
from typing import Any

import xxhash

# Configuration
CUBE_PY_PATH = "cube.py"
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", 10))  # seconds

last_content_hash = ""
last_content = ""


def calculate_content_hash(content) -> Any:
    """Calculate xxHash (very fast) for change detection."""
    return xxhash.xxh64(content.encode("utf-8")).hexdigest()


def read_cube_py() -> str | None:
    """Read cube.py file."""
    try:
        with open(CUBE_PY_PATH, "r", encoding="utf-8") as f:
            return f.read()
    except OSError as e:
        print(f"Error reading {CUBE_PY_PATH}: {e}", file=sys.stderr)
        return None


def reload_cube() -> None:
    """Send SIGUSR1 signal to Cube.js process."""
    print("Cube.py content changed, sending SIGUSR1 to reload...")

    try:
        # Find cubejs processes and send SIGUSR1
        result = subprocess.run(
            ["pkill", "-SIGUSR1", "-f", "cubejs"], capture_output=True, text=True
        )

        if result.returncode == 0:
            print("SIGUSR1 sent successfully. Cube.js will handle graceful restart")
        else:
            print(f"No cubejs processes found or error sending signal: {result.stderr}")
    except Exception as e:
        print(f"Error sending SIGUSR1: {e}", file=sys.stderr)


def signal_handler(signum, frame) -> None:
    """Handle shutdown signals."""
    print("\nShutting down cube.py watcher...")
    sys.exit(0)


def watch_cube_py() -> None:
    """Main watching function."""
    print(f"Watching {CUBE_PY_PATH} for content changes...")
    print(f"Poll interval: {POLL_INTERVAL} seconds")

    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Initial read
    initial_content = read_cube_py()
    if initial_content is not None:
        global last_content, last_content_hash
        last_content = initial_content
        last_content_hash = calculate_content_hash(initial_content)
        print(f"Initial content hash: {last_content_hash}")

    # Main watching loop
    while True:
        try:
            # Direct content hash check (xxHash is fast enough)
            current_content = read_cube_py()
            if current_content is None:
                time.sleep(POLL_INTERVAL)
                continue

            current_hash = calculate_content_hash(current_content)

            if current_hash != last_content_hash:
                print(
                    f"Content hash changed: {last_content_hash[:8]}... → {current_hash[:8]}..."
                )
                last_content = current_content
                last_content_hash = current_hash
                reload_cube()

        except KeyboardInterrupt:
            print("\nInterrupted by user")
            break
        except Exception as e:
            print(f"Error in watching loop: {e}", file=sys.stderr)

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    watch_cube_py()
