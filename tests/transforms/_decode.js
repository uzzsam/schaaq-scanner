const fs = require("fs");
const b64 = fs.readFileSync(0, "utf-8").trim();
const decoded = Buffer.from(b64, "base64").toString("utf-8");
const outPath = "C:/Users/Lenovo/OneDrive/Desktop/projects/dalc-scanner/tests/transforms/parser.test.ts";
fs.writeFileSync(outPath, decoded);
console.log("Decoded and written", decoded.length, "chars");