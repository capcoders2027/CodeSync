# Task: Design the Data Model

Create the complete logical data model for the platform.

Entities should cover, where justified:

- User
- Project
- ProjectMember
- Role
- File
- Folder
- FileVersion
- ProjectVersion
- Analysis
- AnalysisResult
- CodeSmell
- Prediction
- ModelVersion
- Comment
- Activity
- GitHubIntegration
- VoiceSession

Do not blindly create entities just because they are listed above.

Determine the correct relationships.

For every entity specify:

- purpose
- fields
- primary key
- foreign keys
- indexes
- constraints
- lifecycle

Also define:

- authorization relationships
- project ownership
- Team Lead restrictions
- delegated analysis permissions
- version-to-analysis relationships

## Output

Provide:

1. ER model
2. Entity definitions
3. Relationships
4. Important indexes
5. Data lifecycle
6. Analysis-result storage design
7. Audit/activity design

Do not write SQL yet.