export const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => { const element = document.querySelector<T>(selector); if (!element) throw new Error(`Missing UI: ${selector}`); return element; };
export const colorHex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
