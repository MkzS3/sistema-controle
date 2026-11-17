export class ApplicationNotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} ${id} was not found.`);
    this.name = new.target.name;
  }
}

export class ApplicationInputError extends Error {
  readonly code = 'INVALID_REQUEST';

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
