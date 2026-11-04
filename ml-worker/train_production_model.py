import pandas as pd
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, make_scorer
import joblib
import json
import os
from datetime import datetime

# Exact 37-feature schema from research
FEATURES = [
    "COMPLEXITY", "FILE_COMPLEXITY", "CLASS_COMPLEXITY", "FUNCTION_COMPLEXITY",
    "COGNITIVE_COMPLEXITY", "COVERAGE", "LINE_COVERAGE", "DUPLICATED_LINES",
    "DUPLICATED_BLOCKS", "DUPLICATED_FILES", "DUPLICATED_LINES_DENSITY",
    "CLASSES", "FILES", "DIRECTORIES", "FUNCTIONS", "STATEMENTS",
    "COMMENT_LINES", "COMMENT_LINES_DENSITY", "LINES", "NCLOC",
    "AFFERENT_COUPLINGS", "EFFERENT_COUPLINGS", "NUMBER_OF_CLASSES_AND_INTERFACES",
    "PREVIOUS_COMMITS", "COMMITS_LAST_30_DAYS", "COMMITS_LAST_90_DAYS",
    "LOG1P_LINES_ADDED", "LOG1P_LINES_REMOVED", "LOG1P_LINES_CHANGED", "LOG1P_FILES_CHANGED",
    "ACTIVE_SMELLS", "ACTIVE_SMELL_RULES", "ACTIVE_SMELL_COMPONENTS",
    "BLOCKER_SHARE", "CRITICAL_SHARE", "MAJOR_SHARE", "MINOR_SHARE"
]

TARGET = "IS_FAULT_INDUCING"
MODELS_DIR = "models/v1.0.0"

def get_class_weights(y):
    classes = np.unique(y)
    weights = len(y) / (len(classes) * np.bincount(y))
    return {classes[0]: weights[0], classes[1]: weights[1]}

def get_sample_weights(y):
    weights = get_class_weights(y)
    return np.array([weights[cls] for cls in y])

def train_and_serialize():
    print("Loading augmented dataset...")
    # Assume it's available in the parent directory or Paper_Final
    data_path = r"D:\Capstone\new\V2 db\research_extract\research_dataset\augmented_dataset_audit\research_candidate_augmented.csv"
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Missing {data_path}. Run dataset build scripts first.")
        
    df = pd.read_csv(data_path)
    
    print(f"Loaded {len(df)} samples.")
    
    # Same filtering as run_augmented_temporal.py
    # Compute smell shares
    for sev in ["BLOCKER", "CRITICAL", "MAJOR", "MINOR"]:
        df[f"{sev}_SHARE"] = np.where(
            df["ACTIVE_SMELLS"] > 0, 
            df[f"ACTIVE_{sev}_SMELLS"] / df["ACTIVE_SMELLS"], 
            0.0
        )
        
    X = df[FEATURES]
    y = df[TARGET]
    
    # Chronological 70/30 split
    df_sorted = df.sort_values(by="AUTHOR_DATE")
    split_idx = int(len(df_sorted) * 0.7)
    
    train_idx = df_sorted.index[:split_idx]
    test_idx = df_sorted.index[split_idx:]
    
    X_train, y_train = X.loc[train_idx], y.loc[train_idx]
    X_test, y_test = X.loc[test_idx], y.loc[test_idx]
    
    print(f"Train samples: {len(X_train)}, Test samples: {len(X_test)}")
    
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    metrics = {}
    
    # 1. HistGradientBoosting (Primary)
    print("Training HGB...")
    pipe_hgb = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("classifier", HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.05, max_leaf_nodes=31,
            early_stopping=False, random_state=42
        ))
    ])
    sample_weights = get_sample_weights(y_train)
    pipe_hgb.fit(X_train, y_train, classifier__sample_weight=sample_weights)
    
    hgb_probs = pipe_hgb.predict_proba(X_test)[:, 1]
    hgb_pr_auc = average_precision_score(y_test, hgb_probs)
    print(f"HGB PR-AUC: {hgb_pr_auc:.4f}")
    joblib.dump(pipe_hgb, f"{MODELS_DIR}/model_hgb.joblib")
    metrics["HGB"] = {"pr_auc": round(hgb_pr_auc, 4)}

    # 2. Random Forest
    print("Training RF...")
    pipe_rf = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("classifier", RandomForestClassifier(
            n_estimators=300, min_samples_leaf=2,
            class_weight="balanced", random_state=42, n_jobs=-1
        ))
    ])
    pipe_rf.fit(X_train, y_train)
    rf_probs = pipe_rf.predict_proba(X_test)[:, 1]
    rf_pr_auc = average_precision_score(y_test, rf_probs)
    print(f"RF PR-AUC: {rf_pr_auc:.4f}")
    joblib.dump(pipe_rf, f"{MODELS_DIR}/model_rf.joblib")
    metrics["RF"] = {"pr_auc": round(rf_pr_auc, 4)}

    # 3. Logistic Regression
    print("Training LR...")
    pipe_lr = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
        ("classifier", LogisticRegression(
            max_iter=2000, class_weight="balanced", random_state=42
        ))
    ])
    pipe_lr.fit(X_train, y_train)
    lr_probs = pipe_lr.predict_proba(X_test)[:, 1]
    lr_pr_auc = average_precision_score(y_test, lr_probs)
    print(f"LR PR-AUC: {lr_pr_auc:.4f}")
    joblib.dump(pipe_lr, f"{MODELS_DIR}/model_lr.joblib")
    metrics["LR"] = {"pr_auc": round(lr_pr_auc, 4)}
    
    # Compute Feature Bounds (1st and 99th percentile on Training set)
    print("Computing feature bounds for OOD detection...")
    bounds = {}
    for feature in FEATURES:
        col = X_train[feature].dropna()
        if len(col) > 0:
            bounds[feature] = {
                "p1": float(np.percentile(col, 1)),
                "p99": float(np.percentile(col, 99))
            }
            
    with open(f"{MODELS_DIR}/feature_bounds.json", "w") as f:
        json.dump(bounds, f, indent=2)

    # Metadata
    metadata = {
        "version": "v1.0.0",
        "created_at": datetime.utcnow().isoformat() + "Z",
        "training_dataset": "td_v2_augmented",
        "training_split": "chronological_70_30",
        "training_seed": 42,
        "training_language": "java",
        "n_training_samples": len(X_train),
        "n_test_samples": len(X_test),
        "positive_prevalence_train": float(y_train.mean()),
        "classifiers": metrics,
        "feature_schema": {
            "ordered_names": FEATURES,
            "total_features": len(FEATURES)
        }
    }
    
    with open(f"{MODELS_DIR}/metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
        
    print(f"Training complete. Models and metadata saved to {MODELS_DIR}")

if __name__ == "__main__":
    train_and_serialize()
