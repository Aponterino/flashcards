declare module "pg" {
  export class Pool {
    constructor(config?: { connectionString?: string });
    query(text: string): Promise<unknown>;
  }
}
