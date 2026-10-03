// A list with one option isn't a choice, so it is made for the player (#148).
// Returns that option, or `null` when the list should be shown: it has no
// options, several, or the caller has opted out because its one entry is still
// a decision.

export const singleChoice = <Option>(
  optionList: Option[],
  autoChooseSingle: boolean = true
): Option | null =>
  autoChooseSingle && optionList.length === 1 ? optionList[0] : null;

export default singleChoice;
