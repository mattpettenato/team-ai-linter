import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readIt(p: string): string {
  return readFileSync(p, 'utf-8');
}
