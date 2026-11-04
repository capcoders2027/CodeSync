# Task: Design the Live Python Analysis Pipeline

Using the research implementation analysis, design the production pipeline for analyzing a user's Python project.

Input:

A Python project uploaded or stored in the collaborative workspace.

The pipeline should determine:

1. Python source files
2. Static-analysis findings
3. Code smells
4. Required code metrics
5. Required change metrics
6. Required historical metrics
7. Whether each research feature can actually be computed for a live project

For every research feature answer:

- Can it be computed from current source code?
- Can it be computed from the project's version history?
- Does it require Git history?
- Does it require prior labeled defects?
- Can it be approximated?
- Should it be omitted?

Do NOT silently invent values for features that cannot be computed.

If the original model requires features unavailable for a new project, identify the correct strategy.

Possible strategies:

A. model adaptation
B. reduced-feature model
C. project-history initialization
D. feature fallback
E. model only after sufficient project history
F. another justified approach

## Output

Create the exact live-analysis pipeline:

Project
→ file selection
→ preprocessing
→ static analysis
→ feature extraction
→ feature validation
→ model inference
→ explanation
→ stored results

Also identify where research validity could be compromised.