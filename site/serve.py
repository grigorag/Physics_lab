#!/usr/bin/env python3
"""Static server for the Physics Lab site (standard library only).

    python serve.py                  # http://localhost:8000
    python serve.py --port 80 --host 0.0.0.0

The site is also reachable under /Physics_lab/ (as on GitHub Pages),
e.g. http://localhost:8000/Physics_lab/ .
"""
import argparse
import mimetypes
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PREFIX = "/Physics_lab"

# ES modules need a JavaScript MIME type; some systems map .js to text/plain.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path == PREFIX or path.startswith(PREFIX + "/") or path.startswith(PREFIX + "?"):
            path = path[len(PREFIX):] or "/"
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    args = ap.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=ROOT))
    print(f"Serving {ROOT} on http://{args.host}:{args.port}  (also under {PREFIX}/)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
