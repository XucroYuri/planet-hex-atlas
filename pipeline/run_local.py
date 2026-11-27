"""Serve the static source site locally, with optional no-store headers."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Static(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=8000)
    parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[1]/'web'))
    args=parser.parse_args()
    def handler(*items,**kwargs):return Static(*items,directory=args.directory,**kwargs)
    ThreadingHTTPServer(('127.0.0.1',args.port),handler).serve_forever()
