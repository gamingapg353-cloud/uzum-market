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

## Internetga joylash (PythonAnywhere, kartasiz)

1. pythonanywhere.com da bepul (Beginner) hisob oching.
2. **Consoles → Bash**:
   ```bash
   git clone https://github.com/gamingapg353-cloud/uzum-market.git
   cd uzum-market && cp .env.example .env && nano .env   # qiymatlarni to'ldiring
   ```
3. **Web → Add a new web app → Manual configuration → Python 3.12**.
4. **WSGI configuration file** ichini shu bilan almashtiring (LOGIN — sizning loginingiz):
   ```python
   import sys
   sys.path.insert(0, "/home/LOGIN/uzum-market")
   from wsgi import application
   ```
5. **Reload** — sayt `https://LOGIN.pythonanywhere.com` da ochiladi.

C++ hisobot (server `data/orders.csv` ga yozadi):

```bash
g++ -std=c++17 -O2 -static tools/report.cpp -o tools/report
./tools/report
```
