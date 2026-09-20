import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';
import { levels } from '../content/levels';
import { FactoryBuilder, solution } from '../core/test-factories';
import { PythonGenerator } from './generators';
import { createProgram } from './ir';
import type { DataValue, FactoryGraph } from '../core/types';
import { Simulation } from '../core/simulation';

// Python is optional for development; core and browser gameplay never need it.
const python = process.env.PYTHON || 'python';
const available = spawnSync(python, ['--version'], { encoding: 'utf8' }).status === 0;
function execute(graph: FactoryGraph, inputs: DataValue[]): DataValue[] {
  const code = new PythonGenerator().generate(createProgram(graph));
  const script = `${code}\nimport json\ninputs = json.loads(${JSON.stringify(JSON.stringify(inputs))})\nprint(json.dumps([factory(x) for x in inputs]))`;
  const result = spawnSync(python, ['-X', 'utf8', '-c', script], { encoding: 'utf8', timeout: 10000 });
  expect(result.stderr).toBe(''); expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as DataValue[];
}
levels.forEach((level, index) => test.skipIf(!available)(`generated Python executes every ${level.id} test`, () => {
  expect(execute(solution(index), level.tests.map(t => t.input))).toEqual(level.tests.map(t => t.expected));
}));
test.skipIf(!available)('Python equality keeps boolean distinct from number, including nested arrays', () => {
  const b = new FactoryBuilder().add('s', 'source').add('c', 'constant', { value: [true] }).add('cmp', 'comparator', { operation: '==' }).add('o', 'output').wire('s', 'cmp', 'a').wire('c', 'cmp', 'b').wire('cmp', 'o');
  expect(execute(b.graph, [[1], [true], ['true']])).toEqual([false, true, false]);
});
test.skipIf(!available)('Python preserves merged-stream delivery order when wires were created in reverse', () => {
  const b = new FactoryBuilder().add('s', 'source').add('split', 'split').add('cmp', 'comparator').add('ten', 'constant', { value: 10 }).add('branch', 'branch').add('o', 'output')
    .wire('s', 'split').wire('split', 'cmp', 'a').wire('ten', 'cmp', 'b').wire('split', 'branch', 'data').wire('cmp', 'branch', 'condition')
    .wire('branch', 'o', 'in', 'false').wire('branch', 'o', 'in', 'true');
  const input = [2, 30, 8, 50];
  const expected = new Simulation(b.graph, input).run().output;
  expect(expected).toEqual([30, 50, 2, 8]); expect(execute(b.graph, [input])).toEqual([expected]);
});
