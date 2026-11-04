# Task: Security Architecture

Design the security model for the collaborative coding platform.

Threats include:

- malicious code execution
- infinite loops
- filesystem attacks
- network abuse
- resource exhaustion
- unauthorized project access
- unauthorized analysis
- WebSocket abuse
- malicious uploaded projects
- GitHub token leakage
- privilege escalation
- collaboration message injection

Design security for:

## Authentication

## IAM

Roles:

- Team Lead
- Member

The Team Lead controls who can perform research analysis.

## Code execution sandbox

Define:

- CPU limit
- memory limit
- timeout
- filesystem isolation
- process isolation
- network policy
- package restrictions

## Analysis workers

Ensure analysis cannot compromise the main application.

## GitHub OAuth

Define safe token handling.

## Collaboration

Define authorization for:

- joining projects
- editing
- viewing files
- analysis
- comments
- project settings

Do not write implementation code.