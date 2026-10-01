"""Entry point: `python -m shortener [serve|purge|backup <file>]`."""

from __future__ import annotations

import sys

from .config import Config
from .service import LinkService
from .storage import Storage
from .web import create_server


def main(argv: list[str]) -> int:
    command = argv[0] if argv else "serve"
    config = Config.from_env()
    service = LinkService(Storage(config.db_path))

    if command == "purge":
        print(f"removed {service.purge_expired()} expired link(s)")
        return 0
    if command == "backup":
        if len(argv) != 2:
            print("usage: python -m shortener backup <destination-file>", file=sys.stderr)
            return 2
        service.storage.backup(argv[1])
        print(f"backup written to {argv[1]}")
        return 0
    if command != "serve":
        print("usage: python -m shortener [serve|purge|backup <file>]", file=sys.stderr)
        return 2

    server = create_server(service, config)
    if config.token_generated:
        print(f"LINKLY_TOKEN not set; generated one for this run:\n  {config.token}")
    print(f"Linkly listening on http://{config.host}:{config.port}  (db: {config.db_path})", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
    finally:
        server.server_close()
    return 0


def main_cli() -> None:
    sys.exit(main(sys.argv[1:]))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
