# Task: Deep Analysis of the Research Paper

You are acting as a senior software engineering + machine learning research engineer.

I am developing a capstone software project based on the attached research paper.

The attached archive is:

PAPER_FINAL.zip

Inside it, the `paper_source` folder contains the actual research paper source.

## Your task

DO NOT design the application yet.

First, deeply analyze the research paper and reconstruct exactly what the research does.

Read the complete paper and identify:

1. Research problem
2. Research objectives
3. Research questions
4. Dataset
5. Data collection process
6. Data preprocessing
7. Feature engineering
8. All 37 features, if applicable
9. Feature groups
10. Code-smell features
11. Historical/development features
12. Change-related features
13. Target variable
14. Model(s)
15. Training procedure
16. Validation strategy
17. Experimental configurations
18. Evaluation metrics
19. Results
20. Statistical analysis
21. Main findings
22. Limitations
23. Threats to validity
24. Exact meaning of "defect", "fault-inducing commit", "code smell", etc.

Pay special attention to the difference between:

- detecting a code smell
- predicting defect risk
- identifying an actual bug
- predicting a fault-inducing commit

Do NOT merge these concepts.

## Critical requirement

Determine exactly which parts of the research pipeline can operate on NEW USER CODE.

Separate the system into:

A. Directly reusable in a live application
B. Reusable after preprocessing/adaptation
C. Research-only components
D. Components that cannot realistically operate on arbitrary user projects

## Output

Produce a detailed technical research analysis.

Do not propose technologies yet.

Do not invent missing implementation details.

If something is unclear from the paper, explicitly mark it as:

UNKNOWN / NOT SPECIFIED IN PAPER

The goal is to create a reliable foundation for integrating the research into a real software product.