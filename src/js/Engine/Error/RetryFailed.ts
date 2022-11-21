export class RetryFailed extends Error {
  constructor(
    message: string,
    handler: (...args: any[]) => void,
    attempts: number
  ) {
    super(message);
  }
}

export default RetryFailed;
