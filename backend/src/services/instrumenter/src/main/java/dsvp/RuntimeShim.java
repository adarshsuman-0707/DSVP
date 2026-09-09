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
            
            // Constructors for different types
            DSVPArray(int size, String arrayType){ 
                this.type = arrayType;
                this.length = size;
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
            
            DSVPArray(int[] vals){ data=vals; type="int"; length=vals.length; emitSnap("init",-1,"0"); }
            DSVPArray(long[] vals){ data=vals; type="long"; length=vals.length; emitSnap("init",-1,"0"); }
            DSVPArray(float[] vals){ data=vals; type="float"; length=vals.length; emitSnap("init",-1,"0"); }
            DSVPArray(double[] vals){ data=vals; type="double"; length=vals.length; emitSnap("init",-1,"0"); }
            DSVPArray(char[] vals){ data=vals; type="char"; length=vals.length; emitSnap("init",-1,"0"); }
            DSVPArray(String[] vals){ data=vals; type="String"; length=vals.length; emitSnap("init",-1,"0"); }
            
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
                System.err.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":\\""+val+"\\",\\"snap\\":"+snapStr()+"}");
                System.err.flush();
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
}
