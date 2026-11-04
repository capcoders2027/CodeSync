import sqlite3
import pandas as pd
import numpy as np
from pathlib import Path

DB = Path(r"D:\Capstone\new\V2 db\td_V2.db")
CANDIDATE = Path(r"D:\Capstone\new\V2 db\research_extract\research_dataset\research_candidate_dataset.csv")
OUT = CANDIDATE.parent / "augmented_dataset_audit"
OUT.mkdir(exist_ok=True)

print("="*80)
print("AUGMENTED CHANGE/HISTORY DATASET AUDIT")
print("="*80)

cand = pd.read_csv(CANDIDATE)
con = sqlite3.connect(str(DB))

# Candidate identifiers.
project_col = "PROJECT_ID"
commit_col = "COMMIT_HASH"

# Pull only changes belonging to candidate commits.
cand_keys = cand[[project_col, commit_col]].drop_duplicates()
cand_keys.columns = ["project", "commit_hash"]
cand_keys.to_sql("_cand_aug_keys", con, if_exists="replace", index=False)

q = """
SELECT
    c.PROJECT_ID AS project,
    c.COMMIT_HASH AS commit_hash,
    c.FILE AS file_path,
    CAST(c.LINES_ADDED AS REAL) AS lines_added,
    CAST(c.LINES_REMOVED AS REAL) AS lines_removed
FROM GIT_COMMITS_CHANGES c
INNER JOIN _cand_aug_keys k
 ON c.PROJECT_ID = k.project
AND c.COMMIT_HASH = k.commit_hash
"""
changes = pd.read_sql_query(q, con)

changes["lines_added"] = pd.to_numeric(changes["lines_added"], errors="coerce").fillna(0)
changes["lines_removed"] = pd.to_numeric(changes["lines_removed"], errors="coerce").fillna(0)
changes["file_path"] = changes["file_path"].fillna("").astype(str)

agg = changes.groupby(["project","commit_hash"], as_index=False).agg(
    LINES_ADDED=("lines_added","sum"),
    LINES_REMOVED=("lines_removed","sum"),
    FILES_CHANGED=("file_path", lambda x: x[x.ne("")].nunique())
)
agg["LINES_CHANGED"] = agg["LINES_ADDED"] + agg["LINES_REMOVED"]

aug = cand.merge(
    agg, left_on=[project_col,commit_col], right_on=["project","commit_hash"], how="left"
)

for c in ["LINES_ADDED","LINES_REMOVED","LINES_CHANGED","FILES_CHANGED"]:
    aug[c] = aug[c].fillna(0)

# Proposed transformed variables.
for c in ["LINES_ADDED","LINES_REMOVED","LINES_CHANGED","FILES_CHANGED"]:
    aug["LOG1P_"+c] = np.log1p(aug[c])

# Basic safety checks.
checks = {
    "candidate_rows": len(cand),
    "augmented_rows": len(aug),
    "duplicate_project_commit": int(aug.duplicated([project_col,commit_col]).sum()),
    "zero_lines_added": int((aug["LINES_ADDED"] == 0).sum()),
    "zero_lines_removed": int((aug["LINES_REMOVED"] == 0).sum()),
    "zero_files_changed": int((aug["FILES_CHANGED"] == 0).sum()),
    "negative_lines_added": int((aug["LINES_ADDED"] < 0).sum()),
    "negative_lines_removed": int((aug["LINES_REMOVED"] < 0).sum()),
}

pd.DataFrame(list(checks.items()), columns=["check","value"]).to_csv(
    OUT/"augmented_feature_checks.csv", index=False
)

# Correlation with target for descriptive audit only.
audit_cols = [
    "LINES_ADDED","LINES_REMOVED","LINES_CHANGED","FILES_CHANGED",
    "LOG1P_LINES_ADDED","LOG1P_LINES_REMOVED","LOG1P_LINES_CHANGED","LOG1P_FILES_CHANGED"
]
corr = aug[audit_cols + ["IS_FAULT_INDUCING"]].corr()["IS_FAULT_INDUCING"].drop("IS_FAULT_INDUCING")
corr.sort_values(key=lambda s: s.abs(), ascending=False).rename("target_correlation").to_csv(
    OUT/"augmented_feature_target_correlations.csv"
)

# Distribution after log transformation.
dist = aug[audit_cols].describe(percentiles=[.25,.5,.75,.9,.95,.99]).T
dist.to_csv(OUT/"augmented_feature_distributions.csv")

# Save augmented dataset for later modeling.
aug.to_csv(OUT/"research_candidate_augmented.csv", index=False)

print("\nSaved:")
for p in sorted(OUT.iterdir()):
    print(" ", p)

print("\nChecks:")
for k,v in checks.items():
    print(f"{k}: {v}")

con.close()
print("\nAUDIT COMPLETE")
