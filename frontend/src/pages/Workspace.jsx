import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import CodeEditor from '../components/Editor/CodeEditor';
import VisualizationCanvas from '../components/Visualization/VisualizationCanvas';
import PlaybackBar from '../components/PlaybackBar/PlaybackBar';
import { runCode, getModules } from '../services/api';
import { saveCodeHistory, getCodeHistory, loadCodeHistory, deleteCodeHistory, renameCodeHistory } from '../services/api';
import { Modal, FormField, Input, Btn } from '../components/AdminDashboard/ui';
import { useAuth } from '../context/AuthContext';

const LANGUAGES = ['python', 'cpp', 'java', 'c', 'csharp'];
const FILE_EXT_BY_LANG = { python: 'py', cpp: 'cpp', java: 'java', c: 'c', csharp: 'cs' };
const LANG_LABELS = { python: 'Python', cpp: 'C++', java: 'Java', c: 'C', csharp: 'C#' };

/* ── Workspace chrome theme (editor/panels/toolbar) ──────────────────────
 * The visualization canvas (StackVisualizer/ArrayVisualizer/etc.) stays
 * dark regardless — it's rendered as a dedicated "screen", the same way
 * an embedded terminal or minimap stays dark in most light-themed IDEs.
 * This toggle covers the surrounding chrome: toolbar, editor, side panels. */
const THEME = {
  dark: {
    page: '#0d1117', header: '#161b22', panel: '#161b22', panelAlt: '#0d1117',
    border: 'rgba(255,255,255,.08)', borderSoft: 'rgba(255,255,255,.06)',
    text: '#e6edf3', textMuted: '#8b949e',
    selectBg: '#21262d', selectBorder: 'rgba(255,255,255,.1)',
    monaco: 'vs-dark',
  },
  light: {
    page: '#f6f8fa', header: '#ffffff', panel: '#ffffff', panelAlt: '#f6f8fa',
    border: '#d0d7de', borderSoft: '#e2e8f0',
    text: '#1e293b', textMuted: '#64748b',
    selectBg: '#ffffff', selectBorder: '#d0d7de',
    monaco: 'light',
  },
};

/* ── Starter code: STARTER[moduleSlug][language] ── */
const STARTER = {
  'array': {
    python: `# Array — visualization demo
arr = [10, 25, 3, 47, 8, 15]

max_val = arr[0]
for i in range(1, len(arr)):
    if arr[i] > max_val:
        max_val = arr[i]

print("Max:", max_val)
`,
    cpp: `#include <iostream>
using namespace std;

int main() {
    int arr[] = {10, 25, 3, 47, 8, 15};
    int n = sizeof(arr) / sizeof(arr[0]);

    int max_val = arr[0];
    for (int i = 1; i < n; i++) {
        if (arr[i] > max_val) max_val = arr[i];
    }
    cout << "Max: " << max_val << endl;
    return 0;
}
`,
    java: `public class Main {
    public static void main(String[] args) {
        int[] arr = {10, 25, 3, 47, 8, 15};

        int max = arr[0];
        for (int i = 1; i < arr.length; i++) {
            if (arr[i] > max) max = arr[i];
        }
        System.out.println("Max: " + max);
    }
}
`,
    c: `#include <stdio.h>

int main() {
    int arr[] = {10, 25, 3, 47, 8, 15};
    int n = sizeof(arr) / sizeof(arr[0]);

    int max = arr[0];
    for (int i = 1; i < n; i++) {
        if (arr[i] > max) max = arr[i];
    }
    printf("Max: %d\\n", max);
    return 0;
}
`,
    csharp: `using System;

class Main {
    static void Main(string[] args) {
        int[] arr = {10, 25, 3, 47, 8, 15};

        int max = arr[0];
        for (int i = 1; i < arr.Length; i++) {
            if (arr[i] > max) max = arr[i];
        }
        Console.WriteLine("Max: " + max);
    }
}
`,
  },

  '2d-array': {
    python: `# 2D Array (Matrix) — visualization demo
# NOTE: live cell-by-cell animation currently only runs for Java;
# Python still executes correctly, just without the grid animation yet.
rows, cols = 3, 3
grid = [[0] * cols for _ in range(rows)]

val = 1
for i in range(rows):
    for j in range(cols):
        grid[i][j] = val
        val += 1

row_sums = [sum(row) for row in grid]
print("Row sums:", row_sums)
`,
    java: `public class Main {
    public static void main(String[] args) {
        int[][] grid = new int[3][3];

        int val = 1;
        for (int i = 0; i < 3; i++) {
            for (int j = 0; j < 3; j++) {
                grid[i][j] = val++;
            }
        }

        int total = 0;
        for (int i = 0; i < grid.length; i++) {
            for (int j = 0; j < 3; j++) {
                total += grid[i][j];
            }
        }
        System.out.println("Total: " + total);
    }
}
`,
    cpp: `#include <iostream>
using namespace std;

int main() {
    int grid[3][3];
    int val = 1;
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++)
            grid[i][j] = val++;

    int total = 0;
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++)
            total += grid[i][j];

    cout << "Total: " << total << endl;
    return 0;
}
`,
    c: `#include <stdio.h>

int main() {
    int grid[3][3];
    int val = 1;
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++)
            grid[i][j] = val++;

    int total = 0;
    for (int i = 0; i < 3; i++)
        for (int j = 0; j < 3; j++)
            total += grid[i][j];

    printf("Total: %d\\n", total);
    return 0;
}
`,
    csharp: `using System;

class Main {
    static void Main(string[] args) {
        int[,] grid = new int[3, 3];
        int val = 1;
        for (int i = 0; i < 3; i++)
            for (int j = 0; j < 3; j++)
                grid[i, j] = val++;

        int total = 0;
        for (int i = 0; i < 3; i++)
            for (int j = 0; j < 3; j++)
                total += grid[i, j];

        Console.WriteLine("Total: " + total);
    }
}
`,
  },

  'linked-list': {
    python: `# Linked List — DSVP auto-detects your Node class!

class Node:
    def __init__(self, data):
        self.data = data
        self.next = None

# Build: 10 → 20 → 30 → 40 → None
head = Node(10)
head.next = Node(20)
head.next.next = Node(30)
head.next.next.next = Node(40)

# Traverse
cur = head
while cur is not None:
    print(cur.data)
    cur = cur.next
`,
    java: `public class Main {

    static class Node {
        int data;
        Node next;
        Node(int data) { this.data = data; this.next = null; }
    }

    public static void main(String[] args) {
        // Build: 10 → 20 → 30 → 40 → null
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
`,
    cpp: `#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
    Node(int d) : data(d), next(nullptr) {}
};

int main() {
    Node* head = new Node(10);
    head->next = new Node(20);
    head->next->next = new Node(30);
    head->next->next->next = new Node(40);

    Node* cur = head;
    while (cur != nullptr) {
        cout << cur->data << endl;
        cur = cur->next;
    }
    return 0;
}
`,
    c: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int data;
    struct Node* next;
} Node;

Node* newNode(int d) {
    Node* n = (Node*)malloc(sizeof(Node));
    n->data = d; n->next = NULL; return n;
}

int main() {
    Node* head = newNode(10);
    head->next = newNode(20);
    head->next->next = newNode(30);
    head->next->next->next = newNode(40);

    Node* cur = head;
    while (cur != NULL) {
        printf("%d\\n", cur->data);
        cur = cur->next;
    }
    return 0;
}
`,
    csharp: `using System;

class Main {
    class Node {
        public int data;
        public Node next;
        public Node(int d) { data = d; next = null; }
    }

    static void Main(string[] args) {
        Node head = new Node(10);
        head.next = new Node(20);
        head.next.next = new Node(30);
        head.next.next.next = new Node(40);

        Node cur = head;
        while (cur != null) {
            Console.WriteLine(cur.data);
            cur = cur.next;
        }
    }
}
`,
  },

  'bst': {
    python: `# Binary Search Tree — DSVP auto-detects your tree Node class!
# Just use plain left/right pointers — no special API needed.

class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

def insert(root, val):
    if root is None:
        return Node(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    return root

def search(root, val):
    cur = root
    while cur is not None:
        if cur.val == val:
            return True
        cur = cur.left if val < cur.val else cur.right
    return False

def inorder(root, out):
    if root is None:
        return
    inorder(root.left, out)
    out.append(root.val)
    inorder(root.right, out)

root = None
for v in [50, 30, 70, 20, 40, 60, 80]:
    root = insert(root, v)

print("Found 60:", search(root, 60))
print("Found 99:", search(root, 99))

result = []
inorder(root, result)
print("Inorder traversal:", result)
`,
    java: `public class Main {

    static class TreeNode {
        int val;
        TreeNode left;
        TreeNode right;
        TreeNode(int val) { this.val = val; }
    }

    static TreeNode insert(TreeNode root, int val) {
        if (root == null) {
            return new TreeNode(val);
        }
        if (val < root.val) {
            root.left = insert(root.left, val);
        } else {
            root.right = insert(root.right, val);
        }
        return root;
    }

    static boolean search(TreeNode root, int val) {
        TreeNode cur = root;
        while (cur != null) {
            if (cur.val == val) return true;
            cur = val < cur.val ? cur.left : cur.right;
        }
        return false;
    }

    public static void main(String[] args) {
        TreeNode root = null;
        int[] values = {50, 30, 70, 20, 40, 60, 80};
        for (int v : values) {
            root = insert(root, v);
        }

        System.out.println("Found 60: " + search(root, 60));
        System.out.println("Found 99: " + search(root, 99));
    }
}
`,
  },

  'avl-tree': {
    python: `# AVL Tree — DSVP auto-detects your tree Node class and derives
# height/balance-factor/rotations structurally from the runtime tree
# shape, so any left/right field naming and any rotation strategy works.

class Node:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None
        self.height = 1

def height(node):
    return node.height if node else 0

def balance(node):
    return height(node.left) - height(node.right) if node else 0

def rotate_right(y):
    x = y.left
    y.left = x.right
    x.right = y
    y.height = 1 + max(height(y.left), height(y.right))
    x.height = 1 + max(height(x.left), height(x.right))
    return x

def rotate_left(x):
    y = x.right
    x.right = y.left
    y.left = x
    x.height = 1 + max(height(x.left), height(x.right))
    y.height = 1 + max(height(y.left), height(y.right))
    return y

def insert(node, key):
    if node is None:
        return Node(key)
    if key < node.key:
        node.left = insert(node.left, key)
    else:
        node.right = insert(node.right, key)

    node.height = 1 + max(height(node.left), height(node.right))
    bf = balance(node)

    if bf > 1 and key < node.left.key:
        return rotate_right(node)
    if bf < -1 and key > node.right.key:
        return rotate_left(node)
    if bf > 1 and key > node.left.key:
        node.left = rotate_left(node.left)
        return rotate_right(node)
    if bf < -1 and key < node.right.key:
        node.right = rotate_right(node.right)
        return rotate_left(node)

    return node

root = None
for v in [30, 20, 10, 25, 40, 50, 5]:
    root = insert(root, v)

print("AVL tree built — height:", height(root))
`,
    java: `public class Main {

    static class Node {
        int key;
        int height;
        Node left, right;
        Node(int key) { this.key = key; this.height = 1; }
    }

    static int height(Node n) { return n == null ? 0 : n.height; }

    static int balance(Node n) { return n == null ? 0 : height(n.left) - height(n.right); }

    static Node rotateRight(Node y) {
        Node x = y.left;
        y.left = x.right;
        x.right = y;
        y.height = 1 + Math.max(height(y.left), height(y.right));
        x.height = 1 + Math.max(height(x.left), height(x.right));
        return x;
    }

    static Node rotateLeft(Node x) {
        Node y = x.right;
        x.right = y.left;
        y.left = x;
        x.height = 1 + Math.max(height(x.left), height(x.right));
        y.height = 1 + Math.max(height(y.left), height(y.right));
        return y;
    }

    static Node insert(Node node, int key) {
        if (node == null) return new Node(key);
        if (key < node.key) {
            node.left = insert(node.left, key);
        } else {
            node.right = insert(node.right, key);
        }

        node.height = 1 + Math.max(height(node.left), height(node.right));
        int bf = balance(node);

        if (bf > 1 && key < node.left.key) return rotateRight(node);
        if (bf < -1 && key > node.right.key) return rotateLeft(node);
        if (bf > 1 && key > node.left.key) {
            node.left = rotateLeft(node.left);
            return rotateRight(node);
        }
        if (bf < -1 && key < node.right.key) {
            node.right = rotateRight(node.right);
            return rotateLeft(node);
        }

        return node;
    }

    public static void main(String[] args) {
        Node root = null;
        int[] values = {30, 20, 10, 25, 40, 50, 5};
        for (int v : values) {
            root = insert(root, v);
        }
        System.out.println("AVL tree built — height: " + height(root));
    }
}
`,
  },

  'graph': {
    python: `# Graph (BFS + DFS) — DSVP auto-detects your adjacency-list graph!
# Just use a plain dict of node -> list of neighbors, a "visited" set,
# and a queue (BFS) or stack (DFS) — no special API needed.

from collections import deque

def bfs(graph, start):
    visited = set()
    queue = deque([start])
    visited.add(start)
    order = []
    while queue:
        node = queue.popleft()
        order.append(node)
        for nb in graph[node]:
            if nb not in visited:
                visited.add(nb)
                queue.append(nb)
    return order

def dfs(graph, start):
    visited = set()
    stack = [start]
    order = []
    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        order.append(node)
        for nb in graph[node]:
            if nb not in visited:
                stack.append(nb)
    return order

# Build the adjacency list one edge at a time (not as one big dict
# literal) so DSVP can animate the graph actually being CONSTRUCTED,
# edge by edge, instead of it appearing all at once. Cycle: 0-1-3-2-0.
graph = {0: [], 1: [], 2: [], 3: [], 4: []}
edges = [(0, 1), (0, 2), (1, 3), (2, 3), (3, 4)]
for u, v in edges:
    graph[u].append(v)
    graph[v].append(u)

print("BFS from 0:", bfs(graph, 0))
print("DFS from 0:", dfs(graph, 0))
`,
    java: `import java.util.*;

public class Main {

    static List<Integer> bfs(Map<Integer, List<Integer>> graph, int start) {
        Set<Integer> visited = new HashSet<>();
        Deque<Integer> queue = new ArrayDeque<>();
        queue.add(start);
        visited.add(start);
        List<Integer> order = new ArrayList<>();

        while (!queue.isEmpty()) {
            int node = queue.poll();
            order.add(node);
            for (int nb : graph.get(node)) {
                if (!visited.contains(nb)) {
                    visited.add(nb);
                    queue.add(nb);
                }
            }
        }
        return order;
    }

    static List<Integer> dfs(Map<Integer, List<Integer>> graph, int start) {
        Set<Integer> visited = new HashSet<>();
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(start);
        List<Integer> order = new ArrayList<>();

        while (!stack.isEmpty()) {
            int node = stack.pop();
            if (visited.contains(node)) continue;
            visited.add(node);
            order.add(node);
            for (int nb : graph.get(node)) {
                if (!visited.contains(nb)) {
                    stack.push(nb);
                }
            }
        }
        return order;
    }

    public static void main(String[] args) {
        Map<Integer, List<Integer>> graph = new HashMap<>();
        graph.put(0, Arrays.asList(1, 2));
        graph.put(1, Arrays.asList(0, 3));
        graph.put(2, Arrays.asList(0, 3));
        graph.put(3, Arrays.asList(1, 2, 4));
        graph.put(4, Arrays.asList(3));

        System.out.println("BFS from 0: " + bfs(graph, 0));
        System.out.println("DFS from 0: " + dfs(graph, 0));
    }
}
`,
  },

  'circular-linked-list': {
    python: `# Circular Linked List — DSVP auto-detects your Node class!
# The last node's "next" wraps back to head, forming a ring.

class Node:
    def __init__(self, data):
        self.data = data
        self.next = None

class CircularLinkedList:
    def __init__(self):
        self.head = None

    def insert(self, data):
        new_node = Node(data)
        if not self.head:
            self.head = new_node
            new_node.next = self.head   # points to itself
            return
        temp = self.head
        while temp.next != self.head:
            temp = temp.next
        temp.next = new_node
        new_node.next = self.head

    def display(self):
        if not self.head:
            return
        temp = self.head
        while True:
            print(temp.data, end=" -> ")
            temp = temp.next
            if temp == self.head:
                break
        print("(back to head)")

cll = CircularLinkedList()
cll.insert(10)
cll.insert(20)
cll.insert(30)
cll.display()
`,
    java: `public class Main {

    static class Node {
        int data;
        Node next;
        Node(int data) { this.data = data; this.next = null; }
    }

    static Node head = null;

    static void insert(int data) {
        Node newNode = new Node(data);
        if (head == null) {
            head = newNode;
            newNode.next = head;   // points to itself
            return;
        }
        Node temp = head;
        while (temp.next != head) {
            temp = temp.next;
        }
        temp.next = newNode;
        newNode.next = head;
    }

    static void display() {
        if (head == null) return;
        Node temp = head;
        while (true) {
            System.out.print(temp.data + " -> ");
            temp = temp.next;
            if (temp == head) break;
        }
        System.out.println("(back to head)");
    }

    public static void main(String[] args) {
        insert(10);
        insert(20);
        insert(30);
        display();
    }
}
`,
    cpp: `#include <iostream>
using namespace std;

struct Node {
    int data;
    Node* next;
    Node(int d) : data(d), next(nullptr) {}
};

Node* head = nullptr;

void insert(int data) {
    Node* newNode = new Node(data);
    if (!head) {
        head = newNode;
        newNode->next = head;
        return;
    }
    Node* temp = head;
    while (temp->next != head) temp = temp->next;
    temp->next = newNode;
    newNode->next = head;
}

void display() {
    if (!head) return;
    Node* temp = head;
    do {
        cout << temp->data << " -> ";
        temp = temp->next;
    } while (temp != head);
    cout << "(back to head)" << endl;
}

int main() {
    insert(10);
    insert(20);
    insert(30);
    display();
    return 0;
}
`,
    c: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int data;
    struct Node* next;
} Node;

Node* head = NULL;

void insert(int data) {
    Node* newNode = (Node*)malloc(sizeof(Node));
    newNode->data = data;
    if (!head) {
        head = newNode;
        newNode->next = head;
        return;
    }
    Node* temp = head;
    while (temp->next != head) temp = temp->next;
    temp->next = newNode;
    newNode->next = head;
}

void display() {
    if (!head) return;
    Node* temp = head;
    do {
        printf("%d -> ", temp->data);
        temp = temp->next;
    } while (temp != head);
    printf("(back to head)\\n");
}

int main() {
    insert(10);
    insert(20);
    insert(30);
    display();
    return 0;
}
`,
    csharp: `using System;

class Main {
    class Node {
        public int data;
        public Node next;
        public Node(int d) { data = d; next = null; }
    }

    static Node head = null;

    static void Insert(int data) {
        Node newNode = new Node(data);
        if (head == null) {
            head = newNode;
            newNode.next = head;
            return;
        }
        Node temp = head;
        while (temp.next != head) temp = temp.next;
        temp.next = newNode;
        newNode.next = head;
    }

    static void Display() {
        if (head == null) return;
        Node temp = head;
        do {
            Console.Write(temp.data + " -> ");
            temp = temp.next;
        } while (temp != head);
        Console.WriteLine("(back to head)");
    }

    static void Main(string[] args) {
        Insert(10);
        Insert(20);
        Insert(30);
        Display();
    }
}
`,
  },

  'stack': {
    python: `# Stack — LIFO visualization
# Use a plain list — DSVP traces every push and peek automatically

stack = []

# Push elements
stack.append(10)
stack.append(25)
stack.append(42)
stack.append(99)

# Peek top element
top_val = stack[len(stack) - 1]
print("Top:", top_val)

# Pop — read top, then shrink
popped = stack[len(stack) - 1]
stack = stack[:len(stack) - 1]
print("Popped:", popped)
print("Remaining size:", len(stack))
`,
    java: `import java.util.Stack;

public class Main {
    public static void main(String[] args) {
        Stack<Integer> stack = new Stack<>();

        // Push elements
        stack.push(10);
        stack.push(25);
        stack.push(42);
        stack.push(99);

        // Peek top element
        int top = stack.peek();
        System.out.println("Top element: " + top);

        // Pop element
        int popped = stack.pop();
        System.out.println("Popped element: " + popped);

        System.out.println("Remaining size: " + stack.size());
    }
}
`,
    cpp: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> stack;

    // Push elements (LIFO)
    stack.push_back(10);
    stack.push_back(25);
    stack.push_back(42);
    stack.push_back(99);

    // Peek top element
    int top = stack.back();
    cout << "Top element: " << top << endl;

    // Pop element
    stack.pop_back();
    cout << "Remaining size: " << stack.size() << endl;

    return 0;
}
`,
    c: `#include <stdio.h>

#define MAX 10
int stack[MAX];
int top = -1;

void push(int val) {
    if (top < MAX - 1) {
        stack[++top] = val;
        printf("Pushed: %d\\n", val);
    }
}

int pop() {
    if (top >= 0) {
        return stack[top--];
    }
    return -1;
}

int peek() {
    if (top >= 0) return stack[top];
    return -1;
}

int main() {
    push(10);
    push(25);
    push(42);
    push(99);

    printf("Top element: %d\\n", peek());
    printf("Popped: %d\\n", pop());
    return 0;
}
`,
    csharp: `using System;
using System.Collections.Generic;

class Main {
    static void Main(string[] args) {
        Stack<int> stack = new Stack<int>();

        // Push elements
        stack.Push(10);
        stack.Push(25);
        stack.Push(42);
        stack.Push(99);

        // Peek top element
        int top = stack.Peek();
        Console.WriteLine("Top element: " + top);

        // Pop element
        int popped = stack.Pop();
        Console.WriteLine("Popped element: " + popped);

        Console.WriteLine("Remaining count: " + stack.Count);
    }
}
`,
  },

  'queue': {
    python: `# Queue — FIFO visualization
# Use a plain list — DSVP traces every enqueue and dequeue automatically

queue = []

# Enqueue elements (added at the rear)
queue.append(10)
queue.append(25)
queue.append(42)
queue.append(99)

# Peek front element
front_val = queue[0]
print("Front:", front_val)

# Dequeue — removes and returns the front element
dequeued = queue.pop(0)
print("Dequeued:", dequeued)
print("Remaining size:", len(queue))
`,
    java: `import java.util.Queue;
import java.util.LinkedList;

public class Main {
    public static void main(String[] args) {
        Queue<Integer> queue = new LinkedList<>();

        // Enqueue elements (added at the rear)
        queue.offer(10);
        queue.offer(25);
        queue.offer(42);
        queue.offer(99);

        // Peek front element
        int front = queue.peek();
        System.out.println("Front element: " + front);

        // Dequeue element
        int dequeued = queue.poll();
        System.out.println("Dequeued element: " + dequeued);

        System.out.println("Remaining size: " + queue.size());
    }
}
`,
    cpp: `#include <iostream>
#include <queue>
using namespace std;

int main() {
    queue<int> q;

    // Enqueue elements (added at the rear)
    q.push(10);
    q.push(25);
    q.push(42);
    q.push(99);

    // Peek front element
    int front = q.front();
    cout << "Front element: " << front << endl;

    // Dequeue element
    q.pop();
    cout << "Remaining size: " << q.size() << endl;

    return 0;
}
`,
    c: `#include <stdio.h>

#define MAX 10
int queue[MAX];
int frontIdx = 0;
int rearIdx = -1;
int count = 0;

void enqueue(int val) {
    if (count < MAX) {
        queue[++rearIdx] = val;
        count++;
        printf("Enqueued: %d\\n", val);
    }
}

int dequeue() {
    if (count > 0) {
        int val = queue[frontIdx++];
        count--;
        return val;
    }
    return -1;
}

int peekFront() {
    if (count > 0) return queue[frontIdx];
    return -1;
}

int main() {
    enqueue(10);
    enqueue(25);
    enqueue(42);
    enqueue(99);

    printf("Front element: %d\\n", peekFront());
    printf("Dequeued: %d\\n", dequeue());
    return 0;
}
`,
    csharp: `using System;
using System.Collections.Generic;

class Main {
    static void Main(string[] args) {
        Queue<int> queue = new Queue<int>();

        // Enqueue elements (added at the rear)
        queue.Enqueue(10);
        queue.Enqueue(25);
        queue.Enqueue(42);
        queue.Enqueue(99);

        // Peek front element
        int front = queue.Peek();
        Console.WriteLine("Front element: " + front);

        // Dequeue element
        int dequeued = queue.Dequeue();
        Console.WriteLine("Dequeued element: " + dequeued);

        Console.WriteLine("Remaining count: " + queue.Count);
    }
}
`,
  },

  'hashing': {
    python: `# Hash Table — separate chaining, DSVP auto-visualizes every put/get/remove
# HashTable() gives you a traced container to store into — the hash
# function (default: Python's hash() % size) and any collision handling
# on top is entirely up to you.

table = HashTable(7)

table.put("apple", 10)
table.put("banana", 20)
table.put("grape", 30)   # may land in the same bucket as an earlier key —
                          # DSVP shows it chained automatically

print("apple ->", table.get("apple"))
print("banana ->", table.get("banana"))

table.remove("banana")
print("banana ->", table.get("banana"))
`,
    java: `// Hash Table — DSVP auto-detects java.util.HashMap and visualizes every
// put/get/remove as a separate-chaining table. Use it exactly like a
// normal HashMap — no special API needed.
import java.util.HashMap;

public class Main {
    public static void main(String[] args) {
        HashMap<String, Integer> table = new HashMap<>();

        table.put("apple", 10);
        table.put("banana", 20);
        table.put("grape", 30);

        System.out.println("apple -> " + table.get("apple"));
        System.out.println("banana -> " + table.get("banana"));

        table.remove("banana");
        System.out.println("banana -> " + table.get("banana"));
    }
}
`,
  },
};

// ── Module icons for dropdown ──
const MODULE_ICONS = {
  'array':               '▦',
  '2d-array':            '▩',
  'linked-list':         '⛓',
  'doubly-linked-list':  '⇌',
  'circular-linked-list': '➰',
  'stack':               '📚',
  'queue':               '🚦',
  'sorting':             '↕',
  'binary-tree':         '🌳',
  'bst':                 '🌲',
  'avl-tree':            '⚖',
  'heap':                '⛰',
  'graph':               '🕸',
  'trie':                '🔤',
  'hashing':             '#',
  'dynamic-programming': '🧮',
  'segment-tree':        '📊',
  'red-black-tree':      '🔴',
};

export default function Workspace() {
  const { user }                        = useAuth();
  const canExportTraces                 = user?.SubscriptionPlan === 'premium' || user?.Role === 'admin';
  const [searchParams]                  = useSearchParams();
  const navigate                        = useNavigate();
  const location                        = useLocation();
  // Opened from Saved Snippets ("Open" button) — carries the actual saved
  // code/language/module, taking priority over the ?module= starter template.
  const loadedSnippet                   = location.state?.loadedSnippet;
  const initialSlug                     = loadedSnippet?.ModuleSlug || searchParams.get('module') || 'array';
  // Modules loaded from API
  const [allModules, setAllModules]     = useState([]);

  // Load all modules on mount
  useEffect(() => {
    getModules('all').then(res => setAllModules(res.data.modules || [])).catch(() => {});
  }, []);

  const [language, setLanguage]         = useState(() => loadedSnippet?.Language || 'python');
  const [moduleSlug, setModuleSlug]     = useState(initialSlug);
  const [code, setCode] = useState(() =>
    loadedSnippet?.Code ?? (STARTER[initialSlug]?.[loadedSnippet?.Language || 'python'] || STARTER['array']['python'])
  );

  // Clear the router state once consumed so navigating back/forward or
  // refreshing doesn't keep re-applying the same snippet over local edits.
  useEffect(() => {
    if (loadedSnippet) {
      navigate(location.pathname + location.search, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [events, setEvents]             = useState([]);
  const [stepIndex, setStepIndex]       = useState(0);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [speed, setSpeed]               = useState(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorLine, setErrorLine]       = useState(null);
  const [running, setRunning]           = useState(false);
  const abortControllerRef              = useRef(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('dsvp_workspace_theme') || 'dark');
  useEffect(() => { localStorage.setItem('dsvp_workspace_theme', theme); }, [theme]);
  const T = THEME[theme];
  const [userOutput, setUserOutput]     = useState('');
  const intervalRef                     = useRef(null);
  // Bumped on every reset/run so VisualizationCanvas remounts fresh —
  // it keeps sticky "last known state" refs internally that otherwise
  // survive a Run click and leave the previous run's frame on screen.
  const [runResetKey, setRunResetKey]   = useState(0);

  // Code history state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen]     = useState(false);
  const [history, setHistory]             = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await getCodeHistory({ moduleSlug, page: 1, pageSize: 50 });
      setHistory(res.data.data || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [moduleSlug]);

  /* Load code history on mount and when module changes */
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /* Update starter code when language changes */
  function handleLanguageChange(lang) {
    setLanguage(lang);
    setCode((STARTER[moduleSlug]?.[lang]) || STARTER['array'][lang] || '');
    clearRun();
  }

  /* Reset run state */
  function clearRun() {
    setEvents([]);
    setStepIndex(0);
    setIsPlaying(false);
    setErrorMessage('');
    setErrorLine(null);
    setUserOutput('');
    setRunResetKey(k => k + 1);
  }

  /* Auto-advance playback */
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (isPlaying && events.length > 0) {
      intervalRef.current = setInterval(() => {
        setStepIndex(i => {
          if (i >= events.length - 1) { setIsPlaying(false); return i; }
          return i + 1;
        });
      }, Math.round(400 / speed));
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, events]);

  /* Keyboard controls */
  useEffect(() => {
    function onKey(e) {
      // Don't hijack keys when focus is inside the Monaco editor, a text
      // input (e.g. the Save Code title field), or any editable element —
      // otherwise Space/ArrowLeft/ArrowRight get swallowed by playback
      // controls instead of reaching the field the user is typing into.
      const tag = e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || e.target.isContentEditable) return;
      if (e.code === 'Space' && events.length > 0) {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
      if (e.code === 'ArrowRight') setStepIndex(i => Math.min(i + 1, events.length - 1));
      if (e.code === 'ArrowLeft')  setStepIndex(i => Math.max(i - 1, 0));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [events]);

  async function handleRun() {
    clearRun();
    setRunning(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const res = await runCode({ language, code, moduleSlug }, { signal: controller.signal });
      const data = res.data;

      if (data.status !== 'success') {
        setErrorMessage(data.errorMessage || 'Execution failed.');
        setErrorLine(data.errorLine || null);
        /* Show partial events even on runtime error */
        if (data.events?.length) {
          setEvents(data.events);
          setStepIndex(0);
        }
        return;
      }

      setEvents(data.events || []);
      setUserOutput(data.userOutput || '');
      setStepIndex(0);
      /* Auto-play after a short delay so UI settles */
      setTimeout(() => setIsPlaying(true), 300);
    } catch (err) {
      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') {
        // User hit Stop — not an error, nothing to show.
      } else if (err.response?.status === 429) {
        const d = err.response.data || {};
        const mins = d.retryAfterSeconds ? Math.ceil(d.retryAfterSeconds / 60) : null;
        setErrorMessage(
          d.message ||
          `Hourly execution limit reached${mins ? ` — try again in ${mins} min` : ''}.`
        );
      } else {
        setErrorMessage(err.response?.data?.message || 'Could not reach execution service.');
      }
    } finally {
      setRunning(false);
      abortControllerRef.current = null;
    }
  }

  /**
   * Stop button — covers both states a "run" can be interrupted in:
   *  - still waiting on the backend (running=true): abort the in-flight
   *    HTTP request so the UI stops waiting immediately (the backend's own
   *    child process still runs to its own timeout server-side, but the
   *    user isn't stuck staring at a spinner for it).
   *  - already got results and is auto-stepping through them
   *    (isPlaying=true): just stop the local playback timer.
   */
  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setRunning(false);
    setIsPlaying(false);
  }

  const currentEvent = events[stepIndex] ?? null;

  // Editor highlight: every event (array or execution) now carries
  // `currentLine` from traceGenerator.js — no more guessing via `.line`.
  const editorCurrentLine = currentEvent?.currentLine ?? null;

  // For the playback bar, count only "meaningful" events (skip bare
  // line-trace events, which exist purely to drive the editor highlight
  // and the variables panel — they'd make the step counter too noisy).
  // Precompute original-index -> meaningful-rank once per events change,
  // O(n) instead of the previous O(n^2) indexOf-in-a-loop approach.
  const meaningfulOriginalIndices = events.reduce((acc, e, idx) => {
    if (e.type !== 'line') acc.push(idx);
    return acc;
  }, []);
  const meaningfulRank = meaningfulOriginalIndices.findIndex(idx => idx >= stepIndex);
  const displayStep  = meaningfulRank >= 0 ? meaningfulRank + 1 : (meaningfulOriginalIndices.length || stepIndex + 1);
  const displayTotal = meaningfulOriginalIndices.length || events.length;

  /* Export code & trace — Premium plan perk (Pricing.jsx). Downloads the
     current source file plus a JSON dump of the last run's visualization
     events/output, so a learner can keep an offline record of what they
     wrote and how it executed. */
  function handleExportTraces() {
    if (!canExportTraces) {
      navigate('/pricing');
      return;
    }
    const ext = FILE_EXT_BY_LANG[language] || 'txt';
    downloadTextFile(`dsvp-${moduleSlug}.${ext}`, code, 'text/plain');

    if (events.length > 0) {
      const traceDump = {
        moduleSlug, language, exportedAt: new Date().toISOString(),
        userOutput, events,
      };
      downloadTextFile(`dsvp-${moduleSlug}-trace.json`, JSON.stringify(traceDump, null, 2), 'application/json');
    }
  }

  /* Save code handler */
  async function handleSaveCode(title) {
    try {
      await saveCodeHistory({
        title,
        language,
        code,
        moduleSlug,
      });
      setSaveModalOpen(false);
      await loadHistory();
      return true;
    } catch (err) {
      console.error('Failed to save code:', err);
      return false;
    }
  }

  /* Load code from history */
  async function handleLoadCode(snippetId) {
    try {
      const res = await loadCodeHistory(snippetId);
      const snippet = res.data.snippet;
      setCode(snippet.Code);
      setLanguage(snippet.Language);
      if (snippet.ModuleSlug && snippet.ModuleSlug !== moduleSlug) {
        setModuleSlug(snippet.ModuleSlug);
      }
      clearRun();
      setHistoryOpen(false); // Close history sidebar after loading
    } catch (err) {
      console.error('Failed to load code:', err);
      alert('Failed to load code. Please try again.');
    }
  }

  /* Delete code from history */
  async function handleDeleteCode(snippetId) {
    if (!confirm('Are you sure you want to delete this saved code?')) return;
    try {
      await deleteCodeHistory(snippetId);
      await loadHistory();
    } catch (err) {
      console.error('Failed to delete code:', err);
    }
  }

  /* Rename code in history */
  async function handleRenameCode(snippetId, newTitle) {
    try {
      await renameCodeHistory(snippetId, newTitle);
      await loadHistory();
    } catch (err) {
      console.error('Failed to rename code:', err);
      alert('Failed to rename. Please try again.');
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      fontFamily: "'Inter', system-ui, sans-serif", background: T.page,
      transition: 'background 150ms',
    }}>

      {/* ── TOP BAR ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', height: 52, flexShrink: 0,
        background: T.header,
        borderBottom: `1px solid ${T.border}`,
        transition: 'background 150ms, border-color 150ms',
      }}>
        <button onClick={() => navigate('/dashboard')} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.textMuted, fontSize: 13, padding: '4px 8px',
          borderRadius: 6, transition: 'color 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = T.text; }}
          onMouseLeave={e => { e.currentTarget.style.color = T.textMuted; }}
        >← Dashboard</button>

        <div style={{ width: 1, height: 20, background: T.border }} />

        {/* Language selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={labelStyleFn(T)}>Lang</span>
          <select
            value={language}
            onChange={e => handleLanguageChange(e.target.value)}
            disabled={isPlaying}
            style={selectStyleFn(T)}
          >
            {LANGUAGES.map(l => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
          </select>
        </div>

        {/* Module selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={labelStyleFn(T)}>Module</span>
          <select
            value={moduleSlug}
            onChange={e => {
                const slug = e.target.value;
                // Block if the server says this plan can't access it — driven
                // purely by HasAccess (RequiredPlan vs. the user's plan), not
                // a separate IsPremium flag which can drift out of sync.
                const mod = allModules.find(m => m.Slug === slug);
                if (mod && !mod.HasAccess) {
                  navigate('/pricing');
                  return;
                }
                setModuleSlug(slug);
                setCode((STARTER[slug]?.[language]) || STARTER['array'][language] || '');
                clearRun();
              }}
            style={selectStyleFn(T)}
          >
            {allModules.length === 0 ? (
              // Fallback while loading
              ['array','linked-list','doubly-linked-list','stack','queue'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))
            ) : (
              allModules.map(m => {
                const locked = !m.HasAccess;
                const icon   = MODULE_ICONS[m.Slug] || '◈';
                const tierLabel = m.RequiredPlan ? m.RequiredPlan[0].toUpperCase() + m.RequiredPlan.slice(1) : 'Premium';
                return (
                  <option key={m.Slug} value={m.Slug}>
                    {locked ? '🔒 ' : icon + ' '}{m.Name}{locked ? ` (${tierLabel})` : ''}
                  </option>
                );
              })
            )}
          </select>
        </div>

        <div style={{ flex: 1 }} />

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            color: T.textMuted, border: `1px solid ${T.border}`,
            background: 'transparent', cursor: 'pointer', transition: 'all 150ms',
          }}
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>

        {/* History toggle button */}
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          title="Code History"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            color: historyOpen ? '#2E74B5' : '#8b949e',
            border: historyOpen ? '1px solid #2E74B5' : '1px solid rgba(255,255,255,.1)',
            background: historyOpen ? 'rgba(46,116,181,.1)' : 'transparent',
            cursor: 'pointer', transition: 'all 150ms',
          }}
        >
          📜 History
        </button>

        {/* Save button */}
        <button
          onClick={() => setSaveModalOpen(true)}
          disabled={!code.trim()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            color: '#fff', border: 'none',
            cursor: !code.trim() ? 'not-allowed' : 'pointer',
            background: !code.trim()
              ? 'rgba(139,148,158,.35)'
              : 'linear-gradient(135deg,#F2A93B,#E15759)',
            opacity: !code.trim() ? 0.5 : 1,
            transition: 'all 150ms',
          }}
        >
          💾 Save
        </button>

        {/* Export code & traces — Premium plan perk; non-premium users get
            routed to /pricing instead of a disabled/hidden button, matching
            how locked modules behave in ModuleCatalog. */}
        <button
          onClick={handleExportTraces}
          disabled={!code.trim()}
          title={canExportTraces ? 'Download source code + trace JSON' : 'Premium feature — upgrade to export code & traces'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            color: canExportTraces ? '#7c3aed' : '#8b949e',
            border: canExportTraces ? '1px solid rgba(124,58,237,.4)' : '1px solid rgba(255,255,255,.1)',
            background: canExportTraces ? 'rgba(124,58,237,.1)' : 'transparent',
            cursor: !code.trim() ? 'not-allowed' : 'pointer',
            opacity: !code.trim() ? 0.5 : 1,
            transition: 'all 150ms',
          }}
        >
          {canExportTraces ? '📤 Export' : '🔒 Export'}
        </button>

        {/* Step counter */}
        {events.length > 0 && (
          <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 500 }}>
            Step {displayStep} / {displayTotal}
          </span>
        )}

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            color: '#fff', border: 'none',
            cursor: running ? 'not-allowed' : 'pointer',
            background: running
              ? 'rgba(76,175,80,.35)'
              : 'linear-gradient(135deg,#4CAF50,#2E74B5)',
            boxShadow: running ? 'none' : '0 2px 10px rgba(76,175,80,.35)',
            transition: 'all 150ms',
          }}
        >
          {running ? <><SpinnerIcon /> Running…</> : <>▶ Run</>}
        </button>

        {/* Stop button — cancels an in-flight execution request or halts
            auto-playback immediately, whichever is active */}
        {(running || isPlaying) && (
          <button
            onClick={handleStop}
            title="Stop execution / playback immediately"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              color: '#fff', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#ef4444,#b91c1c)',
              boxShadow: '0 2px 10px rgba(239,68,68,.35)',
              transition: 'all 150ms',
            }}
          >
            ⏹ Stop
          </button>
        )}

        {/* Reset button — clears the visualization panel for this module
            without re-running the code */}
        {(events.length > 0 || errorMessage) && !running && (
          <button
            onClick={clearRun}
            title="Reset the visualization panel"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              color: '#8b949e', border: '1px solid rgba(139,148,158,.35)', cursor: 'pointer',
              background: 'transparent',
              transition: 'all 150ms',
            }}
          >
            ↺ Reset
          </button>
        )}
      </header>

      {/* ── SPLIT SCREEN ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>

        {/* Editor panel */}
        <EditorPanel
          language={language}
          code={code}
          setCode={setCode}
          editorCurrentLine={editorCurrentLine}
          errorLine={errorLine}
          errorMessage={errorMessage}
          onDismissError={() => setErrorMessage('')}
          isPlaying={isPlaying}
          theme={theme}
        />

        {/* Visualization panel */}
        <VisualizationPanel
          moduleSlug={moduleSlug}
          currentEvent={currentEvent}
          totalSteps={events.length}
          allEvents={events}
          currentStep={stepIndex}
          resetKey={runResetKey}
          runError={errorMessage}
          theme={theme}
        />

        {/* History sidebar */}
        {historyOpen && (
          <HistorySidebar
            history={history}
            loading={loadingHistory}
            onLoad={handleLoadCode}
            onDelete={handleDeleteCode}
            onRename={handleRenameCode}
            onClose={() => setHistoryOpen(false)}
            theme={theme}
          />
        )}
      </div>

      {/* ── PLAYBACK BAR ── */}
      <PlaybackBar
        currentStep={stepIndex + 1}
        totalSteps={events.length}
        isPlaying={isPlaying}
        speed={speed}
        onPlayPause={() => setIsPlaying(p => !p)}
        onStep={delta => setStepIndex(i => Math.min(Math.max(i + delta, 0), events.length - 1))}
        onScrub={step  => setStepIndex(step - 1)}
        onReset={() => { setIsPlaying(false); setStepIndex(0); }}
        onSpeedChange={setSpeed}
        displayStep={displayStep}
        displayTotal={displayTotal}
      />

      {/* Save code modal */}
      <SaveCodeModal
        open={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onSave={handleSaveCode}
      />
    </div>
  );
}

/* ── tiny shared style pieces ── */
const labelStyleFn = (T) => ({
  fontSize: 10, fontWeight: 700, color: T.textMuted,
  textTransform: 'uppercase', letterSpacing: '.06em',
});
const selectStyleFn = (T) => ({
  background: T.selectBg, border: `1px solid ${T.selectBorder}`,
  color: T.text, borderRadius: 6, padding: '5px 10px',
  fontSize: 13, cursor: 'pointer', outline: 'none',
});

function PanelLabel({ children, theme = 'dark' }) {
  const T = THEME[theme];
  return (
    <div style={{
      padding: '5px 16px', background: T.panel,
      borderBottom: `1px solid ${T.borderSoft}`,
      fontSize: 10, fontWeight: 700, color: T.textMuted,
      textTransform: 'uppercase', letterSpacing: '.06em',
      flexShrink: 0,
    }}>{children}</div>
  );
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function SpinnerIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5"
      style={{ animation: 'spin 0.7s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

/* ── Resizable Panels ── */
function EditorPanel({ language, code, setCode, editorCurrentLine, errorLine, errorMessage, onDismissError, isPlaying, theme = 'dark' }) {
  const [editorWidth, setEditorWidth] = useState(50); // Percentage
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const parentRect = containerRef.current.parentElement.getBoundingClientRect();
      const newWidth = ((e.clientX - parentRect.left) / parentRect.width) * 100;
      setEditorWidth(Math.max(20, Math.min(80, newWidth)));
    };

    const handleMouseUp = () => setIsResizing(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: `${editorWidth}%`,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          userSelect: isResizing ? 'none' : 'auto',
        }}
      >
        <PanelLabel theme={theme}>Editor</PanelLabel>
        <CodeEditor
          language={language}
          value={code}
          onChange={v => { setCode(v ?? ''); }}
          currentLine={editorCurrentLine}
          errorLine={errorLine}
          errorMessage={errorMessage}
          onDismissError={onDismissError}
          disabled={isPlaying}
          theme={theme}
        />
      </div>

      {/* Vertical Resize Handle */}
      <div
        onMouseDown={() => setIsResizing(true)}
        style={{
          width: 4,
          cursor: 'col-resize',
          background: isResizing ? 'rgba(76,175,80,.5)' : 'rgba(255,255,255,.07)',
          transition: isResizing ? 'none' : 'background 150ms ease',
          position: 'relative',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 20,
            height: 40,
            background: isResizing ? 'rgba(76,175,80,.3)' : 'transparent',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#8b949e',
          }}
        >
          ⋮
        </div>
      </div>
    </>
  );
}

function VisualizationPanel({ moduleSlug, currentEvent, totalSteps, allEvents, currentStep, resetKey, runError = '', theme = 'dark' }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <PanelLabel theme={theme}>Visualization</PanelLabel>
      <div style={{ flex: 1, minHeight: 0 }}>
        <VisualizationCanvas
          key={`${moduleSlug}-${resetKey}`}
          moduleSlug={moduleSlug}
          event={currentEvent}
          totalSteps={totalSteps}
          allEvents={allEvents}
          currentStep={currentStep + 1}
          runError={runError}
          theme={theme}
        />
      </div>
    </div>
  );
}

/* ── Save Code Modal ── */
function SaveCodeModal({ open, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setTitle('');
      setError('');
    }
  }, [open]);

  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (title.length > 200) {
      setError('Title must be 200 characters or less');
      return;
    }
    setSaving(true);
    const success = await onSave(title.trim());
    setSaving(false);
    if (success) {
      setTitle('');
      setError('');
    } else {
      setError('Failed to save code');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Save Code" width={480}>
      <FormField label={`Title (${title.length}/200)`} error={error}>
        <Input
          value={title}
          onChange={setTitle}
          placeholder="Give your code a descriptive title"
          maxLength={200}
          disabled={saving}
          onKeyPress={e => { if (e.key === 'Enter') handleSave(); }}
        />
      </FormField>
      <div style={{
        display: 'flex', gap: 10, justifyContent: 'flex-end',
        paddingTop: 16, borderTop: '1px solid #e2e8f0', marginTop: 8,
      }}>
        <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Code'}
        </Btn>
      </div>
    </Modal>
  );
}

/* ── History Sidebar ── */
function HistorySidebar({ history, loading, onLoad, onDelete, onRename, onClose, theme = 'dark' }) {
  const T = THEME[theme];
  const [copiedId, setCopiedId] = useState(null);
  const [loadingCopy, setLoadingCopy] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  function startEdit(item) {
    setEditingId(item.SnippetId);
    setEditTitle(item.Title);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle('');
  }

  async function commitEdit(snippetId) {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    try {
      setSavingRename(true);
      await onRename(snippetId, trimmed);
      setEditingId(null);
      setEditTitle('');
    } finally {
      setSavingRename(false);
    }
  }

  async function handleCopy(snippet) {
    try {
      setLoadingCopy(snippet.SnippetId);
      // Fetch full code if not available
      let codeText = snippet.Code;
      if (!codeText) {
        const res = await loadCodeHistory(snippet.SnippetId);
        codeText = res.data.snippet.Code;
      }
      await navigator.clipboard.writeText(codeText || '');
      setCopiedId(snippet.SnippetId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy code');
    } finally {
      setLoadingCopy(null);
    }
  }

  return (
    <aside style={{
      width: 320, flexShrink: 0, background: T.panel,
      borderLeft: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column',
      position: 'absolute', right: 0, top: 0, bottom: 0,
      zIndex: 100, boxShadow: '-4px 0 12px rgba(0,0,0,.3)',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${T.borderSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: T.panelAlt,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📜</span>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0 }}>
            Code History
          </h3>
        </div>
        <button onClick={onClose} style={{
          width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,.1)',
          background: 'rgba(255,255,255,.05)', cursor: 'pointer',
          color: '#8b949e', fontSize: 14, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>✕</button>
      </div>

      {/* History list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8b949e' }}>
            Loading...
          </div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
            <p style={{ fontSize: 13, color: '#8b949e', margin: 0 }}>
              No saved code yet
            </p>
          </div>
        ) : (
          history.map(item => (
            <div key={item.SnippetId} style={{
              background: '#21262d', border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 10, padding: '12px', marginBottom: 10,
              transition: 'all 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(46,116,181,.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,.08)'; }}
            >
              <div style={{ marginBottom: 8 }}>
                {editingId === item.SnippetId ? (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit(item.SnippetId);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      maxLength={200}
                      style={{
                        flex: 1, fontSize: 13, fontWeight: 600, color: '#e6edf3',
                        background: '#0d1117', border: '1px solid rgba(46,116,181,.5)',
                        borderRadius: 6, padding: '4px 8px', outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => commitEdit(item.SnippetId)}
                      disabled={savingRename || !editTitle.trim()}
                      title="Save name"
                      style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        background: 'rgba(76,175,80,.15)', border: '1px solid rgba(76,175,80,.35)',
                        color: '#7ee787', cursor: savingRename ? 'wait' : 'pointer', fontSize: 12,
                      }}
                    >✓</button>
                    <button
                      onClick={cancelEdit}
                      title="Cancel"
                      style={{
                        width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                        background: 'rgba(225,87,89,.15)', border: '1px solid rgba(225,87,89,.3)',
                        color: '#f85149', cursor: 'pointer', fontSize: 12,
                      }}
                    >✕</button>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                  }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: '#e6edf3',
                      lineHeight: 1.4, flex: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{item.Title}</div>
                    <button
                      onClick={() => startEdit(item)}
                      title="Rename"
                      style={{
                        width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                        background: 'transparent', border: '1px solid rgba(255,255,255,.1)',
                        color: '#8b949e', cursor: 'pointer', fontSize: 11,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#58a6ff'; e.currentTarget.style.borderColor = 'rgba(46,116,181,.5)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)'; }}
                    >✎</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: 'rgba(46,116,181,.2)', color: '#58a6ff',
                    fontWeight: 600,
                  }}>{LANG_LABELS[item.Language] || item.Language}</span>
                  {item.ModuleSlug && (
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(76,175,80,.2)', color: '#7ee787',
                      fontWeight: 600,
                    }}>{item.ModuleSlug}</span>
                  )}
                </div>
              </div>
              <div style={{
                fontSize: 10, color: '#8b949e', marginBottom: 10,
              }}>
                {new Date(item.CreatedAt).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => onLoad(item.SnippetId)}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 6,
                    background: 'rgba(46,116,181,.15)', border: '1px solid rgba(46,116,181,.3)',
                    color: '#58a6ff', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(46,116,181,.25)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(46,116,181,.15)'; }}
                >
                  Load
                </button>
                <button
                  onClick={() => handleCopy(item)}
                  disabled={loadingCopy === item.SnippetId}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 6,
                    background: copiedId === item.SnippetId ? 'rgba(76,175,80,.15)' : 'rgba(242,169,59,.15)',
                    border: copiedId === item.SnippetId ? '1px solid rgba(76,175,80,.3)' : '1px solid rgba(242,169,59,.3)',
                    color: copiedId === item.SnippetId ? '#7ee787' : '#d29922',
                    fontSize: 11, fontWeight: 600,
                    cursor: loadingCopy === item.SnippetId ? 'wait' : 'pointer',
                    transition: 'all 150ms',
                    opacity: loadingCopy === item.SnippetId ? 0.6 : 1,
                  }}
                  onMouseEnter={e => {
                    if (copiedId !== item.SnippetId && loadingCopy !== item.SnippetId) {
                      e.currentTarget.style.background = 'rgba(242,169,59,.25)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (copiedId !== item.SnippetId && loadingCopy !== item.SnippetId) {
                      e.currentTarget.style.background = 'rgba(242,169,59,.15)';
                    }
                  }}
                >
                  {loadingCopy === item.SnippetId ? '...' : copiedId === item.SnippetId ? '✓ Copied' : '📋 Copy'}
                </button>
                <button
                  onClick={() => onDelete(item.SnippetId)}
                  style={{
                    padding: '6px 10px', borderRadius: 6,
                    background: 'rgba(225,87,89,.15)', border: '1px solid rgba(225,87,89,.3)',
                    color: '#f85149', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(225,87,89,.25)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(225,87,89,.15)'; }}
                  title="Delete"
                >
                  🗑
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

