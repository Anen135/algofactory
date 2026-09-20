import { expect, test } from 'vitest';
import { deserializeGraph, serializeGraph, validateGraph } from './graph';
import { Simulation } from './simulation';
import { FactoryBuilder, solution } from './test-factories';
import { GameState } from '../state/game-state';
import { Persistence } from '../state/storage';

test('type-changing configuration preserves the valid saved factory', () => {
  const data = new Map<string, string>();
  const store = new Persistence({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } });
  const state = new GameState(store); state.loadLevel('double'); state.import(serializeGraph(solution(1)));
  state.configure('c', 'value', true);
  expect(state.message).toContain('Несовместимые типы');
  expect(state.graph.machines.find(m => m.id === 'c')!.config.value).toBe(2);
  expect(store.loadGraph('double')).toEqual(state.graph);
  state.configure('c', 'value', 3); state.undo(); expect(store.loadGraph('double')).toEqual(solution(1));
});

test('malformed operation cannot be imported or executed', () => {
  const g = solution(1); g.machines.find(m => m.id === 'm')!.config.operation = '__proto__';
  expect(validateGraph(g).join(' ')).toContain('допустимое значение');
  expect(() => deserializeGraph(serializeGraph(g))).toThrow('допустимое значение');
  expect(() => new Simulation(g, 5)).toThrow('допустимое значение');
});

test('exact event budget is enough to finish a valid factory', () => {
  const reference = new Simulation(solution(0), 42).run();
  const bounded = new Simulation(solution(0), 42, undefined, reference.ticks).run();
  expect(bounded.error).toBeUndefined(); expect(bounded.output).toEqual([42]);
});

test('250 machines and 500 connections run deterministically', () => {
  const b = new FactoryBuilder().add('s', 'source');
  // 250 independent FIFO machines fan into a single multi-input output.
  for (let i = 0; i < 250; i++) b.add(`q${i}`, 'queue').wire('s', `q${i}`);
  b.add('o', 'output'); for (let i = 0; i < 250; i++) b.wire(`q${i}`, 'o');
  const simulation = new Simulation(b.graph, -7).run();
  expect(simulation.error).toBeUndefined(); expect(simulation.output).toEqual(Array.from({ length: 250 }, () => -7));
  expect(simulation.operations).toBe(252); expect(simulation.ticks).toBeLessThan(2000);
});

test('runtime errors produce test results and permit editing again', () => {
  const s = new GameState(new Persistence({ getItem: () => null, setItem: () => {} }));
  s.loadLevel('double'); s.import(serializeGraph(solution(1))); s.configure('m', 'operation', '/'); s.configure('c', 'value', 0);
  s.speed = 0; s.run(); s.advance(16);
  expect(s.simulation?.error).toContain('ноль'); expect(s.result?.passed).toBe(false);
  s.edit(); s.configure('c', 'value', 2); expect(s.graph.machines.find(m => m.id === 'c')!.config.value).toBe(2);
});
