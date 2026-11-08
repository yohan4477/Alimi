"""Export the two youtube reference sites for the /admin 「레퍼런스」 tab.

Reads (never writes) the youtube research folders and writes
  server/reference-gallery.html, server/reference-musk.html, server/reference-media/*.mp4
and server/reference-manifest.json (video name -> Supabase Storage path + local source).
Videos live in the private Storage bucket `reference-media` (upload: scripts/upload-reference-media.mjs) and are
fetched through /api/admin?view=ref-media&f=<name> (admin only -> short-lived signed URL), because the original
pages embed them as base64 and exceed the 4.5MB Vercel response limit.

usage: python scripts/export-reference.py [YOUTUBE_RESEARCH_DIR]
"""
import json, pathlib, re, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\y\youtube\research')
GAL = RES / '2026-11-08_claude-video-presentation'
DEMO = RES / '2026-11-08_ceo-interview-demo' / 'site'
OUT = ROOT / 'server'
URL = '/api/admin?view=ref-media&f='
LIMIT = 4_500_000

MANIFEST = {}


def add(name, source):
    """Register a video: flat served name -> bucket path + source file (relative to RES)."""
    assert source.exists(), source
    MANIFEST[name] = {'path': ('musk/' if name.startswith('musk-') else 'gallery/') + name, 'source': source.relative_to(RES).as_posix()}


def must_sub(pattern, repl, text, flags=re.S):
    new, n = re.subn(pattern, lambda m: repl, text, count=1, flags=flags)
    assert n == 1, 'pattern not found: ' + pattern[:60]
    return new


def wrap(page):
    if '<!doctype' in page[:100].lower():
        return page
    return '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' + page + '\n</html>\n'


# ---------- 1. comparison gallery ----------
g = (GAL / 'effects_gallery.html').read_text(encoding='utf8')
sd_keys = []
for m in re.finditer(r'<script type="application/json" id="sd-\w+">(.*?)</script>\n?', g, re.S):
    sd_keys += list(json.loads(m.group(1)).keys())
g = re.sub(r'<script type="application/json" id="sd-\w+">.*?</script>\n?', '', g, flags=re.S)
fname = lambda key: re.sub(r'[^A-Za-z0-9_.-]', '_', key) + '.mp4'
for k in sd_keys:
    add(fname(k), GAL / 'inline_sd' / fname(k))
ref = lambda key: URL + fname(key)

# ASSET (clip key -> HQ /_blob url) -> low-quality copy served by ref-media
m = re.search(r'const ASSET = (\{.*?\});\n', g, re.S)
asset = json.loads(m.group(1))
assert all(k in sd_keys for k in asset), 'asset without copy'
g = g.replace(m.group(0), 'const ASSET = ' + json.dumps({k: ref(k) for k in asset}, ensure_ascii=False) + ';\n')
# SDIDX is no longer used (no embedded base64); other /_blob ids are the v2 video keys
g = must_sub(r'const SDIDX = \{.*?\};\n', 'let sdUsed = 0;\n', g)
g = re.sub(r'/_blob/[0-9a-f]{32}', lambda mm: ref(mm.group(0)), g)
# video loader: drop NEEDBLOB/SD base64 machinery; fetch -> Blob -> object URL (iOS Safari friendly)
loader = '''const blobCache = {};
function viaBlob(u){ return blobCache[u] || (blobCache[u] = fetch(u, {credentials: "same-origin"}).then(r => { if(!r.ok) throw new Error(r.status); return r.json(); }).then(j => fetch(j.url)).then(r => { if(!r.ok) throw new Error(r.status); return r.blob(); }).then(b => { if(b.size < 1000 || /html|json|text/.test(b.type)) throw new Error("not video"); return URL.createObjectURL(new Blob([b], {type: "video/mp4"})); }).catch(e => { delete blobCache[u]; throw e; })); }
function setVid(v, u){
  if(v._want === u && v._p) return v._p;
  v._want = u;
  v._p = viaBlob(u).then(b => { if(v._want === u) v.src = b; }).catch(() => {});
  return v._p;
}
'''
g = must_sub(r'const NEEDBLOB = .*?(?=function loadClip)', loader, g)
# connection diagnostics probed /_blob; not applicable here
g = must_sub(r'/\* 연결 상태 한 줄.*?\}\)\(\);\n(?=document\.addEventListener\("click")', '', g)
for bad in ('/_blob/', 'NEEDBLOB', 'SDIDX', '__diagSD', 'id="sd-'):
    assert bad not in g, bad
(OUT / 'reference-gallery.html').write_bytes(wrap(g).encode('utf8'))

# ---------- 2. musk interview demo ----------
d = (DEMO / 'effects_demo.html').read_text(encoding='utf8')
mm = re.search(r'<script type="application/json" id="media">(.*?)</script>\n?', d, re.S)
keys = list(json.loads(mm.group(1)).keys())
d = d.replace(mm.group(0), '')
mfile = {}
# map data-k -> source file using build_site's own naming
site_src = (DEMO / 'build_site.py').read_text(encoding='utf8')
ids = dict(re.findall(r"dict\(k='(\w+)', ids=\['([\w-]+)'", site_src))
for k in keys:
    if k == 'full':
        src, name = DEMO / 'clips' / '00_full.mp4', 'musk-00_full.mp4'
    elif k.startswith('d_'):
        src, name = DEMO / 'clips' / (k[2:] + '.mp4'), 'musk-' + k[2:] + '.mp4'
    else:
        rid = ids[k[2:]]
        src = GAL / 'inline_sd' / f'clips_{rid}.mp4.mp4'
        name = fname('clips/' + rid + '.mp4')  # shared with the gallery copy when present
    add(name, src)
    mfile[k] = name
d = must_sub(r'const M = JSON\.parse\(document\.getElementById\("media"\)\.textContent\);', 'const M = ' + json.dumps({k: URL + v for k, v in mfile.items()}) + ';', d)
d = must_sub(r'function url\(k\)\{.*?\}\n', '''function url(k){ return cache[k] || (cache[k] = fetch(M[k], {credentials: "same-origin"}).then(r => { if(!r.ok) throw new Error(r.status); return r.json(); }).then(j => fetch(j.url)).then(r => { if(!r.ok) throw new Error(r.status); return r.blob(); }).then(b => URL.createObjectURL(new Blob([b], {type: "video/mp4"})))); }\n''', d)
d = must_sub(r'if\(en\.isIntersecting\)\{.*?\} else v\.pause\(\);', 'if(en.isIntersecting){ if(!v._p) v._p = url(v.dataset.k).then(u => { v.src = u; }).catch(() => { v._p = null; }); Promise.resolve(v._p).then(() => { if(!RM && v._on !== false) v.play().catch(() => {}); }); } else v.pause();', d)
assert 'atob(' not in d and 'id="media"' not in d
(OUT / 'reference-musk.html').write_bytes(wrap(d).encode('utf8'))

# ---------- report ----------
for n in ('reference-gallery.html', 'reference-musk.html'):
    sz = (OUT / n).stat().st_size
    print(n, sz, 'OK' if sz < LIMIT else 'TOO BIG')
    assert sz < LIMIT
(OUT / 'reference-manifest.json').write_text(json.dumps(MANIFEST, indent=1, sort_keys=True), encoding='utf8')
total = sum((RES / v['source']).stat().st_size for v in MANIFEST.values())
print('videos', len(MANIFEST), 'total bytes', total)
