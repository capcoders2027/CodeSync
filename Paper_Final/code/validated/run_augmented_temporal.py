import pandas as pd
import numpy as np
from pathlib import Path

from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score, precision_score, recall_score, f1_score

BASE = Path(r"D:\Capstone\new\V2 db\research_extract\research_dataset")
DATA = BASE / "augmented_dataset_audit" / "research_candidate_augmented.csv"
OUT = BASE / "model_results"
OUT.mkdir(exist_ok=True)

print("="*80)
print("AUGMENTED BASELINE TEMPORAL EXPERIMENT")
print("="*80)

df = pd.read_csv(DATA)

# Same temporal validity rule used by the corrected primary experiments.
parent_key = df["PARENT_ANALYSIS_KEY"].fillna("").astype(str)
parent_date = pd.to_datetime(df["PARENT_ANALYSIS_DATE"], errors="coerce", utc=True)
author_date = pd.to_datetime(df["AUTHOR_DATE"], errors="coerce", utc=True)
committer_date = pd.to_datetime(df["COMMITTER_DATE"], errors="coerce", utc=True)

valid = (
    parent_key.ne("")
    & parent_date.notna()
    & author_date.notna()
    & committer_date.notna()
    & (parent_date <= author_date)
    & (parent_date <= committer_date)
)

df = df.loc[valid].copy()

# Order strictly by author timestamp; ties are broken deterministically by project/commit.
df["_order_date"] = author_date.loc[df.index]
df = df.sort_values(["_order_date","PROJECT_ID","COMMIT_HASH"]).reset_index(drop=True)

print("Final modeling rows:", len(df))
print("Projects:", df["PROJECT_ID"].nunique())
print("Positive rate:", round(df["IS_FAULT_INDUCING"].mean(), 6))

# Primary conventional code group: VIOLATIONS excluded.
C = [
"COMPLEXITY","FILE_COMPLEXITY","CLASS_COMPLEXITY","FUNCTION_COMPLEXITY",
"COGNITIVE_COMPLEXITY","COVERAGE","LINE_COVERAGE","DUPLICATED_LINES",
"DUPLICATED_BLOCKS","DUPLICATED_FILES","DUPLICATED_LINES_DENSITY","CLASSES",
"FILES","DIRECTORIES","FUNCTIONS","STATEMENTS","COMMENT_LINES",
"COMMENT_LINES_DENSITY","LINES","NCLOC","AFFERENT_COUPLINGS",
"EFFERENT_COUPLINGS","NUMBER_OF_CLASSES_AND_INTERFACES"
]

H0 = ["PREVIOUS_COMMITS","COMMITS_LAST_30_DAYS","COMMITS_LAST_90_DAYS"]

HCHANGE = H0 + [
"LOG1P_LINES_ADDED","LOG1P_LINES_REMOVED",
"LOG1P_LINES_CHANGED","LOG1P_FILES_CHANGED"
]

S_BASE = [
"ACTIVE_SMELLS","ACTIVE_SMELL_RULES","ACTIVE_SMELL_COMPONENTS",
"BLOCKER_SHARE","CRITICAL_SHARE","MAJOR_SHARE","MINOR_SHARE"
]

# Derive severity shares from whichever severity-count columns are present.
if "ACTIVE_SMELLS" not in df.columns:
    raise RuntimeError("ACTIVE_SMELLS is missing from the augmented dataset.")

severity_candidates = {
    "BLOCKER_SHARE": ["BLOCKER", "BLOCKER_SMELLS", "SMELLS_BLOCKER",
                      "ACTIVE_BLOCKER_SMELLS", "ACTIVE_BLOCKER"],
    "CRITICAL_SHARE": ["CRITICAL", "CRITICAL_SMELLS", "SMELLS_CRITICAL",
                       "ACTIVE_CRITICAL_SMELLS", "ACTIVE_CRITICAL"],
    "MAJOR_SHARE": ["MAJOR", "MAJOR_SMELLS", "SMELLS_MAJOR",
                    "ACTIVE_MAJOR_SMELLS", "ACTIVE_MAJOR"],
    "MINOR_SHARE": ["MINOR", "MINOR_SMELLS", "SMELLS_MINOR",
                    "ACTIVE_MINOR_SMELLS", "ACTIVE_MINOR"],
}

def resolve_severity_column(candidates):
    for col in candidates:
        if col in df.columns:
            return col
    lower = {str(c).lower(): c for c in df.columns}
    for col in candidates:
        if col.lower() in lower:
            return lower[col.lower()]
    return None

denom = pd.to_numeric(df["ACTIVE_SMELLS"], errors="coerce").replace(0, np.nan)

resolved_severity = {}
for outcol, candidates in severity_candidates.items():
    incol = resolve_severity_column(candidates)
    if incol is None:
        relevant = [
            c for c in df.columns
            if any(k in str(c).upper() for k in ["SEV", "BLOCK", "CRIT", "MAJOR", "MINOR"])
        ]
        raise RuntimeError(
            f"Could not find the source column for {outcol}. "
            f"Relevant columns found: {relevant}"
        )
    resolved_severity[outcol] = incol
    df[outcol] = pd.to_numeric(df[incol], errors="coerce").fillna(0) / denom
    df[outcol] = df[outcol].replace([np.inf, -np.inf], np.nan).fillna(0)

print("Severity source columns:", resolved_severity)

groups = {
    "C": C,
    "C+H": C + H0,
    "C+Hchange": C + HCHANGE,
    "C+Hchange+S": C + HCHANGE + S_BASE
}

seeds = [42,43,44]

def make_model(name, seed):
    if name == "LR":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
            ("model", LogisticRegression(
                max_iter=2000, class_weight="balanced", random_state=seed
            ))
        ])
    if name == "RF":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
            ("model", RandomForestClassifier(
                n_estimators=300, class_weight="balanced",
                min_samples_leaf=2, random_state=seed, n_jobs=-1
            ))
        ])
    if name == "HGB":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("model", HistGradientBoostingClassifier(
                max_iter=300, learning_rate=0.05,
                max_leaf_nodes=31, early_stopping=False,
                random_state=seed
            ))
        ])

models = ["LR","RF","HGB"]

# 70/30 chronological split.
cut = int(len(df) * 0.70)
train = df.iloc[:cut]
test = df.iloc[cut:]

print("Train:", len(train), "Test:", len(test))
print("Test positive rate:", round(test["IS_FAULT_INDUCING"].mean(), 6))

rows = []

for gname, features in groups.items():
    Xtr = train[features]
    Xte = test[features]
    ytr = train["IS_FAULT_INDUCING"].astype(int)
    yte = test["IS_FAULT_INDUCING"].astype(int)

    for model_name in models:
        for seed in seeds:
            model = make_model(model_name, seed)
            if model_name == "HGB":
                pos = max(int(ytr.sum()), 1)
                neg = max(int((ytr == 0).sum()), 1)
                weights = np.where(
                    ytr.to_numpy() == 1,
                    len(ytr) / (2 * pos),
                    len(ytr) / (2 * neg)
                )
                model.fit(Xtr, ytr, model__sample_weight=weights)
            else:
                model.fit(Xtr, ytr)
            prob = model.predict_proba(Xte)[:,1] if hasattr(model, "predict_proba") else model.decision_function(Xte)
            pred = (prob >= 0.5).astype(int)

            rows.append({
                "group": gname,
                "model": model_name,
                "seed": seed,
                "PR_AUC": average_precision_score(yte, prob),
                "ROC_AUC": roc_auc_score(yte, prob),
                "Precision": precision_score(yte, pred, zero_division=0),
                "Recall": recall_score(yte, pred, zero_division=0),
                "F1": f1_score(yte, pred, zero_division=0),
                "test_prevalence": yte.mean()
            })

res = pd.DataFrame(rows)

summary = res.groupby(["group","model"], as_index=False).agg(
    PR_AUC_mean=("PR_AUC","mean"), PR_AUC_sd=("PR_AUC","std"),
    ROC_AUC_mean=("ROC_AUC","mean"), ROC_AUC_sd=("ROC_AUC","std"),
    Precision_mean=("Precision","mean"), Recall_mean=("Recall","mean"),
    F1_mean=("F1","mean"), test_prevalence=("test_prevalence","mean")
)

# Primary incremental effects:
# change-feature history versus original history, and smell addition on the stronger baseline.
wide = summary.pivot(index="model", columns="group", values="PR_AUC_mean").reset_index()
wide["DELTA_CHANGE_HISTORY"] = wide["C+Hchange"] - wide["C+H"]
wide["DELTA_SMELLS_STRONG_BASELINE"] = wide["C+Hchange+S"] - wide["C+Hchange"]

res.to_csv(OUT/"augmented_temporal_results.csv", index=False)
summary.to_csv(OUT/"augmented_temporal_summary.csv", index=False)
wide.to_csv(OUT/"augmented_temporal_deltas.csv", index=False)

print("\nSaved:")
print(OUT/"augmented_temporal_results.csv")
print(OUT/"augmented_temporal_summary.csv")
print(OUT/"augmented_temporal_deltas.csv")

print("\nSummary:")
print(wide.to_string(index=False))
print("\nEXPERIMENT COMPLETE")
