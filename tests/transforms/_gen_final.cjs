const fs = require("fs");
const path = require("path");
const BT = String.fromCharCode(96);
const DL = String.fromCharCode(36);
function colTL(p) { return BT + p + DL + "{i}" + BT; }
const outPath = path.join(__dirname, "checks.test.ts");
let existing = fs.readFileSync(outPath, "utf8");
const remaining = JSON.parse(fs.readFileSync(path.join(__dirname, "_remaining.json"), "utf8"));
const final = existing + remaining.replace(/__COL_TL__/g, colTL("col_"));
fs.writeFileSync(outPath, final, "utf8");
console.log("Final:", final.length, "chars");