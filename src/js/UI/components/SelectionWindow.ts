import { ActionWindow, ActionWindowOptions } from './ActionWindow';
import { s } from '@dom111/element';
import { INotificationWindow } from './NotificationWindow';
import { h } from '../lib/html';
import { mappedKeyFromEvent } from '../lib/mappedKey';
import { singleChoice } from '../lib/singleChoice';
import { t } from 'i18next';

export interface ISelectionWindow extends INotificationWindow {
  selectionList(): HTMLSelectElement;
}

export interface SelectionWindowOption {
  // A heading, already translated: options next to each other with the same `group` are listed under it (#432).
  group?: string;
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
          ...optionList.reduce(
            (elements: HTMLElement[], option, index): HTMLElement[] => {
              const optionElement = document.createElement('option');

              optionElement.value = String(option.value);
              optionElement.textContent = option.label ?? t(option.value);

              if (option.group === undefined) {
                elements.push(optionElement);

                return elements;
              }

              // A native heading, which the list's keys and type-ahead pass over as they move between options.
              if (optionList[index - 1]?.group !== option.group) {
                const groupElement = document.createElement('optgroup');

                groupElement.label = option.group;
                elements.push(groupElement);
              }

              elements[elements.length - 1].append(optionElement);

              return elements;
            },
            []
          )
        ),
        {
          keydown: (event: KeyboardEvent) => {
            const key = mappedKeyFromEvent(event);

            if (key === 'Enter') {
              chooseHandler(selectionList.value);

              event.preventDefault();

              // Or `bindClose` hears it too and closes the window a second time, so its close listeners run twice
              //  (#599).
              event.stopPropagation();
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
      // Each heading takes a row too.
      selectionList.setAttribute(
        'size',
        (
          optionList.length + selectionList.querySelectorAll('optgroup').length
        ).toString()
      );
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

    this.on('focus', () => this.selectionList().focus());
  }

  close() {
    // Never displayed, so there is nothing to remove, and closing it mustn't
    //  move the focus or bring on the next queued notification.
    if (this.#autoChosen) {
      this.emit(new CustomEvent('close'));

      return;
    }

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

  selectionList(): HTMLSelectElement {
    return this.#selectionList;
  }
}

export default SelectionWindow;
