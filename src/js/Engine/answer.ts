import Transport, {
  RequestId,
  TransportDisposer,
  TransportMeta,
  TransportSendArgs,
} from './Transport';

// The text of something thrown, for the page: an `Error`'s message, or the thing itself.
export const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Answers the page's `request`s on a channel with what `handler` returns, or with a `requestFailed` on that channel when
 *  it throws or its promise rejects (#470), each with the request's id, which is how the page tells which request it
 *  answers (`AbstractTransport.request`). A value is sent at once, as `receive` would have; a promise when it settles.
 *
 * A message with no id is no request, and its answer goes as a plain message, and a failure only to the console: the
 *  page has nothing waiting on it.
 */
export const answer = <Channel extends keyof TransportDataMap>(
  transport: Pick<Transport<TransportDataMap>, 'receive' | 'reply' | 'send'>,
  channel: Channel,
  handler: (
    data: any
  ) =>
    | TransportSendArgs<TransportDataMap[Channel]>
    | Promise<TransportSendArgs<TransportDataMap[Channel]>>
): TransportDisposer => {
  const respond = (
      value: TransportSendArgs<TransportDataMap[Channel]>,
      id?: RequestId
    ): void =>
      id === undefined
        ? transport.send(channel, value)
        : transport.reply(channel, value, id),
    fail = (error: unknown, id?: RequestId): void => {
      console.error(error);

      if (id === undefined) {
        return;
      }

      transport.send('requestFailed', {
        channel: channel as string,
        message: describeError(error),
        id,
      });
    };

  return transport.receive(
    channel,
    (data: any, { id }: TransportMeta = {}): void => {
      let result;

      try {
        result = handler(data);
      } catch (error) {
        fail(error, id);

        return;
      }

      if (result instanceof Promise) {
        result.then(
          (value) => respond(value, id),
          (error) => fail(error, id)
        );

        return;
      }

      respond(result, id);
    }
  );
};

export default answer;
