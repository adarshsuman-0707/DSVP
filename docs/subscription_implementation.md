# Subscription System Implementation

## Overview
Implemented a 3-tier subscription system for DSVP:
- **Free Plan**: Access to free modules only
- **Basic Plan (₹49/month)**: Access to select premium modules (admin-controlled)
- **Premium Plan (₹99/month)**: Access to ALL premium modules

## Database Changes

### Users Table
Added columns:
- `SubscriptionPlan` (NVARCHAR(20)): 'free' | 'basic' | 'premium'
- `SubscriptionExpiry` (DATETIME): Expiry date for paid subscriptions
- `PremiumModulesAccess` (NVARCHAR(MAX)): JSON array of ModuleIds for basic plan users

### Modules Table
Added column:
- `RequiredPlan` (NVARCHAR(20)): 'free' | 'basic' | 'premium'

Migration file: `database/03_add_subscription.sql`

## Backend Changes

### 1. Auth Controller (`src/controllers/authController.js`)
- Updated `generateToken()` to include subscription fields in JWT
- Updated `login()` response to include subscription info
- Token payload now includes:
  - `subscriptionPlan`
  - `premiumModulesAccess` (parsed JSON array)

### 2. Module Controller (`src/controllers/moduleController.js`)
- `listModules()`: Adds `HasAccess` flag to each module based on user's subscription
- `getModule()`: Checks access before returning module details
- Access logic:
  ```
  Free modules: Always accessible
  Premium modules:
    - Admin: Full access
    - Premium plan: Full access
    - Basic plan: Access if ModuleId in PremiumModulesAccess array
    - Free plan: No access
  ```

### 3. Module Model (`src/models/moduleModel.js`)
- Added `RequiredPlan` to SELECT queries

### 4. User Model (`src/models/userModel.js`)
- Updated all queries to include subscription fields
- New users default to 'free' plan

### 5. Payment Controller (`src/controllers/paymentController.js`)
- `createOrder()`: Creates Razorpay order and payment record
  - Validates plan (basic/premium)
  - Generates orderId for Razorpay
  - Returns orderId, amount, currency

- `verifyPayment()`: Verifies payment and upgrades subscription
  - Validates Razorpay signature (optional in dev)
  - Updates payment status to 'success'
  - Updates user subscription:
    - Sets `SubscriptionPlan`
    - Sets `SubscriptionExpiry` (1 month from now)
    - Sets `IsPremium = 1`

## Frontend Changes

### 1. Pricing Page (`src/pages/Pricing.jsx`)
**New page with:**
- 3 pricing cards (Free, Basic ₹49, Premium ₹99)
- Feature comparison
- Upgrade buttons that trigger Razorpay payment
- FAQ section
- Responsive design with gradient styling

**Payment Flow:**
1. User clicks "Upgrade" button
2. Frontend calls `createPaymentOrder()` API
3. Razorpay checkout modal opens
4. User completes payment
5. `handler()` callback verifies payment
6. User redirected to dashboard with upgraded access

### 2. Module Catalog (`src/components/ModuleCatalog/ModuleCatalog.jsx`)
**Updates:**
- Premium modules now clickable (previously locked)
- Click on locked module → Redirects to `/pricing`
- Visual changes:
  - Premium badge styling
  - Hover effects on all cards
  - "🔓 Upgrade to unlock →" text for locked modules

**Access Detection:**
- Uses `HasAccess` flag from backend
- Shows lock icon if `IsPremium && !HasAccess`

### 3. App Routes (`src/App.jsx`)
- Added `/pricing` route (protected)
- Imports Pricing component

### 4. API Service (`src/services/api.js`)
- Already had `createPaymentOrder()` and `verifyPayment()` functions

### 5. Index HTML (`frontend/index.html`)
- Added Razorpay SDK script:
  ```html
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  ```

## Environment Variables

### Frontend (`.env`)
```
VITE_API_URL=http://localhost:5000/api
VITE_RAZORPAY_KEY=rzp_test_your_key_here
```

### Backend (`.env`)
```
RAZORPAY_KEY_ID=your_key_id
RAZORPAY_KEY_SECRET=your_key_secret
```

## Testing Flow

### 1. As Free User
1. Login → Go to Dashboard
2. See all modules (free + premium with lock)
3. Click free module → Opens in workspace ✓
4. Click premium module → Redirects to /pricing ✓

### 2. Purchase Basic Plan
1. On pricing page, click "Upgrade to Basic"
2. Razorpay modal opens
3. Complete payment
4. Database updated:
   - `SubscriptionPlan = 'basic'`
   - `SubscriptionExpiry = now + 1 month`
   - `IsPremium = 1`
5. Return to dashboard
6. Some premium modules now accessible (based on admin settings)

### 3. Purchase Premium Plan
1. Click "Upgrade to Premium"
2. Complete payment
3. Database updated: `SubscriptionPlan = 'premium'`
4. All premium modules now accessible ✓

## Admin Features (To Implement)

### Grant Basic Plan Access
Admin should be able to:
1. Select a user with basic plan
2. Choose which premium modules they can access
3. Update `PremiumModulesAccess` JSON array
4. Example: `[1, 3, 5]` (ModuleIds)

**Implementation needed in:**
- Admin Dashboard UI
- Backend API: `PATCH /api/admin/users/:id/premium-access`

## Security Notes

1. **JWT Tokens**: Include subscription info to avoid DB lookup on every request
2. **Access Control**: Double-checked on backend even if frontend shows/hides
3. **Payment Signature**: Always verify Razorpay signature in production
4. **Expiry Check**: Should add cron job to check expired subscriptions

## Future Enhancements

1. **Auto-renewal**: Integrate Razorpay subscriptions API
2. **Expiry notifications**: Email users 3 days before expiry
3. **Downgrade handling**: What happens to in-progress work?
4. **Refund flow**: 7-day money-back guarantee
5. **Analytics**: Track conversion rates, popular plans
6. **Promo codes**: Discount coupons system
7. **Trial period**: 3-day free trial for premium features

## Files Modified

### Database
- `database/03_add_subscription.sql` (NEW)

### Backend
- `src/controllers/authController.js`
- `src/controllers/moduleController.js`
- `src/controllers/paymentController.js`
- `src/models/userModel.js`
- `src/models/moduleModel.js`
- `.env.example`

### Frontend
- `src/pages/Pricing.jsx` (NEW)
- `src/components/ModuleCatalog/ModuleCatalog.jsx`
- `src/App.jsx`
- `index.html`
- `.env.example`

## Status
✅ Database schema updated
✅ Backend access control implemented
✅ Pricing page created
✅ Module catalog updated (clickable premium modules)
✅ Payment flow integrated
✅ Razorpay script added

🔄 Pending:
- Admin UI for managing basic plan access
- Subscription expiry handling
- Email notifications
- Testing with real Razorpay credentials
