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

module.exports = { sendOtpEmail, sendSignupOtpEmail };
