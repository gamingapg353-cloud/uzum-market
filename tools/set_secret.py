"""Kalitlarni .env ga yozadi (qiymatlarni ekranga chiqarmaydi).

    python tools/set_secret.py          -> clipboard'dagi GitHub secret
    python tools/set_secret.py google   -> Yuklanmalar papkasidagi eng yangi client_secret_*.json (Google)
    python tools/set_secret.py smtp     -> clipboard'dagi Gmail App Password (email yuborish uchun)
"""
import glob
import json
import os
import re
import sys

ENV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")


def write_env(pairs: dict) -> None:
    with open(ENV, encoding="utf-8") as f:
        lines = f.read().splitlines()
    for key, value in pairs.items():
        for i, line in enumerate(lines):
            if line.startswith(key + "="):
                lines[i] = f"{key}={value}"
                break
        else:
            lines.append(f"{key}={value}")
    with open(ENV, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def clipboard() -> str:
    import tkinter
    root = tkinter.Tk()
    root.withdraw()
    try:
        value = root.clipboard_get().strip()
    except tkinter.TclError:
        value = ""
    root.destroy()
    return value


def smtp() -> None:
    """Gmail App Password (16 harf, bo'sh joylar bilan bo'lishi mumkin)"""
    value = re.sub(r"\s", "", clipboard())
    if not re.fullmatch(r"[a-zA-Z]{16}", value):
        sys.exit(f"XATO: clipboard'da Gmail App Password topilmadi ({len(value)} belgi). U 16 ta harfdan iborat bo'ladi.")
    write_env({"SMTP_USER": "gamingapg353@gmail.com", "SMTP_PASSWORD": value})
    print("OK: SMTP_USER va SMTP_PASSWORD .env ga yozildi.")


def github() -> None:
    value = clipboard()
    if not re.fullmatch(r"[0-9a-fA-F]{40}", value):
        sys.exit(f"XATO: clipboard'da GitHub secret topilmadi ({len(value)} belgi).")
    write_env({"GITHUB_CLIENT_SECRET": value})
    print("OK: GITHUB_CLIENT_SECRET .env ga yozildi.")


def google() -> None:
    files = glob.glob(os.path.join(os.path.expanduser("~"), "Downloads", "client_secret_*.json"))
    if not files:
        sys.exit("XATO: Yuklanmalar (Downloads) papkasida client_secret_*.json topilmadi.")
    path = max(files, key=os.path.getmtime)
    with open(path, encoding="utf-8") as f:
        web = json.load(f).get("web", {})
    cid, secret = web.get("client_id", ""), web.get("client_secret", "")
    if not cid.endswith(".apps.googleusercontent.com") or not secret:
        sys.exit("XATO: JSON faylda 'web' client topilmadi (Web application turini tanlaganmisiz?).")
    redirects = web.get("redirect_uris", [])
    write_env({"GOOGLE_CLIENT_ID": cid, "GOOGLE_CLIENT_SECRET": secret})
    print(f"OK: GOOGLE_CLIENT_ID va GOOGLE_CLIENT_SECRET .env ga yozildi ({os.path.basename(path)}).")
    print("Redirect URI to'g'ri:" if "http://localhost:8000/auth/google/callback" in redirects
          else "OGOHLANTIRISH: redirect URI ro'yxatida http://localhost:8000/auth/google/callback yo'q!")


if __name__ == "__main__":
    {"google": google, "smtp": smtp}.get(sys.argv[1] if len(sys.argv) > 1 else "", github)()
