import {
  City as CityData,
  CityImprovement,
  Player,
  Specialist,
  SpendCost,
} from '@civ-clone/ui-protocol/types';
import { emit, s } from '@dom111/element';
import {
  getLabelForBuildableEntity,
  heldText,
  toggleAuto,
} from '@civ-clone/ui-client/components/lib/cityBuild';
import { buildHold } from '@civ-clone/ui-client/lib/cityTurns';
import { renderFigures, turnsLeft, yieldImages } from './lib/cityYields';
import Window, { WindowOptions } from '@civ-clone/ui-component-window/Window';
import CityBuildAvailable from '@civ-clone/ui-protocol/Requests/CityBuildAvailable';
import { openCityBuild } from './choices';
import CityNameWindow from './CityNameWindow';
import ConfirmationWindow from '@civ-clone/ui-component-window/ConfirmationWindow';
import Portal from '@civ-clone/ui-map/components/Portal';
import Transport from '@civ-clone/ui-client/Transport';
import { cityName } from '@civ-clone/ui-client/components/lib/city';
import { escape } from '@civ-clone/ui-widgets/lib/html';
import keepFocus from './lib/keepFocus';
import { reduceKnownYield } from '@civ-clone/ui-client/lib/yieldMap';
import progressBar from '@civ-clone/ui-component-progress-bar/ProgressBar';
import { specialistForKey } from '@civ-clone/ui-client/lib/specialists';
import { t } from 'i18next';
import watchCity from './lib/watchCity';
import { unlessRequestFailed } from '@civ-clone/ui-client/lib/unlessRequestFailed';

// The id of the note that a city's build will wait once paid for (#959), which its Buy buttons are described by.
const heldNoteId = (city: CityData): string => `city-held-${city.id}`,
  // The shields built up towards the item (#687). With no item chosen they are still there, kept for whatever is chosen
  //  next, so they are said on their own. A build a rule holds (#959) says what it waits for in place of its turns once
  //  paid for, and beneath them before, where the Buy buttons point to it.
  renderBuildProgress = (city: CityData): Node[] => {
    const progress = city.build.progress.value;

    if (city.build.building) {
      const perTurn = reduceKnownYield(city.yields, 'Production'),
        hold = buildHold(city.build);

      return [
        progressBar({
          group: 'Production',
          stored: progress,
          capacity: city.build.cost.value,
          perTurn,
        }),
        renderFigures(
          'Production',
          city.build,
          perTurn,
          turnsLeft(city.build, city.yields, 'Production'),
          hold?.now ? heldText(hold) : null
        ),
        ...(hold && !hold.now ? [renderHeldNote(city, heldText(hold))] : []),
      ];
    }

    if (progress <= 0) {
      return [];
    }

    return [
      s(
        `<p class="figures">${t('City.Build.stored', { count: progress })}</p>`
      ),
    ];
  },
  // A Buy button for a build that will wait once paid for points to the note that says so (#959): it is said with the
  //  button, and not only seen beside it.
  describeBuy = <T extends HTMLElement>(city: CityData, buy: T): T => {
    const hold = buildHold(city.build);

    if (hold && !hold.now) {
      buy.setAttribute('aria-describedby', heldNoteId(city));
    }

    return buy;
  },
  renderHeldNote = (city: CityData, text: string): HTMLElement => {
    const note = s(`<p class="held-note" id="${heldNoteId(city)}"></p>`);

    note.textContent = text;

    return note;
  },
  // The routes this city holds, and what each adds to its trade (#57).
  renderTradeRoutes = (city: CityData): Node | string =>
    city.tradeRoutes?.length
      ? s(
          `<div class="trade-routes"><header>${t(
            'City.trade-routes'
          )}</header></div>`,
          ...city.tradeRoutes.map((route) => {
            // Already escaped by `Generic.city-name`, so not again (as `TopCitiesReport` does).
            const name = t('Generic.city-name', {
              civilization: route.civilization,
              name: route.name,
            });

            // One Trade icon a point, as the city's own yields are drawn (#683), with the words for a screen reader.
            return s(
              `<p class="trade-route"><span class="visually-hidden">${t(
                'City.trade-route',
                {
                  city: name,
                  trade: route.trade,
                  interpolation: { escapeValue: false },
                }
              )}</span><span class="name" aria-hidden="true">${name}</span></p>`,
              ...yieldImages({ _: 'Trade', value: route.trade })
            );
          })
        )
      : '',
  // The step through the player's cities, in the order the engine lists them, wrapping at either end (#678).
  steppedCity = (cities: CityData[], city: CityData, by: number): CityData => {
    const index = cities.findIndex(({ id }) => id === city.id);

    if (index === -1 || cities.length < 2) {
      return city;
    }

    return cities[(index + by + cities.length) % cities.length]!;
  },
  // Enter or X closes the screen, but Enter on a focused button presses that button instead (#484).
  closesScreen = (event: KeyboardEvent): boolean =>
    ['Enter', 'x', 'X'].includes(event.key) &&
    !(
      event.key === 'Enter' &&
      event.target instanceof HTMLElement &&
      event.target.closest('button, [role="button"], input, select') !== null
    ),
  getTreasuryForYield = (player: Player, yieldName: string) =>
    player.treasuries.filter((treasury) => treasury.yield._ === yieldName)[0];

/** What a layout of the city screen is given to draw it with: the screen's own actions, for its buttons and clicks. */
export interface CityScreenContext {
  portal: Portal;
  transport: Transport;
  // A rival's city, as a Diplomat investigates it (#58): shown, with nothing to change.
  readOnly: boolean;
  chooseProduction(): void;
  completeProduction(spendCost: SpendCost): void;
  sellImprovement(improvement: CityImprovement, saleValue: SpendCost): void;
  changeSpecialist(specialist: Specialist): void;
  toggleAuto(): void;
  step(by: number): void;
  rename(): void;
}

/**
 * How the city screen is laid out: its contents, drawn afresh for each update, and its window. The screen's behaviour
 *  (its keys, following the city, stepping through the player's cities, buying, selling and renaming) is the same
 *  whatever the layout (#746).
 */
export interface CityLayout {
  render(city: CityData, context: CityScreenContext): Node;
  window: WindowOptions;
}

export class City extends Window {
  #city: CityData;
  // Whether the city screen is waiting for what the city can build, to open the production picker (#484).
  #choosingProduction = false;
  #context: CityScreenContext;
  #layout: CityLayout;
  #portal: Portal;
  #readOnly: boolean;
  // Whether a specialist has been changed and the city not yet updated with it. Changing one replaces it, so a second
  //  change sent before then would name a specialist the city no longer has, and be lost (#484).
  #specialistChanging = false;
  #transport: Transport;
  // None for a rival's city, which isn't kept up to date.
  #unwatch: (() => void) | null = null;

  /**
   * With `readOnly`, as for a rival's city a Diplomat has investigated (#58), the screen shows the city as it was sent
   * and changes nothing: no production, worked tiles, specialists or buying, and no updates. `layout` is how it's drawn
   * (#746): the interface's own, from its `cityScreen` slot (`openCity`), as there is no default (#861).
   */
  constructor(
    city: CityData,
    portal: Portal,
    transport: Transport,
    { readOnly = false, layout }: { readOnly?: boolean; layout: CityLayout }
  ) {
    const context: CityScreenContext = {
      portal,
      transport,
      readOnly,
      chooseProduction: () => this.changeProduction(),
      completeProduction: (spendCost) => this.completeProduction(spendCost),
      sellImprovement: (improvement, saleValue) =>
        this.sellImprovement(improvement, saleValue),
      changeSpecialist: (specialist) => this.#changeSpecialist(specialist),
      toggleAuto: () => toggleAuto(this.#city.build, transport),
      step: (by) => this.step(by),
      rename: () => this.rename(),
    };

    super(
      // The title is HTML, and a name the player typed (#676) is text.
      escape(cityName(city)),
      layout.render(city, context),
      layout.window
    );

    this.#context = context;
    this.#layout = layout;
    this.#city = city;
    this.#portal = portal;
    this.#readOnly = readOnly;
    this.#transport = transport;

    if (!readOnly) {
      this.#watch();
    }

    this.on('keydown', (event) => {
      if (readOnly) {
        if (closesScreen(event)) {
          this.close();
        }

        return;
      }

      if (['c', 'C'].includes(event.key)) {
        this.changeProduction();

        event.preventDefault();
        event.stopPropagation();
      }

      // Auto on or off (#194).
      if (['a', 'A'].includes(event.key)) {
        toggleAuto(this.#city.build, this.#transport);

        event.preventDefault();
        event.stopPropagation();
      }

      if (['b', 'B'].includes(event.key)) {
        const buyButtons = this.queryAll('button.buy');

        if (!buyButtons.length) {
          return;
        }

        // TODO: handle this scenario properly
        // if (buyButtons.length > 1) {
        //
        // }

        emit(buyButtons[0]!, new MouseEvent('click'));

        event.preventDefault();
        event.stopPropagation();
      }

      // The previous or next city (#678). Not inside a field, where they move the caret.
      if (
        ['ArrowLeft', 'ArrowRight'].includes(event.key) &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest('input, select, textarea') !== null
        )
      ) {
        this.step(event.key === 'ArrowLeft' ? -1 : 1);

        event.preventDefault();
        event.stopPropagation();

        return;
      }

      if (!event.ctrlKey && !event.altKey && !event.metaKey) {
        const specialist = specialistForKey(
          event.key,
          this.#city.specialists ?? []
        );

        if (specialist) {
          this.#changeSpecialist(specialist);

          event.preventDefault();
          event.stopPropagation();
        }
      }

      if (closesScreen(event)) {
        this.close();
      }
    });
  }

  #details(city: CityData): Node {
    return this.#layout.render(city, this.#context);
  }

  // The player's cities as the page holds them now, which a step goes through (#678).
  #cities(): CityData[] {
    return this.#city.player.cities ?? [this.#city];
  }

  #watch(): void {
    this.#unwatch = watchCity(this.#city, {
      update: (updatedCity, _data, goldOnly) => {
        // Read before the redraw, which takes away whatever had the focus inside the screen.
        const focusedWindow =
            document.activeElement?.closest('dialog.window') ?? null,
          // The control the keyboard is on, to put it back on its like in what is drawn next (#852).
          restoreFocus = keepFocus(this.element());

        this.#city = updatedCity;

        // A name changed (#676) shows at once.
        this.setTitle(escape(cityName(updatedCity)));
        this.update(this.#details(updatedCity));

        // The specialists drawn now are the city's latest, so they can be changed again.
        this.#specialistChanging = false;

        // Back to the screen if the redraw took it from inside it. Not from a window open over the screen, a
        //  production picker or a confirmation, where the next Enter is meant for that window (#484); and for a
        //  change to the player's gold alone, which can come at any time, not from anywhere else either (#503).
        if (
          !restoreFocus() &&
          (focusedWindow === this.element() ||
            (focusedWindow === null && !goldOnly))
        ) {
          this.element().focus();
        }
      },
      // Captured or destroyed.
      close: () => this.close(),
    });
  }

  /**
   * Shows the player's city `by` places along from this one, wrapping at either end (#678). The screen is filled
   * again for it rather than closed and opened, and starts afresh: watching that city, with no specialist change or
   * production picker of the last one's outstanding.
   */
  step(by: number): void {
    if (this.#readOnly) {
      return;
    }

    const city = steppedCity(this.#cities(), this.#city, by);

    if (city === this.#city || city.id === this.#city.id) {
      return;
    }

    this.#unwatch?.();

    this.#city = city;
    this.#choosingProduction = false;
    this.#specialistChanging = false;

    this.setTitle(escape(cityName(city)));
    this.update(this.#details(city));
    this.#watch();

    // The buttons it was pressed with have gone with the redraw.
    this.element().focus();
  }

  // The "City name" box, and the name it gives sent to the worker, which decides whether it stands (#676).
  rename(): void {
    if (this.#readOnly) {
      return;
    }

    const city = this.#city,
      shown = cityName(city);

    // The name as shown, which a translation may have changed: left as it is, it is not a new name.
    new CityNameWindow(shown, (name) => {
      if (name === shown) {
        return;
      }

      this.#transport.send('action', {
        name: 'RenameCity',
        id: city.id,
        cityName: name,
      });
    });
  }

  async changeProduction(): Promise<void> {
    // Asked again before the first answer came: one picker is enough (#484).
    if (this.#choosingProduction) {
      return;
    }

    this.#choosingProduction = true;

    const cityBuild = this.#city.build;

    let available;

    try {
      available = await this.#transport.request(
        new CityBuildAvailable(cityBuild.id)
      );
    } catch (error) {
      // Not answered: the player has been told, and can ask again (#580).
      unlessRequestFailed(error);

      return;
    } finally {
      // Not once the screen has stepped on, which has cleared it already, and may be asking for the next city (#678).
      if (this.#city.build.id === cityBuild.id) {
        this.#choosingProduction = false;
      }
    }

    // Closed while waiting: the picker would open over the map (#484). Or moved on to another city (#678), which the
    //  list isn't for.
    if (!this.element().isConnected || this.#city.build.id !== cityBuild.id) {
      return;
    }

    openCityBuild(this.#city.build, available, this.#transport, () =>
      this.element().focus()
    );
  }

  #changeSpecialist(specialist: Specialist): void {
    if (this.#specialistChanging) {
      return;
    }

    this.#specialistChanging = true;

    this.#transport.send('action', {
      name: 'ChangeSpecialist',
      id: specialist.id,
    });
  }

  override close(): void {
    this.#unwatch?.();

    super.close();
  }

  completeProduction(spendCost: SpendCost): void {
    // The city the confirmation is for, whichever the screen has stepped to by the time it's answered (#678).
    const city = this.#city,
      cityBuild = city.build;

    if (!cityBuild.building) {
      return;
    }

    // The engine only asks for a yield the player keeps a treasury of.
    const treasury = getTreasuryForYield(city.player, spendCost.resource._)!;

    // A build that will wait once paid for says so before the gold is spent (#959).
    const hold = buildHold(cityBuild);

    new ConfirmationWindow(
      t('ConfirmationWindow.Generic.title'),
      t('City.CompleteProduction.body', {
        item: getLabelForBuildableEntity(cityBuild.building.item),
        spendCost,
        treasury,
      }) +
        (hold && !hold.now
          ? ` ${t('City.CompleteProduction.held', {
              held: heldText(hold),
            })}`
          : ''),
      () =>
        this.#transport.send('action', {
          name: 'CompleteProduction',
          id: cityBuild.id,
          treasury: treasury.id,
        })
    );
  }

  sellImprovement(improvement: CityImprovement, saleValue: SpendCost): void {
    // As for buying: the city it was opened for (#678).
    const city = this.#city,
      // As above: a yield the player keeps a treasury of.
      treasury = getTreasuryForYield(city.player, saleValue.resource._)!;

    new ConfirmationWindow(
      t('ConfirmationWindow.Generic.title'),
      t('City.SellImprovement.body', {
        item: getLabelForBuildableEntity(improvement),
        saleValue,
      }),
      () =>
        this.#transport.send('action', {
          name: 'SellImprovement',
          id: city.id,
          improvement: improvement.id,
          treasury: treasury.id,
        })
    );
  }
}

// Drawn by the new layout too (#746).
export { describeBuy, heldNoteId, renderBuildProgress, renderTradeRoutes };

export default City;
