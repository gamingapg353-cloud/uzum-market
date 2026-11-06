# 🍇 Uzum Market — o'quv loyiha

Mebel, kompyuter va noutbuklar uchun onlayn do'kon. O'quv maqsadida yaratilgan.

## Imkoniyatlar

- Yuklash ekrani (rasmlar yuklanguncha, ko'pi bilan 10 soniya)
- Ro'yxatdan o'tish / kirish: email + parol, **Google** va **GitHub**
- Bo'limlar: Hammasi, Mebel, PC, Noutbuk; qidiruv va saralash
- Savat, xarid, buyurtmalar, saralanganlar (♡)
- **Yaratish** — sotuvchi uchun tayyor shablon (rasm va nomini almashtirish)
- **Owner paneli** — foydalanuvchilar, xaridlari, admin berish
- **Ishga olish** — foydalanuvchi ariza yuboradi, owner ishga oladi (rol 👷 Ishchi, email xabar)
- Profil rasmini almashtirish

## Texnologiyalar

| Til | Fayl |
|---|---|
| HTML + Tailwind CSS | `index.html` |
| SCSS → CSS | `styles/main.scss` → `styles/main.css` |
| TypeScript → JS | `src/utils.ts` → `js/utils.js`, asosiy mantiq `js/app.js` |
| Python | `server.py` — server va API |
| C++ | `tools/report.cpp` — savdo hisoboti |

## Ishga tushirish

```bash
cp .env.example .env      # keyin .env ni to'ldiring (kamida OWNER_EMAIL va OWNER_PASSWORD)
python server.py          # http://localhost:8000
```

SCSS ni qayta kompilyatsiya qilish:

```bash
pip install libsass
python -c "import sass; open('styles/main.css','w',encoding='utf-8').write(sass.compile(filename='styles/main.scss', output_style='expanded'))"
```

C++ hisobot (server `data/orders.csv` ga yozadi):

```bash
g++ -std=c++17 -O2 -static tools/report.cpp -o tools/report
./tools/report
```
