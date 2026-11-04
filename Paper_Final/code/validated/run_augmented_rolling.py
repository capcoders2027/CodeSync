import os
import warnings
import numpy as np
import pandas as pd

from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.metrics import average_precision_score, roc_auc_score, precision_score, recall_score, f1_score

warnings.filterwarnings('ignore')

BASE = r'D:\Capstone\new\V2 db\research_extract'
DATA = os.path.join(BASE, 'research_dataset', 'augmented_dataset_audit', 'research_candidate_augmented.csv')
OUT = os.path.join(BASE, 'research_dataset', 'model_results')
os.makedirs(OUT, exist_ok=True)

CODE_FEATURES = [
    'COMPLEXITY','FILE_COMPLEXITY','CLASS_COMPLEXITY','FUNCTION_COMPLEXITY',
    'COGNITIVE_COMPLEXITY','COVERAGE','LINE_COVERAGE','DUPLICATED_LINES',
    'DUPLICATED_BLOCKS','DUPLICATED_FILES','DUPLICATED_LINES_DENSITY',
    'CLASSES','FILES','DIRECTORIES','FUNCTIONS','STATEMENTS','COMMENT_LINES',
    'COMMENT_LINES_DENSITY','LINES','NCLOC','AFFERENT_COUPLINGS',
    'EFFERENT_COUPLINGS','NUMBER_OF_CLASSES_AND_INTERFACES'
]
HISTORY_FEATURES = ['PREVIOUS_COMMITS','COMMITS_LAST_30_DAYS','COMMITS_LAST_90_DAYS']
CHANGE_FEATURES = [
    'LOG1P_LINES_ADDED','LOG1P_LINES_REMOVED','LOG1P_LINES_CHANGED','LOG1P_FILES_CHANGED'
]
SMELL_FEATURES = [
    'ACTIVE_SMELLS','ACTIVE_SMELL_RULES','ACTIVE_SMELL_COMPONENTS',
    'BLOCKER_SHARE','CRITICAL_SHARE','MAJOR_SHARE','MINOR_SHARE'
]
MODELS = ['LR','RF','HGB']
SEEDS = [42,43,44]


def make_model(name, seed):
    if name == 'LR':
        return Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('scaler', StandardScaler()),
            ('model', LogisticRegression(max_iter=2000, class_weight='balanced', random_state=seed))
        ])
    if name == 'RF':
        return Pipeline([
            ('imputer', SimpleImputer(strategy='median')),
            ('model', RandomForestClassifier(
                n_estimators=300, class_weight='balanced', min_samples_leaf=2,
                random_state=seed, n_jobs=-1
            ))
        ])
    return Pipeline([
        ('imputer', SimpleImputer(strategy='median')),
        ('model', HistGradientBoostingClassifier(
            max_iter=300, learning_rate=0.05, max_leaf_nodes=31,
            early_stopping=False, random_state=seed
        ))
    ])


def fit_predict(model_name, X_train, y_train, X_test, seed):
    model = make_model(model_name, seed)
    if model_name == 'HGB':
        pos = max(int(y_train.sum()), 1)
        neg = max(int((y_train == 0).sum()), 1)
        weights = np.where(
            y_train.to_numpy() == 1,
            len(y_train) / (2 * pos),
            len(y_train) / (2 * neg)
        )
        model.fit(X_train, y_train, model__sample_weight=weights)
    else:
        model.fit(X_train, y_train)
    return model.predict_proba(X_test)[:, 1]


def evaluate(y_true, p):
    pred = (p >= 0.5).astype(int)
    return {
        'PR_AUC': average_precision_score(y_true, p),
        'ROC_AUC': roc_auc_score(y_true, p),
        'Precision': precision_score(y_true, pred, zero_division=0),
        'Recall': recall_score(y_true, pred, zero_division=0),
        'F1': f1_score(y_true, pred, zero_division=0),
    }


print('=' * 80)
print('AUGMENTED ROLLING TEMPORAL EXPERIMENT')
print('=' * 80)

df = pd.read_csv(DATA)
print('Loaded rows:', len(df))

# Required target/time fields.
df['PARENT_ANALYSIS_DATE'] = pd.to_datetime(df['PARENT_ANALYSIS_DATE'], errors='coerce', utc=True)
df['COMMITTER_DATE'] = pd.to_datetime(df['COMMITTER_DATE'], errors='coerce', utc=True)
invalid = (
    df['PARENT_ANALYSIS_DATE'].isna()
    | df['COMMITTER_DATE'].isna()
    | (df['PARENT_ANALYSIS_DATE'] > df['COMMITTER_DATE'])
    | df['PARENT_ANALYSIS_KEY'].isna()
    | (df['PARENT_ANALYSIS_KEY'].astype(str).str.strip() == '')
)
print('Excluded invalid/unusable rows:', int(invalid.sum()))
df = df.loc[~invalid].copy()
df = df.sort_values(['COMMITTER_DATE','PROJECT_ID','COMMIT_HASH']).reset_index(drop=True)

# Derive severity shares from the actual augmented dataset columns.
required_severity = {
    'BLOCKER_SHARE': 'ACTIVE_BLOCKER_SMELLS',
    'CRITICAL_SHARE': 'ACTIVE_CRITICAL_SMELLS',
    'MAJOR_SHARE': 'ACTIVE_MAJOR_SMELLS',
    'MINOR_SHARE': 'ACTIVE_MINOR_SMELLS',
}
missing = [c for c in required_severity.values() if c not in df.columns]
if missing:
    raise RuntimeError(f'Missing severity columns: {missing}')
den = pd.to_numeric(df['ACTIVE_SMELLS'], errors='coerce').replace(0, np.nan)
for out_col, src_col in required_severity.items():
    df[out_col] = pd.to_numeric(df[src_col], errors='coerce').fillna(0).div(den).replace([np.inf,-np.inf], np.nan).fillna(0)

GROUPS = {
    'C': CODE_FEATURES,
    'C+H': CODE_FEATURES + HISTORY_FEATURES,
    'C+H+Change': CODE_FEATURES + HISTORY_FEATURES + CHANGE_FEATURES,
    'C+H+Change+S': CODE_FEATURES + HISTORY_FEATURES + CHANGE_FEATURES + SMELL_FEATURES,
}

# Validate all features before any model fitting. This prevents another expensive
# run from failing halfway through due to a column-name mismatch.
all_features = sorted(set(sum(GROUPS.values(), [])))
missing_features = [c for c in all_features if c not in df.columns]
if missing_features:
    raise RuntimeError(f'Missing modeling columns: {missing_features}')

n = len(df)
test_size = max(1, int(n * 0.05))
starts = [int(n * x / 100) for x in range(50, 100, 5)]
print('Final modeling rows:', n)
print('Projects:', df['PROJECT_ID'].nunique())
print('Overall positive rate:', f"{df['IS_FAULT_INDUCING'].mean():.6f}")
print('Windows:', len(starts), '| test size:', test_size)

rows = []
for window, start in enumerate(starts, 1):
    end = min(start + test_size, n)
    train = df.iloc[:start]
    test = df.iloc[start:end]
    y_train = train['IS_FAULT_INDUCING'].astype(int)
    y_test = test['IS_FAULT_INDUCING'].astype(int)
    if y_train.nunique() < 2 or y_test.nunique() < 2:
        print(f'WINDOW {window}: skipped (single-class train/test)')
        continue
    print(f'WINDOW {window}: train={len(train)} test={len(test)} test_positive_rate={y_test.mean():.4f}')
    for seed in SEEDS:
        for group_name, features in GROUPS.items():
            for model_name in MODELS:
                p = fit_predict(model_name, train[features], y_train, test[features], seed)
                m = evaluate(y_test, p)
                rows.append({
                    'window': window, 'seed': seed, 'model': model_name,
                    'feature_group': group_name, 'train_rows': len(train),
                    'test_rows': len(test), 'test_positive_rate': y_test.mean(), **m
                })

results = pd.DataFrame(rows)
result_path = os.path.join(OUT, 'augmented_rolling_results.csv')
delta_path = os.path.join(OUT, 'augmented_rolling_deltas.csv')
summary_path = os.path.join(OUT, 'augmented_rolling_summary.csv')
results.to_csv(result_path, index=False)

piv = results.pivot_table(
    index=['window','seed','model'], columns='feature_group', values='PR_AUC'
).reset_index()
piv['DELTA_HISTORY'] = piv['C+H'] - piv['C']
piv['DELTA_CHANGE'] = piv['C+H+Change'] - piv['C+H']
piv['DELTA_SMELLS'] = piv['C+H+Change+S'] - piv['C+H+Change']
piv.to_csv(delta_path, index=False)

summary = piv.groupby('model')[['DELTA_HISTORY','DELTA_CHANGE','DELTA_SMELLS']].agg(['mean','median','std']).reset_index()
summary.to_csv(summary_path, index=False)

print('\nSaved:')
print(result_path)
print(delta_path)
print(summary_path)
print('\nSeed-collapsed mean deltas:')
print(piv.groupby('model')[['DELTA_HISTORY','DELTA_CHANGE','DELTA_SMELLS']].mean().to_string())
print('\nEXPERIMENT COMPLETE')
