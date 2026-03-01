
const fs = require('fs');
const path = 'C:/Users/Lenovo/OneDrive/Desktop/projects/dalc-scanner/tests/transforms/parser.test.ts';
const BT = String.fromCharCode(96);
const DL = String.fromCharCode(36);
const content = [
"import { describe, it, expect } from 'vitest';",
"import {",
"  parseTransformFiles,",
"  type TransformFile,",
"  type TransformParseResult,",
"} from '../../src/transforms/parser';",
"",
].join('
');
fs.writeFileSync(path, content, 'utf-8');
console.log('partial write ok');
