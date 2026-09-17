#!/usr/bin/env python3
"""Tiny static server for local + Quest testing.

    python3 web/tools/serve.py [port]

Serves the folder containing index.html, found by walking up.
For the Quest: `adb reverse tcp:8123 tcp:8123`, then open
http://localhost:8123/ in the headset browser -- localhost counts
as a secure context, so WebXR works without HTTPS.

(Uses an explicit root rather than `python3 -m http.server`, whose
argparse defaults call os.getcwd() at import time and trip sandboxes.)
"""
import functools
import json
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

def find_root():
    """The directory holding index.html, found by walking up from this script.

    Written this way so the same script works from `web/tools/` in the
    working tree and from `versions/vN/tools/` in a snapshot, which sit at
    different depths. Hard-coding the number of dirname() calls silently
    served the wrong folder from a snapshot.
    """
    d = os.path.dirname(os.path.abspath(__file__))
    for _ in range(5):
        d = os.path.dirname(d)
        if os.path.exists(os.path.join(d, 'index.html')):
            return d
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


ROOT = find_root()
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

# ---- the shared collection file (v7) --------------------------------
#  localStorage is per-origin, so the headset and the desktop would hold
#  separate collections and a cleared browser would wipe the exhibition.
#  The JSON lives on disk here instead: every client GETs it on load
#  (already handled -- it is a plain static file) and POSTs it on save.
COLLECTION = 'dna_sequences.json'
_write_lock = threading.Lock()


def write_collection(data):
    """Atomically replace ROOT/dna_sequences.json with `data`.

    os.replace is atomic on POSIX, so a reader never sees a half-written
    file; the lock serialises concurrent POSTs. A single exhibition
    station has one writer anyway -- this just stops a stray second
    client from corrupting the file.
    """
    dest = os.path.join(ROOT, COLLECTION)
    tmp = dest + '.tmp'
    with _write_lock:
        with open(tmp, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, dest)


class Server(ThreadingHTTPServer):
    # THREADING MATTERS HERE, it is not a nicety.
    #
    # A plain HTTPServer handles one connection at a time. A headset sitting
    # on the certificate warning holds its socket open while the person reads
    # it, and a single-threaded server blocks there forever -- every later
    # request, even from localhost, hangs with no error and no log line. The
    # server looks alive in ps and netstat the whole time.
    daemon_threads = True
    # so a half-open connection retires instead of occupying a thread for good
    timeout = 30


class Handler(SimpleHTTPRequestHandler):
    # give up on a client that opens a socket and then says nothing
    timeout = 30

    # Python's mimetypes gives .m4a as "audio/mp4a-latm", which is a raw
    # AAC-LATM stream and NOT what these files are -- they are AAC in an
    # MP4 container. Chromium refuses the wrong one outright, so the music
    # bed would 200 cleanly and then never sound. Say what they actually
    # are. (SimpleHTTPRequestHandler's extensions_map is a class attribute
    # shared with every other handler in the process, so it is copied.)
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        '.m4a': 'audio/mp4',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
    })

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        # advertised on every response, so a media element knows it may ask
        # for one -- see _serve_range below
        self.send_header('Accept-Ranges', 'bytes')
        SimpleHTTPRequestHandler.end_headers(self)

    # ---- HTTP Range, which is what a <video>/<audio> element asks for ----
    #
    # SimpleHTTPRequestHandler ignores Range entirely and answers 200 with
    # the whole file. Chromium tolerates that for a small clip, but it
    # cannot seek inside one -- and `loop = true` on an <audio> element IS
    # a seek, back to zero, every time the track ends. With the v10.4 music
    # bed (2.1 MB, looping all day) that is the difference between a room
    # with sound in it and a room where the music plays once.
    #
    # It is also the answer to the note in audio/README.md: "if a track
    # plays on the desktop but not in the headset, this is the likely
    # cause". Now it is not.
    #
    # One range only. Multipart/byteranges is in the spec and no browser
    # media element has ever sent it.
    def _serve_range(self):
        rng = self.headers.get('Range')
        if not rng or not rng.strip().lower().startswith('bytes='):
            return False
        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.isfile(path):
            return False
        try:
            size = os.path.getsize(path)
            spec = rng.split('=', 1)[1].strip()
            if ',' in spec:
                return False                      # multipart: let the 200 path have it
            first, _, last = spec.partition('-')
            if first == '':                       # bytes=-N, the final N bytes
                n = int(last)
                if n <= 0:
                    raise ValueError
                start, end = max(0, size - n), size - 1
            else:
                start = int(first)
                end = int(last) if last else size - 1
                end = min(end, size - 1)
            if start > end or start >= size:
                self.send_response(416)
                self.send_header('Content-Range', 'bytes */%d' % size)
                self.send_header('Content-Length', '0')
                self.end_headers()
                return True
        except Exception:
            return False                          # unparseable: answer the whole file
        n = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.send_header('Content-Length', str(n))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        if self.command == 'HEAD':
            return True
        with open(path, 'rb') as f:
            f.seek(start)
            left = n
            while left > 0:
                chunk = f.read(min(64 * 1024, left))
                if not chunk:
                    break
                self.wfile.write(chunk)
                left -= len(chunk)
        return True


    def do_GET(self):
        # before the first butterfly the collection file does not exist yet.
        # Answer an empty collection rather than a 404, so the client's
        # load-time fetch is not a red error in every fresh install's console.
        if (self.path.split('?')[0].rstrip('/') == '/' + COLLECTION
                and not os.path.exists(os.path.join(ROOT, COLLECTION))):
            body = b'{\n  "sequences": []\n}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self._serve_range():
            return
        SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        # the only writable path: the shared collection (see write_collection)
        if self.path.rstrip('/') != '/' + COLLECTION:
            self.send_error(404)
            return
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n <= 0 or n > 8 * 1024 * 1024:
                raise ValueError('bad length')
            data = json.loads(self.rfile.read(n).decode('utf-8'))
            if not isinstance(data.get('sequences'), list):
                raise ValueError('expected {"sequences": [ ... ]}')
        except Exception:
            self.send_error(400, 'expected {"sequences": [ ... ]}')
            return
        try:
            write_collection(data)
        except Exception as e:
            self.send_error(500, 'could not write %s (%s)' % (COLLECTION, e))
            return
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))


if __name__ == '__main__':
    h = functools.partial(Handler, directory=ROOT)
    print('serving %s on http://localhost:%d/' % (ROOT, PORT))
    sys.stdout.flush()
    Server(('0.0.0.0', PORT), h).serve_forever()
