const { runCode } = require('./src/services/compilerService');

// Fully user-defined linked list — no DSVPLinkedList helper used
const code = `
public class Main {
    static class Node {
        int data;
        Node next;
        Node(int data) {
            this.data = data;
            this.next = null;
        }
    }

    public static void main(String[] args) {
        Node head = new Node(10);
        head.next = new Node(20);
        head.next.next = new Node(30);
        head.next.next.next = new Node(40);

        // Traverse
        Node cur = head;
        while (cur != null) {
            System.out.println(cur.data);
            cur = cur.next;
        }
    }
}
`;

(async () => {
    const r = await runCode({ language: 'java', moduleSlug: 'linked-list', code });
    console.log('STATUS:', r.status);
    if (r.errorMessage) {
        console.log('ERROR:', r.errorMessage.split('\n').slice(0,8).join('\n'));
        process.exit(0);
    }
    const steps = r.trace && r.trace.steps || [];
    const llSteps = steps.filter(s => s.op && s.op.startsWith('ll_'));
    console.log('Total steps:', steps.length);
    console.log('LL steps:', llSteps.length);
    if (llSteps.length > 0) {
        console.log('\nFirst 3 LL steps:');
        llSteps.slice(0,3).forEach(s => console.log(JSON.stringify(s)));
    }
    console.log('\nOutput:', (r.trace.userOutput || '').trim());
    process.exit(0);
})();
