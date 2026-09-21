const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // STARTTLS
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
      <div style="background:linear-gradient(135deg,#1F4E79,#2E74B5);padding:28px 32px;">
       <div style="
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: linear-gradient(135deg, #2E74B5, #4CAF50);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        font-weight: 800;
        color: #fff;
        flex-shrink: 0;
    ">D</div>
        <span style="font-size:20px;font-weight:700;color:#fff;">DSVP</span>
        </div>
      </div>

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
  });
}

async function sendSignupOtpEmail(toEmail, otp, expiresMin = 10) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || `"DSVP Platform" <${process.env.SMTP_USER}>`;

  const html = `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1F4E79,#2E74B5);padding:28px 32px;display:flex;align-items:center;gap:10px;">
        <div style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;">D</div>
        <span style="font-size:20px;font-weight:700;color:#fff;">DSVP</span>
      </div>

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
  });
}

function baseWrapper(bodyHtml) {
  return `
    <div style="font-family:'Inter',Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1F4E79,#2E74B5);padding:28px 32px;">
        <span style="font-size:20px;font-weight:700;color:#fff;">DSVP</span>
      </div>
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
  });
}

module.exports = {
  sendOtpEmail, sendSignupOtpEmail,
  sendAdminPasswordResetEmail, sendAccountStatusEmail,
};
