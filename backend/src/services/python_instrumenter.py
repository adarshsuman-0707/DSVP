# """
# DSVP Python Auto-Instrumenter
# ──────────────────────────────
# Reads user code from a file path passed as sys.argv[1],
# rewrites the AST to trace ALL array/list operations,
# then exec()s the rewritten code.

# Traced operations:
#   - List literal assigned to variable:  x = [1,2,3]  → _DSVPArray
#   - List() constructor:                 x = list(...)  → _DSVPArray
#   - Range-based init:                   x = [0]*n      → _DSVPArray
#   - Subscript write:                    a[i] = v       → _dsvp_set(a, i, v)
#   - Tuple swap:                         a[i],a[j] = a[j],a[i]  → _dsvp_swap
#   - Subscript read in comparison:       a[i] > a[j]    → _dsvp_cmp + read
#   - .sort() / .reverse() calls         → traced wrapper
#   - .append(v)                         → _dsvp_append

# No changes to user code are required. Plain Python lists work as-is.
# """

# import sys
# import ast
# import json
# import types
# import traceback

# # ── Trace emitter ─────────────────────────────────────────────────────────────

# _DSVP_IN_COMPARE = False   # flag: suppress __getitem__ reads during compares

# # ── sys.settrace call-stack tracker ──────────────────────────────────────────

# # Internal names to skip — we don't want to show _DSVPArray internals
# _SKIP_FUNCS = frozenset({
#     '_emit', '_dsvp_make', '_dsvp_set', '_dsvp_swap',
#     '_dsvp_compare', '_dsvp_read', '__init__', '__setitem__',
#     '__getitem__', '__iter__', '__len__', '__repr__', '__str__',
#     'append', 'sort', 'reverse', 'copy', 'main',
# })

# def _safe_repr(val, depth=0):
#     """Safe repr of a value for display — truncates long strings."""
#     if depth > 1:
#         return '...'
#     if isinstance(val, _DSVPArray):
#         inner = ', '.join(str(x) for x in val._d[:8])
#         suffix = ', ...' if len(val._d) > 8 else ''
#         return f'[{inner}{suffix}]'
#     if isinstance(val, (list, tuple)):
#         if len(val) > 8:
#             inner = ', '.join(_safe_repr(x, depth+1) for x in val[:8])
#             return f'[{inner}, ...]'
#         return repr(val)
#     r = repr(val)
#     return r if len(r) <= 60 else r[:57] + '...'

# def _get_locals(frame):
#     """Extract user-visible local variables from a frame."""
#     skip_keys = frozenset({'__builtins__', '__name__', '__doc__',
#                            '_emit', '_DSVPArray', '_dsvp_make', '_dsvp_set',
#                            '_dsvp_swap', '_dsvp_compare', '_dsvp_read', 'Array'})
#     result = {}
#     try:
#         for k, v in frame.f_locals.items():
#             if k.startswith('_') or k in skip_keys:
#                 continue
#             result[k] = _safe_repr(v)
#     except Exception:
#         pass
#     return result

# def _emit_call(func_name, line_no, args_repr):
#     line = json.dumps({
#         "op": "call",
#         "func": func_name,
#         "line": line_no,
#         "args": args_repr,
#     }, default=str)
#     sys.stdout.write("DSVP_TRACE:" + line + "\n")
#     sys.stdout.flush()

# def _emit_return(func_name, line_no, ret_val, local_vars):
#     line = json.dumps({
#         "op": "return",
#         "func": func_name,
#         "line": line_no,
#         "ret":  ret_val,
#         "locals": local_vars,
#     }, default=str)
#     sys.stdout.write("DSVP_TRACE:" + line + "\n")
#     sys.stdout.flush()

# def _emit_line(func_name, line_no, local_vars):
#     line = json.dumps({
#         "op":     "line",
#         "func":   func_name,
#         "line":   line_no,
#         "locals": local_vars,
#     }, default=str)
#     sys.stdout.write("DSVP_TRACE:" + line + "\n")
#     sys.stdout.flush()

# def _make_tracer():
#     """
#     Returns a sys.settrace-compatible tracer function.

#     Emits:
#       DSVP_TRACE:{"op":"call",   "func":"bubble_sort", "line":2,  "args":{"arr":"[64,34,...]"}}
#       DSVP_TRACE:{"op":"line",   "func":"bubble_sort", "line":4,  "locals":{"i":0,"j":1}}
#       DSVP_TRACE:{"op":"return", "func":"bubble_sort", "line":10, "ret":"[11,12,...]", "locals":{...}}

#     Only traces functions defined in <user_code> (filename == "<user_code>").
#     Skips internal DSVP helpers and built-in frames.
#     """
#     _line_emit_counter = {}   # func_name → count, throttle line events

#     def _tracer(frame, event, arg):
#         fname = frame.f_code.co_filename
#         if fname != "<user_code>":
#             return None          # don't trace built-ins or our own helpers

#         func_name = frame.f_code.co_name
#         if func_name in _SKIP_FUNCS:
#             return None

#         line_no = frame.f_lineno

#         if event == 'call':
#             # Build args repr from the frame locals (they ARE the args at call time)
#             args = {}
#             try:
#                 varnames = frame.f_code.co_varnames[:frame.f_code.co_argcount]
#                 for v in varnames:
#                     if v in frame.f_locals:
#                         args[v] = _safe_repr(frame.f_locals[v])
#             except Exception:
#                 pass
#             _emit_call(func_name, line_no, args)
#             _line_emit_counter[func_name] = 0
#             return _tracer   # continue tracing this frame

#         elif event == 'line':
#             # Throttle: emit every line, but skip trivial ones (blank / comment)
#             _line_emit_counter[func_name] = _line_emit_counter.get(func_name, 0) + 1
#             locals_snap = _get_locals(frame)
#             _emit_line(func_name, line_no, locals_snap)

#         elif event == 'return':
#             ret_repr = _safe_repr(arg) if arg is not None else 'None'
#             locals_snap = _get_locals(frame)
#             _emit_return(func_name, line_no, ret_repr, locals_snap)

#         return _tracer

#     return _tracer

# def _emit(op, idx, val, snap):
#     line = json.dumps({"op": op, "idx": idx, "val": val, "snap": list(snap)},
#                       default=str)
#     sys.stdout.write("DSVP_TRACE:" + line + "\n")
#     sys.stdout.flush()


# # ── _DSVPArray: wraps a plain list and emits events on mutation ───────────────

# class _DSVPArray:
#     __slots__ = ("_d",)

#     def __init__(self, data, _silent=False):
#         self._d = list(data)
#         if not _silent:
#             _emit("init", -1, None, self._d)

#     # -- reads --
#     def __getitem__(self, idx):
#         val = self._d[idx]
#         # Only emit read when NOT inside a compare operation
#         # (_dsvp_compare is called right before, so suppress duplicates)
#         if isinstance(idx, int) and not _DSVP_IN_COMPARE:
#             _emit("read", idx, val, self._d)
#         return val

#     # -- writes --
#     def __setitem__(self, idx, val):
#         if isinstance(idx, int):
#             self._d[idx] = val
#             _emit("write", idx, val, self._d)
#         else:
#             self._d[idx] = val

#     def __len__(self):      return len(self._d)
#     def __iter__(self):
#         # Emit read for each element as it's iterated
#         for i, v in enumerate(self._d):
#             _emit("read", i, v, self._d)
#             yield v
#     def __repr__(self):     return repr(self._d)
#     def __str__(self):      return str(self._d)
#     def __bool__(self):     return bool(self._d)
#     def __contains__(self, v): return v in self._d
#     def __eq__(self, other):
#         if isinstance(other, _DSVPArray): return self._d == other._d
#         return self._d == other

#     # comparisons (for sorting, searching)
#     def __lt__(self, o): return self._d < (o._d if isinstance(o, _DSVPArray) else o)
#     def __le__(self, o): return self._d <= (o._d if isinstance(o, _DSVPArray) else o)
#     def __gt__(self, o): return self._d > (o._d if isinstance(o, _DSVPArray) else o)
#     def __ge__(self, o): return self._d >= (o._d if isinstance(o, _DSVPArray) else o)

#     def append(self, val):
#         self._d.append(val)
#         _emit("append", len(self._d) - 1, val, self._d)

#     def sort(self, **kw):
#         # Use bubble-sort with tracing so every swap is visible
#         d = self._d
#         n = len(d)
#         for i in range(n):
#             for j in range(n - i - 1):
#                 _emit("compare", j, j + 1, d)
#                 if (kw.get("reverse", False) and d[j] < d[j+1]) or \
#                    (not kw.get("reverse", False) and d[j] > d[j+1]):
#                     d[j], d[j+1] = d[j+1], d[j]
#                     _emit("swap", j, j + 1, d)

#     def reverse(self):
#         d = self._d
#         for i in range(len(d) // 2):
#             j = len(d) - 1 - i
#             d[i], d[j] = d[j], d[i]
#             _emit("swap", i, j, d)

#     def copy(self):
#         return _DSVPArray(self._d, _silent=True)

#     # Allow list(arr) to work
#     def __list__(self):     return list(self._d)


# # ── Helper functions injected into user namespace ─────────────────────────────

# def _dsvp_set(arr, idx, val):
#     """Called for  arr[idx] = val  rewrites."""
#     if isinstance(arr, _DSVPArray):
#         arr[idx] = val          # goes through __setitem__ which emits
#     else:
#         arr[idx] = val          # plain list, silent

# def _dsvp_swap(arr, i, j):
#     """Called for  arr[i], arr[j] = arr[j], arr[i]  rewrites."""
#     if isinstance(arr, _DSVPArray):
#         arr._d[i], arr._d[j] = arr._d[j], arr._d[i]
#         _emit("swap", i, j, arr._d)
#     else:
#         arr[i], arr[j] = arr[j], arr[i]

# def _dsvp_compare(arr, i, j):
#     """Called to emit a compare event before an if-condition check."""
#     global _DSVP_IN_COMPARE
#     if isinstance(arr, _DSVPArray):
#         _DSVP_IN_COMPARE = True
#         _emit("compare", i, j, arr._d)
#         _DSVP_IN_COMPARE = False

# def _dsvp_read(arr, idx):
#     """Silent read that returns value without double-emitting."""
#     if isinstance(arr, _DSVPArray):
#         return arr._d[idx]
#     return arr[idx]

# def _dsvp_make(data):
#     """Convert any list-like to _DSVPArray."""
#     if isinstance(data, _DSVPArray):
#         return data
#     if isinstance(data, (list, range)):
#         return _DSVPArray(list(data))
#     return data

# def Array(size_or_list, fill=0):
#     """Explicit Array() helper — still works if user writes Array(5)."""
#     if isinstance(size_or_list, int):
#         return _DSVPArray([fill] * size_or_list)
#     return _DSVPArray(list(size_or_list))


# # ── AST transformer ───────────────────────────────────────────────────────────

# class _DSVPTransformer(ast.NodeTransformer):
#     """
#     Rewrites user AST so that:

#     1. x = [...]         →  x = _dsvp_make([...])
#     2. x = list(...)     →  x = _dsvp_make(list(...))
#     3. x = [v] * n       →  x = _dsvp_make([v] * n)
#     4. a[i] = v          →  _dsvp_set(a, i, v)
#     5. a[i],a[j]=a[j],a[i]  →  _dsvp_swap(a, i, j)   (when same array, const idx)
#     6. a[i] > a[j]  (in if/while condition with same arr)
#                          →  (_dsvp_compare(a,i,j), a[i] > a[j])[1]
#     """

#     def visit_Assign(self, node):
#         self.generic_visit(node)

#         # Pattern: a[i], a[j] = a[j], a[i]  (tuple swap of same array)
#         if (isinstance(node.targets[0], ast.Tuple) and
#                 isinstance(node.value, ast.Tuple) and
#                 len(node.targets[0].elts) == 2 and
#                 len(node.value.elts) == 2):
#             lhs = node.targets[0].elts
#             rhs = node.value.elts
#             if (self._is_subscript(lhs[0]) and self._is_subscript(lhs[1]) and
#                     self._is_subscript(rhs[0]) and self._is_subscript(rhs[1])):
#                 l0, l1 = lhs
#                 r0, r1 = rhs
#                 # Same array name on all four sides
#                 if (self._same_name(l0.value, l1.value) and
#                         self._same_name(l0.value, r0.value) and
#                         self._same_name(l0.value, r1.value)):
#                     # Cross-indices: lhs[0] matches rhs[1] AND lhs[1] matches rhs[0]
#                     if (self._ast_eq(l0.slice, r1.slice) and
#                             self._ast_eq(l1.slice, r0.slice)):
#                         return ast.Expr(
#                             value=ast.Call(
#                                 func=ast.Name(id="_dsvp_swap", ctx=ast.Load()),
#                                 args=[l0.value, l0.slice, l1.slice],
#                                 keywords=[],
#                             )
#                         )

#         # Pattern: x = [...] or x = list(...) or x = [...]*n
#         if (len(node.targets) == 1 and
#                 isinstance(node.targets[0], ast.Name)):
#             val = node.value
#             if self._is_list_like(val):
#                 node.value = ast.Call(
#                     func=ast.Name(id="_dsvp_make", ctx=ast.Load()),
#                     args=[val],
#                     keywords=[],
#                 )
#             return node

#         return node

#     def visit_AugAssign(self, node):
#         """a[i] += v  — treat as write after the operation."""
#         self.generic_visit(node)
#         return node   # leave aug-assign as-is; __setitem__ will trace it

#     def visit_AnnAssign(self, node):
#         """x: list = [...]"""
#         self.generic_visit(node)
#         if node.value and self._is_list_like(node.value):
#             node.value = ast.Call(
#                 func=ast.Name(id="_dsvp_make", ctx=ast.Load()),
#                 args=[node.value],
#                 keywords=[],
#             )
#         return node

#     def visit_Expr(self, node):
#         """Intercept standalone a[i] = ... via visit_Assign, and .sort() calls."""
#         self.generic_visit(node)
#         # .sort() and .reverse() calls are already traced by _DSVPArray methods
#         return node

#     def visit_If(self, node):
#         """Inject compare event before  if arr[i] > arr[j]  style tests."""
#         node = self.generic_visit(node)
#         node.test = self._maybe_inject_compare(node.test)
#         return node

#     def visit_While(self, node):
#         node = self.generic_visit(node)
#         node.test = self._maybe_inject_compare(node.test)
#         return node

#     # ── helpers ──

#     def _maybe_inject_compare(self, test_node):
#         """
#         If test is  arr[i] <cmp> arr[j]  (same array, int subscripts),
#         wrap it as  (_dsvp_compare(arr,i,j) or True) and (original_test)
#         so the compare event fires first.
#         """
#         if not isinstance(test_node, ast.Compare):
#             return test_node
#         left = test_node.left
#         if not (len(test_node.comparators) == 1):
#             return test_node
#         right = test_node.comparators[0]
#         if (self._is_subscript(left) and self._is_subscript(right) and
#                 self._same_name(left.value, right.value)):
#             cmp_call = ast.Call(
#                 func=ast.Name(id="_dsvp_compare", ctx=ast.Load()),
#                 args=[left.value, left.slice, right.slice],
#                 keywords=[],
#             )
#             # (_dsvp_compare(...) or True) is always True, so semantics unchanged
#             injected = ast.BoolOp(
#                 op=ast.Or(),
#                 values=[cmp_call, ast.Constant(value=True)],
#             )
#             return ast.BoolOp(
#                 op=ast.And(),
#                 values=[injected, test_node],
#             )
#         return test_node

#     def _is_list_like(self, node):
#         if isinstance(node, ast.List):
#             return True
#         if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult):
#             return True   # [v] * n
#         if (isinstance(node, ast.Call) and
#                 isinstance(node.func, ast.Name) and
#                 node.func.id in ("list", "sorted")):
#             return True
#         return False

#     def _is_subscript(self, node):
#         return isinstance(node, ast.Subscript)

#     def _same_name(self, a, b):
#         return isinstance(a, ast.Name) and isinstance(b, ast.Name) and a.id == b.id

#     def _same_slice(self, a, b):
#         """True if both slices are identical Name or Constant nodes."""
#         if isinstance(a, ast.Name) and isinstance(b, ast.Name):
#             return a.id == b.id
#         if isinstance(a, ast.Constant) and isinstance(b, ast.Constant):
#             return a.value == b.value
#         return False

#     def _ast_eq(self, a, b):
#         """Deep structural equality of two AST nodes."""
#         return ast.dump(a) == ast.dump(b)

# # ── Main entry ────────────────────────────────────────────────────────────────

# def main():
#     if len(sys.argv) < 2:
#         print("Usage: python_instrumenter.py <user_code_file>", file=sys.stderr)
#         sys.exit(1)

#     user_file = sys.argv[1]
#     with open(user_file, "r", encoding="utf-8") as f:
#         source = f.read()

#     # Parse
#     try:
#         tree = ast.parse(source, filename="<user_code>")
#     except SyntaxError as e:
#         # Emit as a clean error that executionController can parse
#         print(f"SyntaxError: {e.msg} (line {e.lineno})", file=sys.stderr)
#         sys.exit(1)

#     # Transform
#     transformer = _DSVPTransformer()
#     new_tree = transformer.visit(tree)
#     ast.fix_missing_locations(new_tree)

#     # Compile
#     try:
#         code_obj = compile(new_tree, "<user_code>", "exec")
#     except Exception as e:
#         print(f"CompileError: {e}", file=sys.stderr)
#         sys.exit(1)

#     # Build the namespace with all helpers pre-injected
#     namespace = {
#         "__name__": "__main__",
#         "_emit":         _emit,
#         "_DSVPArray":    _DSVPArray,
#         "_dsvp_make":    _dsvp_make,
#         "_dsvp_set":     _dsvp_set,
#         "_dsvp_swap":    _dsvp_swap,
#         "_dsvp_compare": _dsvp_compare,
#         "_dsvp_read":    _dsvp_read,
#         "Array":         Array,
#     }

#     # Execute — with sys.settrace for call-stack tracking
#     tracer = _make_tracer()
#     try:
#         sys.settrace(tracer)
#         exec(code_obj, namespace)
#     except SystemExit:
#         pass
#     except Exception as e:
#         sys.settrace(None)
#         tb = traceback.extract_tb(sys.exc_info()[2])
#         user_frame = None
#         for frame in reversed(tb):
#             if frame.filename == "<user_code>":
#                 user_frame = frame
#                 break
#         if user_frame:
#             print(
#                 f"{type(e).__name__}: {e}\n"
#                 f"  File \"<user_code>\", line {user_frame.lineno}",
#                 file=sys.stderr,
#             )
#         else:
#             print(f"{type(e).__name__}: {e}", file=sys.stderr)
#         sys.exit(1)
#     finally:
#         sys.settrace(None)


# if __name__ == "__main__":
#     main()
"""
DSVP Python Auto-Instrumenter (v2 — full execution trace)
────────────────────────────────────────────────────────
Reads user code from a file path passed as sys.argv[1],
rewrites the AST to trace ALL array/list operations,
then exec()s the rewritten code under sys.settrace so that
EVERY line of user code — not just array reads/writes — is
visualizable: scalar variable changes (max_val, min_val, rem, i, ...),
loop iterations, if/while conditions, and function call/return.

Two event families are emitted, interleaved in real execution order,
all on stdout prefixed with "DSVP_TRACE:":

  A) Array-level events   (op: init/read/write/swap/append/compare)
     — unchanged from v1, driven by the _DSVPArray wrapper class.

  B) Execution-level events (op: call/line/return)
     — NEW / improved in v2. Driven by sys.settrace. Each event now
       carries:
         - func   : function name ("<module>" for top-level code)
         - depth  : call-stack depth (for nested-call indentation)
         - line   : source line number being executed
         - source : the actual stripped source text of that line
         - locals : {var_name: repr(value)} snapshot of ALL user
                    locals visible in that frame right now
         - changed: list of variable names whose repr changed since
                    the previous line event in the *same* frame
                    (this is what lets the frontend highlight
                    "max_val just became 9" style updates)

No changes to user code are required. Plain Python lists/vars work as-is.
"""

import sys
import ast
import json
import re
import traceback

# ── Trace emitter ─────────────────────────────────────────────────────────────

_DSVP_IN_COMPARE = False   # flag: suppress __getitem__ reads during compares

# Internal names to skip — we don't want to show _DSVPArray internals
_SKIP_FUNCS = frozenset({
    '_emit', '_dsvp_make', '_dsvp_set', '_dsvp_swap',
    '_dsvp_compare', '_dsvp_read', '__init__', '__setitem__',
    '__getitem__', '__iter__', '__len__', '__repr__', '__str__',
    'append', 'sort', 'reverse', 'copy', 'main',
})

_STEP_COUNTER = [0]  # global monotonic step id shared by ALL emitted events


def _next_step():
    _STEP_COUNTER[0] += 1
    return _STEP_COUNTER[0]


_DEFAULT_REPR_RE = re.compile(r'^<(?:[\w]+\.)*(\w+) object at 0x[0-9A-Fa-f]+>$')


def _safe_repr(val, depth=0):
    """Safe repr of a value for display — truncates long strings."""
    if depth > 1:
        return '...'
    if isinstance(val, _DSVPArray):
        inner = ', '.join(str(x) for x in val._d[:8])
        suffix = ', ...' if len(val._d) > 8 else ''
        return f'[{inner}{suffix}]'
    if isinstance(val, (list, tuple)):
        if len(val) > 8:
            inner = ', '.join(_safe_repr(x, depth + 1) for x in val[:8])
            return f'[{inner}, ...]'
        return repr(val)
    if isinstance(val, float):
        if val == float('inf'):
            return 'inf'
        if val == float('-inf'):
            return '-inf'
    # Node-like objects (used by every LL variant, incl. circular) show as
    # "Node(20)" rather than the default memory-address repr — the address
    # is meaningless to a learner watching the Variables panel.
    if _is_node_like(val) or _is_tree_node_like(val):
        return f'Node({_safe_repr(_node_val(val), depth + 1)})' if val is not None else 'None'
    r = repr(val)
    m = _DEFAULT_REPR_RE.match(r)
    if m:
        return f'{m.group(1)} instance'
    return r if len(r) <= 60 else r[:57] + '...'


def _get_locals(frame):
    """Extract user-visible local variables (name -> repr string) from a frame."""
    skip_keys = frozenset({'__builtins__', '__name__', '__doc__',
                            '_emit', '_DSVPArray', '_dsvp_make', '_dsvp_set',
                            '_dsvp_swap', '_dsvp_compare', '_dsvp_read', 'Array'})
    result = {}
    try:
        for k, v in frame.f_locals.items():
            if k.startswith('_') or k in skip_keys:
                continue
            result[k] = _safe_repr(v)
    except Exception:
        pass
    return result


def _write(payload):
    # Trace events go to stderr, never stdout — user code's own print()
    # output (often without trailing newlines, e.g. `print(v, end=" -> ")`)
    # lives on stdout untouched. Mixing the two on one stream let a trace
    # line get concatenated onto the tail of an unterminated user print,
    # corrupting the displayed output with embedded DSVP_TRACE JSON.
    payload["step"] = _next_step()
    sys.stderr.write("DSVP_TRACE:" + json.dumps(payload, default=str) + "\n")
    sys.stderr.flush()


def _emit_call(func_name, depth, line_no, args_repr):
    _write({
        "op": "call",
        "func": func_name,
        "depth": depth,
        "line": line_no,
        "args": args_repr,
    })


def _emit_return(func_name, depth, line_no, ret_val, local_vars):
    _write({
        "op": "return",
        "func": func_name,
        "depth": depth,
        "line": line_no,
        "ret": ret_val,
        "locals": local_vars,
    })


def _emit_line(func_name, depth, line_no, source_text, local_vars, changed):
    _write({
        "op": "line",
        "func": func_name,
        "depth": depth,
        "line": line_no,
        "source": source_text,
        "locals": local_vars,
        "changed": changed,
    })


def _make_tracer(source_lines):
    """
    Returns a sys.settrace-compatible tracer function.

    Emits (all prefixed DSVP_TRACE:):
      {"op":"call",   "func":"findGCD", "depth":0, "line":2, "args":{"nums":"[1,2,8,...]"}}
      {"op":"line",   "func":"findGCD", "depth":0, "line":4, "source":"max_val = max(max_val, i)",
       "locals":{"max_val":"8","min_val":"1","i":"8"}, "changed":["max_val","i"]}
      {"op":"return", "func":"findGCD", "depth":0, "line":19, "ret":"1", "locals":{...}}

    Only traces functions defined in <user_code> (filename == "<user_code>").
    Skips internal DSVP helpers and built-in frames.
    """
    call_stack = []                # stack of func names, for depth + indentation
    prev_locals_by_frame = {}      # id(frame) -> {name: repr} snapshot for diffing

    def _source_at(line_no):
        idx = line_no - 1
        if 0 <= idx < len(source_lines):
            return source_lines[idx].strip()
        return ""

    def _tracer(frame, event, arg):
        fname = frame.f_code.co_filename
        if fname != "<user_code>":
            return None          # don't trace built-ins or our own helpers

        func_name = frame.f_code.co_name
        if func_name in _SKIP_FUNCS:
            return None

        line_no = frame.f_lineno

        if event == 'call':
            args = {}
            try:
                varnames = frame.f_code.co_varnames[:frame.f_code.co_argcount]
                for v in varnames:
                    if v in frame.f_locals:
                        args[v] = _safe_repr(frame.f_locals[v])
            except Exception:
                pass
            depth = len(call_stack)
            call_stack.append(func_name)
            prev_locals_by_frame[id(frame)] = {}
            _emit_call(func_name, depth, line_no, args)
            return _tracer   # continue tracing this frame

        elif event == 'line':
            depth = max(len(call_stack) - 1, 0)
            locals_snap = _get_locals(frame)
            prev = prev_locals_by_frame.get(id(frame), {})
            changed = [k for k, v in locals_snap.items() if prev.get(k) != v]
            prev_locals_by_frame[id(frame)] = dict(locals_snap)
            _emit_line(func_name, depth, line_no, _source_at(line_no), locals_snap, changed)

            # ── LinkedList class auto-detection & traversal ──────────────
            try:
                for v in frame.f_locals.values():
                    if _is_node_like(v) and id(type(v)) not in _LL_PATCHED_CLASSES:
                        _patch_node_class(type(v))
                        _LL_REGISTRY[id(v)] = v
                        _emit_ll("ll_init", id(v), f"Created Node({_node_val(v)})", _LL_REGISTRY)
                    elif _is_node_like(v):
                        _LL_REGISTRY[id(v)] = v

                # Detect when a pointer variable (like cur, temp, ptr) moved in this step
                for k in changed:
                    val = frame.f_locals.get(k)
                    if _is_node_like(val):
                        _LL_REGISTRY[id(val)] = val
                        _emit_ll("ll_traverse", id(val), f"Traversing: {k} -> Node({_node_val(val)})", _LL_REGISTRY)
            except Exception:
                pass

            # ── BST node auto-detection & traversal ──────────────────────
            # A tree node is classified by having 'left'/'right' attrs; we
            # explicitly exclude anything already claimed by the LL detector
            # (has '.next') so a pathological class with both never fires
            # both subsystems at once.
            try:
                for v in frame.f_locals.values():
                    if _is_tree_node_like(v) and not _is_node_like(v):
                        if id(type(v)) not in _BST_PATCHED_CLASSES:
                            _patch_tree_node_class(type(v))
                            _BST_REGISTRY[id(v)] = v
                            _emit_bst("bst_init", id(v), f"Created Node({_node_val(v)})", _BST_REGISTRY)
                        else:
                            _BST_REGISTRY[id(v)] = v

                for k in changed:
                    val = frame.f_locals.get(k)
                    if _is_tree_node_like(val) and not _is_node_like(val):
                        _BST_REGISTRY[id(val)] = val
                        _emit_bst("bst_traverse", id(val), f"Traversing: {k} -> Node({_node_val(val)})", _BST_REGISTRY)
            except Exception:
                pass

            # ── Graph auto-detection (adjacency dict + BFS/DFS traversal) ─
            try:
                _detect_and_emit_graph(frame, changed)
            except Exception:
                pass

        elif event == 'return':
            ret_repr = _safe_repr(arg) if arg is not None else 'None'
            locals_snap = _get_locals(frame)
            depth = max(len(call_stack) - 1, 0)
            if call_stack and call_stack[-1] == func_name:
                call_stack.pop()
            prev_locals_by_frame.pop(id(frame), None)
            _emit_return(func_name, depth, line_no, ret_repr, locals_snap)

        return _tracer

    return _tracer


def _emit(op, idx, val, snap):
    payload = {"op": op, "idx": idx, "val": val, "snap": list(snap)}
    _write(payload)


# ── _DSVPArray: wraps a plain list and emits events on mutation ───────────────

class _DSVPArray:
    __slots__ = ("_d",)

    def __init__(self, data, _silent=False):
        self._d = list(data)
        if not _silent:
            _emit("init", -1, None, self._d)

    # -- reads --
    def __getitem__(self, idx):
        val = self._d[idx]
        if isinstance(idx, int) and not _DSVP_IN_COMPARE:
            _emit("read", idx, val, self._d)
        if isinstance(idx, slice):
            _emit("delete", len(val) - 1, None, val)
            return _DSVPArray(val, _silent=True)
        return val

    # -- writes --
    def __setitem__(self, idx, val):
        if isinstance(idx, int):
            self._d[idx] = val
            _emit("write", idx, val, self._d)
        else:
            self._d[idx] = val

    def __len__(self):      return len(self._d)

    def __iter__(self):
        for i, v in enumerate(self._d):
            _emit("read", i, v, self._d)
            yield v

    def __repr__(self):     return repr(self._d)
    def __str__(self):      return str(self._d)
    def __bool__(self):     return bool(self._d)
    def __contains__(self, v): return v in self._d

    def __eq__(self, other):
        if isinstance(other, _DSVPArray):
            return self._d == other._d
        return self._d == other

    def __lt__(self, o): return self._d < (o._d if isinstance(o, _DSVPArray) else o)
    def __le__(self, o): return self._d <= (o._d if isinstance(o, _DSVPArray) else o)
    def __gt__(self, o): return self._d > (o._d if isinstance(o, _DSVPArray) else o)
    def __ge__(self, o): return self._d >= (o._d if isinstance(o, _DSVPArray) else o)

    def append(self, val):
        self._d.append(val)
        _emit("append", len(self._d) - 1, val, self._d)

    def pop(self, idx=-1):
        real_idx = idx if idx >= 0 else len(self._d) + idx
        val = self._d.pop(idx)
        _emit("delete", real_idx, val, self._d)
        return val

    def insert(self, idx, val):
        self._d.insert(idx, val)
        real_idx = idx if idx >= 0 else len(self._d) + idx - 1
        _emit("write", real_idx, val, self._d)

    def remove(self, val):
        idx = self._d.index(val)
        self._d.remove(val)
        _emit("delete", idx, val, self._d)

    def extend(self, vals):
        for v in vals:
            self.append(v)

    def clear(self):
        self._d.clear()
        _emit("init", -1, None, self._d)

    def __delitem__(self, idx):
        if isinstance(idx, int):
            val = self._d[idx]
            del self._d[idx]
            _emit("delete", idx if idx >= 0 else len(self._d) + idx, val, self._d)
        else:
            del self._d[idx]

    def index(self, val):
        return self._d.index(val)

    def count(self, val):
        return self._d.count(val)

    def sort(self, **kw):
        d = self._d
        n = len(d)
        for i in range(n):
            for j in range(n - i - 1):
                _emit("compare", j, j + 1, d)
                if (kw.get("reverse", False) and d[j] < d[j + 1]) or \
                   (not kw.get("reverse", False) and d[j] > d[j + 1]):
                    d[j], d[j + 1] = d[j + 1], d[j]
                    _emit("swap", j, j + 1, d)

    def reverse(self):
        d = self._d
        for i in range(len(d) // 2):
            j = len(d) - 1 - i
            d[i], d[j] = d[j], d[i]
            _emit("swap", i, j, d)

    def copy(self):
        return _DSVPArray(self._d, _silent=True)

    def __list__(self):     return list(self._d)


def _emit2d(op, row, col, val, grid):
    payload = {"op": op, "row": row, "col": col, "val": val,
               "grid": [list(r) for r in grid]}
    _write(payload)


# ── _DSVPGrid: wraps a plain 2D list (list of lists) and emits read2d/
# write2d/init2d events on cell access, mirroring the Java DSVPArray2DInt
# wrapper class but at runtime via __getitem__/__setitem__ instead of a
# compile-time class substitution. `grid[i]` returns a _DSVPGridRow proxy
# bound to that row so `grid[i][j] = v` / `grid[i][j]` still work exactly
# like plain nested-list indexing while letting the inner access emit the
# (row, col) event the outer __getitem__ alone can't see.
class _DSVPGridRow:
    __slots__ = ("_grid", "_row")

    def __init__(self, grid, row):
        self._grid = grid
        self._row = row

    def __getitem__(self, col):
        return self._grid._get(self._row, col)

    def __setitem__(self, col, val):
        self._grid._set(self._row, col, val)

    def __len__(self):
        return len(self._grid._d[self._row])

    def __iter__(self):
        return iter(self._grid._d[self._row])

    def __repr__(self):     return repr(self._grid._d[self._row])
    def __str__(self):      return str(self._grid._d[self._row])

    def __eq__(self, other):
        mine = self._grid._d[self._row]
        if isinstance(other, _DSVPGridRow):
            return mine == other._grid._d[other._row]
        return mine == other


class _DSVPGrid:
    __slots__ = ("_d",)

    def __init__(self, rows, _silent=False):
        self._d = [list(r) for r in rows]
        if not _silent:
            _emit2d("init2d", -1, -1, None, self._d)

    def __getitem__(self, row):
        if isinstance(row, int):
            return _DSVPGridRow(self, row)
        return [list(r) for r in self._d[row]]

    def __setitem__(self, row, val):
        self._d[row] = list(val._d) if isinstance(val, _DSVPArray) else list(val)
        _emit2d("write2d", row, -1, None, self._d)

    def _get(self, row, col):
        val = self._d[row][col]
        _emit2d("read2d", row, col, val, self._d)
        return val

    def _set(self, row, col, val):
        self._d[row][col] = val
        _emit2d("write2d", row, col, val, self._d)

    def __len__(self):      return len(self._d)

    def __iter__(self):
        for i in range(len(self._d)):
            yield _DSVPGridRow(self, i)

    def rows(self):         return len(self._d)
    def cols(self):         return len(self._d[0]) if self._d else 0

    def __repr__(self):     return repr(self._d)
    def __str__(self):      return str(self._d)

    def __eq__(self, other):
        if isinstance(other, _DSVPGrid):
            return self._d == other._d
        return self._d == other


def _emit_hash(op, size, buckets, active_bucket, active_key, found, val=None,
               mode='chaining', tombstones=None, probe_seq=None):
    payload = {
        "op": op,
        "size": size,
        "mode": mode,
        "buckets": buckets,
        "activeBucket": active_bucket,
        "activeKey": active_key,
        "found": found,
        "val": val,
        "tombstones": tombstones if tombstones is not None else [],
        "probeSeq": probe_seq if probe_seq is not None else [],
    }
    _write(payload)


_TOMBSTONE = object()


# ── _DSVPHashTable: separate-chaining + open-addressing hash table wrapper ─────
class _DSVPHashTable:
    __slots__ = ("_size", "_buckets", "_hash_fn", "_hash_fn2", "_mode", "_slots")

    def __init__(self, size, hash_fn=None, mode='chaining', hash_fn2=None):
        self._size = size
        self._mode = mode
        self._hash_fn = hash_fn or (lambda k: hash(k) % size)
        if mode == 'chaining':
            self._buckets = [[] for _ in range(size)]
            self._slots = None
            self._hash_fn2 = None
        else:
            self._slots = [None] * size
            self._buckets = None
            if hash_fn2 is not None:
                self._hash_fn2 = hash_fn2
            elif size > 1:
                self._hash_fn2 = lambda k: 1 + (hash(k) % (size - 1))
            else:
                self._hash_fn2 = lambda k: 1
        _emit_hash("hash_init", self._size, self._snapshot_buckets(), None, None, None,
                   mode=self._mode, tombstones=self._tombstone_list())

    # ---- chaining helpers ----
    def _snapshot_buckets(self):
        if self._mode == 'chaining':
            return [[{"key": str(k), "val": str(v)} for k, v in bucket] for bucket in self._buckets]
        else:
            out = []
            for slot in self._slots:
                if slot is None or slot is _TOMBSTONE:
                    out.append([])
                else:
                    k, v = slot
                    out.append([{"key": str(k), "val": str(v)}])
            return out

    def _tombstone_list(self):
        if self._mode == 'chaining':
            return []
        return [i for i, s in enumerate(self._slots) if s is _TOMBSTONE]

    # ---- open addressing probe sequence ----
    def _probe_index(self, key, i):
        h1 = self._hash_fn(key) % self._size
        if self._mode == 'linear':
            return (h1 + i) % self._size
        elif self._mode == 'quadratic':
            return (h1 + i * i) % self._size
        elif self._mode == 'double':
            h2 = self._hash_fn2(key)
            return (h1 + i * h2) % self._size
        else:
            raise ValueError(f"Unknown mode: {self._mode}")

    def put(self, key, val):
        if self._mode == 'chaining':
            idx = self._hash_fn(key) % self._size
            bucket = self._buckets[idx]
            for i, (k, _v) in enumerate(bucket):
                if k == key:
                    bucket[i] = (k, val)
                    break
            else:
                bucket.append((key, val))
            _emit_hash("hash_put", self._size, self._snapshot_buckets(), idx, str(key), None, str(val),
                       mode=self._mode)
            return

        probe_seq = []
        first_tombstone = None
        for i in range(self._size):
            idx = self._probe_index(key, i)
            slot = self._slots[idx]
            if slot is None:
                probe_seq.append({"index": idx, "occupied": False})
                target = first_tombstone if first_tombstone is not None else idx
                self._slots[target] = (key, val)
                _emit_hash("hash_put", self._size, self._snapshot_buckets(), target, str(key), None, str(val),
                           mode=self._mode, tombstones=self._tombstone_list(), probe_seq=probe_seq)
                return
            elif slot is _TOMBSTONE:
                probe_seq.append({"index": idx, "occupied": False})
                if first_tombstone is None:
                    first_tombstone = idx
                # keep probing to check for existing key further along
            else:
                k, _v = slot
                if k == key:
                    probe_seq.append({"index": idx, "occupied": True})
                    self._slots[idx] = (key, val)
                    _emit_hash("hash_put", self._size, self._snapshot_buckets(), idx, str(key), None, str(val),
                               mode=self._mode, tombstones=self._tombstone_list(), probe_seq=probe_seq)
                    return
                else:
                    probe_seq.append({"index": idx, "occupied": True})
                    if i < self._size - 1:
                        _emit_hash("hash_probe", self._size, self._snapshot_buckets(), idx, str(key), None, None,
                                   mode=self._mode, tombstones=self._tombstone_list(), probe_seq=list(probe_seq))
        if first_tombstone is not None:
            self._slots[first_tombstone] = (key, val)
            _emit_hash("hash_put", self._size, self._snapshot_buckets(), first_tombstone, str(key), None, str(val),
                       mode=self._mode, tombstones=self._tombstone_list(), probe_seq=probe_seq)
            return
        raise RuntimeError(f"Hash table full: no slot available for key {key!r}")

    def get(self, key):
        if self._mode == 'chaining':
            idx = self._hash_fn(key) % self._size
            bucket = self._buckets[idx]
            for k, v in bucket:
                if k == key:
                    _emit_hash("hash_get", self._size, self._snapshot_buckets(), idx, str(key), True, str(v),
                               mode=self._mode)
                    return v
            _emit_hash("hash_get", self._size, self._snapshot_buckets(), idx, str(key), False, None,
                       mode=self._mode)
            return None

        probe_seq = []
        for i in range(self._size):
            idx = self._probe_index(key, i)
            slot = self._slots[idx]
            if slot is None:
                probe_seq.append({"index": idx, "occupied": False})
                _emit_hash("hash_get", self._size, self._snapshot_buckets(), idx, str(key), False, None,
                           mode=self._mode, tombstones=self._tombstone_list(), probe_seq=probe_seq)
                return None
            elif slot is _TOMBSTONE:
                probe_seq.append({"index": idx, "occupied": False})
                if i < self._size - 1:
                    _emit_hash("hash_probe", self._size, self._snapshot_buckets(), idx, str(key), None, None,
                               mode=self._mode, tombstones=self._tombstone_list(), probe_seq=list(probe_seq))
            else:
                k, v = slot
                if k == key:
                    probe_seq.append({"index": idx, "occupied": True})
                    _emit_hash("hash_get", self._size, self._snapshot_buckets(), idx, str(key), True, str(v),
                               mode=self._mode, tombstones=self._tombstone_list(), probe_seq=probe_seq)
                    return v
                else:
                    probe_seq.append({"index": idx, "occupied": True})
                    if i < self._size - 1:
                        _emit_hash("hash_probe", self._size, self._snapshot_buckets(), idx, str(key), None, None,
                                   mode=self._mode, tombstones=self._tombstone_list(), probe_seq=list(probe_seq))
        _emit_hash("hash_get", self._size, self._snapshot_buckets(), None, str(key), False, None,
                   mode=self._mode, tombstones=self._tombstone_list(), probe_seq=probe_seq)
        return None

    def remove(self, key):
        if self._mode == 'chaining':
            idx = self._hash_fn(key) % self._size
            bucket = self._buckets[idx]
            for i, (k, _v) in enumerate(bucket):
                if k == key:
                    bucket.pop(i)
                    _emit_hash("hash_remove", self._size, self._snapshot_buckets(), idx, str(key), True,
                               mode=self._mode)
                    return
            _emit_hash("hash_remove", self._size, self._snapshot_buckets(), idx, str(key), False,
                       mode=self._mode)
            return

        probe_seq = []
        for i in range(self._size):
            idx = self._probe_index(key, i)
            slot = self._slots[idx]
            if slot is None:
                probe_seq.append({"index": idx, "occupied": False})
                _emit_hash("hash_remove", self._size, self._snapshot_buckets(), idx, str(key), False, None,
                           mode=self._mode, tombstones=self._tombstone_list(), probe_seq=probe_seq)
                return
            elif slot is _TOMBSTONE:
                probe_seq.append({"index": idx, "occupied": False})
                if i < self._size - 1:
                    _emit_hash("hash_probe", self._size, self._snapshot_buckets(), idx, str(key), None, None,
                               mode=self._mode, tombstones=self._tombstone_list(), probe_seq=list(probe_seq))
            else:
                k, v = slot
                if k == key:
                    probe_seq.append({"index": idx, "occupied": True})
                    self._slots[idx] = _TOMBSTONE
                    _emit_hash("hash_remove", self._size, self._snapshot_buckets(), idx, str(key), True, str(v),
                               mode=self._mode, tombstones=self._tombstone_list(), probe_seq=probe_seq)
                    return
                else:
                    probe_seq.append({"index": idx, "occupied": True})
                    if i < self._size - 1:
                        _emit_hash("hash_probe", self._size, self._snapshot_buckets(), idx, str(key), None, None,
                                   mode=self._mode, tombstones=self._tombstone_list(), probe_seq=list(probe_seq))
        _emit_hash("hash_remove", self._size, self._snapshot_buckets(), None, str(key), False, None,
                   mode=self._mode, tombstones=self._tombstone_list(), probe_seq=probe_seq)

    def __setitem__(self, key, val):
        self.put(key, val)

    def __getitem__(self, key):
        if self._mode == 'chaining':
            idx = self._hash_fn(key) % self._size
            for k, v in self._buckets[idx]:
                if k == key:
                    return v
            raise KeyError(key)
        for i in range(self._size):
            idx = self._probe_index(key, i)
            slot = self._slots[idx]
            if slot is None:
                raise KeyError(key)
            elif slot is _TOMBSTONE:
                continue
            else:
                k, v = slot
                if k == key:
                    return v
        raise KeyError(key)

    def __delitem__(self, key):
        self.remove(key)

    def __contains__(self, key):
        if self._mode == 'chaining':
            idx = self._hash_fn(key) % self._size
            return any(k == key for k, _v in self._buckets[idx])
        for i in range(self._size):
            idx = self._probe_index(key, i)
            slot = self._slots[idx]
            if slot is None:
                return False
            elif slot is _TOMBSTONE:
                continue
            else:
                k, _v = slot
                if k == key:
                    return True
        return False

    def __len__(self):
        if self._mode == 'chaining':
            return sum(len(b) for b in self._buckets)
        return sum(1 for s in self._slots if s is not None and s is not _TOMBSTONE)

    def __repr__(self):
        if self._mode == 'chaining':
            items = ', '.join(f'{k!r}: {v!r}' for b in self._buckets for k, v in b)
        else:
            items = ', '.join(f'{k!r}: {v!r}' for s in self._slots if s is not None and s is not _TOMBSTONE for k, v in [s])
        return '{' + items + '}'

    def __str__(self):
        return self.__repr__()


def HashTable(size, hash_fn=None, mode='chaining', hash_fn2=None):
    """Explicit HashTable() factory — chaining or open-addressing (linear/quadratic/double)."""
    return _DSVPHashTable(size, hash_fn, mode, hash_fn2)


# ── Helper functions injected into user namespace ─────────────────────────────

def _dsvp_set(arr, idx, val):
    if isinstance(arr, _DSVPArray):
        arr[idx] = val
    else:
        arr[idx] = val


def _dsvp_swap(arr, i, j):
    if isinstance(arr, _DSVPArray):
        arr._d[i], arr._d[j] = arr._d[j], arr._d[i]
        _emit("swap", i, j, arr._d)
    else:
        arr[i], arr[j] = arr[j], arr[i]


def _dsvp_compare(arr, i, j):
    global _DSVP_IN_COMPARE
    if isinstance(arr, _DSVPArray):
        _DSVP_IN_COMPARE = True
        _emit("compare", i, j, arr._d)
        _DSVP_IN_COMPARE = False


def _dsvp_read(arr, idx):
    if isinstance(arr, _DSVPArray):
        return arr._d[idx]
    return arr[idx]


def _dsvp_make(data):
    if isinstance(data, _DSVPArray):
        return data
    if isinstance(data, (list, range)):
        return _DSVPArray(list(data))
    return data


def _dsvp_make2d(data):
    if isinstance(data, _DSVPGrid):
        return data
    if isinstance(data, list) and data and all(isinstance(r, (list, _DSVPArray)) for r in data):
        rows = [list(r._d) if isinstance(r, _DSVPArray) else list(r) for r in data]
        return _DSVPGrid(rows)
    return data


def Array(size_or_list, fill=0):
    if isinstance(size_or_list, int):
        return _DSVPArray([fill] * size_or_list)
    return _DSVPArray(list(size_or_list))


# ── LinkedList node tracker ────────────────────────────────────────────────────
# We detect linked-list objects at RUNTIME by sniffing __setattr__ calls.
# When any user object assigns to a "next" / "prev" / "data" / "val" attribute,
# we snapshot the full reachable chain starting from every known head and emit
# an ll_snap event.  This works for ANY user-defined Node class — no rewrite needed.

_LL_REGISTRY = {}   # id(node) → node object  (ALL live nodes we've seen)
_LL_HEADS    = {}   # id(node) → node object  (nodes with no known "prev" pointer)
_LL_KNOWN_HEADS  = set()  # id(node) → previously confirmed as a head (sticky
                           # across a circular list closing its own ring)
_LL_LAST_REACHABLE = set()  # id(node) → was reachable from a head as of the
                             # previous snapshot (used to tell a freshly
                             # spliced-out node from a genuinely new head)
_LL_TOMBSTONED = set()       # id(node) → permanently deleted; a later
                             # unrelated attribute write on the same (now
                             # dead) object re-adds it to the registry, so a
                             # one-shot prune isn't enough — it must stay
                             # excluded forever once orphaned.

def _is_node_like(obj):
    """Heuristic: has a 'next' attribute and is a user-defined object."""
    return (hasattr(obj, 'next') and
            not isinstance(obj, (str, bytes, bytearray, int, float, bool, type)))

def _node_id(node):
    return id(node)

def _node_val(node):
    """Return the display value of a node — tries data, val, value."""
    for attr in ('data', 'val', 'value', 'key', 'item'):
        if hasattr(node, attr):
            v = getattr(node, attr)
            if not _is_node_like(v) and not _is_tree_node_like(v):
                return v
    # Payload with a user-chosen name (num, score, ...): first primitive
    # attribute that is not a link/child field.
    try:
        for attr in _obj_attr_names(node):
            if _TREE_NON_CHILD_RE.match(attr) or _TREE_LEFT_RE.match(attr) or _TREE_RIGHT_RE.match(attr):
                continue
            v = getattr(node, attr, None)
            if isinstance(v, (int, float, str)) and not isinstance(v, bool):
                return v
    except Exception:
        pass
    return '?'

def _snapshot_chain(head, max_nodes=64):
    """
    Walk a linked list from head, return list of dicts:
      [{"id": <int>, "val": <any>, "nextId": <int|null>, "prevId": <int|null>,
        "isHead": <bool>}, ...]
    prevId is read from the node's own 'prev' attribute when present (doubly
    linked lists) — the frontend uses it to draw the PREV arrow, so a node
    with a real back-pointer must not fall through as null.
    Stops after max_nodes to prevent infinite loops.
    """
    nodes = []
    seen  = set()
    cur   = head
    first = True
    while cur is not None and id(cur) not in seen and len(nodes) < max_nodes:
        seen.add(id(cur))
        nxt  = getattr(cur, 'next', None)
        prv  = getattr(cur, 'prev', None)
        nodes.append({
            "id":     id(cur),
            "val":    _node_val(cur),
            "nextId": id(nxt) if nxt is not None else None,
            "prevId": id(prv) if prv is not None else None,
            "isHead": first,
        })
        first = False
        cur   = nxt
    return nodes

def _chain_reaches(start, target_id, max_nodes=128):
    """True if walking start.next.next... reaches a node with id == target_id."""
    cur = start
    seen = set()
    steps = 0
    while cur is not None and id(cur) not in seen and steps < max_nodes:
        if id(cur) == target_id:
            return True
        seen.add(id(cur))
        cur = getattr(cur, 'next', None)
        steps += 1
    return False


def _find_heads(registry):
    """
    Nodes that are not pointed to by any other node's 'next' — likely heads.

    Circular lists break the plain "nobody points at me" heuristic — once the
    ring closes, the head IS pointed at (by the tail). We keep a node that was
    already a confirmed head (_LL_KNOWN_HEADS) as head so long as whoever now
    points at it is reachable by walking forward FROM it — i.e. the pointer
    closes a loop back onto itself, rather than a genuinely different node
    (e.g. an insert-at-front) taking over as the new head.

    Staleness (spliced-out / deleted nodes) is decided by reachability, not
    by "used to be pointed at" — a node that stops being pointed at because
    a circular list mid-construction is still very much alive (it may be the
    head itself, momentarily un-pointed while its own ring is being wired
    up); only a node unreachable from every current head is truly orphaned.

    A node that just went unpointed AND was reachable mid-chain as of the
    previous snapshot (not itself a known head) has been spliced out, not
    promoted to a new head — that distinguishes a real delete from a
    genuinely new standalone/head node.
    """
    global _LL_LAST_REACHABLE
    # A tombstoned node may have been silently re-added to the registry by
    # an unrelated later attribute write on the same dead object — purge it
    # before it can be reconsidered as a head.
    for nid in _LL_TOMBSTONED:
        registry.pop(nid, None)

    pointed_at = {}   # id(node) -> id(node that points at it)
    for node in registry.values():
        nxt = getattr(node, 'next', None)
        if nxt is not None:
            pointed_at[id(nxt)] = id(node)

    heads = []
    for nid, n in registry.items():
        if nid not in pointed_at:
            if nid in _LL_LAST_REACHABLE and nid not in _LL_KNOWN_HEADS:
                continue   # was mid-chain last snapshot — spliced out, not a new head
            heads.append(n)
        elif nid in _LL_KNOWN_HEADS and _chain_reaches(n, pointed_at[nid]):
            heads.append(n)   # circular closure onto a known head — stays head

    reachable = set()
    for h in heads:
        cur, steps = h, 0
        while cur is not None and id(cur) not in reachable and steps < 128:
            reachable.add(id(cur))
            cur = getattr(cur, 'next', None)
            steps += 1

    head_ids = {id(h) for h in heads}
    for nid in list(registry.keys()):
        if nid not in reachable and nid not in head_ids:
            registry.pop(nid, None)
            _LL_KNOWN_HEADS.discard(nid)
            _LL_TOMBSTONED.add(nid)

    _LL_LAST_REACHABLE = reachable
    _LL_KNOWN_HEADS.update(head_ids)
    for nid in list(_LL_KNOWN_HEADS):
        if nid in pointed_at and nid not in head_ids:
            _LL_KNOWN_HEADS.discard(nid)   # demoted by a genuine new head

    return heads

def _emit_ll(op, active_id, desc, registry):
    """
    Find all heads in registry, snapshot each chain, emit ll_snap event.
    """
    heads = _find_heads(registry)
    all_nodes = []
    seen_ids  = set()
    for h in heads:
        chain = _snapshot_chain(h)
        for nd in chain:
            if nd["id"] not in seen_ids:
                seen_ids.add(nd["id"])
                all_nodes.append(nd)
    _write({
        "op":       op,
        "activeId": active_id,
        "nodes":    all_nodes,
        "desc":     desc,
    })

class _NodeProxy:
    """
    Transparent __setattr__ interceptor injected around user Node instances.
    We monkey-patch the user's Node class __setattr__ at runtime.
    """
    pass

_LL_PATCHED_CLASSES = set()  # set of class ids already patched

def _patch_node_class(cls):
    """Monkey-patch cls to cleanly trace node creation and pointer mutations."""
    if id(cls) in _LL_PATCHED_CLASSES:
        return
    _LL_PATCHED_CLASSES.add(id(cls))
    original_init    = cls.__init__  if hasattr(cls, '__init__')    else None
    original_setattr = cls.__setattr__ if hasattr(cls, '__setattr__') else object.__setattr__

    def _dsvp_init(self, *args, **kwargs):
        object.__setattr__(self, '_dsvp_in_init', True)
        try:
            if original_init:
                original_init(self, *args, **kwargs)
        finally:
            object.__setattr__(self, '_dsvp_in_init', False)
        _LL_REGISTRY[id(self)] = self

    def _dsvp_setattr(self, name, value):
        original_setattr(self, name, value)
        _LL_REGISTRY[id(self)] = self
        # Don't emit intermediate noise while __init__ is running
        if getattr(self, '_dsvp_in_init', False):
            return
        if name in ('next', 'prev'):
            val_desc = f"Node({_node_val(value)})" if _is_node_like(value) else ('None' if value is None else repr(value))
            _emit_ll("ll_update", id(self), f"node.{name} = {val_desc}", _LL_REGISTRY)
        elif name in ('data', 'val', 'value', 'key', 'item'):
            _emit_ll("ll_update", id(self), f"node.{name} = {value!r}", _LL_REGISTRY)

    cls.__init__ = _dsvp_init
    cls.__setattr__ = _dsvp_setattr


# ── BST node tracker ───────────────────────────────────────────────────────────
# Same "sniff __setattr__" strategy as the linked-list tracker above, but a
# tree node is identified by 'left'/'right' attributes rather than 'next',
# and "root" is the one node reachable via left/right that nobody else
# points at (instead of a chain head). Deleted nodes are pruned the same
# way: reachability-from-root decides what's live, not "was pointed at
# before" — a node briefly unpointed during a rebalance/rewire is not a
# deletion, only a node unreachable from the current root truly is.

_BST_REGISTRY = {}          # id(node) → node object (all live tree nodes seen)
_BST_KNOWN_ROOTS = set()    # sticky root id, to avoid flicker between snapshots
_BST_LAST_REACHABLE = set() # id(node) → reachable from root as of last snapshot
_BST_TOMBSTONED = set()     # id(node) → permanently deleted, never reconsidered


_TREE_LEFT_RE  = re.compile(r'^(left|lft|l|lc|lchild|left_?child|left_?node|left_?ptr)$', re.I)
_TREE_RIGHT_RE = re.compile(r'^(right|rgt|r|rc|rchild|right_?child|right_?node|right_?ptr)$', re.I)
_TREE_VALUE_ATTRS = ('data', 'val', 'value', 'key', 'item')
_TREE_NON_CHILD_RE = re.compile(r'^(next|prev|previous|nxt|parent|par|back|forward|fwd|_dsvp.*)$', re.I)
_TREE_ATTR_CACHE = {}   # type -> (left_attr|None, right_attr|None); only positive results cached


def _obj_attr_names(obj):
    try:
        return list(vars(obj).keys())
    except TypeError:
        names = []
        for klass in type(obj).__mro__:
            names.extend(getattr(klass, '__slots__', ()) or ())
        return [n for n in names if hasattr(obj, n)]


def _tree_attrs(obj):
    """
    Return (left_attr, right_attr) names for a binary-tree-node-like object,
    or None. Naming is NOT assumed: the conventional left/right (and common
    abbreviations) are honoured when present, otherwise the first two
    self-referential child fields in assignment order are used as
    (left, right). Never trusts non-user objects (str/int/containers).
    """
    if obj is None or isinstance(obj, (str, bytes, bytearray, int, float, bool, type,
                                        list, tuple, dict, set, frozenset)):
        return None
    t = type(obj)
    cached = _TREE_ATTR_CACHE.get(t)
    if cached is not None:
        return cached
    names = _obj_attr_names(obj)
    left = next((n for n in names if _TREE_LEFT_RE.match(n)), None)
    right = next((n for n in names if _TREE_RIGHT_RE.match(n)), None)
    if left is None and right is None:
        cands = []
        for n in names:
            if n in _TREE_VALUE_ATTRS or _TREE_NON_CHILD_RE.match(n):
                continue
            v = getattr(obj, n, None)
            if v is None or isinstance(v, t):
                cands.append(n)
        # need two child slots plus at least one other attribute (the payload)
        if len(cands) >= 2 and len(names) > len(cands):
            left, right = cands[0], cands[1]
        else:
            return None
    result = (left, right)
    _TREE_ATTR_CACHE[t] = result
    return result


def _tree_children(obj):
    attrs = _tree_attrs(obj)
    if attrs is None:
        return None, None
    l = getattr(obj, attrs[0], None) if attrs[0] else None
    r = getattr(obj, attrs[1], None) if attrs[1] else None
    return l, r


def _is_tree_node_like(obj):
    """Heuristic: a user-defined object with two child links — a binary tree node."""
    return _tree_attrs(obj) is not None


def _tree_reach_count(start, max_nodes=256):
    """Count of nodes reachable from `start` via its child links (cycle-safe)."""
    seen = set()
    stack = [start]
    while stack and len(seen) < max_nodes:
        cur = stack.pop()
        if cur is None or id(cur) in seen:
            continue
        seen.add(id(cur))
        l, r = _tree_children(cur)
        stack.append(l)
        stack.append(r)
    return len(seen)


def _snapshot_tree(root, max_nodes=256):
    """
    Walk a binary tree from root (DFS, cycle-safe), return list of dicts:
      [{"id":<int>, "val":<any>, "leftId":<int|null>, "rightId":<int|null>,
        "isRoot":<bool>}, ...]
    """
    nodes = []
    seen = set()
    stack = [(root, True)]
    while stack and len(nodes) < max_nodes:
        cur, is_root = stack.pop()
        if cur is None or id(cur) in seen:
            continue
        seen.add(id(cur))
        left, right = _tree_children(cur)
        nodes.append({
            "id":      id(cur),
            "val":     _node_val(cur),
            "leftId":  id(left) if left is not None else None,
            "rightId": id(right) if right is not None else None,
            "isRoot":  is_root,
        })
        if right is not None:
            stack.append((right, False))
        if left is not None:
            stack.append((left, False))
    return nodes


def _find_tree_root(registry):
    """
    Pick the live root of the tree in `registry`, pruning any node no longer
    reachable from it (deleted nodes). Sticky: keeps the previously-known
    root as root for as long as it remains a valid candidate (nobody points
    at it), so an unrelated insert deep in the tree can't cause the root
    marker to jump to some other node.
    """
    global _BST_LAST_REACHABLE

    for nid in _BST_TOMBSTONED:
        registry.pop(nid, None)

    pointed_at = set()
    for node in registry.values():
        l, r = _tree_children(node)
        if l is not None:
            pointed_at.add(id(l))
        if r is not None:
            pointed_at.add(id(r))

    candidates = [n for nid, n in registry.items() if nid not in pointed_at]

    root = None
    for n in candidates:
        if id(n) in _BST_KNOWN_ROOTS:
            root = n
            break
    if root is None and candidates:
        # No known root survived — pick whichever candidate reaches the most
        # nodes (a tree shouldn't have cycles, so this is mainly a defensive
        # tie-breaker for the very first snapshot or a full re-root).
        root = max(candidates, key=_tree_reach_count)

    reachable = set()
    if root is not None:
        stack = [root]
        while stack:
            cur = stack.pop()
            if cur is None or id(cur) in reachable:
                continue
            reachable.add(id(cur))
            cl, cr = _tree_children(cur)
            stack.append(cl)
            stack.append(cr)

    for nid in list(registry.keys()):
        if nid not in reachable:
            registry.pop(nid, None)
            _BST_KNOWN_ROOTS.discard(nid)
            _BST_TOMBSTONED.add(nid)

    _BST_LAST_REACHABLE = reachable
    _BST_KNOWN_ROOTS.clear()
    if root is not None:
        _BST_KNOWN_ROOTS.add(id(root))

    return root


def _emit_bst(op, active_id, desc, registry):
    root = _find_tree_root(registry)
    nodes = _snapshot_tree(root) if root is not None else []
    _write({
        "op":       op,
        "activeId": active_id,
        "nodes":    nodes,
        "desc":     desc,
    })


_BST_PATCHED_CLASSES = set()


def _patch_tree_node_class(cls):
    """Monkey-patch cls to cleanly trace tree-node creation and left/right mutations."""
    if id(cls) in _BST_PATCHED_CLASSES:
        return
    _BST_PATCHED_CLASSES.add(id(cls))
    original_init    = cls.__init__  if hasattr(cls, '__init__')    else None
    original_setattr = cls.__setattr__ if hasattr(cls, '__setattr__') else object.__setattr__

    def _dsvp_tree_init(self, *args, **kwargs):
        object.__setattr__(self, '_dsvp_in_init', True)
        try:
            if original_init:
                original_init(self, *args, **kwargs)
        finally:
            object.__setattr__(self, '_dsvp_in_init', False)
        _BST_REGISTRY[id(self)] = self

    def _dsvp_tree_setattr(self, name, value):
        original_setattr(self, name, value)
        _BST_REGISTRY[id(self)] = self
        if getattr(self, '_dsvp_in_init', False):
            return
        tree_attrs = _tree_attrs(self)
        if tree_attrs is not None and name in tree_attrs:
            val_desc = f"Node({_node_val(value)})" if _is_tree_node_like(value) else ('None' if value is None else repr(value))
            _emit_bst("bst_update", id(self), f"node.{name} = {val_desc}", _BST_REGISTRY)
        elif name in ('data', 'val', 'value', 'key', 'item'):
            _emit_bst("bst_update", id(self), f"node.{name} = {value!r}", _BST_REGISTRY)

    cls.__init__ = _dsvp_tree_init
    cls.__setattr__ = _dsvp_tree_setattr


# ── Graph auto-detection (adjacency-dict BFS/DFS) ──────────────────────────────
#
# Scope decision: support the single most common student/interview shape —
# an adjacency list stored as `dict[node] -> list/set of neighbors` (e.g.
# `graph = {0: [1, 2], 1: [0, 3], ...}`), plus the standard BFS (queue) /
# DFS (stack or recursion + explicit `visited`) traversal loop shape that
# almost universally accompanies it. No DSVP-specific API is required — we
# just watch local variables each traced line (same technique already used
# for LinkedList/BST auto-detection above) and recognize:
#   - a dict local whose values all look like neighbor collections -> "adj"
#   - a set/list/dict local named/shaped like a visited-set -> "visited"
#   - a list/deque local shaped like a BFS queue or DFS stack -> "frontier"
# Whenever visited or frontier changes on a traced line, we emit a
# "graph_step" event carrying the full node/edge list plus visited/frontier
# snapshots, which the frontend GraphVisualizer animates (active node,
# visited color, frontier color, unvisited neutral).

_GRAPH_ADJ = None          # last-seen adjacency dict object (by identity)
_GRAPH_ADJ_ID = None
_GRAPH_LAST_VISITED = None
_GRAPH_LAST_FRONTIER = None
_GRAPH_SEEN_INIT = False
_GRAPH_LAST_EDGE_KEY = None   # sorted tuple of (u,w) edges as of the last emit —
                               # tracks graph CONSTRUCTION independently of
                               # visited/frontier, so adding edges is visible
                               # before any traversal starts (see below).


def _dsvp_plain_list(x):
    if isinstance(x, _DSVPArray):
        return list(x._d)
    if isinstance(x, (set, frozenset)):
        return list(x)
    if isinstance(x, dict):
        return list(x.keys())
    try:
        return list(x)
    except Exception:
        return []


def _is_graph_adj_dict(v):
    """dict[node] -> list/set/tuple of neighbor nodes, non-empty, hashable keys."""
    if not isinstance(v, dict) or len(v) == 0:
        return False
    try:
        sample = list(v.values())[:5]
        if not sample:
            return False
        for x in sample:
            if not isinstance(x, (list, set, tuple, _DSVPArray)):
                return False
        # keys should be simple hashables (int/str), not objects
        for k in list(v.keys())[:5]:
            if not isinstance(k, (int, str)):
                return False
        return True
    except Exception:
        return False


def _is_visited_like(v):
    return isinstance(v, (set, frozenset)) or (
        isinstance(v, dict) and all(isinstance(x, bool) for x in list(v.values())[:5])
    ) or isinstance(v, _DSVPArray)


def _is_frontier_like(v):
    if isinstance(v, _DSVPArray):
        return True
    if isinstance(v, list):
        return True
    # collections.deque
    if type(v).__name__ == 'deque':
        return True
    return False


def _is_graph_adj_list(v):
    """list/_DSVPArray of lists/sets, index-addressed: outer[i] = neighbors of
    node i. Conservative on purpose (this is the biggest false-positive risk
    in graph auto-detection): every inner value must be a plain int in
    [0, len(outer)) — i.e. a plausible node id into the SAME outer list — and
    at least one inner collection must be non-empty. This rejects an
    unrelated jagged/2D list (e.g. a DP table or matrix of arbitrary ints)
    almost always, since those values are rarely all valid self-indices."""
    if isinstance(v, _DSVPArray):
        items = list(v._d)
    elif isinstance(v, list):
        items = v
    else:
        return False
    n = len(items)
    if n < 2:
        return False
    any_edge = False
    all_values = set()
    all_same_length = True
    for inner in items:
        if isinstance(inner, _DSVPArray):
            inner_list = list(inner._d)
        elif isinstance(inner, (list, set, tuple)):
            inner_list = list(inner)
        else:
            return False
        if len(inner_list) != n:
            all_same_length = False
        for x in inner_list:
            if not isinstance(x, int) or isinstance(x, bool) or x < 0 or x >= n:
                return False
            all_values.add(x)
        if inner_list:
            any_edge = True
    # A freshly-initialized matrix/2D-array (e.g. `[[0]*cols for _ in
    # range(rows)]`) is indistinguishable from a real adjacency list by
    # shape alone — every "neighbor" happens to be a valid in-range index
    # because they're all the same placeholder value (usually 0). Real
    # adjacency lists reference more than one distinct node id across the
    # structure, so reject the single-distinct-value case as a false
    # positive rather than a graph.
    if len(all_values) < 2:
        return False
    # Real adjacency lists are built one node at a time and are almost
    # always jagged (each node has its own neighbor count) — an n×n matrix
    # where every row happens to have exactly n entries (a square matrix
    # being filled cell-by-cell, e.g. a DP table or grid) is far more
    # likely than a complete graph with exactly n neighbors per node, so
    # reject the perfectly-rectangular case too.
    if all_same_length:
        return False
    return any_edge


def _graph_adj_pairs(adj):
    """Yield (node_id, [neighbor,...]) for either a dict-shaped or
    list-shaped adjacency structure, so downstream code doesn't care which."""
    if isinstance(adj, dict):
        for u, nbrs in adj.items():
            yield u, _dsvp_plain_list(nbrs)
    else:
        items = list(adj._d) if isinstance(adj, _DSVPArray) else adj
        for i, nbrs in enumerate(items):
            yield i, _dsvp_plain_list(nbrs)


def _graph_adj_nodes(adj):
    if isinstance(adj, dict):
        return sorted(adj.keys(), key=lambda k: str(k))
    items = list(adj._d) if isinstance(adj, _DSVPArray) else adj
    return list(range(len(items)))


def _find_graph_adj(frame_locals):
    for k, v in frame_locals.items():
        if _is_graph_adj_dict(v):
            return k, v
    for k, v in frame_locals.items():
        if _is_graph_adj_list(v):
            return k, v
    return None, None


def _find_visited(frame_locals, adj_keys):
    # Prefer a variable literally named 'visited', else any set/bool-dict
    # whose contents are a subset of the graph's node ids.
    best = None
    for k, v in frame_locals.items():
        if not _is_visited_like(v):
            continue
        if k == 'visited':
            return k, v
        if best is None:
            best = (k, v)
    return best if best else (None, None)


def _find_frontier(frame_locals, exclude_names):
    for name in ('queue', 'q', 'stack', 'frontier', 'to_visit', 'dq'):
        v = frame_locals.get(name)
        if v is not None and name not in exclude_names and _is_frontier_like(v):
            return name, v
    return None, None


def _emit_graph(op, active_id, adj, visited, frontier, desc):
    nodes = _graph_adj_nodes(adj)
    edges = []
    for u, nbrs in _graph_adj_pairs(adj):
        for w in nbrs:
            edges.append({"from": u, "to": w})
    _write({
        "op": op,
        "nodes": [{"id": n} for n in nodes],
        "edges": edges,
        "visited": _dsvp_plain_list(visited) if visited is not None else [],
        "frontier": _dsvp_plain_list(frontier) if frontier is not None else [],
        "activeId": active_id,
        "desc": desc,
    })


def _detect_and_emit_graph(frame, changed):
    global _GRAPH_ADJ, _GRAPH_ADJ_ID, _GRAPH_LAST_VISITED, _GRAPH_LAST_FRONTIER, \
        _GRAPH_SEEN_INIT, _GRAPH_LAST_EDGE_KEY

    fl = frame.f_locals
    adj_name, adj = _find_graph_adj(fl)
    if adj is None:
        return

    if id(adj) != _GRAPH_ADJ_ID:
        _GRAPH_ADJ_ID = id(adj)
        _GRAPH_ADJ = adj
        _GRAPH_LAST_VISITED = None
        _GRAPH_LAST_FRONTIER = None
        _GRAPH_SEEN_INIT = False
        _GRAPH_LAST_EDGE_KEY = None

    visited_name, visited = _find_visited(fl, {adj_name})
    frontier_name, frontier = _find_frontier(fl, {adj_name, visited_name or ''})

    edge_key = tuple(sorted(
        (u, w) for u, nbrs in _graph_adj_pairs(adj) for w in nbrs
    ))

    if not _GRAPH_SEEN_INIT:
        _GRAPH_SEEN_INIT = True
        _GRAPH_LAST_EDGE_KEY = edge_key
        _emit_graph("graph_init", None, adj, visited, frontier, f"Graph {adj_name} initialized ({len(_graph_adj_nodes(adj))} nodes)")
        return

    visited_list = _dsvp_plain_list(visited) if visited is not None else []
    frontier_list = _dsvp_plain_list(frontier) if frontier is not None else []
    structure_changed = edge_key != _GRAPH_LAST_EDGE_KEY
    traversal_changed = visited_list != _GRAPH_LAST_VISITED or frontier_list != _GRAPH_LAST_FRONTIER

    if not structure_changed and not traversal_changed:
        return

    # Structural change (a node/edge was added, e.g. `adj[u].append(w)` or
    # `adj[u] = [...]`) — surfaced as its OWN step, independent of
    # visited/frontier, so building the graph animates edge-by-edge instead
    # of the whole structure silently assembling off-screen and only
    # appearing, already complete, the instant traversal begins.
    if structure_changed and not traversal_changed:
        prev_edges = set(_GRAPH_LAST_EDGE_KEY or ())
        new_edges = [e for e in edge_key if e not in prev_edges]
        _GRAPH_LAST_EDGE_KEY = edge_key
        if new_edges:
            u, w = new_edges[-1]
            _emit_graph("graph_build", w, adj, visited, frontier, f"Added edge {u} -> {w}")
        else:
            _emit_graph("graph_build", None, adj, visited, frontier, f"Graph {adj_name} updated")
        return

    _GRAPH_LAST_EDGE_KEY = edge_key

    # Determine "active" node: newest addition to visited, else front/top of frontier
    active = None
    if _GRAPH_LAST_VISITED is not None:
        newly = [x for x in visited_list if x not in _GRAPH_LAST_VISITED]
        if newly:
            active = newly[-1]
    if active is None and visited_list and _GRAPH_LAST_VISITED is None:
        active = visited_list[-1]
    if active is None and frontier_list:
        active = frontier_list[0]

    _GRAPH_LAST_VISITED = visited_list
    _GRAPH_LAST_FRONTIER = frontier_list

    desc = f"Visit {active}" if active is not None else "Traversal step"
    _emit_graph("graph_step", active, adj, visited_list, frontier_list, desc)


# ── AST transformer ───────────────────────────────────────────────────────────

class _DSVPTransformer(ast.NodeTransformer):
    """
    Rewrites user AST so that:

    1. x = [...]         →  x = _dsvp_make([...])
    2. x = list(...)     →  x = _dsvp_make(list(...))
    3. x = [v] * n       →  x = _dsvp_make([v] * n)
    4. a[i] = v          →  _dsvp_set(a, i, v)
    5. a[i],a[j]=a[j],a[i]  →  _dsvp_swap(a, i, j)   (when same array, const idx)
    6. a[i] > a[j]  (in if/while condition with same arr)
                         →  (_dsvp_compare(a,i,j), a[i] > a[j])[1]
    """

    def visit_Assign(self, node):
        self.generic_visit(node)

        if (isinstance(node.targets[0], ast.Tuple) and
                isinstance(node.value, ast.Tuple) and
                len(node.targets[0].elts) == 2 and
                len(node.value.elts) == 2):
            lhs = node.targets[0].elts
            rhs = node.value.elts
            if (self._is_subscript(lhs[0]) and self._is_subscript(lhs[1]) and
                    self._is_subscript(rhs[0]) and self._is_subscript(rhs[1])):
                l0, l1 = lhs
                r0, r1 = rhs
                if (self._same_name(l0.value, l1.value) and
                        self._same_name(l0.value, r0.value) and
                        self._same_name(l0.value, r1.value)):
                    if (self._ast_eq(l0.slice, r1.slice) and
                            self._ast_eq(l1.slice, r0.slice)):
                        return ast.Expr(
                            value=ast.Call(
                                func=ast.Name(id="_dsvp_swap", ctx=ast.Load()),
                                args=[l0.value, l0.slice, l1.slice],
                                keywords=[],
                            )
                        )

        if (len(node.targets) == 1 and
                isinstance(node.targets[0], ast.Name)):
            val = node.value
            if self._is_2d_list_like(val):
                node.value = ast.Call(
                    func=ast.Name(id="_dsvp_make2d", ctx=ast.Load()),
                    args=[val],
                    keywords=[],
                )
            elif self._is_list_like(val):
                node.value = ast.Call(
                    func=ast.Name(id="_dsvp_make", ctx=ast.Load()),
                    args=[val],
                    keywords=[],
                )
            return node

        return node

    def visit_AugAssign(self, node):
        self.generic_visit(node)
        return node

    def visit_AnnAssign(self, node):
        self.generic_visit(node)
        if node.value and self._is_list_like(node.value):
            node.value = ast.Call(
                func=ast.Name(id="_dsvp_make", ctx=ast.Load()),
                args=[node.value],
                keywords=[],
            )
        return node

    def visit_Expr(self, node):
        self.generic_visit(node)
        return node

    def visit_If(self, node):
        node = self.generic_visit(node)
        node.test = self._maybe_inject_compare(node.test)
        return node

    def visit_While(self, node):
        node = self.generic_visit(node)
        node.test = self._maybe_inject_compare(node.test)
        return node

    def _maybe_inject_compare(self, test_node):
        if not isinstance(test_node, ast.Compare):
            return test_node
        left = test_node.left
        if not (len(test_node.comparators) == 1):
            return test_node
        right = test_node.comparators[0]
        if (self._is_subscript(left) and self._is_subscript(right) and
                self._same_name(left.value, right.value)):
            cmp_call = ast.Call(
                func=ast.Name(id="_dsvp_compare", ctx=ast.Load()),
                args=[left.value, left.slice, right.slice],
                keywords=[],
            )
            injected = ast.BoolOp(
                op=ast.Or(),
                values=[cmp_call, ast.Constant(value=True)],
            )
            return ast.BoolOp(
                op=ast.And(),
                values=[injected, test_node],
            )
        return test_node

    def _is_list_like(self, node):
        if isinstance(node, ast.List):
            return True
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mult):
            return True
        if (isinstance(node, ast.Call) and
                isinstance(node.func, ast.Name) and
                node.func.id in ("list", "sorted")):
            return True
        return False

    def _is_2d_list_like(self, node):
        """Detects a 2D-array literal/comprehension so it gets wrapped as a
        _DSVPGrid instead of a flat _DSVPArray, e.g.:
            grid = [[0] * cols for _ in range(rows)]
            grid = [[1, 2], [3, 4]]
        """
        def _row_like(elt):
            return (isinstance(elt, (ast.List, ast.ListComp)) or
                    (isinstance(elt, ast.BinOp) and isinstance(elt.op, ast.Mult)))

        if isinstance(node, ast.List):
            return bool(node.elts) and all(_row_like(e) for e in node.elts)
        if isinstance(node, ast.ListComp):
            return _row_like(node.elt)
        return False

    def _is_subscript(self, node):
        return isinstance(node, ast.Subscript)

    def _same_name(self, a, b):
        return isinstance(a, ast.Name) and isinstance(b, ast.Name) and a.id == b.id

    def _same_slice(self, a, b):
        if isinstance(a, ast.Name) and isinstance(b, ast.Name):
            return a.id == b.id
        if isinstance(a, ast.Constant) and isinstance(b, ast.Constant):
            return a.value == b.value
        return False

    def _ast_eq(self, a, b):
        return ast.dump(a) == ast.dump(b)


# ── Main entry ────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python_instrumenter.py <user_code_file>", file=sys.stderr)
        sys.exit(1)

    user_file = sys.argv[1]
    with open(user_file, "r", encoding="utf-8") as f:
        source = f.read()

    try:
        tree = ast.parse(source, filename="<user_code>")
    except SyntaxError as e:
        print(f"SyntaxError: {e.msg} (line {e.lineno})", file=sys.stderr)
        sys.exit(1)

    transformer = _DSVPTransformer()
    new_tree = transformer.visit(tree)
    ast.fix_missing_locations(new_tree)

    try:
        code_obj = compile(new_tree, "<user_code>", "exec")
    except Exception as e:
        print(f"CompileError: {e}", file=sys.stderr)
        sys.exit(1)

    namespace = {
        "__name__": "__main__",
        "_emit":          _emit,
        "_DSVPArray":     _DSVPArray,
        "_dsvp_make":     _dsvp_make,
        "_dsvp_set":      _dsvp_set,
        "_dsvp_swap":     _dsvp_swap,
        "_dsvp_compare":  _dsvp_compare,
        "_dsvp_read":     _dsvp_read,
        "Array":          Array,
        "_DSVPGrid":      _DSVPGrid,
        "_dsvp_make2d":   _dsvp_make2d,
        "HashTable":      HashTable,
        "_DSVPHashTable": _DSVPHashTable,
        # LL helpers (auto-detection — no explicit import needed by user)
        "_LL_REGISTRY":   _LL_REGISTRY,
        "_LL_HEADS":      _LL_HEADS,
        "_patch_node_class": _patch_node_class,
        "_emit_ll":       _emit_ll,
        "_is_node_like":  _is_node_like,
        "_LL_PATCHED_CLASSES": _LL_PATCHED_CLASSES,
        # BST helpers (auto-detection — no explicit import needed by user)
        "_BST_REGISTRY":  _BST_REGISTRY,
        "_patch_tree_node_class": _patch_tree_node_class,
        "_emit_bst":      _emit_bst,
        "_is_tree_node_like": _is_tree_node_like,
        "_BST_PATCHED_CLASSES": _BST_PATCHED_CLASSES,
    }

    source_lines = source.splitlines()
    tracer = _make_tracer(source_lines)
    try:
        sys.settrace(tracer)
        exec(code_obj, namespace)
    except SystemExit:
        pass
    except Exception as e:
        sys.settrace(None)
        tb = traceback.extract_tb(sys.exc_info()[2])
        user_frame = None
        for frame in reversed(tb):
            if frame.filename == "<user_code>":
                user_frame = frame
                break
        if user_frame:
            print(
                f"{type(e).__name__}: {e}\n"
                f"  File \"<user_code>\", line {user_frame.lineno}",
                file=sys.stderr,
            )
        else:
            print(f"{type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        sys.settrace(None)


if __name__ == "__main__":
    main()