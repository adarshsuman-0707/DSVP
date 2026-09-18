const { runCode } = require('./src/services/compilerService');
const { buildTraceEvents } = require('./src/services/traceGeneratorService');

const code = `
stack = []
stack.append(10)
stack.append(25)
stack.append(42)
stack.append(99)
top_val = stack[len(stack) - 1]
print("Top:", top_val)
popped = stack[len(stack) - 1]
stack = stack[:len(stack) - 1]
print("Popped:", popped)
`;

(async () => {
  const r = await runCode({ language: 'python', moduleSlug: 'stack', code });
  console.log('STATUS:', r.status);
  if (r.errorMessage) { console.log('ERR:', r.errorMessage); process.exit(0); }
  
  const events = buildTraceEvents({ language: 'python', rawTrace: r.trace, moduleSlug: 'stack', userOutput: r.trace.userOutput });
  console.log('Total events:', events.length);
  events.forEach((e, i) => {
    console.log(i+1, e.type, '| arrayState:', JSON.stringify(e.arrayState), '| activeIndex:', e.activeIndex, '| desc:', e.description?.slice(0,50));
  });
  process.exit(0);
})();
