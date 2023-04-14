import {
  SelectionWindow,
  SelectionWindowOption,
  SelectionWindowOptions,
} from './SelectionWindow';
import { t } from 'i18next';

declare global {
  interface GlobalEventHandlersEventMap {
    selection: CustomEvent<string>;
  }
}

export class MandatorySelection extends SelectionWindow {
  constructor(
    title: string,
    optionList: SelectionWindowOption[],
    onChoose: (selection: string) => void,
    body: string | Node | null = t('MandatorySelection.default-body'),
    options: SelectionWindowOptions = {
      canClose: false,
    }
  ) {
    super(title, optionList, onChoose, body, {
      ...options,
      displayAll: true,
      modal: true,
    });
  }

  display(): Promise<string> {
    return new Promise<string>((resolve) => {
      this.on('selection', ({ detail }) => resolve(detail));

      super.display();
    });
  }
}

export default MandatorySelection;
