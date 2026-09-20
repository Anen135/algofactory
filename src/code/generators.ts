import type { DataValue } from '../core/types';
import type { Program, ProgramNode } from './ir';
export interface CodeGenerator { language: string; generate(program: Program): string }
const pyValue = (v: DataValue): string => Array.isArray(v) ? `[${v.map(pyValue).join(', ')}]` : typeof v === 'boolean' ? v ? 'True' : 'False' : JSON.stringify(v);
const jsValue = (v: DataValue): string => JSON.stringify(v);
type Emitter = (node: ProgramNode, input: (port: string) => string) => string[];
const scalarOps = new Set(['source', 'constant', 'arithmetic', 'comparator', 'output']);
function scalar(program: Program): boolean { return program.nodes.every(n => scalarOps.has(n.operation) && !n.inputs.trigger && Object.values(n.inputs).every(edges => edges.length === 1)); }
function scalarCode(program: Program, language: 'Python' | 'JavaScript'): string {
  const python = language === 'Python', literal = python ? pyValue : jsValue;
  const lines = [python ? 'def factory(input_value):' : 'function factory(inputValue) {'];
  for (const n of program.nodes) {
    const input = (port: string) => n.inputs[port]?.[0]?.node ?? (python ? 'None' : 'undefined');
    const emitters: Record<string, () => string> = {
      source: () => python ? 'input_value' : 'inputValue', constant: () => literal(n.parameters.value), output: () => input('in'),
      arithmetic: () => {
        const op = String(n.parameters.operation);
        // Python modulo has a different sign rule; emulate JS remainder explicitly.
        return python && op === '%' ? `remainder(${input('a')}, ${input('b')})` : `${input('a')} ${op} ${input('b')}`;
      },
      comparator: () => { const op = String(n.parameters.operation); return !python && ['==', '!='].includes(op) ? `JSON.stringify(${input('a')}) ${op === '==' ? '===' : '!=='} JSON.stringify(${input('b')})` : `${input('a')} ${op} ${input('b')}`; },
    };
    lines.push(`    ${python ? '' : 'const '}${n.id} = ${emitters[n.operation]()}${python ? '' : ';'}`);
  }
  lines.push(`    return ${program.outputs.length === 1 ? program.outputs[0] : `[${program.outputs.join(', ')}]`}${python ? '' : ';'}`);
  if (!python) lines.push('}');
  const modulo = python && program.nodes.some(n => n.operation === 'arithmetic' && n.parameters.operation === '%');
  return (modulo ? 'from math import fmod as remainder\n\n' : '') + lines.join('\n');
}
const pythonEmitters: Record<string, Emitter> = {
  source: n => [`${n.id}_out = [input_value]`],
  constant: (n, i) => [`${n.id}_out = [${pyValue(n.parameters.value)}${n.inputs.trigger ? ` for _ in ${i('trigger')}` : ''}]`],
  arithmetic: (n, i) => [`${n.id}_out = [${n.parameters.operation === '%' ? 'remainder(a, b)' : `a ${String(n.parameters.operation)} b`} for a, b in pair(${i('a')}, ${i('b')})]`],
  comparator: (n, i) => [`${n.id}_out = [${n.parameters.operation === '==' ? 'equal(a, b)' : n.parameters.operation === '!=' ? 'not equal(a, b)' : `a ${String(n.parameters.operation)} b`} for a, b in pair(${i('a')}, ${i('b')})]`],
  split: (n, i) => [`${n.id}_out = [item for value in ${i('in')} for item in value]`],
  join: (n, i) => [`${n.id}_out = [${n.parameters.mode === 'array' ? `list(${i('in')})` : `''.join(${i('in')})`}]`],
  stack: (n, i) => [`${n.id}_out = list(reversed(${i('in')}))`],
  queue: (n, i) => [`${n.id}_out = list(${i('in')})`],
  branch: (n, i) => [`${n.id}_true = [v for v, test in pair(${i('data')}, ${i('condition')}) if test]`, `${n.id}_false = [v for v, test in pair(${i('data')}, ${i('condition')}) if not test]`],
  filter: (n, i) => [`${n.id}_out = [v for v, test in pair(${i('data')}, ${i('condition')}) if test]`],
  memory: (n, i) => [`${n.id}_current = (${i('write')} or [${pyValue(n.parameters.initial)}])[-1]`, `${n.id}_out = ${n.inputs.read ? `[${n.id}_current for _ in ${i('read')}]` : `list(${i('write')}) or [${n.id}_current]`}`],
  output: (n, i) => [`${n.id}_out = ${i('in')}`],
};
const helpers = `from math import fmod as remainder

def equal(a, b):
    if isinstance(a, bool) != isinstance(b, bool):
        return False
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
    return a == b

def pair(a, b):
    if not a or not b:
        return []
    if len(a) != len(b) and len(a) != 1 and len(b) != 1:
        raise ValueError("Stream lengths differ")
    size = max(len(a), len(b))
    return zip(a * size if len(a) == 1 else a,
               b * size if len(b) == 1 else b)
`;
export class PythonGenerator implements CodeGenerator {
  language = 'Python';
  generate(program: Program): string {
    if (scalar(program)) return scalarCode(program, 'Python');
    const lines = [helpers, '# Each list is a finite stream of packets.', 'def factory(input_value):'];
    for (const n of program.nodes) {
      const emitter = pythonEmitters[n.operation]; if (!emitter) throw new Error(`Python: пока нет генератора для ${n.operation}.`);
      const input = (port: string) => n.inputs[port]?.map(e => `${e.node}_${e.port}`).join(' + ') || '[]';
      lines.push(`    # ${n.operation.toUpperCase()}`, ...emitter(n, input).map(l => `    ${l}`));
    }
    lines.push(`    result = ${program.outputs.map(id => `${id}_out`).join(' + ')}`, '    return result[0] if len(result) == 1 else result');
    return lines.join('\n');
  }
}
export class JavaScriptGenerator implements CodeGenerator {
  language = 'JavaScript';
  generate(program: Program): string {
    if (!scalar(program)) return '// JavaScript export currently supports scalar factories.\n// Source, Constant, Math, Compare, Output.\n// Для потоков и ветвления выберите Python.';
    return scalarCode(program, 'JavaScript');
  }
}
