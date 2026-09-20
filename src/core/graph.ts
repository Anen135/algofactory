import { configurationError, registry, type MachineRegistry } from './machines';
import type { Connection, FactoryGraph, Machine, PortType } from './types';
import { dataType, isDataValue } from './values';
export const cloneGraph = (graph: FactoryGraph): FactoryGraph => structuredClone(graph);
export function outputTypes(machine: Machine, port: string, definitions = registry): readonly PortType[] {
  if (machine.type === 'constant') return [dataType(machine.config.value)];
  if (machine.type === 'join') return [machine.config.mode === 'array' ? 'array' : 'string'];
  return definitions.get(machine.type).ports.find(p => p.id === port && p.direction === 'output')?.types ?? [];
}
export function connectionError(graph: FactoryGraph, edge: Connection, definitions = registry): string | undefined {
  const from = graph.machines.find(m => m.id === edge.from.machine), to = graph.machines.find(m => m.id === edge.to.machine);
  if (!from || !to) return 'Соединение ссылается на удалённую машину.';
  if (from.id === to.id) return 'Нельзя соединить машину с самой собой.';
  const a = definitions.get(from.type).ports.find(p => p.id === edge.from.port && p.direction === 'output');
  const b = definitions.get(to.type).ports.find(p => p.id === edge.to.port && p.direction === 'input');
  if (!a || !b) return 'Соединяйте выход справа со входом слева.';
  if (graph.connections.some(c => c.id !== edge.id && c.from.machine === from.id && c.to.machine === to.id && c.from.port === a.id && c.to.port === b.id)) return 'Эти порты уже соединены.';
  if (!b.multiple && graph.connections.some(c => c.id !== edge.id && c.to.machine === to.id && c.to.port === b.id)) return `Вход ${b.label} уже подключён. Сначала удалите старую связь.`;
  const types = outputTypes(from, edge.from.port, definitions);
  if (!types.includes('any') && !b.types.includes('any') && !types.some(t => b.types.includes(t) || (t === 'character' && b.types.includes('string')) || (t === 'string' && b.types.includes('character')))) return `Несовместимые типы: ${types.join('/')} → ${b.types.join('/')}.`;
  return undefined;
}
export function topologicalOrder(graph: FactoryGraph): Machine[] {
  const degrees = new Map(graph.machines.map(m => [m.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const c of graph.connections) { degrees.set(c.to.machine, (degrees.get(c.to.machine) ?? 0) + 1); outgoing.set(c.from.machine, [...outgoing.get(c.from.machine) ?? [], c.to.machine]); }
  const queue = graph.machines.filter(m => degrees.get(m.id) === 0), result: Machine[] = [];
  const machines = new Map(graph.machines.map(m => [m.id, m]));
  for (let i = 0; i < queue.length; i++) { const m = queue[i]; result.push(m); for (const id of outgoing.get(m.id) ?? []) { const degree = degrees.get(id)! - 1; degrees.set(id, degree); if (degree === 0 && machines.has(id)) queue.push(machines.get(id)!); } }
  if (result.length !== graph.machines.length) throw new Error('Обнаружен цикл. Уберите обратное соединение: в этой версии потоки должны иметь конец.');
  return result;
}
export function validateGraph(graph: FactoryGraph, definitions: MachineRegistry = registry): string[] {
  const errors: string[] = [];
  if (!graph.machines.some(m => m.type === 'source')) errors.push('Добавьте SOURCE — источник входных данных.');
  if (!graph.machines.some(m => m.type === 'output')) errors.push('Добавьте OUTPUT — приёмник результата.');
  if (new Set(graph.machines.map(m => m.id)).size !== graph.machines.length) errors.push('ID машин должны быть уникальны.');
  if (new Set(graph.connections.map(c => c.id)).size !== graph.connections.length) errors.push('ID соединений должны быть уникальны.');
  for (const m of graph.machines) {
    try { const d = definitions.get(m.type); const configError = configurationError(m, definitions); if (configError) errors.push(configError); for (const p of d.ports.filter(p => p.direction === 'input' && p.required)) if (!graph.connections.some(c => c.to.machine === m.id && c.to.port === p.id)) errors.push(`У машины ${d.name} (${m.id}) не подключён вход ${p.label}.`); }
    catch (e) { errors.push((e as Error).message); }
  }
  for (const edge of graph.connections) { try { const error = connectionError(graph, edge, definitions); if (error) errors.push(error); } catch (e) { errors.push((e as Error).message); } }
  const reachable = new Set(graph.machines.filter(m => m.type === 'source').map(m => m.id));
  let changed = true;
  while (changed) { changed = false; for (const c of graph.connections) if (reachable.has(c.from.machine) && !reachable.has(c.to.machine)) { reachable.add(c.to.machine); changed = true; } }
  for (const m of graph.machines.filter(m => m.type === 'output')) if (!reachable.has(m.id)) errors.push('OUTPUT не получает данные от SOURCE. Соедините их через машины.');
  try { topologicalOrder(graph); } catch (e) { errors.push((e as Error).message); }
  return [...new Set(errors)];
}
export function serializeGraph(graph: FactoryGraph): string { return JSON.stringify(graph); }
export function deserializeGraph(text: string): FactoryGraph {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('Некорректный файл фабрики.');
  const g = value as Record<string, unknown>;
  if (g.version !== 1 || !Array.isArray(g.machines) || !Array.isArray(g.connections) || g.machines.length > 2000 || g.connections.length > 10000) throw new Error('Неизвестный формат или слишком большая фабрика.');
  for (const m of g.machines as Record<string, unknown>[]) {
    if (!m || typeof m.id !== 'string' || typeof m.type !== 'string' || typeof m.x !== 'number' || !Number.isFinite(m.x) || typeof m.y !== 'number' || !Number.isFinite(m.y) || !m.config || typeof m.config !== 'object' || Array.isArray(m.config) || !Object.values(m.config).every(v => isDataValue(v))) throw new Error('Повреждены данные машины.');
    const d = registry.get(m.type);
    for (const key of Object.keys(d.defaults)) if (!(key in m.config)) throw new Error(`Отсутствует параметр ${key}.`);
  }
  for (const c of g.connections as Record<string, unknown>[]) {
    const validEnd = (v: unknown): boolean => !!v && typeof v === 'object' && typeof (v as Record<string, unknown>).machine === 'string' && typeof (v as Record<string, unknown>).port === 'string';
    if (!c || typeof c.id !== 'string' || !validEnd(c.from) || !validEnd(c.to)) throw new Error('Повреждены данные соединения.');
  }
  const graph = g as unknown as FactoryGraph;
  for (const m of graph.machines) { const error = configurationError(m); if (error) throw new Error(error); }
  if (new Set(graph.machines.map(m => m.id)).size !== graph.machines.length || new Set(graph.connections.map(c => c.id)).size !== graph.connections.length) throw new Error('Повторяющиеся ID в сохранении.');
  for (const c of graph.connections) { const error = connectionError(graph, c); if (error) throw new Error(error); }
  topologicalOrder(graph);
  return graph;
}
