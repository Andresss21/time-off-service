export class IntegrityException extends Error {
  constructor(
    public readonly severity: 'HIGH' | 'LOW',
    public readonly context: Record<string, unknown>,
  ) {
    super(`IntegrityException [${severity}]`);
    this.name = 'IntegrityException';
  }
}
