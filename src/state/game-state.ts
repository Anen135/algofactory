import { levels } from '../content/levels';
import { cloneGraph, connectionError, deserializeGraph, topologicalOrder } from '../core/graph';
import { runLevel } from '../core/level-runner';
import { configurationError, registry } from '../core/machines';
import { Simulation } from '../core/simulation';
import { emptyGraph, grid, type Connection, type DataValue, type FactoryGraph, type Level, type LevelResult, type SimulationEvent } from '../core/types';
import { Persistence } from './storage';
export interface StateChange { kind: 'graph' | 'selection' | 'runtime' | 'level' | 'message' | 'results'; event?: SimulationEvent }
interface GraphCommand { label: string; before: FactoryGraph; after: FactoryGraph }
export class GameState {
  graph = emptyGraph();
  level: Level;
  selected?: string;
  selectedConnection?: string;
  mode: 'EDIT' | 'RUN' = 'EDIT';
  paused = false;
  speed = 1;
  simulation?: Simulation;
  lastEvent?: SimulationEvent;
  result?: LevelResult;
  sample = 0;
  message = 'Начните с SOURCE. Перетащите машину на поле.';
  log: string[] = [];
  private listeners = new Set<(change: StateChange) => void>();
  private undoStack: GraphCommand[] = [];
  private redoStack: GraphCommand[] = [];
  private elapsed = 0;
  constructor(readonly persistence: Persistence) {
    this.level = levels.find(l => l.id === persistence.currentLevel) ?? levels[0];
    this.graph = persistence.loadGraph(this.level.id) ?? emptyGraph();
    if (persistence.warning) this.message = persistence.warning;
  }
  subscribe(fn: (change: StateChange) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private notify(change: StateChange): void { this.listeners.forEach(fn => fn(change)); }
  report(message: string): void { this.message = message; this.log = [...this.log.slice(-79), message]; this.notify({ kind: 'message' }); }
  select(id?: string, connection?: string): void { this.selected = id; this.selectedConnection = connection; this.notify({ kind: 'selection' }); }
  get canUndo(): boolean { return this.mode === 'EDIT' && this.undoStack.length > 0; }
  get canRedo(): boolean { return this.mode === 'EDIT' && this.redoStack.length > 0; }
  private commit(label: string, mutate: (graph: FactoryGraph) => void): boolean {
    if (this.mode !== 'EDIT') { this.report('Нажмите «В редактор», чтобы изменить фабрику.'); return false; }
    const before = cloneGraph(this.graph), after = cloneGraph(this.graph);
    try { mutate(after); } catch (e) { this.report((e as Error).message); return false; }
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.undoStack.push({ label, before, after }); if (this.undoStack.length > 100) this.undoStack.shift(); this.redoStack = [];
    this.graph = after; this.result = undefined; this.simulation = undefined; this.save(); this.notify({ kind: 'graph' }); return true;
  }
  addMachine(type: string, x: number, y: number): void {
    if (!this.level.availableMachines.includes(type)) return;
    const id = this.nextId('m');
    if (this.commit('Добавить машину', g => g.machines.push({ id, type, x: grid.snap(x), y: grid.snap(y), config: structuredClone(registry.get(type).defaults) }))) this.select(id);
  }
  private nextId(prefix: string): string { let i = 1; const ids = new Set([...this.graph.machines, ...this.graph.connections].map(x => x.id)); while (ids.has(`${prefix}${i}`)) i++; return `${prefix}${i}`; }
  moveMachine(id: string, x: number, y: number): void { this.commit('Переместить машину', g => { const m = g.machines.find(m => m.id === id); if (m) { m.x = grid.snap(x); m.y = grid.snap(y); } }); }
  configure(id: string, key: string, value: DataValue): void {
    this.commit('Изменить параметр', g => {
      const m = g.machines.find(m => m.id === id); if (!m) return;
      if (!registry.get(m.type).fields.some(f => f.key === key)) throw new Error('Неизвестный параметр машины.');
      m.config[key] = value;
      const error = configurationError(m); if (error) throw new Error(error);
      for (const edge of g.connections) { const error = connectionError(g, edge); if (error) throw new Error(`${error} Удалите несовместимую связь перед изменением параметра.`); }
    });
  }
  connect(from: Connection['from'], to: Connection['to']): void {
    const edge: Connection = { id: this.nextId('c'), from, to };
    this.commit('Создать соединение', g => { const error = connectionError(g, edge); if (error) throw new Error(error); g.connections.push(edge); topologicalOrder(g); });
  }
  removeSelected(): void {
    const id = this.selected, edge = this.selectedConnection;
    if (this.commit('Удалить объект', g => { g.machines = g.machines.filter(m => m.id !== id); g.connections = g.connections.filter(c => c.id !== edge && c.from.machine !== id && c.to.machine !== id); })) this.select();
  }
  clear(): void { this.commit('Очистить поле', g => { g.machines = []; g.connections = []; }); this.select(); }
  undo(): void { if (!this.canUndo) return; const c = this.undoStack.pop()!; this.redoStack.push(c); this.graph = cloneGraph(c.before); this.afterHistory(); }
  redo(): void { if (!this.canRedo) return; const c = this.redoStack.pop()!; this.undoStack.push(c); this.graph = cloneGraph(c.after); this.afterHistory(); }
  private afterHistory(): void { this.selected = undefined; this.selectedConnection = undefined; this.simulation = undefined; this.result = undefined; this.save(); this.notify({ kind: 'graph' }); }
  save(): void { this.persistence.saveGraph(this.level.id, this.graph); if (this.persistence.warning) this.report(this.persistence.warning); }
  import(text: string): void { try { const graph = deserializeGraph(text); if (graph.machines.some(m => !this.level.availableMachines.includes(m.type))) throw new Error('В файле есть машины, недоступные на этом уровне.'); this.commit('Импортировать фабрику', g => { g.machines = graph.machines; g.connections = graph.connections; }); this.select(); } catch (e) { this.report((e as Error).message); } }
  loadLevel(id: string): void {
    const level = levels.find(l => l.id === id); if (!level) return;
    this.save(); this.level = level; this.graph = this.persistence.loadGraph(id) ?? emptyGraph(); this.persistence.currentLevel = id;
    this.mode = 'EDIT'; this.paused = false; this.simulation = undefined; this.lastEvent = undefined; this.result = undefined; this.selected = undefined; this.selectedConnection = undefined; this.sample = 0; this.undoStack = []; this.redoStack = []; this.log = []; this.message = this.persistence.warning ?? level.hint; this.notify({ kind: 'level' });
  }
  edit(): void { this.mode = 'EDIT'; this.paused = false; this.elapsed = 0; this.notify({ kind: 'runtime' }); }
  private start(paused: boolean): boolean {
    try {
      this.simulation = new Simulation(this.graph, this.level.tests.filter(t => !t.hidden)[this.sample].input);
      this.mode = 'RUN'; this.paused = paused; this.elapsed = 0; this.result = undefined; this.lastEvent = undefined; this.log = []; this.report('Поток запущен. Выберите машину, чтобы увидеть её состояние.'); this.notify({ kind: 'runtime' }); return true;
    } catch (e) { this.report((e as Error).message); return false; }
  }
  run(): void { if (this.mode === 'RUN' && this.simulation && !this.simulation.done) { this.paused = !this.paused; this.notify({ kind: 'runtime' }); } else this.start(false); }
  step(): void { if (!this.simulation || this.mode === 'EDIT' || this.simulation.done) { if (!this.start(true)) return; } this.paused = true; this.executeStep(); }
  private executeStep(): void {
    const event = this.simulation!.step();
    this.lastEvent = event;
    const labels = { process: 'Обработка', emit: 'Создание пакета', transfer: 'Передача пакета', close: 'Конец потока', done: 'Готово', error: 'Ошибка' };
    const machine = this.graph.machines.find(m => m.id === event.machineId);
    this.log = [...this.log.slice(-79), `#${event.tick} ${labels[event.kind]}${machine ? ` · ${registry.get(machine.type).name} (${machine.id})` : ''}${event.packet ? ` · ${JSON.stringify(event.packet.value)}` : ''}`];
    this.notify({ kind: 'runtime', event });
    if (event.kind === 'done' || event.kind === 'error') this.checkTests();
    if (event.kind === 'error') this.report(event.message!);
  }
  advance(delta: number): void {
    if (this.mode !== 'RUN' || this.paused || !this.simulation || this.simulation.done) return;
    this.elapsed += Math.min(delta, 250);
    const interval = this.speed === 0 ? 0 : 340 / this.speed;
    let budget = this.speed === 0 ? 1000 : 8;
    while (budget-- > 0 && (interval === 0 || this.elapsed >= interval) && !this.simulation.done) { this.elapsed -= interval; this.executeStep(); }
  }
  checkTests(): void {
    this.result = runLevel(this.graph, this.level); this.persistence.record(this.level.id, this.result);
    this.report(this.result.passed ? `Уровень пройден! Все ${this.result.tests.length} тестов успешны.` : `Пройдено ${this.result.tests.filter(t => t.passed).length}/${this.result.tests.length}. Проверьте соединения и параметры.`);
    this.notify({ kind: 'results' });
  }
}
