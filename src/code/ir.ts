import { topologicalOrder, validateGraph } from '../core/graph';
import type { DataValue, FactoryGraph } from '../core/types';
export interface ProgramNode { id: string; operation: string; parameters: Record<string, DataValue>; inputs: Record<string, { node: string; port: string }[]> }
export interface Program { nodes: ProgramNode[]; outputs: string[] }
export function createProgram(graph: FactoryGraph): Program {
  const errors = validateGraph(graph); if (errors.length) throw new Error(errors.join('\n'));
  const names = new Map(graph.machines.map((m, i) => [m.id, `v${i + 1}`]));
  return { nodes: topologicalOrder(graph).map(m => {
    const inputs: ProgramNode['inputs'] = {};
    for (const c of graph.connections.filter(c => c.to.machine === m.id)) (inputs[c.to.port] ??= []).push({ node: names.get(c.from.machine)!, port: c.from.port });
    return { id: names.get(m.id)!, operation: m.type, parameters: structuredClone(m.config), inputs };
  }), outputs: graph.machines.filter(m => m.type === 'output').map(m => names.get(m.id)!) };
}
