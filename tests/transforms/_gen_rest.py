import json, os

SQ = chr(39)
BT = chr(96)
DL = chr(36)

def q(s):
    return SQ + s + SQ

def tl(prefix):
    return BT + prefix + DL + chr(123) + chr(105) + chr(125) + BT

lines = []
def L(s=chr(34)+chr(34)):
    lines.append(s)

# OB-4
L()
L("describe(" + q("OB-4: Fan-Out Join Risk") + ", () => {")

L("  it(" + q("should detect target column fed by 2 source tables") + ", () => {")
L("    const data = buildData([")
L("      mapping({ sourceTable: " + q("customers") + ", sourceColumn: " + q("email") + ", targetTable: " + q("dim_contact") + ", targetColumn: " + q("email_addr") + " }),")
L("      mapping({ sourceTable: " + q("suppliers") + ", sourceColumn: " + q("contact_email") + ", targetTable: " + q("dim_contact") + ", targetColumn: " + q("email_addr") + " }),")
L("    ]);")
L("    const f = ob4FanoutJoinCheck.evaluate(data);")
L("    expect(f).toHaveLength(1);")
L("    expect(f[0].checkId).toBe(" + q("OB-4") + ");")
L("    expect(f[0].category).toBe(" + q("ontological-break") + ");")
L("    expect(f[0].evidence[0].detail).toContain(" + q("dim_contact.email_addr") + ");")
L("    expect(f[0].evidence[0].detail).toContain(" + q("customers") + ");")
L("    expect(f[0].evidence[0].detail).toContain(" + q("suppliers") + ");")
L("  });")

L("  it(" + q("should not flag single-source target columns") + ", () => {")
L("    expect(ob4FanoutJoinCheck.evaluate(buildData([")
L("      mapping({ sourceTable: " + q("orders") + ", sourceColumn: " + q("order_id") + ", targetTable: " + q("fact_orders") + ", targetColumn: " + q("order_id") + " }),")
L("      mapping({ sourceTable: " + q("orders") + ", sourceColumn: " + q("amount") + ", targetTable: " + q("fact_orders") + ", targetColumn: " + q("amount") + " }),")
L("    ]))).toHaveLength(0);")
L("  });")

L("  it(" + q("should detect multiple fan-out columns") + ", () => {")
L("    const f = ob4FanoutJoinCheck.evaluate(buildData([")
L("      mapping({ sourceTable: " + q("sales") + ", sourceColumn: " + q("region") + ", targetTable: " + q("fact_combined") + ", targetColumn: " + q("region") + " }),")
L("      mapping({ sourceTable: " + q("returns") + ", sourceColumn: " + q("region") + ", targetTable: " + q("fact_combined") + ", targetColumn: " + q("region") + " }),")
L("      mapping({ sourceTable: " + q("sales") + ", sourceColumn: " + q("amount") + ", targetTable: " + q("fact_combined") + ", targetColumn: " + q("total") + " }),")
L("      mapping({ sourceTable: " + q("returns") + ", sourceColumn: " + q("refund") + ", targetTable: " + q("fact_combined") + ", targetColumn: " + q("total") + " }),")
L("    ]));")
L("    expect(f).toHaveLength(1);")
L("    expect(f[0].evidence.length).toBeGreaterThanOrEqual(2);")
L("  });")

L("  it(" + q("should return minor severity for few fan-out columns") + ", () => {")
L("    const f = ob4FanoutJoinCheck.evaluate(buildData([")
L("      mapping({ sourceTable: " + q("a") + ", sourceColumn: " + q("x") + ", targetTable: " + q("t") + ", targetColumn: " + q("x") + " }),")
L("      mapping({ sourceTable: " + q("b") + ", sourceColumn: " + q("x") + ", targetTable: " + q("t") + ", targetColumn: " + q("x") + " }),")
L("      mapping({ sourceTable: " + q("a") + ", sourceColumn: " + q("y") + ", targetTable: " + q("t") + ", targetColumn: " + q("y") + " }),")
L("    ]));")
L("    expect(f).toHaveLength(1);")
L("    expect(f[0].severity).toBe(" + q("minor") + ");")
L("  });")

L("  it(" + q("should return critical severity for many fan-out columns") + ", () => {")
L("    const mappings: ReturnType<typeof mapping>[] = [];")
L("    for (let i = 0; i < 6; i++) {")
L("      mappings.push(mapping({ sourceTable: " + q("src_a") + ", sourceColumn: " + tl("col_") + ", targetTable: " + q("tgt") + ", targetColumn: " + tl("col_") + " }));")
L("      mappings.push(mapping({ sourceTable: " + q("src_b") + ", sourceColumn: " + tl("col_") + ", targetTable: " + q("tgt") + ", targetColumn: " + tl("col_") + " }));")
L("    }")
L("    const f = ob4FanoutJoinCheck.evaluate(buildData(mappings));")
L("    expect(f).toHaveLength(1);")
L("    expect(f[0].severity).toBe(" + q("critical") + ");")
L("  });")

L("  it(" + q("should not flag same source table mapping different cols to same target col") + ", () => {")
L("    expect(ob4FanoutJoinCheck.evaluate(buildData([")
L("      mapping({ sourceTable: " + q("orders") + ", sourceColumn: " + q("ship_date") + ", targetTable: " + q("fact") + ", targetColumn: " + q("event_date") + " }),")
L("      mapping({ sourceTable: " + q("orders") + ", sourceColumn: " + q("order_date") + ", targetTable: " + q("fact") + ", targetColumn: " + q("event_date") + " }),")
L("    ]))).toHaveLength(0);")
L("  });")

L("});")

# runTransformChecks
L()
L("describe(" + q("runTransformChecks aggregator") + ", () => {")

L("  it(" + q("should return empty array for clean data") + ", () => {")
L("    const f = runTransformChecks(buildData([")
L("      mapping({ sourceTable: " + q("src") + ", sourceColumn: " + q("id") + ", targetTable: " + q("tgt") + ", targetColumn: " + q("id") + " }),")
L("    ]));")
L("    expect(f).toHaveLength(0);")
L("  });")

L("  it(" + q("should aggregate findings from multiple checks") + ", () => {")
L("    const data = buildData([")
L("      // SD-1: alias misalignment (revenue -> income)")
L("      mapping({ sourceTable: " + q("src") + ", sourceColumn: " + q("revenue") + ", targetTable: " + q("tgt") + ", targetColumn: " + q("income") + " }),")
L("      // SD-2: type coercion (timestamp -> date)")
L("      mapping({ sourceTable: " + q("src") + ", sourceColumn: " + q("created_at") + ", sourceType: " + q("timestamp") + ", targetTable: " + q("tgt") + ", targetColumn: " + q("created_at") + ", targetType: " + q("date") + " }),")
L("    ]);")
L("    const f = runTransformChecks(data);")
L("    expect(f.length).toBeGreaterThanOrEqual(2);")
L("    const checkIds = f.map(x => x.checkId);")
L("    expect(checkIds).toContain(" + q("SD-1") + ");")
L("    expect(checkIds).toContain(" + q("SD-2") + ");")
L("  });")

L("  it(" + q("should produce findings with all required fields") + ", () => {")
L("    const data = buildData([")
L("      mapping({ sourceTable: " + q("src") + ", sourceColumn: " + q("revenue") + ", targetTable: " + q("tgt") + ", targetColumn: " + q("income") + " }),")
L("    ]);")
L("    const f = runTransformChecks(data);")
L("    for (const finding of f) {")
L("      expect(finding.checkId).toBeDefined();")
L("      expect(finding.category).toMatch(/^(semantic-drift|ontological-break)/);")
L("      expect(finding.severity).toMatch(/^(critical|major|minor|info)/);")
L("      expect(finding.title).toBeTruthy();")
L("      expect(finding.description).toBeTruthy();")
L("      expect(finding.evidence).toBeInstanceOf(Array);")
L("      expect(finding.remediation).toBeTruthy();")
L("      expect(finding.costCategories).toBeInstanceOf(Array);")
L("      expect(typeof finding.ratio).toBe(" + q("number") + ");")
L("    }")
L("  });")

L("  it(" + q("should return findings from both categories") + ", () => {")
L("    const data = buildData([")
L("      // SD-1 trigger")
L("      mapping({ sourceTable: " + q("src") + ", sourceColumn: " + q("cost") + ", targetTable: " + q("tgt") + ", targetColumn: " + q("expense") + " }),")
L("      // OB-1 trigger: 2 source tables -> 1 target table")
L("      mapping({ sourceTable: " + q("customers") + ", sourceColumn: " + q("id") + ", targetTable: " + q("dim_entity") + ", targetColumn: " + q("entity_id") + " }),")
L("      mapping({ sourceTable: " + q("suppliers") + ", sourceColumn: " + q("id") + ", targetTable: " + q("dim_entity") + ", targetColumn: " + q("entity_id") + " }),")
L("    ]);")
L("    const f = runTransformChecks(data);")
L("    const categories = new Set(f.map(x => x.category));")
L("    expect(categories.has(" + q("semantic-drift") + ")).toBe(true);")
L("    expect(categories.has(" + q("ontological-break") + ")).toBe(true);")
L("  });")

L("  it(" + q("should handle empty mappings array") + ", () => {")
L("    const f = runTransformChecks(buildData([]));")
L("    expect(f).toHaveLength(0);")
L("  });")

L("});")

# Edge Cases
L()
L("describe(" + q("Edge Cases") + ", () => {")

L("  it(" + q("should handle empty string columns gracefully") + ", () => {")
L("    const data = buildData([")
L("      mapping({ sourceTable: " + q("") + ", sourceColumn: " + q("") + ", targetTable: " + q("") + ", targetColumn: " + q("") + " }),")
L("    ]);")
L("    expect(() => runTransformChecks(data)).not.toThrow();")
L("  });")

L("  it(" + q("should be case-insensitive for table/column matching") + ", () => {")
L("    const data = buildData([")
L("      mapping({ sourceTable: " + q("Orders") + ", sourceColumn: " + q("ORDER_ID") + ", targetTable: " + q("FACT_ORDERS") + ", targetColumn: " + q("order_id") + " }),")
L("      mapping({ sourceTable: " + q("orders") + ", sourceColumn: " + q("amount") + ", targetTable: " + q("fact_orders") + ", targetColumn: " + q("Amount") + " }),")
L("    ]);")
L("    expect(() => runTransformChecks(data)).not.toThrow();")
L("  });")

L("  it(" + q("should handle very long column names") + ", () => {")
L("    const longName = " + q("a") + ".repeat(200);")
L("    const data = buildData([")
L("      mapping({ sourceColumn: longName, targetColumn: longName }),")
L("    ]);")
L("    expect(() => runTransformChecks(data)).not.toThrow();")
L("  });")

L("  it(" + q("should handle special characters in column names") + ", () => {")
L("    const data = buildData([")
L("      mapping({ sourceColumn: " + q("col-with-dashes") + ", targetColumn: " + q("col.with.dots") + " }),")
L("      mapping({ sourceColumn: " + q("col with spaces") + ", targetColumn: " + q("col_normal") + " }),")
L("    ]);")
L("    expect(() => runTransformChecks(data)).not.toThrow();")
L("  });")

L("});")

# Write output
content = chr(10).join(lines)
out_path = "C:/Users/Lenovo/OneDrive/Desktop/projects/dalc-scanner/tests/transforms/_remaining2.json"
with open(out_path, "w", encoding="utf-8") as fp:
    json.dump(content, fp)
print("Wrote", len(content), "chars as JSON to", out_path)
