import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPaymentOrder, verifyPayment, getCoinDiscountQuote } from '../services/api';
import { useAuth } from '../context/AuthContext';

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    duration: 'Forever',
    features: [
      'Access to free modules',
      'Basic array visualization',
      'Code execution',
      'Community support'
    ],
    buttonText: 'Current Plan',
    highlighted: false
  },
  {
    id: 'basic',
    name: 'Basic',
    price: 49,
    duration: '1 Month',
    features: [
      'All free features',
      'Access to some premium modules',
      'Priority execution',
      'Email support',
      'Faster visualization'
    ],
    buttonText: 'Upgrade to Basic',
    highlighted: false
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 99,
    duration: '1 Month',
    features: [
      'All basic features',
      'Access to ALL premium modules',
      'Unlimited executions',
      'Priority support',
      'Advanced visualizations',
      'Export code & traces'
    ],
    buttonText: 'Upgrade to Premium',
    highlighted: true
  }
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');
  const [useCoins, setUseCoins] = useState({}); // { [planId]: bool }
  const [quotes, setQuotes] = useState({});     // { [planId]: { discount, coinsUsed } }

  const currentPlan = user?.SubscriptionPlan || 'free';
  const canUseCoins = user?.CoinsUnlocked && (user?.CoinBalance || 0) > 0;

  async function toggleUseCoins(plan) {
    const next = !useCoins[plan.id];
    setUseCoins(u => ({ ...u, [plan.id]: next }));
    if (next && !quotes[plan.id]) {
      try {
        const r = await getCoinDiscountQuote(user.CoinBalance, plan.price);
        setQuotes(q => ({ ...q, [plan.id]: r.data }));
      } catch { /* ignore — fall back to no discount if the quote fails */ }
    }
  }

  async function handleUpgrade(plan) {
    if (plan.id === 'free') return;

    setLoading(plan.id);
    setError('');

    try {
      const coinsToRedeem = useCoins[plan.id] ? (user.CoinBalance || 0) : 0;

      // Create payment order
      const orderRes = await createPaymentOrder({
        plan: plan.id,
        amount: plan.price,
        coinsToRedeem,
      });

      const order = orderRes.data;

      if (typeof window.Razorpay !== 'function') {
        setError('Payment gateway failed to load. Check your internet connection or disable any ad-blocker, then try again.');
        setLoading(null);
        return;
      }

      // Razorpay options
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY || 'rzp_test_dummy',
        amount: order.amount,
        currency: order.currency,
        name: 'DSVP - Algorithm Visualizer',
        description: `${plan.name} Plan - ${plan.duration}`,
        order_id: order.orderId,
        handler: async function (response) {
          try {
            // Verify payment
            const verifyRes = await verifyPayment({
              orderId: order.orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature
            });

            // The JWT bakes in subscriptionPlan/module access, so without a
            // fresh token + user object the app would keep treating this
            // browser session as the old (free) plan until next login.
            if (verifyRes.data.token) {
              localStorage.setItem('dsvp_token', verifyRes.data.token);
            }
            if (verifyRes.data.user) {
              updateUser(verifyRes.data.user);
            }

            const coinMsg = order.discount > 0 ? ` (₹${order.discount} off using ${order.coinsUsed} coins)` : '';
            alert(`🎉 Successfully upgraded to ${plan.name} plan!${coinMsg}`);
            navigate('/dashboard');
          } catch (err) {
            setError('Payment verification failed. Please contact support.');
          }
        },
        prefill: {
          email: localStorage.getItem('dsvp_email') || ''
        },
        theme: {
          color: '#4CAF50'
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
      
    } catch (err) {
      const backendMsg = err.response?.data?.message;
      const fallback = err.request
        ? 'Could not reach the server. Please check your connection and try again.'
        : 'Failed to initiate payment';
      setError(backendMsg || fallback);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%)',
      padding: '80px 20px 40px',
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center', marginBottom: 60 }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            position: 'absolute',
            top: 20,
            left: 20,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#e6edf3',
            padding: '8px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14
          }}
        >
          ← Back to Dashboard
        </button>

        <h1 style={{
          fontSize: 48,
          fontWeight: 800,
          background: 'linear-gradient(135deg, #4CAF50, #2E74B5)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 16
        }}>
          Choose Your Plan
        </h1>
        <p style={{ fontSize: 18, color: '#8b949e', maxWidth: 600, margin: '0 auto' }}>
          Unlock premium features and accelerate your learning journey
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          maxWidth: 1200,
          margin: '0 auto 30px',
          padding: 16,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8,
          color: '#fca5a5',
          textAlign: 'center'
        }}>
          {error}
        </div>
      )}

      {/* Pricing Cards */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 30
      }}>
        {PLANS.map(plan => {
        const isCurrent = plan.id === currentPlan;
        const rank = { free: 0, basic: 1, premium: 2 };
        const isDowngrade = rank[plan.id] < rank[currentPlan];
        return (
          <div
            key={plan.id}
            style={{
              background: plan.highlighted 
                ? 'linear-gradient(135deg, rgba(76,175,80,0.15), rgba(46,116,181,0.15))'
                : 'rgba(255,255,255,0.03)',
              border: plan.highlighted
                ? '2px solid rgba(76,175,80,0.5)'
                : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 16,
              padding: 32,
              position: 'relative',
              transform: plan.highlighted ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 200ms'
            }}
          >
            {plan.highlighted && (
              <div style={{
                position: 'absolute',
                top: -12,
                right: 24,
                background: 'linear-gradient(135deg, #4CAF50, #2E74B5)',
                color: '#fff',
                padding: '4px 16px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700
              }}>
                MOST POPULAR
              </div>
            )}

            <h3 style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#e6edf3',
              marginBottom: 8
            }}>
              {plan.name}
            </h3>

            <div style={{ marginBottom: 24 }}>
              <span style={{
                fontSize: 48,
                fontWeight: 800,
                color: plan.highlighted ? '#4CAF50' : '#e6edf3'
              }}>
                ₹{plan.price}
              </span>
              <span style={{ color: '#8b949e', fontSize: 16, marginLeft: 8 }}>
                / {plan.duration}
              </span>
            </div>

            <ul style={{
              listStyle: 'none',
              padding: 0,
              margin: '0 0 32px 0'
            }}>
              {plan.features.map((feature, idx) => (
                <li
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    marginBottom: 12,
                    color: '#c9d1d9',
                    fontSize: 14
                  }}
                >
                  <span style={{ color: '#4CAF50', fontSize: 18 }}>✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            {canUseCoins && plan.id !== 'free' && !isCurrent && !isDowngrade && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(242,169,59,0.08)', border: '1px solid rgba(242,169,59,0.25)',
                fontSize: 12.5, color: '#fcd34d', cursor: 'pointer',
              }}>
                <input type="checkbox" checked={!!useCoins[plan.id]} onChange={() => toggleUseCoins(plan)} />
                🪙 Use my {user.CoinBalance} coins
                {useCoins[plan.id] && quotes[plan.id]?.discount > 0 && (
                  <span style={{ fontWeight: 700, color: '#4CAF50' }}>· ₹{quotes[plan.id].discount} off</span>
                )}
              </label>
            )}

            <button
              onClick={() => handleUpgrade(plan)}
              disabled={loading === plan.id || plan.id === 'free' || isCurrent || isDowngrade}
              style={{
                width: '100%',
                padding: '14px 24px',
                borderRadius: 8,
                border: 'none',
                background: isCurrent
                  ? 'rgba(76,175,80,0.35)'
                  : plan.id === 'free'
                    ? 'rgba(255,255,255,0.1)'
                    : plan.highlighted
                      ? 'linear-gradient(135deg, #4CAF50, #2E74B5)'
                      : 'rgba(76,175,80,0.2)',
                color: '#fff',
                fontSize: 16,
                fontWeight: 700,
                cursor: (plan.id === 'free' || isCurrent || isDowngrade) ? 'not-allowed' : 'pointer',
                opacity: loading === plan.id ? 0.6 : 1,
                transition: 'all 200ms'
              }}
            >
              {loading === plan.id
                ? 'Processing...'
                : isCurrent
                  ? '✓ Current Plan'
                  : isDowngrade
                    ? 'Included in your plan'
                    : plan.buttonText}
            </button>
          </div>
        );
        })}
      </div>

      {/* FAQ Section */}
      <div style={{
        maxWidth: 800,
        margin: '80px auto 0',
        padding: '40px 32px',
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <h2 style={{
          fontSize: 28,
          fontWeight: 700,
          color: '#e6edf3',
          marginBottom: 24,
          textAlign: 'center'
        }}>
          Frequently Asked Questions
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <FAQ
            question="Can I upgrade or downgrade my plan?"
            answer="Yes! You can upgrade to a higher plan anytime. Downgrade will take effect after your current billing cycle."
          />
          <FAQ
            question="What payment methods do you accept?"
            answer="We accept all major credit/debit cards, UPI, net banking, and wallets through Razorpay."
          />
          <FAQ
            question="Is there a refund policy?"
            answer="Yes, we offer a 7-day money-back guarantee if you're not satisfied with the premium features."
          />
          <FAQ
            question="What happens when my subscription expires?"
            answer="You'll be automatically moved to the free plan. Your progress and data will be preserved."
          />
        </div>
      </div>
    </div>
  );
}

function FAQ({ question, answer }) {
  return (
    <div>
      <h4 style={{
        color: '#e6edf3',
        fontSize: 16,
        fontWeight: 600,
        marginBottom: 8
      }}>
        {question}
      </h4>
      <p style={{
        color: '#8b949e',
        fontSize: 14,
        lineHeight: 1.6,
        margin: 0
      }}>
        {answer}
      </p>
    </div>
  );
}
