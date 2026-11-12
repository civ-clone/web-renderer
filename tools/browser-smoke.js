#!/usr/bin/env node

// Runs the built game in a real browser (#878), which no other suite does: the ui suites have a DOM with no layout,
// no stylesheet and no IndexedDB, so a page that comes up blank, a worker that won't start or a save that won't load
// passes all of them.
//
//   npm run build && npm run test:browser
//
// What it does, in headless Chrome, under each interface:
//   - opens the page and waits for the title menu;
//   - loads a save made here, by the engine, a few turns in (`tests/engine/load.ts --save`), with its first seat
//     given to a person, the way Load game hands a save over (`packages/menus/lib/savedGame.ts`);
//   - opens each report by its key and closes it with Escape;
//   - opens a city from the City Status report, and closes it.
// Then, once: the same save as one written before a plugin was renamed loads too (#915), and with site data blocked
// the title menu still comes up (#850).
//
// It fails on an uncaught error or a `console.error`, but for the missing sprites: nothing is imported here, and each
// one is said.
//
// Chrome is driven over its DevTools protocol with node's own WebSocket, so nothing is installed for it. It is looked
// for in `CHROME`, on the PATH, in Playwright's cache and where macOS keeps it. With none found this is skipped,
// unless `CI` is set or `--require` is given, when that is a failure.

const { execFileSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const { bundle } = require('./lib/suite');
const { envForSeed } = require('./lib/seeds');
const { webRenderer } = require('./lib/paths');

const NAME = 'browser-smoke',
  required = process.argv.includes('--require') || Boolean(process.env.CI),
  // The reports, by the key that opens each and the class its window has.
  REPORTS = [
    ['F1', 'city-status'],
    ['F2', 'military-report'],
    ['F3', 'intelligence-report'],
    ['F4', 'happiness-report'],
    ['F5', 'trade-report'],
    ['F6', 'science-report'],
    ['F7', 'wonders-report'],
    ['F8', 'top-cities-report'],
    ['F9', 'civilization-score-report'],
  ],
  INTERFACES = ['modern', 'classic'],
  // The hand-over `loadSaveFromFile` makes before it reloads the page: the save in IndexedDB, a marker and the seats
  //  in `sessionStorage`. Kept in step with `packages/menus/lib/savedGame.ts` by this test failing when it isn't.
  PENDING = 'civ-clone:pending-save',
  PENDING_SEATS = 'civ-clone:pending-save-seats',
  PENDING_DB = 'civ-clone-saved-game',
  PENDING_STORE = 'pending-save',
  // A plugin a save may name that has since been renamed (#915), and what it is now.
  RETIRED_PLUGIN = [
    '@civ-clone/base-unit-action-meet-with-leader',
    '@civ-clone/base-unit-action-meet-with-king',
  ];

// How long the browser has to answer any one command.
const COMMAND_TIMEOUT = 20_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const findChrome = () => {
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
    linuxCache = path.join(os.homedir(), '.cache', 'ms-playwright'),
    fromCache = (directory) => {
      if (!fs.existsSync(directory)) {
        return [];
      }

      return fs
        .readdirSync(directory)
        .filter((name) => name.startsWith('chromium_headless_shell-'))
        .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
        .flatMap((name) =>
          fs
            .readdirSync(path.join(directory, name))
            .filter((inner) => inner.startsWith('chrome-headless-shell'))
            .map((inner) =>
              path.join(directory, name, inner, 'chrome-headless-shell')
            )
        );
    },
    onPath = [
      'google-chrome',
      'google-chrome-stable',
      'chromium',
      'chromium-browser',
    ].flatMap((command) => {
      const found = spawnSync('which', [command], { encoding: 'utf8' });

      return found.status === 0 ? [found.stdout.trim()] : [];
    });

  return [
    ...(process.env.CHROME ? [process.env.CHROME] : []),
    ...onPath,
    ...fromCache(cache),
    ...fromCache(linuxCache),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].find((candidate) => fs.existsSync(candidate));
};

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();

      server.close(() => resolve(port));
    });
  });

const TYPES = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// The checkout, as the page is served: `index.html` and `dist/`.
const serve = () =>
  new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      // A file inside the checkout, or nothing: not one beside it whose name starts the same way, nor a directory.
      let file = null;

      try {
        const pathname = decodeURIComponent(
            new URL(request.url, 'http://localhost').pathname
          ),
          wanted = path.join(
            webRenderer,
            pathname.endsWith('/') ? `${pathname}index.html` : pathname
          ),
          inside = path.relative(webRenderer, wanted);

        if (
          !inside.startsWith('..') &&
          !path.isAbsolute(inside) &&
          fs.statSync(wanted).isFile()
        ) {
          file = wanted;
        }
      } catch {
        // A path that can't be read as one, or a file that isn't there.
      }

      if (file === null) {
        response.writeHead(404);
        response.end();

        return;
      }

      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      });
      fs.createReadStream(file)
        .on('error', () => response.destroy())
        .pipe(response);
    });

    server.listen(0, '127.0.0.1', () => resolve(server));
  });

// A page in a headless Chrome of its own, driven over the DevTools protocol.
const launchOnce = async (chrome) => {
  const port = await freePort(),
    profile = fs.mkdtempSync(path.join(os.tmpdir(), `${NAME}-`)),
    child = spawn(
      chrome,
      [
        // The headless shell is headless as it is; the full browser is asked.
        ...(path.basename(chrome).includes('headless')
          ? []
          : ['--headless=new']),
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        '--window-size=1280,800',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        // Nothing a test needs, and each one more thing to wait for as the browser starts.
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-component-update',
        // Its shared memory in the temporary directory: /dev/shm is small on some runners.
        '--disable-dev-shm-usage',
        // A hosted runner has no user namespaces for Chrome's sandbox to use.
        ...(process.env.CI ? ['--no-sandbox'] : []),
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    ),
    // What the browser said as it started, for when it doesn't.
    said = [];

  child.stderr.on('data', (chunk) => said.push(chunk));

  let target;

  // Half a minute: a cold runner can take ten seconds over it. Not once the browser has gone, though.
  for (
    let attempt = 0;
    attempt < 300 && !target && child.exitCode === null;
    attempt++
  ) {
    await sleep(100);

    try {
      target = (
        await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      ).find(({ type }) => type === 'page');
    } catch {
      // Not listening yet.
    }
  }

  // Chrome may still be writing to its profile as it goes: tried a few times, and left for the system if not.
  const discard = () => {
    child.kill();

    try {
      fs.rmSync(profile, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    } catch {
      // A temporary directory.
    }
  };

  if (!target) {
    discard();

    throw new Error(
      `${chrome} did not start${
        child.exitCode === null ? '' : ` (it exited with ${child.exitCode})`
      }: ${
        Buffer.concat(said)
          .toString('utf8')
          .trim()
          .split('\n')
          .slice(-5)
          .join(' | ') || 'it said nothing'
      }`
    );
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl),
    waiting = new Map(),
    // What the page said went wrong: uncaught errors, and `console.error`.
    problems = [];
  let nextId = 0;

  try {
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
  } catch (error) {
    discard();

    throw error;
  }

  let closed = false;

  // A browser that has gone answers nothing: whatever waits on it is told so, rather than left waiting for the
  //  job to be cancelled.
  socket.onclose = () => {
    closed = true;

    waiting.forEach(({ reject }) =>
      reject(new Error('the browser closed the connection'))
    );
    waiting.clear();
  };

  // `sessionId` is a worker's, for one the page started: without it, the page itself. A command the browser never
  //  answers (a page that has hung) is given up on after `COMMAND_TIMEOUT`.
  const send = (method, params = {}, sessionId = undefined) =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(new Error('the browser closed the connection'));

        return;
      }

      const id = ++nextId,
        deadline = setTimeout(() => {
          if (waiting.delete(id)) {
            reject(
              new Error(
                `${method} was not answered in ${
                  COMMAND_TIMEOUT / 1000
                } seconds`
              )
            );
          }
        }, COMMAND_TIMEOUT);

      waiting.set(id, {
        resolve: (value) => {
          clearTimeout(deadline);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(deadline);
          reject(error);
        },
      });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId === undefined ? {} : { sessionId }),
        })
      );
    });

  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);

    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);

      waiting.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }

      return;
    }

    if (
      message.method === 'Runtime.consoleAPICalled' &&
      message.params.type === 'error'
    ) {
      problems.push(
        message.params.args
          .map((argument) => argument.value ?? argument.description ?? '')
          .join(' ')
      );
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const { exceptionDetails } = message.params;

      problems.push(
        `Uncaught: ${
          exceptionDetails.exception?.description ?? exceptionDetails.text
        }`
      );
    }

    // The game's engine runs in a worker, whose errors the page's own session never hears of: each worker is
    //  listened to as the page is.
    if (message.method === 'Target.attachedToTarget') {
      send('Runtime.enable', {}, message.params.sessionId).catch(() => {});
    }

    // `alert` is how a save that won't load is said: answered, and counted.
    if (message.method === 'Page.javascriptDialogOpening') {
      problems.push(`alert: ${message.params.message}`);
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: false,
    flatten: true,
  });

  return {
    problems,
    send,
    goto: (url) => send('Page.navigate', { url }),
    // The value of a function's body run in the page; a promise is awaited.
    run: async (body) => {
      const result = await send('Runtime.evaluate', {
        expression: `(async () => { ${body} })()`,
        awaitPromise: true,
        returnByValue: true,
      });

      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ??
            result.exceptionDetails.text
        );
      }

      return result.result.value;
    },
    key: async (key, keyCode) => {
      const event = { key, code: key, windowsVirtualKeyCode: keyCode };

      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event });
    },
    close: () => {
      try {
        socket.close();
      } catch {
        // Already gone.
      }

      discard();
    },
  };
};

// A browser that doesn't start is tried again, twice: it is the runner's doing, not the game's, and a second go
//  costs seconds where a failed run costs the whole job again.
const launch = async (chrome) => {
  let last;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await launchOnce(chrome);
    } catch (error) {
      last = error;
    }
  }

  throw last;
};

// Until `check` in the page gives something truthy, which is returned, or `false` when it never does.
const until = async (page, check, { timeout = 30_000, every = 250 } = {}) => {
  for (let waited = 0; waited < timeout; waited += every) {
    const value = await page.run(check).catch(() => null);

    if (value) {
      return value;
    }

    await sleep(every);
  }

  return false;
};

const KEY_CODES = {
  Escape: 27,
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [`F${index + 1}`, 112 + index])
  ),
};

// The title menu is up: both interfaces' offer this, with or without anything imported.
const TITLE_MENU = `return /Import assets/i.test(document.body.innerText);`;

const openWindows = `return [...document.querySelectorAll('dialog.window[open]')].map((dialog) => dialog.className);`;

// A save made by the engine: four computer players, a few turns in.
const makeSave = async () => {
  const { directory, outfile } = await bundle('engine', 'load'),
    file = path.join(directory, 'smoke.json');

  execFileSync(process.execPath, [outfile, '--save', file], {
    cwd: webRenderer,
    encoding: 'utf8',
    env: { ...envForSeed(1), LOAD_UNTIL: '12', LOAD_THEN: '12' },
    maxBuffer: 64 * 1024 * 1024,
  });

  const save = fs.readFileSync(file, 'utf8');

  fs.rmSync(directory, { recursive: true, force: true });

  return save;
};

// Hands `save` over as Load game does, its first seat to a person, and reloads into it.
const load = async (page, url, save) => {
  const [{ playerId }] = JSON.parse(save).clients;

  await page.run(`
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(${JSON.stringify(PENDING_DB)}, 1);

      request.onupgradeneeded = () => request.result.createObjectStore(${JSON.stringify(
        PENDING_STORE
      )});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise((resolve, reject) => {
      const transaction = database.transaction(${JSON.stringify(
        PENDING_STORE
      )}, 'readwrite');

      transaction.objectStore(${JSON.stringify(
        PENDING_STORE
      )}).put(${JSON.stringify(save)}, ${JSON.stringify(PENDING)});
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });

    database.close();
    sessionStorage.setItem(${JSON.stringify(PENDING)}, 'waiting');
    sessionStorage.setItem(${JSON.stringify(PENDING_SEATS)}, ${JSON.stringify(
    JSON.stringify({ [playerId]: { kind: 'human', name: 'Smoke' } })
  )});
  `);

  await page.goto(url);
};

// The game is on the page once a report answers its key: nothing does on the title menu.
const inGame = async (page) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    await page.key('F1', KEY_CODES.F1);

    const open = await until(
      page,
      `return document.querySelector('dialog.window.city-status[open]') !== null;`,
      { timeout: 500, every: 100 }
    );

    if (open) {
      await page.key('Escape', KEY_CODES.Escape);
      await until(
        page,
        `return document.querySelector('dialog.window[open]') === null;`,
        { timeout: 2_000, every: 100 }
      );

      return true;
    }
  }

  return false;
};

const main = async () => {
  const checks = [],
    check = (description, passed, detail = '') =>
      checks.push([description, Boolean(passed), detail]),
    chrome = findChrome();

  if (!chrome) {
    const message =
      'no Chrome found: set CHROME to one, or install it (Playwright’s cached headless shell will do)';

    if (required) {
      process.stdout.write(`FAIL ${NAME}: ${message}\n`);
      process.exit(1);
    }

    process.stdout.write(`SKIP ${NAME}: ${message}\n`);

    return;
  }

  if (
    !['frontend.js', 'backend.js', 'app.css'].every((file) =>
      fs.existsSync(path.join(webRenderer, 'dist', file))
    )
  ) {
    process.stdout.write(
      `FAIL ${NAME}: nothing built to open: run \`npm run build\` first\n`
    );
    process.exit(1);
  }

  const save = await makeSave(),
    server = await serve(),
    origin = `http://127.0.0.1:${server.address().port}`,
    // What may be said without anything being wrong: no sprites are imported here.
    expected = (problem) => problem.startsWith('Missing image:'),
    unexpected = (page) => page.problems.filter((said) => !expected(said));

  try {
    for (const mode of INTERFACES) {
      const page = await launch(chrome),
        url = `${origin}/?interface=${mode}`;

      try {
        await page.goto(url);

        check(
          `${mode}: the title menu comes up`,
          await until(page, TITLE_MENU)
        );

        await load(page, url, save);

        check(
          `${mode}: a save loads into a game whose reports answer their keys`,
          await inGame(page)
        );

        for (const [key, name] of REPORTS) {
          await page.key(key, KEY_CODES[key]);

          // Open, and with something in it: some reports ask the worker for what they show, and are an empty
          //  window until it answers. One with nothing to list still says so.
          const opened = await until(
            page,
            `
              const body = document.querySelector('dialog.window.${name}[open] > .body');

              return body !== null && body.innerText.trim() !== '';
            `,
            { timeout: 10_000 }
          );

          await page.key('Escape', KEY_CODES.Escape);

          const closed = await until(
            page,
            `return document.querySelector('dialog.window[open]') === null;`,
            { timeout: 10_000 }
          );

          check(
            `${mode}: ${key} opens the ${name} window with what it reports, and Escape closes it`,
            opened && closed,
            JSON.stringify(await page.run(openWindows))
          );
        }

        // A city, from the City Status report's first row: the row itself opens it, or the cell with its name.
        await page.key('F1', KEY_CODES.F1);
        await until(
          page,
          `return document.querySelector('dialog.window.city-status[open] tr td') !== null;`,
          { timeout: 10_000 }
        );
        await page.run(`
          const cell = document.querySelector('dialog.window.city-status[open] tr td'),
            row = cell?.closest('tr');

          for (const target of [row, cell, ...(row?.querySelectorAll('td, button, a') ?? [])]) {
            if (document.querySelector('dialog.window[open] .city-map canvas') !== null) {
              break;
            }

            target?.click();
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        `);

        const city = await until(
          page,
          `return document.querySelector('dialog.window[open] .city-map canvas') !== null;`,
          { timeout: 10_000 }
        );

        check(
          `${mode}: a city opens from the City Status report, with its map`,
          city,
          JSON.stringify(await page.run(openWindows))
        );
        check(
          `${mode}: and a button over each of its squares, inside the map (#854)`,
          await page.run(`
            const canvas = document.querySelector('dialog.window[open] .city-map canvas')?.getBoundingClientRect(),
              squares = [...document.querySelectorAll('dialog.window[open] .city-square')].map((square) => square.getBoundingClientRect());

            return canvas !== undefined && squares.length > 0 && squares.every((square) =>
              square.width > 0 &&
              square.left >= canvas.left - 1 && square.top >= canvas.top - 1 &&
              square.right <= canvas.right + 1 && square.bottom <= canvas.bottom + 1
            );
          `)
        );

        for (let closing = 0; closing < 4; closing++) {
          await page.key('Escape', KEY_CODES.Escape);
          await sleep(200);
        }

        check(
          `${mode}: and Escape closes it, and the report under it`,
          await until(
            page,
            `return document.querySelector('dialog.window[open]') === null;`,
            { timeout: 3_000 }
          ),
          JSON.stringify(await page.run(openWindows))
        );

        check(
          `${mode}: nothing went wrong on the way`,
          unexpected(page).length === 0,
          unexpected(page).slice(0, 5).join(' | ')
        );
      } finally {
        page.close();
      }
    }

    // A save from before a plugin was renamed (#915).
    {
      const page = await launch(chrome),
        url = `${origin}/`,
        [now, retired] = RETIRED_PLUGIN,
        old = save.split(JSON.stringify(now)).join(JSON.stringify(retired));

      try {
        await page.goto(url);
        await until(page, TITLE_MENU);

        check(
          'the save names the plugin that was renamed, so the older one can be made of it',
          old !== save
        );

        await load(page, url, old);

        check(
          'a save made before a plugin was renamed loads too',
          (await inGame(page)) && unexpected(page).length === 0,
          unexpected(page).slice(0, 3).join(' | ')
        );
      } finally {
        page.close();
      }
    }

    // A browser that keeps nothing for this site (#850): the stores throw when touched.
    {
      const page = await launch(chrome);

      try {
        await page.send('Page.addScriptToEvaluateOnNewDocument', {
          source: `
            const denied = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };

            Object.defineProperty(window, 'indexedDB', { get: () => ({ open: denied, deleteDatabase: denied }) });
            Object.defineProperty(window, 'localStorage', { get: denied });
            Object.defineProperty(window, 'sessionStorage', { get: denied });
          `,
        });
        await page.goto(`${origin}/`);

        const menu = await until(page, TITLE_MENU),
          // The page says that it could not read what is imported: that is the store refusing, as meant.
          said = page.problems.filter(
            (problem) =>
              !expected(problem) &&
              !problem.startsWith('Could not load the assets.')
          );

        check(
          'with site data blocked, the title menu still comes up, and nothing else goes wrong',
          menu && said.length === 0,
          said.slice(0, 3).join(' | ')
        );
      } finally {
        page.close();
      }
    }
    // The check on the checks: an error said in a worker is heard here, so one from the game's engine would be.
    {
      const page = await launch(chrome);

      try {
        await page.goto(`${origin}/`);
        await until(page, TITLE_MENU);
        await page.run(`
          new Worker(URL.createObjectURL(new Blob(
            ["console.error('said in a worker'); throw new Error('thrown in a worker');"],
            { type: 'text/javascript' }
          )));
        `);

        const heard = async (what) => {
          for (let waited = 0; waited < 5_000; waited += 100) {
            if (page.problems.some((problem) => problem.includes(what))) {
              return true;
            }

            await sleep(100);
          }

          return false;
        };

        check(
          'an error said or thrown in a worker is heard, so the engine’s would be',
          (await heard('said in a worker')) &&
            (await heard('thrown in a worker')),
          page.problems.slice(0, 3).join(' | ')
        );
      } finally {
        page.close();
      }
    }
  } finally {
    server.close();
  }

  const failed = checks.filter(([, passed]) => !passed);

  if (failed.length > 0) {
    process.stdout.write(
      `FAIL ${NAME} (${failed.length} of ${checks.length} checks)\n${failed
        .map(
          ([description, , detail]) =>
            `  ${description}${detail ? `\n    ${detail}` : ''}`
        )
        .join('\n')}\n`
    );
    process.exit(1);
  }

  process.stdout.write(
    `PASS ${NAME} (${checks.length} checks: both interfaces load a save, open every report and a city; an older save loads; site data blocked; a worker's errors are heard)\n`
  );
};

main().catch((error) => {
  process.stdout.write(`FAIL ${NAME}: ${error.stack ?? error}\n`);
  process.exit(1);
});
