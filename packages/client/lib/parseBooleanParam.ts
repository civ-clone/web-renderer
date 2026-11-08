// Reads an on/off query-string switch such as `?debug=1`: 1/true/yes/on and
// 0/false/no/off (any case, surrounding space ignored); a missing or
// unrecognised value gives the default. Imports nothing, so `tsconfig.json`
// can check it (#339).
export const parseBooleanParam = (
  value: string | null,
  defaultValue: boolean
): boolean => {
  if (value === null) {
    return defaultValue;
  }

  const normalised = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalised)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalised)) {
    return false;
  }

  return defaultValue;
};

export default parseBooleanParam;
