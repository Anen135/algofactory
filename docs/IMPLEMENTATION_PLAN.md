# Data Factory — implementation plan

## Исходное состояние
Пустой каталог. Стек: TypeScript strict, Phaser 4, Vite, Vitest, HTML/CSS, без React.

## Архитектура и решения
- `src/core`: типизированные значения, определения машин, граф, валидатор, детерминированная очередь событий. Без DOM, Phaser, таймеров и LocalStorage.
- `src/content`: 10 уровней, открытые/скрытые тесты и декларативные tutorial steps.
- `src/state`: модель редактора, команды undo/redo, сохранения, прогресс, управление выполнением. Зависит только от core/content.
- `src/renderer`: Phaser Scene, камера, сетка, drag/drop, порты, линии, пакеты. Читает модель, вызывает команды state.
- `src/ui`: HTML-панели, инспектор, тесты, настройки, карта, Code View.
- `src/code`: FactoryGraph → typed IR → Python/JavaScript. Не зависит от Phaser.

Потоки конечны. Каждый output передаёт значения и сигнал завершения. Машина готова после завершения подключённых входов; обработчик получает упорядоченные потоки. Singleton broadcasting позволяет применять константу ко всем элементам. Split, Stack, Queue и Join сохраняют границы одного запуска. Step выполняет ровно одно событие (process / emit / transfer / close). Frame loop влияет только на скорость воспроизведения. MVP запрещает графовые циклы; будущие циклы требуют отдельной модели control flow, а не случайной обратной связи. Runtime имеет лимит событий и проверки типов.

## Последовательность небольших задач
1. Bootstrap: package scripts, tsconfig, Vite base `./`, shell UI, Vitest smoke; install → typecheck → test → build.
2. Core: values/ports/registry, immutable graph snapshots, serialization, validation; unit tests.
3. Машины: Source, Output, Split, Join, Constant, Arithmetic, Comparator, Branch, Filter, Stack, Queue, Memory; edge cases и regression tests.
4. Execution: очередь событий, packets, snapshots инспектора, budget, test runner; typecheck → test → build.
5. Content: 10 полноценных уровней; reference factories только в тестах; проверка всех visible/hidden cases.
6. State: edit/run/pause/step/speed, команды истории, per-level autosave и progress.
7. Renderer: grid/pan/zoom, drag/drop/snapping, выбор, порты/соединения, удаление, направление, пакетная анимация.
8. UI: palette, уровень, inspector/configuration, tests/console, tutorial, карта и медали.
9. IR/code: registry-independent intermediate nodes, два генератора, честное отображение stream semantics.
10. Polish: adaptive desktop layout, keyboard/help/settings, состояния ошибок и успеха, sound hook.
11. Документация: README, architecture, game design, adding machine/level.
12. QA: unit/integration tests, tsc, production build, браузерная проверка доступными средствами; зафиксировать результаты и ограничения.

## Quality gates
После bootstrap, core/content, editor/UI и final QA: `npm run typecheck`, `npm test`, `npm run build`. Серьёзные найденные дефекты сопровождаются regression tests. Не сериализовать renderer objects. Не перерисовывать DOM на каждый animation frame.

## Acceptance
Игрок строит решение из пустого поля, соединяет и настраивает машины, видит packets и runtime inspector, использует pause/step/speed, проходит все тесты, получает статистику, переключает уровни и продолжает после reload. Все 10 уровней имеют подтверждённые исполнимые решения. Сохранения версионированы; undo/redo покрывает все изменения графа.
