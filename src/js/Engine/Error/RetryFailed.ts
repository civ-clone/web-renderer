export class RetryFailed extends Error {
  constructor(
    message: string,
    public handler: (...args: any[]) => void,
    public attempts: number
  ) {
    super(message);
  }
}

export default RetryFailed;
