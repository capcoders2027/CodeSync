# Task: Define the Research-to-Product Boundary

Based strictly on the research paper and implementation analysis, determine how the research should be integrated into an online collaborative coding platform.

The product will support:

- Python
- Java
- JavaScript
- TypeScript

However, the research-backed defect-risk prediction pipeline currently applies only to Python.

Therefore clearly separate:

## Universal functionality

Features that can work for all supported languages.

Examples may include:

- editor
- collaboration
- file management
- execution
- version history
- language-aware syntax
- comments
- project management

## Python research functionality

Only Python projects should receive the research-backed:

- code-smell analysis
- defect-risk prediction
- research metrics
- research model outputs

Do not falsely imply that the model supports Java, JavaScript or TypeScript.

## Determine the exact analysis workflow

Decide whether the product should use:

[Detect Code Smells]
[Predict Defect Risk]

or another workflow.

The decision must be justified from the research methodology.

## Important

Do not call the model a "bug detector" unless the research actually supports that interpretation.

Distinguish:

- code smell
- static-analysis finding
- defect-risk prediction
- actual bug
- fault-inducing commit

## Output

Produce the definitive research/product boundary.

This document should become the source of truth for later architecture and implementation decisions.