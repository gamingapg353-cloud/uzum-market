"""PythonAnywhere (va boshqa WSGI hostinglar) uchun ko'prik.

server.py dagi Handler'ni o'zgartirmasdan WSGI ilovaga aylantiradi:
har bir so'rov uchun Handler "soxta" ulanish bilan chaqiriladi va uning javobi WSGI javobiga o'giriladi.

PythonAnywhere WSGI faylida:
    import sys
    sys.path.insert(0, "/home/SIZNING_LOGIN/uzum-market")
    from wsgi import application
"""
import io
import os
import sys
from email.parser import BytesHeaderParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server  # noqa: E402  (.env shu yerda yuklanadi)

server.bootstrap()


class _WSGIHandler(server.Handler):
    """Handler'ni tarmoq ulanishisiz ishlatish uchun."""

    def __init__(self, environ, body: bytes):  # noqa: D107 — ota-klass __init__ ataylab chaqirilmaydi
        self.directory = server.ROOT
        self.rfile = io.BytesIO(body)
        self.wfile = io.BytesIO()
        self.client_address = (environ.get("REMOTE_ADDR", "127.0.0.1"), 0)
        self.server = None
        self.request_version = "HTTP/1.1"
        self.command = environ["REQUEST_METHOD"]
        query = environ.get("QUERY_STRING", "")
        self.path = environ.get("PATH_INFO", "/") + (f"?{query}" if query else "")
        self.requestline = f"{self.command} {self.path} HTTP/1.1"
        self.close_connection = True
        raw = "".join(f"{k[5:].replace('_', '-').title()}: {v}\r\n" for k, v in environ.items() if k.startswith("HTTP_"))
        if environ.get("CONTENT_TYPE"):
            raw += f"Content-Type: {environ['CONTENT_TYPE']}\r\n"
        raw += f"Content-Length: {len(body)}\r\n"
        self.headers = BytesHeaderParser().parsebytes(raw.encode("latin-1") + b"\r\n")


def application(environ, start_response):
    length = int(environ.get("CONTENT_LENGTH") or 0)
    body = environ["wsgi.input"].read(length) if length else b""
    h = _WSGIHandler(environ, body)
    method = getattr(h, "do_" + h.command, None)
    if method is None:
        start_response("405 Method Not Allowed", [("Content-Type", "text/plain")])
        return [b"Method Not Allowed"]
    method()

    raw = h.wfile.getvalue()
    head, _, payload = raw.partition(b"\r\n\r\n")
    lines = head.decode("latin-1").split("\r\n")
    status = lines[0].split(" ", 1)[1]  # "HTTP/1.0 200 OK" -> "200 OK"
    skip = {"server", "date", "connection"}  # bularni hosting o'zi qo'yadi
    headers = [tuple(x.split(": ", 1)) for x in lines[1:] if ": " in x and x.split(":", 1)[0].lower() not in skip]
    start_response(status, headers)
    return [payload]
