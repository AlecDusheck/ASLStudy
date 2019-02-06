export class SetNotFoundError extends Error{

  private readonly set: string;

  constructor(set: string) {
    super();
    this.set = set;
  }

}