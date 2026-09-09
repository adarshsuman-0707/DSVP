const { runCode } = require('./src/services/compilerService');

const code = `
public class Main {
    public static void main(String[] args) {
        int[] arr = {3, 1, 4, 1, 5, 9, 2, 6};

        int x = 0;
        int myCounter = 0;
        boolean flag = false;
        String status = "searching";
        double average = 0.0;
        long bigNum = 1000000L;

        for (int idx = 0; idx < arr.length; idx++) {
            int current = arr[idx];
            x += current;
            myCounter++;
            if (current > 5) flag = true;
        }

        average = (double) x / myCounter;
        status = "done";

        System.out.println(x + " " + myCounter + " " + flag + " " + status);
        System.out.printf("avg=%.2f%n", average);
    }
}
`;

(async () => {
    const r = await runCode({ language: 'java', moduleSlug: 'array', code });
    if (r.errorMessage) { console.log('ERROR:', r.errorMessage.split('\n')[0]); process.exit(0); }

    const lineSteps = (r.trace.steps || []).filter(s => s.op === 'line' && s.locals && Object.keys(s.locals).length > 0);
    const last = lineSteps[lineSteps.length - 1];
    console.log('Final locals:', JSON.stringify(last?.locals, null, 2));

    const expected = ['x','myCounter','flag','status','average','bigNum','idx','current'];
    const present  = Object.keys(last?.locals || {});
    expected.forEach(v => console.log(present.includes(v) ? `✓ ${v}` : `✗ MISSING: ${v}`));
    process.exit(0);
})();
