// Uzum Market — Netlify Function (TypeScript).
// server.py dagi API ning aynan o'zi, lekin Netlify'da tashqi serversiz ishlaydi.
// Ma'lumotlar Netlify Blobs omborida ("uzum" -> "db") saqlanadi.
//
// Netlify -> Site configuration -> Environment variables:
//   OWNER_EMAIL, OWNER_PASSWORD (shart)
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (ixtiyoriy)
//   SMTP_USER, SMTP_PASSWORD (ixtiyoriy — email yuborish)

import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

// ---------- turlar ----------
type Role = "owner" | "admin" | "worker" | "user";
interface User {
  id: string; name: string; email: string; password: string; role: Role;
  provider: string; avatar: string; avatarCustom?: boolean; created: number;
}
interface Product {
  id: string; name: string; price: number; category: string; image: string;
  seller: string; sellerId: string | null; created: number;
}
interface Order { id: string; userId: string; productId: string; name: string; image: string; price: number; qty: number; time: number; }
interface Application {
  id: string; userId: string; name: string; phone: string; email: string; comment: string;
  status: "new" | "hired" | "rejected"; created: number; message?: string; hiredAt?: number;
  notify?: { email: string };
}
interface DB {
  users: User[]; products: Product[]; orders: Order[]; applications: Application[];
  sessions: Record<string, string>; oauthStates: Record<string, number>; seedVersion: number;
}

const env = (k: string) => (process.env[k] || "").trim();
const now = () => Math.floor(Date.now() / 1000);
const newId = () => randomBytes(6).toString("hex");

// ---------- parol (server.py bilan bir xil format: "salt$hex") ----------
function hashPassword(pw: string, salt = randomBytes(16).toString("hex")): string {
  return `${salt}$${pbkdf2Sync(pw, salt, 200_000, 32, "sha256").toString("hex")}`;
}
function checkPassword(pw: string, stored: string): boolean {
  if (!stored || !stored.includes("$")) return false;
  const a = Buffer.from(hashPassword(pw, stored.split("$", 1)[0]));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- boshlang'ich mahsulotlar ----------
const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&h=600&fit=crop&q=75`;
const SEED: [string, number, string, string][] = [
  ["Yumshoq divan «Oslo»", 4_890_000, "mebel", img("1555041469-a586c61ea9bc")],
  ["Ofis kreslosi ergonomik", 1_250_000, "mebel", img("1580480055273-228ff5388ef8")],
  ["Yog'och ovqat stoli", 2_300_000, "mebel", img("1617806118233-18e1de247200")],
  ["Kitob javoni 5 qavatli", 870_000, "mebel", img("1594620302200-9a762244a156")],
  ["Ikki kishilik karavot", 3_600_000, "mebel", img("1505693416388-ac5ce068fe85")],
  ["Kreslo «Skandi» oq", 1_690_000, "mebel", img("1567538096630-e0c55bd6374c")],
  ["Burchak divani kulrang", 6_200_000, "mebel", img("1493663284031-b7e3aefcae8e")],
  ["Stul «Loft» qora, 2 dona", 740_000, "mebel", img("1592078615290-033ee584e267")],
  ["Gaming PC Ryzen 7 / RTX 4070", 18_900_000, "pc", img("1587202372775-e229f172b9d7")],
  ["Ofis PC Intel i5 / 16GB", 6_400_000, "pc", img("1593640408182-31c70c8268f5")],
  ['Monoblok 24" all-in-one', 8_750_000, "pc", img("1527443224154-c4a3942d3acf")],
  ["Mini PC 8GB / 256GB SSD", 3_200_000, "pc", img("1547082299-de196ea013d6")],
  ["Videokarta RTX 4070 12GB", 7_900_000, "pc", img("1591405351990-4726e331f141")],
  ['Noutbuk 15.6" Core i7', 11_500_000, "notebook", img("1496181133206-80ce9b88a853")],
  ['Ultrabook 13" 1.1 kg', 13_900_000, "notebook", img("1517336714731-489689fd1ca8")],
  ["Gaming noutbuk RTX 4060", 16_200_000, "notebook", img("1603302576837-37561b2e2302")],
  ['Talaba noutbuki 14"', 5_300_000, "notebook", img("1588872657578-7efd1f1555ed")],
  ['Noutbuk 14" OLED 16GB', 12_400_000, "notebook", img("1593642702821-c8da6771f0c6")],
];

// ---------- baza (Netlify Blobs) ----------
const store = () => getStore({ name: "uzum", consistency: "strong" });

async function loadDb(): Promise<DB> {
  const db = ((await store().get("db", { type: "json" })) as DB | null) ?? ({} as DB);
  db.users ??= []; db.products ??= []; db.orders ??= []; db.applications ??= [];
  db.sessions ??= {}; db.oauthStates ??= {}; db.seedVersion ??= 0;
  // egasi (owner) akkaunti
  const ownerEmail = (env("OWNER_EMAIL") || "gamingapg353@gmail.com").toLowerCase();
  let changed = false;
  const owner = db.users.find((u) => u.email === ownerEmail);
  if (!owner) {
    if (!env("OWNER_PASSWORD")) throw new Error("Netlify'da OWNER_PASSWORD sozlanmagan");
    db.users.push({ id: newId(), name: "Samandar", email: ownerEmail, password: hashPassword(env("OWNER_PASSWORD")),
      role: "owner", provider: "parol", avatar: "", created: now() });
    changed = true;
  } else if (owner.role !== "owner") {
    owner.role = "owner";
    changed = true;
  }
  // mahsulotlar (birinchi ishga tushishda)
  if (db.seedVersion < 2) {
    for (const [name, price, category, image] of SEED) {
      if (!db.products.some((p) => p.name === name && p.sellerId === null))
        db.products.push({ id: newId(), name, price, category, image, seller: "Uzum Market", sellerId: null, created: now() });
    }
    db.seedVersion = 2;
    changed = true;
  }
  if (changed) await saveDb(db);
  return db;
}
const saveDb = (db: DB) => store().setJSON("db", db);

const publicUser = (u: User) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, provider: u.provider,
  avatar: u.avatar, avatarCustom: !!u.avatarCustom, created: u.created,
});
function makeSession(db: DB, u: User): string {
  const t = randomBytes(32).toString("base64url");
  db.sessions[t] = u.id;
  return t;
}
function makeWorker(db: DB, userId: string) {
  for (const u of db.users) if (u.id === userId && u.role === "user") u.role = "worker";
}
function normalizePhone(raw: string): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (d.length === 9) d = "998" + d;
  return /^998\d{9}$/.test(d) ? d : null;
}
const hireTemplate = (name: string) =>
  `Hurmatli ${name}! Siz Uzum Market'ga ishga qabul qilindingiz. Iltimos, bazaga kelib, narsalarni olib boring.`;

// ---------- email ----------
async function sendEmail(to: string, subject: string, text: string): Promise<string> {
  const user = env("SMTP_USER"), pass = env("SMTP_PASSWORD").replace(/\s/g, "");
  if (!user || !pass) return "sozlanmagan";
  try {
    const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
    await t.sendMail({ from: `Uzum Market <${user}>`, to, subject, text });
    return "yuborildi";
  } catch (e) {
    console.error("[EMAIL XATO]", e);
    return "xato";
  }
}

// ---------- javob yordamchilari ----------
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const err = (msg: string, status = 400) => json({ error: msg }, status);
const redirect = (url: string) => new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });

// ---------- OAuth (Google / GitHub) ----------
const OAUTH: Record<string, { auth: string; scope: string; id: string; secret: string }> = {
  google: { auth: "https://accounts.google.com/o/oauth2/v2/auth", scope: "openid email profile",
    id: env("GOOGLE_CLIENT_ID"), secret: env("GOOGLE_CLIENT_SECRET") },
  github: { auth: "https://github.com/login/oauth/authorize", scope: "read:user user:email",
    id: env("GITHUB_CLIENT_ID"), secret: env("GITHUB_CLIENT_SECRET") },
};

async function postForm(url: string, data: Record<string, string>) {
  const r = await fetch(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data) });
  if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<any>;
}
async function getJson(url: string, token: string) {
  const r = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "User-Agent": "uzum-oquv-loyiha" } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<any>;
}

async function oauth(req: Request, url: URL, baseUrl: string): Promise<Response> {
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/"); // auth/<provider>[/callback]
  const provider = parts[1] || "";
  const cfg = OAUTH[provider];
  if (!cfg) return err("Noma'lum provayder", 404);
  if (!cfg.id || !cfg.secret) return redirect(`/#oauth-error=${provider}-sozlanmagan`);
  const redirectUri = `${baseUrl}/auth/${provider}/callback`;
  const db = await loadDb();
  for (const [s, t] of Object.entries(db.oauthStates)) if (t < now() - 600) delete db.oauthStates[s];

  if (parts.length === 2) {
    const state = randomBytes(16).toString("base64url");
    db.oauthStates[state] = now();
    await saveDb(db);
    const q = new URLSearchParams({ client_id: cfg.id, redirect_uri: redirectUri, response_type: "code", scope: cfg.scope, state });
    return redirect(`${cfg.auth}?${q}`);
  }

  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code");
  if (!db.oauthStates[state] || !code) return redirect("/#oauth-error=bekor-qilindi");
  delete db.oauthStates[state];
  try {
    let email: string, name: string, avatar: string;
    if (provider === "google") {
      const tok = await postForm("https://oauth2.googleapis.com/token", {
        code, client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirectUri, grant_type: "authorization_code" });
      const info = await getJson("https://www.googleapis.com/oauth2/v3/userinfo", tok.access_token);
      email = info.email; name = info.name || ""; avatar = info.picture || "";
    } else {
      const tok = await postForm("https://github.com/login/oauth/access_token", {
        code, client_id: cfg.id, client_secret: cfg.secret, redirect_uri: redirectUri });
      const info = await getJson("https://api.github.com/user", tok.access_token);
      email = info.email;
      if (!email) {
        const emails = await getJson("https://api.github.com/user/emails", tok.access_token);
        email = (emails.find((e: any) => e.primary) || {}).email || `${info.login}@users.noreply.github.com`;
      }
      name = info.name || info.login; avatar = info.avatar_url || "";
    }
    let user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      user = { id: newId(), name: name || email.split("@")[0], email, password: "", role: "user",
        provider, avatar, created: now() };
      db.users.push(user);
    } else if (avatar && !user.avatarCustom) user.avatar = avatar;
    const token = makeSession(db, user);
    await saveDb(db);
    return redirect(`/#token=${token}`);
  } catch (e) {
    console.error(`[OAUTH XATO] ${provider}`, e);
    await saveDb(db);
    return redirect("/#oauth-error=xatolik");
  }
}

// ---------- API ----------
async function api(req: Request, url: URL): Promise<Response> {
  const method = req.method;
  const p = url.pathname.replace(/\/+$/, "").split("/").slice(2); // /api/a/b -> [a, b]
  const is = (...seg: string[]) => p.length === seg.length && seg.every((s, i) => s === "*" || s === p[i]);
  if (Number(req.headers.get("content-length") || 0) > 6_000_000) return err("So'rov juda katta");
  let bodyCache: any;
  const body = async () => (bodyCache ??= await req.json().catch(() => ({})));

  const db = await loadDb();
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "").trim();
  const me = db.users.find((u) => u.id === db.sessions[token]);

  if (is("register") && method === "POST") {
    const b = await body();
    const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase(), pw = String(b.password || "");
    if (!name || !email.includes("@") || pw.length < 6) return err("Ism, to'g'ri email va kamida 6 belgili parol kiriting");
    if (db.users.some((u) => u.email === email)) return err("Bu email allaqachon ro'yxatdan o'tgan");
    const user: User = { id: newId(), name, email, password: hashPassword(pw), role: "user", provider: "parol", avatar: "", created: now() };
    db.users.push(user);
    const t = makeSession(db, user);
    await saveDb(db);
    return json({ token: t, user: publicUser(user) });
  }

  if (is("login") && method === "POST") {
    const b = await body();
    const email = String(b.email || "").trim().toLowerCase();
    const user = db.users.find((u) => u.email === email);
    if (!user || !checkPassword(String(b.password || ""), user.password)) return err("Email yoki parol noto'g'ri", 401);
    const t = makeSession(db, user);
    await saveDb(db);
    return json({ token: t, user: publicUser(user) });
  }

  if (is("products") && method === "GET") return json({ products: db.products, server: "Netlify Functions" });

  // quyidagilar uchun kirish shart
  if (!me) return err("Avval tizimga kiring", 401);
  const isOwner = me.role === "owner";
  const isAdmin = me.role === "owner" || me.role === "admin";

  if (is("me") && method === "GET") return json({ user: publicUser(me) });

  if (is("me", "avatar") && method === "POST") {
    const image = String((await body()).image || "");
    if (image && !image.startsWith("data:image/")) return err("Rasm tanlang");
    if (image.length > 400_000) return err("Rasm juda katta");
    me.avatar = image;
    me.avatarCustom = !!image;
    await saveDb(db);
    return json({ user: publicUser(me) });
  }

  if (is("logout") && method === "POST") {
    delete db.sessions[token];
    await saveDb(db);
    return json({ ok: true });
  }

  if (is("products") && method === "POST") {
    const b = await body();
    const name = String(b.name || "").trim(), category = b.category, image = String(b.image || "");
    const price = Math.trunc(Number(b.price)) || 0;
    if (!name || price <= 0 || !["mebel", "pc", "notebook"].includes(category)) return err("Nomi, narxi va bo'limni to'ldiring");
    if (!(image.startsWith("data:image/") || image.startsWith("https://"))) return err("Rasm tanlang");
    const prod: Product = { id: newId(), name: name.slice(0, 120), price, category, image, seller: me.name, sellerId: me.id, created: now() };
    db.products.unshift(prod);
    await saveDb(db);
    return json({ product: prod });
  }

  if (is("products", "*") && method === "DELETE") {
    const prod = db.products.find((x) => x.id === p[1]);
    if (!prod) return err("Topilmadi", 404);
    if (!isAdmin && prod.sellerId !== me.id) return err("Ruxsat yo'q", 403);
    db.products = db.products.filter((x) => x !== prod);
    await saveDb(db);
    return json({ ok: true });
  }

  if (is("orders") && method === "POST") {
    const items: any[] = (await body()).items || [];
    const created: Order[] = [];
    for (const it of items) {
      const prod = db.products.find((x) => x.id === it?.id);
      if (!prod) continue;
      const qty = Math.max(1, Math.min(99, Math.trunc(Number(it.qty)) || 1));
      const order: Order = { id: newId(), userId: me.id, productId: prod.id, name: prod.name,
        image: prod.image.startsWith("http") ? prod.image : "", price: prod.price, qty, time: now() };
      db.orders.push(order);
      created.push(order);
    }
    if (!created.length) return err("Savat bo'sh");
    await saveDb(db);
    return json({ orders: created });
  }

  if (is("orders") && method === "GET") return json({ orders: db.orders.filter((o) => o.userId === me.id) });

  // ---- ishga kirish arizalari ----
  const apps = db.applications;
  const avatarOf = (uid: string) => db.users.find((u) => u.id === uid)?.avatar || "";

  if (is("applications", "me") && method === "GET") {
    const mine = apps.filter((a) => a.userId === me.id);
    return json({ application: mine.length ? mine[mine.length - 1] : null });
  }

  if (is("applications") && method === "POST") {
    if (isOwner) return err("Egasi ariza topshirmaydi 🙂");
    if (apps.some((a) => a.userId === me.id && a.status === "new")) return err("Arizangiz allaqachon ko'rib chiqilmoqda");
    const b = await body();
    const phone = normalizePhone(String(b.phone || ""));
    const email = String(b.email || "").trim().toLowerCase();
    const comment = String(b.comment || "").trim();
    if (!phone) return err("Telefon raqamni to'g'ri kiriting: +998 90 123 45 67");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err("Email noto'g'ri");
    if (comment.length < 3) return err("Fikringizni yozing");
    const app: Application = { id: newId(), userId: me.id, name: me.name, phone, email,
      comment: comment.slice(0, 1000), status: "new", created: now() };
    apps.push(app);
    await saveDb(db);
    return json({ application: app });
  }

  if (is("applications") && method === "GET") {
    if (!isOwner) return err("Faqat egasi (owner)", 403);
    return json({ applications: [...apps].reverse().map((a) => ({ ...a, avatar: avatarOf(a.userId) })) });
  }

  if (is("applications", "*", "*") && method === "POST") {
    if (!isOwner) return err("Faqat egasi (owner)", 403);
    const app = apps.find((a) => a.id === p[1]);
    if (!app) return err("Ariza topilmadi", 404);
    if (p[2] === "hire") {
      const message = String((await body()).message || "").trim().slice(0, 500) || hireTemplate(app.name);
      Object.assign(app, { status: "hired", message, hiredAt: now() });
      makeWorker(db, app.userId);
      app.notify = { email: await sendEmail(app.email, "Uzum Market — ishga qabul qilindingiz", `${message}\n\nHurmat bilan,\nUzum Market`) };
    } else if (p[2] === "reject") {
      app.status = "rejected";
    } else return err("Noma'lum amal", 404);
    await saveDb(db);
    return json({ application: { ...app, avatar: avatarOf(app.userId) } });
  }

  // ---- egasi / admin ----
  if (is("users") && method === "GET") {
    if (!isAdmin) return err("Faqat admin yoki egasi", 403);
    return json({ users: db.users.map((u) => ({ ...publicUser(u), orderCount: db.orders.filter((o) => o.userId === u.id).length })) });
  }

  if (is("users", "*") && method === "GET") {
    if (!isAdmin) return err("Faqat admin yoki egasi", 403);
    const u = db.users.find((x) => x.id === p[1]);
    if (!u) return err("Topilmadi", 404);
    return json({ user: { ...publicUser(u), hasPassword: !!u.password, orders: db.orders.filter((o) => o.userId === u.id) } });
  }

  if (is("users", "*", "*") && method === "POST") {
    if (!isOwner) return err("Faqat egasi (owner)", 403);
    const u = db.users.find((x) => x.id === p[1]);
    if (!u) return err("Topilmadi", 404);
    if (u.role === "owner") return err("Egasining huquqini o'zgartirib bo'lmaydi");
    const b = await body();
    if (p[2] === "role") {
      if (!["admin", "user"].includes(b.role)) return err("Noto'g'ri rol");
      u.role = b.role;
      if (b.role === "user" && apps.some((a) => a.userId === u.id && a.status === "hired")) makeWorker(db, u.id);
    } else if (p[2] === "password") {
      const pw = String(b.password || "");
      if (pw.length < 6) return err("Parol kamida 6 belgi");
      u.password = hashPassword(pw);
      for (const [t, uid] of Object.entries(db.sessions)) if (uid === u.id) delete db.sessions[t];
    } else return err("Noma'lum amal", 404);
    await saveDb(db);
    return json({ user: publicUser(u) });
  }

  return err("Topilmadi", 404);
}

// ---------- kirish nuqtasi ----------
export default async (req: Request) => {
  const url = new URL(req.url);
  const baseUrl = (env("BASE_URL") || env("URL") || url.origin).replace(/\/+$/, "");
  try {
    if (url.pathname.startsWith("/auth/")) return await oauth(req, url, baseUrl);
    return await api(req, url);
  } catch (e: any) {
    console.error("[SERVER XATO]", e);
    return err(`Server xatosi: ${e?.message || e}`, 500);
  }
};

export const config = { path: ["/api/*", "/auth/*"] };
