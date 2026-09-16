const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const code = `class DLLNode {
    int data;
    DLLNode next;
    DLLNode prev;

    DLLNode(int data) {
        this.data = data;
        this.next = null;
        this.prev = null;
    }
}

public class ReverseDLLDemo {

    public static DLLNode reverseDLL(DLLNode head) {
        if (head == null || head.next == null) {
            return head;
        }

        DLLNode current = head;
        DLLNode temp = null;

        while (current != null) {
            temp = current.prev;
            current.prev = current.next;
            current.next = temp;
            current = current.prev;
        }

        return temp.prev;
    }

    public static void printList(DLLNode head) {
        DLLNode current = head;
        while (current != null) {
            System.out.print(current.data + " <-> ");
            current = current.next;
        }
        System.out.println("NULL");
    }

    public static void main(String[] args) {
        DLLNode head = new DLLNode(1);
        DLLNode node2 = new DLLNode(2);
        DLLNode node3 = new DLLNode(3);
        DLLNode node4 = new DLLNode(4);

        head.next = node2;
        node2.prev = head;

        node2.next = node3;
        node3.prev = node2;

        node3.next = node4;
        node4.prev = node3;

        System.out.print("Original List: ");
        printList(head);

        DLLNode reversedHead = reverseDLL(head);

        System.out.print("Reversed List: ");
        printList(reversedHead);
    }
}`;

fs.writeFileSync('temp_test.java', code);
try {
  const jar = path.join(__dirname, 'src', 'services', 'tools', 'dsvp-java-instrumenter.jar');
  const out = execSync(`java -jar "${jar}" temp_test.java`, { encoding: 'utf8' });
  fs.writeFileSync('Main.java', out);
  console.log('Successfully instrumented! Length:', out.length);
  // Compile and run
  execSync('javac Main.java');
  console.log('Compiled successfully!');
  const { spawnSync } = require('child_process');
  const runRes = spawnSync('java', ['Main'], { encoding: 'utf8' });
  console.log('Run stdout:\n', runRes.stdout);
  console.log('Run stderr (trace lines count):', runRes.stderr.split('\n').filter(l => l.startsWith('DSVP_TRACE')).length);
  const { buildTraceEvents } = require('./src/services/traceGeneratorService');
  const rawSteps = runRes.stderr.split('\n')
    .filter(l => l.startsWith('DSVP_TRACE:'))
    .map(l => JSON.parse(l.slice('DSVP_TRACE:'.length)));
  
  const events = buildTraceEvents({
    language: 'java',
    rawTrace: { steps: rawSteps },
    moduleSlug: 'doubly-linked-list',
    userOutput: runRes.stdout
  });
  console.log('Total events built:', events.length);
  console.log('Categories:', [...new Set(events.map(e => e.category))]);
  console.log('Types:', [...new Set(events.map(e => e.type))]);
  console.log('First 5 events summary:', events.slice(0, 5).map(e => ({ step: e.step, type: e.type, category: e.category, isDoubly: e.isDoubly, nodesLen: e.linkedListState?.length, arrLen: e.arrayState?.length })));
} catch (e) {
  console.error('Error:', e.message);
}
