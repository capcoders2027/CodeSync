import joblib
import numpy as np
import json
import os

MODELS_DIR = "models/v1.0.0"

def test_inference():
    print("Testing loaded model inference...")
    
    hgb_path = f"{MODELS_DIR}/model_hgb.joblib"
    meta_path = f"{MODELS_DIR}/metadata.json"
    
    if not os.path.exists(hgb_path):
        print(f"Model not found at {hgb_path}. Please run train_production_model.py first.")
        return
        
    print("Loading model pipeline...")
    pipe = joblib.load(hgb_path)
    
    print("Loading metadata...")
    with open(meta_path, "r") as f:
        metadata = json.load(f)
        
    features = metadata["feature_schema"]["ordered_names"]
    
    # Create a synthetic feature vector
    # Mixture of numerical values, 0s (for history), and np.nan (for missing metrics)
    synthetic_input = np.array([[
        45.0,  # COMPLEXITY
        3.2,   # FILE_COMPLEXITY
        np.nan, # CLASS_COMPLEXITY (will be median imputed)
        2.1,   # FUNCTION_COMPLEXITY
        18.0,  # COGNITIVE_COMPLEXITY
        np.nan, # COVERAGE
        np.nan, # LINE_COVERAGE
        120,   # DUPLICATED_LINES
        5,     # DUPLICATED_BLOCKS
        0,     # DUPLICATED_FILES
        4.3,   # DUPLICATED_LINES_DENSITY
        8,     # CLASSES
        15,    # FILES
        3,     # DIRECTORIES
        42,    # FUNCTIONS
        180,   # STATEMENTS
        25,    # COMMENT_LINES
        12.5,  # COMMENT_LINES_DENSITY
        350,   # LINES
        280,   # NCLOC
        np.nan, # AFFERENT_COUPLINGS
        np.nan, # EFFERENT_COUPLINGS
        8,     # NUMBER_OF_CLASSES_AND_INTERFACES
        5,     # PREVIOUS_COMMITS
        3,     # COMMITS_LAST_30_DAYS
        2,     # COMMITS_LAST_90_DAYS
        4.56,  # LOG1P_LINES_ADDED
        2.30,  # LOG1P_LINES_REMOVED
        5.12,  # LOG1P_LINES_CHANGED
        1.39,  # LOG1P_FILES_CHANGED
        23,    # ACTIVE_SMELLS
        8,     # ACTIVE_SMELL_RULES
        5,     # ACTIVE_SMELL_COMPONENTS
        0.0,   # BLOCKER_SHARE
        0.04,  # CRITICAL_SHARE
        0.61,  # MAJOR_SHARE
        0.35   # MINOR_SHARE
    ]])
    
    assert synthetic_input.shape[1] == len(features), f"Expected {len(features)} features, got {synthetic_input.shape[1]}"
    
    print("Running prediction on synthetic input with NaN values...")
    # Pipeline handles imputation
    prob = pipe.predict_proba(synthetic_input)[0, 1]
    
    print(f"\nPrediction success! Probability of fault-inducing: {prob:.4f}")
    if 0.0 <= prob <= 1.0:
        print("[SUCCESS] Probability is within valid range [0, 1].")
    else:
        print("[ERROR] Probability is outside valid range.")
        
    print("\nPhase 0 Inference Validation Complete.")

if __name__ == "__main__":
    test_inference()
