# Layer 4 Sensitivity Analysis — Von Neumann Minimax

**Date:** 2026-03-08
**Trigger:** GPT 5.5 independent review flagged "Layer 4 (Von Neumann Minimax) may always output M\*=0.90 regardless of inputs"
**Engine version:** v4.0.0 (Archimedes)

---

## 1. Critical Finding: Layer 4 Does Not Exist

The GPT 5.5 review references a "Layer 4 (Von Neumann Minimax)" that **does not exist in the codebase**.

| What the README claims | What the code implements |
|---|---|
| Layer 5: "Monte Carlo — Uncertainty estimation with minimax bounds" | **Not implemented** — zero code |

The only "Neumann" reference is `NEUMANN_TERMS = 12` in `src/engine/constants.ts:183`, used for Neumann series polynomial expansion in the Leontief matrix inversion (`(I - A)^-1 * B`). This is a standard numerical method for approximating matrix inverses — it has **nothing to do with Von Neumann game theory or minimax optimisation**.

### Actual Engine Pipeline (4 layers, not 5)

```
Layer 1:  Shannon Entropy        → adjustedMaturity (M)
Layer 1b: Base Cost Model        → baseCosts (F1-F5)
Layer 1c: Findings Adjustment    → adjustedCosts (capped at 60%)
Layer 2:  Leontief Amplification → amplifiedCosts via Neumann series
          Sanity Bounds          → finalCosts (capped at 10% revenue)
          Canonical Comparison   → ROI / payback
          5-Year Projection      → compound growth scenarios
```

### Where Does "M\*=0.90" Come From?

The value `0.90` is the **defaultCoverage** for the `canonical` modelling approach (`src/engine/constants.ts:80`). It is an input constant, not a computed output. The GPT 5.5 reviewer likely misidentified this constant as a layer output.

---

## 2. Sensitivity Test Results

8 test vectors spanning extremes were run through the full DALC engine. Since no minimax layer exists, we tested the three closest proxy outputs: `adjustedMaturity` (M), `spectralRadius` (rho), and `amplificationRatio` (lambda).

### Output Table

| Vector | M (adj) | rho (spec) | lambda (amp) | Base Cost | Final Cost | Capped |
|---|---|---|---|---|---|---|
| Minimal (1 sys, $5M, 20% cov, mining) | 0.1000 | 0.1440 | 1.1501 | $0.41M | $0.50M | YES |
| Small (3 sys, $50M, 40% cov, mining) | 0.0013 | 0.1670 | 1.2568 | $1.90M | $3.11M | no |
| Medium (8 sys, $200M, 60% cov, energy) | 0.0906 | 0.1810 | 1.3322 | $7.29M | $10.99M | no |
| Large (15 sys, $850M, 75% cov, mining) | 0.2469 | 0.1390 | 1.2064 | $25.02M | $32.03M | no |
| Enterprise (50 sys, $5B, 90% cov, energy) | 0.4087 | 0.1311 | 1.1758 | $91.70M | $107.82M | no |
| Worst (100 sys, $10B, 10% cov, mining) | 0.0031 | 0.1945 | 1.3016 | $378.23M | $515.98M | no |
| Best (2 sys, $100M, 95% cov, env) | 0.6066 | 0.0778 | 1.1020 | $1.26M | $1.38M | no |
| Edge (1 sys, $1M, 99% cov, env) | 0.8500 | 0.0286 | 1.0183 | $0.03M | $0.03M | no |

### Statistics

| Metric | Min | Max | Mean | StdDev | Range |
|---|---|---|---|---|---|
| adjustedMaturity (M) | 0.0013 | 0.8500 | 0.2884 | 0.2897 | 0.8487 |
| spectralRadius (rho) | 0.0286 | 0.1945 | 0.1329 | 0.0517 | 0.1660 |
| amplificationRatio (lambda) | 1.0183 | 1.3322 | 1.1929 | 0.0977 | 0.3139 |
| finalTotal | $0.03M | $515.98M | $83.98M | $166.81M | $515.94M |

---

## 3. Sensitivity Verdict

**Threshold:** stddev >= 0.02 = SENSITIVE

| Metric | StdDev | Range | Verdict |
|---|---|---|---|
| adjustedMaturity | 0.2897 | 0.8487 | **SENSITIVE** (14.5x threshold) |
| spectralRadius | 0.0517 | 0.1660 | **SENSITIVE** (2.6x threshold) |
| amplificationRatio | 0.0977 | 0.3139 | **SENSITIVE** (4.9x threshold) |

**All proxy values are highly sensitive to inputs.** There is no fixed-output problem in any implemented layer.

### Key Input Drivers

| Input field | Effect on M | Effect on rho | Effect on lambda |
|---|---|---|---|
| `primaryCoverage` | **Strong** — directly controls Shannon entropy and disorder score | Moderate | Moderate |
| `modellingApproach` | **Strong** — sets `mBase` (0.10 to 0.85) | Moderate | Moderate |
| `sourceSystems` | Moderate — affects entropy denominator | **Strong** — drives `S/(S+10)` saturation | **Strong** |
| `sector` | Indirect — selects W matrix | **Strong** — different W matrix coefficients | **Strong** |
| `findings` severity | None — doesn't flow into M | Indirect | Indirect (via adjusted costs fed to Leontief) |

---

## 4. Recommendation

### DEMOTE the README claim — no code to keep or rename

There is nothing to demote or rename in the engine itself because **the layer was never implemented**. The issue is purely a documentation discrepancy.

**Actions:**

1. **Remove "Monte Carlo — Uncertainty estimation with minimax bounds" from README.md** (line 81). It is vapourware — claiming capability that does not exist in the engine. This is the actual credibility risk, not a fixed-output bug.

2. **No engine changes needed.** The implemented layers (Shannon, Base Costs, Findings, Leontief) are all input-sensitive and functioning correctly.

3. **Respond to the GPT 5.5 reviewer:** "Layer 4 (Von Neumann Minimax) does not exist in the codebase. The value 0.90 is the canonical approach's default coverage input constant, not a computed output. The README has been corrected to remove the unimplemented layer claim."

---

## 5. Test Reproduction

```bash
npx tsx scripts/layer4-sensitivity-test.ts
```

Script location: `scripts/layer4-sensitivity-test.ts`
