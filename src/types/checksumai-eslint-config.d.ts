/**
 * Ambient declaration for the upstream ESLint config package, which ships
 * as plain JavaScript without TypeScript types. We only consume it via
 * dynamic import in the ESLint detector, where the runtime structure is
 * already validated, so a permissive declaration is sufficient.
 */
declare module 'checksumai-eslint-config' {
  /** Flat-config array including base + custom checksum/* rules. */
  export const tests: unknown[];
  /** Flat-config array with only the base TypeScript-eslint setup. */
  export const base: unknown[];
}
