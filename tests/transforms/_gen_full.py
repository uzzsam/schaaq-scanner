import os

bt = chr(96)
tl_tgt = bt + chr(36) + "{m.targetTable}." + chr(36) + "{m.targetColumn}" + bt
tl_src = bt + chr(36) + "{m.sourceTable}." + chr(36) + "{m.sourceColumn}" + bt

def col_tl(prefix):
    return bt + prefix + chr(36) + "{i}" + bt

outpath = os.path.join(os.path.dirname(os.path.abspath(__file__)), "checks.test.ts")

# Read template and do replacements
tmpl = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_checks_template.txt")
with open(tmpl, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("__TGTKEY__", tl_tgt)
content = content.replace("__SRCKEY__", tl_src)
content = content.replace("__REVENUE_I__", col_tl("revenue_"))
content = content.replace("__INCOME_I__", col_tl("income_"))
content = content.replace("__COL_I__", col_tl("col_"))

with open(outpath, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Written {len(content)} chars to {outpath}")