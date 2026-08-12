# 👨‍💼 Admin Subscription Management - Complete Guide

## ✅ What's Implemented

### 1. Admin Can Control Module Pricing
Admin decides which modules belong to which tier:
- **Free tier**: Accessible to all users
- **Basic tier (₹49)**: Requires basic or premium plan
- **Premium tier (₹99)**: ONLY accessible with premium plan

### 2. Strict Access Control
Users get EXACTLY what they paid for:
- ❌ Free users cannot access basic or premium modules
- ❌ Basic users cannot access premium modules
- ❌ Basic users need explicit module access from admin
- ✅ Premium users get ALL modules automatically

---

## 🎯 Key Features

### Feature 1: Admin Sets Module Tiers
Admin can change `RequiredPlan` for any module:

```javascript
// API: PUT /api/admin/modules/:id
{
  "requiredPlan": "free" | "basic" | "premium",
  "isPremium": true/false
}
```

**Example:**
```javascript
// Admin decides Queue is basic tier
PUT /api/admin/modules/4
{
  "name": "Queue",
  "slug": "queue",
  "requiredPlan": "basic",  // ₹49 plan needed
  "isPremium": true
}

// Admin decides Heap is premium tier
PUT /api/admin/modules/11
{
  "name": "Heap",
  "slug": "heap",
  "requiredPlan": "premium",  // ₹99 plan needed
  "isPremium": true
}
```

### Feature 2: Admin Manages User Subscriptions
Admin can upgrade/downgrade any user:

```javascript
// API: PATCH /api/admin/users/:userId/subscription
{
  "plan": "free" | "basic" | "premium",
  "moduleAccess": [1, 2, 3]  // Array of ModuleIds for basic users
}
```

**Example Scenarios:**

#### Scenario A: Grant Basic Plan
```javascript
// User pays ₹49, admin grants access
PATCH /api/admin/users/123/subscription
{
  "plan": "basic",
  "moduleAccess": [4, 5]  // Queue (4), Tree (5)
}
```
Result:
- ✅ User can access Queue and Tree
- ❌ User CANNOT access Heap or Graph (premium tier)
- ✅ User can still access all free modules

#### Scenario B: Grant Premium Plan
```javascript
// User pays ₹99, admin grants full access
PATCH /api/admin/users/123/subscription
{
  "plan": "premium",
  "moduleAccess": null  // Not needed - gets everything
}
```
Result:
- ✅ User can access ALL modules
- ✅ No need for explicit module list

#### Scenario C: Revoke Access
```javascript
// User's subscription expired, downgrade to free
PATCH /api/admin/users/123/subscription
{
  "plan": "free",
  "moduleAccess": []
}
```
Result:
- ✅ User can only access free modules
- ❌ All premium access removed

---

## 🔒 Strict Access Control Logic

### Backend Logic (`moduleController.js`)

```javascript
// For each module, check:
1. Is user admin? → Full access ✅
2. Module is free tier? → Everyone can access ✅
3. Module is basic tier?
   - User has basic plan + module in access list? → Access ✅
   - User has premium plan? → Access ✅
   - Otherwise → BLOCKED ❌
4. Module is premium tier?
   - User has premium plan? → Access ✅
   - Otherwise → BLOCKED ❌
```

### Example Access Matrix

| Module | Tier | Free User | Basic (no access) | Basic (with access) | Premium |
|--------|------|-----------|-------------------|---------------------|---------|
| Array | free | ✅ | ✅ | ✅ | ✅ |
| Queue | basic | ❌ | ❌ | ✅ | ✅ |
| Heap | premium | ❌ | ❌ | ❌ | ✅ |

---

## 📡 API Endpoints

### Admin APIs

#### 1. Get All Modules (with pricing)
```
GET /api/admin/modules
Authorization: Bearer {adminToken}

Response:
{
  "modules": [
    {
      "ModuleId": 1,
      "Name": "Array",
      "Slug": "array",
      "RequiredPlan": "free",
      "IsPremium": false
    },
    {
      "ModuleId": 4,
      "Name": "Queue",
      "Slug": "queue",
      "RequiredPlan": "basic",
      "IsPremium": true
    }
  ]
}
```

#### 2. Update Module Pricing
```
PUT /api/admin/modules/:id
Authorization: Bearer {adminToken}

Body:
{
  "name": "Queue",
  "slug": "queue",
  "category": "linear",
  "description": "FIFO data structure",
  "requiredPlan": "basic",
  "isPremium": true,
  "sortOrder": 4,
  "isActive": true
}
```

#### 3. Update User Subscription
```
PATCH /api/admin/users/:userId/subscription
Authorization: Bearer {adminToken}

Body:
{
  "plan": "basic",
  "moduleAccess": [4, 5, 7]  // ModuleIds
}

Response:
{
  "message": "Subscription updated",
  "plan": "basic",
  "expiresAt": "2026-09-10T10:00:00.000Z",
  "moduleAccess": [4, 5, 7]
}
```

---

## 💻 Frontend Integration

### API Service (`src/services/api.js`)

```javascript
// Update module pricing
export const updateAdminModule = (id, data) => 
  api.put(`/admin/modules/${id}`, data);

// Update user subscription
export const updateUserSubscription = (id, plan, moduleAccess) =>
  api.patch(`/admin/users/${id}/subscription`, { plan, moduleAccess });
```

### Example Admin UI (To Build)

```jsx
// Admin Module Management
function ModuleManager() {
  const [modules, setModules] = useState([]);
  
  async function updateModuleTier(moduleId, tier) {
    const module = modules.find(m => m.ModuleId === moduleId);
    await updateAdminModule(moduleId, {
      ...module,
      requiredPlan: tier,
      isPremium: tier !== 'free'
    });
    alert(`Module updated to ${tier} tier`);
  }
  
  return (
    <div>
      {modules.map(m => (
        <div key={m.ModuleId}>
          <h3>{m.Name}</h3>
          <select 
            value={m.RequiredPlan} 
            onChange={(e) => updateModuleTier(m.ModuleId, e.target.value)}
          >
            <option value="free">Free</option>
            <option value="basic">Basic (₹49)</option>
            <option value="premium">Premium (₹99)</option>
          </select>
        </div>
      ))}
    </div>
  );
}
```

```jsx
// Admin User Subscription Management
function UserSubscriptionManager({ userId, currentPlan }) {
  const [selectedPlan, setSelectedPlan] = useState(currentPlan);
  const [moduleAccess, setModuleAccess] = useState([]);
  const [availableModules, setAvailableModules] = useState([]);
  
  async function updateSubscription() {
    await updateUserSubscription(userId, selectedPlan, moduleAccess);
    alert('Subscription updated!');
  }
  
  return (
    <div>
      <h3>Update Subscription</h3>
      
      <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}>
        <option value="free">Free</option>
        <option value="basic">Basic (₹49)</option>
        <option value="premium">Premium (₹99)</option>
      </select>
      
      {selectedPlan === 'basic' && (
        <div>
          <h4>Grant Access to Modules:</h4>
          {availableModules.filter(m => m.RequiredPlan === 'basic').map(m => (
            <label key={m.ModuleId}>
              <input
                type="checkbox"
                checked={moduleAccess.includes(m.ModuleId)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setModuleAccess([...moduleAccess, m.ModuleId]);
                  } else {
                    setModuleAccess(moduleAccess.filter(id => id !== m.ModuleId));
                  }
                }}
              />
              {m.Name}
            </label>
          ))}
        </div>
      )}
      
      <button onClick={updateSubscription}>Update</button>
    </div>
  );
}
```

---

## 🧪 Testing Scenarios

### Test 1: Module Tier Assignment
1. Admin logs in
2. Goes to module management
3. Sets Queue → Basic tier
4. Sets Heap → Premium tier
5. Saves changes
6. Verify: Free users can't access Queue or Heap

### Test 2: Basic Plan User
1. User registers (free plan by default)
2. User tries Queue → BLOCKED ✅
3. Admin upgrades user to Basic
4. User tries Queue → STILL BLOCKED (not in access list) ✅
5. Admin adds Queue to user's access list
6. User tries Queue → SUCCESS ✅
7. User tries Heap → BLOCKED (requires premium) ✅

### Test 3: Premium Plan User
1. User buys Premium plan (₹99)
2. Admin upgrades user to Premium
3. User can access ALL modules ✅
4. No need for explicit module list ✅

---

## 🗄️ Database Structure

### Users Table
```sql
UserId INT PRIMARY KEY
SubscriptionPlan NVARCHAR(20)  -- 'free', 'basic', 'premium'
SubscriptionExpiry DATETIME
PremiumModulesAccess NVARCHAR(MAX)  -- JSON: [1, 2, 3]
IsPremium BIT
```

### Modules Table
```sql
ModuleId INT PRIMARY KEY
Name NVARCHAR(100)
Slug NVARCHAR(100)
RequiredPlan NVARCHAR(20)  -- 'free', 'basic', 'premium'
IsPremium BIT
```

### Example Data
```sql
-- Free module
INSERT INTO Modules (Name, Slug, RequiredPlan, IsPremium)
VALUES ('Array', 'array', 'free', 0);

-- Basic tier module
INSERT INTO Modules (Name, Slug, RequiredPlan, IsPremium)
VALUES ('Queue', 'queue', 'basic', 1);

-- Premium tier module
INSERT INTO Modules (Name, Slug, RequiredPlan, IsPremium)
VALUES ('Heap', 'heap', 'premium', 1);
```

```sql
-- Free user
INSERT INTO Users (Email, SubscriptionPlan)
VALUES ('free@test.com', 'free');

-- Basic user with Queue access
INSERT INTO Users (Email, SubscriptionPlan, PremiumModulesAccess)
VALUES ('basic@test.com', 'basic', '[4]');  -- Queue ModuleId = 4

-- Premium user
INSERT INTO Users (Email, SubscriptionPlan)
VALUES ('premium@test.com', 'premium');
```

---

## ⚠️ Important Notes

### 1. JWT Token Contains Subscription Data
When user logs in, JWT includes:
```javascript
{
  userId: 123,
  role: 'user',
  subscriptionPlan: 'basic',
  premiumModulesAccess: [4, 5]  // Module IDs
}
```

**Consequence**: If admin changes subscription, user must **re-login** to get new token!

### 2. Always Check on Backend
Frontend `HasAccess` flag is for UI only. Backend ALWAYS validates access.

### 3. Expiry Handling
Currently subscription expiry is stored but not automatically enforced. Need cron job to:
- Check expired subscriptions daily
- Downgrade to free plan
- Send email notifications

---

## 🎯 Summary

✅ **What's Working:**
1. Admin can set module tiers (free/basic/premium)
2. Admin can upgrade/downgrade users
3. Admin can grant specific modules to basic users
4. Strict access control enforced on backend
5. Users get ONLY what they paid for
6. Premium users get everything automatically

🔄 **To Build Next:**
1. Admin UI for module tier management
2. Admin UI for user subscription management
3. Subscription expiry checking (cron job)
4. Email notifications
5. Payment integration with tier selection

---

**Perfect! Ab admin full control me hai - konsa module kis plan me milega, aur kis user ko kya access dena hai! 🎉**
