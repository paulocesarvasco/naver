export class TimeoutError extends Error {
  public readonly name = 'TimeoutError';
  constructor() {
    super();
  }
}
