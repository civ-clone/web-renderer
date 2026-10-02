// Which games a suite plays.
//
// One seed hid #245 for weeks: the save suite only ever played seed 1, and
// seed 1 happens to have no unit part-way through fortifying at turn 12, which
// is the only state that broke loading. Seeds 2 to 6 all have one. So a suite
// plays each of several seeds, as its own process, unless `CONFORMANCE_CONFIG`
// names one — which is how to rerun a single failing game.

const supplied = () => JSON.parse(process.env.CONFORMANCE_CONFIG || '{}');

const seedsToRun = (defaults) =>
  'seed' in supplied() ? [supplied().seed] : defaults;

// The environment for one seed's process, keeping anything else supplied.
const envForSeed = (seed) => ({
  ...process.env,
  CONFORMANCE_CONFIG: JSON.stringify({ ...supplied(), seed }),
});

module.exports = { envForSeed, seedsToRun };
