import { cloneGraph, validateGraph } from './graph';
import { registry, type MachineRegistry } from './machines';
import type { Connection, DataPacket, DataValue, FactoryGraph, Machine, MachineSnapshot, SimulationEvent } from './types';
import { accepts, dataType, isDataValue } from './values';
type Action = () => Omit<SimulationEvent, 'tick'>;
export class Simulation {
  readonly graph: FactoryGraph;
  readonly snapshots = new Map<string, MachineSnapshot>();
  readonly output: DataValue[] = [];
  ticks = 0;
  operations = 0;
  done = false;
  error?: string;
  private actions: Action[] = [];
  private head = 0;
  private packetId = 0;
  private outstanding = new Map<string, number>();
  private machines = new Map<string, Machine>();
  private outgoing = new Map<string, Connection[]>();
  private incoming = new Map<string, Connection[]>();
  constructor(graph: FactoryGraph, readonly input: DataValue, private definitions: MachineRegistry = registry, readonly maxTicks = 100000) {
    this.graph = cloneGraph(graph);
    const errors = validateGraph(this.graph, definitions); if (errors.length) throw new Error(errors.join('\n'));
    for (const m of this.graph.machines) { this.machines.set(m.id, m); this.incoming.set(m.id, []); this.outgoing.set(m.id, []); }
    for (const c of this.graph.connections) { this.incoming.get(c.to.machine)!.push(c); this.outgoing.get(c.from.machine)!.push(c); }
    for (const m of this.graph.machines) {
      const inputs = Object.fromEntries(definitions.get(m.type).ports.filter(p => p.direction === 'input').map(p => [p.id, [] as DataValue[]]));
      this.snapshots.set(m.id, { inputs, outputs: {}, state: {}, status: 'waiting' });
      this.outstanding.set(m.id, this.incoming.get(m.id)!.length);
    }
    for (const m of this.graph.machines) if (!this.outstanding.get(m.id)) this.scheduleMachine(m);
  }
  private enqueue(action: Action): void {
    if (this.actions.length - this.head + this.ticks >= this.maxTicks) throw new Error('Фабрика превысила лимит действий. Уменьшите поток или число соединений.');
    this.actions.push(action);
  }
  private scheduleMachine(machine: Machine): void {
    this.enqueue(() => {
      const snapshot = this.snapshots.get(machine.id)!; snapshot.status = 'processing';
      const connected = new Set(this.incoming.get(machine.id)!.map(c => c.to.port));
      const definition = this.definitions.get(machine.type);
      const result = definition.execute({ input: this.input, inputs: structuredClone(snapshot.inputs), config: machine.config, connected, memory: {} });
      snapshot.state = result.state ?? {}; snapshot.outputs = result.outputs; this.operations++;
      if (machine.type === 'output') this.output.push(...snapshot.inputs.in);
      const outputs = definition.ports.filter(p => p.direction === 'output');
      for (const key of Object.keys(result.outputs)) if (!outputs.some(p => p.id === key)) throw new Error(`${definition.name}: неизвестный выход ${key}.`);
      for (const { id: port } of outputs) {
        const values = result.outputs[port] ?? [];
        if (!values.every(v => isDataValue(v))) throw new Error(`${this.definitions.get(machine.type).name}: получено недопустимое значение.`);
        for (const value of values) for (const edge of this.outgoing.get(machine.id)!.filter(c => c.from.port === port)) this.schedulePacket(edge, value);
      }
      for (const edge of this.outgoing.get(machine.id)!) this.enqueue(() => {
        const remaining = this.outstanding.get(edge.to.machine)! - 1; this.outstanding.set(edge.to.machine, remaining);
        if (remaining === 0) this.scheduleMachine(this.machines.get(edge.to.machine)!);
        return { kind: 'close', machineId: machine.id, message: `Поток ${edge.from.port} завершён` };
      });
      snapshot.status = 'done';
      return { kind: 'process', machineId: machine.id };
    });
  }
  private schedulePacket(edge: Connection, value: DataValue): void {
    const packet: DataPacket = { id: `packet-${++this.packetId}`, value: structuredClone(value), type: dataType(value), currentConnection: edge.id, state: 'created' };
    this.enqueue(() => ({ kind: 'emit', machineId: edge.from.machine, packet: { ...packet } }));
    this.enqueue(() => {
      const machine = this.machines.get(edge.to.machine)!;
      const port = this.definitions.get(machine.type).ports.find(p => p.id === edge.to.port && p.direction === 'input')!;
      if (!accepts(port.types, packet.value)) throw new Error(`У машины ${this.definitions.get(machine.type).name} вход ${port.label} ожидает ${port.types.join('/')}, получен ${packet.type}.`);
      this.snapshots.get(machine.id)!.inputs[port.id].push(structuredClone(packet.value));
      return { kind: 'transfer', machineId: machine.id, packet: { ...packet, state: 'delivered' } };
    });
  }
  step(): SimulationEvent {
    if (this.done) return { kind: this.error ? 'error' : 'done', tick: this.ticks, message: this.error };
    try {
      if (this.head >= this.actions.length) { this.done = true; return { kind: 'done', tick: this.ticks }; }
      if (this.ticks >= this.maxTicks) throw new Error('Превышен лимит шагов симуляции.');
      const action = this.actions[this.head++]; this.ticks++;
      const event = { ...action(), tick: this.ticks };
      if (this.head > 2048) { this.actions = this.actions.slice(this.head); this.head = 0; }
      return event;
    } catch (e) { this.error = (e as Error).message; this.done = true; return { kind: 'error', tick: this.ticks, message: this.error }; }
  }
  run(): this { while (!this.done) this.step(); return this; }
}
