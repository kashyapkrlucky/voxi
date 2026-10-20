export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`);
    this.name = "NotFoundError";
  }
}

// e.g. accepting a plan that was already accepted or superseded.
export class PlanStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanStateError";
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in required");
    this.name = "UnauthorizedError";
  }
}
