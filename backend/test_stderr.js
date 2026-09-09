const { runCode } = require('./src/services/compilerService');

const code = `
public class Geeks {
    public static void main(String[] args) {
        int[] arr = {10, 20, 30, 40};
        int n = arr.length;
        System.out.print("Primitive Array -> ");
        for (int i = 0; i < n; i++)
            System.out.print(arr[i] + " ");
        System.out.println();
        String[] names = {"Lakshit", "Rahul", "Pankaj"};
        System.out.print("Non-Primitive Array -> ");
        for (int i = 0; i < names.length; i++)
            System.out.print(names[i] + " ");
    }
}
`;

(async () => {
    const r = await runCode({ language: 'java', moduleSlug: 'array', code });
    console.log('STATUS:', r.status);
    if (r.errorMessage) { console.log('ERROR:', r.errorMessage.split('\n').slice(0,5).join('\n')); process.exit(0); }
    const steps = r.trace && r.trace.steps || [];
    const uout  = r.trace && r.trace.userOutput || '';
    console.log('Steps:', steps.length);
    console.log('userOutput clean?', !uout.includes('DSVP_TRACE'));
    console.log('userOutput:', JSON.stringify(uout));
    if (steps.length > 0) {
        console.log('First 3 steps:', steps.slice(0,3).map(s=>JSON.stringify(s)).join('\n'));
    }
    process.exit(0);
})();
