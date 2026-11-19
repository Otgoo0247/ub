"""Нэгтгэлийн Excel-ийг (хүн ам, өрх + гишүүдийн бүртгэл) дашбоардын өгөгдөл болгоно.

Хэрэглээ (tools/ хавтаснаас):
    python build_excel.py --excel 2026.11.19_Negtgel.xlsx --ages 2026.11.19_Negtgel_V1.xlsx

Оролт:
    Excel: "Өрх, хүн амын тоо, хороогоор" хуудас (Дүүрэг, Хорооны нэр, Нийт өрхийн тоо, Хүн амын тоо)
           "Гишүүнчлэл" хуудас (2-р мөр толгой; Нас, Хүйс, Хөдөлгөөн, огноо, Сум/дүүрэг, Хороо, Анкет %)
    tools/khoroo_base.csv (build_data.py-ийн гаралт: код, талбай, shapefile дахь гэр хорооллын хүн ам)

Гаралт (../public/data):
    khoroo.csv          — хороо бүрийн хүн ам, өрх, талбай, гишүүдийн тоо
    members_scope.csv   — хот, дүүрэг, хороо бүрийн гишүүдийн задаргаа (хүйс, нас, хөдөлгөөн, анкет)
    members_monthly.csv — сар бүр шинээр бүртгэгдсэн гишүүд (хот даяар)

Нууцлал: регистр, нэр, утас, MEMBER_ID, хувь хүний нас зэрэг талбар гаралтад ОРОХГҮЙ.
MIN_GROUP-ээс цөөн гишүүнтэй хүрээний (хот, дүүрэг, хороо) задаргааг хоосон үлдээнэ (анхдагч нуулт).
Мөн дээд хүрээний дүнгээс бусдыг хасаж нуусан хүрээг тооцоолохоос сэргийлж, нуусан хэсгийн нийлбэр
MIN_GROUP-ээс бага бол хамгийн цөөн гишүүнтэй нэмэлт хүрээг нууна (хоёрдогч нуулт).
"""
import argparse
from pathlib import Path
import pandas as pd

HERE = Path(__file__).resolve().parent
MIN_GROUP = 5
AGE_BINS = [('age_u18', None, 17), ('age_18_24', 18, 24), ('age_25_34', 25, 34), ('age_35_44', 35, 44), ('age_45p', 45, None)]
MOVES = {
    'Шинэ': 'mv_new', 'Үндсэн': 'mv_base',
    'Намын баг/хороо солигдсон': 'mv_moved', 'Намын хороо дотор үүр солигдсон': 'mv_moved', 'Орон нутаг солигдсон': 'mv_moved',
}

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--excel', required=True)
ap.add_argument('--ages', help='«18-25», «Сонгуулийн нас 18+ дээш» баганатай Excel (анхдагч: --excel)')
ap.add_argument('--base', default=str(HERE / 'khoroo_base.csv'))
ap.add_argument('--out', default=str(HERE.parent / 'public' / 'data'))
args = ap.parse_args()
OUT = Path(args.out); OUT.mkdir(parents=True, exist_ok=True)

sheets = pd.ExcelFile(args.excel).sheet_names
pop_sheet = next(s for s in sheets if 'хүн ам' in s.lower())
mem_sheet = next(s for s in sheets if 'гишүүн' in s.lower())
base = pd.read_csv(args.base)

# 1. Хүн ам, өрх
p = pd.read_excel(args.excel, sheet_name=pop_sheet)
p = p.rename(columns=lambda c: ' '.join(str(c).split()))
p = p.rename(columns={'Дүүрэг': 'district', 'Хорооны нэр': 'khoroo', 'Нийт өрхийн тоо': 'hh', 'Хүн амын тоо, бүгд': 'pop'})
p['district'] = p.district.str.strip()
p['khoroo_no'] = p.khoroo.str.extract(r'^(\d+)-р хороо')[0].astype(int)
assert not p.duplicated(['district', 'khoroo_no']).any(), 'Давхардсан хороо байна'
k = base.merge(p[['district', 'khoroo_no', 'pop', 'hh']], on=['district', 'khoroo_no'], how='outer', indicator=True, suffixes=('_shp', ''))
missing = k[k._merge != 'both']
assert missing.empty, f'Excel ба хилийн хороо таарахгүй байна:\n{missing[["district", "khoroo_no", "_merge"]]}'

# 1б. Насны бүлэг: 18–25 ба сонгуулийн нас (18+)
ages_file = args.ages or args.excel
a = pd.read_excel(ages_file, sheet_name=next(s for s in pd.ExcelFile(ages_file).sheet_names if 'хүн ам' in s.lower()))
a = a.rename(columns=lambda c: ' '.join(str(c).split()))
a = a.rename(columns={'Дүүрэг': 'district', 'Хорооны нэр': 'khoroo', 'Хүн амын тоо, бүгд': 'pop_a', '18-25': 'age18_25', 'Сонгуулийн нас 18+ дээш': 'vote18'})
assert {'age18_25', 'vote18'} <= set(a.columns), f'{ages_file}: «18-25», «Сонгуулийн нас 18+ дээш» багана олдсонгүй'
a['district'] = a.district.str.strip()
a['khoroo_no'] = a.khoroo.str.extract(r'^(\d+)-р хороо')[0].astype(int)
k = k.drop(columns='_merge').merge(a[['district', 'khoroo_no', 'pop_a', 'age18_25', 'vote18']], on=['district', 'khoroo_no'], how='left')
assert k.vote18.notna().all(), 'Насны файлд зарим хороо дутуу байна'
assert (k['pop'] == k.pop_a).all(), 'Хоёр файлын хүн амын тоо зөрж байна'
assert (k.age18_25 <= k.vote18).all() and (k.vote18 <= k['pop']).all(), 'Насны бүлгийн тоо логик бус байна'

# 2. Гишүүд — зөвхөн нэгтгэлд хэрэгтэй багануудыг уншина
g = pd.read_excel(args.excel, sheet_name=mem_sheet, header=1,
                  usecols=['Нас', 'Хүйс', 'Хөдөлгөөн', 'Хөдөлгөөн.1', 'Аймаг/нийслэл', 'Сум/дүүрэг', 'Хороо', 'Анкет %'])
g = g[g['Аймаг/нийслэл'].eq('Улаанбаатар')].copy()
g['district'] = g['Сум/дүүрэг'].str.strip()
g['khoroo_no'] = g['Хороо'].str.extract(r'^(\d+)')[0].astype(int)
g = g.merge(base[['district', 'khoroo_no', 'code']], on=['district', 'khoroo_no'], how='left')
unmatched = int(g.code.isna().sum())
assert unmatched == 0, f'{unmatched} гишүүний хороо газрын зурагт олдсонгүй'

k['members'] = k.code.map(g.groupby('code').size()).fillna(0).astype(int)
out = pd.DataFrame({
    'code': k.code, 'khoroo_code': k.khoroo_code, 'district_code': k.district_code,
    'district': k.district, 'district_en': k.district_en, 'khoroo_no': k.khoroo_no, 'khoroo': k.khoroo,
    'pop': k['pop'].astype(int), 'hh': k.hh.astype(int), 'age18_25': k.age18_25.astype(int), 'vote18': k.vote18.astype(int),
    'area_km2': k.area_km2, 'members': k.members,
    'shp_pop': k.pop_shp.astype(int), 'shp_ger_pop': k.ger_pop.astype(int),
}).sort_values(['district', 'khoroo_no'])
out.to_csv(OUT / 'khoroo.csv', index=False, encoding='utf-8')


def breakdown(scope, level, parent, d):
    n = len(d)
    row = {'scope': scope, 'level': level, 'parent': parent, 'members': n}
    age = d['Нас']
    row.update({
        'suppressed': int(n < MIN_GROUP),
        'male': int((d['Хүйс'] == 'Эрэгтэй').sum()), 'female': int((d['Хүйс'] == 'Эмэгтэй').sum()),
        **{key: int(age.between(lo if lo is not None else 1, hi if hi is not None else 200).sum()) for key, lo, hi in AGE_BINS},
        'age_unknown': int(((age <= 0) | age.isna()).sum()),  # 0 ба сөрөг нас = бүртгэлийн алдаа
        'mv_new': 0, 'mv_base': 0, 'mv_moved': 0, 'mv_other': 0,
        'anket_avg': round(float(d['Анкет %'].mean() * 100), 1), 'anket_full': int((d['Анкет %'] >= 1).sum()),
    })
    for v, c in d['Хөдөлгөөн'].map(lambda m: MOVES.get(m, 'mv_other')).value_counts().items():
        row[v] = int(c)
    return row


rows = [breakdown('Улаанбаатар', 'city', '', g)]
rows += [breakdown(dn, 'district', 'Улаанбаатар', d) for dn, d in g.groupby('district')]
rows += [breakdown(code, 'khoroo', d.district.iloc[0], d) for code, d in g.groupby('code')]
scope = pd.DataFrame(rows)

# Хоёрдогч нуулт: эцэг хүрээ бүрийн дотор нуусан хүүхдүүдийн нийлбэр 1..MIN_GROUP-1 бол
# хамгийн цөөн гишүүнтэй нээлттэй хүүхдийг нэмж нууна.
for parent, idx in scope[scope.level != 'city'].groupby('parent').groups.items():
    kids = scope.loc[idx]
    hidden = int(kids.loc[kids.suppressed == 1, 'members'].sum())
    open_kids = kids[kids.suppressed == 0].sort_values('members')
    for i in open_kids.index:
        if hidden == 0 or hidden >= MIN_GROUP:
            break
        scope.loc[i, 'suppressed'] = 1
        hidden += int(scope.loc[i, 'members'])
detail = ['male', 'female', *[b[0] for b in AGE_BINS], 'age_unknown', 'mv_new', 'mv_base', 'mv_moved', 'mv_other', 'anket_avg', 'anket_full']
scope.loc[scope.suppressed == 1, detail] = None
cols = ['scope', 'level', 'parent', 'members', 'suppressed', *detail]
scope = scope.reindex(columns=cols)
for c in cols[3:]:
    if c != 'anket_avg':
        scope[c] = scope[c].astype('Int64')
scope.to_csv(OUT / 'members_scope.csv', index=False, encoding='utf-8')

new = g[g['Хөдөлгөөн'] == 'Шинэ']['Хөдөлгөөн.1'].dropna().dt.to_period('M')
months = pd.period_range(new.min(), new.max(), freq='M')
monthly = pd.DataFrame({'month': months.astype(str), 'new_members': new.value_counts().reindex(months, fill_value=0).values})
monthly.to_csv(OUT / 'members_monthly.csv', index=False, encoding='utf-8')

# 3. Хяналт
assert out.members.sum() == len(g)
assert int(scope.loc[scope.level == 'district', 'members'].sum()) == len(g)
assert int(scope.loc[scope.level == 'khoroo', 'members'].sum()) == len(g)
parent_hidden = dict(zip(scope.scope, scope.suppressed))
for parent, kids in scope[scope.level != 'city'].groupby('parent'):
    if parent_hidden.get(parent) == 1:
        continue  # эцэг хүрээ нуугдсан тул ялгаврын эрсдэлгүй
    hid = int(kids.loc[kids.suppressed == 1, 'members'].sum())
    assert hid == 0 or hid >= MIN_GROUP, f'{parent}: нуусан нийлбэр {hid}'
city = scope.iloc[0]
assert city.male + city.female == len(g)
assert sum(int(city[b[0]]) for b in AGE_BINS) + int(city.age_unknown) == len(g)
assert int(city.mv_new + city.mv_base + city.mv_moved + city.mv_other) == len(g)
print(f'Хороо: {len(out)}, хүн ам: {out["pop"].sum():,}, 18–25: {out.age18_25.sum():,}, 18+: {out.vote18.sum():,}, өрх: {out.hh.sum():,}, гишүүд: {len(g)} '
      f'({(out.members > 0).sum()} хороонд), шинэ гишүүний сар: {len(monthly)}')
lv = scope.groupby('level').agg(n=('scope', 'size'), shown=('suppressed', lambda x: int((x == 0).sum())))
print(lv.to_string())
print(scope[scope.level != 'khoroo'][['scope', 'members', 'suppressed', 'male', 'female', 'mv_new']].to_string(index=False))
