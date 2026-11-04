from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import joblib
import json
import os

app = FastAPI(title="CodeSync ML Predictor API")

# Load models on startup
MODELS_DIR = "models/v1.0.0"
models = {}

@app.on_event("startup")
def load_models():
    # Load each model independently so that a failure in one (e.g. large LFS model in constrained environments)
    # does not prevent the primary production model (HGB) from serving predictions.
    for name in ['hgb', 'lr', 'rf']:
        model_path = os.path.join(MODELS_DIR, f"model_{name}.joblib")
        if os.path.exists(model_path):
            try:
                models[name] = joblib.load(model_path)
                print(f"[ML Worker] Loaded model: {name}")
            except Exception as e:
                print(f"[ML Worker] Could not load model '{name}': {e}")
        else:
            print(f"[ML Worker] Model file not found: {model_path}")

    # Load metadata and feature schema
    try:
        meta_path = os.path.join(MODELS_DIR, "metadata.json")
        bounds_path = os.path.join(MODELS_DIR, "feature_bounds.json")

        with open(meta_path, 'r') as f:
            meta = json.load(f)

        with open(bounds_path, 'r') as f:
            bounds = json.load(f)

        feature_names = meta.get('feature_schema', {}).get('ordered_names', list(bounds.keys()))
        models['meta'] = {'features': feature_names, 'info': meta}

        print(f"[ML Worker] Models initialized successfully. Available: {[k for k in models.keys() if k != 'meta']}")
    except Exception as e:
        print(f"[ML Worker] Error loading metadata/schema: {e}")

@app.get("/health")
def health_check():
    """Health check endpoint for Docker orchestration."""
    return {
        "status": "ok",
        "models_loaded": bool(models),
        "available_models": [k for k in models.keys() if k != 'meta'],
    }

class PredictionRequest(BaseModel):
    features: dict

@app.post("/predict")
def predict_fault_risk(request: PredictionRequest):
    if 'hgb' not in models or 'meta' not in models:
        raise HTTPException(
            status_code=503,
            detail="Models not loaded. Check ml-worker startup logs."
        )

    try:
        expected_features = models['meta']['features']

        # Build a single-row DataFrame, filling any missing features with NaN
        row = {feat: request.features.get(feat, float('nan')) for feat in expected_features}
        df = pd.DataFrame([row])

        # Reorder columns to match training order
        X = df[expected_features]

        # Use HGB model as primary (best PR-AUC in validation)
        prob = float(models['hgb'].predict_proba(X)[0][1])

        return {
            "status": "success",
            "model": "HistGradientBoostingClassifier",
            "fault_probability": prob,
            "is_risky": prob > 0.5,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
