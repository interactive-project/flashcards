# Interactive Project Flashcards

Portable front/back/hint/tag/metadata decks and pure Core-compatible study ports. Four policies support ordered, seeded-random, guided and exam-like interaction without a scheduling dependency.

The root exports types, createStudyPorts and ratingConfidence. ./validation uses offline ContentNode/Protocol schemas and semantic duplicate checks. See [decks and study](docs/study-v1.md). Run npm ci --ignore-scripts and npm test. Resumable session tracking and review events follow in flashcards#2.
