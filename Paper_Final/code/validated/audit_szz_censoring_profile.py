import os, sqlite3, pandas as pd, numpy as np

BASE = r"D:\Capstone\new\V2 db"
DB = os.path.join(BASE, "td_V2.db")
DATA = os.path.join(BASE, "research_extract", "research_dataset", "augmented_dataset_audit", "research_candidate_augmented.csv")
OUT = os.path.join(BASE, "research_extract", "research_dataset", "model_results")
os.makedirs(OUT, exist_ok=True)

print("="*80)
print("SZZ RIGHT-CENSORING / LABEL-OBSERVABILITY PROFILE")
print("="*80)

df = pd.read_csv(DATA, usecols=[
    "PROJECT_ID","COMMIT_HASH","COMMITTER_DATE","IS_FAULT_INDUCING"
])
df["COMMITTER_DATE"] = pd.to_datetime(df["COMMITTER_DATE"], errors="coerce", utc=True)

con=sqlite3.connect(DB)
git=pd.read_sql_query(
    'SELECT PROJECT_ID, COMMIT_HASH, COMMITTER_DATE FROM GIT_COMMITS', con
)
szz=pd.read_sql_query(
    'SELECT PROJECT_ID, FAULT_FIXING_COMMIT_HASH, FAULT_INDUCING_COMMIT_HASH '
    'FROM SZZ_FAULT_INDUCING_COMMITS', con
)
con.close()

git["COMMITTER_DATE"]=pd.to_datetime(git["COMMITTER_DATE"], errors="coerce", utc=True)
max_date=git["COMMITTER_DATE"].max()
min_date=git["COMMITTER_DATE"].min()
print("Git observation end:", max_date)
print("Git observation start:", min_date)

# Earliest fixing date for each inducing commit.
fix_dates=git[["COMMIT_HASH","COMMITTER_DATE"]].rename(
    columns={"COMMIT_HASH":"FIXING_COMMIT","COMMITTER_DATE":"FIX_DATE"}
)
x=szz.rename(columns={"FAULT_INDUCING_COMMIT_HASH":"INDUCING_COMMIT",
                     "FAULT_FIXING_COMMIT_HASH":"FIXING_COMMIT"})
x=x.merge(fix_dates,on="FIXING_COMMIT",how="left")
earliest=x.groupby("INDUCING_COMMIT",as_index=False)["FIX_DATE"].min()
earliest=earliest.rename(columns={"INDUCING_COMMIT":"COMMIT_HASH",
                                  "FIX_DATE":"EARLIEST_FIX_DATE"})

# Candidate-level follow-up availability.
a=df.merge(earliest,on="COMMIT_HASH",how="left")
a["FOLLOWUP_DAYS"]=(max_date-a["COMMITTER_DATE"]).dt.total_seconds()/86400
a["HAS_SZZ_FIX"]=a["EARLIEST_FIX_DATE"].notna()
a["FIX_WITHIN_OBS_WINDOW"]=a["EARLIEST_FIX_DATE"].notna() & (
    a["EARLIEST_FIX_DATE"] <= max_date
)

print("\nCandidate commits:",len(a))
print("Positive candidates:",int(a["IS_FAULT_INDUCING"].sum()))
print("Negative candidates:",int((a["IS_FAULT_INDUCING"]==0).sum()))
print("Candidates with an SZZ fixing event:",int(a["HAS_SZZ_FIX"].sum()))

print("\nFollow-up days:")
print(a["FOLLOWUP_DAYS"].describe(percentiles=[.01,.05,.10,.25,.5,.75,.9,.95,.99]).to_string())

# Boundary bins chosen as descriptive checkpoints, not proposed censoring cutoffs.
bins=[-1,90,180,365,730,1095,1460,1825,2555,3650,10**9]
labels=["<3m","3-6m","6-12m","1-2y","2-3y","3-4y","4-5y","5-7y","7-10y","10y+"]
a["FOLLOWUP_BIN"]=pd.cut(a["FOLLOWUP_DAYS"],bins=bins,labels=labels)
profile=a.groupby("FOLLOWUP_BIN",observed=False).agg(
    commits=("COMMIT_HASH","size"),
    positives=("IS_FAULT_INDUCING","sum")
).reset_index()
profile["positive_rate"]=profile["positives"]/profile["commits"]
print("\nFollow-up profile:")
print(profile.to_string(index=False))

# Boundary slices by latest follow-up.
for days in [180,365,730,1095,1460,1825,2555]:
    eligible=a["FOLLOWUP_DAYS"]>=days
    print(
        f"At least {days} days follow-up: "
        f"{int(eligible.sum())} commits, "
        f"{int(a.loc[eligible,'IS_FAULT_INDUCING'].sum())} positives, "
        f"positive_rate={a.loc[eligible,'IS_FAULT_INDUCING'].mean():.6f}"
    )

# Project-level boundary profile.
proj=(a.groupby("PROJECT_ID").agg(
    commits=("COMMIT_HASH","size"),
    positives=("IS_FAULT_INDUCING","sum"),
    min_followup_days=("FOLLOWUP_DAYS","min"),
    median_followup_days=("FOLLOWUP_DAYS","median"),
    max_followup_days=("FOLLOWUP_DAYS","max")
).reset_index())
proj.to_csv(os.path.join(OUT,"szz_censoring_project_profile.csv"),index=False)
profile.to_csv(os.path.join(OUT,"szz_censoring_followup_profile.csv"),index=False)
a.to_csv(os.path.join(OUT,"szz_censoring_candidate_profile.csv"),index=False)

print("\nSaved:")
print(os.path.join(OUT,"szz_censoring_project_profile.csv"))
print(os.path.join(OUT,"szz_censoring_followup_profile.csv"))
print(os.path.join(OUT,"szz_censoring_candidate_profile.csv"))
print("\nAUDIT COMPLETE — no models trained.")
