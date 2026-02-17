"""PyInstaller entry point for FOLIO Mapper desktop mode.

Usage:
    python run_desktop.py --port 9876 --web-dir /path/to/web/dist
"""

import argparse
import os
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="FOLIO Mapper Desktop Backend")
    parser.add_argument("--port", type=int, required=True, help="Port to bind to")
    parser.add_argument("--web-dir", type=str, required=True, help="Path to built web app")
    args = parser.parse_args()

    os.environ["FOLIO_MAPPER_WEB_DIR"] = args.web_dir
    os.environ["FOLIO_MAPPER_ORIGIN"] = f"http://127.0.0.1:{args.port}"

    import uvicorn
    from app.main import app

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
