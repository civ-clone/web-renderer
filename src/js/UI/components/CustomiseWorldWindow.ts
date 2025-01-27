import Options from '../../Engine/Requests/Options';
import Request from '../../Engine/Request';
import Transport from '../Transport';
import Window from './Window';
import { elementId, h } from '../lib/html';
import { s } from '@dom111/element';
import { t } from 'i18next';

type FinishedHandler = () => void;

export class CustomiseWorldWindow extends Window {
  #onFinished?: FinishedHandler;
  #transport: Transport;

  constructor(transport: Transport, onFinished?: FinishedHandler) {
    super(t('CustomizeWorld.title'), s('<div class="customise-world"></div>'));

    this.#onFinished = onFinished;
    this.#transport = transport;

    this.init();
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
      submit = async () => {
        this.close();

        await this.#transport.request(
          new Request('setOptions', {
            players: playersInput.value,
            height: heightInput.value,
            width: widthInput.value,
            landCoverage: landCoverageInput.value,
            landSize: landSizeInput.value,
            maxIterations: maxIterationsInput.value,
          })
        );

        this.#transport.send('start', null);

        if (this.#onFinished) {
          this.#onFinished();
        }
      };

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
