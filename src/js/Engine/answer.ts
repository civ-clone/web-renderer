import Transport, { TransportDisposer, TransportSendArgs } from './Transport';

// The text of something thrown, for the page: an `Error`'s message, or the thing itself.
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Answers the page's `request`s on a channel with what `handler` returns, or with a `requestFailed` on that channel when
 *  it throws or its promise rejects (#470). Without one, the page's request would wait for good, and every later request
 *  on the channel behind it (`AbstractTransport.request`). A value is sent at once, as `receive` would have; a promise
 *  when it settles.
 */
export const answer = <Channel extends keyof TransportDataMap>(
  transport: Pick<Transport<TransportDataMap>, 'receive' | 'send'>,
  channel: Channel,
  handler: (
    data: any
  ) =>
    | TransportSendArgs<TransportDataMap[Channel]>
    | Promise<TransportSendArgs<TransportDataMap[Channel]>>
): TransportDisposer => {
  const fail = (error: unknown): void => {
    console.error(error);

    transport.send('requestFailed', {
      channel: channel as string,
      message: describeError(error),
    });
  };

  return transport.receive(channel, (data: any): void => {
    let result;

    try {
      result = handler(data);
    } catch (error) {
      fail(error);

      return;
    }

    if (result instanceof Promise) {
      result.then((value) => transport.send(channel, value), fail);

      return;
    }

    transport.send(channel, result);
  });
};

export default answer;
