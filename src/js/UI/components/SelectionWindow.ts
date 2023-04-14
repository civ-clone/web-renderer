import { ActionWindow, ActionWindowOptions } from './ActionWindow';
import { off, on, s } from '@dom111/element';
import { INotificationWindow } from './NotificationWindow';
import { h } from '../lib/html';
import { mappedKeyFromEvent } from '../lib/mappedKey';
import { t } from 'i18next';

export interface ISelectionWindow extends INotificationWindow {
  resize(): void;
  selectionList(): HTMLSelectElement;
}

export interface SelectionWindowOption {
  label?: string;
  value: any;
}

export interface SelectionWindowOptions extends ActionWindowOptions {
  autoFocus?: boolean;
  displayAll?: boolean;
}

export class SelectionWindow extends ActionWindow implements ISelectionWindow {
  #resizeHandler = () => this.resize();
  #selectionList: HTMLSelectElement;

  constructor(
    title: string,
    optionList: SelectionWindowOption[],
    onChoose: (selection: string) => void,
    body: string | Node | null = t('SelectionWindow.default-body'),
    options: SelectionWindowOptions = {}
  ) {
    options = {
      autoFocus: true,
      displayAll: false,
      ...options,
      actions: {
        primary: {
          label: t('Generic.ok'),
          action: () => chooseHandler(this.selectionList().value),
          ...(options.actions?.primary ?? {}),
        },
        ...options.actions,
      },
    };

    const chooseHandler = (selection: string): void => {
        this.emit(
          new CustomEvent<string>('selection', {
            detail: selection,
          })
        );

        this.close();

        onChoose(selection);
      },
      selectionList: HTMLSelectElement = h(
        s(
          `<select>${optionList
            .map(
              (option) =>
                `<option value="${option.value}">${t(
                  option.label || option.value
                )}</option>`
            )
            .join('')}</select>`
        ),
        {
          keydown: (event: KeyboardEvent) => {
            const key = mappedKeyFromEvent(event);

            if (key === 'Enter') {
              chooseHandler(selectionList.value);

              event.preventDefault();
            }

            if (
              [
                'ArrowDown',
                'ArrowUp',
                'End',
                'Home',
                'PageDown',
                'PageUp',
              ].includes(key) &&
              ![
                'ArrowDown',
                'ArrowUp',
                'End',
                'Home',
                'PageDown',
                'PageUp',
              ].includes(event.key)
            ) {
              const currentIndex = selectionList.selectedIndex,
                targetIndex = ['Home', 'PageUp'].includes(key)
                  ? 0
                  : ['End', 'PageDown'].includes(key)
                  ? selectionList.length - 1
                  : currentIndex + (key === 'ArrowUp' ? -1 : 1);

              if (targetIndex > -1 && targetIndex < selectionList.length) {
                selectionList.selectedIndex = targetIndex;
              }

              event.preventDefault();
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

    if (options.autoFocus && optionList.length === 1) {
      selectionList.setAttribute('autofocus', '');
    }

    super(
      title,
      s(
        '<div></div>',
        ...(body instanceof Node
          ? [body]
          : body === null
          ? []
          : [s(`<p>${body}</p>`)]),
        selectionList
      ),
      options
    );

    this.addClass('selectionWindow');
    this.#selectionList = selectionList;

    this.resize();

    on(window, 'resize', this.#resizeHandler);

    this.on('focus', () => this.selectionList().focus());
  }

  close() {
    off(window, 'resize', this.#resizeHandler);

    super.close();
  }

  display(): Promise<any> {
    return super.display().then(() => {
      const select = this.query('select');

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
        ((this.selectionList().parentElement?.nextElementSibling as HTMLElement)
          ?.offsetHeight ?? 0)
      }px - 2.1em)`;
    } catch (e) {
      console.warn(e);
    }
  }

  selectionList(): HTMLSelectElement {
    return this.#selectionList;
  }
}

export default SelectionWindow;
