// What the page was built as, which the entry that bundles the packages tells them (#866): the packages read no file
//  of the build's themselves, so a client put together from them names its own.
export interface Build {
  // Shown on the title screens, and on the URLs of the files a deploy replaces (#476).
  version: string;
  // The music's worklet, a script of its own for `audioWorklet.addModule()` (#126).
  musicWorkletUrl: string;
}

const build: Build = {
  version: '',
  musicWorkletUrl: '',
};

export const setBuild = (details: Build): void => {
  Object.assign(build, details);
};

export default build;
