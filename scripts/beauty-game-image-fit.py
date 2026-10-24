# Measures the white margin around each game product photo and stores a zoom on the product/option:
# fit = [centre x %, centre y %, scale], so the card can enlarge a small product to fill its box.
# Run after scripts/beauty-game-full-catalog.mjs (which rewrites catalog-full.json without fits).
# Usage: python scripts/beauty-game-image-fit.py   (needs Pillow; downloads the public product images)
import io, json, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageChops

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
WEB = os.path.join(ROOT, 'web', 'beauty-play')
FILL = 0.9      # the product's longer side fills this share of the box
MAX_SCALE = 3.6

def fit_for(data):
    im = Image.open(io.BytesIO(data)).convert('RGB')
    w, h = im.size
    if not 0.95 <= w / h <= 1.05: return None   # zoom maths assumes a square photo in a square box
    mask = ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).convert('L').point(lambda v: 255 if v > 18 else 0)
    box = mask.getbbox()
    if not box: return None
    size = max((box[2] - box[0]) / w, (box[3] - box[1]) / h)
    scale = min(FILL / size, MAX_SCALE)
    if scale < 1.08: return None
    return [round((box[0] + box[2]) / 2 / w * 100), round((box[1] + box[3]) / 2 / h * 100), round(scale, 2)]

def load(src):
    try:
        if src.startswith('http'):
            req = urllib.request.Request(src, headers={'User-Agent': 'Mozilla/5.0'})
            return src, fit_for(urllib.request.urlopen(req, timeout=30).read())
        path = os.path.join(ROOT, 'dist', src.lstrip('/'))
        return src, fit_for(open(path, 'rb').read()) if os.path.exists(path) else None
    except Exception as error:
        print('skip', src, error, file=sys.stderr)
        return src, None

files = {'catalog-full.json': None, 'scenario-products.json': None, 'product-data.json': 'products'}
docs = {name: json.load(open(os.path.join(WEB, name), encoding='utf8')) for name in files}
items = [p for name, key in files.items() for p in (docs[name][key] if key else docs[name])]
sources = {s for p in items for s in [p.get('image'), *[o.get('image') for o in p.get('options', [])]] if s}
with ThreadPoolExecutor(24) as pool: fits = dict(pool.map(load, sorted(sources)))
for p in items:
    for entry in [p, *p.get('options', [])]:
        entry.pop('fit', None)
        if fits.get(entry.get('image')): entry['fit'] = fits[entry['image']]
for name, key in files.items():
    text = json.dumps(docs[name], ensure_ascii=False, separators=(',', ':')) + '\n' if name == 'catalog-full.json' else json.dumps(docs[name], ensure_ascii=False, indent=2) + '\n'
    open(os.path.join(WEB, name), 'w', encoding='utf8', newline='\n').write(text)
print(len(sources), 'images,', sum(1 for v in fits.values() if v), 'zoomed')
