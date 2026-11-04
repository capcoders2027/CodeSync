import os
import warnings
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.utils.class_weight import compute_sample_weight

warnings.filterwarnings("ignore")

BASE = r"D:\Capstone\new\V2 db\research_extract"
DATA = os.path.join(BASE, "research_dataset", "augmented_dataset_audit", "research_candidate_augmented.csv")
OUT = os.path.join(BASE, "research_dataset", "model_results")
os.makedirs(OUT, exist_ok=True)

C = [
    "COMPLEXITY","FILE_COMPLEXITY","CLASS_COMPLEXITY","FUNCTION_COMPLEXITY",
    "COGNITIVE_COMPLEXITY","COVERAGE","LINE_COVERAGE","DUPLICATED_LINES",
    "DUPLICATED_BLOCKS","DUPLICATED_FILES","DUPLICATED_LINES_DENSITY",
    "CLASSES","FILES","DIRECTORIES","FUNCTIONS","STATEMENTS","COMMENT_LINES",
    "COMMENT_LINES_DENSITY","LINES","NCLOC","AFFERENT_COUPLINGS",
    "EFFERENT_COUPLINGS","NUMBER_OF_CLASSES_AND_INTERFACES"
]
H = ["PREVIOUS_COMMITS","COMMITS_LAST_30_DAYS","COMMITS_LAST_90_DAYS"]
CHANGE = ["LOG1P_LINES_ADDED","LOG1P_LINES_REMOVED","LOG1P_LINES_CHANGED","LOG1P_FILES_CHANGED"]
S = ["ACTIVE_SMELLS","ACTIVE_SMELL_RULES","ACTIVE_SMELL_COMPONENTS",
     "BLOCKER_SHARE","CRITICAL_SHARE","MAJOR_SHARE","MINOR_SHARE"]

GROUPS = {
    "C+H+Change": C + H + CHANGE,
    "C+H+Change+S": C + H + CHANGE + S,
}

def make_model(name, seed=42):
    if name == "LR":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("model", LogisticRegression(max_iter=2000, class_weight="balanced",
                                         random_state=seed))
        ])
    if name == "RF":
        return Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("model", RandomForestClassifier(
                n_estimators=300, class_weight="balanced",
                min_samples_leaf=2, random_state=seed, n_jobs=-1
            ))
        ])
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("model", HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.05, max_leaf_nodes=31,
            early_stopping=False, random_state=seed
        ))
    ])

def fit_predict(name, Xtr, ytr, Xte):
    model = make_model(name, 42)
    if name == "HGB":
        w = compute_sample_weight("balanced", ytr)
        model.fit(Xtr, ytr, model__sample_weight=w)
    else:
        model.fit(Xtr, ytr)
    return model.predict_proba(Xte)[:, 1]

print("=" * 80)
print("AUGMENTED LOPO — FINAL COMPARISON, SEED 42")
print("=" * 80)
print("Only the scientifically necessary comparison is run:")
print("C+H+Change  vs  C+H+Change+S")
print("Models: LR, RF, HGB | Seed: 42")
print()

df = pd.read_csv(DATA)
print("Loaded rows:", len(df))

df["PARENT_ANALYSIS_DATE"] = pd.to_datetime(df["PARENT_ANALYSIS_DATE"], errors="coerce", utc=True)
df["COMMITTER_DATE"] = pd.to_datetime(df["COMMITTER_DATE"], errors="coerce", utc=True)

invalid = (
    df["PARENT_ANALYSIS_DATE"].isna()
    | df["COMMITTER_DATE"].isna()
    | (df["PARENT_ANALYSIS_DATE"] > df["COMMITTER_DATE"])
    | df["PARENT_ANALYSIS_KEY"].isna()
    | (df["PARENT_ANALYSIS_KEY"].astype(str).str.strip() == "")
)
print("Excluded invalid/unusable rows:", int(invalid.sum()))
df = df.loc[~invalid].copy()
df = df.sort_values(["COMMITTER_DATE","PROJECT_ID","COMMIT_HASH"]).reset_index(drop=True)

for outcol, source in {
    "BLOCKER_SHARE":"ACTIVE_BLOCKER_SMELLS",
    "CRITICAL_SHARE":"ACTIVE_CRITICAL_SMELLS",
    "MAJOR_SHARE":"ACTIVE_MAJOR_SMELLS",
    "MINOR_SHARE":"ACTIVE_MINOR_SMELLS",
}.items():
    if source not in df.columns:
        raise RuntimeError(f"Missing severity column: {source}")
    denom = pd.to_numeric(df["ACTIVE_SMELLS"], errors="coerce").replace(0, np.nan)
    df[outcol] = (
        pd.to_numeric(df[source], errors="coerce").fillna(0)
        .div(denom).replace([np.inf, -np.inf], np.nan).fillna(0)
    )

missing = sorted(set(sum(GROUPS.values(), [])) - set(df.columns))
if missing:
    raise RuntimeError(f"Missing modeling columns: {missing}")

print("Final modeling rows:", len(df))
print("Projects:", df["PROJECT_ID"].nunique())
print("Overall positive rate:", f"{df['IS_FAULT_INDUCING'].mean():.6f}")

rows = []
skipped = []
projects = sorted(df["PROJECT_ID"].dropna().unique(), key=str)

for i, project in enumerate(projects, 1):
    test = df[df["PROJECT_ID"] == project]
    train = df[df["PROJECT_ID"] != project]
    ytr = train["IS_FAULT_INDUCING"].astype(int)
    yte = test["IS_FAULT_INDUCING"].astype(int)

    if ytr.nunique() < 2 or yte.nunique() < 2:
        skipped.append({
            "project": project, "test_rows": len(test),
            "positive_rows": int(yte.sum()), "reason": "single-class train/test"
        })
        print(f"SKIP {i}/{len(projects)}: {project}")
        continue

    print(f"PROJECT {i}/{len(projects)}: {project} | test={len(test)} | "
          f"positive_rate={yte.mean():.4f}")

    for group_name, features in GROUPS.items():
        for model_name in ["LR", "RF", "HGB"]:
            p = fit_predict(model_name, train[features], ytr, test[features])
            rows.append({
                "project": project,
                "seed": 42,
                "model": model_name,
                "feature_group": group_name,
                "PR_AUC": average_precision_score(yte, p),
                "ROC_AUC": roc_auc_score(yte, p),
                "test_rows": len(test),
                "test_positive_rate": float(yte.mean())
            })

results = pd.DataFrame(rows)
result_path = os.path.join(OUT, "augmented_lopo_seed42_results.csv")
delta_path = os.path.join(OUT, "augmented_lopo_seed42_deltas.csv")
skipped_path = os.path.join(OUT, "augmented_lopo_seed42_skipped.csv")

results.to_csv(result_path, index=False)

wide = results.pivot_table(
    index=["project","seed","model"],
    columns="feature_group",
    values="PR_AUC"
).reset_index()
wide["DELTA_SMELLS"] = wide["C+H+Change+S"] - wide["C+H+Change"]
wide.to_csv(delta_path, index=False)
pd.DataFrame(skipped).to_csv(skipped_path, index=False)

print("\nSaved:")
print(result_path)
print(delta_path)
print(skipped_path)

print("\nLOPO seed-42 smell deltas:")
print(
    wide.groupby("model")["DELTA_SMELLS"]
    .agg(["count","mean","median","std"])
    .to_string()
)
print("\nPositive project deltas:")
print(
    wide.groupby("model")["DELTA_SMELLS"]
    .apply(lambda x: int((x > 0).sum()))
    .to_string()
)
print("\nEXPERIMENT COMPLETE")
