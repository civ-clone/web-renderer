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
//
// Civilization II's sheets (#97) are GIFs made here too, by the Civ2 extractor's own test encoder, laid out as its
//  `extract-data.json` says, with marker pixels and flags painted in: no Civilization II art is needed.

// Must stay first: `Window.ts` reads `document.body` as it loads. Imported for its globals alone: a binding nothing
//  uses would be dropped from the bundle, and the shim with it.
import './lib/dom';
import './lib/interfaces';

import ImportAssetsWindow from '@civ-clone/ui-menus/components/ImportAssetsWindow';
import addFormatters from '@civ-clone/ui-game/app/i18nFormatters';
import { assetStore } from '@civ-clone/ui-assets/AssetStore';
import i18nOptions from '@civ-clone/ui-game/app/i18nOptions';
import { Colour, encodeGif } from './lib/encodeGif';
import { civ2Pack, metadataKey } from '@civ-clone/ui-assets/lib/packs';
import civ2ExtractData from '@civ-clone/civ2-asset-extractor/extract-data.json';
import extractData from '@civ-clone/civ1-asset-extractor/extract-data.json';
import i18next from 'i18next';
import { readFileSync } from 'fs';

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
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }),
    putImageData: (image: { data: Uint8ClampedArray }) => {
      drawn = image.data;
    },
  };

  let drawn: Uint8ClampedArray = new Uint8ClampedArray(4);

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toDataURL: () => {
      spritesCut++;

      return 'data:image/png;base64,';
    },
    // A Civ2 sprite's "PNG": its size and its first pixel, from what was put on the canvas.
    toBlob: (callback: (blob: Blob | null) => void, type: string) => {
      civ2Encoded++;
      callback(
        new Blob(
          [`${canvas.width}x${canvas.height} ${Array.from(drawn.slice(0, 4))}`],
          { type }
        )
      );
    },
  };

  return canvas as unknown as HTMLCanvasElement;
};

// How many sprites the extractor has cut out: each one is read back as a data URL. Civ2's are encoded as PNGs instead.
let spritesCut = 0,
  civ2Encoded = 0;

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
  store.readMetadata = async (): Promise<null> => null;
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
  await import('./lib/strings');

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

  // A browser that blocks this site's data keeps nothing imported (#850): the window says so before any files are
  //  chosen, and the choosing is out of reach. One that doesn't is as before.
  {
    const usable = assetStore.usable,
      notice = (window: ImportAssetsWindow) =>
        window.element().querySelector('.storage-blocked') as HTMLElement,
      chooseOf = (window: ImportAssetsWindow) =>
        window
          .element()
          .querySelector('.file-picker button') as HTMLButtonElement;

    assetStore.usable = async () => false;

    const blocked = new ImportAssetsWindow();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      'storage blocked: the window says so first, as an alert, and no files can be chosen',
      [
        notice(blocked).hasAttribute('hidden'),
        notice(blocked).getAttribute('role'),
        notice(blocked).textContent?.startsWith(
          'Your browser is blocking this site from storing data'
        ),
        blocked.element().querySelector('.import-assets')?.firstElementChild ===
          notice(blocked),
        chooseOf(blocked).disabled,
        fileInput(blocked).hasAttribute('disabled'),
      ],
      [false, 'alert', true, true, true, true]
    );

    blocked.close();

    assetStore.usable = async () => true;

    const open = new ImportAssetsWindow();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      'storage usable: nothing is said, and files can be chosen',
      [
        notice(open).hasAttribute('hidden'),
        notice(open).textContent,
        chooseOf(open).disabled,
        fileInput(open).hasAttribute('disabled'),
      ],
      [true, '', false, false]
    );

    open.close();

    assetStore.usable = usable;
  }

  // SP299.PIC, the improvement and Wonder icons, is optional (#64): the instructions say so, an import goes ahead
  //  without it, and the files asked for when one is missing are the required ones.
  {
    const window = new ImportAssetsWindow();

    expect(
      'the instructions ask for the required files, and the icons as well',
      window.element().querySelector('.import-assets p')?.textContent,
      'Upload SP257.PIC and TER257.PIC from the original Civilization files to extract assets (these will be stored locally). This only takes a moment. Add SP299.PIC as well for the improvement and Wonder icons. Add ASOUND.CVL for the music.'
    );

    await upload(window, [sheet('SP257.PIC')]);

    expect(
      'a required file missing: only the required ones are asked for',
      progress(window).textContent,
      'Please provide all files to generate assets: SP257.PIC and TER257.PIC.'
    );

    const written: string[] = [],
      setAll = store.setAll;

    store.setAll = async (assets: { name: string }[]): Promise<void> => {
      written.push(...assets.map(({ name }) => name));
    };

    await upload(window, [sheet('SP257.PIC'), sheet('TER257.PIC')]);

    store.setAll = setAll;

    expect(
      "without SP299.PIC, the import goes ahead: the required files' sprites are written, and no icons",
      [
        written.includes('./assets/terrain/land.png'),
        written.includes('./assets/units/warrior.png'),
        written.some((name) => name.includes('/wonders/')),
      ],
      [true, true, false]
    );

    window.close();
  }

  // Replace existing assets left unticked: a group of sprites already imported isn't cut again. It never was skipped,
  //  as the paths it checked had the definition's index in them (#64).
  {
    const window = new ImportAssetsWindow(),
      written: string[] = [],
      { keys, setAll } = store,
      units = (extractData as any).files['SP257.PIC']['units/'].flatMap(
        (definition: any) =>
          definition.contents.map(
            ({ name }: any) => `./assets/units/${name}.png`
          )
      );

    store.keys = async (): Promise<string[]> => units;
    store.setAll = async (assets: { name: string }[]): Promise<void> => {
      written.push(...assets.map(({ name }) => name));
    };
    (
      window
        .element()
        .querySelector('input[type="checkbox"]') as HTMLInputElement
    ).checked = false;

    await upload(window, [sheet('SP257.PIC'), sheet('TER257.PIC')]);

    store.keys = keys;
    store.setAll = setAll;

    expect(
      'not replacing: the units already imported are skipped, the rest written',
      [
        written.some((name) => units.includes(name)),
        written.includes('./assets/terrain/land.png'),
      ],
      [false, true]
    );

    window.close();
  }

  // ASOUND.CVL (#126): kept as the file it is, once cvl/Image has read it as the AdLib driver. A made-up driver here: an
  //  MZ header, the ID string, and a data segment long enough with the AdLib's operator table in it.
  {
    const cvl = ({
        id = 'RLND Cvlzatn12-03-91',
        mz = true,
        adlib = true,
      } = {}): File => {
        const header = 0x200,
          ds = header + 0x1e20,
          bytes = new Uint8Array(ds + 0x7400);

        if (mz) {
          bytes.set([0x4d, 0x5a], 0);
        }

        bytes[8] = header / 16;
        bytes.set(
          id.split('').map((c) => c.charCodeAt(0)),
          header + 0x10
        );

        if (adlib) {
          bytes.set(
            [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21],
            ds + 0x73d8
          );
        }

        return new File([bytes], 'ASOUND.CVL');
      },
      written: { name: string; blob?: Blob }[] = [],
      { setAll, hasAllAssets } = store,
      importWith = async (files: File[], hasAssets = false) => {
        const window = new ImportAssetsWindow();

        written.length = 0;
        store.hasAllAssets = async (): Promise<boolean> => hasAssets;
        await upload(window, files);
        window.close();

        return progress(window).innerText;
      };

    store.setAll = async (assets: { name: string; blob?: Blob }[]) => {
      written.push(...assets);
    };
    // A finished import reloads the page to use what it wrote.
    let reloads = 0;

    (globalThis as any).location = {
      reload: () => {
        reloads++;
      },
    };

    await importWith([sheet('SP257.PIC'), sheet('TER257.PIC'), cvl()]);

    const kept = written.find(({ name }) => name === './sources/ASOUND.CVL');

    expect(
      'a valid ASOUND.CVL is kept with the sprites, as its own bytes',
      [
        kept?.blob?.size,
        written.includes(kept!),
        written.some(({ name }) => name === './assets/units/warrior.png'),
      ],
      [cvl().size, true, true]
    );

    for (const [description, file] of [
      ['not an MZ file', cvl({ mz: false })],
      ["another driver's ID string", cvl({ id: 'Tandy CIVIL 12-02-91' })],
      ['the MT-32 driver, without the AdLib table', cvl({ adlib: false })],
      [
        'too short',
        new File([new Uint8Array([0x4d, 0x5a, 0, 0])], 'ASOUND.CVL'),
      ],
    ] as const) {
      spritesCut = 0;

      const message = await importWith([
        sheet('SP257.PIC'),
        sheet('TER257.PIC'),
        file,
      ]);

      expect(
        `junk as ASOUND.CVL (${description}): refused by name, nothing written or cut up`,
        [message.startsWith('ASOUND.CVL '), written.length, spritesCut],
        [true, 0, 0]
      );
    }

    expect(
      'ASOUND.CVL alone, with the sprites already in: it is added',
      [await importWith([cvl()], true), written.map(({ name }) => name)],
      [
        'Done! Please reload the page to utilize the fresh assets.',
        ['./sources/ASOUND.CVL'],
      ]
    );

    expect(
      'ASOUND.CVL alone, before the sprites: the files needed are asked for',
      [
        (await importWith([cvl()])).startsWith('Please provide all files'),
        written.length,
      ],
      [true, 0]
    );

    // The player's own copy, where there is one: CVL=/path/to/ASOUND.CVL.
    if (process.env.CVL) {
      await importWith(
        [new File([readFileSync(process.env.CVL)], 'ASOUND.CVL')],
        true
      );

      expect(
        'the real ASOUND.CVL is accepted',
        written.map(({ name }) => name),
        ['./sources/ASOUND.CVL']
      );
    } else {
      process.stdout.write(
        'SKIP import-assets-window: set CVL to the path of ASOUND.CVL to import the real one\n'
      );
    }

    expect('each finished import reloads the page', reloads > 0, true);

    store.setAll = setAll;
    store.hasAllAssets = hasAllAssets;
    delete (globalThis as any).location;
  }

  // Civilization II's sheets (#97): recognised by name, whatever its case, and cut up by the Civ2 extractor. Each sprite
  //  is kept as its PNG under Civ2's pack's key, and the anchors and flag colours in one record beside them. RULES.TXT
  //  is taken and left alone: its units keep their default names. Nothing else changes for a Civ1 import.
  {
    type GridDefinition = {
      path: string;
      x: number;
      y: number;
      width: number;
      height: number;
      columns: number;
      stepX?: number;
      stepY?: number;
      names: (string | null)[];
    };
    type FileDefinition = {
      grids: GridDefinition[];
      flags?: {
        x: number;
        width: number;
        height: number;
        count: number;
        stepX?: number;
        rows: { name: string; y: number }[];
      };
    };

    const definitions = (
        civ2ExtractData as unknown as {
          files: { [file: string]: FileDefinition };
        }
      ).files,
      SHIELD = 1,
      SIZE = 2,
      POLE = 10,
      // A palette laid out like Civ2's: the last three are "transparent 1, border, transparent 2". The markers are
      //  the extractor's own colours.
      palette: Colour[] = Array.from({ length: 256 }, (_, i): Colour => {
        switch (i) {
          case SHIELD:
            return [0, 0, 255];
          case SIZE:
            return [255, 155, 0];
          case 253:
            return [255, 0, 255];
          case 254:
            return [0, 255, 0];
          case 255:
            return [255, 0, 254];
          default:
            return [i, (i * 7) % 256, (i * 13) % 256];
        }
      }),
      // Every cell of `file` as the extractor will cut it, and the flags, on a sheet just big enough for them. The
      //  sheet is a pattern, so every sprite has something in it and the GIF's dictionary stays small; the first unit
      //  and the first city have marker pixels on their borders, and the flags have a pole every flag shares and
      //  colours of their own.
      civ2Sheet = (file: string, name: string = file): File => {
        const { grids, flags } = definitions[file]!,
          right = Math.max(
            ...grids.map(
              ({ x, width, columns, names, stepX = width + 1 }) =>
                x + (Math.min(columns, names.length) - 1) * stepX + width
            ),
            flags
              ? flags.x +
                  (flags.count - 1) * (flags.stepX ?? flags.width + 1) +
                  flags.width
              : 0
          ),
          bottom = Math.max(
            ...grids.map(
              ({ y, height, columns, names, stepY = height + 1 }) =>
                y + (Math.ceil(names.length / columns) - 1) * stepY + height
            ),
            ...(flags?.rows ?? []).map(({ y }) => y + flags!.height)
          ),
          width = right + 1,
          height = bottom + 1,
          pixels = new Uint8Array(width * height),
          set = (x: number, y: number, index: number) => {
            pixels[y * width + x] = index;
          };

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            set(x, y, 30 + ((x * 7 + y * 11) % 200));
          }
        }

        if (file === 'UNITS.GIF') {
          // units/settlers, at (1, 1): its shield at (12, 20).
          set(1 + 12, 0, SHIELD);
          set(0, 1 + 20, SHIELD);
        }

        if (file === 'CITIES.GIF') {
          // The first city, at (1, 39): its flag at (5, 7) and its size at (30, 31).
          set(1 + 5, 38, SHIELD);
          set(0, 39 + 7, SHIELD);
          set(1 + 30, 38, SIZE);
          set(0, 39 + 31, SIZE);
        }

        flags?.rows.forEach(({ y }) => {
          for (let flag = 0; flag < flags.count; flag++) {
            const x = flags.x + flag * (flags.stepX ?? flags.width + 1);

            for (let dy = 0; dy < flags.height; dy++) {
              for (let dx = 0; dx < flags.width; dx++) {
                set(
                  x + dx,
                  y + dy,
                  dx < 3 && dy < 3
                    ? 40 + flag
                    : dx < 9 && dy < 9
                    ? 20 + flag
                    : POLE
                );
              }
            }
          }
        });

        return new File(
          [Uint8Array.from(encodeGif({ width, height, palette, pixels }))],
          name
        );
      },
      sheets = Object.fromEntries(
        Object.keys(definitions).map((file) => [file, civ2Sheet(file)])
      ),
      allSprites = Object.values(definitions).flatMap(({ grids }) =>
        grids.flatMap(({ path, names }) =>
          names.flatMap((name) => (name === null ? [] : [path + name]))
        )
      ),
      civ2Key = (name: string): string =>
        `${civ2Pack.storage.prefix}${name}${civ2Pack.storage.ext}`,
      written: { name: string; blob?: Blob }[] = [],
      warned: unknown[][] = [],
      { setAll, hasAllAssets, keys } = store,
      consoleWarn = console.warn,
      importWith = async (
        files: File[],
        hasAssets = true,
        replace = true
      ): Promise<string> => {
        const window = new ImportAssetsWindow();

        written.length = 0;
        spritesCut = 0;
        civ2Encoded = 0;
        store.hasAllAssets = async (): Promise<boolean> => hasAssets;
        (
          window
            .element()
            .querySelector('input[type="checkbox"]') as HTMLInputElement
        ).checked = replace;
        await upload(window, files);
        window.close();

        return progress(window).innerText;
      },
      writtenNames = () => written.map(({ name }) => name),
      metadata = async () => {
        const record = written.find(
          ({ name }) => name === metadataKey(civ2Pack)
        );

        return record?.blob ? JSON.parse(await record.blob.text()) : null;
      };

    store.setAll = async (assets: { name: string; blob?: Blob }[]) => {
      written.push(...assets);
    };
    console.warn = (...args: unknown[]) => warned.push(args);
    (globalThis as any).location = { reload: () => {} };

    expect(
      'Civ2: the four sheets the extractor cuts up, and 289 sprites in them',
      [Object.keys(definitions).sort(), allSprites.length],
      [['CITIES.GIF', 'TERRAIN1.GIF', 'TERRAIN2.GIF', 'UNITS.GIF'], 289]
    );

    const done = await importWith([
      ...Object.values(sheets),
      new File(['@UNITS\nSettlers, 0\n'], 'RULES.TXT'),
    ]);

    expect(
      "Civ2's sheets alone, with Civ1's sprites already in: every sprite is kept under Civ2's key, as its PNG, and nothing of Civ1's",
      [
        done,
        writtenNames()
          .filter((name) => name !== metadataKey(civ2Pack))
          .sort(),
        written.every(({ blob }) => blob instanceof Blob),
        civ2Encoded,
        spritesCut,
      ],
      [
        'Done! Please reload the page to utilize the fresh assets.',
        allSprites.map(civ2Key).sort(),
        true,
        289,
        0,
      ]
    );
    expect(
      'Civ2: the river mouths, the flags and the shield are among them',
      [
        'terrain/river-mouth/ne',
        'terrain/river-mouth/se',
        'terrain/river-mouth/sw',
        'terrain/river-mouth/nw',
        'city/flag',
        'city/flag-2',
        'units/shield',
      ].every((name) => writtenNames().includes(civ2Key(name))),
      true
    );

    const settlers = written.find(
      ({ name }) => name === civ2Key('units/settlers')
    );

    expect(
      "Civ2: a sprite's PNG is drawn from the pixels cut from the sheet",
      await settlers?.blob?.text(),
      // The pattern's index at (1, 1), 48, is the colour (48, 80, 112).
      '64x48 48,80,112,255'
    );

    const stored = await metadata();

    expect(
      "Civ2: the anchors are kept by sprite name, each unit's and city's, with the flags' colours",
      [
        stored?.anchors['units/settlers'],
        stored?.anchors['units/engineers'],
        stored?.anchors['city/stone-bronze/0'],
        stored?.anchors['terrain/desert/base-0'],
        stored?.colours.flag.length,
        stored?.colours.flag[0],
        stored?.colours['flag-2'][1],
      ],
      [
        { shield: { x: 12, y: 20 } },
        {},
        { flag: { x: 5, y: 7 }, size: { x: 30, y: 31 } },
        undefined,
        9,
        {
          primary: palette[20],
          secondary: palette[40],
        },
        {
          primary: palette[21],
          secondary: palette[41],
        },
      ]
    );
    expect(
      'Civ2: RULES.TXT is taken without a word, and not cut up',
      warned,
      []
    );

    expect(
      "Civ2: a sheet's name in any case",
      [
        await importWith([civ2Sheet('UNITS.GIF', 'units.gif')]),
        writtenNames().includes(civ2Key('units/settlers')),
      ],
      ['Done! Please reload the page to utilize the fresh assets.', true]
    );

    expect(
      "Civ2's sheets before Civ1's sprites: Civ1's files are asked for, and nothing is written",
      [
        (await importWith([sheets['UNITS.GIF']!], false)).startsWith(
          'Please provide all files'
        ),
        written.length,
      ],
      [true, 0]
    );

    await importWith([
      sheet('SP257.PIC'),
      sheet('TER257.PIC'),
      sheets['UNITS.GIF']!,
    ]);

    expect(
      "Civ2's sheets with Civ1's files: both are written, together",
      [
        writtenNames().includes('./assets/units/warrior.png'),
        writtenNames().includes(civ2Key('units/settlers')),
        writtenNames().includes(metadataKey(civ2Pack)),
      ],
      [true, true, true]
    );

    // An import of some of the sheets keeps what an earlier one said about the others.
    store.readMetadata = async () => ({
      anchors: {
        'city/stone-bronze/0': { flag: { x: 1, y: 2 } },
        'units/settlers': { shield: { x: 0, y: 0 } },
      },
      colours: { flag: [{ primary: [1, 2, 3], secondary: [4, 5, 6] }] },
    });

    await importWith([sheets['UNITS.GIF']!]);

    const merged = await metadata();

    expect(
      "Civ2: a later import of one sheet keeps the others' anchors and colours, and replaces its own",
      [
        merged?.anchors['city/stone-bronze/0'],
        merged?.anchors['units/settlers'],
        merged?.colours.flag,
      ],
      [
        { flag: { x: 1, y: 2 } },
        { shield: { x: 12, y: 20 } },
        [{ primary: [1, 2, 3], secondary: [4, 5, 6] }],
      ]
    );

    store.readMetadata = async (): Promise<null> => null;

    // Not replacing: a grid of sprites already imported, with their anchors, isn't cut again, and a sheet with nothing
    //  new isn't read.
    const units = definitions['UNITS.GIF']!.grids[0]!.names.flatMap((name) =>
        name === null ? [] : [civ2Key(`units/${name}`)]
      ),
      full = stored,
      without = (change: (metadata: any) => void): (() => Promise<unknown>) => {
        const metadata = JSON.parse(JSON.stringify(full));

        change(metadata);

        return async () => metadata;
      };

    store.readMetadata = async () => full;
    store.keys = async (): Promise<string[]> => units;

    await importWith([sheets['UNITS.GIF']!], true, false);

    expect(
      'Civ2, not replacing: the units already imported are skipped, the shields cut',
      [
        writtenNames().some((name) => units.includes(name)),
        writtenNames().includes(civ2Key('units/shield')),
      ],
      [false, true]
    );

    store.keys = async (): Promise<string[]> => allSprites.map(civ2Key);

    await importWith([sheets['UNITS.GIF']!], true, false);

    expect(
      'Civ2, not replacing, with everything in: nothing is written, not even the anchors',
      [written.length, civ2Encoded],
      [0, 0]
    );

    // A unit's anchors missing from the record: the units are cut again for them, and the rest kept.
    store.readMetadata = without((metadata) => {
      delete metadata.anchors['units/settlers'];
    });

    await importWith([sheets['UNITS.GIF']!], true, false);

    const recut = await metadata();

    expect(
      "Civ2, not replacing: a grid whose anchors the record hasn't got is cut again, and only that one",
      [
        writtenNames().includes(civ2Key('units/settlers')),
        writtenNames().includes(civ2Key('units/shield')),
        recut?.anchors['units/settlers'],
        recut?.anchors['city/stone-bronze/0'],
      ],
      [
        true,
        false,
        { shield: { x: 12, y: 20 } },
        { flag: { x: 5, y: 7 }, size: { x: 30, y: 31 } },
      ]
    );

    // The flags' colours missing: they are read again, and no sprite cut.
    store.readMetadata = without((metadata) => {
      delete metadata.colours['flag-2'];
    });

    await importWith([sheets['CITIES.GIF']!], true, false);

    expect(
      "Civ2, not replacing: colours the record hasn't got are read again, without cutting a sprite",
      [writtenNames(), (await metadata())?.colours['flag-2']?.length],
      [[metadataKey(civ2Pack)], 9]
    );

    // Only the colours wanted, from a sheet that isn't laid out as Civ2's: refused by name, as a sheet whose sprites
    //  are cut would be, rather than its empty flags stored as colours.
    for (const [description, palette] of [
      [
        'two colours',
        [
          [0, 0, 0],
          [255, 255, 255],
        ] as Colour[],
      ],
      [
        '256 colours, one pixel',
        Array.from({ length: 256 }, (): Colour => [0, 0, 0]),
      ],
    ] as const) {
      const tiny = new File(
        [
          Uint8Array.from(
            encodeGif({ width: 1, height: 1, palette, pixels: [0] })
          ),
        ],
        'CITIES.GIF'
      );

      expect(
        `Civ2, only the colours wanted, from a one-pixel GIF (${description}): refused by name, nothing written`,
        [
          (await importWith([tiny], true, false)).startsWith(
            "CITIES.GIF doesn't look like a supported Civilization file"
          ),
          written.length,
        ],
        [true, 0]
      );
    }

    // Colours already kept and a city sprite missing: the sprite is cut, and the kept colours aren't read again from
    //  this sheet, whose flags (left as they are) they might not match.
    const keptColours = Object.fromEntries(
      Object.entries(full.colours).map(([row, flags]) => [
        row,
        (flags as unknown[]).map(() => ({
          primary: [1, 2, 3],
          secondary: [4, 5, 6],
        })),
      ])
    );

    store.readMetadata = without((metadata) => {
      metadata.colours = keptColours;
    });
    store.keys = async (): Promise<string[]> =>
      allSprites
        .map(civ2Key)
        .filter((key) => key !== civ2Key('city/stone-bronze/0'));

    await importWith([sheets['CITIES.GIF']!], true, false);

    expect(
      'Civ2, not replacing, colours kept: a missing city is cut, and the colours are left as they were',
      [
        writtenNames().includes(civ2Key('city/stone-bronze/0')),
        writtenNames().includes(civ2Key('city/flag')),
        (await metadata())?.colours,
      ],
      [true, false, keptColours]
    );

    store.keys = async (): Promise<string[]> => allSprites.map(civ2Key);

    // A record that can't be read: every grid with anchors in the sheets chosen is cut again, rather than a part of the
    //  record written over it.
    store.readMetadata = async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    };

    await importWith(
      [sheets['UNITS.GIF']!, sheets['CITIES.GIF']!],
      true,
      false
    );

    const rewritten = await metadata();

    expect(
      "Civ2, not replacing: a record that can't be read has every grid with anchors cut again, and only those",
      [
        writtenNames().includes(civ2Key('units/settlers')),
        writtenNames().includes(civ2Key('city/stone-bronze/0')),
        writtenNames().includes(civ2Key('units/shield')),
        writtenNames().includes(civ2Key('map/fortify')),
        rewritten?.anchors['units/settlers'],
        rewritten?.anchors['city/modern-alt/walled-3'],
        rewritten?.colours.flag.length,
      ],
      [true, true, false, false, { shield: { x: 12, y: 20 } }, {}, 9]
    );

    store.readMetadata = async (): Promise<null> => null;
    store.keys = keys;

    expect(
      'Civ2: a file named as a sheet that is not one is refused by name, and nothing is written',
      [
        (await importWith([new File(['not a GIF'], 'UNITS.GIF')])).startsWith(
          "UNITS.GIF doesn't look like a supported Civilization file"
        ),
        written.length,
      ],
      [true, 0]
    );

    const whole = await sheets['UNITS.GIF']!.arrayBuffer(),
      truncated = () =>
        new File([whole.slice(0, whole.byteLength / 2)], 'UNITS.GIF');

    expect(
      'Civ2: a sheet cut short is refused by name, and nothing is written',
      [
        (await importWith([truncated()])).startsWith(
          "UNITS.GIF doesn't look like a supported Civilization file"
        ),
        written.length,
      ],
      [true, 0]
    );

    warned.length = 0;

    const mixed = await importWith([
      sheet('SP257.PIC'),
      sheet('TER257.PIC'),
      truncated(),
    ]);

    expect(
      "Civ2: a bad sheet among Civ1's files is left out, with a warning, and Civ1's are imported",
      [
        mixed,
        writtenNames().includes('./assets/units/warrior.png'),
        writtenNames().some((name) => name.startsWith(civ2Pack.storage.prefix)),
        warned.map(([message]) => message),
      ],
      [
        'Done! Please reload the page to utilize the fresh assets.',
        true,
        false,
        ['Could not read UNITS.GIF, skipping.'],
      ]
    );

    store.setAll = setAll;
    store.hasAllAssets = hasAllAssets;
    console.warn = consoleWarn;
    delete (globalThis as any).location;
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
