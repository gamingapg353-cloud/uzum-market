// src/utils.ts dan kompilyatsiya qilingan (tsc --target es2020 --module es2020)
export const CATEGORIES = {
    all: "Barcha mahsulotlar",
    mebel: "Mebel",
    pc: "Kompyuterlar (PC)",
    notebook: "Noutbuklar",
};
export const ROLE_NAMES = {
    owner: "👑 Egasi",
    admin: "🛡 Admin",
    worker: "👷 Ishchi",
    user: "Foydalanuvchi",
};
/** 4890000 -> "4 890 000 so'm" */
export function formatPrice(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so'm";
}
/** Oylik bo'lib to'lash (12 oy) */
export function monthly(n) {
    return formatPrice(Math.ceil(n / 12 / 1000) * 1000) + "/oy";
}
export function escapeHtml(s) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(s).replace(/[&<>"']/g, (c) => map[c]);
}
export function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
}
function hash(s) {
    let h = 0;
    for (const ch of s)
        h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
}
export function avatarColor(seed) {
    return `hsl(${hash(seed) % 360} 65% 52%)`;
}
/** Foydalanuvchi kartochkasi tepasidagi rangli fon */
export function coverGradient(seed) {
    const h = hash(seed) % 360;
    return `linear-gradient(135deg, hsl(${h} 75% 58%), hsl(${(h + 50) % 360} 80% 62%))`;
}
/** Mahsulot reytingi (id dan doimiy qiymat) */
export function rating(id) {
    const h = hash(id);
    return { score: (4.5 + (h % 6) / 10).toFixed(1), reviews: 12 + (h % 480) };
}
/** Chegirma foizi (id dan doimiy qiymat) */
export function discount(id) {
    return [10, 15, 20, 25, 30][hash(id + "d") % 5];
}
export function avatarHtml(u, size = "sm") {
    const inner = u.avatar
        ? `<img src="${escapeHtml(u.avatar)}" alt="" referrerpolicy="no-referrer">`
        : escapeHtml(initials(u.name));
    return `<div class="avatar avatar--${size}" style="background:${avatarColor(u.email)}">${inner}</div>`;
}
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
/** 1762436820 -> "6-noyabr 2026, 18:27" */
export function formatDate(sec) {
    const d = new Date(sec * 1000);
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return `${d.getDate()}-${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hm}`;
}
/** Rasm faylini o'qib, 800px gacha kichraytirib, JPEG data-URL qaytaradi. */
export function readImage(file, max = 800) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith("image/"))
            return reject(new Error("Faqat rasm fayl tanlang"));
        const img = new Image();
        img.onload = () => {
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement("canvas");
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(img.src);
            resolve(c.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => reject(new Error("Rasmni o'qib bo'lmadi"));
        img.src = URL.createObjectURL(file);
    });
}
/** Rasm yuklanmasa — o'rniga chiroyli zaxira rasm */
export const FALLBACK_IMG = "data:image/svg+xml;utf8," +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f3ebff"/><text x="50" y="58" font-size="30" text-anchor="middle">🍇</text></svg>`);
