import {
  SelectionWindow,
  SelectionWindowOption,
  SelectionWindowOptions,
} from './SelectionWindow';

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
    body: string | Node | null = 'Please choose one of the following:',
    options: SelectionWindowOptions = {
      canClose: false,
      displayAll: false,
    }
  ) {
    super(title, optionList, onChoose, body, {
      ...options,
      displayAll: true,
    });
  }

  display(): Promise<string> {
    return new Promise<string>((resolve) => {
      this.element().addEventListener('selection', ({ detail }) =>
        resolve(detail)
      );

      super.display();
    });
  }
}

export default MandatorySelection;
