"""
DSVP Heap Tracer (Python)
─────────────────────────
Usage:  python heap_instrumenter.py <user_code_file>

Runs the user's own program and reports what it does to list-based
(array-backed) heaps as language-neutral primitive events on stderr
(`DSVP_TRACE:<json>` lines; stdout stays the program's own output):

  hp_new / hp_set / hp_rs   list creation, element writes, append/pop/...
  hp_cmp                    ordering comparisons (< <= > >=) involving a heap element
  hp_sc                     integer attribute updates (a possible logical-size counter)
  hp_call / hp_ret          user function entry/exit with return value (AST-wrapped, no profiler)

How it observes the program, with no assumption about any name:
  * every list the program creates becomes a thin `list` subclass (_HL) that
    reports mutations. Reads are remembered (provenance) so a comparison of a
    value that came out of the array can be attributed to the right index.
  * ordering comparisons are rewritten at the AST level to report operands.
  * `heapq` is replaced by a traced, textbook implementation (clearly marked
    in the UI); everything else is the user's code, unchanged.

SAFETY NOTE: an audit hook blocks sockets, subprocesses, ctypes and file
access outside the run's temp directory. That is defense in depth for a
Python process, NOT a sandbox — see docs/heap-module.md.
"""

import sys
import ast
import json
import os
import traceback
import operator
import collections
import atexit

_LIMIT_BYTES = int(os.environ.get('DSVP_HEAP_MAX_TRACE_BYTES', str(12 * 1024 * 1024)))
_LIMIT_EVENTS = int(os.environ.get('DSVP_HEAP_MAX_RAW_EVENTS', '40000'))
_STDOUT_CAP = int(os.environ.get('DSVP_MAX_OUTPUT_BYTES', str(1024 * 1024)))
_SNAP_MAX = 256

_bytes = [0]
_count = [0]
_truncated = [False]
# Trace channel: the real stderr, but block-buffered (one syscall per ~64 KB instead of per event).
# Exceptions are printed through sys.stderr after a flush, so ordering of lines never matters to the parser.
_user_stderr = open(2, 'w', buffering=1 << 16, encoding='utf-8', closefd=False)
atexit.register(_user_stderr.flush)


# ── output helpers ───────────────────────────────────────────────────────────

def _jv(v, depth=0):
    """JSON-safe, bounded rendering of one element."""
    if v is None or isinstance(v, bool):
        return v
    if isinstance(v, int):
        return v if abs(v) < 2 ** 53 else str(v)
    if isinstance(v, float):
        return v if v == v and v not in (float('inf'), float('-inf')) else str(v)
    if isinstance(v, str):
        return v if len(v) <= 40 else v[:37] + '...'
    if isinstance(v, (tuple, list)) and depth < 2:
        return [_jv(x, depth + 1) for x in list(v)[:6]]
    r = repr(v)
    return r if len(r) <= 40 else r[:37] + '...'


def _snap(lst):
    return [_jv(x) for x in list.__iter__(lst)][:_SNAP_MAX] if isinstance(lst, list) else []


def _w(payload):
    if _truncated[0]:
        return
    if _count[0] >= _LIMIT_EVENTS or _bytes[0] >= _LIMIT_BYTES:
        _truncated[0] = True
        _user_stderr.write('DSVP_TRACE:{"op":"hp_trunc"}\n')
        return
    s = 'DSVP_TRACE:' + json.dumps(payload, default=str, separators=(',', ':')) + '\n'
    _bytes[0] += len(s)
    _count[0] += 1
    _user_stderr.write(s)


def _ln():
    f = sys._getframe(1)
    while f is not None:
        if f.f_code.co_filename == '<user_code>':
            return f.f_lineno
        f = f.f_back
    return None


# ── array identity ───────────────────────────────────────────────────────────

_aid_seq = [0]
_PLAIN_IDS = {}   # id(plain list) -> (aid, seen, ref)  (heapq on lists we did not wrap)


class _HL(list):
    """A list that reports its mutations."""
    __slots__ = ('_aid', '_seen')

    def __init__(self, it=()):
        list.__init__(self, it)
        _aid_seq[0] += 1
        self._aid = _aid_seq[0]
        self._seen = False

    # reads (provenance only; no event)
    def __getitem__(self, i):
        v = list.__getitem__(self, i)
        if isinstance(i, slice):
            return _HL(v)
        if isinstance(i, int):
            _RECENT.append((self, i if i >= 0 else i + len(self), v))
        return v

    def __setitem__(self, i, v):
        if _truncated[0]:
            return list.__setitem__(self, i, v)
        if isinstance(i, slice):
            _reg(self)
            list.__setitem__(self, i, v)
            _rs(self, 'replace', None, None)
            return
        _reg(self)
        idx = i if i >= 0 else i + len(self)
        old = list.__getitem__(self, i)          # IndexError propagates untouched
        list.__setitem__(self, i, v)
        _w({'op': 'hp_set', 'a': self._aid, 'i': idx, 'old': _jv(old), 'v': _jv(v),
            'snap': _snap(self), 'len': len(self), 'line': _ln()})

    def __delitem__(self, i):
        _reg(self)
        if isinstance(i, slice):
            list.__delitem__(self, i)
            _rs(self, 'replace', None, None)
        else:
            idx = i if i >= 0 else i + len(self)
            v = list.__getitem__(self, i)
            list.__delitem__(self, i)
            _rs(self, 'del', idx, v)

    def append(self, v):
        if _truncated[0]:
            return list.append(self, v)
        _reg(self)
        list.append(self, v)
        _rs(self, 'append', len(self) - 1, v)

    def insert(self, i, v):
        _reg(self)
        list.insert(self, i, v)
        idx = max(0, i + len(self) - 1) if i < 0 else min(i, len(self) - 1)
        _rs(self, 'insert', idx, v)

    def pop(self, i=-1):
        if _truncated[0]:
            return list.pop(self, i)
        _reg(self)
        idx = i if i >= 0 else i + len(self)
        v = list.pop(self, i)
        _rs(self, 'pop', idx, v)
        return v

    def remove(self, v):
        _reg(self)
        idx = list.index(self, v)
        list.remove(self, v)
        _rs(self, 'remove', idx, v)

    def extend(self, it):
        _reg(self)
        list.extend(self, it)
        _rs(self, 'extend', None, None)

    def __iadd__(self, it):
        self.extend(it)
        return self

    def clear(self):
        _reg(self)
        list.clear(self)
        _rs(self, 'clear', None, None)

    def sort(self, *a, **k):
        _reg(self)
        list.sort(self, *a, **k)
        _rs(self, 'sort', None, None)

    def reverse(self):
        _reg(self)
        list.reverse(self)
        _rs(self, 'reverse', None, None)

    # new lists stay traced
    def copy(self):
        return _HL(list.copy(self))

    def __add__(self, o):
        return _HL(list.__add__(self, o))

    def __mul__(self, n):
        return _HL(list.__mul__(self, n))

    __rmul__ = __mul__


def _meta(lst):
    """(aid, seen_flag_holder) for a traced or plain list."""
    if isinstance(lst, _HL):
        return lst._aid
    ent = _PLAIN_IDS.get(id(lst))
    if ent is None or ent[2] is not lst:
        _aid_seq[0] += 1
        ent = [_aid_seq[0], False, lst]
        _PLAIN_IDS[id(lst)] = ent
    return ent[0]


def _reg(lst):
    """Announce a list the first time the program does something heap-relevant with it."""
    if isinstance(lst, _HL):
        if lst._seen:
            return
        lst._seen = True
    else:
        _meta(lst)
        ent = _PLAIN_IDS[id(lst)]
        if ent[1]:
            return
        ent[1] = True
    _w({'op': 'hp_new', 'a': _meta(lst), 'k': 'list', 'snap': _snap(lst), 'len': len(lst), 'line': _ln()})


def _rs(lst, kind, idx, v):
    _w({'op': 'hp_rs', 'a': _meta(lst), 'k': kind, 'i': idx, 'v': _jv(v),
        'snap': _snap(lst), 'len': len(lst), 'line': _ln()})


def _hl(x):
    return _HL(x) if type(x) is list else x


_hw = _hl   # safety net for lists produced by library calls and then assigned


# ── comparison reporting ─────────────────────────────────────────────────────

_RECENT = collections.deque(maxlen=8)   # (list, index, value) of recent heap reads
_OPS = {'<': operator.lt, '<=': operator.le, '>': operator.gt, '>=': operator.ge}


class _Op:
    __slots__ = ('val', 'arr', 'idx', 'prov')

    def __init__(self, val, arr, idx, prov=False):
        self.val = val
        self.arr = arr
        self.idx = idx
        self.prov = prov


def _hv(v):
    return _Op(v, None, None)


def _hp(v):
    # operand is a name that the program assigned from an array element:
    # allow attributing it to the element it was most recently read from
    return _Op(v, None, None, True)


def _hs(container, key):
    r = container[key]
    if isinstance(container, _HL) and isinstance(key, int):
        return _Op(r, container, key if key >= 0 else key + len(container))
    return _Op(r, None, None)


def _provenance(o):
    """Find where a plain operand value was recently read from (most recent first)."""
    if o.arr is not None:
        return o.arr, o.idx
    if not o.prov:
        return None, None
    for arr, idx, val in reversed(_RECENT):
        if type(val) is type(o.val) and val == o.val and idx < len(arr) and list.__getitem__(arr, idx) == o.val:
            return arr, idx
    return None, None


def _hc(op, L, R):
    res = _OPS[op](L.val, R.val)
    if _truncated[0]:
        return res
    la, li = _provenance(L)
    ra, ri = _provenance(R)
    if la is not None or ra is not None:
        for a in (la, ra):
            if a is not None:
                _reg(a)
        _w({'op': 'hp_cmp',
            'la': _meta(la) if la is not None else None, 'li': li if la is not None else None,
            'ra': _meta(ra) if ra is not None else None, 'ri': ri if ra is not None else None,
            'lv': _jv(L.val), 'rv': _jv(R.val), 'o': op, 'r': bool(res), 'line': _ln()})
    return res


# ── integer attributes (possible logical-size counters) ──────────────────────

_last_sc = {}


def _hsc(obj, name):
    v = getattr(obj, name, None)
    if type(v) is not int:
        return
    key = (id(obj), name)
    if _last_sc.get(key) == v:
        return
    _last_sc[key] = v
    _w({'op': 'hp_sc', 'n': name, 'v': v, 'line': _ln()})


# ── call / return (the AST transform wraps every user function with _hcall / _hret) ──

_depth = [0]
_ret = [None]     # (value, line) of the most recent `return expr`


def _short(v):
    if isinstance(v, list):
        items = list(list.__iter__(v))
        inner = ', '.join(str(_jv(x)) for x in items[:8])
        return '[' + inner + (', ...' if len(items) > 8 else '') + ']'
    r = repr(v)
    return r if len(r) <= 40 else r[:37] + '...'


def _hcall(name, args, line):
    _ret[0] = None
    if _truncated[0]:
        _depth[0] += 1
        return
    _w({'op': 'hp_call', 'f': name, 'd': _depth[0], 'args': [_short(a) for a in args], 'line': line})
    _depth[0] += 1


def _hrv(value):
    _ret[0] = (value, _ln())
    return value


def _hret(name, end_line):
    _depth[0] -= 1
    ret, _ret[0] = _ret[0], None
    if _truncated[0]:
        return
    _w({'op': 'hp_ret', 'f': name, 'd': _depth[0], 'r': 'None' if ret is None else _short(ret[0]),
        'line': ret[1] if ret is not None and ret[1] else end_line})


# ── traced heapq (textbook algorithms; marked as a modelled library) ─────────

def _h_len(h):
    return len(h)


def _h_set(h, i, v):
    if isinstance(h, _HL):
        h[i] = v
    else:
        _reg(h)
        old = h[i]
        h[i] = v
        _w({'op': 'hp_set', 'a': _meta(h), 'i': i, 'old': _jv(old), 'v': _jv(v), 'snap': _snap(h), 'len': len(h), 'line': _ln()})


def _h_append(h, v):
    if isinstance(h, _HL):
        h.append(v)
    else:
        _reg(h)
        h.append(v)
        _rs(h, 'append', len(h) - 1, v)


def _h_pop(h):
    if isinstance(h, _HL):
        return h.pop()
    _reg(h)
    v = h.pop()
    _rs(h, 'pop', len(h), v)
    return v


def _h_less(h, i, j):
    """h[i] < h[j], reported."""
    a, b = h[i], h[j]
    res = a < b
    _reg(h)
    _w({'op': 'hp_cmp', 'la': _meta(h), 'li': i, 'ra': _meta(h), 'ri': j,
        'lv': _jv(a), 'rv': _jv(b), 'o': '<', 'r': bool(res), 'line': _ln()})
    return res


def _h_swap(h, i, j):
    a, b = h[i], h[j]
    _h_set(h, i, b)
    _h_set(h, j, a)


def _sift_up(h, pos):
    while pos > 0:
        parent = (pos - 1) >> 1
        if _h_less(h, pos, parent):
            _h_swap(h, pos, parent)
            pos = parent
        else:
            break


def _sift_down(h, pos, n):
    while True:
        left = 2 * pos + 1
        if left >= n:
            break
        smallest = left
        right = left + 1
        if right < n and _h_less(h, right, left):
            smallest = right
        if _h_less(h, smallest, pos):
            _h_swap(h, pos, smallest)
            pos = smallest
        else:
            break


class _TracedHeapq:
    """Drop-in for the heapq functions that mutate a heap list."""
    __name__ = 'heapq'

    def __init__(self):
        import importlib
        self._real = importlib.import_module('heapq')

    def heappush(self, heap, item):
        _h_append(heap, item)
        _sift_up(heap, len(heap) - 1)

    def heappop(self, heap):
        last = _h_pop(heap)
        if heap:
            ret = heap[0]
            _h_set(heap, 0, last)
            _sift_down(heap, 0, len(heap))
            return ret
        return last

    def heapify(self, x):
        n = len(x)
        for i in reversed(range(n // 2)):
            _sift_down(x, i, n)

    def heapreplace(self, heap, item):
        ret = heap[0]
        _h_set(heap, 0, item)
        _sift_down(heap, 0, len(heap))
        return ret

    def heappushpop(self, heap, item):
        if heap and heap[0] < item:
            item, heap[0] = heap[0], item
            _sift_down(heap, 0, len(heap))
        return item

    def __getattr__(self, name):
        return getattr(self._real, name)   # nlargest, nsmallest, merge, ...


# ── AST transform ────────────────────────────────────────────────────────────

def _call(name, args, node):
    c = ast.Call(func=ast.Name(id=name, ctx=ast.Load()), args=args, keywords=[])
    return ast.copy_location(c, node)


class _Transformer(ast.NodeTransformer):
    def __init__(self, tree):
        # names the program assigns directly from a subscript (value = a[i]) — only those
        # may inherit an array index when later compared
        self.heap_names = set()
        for n in ast.walk(tree):
            if isinstance(n, (ast.Assign, ast.AnnAssign)) and n.value is not None:
                targets = n.targets if isinstance(n, ast.Assign) else [n.target]
                for t in targets:
                    if isinstance(t, ast.Name) and isinstance(n.value, ast.Subscript):
                        self.heap_names.add(t.id)
                    elif (isinstance(t, (ast.Tuple, ast.List)) and isinstance(n.value, (ast.Tuple, ast.List))
                          and len(t.elts) == len(n.value.elts)):
                        for tt, vv in zip(t.elts, n.value.elts):
                            if isinstance(tt, ast.Name) and isinstance(vv, ast.Subscript):
                                self.heap_names.add(tt.id)

    def visit_List(self, node):
        self.generic_visit(node)
        if isinstance(node.ctx, ast.Load):
            return _call('_hl', [node], node)
        return node

    def visit_ListComp(self, node):
        self.generic_visit(node)
        return _call('_hl', [node], node)

    def visit_Call(self, node):
        self.generic_visit(node)
        if isinstance(node.func, ast.Name) and node.func.id in ('list', 'sorted'):
            return _call('_hl', [node], node)
        return node

    def _wrap_operand(self, x):
        if isinstance(x, ast.Subscript):
            sl = x.slice
            if hasattr(ast, 'Index') and isinstance(sl, ast.Index):   # Python 3.8
                sl = sl.value
            if not isinstance(sl, (ast.Slice, ast.ExtSlice)) and not isinstance(x.ctx, ast.Store):
                return _call('_hs', [x.value, sl], x)
        if isinstance(x, ast.Name) and x.id in self.heap_names:
            return _call('_hp', [x], x)
        return _call('_hv', [x], x)

    def visit_Compare(self, node):
        self.generic_visit(node)
        if len(node.ops) == 1 and isinstance(node.ops[0], (ast.Lt, ast.LtE, ast.Gt, ast.GtE)):
            sym = {ast.Lt: '<', ast.LtE: '<=', ast.Gt: '>', ast.GtE: '>='}[type(node.ops[0])]
            return _call('_hc', [ast.Constant(value=sym), self._wrap_operand(node.left),
                                 self._wrap_operand(node.comparators[0])], node)
        return node

    def _attr_followups(self, node, targets):
        extra = []
        for t in targets:
            if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name):
                extra.append(ast.copy_location(
                    ast.Expr(value=_call('_hsc', [ast.Name(id=t.value.id, ctx=ast.Load()), ast.Constant(value=t.attr)], node)),
                    node))
        return extra

    def visit_Assign(self, node):
        self.generic_visit(node)
        # catch lists that arrive from library calls (copy.copy, random.sample, ...)
        node.value = _call('_hw', [node.value], node.value)
        extra = self._attr_followups(node, node.targets)
        return [node] + extra if extra else node

    def visit_AugAssign(self, node):
        self.generic_visit(node)
        extra = self._attr_followups(node, [node.target])
        return [node] + extra if extra else node

    @staticmethod
    def _is_generator(fn):
        for n in ast.walk(fn):
            if isinstance(n, (ast.Yield, ast.YieldFrom)):
                return True
        return False

    def visit_FunctionDef(self, node):
        self.generic_visit(node)
        if (node.name.startswith('__') and node.name != '__init__') or self._is_generator(node):
            return node
        body = node.body
        doc = []
        if body and isinstance(body[0], ast.Expr) and isinstance(getattr(body[0], 'value', None), ast.Constant) \
                and isinstance(body[0].value.value, str):
            doc, body = [body[0]], body[1:]
        if not body:
            return node
        params = [a.arg for a in (node.args.posonlyargs + node.args.args + node.args.kwonlyargs)
                  if a.arg not in ('self', 'cls')]
        enter = ast.Expr(value=_call('_hcall', [
            ast.Constant(value=node.name),
            ast.List(elts=[ast.Name(id=p, ctx=ast.Load()) for p in params], ctx=ast.Load()),
            ast.Constant(value=node.lineno)], node))
        leave = ast.Expr(value=_call('_hret', [
            ast.Constant(value=node.name),
            ast.Constant(value=getattr(node, 'end_lineno', None) or node.lineno)], node))
        guarded = ast.copy_location(ast.Try(body=body, handlers=[], orelse=[], finalbody=[leave]), node)
        node.body = doc + [ast.copy_location(enter, node), guarded]
        return node

    def visit_Return(self, node):
        self.generic_visit(node)
        if node.value is not None:
            node.value = _call('_hrv', [node.value], node.value)
        return node

    def visit_AnnAssign(self, node):
        self.generic_visit(node)
        extra = self._attr_followups(node, [node.target]) if node.value is not None else []
        return [node] + extra if extra else node


# ── hardening (defense in depth, not a sandbox) ──────────────────────────────

_BLOCKED_IMPORTS = frozenset(['ctypes', '_ctypes', 'socket', '_socket', 'subprocess', '_posixsubprocess',
                              'multiprocessing', 'ssl', 'http', 'urllib', 'ftplib', 'smtplib', 'telnetlib'])
_BLOCKED_PREFIXES = ('socket.', 'subprocess.', 'os.exec', 'os.spawn', 'os.fork', 'os.system', 'os.posix_spawn',
                     'os.remove', 'os.rename', 'os.rmdir', 'os.mkdir', 'os.chmod', 'os.chown', 'os.link',
                     'os.symlink', 'os.truncate', 'os.kill', 'shutil.', 'ctypes.', 'webbrowser.', 'pty.',
                     'winreg.', 'msvcrt.')


def _install_audit_hook(workdir):
    allowed_read = [os.path.realpath(p) for p in {sys.prefix, sys.base_prefix, getattr(sys, 'exec_prefix', sys.prefix),
                                                  workdir, os.path.dirname(os.path.abspath(__file__))}]
    allowed_write = [os.path.realpath(workdir)]

    def under(path, roots):
        try:
            p = os.path.realpath(path)
        except Exception:
            return False
        return any(p == r or p.startswith(r + os.sep) for r in roots)

    def hook(event, args):
        if event == 'import' and args and str(args[0]).split('.')[0] in _BLOCKED_IMPORTS:
            raise PermissionError('import of %s is not allowed in DSVP heap runs' % args[0])
        if event.startswith(_BLOCKED_PREFIXES):
            raise PermissionError('%s is not allowed in DSVP heap runs' % event)
        if event == 'open':
            path, mode = args[0], args[1] if len(args) > 1 else None
            if isinstance(path, int):
                return
            writing = mode is not None and any(c in str(mode) for c in 'wax+')
            if writing and not under(path, allowed_write):
                raise PermissionError('writing files is not allowed in DSVP heap runs')
            if not writing and not under(path, allowed_read):
                raise PermissionError('reading files outside the run directory is not allowed in DSVP heap runs')

    sys.addaudithook(hook)


class _CappedOut:
    def __init__(self, real, cap):
        self._real, self._cap, self._n = real, cap, 0

    def write(self, s):
        self._n += len(s)
        if self._n > self._cap:
            raise RuntimeError('Output limit exceeded (%d bytes)' % self._cap)
        return self._real.write(s)

    def flush(self):
        self._real.flush()

    def __getattr__(self, n):
        return getattr(self._real, n)


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print('Usage: heap_instrumenter.py <user_code_file>', file=sys.stderr)
        sys.exit(1)
    path = sys.argv[1]
    with open(path, 'r', encoding='utf-8') as f:
        source = f.read()

    try:
        tree = ast.parse(source, filename='<user_code>')
    except SyntaxError as e:
        print('SyntaxError: %s (line %s)' % (e.msg, e.lineno), file=sys.stderr)
        sys.exit(1)

    new_tree = ast.fix_missing_locations(_Transformer(tree).visit(tree))
    try:
        code = compile(new_tree, '<user_code>', 'exec')
    except Exception as e:  # noqa: BLE001
        print('CompileError: %s' % e, file=sys.stderr)
        sys.exit(1)

    workdir = os.path.dirname(os.path.abspath(path))
    try:
        import resource   # POSIX only
        mb = int(os.environ.get('DSVP_MAX_PY_MB', '512')) * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mb, mb))
    except Exception:
        pass
    _install_audit_hook(workdir)
    sys.modules['heapq'] = _TracedHeapq()
    sys.stdout = _CappedOut(sys.stdout, _STDOUT_CAP)

    ns = {
        '__name__': '__main__', '__file__': '<user_code>',
        '_hl': _hl, '_hw': _hw, '_hs': _hs, '_hv': _hv, '_hp': _hp, '_hc': _hc, '_hsc': _hsc,
        '_hcall': _hcall, '_hret': _hret, '_hrv': _hrv,
    }
    try:
        exec(code, ns)
    except SystemExit:
        pass
    except BaseException as e:  # noqa: BLE001
        _user_stderr.flush()
        tb = traceback.extract_tb(sys.exc_info()[2])
        frame = next((fr for fr in reversed(tb) if fr.filename == '<user_code>'), None)
        if frame:
            print('%s: %s\n  File "<user_code>", line %s' % (type(e).__name__, e, frame.lineno), file=sys.stderr)
        else:
            print('%s: %s' % (type(e).__name__, e), file=sys.stderr)
        sys.exit(1)
    finally:
        _user_stderr.flush()


if __name__ == '__main__':
    main()
