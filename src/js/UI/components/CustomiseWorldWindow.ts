import { e, h, t } from '../lib/html';
import Options from '../../Engine/Requests/Options';
import Request from '../../Engine/Request';
import Transport from '../../Engine/Transport';
import Window from './Window';

type FinishedHandler = () => void;

export class CustomiseWorldWindow extends Window {
  #onFinished?: FinishedHandler;
  #transport: Transport;

  constructor(transport: Transport, onFinished?: FinishedHandler) {
    super('Customise world', e('div.customise-world'));

    this.#onFinished = onFinished;
    this.#transport = transport;

    this.init();
  }

  build(): void {
    super.build();

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
      playersInput = e<HTMLInputElement>(
        `input[name="players"][type="number"][value="${
          existingValues.players ?? 7
        }"][step="1"][min="1"][max="20"]`
      ),
      heightInput = e<HTMLInputElement>(
        `input[name="height"][type="number"][value="${
          existingValues.height ?? 60
        }"][step="1"][min="1"]`
      ),
      widthInput = e<HTMLInputElement>(
        `input[name="width"][type="number"][value="${
          existingValues.width ?? 80
        }"][step="1"][min="1"]`
      ),
      landCoverageInput = e<HTMLInputElement>(
        `input[name="landCoverage"][type="number"][value="${
          existingValues.landCoverage ?? 0.4
        }"][step="0.01"][min="0"]`
      ),
      landSizeInput = e<HTMLInputElement>(
        `input[name="landSize"][type="number"][value="${
          existingValues.landSize ?? 0.2
        }"][step="0.01"][min="0"]`
      ),
      maxIterationsInput = e<HTMLInputElement>(
        `input[name="maxIterations"][type="number"][value="${
          existingValues.maxIterations ?? 20
        }"][step="1"][min="1"]`
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

        this.#transport.send('start');

        if (this.#onFinished) {
          this.#onFinished();
        }
      };

    this.update(
      e(
        'div.customise-world',
        e('div.option', e('label', t('Players')), playersInput),
        e('div.option', e('label', t('Height')), heightInput),
        e('div.option', e('label', t('Width')), widthInput),
        e('div.option', e('label', t('Land coverage')), landCoverageInput),
        e('div.option', e('label', t('Land size')), landSizeInput),
        e('div.option', e('label', t('Max iterations')), maxIterationsInput),
        h(e('button', t('Build')), {
          click: () => submit(),
        })
      )
    );

    this.element().addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        submit();
      }
    });
  }
}

export default CustomiseWorldWindow;
