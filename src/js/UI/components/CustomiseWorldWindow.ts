import DifficultyWindow from './DifficultyWindow';
import MapGridWindow from './MapGridWindow';
import Options from '../../Engine/Requests/Options';
import Request from '../../Engine/Request';
import { TopologyId } from '../lib/topologyFor';
import Transport from '../Transport';
import Window from './Window';
import { customSizeProblem } from '../lib/worldSizes';
import { elementId, h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

type FinishedHandler = () => void;

/** The world's exact size and land, on the grid chosen before it (#89); then the difficulty level. */
export class CustomiseWorldWindow extends Window {
  #onFinished?: FinishedHandler;
  #topologyId: TopologyId;
  #transport: Transport;

  constructor(
    transport: Transport,
    onFinished?: FinishedHandler,
    topologyId: TopologyId = 'square'
  ) {
    super(t('CustomizeWorld.title'), s('<div class="customise-world"></div>'));

    this.#onFinished = onFinished;
    this.#topologyId = topologyId;
    this.#transport = transport;

    this.init();
  }

  /** Customize World: the map's grid, then the world on it. */
  static ask(transport: Transport, onFinished?: FinishedHandler): void {
    MapGridWindow.ask(
      (topologyId) =>
        new CustomiseWorldWindow(transport, onFinished, topologyId)
    );
  }

  async init(): Promise<void> {
    const existingValues = await this.#transport.request(
        new Options([
          'players',
          'height',
          'width',
          'landCoverage',
          'landSize',
          'maxIterations',
        ])
      ),
      playersInput = s<HTMLInputElement>(
        `<input name="players" type="number" value="${
          existingValues.players ?? 7
        }" step="1" min="1" max="20">`
      ),
      heightInput = s<HTMLInputElement>(
        `<input name="height" type="number" value="${
          existingValues.height ?? 60
        }" step="1" min="1">`
      ),
      widthInput = s<HTMLInputElement>(
        `<input name="width" type="number" value="${
          existingValues.width ?? 80
        }" step="1" min="1">`
      ),
      landCoverageInput = s<HTMLInputElement>(
        `<input name="landCoverage" type="number" value="${
          existingValues.landCoverage ?? 0.4
        }" step="0.01" min="0">`
      ),
      landSizeInput = s<HTMLInputElement>(
        `<input name="landSize" type="number" value="${
          existingValues.landSize ?? 0.2
        }" step="0.01" min="0">`
      ),
      maxIterationsInput = s<HTMLInputElement>(
        `<input name="maxIterations" type="number" value="${
          existingValues.maxIterations ?? 20
        }" step="1" min="1">`
      ),
      submit = () => {
        // A size the grid cannot be would otherwise start a game that never arrives: say so beside the box instead.
        const problem = customSizeProblem(
          this.#topologyId,
          widthInput.value,
          heightInput.value
        );

        if (problem !== null) {
          const input = problem.field === 'width' ? widthInput : heightInput;

          input.setCustomValidity(t(problem.message));
          input.reportValidity();

          return;
        }

        this.close();

        // Then the difficulty level, as a new game asks it (#173).
        DifficultyWindow.ask(this.#transport, async (difficulty) => {
          await this.#transport.request(
            new Request('setOptions', {
              players: playersInput.value,
              height: heightInput.value,
              width: widthInput.value,
              landCoverage: landCoverageInput.value,
              landSize: landSizeInput.value,
              maxIterations: maxIterationsInput.value,
              topologyId: this.#topologyId,
              difficulty,
            })
          );

          this.#transport.send('start', null);

          if (this.#onFinished) {
            this.#onFinished();
          }
        });
      };

    // The message goes once the box is changed.
    [widthInput, heightInput].forEach((input) =>
      input.addEventListener('input', () => input.setCustomValidity(''))
    );

    this.update(
      s(
        '<div class="customise-world"></div>',
        ...(
          [
            [playersInput, 'CustomizeWorld.players'],
            [heightInput, 'CustomizeWorld.height'],
            [widthInput, 'CustomizeWorld.width'],
            [landCoverageInput, 'CustomizeWorld.land-coverage'],
            [landSizeInput, 'CustomizeWorld.land-size'],
            [maxIterationsInput, 'CustomizeWorld.max-iterations'],
          ] as [HTMLInputElement, string][]
        ).map(([input, label]) =>
          s(
            `<div class="option"><label for="${elementId(input)}">${t(
              label
            )}</label></div>`,
            input
          )
        ),
        h(s(`<button>${t('CustomizeWorld.build')}</button>`), {
          click: () => submit(),
        })
      )
    );

    this.on('keydown', (event) => {
      if (event.key === 'Enter') {
        submit();

        event.preventDefault();
        event.stopPropagation();
      }
    });
  }
}

export default CustomiseWorldWindow;
