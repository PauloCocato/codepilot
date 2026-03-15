/** Add two numbers */
export function add(a: number, b: number): number {
  return a + b;
}

/** Subtract b from a */
export function subtract(a: number, b: number): number {
  return a - b;
}

/** Multiply two numbers */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divide a by b.
 * BUG: Does not handle division by zero — returns Infinity instead of throwing.
 */
export function divide(a: number, b: number): number {
  return a / b;
}
