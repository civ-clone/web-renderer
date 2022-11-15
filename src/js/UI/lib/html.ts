export const parseSelector = (
  selector: string
): [
  string,
  string[],
  {
    [key: string]: string;
  }
] => {
  const classes: string[] = [],
    attributes: {
      [key: string]: string;
    } = {},
    strings: string[] = [];

  let element = 'div';

  const parts = selector
    .replace(
      /(?!<\\)(["']).+?(?!<\\)(\1)/g,
      (string) => 'string$' + (strings.push(string.slice(1, -1)) - 1)
    )
    .split(/(?=[.#[])/);

  parts.forEach((part) => {
    if (!part.match(/^[.#\[]/)) {
      element = part;

      return;
    }

    if (part[0] === '.') {
      classes.push(part.slice(1));

      return;
    }

    if (part[0] === '#') {
      attributes.id = part[0].slice(1);

      return;
    }

    if (part[0] === '[') {
      const match = part.match(/\[([^=]+)(=(["']?)(.+?)\3)?]/);

      if (match !== null) {
        attributes[match[1]] = (match[4] ?? '').replace(
          /string\$(\d+)/,
          (match, id) => strings[id]
        );
      }

      return;
    }
  });

  return [element, classes, attributes];
};

export const t = (string: string): Text => document.createTextNode(string);

export const e = <Element extends HTMLElement = HTMLElement>(
  selector: string,
  ...nodes: Node[]
): Element => {
  const [element, classes, attributes] = parseSelector(selector),
    e = document.createElement(element);

  if (classes.length) {
    e.classList.add(...classes);
  }

  a(e, attributes);

  if (nodes.length) {
    e.append(...nodes);
  }

  return e as Element;
};

export const s = (html: string, ...nodes: Node[]): Node => {
  const temp = document.createElement('div');

  temp.innerHTML = html;

  if (temp.childNodes.length !== 1) {
    throw new TypeError('Invalid `html` provided.');
  }

  temp.firstElementChild!.append(...nodes);

  return temp.firstElementChild!;
};

export const a = (
  element: HTMLElement,
  attributes: { [key: string]: string }
) => {
  Object.entries(attributes).forEach(([name, value]) =>
    element.setAttribute(name, value)
  );

  return element;
};

export const h = <T extends HTMLElement>(
  element: T,
  handlers: { [key: string]: (event: any) => void }
): T => {
  Object.entries(handlers).forEach(([eventName, handler]): void =>
    element.addEventListener(eventName, handler)
  );

  return element;
};
