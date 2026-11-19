"""Их, дээд сургуулийн байршлын цэгийг (shapefile) дашбоардын өгөгдөл болгоно.

Хэрэглээ (tools/ хавтаснаас):
    python build_points.py --shp "Их дээд сургуулийн байршил.shp"

Цэг бүрийг хилийн өгөгдөлтэй ижил проекц руу (../public/data/boundaries.json-ийн crs) хөрвүүлж,
аль хороонд орж байгааг тодорхойлно. Гаралт: ../public/data/universities.csv
"""
import argparse, json
from pathlib import Path
import geopandas as gpd, pandas as pd
from shapely.geometry import Point, shape
from shapely.strtree import STRtree

HERE = Path(__file__).resolve().parent
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--shp', required=True)
ap.add_argument('--boundaries', default=str(HERE.parent / 'public' / 'data' / 'boundaries.json'))
ap.add_argument('--khoroo', default=str(HERE.parent / 'public' / 'data' / 'khoroo.csv'))
ap.add_argument('--out', default=str(HERE.parent / 'public' / 'data' / 'universities.csv'))
args = ap.parse_args()

rows = json.loads(Path(args.boundaries).read_text('utf-8'))['rows']
crs = next((r['id'] for r in rows if r['level'] == 'crs'), 'EPSG:32648')
polys = [(r['id'], shape(json.loads(r['geometry']))) for r in rows if r['level'] == 'khoroo']
tree = STRtree([g for _, g in polys])
kh = pd.read_csv(args.khoroo).set_index('code')

u = gpd.read_file(args.shp, encoding='utf-8')
assert u.crs is not None, 'Цэгийн файлд проекц (.prj) алга'
assert (u.geom_type == 'Point').all(), 'Зөвхөн цэгэн өгөгдөл байх ёстой'
pts = u.to_crs(crs)
ll = u.to_crs(4326)


def khoroo_of(pt):
    hits = [i for i in tree.query(pt) if polys[i][1].covers(pt)]
    if not hits:  # хилийн хялбарчлалаас болж зааг дээр унавал хамгийн ойрыг авна
        hits = [min(range(len(polys)), key=lambda i: polys[i][1].distance(pt))]
    return polys[hits[0]][0]


def text(v):
    return '' if pd.isna(v) else ' '.join(str(v).split())


out = []
for i, r in u.iterrows():
    p = pts.geometry.iloc[i]
    code = khoroo_of(p)
    name = text(r.get('Ner_mn'))
    known = bool(name) and name != 'Тодорхойгүй'
    out.append({
        'id': i + 1, 'name': name if known else '', 'known': int(known),
        'confidence': text(r.get('Itgel')), 'match_m': int(r['Zai_m']) if pd.notna(r.get('Zai_m')) else '',
        'nearest': text(r.get('Oir_surg')),
        'district': kh.loc[code, 'district'], 'khoroo_code': code, 'khoroo': kh.loc[code, 'khoroo'],
        'district_src': text(r.get('soum')),
        'area_m2': int(round(r['area_m2'])) if pd.notna(r.get('area_m2')) else '',
        'right': text(r.get('rigth_type')), 'street': text(r.get('address_st')),
        'x': round(p.x), 'y': round(p.y),
        'lon': round(ll.geometry.iloc[i].x, 6), 'lat': round(ll.geometry.iloc[i].y, 6),
        'source': text(r.get('Ekh_surv')),
    })
df = pd.DataFrame(out)
df.to_csv(args.out, index=False, encoding='utf-8')
mismatch = df[df.district != df.district_src]
print(f'{len(df)} цэг ({df.known.sum()} нэртэй, {len(df) - df.known.sum()} тодорхойгүй) → {args.out}')
print('Дүүргээр:', df.district.value_counts().to_dict())
print('Файлын дүүрэг ба хилээр тогтоосон дүүрэг зөрсөн:', len(mismatch), mismatch[['id', 'district_src', 'district', 'khoroo']].to_dict('records'))
