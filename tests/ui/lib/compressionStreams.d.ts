// `CompressionStream` and `DecompressionStream`, which the browsers and node
// have and TypeScript 4.9's `dom` library predates.

declare class CompressionStream extends TransformStream<
  Uint8Array,
  Uint8Array
> {
  constructor(format: 'deflate' | 'deflate-raw' | 'gzip');
}

declare class DecompressionStream extends TransformStream<
  Uint8Array,
  Uint8Array
> {
  constructor(format: 'deflate' | 'deflate-raw' | 'gzip');
}
