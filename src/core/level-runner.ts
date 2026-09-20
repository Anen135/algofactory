import { Simulation } from './simulation';
import type { FactoryGraph, Level, LevelResult, TestResult } from './types';
import { equal } from './values';
export function runLevel(graph: FactoryGraph, level: Level): LevelResult {
  const forbidden = graph.machines.find(m => !level.availableMachines.includes(m.type));
  const tests: TestResult[] = level.tests.map((test, index) => {
    try {
      if (forbidden) throw new Error(`Машина ${forbidden.type} недоступна на этом уровне.`);
      const simulation = new Simulation(graph, test.input).run();
      return { index, hidden: !!test.hidden, passed: !simulation.error && simulation.output.length === 1 && equal(simulation.output[0], test.expected), actual: simulation.output, expected: test.expected, error: simulation.error, operations: simulation.operations, ticks: simulation.ticks };
    } catch (e) { return { index, hidden: !!test.hidden, passed: false, actual: [], expected: test.expected, error: (e as Error).message, operations: 0, ticks: 0 }; }
  });
  return { passed: tests.every(t => t.passed), tests, machines: graph.machines.length, connections: graph.connections.length, operations: tests.reduce((n, t) => n + t.operations, 0), ticks: tests.reduce((n, t) => n + t.ticks, 0) };
}
