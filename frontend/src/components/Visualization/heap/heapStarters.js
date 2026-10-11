/**
 * Starter programs for the Heap module. They are ordinary programs — the
 * tracer does not look for these names, so rename anything. Input comes from
 * the values hardcoded in the program.
 */

export const HEAP_STARTER = {
  python: `# Heap — write your own heap; DSVP follows what it does to the list.
# Nothing here is special: rename the class, the methods, the variables.
# Flip the two comparisons marked (*) to turn this into a max-heap.

class MinHeap:
    def __init__(self):
        self.items = []

    def push(self, value):
        self.items.append(value)
        self._sift_up(len(self.items) - 1)

    def pop(self):
        top = self.items[0]
        last = self.items.pop()
        if self.items:
            self.items[0] = last
            self._sift_down(0)
        return top

    def peek(self):
        return self.items[0]

    def _sift_up(self, i):
        while i > 0:
            parent = (i - 1) // 2
            if self.items[i] < self.items[parent]:          # (*)
                self.items[i], self.items[parent] = self.items[parent], self.items[i]
                i = parent
            else:
                break

    def _sift_down(self, i):
        n = len(self.items)
        while True:
            left, right, best = 2 * i + 1, 2 * i + 2, i
            if left < n and self.items[left] < self.items[best]:     # (*)
                best = left
            if right < n and self.items[right] < self.items[best]:   # (*)
                best = right
            if best == i:
                break
            self.items[i], self.items[best] = self.items[best], self.items[i]
            i = best


values = [5, 3, 8, 1, 9, 2]

heap = MinHeap()
for v in values:
    heap.push(v)

print("peek:", heap.peek())
for _ in range(min(2, len(values))):
    print("extract:", heap.pop())
`,

  java: `// Heap — write your own heap; DSVP follows what it does to the array.
// Nothing here is special: rename the class, the fields, the methods.
// Flip the two comparisons marked (*) to turn this into a max-heap.
public class Main {

    static class MinHeap {
        private final int[] data;
        private int count = 0;

        MinHeap(int capacity) {
            data = new int[capacity];
        }

        void push(int value) {
            data[count] = value;
            count++;
            int i = count - 1;
            while (i > 0) {
                int parent = (i - 1) / 2;
                if (data[i] < data[parent]) {                 // (*)
                    int tmp = data[i];
                    data[i] = data[parent];
                    data[parent] = tmp;
                    i = parent;
                } else {
                    break;
                }
            }
        }

        int pop() {
            int top = data[0];
            data[0] = data[count - 1];
            count--;
            int i = 0;
            while (true) {
                int left = 2 * i + 1, right = 2 * i + 2, best = i;
                if (left < count && data[left] < data[best]) best = left;     // (*)
                if (right < count && data[right] < data[best]) best = right;  // (*)
                if (best == i) break;
                int tmp = data[i];
                data[i] = data[best];
                data[best] = tmp;
                i = best;
            }
            return top;
        }

        int peek() {
            return data[0];
        }
    }

    public static void main(String[] args) {
        int[] values = {5, 3, 8, 1, 9, 2};

        MinHeap heap = new MinHeap(values.length);
        for (int v : values) heap.push(v);

        System.out.println("peek: " + heap.peek());
        for (int k = 0; k < Math.min(2, values.length); k++) {
            System.out.println("extract: " + heap.pop());
        }
    }
}
`,
};
