/* =========================================================================
   DSVP - Seed data
   Run AFTER 01_schema.sql in SSMS
   ========================================================================= */
USE DSVP_DB;
GO

-- Admin user (password: Admin@123 -> replace hash after real bcrypt hashing)
INSERT INTO dbo.Users (FullName, Email, PasswordHash, Role, IsPremium)
VALUES ('Platform Admin', 'admin@dsvp.local', '$2b$10$REPLACE_WITH_REAL_BCRYPT_HASH', 'admin', 1);
GO

-- Free modules
INSERT INTO dbo.Modules (Name, Slug, Category, Description, IsPremium, SortOrder) VALUES
('Array',       'array',        'array',   'Visualize array operations: insert, delete, search, traverse.', 0, 1),
('Linked List', 'linked-list',  'list',    'Singly/doubly linked list operations with pointer visualization.', 0, 2),
('Circular Linked List', 'circular-linked-list', 'list', 'Circular singly linked list with wrap-around pointer visualization.', 0, 3),
('Stack',       'stack',        'stack',   'Push/pop visualized as a vertical stack.', 0, 4),
('Queue',       'queue',        'queue',   'Enqueue/dequeue with FIFO visualization.', 0, 5),
('Sorting',     'sorting',      'sorting', 'Bubble, insertion, selection, merge, quick sort animations.', 0, 6);
GO

-- Premium modules
INSERT INTO dbo.Modules (Name, Slug, Category, Description, IsPremium, SortOrder) VALUES
('Binary Tree',      'binary-tree',       'tree',      'Tree traversal and structure visualization.', 1, 6),
('Binary Search Tree','bst',              'tree',      'BST insert/delete/search with rotations.', 1, 7),
('AVL Tree',         'avl-tree',          'tree',      'Self-balancing tree with rotation animations.', 1, 8),
('Heap',             'heap',              'heap',      'Min/max heap operations.', 1, 9),
('Graph',            'graph',             'graph',     'BFS/DFS/Dijkstra visualized on graphs.', 1, 10),
('Trie',             'trie',              'tree',      'Prefix tree insert/search visualization.', 1, 11),
('Hashing',          'hashing',           'hashing',   'Hash table collision handling visualization.', 1, 12),
('Dynamic Programming','dynamic-programming','dp',      'DP table fill visualization.', 1, 13),
('Segment Tree',     'segment-tree',      'tree',      'Range query/update visualization.', 1, 14),
('Red-Black Tree',   'red-black-tree',    'tree',      'Self-balancing tree with color-based rotation.', 1, 15);
GO

PRINT 'Seed data inserted successfully.';
