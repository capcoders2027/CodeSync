# Task: Design the System Architecture

Using the finalized research and product specifications, design a production-quality architecture.

Do NOT write implementation code.

The architecture must support:

1. Authentication
2. IAM / authorization
3. Projects
4. Team Lead / Member roles
5. File system
6. Online editor
7. Real-time collaboration
8. Version history
9. Code execution
10. GitHub integration
11. Python static analysis
12. Python defect-risk prediction
13. Analysis history
14. PDF reports
15. Voice communication

## Critical architectural principle

The research pipeline must remain logically isolated from the collaboration platform.

Design:

Application Layer
        ↓
Analysis Orchestrator
        ↓
Static Analysis
        ↓
Feature Extraction
        ↓
Research Model
        ↓
Prediction / Explanation
        ↓
Analysis Results

Explain:

- services
- APIs
- asynchronous jobs
- storage
- WebSocket layer
- analysis workers
- execution sandbox
- authentication
- authorization
- security boundaries

## Output

Provide:

1. High-level architecture
2. Component architecture
3. Request flows
4. Analysis flow
5. Collaboration flow
6. Code execution flow
7. GitHub import flow
8. Authentication flow
9. Failure handling
10. Security boundaries

Do not generate code yet.