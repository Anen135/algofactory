/** Reference factories for tests only; never imported by the application. */
import { registry } from './machines';
import { emptyGraph, type DataValue, type FactoryGraph } from './types';
export class FactoryBuilder {
  graph = emptyGraph();
  add(id: string, type: string, config: Record<string, DataValue> = {}): this { this.graph.machines.push({ id, type, x: this.graph.machines.length * 220, y: 100, config: { ...registry.get(type).defaults, ...config } }); return this; }
  wire(from: string, to: string, input = 'in', output = 'out'): this { this.graph.connections.push({ id: `c${this.graph.connections.length}`, from: { machine: from, port: output }, to: { machine: to, port: input } }); return this; }
}
export function solution(index: number): FactoryGraph {
  const b = new FactoryBuilder().add('s', 'source').add('o', 'output');
  if (index === 0) return b.wire('s', 'o').graph;
  if (index <= 3) return b.add('c', 'constant', { value: index === 1 ? 2 : 10 }).add('m', index === 3 ? 'comparator' : 'arithmetic', { operation: index === 1 ? '*' : index === 2 ? '+' : '>' }).wire('s', 'm', 'a').wire('c', 'm', 'b').wire('m', 'o').graph;
  if (index === 4) return b.add('two', 'constant', { value: 2 }).add('zero', 'constant', { value: 0 }).add('mod', 'arithmetic', { operation: '%' }).add('eq', 'comparator', { operation: '==' }).wire('s', 'mod', 'a').wire('two', 'mod', 'b').wire('mod', 'eq', 'a').wire('zero', 'eq', 'b').wire('eq', 'o').graph;
  if ([5, 6, 9].includes(index)) {
    b.add('split', 'split').add('join', 'join').wire('s', 'split');
    if (index !== 5) b.add('stack', 'stack').wire('split', 'stack').wire('stack', 'join'); else b.wire('split', 'join');
    if (index === 9) b.add('eq', 'comparator', { operation: '==' }).wire('s', 'eq', 'a').wire('join', 'eq', 'b').wire('eq', 'o'); else b.wire('join', 'o');
    return b.graph;
  }
  if (index === 7) return b.add('zero', 'constant', { value: 0 }).add('cmp', 'comparator').add('branch', 'branch').add('yes', 'constant', { value: 'POSITIVE' }).add('no', 'constant', { value: 'NEGATIVE' }).wire('s', 'cmp', 'a').wire('zero', 'cmp', 'b').wire('s', 'branch', 'data').wire('cmp', 'branch', 'condition').wire('branch', 'yes', 'trigger', 'true').wire('branch', 'no', 'trigger', 'false').wire('yes', 'o').wire('no', 'o').graph;
  return b.add('split', 'split').add('ten', 'constant', { value: 10 }).add('cmp', 'comparator').add('filter', 'filter').add('join', 'join', { mode: 'array' }).wire('s', 'split').wire('split', 'cmp', 'a').wire('ten', 'cmp', 'b').wire('split', 'filter', 'data').wire('cmp', 'filter', 'condition').wire('filter', 'join').wire('join', 'o').graph;
}
