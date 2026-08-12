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
        class DSVPArray implements Iterable<Integer> {
            private int[] d;
            DSVPArray(int size){ d=new int[size]; emitSnap("init",-1,0); }
            DSVPArray(int... vals){ d=vals.clone(); emitSnap("init",-1,0); }
            private String snapStr(){
                StringBuilder s=new StringBuilder("[");
                for(int i=0;i<d.length;i++) s.append(d[i]).append(i<d.length-1?",":"");
                return s.append("]").toString();
            }
            private void emitSnap(String op,int idx,int val){
                System.out.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":"+val+",\\"snap\\":"+snapStr()+"}");
                System.out.flush();
            }
            public static void traceCall(String func, String argsJson){
                System.out.println("DSVP_TRACE:{\\"op\\":\\"call\\",\\"func\\":\\""+func+"\\",\\"args\\":"+argsJson+"}");
                System.out.flush();
            }
            public static void traceLine(String func, int line, String localsJson){
                System.out.println("DSVP_TRACE:{\\"op\\":\\"line\\",\\"func\\":\\""+func+"\\",\\"line\\":"+line+",\\"locals\\":"+localsJson+"}");
                System.out.flush();
            }
            public static void traceReturn(String func, String retVal, String localsJson){
                System.out.println("DSVP_TRACE:{\\"op\\":\\"return\\",\\"func\\":\\""+func+"\\",\\"ret\\":\\""+retVal+"\\",\\"locals\\":"+localsJson+"}");
                System.out.flush();
            }
            public int get(int i){ int v=d[i]; emitSnap("read",i,v); return v; }
            public void set(int i,int v){ d[i]=v; emitSnap("write",i,v); }
            public void swap(int i,int j){ int t=d[i];d[i]=d[j];d[j]=t; emitSnap("swap",i,j); }
            public int size(){ return d.length; }
            public int[] raw(){ return d; }
            @Override
            public Iterator<Integer> iterator(){
                return new Iterator<Integer>(){
                    int pos=0;
                    public boolean hasNext(){ return pos<d.length; }
                    public Integer next(){
                        int v=d[pos]; emitSnap("read",pos,v); pos++; return v;
                    }
                };
            }
            public boolean gt(int i,int j){ emitSnap("compare",i,j); return d[i]> d[j]; }
            public boolean lt(int i,int j){ emitSnap("compare",i,j); return d[i]< d[j]; }
            public boolean gte(int i,int j){ emitSnap("compare",i,j); return d[i]>=d[j]; }
            public boolean lte(int i,int j){ emitSnap("compare",i,j); return d[i]<=d[j]; }
            public boolean eq(int i,int j){ emitSnap("compare",i,j); return d[i]==d[j]; }
            public boolean neq(int i,int j){ emitSnap("compare",i,j); return d[i]!=d[j]; }
            @Override public String toString(){ return snapStr(); }
        }
        """;
}
