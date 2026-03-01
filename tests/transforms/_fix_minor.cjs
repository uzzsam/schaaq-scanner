const fs = require("fs");
const p = "C:/Users/Lenovo/OneDrive/Desktop/projects/dalc-scanner/tests/transforms/checks.test.ts";
let c = fs.readFileSync(p, "utf8");
const old = "      mappings.push(mapping({ sourceTable: 'a', sourceColumn: , targetTable: 't', targetColumn:  }));";
const rep = "      mappings.push(mapping({ sourceTable: 'a', sourceColumn: `f${i}`, targetTable: 't', targetColumn: `f${i}` }));";
c = c.replace(old, rep);
fs.writeFileSync(p, c, "utf8");
console.log("Fixed template literal in minor severity test");
