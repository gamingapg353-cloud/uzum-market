"""Uzum Market (o'quv loyiha) — Python server.

Ishga tushirish:  python server.py   ->  http://localhost:8000

Statik fayllarni beradi va /api/... so'rovlarini bajaradi.
Ma'lumotlar data/db.json faylida saqlanadi, buyurtmalar data/orders.csv ga ham yoziladi
(uni tools/report.cpp o'qiydi).

Google / GitHub orqali kirish uchun muhit o'zgaruvchilarini o'rnating:
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
Callback manzillari:
  http://localhost:8000/auth/google/callback
  http://localhost:8000/auth/github/callback
"""

import csv
import hashlib
import hmac
import json
import os
import posixpath
import re
import secrets
import smtplib
import ssl
import threading
import time
import urllib.parse
import urllib.request
from email.message import EmailMessage
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


def load_env(path: str) -> None:
    """.env faylidagi KALIT=qiymat qatorlarini muhit o'zgaruvchilariga yuklaydi."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            if value:
                os.environ.setdefault(key.strip(), value)


load_env(os.path.join(ROOT, ".env"))
DATA_DIR = os.environ.get("DATA_DIR") or os.path.join(ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "db.json")
CSV_PATH = os.path.join(DATA_DIR, "orders.csv")
PORT = int(os.environ.get("PORT", "8000"))
# Render.com o'z manzilini RENDER_EXTERNAL_URL orqali beradi
BASE_URL = (os.environ.get("BASE_URL") or os.environ.get("RENDER_EXTERNAL_URL")
            or f"http://localhost:{PORT}").rstrip("/")
HOST = os.environ.get("HOST", "127.0.0.1")  # hostingda 0.0.0.0

OWNER_EMAIL = os.environ.get("OWNER_EMAIL", "gamingapg353@gmail.com")
OWNER_PASSWORD = os.environ.get("OWNER_PASSWORD", "")  # .env da saqlanadi, kodda emas

LOCK = threading.Lock()
OAUTH_STATES: dict[str, float] = {}


# ---------- parol ----------
def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${digest}"


def check_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(hash_password(password, salt), stored)


# ---------- baza ----------
def img(photo_id: str) -> str:
    return f"https://images.unsplash.com/photo-{photo_id}?w=600&h=600&fit=crop&q=75"


SEED_VERSION = 2
TEMPLATE_IMG = img("1530018607912-eff2daa1bac4")  # JS dagi TEMPLATE_IMG bilan bir xil

SEED_PRODUCTS = [
    ("Yumshoq divan «Oslo»", 4_890_000, "mebel", img("1555041469-a586c61ea9bc")),
    ("Ofis kreslosi ergonomik", 1_250_000, "mebel", img("1580480055273-228ff5388ef8")),
    ("Yog'och ovqat stoli", 2_300_000, "mebel", img("1617806118233-18e1de247200")),
    ("Kitob javoni 5 qavatli", 870_000, "mebel", img("1594620302200-9a762244a156")),
    ("Ikki kishilik karavot", 3_600_000, "mebel", img("1505693416388-ac5ce068fe85")),
    ("Kreslo «Skandi» oq", 1_690_000, "mebel", img("1567538096630-e0c55bd6374c")),
    ("Burchak divani kulrang", 6_200_000, "mebel", img("1493663284031-b7e3aefcae8e")),
    ("Stul «Loft» qora, 2 dona", 740_000, "mebel", img("1592078615290-033ee584e267")),
    ("Gaming PC Ryzen 7 / RTX 4070", 18_900_000, "pc", img("1587202372775-e229f172b9d7")),
    ("Ofis PC Intel i5 / 16GB", 6_400_000, "pc", img("1593640408182-31c70c8268f5")),
    ("Monoblok 24\" all-in-one", 8_750_000, "pc", img("1527443224154-c4a3942d3acf")),
    ("Mini PC 8GB / 256GB SSD", 3_200_000, "pc", img("1547082299-de196ea013d6")),
    ("Videokarta RTX 4070 12GB", 7_900_000, "pc", img("1591405351990-4726e331f141")),
    ("Noutbuk 15.6\" Core i7", 11_500_000, "notebook", img("1496181133206-80ce9b88a853")),
    ("Ultrabook 13\" 1.1 kg", 13_900_000, "notebook", img("1517336714731-489689fd1ca8")),
    ("Gaming noutbuk RTX 4060", 16_200_000, "notebook", img("1603302576837-37561b2e2302")),
    ("Talaba noutbuki 14\"", 5_300_000, "notebook", img("1588872657578-7efd1f1555ed")),
    ("Noutbuk 14\" OLED 16GB", 12_400_000, "notebook", img("1593642702821-c8da6771f0c6")),
]


def empty_db() -> dict:
    return {"users": [], "products": [], "orders": [], "sessions": {}}


def load_db() -> dict:
    if not os.path.exists(DB_PATH):
        return empty_db()
    with open(DB_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_db(db: dict) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = DB_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=1)
    os.replace(tmp, DB_PATH)


def new_id() -> str:
    return secrets.token_hex(6)


def bootstrap() -> None:
    db = load_db()
    owner = next((u for u in db["users"] if u["email"] == OWNER_EMAIL), None)
    if owner is None:
        if not OWNER_PASSWORD:
            raise SystemExit("XATO: .env faylida OWNER_PASSWORD yo'q (.env.example ga qarang)")
        db["users"].append({
            "id": new_id(), "name": "Samandar", "email": OWNER_EMAIL,
            "password": hash_password(OWNER_PASSWORD), "role": "owner",
            "provider": "parol", "avatar": "", "created": int(time.time()),
        })
    else:
        owner["role"] = "owner"
    # avval ishga olinganlar ham "ishchi" bo'lsin
    for a in db.get("applications", []):
        if a["status"] == "hired":
            make_worker(db, a["userId"])
            a.get("notify", {}).pop("sms", None)
    if db.get("seedVersion", 0) < SEED_VERSION:
        # boshlang'ich mahsulotlar: yo'qlarini qo'shish, eski (ishlamay qolgan) rasmlarni yangilash
        by_name = {p["name"]: p for p in db["products"] if p.get("sellerId") is None}
        for name, price, cat, image in SEED_PRODUCTS:
            if name in by_name:
                by_name[name]["image"] = image
            else:
                db["products"].append({
                    "id": new_id(), "name": name, "price": price, "category": cat,
                    "image": image, "seller": "Uzum Market", "sellerId": None,
                    "created": int(time.time()),
                })
        for p in db["products"]:
            if "loremflickr.com" in p["image"]:
                p["image"] = TEMPLATE_IMG
        images = {p["id"]: p["image"] for p in db["products"]}
        for o in db["orders"]:
            if "loremflickr.com" in o.get("image", ""):
                o["image"] = images.get(o["productId"], "")
        db["seedVersion"] = SEED_VERSION
    save_db(db)
    if not os.path.exists(CSV_PATH):
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(["time", "email", "product", "category", "price", "qty"])


def public_user(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "name", "email", "role", "provider", "avatar", "avatarCustom", "created")}


def make_session(db: dict, user: dict) -> str:
    token = secrets.token_urlsafe(32)
    db["sessions"][token] = user["id"]
    return token


def upsert_oauth_user(email: str, name: str, avatar: str, provider: str) -> str:
    with LOCK:
        db = load_db()
        user = next((u for u in db["users"] if u["email"].lower() == email.lower()), None)
        if user is None:
            user = {"id": new_id(), "name": name or email.split("@")[0], "email": email,
                    "password": "", "role": "user", "provider": provider,
                    "avatar": avatar, "created": int(time.time())}
            db["users"].append(user)
        elif avatar and not user.get("avatarCustom"):
            # o'zi yuklagan rasm bo'lmasa — oxirgi kirgan xizmat (Google/GitHub) rasmi
            user["avatar"] = avatar
        token = make_session(db, user)
        save_db(db)
        return token


# ---------- OAuth ----------
def http_json(url: str, data: dict | None = None, headers: dict | None = None) -> dict:
    body = urllib.parse.urlencode(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers={"Accept": "application/json",
                                                          "User-Agent": "uzum-oquv-loyiha", **(headers or {})})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


# ---------- Xabar yuborish: email (SMTP) ----------
# Natija: "yuborildi" | "sozlanmagan" | "xato"
def send_email(to: str, subject: str, text: str) -> str:
    user, password = os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASSWORD")
    if not user or not password:
        return "sozlanmagan"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"Uzum Market <{user}>"
    msg["To"] = to
    msg.set_content(text)
    try:
        host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
        port = int(os.environ.get("SMTP_PORT", "465"))
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=15) as s:
            s.login(user, password.replace(" ", ""))  # Gmail App Password bo'sh joylar bilan beriladi
            s.send_message(msg)
        return "yuborildi"
    except Exception as e:
        print(f"[EMAIL XATO] {e!r}", flush=True)
        return "xato"


def normalize_phone(raw: str) -> str | None:
    """'+998 90 123-45-67' yoki '901234567' -> '998901234567'"""
    d = re.sub(r"\D", "", raw or "")
    if len(d) == 9:
        d = "998" + d
    return d if re.fullmatch(r"998\d{9}", d) else None


def make_worker(db: dict, user_id: str) -> None:
    """Ishga olingan oddiy foydalanuvchi 'worker' (ishchi) bo'ladi; admin/egasi o'zgarmaydi."""
    for u in db["users"]:
        if u["id"] == user_id and u["role"] == "user":
            u["role"] = "worker"


def hire_template(name: str) -> str:
    return (f"Hurmatli {name}! Siz Uzum Market'ga ishga qabul qilindingiz. "
            "Iltimos, bazaga kelib, narsalarni olib boring.")


OAUTH = {
    "google": {
        "auth": "https://accounts.google.com/o/oauth2/v2/auth",
        "scope": "openid email profile",
        "id": os.environ.get("GOOGLE_CLIENT_ID"), "secret": os.environ.get("GOOGLE_CLIENT_SECRET"),
    },
    "github": {
        "auth": "https://github.com/login/oauth/authorize",
        "scope": "read:user user:email",
        "id": os.environ.get("GITHUB_CLIENT_ID"), "secret": os.environ.get("GITHUB_CLIENT_SECRET"),
    },
}


def oauth_finish(provider: str, code: str) -> str:
    cfg = OAUTH[provider]
    redirect = f"{BASE_URL}/auth/{provider}/callback"
    if provider == "google":
        tok = http_json("https://oauth2.googleapis.com/token", {
            "code": code, "client_id": cfg["id"], "client_secret": cfg["secret"],
            "redirect_uri": redirect, "grant_type": "authorization_code"})
        info = http_json("https://www.googleapis.com/oauth2/v3/userinfo",
                         headers={"Authorization": f"Bearer {tok['access_token']}"})
        return upsert_oauth_user(info["email"], info.get("name", ""), info.get("picture", ""), "google")
    tok = http_json("https://github.com/login/oauth/access_token", {
        "code": code, "client_id": cfg["id"], "client_secret": cfg["secret"], "redirect_uri": redirect})
    auth = {"Authorization": f"Bearer {tok['access_token']}"}
    info = http_json("https://api.github.com/user", headers=auth)
    email = info.get("email")
    if not email:
        emails = http_json("https://api.github.com/user/emails", headers=auth)
        email = next((e["email"] for e in emails if e.get("primary")), f"{info['login']}@users.noreply.github.com")
    return upsert_oauth_user(email, info.get("name") or info["login"], info.get("avatar_url", ""), "github")


# ---------- HTTP ----------
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        # brauzer eski HTML/JS/CSS ni keshdan ko'rsatmasin — har safar yangisini olsin
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    # yordamchilar
    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def error(self, msg, status=400):
        self.send_json({"error": msg}, status)

    def redirect(self, url):
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()

    def body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if n > 6_000_000:
            raise ValueError("So'rov juda katta")
        return json.loads(self.rfile.read(n) or b"{}")

    def current(self, db):
        token = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        uid = db["sessions"].get(token)
        return next((u for u in db["users"] if u["id"] == uid), None), token

    def do_GET(self):
        path = urllib.parse.urlparse(self.path)
        if path.path.startswith("/auth/"):
            return self.oauth(path)
        if path.path.startswith("/api/"):
            return self.api("GET", path.path)
        # maxfiy fayllarni (.env, .git, server.py, data/ ...) brauzerga bermaslik
        rel = posixpath.normpath(urllib.parse.unquote(path.path)).lstrip("/").lower()
        if rel.startswith((".", "data", "tools", "server.py", "__pycache__", "client_secret", "oauth application")) \
                or "/." in rel:
            return self.error("Ruxsat yo'q", 403)
        return super().do_GET()

    def do_POST(self):
        self.api("POST", urllib.parse.urlparse(self.path).path)

    def do_DELETE(self):
        self.api("DELETE", urllib.parse.urlparse(self.path).path)

    def oauth(self, path):
        parts = path.path.strip("/").split("/")  # auth/<provider>[/callback]
        provider = parts[1] if len(parts) > 1 else ""
        if provider not in OAUTH:
            return self.error("Noma'lum provayder", 404)
        cfg = OAUTH[provider]
        if not cfg["id"] or not cfg["secret"]:
            return self.redirect(f"/#oauth-error={provider}-sozlanmagan")
        if len(parts) == 2:
            state = secrets.token_urlsafe(16)
            OAUTH_STATES[state] = time.time()
            q = urllib.parse.urlencode({"client_id": cfg["id"], "redirect_uri": f"{BASE_URL}/auth/{provider}/callback",
                                        "response_type": "code", "scope": cfg["scope"], "state": state})
            return self.redirect(f"{cfg['auth']}?{q}")
        qs = urllib.parse.parse_qs(path.query)
        state = qs.get("state", [""])[0]
        if OAUTH_STATES.pop(state, 0) < time.time() - 600 or "code" not in qs:
            print(f"[OAUTH] {provider}: bekor qilindi yoki state eskirgan ({qs.get('error', [''])[0]})", flush=True)
            return self.redirect("/#oauth-error=bekor-qilindi")
        try:
            token = oauth_finish(provider, qs["code"][0])
        except Exception as e:
            detail = e.read().decode(errors="replace")[:300] if hasattr(e, "read") else ""
            print(f"[OAUTH XATO] {provider}: {e!r} {detail}", flush=True)
            return self.redirect("/#oauth-error=xatolik")
        self.redirect(f"/#token={token}")

    def api(self, method, path):
        try:
            with LOCK:
                db = load_db()
                result = self.route(db, method, path.rstrip("/").split("/")[2:])
            if result is not None:
                status, data = result
                self.send_json(data, status)
        except ValueError as e:
            self.error(str(e))
        except Exception as e:  # noqa
            self.error(f"Server xatosi: {e}", 500)

    def route(self, db, method, p):
        me, token = self.current(db)

        if p == ["register"] and method == "POST":
            b = self.body()
            name, email, pw = b.get("name", "").strip(), b.get("email", "").strip().lower(), b.get("password", "")
            if not name or "@" not in email or len(pw) < 6:
                return 400, {"error": "Ism, to'g'ri email va kamida 6 belgili parol kiriting"}
            if any(u["email"] == email for u in db["users"]):
                return 400, {"error": "Bu email allaqachon ro'yxatdan o'tgan"}
            user = {"id": new_id(), "name": name, "email": email, "password": hash_password(pw),
                    "role": "user", "provider": "parol", "avatar": "", "created": int(time.time())}
            db["users"].append(user)
            t = make_session(db, user)
            save_db(db)
            return 200, {"token": t, "user": public_user(user)}

        if p == ["login"] and method == "POST":
            b = self.body()
            email = b.get("email", "").strip().lower()
            user = next((u for u in db["users"] if u["email"] == email), None)
            if not user or not check_password(b.get("password", ""), user["password"]):
                return 401, {"error": "Email yoki parol noto'g'ri"}
            t = make_session(db, user)
            save_db(db)
            return 200, {"token": t, "user": public_user(user)}

        if p == ["products"] and method == "GET":
            return 200, {"products": db["products"], "server": "Python"}

        # quyidagilar uchun kirish shart
        if not me:
            return 401, {"error": "Avval tizimga kiring"}
        is_owner = me["role"] == "owner"
        is_admin = me["role"] in ("owner", "admin")

        if p == ["me"]:
            return 200, {"user": public_user(me)}

        if p == ["me", "avatar"] and method == "POST":
            image = str(self.body().get("image", ""))
            if image and not image.startswith("data:image/"):
                return 400, {"error": "Rasm tanlang"}
            if len(image) > 400_000:
                return 400, {"error": "Rasm juda katta"}
            me["avatar"] = image
            me["avatarCustom"] = bool(image)
            save_db(db)
            return 200, {"user": public_user(me)}

        if p == ["logout"] and method == "POST":
            db["sessions"].pop(token, None)
            save_db(db)
            return 200, {"ok": True}

        if p == ["products"] and method == "POST":
            b = self.body()
            name = str(b.get("name", "")).strip()
            cat = b.get("category")
            image = str(b.get("image", ""))
            try:
                price = int(b.get("price", 0))
            except (TypeError, ValueError):
                price = 0
            if not name or price <= 0 or cat not in ("mebel", "pc", "notebook"):
                return 400, {"error": "Nomi, narxi va bo'limni to'ldiring"}
            if not (image.startswith("data:image/") or image.startswith("https://")):
                return 400, {"error": "Rasm tanlang"}
            prod = {"id": new_id(), "name": name[:120], "price": price, "category": cat, "image": image,
                    "seller": me["name"], "sellerId": me["id"], "created": int(time.time())}
            db["products"].insert(0, prod)
            save_db(db)
            return 200, {"product": prod}

        if len(p) == 2 and p[0] == "products" and method == "DELETE":
            prod = next((x for x in db["products"] if x["id"] == p[1]), None)
            if not prod:
                return 404, {"error": "Topilmadi"}
            if not is_admin and prod.get("sellerId") != me["id"]:
                return 403, {"error": "Ruxsat yo'q"}
            db["products"].remove(prod)
            save_db(db)
            return 200, {"ok": True}

        if p == ["orders"] and method == "POST":
            items = self.body().get("items", [])
            products = {x["id"]: x for x in db["products"]}
            created = []
            for it in items:
                prod = products.get(it.get("id"))
                qty = max(1, min(99, int(it.get("qty", 1))))
                if not prod:
                    continue
                order = {"id": new_id(), "userId": me["id"], "productId": prod["id"], "name": prod["name"],
                         "image": prod["image"] if prod["image"].startswith("http") else "",
                         "price": prod["price"], "qty": qty, "time": int(time.time())}
                db["orders"].append(order)
                created.append(order)
            if not created:
                return 400, {"error": "Savat bo'sh"}
            save_db(db)
            with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
                w = csv.writer(f)
                for o in created:
                    cat = products[o["productId"]]["category"]
                    w.writerow([o["time"], me["email"], o["name"], cat, o["price"], o["qty"]])
            return 200, {"orders": created}

        if p == ["orders"] and method == "GET":
            return 200, {"orders": [o for o in db["orders"] if o["userId"] == me["id"]]}

        # ---- ishga kirish arizalari ----
        apps = db.setdefault("applications", [])

        if p == ["applications", "me"] and method == "GET":
            mine = [a for a in apps if a["userId"] == me["id"]]
            return 200, {"application": mine[-1] if mine else None}

        if p == ["applications"] and method == "POST":
            if is_owner:
                return 400, {"error": "Egasi ariza topshirmaydi 🙂"}
            if any(a["userId"] == me["id"] and a["status"] == "new" for a in apps):
                return 400, {"error": "Arizangiz allaqachon ko'rib chiqilmoqda"}
            b = self.body()
            phone = normalize_phone(str(b.get("phone", "")))
            email = str(b.get("email", "")).strip().lower()
            comment = str(b.get("comment", "")).strip()
            if not phone:
                return 400, {"error": "Telefon raqamni to'g'ri kiriting: +998 90 123 45 67"}
            if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
                return 400, {"error": "Email noto'g'ri"}
            if len(comment) < 3:
                return 400, {"error": "Fikringizni yozing"}
            app = {"id": new_id(), "userId": me["id"], "name": me["name"], "phone": phone, "email": email,
                   "comment": comment[:1000], "status": "new", "created": int(time.time())}
            apps.append(app)
            save_db(db)
            return 200, {"application": app}

        if p == ["applications"] and method == "GET":
            if not is_owner:
                return 403, {"error": "Faqat egasi (owner)"}
            avatars = {u["id"]: u.get("avatar", "") for u in db["users"]}
            return 200, {"applications": [{**a, "avatar": avatars.get(a["userId"], "")} for a in reversed(apps)]}

        if len(p) == 3 and p[0] == "applications" and method == "POST":
            if not is_owner:
                return 403, {"error": "Faqat egasi (owner)"}
            app = next((a for a in apps if a["id"] == p[1]), None)
            if not app:
                return 404, {"error": "Ariza topilmadi"}
            if p[2] == "hire":
                message = str(self.body().get("message", "")).strip()[:500] or hire_template(app["name"])
                app.update(status="hired", message=message, hiredAt=int(time.time()))
                make_worker(db, app["userId"])
                app["notify"] = {
                    "email": send_email(app["email"], "Uzum Market — ishga qabul qilindingiz",
                                        message + "\n\nHurmat bilan,\nUzum Market"),
                }
            elif p[2] == "reject":
                app["status"] = "rejected"
            else:
                return 404, {"error": "Noma'lum amal"}
            save_db(db)
            return 200, {"application": {**app, "avatar": next(
                (u.get("avatar", "") for u in db["users"] if u["id"] == app["userId"]), "")}}

        # ---- egasi / admin ----
        if p == ["users"] and method == "GET":
            if not is_admin:
                return 403, {"error": "Faqat admin yoki egasi"}
            out = []
            for u in db["users"]:
                pu = public_user(u)
                pu["orderCount"] = sum(1 for o in db["orders"] if o["userId"] == u["id"])
                out.append(pu)
            return 200, {"users": out}

        if len(p) == 2 and p[0] == "users" and method == "GET":
            if not is_admin:
                return 403, {"error": "Faqat admin yoki egasi"}
            u = next((x for x in db["users"] if x["id"] == p[1]), None)
            if not u:
                return 404, {"error": "Topilmadi"}
            pu = public_user(u)
            pu["hasPassword"] = bool(u["password"])
            pu["orders"] = [o for o in db["orders"] if o["userId"] == u["id"]]
            return 200, {"user": pu}

        if len(p) == 3 and p[0] == "users" and method == "POST":
            if not is_owner:
                return 403, {"error": "Faqat egasi (owner)"}
            u = next((x for x in db["users"] if x["id"] == p[1]), None)
            if not u:
                return 404, {"error": "Topilmadi"}
            if u["role"] == "owner":
                return 400, {"error": "Egasining huquqini o'zgartirib bo'lmaydi"}
            b = self.body()
            if p[2] == "role":
                if b.get("role") not in ("admin", "user"):
                    return 400, {"error": "Noto'g'ri rol"}
                u["role"] = b["role"]
                if b["role"] == "user":  # adminlik olinsa, ishga olingan bo'lsa yana ishchi bo'ladi
                    if any(a["userId"] == u["id"] and a["status"] == "hired" for a in db.get("applications", [])):
                        make_worker(db, u["id"])
            elif p[2] == "password":
                pw = b.get("password", "")
                if len(pw) < 6:
                    return 400, {"error": "Parol kamida 6 belgi"}
                u["password"] = hash_password(pw)
                for t, uid in list(db["sessions"].items()):
                    if uid == u["id"]:
                        del db["sessions"][t]
            else:
                return 404, {"error": "Noma'lum amal"}
            save_db(db)
            return 200, {"user": public_user(u)}

        return 404, {"error": "Topilmadi"}


if __name__ == "__main__":
    bootstrap()
    print(f"Uzum Market ishga tushdi: {BASE_URL}")
    print(f"Egasi: {OWNER_EMAIL}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
