import { ActionWindow, ActionWindowOptions } from './ActionWindow';
import { off, on, s } from '@dom111/element';
import { INotificationWindow } from './NotificationWindow';
import { h } from '../lib/html';
import { mappedKeyFromEvent } from '../lib/mappedKey';
import { singleChoice } from '../lib/singleChoice';
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
  // A list with one option is chosen without being shown (#148). `false` is
  //  for a list whose one entry is still a decision.
  autoChooseSingle?: boolean;
  displayAll?: boolean;
}

export class SelectionWindow extends ActionWindow implements ISelectionWindow {
  #autoChosen: boolean = false;
  #resizeHandler = () => this.resize();
  #selectionList: HTMLSelectElement;

  constructor(
    title: string,
    optionList: SelectionWindowOption[],
    onChoose: (selection: string) => void,
    body: string | Node | null = t('SelectionWindow.default-body'),
    options: SelectionWindowOptions = {}
  ) {
    const autoChoice = singleChoice(optionList, options.autoChooseSingle);

    options = {
      autoFocus: true,
      displayAll: false,
      ...options,
      ...(autoChoice === null ? {} : { autoDisplay: false }),
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
          '<select></select>',
          // Labels are already translated by the caller, so they're used as-is: passing them through `t()` again
          //  lets i18next read any `:` as a namespace separator (#3). Only an unlabelled value is translated here.
          // Set as text rather than markup, so names containing `'`, `<` or `&` display literally.
          ...optionList.map((option) => {
            const optionElement = document.createElement('option');

            optionElement.value = String(option.value);
            optionElement.textContent = option.label ?? t(option.value);

            return optionElement;
          })
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

    if (autoChoice !== null) {
      this.#autoChosen = true;

      // Not from inside the constructor: `onChoose` usually closes the window
      //  the caller is still constructing.
      queueMicrotask(() => chooseHandler(String(autoChoice.value)));

      return;
    }

    this.resize();

    on(window, 'resize', this.#resizeHandler);

    this.on('focus', () => this.selectionList().focus());
  }

  close() {
    // Never displayed, so there is nothing to remove, and closing it mustn't
    //  move the focus or bring on the next queued notification.
    if (this.#autoChosen) {
      this.emit(new CustomEvent('close'));

      return;
    }

    off(window, 'resize', this.#resizeHandler);

    super.close();
  }

  autoChosen(): boolean {
    return this.#autoChosen;
  }

  display(): Promise<any> {
    // `Window`'s constructor displays the window before this class's fields
    //  exist, hence the `in`.
    if (#autoChosen in this && this.#autoChosen) {
      return Promise.resolve();
    }

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
