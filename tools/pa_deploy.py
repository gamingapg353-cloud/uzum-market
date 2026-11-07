"""PythonAnywhere'ga bitta buyruq bilan joylash (API orqali).

1. pythonanywhere.com -> Account -> API token -> tokenni Ctrl+C bilan nusxalang
2. python tools/pa_deploy.py

Skript: git'dagi fayllarni + .env ni yuklaydi, web app yaratadi (bo'lmasa), WSGI faylni yozadi va Reload qiladi.
Token clipboard'dan olinadi va ekranga chiqarilmaydi.
"""
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

USER = "uzummarket"
HOST = "https://www.pythonanywhere.com"
DOMAIN = f"{USER}.pythonanywhere.com"
REMOTE = f"/home/{USER}/uzum-market"
BASE_URL = "https://uzum-market-uz.netlify.app"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

WSGI = f'''import sys
sys.path.insert(0, "{REMOTE}")
from wsgi import application  # noqa
'''


def token_from_clipboard() -> str:
    import tkinter
    r = tkinter.Tk()
    r.withdraw()
    try:
        t = r.clipboard_get().strip()
    except tkinter.TclError:
        t = ""
    r.destroy()
    if not re.fullmatch(r"[0-9a-f]{40}", t):
        sys.exit(f"XATO: clipboard'da PythonAnywhere API token topilmadi ({len(t)} belgi, 40 ta bo'lishi kerak).")
    return t


def api(token, method, path, data=None, files=None):
    url = f"{HOST}/api/v0/user/{USER}/{path}"
    headers = {"Authorization": f"Token {token}"}
    body = None
    if files:
        boundary = uuid.uuid4().hex
        parts = []
        for name, content in files.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{name}"\r\n'
                         f"Content-Type: application/octet-stream\r\n\r\n".encode() + content + b"\r\n")
        body = b"".join(parts) + f"--{boundary}--\r\n".encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif data is not None:
        body = urllib.parse.urlencode(data).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else raw)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")[:300]


def upload(token, remote_path, content: bytes):
    code, res = api(token, "POST", f"files/path{remote_path}", files={"content": content})
    if code not in (200, 201):
        sys.exit(f"XATO: {remote_path} yuklanmadi ({code}): {res}")


def env_content() -> bytes:
    path = os.path.join(ROOT, ".env")
    if not os.path.exists(path):
        sys.exit("XATO: .env topilmadi")
    lines = [l for l in open(path, encoding="utf-8").read().splitlines() if not l.startswith("BASE_URL=")]
    lines.append(f"BASE_URL={BASE_URL}")
    return ("\n".join(lines) + "\n").encode()


def main():
    import urllib.parse  # noqa: F401  (api() ichida ishlatiladi)
    token = token_from_clipboard()

    code, _ = api(token, "GET", "webapps/")
    if code == 401 or code == 403:
        sys.exit("XATO: token noto'g'ri yoki eskirgan")

    files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    files = [f for f in files if f]
    print(f"1) {len(files)} ta fayl yuklanmoqda...")
    for f in files:
        with open(os.path.join(ROOT, f), "rb") as fh:
            upload(token, f"{REMOTE}/{f}", fh.read())
    upload(token, f"{REMOTE}/.env", env_content())
    print("   OK (+ .env, BASE_URL qo'shildi)")

    code, apps = api(token, "GET", "webapps/")
    if not any(a.get("domain_name") == DOMAIN for a in (apps if isinstance(apps, list) else [])):
        print("2) Web app yaratilmoqda...")
        code, res = api(token, "POST", "webapps/", data={"domain_name": DOMAIN, "python_version": "python312"})
        if code not in (200, 201):
            sys.exit(f"XATO: web app yaratilmadi ({code}): {res}")
    else:
        print("2) Web app allaqachon bor")

    print("3) WSGI fayl yozilmoqda...")
    upload(token, f"/var/www/{DOMAIN.replace('.', '_')}_wsgi.py", WSGI.encode())

    print("4) Reload...")
    code, res = api(token, "POST", f"webapps/{DOMAIN}/reload/")
    if code != 200:
        sys.exit(f"XATO: reload bo'lmadi ({code}): {res}")
    print(f"TAYYOR: https://{DOMAIN}")


if __name__ == "__main__":
    main()
