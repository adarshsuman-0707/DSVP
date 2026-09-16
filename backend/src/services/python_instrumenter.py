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
    r = repr(val)
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
    payload["step"] = _next_step()
    sys.stdout.write("DSVP_TRACE:" + json.dumps(payload, default=str) + "\n")
    sys.stdout.flush()


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
            if not _is_node_like(v):
                return v
    return '?'

def _snapshot_chain(head, max_nodes=64):
    """
    Walk a linked list from head, return list of dicts:
      [{"id": <int>, "val": <any>, "nextId": <int|null>, "isHead": <bool>}, ...]
    Stops after max_nodes to prevent infinite loops.
    """
    nodes = []
    seen  = set()
    cur   = head
    first = True
    while cur is not None and id(cur) not in seen and len(nodes) < max_nodes:
        seen.add(id(cur))
        nxt   = getattr(cur, 'next', None)
        # Handle doubly-linked list — skip if nxt is a prev-only ref
        nodes.append({
            "id":     id(cur),
            "val":    _node_val(cur),
            "nextId": id(nxt) if nxt is not None else None,
            "isHead": first,
        })
        first = False
        cur   = nxt
    return nodes

def _find_heads(registry):
    """
    Nodes that are not pointed to by any other node's 'next' — likely heads.
    Returns list of node objects.
    """
    pointed_at = set()
    for node in registry.values():
        nxt = getattr(node, 'next', None)
        if nxt is not None:
            pointed_at.add(id(nxt))
    return [n for nid, n in registry.items() if nid not in pointed_at]

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
            if self._is_list_like(val):
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
        # LL helpers (auto-detection — no explicit import needed by user)
        "_LL_REGISTRY":   _LL_REGISTRY,
        "_LL_HEADS":      _LL_HEADS,
        "_patch_node_class": _patch_node_class,
        "_emit_ll":       _emit_ll,
        "_is_node_like":  _is_node_like,
        "_LL_PATCHED_CLASSES": _LL_PATCHED_CLASSES,
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