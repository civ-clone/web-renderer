export const h = <T extends HTMLElement>(
  element: T,
  handlers: { [key: string]: (event: any) => void }
): T => {
  Object.entries(handlers).forEach(([eventName, handler]): void =>
    element.addEventListener(eventName, handler)
  );

  return element;
};

// Text made safe to put in markup, as an element's content or an attribute's value.
export const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const idMap = new Map<Function, number>(),
  generateId = (element: Node) => {
    if (!idMap.has(element.constructor)) {
      idMap.set(element.constructor, 1);
    }

    const value = idMap.get(element.constructor)!;

    idMap.set(element.constructor, value + 1);

    return element.constructor.name + '-' + value;
  };

export const elementId = (element: Element) =>
  (element.id ||= generateId(element));

export const getClosestAncestorMatching = (
  element: Element | null,
  selector: string
) => {
  let result: Element | null = element;

  if (!element || element.matches(selector)) {
    return result;
  }

  if (!element.matches(`${selector} *`)) {
    return null;
  }

  while (result && !result.matches(selector)) {
    result = result.parentElement;
  }

  return result;
};
