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
  fs.writeFileSync('temp_instrumented.java', out);
  console.log('Successfully instrumented! Length:', out.length);
  // Compile and run
  execSync('javac temp_instrumented.java');
  console.log('Compiled successfully!');
  const runRes = execSync('java Main', { encoding: 'utf8' });
  console.log('Run stdout:', runRes);
} catch (e) {
  console.error('Error:', e.message);
  if (e.stdout) console.log('STDOUT:', e.stdout.toString());
  if (e.stderr) console.log('STDERR:', e.stderr.toString());
}
