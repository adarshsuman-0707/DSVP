require('dotenv').config();
const { runCode } = require('./src/services/compilerService');
const { buildTraceEvents } = require('./src/services/traceGeneratorService');

const javaGCD = `
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
}
`;

(async () => {
  console.log('=== Running Java GCD ===');
  const r = await runCode({ language: 'java', code: javaGCD });
  console.log('Status:', r.status);
  if (r.errorMessage) {
    console.log('ERROR:\n' + r.errorMessage);
    return;
  }
  console.log('Raw steps:', r.trace.steps.length);
  console.log('User output:', r.trace.userOutput);
  console.log('\n--- All raw steps ---');
  r.trace.steps.forEach((s, i) => console.log(`[${i}]`, JSON.stringify(s)));

  console.log('\n--- Normalized events ---');
  const events = buildTraceEvents({
    language: 'java', rawTrace: r.trace,
    moduleSlug: 'array', userOutput: r.trace.userOutput,
  });
  console.log('Total events:', events.length);
  events.forEach(e => {
    console.log(`[${e.step}] type=${e.type} func=${e.currentFunc} line=${e.currentLine} | ${e.description}`);
    if (e.callStack?.length) {
      e.callStack.forEach((f, i) => console.log(`     stack[${i}]: ${f.func} line=${f.line} locals=${JSON.stringify(f.locals)}`));
    }
  });
})();
