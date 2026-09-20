import { topologicalOrder, validateGraph } from '../core/graph';
import { registry } from '../core/machines';
import type { DataValue, FactoryGraph } from '../core/types';
export interface ProgramNode { id: string; operation: string; parameters: Record<string, DataValue>; inputs: Record<string, { node: string; port: string }[]> }
export interface Program { nodes: ProgramNode[]; outputs: string[] }
export function createProgram(graph: FactoryGraph): Program {
  const errors = validateGraph(graph); if (errors.length) throw new Error(errors.join('\n'));
  const names = new Map(graph.machines.map((m, i) => [m.id, `v${i + 1}`]));
  const order = topologicalOrder(graph);
  const ranks = new Map(order.map((m, i) => [m.id, i]));
  const machines = new Map(graph.machines.map(m => [m.id, m]));
  // FIFO scheduler processes DAG nodes in Kahn order. Emissions from a node
  // follow the declared output-port order, independent of connection creation.
  const incoming = [...graph.connections].sort((a, b) => {
    const rank = ranks.get(a.from.machine)! - ranks.get(b.from.machine)!;
    if (rank) return rank;
    const ports = registry.get(machines.get(a.from.machine)!.type).ports.filter(p => p.direction === 'output');
    return ports.findIndex(p => p.id === a.from.port) - ports.findIndex(p => p.id === b.from.port);
  });
  return { nodes: order.map(m => {
    const inputs: ProgramNode['inputs'] = {};
    for (const c of incoming.filter(c => c.to.machine === m.id)) (inputs[c.to.port] ??= []).push({ node: names.get(c.from.machine)!, port: c.from.port });
    return { id: names.get(m.id)!, operation: m.type, parameters: structuredClone(m.config), inputs };
  }), outputs: order.filter(m => m.type === 'output').map(m => names.get(m.id)!) };
}
