# Checkpoint — 2026-09-20

## Current state

Data Factory MVP has a working TypeScript/Vite/Phaser 4 project and a Phaser renderer/UI implementation in progress.

Implemented and tested:

- strict TypeScript project bootstrap with Vite, Phaser 4.2.1 and Vitest;
- Phaser-independent simulation core with typed values, machine registry, graph validation, deterministic event stepping, packets and execution limits;
- Source, Output, Constant, Arithmetic, Comparator, Split, Join, Stack, Queue, Branch, Filter and Memory machines;
- ten data-driven levels with visible and hidden tests;
- graph serialization/deserialization and validation;
- level runner, autosave/progress persistence, edit/run/pause/step/speed state, undo/redo and JSON import/export;
- intermediate representation and Python/JavaScript Code View generators;
- Phaser factory field with grid, camera pan/zoom, node dragging, port connections, connection arrows and packet animation;
- dark industrial HTML/CSS UI with machine palette, mission panel, inspector, tests, console, tutorial, level map, settings/help dialogs and responsive desktop layout.

## Verification at checkpoint

- `npm run typecheck` passed;
- `npm test` passed: 53 tests;
- `npm run build` passed. Vite reports the expected Phaser bundle size warning (Phaser chunk is about 1.4 MB minified).

## Known follow-up work

1. Start Vite and perform a browser smoke test of the Phaser canvas, drag/drop, connections, RUN, STEP, inspector and level map.
2. Fix any browser-only issues found during that smoke test.
3. Add the remaining requested documentation files: `README.md`, `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, `docs/ADDING_MACHINE.md`, `docs/ADDING_LEVEL.md`.
4. Review and polish edge cases in renderer lifecycle and runtime display.

## Resume commands

```bash
npm install
npm run dev
npm test
npm run build
```

The current graph/editor model is in `src/state`, simulation core in `src/core`, Phaser code in `src/renderer`, UI in `src/ui`, level data in `src/content/levels`, and code generation in `src/code`.
