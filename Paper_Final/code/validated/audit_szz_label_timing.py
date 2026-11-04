import os, sqlite3, pandas as pd, numpy as np

BASE = r"D:\Capstone\new\V2 db"
DB = os.path.join(BASE, "td_V2.db")
OUT = os.path.join(BASE, "research_extract", "research_dataset", "model_results")
os.makedirs(OUT, exist_ok=True)

print("=" * 80)
print("SZZ LABEL-TIMING / RIGHT-CENSORING AUDIT")
print("=" * 80)

con = sqlite3.connect(DB)
tables = pd.read_sql_query(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", con
)["name"].tolist()

def cols(table):
    return pd.read_sql_query(f'PRAGMA table_info("{table}")', con)["name"].tolist()

szz_cols = cols("SZZ_FAULT_INDUCING_COMMITS")
git_cols = cols("GIT_COMMITS")
print("SZZ columns:", szz_cols)
print("Git columns:", git_cols)

def pick(candidates, available):
    low = {c.lower(): c for c in available}
    for x in candidates:
        if x.lower() in low:
            return low[x.lower()]
    return None

fix_col = pick(["FAULT_FIXING_COMMIT", "FAULT_FIXING_COMMIT_HASH", "FIXING_COMMIT", "FIXING_COMMIT_HASH"], szz_cols)
ind_col = pick(["FAULT_INDUCING_COMMIT", "FAULT_INDUCING_COMMIT_HASH", "INDUCING_COMMIT", "INDUCING_COMMIT_HASH"], szz_cols)
proj_col = pick(["PROJECT_ID", "PROJECT"], szz_cols)

git_hash = pick(["COMMIT_HASH", "HASH"], git_cols)
git_date = pick(["COMMITTER_DATE", "AUTHOR_DATE", "DATE"], git_cols)
git_proj = pick(["PROJECT_ID", "PROJECT"], git_cols)

if not all([fix_col, ind_col, git_hash, git_date]):
    raise RuntimeError(
        f"Could not resolve required columns. fix={fix_col}, inducing={ind_col}, "
        f"git_hash={git_hash}, git_date={git_date}"
    )

print("Resolved:", {"fix": fix_col, "inducing": ind_col, "szz_project": proj_col,
                    "git_hash": git_hash, "git_date": git_date, "git_project": git_proj})

szz = pd.read_sql_query(
    f'SELECT "{fix_col}" AS FIXING_COMMIT, "{ind_col}" AS INDUCING_COMMIT'
    + (f', "{proj_col}" AS PROJECT_ID' if proj_col else '')
    + ' FROM "SZZ_FAULT_INDUCING_COMMITS"',
    con
).drop_duplicates()

git = pd.read_sql_query(
    f'SELECT "{git_hash}" AS COMMIT_HASH, "{git_date}" AS COMMIT_DATE'
    + (f', "{git_proj}" AS PROJECT_ID' if git_proj else '')
    + ' FROM "GIT_COMMITS"',
    con
).drop_duplicates("COMMIT_HASH")

con.close()

szz["FIXING_COMMIT"] = szz["FIXING_COMMIT"].astype(str)
szz["INDUCING_COMMIT"] = szz["INDUCING_COMMIT"].astype(str)
git["COMMIT_HASH"] = git["COMMIT_HASH"].astype(str)
git["COMMIT_DATE"] = pd.to_datetime(git["COMMIT_DATE"], errors="coerce", utc=True)

fix_dates = git[["COMMIT_HASH", "COMMIT_DATE"]].rename(
    columns={"COMMIT_HASH":"FIXING_COMMIT", "COMMIT_DATE":"FIX_DATE"}
)
ind_dates = git[["COMMIT_HASH", "COMMIT_DATE"]].rename(
    columns={"COMMIT_HASH":"INDUCING_COMMIT", "COMMIT_DATE":"INDUCING_DATE"}
)

x = szz.merge(ind_dates, on="INDUCING_COMMIT", how="left")
x = x.merge(fix_dates, on="FIXING_COMMIT", how="left")
x["LABEL_LAG_DAYS"] = (x["FIX_DATE"] - x["INDUCING_DATE"]).dt.total_seconds() / 86400.0

print("\nSZZ links:", len(x))
print("Links with both dates:", int(x[["INDUCING_DATE","FIX_DATE"]].notna().all(axis=1).sum()))
print("Missing fixing dates:", int(x["FIX_DATE"].isna().sum()))
print("Missing inducing dates:", int(x["INDUCING_DATE"].isna().sum()))
print("Negative fix-before-inducing links:", int((x["LABEL_LAG_DAYS"] < 0).sum()))

valid = x["LABEL_LAG_DAYS"].dropna()
if len(valid):
    print("\nLabel-lag days:")
    print(valid.describe(percentiles=[.25,.5,.75,.9,.95,.99]).to_string())

# Map each inducing commit to the earliest known fixing date. For availability,
# the earliest fixing date is the conservative date at which the positive label
# could first have become observable.
earliest = (
    x.dropna(subset=["FIX_DATE"])
     .groupby("INDUCING_COMMIT", as_index=False)["FIX_DATE"]
     .min()
     .rename(columns={"FIX_DATE":"EARLIEST_FIX_DATE"})
)

audit_path = os.path.join(OUT, "szz_label_timing_links.csv")
x.to_csv(audit_path, index=False)
earliest_path = os.path.join(OUT, "szz_inducing_earliest_fix_date.csv")
earliest.to_csv(earliest_path, index=False)

print("\nSaved:")
print(audit_path)
print(earliest_path)

print("\nNOTE: This is an audit only. It does not modify the dataset or rerun models.")
