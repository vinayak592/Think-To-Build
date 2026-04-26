# GSD State

## Last Session Summary
Codebase mapping complete.
- 5 main components identified (Backend, CLIP Service, API, AI Services, Frontend)
- 12 production dependencies analyzed
- 4 technical debt items found

## Current Context
The system is a real-time AI competition platform. Registration is currently showing as closed in the UI despite only 24 teams being in the DB, likely due to a state mismatch or UI-side check. The event is currently in 'started' state.
