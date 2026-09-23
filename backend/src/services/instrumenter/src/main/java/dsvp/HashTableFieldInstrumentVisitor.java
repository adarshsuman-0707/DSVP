package dsvp;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.ConstructorDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.ArrayType;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.PrimitiveType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Structurally detects hand-rolled hash table classes WITHOUT requiring the
 * user to type "HashMap"/"Hashtable"/"HashTable" anywhere — the analogue of
 * LinkedListInstrumentVisitor/StackFieldInstrumentVisitor/
 * QueueFieldInstrumentVisitor for hash tables.
 *
 * Two shapes are recognized:
 *
 *  1. Separate-chaining: a class with a field `Node[] table` where Node is a
 *     self-referential class (has a field of its own type, e.g. `next`) plus
 *     a `key` field and a value-ish field (value/val/data).
 *
 *  2. Direct-address: a class with a plain `int[]`/`Integer[]`/`Object[]`/
 *     `String[]` field (no Node involved) indexed directly by an int key.
 *
 * Rather than trying to statically re-derive what "found"/"value" mean from
 * the user's own control flow (which varies endlessly), this pass only
 * determines WHERE to hook (the array field, and — per put/get/remove-ish
 * method — the index expression already used against that field, and the
 * key parameter) and delegates the actual snapshot + found/val computation
 * to a reflective helper, DSVPHash.emit(...), added to RuntimeShim.SOURCE
 * (always present, like DSVPArray). This is far more robust than trying to
 * pattern-match every possible way a student writes "found" logic.
 *
 * Conservative by design: a class is only touched when exactly one array
 * field of a supported shape exists and at least one put/get/remove-ish
 * method can locate an access against it; anything ambiguous is left alone.
 */
public class HashTableFieldInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private static final class NodeInfo {
        final String className;
        final String nextField;
        final String keyField;
        final String valField;
        NodeInfo(String className, String nextField, String keyField, String valField) {
            this.className = className; this.nextField = nextField;
            this.keyField = keyField; this.valField = valField;
        }
    }

    @Override
    public void visit(CompilationUnit cu, Void arg) {
        Map<String, NodeInfo> nodeClasses = new HashMap<>();
        for (ClassOrInterfaceDeclaration cls : cu.findAll(ClassOrInterfaceDeclaration.class)) {
            NodeInfo ni = detectNodeClass(cls);
            if (ni != null) nodeClasses.put(cls.getNameAsString(), ni);
        }

        for (ClassOrInterfaceDeclaration cls : cu.findAll(ClassOrInterfaceDeclaration.class)) {
            if (nodeClasses.containsKey(cls.getNameAsString())) continue; // don't instrument Node classes themselves
            processClass(cls, nodeClasses);
        }
    }

    /** A self-referential class: has a field of its own type (chain pointer) plus a "key" field and a value-ish field. */
    private NodeInfo detectNodeClass(ClassOrInterfaceDeclaration cls) {
        String selfRef = null, keyField = null, valField = null;
        for (FieldDeclaration f : cls.getFields()) {
            for (VariableDeclarator vd : f.getVariables()) {
                Type t = vd.getType();
                String name = vd.getNameAsString();
                if (t instanceof ClassOrInterfaceType && ((ClassOrInterfaceType) t).getNameAsString().equals(cls.getNameAsString())) {
                    if (selfRef != null) return null; // ambiguous
                    selfRef = name;
                } else if (name.equalsIgnoreCase("key")) {
                    keyField = name;
                } else if (name.equalsIgnoreCase("value") || name.equalsIgnoreCase("val") || name.equalsIgnoreCase("data")) {
                    valField = name;
                }
            }
        }
        if (selfRef == null || keyField == null) return null;
        return new NodeInfo(cls.getNameAsString(), selfRef, keyField, valField);
    }

    private void processClass(ClassOrInterfaceDeclaration cls, Map<String, NodeInfo> nodeClasses) {
        FieldDeclaration tableField = null;
        NodeInfo nodeInfo = null; // non-null => chaining mode
        boolean direct = false;
        int candidateCount = 0;

        for (FieldDeclaration f : cls.getFields()) {
            if (f.getVariables().size() != 1) continue;
            VariableDeclarator vd = f.getVariable(0);
            if (!(vd.getType() instanceof ArrayType)) continue;
            ArrayType at = (ArrayType) vd.getType();
            Type comp = at.getComponentType();
            if (comp instanceof ClassOrInterfaceType) {
                NodeInfo ni = nodeClasses.get(((ClassOrInterfaceType) comp).getNameAsString());
                if (ni == null) continue;
                candidateCount++;
                tableField = f; nodeInfo = ni; direct = false;
            } else if (comp instanceof PrimitiveType && ((PrimitiveType) comp).getType() == PrimitiveType.Primitive.INT) {
                candidateCount++;
                tableField = f; direct = true;
            } else if (comp instanceof ClassOrInterfaceType) {
                // unreachable (handled above) — kept for clarity
            }
        }
        // Second sweep for boxed/reference direct-address component types (Integer/Object/String),
        // only counted if we didn't already find a chaining/primitive candidate.
        if (tableField == null) {
            for (FieldDeclaration f : cls.getFields()) {
                if (f.getVariables().size() != 1) continue;
                VariableDeclarator vd = f.getVariable(0);
                if (!(vd.getType() instanceof ArrayType)) continue;
                ArrayType at = (ArrayType) vd.getType();
                Type comp = at.getComponentType();
                if (comp instanceof ClassOrInterfaceType) {
                    String n = ((ClassOrInterfaceType) comp).getNameAsString();
                    if (n.equals("Integer") || n.equals("Object") || n.equals("String")) {
                        candidateCount++;
                        tableField = f; direct = true;
                    }
                }
            }
        }

        if (tableField == null || candidateCount != 1) return; // none or ambiguous

        String tableName = tableField.getVariable(0).getNameAsString();
        String mode = direct ? "direct" : "chaining";
        String nextField = direct ? null : nodeInfo.nextField;
        String keyField = direct ? null : nodeInfo.keyField;
        String valField = direct ? null : nodeInfo.valField;

        boolean anyHooked = false;

        for (ConstructorDeclaration c : cls.getConstructors()) {
            if (!bodyMentionsArray(c.getBody(), tableName)) continue;
            c.getBody().addStatement(buildEmitCall("hash_init", tableName, nextField, keyField, valField,
                new IntegerLiteralExpr("-1"), new NullLiteralExpr(), mode));
            anyHooked = true;
        }

        for (MethodDeclaration m : cls.getMethods()) {
            if (m.getParameters().isEmpty() || !m.getBody().isPresent()) continue;
            String op = classifyOp(m.getNameAsString());
            if (op == null) continue;

            BlockStmt body = m.getBody().get();
            ArrayAccessExpr accessTemplate = findArrayAccess(body, tableName);
            if (accessTemplate == null) continue;

            Parameter keyParam = m.getParameters().get(0);
            NameExpr keyExpr = new NameExpr(keyParam.getNameAsString());

            // If the body's last top-level statement is already a return, every
            // control path terminates there — appending a fall-through emit
            // after it would be unreachable (javac error). Only append the
            // fall-through hook when the method can actually run off the end
            // (e.g. a void remove() whose search loop just doesn't find the key).
            boolean endsWithReturn = !body.getStatements().isEmpty()
                && body.getStatements().get(body.getStatements().size() - 1) instanceof ReturnStmt;

            // Hook every return statement (state is already mutated by then) ...
            for (ReturnStmt rs : new ArrayList<>(body.findAll(ReturnStmt.class))) {
                BlockStmt block = new BlockStmt();
                block.addStatement(buildEmitCall(op, tableName, nextField, keyField, valField,
                    accessTemplate.getIndex().clone(), keyExpr.clone(), mode));
                block.addStatement(rs.clone());
                rs.replace(block);
            }
            // ... and also the fall-through path (void methods / no explicit return reached).
            if (!endsWithReturn) {
                body.addStatement(buildEmitCall(op, tableName, nextField, keyField, valField,
                    accessTemplate.getIndex().clone(), keyExpr.clone(), mode));
            }
            anyHooked = true;
        }

        if (anyHooked) didRewrite = true;
    }

    private boolean didRewrite = false;
    public boolean didRewrite() { return didRewrite; }

    private boolean bodyMentionsArray(BlockStmt body, String arrName) {
        return body.findAll(NameExpr.class).stream().anyMatch(n -> n.getNameAsString().equals(arrName));
    }

    private ArrayAccessExpr findArrayAccess(BlockStmt body, String arrName) {
        for (ArrayAccessExpr aae : body.findAll(ArrayAccessExpr.class)) {
            if (aae.getName() instanceof NameExpr && ((NameExpr) aae.getName()).getNameAsString().equals(arrName)) {
                return aae;
            }
        }
        return null;
    }

    private String classifyOp(String methodName) {
        String n = methodName.toLowerCase();
        if (n.contains("put") || n.contains("insert") || n.contains("add") || n.equals("set")) return "hash_put";
        if (n.contains("get") || n.contains("find") || n.contains("search") || n.contains("lookup")) return "hash_get";
        if (n.contains("remove") || n.contains("delete")) return "hash_remove";
        return null;
    }

    /** DSVPHash.emit(op, table, nextFieldLiteralOrNull, keyFieldLiteralOrNull, valFieldLiteralOrNull, idx, key, mode); */
    private Statement buildEmitCall(String op, String tableName, String nextField, String keyField, String valField,
                                     Expression idxExpr, Expression keyExpr, String mode) {
        Expression nextArg = nextField == null ? new NullLiteralExpr() : new StringLiteralExpr(nextField);
        Expression keyArg = keyField == null ? new NullLiteralExpr() : new StringLiteralExpr(keyField);
        Expression valArg = valField == null ? new NullLiteralExpr() : new StringLiteralExpr(valField);

        MethodCallExpr call = new MethodCallExpr(new NameExpr("DSVPHash"), "emit",
            new NodeList<>(
                new StringLiteralExpr(op),
                new NameExpr(tableName),
                nextArg, keyArg, valArg,
                idxExpr,
                keyExpr,
                new StringLiteralExpr(mode)));
        return new ExpressionStmt(call);
    }
}
