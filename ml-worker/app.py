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
    try:
        models['hgb'] = joblib.load(os.path.join(MODELS_DIR, "model_hgb.joblib"))
        models['rf'] = joblib.load(os.path.join(MODELS_DIR, "model_rf.joblib"))
        models['lr'] = joblib.load(os.path.join(MODELS_DIR, "model_lr.joblib"))

        # Load metadata from JSON
        meta_path = os.path.join(MODELS_DIR, "metadata.json")
        bounds_path = os.path.join(MODELS_DIR, "feature_bounds.json")

        with open(meta_path, 'r') as f:
            meta = json.load(f)

        with open(bounds_path, 'r') as f:
            bounds = json.load(f)

        # Extract feature names from metadata (ordered list is canonical)
        feature_names = meta.get('feature_schema', {}).get('ordered_names', list(bounds.keys()))
        models['meta'] = {'features': feature_names, 'info': meta}

        print(f"Models loaded successfully. Features: {len(feature_names)}")
    except Exception as e:
        print(f"Error loading models: {e}")
        # Not exiting so the API can still return helpful 503s via /health

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
