# 🚀 DSVP - Quick Start Guide

## ⚡ Start in 3 Steps!

### Step 1: Start Backend (Terminal 1)
```powershell
cd f:\dotnet\DSVP\backend
npm start
```
✅ **Expected Output**:
```
✅ Connected to SQL Server (DSVP_DB)
🚀 DSVP backend running on http://localhost:5000
```

### Step 2: Start Frontend (Terminal 2)
```powershell
cd f:\dotnet\DSVP\frontend
npm run dev
```
✅ **Expected Output**:
```
VITE v8.2.1  ready in 10885 ms
➜  Local:   http://localhost:5174/
```

### Step 3: Open Browser
```
http://localhost:5174
```

---

## 🎓 First Time User Guide

### 1. Register Account
- Click "Register"
- Enter email and password
- Click "Create Account"

### 2. Login
- Enter credentials
- Click "Login"
- Redirects to Dashboard

### 3. Go to Workspace
- Click "Array" module
- Opens code editor

### 4. Write Code
```java
class GFG {
    public static void main(String[] args) {
        int arr[] = {5, 2, 8, 1, 9};
        
        // Bubble sort
        for (int i = 0; i < arr.length-1; i++) {
            for (int j = 0; j < arr.length-i-1; j++) {
                if (arr[j] > arr[j+1]) {
                    int temp = arr[j];
                    arr[j] = arr[j+1];
                    arr[j+1] = temp;
                }
            }
        }
        
        System.out.println("Sorted!");
    }
}
```

### 5. Click Run ▶
- Code compiles
- Animation starts
- Watch array sort!

### 6. Use Controls
- **Space**: Play/Pause
- **→**: Next step
- **←**: Previous step
- **Slider**: Jump to step

---

## 📱 UI Overview

```
┌─────────────────────────────────────────────────────┐
│  [← Dashboard]  [Java ▼]  [Array ▼]      [▶ Run]   │
├─────────────────────┬───────────────────────────────┤
│                     │                               │
│   Code Editor       │   Visualization               │
│   (Monaco)          │   - Array Display             │
│                     │   - Call Stack                │
│   Write your        │   - Variables                 │
│   Java/Python       │   - Animation                 │
│   code here         │                               │
│                     │                               │
├─────────────────────┴───────────────────────────────┤
│  [◄] [▶] [⏸] [Speed: 1x]  Step 1/50                │
└─────────────────────────────────────────────────────┘
```

---

## 🧪 Test Your Setup

### Quick Test 1: Java Hello World
```java
public class Main {
    public static void main(String[] args) {
        int arr[] = {1, 2, 3};
        System.out.println("Array size: " + arr.length);
    }
}
```
✅ **Should see**: Array initialized, output displayed

### Quick Test 2: Python Array
```python
arr = [10, 20, 30]
print("Array:", arr)
```
✅ **Should see**: Array visualization, output

### Quick Test 3: Function Call
```java
public class Main {
    static void test(int arr[]) {
        arr[0] = 99;
    }
    
    public static void main(String[] args) {
        int arr[] = {1, 2, 3};
        test(arr);
    }
}
```
✅ **Should see**: Function call in call stack, array modified

---

## 🐛 Troubleshooting

### Problem: Backend not starting
**Solution**:
```powershell
cd backend
rm -r node_modules
npm install
npm start
```

### Problem: Frontend not starting
**Solution**:
```powershell
cd frontend
rm -r node_modules
npm install
npm run dev
```

### Problem: Database connection failed
**Solution**:
1. Open SQL Server Management Studio
2. Connect to `localhost\SQLEXPRESS`
3. Check database `DSVP_DB` exists
4. Run scripts in `database/` folder

### Problem: Java not found
**Solution**:
1. Install Java JDK: https://adoptium.net/
2. Add to PATH
3. Restart terminal
4. Test: `java --version`

### Problem: No visualization
**Solution**:
1. Open browser console (F12)
2. Check for errors
3. Verify:
   - Backend running? (port 5000)
   - Logged in?
   - Code has no syntax errors

---

## 📚 Example Codes

### Bubble Sort (Java)
```java
class GFG {
    static void bubbleSort(int arr[], int n){
        for (int i = 0; i < n-1; i++) {
            for (int j = 0; j < n-i-1; j++) {
                if (arr[j] > arr[j+1]) {
                    int temp = arr[j];
                    arr[j] = arr[j+1];
                    arr[j+1] = temp;
                }
            }
        }
    }
    
    public static void main(String[] args) {
        int arr[] = {64, 34, 25, 12, 22, 11, 90};
        bubbleSort(arr, arr.length);
    }
}
```

### Linear Search (Python)
```python
def linear_search(arr, target):
    for i in range(len(arr)):
        if arr[i] == target:
            return i
    return -1

arr = [10, 20, 30, 40, 50]
result = linear_search(arr, 30)
print("Found at index:", result)
```

### Binary Search (Java)
```java
public class Main {
    static int binarySearch(int arr[], int target) {
        int left = 0, right = arr.length - 1;
        
        while (left <= right) {
            int mid = left + (right - left) / 2;
            
            if (arr[mid] == target)
                return mid;
            
            if (arr[mid] < target)
                left = mid + 1;
            else
                right = mid - 1;
        }
        
        return -1;
    }
    
    public static void main(String[] args) {
        int arr[] = {2, 5, 8, 12, 16, 23, 38, 45, 56, 67, 78};
        int result = binarySearch(arr, 23);
        System.out.println("Found at: " + result);
    }
}
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Space** | Play/Pause animation |
| **→** | Next step |
| **←** | Previous step |
| **Ctrl+Enter** | Run code |
| **Ctrl+S** | Save code (auto) |
| **F12** | Open developer tools |

---

## 📊 What You'll See

### Array Visualization
- **Green**: Current active index
- **Blue**: Second index (for comparisons/swaps)
- **Animation**: Smooth transitions
- **Values**: Numbers shown on each element

### Call Stack Panel
- **Current Function**: Highlighted
- **Variables**: Live values
- **Line Number**: Currently executing
- **Return Values**: When functions return

### Operation Description
- "arr[0] = 10" - Write operation
- "Read arr[0] → 10" - Read operation
- "Swap arr[0] ↔ arr[4]" - Swap operation
- "Compare arr[0]=64 vs arr[1]=34" - Comparison

---

## 💡 Tips for Best Experience

1. **Start Simple**: Begin with small arrays (5-10 elements)
2. **Watch Slowly**: Use speed control to see each step
3. **Check Variables**: Watch how variables change
4. **Follow Stack**: See function call flow
5. **Read Descriptions**: Operation explanations help
6. **Use Breakpoints**: Step forward/backward to specific points

---

## 🎯 Learning Path

### Beginner
1. Simple array initialization
2. Read and write operations
3. Linear search
4. Basic loops

### Intermediate
5. Bubble sort
6. Selection sort
7. Insertion sort
8. Binary search

### Advanced
9. Quick sort
10. Merge sort
11. Complex algorithms
12. Multiple data structures

---

## 🆘 Get Help

### Browser Console (F12)
- See JavaScript errors
- Check API responses
- Debug frontend issues

### Backend Logs
- Check terminal output
- See compilation errors
- Verify API calls

### Network Tab (F12)
- See API requests
- Check response data
- Verify authentication

---

## ✅ Quick Checklist

Before reporting issues, check:
- [ ] Backend running on port 5000?
- [ ] Frontend running on port 5174?
- [ ] Database connected?
- [ ] Java installed? (`java --version`)
- [ ] Python installed? (`python --version`)
- [ ] Logged in to application?
- [ ] Code has no syntax errors?
- [ ] Browser console shows no errors?

---

## 🎉 You're Ready!

**System is LIVE and WORKING!**

Students can now:
✅ Write code
✅ See visualizations
✅ Learn algorithms
✅ Debug step-by-step
✅ Understand execution flow

**Start exploring and learning! 🚀**

---

**Need Help?**
- Check `INTEGRATION_COMPLETE.md` for detailed docs
- Check `SYSTEM_STATUS.md` for technical details
- Check browser console for errors
- Check backend logs for API issues

**Happy Learning! 🎓**
