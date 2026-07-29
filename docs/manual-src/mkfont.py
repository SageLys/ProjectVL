import os, glob, io
from fontTools import subset
from fontTools.ttLib import TTFont, newTable
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen

# 1. 收集字符集
HERE = os.path.dirname(os.path.abspath(__file__))
chars = set()
for p in glob.glob(os.path.join(HERE, '*.py')) + glob.glob(os.path.join(HERE, '*.json')):
    chars |= set(io.open(p, encoding='utf-8').read())
chars |= set('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
             ' .,;:!?()[]{}<>/\\|-_=+*&%$#@~^`\'"，。、；：！？（）【】《》「」…—·×÷≤≥±∞→←↑↓①②③④⑤⑥⑦⑧⑨⑩■●▲★☆✓✗')
text = ''.join(sorted(chars))
print('unique chars:', len(chars))

def build(src_path, font_number, out_ttf):
    f = TTFont(src_path, fontNumber=font_number)
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']; opts.notdef_outline = True; opts.recalc_bounds = True
    opts.drop_tables += ['BASE','JSTF','DSIG','EBDT','EBLC','EBSC','SVG ','PCLT','LTSH','hdmx','VDMX']
    s = subset.Subsetter(options=opts)
    s.populate(text=text)
    s.subset(f)
    # ReportLab 不支持 CFF；仅在 Noto CJK 等 CFF 字体上转换。Windows 的微软雅黑本身是 glyf。
    if 'CFF ' in f or 'CFF2' in f:
        gs = f.getGlyphSet(); upm = f['head'].unitsPerEm; tol = upm/1000.0
        glyf = newTable('glyf'); glyf.glyphOrder = f.getGlyphOrder(); glyf.glyphs = {}
        for name in glyf.glyphOrder:
            pen = TTGlyphPen(gs)
            gs[name].draw(Cu2QuPen(pen, tol, reverse_direction=True))
            glyf[name] = pen.glyph()
        f['glyf'] = glyf
        f['loca'] = newTable('loca')
        mx = newTable('maxp'); mx.tableVersion = 0x00010000
        for k,v in dict(maxZones=1,maxTwilightPoints=0,maxStorage=0,maxFunctionDefs=0,
                        maxInstructionDefs=0,maxStackElements=0,maxSizeOfInstructions=0,
                        maxComponentElements=0,maxComponentDepth=0).items(): setattr(mx,k,v)
        f['maxp'] = mx
        f['head'].indexToLocFormat = 0
        f.sfntVersion = '\x00\x01\x00\x00'
        for t in ('CFF ','CFF2','VORG'):
            if t in f: del f[t]
        f['post'].formatType = 2.0
        f['post'].extraNames = []; f['post'].mapping = {}; f['post'].glyphOrder = glyf.glyphOrder
    f.save(out_ttf)
    print('->', out_ttf, len(f.getGlyphOrder()), 'glyphs')

OUT = '/tmp/fonts'
os.makedirs(OUT, exist_ok=True)
if os.path.exists(r'C:\Windows\Fonts\msyh.ttc'):
    R = r'C:\Windows\Fonts\msyh.ttc'
    B = r'C:\Windows\Fonts\msyhbd.ttc'
    REGULAR_INDEX = BOLD_INDEX = 0
    MONO_INDEX = 1
else:
    R = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
    B = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
    REGULAR_INDEX = BOLD_INDEX = 2
    MONO_INDEX = 7
build(R, REGULAR_INDEX, os.path.join(OUT, 'CJK-R.ttf'))
build(B, BOLD_INDEX, os.path.join(OUT, 'CJK-B.ttf'))
build(R, MONO_INDEX, os.path.join(OUT, 'CJKMono-R.ttf'))
