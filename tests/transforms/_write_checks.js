const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, 'checks.test.ts');

// Build template literals
const bt = String.fromCharCode(96);
const dollar = String.fromCharCode(36);
const tgtKeyTL = bt + dollar + '{m.targetTable}.' + dollar + '{m.targetColumn}' + bt;
const srcKeyTL = bt + dollar + '{m.sourceTable}.' + dollar + '{m.sourceColumn}' + bt;
function colTL(prefix) { return bt + prefix + dollar + '{i}' + bt; }

// Read template
const tmplPath = path.join(__dirname, '_checks_template.txt');
let content = fs.readFileSync(tmplPath, 'utf8');

// Replace placeholders
content = content.replace(/__TGTKEY__/g, tgtKeyTL);
content = content.replace(/__SRCKEY__/g, srcKeyTL);
content = content.replace(/__REVENUE_I__/g, colTL('revenue_'));
content = content.replace(/__INCOME_I__/g, colTL('income_'));
content = content.replace(/__COL_I__/g, colTL('col_'));

fs.writeFileSync(outPath, content, 'utf8');
console.log('Written ' + content.length + ' chars to ' + outPath);
