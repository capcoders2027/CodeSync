import sqlite3
import pandas as pd
from pathlib import Path
import re

DB = Path(r"D:\Capstone\new\V2 db\td_V2.db")
CANDIDATE = Path(r"D:\Capstone\new\V2 db\research_extract\research_dataset\research_candidate_dataset.csv")
OUT = CANDIDATE.parent / "change_feature_audit"

OUT.mkdir(exist_ok=True)

def norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())

def choose(cols, patterns):
    nmap = {norm(c): c for c in cols}
    for pats in patterns:
        for c in cols:
            n = norm(c)
            if all(p in n for p in pats):
                return c
    return None

print("=" * 80)
print("CHANGE-FEATURE AUDIT")
print("=" * 80)

if not DB.exists():
    raise FileNotFoundError(f"Database not found: {DB}")
if not CANDIDATE.exists():
    raise FileNotFoundError(f"Candidate dataset not found: {CANDIDATE}")

con = sqlite3.connect(str(DB))

tables = pd.read_sql_query(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", con
)["name"].tolist()

if "GIT_COMMITS_CHANGES" not in tables:
    raise RuntimeError("GIT_COMMITS_CHANGES table not found.")

schema = pd.read_sql_query("PRAGMA table_info(GIT_COMMITS_CHANGES)", con)
cols = schema["name"].tolist()

print("\nGIT_COMMITS_CHANGES columns:")
for c in cols:
    print("  ", c)

project_col = choose(cols, [["project"]])
commit_col = choose(cols, [["commithash"], ["commit"]])
file_col = choose(cols, [["file"]])
added_col = choose(cols, [["linesadded"], ["added"]])
removed_col = choose(cols, [["linesremoved"], ["removed"]])
date_col = choose(cols, [["date"], ["author"]])

print("\nDetected mapping:")
print("  project      =", project_col)
print("  commit       =", commit_col)
print("  file         =", file_col)
print("  lines_added  =", added_col)
print("  lines_removed=", removed_col)
print("  date         =", date_col)

required = {
    "project": project_col,
    "commit": commit_col,
    "file": file_col,
    "lines_added": added_col,
    "lines_removed": removed_col,
}
missing = [k for k,v in required.items() if v is None]
if missing:
    raise RuntimeError(
        "Could not safely detect required GIT_COMMITS_CHANGES columns: "
        + ", ".join(missing)
    )

candidate = pd.read_csv(CANDIDATE)
print("\nCandidate rows:", len(candidate))
print("Candidate columns:", len(candidate.columns))

# Detect candidate identifiers.
ccols = candidate.columns.tolist()
cand_project = choose(ccols, [["project"]])
cand_commit = choose(ccols, [["commithash"], ["commit"]])
cand_parent = choose(ccols, [["parent"]])

print("\nCandidate mapping:")
print("  project =", cand_project)
print("  commit  =", cand_commit)
print("  parent  =", cand_parent)

if cand_project is None or cand_commit is None:
    raise RuntimeError("Could not safely detect project/commit columns in candidate CSV.")

# Restrict extraction to commits actually present in the candidate dataset.
candidate_keys = candidate[[cand_project, cand_commit]].drop_duplicates()
candidate_keys.columns = ["project", "commit_hash"]

candidate_keys.to_sql("_candidate_keys", con, if_exists="replace", index=False)

q = f"""
SELECT
    c.[{project_col}] AS project,
    c.[{commit_col}] AS commit_hash,
    c.[{file_col}] AS file_path,
    CAST(c.[{added_col}] AS REAL) AS lines_added,
    CAST(c.[{removed_col}] AS REAL) AS lines_removed
FROM GIT_COMMITS_CHANGES c
INNER JOIN _candidate_keys k
    ON c.[{project_col}] = k.project
   AND c.[{commit_col}] = k.commit_hash
"""

changes = pd.read_sql_query(q, con)

print("\nMatched change records:", len(changes))

if len(changes) == 0:
    raise RuntimeError("No GIT_COMMITS_CHANGES records matched candidate commits.")

changes["lines_added"] = pd.to_numeric(changes["lines_added"], errors="coerce").fillna(0)
changes["lines_removed"] = pd.to_numeric(changes["lines_removed"], errors="coerce").fillna(0)

# File-change and directory-change counts.
changes["file_path"] = changes["file_path"].fillna("").astype(str)
changes["directory"] = changes["file_path"].map(
    lambda x: x.rsplit("/", 1)[0] if "/" in x else
              (x.rsplit("\\", 1)[0] if "\\" in x else "")
)

agg = changes.groupby(["project","commit_hash"], as_index=False).agg(
    LINES_ADDED=("lines_added","sum"),
    LINES_REMOVED=("lines_removed","sum"),
    FILES_CHANGED=("file_path", lambda s: s.replace("", pd.NA).dropna().nunique()),
    DIRECTORIES_CHANGED=("directory", lambda s: s.replace("", pd.NA).dropna().nunique()),
)

agg["LINES_CHANGED"] = agg["LINES_ADDED"] + agg["LINES_REMOVED"]

# Coverage of candidate commits.
matched = candidate_keys.merge(agg, on=["project","commit_hash"], how="left")
matched["HAS_CHANGE_RECORD"] = matched["LINES_ADDED"].notna()
for c in ["LINES_ADDED","LINES_REMOVED","LINES_CHANGED","FILES_CHANGED","DIRECTORIES_CHANGED"]:
    matched[c] = matched[c].fillna(0)

matched["HAS_CHANGE_RECORD"] = matched["HAS_CHANGE_RECORD"].astype(int)

# Basic audit statistics.
summary = pd.DataFrame([
    ["candidate_commits", len(candidate_keys)],
    ["commits_with_change_records", int(matched["HAS_CHANGE_RECORD"].sum())],
    ["commits_without_change_records", int((matched["HAS_CHANGE_RECORD"] == 0).sum())],
    ["change_record_coverage", float(matched["HAS_CHANGE_RECORD"].mean())],
    ["total_change_records", len(changes)],
], columns=["metric","value"])

# Distribution audit.
dist = matched[
    ["LINES_ADDED","LINES_REMOVED","LINES_CHANGED","FILES_CHANGED","DIRECTORIES_CHANGED"]
].describe(percentiles=[.25,.5,.75,.9,.95,.99]).T.reset_index()
dist.rename(columns={"index":"feature"}, inplace=True)

# Save everything needed for deciding whether these features are suitable.
schema.to_csv(OUT / "git_commits_changes_schema.csv", index=False)
summary.to_csv(OUT / "change_feature_coverage.csv", index=False)
dist.to_csv(OUT / "change_feature_distributions.csv", index=False)
matched.to_csv(OUT / "candidate_change_features.csv", index=False)

print("\nSaved:")
for p in sorted(OUT.iterdir()):
    print(" ", p)

con.close()
print("\nAUDIT COMPLETE")
