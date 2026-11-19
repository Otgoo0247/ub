"""Гишүүдийн нэрсийн жагсаалтыг шифрлэж, Vercel-ийн хамгаалагдсан API-д бэлтгэнэ.

Хэрэглээ (tools/ хавтаснаас):
    pip install -r requirements-data.txt
    python build_members_secure.py --excel 2026.11.19_Negtgel.xlsx

Анх ажиллуулахад tools/members.key (256 бит санамсаргүй түлхүүр) үүснэ. Түлхүүрийг Vercel-ийн
Environment Variables-д MEMBERS_KEY нэрээр хадгална. Түлхүүрийг GitHub-д ХЭЗЭЭ Ч бүү оруул
(.gitignore хаасан). Дараагийн удаа ижил түлхүүрээр шифрлэгдэнэ; --rotate-key шинэ түлхүүр үүсгэнэ.

Гаралт: ../private/members.enc — AES-256-GCM шифртэй, gzip шахсан JSON:
    {"generated": "...", "khoroo": {"BGD_01": [{"n": нэр, "g": хүйс, "a": нас, "m": хөдөлгөөн,
     "d": хөдөлгөөний огноо, "u": үүр, "k": анкет %, "s": төлөв, "i": урилгын код}, ...]},
     "meta": {"BGD_01": {"district": "Баянгол", "no": 1, "name": "1-р хороо"}}}
Регистр, утас, MEMBER_ID, зураг гаралтад ОРОХГҮЙ. Утасны дугаарын оронд "ph" = HMAC(түлхүүр, 8 оронтой дугаар) —
гишүүн «Гишүүнээр нэвтрэх» хэсэгт урилгын код + утсаараа нэвтрэхэд тулгахад л хэрэглэнэ; дугаарыг сэргээх боломжгүй.

Урилгын код: гишүүн бүрт тогтмол 10 тэмдэгтийн код (жишээ нь 7KQ2M-X9D4P) = HMAC-SHA256(members.key-ээс гаргасан
түлхүүр, MEMBER_ID)-ийн эхний 50 бит, Crockford base32. Excel-ээ шинэчилсэн ч код өөрчлөгдөхгүй; MEMBER_ID-г кодоос
сэргээх боломжгүй. АНХААР: --rotate-key хийвэл бүх урилгын код (тараасан холбоос) шинэчлэгдэж, хуучин нь ажиллахгүй.
"""
import argparse, datetime as dt, gzip, hashlib, hmac, json, os, secrets
from pathlib import Path
import pandas as pd
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

HERE = Path(__file__).resolve().parent
MAGIC = b'UBM1'
FIELDS = ['Бүтэн нэр', 'Нас', 'Хүйс', 'Төлөв', 'Хөдөлгөөн', 'Хөдөлгөөн.1', 'Аймаг/нийслэл', 'Сум/дүүрэг', 'Хороо', 'Үүр', 'Анкет %',
          'MEMBER_ID', 'Утас']  # MEMBER_ID, Утас — зөвхөн код, hash гаргахад; гаралтад орохгүй
CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument('--excel', required=True)
ap.add_argument('--base', default=str(HERE / 'khoroo_base.csv'))
ap.add_argument('--key-file', default=str(HERE / 'members.key'))
ap.add_argument('--out', default=str(HERE.parent / 'private' / 'members.enc'))
ap.add_argument('--rotate-key', action='store_true', help='Шинэ түлхүүр үүсгэнэ (хуучин түлхүүр ажиллахгүй болно)')
args = ap.parse_args()

key_path = Path(args.key_file)
if args.rotate_key or not key_path.exists():
    key_path.write_text(secrets.token_hex(32) + '\n')
    os.chmod(key_path, 0o600)
    print(f'Шинэ түлхүүр үүсгэлээ: {key_path}  →  Vercel дээр MEMBERS_KEY-д хуулна.')
key = bytes.fromhex(key_path.read_text().strip())
assert len(key) == 32, 'Түлхүүр 64 тэмдэгт hex байх ёстой'
inv_key = hmac.new(key, b'ubdash-invite-key-v1', hashlib.sha256).digest()
ph_key = hmac.new(key, b'ubdash-member-phone-v1', hashlib.sha256).digest()


def phone_hash(raw):
    if pd.isna(raw): return None
    d = ''.join(ch for ch in str(raw).split('.')[0] if ch.isdigit())
    if d.startswith('976') and len(d) == 11: d = d[3:]
    if len(d) != 8 or d[0] not in '56789': return None
    return hmac.new(ph_key, d.encode(), hashlib.sha256).hexdigest()[:32]


def invite_code(member_id):
    mid = str(member_id).strip()
    if mid.endswith('.0'): mid = mid[:-2]
    n = int.from_bytes(hmac.new(inv_key, f'invite-v1|{mid}'.encode(), hashlib.sha256).digest()[:8], 'big') >> 14  # 50 бит
    c = ''.join(CROCKFORD[(n >> (5 * i)) & 31] for i in range(9, -1, -1))
    return f'{c[:5]}-{c[5:]}'

sheet = next(s for s in pd.ExcelFile(args.excel).sheet_names if 'гишүүн' in s.lower())
g = pd.read_excel(args.excel, sheet_name=sheet, header=1, usecols=FIELDS)
g = g[g['Аймаг/нийслэл'].eq('Улаанбаатар')].copy()
g['district'] = g['Сум/дүүрэг'].str.strip()
g['khoroo_no'] = g['Хороо'].str.extract(r'^(\d+)')[0].astype(int)
base = pd.read_csv(args.base)
g = g.merge(base[['district', 'khoroo_no', 'code']], on=['district', 'khoroo_no'], how='left')
assert g.code.notna().all(), f'{int(g.code.isna().sum())} гишүүний хороо олдсонгүй'


def person(r):
    age = int(r['Нас']) if pd.notna(r['Нас']) and r['Нас'] > 0 else None  # 0, сөрөг = бүртгэлийн алдаа
    when = r['Хөдөлгөөн.1']
    return {
        'n': ' '.join(str(r['Бүтэн нэр']).split()), 'g': r['Хүйс'], 'a': age, 'm': r['Хөдөлгөөн'],
        'd': when.strftime('%Y-%m-%d') if pd.notna(when) else None, 'u': r['Үүр'],
        'k': round(float(r['Анкет %']) * 100) if pd.notna(r['Анкет %']) else None,
        's': r['Төлөв'] if pd.notna(r['Төлөв']) else None, 'i': invite_code(r['MEMBER_ID']),
        'ph': phone_hash(r['Утас']),
    }


by = {}
for code, d in g.sort_values(['code', 'Бүтэн нэр']).groupby('code'):
    by[code] = [person(r) for _, r in d.iterrows()]
meta = {r.code: {'district': r.district, 'no': int(r.khoroo_no), 'name': r.khoroo} for r in base.itertuples() if r.code in by}
payload = {'generated': dt.date.today().isoformat(), 'source': Path(args.excel).name, 'khoroo': by, 'meta': meta}
raw = gzip.compress(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), mtime=0)
iv = secrets.token_bytes(12)
ct = AESGCM(key).encrypt(iv, raw, MAGIC)          # ct = шифр + 16 байт tag
out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(MAGIC + iv + ct)

# Хяналт: буцааж тайлж тоолно
back = json.loads(gzip.decompress(AESGCM(key).decrypt(out.read_bytes()[4:16], out.read_bytes()[16:], MAGIC)))
assert sum(len(v) for v in back['khoroo'].values()) == len(g)
codes = [m['i'] for v in back['khoroo'].values() for m in v]
assert len(set(codes)) == len(codes), 'Урилгын код давхардлаа'
print(f"Нэвтрэх боломжтой (утас бүртгэлтэй): {sum(1 for v in back['khoroo'].values() for m in v if m.get('ph'))}/{len(codes)}")
print(f'Шифрлэлээ: {out} ({out.stat().st_size:,} байт), {len(g)} гишүүн, {len(by)} хороо.')
