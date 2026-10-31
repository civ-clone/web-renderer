// The Import Assets window says which file it could not read, and lets the player choose files again, rather than
//  sitting on "Building image assets..." for good. A file the extractor can't decode (not a Civilization sheet, or one
//  cut differently from the originals) threw inside the FileReader's `load` listener, where nothing caught it: that
//  file's promise never settled, so neither did the import.
//
// A file still being extracted when another fails must not write its progress over the reason the import stopped: the
//  files are read side by side, and in the browser the custom TER257.PIC that showed this failed while SP257.PIC was
//  still being cut up. Nor is it cut up at all, now that nothing will come of it. A file the browser can't read, and
//  a store that won't open or write, stop the import the same way, with their own reasons.
//
// linkedom has no `FileReader`, so a small one is played here, and no canvas: a fake one takes the extractor's drawing,
//  so a sheet that decodes is cut up as in the browser, logging each sprite, and one that doesn't throws as it would.
//  The sheet that decodes is made here: a palette chunk, then an image chunk of one literal and a run of the run-length
//  flag, LZW-coded with the growing code width the extractor reads.

// Must stay first: `Window.ts` reads `document.body` as it loads. Imported for its globals alone: a binding nothing
//  uses would be dropped from the bundle, and the shim with it.
import './lib/dom';

import ImportAssetsWindow from '../../src/js/UI/components/ImportAssetsWindow';
import addFormatters from '../../src/js/UI/app/i18nFormatters';
import { assetStore } from '../../src/js/UI/AssetStore';
import i18nOptions from '../../src/js/UI/app/i18nOptions';
import i18next from 'i18next';

const failures: string[] = [];
let checks = 0,
  finished = false;

const expect = (description: string, actual: unknown, expected: unknown) => {
  checks++;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(
      `${description}\n    expected: ${JSON.stringify(
        expected
      )}\n    actual:   ${JSON.stringify(actual)}`
    );
  }
};

// A suite that stops before its checks would otherwise pass in silence (#473).
process.on('exit', (code: number): void => {
  if (code === 0 && !finished) {
    process.stderr.write(
      `FAIL import-assets-window: stopped after ${checks} checks\n`
    );
    process.exitCode = 1;
  }
});

// How long after it is asked each file's reader takes, so the order the files finish in is the test's to choose, and
//  the files the reader fails on, as a browser does one it can't open.
const readDelays: { [name: string]: number } = {},
  readFailures: { [name: string]: Error } = {};

// Enough of a `FileReader` for the window: `readAsBinaryString` sets `result` and fires `load`, or `error` with the
//  reason in `error`. Each listener gets an event with the reader as its target, as the window once read it, and one
//  that throws is reported and the rest carry on, as in a browser, which is how the import came to hang.
class FakeFileReader {
  #listeners: { [type: string]: ((event: Event) => void)[] } = {};
  result: string | null = null;
  error: Error | null = null;

  addEventListener(type: string, listener: (event: Event) => void): void {
    (this.#listeners[type] ??= []).push(listener);
  }

  #fire(type: string): void {
    (this.#listeners[type] ?? []).forEach((listener) => {
      try {
        listener({ target: this } as unknown as Event);
      } catch (error) {
        console.error(error);
      }
    });
  }

  readAsBinaryString(file: File): void {
    file.arrayBuffer().then((buffer) => {
      this.result = Array.from(new Uint8Array(buffer), (byte) =>
        String.fromCharCode(byte)
      ).join('');

      setTimeout(() => {
        if (file.name in readFailures) {
          this.error = readFailures[file.name];
          this.#fire('error');

          return;
        }

        this.#fire('load');
      }, readDelays[file.name] ?? 0);
    });
  }
}

(globalThis as any).FileReader = FakeFileReader;

// A browser reports a promise nobody caught and carries on; node would stop here. It is how an import that never
//  finished got that far.
process.on('unhandledRejection', (error) => console.error(error));

// A canvas that takes what the extractor draws and reads back blank pixels. A sheet the extractor couldn't decode is
//  drawn as nothing at all, which a browser's canvas refuses to read back, and this one does too.
const fakeCanvas = (): HTMLCanvasElement => {
  const context = {
    clearRect: () => {},
    drawImage: () => {},
    getImageData: (x: number, y: number, width: number, height: number) => {
      if (width === 0 || height === 0) {
        throw Object.assign(new Error('The source width is 0.'), {
          name: 'IndexSizeError',
        });
      }

      return {
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      };
    },
    putImageData: () => {},
  };

  return {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => {
      spritesCut++;

      return 'data:image/png;base64,';
    },
  } as unknown as HTMLCanvasElement;
};

// How many sprites the extractor has cut out: each one is read back as a data URL.
let spritesCut = 0;

const createElement = document.createElement.bind(document);

document.createElement = ((tag: string) =>
  tag === 'canvas' ? fakeCanvas() : createElement(tag)) as any;

// The extractor's LZW: codes of 8 + n bits, n starting at 1 and growing by one each time the count of codes read
//  reaches 256, 512, 1024, …, and back to 1 once 8 + n would pass the byte mode (11).
const lzwEncode = (codes: number[]): number[] => {
  const bytes: number[] = [];
  let bits = 0,
    bitCount = 0,
    width = 9,
    threshold = 256,
    counted = 0;

  codes.forEach((code) => {
    bits |= code << bitCount;
    bitCount += width;

    while (bitCount >= 8) {
      bytes.push(bits & 0xff);
      bits >>>= 8;
      bitCount -= 8;
    }

    if (++counted === threshold) {
      counted = 0;
      width++;
      threshold <<= 1;

      if (width > 11) {
        width = 9;
        threshold = 256;
      }
    }
  });

  if (bitCount > 0) {
    bytes.push(bits & 0xff);
  }

  return bytes;
};

// A 320×200 sheet of one colour: a palette, then one literal pixel and runs of 254 more of it (the 0x90 flag and a
//  count), which the extractor decodes and cuts into every sprite it asks for.
const sheet = (name: string): File => {
  const palette = [0, 255];

  for (let i = 0; i < 256; i++) {
    palette.push(i & 0x3f, (i >> 2) & 0x3f, 0x3f - (i & 0x3f));
  }

  const codes = [5];

  for (let pixels = 1; pixels < 320 * 200; pixels += 254) {
    codes.push(0x90, 0xff);
  }

  const coded = lzwEncode(codes),
    length = 5 + coded.length,
    bytes = [
      ...'M0'.split('').map((c) => c.charCodeAt(0)),
      palette.length & 0xff,
      palette.length >> 8,
      ...palette,
      ...'X0'.split('').map((c) => c.charCodeAt(0)),
      length & 0xff,
      length >> 8,
      320 & 0xff,
      320 >> 8,
      200 & 0xff,
      200 >> 8,
      0x0b,
      ...coded,
    ];

  return new File([new Uint8Array(bytes)], name);
};

// linkedom's `innerText` has no setter, and the window's messages go through it.
Object.defineProperty((globalThis as any).HTMLElement.prototype, 'innerText', {
  get(this: HTMLElement) {
    return this.textContent ?? '';
  },
  set(this: HTMLElement, text: string) {
    this.textContent = text;
  },
});

// There is no IndexedDB (see lib/dom.ts): nothing is stored yet, nothing is, and what's stored falls short.
const store = assetStore as any;

const storeWorks = (): void => {
  store.keys = async (): Promise<string[]> => [];
  store.setAll = async (): Promise<void> => {};
  store.hasAllAssets = async (): Promise<boolean> => false;
  store.missingAssets = async (): Promise<string[]> => [
    './assets/units/warrior.png',
  ];
};

storeWorks();

const logged: unknown[][] = [],
  consoleError = console.error;

console.error = (...args: unknown[]) => logged.push(args);

const notASheet = (name: string): File =>
    new File(
      [new Uint8Array([0x4d, 0x30, 0x02, 0x03, 0x00, 0xff, 0x00])],
      name
    ),
  upload = (window: ImportAssetsWindow, files: File[]): Promise<void> =>
    window.handleFileUpload({ target: { files } } as unknown as InputEvent),
  // The bug was an import that never finished; a check that waits for it would wait with it.
  settles = (
    promise: Promise<void>,
    ms: number
  ): Promise<'resolved' | 'rejected' | 'hung'> =>
    Promise.race([
      promise.then(
        () => 'resolved' as const,
        () => 'rejected' as const
      ),
      new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), ms)),
    ]),
  progress = (window: ImportAssetsWindow): HTMLParagraphElement =>
    window.element().querySelector('p.loading') as HTMLParagraphElement,
  fileInput = (window: ImportAssetsWindow): HTMLInputElement =>
    window.element().querySelector('input[type="file"]') as HTMLInputElement;

const run = async (): Promise<void> => {
  await i18next.init({ ...i18nOptions, lng: 'en' });
  addFormatters(i18next);
  await import('../../translations/local/en');

  // The browser's file input can't take the theme (#739): it's hidden, a button of the system opens it, and the
  //  names of the files chosen show beside the button.
  {
    const window = new ImportAssetsWindow(),
      input = fileInput(window),
      choose = window
        .element()
        .querySelector('.file-picker button') as HTMLButtonElement,
      chosen = () =>
        window.element().querySelector('.file-picker .chosen')?.textContent;
    let opened = false;

    input.click = () => {
      opened = true;
    };

    expect(
      'the file input is hidden, and out of the tab order',
      [input.classList.contains('visually-hidden'), input.tabIndex],
      [true, -1]
    );
    expect(
      'a secondary button chooses the files',
      [choose?.textContent, choose?.classList.contains('btn-secondary')],
      ['Choose files', true]
    );
    expect('before any are chosen, it says so', chosen(), 'No files chosen');

    choose.click();

    expect('the button opens the file input', opened, true);

    // The names alone, without starting an import of them.
    const uploads: number[] = [];

    window.handleFileUpload = async () => {
      uploads.push(1);
    };

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [{ name: 'README.TXT' }, { name: 'R&D <1>.PIC' }],
    });
    input.dispatchEvent(new Event('change'));

    expect(
      "the chosen files' names show beside the button, as they are",
      chosen(),
      'README.TXT and R&D <1>.PIC'
    );
    expect('and the import starts', uploads.length, 1);

    Object.defineProperty(input, 'files', { configurable: true, value: [] });
    input.dispatchEvent(new Event('change'));

    expect(
      'closing the picker with nothing chosen says so, and imports nothing',
      [chosen(), uploads.length],
      ['No files chosen', 1]
    );

    window.close();
  }

  // A file that can't be read: the import stops, says which file, and the player can choose again. The other file,
  //  which reads fine but finishes later, doesn't write over that, and isn't cut up.
  {
    readDelays['SP257.PIC'] = 50;

    const window = new ImportAssetsWindow(),
      files = [notASheet('TER257.PIC'), sheet('SP257.PIC')];

    // As the picker would have left it.
    (
      window.element().querySelector('.file-picker .chosen') as HTMLElement
    ).textContent = 'TER257.PIC and SP257.PIC';

    const settled = await settles(upload(window, files), 5000);

    expect('an unreadable file: the import finishes', settled, 'resolved');

    // Long enough for the other file to be read and cut up.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const message = progress(window).innerText,
      named = message.match(/^(TER257\.PIC) /)?.[1] ?? null;

    expect(
      'an unreadable file: the message names the file, after the other file is done',
      named,
      'TER257.PIC'
    );
    expect(
      'an unreadable file: the message says it is not supported',
      message.includes("doesn't look like a supported Civilization file"),
      true
    );
    expect(
      'an unreadable file: the message is shown as an error',
      progress(window).classList.contains('failed'),
      true
    );
    expect(
      'an unreadable file: the message is not hidden',
      progress(window).hasAttribute('hidden'),
      false
    );
    expect(
      'an unreadable file: the file input takes files again',
      fileInput(window).hasAttribute('disabled'),
      false
    );
    expect(
      'an unreadable file: the names chosen are cleared with the input',
      window.element().querySelector('.file-picker .chosen')?.textContent,
      'No files chosen'
    );
    expect(
      'an unreadable file: the button to choose them is back too',
      (
        window
          .element()
          .querySelector('.file-picker button') as HTMLButtonElement
      ).disabled,
      false
    );
    // The extractor logs its own complaint about the file first.
    const error = logged
      .map(([first]) => first as { file?: string; cause?: unknown })
      .find((first) => first?.file !== undefined);

    expect(
      'an unreadable file: the error reaches the console, with the file',
      error?.file ?? null,
      named
    );
    expect(
      'an unreadable file: the console has the cause',
      error?.cause instanceof Error,
      true
    );
    expect(
      'an unreadable file: the other file is not cut up once the import has failed',
      spritesCut,
      0
    );
  }

  // A file the browser can't read: the same, with the reader's reason.
  {
    logged.length = 0;
    delete readDelays['SP257.PIC'];
    readFailures['SP257.PIC'] = Object.assign(
      new Error('The file is locked.'),
      {
        name: 'NotReadableError',
      }
    );

    const window = new ImportAssetsWindow(),
      files = [sheet('TER257.PIC'), sheet('SP257.PIC')],
      settled = await settles(upload(window, files), 5000);

    delete readFailures['SP257.PIC'];

    expect(
      'a file the reader fails on: the import finishes',
      settled,
      'resolved'
    );
    expect(
      'a file the reader fails on: the message names the file',
      progress(window).innerText.startsWith('SP257.PIC '),
      true
    );
    expect(
      "a file the reader fails on: the console has the reader's reason",
      (
        logged
          .map(([first]) => first as { cause?: { name?: string } })
          .find((first) => first?.cause !== undefined)?.cause ?? {}
      ).name,
      'NotReadableError'
    );
    expect(
      'a file the reader fails on: the file input takes files again',
      fileInput(window).hasAttribute('disabled'),
      false
    );
  }

  // The store won't open: the import stops with that reason, not blamed on a file.
  {
    logged.length = 0;
    store.keys = async (): Promise<string[]> => {
      throw new Error('The database is blocked.');
    };

    const window = new ImportAssetsWindow(),
      files = [sheet('TER257.PIC'), sheet('SP257.PIC')],
      settled = await settles(upload(window, files), 5000);

    storeWorks();

    expect('the store fails: the import finishes', settled, 'resolved');
    expect(
      'the store fails: the message gives the reason',
      progress(window).innerText,
      'Importing the assets failed (The database is blocked.). Try again, and check that the browser lets this site store data.'
    );
    expect(
      'the store fails: the message is shown as an error',
      progress(window).classList.contains('failed'),
      true
    );
    expect(
      'the store fails: the file input takes files again',
      fileInput(window).hasAttribute('disabled'),
      false
    );
  }

  // Both files read, but the store ends up short: it says what is missing, and the player can choose again.
  {
    logged.length = 0;
    spritesCut = 0;

    const window = new ImportAssetsWindow(),
      files = [sheet('TER257.PIC'), sheet('SP257.PIC')],
      settled = await settles(upload(window, files), 5000);

    expect(
      'sprites missing after writing: the import finishes',
      settled,
      'resolved'
    );
    expect(
      'sprites missing after writing: both files were cut up',
      spritesCut > 0,
      true
    );
    expect(
      'sprites missing after writing: the message names what is missing',
      progress(window).innerText.includes('warrior.png'),
      true
    );
    expect(
      'sprites missing after writing: the file input takes files again',
      fileInput(window).hasAttribute('disabled'),
      false
    );
  }

  // Not every expected file: the import doesn't start, and says which files it needs.
  {
    const window = new ImportAssetsWindow(),
      settled = await settles(upload(window, [notASheet('SP257.PIC')]), 5000);

    expect('a file missing: the import finishes', settled, 'resolved');
    expect(
      'a file missing: the message lists the files needed',
      progress(window).innerText.includes('TER257.PIC'),
      true
    );
    expect(
      'a file missing: the file input takes files again',
      fileInput(window).hasAttribute('disabled'),
      false
    );
  }

  console.error = consoleError;
  finished = true;

  if (failures.length > 0) {
    process.stderr.write(
      `FAIL import-assets-window: ${
        failures.length
      } of ${checks} checks\n  ${failures.join('\n  ')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(`PASS import-assets-window: ${checks} checks\n`);
};

run().catch((error) => {
  process.stderr.write(
    `FAIL import-assets-window: ${
      error instanceof Error ? error.stack : error
    }\n`
  );
  process.exit(1);
});
