const path = require('path');
const nodemailer = require('nodemailer');

// Same DSVP icon the frontend uses, embedded inline (CID) so it shows in
// mail clients without needing a publicly reachable image URL.
const LOGO_CID = 'dsvp-logo';
const LOGO_ATTACHMENT = {
  filename: 'logo.png',
  path: path.join(__dirname, '..', 'assets', 'logo.png'),
  cid: LOGO_CID,
};

function brandHeader() {
  return `
      <div style="background:linear-gradient(135deg,#1F4E79,#2E74B5);padding:24px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;padding-right:12px;">
            <img src="cid:${LOGO_CID}" alt="DSVP" width="44" height="44" style="display:block;border-radius:10px;border:0;" />
          </td>
          <td style="vertical-align:middle;">
            <div style="font-size:20px;font-weight:700;color:#fff;line-height:1.2;">DSVP</div>
            <div style="font-size:12px;color:#cfe3f5;line-height:1.3;">Data Structure Visualization Platform</div>
          </td>
        </tr></table>
      </div>`;
}

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    service: 'gmail',
    family: 4,                // Render can't reach Gmail over IPv6; force IPv4
    pool: true,               // reuse one SMTP connection instead of a new TLS handshake per mail
    maxConnections: 3,
    connectionTimeout: 10000, // fail fast instead of hanging
    greetingTimeout: 10000,
    socketTimeout: 20000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transporter;
}

/**
 * Send OTP email for forgot-password flow.
 * @param {string} toEmail   recipient address
 * @param {string} otp       6-digit code
 * @param {number} expiresMin minutes until expiry
 */
async function sendOtpEmail(toEmail, otp, expiresMin = 10) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || `"DSVP Platform" <${process.env.SMTP_USER}>`;
  const html = `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
${brandHeader()}

      <div style="padding:32px;">
        <h2 style="font-size:20px;font-weight:800;color:#1e293b;margin:0 0 8px;">Password Reset OTP</h2>
        <p style="font-size:14px;color:#64748b;margin:0 0 28px;line-height:1.6;">
          We received a request to reset your DSVP account password.
          Use the OTP below to continue. It expires in <strong>${expiresMin} minutes</strong>.
        </p>

        <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <div style="font-size:38px;font-weight:800;letter-spacing:12px;color:#1F4E79;font-family:monospace;">
            ${otp}
          </div>
        </div>

        <p style="font-size:13px;color:#94a3b8;margin:0;">
          If you didn't request this, you can safely ignore this email.
          Your password will not be changed.
        </p>
      </div>

      <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
        <p style="font-size:12px;color:#94a3b8;margin:0;text-align:center;">
          © ${new Date().getFullYear()} DSVP Platform · This is an automated message
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to:      toEmail,
    subject: `${otp} is your DSVP password reset OTP`,
    text:    `Your DSVP password reset OTP is: ${otp}\n\nIt expires in ${expiresMin} minutes.\n\nIf you didn't request this, ignore this email.`,
    html,
    attachments: [LOGO_ATTACHMENT],
  });
}

async function sendSignupOtpEmail(toEmail, otp, expiresMin = 10) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || `"DSVP Platform" <${process.env.SMTP_USER}>`;

  const html = `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
${brandHeader()}

      <div style="padding:32px;">
        <h2 style="font-size:20px;font-weight:800;color:#1e293b;margin:0 0 8px;">Verify your email</h2>
        <p style="font-size:14px;color:#64748b;margin:0 0 28px;line-height:1.6;">
          Welcome to DSVP! Use the OTP below to verify your email and complete your registration.
          It expires in <strong>${expiresMin} minutes</strong>.
        </p>

        <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
          <div style="font-size:38px;font-weight:800;letter-spacing:12px;color:#1F4E79;font-family:monospace;">
            ${otp}
          </div>
        </div>

        <p style="font-size:13px;color:#94a3b8;margin:0;">
          If you didn't create a DSVP account, you can safely ignore this email.
        </p>
      </div>

      <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
        <p style="font-size:12px;color:#94a3b8;margin:0;text-align:center;">
          © ${new Date().getFullYear()} DSVP Platform · This is an automated message
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to:      toEmail,
    subject: `${otp} — Verify your DSVP account`,
    text:    `Your DSVP email verification OTP is: ${otp}\n\nIt expires in ${expiresMin} minutes.\n\nIf you didn't sign up, ignore this email.`,
    html,
    attachments: [LOGO_ATTACHMENT],
  });
}

function baseWrapper(bodyHtml) {
  return `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
${brandHeader()}
      <div style="padding:32px;">${bodyHtml}</div>
      <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
        <p style="font-size:12px;color:#94a3b8;margin:0;text-align:center;">
          © ${new Date().getFullYear()} DSVP Platform · This is an automated message
        </p>
      </div>
    </div>
  `;
}

/**
 * Admin-initiated password reset — sends a secure single-use LINK, never a
 * plaintext password. The link's token is the same short-lived JWT the
 * self-service "forgot password" flow already issues and verifies.
 */
async function sendAdminPasswordResetEmail(toEmail, fullName, resetLink) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || `"DSVP Platform" <${process.env.SMTP_USER}>`;

  const html = baseWrapper(`
    <h2 style="font-size:20px;font-weight:800;color:#1e293b;margin:0 0 8px;">Password Reset Request</h2>
    <p style="font-size:14px;color:#64748b;margin:0 0 24px;line-height:1.6;">
      Hello ${fullName || ''},<br/><br/>
      Your password reset was requested by an administrator. All your current
      sessions have been ended for security. Use the secure link below to set
      a new password.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${resetLink}" style="display:inline-block;padding:12px 28px;border-radius:10px;
        background:linear-gradient(135deg,#2E74B5,#1F4E79);color:#fff;font-weight:700;
        font-size:14px;text-decoration:none;">Reset Password</a>
    </div>
    <p style="font-size:13px;color:#94a3b8;margin:0;">
      This link expires soon and can only be used once. If you didn't expect this, contact support.
    </p>
  `);

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Password Reset Request',
    text: `Hello ${fullName || ''},\n\nYour password reset was requested by an administrator. Use this link to set a new password (expires soon, single use):\n\n${resetLink}\n\nIf you didn't expect this, contact support.`,
    html,
    attachments: [LOGO_ATTACHMENT],
  });
}

const STATUS_COPY = {
  blocked: {
    subject: 'Your account has been blocked',
    heading: 'Account Blocked',
    body: 'Your DSVP account has been blocked by an administrator. You no longer have access to the platform. If you believe this is a mistake, please contact support.',
  },
  inactive: {
    subject: 'Your account has been deactivated',
    heading: 'Account Deactivated',
    body: 'Your DSVP account has been deactivated by an administrator. Your access has been suspended. Contact support if you have questions or wish to reactivate.',
  },
  active: {
    subject: 'Your account has been activated',
    heading: 'Account Activated',
    body: 'Your DSVP account is active again. You can now log in and use the platform as usual.',
  },
};

/**
 * Notifies a user their account status changed (block / deactivate / activate).
 * @param {'blocked'|'inactive'|'active'} status
 */
async function sendAccountStatusEmail(status, toEmail, fullName) {
  const copy = STATUS_COPY[status];
  if (!copy) return;
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || `"DSVP Platform" <${process.env.SMTP_USER}>`;

  const html = baseWrapper(`
    <h2 style="font-size:20px;font-weight:800;color:#1e293b;margin:0 0 8px;">${copy.heading}</h2>
    <p style="font-size:14px;color:#64748b;margin:0;line-height:1.6;">
      Hello ${fullName || ''},<br/><br/>${copy.body}
    </p>
  `);

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: copy.subject,
    text: `Hello ${fullName || ''},\n\n${copy.body}`,
    html,
    attachments: [LOGO_ATTACHMENT],
  });
}

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Welcome email for a brand-new Google-created account. Carries the
 * account identifier and a short-lived temporary password, for OPTIONAL
 * password-based login (Google sign-in itself never needs it). The first
 * password login forces a change. Never logged; sent once per account
 * (resent only if the first delivery failed).
 */
async function sendWelcomeCredentialsEmail(toEmail, fullName, tempPassword, expiresMin, loginUrl) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || `"DSVP Platform" <${process.env.SMTP_USER}>`;
  const name = escapeHtml(fullName);

  const html = baseWrapper(`
    <h2 style="font-size:20px;font-weight:800;color:#1e293b;margin:0 0 8px;">Welcome to DSVP</h2>
    <p style="font-size:14px;color:#64748b;margin:0 0 20px;line-height:1.6;">
      Hello ${name},<br/><br/>
      Your DSVP account was created with your Google account. You can keep
      signing in with <strong>Continue with Google</strong> — no password needed.
      If you'd also like to sign in with email and password, use these details:
    </p>
    <div style="background:#f1f5f9;border-radius:12px;padding:20px;margin-bottom:20px;">
      <div style="font-size:12px;color:#64748b;margin-bottom:2px;">Account (email)</div>
      <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:14px;word-break:break-all;">${escapeHtml(toEmail)}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:2px;">Temporary password</div>
      <div style="font-size:20px;font-weight:800;color:#1F4E79;font-family:monospace;letter-spacing:1px;word-break:break-all;">${escapeHtml(tempPassword)}</div>
    </div>
    <p style="font-size:13px;color:#64748b;margin:0 0 20px;line-height:1.6;">
      This temporary password expires in <strong>${expiresMin} minutes</strong> and you'll be asked
      to choose a new password the first time you use it. If it expires, use
      <em>Forgot password</em> on the sign-in page.
    </p>
    ${loginUrl ? `<div style="text-align:center;margin-bottom:20px;">
      <a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:12px 28px;border-radius:10px;
        background:linear-gradient(135deg,#2E74B5,#1F4E79);color:#fff;font-weight:700;
        font-size:14px;text-decoration:none;">Go to DSVP</a></div>` : ''}
    <p style="font-size:13px;color:#94a3b8;margin:0;">
      If you didn't create this account, ignore this email and contact support.
    </p>
  `);

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Welcome to DSVP — your account details',
    text: `Hello ${fullName || ''},\n\nYour DSVP account was created with your Google account. You can keep signing in with "Continue with Google".\n\nTo also sign in with a password:\n  Account: ${toEmail}\n  Temporary password: ${tempPassword}\n\nThe temporary password expires in ${expiresMin} minutes and must be changed on first use. If it expires, use "Forgot password".\n\nIf you didn't create this account, ignore this email and contact support.`,
    html,
    attachments: [LOGO_ATTACHMENT],
  });
}

/** Security notice: a Google account was linked to an existing password account. */
async function sendGoogleLinkedNoticeEmail(toEmail, fullName) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || `"DSVP Platform" <${process.env.SMTP_USER}>`;
  const html = baseWrapper(`
    <h2 style="font-size:20px;font-weight:800;color:#1e293b;margin:0 0 8px;">Google account linked</h2>
    <p style="font-size:14px;color:#64748b;margin:0;line-height:1.6;">
      Hello ${escapeHtml(fullName)},<br/><br/>
      A Google account with this email address was just linked to your DSVP account, and
      your other sessions were signed out. If this was you, no action is needed. If not,
      reset your password right away with <em>Forgot password</em> and contact support.
    </p>
  `);
  await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Google account linked to your DSVP account',
    text: `Hello ${fullName || ''},\n\nA Google account with this email address was just linked to your DSVP account and your other sessions were signed out. If this wasn't you, reset your password with "Forgot password" and contact support.`,
    html,
    attachments: [LOGO_ATTACHMENT],
  });
}

module.exports = {
  sendOtpEmail, sendSignupOtpEmail,
  sendAdminPasswordResetEmail, sendAccountStatusEmail,
  sendWelcomeCredentialsEmail, sendGoogleLinkedNoticeEmail,
};
