export const h = <T extends HTMLElement>(
  element: T,
  handlers: { [key: string]: (event: any) => void }
): T => {
  Object.entries(handlers).forEach(([eventName, handler]): void =>
    element.addEventListener(eventName, handler)
  );

  return element;
};
