import { e, h, t } from '../lib/html';
import {
  NotificationWindow,
  NotificationWindowOptions,
} from './NotificationWindow';

export interface SelectionWindowOption {
  label?: string;
  value: any;
}

export interface SelectionWindowAction {
  label: string;
  action: (select: SelectionWindow) => void;
}

export interface SelectionWindowActions {
  [key: string]: SelectionWindowAction;
}

export interface SelectionWindowOptions extends NotificationWindowOptions {
  actions?: SelectionWindowActions;
  autoFocus?: boolean;
  displayAll?: boolean;
}

export class SelectionWindow extends NotificationWindow {
  #resizeHandler = () => this.resize();
  #selectionList: HTMLSelectElement;

  constructor(
    title: string,
    optionList: SelectionWindowOption[],
    onChoose: (selection: string) => void,
    body: string | Node | null = 'Please choose one of the following:',
    options: SelectionWindowOptions = {}
  ) {
    options = {
      autoFocus: true,
      displayAll: false,
      ...options,
      actions: {
        primary: {
          label: 'OK',
          action: (selectionWindow) =>
            chooseHandler(selectionWindow.selectionList().value),
          ...(options.actions?.primary ?? {}),
        },
        ...options.actions,
      },
    };

    const chooseHandler = (selection: string): void => {
        this.element().dispatchEvent(
          new CustomEvent<string>('selection', {
            detail: selection,
          })
        );

        this.close();

        onChoose(selection);
      },
      selectionList: HTMLSelectElement = h(
        e(
          'select',
          ...optionList.map((option) =>
            e(
              `option[value="${option.value}"]`,
              t(option.label || option.value)
            )
          )
        ) as HTMLSelectElement,
        {
          keydown: (event: KeyboardEvent) => {
            if (event.key === 'Enter') {
              chooseHandler(selectionList.value);
            }
          },
          dblclick: () => chooseHandler(selectionList.value),
        }
      );

    if (options.displayAll && optionList.length > 1) {
      selectionList.setAttribute('size', optionList.length.toString());
    }

    if (options.autoFocus && optionList.length > 1) {
      selectionList.setAttribute('autofocus', '');
    }

    super(
      title,
      e(
        'div',
        ...(body instanceof Node
          ? [body]
          : body === null
          ? []
          : [e('p', t(body))]),
        selectionList,
        e(
          'footer',
          ...Object.entries(options.actions!).map(([, { label, action }]) =>
            h(e('button', t(label)), {
              click: () => action(this),
              keydown: (event) => {
                if (event.key === 'Enter') {
                  action(this);
                }
              },
            })
          )
        )
      ),
      options
    );

    this.element().classList.add('selectionWindow');
    this.#selectionList = selectionList;

    this.resize();

    window.addEventListener('resize', this.#resizeHandler);
  }

  close() {
    window.removeEventListener('resize', this.#resizeHandler);

    super.close();
  }

  display(): Promise<any> {
    return super.display(false).then(() => {
      const select = this.element().querySelector('select');

      if (select && select.hasAttribute('autofocus')) {
        select.focus();
      }
    });
  }

  resize(): void {
    // TODO: I'd like to have this height scaled automatically.
    //  Feels like it should be possible using CSS flexbox, but can't get it to work...
    try {
      this.selectionList().style.maxHeight = 'none';
      this.selectionList().style.maxHeight = `calc(${
        this.element().offsetHeight -
        (this.element().firstElementChild! as HTMLElement).offsetHeight -
        ((this.selectionList().previousElementSibling as HTMLElement)
          ?.offsetHeight ?? 0) -
        (this.selectionList().nextElementSibling as HTMLElement).offsetHeight
      }px - 2em)`;
    } catch (e) {
      console.warn(e);
    }
  }

  selectionList(): HTMLSelectElement {
    return this.#selectionList;
  }
}

export default SelectionWindow;
