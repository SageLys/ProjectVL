# -*- coding: utf-8 -*-
"""生成《ProjectVL 触发器与效果原子说明手册》A4 PDF。

数据来源：
  contract.json  —— 由 TS 源码（ATOM_CONTRACT / AFFIX_SINKS / labels）编译后 dump，未经手抄
  atomIndex.json —— 扫描 skills.json 得到的「原子/触发器 → 卡牌用例」索引
  content_*.py   —— 人工撰写的机制解读与注意事项
"""
import json
import os
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, CondPageBreak, Flowable, Frame, KeepTogether, NextPageTemplate,
    PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

from content_atoms import ATOMS as ATOM_TEXT
from content_triggers import TRIGGERS as TRIGGER_TEXT

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("OUT_PDF", os.path.join(HERE, "manual.pdf"))
DATE = "2026-07-29"

# ---------------------------------------------------------------- 字体
# Noto Sans CJK 是 CFF 轮廓，reportlab 不支持；mkfont.py 先子集化再转 glyf。
FD = "/tmp/fonts"
pdfmetrics.registerFont(TTFont("CJK", FD + "/CJK-R.ttf"))
pdfmetrics.registerFont(TTFont("CJK-B", FD + "/CJK-B.ttf"))
pdfmetrics.registerFont(TTFont("Mono", FD + "/CJKMono-R.ttf"))
pdfmetrics.registerFontFamily("CJK", normal="CJK", bold="CJK-B", italic="CJK", boldItalic="CJK-B")
pdfmetrics.registerFontFamily("Mono", normal="Mono", bold="Mono", italic="Mono", boldItalic="Mono")

# ---------------------------------------------------------------- 配色
INK = colors.HexColor("#1A1A1A")
GREY = colors.HexColor("#5B6472")
LINE = colors.HexColor("#D4D9E0")
CODE_C = colors.HexColor("#0B5C74")
CAT = {
    "projectile": colors.HexColor("#B45309"),
    "control": colors.HexColor("#1D4ED8"),
    "domain": colors.HexColor("#7C3AED"),
    "economy": colors.HexColor("#047857"),
    "defense": colors.HexColor("#BE123C"),
    "shared": colors.HexColor("#475569"),
}
CAT_CN = {
    "projectile": "弹道", "control": "控制", "domain": "领域",
    "economy": "经济", "defense": "防御", "shared": "共用",
}
TRIG_C = colors.HexColor("#0F766E")
PLAIN_BG = colors.HexColor("#F1F7F4")
PLAIN_BAR = colors.HexColor("#3F9D7B")
CODE_BG = colors.HexColor("#F4F6FA")
CODE_BAR = colors.HexColor("#3F6BA8")
WARN_BG = colors.HexColor("#FDF4F0")
WARN_BAR = colors.HexColor("#C2622F")

# ---------------------------------------------------------------- 文本处理
_CJK = re.compile(r"[⺀-鿿　-〿＀-￯]")


def _amp(s):
    """转义裸 &，保留已有实体。"""
    return re.sub(r"&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-fA-F]+);)", "&amp;", s)


def rt(s):
    """把 content_*.py 里的 <font face="mono"> 换成真正可渲染的样式。
    纯 ASCII 片段用等宽字体，含中文的片段退回 CJK 字体 + 强调色（避免豆腐块）。"""
    s = _amp(s)

    return re.sub(r'<font face="mono">(.*?)</font>',
                  lambda m: '<font face="Mono" size="8.5" color="#0B5C74">%s</font>' % m.group(1),
                  s, flags=re.S)


def code(s):
    """独立的代码片段（表格单元用）。"""
    return '<font face="Mono" size="7.9" color="#0B5C74">%s</font>' % _amp(str(s))


# ---------------------------------------------------------------- 样式
def S(name, **kw):
    base = dict(name=name, fontName="CJK", fontSize=9.4, leading=14.6,
                textColor=INK, alignment=TA_LEFT, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(**base)


ST = {
    "title": S("title", fontName="CJK-B", fontSize=27, leading=36, textColor=colors.HexColor("#12303F")),
    "subtitle": S("subtitle", fontSize=12.5, leading=20, textColor=GREY),
    "cover_meta": S("cover_meta", fontSize=9.2, leading=16, textColor=GREY),
    "h1": S("h1", fontName="CJK-B", fontSize=19, leading=27, textColor=colors.HexColor("#12303F")),
    "h2": S("h2", fontName="CJK-B", fontSize=13.5, leading=20, textColor=colors.HexColor("#12303F")),
    "h3": S("h3", fontName="CJK-B", fontSize=10.6, leading=16, textColor=colors.HexColor("#24313D")),
    "body": S("body"),
    "small": S("small", fontSize=8.4, leading=12.8, textColor=GREY),
    "cell": S("cell", fontSize=8.2, leading=11.6),
    "cellc": S("cellc", fontSize=8.2, leading=11.6, textColor=GREY),
    "th": S("th", fontName="CJK-B", fontSize=8.3, leading=12, textColor=colors.white),
    "plain": S("plain", fontSize=9.8, leading=15.8),
    "bullet": S("bullet", fontSize=9.1, leading=13.8, leftIndent=13, firstLineIndent=-13),
    "note": S("note", fontSize=8.6, leading=13.4, textColor=GREY),
    "toc0": S("toc0", fontName="CJK-B", fontSize=10.4, leading=18, spaceBefore=5),
    "toc1": S("toc1", fontSize=9, leading=14.6, leftIndent=13),
}

PAGE_W, PAGE_H = A4
ML = MR = 18 * mm
MT = 20 * mm
MB = 16 * mm
CW = PAGE_W - ML - MR  # 174mm 可用宽度

SECTION = {"name": ""}


class Sec(Flowable):
    """零高度标记：绘制时切换页眉的章节名（配合 onPageEnd，本页即生效）。"""

    def __init__(self, name):
        Flowable.__init__(self)
        self.name = name
        self.width = 0
        self.height = 0

    def wrap(self, aw, ah):
        return (0, 0)

    def draw(self):
        SECTION["name"] = self.name


# ---------------------------------------------------------------- 页眉页脚
def _chrome(canv, doc, cover=False):
    canv.saveState()
    if not cover:
        canv.setFont("CJK", 7.6)
        canv.setFillColor(GREY)
        canv.drawString(ML, PAGE_H - MT + 8 * mm, SECTION["name"])
        canv.drawRightString(PAGE_W - MR, PAGE_H - MT + 8 * mm, "ProjectVL · 触发器与效果原子说明手册")
        canv.setStrokeColor(LINE)
        canv.setLineWidth(0.5)
        canv.line(ML, PAGE_H - MT + 6 * mm, PAGE_W - MR, PAGE_H - MT + 6 * mm)
        canv.line(ML, MB - 5 * mm, PAGE_W - MR, MB - 5 * mm)
        canv.setFont("CJK", 7.6)
        canv.drawString(ML, MB - 9.5 * mm, DATE + " 生成 · 唯一权威为代码，本文档为解读")
        canv.setFont("CJK-B", 8.6)
        canv.setFillColor(colors.HexColor("#12303F"))
        canv.drawRightString(PAGE_W - MR, MB - 9.8 * mm, str(canv.getPageNumber()))
    canv.restoreState()


def on_page(canv, doc):
    _chrome(canv, doc)


def on_cover(canv, doc):
    canv.saveState()
    canv.setFillColor(colors.HexColor("#12303F"))
    canv.rect(0, PAGE_H - 14 * mm, PAGE_W, 14 * mm, stroke=0, fill=1)
    canv.setFillColor(colors.HexColor("#3F9D7B"))
    canv.rect(0, PAGE_H - 16 * mm, PAGE_W, 2 * mm, stroke=0, fill=1)
    canv.restoreState()


# ---------------------------------------------------------------- 组件
def callout(kind, title, flow_items):
    """带左侧色条与浅底的块。"""
    bg, bar = {"plain": (PLAIN_BG, PLAIN_BAR), "code": (CODE_BG, CODE_BAR),
               "warn": (WARN_BG, WARN_BAR)}[kind]
    head = Paragraph('<font color="%s"><b>%s</b></font>' % (bar.hexval().replace('0x', '#'), title), ST["h3"])
    inner = Table([[head]] + [[f] for f in flow_items], colWidths=[CW - 9])
    inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 2.0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.0),
        ("TOPPADDING", (0, 0), (0, 0), 6),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    outer = Table([["", inner]], colWidths=[3, CW - 3])
    outer.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), bar),
        ("BACKGROUND", (1, 0), (1, 0), bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return outer


def bullets(items, style="bullet"):
    return [Paragraph("• " + rt(x), ST[style]) for x in items]


def data_table(header, rows, widths, align_head_bg=colors.HexColor("#35485C")):
    data = [[Paragraph(h, ST["th"]) for h in header]] + rows
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), align_head_bg),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 4.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4.5),
        ("TOPPADDING", (0, 0), (-1, -1), 2.7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.7),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F7F9FB")))
    t.setStyle(TableStyle(style))
    return t


def chip_row(pairs):
    """一行标签：[(label, value), ...]"""
    cells = []
    for k, v in pairs:
        cells.append(Paragraph(
            '<font color="#6B7480" size="7.6">%s</font><br/>%s' % (k, v), ST["cell"]))
    w = CW / len(cells)
    t = Table([cells], colWidths=[w] * len(cells))
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FAFBFC")),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


class Head(Paragraph):
    """会向 TOC 汇报的标题。"""

    def __init__(self, text, style, level, key, toc_text=None):
        Paragraph.__init__(self, text, style)
        self.lvl = level
        self.key = key
        self.toc = toc_text or re.sub(r"<[^>]+>", "", text)


def section_title(text, level, key, color, sub=""):
    bar = Table([[""]], colWidths=[CW], rowHeights=[2.6])
    bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), color),
                             ("LEFTPADDING", (0, 0), (-1, -1), 0),
                             ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    out = [bar, Spacer(1, 5), Head(text, ST["h1"] if level == 0 else ST["h2"], level, key)]
    if sub:
        out += [Spacer(1, 2), Paragraph(rt(sub), ST["note"])]
    out.append(Spacer(1, 9))
    return out


# ---------------------------------------------------------------- 数据
with open(os.path.join(HERE, "contract.json"), encoding="utf-8") as f:
    C = json.load(f)
with open(os.path.join(HERE, "atomIndex.json"), encoding="utf-8") as f:
    IDX = json.load(f)

ATOMS = C["atoms"]
LABELS = C["labels"]
TRIG_LABELS = C["triggerLabels"]
SINKS = C["affixSinks"]

TYPE_CN = {"number": "数值", "integer": "整数", "string": "文本", "boolean": "布尔",
           "enum": "枚举", "effects": "嵌套效果", "record": "权重表"}

# 原子 → 被哪些词条轴放大
SCALED_BY = {}
for axis, contract in SINKS.items():
    for tgt in contract.get("scalingTargets") or []:
        SCALED_BY.setdefault(tgt["atom"], []).append((axis, tgt))

# 原子 → 卡牌用例（去重、保序）
USES = {}
for atom, lst in IDX["atoms"].items():
    seen, keep = set(), []
    for x in lst:
        if x not in seen:
            seen.add(x)
            keep.append(x)
    USES[atom] = keep
TRIG_USES = {}
for t, lst in IDX["triggers"].items():
    seen, keep = set(), []
    for x in lst:
        if x not in seen:
            seen.add(x)
            keep.append(x)
    TRIG_USES[t] = keep

ORDER = ["projectile", "control", "domain", "economy", "defense", "shared"]
BY_CAT = {k: [] for k in ORDER}
for name, spec in ATOMS.items():
    BY_CAT[spec["category"]].append(name)


def fmt_default(spec):
    parts = []
    if "default" in spec:
        v = spec["default"]
        if isinstance(v, dict):
            v = json.dumps(v, ensure_ascii=False)
        elif isinstance(v, bool):
            v = "true" if v else "false"
        elif v == "":
            v = "（空串）"
        parts.append(code(v))
    else:
        parts.append('<font color="#9AA3AE">未声明</font>')
    if "consumeDefault" in spec:
        parts.append('<font size="7.4" color="#6B7480">消耗态 </font>' + code(spec["consumeDefault"]))
    if "passiveDefault" in spec:
        parts.append('<font size="7.4" color="#6B7480">passive </font>' + code(spec["passiveDefault"]))
    if "variantDefaults" in spec:
        vd = spec["variantDefaults"]
        for k, v in vd["cases"].items():
            parts.append('<font size="7.4" color="#6B7480">%s=%s 时 </font>%s' % (vd["on"], k, code(v)))
    return "<br/>".join(parts)


def fmt_range(spec):
    bits = []
    if spec.get("required"):
        bits.append('<font color="#BE123C"><b>必填</b></font>')
    if "min" in spec or "max" in spec:
        lo = spec.get("min", "-∞")
        hi = spec.get("max", "+∞")
        bits.append("%s ~ %s" % (lo, hi))
    if spec.get("enum"):
        bits.append(code(" / ".join(spec["enum"])))
    return "<br/>".join(bits) or '<font color="#9AA3AE">—</font>'


def fmt_type(spec):
    t = spec["type"]
    if isinstance(t, list):
        return " | ".join(TYPE_CN.get(x, x) for x in t)
    return TYPE_CN.get(t, t)


# ---------------------------------------------------------------- 正文
story = []


def h_section(text, key, color, sub=""):
    story.append(Sec(re.sub(r"<[^>]+>", "", text)))
    story.extend(section_title(text, 0, key, color, sub))


# ============ 封面 ============
story += [
    Spacer(1, 42 * mm),
    Paragraph("触发器与效果原子", ST["title"]),
    Paragraph("说 明 手 册", ST["title"]),
    Spacer(1, 6),
    Paragraph("ProjectVL 技能系统 · 面向程序员与设计者的双视角参考", ST["subtitle"]),
    Spacer(1, 14 * mm),
]
_cov = Table([[""]], colWidths=[38 * mm], rowHeights=[3])
_cov.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#3F9D7B"))]))
story += [_cov, Spacer(1, 10 * mm)]
story += [Paragraph(x, ST["cover_meta"]) for x in [
    "版本　　skills-schema v0.5.0　·　9 个触发器　·　34 个效果原子",
    "生成日期　%s" % DATE,
    "唯一权威　<font color='#0B5C74'>src/core/effects/atomContract.ts</font>（参数契约）、"
    "<font color='#0B5C74'>registry.ts</font>（原子实现）、<font color='#0B5C74'>interpreter.ts</font>（触发器总线）",
    "自动提取　参数表、允许触发器、词条缩放靶点、卡牌用例均由脚本从源码与 skills.json 直接读出，未经手抄",
    "人工撰写　「一句话」「代码机制」「叠加与融合」「注意事项」四栏为解读，代码变更后需复核",
]]
story += [Spacer(1, 20 * mm), callout("plain", "这份文档怎么用", [
    Paragraph(rt("每个条目都有两层：<b>浅绿框「一句话」</b>写给设计者，只讲这个东西对玩家意味着什么，"
                 "不含任何代码名词；<b>浅蓝框「代码机制」</b>写给程序员，讲清楚它在哪被调用、"
                 "读哪些字段、按什么顺序结算。<b>浅橙框「注意事项」</b>两边都要看——"
                 "里面是真实存在的失效条件、静默默认值和顺序依赖。"), ST["body"]),
])]
story.append(NextPageTemplate("body"))
story.append(PageBreak())

# ============ 目录 ============
story.append(Sec("目录"))
story += section_title("目录", 0, "toc", colors.HexColor("#12303F"))
toc = TableOfContents()
toc.levelStyles = [ST["toc0"], ST["toc1"]]
toc.dotsMinLevel = 0
story.append(toc)
story.append(PageBreak())

# ============ 第一部分 总览 ============
h_section("第一部分　总览", "p1", colors.HexColor("#12303F"),
          "先看懂整体模型，再查具体条目。")

story += [callout("plain", "一句话模型", [
    Paragraph(rt(
        "一张卡不是一段代码，而是<b>一份数据</b>。数据里写着：「在<b>什么时候</b>（触发器），"
        "做<b>哪几件事</b>（效果原子），每件事<b>多大强度</b>（参数）」。"
        "游戏里有一个通用解释器负责读这份数据并执行，"
        "所以<b>加一张新卡不需要写新代码</b>，只需要写新的数据组合。"), ST["plain"]),
    Spacer(1, 4),
    Paragraph(rt("这也意味着两条硬规矩：① 任何一张卡都不允许在引擎里写 <b>if (这是XX卡)</b>；"
                 "② 想让卡做到某件引擎还做不到的事，要么复用已有原子，要么<b>新增一个通用原子</b>，"
                 "不能开特例。"), ST["body"]),
])]
story.append(Spacer(1, 10))

# 执行链路
story += [Paragraph("执行链路", ST["h2"]), Spacer(1, 5)]
flow_rows = [
    ["①", "装备解析", rt("<b>resolveCardBindings()</b> 按星级与进化路径，把这张卡当前生效的绑定列表算出来"
                     "（3★ 分支 → 4★ 共享强化 → 5★ 分支 → 6★ 共享，逐级累加）")],
    ["②", "词条缩放", rt("<b>applyBuildScalingToBindings()</b> 按遗物/词条的轴，"
                     "就地改写绑定里的具体数值（如 quantityAdd 给 pierce.count +1）")],
    ["③", "触发", rt("各系统在自己的结算点调 <b>fireTrigger(trigger, payload)</b>；"
                   "interval 走 tickIntervalBindings，passive 走 getModifiers")],
    ["④", "过滤", rt("<b>bindingConditionMet()</b> 判 requiresSource / requiresStatus；"
                   "<b>cooldownReady()</b> 判 cooldownSeconds")],
    ["⑤", "概率闸门", rt("<b>runEffects()</b> 对每条效果统一掷 <b>chance</b>（stun 例外，它自己逐目标掷）")],
    ["⑥", "执行", rt("<b>ATOMS[atom](ctx, params)</b>。缺省参数一律回落到 "
                   "<b>ATOM_CONTRACT</b> 的 default / consumeDefault / passiveDefault")],
]
t = Table([[Paragraph('<font color="#3F9D7B"><b>%s</b></font>' % a, ST["h3"]),
            Paragraph("<b>%s</b>" % b, ST["cell"]),
            Paragraph(c_, ST["cell"])] for a, b, c_ in flow_rows],
          colWidths=[10 * mm, 24 * mm, CW - 34 * mm])
t.setStyle(TableStyle([
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ("LEFTPADDING", (0, 0), (0, -1), 2),
]))
story += [t, Spacer(1, 12)]

# 触发器速查
story += [Paragraph("触发器速查表", ST["h2"]), Spacer(1, 5)]
rows = []
for t_ in TRIGGER_TEXT:
    n = t_["name"]
    rows.append([
        Paragraph(code(n) + "<br/><b>%s</b>" % t_["cn"], ST["cell"]),
        Paragraph(TRIG_LABELS[n]["label"], ST["cell"]),
        Paragraph(t_["plain"].split("。")[0] + "。", ST["cellc"]),
        Paragraph(str(len(TRIG_USES.get(n, []))), ST["cell"]),
    ])
story += [data_table(["触发器", "游戏内文案", "什么时候发生", "绑定数"], rows,
                     [30 * mm, 24 * mm, CW - 68 * mm, 14 * mm]), Spacer(1, 12)]

# 原子速查
story += [CondPageBreak(60 * mm), Paragraph("效果原子速查表（34 个）", ST["h2"]), Spacer(1, 5)]
rows = []
for cat in ORDER:
    for name in BY_CAT[cat]:
        spec = ATOMS[name]
        lab = LABELS[name]["atom"]
        trig = spec["allowedTriggers"]
        trig_s = "不限" if trig == "any" else " / ".join(trig)
        sup = []
        if spec["supports"]["equip"]:
            sup.append("装备")
        if spec["supports"]["consume"]:
            sup.append("消耗")
        flags = []
        if spec.get("modifierOnly"):
            flags.append("常驻聚合")
        if spec.get("allowsNestedEffects"):
            flags.append("可嵌套")
        if spec.get("emitsEvents"):
            flags.append("产生事件")
        rows.append([
            Paragraph('<font color="%s"><b>%s</b></font>' % (CAT[cat].hexval().replace('0x', '#'), CAT_CN[cat]), ST["cell"]),
            Paragraph("<b>%s</b><br/>" % lab["label"] + code(name), ST["cell"]),
            Paragraph(lab.get("help", ""), ST["cellc"]),
            Paragraph(trig_s, ST["cellc"]),
            Paragraph(" / ".join(sup), ST["cellc"]),
            Paragraph("、".join(flags) or "—", ST["cellc"]),
            Paragraph(str(len(USES.get(name, []))), ST["cell"]),
        ])
story += [data_table(["类别", "原子", "作用", "允许触发器", "形态", "标记", "用例"], rows,
                     [12 * mm, 26 * mm, CW - 128 * mm, 30 * mm, 16 * mm, 20 * mm, 12 * mm])]
story.append(PageBreak())

# ============ 第二部分 触发器 ============
h_section("第二部分　触发器详解", "p2",
          TRIG_C, "9 个触发器 = 效果的「什么时候」。每个触发器决定了 ctx 里有哪些载荷，"
                  "而载荷又决定了同一个原子的行为分支。")

for i, t_ in enumerate(TRIGGER_TEXT):
    n = t_["name"]
    if i:
        story.append(PageBreak())
    story.append(Sec("第二部分　触发器详解　·　%s %s" % (t_["cn"], n)))
    bar = Table([[""]], colWidths=[CW], rowHeights=[2.2])
    bar.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), TRIG_C)]))
    story += [
        bar, Spacer(1, 5),
        Head('<font color="#0F766E">%s</font>　<font size="12" color="#5B6472">%s</font>'
             % (t_["cn"], n), ST["h2"], 1, "trig_" + n, "%s　%s" % (t_["cn"], n)),
        Spacer(1, 3),
        Paragraph(rt("游戏内文案：<b>%s</b>　·　%s" % (TRIG_LABELS[n]["label"], t_["sub"])), ST["note"]),
        Spacer(1, 8),
        callout("plain", "一句话（给设计者）", [Paragraph(rt(t_["plain"]), ST["plain"])]),
        Spacer(1, 7),
        callout("code", "代码机制（给程序员）", bullets(t_["code"])),
        Spacer(1, 7),
        chip_row([("触发参数", rt(t_["tp"])), ("当前绑定数", "%d 处" % len(TRIG_USES.get(n, [])))]),
        Spacer(1, 7),
    ]
    uses = TRIG_USES.get(n, [])
    if uses:
        show = uses[:10]
        more = ("　…… 共 %d 处" % len(uses)) if len(uses) > 10 else ""
        story += [Paragraph("<b>现有用例</b>　" + "　·　".join(show) + more, ST["note"]), Spacer(1, 7)]
    story += [callout("warn", "注意事项", bullets(t_["pitfalls"]))]

story.append(PageBreak())

# ============ 第三部分 效果原子 ============
h_section("第三部分　效果原子详解", "p3",
          colors.HexColor("#12303F"),
          "34 个原子 = 效果的「做什么」。参数表、允许触发器、词条靶点与卡牌用例由脚本直接从源码提取。")

first = True
for cat in ORDER:
    if not first:
        story += [PageBreak(), Spacer(1, 12 * mm)]
    else:
        story.append(Spacer(1, 0))
    first = False
    story.append(Sec("第三部分　效果原子详解　·　" + CAT_CN[cat] + "类"))
    story += section_title("%s类（%s）" % (CAT_CN[cat], cat), 1, "cat_" + cat, CAT[cat],
                           "共 %d 个原子" % len(BY_CAT[cat]))

    for j, name in enumerate(BY_CAT[cat]):
        if j:
            # ReportLab 的零高度 Sec 标记紧跟 PageBreak 时，部分页会从页眉区开始排版；
            # 固定安全间距确保每个原子页都落在正文框内。
            story += [PageBreak(), Spacer(1, 12 * mm)]
        spec = ATOMS[name]
        story.append(Sec("第三部分　效果原子详解　·　%s类　·　%s %s"
                         % (CAT_CN[cat], LABELS[name]["atom"]["label"], name)))
        lab = LABELS[name]["atom"]
        txt = ATOM_TEXT[name]
        col = CAT[cat]

        story += [
            Head('<font color="%s">%s</font>　<font size="12" color="#5B6472">%s</font>'
                 % (col.hexval().replace('0x', '#'), lab["label"], name), ST["h2"], 1,
                 "atom_" + name, "%s　%s" % (lab["label"], name)),
            Spacer(1, 3),
            Paragraph(rt("术语表原文：%s" % lab.get("help", "—")), ST["note"]),
            Spacer(1, 8),
            callout("plain", "一句话（给设计者）", [Paragraph(rt(txt["plain"]), ST["plain"])]),
            Spacer(1, 7),
        ]

        trig = spec["allowedTriggers"]
        trig_s = "<b>不限</b>（对时机不敏感）" if trig == "any" else code(" / ".join(trig))
        if spec["supports"]["consume"]:
            sup = ["装备态 / 消耗态"]
        else:
            sup = ['装备态　<font color="#BE123C">（不支持消耗态）</font>']
        flags = []
        if spec.get("modifierOnly"):
            flags.append("<b>常驻聚合</b>（触发时 no-op）")
        if spec.get("allowsNestedEffects"):
            flags.append("可嵌套子效果")
        flags.append("产生事件" if spec.get("emitsEvents") else "不产生事件")
        story += [chip_row([
            ("允许触发器", trig_s),
            ("支持形态", " / ".join(sup)),
            ("引擎标记", "，".join(flags)),
        ]), Spacer(1, 6)]

        story += [callout("code", "代码机制（给程序员）", bullets(txt["code"])), Spacer(1, 6)]

        # 参数表
        prows = []
        for pname, pspec in spec["params"].items():
            plab = LABELS[name]["params"].get(pname, {"label": pname})
            prows.append([
                Paragraph("<b>%s</b><br/>" % plab["label"] + code(pname), ST["cell"]),
                Paragraph(fmt_type(pspec), ST["cellc"]),
                Paragraph(fmt_default(pspec), ST["cell"]),
                Paragraph(fmt_range(pspec), ST["cellc"]),
                Paragraph(rt(_amp(pspec.get("note", plab.get("help", "") or "—"))), ST["cellc"]),
            ])
        story += [
            Paragraph("参数表　<font size='8' color='#6B7480'>（唯一权威：ATOM_CONTRACT，"
                      "契约未声明的参数写进 JSON 会被校验器拒绝）</font>", ST["h3"]),
            Spacer(1, 4),
            data_table(["参数", "类型", "默认值", "范围 / 取值", "说明"], prows,
                       [30 * mm, 15 * mm, 27 * mm, 24 * mm, CW - 96 * mm], col),
            Spacer(1, 6),
        ]

        # 叠加与融合 + 词条轴
        fus = [Paragraph(rt(txt["fusion"]), ST["body"])]
        sc = SCALED_BY.get(name)
        if sc:
            lines = []
            for axis, tgt in sc:
                mode = tgt.get("mode", "mul")
                mode_cn = "加法" if mode == "add" else "乘法"
                extra = []
                if tgt.get("integer"):
                    extra.append("取整")
                if tgt.get("cap") is not None:
                    extra.append("封顶 %s" % tgt["cap"])
                if tgt.get("trigger"):
                    extra.append("仅 %s 触发器" % tgt["trigger"])
                lines.append("%s → 放大 %s（%s%s）" % (
                    code(axis), code(tgt["param"]), mode_cn,
                    ("，" + "、".join(extra)) if extra else ""))
            fus += [Spacer(1, 4),
                    Paragraph("<b>会被这些词条 / 遗物轴放大：</b>", ST["body"])] + \
                   [Paragraph("• " + x, ST["bullet"]) for x in lines]
        else:
            fus += [Spacer(1, 4),
                    Paragraph(rt("<b>不被任何词条 / 遗物轴放大</b>——AFFIX_SINKS 里没有指向本原子的靶点，"
                                 "数值完全由配置决定。"), ST["body"])]
        story += [callout("plain", "叠加、融合与缩放", fus), Spacer(1, 6)]

        # 用例
        uses = USES.get(name, [])
        if uses:
            show = uses[:12]
            more = ("　…… 共 %d 处绑定" % len(uses)) if len(uses) > 12 else ""
            body = "　·　".join(show) + more
        else:
            body = '<font color="#BE123C"><b>当前 skills.json 中 0 处使用</b>——未被任何卡牌验证过。</font>'
        story += [
            Paragraph("<b>现有卡牌用例</b>", ST["h3"]), Spacer(1, 3),
            Paragraph(body, ST["note"]), Spacer(1, 6),
        ]

        story += [callout("warn", "注意事项", bullets(txt["pitfalls"]))]

story.append(PageBreak())

# ============ 第四部分 融合总表 ============
h_section("第四部分　融合与叠加总表", "p4", colors.HexColor("#7C3AED"),
          "多张卡同时提供同一种效果时，引擎按什么规则合并。所有绑定按稳定来源顺序处理，"
          "交换装备槽不得改变聚合结果、事件、RNG 消耗或最终战斗状态。")

FUSION = [
    ("乘法叠加", "dropRateMul / dropLifetimeMul / xpMul",
     "各来源的 mul 连乘。堆得越多收益越大，但增速温和。", "ok"),
    ("加法叠加", "thorns",
     "各来源 ratio 直接相加，无上限。", "ok"),
    ("加法叠加 + 硬封顶", "breachReduction",
     "各来源相加，聚合后封顶 <b>0.9</b>（BREACH_REDUCTION_CAP）。到顶后继续堆完全无收益。", "warn"),
    ("取最高阈值", "execute",
     "passive 聚合取 max(hpThresholdRatio)。多张处决卡只有最狠的那张生效。", "ok"),
    ("取最强 + 时长取最大", "slow / vulnerable / freeze / stun",
     "由 statusSystem 仲裁。<b>不叠乘</b>——堆同类控制卡收益极低。", "ok"),
    ("护盾专属", "shield",
     "absorbHits 取 <b>最大</b>；regenSeconds 在所有声明了再生的来源中取 <b>最小</b>。", "ok"),
    ("按来源并行", "aura",
     "每张卡一份独立时钟与脉冲，互不合并。多张光环卡 = 多份效果。", "ok"),
    ("每(卡,绑定)单实例", "summon",
     "同一绑定只维持一个召唤物，重复触发只刷新。replacesEarlier 可删掉同卡更早的实例。", "ok"),
    ("正交轴确定性融合", "beamMorph / mortarMorph",
     "delivery 覆盖轴由最强 beam <b>赢家通吃</b>（其余完全压制）；"
     "impact 叠加轴上 mortar 从第 2 个起按 damping 衰减、半径按 √areaMul 缩放。", "warn"),
    ("累积入列", "mergeMaterialRefund / wildcardRewardBonus / dot",
     "全部按稳定来源序入列，由消费方各自解释；dot 是少数真正线性相加的效果。", "ok"),
    ("卡内覆盖、跨卡分轴取最大", "novaOnBreak",
     "同卡后声明覆盖；跨卡 damage 与 knockbackDistance 独立取最大。", "ok"),
    ("失败概率连乘", "expiryConvert",
     "同卡后声明覆盖；跨卡为 1 − ∏(1 − ratioᵢ)，且每枚掉落只掷一次骰。", "ok"),
    ("来源候选仲裁", "taunt",
     "同来源 upsert；跨来源按 priorityWeight、remaining、sourceKey 仲裁，赢家失效后回退。", "ok"),
]
rows = []
for rule, atoms_, desc, flag in FUSION:
    tone = {"ok": "#1A1A1A", "warn": "#B45309", "bad": "#BE123C"}[flag]
    rows.append([
        Paragraph('<font color="%s"><b>%s</b></font>' % (tone, rule), ST["cell"]),
        Paragraph(code(atoms_), ST["cell"]),
        Paragraph(rt(desc), ST["cellc"]),
    ])
story += [data_table(["合并规则", "涉及原子", "说明", ], rows,
                     [42 * mm, 40 * mm, CW - 82 * mm], colors.HexColor("#7C3AED")),
          Spacer(1, 10)]
story += [callout("plain", "已知顺序依赖（清单）", [
    Paragraph(rt(
        "回归清单不是封闭集合：<b>novaOnBreak / expiryConvert / taunt</b> 必须遵守上表；"
        "无威胁时召唤物方位不得读取槽号；环境召唤物同权重必须按稳定来源键决胜；"
        "interval、aura 与被动对账统一使用 card.type → card.id → bindingIndex 的规范顺序。"
        "replacesEarlier 仍只删除同卡更早 binding 的实例。"), ST["body"]),
])]
story.append(PageBreak())

# ============ 第五部分 常见坑 ============
h_section("第五部分　常见坑速查", "p5", colors.HexColor("#C2622F"),
          "按「症状」组织，方便出问题时反查。")

PIT = [
    ("配了效果但完全没反应", [
        "把 <b>pierce / ricochet</b> 配在了光束或迫击炮形态下——这两个原子只对 projectile 投递生效，静默 no-op。",
        "把 <b>aura</b> 绑到了 passive 以外的触发器——校验器会直接拒绝（allowedTriggers 锁死）。",
        "<b>interval</b> 绑定漏写 <font color='#0B5C74'>triggerParams.seconds</font>——不是不触发，是每 1 秒触发一次。",
        "<b>thorns / breachReduction</b> 漏写 ratio——契约默认 0，等于原子不存在，且不报错。",
        "<b>合成经济原子</b>只能放在 passive 下；概率由消费端掷骰，不能写成通用 chance。",
        "<b>restore</b> 同时漏写 amount 与 amountRatio——校验器会拦，但只写其中一个为 0 时不会拦。",
    ]),
    ("效果生效了但强度对不上", [
        "<b>execute.hpThresholdRatio</b> 漏写：passive 路径按 0（不处决），触发路径按 0.15。同一份 JSON 两种行为。",
        "<b>pierce.damageRetention</b> 漏写：装备态 0.8，消耗态 1。",
        "<b>aura.tickInterval</b> 漏写：触发路径 0.8s，passive 常驻 1s。",
        "<b>光束 damageRatio 不是直乘</b>：passive 换形路径下总伤按 baselineDps × interval 反推再均分到各 tick。",
        "<b>区域内嵌 dot 每次脉冲结算一次全额 perTick</b>，实际 DPS = perTick ÷ 区域 tickInterval，容易低估一倍以上。",
        "<b>dot 的 tickInterval 只是换算系数</b>，普通路径下掉血是按帧连续的。",
        "<b>易伤只在 resolveImpact 路径生效</b>，直接调 dealDamage 的爆炸 / DOT 不一定过 damageTakenMultiplier。",
    ]),
    ("范围 / 目标不对", [
        "带 <b>enemy 载荷</b>的触发器（onHit / onKill）下，params.radius 被忽略——targets() 只返回那一个敌人。",
        "无 enemy 载荷时，<b>ctx.radius（消耗态档位）优先于 params.radius</b>。",
        "<b>onWaveStart / onMerge</b> 的 origin 是炮台；<b>onPickup</b> 的 origin 是掉落物位置，可能远离战场。",
        "<b>mergePulse</b> 永远以炮台为心，不用 ctx.origin。",
        "<b>novaOnBreak 半径硬编码 220</b>，<b>召唤物死亡爆炸半径硬编码 120</b>，都不是参数。",
        "<b>groundZone.shape = 'line'</b> 当前按 circle 结算。",
    ]),
    ("控制打不上去 / 覆盖率低于预期", [
        "<b>控制预算</b>（controlBudgetDenies）会主动拒绝对新敌人施加 freeze / stun / knockback，"
        "以保证场上留下足够的自由推进者。这是刻意的体验保护。",
        "<b>免疫窗</b>：冻结 / 眩晕结束后有一段 ccImmune，期间控不上且不累积冻结层。",
        "<b>类型抗性</b>：boss / tank 的 ccResist 与 knockbackResist 会按比例削减时长与距离。",
        "<b>单次潜力封顶</b>：controlCeiling 会先把 duration / distance 夹一次，再乘抗性。",
        "<b>冻结中击退无效</b>；<b>冻结 / 眩晕中嘲讽暂停</b>。",
        "<b>击退疲劳</b>：短窗内连续击退同一敌人会越推越短。",
        "<b>击退射程限位</b>：不会把原本在射程内的敌人推出射程（但也不会把射程外的吸回来）。",
    ]),
    ("时序与顺序相关", [
        "<b>onFire 上的原子多数走 rider</b>，实际在命中时才结算——想要「开火即生效」要另找触发器。",
        "<b>onKill 递归上限 4 层</b>，密集链式击杀会被静默截断。",
        "<b>护盾吸收成功仍然触发 onBreach</b>。",
        "<b>装备绑定按稳定来源顺序</b>执行；新增遍历入口时必须复用该比较器，不能读取物理槽位顺序。",
        "<b>statBuff 的 sourceId 不含 bindingIndex</b>，同卡两个绑定给同属性加 buff 会共用层数池、互相刷新。",
        "<b>groundZone 的 baseDamage 是创建时快照</b>，区域存续期间的增伤不会追溯。",
    ]),
    ("写在错误的触发器下（校验器不会报错）", [
        "<b>modifierOnly 原子写在非 passive 触发器下照样常驻生效</b>——getModifiers 不按触发器过滤。"
        "规范是一律写 passive，目前靠约定而非工具保证。",
        "<b>beamMorph / mortarMorph / aura 只有绑 passive 才是「换形 / 常驻光环」</b>；"
        "绑别的触发器时它们变成「立即一道光束 / 立即一次爆炸 / 落点临时区域」，是完全不同的效果。",
        "<b>cooldownSeconds 在 interval 上完全无效</b>——只有 fireTrigger 路径读它。",
        "<b>mergePulse 绑到非 onMerge 时 resultStar 回退为 1</b>，伤害只有 1 倍系数。",
        "<b>burstDamage 只有绑 onBreach 才吃 retaliationMul 轴</b>。",
    ]),
    ("性能与体量", [
        "<b>split.maxDepth</b> 调到 2 以上会指数级增殖，是最容易做出性能事故的旋钮。",
        "<b>groundZone / aura 的 tick 成本是「区域数 × 敌人数」</b>，是当前最重的两个原子（78 / 29 处绑定）。",
        "<b>getModifiers 每次调用都全量遍历所有装备绑定且不缓存</b>，"
        "而它在 tickAuras / resolveImpact / absorbBreach / shoot 中被反复调用。",
    ]),
]
for i, (title, items) in enumerate(PIT):
    story.append(KeepTogether([
        Paragraph('<font color="#C2622F">■</font>　' + title, ST["h3"]),
        Spacer(1, 3),
    ] + [Paragraph("• " + rt(x), ST["bullet"]) for x in items] + [Spacer(1, 9)]))

story.append(PageBreak())

# ============ 附录 ============
h_section("附录", "app", colors.HexColor("#475569"))

story += [Head("附录 A　状态仲裁规则（statusSystem.CONFLICT_RULES）", ST["h2"], 1, "appA"),
          Spacer(1, 4),
          Paragraph(rt("原子之间的交互冲突<b>集中在 statusSystem 仲裁</b>，禁止散落到各原子实现里。"
                       "下面 13 条是代码里的常量原文。"), ST["note"]), Spacer(1, 6)]
RULES = [
    "击退 × 类型抗性（boss / tank 减免）",
    "连续击退短窗递减，窗口过期重置",
    "freeze / stun × 类型抗性（boss / tank 减免时长）",
    "硬控结束 → 免疫窗内免疫再控且不累积冻结层",
    "硬控 / 击退 × 全局控制预算（群体中保留自由推进者）",
    "freeze / stun / knockback 单次潜力封顶",
    "击退射程限位（只拦截向外推出，不吸回射程外敌人）",
    "freeze / stun → 不可移动，嘲讽暂停",
    "freeze → 击退无效",
    "slow 多来源取最强，不叠乘",
    "vulnerable 多来源取最强",
    "索敌：紧急半径最近 &gt; 活跃 bounty &gt; brand 权重 &gt; 最近",
    "移动：taunt &gt; 炮台；嘲讽源死亡即失效",
]
rows = [[Paragraph(str(i + 1), ST["cell"]), Paragraph(rt(r), ST["cell"])] for i, r in enumerate(RULES)]
story += [data_table(["#", "规则"], rows, [10 * mm, CW - 10 * mm], colors.HexColor("#475569")),
          Spacer(1, 12)]

story += [CondPageBreak(70 * mm),
          Head("附录 B　词条 / 遗物缩放靶点总表（AFFIX_SINKS）", ST["h2"], 1, "appB"),
          Spacer(1, 4),
          Paragraph(rt("这是一张<b>白名单</b>：只有下表列出的 (原子, 参数) 会被对应的轴改写，"
                       "同名参数在别的原子上不受影响。缩放在 "
                       "<b>applyBuildScalingToBindings()</b> 里就地改写绑定数值，发生在原子执行之前。"),
                    ST["note"]), Spacer(1, 6)]
rows = []
for axis, contract in SINKS.items():
    tgts = contract.get("scalingTargets") or []
    if not tgts:
        rows.append([Paragraph(code(axis), ST["cell"]),
                     Paragraph(contract["operation"], ST["cellc"]),
                     Paragraph('<font color="#9AA3AE">无原子靶点</font>', ST["cellc"]),
                     Paragraph(code(contract.get("globalConsumer", "—")), ST["cellc"])])
        continue
    tl = []
    for t_ in tgts:
        extra = []
        if t_.get("mode") == "add":
            extra.append("加法")
        if t_.get("integer"):
            extra.append("取整")
        if t_.get("cap") is not None:
            extra.append("封顶 %s" % t_["cap"])
        if t_.get("trigger"):
            extra.append("仅 %s" % t_["trigger"])
        tl.append("%s.%s%s" % (t_["atom"], t_["param"],
                               ("（%s）" % "、".join(extra)) if extra else ""))
    rows.append([Paragraph(code(axis), ST["cell"]),
                 Paragraph(contract["operation"], ST["cellc"]),
                 Paragraph(code("<br/>".join(tl)), ST["cellc"]),
                 Paragraph(code(contract.get("globalConsumer", "—")), ST["cellc"])])
story += [data_table(["词条轴", "运算", "作用靶点（原子.参数）", "全局消费者"], rows,
                     [30 * mm, 12 * mm, CW - 84 * mm, 42 * mm], colors.HexColor("#475569")),
          Spacer(1, 12)]

story += [CondPageBreak(70 * mm),
          Head("附录 C　原子 × 卡牌用例全索引", ST["h2"], 1, "appC"),
          Spacer(1, 4),
          Paragraph(rt("由脚本扫描 <b>src/config/base/skills.json</b> 得到（含 stars 锚点、"
                       "evolutionTree 分支与共享节点、以及消耗态档位；"
                       "「&gt;嵌套」表示该原子写在 aura / groundZone 的 effects 里）。"), ST["note"]),
          Spacer(1, 6)]
rows = []
for cat in ORDER:
    for name in BY_CAT[cat]:
        uses = USES.get(name, [])
        rows.append([
            Paragraph("<b>%s</b><br/>" % LABELS[name]["atom"]["label"] + code(name), ST["cell"]),
            Paragraph(str(len(uses)), ST["cell"]),
            Paragraph("　·　".join(uses[:8]) + ("　……" if len(uses) > 8 else "")
                      if uses else '<font color="#BE123C">未使用</font>', ST["cellc"]),
        ])
story += [data_table(["原子", "绑定数", "出现位置（前 8 条）"], rows,
                     [26 * mm, 14 * mm, CW - 40 * mm], colors.HexColor("#475569"))]


# ---------------------------------------------------------------- 构建
class Doc(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Head):
            self.canv.bookmarkPage(flowable.key)
            self.canv.addOutlineEntry(flowable.toc, flowable.key.encode("utf-8"), flowable.lvl, 0)
            self.notify("TOCEntry", (flowable.lvl, flowable.toc, self.page, flowable.key))


doc = Doc(OUT, pagesize=A4, leftMargin=ML, rightMargin=MR, topMargin=MT, bottomMargin=MB,
          title="ProjectVL 触发器与效果原子说明手册", author="ProjectVL",
          subject="skills-schema v0.5.0 · 9 触发器 · 34 效果原子")
frame = Frame(ML, MB, CW, PAGE_H - MT - MB, id="f", leftPadding=0, rightPadding=0,
              topPadding=0, bottomPadding=0)
doc.addPageTemplates([
    PageTemplate(id="cover", frames=[frame], onPage=on_cover),
    PageTemplate(id="body", frames=[frame], onPageEnd=on_page),
])
doc.multiBuild(story)
print("PDF:", OUT)
