// Tarjan's strongly connected components, iterative so a deep dependency chain
// cannot blow the stack.
const stronglyConnectedComponents = (nodes, edges) => {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let counter = 0;

  nodes.forEach((root) => {
    if (index.has(root)) {
      return;
    }

    const work = [[root, 0]];

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const [node] = frame;

      if (frame[1] === 0) {
        index.set(node, counter);
        low.set(node, counter);
        counter += 1;
        stack.push(node);
        onStack.add(node);
      }

      const children = edges(node);
      let recursed = false;

      while (frame[1] < children.length) {
        const child = children[frame[1]];

        frame[1] += 1;

        if (!index.has(child)) {
          work.push([child, 0]);
          recursed = true;

          break;
        }

        if (onStack.has(child)) {
          low.set(node, Math.min(low.get(node), index.get(child)));
        }
      }

      if (recursed) {
        continue;
      }

      if (low.get(node) === index.get(node)) {
        const component = [];

        for (;;) {
          const member = stack.pop();

          onStack.delete(member);
          component.push(member);

          if (member === node) {
            break;
          }
        }

        components.push(component.sort());
      }

      work.pop();

      if (work.length > 0) {
        const parent = work[work.length - 1][0];

        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
    }
  });

  return components;
};

// Publish order for a set of packages: a package cannot be published before
// anything it depends on. Cyclic groups share a wave and publish together.
const waves = (names, dependenciesOf) => {
  const members = new Set(names);
  const edges = (name) =>
    (dependenciesOf(name) || []).filter((dependency) =>
      members.has(dependency)
    );
  const components = stronglyConnectedComponents([...members].sort(), edges);
  const componentOf = new Map();

  components.forEach((component, i) =>
    component.forEach((name) => componentOf.set(name, i))
  );

  const componentWave = new Array(components.length).fill(null);

  // Tarjan emits components in reverse topological order, so every dependency's
  // component is already resolved by the time we reach a dependent.
  components.forEach((component, i) => {
    let wave = 0;

    component.forEach((name) =>
      edges(name).forEach((dependency) => {
        const other = componentOf.get(dependency);

        if (other === i) {
          return;
        }

        wave = Math.max(wave, componentWave[other] + 1);
      })
    );

    componentWave[i] = wave;
  });

  const result = new Map();

  components.forEach((component, i) =>
    component.forEach((name) => result.set(name, componentWave[i]))
  );

  return {
    wave: result,
    cycles: components.filter((component) => component.length > 1),
  };
};

module.exports = { stronglyConnectedComponents, waves };
