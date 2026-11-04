# Task: Design Real-Time Collaborative Editing

Design the collaborative editor subsystem.

Requirements:

- multiple users may edit the same project
- simultaneous editing should be supported
- users see each other's cursor
- users see selections
- users see active files
- users see presence
- edits must synchronize reliably
- conflicts must be handled safely

Compare:

1. OT
2. CRDT
3. server-authoritative synchronization

Choose one approach and justify it.

Do not choose based on popularity alone.

Consider:

- implementation complexity
- correctness
- concurrent editing
- offline behavior
- scalability
- capstone development time

Also define:

- WebSocket protocol
- document synchronization
- presence
- cursor updates
- persistence
- reconnection
- conflict recovery

The design must allow future expansion to voice/video collaboration.

Do not implement yet.