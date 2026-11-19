"""Улаанбаатарын хороо, дүүргийн хил + хүн амын өгөгдлийг дашбоардад бэлтгэнэ.

Хэрэглээ (tools/ хавтаснаас):
    pip install -r requirements-data.txt
    npm install
    python build_data.py --khoroo 204_Shine_hil_shinechilsen1.shp --duureg Dvvreg_hil_last9.shp

Гаралт (анхдагчаар ../public/data):
    boundaries.json — хялбарчилсан хороо, дүүргийн хил (анхдагчаар Web Mercator EPSG:3857, метр)
    tools/khoroo_base.csv — хорооны код, нэр, талбай, shapefile дахь хүн амын тоо
                            (build_excel.py үүнийг Excel-ийн өгөгдөлтэй нийлүүлнэ)
"""
import argparse, json, shutil, subprocess, tempfile
from pathlib import Path
import geopandas as gpd, pandas as pd
from pyproj import Geod, Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union

HERE = Path(__file__).resolve().parent
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--khoroo', required=True, help='Хорооны хил + хүн амын shapefile (.shp)')
ap.add_argument('--duureg', required=True, help='Хотын/дүүргийн хилийн shapefile (.shp), гадна хилийг тулгахад')
ap.add_argument('--crs', default='EPSG:3857',
                help='Гаралтын проекц. EPSG:3857 (Web Mercator) нь суурь зургийн tile-тай давхцана; EPSG:32648 бол UTM 48N')
ap.add_argument('--out', default=str(HERE.parent / 'public' / 'data'), help='Гаралтын хавтас')
args = ap.parse_args()

OUT = Path(args.out); OUT.mkdir(parents=True, exist_ok=True)
TMP = Path(tempfile.mkdtemp(prefix='ub_'))
MAPSHAPER = str(HERE / 'node_modules' / '.bin' / 'mapshaper') if (HERE / 'node_modules' / '.bin' / 'mapshaper').exists() else shutil.which('mapshaper')
if not MAPSHAPER:
    raise SystemExit('mapshaper олдсонгүй: tools/ хавтаст `npm install` ажиллуулна уу.')
SIMPLIFY_M = 15          # хялбарчлах интервал, метр
CORE_DENSITY = 500       # "төв хэсэг"-ийн хүрээг тодорхойлох нягтрал, хүн/км²
CENTRAL = {'Баянгол', 'Баянзүрх', 'Сонгинохайрхан', 'Сүхбаатар', 'Хан-Уул', 'Чингэлтэй'}

raw = gpd.read_file(args.khoroo, encoding='utf-8')
city_file = gpd.read_file(args.duureg, encoding='utf-8').to_crs(raw.crs)

# 1. Хоёр хэсгээс тогтсон хороо (BZD_10, HUD_21) давхар мөртэй тул кодоор нь нэгтгэнэ.
#    Хүн амын тоо хоёр мөрөнд ижил давтагдсан: нэмэхгүй, эхний утгыг авна.
attrs = ['SO_MU_N_M', 'SO_MU_N_E', 'BA_KO_C', 'BA_KO_N_E', 'BA_KO_N_M', 'hum_am', 'hum_am_er',
         'hum_am_em', 'orh', 'baishin_ho', 'baishin__1', 'ger_horool', 'ger_horo_1']
check = raw.groupby('KH_MON')[attrs].nunique().max().max()
assert check == 1, 'Давхар мөрүүдийн утга зөрж байна'
k = raw.dissolve(by='KH_MON', aggfunc='first', as_index=False)[['KH_MON', *attrs, 'geometry']]
assert len(k) == 204

# 2. Талбайг WGS84 эллипсоид дээр тооцно.
geod = Geod(ellps='WGS84')
k['area_km2'] = k.geometry.to_crs(4326).apply(lambda g: abs(geod.geometry_area_perimeter(g)[0]) / 1e6)

# 3. Дүүргийн кодыг хорооны кодоос авна (SO_MU_C талбар -1..-3 гэсэн буруу утгатай).
k['district_code'] = k.BA_KO_C.astype(str).str[:5]

csv = pd.DataFrame({
    'code': k.KH_MON, 'khoroo_code': k.BA_KO_C, 'district_code': k.district_code,
    'district': k.SO_MU_N_M, 'district_en': k.SO_MU_N_E,
    'khoroo_no': k.BA_KO_N_E, 'khoroo': k.BA_KO_N_M,
    'pop': k.hum_am.astype(int), 'male': k.hum_am_er.astype(int), 'female': k.hum_am_em.astype(int),
    'hh': k.orh.astype(int),
    'apt_hh': k.baishin_ho.astype(int), 'apt_pop': k.baishin__1.astype(int),
    'ger_hh': k.ger_horool.astype(int), 'ger_pop': k.ger_horo_1.astype(int),
    'area_km2': k.area_km2.round(4),
}).sort_values(['district', 'khoroo_no']).reset_index(drop=True)
csv.to_csv(HERE / 'khoroo_base.csv', index=False, encoding='utf-8')

# 4. Хилийг нийтлэг ирмэгээ хадгалан хялбарчилж, дүүргийг хорооноос гаргана.
src = TMP / 'khoroo_full.geojson'
k[['KH_MON', 'SO_MU_N_M', 'geometry']].set_crs(None, allow_override=True).to_file(src, driver='GeoJSON')
subprocess.run([MAPSHAPER, str(src), '-simplify', f'interval={SIMPLIFY_M}', 'planar', 'keep-shapes',
                '-o', str(TMP / 'khoroo_s.geojson'), 'format=geojson', 'precision=1', 'force'],
               check=True, capture_output=True)
subprocess.run([MAPSHAPER, str(TMP / 'khoroo_s.geojson'), '-dissolve2', 'SO_MU_N_M', 'gap-fill-area=20000',
                '-o', str(TMP / 'district_s.geojson'), 'format=geojson', 'precision=1', 'force'],
               check=True, capture_output=True)
ks = json.loads((TMP / 'khoroo_s.geojson').read_text('utf-8'))['features']
ds = json.loads((TMP / 'district_s.geojson').read_text('utf-8'))['features']
assert len(ks) == 204 and len(ds) == 9

# Хялбарчилсан хилийг гаралтын проекц руу хөрвүүлнэ (топологи хадгалагдана).
to_out = Transformer.from_crs(raw.crs, args.crs, always_xy=True).transform
for f in ks + ds:
    f['geometry'] = mapping(transform(to_out, shape(f['geometry'])))


def compact(geom):
    def walk(c):
        return [round(c[0]), round(c[1])] if isinstance(c[0], (int, float)) else [walk(x) for x in c]
    return json.dumps({'type': geom['type'], 'coordinates': walk(geom['coordinates'])}, separators=(',', ':'))


pop = dict(zip(csv.code, csv['pop']))
rows, label = [], {}
for f in ks:
    g = shape(f['geometry']); p = g.representative_point(); code = f['properties']['KH_MON']
    label[code] = (p.x, p.y)
    rows.append({'level': 'khoroo', 'id': code, 'lx': round(p.x), 'ly': round(p.y), 'geometry': compact(f['geometry'])})
for f in ds:
    name = f['properties']['SO_MU_N_M']; codes = csv[csv.district == name].code
    w = sum(pop[c] for c in codes)
    lx = sum(label[c][0] * pop[c] for c in codes) / w; ly = sum(label[c][1] * pop[c] for c in codes) / w
    rows.append({'level': 'district', 'id': name, 'lx': round(lx), 'ly': round(ly), 'geometry': compact(f['geometry'])})

# 5. Төв хэсгийн анхны харагдах хүрээ.
core = k[k.SO_MU_N_M.isin(CENTRAL) & (k.hum_am / k.area_km2 >= CORE_DENSITY)]
b = core.to_crs(args.crs).total_bounds
rows.append({'level': 'core', 'id': 'core', 'lx': round((b[0] + b[2]) / 2), 'ly': round((b[1] + b[3]) / 2),
             'geometry': json.dumps({'type': 'MultiPoint', 'coordinates': [[round(b[0]), round(b[1])], [round(b[2]), round(b[3])]]}, separators=(',', ':'))})
rows.append({'level': 'crs', 'id': args.crs, 'lx': 0, 'ly': 0, 'geometry': 'null'})

# 6. Хяналт: эх файлтай тулгана.
u = unary_union(k.geometry); c = unary_union(city_file.geometry)
qa = {
    'source_rows': int(len(raw)), 'khoroo': int(len(csv)), 'districts': int(csv.district.nunique()),
    'pop_total': int(csv['pop'].sum()), 'hh_total': int(csv.hh.sum()),
    'raw_pop_sum_with_duplicates': int(raw.hum_am.sum()),
    'area_km2_total': round(float(csv.area_km2.sum()), 1),
    'city_boundary_mismatch_km2': round((u.symmetric_difference(c).area) / 1e6, 3),
    'male_plus_female_equals_pop': bool((csv.male + csv.female == csv['pop']).all()),
    'apt_plus_ger_equals_pop': bool((csv.apt_pop + csv.ger_pop == csv['pop']).all()),
    'apt_plus_ger_equals_hh': bool((csv.apt_hh + csv.ger_hh == csv.hh).all()),
}
assert qa['male_plus_female_equals_pop'] and qa['apt_plus_ger_equals_pop'] and qa['apt_plus_ger_equals_hh']

(OUT / 'boundaries.json').write_text(json.dumps({'rows': rows}, ensure_ascii=False, separators=(',', ':')), 'utf-8')
shutil.rmtree(TMP, ignore_errors=True)

print(json.dumps(qa, ensure_ascii=False, indent=1))
print('core bbox', [round(x) for x in b], 'core khoroo', len(core))
print(csv.groupby('district')[['pop', 'hh', 'ger_pop', 'area_km2']].sum().assign(n=csv.groupby('district').size()))
print({f.name: f.stat().st_size for f in OUT.iterdir() if f.suffix in ('.csv', '.json')})
