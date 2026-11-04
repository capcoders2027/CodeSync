from pathlib import Path
import pandas as pd
import numpy as np
from scipy.stats import wilcoxon

path = Path(r"research_dataset\model_results\augmented_rolling_deltas.csv")
if not path.exists():
    raise FileNotFoundError(f"Cannot find {path}")

df = pd.read_csv(path)
print("=" * 80)
print("AUGMENTED ROLLING STATISTICAL ANALYSIS")
print("=" * 80)
print("Rows:", len(df))
print("Columns:", list(df.columns))

# Accept either long-format deltas or a model/window table containing DELTA_SMELLS.
if "DELTA_SMELLS" not in df.columns:
    raise RuntimeError("DELTA_SMELLS column is missing from augmented_rolling_deltas.csv")

# Detect model column robustly.
model_col = next((c for c in ["model", "MODEL", "Model"] if c in df.columns), None)
if model_col is None:
    raise RuntimeError("Could not find model column.")

rows = []
for model, g in df.groupby(model_col):
    x = pd.to_numeric(g["DELTA_SMELLS"], errors="coerce").dropna()
    n = len(x)
    positive = int((x > 0).sum())
    median = float(x.median())
    mean = float(x.mean())
    sd = float(x.std(ddof=1)) if n > 1 else np.nan
    q1, q3 = (x.quantile(0.25), x.quantile(0.75)) if n else (np.nan, np.nan)
    try:
        stat, p = wilcoxon(x, alternative="two-sided", zero_method="wilcox")
    except ValueError:
        stat, p = np.nan, np.nan
    rows.append({
        "model": model, "n_windows": n, "mean_delta": mean,
        "median_delta": median, "sd": sd, "q1": q1, "q3": q3,
        "positive_windows": positive, "wilcoxon_stat": stat,
        "wilcoxon_p": p
    })

out = pd.DataFrame(rows)
print("\nSMELL INCREMENTAL VALUE")
print(out.to_string(index=False))

# Holm correction across the three model-level Wilcoxon tests.
valid = out["wilcoxon_p"].notna()
pvals = out.loc[valid, "wilcoxon_p"].to_numpy()
order = np.argsort(pvals)
holm = np.full(len(pvals), np.nan)
m = len(pvals)
for rank, idx in enumerate(order):
    holm[idx] = min(1.0, (m - rank) * pvals[idx])
# enforce monotonicity
for j in range(1, len(order)):
    holm[order[j]] = max(holm[order[j]], holm[order[j-1]])

out.loc[valid, "holm_p"] = holm
print("\nWITH HOLM CORRECTION")
print(out[["model","wilcoxon_p","holm_p"]].to_string(index=False))

# Save next to the input file.
out_path = path.with_name("augmented_rolling_statistical_analysis.csv")
out.to_csv(out_path, index=False)
print("\nSaved:", out_path)
