import os
import pandas as pd
import numpy as np
from scipy.stats import wilcoxon

BASE = r"D:\Capstone\new\V2 db\research_extract"
PATH = os.path.join(BASE, "research_dataset", "model_results", "augmented_lopo_seed42_deltas.csv")
OUT = os.path.join(BASE, "research_dataset", "model_results", "augmented_lopo_seed42_statistical_analysis.csv")

df = pd.read_csv(PATH)
print("=" * 80)
print("AUGMENTED LOPO SEED-42 STATISTICAL ANALYSIS")
print("=" * 80)
print("Rows:", len(df))
print("Projects:", df["project"].nunique())

rows = []
for model, g in df.groupby("model"):
    x = pd.to_numeric(g["DELTA_SMELLS"], errors="coerce").dropna()
    stat, p = wilcoxon(x, zero_method="wilcox", alternative="two-sided")
    rows.append({
        "model": model,
        "n_projects": len(x),
        "mean_delta": x.mean(),
        "median_delta": x.median(),
        "sd": x.std(ddof=1),
        "q1": x.quantile(.25),
        "q3": x.quantile(.75),
        "positive_projects": int((x > 0).sum()),
        "negative_projects": int((x < 0).sum()),
        "zero_projects": int((x == 0).sum()),
        "wilcoxon_stat": stat,
        "wilcoxon_p": p
    })

out = pd.DataFrame(rows)

# Holm correction over the three model tests.
order = np.argsort(out["wilcoxon_p"].to_numpy())
adj = np.empty(len(out))
m = len(out)
for rank, idx in enumerate(order):
    adj[idx] = min(1.0, (m - rank) * out.loc[idx, "wilcoxon_p"])
for rank in range(1, len(order)):
    adj[order[rank]] = max(adj[order[rank]], adj[order[rank-1]])
out["holm_p"] = adj

print("\nLOPO SMELL INCREMENT")
print(out.to_string(index=False))

out.to_csv(OUT, index=False)
print("\nSaved:", OUT)
