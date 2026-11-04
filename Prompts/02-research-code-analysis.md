# Task: Reverse Engineer the Research Implementation

Analyze the implementation contained in:

PAPER_FINAL.zip

Focus especially on:

paper_source/

and all source-code / notebooks / scripts / configuration / datasets / model files related to the research implementation.

The goal is NOT to improve the code yet.

The goal is to understand exactly how the research pipeline works.

Trace the complete pipeline:

Raw input
→ preprocessing
→ feature extraction
→ feature transformation
→ model input
→ prediction
→ evaluation

For every stage, identify:

- input
- output
- dependencies
- assumptions
- required files
- required metadata
- required historical information
- required repository information
- whether it can operate on an arbitrary new Python project

Pay special attention to:

1. Code-smell extraction
2. Static metrics
3. Historical metrics
4. Change metrics
5. Target construction
6. Model inference
7. Feature ordering
8. Feature normalization/scaling
9. Encoders
10. Saved model artifacts
11. Dataset dependencies

## Critical question

Determine exactly what happens if a user uploads:

example_project/
    main.py
    auth.py
    database.py

Can the current implementation analyze it?

If YES:
Explain exactly how.

If NO:
Explain exactly what is missing.

Then determine the minimum additional pipeline needed to support live analysis of new Python projects.

## Output

Produce:

1. Current pipeline
2. Live-analysis pipeline
3. Missing components
4. Research assumptions
5. Risks of deploying the research model
6. Recommended adaptation strategy

Do not redesign the entire application yet.