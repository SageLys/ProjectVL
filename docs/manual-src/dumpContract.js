import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});

try {
  const { ATOM_CONTRACT, TRIGGER_NAMES } = await server.ssrLoadModule('/src/core/effects/atomContract.ts');
  const { AFFIX_SINKS } = await server.ssrLoadModule('/src/config/affixSinks.ts');
  const { describeLabel } = await server.ssrLoadModule('/src/editor/labels.ts');
  const out = {
    atoms: {},
    triggers: TRIGGER_NAMES,
    affixSinks: AFFIX_SINKS,
    labels: {},
    triggerLabels: {},
  };
  for (const [name, contract] of Object.entries(ATOM_CONTRACT)) {
    out.atoms[name] = contract;
    out.labels[name] = { atom: describeLabel('atom', name), params: {} };
    for (const param of Object.keys(contract.params)) {
      out.labels[name].params[param] = describeLabel('atomParam', `${name}.${param}`);
    }
  }
  for (const trigger of TRIGGER_NAMES) {
    out.triggerLabels[trigger] = describeLabel('enumValue', `trigger.${trigger}`);
  }
  process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
} finally {
  await server.close();
}
