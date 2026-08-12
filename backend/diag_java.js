require('dotenv').config();
const { runCode }          = require('./src/services/compilerService');
const { buildTraceEvents } = require('./src/services/traceGeneratorService');

const code = `
import java.util.*;
public class Main {
    public static void main(String[] args) {
        int[] nums = {1, 2, 8, 1, 9, 5, 6};
        System.out.println(findGCD(nums));
    }
    public static int findGCD(int[] nums) {
        int max = Integer.MIN_VALUE;
        int min = Integer.MAX_VALUE;
        for (int i : nums) {
            max = Math.max(max, i);
            min = Math.min(min, i);
        }
        if (max == min) { return max; }
        int rem = max % min;
        while (rem != 0) {
            max = min;
            min = rem;
            rem = max % min;
        }
        return min;
    }
}`;

(async () => {
  const r = await runCode({ language: 'java', code });
  console.log('status:', r.status);
  if (r.errorMessage) { console.log('ERROR:\n' + r.errorMessage); return; }
  console.log('raw steps:', r.trace.steps.length);
  console.log('\n--- Raw steps ---');
  r.trace.steps.forEach((s,i) => console.log(`[${i}]`, JSON.stringify(s)));

  const events = buildTraceEvents({ language:'java', rawTrace: r.trace, moduleSlug:'array', userOutput: r.trace.userOutput });
  console.log('\n--- Events ---');
  events.forEach(e => {
    const stack = (e.callStack||[]).map(f=>f.func).join(' > ');
    console.log(`[${e.step}] ${e.type} | func=${e.currentFunc} line=${e.currentLine} | stack=[${stack}] | locals=${JSON.stringify(e.locals)}`);
  });
})();
