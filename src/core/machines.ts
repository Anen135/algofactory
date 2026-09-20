import type { DataValue, Machine, MachineDefinition, Port, PortType } from './types';
import { equal, isDataValue, number, pairs } from './values';
const input = (id: string, types: PortType[] = ['any'], required = true, multiple = false): Port => ({ id, label: id.toUpperCase(), direction: 'input', types, required, multiple });
const output = (id = 'out', types: PortType[] = ['any']): Port => ({ id, label: id.toUpperCase(), direction: 'output', types });
const out = (values: DataValue[]) => ({ outputs: { out: values } });
export const arithmetic: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b,
  '/': (a, b) => { if (b === 0) throw new Error('Деление на ноль.'); return a / b; },
  '%': (a, b) => { if (b === 0) throw new Error('Остаток от деления на ноль.'); return a % b; },
};
export const comparisons: Record<string, (a: DataValue, b: DataValue) => boolean> = {
  '==': equal, '!=': (a, b) => !equal(a, b), '>': (a, b) => number(a) > number(b),
  '<': (a, b) => number(a) < number(b), '>=': (a, b) => number(a) >= number(b), '<=': (a, b) => number(a) <= number(b),
};
const definitions: MachineDefinition[] = [
  { type: 'source', name: 'SOURCE', description: 'Вход уровня. Отправляет одно значение.', icon: '↗', color: 0x65dfb0, ports: [output()], defaults: {}, fields: [], execute: c => out([c.input]) },
  { type: 'output', name: 'OUTPUT', description: 'Финальный результат. Принимает активную ветку.', icon: '◎', color: 0xf4ba69, ports: [input('in', ['any'], true, true)], defaults: {}, fields: [], execute: c => ({ outputs: {}, state: { result: c.inputs.in } }) },
  { type: 'constant', name: 'CONSTANT', description: 'Постоянное значение. Необязательный trigger выпускает значение для каждого пакета.', icon: '#', color: 0xb7a1ed, ports: [input('trigger', ['any'], false), output()], defaults: { value: 2 }, fields: [{ key: 'value', label: 'Значение (JSON)', kind: 'value' }], execute: c => out(c.connected.has('trigger') ? c.inputs.trigger.map(() => c.config.value) : [c.config.value]) },
  { type: 'arithmetic', name: 'MATH', description: 'Арифметика A и B. Одна константа применяется ко всему потоку.', icon: '±', color: 0x79b5f1, ports: [input('a', ['number']), input('b', ['number']), output('out', ['number'])], defaults: { operation: '*' }, fields: [{ key: 'operation', label: 'Операция', kind: 'select', options: Object.keys(arithmetic) }], execute: c => {
    const fn = arithmetic[String(c.config.operation)]; if (!fn) throw new Error('Неизвестная арифметическая операция.');
    return out(pairs(c.inputs.a, c.inputs.b).map(([a, b]) => fn(number(a), number(b))));
  } },
  { type: 'comparator', name: 'COMPARE', description: 'Сравнение A и B. Возвращает boolean.', icon: '≷', color: 0x79b5f1, ports: [input('a'), input('b'), output('out', ['boolean'])], defaults: { operation: '>' }, fields: [{ key: 'operation', label: 'Условие', kind: 'select', options: Object.keys(comparisons) }], execute: c => {
    const fn = comparisons[String(c.config.operation)]; if (!fn) throw new Error('Неизвестное условие.'); return out(pairs(c.inputs.a, c.inputs.b).map(([a, b]) => fn(a, b)));
  } },
  { type: 'split', name: 'SPLIT', description: 'Разделяет строку или массив на поток элементов.', icon: '⋮', color: 0x64cbd6, ports: [input('in', ['string', 'array']), output()], defaults: {}, fields: [], execute: c => out(c.inputs.in.flatMap(v => {
    if (typeof v === 'string') return Array.from(v); if (Array.isArray(v)) return v; throw new Error('SPLIT принимает строку или массив.');
  })) },
  { type: 'join', name: 'JOIN', description: 'Ждёт завершения потока и собирает строку или массив.', icon: '⋯', color: 0x64cbd6, ports: [input('in'), output()], defaults: { mode: 'string' }, fields: [{ key: 'mode', label: 'Собрать в', kind: 'select', options: ['string', 'array'] }], execute: c => {
    if (c.config.mode === 'array') return out([[...c.inputs.in]]);
    if (c.inputs.in.some(v => typeof v !== 'string')) throw new Error('JOIN в режиме string принимает только символы и строки. Для чисел выберите array.');
    return out([c.inputs.in.join('')]);
  } },
  { type: 'stack', name: 'STACK', description: 'LIFO: последний вошёл — первый вышел. Разворачивает поток.', icon: '▤', color: 0xe3a1cf, ports: [input('in'), output()], defaults: {}, fields: [], execute: c => ({ ...out([...c.inputs.in].reverse()), state: { buffered: [...c.inputs.in], order: 'LIFO' } }) },
  { type: 'queue', name: 'QUEUE', description: 'FIFO: первый вошёл — первый вышел. Сохраняет порядок.', icon: '≡', color: 0xe3a1cf, ports: [input('in'), output()], defaults: {}, fields: [], execute: c => ({ ...out([...c.inputs.in]), state: { buffered: [...c.inputs.in], order: 'FIFO' } }) },
  { type: 'branch', name: 'BRANCH', description: 'Направляет data в true или false по condition.', icon: '⑂', color: 0xf0c575, ports: [input('data'), input('condition', ['boolean']), output('true'), output('false')], defaults: {}, fields: [], execute: c => {
    const yes: DataValue[] = [], no: DataValue[] = []; for (const [v, test] of pairs(c.inputs.data, c.inputs.condition)) { if (typeof test !== 'boolean') throw new Error('Условие BRANCH должно быть boolean.'); (test ? yes : no).push(v); } return { outputs: { true: yes, false: no } };
  } },
  { type: 'filter', name: 'FILTER', description: 'Пропускает элементы data с условием true.', icon: '▽', color: 0xf0c575, ports: [input('data'), input('condition', ['boolean']), output()], defaults: {}, fields: [], execute: c => out(pairs(c.inputs.data, c.inputs.condition).filter(([, b]) => { if (typeof b !== 'boolean') throw new Error('Условие FILTER должно быть boolean.'); return b; }).map(([v]) => v)) },
  { type: 'memory', name: 'MEMORY', description: 'Переменная: write обновляет значение, read выдаёт текущее после записи. Сбрасывается между тестами.', icon: '▣', color: 0xb7a1ed, ports: [input('write', ['any'], false), input('read', ['any'], false), output()], defaults: { initial: 0 }, fields: [{ key: 'initial', label: 'Начальное значение (JSON)', kind: 'value' }], execute: c => {
    const previous = c.memory.value ?? c.config.initial; let current = previous;
    const writes = c.inputs.write ?? []; const values = writes.map(v => { current = v; return v; }); c.memory.value = current;
    return { outputs: { out: c.connected.has('read') ? (c.inputs.read ?? []).map(() => current) : values.length ? values : [current] }, state: { previous, incoming: writes, current } };
  } },
];
export class MachineRegistry {
  private definitions = new Map<string, MachineDefinition>();
  constructor(initial: MachineDefinition[] = definitions) { initial.forEach(d => this.register(d)); }
  register(definition: MachineDefinition): void { if (this.definitions.has(definition.type)) throw new Error(`Машина ${definition.type} уже существует.`); this.definitions.set(definition.type, definition); }
  get(type: string): MachineDefinition { const value = this.definitions.get(type); if (!value) throw new Error(`Неизвестная машина: ${type}`); return value; }
  all(): MachineDefinition[] { return [...this.definitions.values()]; }
}
export const registry = new MachineRegistry();

/** Validate configuration at every boundary: editor, import and execution. */
export function configurationError(machine: Machine, definitions = registry): string | undefined {
  const definition = definitions.get(machine.type);
  for (const key of Object.keys(definition.defaults)) {
    if (!Object.hasOwn(machine.config, key) || !isDataValue(machine.config[key])) return `${definition.name}: некорректный параметр ${key}.`;
  }
  for (const field of definition.fields) {
    if (field.kind === 'select' && !field.options?.includes(String(machine.config[field.key]))) return `${definition.name}: выберите допустимое значение «${field.label}».`;
  }
  return undefined;
}
