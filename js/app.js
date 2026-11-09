// Uzum Market — asosiy mantiq (brauzer). Server: server.py
import {
  CATEGORIES, ROLE_NAMES, formatPrice, monthly, escapeHtml, avatarHtml, coverGradient,
  formatDate, readImage, rating, discount, FALLBACK_IMG,
} from "./utils.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const icon = (name, cls = "ico") => `<svg class="${cls}"><use href="#i-${name}"/></svg>`;
const imgTag = (src, cls = "", extra = "") =>
  `<img src="${escapeHtml(src || FALLBACK_IMG)}" class="${cls}" alt="" ${extra} onerror="this.onerror=null;this.src='${FALLBACK_IMG}'">`;
const readJSON = (key, def) => { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } };

const MAX_LOADER_MS = 10_000;

const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  products: [],
  category: "all",
  view: "shop",
  query: "",
  sort: "pop",
  cart: readJSON("cart", []), // [{id, qty}]
  favs: readJSON("favs", []), // [id]
  newImage: "",
};

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch("/api/" + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + state.token },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Xatolik yuz berdi"), { status: res.status });
  return data;
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2600);
}

// ---------- 1. Yuklash ekrani ----------
// Rasmlar yuklanguncha turadi; 10 soniyadan oshsa baribir ochiladi.
function preloadImages(urls) {
  return new Promise((resolve) => {
    let done = 0;
    const total = urls.length;
    const step = () => {
      done++;
      $("#loaderBar").style.width = Math.round((done / total) * 100) + "%";
      $("#loaderText").textContent = `Rasmlar yuklanmoqda: ${done}/${total}`;
      if (done >= total) resolve();
    };
    if (!total) return resolve();
    urls.forEach((u) => {
      const img = new Image();
      img.onload = img.onerror = step;
      img.src = u;
    });
  });
}

// Bepul hostingda server "uxlab" qoladi — uyg'onguncha (ko'pi bilan 90 s) qayta urinib turamiz.
async function waitForServer() {
  const start = Date.now();
  for (;;) {
    try {
      state.products = (await api("products")).products;
      return true;
    } catch {
      const s = Math.round((Date.now() - start) / 1000);
      if (s > 90) return false;
      $("#loaderText").textContent = `Server uyg'onmoqda, biroz kuting... ${s} s`;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

async function boot() {
  readHashToken();
  if (!(await waitForServer())) {
    $("#loaderText").textContent = "Server ishlamayapti — keyinroq urinib ko'ring (lokalda: python server.py)";
    return;
  }
  // Rasmlar yuklanguncha kutamiz, lekin 10 soniyadan ko'p emas
  const timeout = new Promise((r) => setTimeout(r, MAX_LOADER_MS));
  const work = (async () => {
    await preloadImages([...new Set(state.products.map((p) => p.image))]);
    if (state.token) {
      try { state.user = (await api("me")).user; } catch (err) { if (err.status === 401) setToken(""); }
    }
  })();
  await Promise.race([work, timeout]);
  $("#loader").classList.add("done");
  state.user ? showApp() : showAuth();
}

function readHashToken() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get("token")) setToken(h.get("token"));
  if (h.get("oauth-error")) {
    const e = h.get("oauth-error");
    setTimeout(() => {
      $("#authError").textContent = e.endsWith("sozlanmagan")
        ? `${e.split("-")[0]} orqali kirish hali sozlanmagan (server.py dagi izohni o'qing)`
        : "Tashqi kirish bekor qilindi yoki xato bo'ldi";
    });
  }
  if (location.hash) history.replaceState(null, "", location.pathname);
}

function setToken(t) {
  state.token = t;
  t ? localStorage.setItem("token", t) : localStorage.removeItem("token");
}

// ---------- 2. Kirish / ro'yxatdan o'tish ----------
let authMode = "login";

function showAuth() {
  $("#app").classList.add("hidden");
  $("#auth").classList.remove("hidden");
  const picks = ["mebel", "pc", "notebook"].map((c) => state.products.find((p) => p.category === c && !p.sellerId)).filter(Boolean);
  $("#authFloats").innerHTML = picks.map((p) => `
    <div class="auth__float">${imgTag(p.image)}<b>${formatPrice(p.price)}</b><span>${escapeHtml(p.name)}</span></div>`).join("");
}

$$(".auth__tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    authMode = b.dataset.tab;
    $$(".auth__tabs button").forEach((x) => x.classList.toggle("active", x === b));
    const reg = authMode === "register";
    $("#fName").classList.toggle("hidden", !reg);
    $("#fName").required = reg;
    $("#authSubmit").textContent = reg ? "Ro'yxatdan o'tish" : "Kirish";
    $("#authTitle").textContent = reg ? "Hisob yarating ✨" : "Xush kelibsiz 👋";
    $("#authSubtitle").textContent = reg ? "Bir daqiqada ro'yxatdan o'ting" : "Davom etish uchun hisobingizga kiring";
    $("#fPass").autocomplete = reg ? "new-password" : "current-password";
    $("#authError").textContent = "";
  })
);

$("#togglePass").addEventListener("click", () => {
  const p = $("#fPass");
  p.type = p.type === "password" ? "text" : "password";
});

$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#authSubmit");
  btn.disabled = true;
  $("#authError").textContent = "";
  try {
    const body = { email: $("#fEmail").value, password: $("#fPass").value };
    if (authMode === "register") body.name = $("#fName").value;
    const res = await api(authMode, { method: "POST", body });
    setToken(res.token);
    state.user = res.user;
    $("#authForm").reset();
    showApp();
    toast(`👋 Xush kelibsiz, ${res.user.name}!`);
  } catch (err) {
    $("#authError").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- 3. Asosiy sayt ----------
function renderProfileBtn() {
  const u = state.user;
  $("#profileBtn").outerHTML = avatarHtml(u).replace('class="avatar', 'id="profileBtn" class="avatar cursor-pointer');
  $("#profileBtn").addEventListener("click", (e) => { e.stopPropagation(); $("#profileMenu").classList.toggle("hidden"); });
  $("#pmAvatar").innerHTML = avatarHtml(u, "md");
  $("#avatarReset").classList.toggle("hidden", !u.avatarCustom);
}

function showApp() {
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  const u = state.user;
  renderProfileBtn();
  $("#pmName").textContent = u.name;
  $("#pmEmail").textContent = u.email;
  $("#pmRole").textContent = ROLE_NAMES[u.role];
  $("#pmRole").className = "role-tag mt-1 " + u.role;
  $("#ownerBtn").classList.toggle("hidden", !["owner", "admin"].includes(u.role));
  updateCounts();
  renderHero();
  setView("shop");
  setupJobMenu();
  checkServer();
}

// Footer'dagi belgi: HTML -> JS -> Python server ulanishini haqiqiy so'rov bilan tekshiradi
async function checkServer() {
  const el = $("#serverStatus");
  const t0 = performance.now();
  try {
    const { products } = await api("products");
    const ms = Math.round(performance.now() - t0);
    el.textContent = `🐍 Python server: ulangan ✅ (${products.length} mahsulot, ${ms} ms)`;
    el.className = "server-status ok";
  } catch {
    el.textContent = "🐍 Python server: ulanmagan ❌";
    el.className = "server-status err";
  }
}

// Profil menyusi va rasmini o'zgartirish
$("#profileMenu").addEventListener("click", (e) => {
  if (!e.target.closest("[data-view]")) e.stopPropagation();
});
async function saveAvatar(image) {
  try {
    state.user = (await api("me/avatar", { method: "POST", body: { image } })).user;
    renderProfileBtn();
    $("#profileMenu").classList.add("hidden");
    toast(image ? "📷 Rasm yangilandi" : "Rasm o'chirildi — keyingi Google/GitHub kirishda o'sha rasm qo'yiladi");
  } catch (err) { toast(err.message); }
}
$("#avatarInput").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try { saveAvatar(await readImage(f, 256)); } catch (err) { toast(err.message); }
});
$("#avatarReset").addEventListener("click", () => saveAvatar(""));

$("#logoutBtn").addEventListener("click", async () => {
  try { await api("logout", { method: "POST" }); } catch {}
  setToken("");
  state.user = null;
  $("#profileMenu").classList.add("hidden");
  showAuth();
});

function setView(view) {
  state.view = view;
  ["shop", "create", "owner", "orders", "hire"].forEach((v) => $("#view-" + v).classList.toggle("hidden", v !== view));
  $$(".nav__item").forEach((b) =>
    b.classList.toggle("active", view === "shop" ? b.dataset.cat === state.category : b.dataset.view === view)
  );
  $("#ownerBtn").classList.toggle("active", view === "owner");
  $("#ordersBtn").classList.toggle("active", view === "orders");
  $("#favBtn").classList.toggle("active", view === "shop" && state.category === "fav");
  if (view === "shop") renderShop();
  if (view === "create") renderCreate();
  if (view === "owner") renderOwner();
  if (view === "orders") renderOrders();
  if (view === "hire") renderHire();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Umumiy bosishlar: bo'lim / sahifa / yopish (dinamik elementlar uchun ham ishlaydi)
document.addEventListener("click", (e) => {
  $("#profileMenu").classList.add("hidden");
  const cat = e.target.closest("[data-cat]");
  const view = e.target.closest("[data-view]");
  const close = e.target.closest("[data-close]");
  if (close) { $("#cartDrawer").classList.add("hidden"); $("#userModal").classList.add("hidden"); }
  if (cat && state.user) {
    e.preventDefault();
    state.category = cat.dataset.cat;
    state.query = "";
    $("#search").value = "";
    setView("shop");
  } else if (view && state.user) {
    setView(view.dataset.view);
  }
});
$("#ownerBtn").addEventListener("click", () => setView("owner"));
$("#ordersBtn").addEventListener("click", () => setView("orders"));
$("#favBtn").addEventListener("click", () => { state.category = "fav"; setView("shop"); });
$("#searchForm").addEventListener("submit", (e) => e.preventDefault());
$("#search").addEventListener("input", (e) => {
  state.query = e.target.value.trim().toLowerCase();
  if (state.view !== "shop") setView("shop");
  else renderShop();
});
$("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderShop(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { $("#cartDrawer").classList.add("hidden"); $("#userModal").classList.add("hidden"); }
});

// ---------- Banner (karusel) ----------
const SLIDES = [
  { cat: "mebel", tag: "Mebel haftaligi", title: "Uyingizga qulaylik — 30% gacha chegirma", text: "Divan, stol, kreslo va karavotlar eng yaxshi narxlarda", bg: "linear-gradient(120deg,#6a00f4,#ff2e7e)" },
  { cat: "pc", tag: "Gaming", title: "O'yin uchun kuchli kompyuterlar", text: "RTX videokartali PC lar — muddatli to'lov bilan", bg: "linear-gradient(120deg,#170b45,#7000ff)" },
  { cat: "notebook", tag: "0% muddatli to'lov", title: "Noutbuklar — o'qish va ish uchun", text: "12 oyga bo'lib to'lang, hech qanday ustamasiz", bg: "linear-gradient(120deg,#ff6a00,#ff2e7e)" },
];
let heroIdx = 0;
let heroTimer;

const catImage = (cat, n = 0) => {
  const list = state.products.filter((p) => p.category === cat);
  const seeded = list.filter((p) => !p.sellerId);
  return (seeded[n] || seeded[0] || list[0] || {}).image;
};

function renderHero() {
  heroIdx = 0;
  $("#hero").innerHTML = SLIDES.map((s, i) => `
    <div class="hero__slide ${i === 0 ? "active" : ""}" style="background:${s.bg}">
      <div class="hero__text">
        <span class="hero__tag">${s.tag}</span>
        <h2 class="hero__title">${s.title}</h2>
        <p class="hero__sub">${s.text}</p>
        <button class="btn btn--white hero__cta" data-cat="${s.cat}">Xarid qilish →</button>
      </div>
      ${imgTag(catImage(s.cat), "hero__img")}
    </div>`).join("") + `
    <button class="hero__arrow hero__arrow--prev" data-hero="-1" aria-label="Oldingi">${icon("chevL")}</button>
    <button class="hero__arrow hero__arrow--next" data-hero="1" aria-label="Keyingi">${icon("chevR")}</button>
    <div class="hero__dots">${SLIDES.map((_, i) => `<button data-dot="${i}" class="${i === 0 ? "active" : ""}" aria-label="${i + 1}-banner"></button>`).join("")}</div>`;
  startHero();
}
function goHero(i) {
  heroIdx = (i + SLIDES.length) % SLIDES.length;
  $$(".hero__slide").forEach((s, k) => s.classList.toggle("active", k === heroIdx));
  $$(".hero__dots button").forEach((d, k) => d.classList.toggle("active", k === heroIdx));
  startHero();
}
function startHero() {
  clearInterval(heroTimer);
  heroTimer = setInterval(() => goHero(heroIdx + 1), 5000);
}
$("#hero").addEventListener("click", (e) => {
  const arrow = e.target.closest("[data-hero]");
  const dot = e.target.closest("[data-dot]");
  if (arrow) goHero(heroIdx + Number(arrow.dataset.hero));
  if (dot) goHero(Number(dot.dataset.dot));
});

function renderTiles() {
  const cats = [["mebel", "Mebel"], ["pc", "Kompyuterlar"], ["notebook", "Noutbuklar"]];
  $("#catTiles").innerHTML = cats.map(([c, name]) => {
    const n = state.products.filter((p) => p.category === c).length;
    return `<button class="cat-tile" data-cat="${c}">${imgTag(catImage(c, 1))}
      <div class="cat-tile__txt"><b>${name}</b><span>${n} ta mahsulot</span></div></button>`;
  }).join("");
}

// ---------- Mahsulot kartochkasi ----------
function cardHtml(p, { actions = true, mine = false, delay = 0 } = {}) {
  const d = discount(p.id);
  const r = rating(p.id);
  const old = Math.round(p.price / (1 - d / 100) / 1000) * 1000;
  const fav = state.favs.includes(p.id);
  const isNew = p.sellerId && Date.now() / 1000 - (p.created || 0) < 7 * 86400;
  return `
  <div class="card" style="animation-delay:${Math.min(delay, 14) * 40}ms">
    <div class="card__media">
      ${imgTag(p.image, "", 'loading="lazy"')}
      <span class="card__badge">-${d}%</span>
      ${isNew ? `<span class="card__badge card__badge--new">Yangi</span>` : ""}
      ${actions ? `<button class="card__fav ${fav ? "active" : ""}" data-fav="${p.id}" aria-label="Saralanganlarga">${icon("heart")}</button>` : ""}
    </div>
    <div class="card__body">
      <div class="card__price">${formatPrice(p.price)}</div>
      <div class="card__old">${formatPrice(old)}</div>
      <span class="card__installment">${monthly(p.price)}</span>
      <div class="card__name">${escapeHtml(p.name)}</div>
      <div class="card__rating">${icon("star")}<b>${r.score}</b>(${r.reviews} sharh)</div>
      <div class="card__seller">Sotuvchi: ${escapeHtml(p.seller)}</div>
      ${actions ? `<div class="card__actions">
        <button class="btn btn--primary btn--sm" data-buy="${p.id}">Sotib olish</button>
        <button class="icon-btn" data-add="${p.id}" aria-label="Savatga">${icon("bag", "ico ico--sm")}</button>
      </div>` : ""}
      ${mine ? `<div class="card__actions"><button class="btn btn--danger btn--sm" data-del="${p.id}">O'chirish</button></div>` : ""}
    </div>
  </div>`;
}

const SORTS = {
  pop: (a, b) => rating(b.id).reviews - rating(a.id).reviews,
  cheap: (a, b) => a.price - b.price,
  exp: (a, b) => b.price - a.price,
  new: (a, b) => (b.created || 0) - (a.created || 0),
};

function renderShop() {
  const home = state.category === "all" && !state.query;
  $("#homeExtras").classList.toggle("hidden", !home);
  if (home) renderTiles();
  const list = state.products
    .filter((p) =>
      (state.category === "all" || (state.category === "fav" ? state.favs.includes(p.id) : p.category === state.category)) &&
      (!state.query || p.name.toLowerCase().includes(state.query)))
    .sort(SORTS[state.sort]);
  $("#shopTitle").textContent = state.query
    ? `«${state.query}» bo'yicha`
    : state.category === "fav" ? "Saralangan mahsulotlar" : CATEGORIES[state.category];
  $("#shopCount").textContent = `${list.length} ta`;
  $("#grid").innerHTML = list.map((p, i) => cardHtml(p, { delay: i })).join("");
  $("#empty").classList.toggle("hidden", list.length > 0);
  $("#empty").innerHTML = state.category === "fav"
    ? `<div class="empty__big">💜</div><b>Saralanganlar bo'sh</b>Mahsulotdagi ♡ belgisini bosing — shu yerda saqlanadi`
    : `<div class="empty__big">🔍</div><b>Hech narsa topilmadi</b>Boshqa so'z bilan qidirib ko'ring`;
}

document.addEventListener("click", async (e) => {
  const add = e.target.closest("[data-add]");
  const buy = e.target.closest("[data-buy]");
  const del = e.target.closest("[data-del]");
  const fav = e.target.closest("[data-fav]");
  if (fav) {
    const id = fav.dataset.fav;
    const on = !state.favs.includes(id);
    state.favs = on ? [...state.favs, id] : state.favs.filter((x) => x !== id);
    localStorage.setItem("favs", JSON.stringify(state.favs));
    fav.classList.toggle("active", on);
    updateCounts();
    toast(on ? "💜 Saralanganlarga qo'shildi" : "Saralanganlardan olindi");
    if (state.category === "fav" && !on) renderShop();
  }
  if (add) { addToCart(add.dataset.add); toast("🛒 Savatga qo'shildi"); }
  if (buy) {
    if (!confirm("Ushbu mahsulotni sotib olasizmi?")) return;
    try {
      await api("orders", { method: "POST", body: { items: [{ id: buy.dataset.buy, qty: 1 }] } });
      toast("✅ Buyurtma qabul qilindi!");
    } catch (err) { toast(err.message); }
  }
  if (del) {
    if (!confirm("Mahsulotni o'chirasizmi?")) return;
    try {
      await api("products/" + del.dataset.del, { method: "DELETE" });
      state.products = state.products.filter((p) => p.id !== del.dataset.del);
      renderCreate();
      toast("🗑 O'chirildi");
    } catch (err) { toast(err.message); }
  }
});

// ---------- Savat ----------
function updateCounts() {
  const n = state.cart.reduce((s, x) => s + x.qty, 0);
  $("#cartCount").textContent = n;
  $("#cartCount").classList.toggle("hidden", !n);
  $("#favCount").textContent = state.favs.length;
  $("#favCount").classList.toggle("hidden", !state.favs.length);
}
function saveCart() {
  localStorage.setItem("cart", JSON.stringify(state.cart));
  updateCounts();
}
function addToCart(id) {
  const it = state.cart.find((x) => x.id === id);
  it ? it.qty++ : state.cart.push({ id, qty: 1 });
  saveCart();
}
function renderCart() {
  const items = state.cart.map((c) => ({ ...c, p: state.products.find((p) => p.id === c.id) })).filter((x) => x.p);
  const count = items.reduce((s, x) => s + x.qty, 0);
  $("#cartHeadCount").textContent = count ? `· ${count} ta` : "";
  $("#cartItems").innerHTML = items.length
    ? items.map(({ p, qty }, i) => `
      <div class="cart-item" style="animation-delay:${i * 40}ms">
        ${imgTag(p.image)}
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">${escapeHtml(p.name)}</div>
          <div class="text-xs text-gray-500 mb-1">${formatPrice(p.price)} × ${qty}</div>
          <b>${formatPrice(p.price * qty)}</b>
        </div>
        <div class="qty">
          <button data-qty="${p.id}" data-d="-1" aria-label="Kamaytirish">−</button>
          <span>${qty}</span>
          <button data-qty="${p.id}" data-d="1" aria-label="Ko'paytirish">+</button>
        </div>
      </div>`).join("")
    : `<div class="empty"><div class="empty__big">🛍</div><b>Savatingiz bo'sh</b>Mahsulotlarni tanlab, savatga qo'shing
        <button class="btn btn--primary mx-auto mt-5" data-close data-cat="all">Xaridni boshlash</button></div>`;
  $("#cartTotal").textContent = formatPrice(items.reduce((s, x) => s + x.p.price * x.qty, 0));
  $("#checkoutBtn").disabled = !items.length;
}
$("#cartBtn").addEventListener("click", () => { renderCart(); $("#cartDrawer").classList.remove("hidden"); });
$("#cartItems").addEventListener("click", (e) => {
  const b = e.target.closest("[data-qty]");
  if (!b) return;
  const it = state.cart.find((x) => x.id === b.dataset.qty);
  it.qty += Number(b.dataset.d);
  if (it.qty <= 0) state.cart = state.cart.filter((x) => x !== it);
  saveCart();
  renderCart();
});
$("#checkoutBtn").addEventListener("click", async () => {
  if (!state.cart.length) return toast("Savat bo'sh");
  try {
    await api("orders", { method: "POST", body: { items: state.cart } });
    state.cart = [];
    saveCart();
    renderCart();
    $("#cartDrawer").classList.add("hidden");
    toast("✅ Buyurtma rasmiylashtirildi!");
  } catch (err) { toast(err.message); }
});

// ---------- Yaratish (sotuvchi shabloni) ----------
const TEMPLATE_IMG = "https://images.unsplash.com/photo-1530018607912-eff2daa1bac4?w=600&h=600&fit=crop&q=75";

function renderPreview() {
  const p = {
    id: "preview",
    name: $("#cName").value || "Mahsulot nomi",
    price: Number($("#cPrice").value) || 1_000_000,
    image: state.newImage || TEMPLATE_IMG,
    seller: state.user.name,
  };
  $("#preview").innerHTML = cardHtml(p, { actions: false });
  $("#dzImg").classList.toggle("hidden", !state.newImage);
  $("#dzChange").classList.toggle("hidden", !state.newImage);
  if (state.newImage) $("#dzImg").src = state.newImage;
}

function renderCreate() {
  renderPreview();
  const mine = state.products.filter((p) => p.sellerId === state.user.id);
  $("#myGrid").innerHTML = mine.length
    ? mine.map((p, i) => cardHtml(p, { actions: false, mine: true, delay: i })).join("")
    : `<div class="empty col-span-full"><div class="empty__big">📦</div><b>Hali mahsulot qo'shmagansiz</b>Yuqoridagi shablonni to'ldiring</div>`;
}

async function pickImage(file) {
  try {
    state.newImage = await readImage(file);
    $("#createError").textContent = "";
    renderPreview();
  } catch (err) { $("#createError").textContent = err.message; }
}
$("#cImage").addEventListener("change", (e) => e.target.files[0] && pickImage(e.target.files[0]));
const dz = $("#dropzone");
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
dz.addEventListener("dragleave", () => dz.classList.remove("over"));
dz.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.classList.remove("over");
  e.dataTransfer.files[0] && pickImage(e.dataTransfer.files[0]);
});
["#cName", "#cPrice"].forEach((s) => $(s).addEventListener("input", renderPreview));

$("#createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#createError").textContent = "";
  try {
    const { product } = await api("products", {
      method: "POST",
      body: { name: $("#cName").value, price: Number($("#cPrice").value), category: $("#cCat").value, image: state.newImage || TEMPLATE_IMG },
    });
    state.products.unshift(product);
    state.newImage = "";
    e.target.reset();
    renderCreate();
    toast("✅ Mahsulot sotuvga chiqdi!");
  } catch (err) { $("#createError").textContent = err.message; }
});

// ---------- Egasi (owner) paneli ----------
async function renderOwner() {
  $("#ownerHello").textContent = `Salom, ${state.user.name}! 👑`;
  $("#usersGrid").innerHTML = `<p class="text-gray-500">Yuklanmoqda...</p>`;
  try {
    const { users } = await api("users");
    const orders = users.reduce((s, u) => s + u.orderCount, 0);
    $("#stats").innerHTML = [
      ["👥", users.length, "Foydalanuvchi", "#f3ebff"],
      ["🛡", users.filter((u) => u.role === "admin").length, "Admin", "#e6efff"],
      ["📦", orders, "Buyurtma", "#fff4d6"],
      ["🛍", state.products.length, "Mahsulot", "#e2f8e8"],
    ].map(([ic, n, label, bg], k) => `
      <div class="stat" style="animation-delay:${k * 60}ms">
        <div class="stat__ico" style="background:${bg}">${ic}</div>
        <div><b>${n}</b><span>${label}</span></div>
      </div>`).join("");
    $("#usersGrid").innerHTML = users.map((u, i) => `
      <div class="ucard" data-user="${u.id}" style="animation-delay:${Math.min(i, 14) * 40}ms">
        <div class="ucard__cover" style="background:${coverGradient(u.email)}"></div>
        ${avatarHtml(u, "lg")}
        <div class="ucard__body">
          <div class="ucard__name">${escapeHtml(u.name)}</div>
          <div class="ucard__email">${escapeHtml(u.email)}</div>
          <span class="role-tag ${u.role}">${ROLE_NAMES[u.role]}</span>
          <span class="ucard__meta">📦 ${u.orderCount} ta buyurtma · ${escapeHtml(u.provider)}</span>
        </div>
      </div>`).join("");
  } catch (err) {
    $("#usersGrid").innerHTML = `<p class="text-rose-600">${escapeHtml(err.message)}</p>`;
  }
}

$("#usersGrid").addEventListener("click", (e) => {
  const c = e.target.closest("[data-user]");
  if (c) openUser(c.dataset.user);
});

async function openUser(id) {
  const box = $("#userModalBody");
  box.innerHTML = `<p class="p-8 text-center text-gray-500">Yuklanmoqda...</p>`;
  $("#userModal").classList.remove("hidden");
  const { user: u } = await api("users/" + id);
  const isOwner = state.user.role === "owner";
  const total = u.orders.reduce((s, o) => s + o.price * o.qty, 0);
  box.innerHTML = `
    <div class="modal__cover" style="background:${coverGradient(u.email)}"></div>
    <button data-close class="modal__close" aria-label="Yopish">×</button>
    <div class="modal__content">
      <div class="flex flex-col items-center text-center gap-2">
        ${avatarHtml(u, "lg")}
        <div class="text-xl font-extrabold">${escapeHtml(u.name)}</div>
        <span class="role-tag ${u.role}">${ROLE_NAMES[u.role]}</span>
      </div>
      <div class="info-grid">
        <div class="info"><span>Email</span><b>${escapeHtml(u.email)}</b></div>
        <div class="info"><span>Parol</span><b>${u.hasPassword ? "🔒 shifrlangan" : "— (" + escapeHtml(u.provider) + ")"}</b></div>
        <div class="info"><span>Kirish usuli</span><b>${escapeHtml(u.provider)}</b></div>
        <div class="info"><span>Ro'yxatdan o'tgan</span><b>${formatDate(u.created)}</b></div>
      </div>
      <div class="flex items-center justify-between mb-2">
        <h4 class="font-bold">Olgan narsalari (${u.orders.length})</h4>
        <b class="text-brand">${formatPrice(total)}</b>
      </div>
      <div class="space-y-2 mb-5 max-h-60 overflow-auto">
        ${u.orders.length ? u.orders.slice().reverse().map((o) => `
          <div class="cart-item">
            ${imgTag(o.image, "!w-12 !h-12")}
            <div class="flex-1 min-w-0"><div class="text-sm truncate">${escapeHtml(o.name)}</div>
            <div class="text-xs text-gray-500">${formatDate(o.time)} · ${o.qty} dona</div></div>
            <b class="text-sm whitespace-nowrap">${formatPrice(o.price * o.qty)}</b>
          </div>`).join("") : `<p class="text-gray-500 text-sm text-center py-4">Hali hech narsa olmagan</p>`}
      </div>
      ${isOwner && u.role !== "owner" ? `
        <div class="grid grid-cols-2 gap-2">
          ${u.role === "admin"
            ? `<button class="btn btn--danger" data-role="user">Adminlikni olish</button>`
            : `<button class="btn btn--primary" data-role="admin">🛡 Admin berish</button>`}
          <button class="btn btn--light" data-reset>🔑 Parolni yangilash</button>
        </div>` : ""}
    </div>`;
  box.querySelector("[data-role]")?.addEventListener("click", async (e) => {
    try {
      await api(`users/${id}/role`, { method: "POST", body: { role: e.target.dataset.role } });
      toast(e.target.dataset.role === "admin" ? "🛡 Admin huquqi berildi" : "Admin huquqi olindi");
      openUser(id);
      renderOwner();
    } catch (err) { toast(err.message); }
  });
  box.querySelector("[data-reset]")?.addEventListener("click", async () => {
    const pw = prompt("Yangi parol (kamida 6 belgi):");
    if (!pw) return;
    try {
      await api(`users/${id}/password`, { method: "POST", body: { password: pw } });
      toast("🔑 Parol yangilandi — foydalanuvchiga yangi parolni ayting");
    } catch (err) { toast(err.message); }
  });
}

// ---------- Ishga kirish (foydalanuvchi) / Ishga olish (egasi) ----------
const STATUS = { new: "🆕 Yangi", hired: "✅ Ishga olindi", rejected: "✖ Rad etildi" };
const NOTIFY = { yuborildi: ["ok", "yuborildi ✅"], sozlanmagan: ["warn", "sozlanmagan ⚠️"], xato: ["err", "xato ❌"] };
const JOB_COVER = "linear-gradient(120deg,#ff7a00,#ff2e7e)";
const hireTemplate = (name) =>
  `Hurmatli ${name}! Siz Uzum Market'ga ishga qabul qilindingiz. Iltimos, bazaga kelib, narsalarni olib boring.`;
const fmtPhone = (d = "") =>
  d.length === 12 ? `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : d;

/** Telefon maydoni: "+998 90 123 45 67" ko'rinishida yoziladi */
function maskPhone(v) {
  let d = v.replace(/\D/g, "");
  if (d.startsWith("998")) d = d.slice(3);
  d = d.slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return "+998 " + parts.join(" ");
}

function setJobBadge(n) {
  $("#jobBadge").textContent = n;
  $("#jobBadge").classList.toggle("hidden", !n);
  $("#profileDot").textContent = n;
  $("#profileDot").classList.toggle("hidden", !n);
}

async function setupJobMenu() {
  const owner = state.user.role === "owner";
  $("#jobBtnText").textContent = owner ? "Ishga olish" : "Ishga kirmoqchimisiz?";
  setJobBadge(0);
  try {
    if (owner) {
      const { applications } = await api("applications");
      setJobBadge(applications.filter((a) => a.status === "new").length);
    } else {
      // ishga olingan bo'lsa — bir marta tabrik oynasini ko'rsatish
      const { application: a } = await api("applications/me");
      if (a?.status === "hired" && localStorage.getItem("seenHire") !== a.id) {
        localStorage.setItem("seenHire", a.id);
        openJobForm(a);
      }
    }
  } catch {}
}

$("#jobBtn").addEventListener("click", () => {
  $("#profileMenu").classList.add("hidden");
  state.user.role === "owner" ? setView("hire") : openJobForm();
});

// Foydalanuvchi: ariza formasi yoki ariza holati
async function openJobForm(pre) {
  const box = $("#userModalBody");
  const u = state.user;
  $("#userModal").classList.remove("hidden");
  let a = pre;
  if (a === undefined) {
    box.innerHTML = `<p class="p-8 text-center text-gray-500">Yuklanmoqda...</p>`;
    try { a = (await api("applications/me")).application; } catch (err) {
      box.innerHTML = `<p class="p-8 text-center text-rose-600">${escapeHtml(err.message)}</p>`;
      return;
    }
  }
  const head = `<div class="modal__cover" style="background:${JOB_COVER}"></div>
    <button data-close class="modal__close" aria-label="Yopish">×</button>`;

  if (a && a.status !== "rejected") {
    const hired = a.status === "hired";
    box.innerHTML = head + `
      <div class="modal__content">
        <div class="flex flex-col items-center text-center gap-1">
          ${avatarHtml(u, "lg")}
          <h3 class="text-xl font-extrabold mt-2">${hired ? "🎉 Tabriklaymiz!" : "⏳ Arizangiz ko'rib chiqilmoqda"}</h3>
          <p class="text-gray-500 text-sm">${hired ? "Siz ishga qabul qilindingiz — endi siz 👷 Ishchisiz" : "Javob email orqali keladi"}</p>
        </div>
        ${hired ? `<div class="comment-box mt-4">${escapeHtml(a.message || hireTemplate(a.name))}</div>` : ""}
        <div class="info-grid">
          <div class="info"><span>📞 Telefon</span><b>${fmtPhone(a.phone)}</b></div>
          <div class="info"><span>✉️ Email</span><b>${escapeHtml(a.email)}</b></div>
        </div>
        <button class="btn btn--primary w-full" data-close>Yaxshi</button>
      </div>`;
    return;
  }

  box.innerHTML = head + `
    <div class="modal__content">
      <div class="flex flex-col items-center text-center gap-1 mb-5">
        ${avatarHtml(u, "lg")}
        <h3 class="text-xl font-extrabold mt-2">Ishga kirmoqchimisiz? 💼</h3>
        <p class="text-gray-500 text-sm">Ma'lumotlaringizni qoldiring — javobni email orqali olasiz</p>
        ${a?.status === "rejected" ? `<p class="text-rose-600 text-sm mt-1">Oldingi arizangiz rad etilgan — qaytadan yuborishingiz mumkin</p>` : ""}
      </div>
      <form id="jobForm" class="space-y-3">
        <div>
          <label class="label" for="jPhone">Telefon raqam</label>
          <input id="jPhone" class="input" type="tel" inputmode="tel" placeholder="+998 90 123 45 67" autocomplete="tel" required>
        </div>
        <div>
          <label class="label" for="jEmail">Email</label>
          <input id="jEmail" class="input" type="email" value="${escapeHtml(u.email)}" autocomplete="email" required>
        </div>
        <div>
          <label class="label" for="jComment">Fikringiz</label>
          <textarea id="jComment" class="input" maxlength="1000" required
            placeholder="O'zingiz haqingizda va nima uchun ishlamoqchi ekaningizni yozing"></textarea>
        </div>
        <p id="jobError" class="text-rose-600 text-sm"></p>
        <button class="btn btn--primary w-full" id="jobSubmit">Yuborish</button>
      </form>
    </div>`;
  const phone = $("#jPhone");
  phone.addEventListener("focus", () => { if (!phone.value) phone.value = "+998 "; });
  phone.addEventListener("input", () => { phone.value = maskPhone(phone.value); });
  $("#jobForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#jobSubmit").disabled = true;
    $("#jobError").textContent = "";
    try {
      const { application } = await api("applications", {
        method: "POST",
        body: { phone: phone.value, email: $("#jEmail").value, comment: $("#jComment").value },
      });
      openJobForm(application);
      toast("✅ Arizangiz yuborildi!");
    } catch (err) {
      $("#jobError").textContent = err.message;
      $("#jobSubmit").disabled = false;
    }
  });
}

// Egasi: arizalar ro'yxati
let hireFilter = "new";

async function renderHire() {
  $("#appsGrid").innerHTML = `<p class="text-gray-500">Yuklanmoqda...</p>`;
  try {
    state.apps = (await api("applications")).applications;
    renderHireList();
  } catch (err) {
    $("#appsGrid").innerHTML = `<p class="text-rose-600">${escapeHtml(err.message)}</p>`;
  }
}

function renderHireList() {
  const apps = state.apps || [];
  const count = (s) => apps.filter((a) => a.status === s).length;
  setJobBadge(count("new"));
  $("#hireTabs").innerHTML = [["new", "🆕 Yangi"], ["hired", "✅ Ishga olingan"], ["rejected", "✖ Rad etilgan"], ["all", "Hammasi"]]
    .map(([k, label]) => `<button class="chip ${hireFilter === k ? "active" : ""}" data-hf="${k}">${label}<b>${k === "all" ? apps.length : count(k)}</b></button>`)
    .join("");
  const list = apps.filter((a) => hireFilter === "all" || a.status === hireFilter);
  $("#appsGrid").innerHTML = list.length
    ? list.map((a, i) => `
      <div class="ucard" data-app="${a.id}" style="animation-delay:${Math.min(i, 14) * 40}ms">
        <div class="ucard__cover" style="background:${coverGradient(a.email)}"></div>
        ${avatarHtml(a, "lg")}
        <div class="ucard__body">
          <div class="ucard__name !text-lg">${escapeHtml(a.name)}</div>
          <span class="status-tag ${a.status}">${STATUS[a.status]}</span>
          <span class="ucard__meta">${formatDate(a.created)}</span>
        </div>
      </div>`).join("")
    : `<div class="empty col-span-full"><div class="empty__big">💼</div>
        <b>${hireFilter === "new" ? "Yangi arizalar yo'q" : "Bu yerda hech narsa yo'q"}</b>
        Foydalanuvchilar profil menyusidagi "Ishga kirmoqchimisiz?" orqali ariza yuboradi</div>`;
}

$("#hireTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-hf]");
  if (b) { hireFilter = b.dataset.hf; renderHireList(); }
});
$("#appsGrid").addEventListener("click", (e) => {
  const c = e.target.closest("[data-app]");
  if (c) openApp(c.dataset.app);
});

function notifyHtml(n) {
  const tag = (label, s) => { const [cls, txt] = NOTIFY[s] || ["err", s]; return `<span class="${cls}">${label}: ${txt}</span>`; };
  return `<div class="notify">${tag("✉️ Email", n.email)}</div>` +
    (n.email === "sozlanmagan" ? `<p class="text-xs text-gray-500 mt-2">Email yuborilmagan edi — "Xabarni qayta yuborish" ni bosing.</p>` : "");
}

// Egasi: bitta ariza — telefon, email, fikr va "Ishga olish"
function openApp(id) {
  const a = state.apps.find((x) => x.id === id);
  if (!a) return;
  const box = $("#userModalBody");
  $("#userModal").classList.remove("hidden");
  box.innerHTML = `
    <div class="modal__cover" style="background:${coverGradient(a.email)}"></div>
    <button data-close class="modal__close" aria-label="Yopish">×</button>
    <div class="modal__content">
      <div class="flex flex-col items-center text-center gap-2">
        ${avatarHtml(a, "lg")}
        <div class="text-2xl font-extrabold">${escapeHtml(a.name)}</div>
        <span class="status-tag ${a.status}">${STATUS[a.status]}</span>
      </div>
      <div class="info-grid">
        <div class="info"><span>📞 Telefon</span><b><a class="hover:text-brand" href="tel:+${a.phone}">${fmtPhone(a.phone)}</a></b></div>
        <div class="info"><span>✉️ Email</span><b><a class="hover:text-brand" href="mailto:${escapeHtml(a.email)}">${escapeHtml(a.email)}</a></b></div>
        <div class="info"><span>📅 Ariza sanasi</span><b>${formatDate(a.created)}</b></div>
        <div class="info"><span>📌 Holat</span><b>${STATUS[a.status]}</b></div>
      </div>
      <h4 class="font-bold mb-2">💬 Fikri</h4>
      <div class="comment-box mb-5">${escapeHtml(a.comment)}</div>
      ${a.status === "rejected" ? "" : `
        <label class="label" for="hireMsg">${a.status === "hired" ? "Yuborilgan xabar" : "Yuboriladigan xabar (email)"}</label>
        <textarea id="hireMsg" class="input" maxlength="500">${escapeHtml(a.message || hireTemplate(a.name))}</textarea>
        ${a.notify ? `<div class="mt-3">${notifyHtml(a.notify)}</div>` : ""}`}
      <div class="grid grid-cols-2 gap-2 mt-5">
        ${a.status === "new" ? `
          <button class="btn btn--primary" data-hire>✅ Ishga olish</button>
          <button class="btn btn--danger" data-reject>Rad etish</button>` : ""}
        ${a.status === "hired" ? `<button class="btn btn--light col-span-2" data-hire>🔁 Xabarni qayta yuborish</button>` : ""}
      </div>
    </div>`;

  const update = (app) => {
    state.apps = state.apps.map((x) => (x.id === app.id ? app : x));
    renderHireList();
    openApp(app.id);
  };
  box.querySelector("[data-hire]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Yuborilmoqda...";
    try {
      const { application } = await api(`applications/${id}/hire`, { method: "POST", body: { message: $("#hireMsg").value } });
      update(application);
      const n = application.notify;
      toast(n.email === "yuborildi"
        ? "✅ Ishga olindi — 👷 Ishchi bo'ldi, email yuborildi"
        : `✅ Ishga olindi — 👷 Ishchi bo'ldi. Email: ${NOTIFY[n.email]?.[1] || n.email}`);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
    }
  });
  box.querySelector("[data-reject]")?.addEventListener("click", async () => {
    if (!confirm(`${a.name} arizasini rad etasizmi?`)) return;
    try {
      update((await api(`applications/${id}/reject`, { method: "POST" })).application);
      toast("Ariza rad etildi");
    } catch (err) { toast(err.message); }
  });
}

// ---------- Buyurtmalarim ----------
async function renderOrders() {
  const { orders } = await api("orders");
  const now = Date.now() / 1000;
  $("#ordersList").innerHTML = orders.length
    ? orders.slice().reverse().map((o, i) => {
      const done = now - o.time > 86400;
      return `
      <div class="order" style="animation-delay:${Math.min(i, 14) * 40}ms">
        ${imgTag(o.image)}
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate">${escapeHtml(o.name)}</div>
          <div class="text-xs text-gray-500">${formatDate(o.time)} · ${o.qty} dona</div>
          <span class="order__status ${done ? "done" : "go"}">${done ? "✅ Yetkazildi" : "🚚 Yo'lda — ertaga yetkaziladi"}</span>
        </div>
        <b class="whitespace-nowrap">${formatPrice(o.price * o.qty)}</b>
      </div>`;
    }).join("")
    : `<div class="empty"><div class="empty__big">📦</div><b>Hali buyurtma yo'q</b>Birinchi xaridingizni qiling
        <button class="btn btn--primary mx-auto mt-5" data-cat="all">Xarid qilish</button></div>`;
}

boot();
