const fs = require("fs");
const path = require("path");

// Build the complete test file content
const bt = String.fromCharCode(96);
const d = String.fromCharCode(36);
const tgtTL = bt + d + "{m.targetTable}." + d + "{m.targetColumn}" + bt;
const srcTL = bt + d + "{m.sourceTable}." + d + "{m.sourceColumn}" + bt;
function colTL(p) { return bt + p + d + "{i}" + bt; }

const outPath = path.join(__dirname, "checks.test.ts");
const tmplPath = path.join(__dirname, "_tmpl.txt");
let c = fs.readFileSync(tmplPath, "utf8");
c = c.replace(/__TGTKEY__/g, tgtTL);
c = c.replace(/__SRCKEY__/g, srcTL);
c = c.replace(/__REVENUE_I__/g, colTL("revenue_"));
c = c.replace(/__INCOME_I__/g, colTL("income_"));
c = c.replace(/__COL_I__/g, colTL("col_"));
fs.writeFileSync(outPath, c, "utf8");
console.log("Written " + c.length + " chars");