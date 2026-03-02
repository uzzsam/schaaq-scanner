# DALC Engine — Intentional Text Drift

The DALC cost engine is shared between **Scanner** (standalone desktop/CLI tool) and
**Web** (SaaS calculator). The calculation logic is identical, but several files
carry **intentionally different editorial text** to suit each product's audience:

- **Scanner** — business-risk framing aimed at enterprise data teams.
- **Web** — neutral, educational text aimed at a broader audience.

## Affected Files

| Engine file       | Scanner path                        | Web path                            | Drift type          |
|-------------------|-------------------------------------|-------------------------------------|---------------------|
| `constants.ts`    | `src/engine/constants.ts`           | `lib/engine/constants.ts`           | Display text only   |
| `findings.ts`     | `src/engine/findings.ts`            | `lib/engine/findings.ts`            | Display text only   |
| `properties.ts`   | `src/engine/properties.ts`          | `lib/engine/properties.ts`          | Display text only   |

## Files That Must Stay Identical

| Engine file   | Scanner path                    | Web path                        |
|---------------|---------------------------------|---------------------------------|
| `engine.ts`   | `src/engine/engine.ts`          | `lib/engine/engine.ts`          |
| `types.ts`    | `src/engine/types.ts`           | `lib/engine/types.ts`           |
| `index.ts`    | `src/engine/index.ts`           | `lib/engine/index.ts`           |

## Rules

1. **Logic changes must sync.** Any change to scoring formulas, thresholds,
   weights, or control flow in *any* engine file must be applied to both projects.
2. **Text changes are project-specific.** Descriptions, titles, remediation
   wording, and display labels in `constants.ts`, `findings.ts`, and
   `properties.ts` may diverge without requiring a cross-project sync.
3. **Use `check-engine-sync.sh`** to verify strict files are identical and
   flag expected text drift before releasing either project.
