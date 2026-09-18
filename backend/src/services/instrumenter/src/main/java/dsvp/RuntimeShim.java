package dsvp;

/**
 * The DSVPArray runtime class, printed verbatim above the instrumented
 * user code — identical in behavior to the JAVA_SHIM string that used to
 * live in compilerService.js, so traceGeneratorService.js needs ZERO
 * changes on the Node side.
 */
final class RuntimeShim {
    private RuntimeShim() {}

    static final String SOURCE = """
        import java.util.Iterator;
        import java.util.Arrays;
        class DSVPArray {
            private Object data;
            private String type;
            private int length;
            // Which source variable this instance came from (e.g. "arr1",
            // "arr2") - every trace event tags itself with this, so two
            // separately-declared arrays never collapse into a single
            // "last touched" display slot. Defaults to "" for the rare
            // internal/reflection path that never sets it explicitly.
            private String varName = "";

            // Constructors for different types
            DSVPArray(int size, String arrayType, String varName){
                this.type = arrayType;
                this.length = size;
                this.varName = varName;
                switch(arrayType) {
                    case "int": data = new int[size]; break;
                    case "long": data = new long[size]; break;
                    case "float": data = new float[size]; break;
                    case "double": data = new double[size]; break;
                    case "char": data = new char[size]; break;
                    case "String": data = new String[size]; break;
                }
                emitSnap("init",-1,"0");
            }

            DSVPArray(int[] vals, String varName){ data=vals; type="int"; length=vals.length; this.varName=varName; emitSnap("init",-1,"0"); }
            DSVPArray(long[] vals, String varName){ data=vals; type="long"; length=vals.length; this.varName=varName; emitSnap("init",-1,"0"); }
            DSVPArray(float[] vals, String varName){ data=vals; type="float"; length=vals.length; this.varName=varName; emitSnap("init",-1,"0"); }
            DSVPArray(double[] vals, String varName){ data=vals; type="double"; length=vals.length; this.varName=varName; emitSnap("init",-1,"0"); }
            DSVPArray(char[] vals, String varName){ data=vals; type="char"; length=vals.length; this.varName=varName; emitSnap("init",-1,"0"); }
            DSVPArray(String[] vals, String varName){ data=vals; type="String"; length=vals.length; this.varName=varName; emitSnap("init",-1,"0"); }
            
          private String snapStr(){
    StringBuilder s = new StringBuilder("[");
    for(int i = 0; i < length; i++) {
        Object val = getValueAt(i);
        if(val == null) {
            s.append("null");
        } else if(val instanceof String) {
            s.append("\\"").append(escapeJson((String) val)).append("\\"");
        } else if(val instanceof Character) {
            s.append("\\"").append(escapeJson(val.toString())).append("\\"");
        } else {
            s.append(val);
        }
        if(i < length - 1) s.append(",");
    }
    return s.append("]").toString();
}
            
            private String escapeJson(String str) {
                return str.replace("\\\\", "\\\\\\\\")
                          .replace("\\"", "\\\\\\"")
                          .replace("\\n", "\\\\n")
                          .replace("\\r", "\\\\r")
                          .replace("\\t", "\\\\t");
            }
            
            private Object getValueAt(int i) {
                switch(type) {
                    case "int": return ((int[])data)[i];
                    case "long": return ((long[])data)[i];
                    case "float": return ((float[])data)[i];
                    case "double": return ((double[])data)[i];
                    case "char": return ((char[])data)[i];
                    case "String": return ((String[])data)[i];
                    default: return null;
                }
            }

            private void emitSnap(String op,int idx,String val){
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":\\""+val+"\\",\\"var\\":\\""+varName+"\\",\\"snap\\":"+snapStr()+"}");
                System.err.flush();
            }
            
            // Used by StackFieldInstrumentVisitor for hand-rolled array+top
            // Stack classes - takes a plain int[] snapshot directly (no
            // DSVPArray instance involved), so a user's own Stack class
            // never depends on DSVPArray or the java.util.Stack shim at all.
            public static void emitFieldSnap(String op, int idx, String val, int[] snap){
                StringBuilder s = new StringBuilder("[");
                for(int i = 0; i < snap.length; i++){
                    s.append(snap[i]);
                    if(i < snap.length - 1) s.append(",");
                }
                s.append("]");
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":\\""+val+"\\",\\"snap\\":"+s+"}");
                System.err.flush();
            }

            public static void emitFieldSnap(String op, int idx, String val, long[] snap){
                StringBuilder s = new StringBuilder("[");
                for(int i = 0; i < snap.length; i++){
                    s.append(snap[i]);
                    if(i < snap.length - 1) s.append(",");
                }
                s.append("]");
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":\\""+val+"\\",\\"snap\\":"+s+"}");
                System.err.flush();
            }

            public static void emitFieldSnap(String op, int idx, String val, double[] snap){
                StringBuilder s = new StringBuilder("[");
                for(int i = 0; i < snap.length; i++){
                    s.append(snap[i]);
                    if(i < snap.length - 1) s.append(",");
                }
                s.append("]");
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":\\""+val+"\\",\\"snap\\":"+s+"}");
                System.err.flush();
            }

            public static void emitFieldSnap(String op, int idx, String val, float[] snap){
                StringBuilder s = new StringBuilder("[");
                for(int i = 0; i < snap.length; i++){
                    s.append(snap[i]);
                    if(i < snap.length - 1) s.append(",");
                }
                s.append("]");
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":\\""+val+"\\",\\"snap\\":"+s+"}");
                System.err.flush();
            }

            public static void emitFieldSnap(String op, int idx, String val, char[] snap){
                StringBuilder s = new StringBuilder("[");
                for(int i = 0; i < snap.length; i++){
                    s.append("\\"").append(escapeJsonStr(String.valueOf(snap[i]))).append("\\"");
                    if(i < snap.length - 1) s.append(",");
                }
                s.append("]");
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":\\""+escapeJsonStr(val)+"\\",\\"snap\\":"+s+"}");
                System.err.flush();
            }

            private static String escapeJsonStr(String str) {
                return str.replace("\\\\", "\\\\\\\\")
                          .replace("\\"", "\\\\\\"")
                          .replace("\\n", "\\\\n")
                          .replace("\\r", "\\\\r")
                          .replace("\\t", "\\\\t");
            }

            public static void traceCall(String func, String argsJson){
                System.err.println("DSVP_TRACE:{\\"op\\":\\"call\\",\\"func\\":\\""+func+"\\",\\"args\\":"+argsJson+"}");
                System.err.flush();
            }
            public static void traceLine(String func, int line, String localsJson){
                System.err.println("DSVP_TRACE:{\\"op\\":\\"line\\",\\"func\\":\\""+func+"\\",\\"line\\":"+line+",\\"locals\\":"+localsJson+"}");
                System.err.flush();
            }
            public static void traceReturn(String func, String retVal, String localsJson){
                System.err.println("DSVP_TRACE:{\\"op\\":\\"return\\",\\"func\\":\\""+func+"\\",\\"ret\\":\\""+retVal+"\\",\\"locals\\":"+localsJson+"}");
                System.err.flush();
            }
            
            public int getInt(int i){ int v=((int[])data)[i]; emitSnap("read",i,String.valueOf(v)); return v; }
            public long getLong(int i){ long v=((long[])data)[i]; emitSnap("read",i,String.valueOf(v)); return v; }
            public float getFloat(int i){ float v=((float[])data)[i]; emitSnap("read",i,String.valueOf(v)); return v; }
            public double getDouble(int i){ double v=((double[])data)[i]; emitSnap("read",i,String.valueOf(v)); return v; }
            public char getChar(int i){ char v=((char[])data)[i]; emitSnap("read",i,String.valueOf(v)); return v; }
            public String getString(int i){ String v=((String[])data)[i]; emitSnap("read",i,v==null?"null":v); return v; }
            
            public Object get(int i){ 
                Object v = getValueAt(i);
                emitSnap("read",i,v==null?"null":String.valueOf(v)); 
                return v; 
            }
            
            public void setInt(int i,int v){ ((int[])data)[i]=v; emitSnap("write",i,String.valueOf(v)); }
            public void setLong(int i,long v){ ((long[])data)[i]=v; emitSnap("write",i,String.valueOf(v)); }
            public void setFloat(int i,float v){ ((float[])data)[i]=v; emitSnap("write",i,String.valueOf(v)); }
            public void setDouble(int i,double v){ ((double[])data)[i]=v; emitSnap("write",i,String.valueOf(v)); }
            public void setChar(int i,char v){ ((char[])data)[i]=v; emitSnap("write",i,String.valueOf(v)); }
            public void setString(int i,String v){ ((String[])data)[i]=v; emitSnap("write",i,v==null?"null":v); }
            
            public void set(int i, Object v){
                switch(type) {
                    case "int": ((int[])data)[i] = (int)v; break;
                    case "long": ((long[])data)[i] = (long)v; break;
                    case "float": ((float[])data)[i] = (float)v; break;
                    case "double": ((double[])data)[i] = (double)v; break;
                    case "char": ((char[])data)[i] = (char)v; break;
                    case "String": ((String[])data)[i] = (String)v; break;
                }
                emitSnap("write",i,v==null?"null":String.valueOf(v));
            }
            
            // Compound-assignment support (+=, -=, *=, /=, %=). Once a
            // variable becomes DSVPArray, `arr[i] += v` no longer compiles
            // at all - you can't apply an operator to a method-backed
            // wrapper - so every compound op on a tracked element MUST be
            // rewritten to one of these. Each reuses the existing typed
            // getter/setter, so a compound op naturally emits both a
            // "read" (old value) and a "write" (new value) trace event,
            // same as if the user had written `arr[i] = arr[i] + v;` by
            // hand - and returns the new value, matching Java's own
            // compound-assignment expression semantics.
            public int addInt(int i,int d){ int v=getInt(i)+d; setInt(i,v); return v; }
            public int subInt(int i,int d){ int v=getInt(i)-d; setInt(i,v); return v; }
            public int mulInt(int i,int d){ int v=getInt(i)*d; setInt(i,v); return v; }
            public int divInt(int i,int d){ int v=getInt(i)/d; setInt(i,v); return v; }
            public int modInt(int i,int d){ int v=getInt(i)%d; setInt(i,v); return v; }

            public long addLong(int i,long d){ long v=getLong(i)+d; setLong(i,v); return v; }
            public long subLong(int i,long d){ long v=getLong(i)-d; setLong(i,v); return v; }
            public long mulLong(int i,long d){ long v=getLong(i)*d; setLong(i,v); return v; }
            public long divLong(int i,long d){ long v=getLong(i)/d; setLong(i,v); return v; }
            public long modLong(int i,long d){ long v=getLong(i)%d; setLong(i,v); return v; }

            public double addDouble(int i,double d){ double v=getDouble(i)+d; setDouble(i,v); return v; }
            public double subDouble(int i,double d){ double v=getDouble(i)-d; setDouble(i,v); return v; }
            public double mulDouble(int i,double d){ double v=getDouble(i)*d; setDouble(i,v); return v; }
            public double divDouble(int i,double d){ double v=getDouble(i)/d; setDouble(i,v); return v; }
            public double modDouble(int i,double d){ double v=getDouble(i)%d; setDouble(i,v); return v; }

            public float addFloat(int i,float d){ float v=getFloat(i)+d; setFloat(i,v); return v; }
            public float subFloat(int i,float d){ float v=getFloat(i)-d; setFloat(i,v); return v; }
            public float mulFloat(int i,float d){ float v=getFloat(i)*d; setFloat(i,v); return v; }
            public float divFloat(int i,float d){ float v=getFloat(i)/d; setFloat(i,v); return v; }
            public float modFloat(int i,float d){ float v=getFloat(i)%d; setFloat(i,v); return v; }

            // char compound ops implicitly narrow back to char, exactly
            // like Java's own `charArr[i] += 1;` does.
            public char addChar(int i,int d){ char v=(char)(getChar(i)+d); setChar(i,v); return v; }
            public char subChar(int i,int d){ char v=(char)(getChar(i)-d); setChar(i,v); return v; }
            public char mulChar(int i,int d){ char v=(char)(getChar(i)*d); setChar(i,v); return v; }
            public char divChar(int i,int d){ char v=(char)(getChar(i)/d); setChar(i,v); return v; }
            public char modChar(int i,int d){ char v=(char)(getChar(i)%d); setChar(i,v); return v; }

            // String only supports +=  (concatenation) - the only compound
            // operator Java itself allows on String.
            public String addString(int i,String d){ String v=getString(i)+d; setString(i,v); return v; }

            public void swap(int i,int j){
                switch(type) {
                    case "int": int ti=((int[])data)[i]; ((int[])data)[i]=((int[])data)[j]; ((int[])data)[j]=ti; break;
                    case "long": long tl=((long[])data)[i]; ((long[])data)[i]=((long[])data)[j]; ((long[])data)[j]=tl; break;
                    case "float": float tf=((float[])data)[i]; ((float[])data)[i]=((float[])data)[j]; ((float[])data)[j]=tf; break;
                    case "double": double td=((double[])data)[i]; ((double[])data)[i]=((double[])data)[j]; ((double[])data)[j]=td; break;
                    case "char": char tc=((char[])data)[i]; ((char[])data)[i]=((char[])data)[j]; ((char[])data)[j]=tc; break;
                    case "String": String ts=((String[])data)[i]; ((String[])data)[i]=((String[])data)[j]; ((String[])data)[j]=ts; break;
                }
                emitSnap("swap",i,String.valueOf(j)); 
            }
            
            public int size(){ return length; }
            
            public int[] rawInt(){ return (int[])data; }
            public long[] rawLong(){ return (long[])data; }
            public float[] rawFloat(){ return (float[])data; }
            public double[] rawDouble(){ return (double[])data; }
            public char[] rawChar(){ return (char[])data; }
            public String[] rawString(){ return (String[])data; }
            
            public boolean gtInt(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((int[])data)[i]>((int[])data)[j]; }
            public boolean ltInt(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((int[])data)[i]<((int[])data)[j]; }
            public boolean gteInt(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((int[])data)[i]>=((int[])data)[j]; }
            public boolean lteInt(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((int[])data)[i]<=((int[])data)[j]; }
            public boolean eqInt(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((int[])data)[i]==((int[])data)[j]; }
            public boolean neqInt(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((int[])data)[i]!=((int[])data)[j]; }
            
            public boolean gtLong(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((long[])data)[i]>((long[])data)[j]; }
            public boolean ltLong(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((long[])data)[i]<((long[])data)[j]; }
            public boolean gteLong(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((long[])data)[i]>=((long[])data)[j]; }
            public boolean lteLong(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((long[])data)[i]<=((long[])data)[j]; }
            public boolean eqLong(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((long[])data)[i]==((long[])data)[j]; }
            public boolean neqLong(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((long[])data)[i]!=((long[])data)[j]; }
            
            public boolean gtFloat(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((float[])data)[i]>((float[])data)[j]; }
            public boolean ltFloat(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((float[])data)[i]<((float[])data)[j]; }
            public boolean gteFloat(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((float[])data)[i]>=((float[])data)[j]; }
            public boolean lteFloat(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((float[])data)[i]<=((float[])data)[j]; }
            public boolean eqFloat(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((float[])data)[i]==((float[])data)[j]; }
            public boolean neqFloat(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((float[])data)[i]!=((float[])data)[j]; }
            
            public boolean gtDouble(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((double[])data)[i]>((double[])data)[j]; }
            public boolean ltDouble(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((double[])data)[i]<((double[])data)[j]; }
            public boolean gteDouble(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((double[])data)[i]>=((double[])data)[j]; }
            public boolean lteDouble(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((double[])data)[i]<=((double[])data)[j]; }
            public boolean eqDouble(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((double[])data)[i]==((double[])data)[j]; }
            public boolean neqDouble(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((double[])data)[i]!=((double[])data)[j]; }
            
            public boolean gtChar(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((char[])data)[i]>((char[])data)[j]; }
            public boolean ltChar(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((char[])data)[i]<((char[])data)[j]; }
            public boolean gteChar(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((char[])data)[i]>=((char[])data)[j]; }
            public boolean lteChar(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((char[])data)[i]<=((char[])data)[j]; }
            public boolean eqChar(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((char[])data)[i]==((char[])data)[j]; }
            public boolean neqChar(int i,int j){ emitSnap("compare",i,String.valueOf(j)); return ((char[])data)[i]!=((char[])data)[j]; }
            
            @Override public String toString(){ return snapStr(); }
        }
        """;

    // Only injected when the user actually has a java.util.Stack<T> usage
    // that StackInstrumentVisitor rewrote to DSVPStack<T> — kept fully out
    // of the generated source otherwise, so "no DSVPStack dependency" holds
    // for any project (like a hand-rolled Stack class) that never uses it.
    static final String STACK_SOURCE = """
        class DSVPStack<T> implements Iterable<T> {
            private java.util.ArrayList<T> data = new java.util.ArrayList<>();

            DSVPStack(){ emitSnap("init",-1,"0"); }

            private String snapStr(){
                StringBuilder s = new StringBuilder("[");
                for(int i = 0; i < data.size(); i++) {
                    Object val = data.get(i);
                    if(val == null) {
                        s.append("null");
                    } else if(val instanceof String) {
                        s.append("\\"").append(escapeJson((String) val)).append("\\"");
                    } else if(val instanceof Character) {
                        s.append("\\"").append(escapeJson(val.toString())).append("\\"");
                    } else {
                        s.append(val);
                    }
                    if(i < data.size() - 1) s.append(",");
                }
                return s.append("]").toString();
            }

            private String escapeJson(String str) {
                return str.replace("\\\\", "\\\\\\\\")
                          .replace("\\"", "\\\\\\"")
                          .replace("\\n", "\\\\n")
                          .replace("\\r", "\\\\r")
                          .replace("\\t", "\\\\t");
            }

            private void emitSnap(String op,int idx,String val){
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":\\""+val+"\\",\\"snap\\":"+snapStr()+"}");
                System.err.flush();
            }

            public void push(T v){ data.add(v); emitSnap("append", data.size()-1, v==null?"null":String.valueOf(v)); }

            public T pop(){
                if(data.isEmpty()) throw new java.util.EmptyStackException();
                int idx = data.size()-1;
                T v = data.remove(idx);
                emitSnap("delete", idx, v==null?"null":String.valueOf(v));
                return v;
            }

            public T peek(){
                if(data.isEmpty()) throw new java.util.EmptyStackException();
                int idx = data.size()-1;
                T v = data.get(idx);
                emitSnap("read", idx, v==null?"null":String.valueOf(v));
                return v;
            }

            public boolean isEmpty(){ return data.isEmpty(); }
            public int size(){ return data.size(); }
            public boolean contains(Object v){ return data.contains(v); }
            public java.util.Iterator<T> iterator(){ return data.iterator(); }

            @Override public String toString(){ return snapStr(); }
        }
        """;

    // Only injected when the user actually has a java.util.Queue<T> usage
    // (LinkedList/ArrayDeque behind it) that QueueInstrumentVisitor rewrote
    // to DSVPQueue<T> — kept fully out of the generated source otherwise,
    // same conditional-injection pattern as STACK_SOURCE. FIFO: offer/add
    // appends at the rear (end of the backing list); poll/remove takes from
    // the front (index 0) — mirrors DSVPArray's "append" / "delete at idx 0"
    // event shape so QueueVisualizer can reuse the same array-event mapping
    // the frontend already uses for Stack.
    static final String QUEUE_SOURCE = """
        class DSVPQueue<T> implements Iterable<T> {
            private java.util.ArrayList<T> data = new java.util.ArrayList<>();

            DSVPQueue(){ emitSnap("init",-1,"0"); }

            private String snapStr(){
                StringBuilder s = new StringBuilder("[");
                for(int i = 0; i < data.size(); i++) {
                    Object val = data.get(i);
                    if(val == null) {
                        s.append("null");
                    } else if(val instanceof String) {
                        s.append("\\"").append(escapeJson((String) val)).append("\\"");
                    } else if(val instanceof Character) {
                        s.append("\\"").append(escapeJson(val.toString())).append("\\"");
                    } else {
                        s.append(val);
                    }
                    if(i < data.size() - 1) s.append(",");
                }
                return s.append("]").toString();
            }

            private String escapeJson(String str) {
                return str.replace("\\\\", "\\\\\\\\")
                          .replace("\\"", "\\\\\\"")
                          .replace("\\n", "\\\\n")
                          .replace("\\r", "\\\\r")
                          .replace("\\t", "\\\\t");
            }

            private void emitSnap(String op,int idx,String val){
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":\\""+val+"\\",\\"snap\\":"+snapStr()+"}");
                System.err.flush();
            }

            public boolean offer(T v){ data.add(v); emitSnap("append", data.size()-1, v==null?"null":String.valueOf(v)); return true; }
            public boolean add(T v){ return offer(v); }

            public T poll(){
                if(data.isEmpty()) return null;
                T v = data.remove(0);
                emitSnap("delete", 0, v==null?"null":String.valueOf(v));
                return v;
            }

            public T remove(){
                if(data.isEmpty()) throw new java.util.NoSuchElementException();
                T v = data.remove(0);
                emitSnap("delete", 0, v==null?"null":String.valueOf(v));
                return v;
            }

            public T peek(){
                if(data.isEmpty()) return null;
                T v = data.get(0);
                emitSnap("read", 0, v==null?"null":String.valueOf(v));
                return v;
            }

            public T element(){
                if(data.isEmpty()) throw new java.util.NoSuchElementException();
                T v = data.get(0);
                emitSnap("read", 0, v==null?"null":String.valueOf(v));
                return v;
            }

            public boolean isEmpty(){ return data.isEmpty(); }
            public int size(){ return data.size(); }
            public boolean contains(Object v){ return data.contains(v); }
            public java.util.Iterator<T> iterator(){ return data.iterator(); }

            @Override public String toString(){ return snapStr(); }
        }
        """;

    // Only injected when Array2DInstrumentVisitor actually rewrote an
    // int[][]/char[][] local — kept fully out of generated source otherwise,
    // same conditional-injection pattern as STACK_SOURCE.
    static final String ARRAY2D_SOURCE = """
        class DSVPArray2DInt {
            private int[][] data;

            DSVPArray2DInt(int rows, int cols){ data = new int[rows][cols]; emit("init2d",-1,-1,"0"); }
            DSVPArray2DInt(int[][] vals){ data = vals; emit("init2d",-1,-1,"0"); }

            private String gridStr(){
                StringBuilder s = new StringBuilder("[");
                for(int i = 0; i < data.length; i++){
                    s.append("[");
                    for(int j = 0; j < data[i].length; j++){
                        s.append(data[i][j]);
                        if(j < data[i].length - 1) s.append(",");
                    }
                    s.append("]");
                    if(i < data.length - 1) s.append(",");
                }
                return s.append("]").toString();
            }

            private void emit(String op,int r,int c,String val){
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"row\\":"+r+",\\"col\\":"+c+",\\"val\\":\\""+val+"\\",\\"grid\\":"+gridStr()+"}");
                System.err.flush();
            }

            public int get(int r,int c){ int v = data[r][c]; emit("read2d",r,c,String.valueOf(v)); return v; }
            public void set(int r,int c,int v){ data[r][c] = v; emit("write2d",r,c,String.valueOf(v)); }
            public int rows(){ return data.length; }
            public int cols(){ return data.length > 0 ? data[0].length : 0; }

            // Compound-assignment support - same reasoning as DSVPArray's
            // addInt/subInt/etc: grid[i][j] += v no longer compiles once
            // grid is DSVPArray2DInt, so it must be rewritten to one of
            // these instead. Reuses get/set so tracing stays correct.
            public int addInt(int r,int c,int d){ int v=get(r,c)+d; set(r,c,v); return v; }
            public int subInt(int r,int c,int d){ int v=get(r,c)-d; set(r,c,v); return v; }
            public int mulInt(int r,int c,int d){ int v=get(r,c)*d; set(r,c,v); return v; }
            public int divInt(int r,int c,int d){ int v=get(r,c)/d; set(r,c,v); return v; }
            public int modInt(int r,int c,int d){ int v=get(r,c)%d; set(r,c,v); return v; }

            @Override public String toString(){ return gridStr(); }
        }
        class DSVPArray2DChar {
            private char[][] data;

            DSVPArray2DChar(int rows, int cols){ data = new char[rows][cols]; emit("init2d",-1,-1,""); }
            DSVPArray2DChar(char[][] vals){ data = vals; emit("init2d",-1,-1,""); }

            private String escapeJson(String str) {
                return str.replace("\\\\", "\\\\\\\\")
                          .replace("\\"", "\\\\\\"")
                          .replace("\\n", "\\\\n")
                          .replace("\\r", "\\\\r")
                          .replace("\\t", "\\\\t");
            }

            private String gridStr(){
                StringBuilder s = new StringBuilder("[");
                for(int i = 0; i < data.length; i++){
                    s.append("[");
                    for(int j = 0; j < data[i].length; j++){
                        s.append("\\"").append(escapeJson(String.valueOf(data[i][j]))).append("\\"");
                        if(j < data[i].length - 1) s.append(",");
                    }
                    s.append("]");
                    if(i < data.length - 1) s.append(",");
                }
                return s.append("]").toString();
            }

            private void emit(String op,int r,int c,String val){
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"row\\":"+r+",\\"col\\":"+c+",\\"val\\":\\""+escapeJson(val)+"\\",\\"grid\\":"+gridStr()+"}");
                System.err.flush();
            }

            public char get(int r,int c){ char v = data[r][c]; emit("read2d",r,c,String.valueOf(v)); return v; }
            public void set(int r,int c,char v){ data[r][c] = v; emit("write2d",r,c,String.valueOf(v)); }

            public char addChar(int r,int c,int d){ char v=(char)(get(r,c)+d); set(r,c,v); return v; }
            public char subChar(int r,int c,int d){ char v=(char)(get(r,c)-d); set(r,c,v); return v; }
            public char mulChar(int r,int c,int d){ char v=(char)(get(r,c)*d); set(r,c,v); return v; }
            public char divChar(int r,int c,int d){ char v=(char)(get(r,c)/d); set(r,c,v); return v; }
            public char modChar(int r,int c,int d){ char v=(char)(get(r,c)%d); set(r,c,v); return v; }

            public int rows(){ return data.length; }
            public int cols(){ return data.length > 0 ? data[0].length : 0; }

            @Override public String toString(){ return gridStr(); }
        }
        """;
}
