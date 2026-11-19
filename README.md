# Улаанбаатар хотын хүн ам, өрх, гишүүнчлэлийн дашбоард

Улаанбаатар хотын 9 дүүрэг, 204 хорооны хүн ам, өрх, нягтрал, гишүүдийн тоо ба бүтцийг газрын зураг, график, хүснэгтээр харуулна. Build алхамгүй, цэвэр статик сайт тул Vercel дээр шууд байршина.

## Бүтэц

```
ub-dashboard/
├── vercel.json            # Vercel тохиргоо: public/ хавтсыг үйлчилнэ, аюулгүй байдлын толгой
├── api/members.js         # Нууц үгээр хамгаалсан гишүүдийн нэрсийн API (Vercel функц)
├── private/members.enc    # Гишүүдийн нэрс, AES-256-GCM шифртэй (түлхүүр нь зөвхөн Vercel-д)
├── public/                # Вэбд гарах бүх файл
│   ├── index.html
│   ├── favicon.svg
│   ├── css/tokens.css     # Өнгө, үсэг, зай (гэрэл/харанхуй горим)
│   ├── css/ub.css         # Дашбоардын загвар
│   ├── js/d3.min.js       # D3 v7 (ISC лиценз, d3.LICENSE.txt)
│   ├── js/dash-runtime.js # Өгөгдөл ачаалах, шүүлтүүр, дахин зурах жижиг орчин
│   ├── js/config.js       # Тохиргоо: суурь зургийг асаах/унтраах
│   ├── js/app.js          # Тооцоолол, газрын зураг, график, хүснэгт
│   ├── js/members.js      # «Гишүүдийн нэрс» хэсэг: нэвтрэх, жагсаалт
│   └── data/
│       ├── khoroo.csv          # 204 хорооны хүн ам, өрх, талбай, гишүүдийн тоо
│       ├── members_scope.csv   # Хот, дүүрэг, хорооны гишүүдийн задаргаа (нууцлалтай)
│       ├── members_monthly.csv # Сар бүрийн шинэ гишүүд
│       └── boundaries.json     # Хороо, дүүргийн хялбарчилсан хил (Web Mercator EPSG:3857, метр)
└── tools/                 # Өгөгдөл бэлтгэх хэрэгсэл (вэбд гарахгүй)
    ├── build_data.py      # shapefile → boundaries.json, khoroo_base.csv
    ├── build_excel.py     # Нэгтгэлийн Excel → khoroo.csv, members_*.csv
    ├── build_members_secure.py # Нэгтгэлийн Excel → private/members.enc (шифртэй нэрс)
    ├── khoroo_base.csv    # Хорооны код, талбай, хилийн файлын гэр хорооллын хүн ам
    ├── requirements-data.txt
    └── package.json
```

## Vercel дээр байршуулах

### А. Vercel CLI-аар (хамгийн хурдан)

```bash
npm i -g vercel
cd ub-dashboard
vercel          # эхний удаа: нэвтэрч, төслийн нэрээ сонгоно → preview холбоос гарна
vercel --prod   # үндсэн (production) хаяг руу гаргана
```

Асуулт гарвал анхдагч хариултыг сонгоно. Тохиргоо `vercel.json`-д байгаа тул build command, output directory-г өөрчлөх шаардлагагүй.

### Б. GitHub-аар (автомат шинэчлэлттэй)

1. Хавтасны **доторх** бүх файлыг (`vercel.json`, `public/`, `tools/`, `.gitignore`, `.vercelignore`) GitHub репогийн үндэс рүү оруулна. Репог **Private** болгохыг зөвлөж байна — `public/data/` дотор гишүүдийн тоо бий.
2. vercel.com → **Add New… → Project** → репогоо **Import** хийнэ.
3. Тохиргооны дэлгэц дээр заавал шалгана:
   - **Root Directory**: `./` (хоосон). `tools` сонгогдсон байвал **Edit** дарж `./` болгоно — эс бөгөөс сайт 404 өгнө.
   - **Framework Preset**: `Other`.
   - Build/Output/Install командуудыг хоосон орхино (`vercel.json` удирдана).
4. **Deploy**. Цаашид `main` салбар руу push хийх бүрт автоматаар шинэчлэгдэнэ.

> **GitHub-ийн вэбээр файл оруулахад** нэр нь цэгээр эхэлсэн файлууд (`.gitignore`, `.vercelignore`) ихэвчлэн орхигддог. Тэдгээрийг **Add file → Create new file** ашиглан гараар үүсгэнэ.

> **Хандалтын тухай (заавал уншина уу):** Vercel-ийн production хаяг анхдагчаар хэн ч нээх боломжтой бөгөөд `public/data/` доторх файлуудыг шууд татаж болно. Энэ сайтад хороо бүрийн гишүүдийн тоо орсон тул нийтэд нээлттэй байршуулахаас өмнө Project → Settings → **Deployment Protection**-ийг асааж, зөвхөн эрх бүхий хүмүүст нээнэ үү (зарим сонголт төлбөртэй багцад л байдаг).

## 404 алдаа гарвал

Vercel → төсөл → **Settings → Build and Deployment**: **Root Directory** хоосон (`./`), **Framework Preset** `Other` байгаа эсэхийг шалгаад **Deployments → ⋯ → Redeploy** хийнэ. Build амжилттай ч `/` хаяг 404 өгч байвал бараг үргэлж Root Directory буруу байдаг.

## Орон нутагт турших

`fetch` ашигладаг тул `index.html`-ийг шууд давхар дарж нээвэл ажиллахгүй. Жижиг сервер ажиллуулна:

```bash
cd ub-dashboard
python3 -m http.server 8000 -d public   # эсвэл: npx serve public
# http://localhost:8000
```

## Өгөгдлийг шинэчлэх

### Хүн ам, өрх, гишүүд (шинэ нэгтгэл ирэх бүрт)

```bash
cd ub-dashboard/tools
pip install -r requirements-data.txt
python build_excel.py --excel /зам/2026.11.19_Negtgel.xlsx
```

Excel-д хоёр хуудас байх ёстой: «Өрх, хүн амын тоо, хороогоор» (Дүүрэг, Хорооны нэр, Нийт өрхийн тоо, Хүн амын тоо) ба «Гишүүнчлэл» (2-р мөр толгой). Скрипт хороо бүрийг газрын зурагтай тулгаж, таарахгүй мөр байвал зогсоно. Дараа нь дахин deploy хийнэ.

**Нууцлал.** Скрипт регистр, нэр, утас, MEMBER_ID-г огт уншдаггүй. Гаралтад зөвхөн нэгтгэсэн тоо гарна: хот, дүүрэг, хороо бүрийн гишүүдийн тоо ба задаргаа. 5-аас цөөн гишүүнтэй хүрээний задаргааг хоосон үлдээнэ (`MIN_GROUP`), мөн дээд хүрээний дүнгээс хасаж тооцоолж болох хүрээг нэмж нууна. Excel файлыг өөрийг нь репо эсвэл `public/` руу хэзээ ч бүү хуул (`.gitignore` хаасан).

### Хил (shapefile шинэчлэгдвэл)

```bash
cd ub-dashboard/tools
npm install
python build_data.py \
  --khoroo /зам/204_Shine_hil_shinechilsen1.shp \
  --duureg /зам/Dvvreg_hil_last9.shp
python build_excel.py --excel /зам/2026.11.19_Negtgel.xlsx   # дараа нь заавал
```

`build_data.py` нь хоёр полигонтой хороог нэгтгэж, дүүргийн кодыг `BA_KO_C`-ээс авч, 9 дүүргийн хилийг хорооноос гаргаж, хилийг 15 м-ээр хялбарчилна.

## Гишүүдийн нэрс (нууц үгээр хамгаалсан)

Хороо сонгоход «Сонгосон хүрээ» самбарын доод хэсэгт тухайн хорооны гишүүдийн нэр, нас, хүйс, үүр, хөдөлгөөн, анкетын хувь гарна. Нэрсийг харахын тулд нууц үгээр нэвтэрнэ (8 цаг хүчинтэй, «Гарах» товчоор гарна). Регистр, утас, MEMBER_ID огт харагдахгүй.

**Хэрхэн хамгаалагдсан бэ:** нэрс `private/members.enc` файлд AES-256-GCM-ээр шифрлэгдсэн. Тайлах түлхүүр GitHub-д биш, зөвхөн Vercel-ийн Environment Variables-д хадгалагдана. Сервер (`api/members.js`) нууц үгээр нэвтэрсэн хүнд л нэг хорооны жагсаалтыг илгээнэ. Шифртэй файл статик сайтаар татагдахгүй.

### Анхны тохиргоо (нэг удаа)

1. Vercel → төсөл → **Settings → Environment Variables** хэсэгт хоёр хувьсагч нэмнэ (Production, Preview, Development гурвыг сонгоно):
   - `MEMBERS_KEY` — тусад нь өгсөн `MEMBERS_KEY.txt` доторх 64 тэмдэгт (эсвэл `tools/members.key`).
   - `MEMBERS_PASSWORD` — нэвтрэх нууц үг. **12-оос доошгүй тэмдэгт** (богино бол API ажиллахгүй); 16+ тэмдэгт, санамсаргүй үг хэллэг зөвлөнө.
2. **Deployments → ⋯ → Redeploy.** Environment Variables өөрчилсний дараа заавал redeploy хийнэ.
3. Түлхүүрийн файлыг (`MEMBERS_KEY.txt`, `tools/members.key`) GitHub руу **ХЭЗЭЭ Ч** бүү оруул. `.gitignore`, `.vercelignore` хаасан ч GitHub-ийн вэбээр гараар оруулбал хамгаалалт ажиллахгүй.

### Нэрсийг шинэчлэх

```bash
cd ub-dashboard/tools
python build_members_secure.py --excel /зам/шинэ_нэгтгэл.xlsx   # tools/members.key-г ашиглана
python build_excel.py --excel /зам/шинэ_нэгтгэл.xlsx            # нэгтгэсэн тоо
```

Дараа нь `private/members.enc` болон `public/data/*`-г репод шинэчилж deploy хийнэ.

### Нууц үг, түлхүүр солих

- **Нууц үг солих:** Vercel дээр `MEMBERS_PASSWORD`-ийг солиод Redeploy. Бүх нэвтрэлт шууд хүчингүй болно.
- **Түлхүүр солих** (алдагдсан гэж сэжиглэвэл): `python build_members_secure.py --excel … --rotate-key` → шинэ `members.key`-г `MEMBERS_KEY`-д хуулж, шинэ `members.enc`-ийг оруулаад Redeploy.

> Репо public хэвээр байвал шифртэй файл түүхэнд үлдэнэ. 256 битийн санамсаргүй түлхүүртэй тул тайлах боломжгүй ч репогоо **Private** болгохыг зөвлөж байна.

## Суурь зураг

Газрын зургийн доор гудамж, барилга, гол мөрөн харагдах суурь зураг (base map) байна. «Суурь зураг» сонголтоор солино:

| Сонголт | Үйлчилгээ | Анхаарах нөхцөл |
|---|---|---|
| Цайвар (анхдагч) | CARTO Positron / Dark Matter (харанхуй горимд автоматаар) | Арилжааны бус, сард ~75 000 хүртэл харагдалтад үнэгүй. Түүнээс их бол CARTO-гийн төлбөртэй эрх авна. |
| OpenStreetMap | tile.openstreetmap.org | Бага ачаалалтай сайтад зориулсан; [tile ашиглах журам](https://operations.osmfoundation.org/policies/tiles/)-ыг баримтална. |
| Хиймэл дагуул | Esri World Imagery | Esri-ийн [нөхцөл](https://www.esri.com/en-us/legal/terms/full-master-agreement)-ийг шалгана; албан ёсны хэрэглээнд ArcGIS бүртгэл шаардаж болно. |
| Байхгүй | — | Гадны сервер рүү хандахгүй. |

- Tile-ийг **үзэгчийн хөтөч** шууд татдаг тул tile үйлчилгээ үзэгчийн IP хаягийг хардаг. Дотоод сүлжээнд, гадагш хандахгүй ажиллуулах бол `public/js/config.js` дотор `basemap: false` болгоно.
- Зургийн баруун доод буланд эх сурвалжийн бичиг (attribution) автоматаар гарна; үүнийг хасаж болохгүй.
- Хил Web Mercator (EPSG:3857) проекцтой байх ёстой, `build_data.py` анхдагчаар ингэж гаргана. `--crs EPSG:32648` (UTM)-аар гаргавал суурь зургийн сонголт автоматаар нуугдана.
- Шинэ tile үйлчилгээ нэмэх бол `app.js` доторх `BASEMAPS`-д нэмж, `vercel.json`-ийн `Content-Security-Policy` → `img-src`-д хостыг нь нэмнэ.

## Шүүлтүүрийг холбоосоор хуваалцах

Сонгосон шүүлтүүр URL-д хадгалагдана, жишээ нь:

```
/?district=Баянгол&metric=gerpct
/?district=Хан-Уул&khoroo=HUD_21&metric=pop
/?level=district&metric=hhsize
/?district=Сүхбаатар&base=sat
```

`metric`: `dens`, `pop`, `hh`, `hhsize`, `members`, `mem_rate`, `gerpct` · `base`: `carto`, `osm`, `sat`, `none` · `level`: `khoroo`, `district`.

## Кодын тухай

`js/app.js` нь Claude дээрх дашбоардын `dash` API-аар бичигдсэн бөгөөд `js/dash-runtime.js` тэр API-г (өгөгдөл ачаалах, `calc`, `draw`, шүүлтүүр) статик сайтад хэрэгжүүлдэг. Шинэ эх өгөгдөл нэмэх бол `dash-runtime.js` доторх `SOURCES`-д бүртгэнэ, шинэ шүүлтүүр нэмэх бол `DEFAULTS` (сонголт хязгаартай бол `ALLOWED`)-д нэмнэ.
