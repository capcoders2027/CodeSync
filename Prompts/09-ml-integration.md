# Task: Integrate the Research Model Into a Live Product

Design how the trained research model should be used in production.

Do not retrain blindly on every user project.

Define:

- model artifact
- model version
- feature schema
- preprocessing artifact
- inference service
- model loading
- input validation
- prediction output
- confidence/score semantics
- explainability
- model versioning
- reproducibility

Critically evaluate whether the research model can legitimately produce predictions for arbitrary new Python projects.

If not, explain the limitation and propose the most scientifically defensible product design.

Do NOT claim that the model detects actual bugs unless supported by the paper.

The final UI must distinguish:

Static analysis:
"This code exhibits X."

ML:
"This instance has predicted defect risk Y based on the model."

## Output

Provide:

1. ML inference architecture
2. Feature contract
3. Model artifact contract
4. Prediction schema
5. Explainability design
6. Failure cases
7. Out-of-distribution concerns
8. Model limitations
9. Recommended safeguards