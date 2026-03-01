const fs = require('fs');
const outPath = 'C:/Users/Lenovo/OneDrive/Desktop/projects/dalc-scanner/tests/transforms/checks.test.ts';
const SQ = String.fromCharCode(39);
const BT = String.fromCharCode(96);
const DL = String.fromCharCode(36);
const NL = String.fromCharCode(10);

// Build the remaining test content
let out = '';

// Helper to produce template literal col_${i}
function tl(p) { return BT + p + DL + '{i}' + BT; }

function q(s) { return SQ + s + SQ; }

function line(s) { out += s + NL; }

// ============ OB-4 ============
line('');
line('describe(' + q('OB-4: Fan-Out Join Risk') + ', () => {');
line('  it(' + q('should detect target column fed by 2 source tables') + ', () => {');
line('    const data = buildData([');
line('      mapping({ sourceTable: ' + q('customers') + ', sourceColumn: ' + q('email') + ', targetTable: ' + q('dim_contact') + ', targetColumn: ' + q('email_addr') + ' }),');
line('      mapping({ sourceTable: ' + q('suppliers') + ', sourceColumn: ' + q('contact_email') + ', targetTable: ' + q('dim_contact') + ', targetColumn: ' + q('email_addr') + ' }),');
line('    ]);');
line('    const f = ob4FanoutJoinCheck.evaluate(data);');
line('    expect(f).toHaveLength(1);');
line('    expect(f[0].checkId).toBe(' + q('OB-4') + ');');
line('    expect(f[0].category).toBe(' + q('ontological-break') + ');');
