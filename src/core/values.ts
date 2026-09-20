import type { DataType, DataValue, PortType } from './types';
export function isDataValue(value: unknown, depth = 0): value is DataValue {
  if (depth > 32) return false;
  return typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) || (Array.isArray(value) && value.every(v => isDataValue(v, depth + 1)));
}
export function dataType(value: DataValue): DataType { return Array.isArray(value) ? 'array' : typeof value as DataType; }
export function accepts(types: readonly PortType[], value: DataValue): boolean { return types.includes('any') || types.includes(dataType(value)) || (types.includes('character') && typeof value === 'string' && Array.from(value).length === 1); }
export const equal = (a: DataValue, b: DataValue): boolean => JSON.stringify(a) === JSON.stringify(b);
export const formatValue = (value: DataValue): string => JSON.stringify(value);
export function parseValue(text: string): DataValue { const value: unknown = JSON.parse(text); if (!isDataValue(value)) throw new Error('Используйте число, строку в кавычках, boolean или массив.'); return value; }
export function number(value: DataValue): number { if (typeof value !== 'number') throw new Error('Ожидается число. Проверьте тип входных данных.'); return value; }
export function pairs(a: DataValue[], b: DataValue[]): [DataValue, DataValue][] {
  if (!a.length || !b.length) return [];
  if (a.length !== b.length && a.length !== 1 && b.length !== 1) throw new Error(`Потоки имеют разную длину: ${a.length} и ${b.length}. Нужны равные потоки или одна константа.`);
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[a.length === 1 ? 0 : i], b[b.length === 1 ? 0 : i]]);
}
