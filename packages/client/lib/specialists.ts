// The order the city screen draws specialists in, and which of them a number
// key refers to (#107). Kept free of DOM imports so it can be tested in Node.

const specialistOrder = ['Entertainer', 'TaxCollector', 'Scientist'];

export const orderSpecialists = <Specialist extends { _: string }>(
  specialists: Specialist[]
): Specialist[] =>
  [...specialists].sort(
    (a, b) => specialistOrder.indexOf(a._) - specialistOrder.indexOf(b._)
  );

// Keys 1–8 pick the 1st–8th specialist as drawn. Returns `null` for any other
// key, or when the city has fewer specialists than the number pressed.
export const specialistForKey = <Specialist extends { _: string }>(
  key: string,
  specialists: Specialist[]
): Specialist | null =>
  /^[1-8]$/.test(key)
    ? orderSpecialists(specialists)[parseInt(key, 10) - 1] ?? null
    : null;
