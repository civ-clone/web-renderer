const numpadMap: { [key: string]: string } = {
  '0': 'Insert',
  '1': 'End',
  '2': 'ArrowDown',
  '3': 'PageDown',
  '4': 'ArrowLeft',
  '6': 'ArrowRight',
  '7': 'Home',
  '8': 'ArrowUp',
  '9': 'PageUp',
  '.': 'Delete',
};

export const mappedKeyFromEvent = (
  event: KeyboardEvent,
  numpadAsArrows: boolean = true
): string => {
  if (
    numpadAsArrows &&
    event.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD &&
    event.key in numpadMap
  ) {
    return numpadMap[event.key];
  }

  return event.key;
};
