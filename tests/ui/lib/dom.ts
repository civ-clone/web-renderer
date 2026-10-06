// A DOM for the UI tests, so windows and the elements they build can be
// checked under node (#258). Imported first by any test that needs it: modules
// such as `Window.ts` read `document.body` as they load.
//
// linkedom builds the tree but does no layout and has no `<dialog>` behaviour,
// so `show`, `showModal` and `close` only toggle `open`, and `focus` does
// nothing. There is no IndexedDB, so nothing that needs a real one can run.

import { parseHTML } from 'linkedom';

const dom = parseHTML(
  '<!doctype html><html><head></head><body><div id="preload"></div></body></html>'
);

// linkedom has no `HTMLDialogElement`: a `<dialog>` is a plain `HTMLElement`,
//  so that's where the dialog methods go.
const DialogElement = (dom.document.createElement('dialog') as any).constructor;

Object.entries({
  show(this: HTMLElement) {
    this.setAttribute('open', '');
  },
  showModal(this: HTMLElement) {
    this.setAttribute('open', '');
  },
  close(this: HTMLElement) {
    this.removeAttribute('open');
  },
  focus() {},
}).forEach(([name, method]) => {
  if (typeof DialogElement.prototype[name] !== 'function') {
    DialogElement.prototype[name] = method;
  }
});

if (!('open' in DialogElement.prototype)) {
  Object.defineProperty(DialogElement.prototype, 'open', {
    get(this: HTMLElement) {
      return this.hasAttribute('open');
    },
  });
}

(globalThis as any).HTMLDialogElement = DialogElement;

[
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLSelectElement',
  'HTMLOptionElement',
  'HTMLImageElement',
  'HTMLCanvasElement',
  'HTMLInputElement',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
].forEach((name) => {
  if ((dom as any)[name] !== undefined) {
    (globalThis as any)[name] = (dom as any)[name];
  }
});

// No IndexedDB either. `AssetStore` opens its database as it loads, so it's
//  given one that never opens: a test that needs assets stubs the store's
//  methods instead.
class IDBRequest extends EventTarget {}

Object.assign(globalThis, {
  IDBCursor: class {},
  IDBDatabase: class {},
  IDBIndex: class {},
  IDBObjectStore: class {},
  IDBRequest,
  IDBTransaction: class {},
  indexedDB: { open: () => new IDBRequest() },
});

export const { document } = dom;
export default dom;
