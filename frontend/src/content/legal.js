/* Editable legal copy. Written from what the app actually does today
   (JWT in localStorage, theme preference in localStorage, Razorpay
   payments table, OTP emails). Have it reviewed against your real
   deployment before launch — it is a starting point, not legal advice.
   Placeholders marked [TODO] need project-specific details. */

export const LAST_UPDATED = '2026-10-10';

export const LEGAL = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      {
        h: 'What we collect',
        p: [
          'Account details you provide when registering: full name, email address and a password (stored only as a hash).',
          'Learning activity: the code you run or save, the language and module used, execution results and errors, and feedback you submit.',
          'Billing records for plans you purchase (order, status and amount). Card details are handled by the payment provider (Razorpay) and are not stored by DSVP.',
        ],
      },
      {
        h: 'How we use it',
        p: [
          'To run your account, execute and visualize your code, show your progress and reports, process payments and coins, and respond to feedback.',
          'We send emails only for account actions such as email verification, password reset and account status changes.',
        ],
      },
      {
        h: 'Code you submit',
        p: ['Code you run is executed on our servers to generate the visualization trace. Do not submit secrets or personal data in code.'],
      },
      {
        h: 'Sharing',
        p: ['We do not sell your data. It is shared only with service providers needed to operate DSVP (for example email delivery and payment processing).'],
      },
      {
        h: 'Your choices',
        p: ['You can update your profile in the app. To request account deletion or a copy of your data, contact us: [TODO: add support contact].'],
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      {
        h: 'Using DSVP',
        p: [
          'DSVP is an educational platform for visualizing data structures and program execution. You are responsible for your account and for keeping your password secure.',
        ],
      },
      {
        h: 'Acceptable use',
        p: [
          'Do not attempt to break out of the code sandbox, overload the service, access other users\' data, or submit code intended to harm the platform or others. Accounts that do so may be blocked.',
        ],
      },
      {
        h: 'Plans, payments and coins',
        p: [
          'Some modules require a paid plan. Coins are a platform reward with no cash value and may be used only as described in the app. Plan and coin rules may change; see the Pricing and Coins pages for current terms.',
        ],
      },
      {
        h: 'Availability',
        p: ['The service is provided "as is" without warranties. Features may change or be unavailable from time to time.'],
      },
      {
        h: 'Contact',
        p: ['Questions about these terms: [TODO: add support contact].'],
      },
    ],
  },
  cookies: {
    title: 'Cookies & Browser Storage',
    sections: [
      {
        h: 'What DSVP stores in your browser',
        p: [
          'dsvp_token — your sign-in token (localStorage). Required to keep you logged in; removed when you log out.',
          'Theme preference — your light/dark choice (localStorage).',
          'dsvp_tour_done — remembers that you completed the product tour (localStorage).',
        ],
      },
      {
        h: 'Cookies and tracking',
        p: ['DSVP does not set advertising or analytics cookies. If that changes, this page will be updated.'],
      },
      {
        h: 'Clearing it',
        p: ['Logging out removes your sign-in token. You can clear the rest from your browser\'s site-data settings.'],
      },
    ],
  },
};
