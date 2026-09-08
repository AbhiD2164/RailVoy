const nodemailer = require('nodemailer');

// Console Logger for All Outgoing Emails
const logEmailToConsole = (to, subject, text, type = 'NOTIFICATION') => {
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log('\n' + '═'.repeat(75));
  console.log(`  📬 [RAILVOY DISPATCH] EMAIL SENT TO CONSOLE — ${type}`);
  console.log(`  ⏰ TIMESTAMP : ${timestamp}`);
  console.log(`  👤 TO        : ${to}`);
  console.log(`  📋 SUBJECT   : ${subject}`);
  console.log('─'.repeat(75));
  console.log(text.trim());
  console.log('═'.repeat(75) + '\n');
};

// Create test or SMTP transport
let transporter = null;

const getTransporter = async () => {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000
    });
  } else {
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000
      });
    } catch (err) {
      transporter = null;
    }
  }

  return transporter;
};

// Wrapper that logs email to console and attempts SMTP dispatch
const safeSendMail = async (mailOptions, emailType = 'NOTIFICATION') => {
  // Always log to console first for full local visibility
  logEmailToConsole(mailOptions.to, mailOptions.subject, mailOptions.text || mailOptions.html, emailType);

  try {
    const mailer = await getTransporter();
    if (mailer) {
      const info = await mailer.sendMail(mailOptions);
      if (nodemailer.getTestMessageUrl && info) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) console.log(`  🔗 Webmail Preview URL: ${previewUrl}`);
      }
      return info;
    }
  } catch (err) {
    // SMTP failure is non-fatal since console log is primary
    return { messageId: 'console-dispatched-' + Date.now() };
  }
  return { messageId: 'console-dispatched-' + Date.now() };
};

// 1. Send OTP Email
const sendOTPEmail = async (email, otp) => {
  const textContent = `
Dear Passenger,

Your One-Time Password (OTP) for RailVoy account authentication is:

    ======================
         ${otp}
    ======================

This OTP is valid for 10 minutes. For your security, never share this OTP with anyone.

RailVoy National Passenger Reservation System
`;

  return safeSendMail({
    from: '"RailVoy Verification" <no-reply@railvoy.com>',
    to: email,
    subject: 'RailVoy - Your One-Time Password (OTP)',
    text: textContent,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #0f172a; color: #f8fafc;">
        <h2 style="color: #38bdf8; text-align: center; margin-top: 0;">RailVoy Authentication</h2>
        <p>Dear Passenger,</p>
        <p>Your One-Time Password (OTP) for account verification is:</p>
        <div style="background: #1e293b; padding: 16px; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #38bdf8; margin: 16px 0; border: 1px dashed #0284c7;">
          ${otp}
        </div>
        <p style="font-size: 13px; color: #94a3b8;">This OTP is valid for 10 minutes. Please do not share this code with anyone for your security.</p>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
        <p style="font-size: 11px; text-align: center; color: #64748b;">RailVoy National Passenger Reservation & Transit System</p>
      </div>
    `
  }, 'AUTHENTICATION OTP');
};

// 2. Send Booking Notification Email (PNR + Security Passkey only - NO ticket attachment)
const sendTicketEmail = async (email, bookingDetails, plainPasscode) => {
  const textContent = `
================================================================================
             RAILVOY OFFICIAL BOOKING CONFIRMATION & ACCESS CREDENTIALS
================================================================================
Dear Passenger,

Your ticket reservation request has been processed successfully!

BOOKING SUMMARY:
--------------------------------------------------------------------------------
• PRN / PNR Number    : ${bookingDetails.pnr}
• Security Passkey     : ${plainPasscode}
• Train               : ${bookingDetails.trainName} (#${bookingDetails.trainNo})
• Route               : ${bookingDetails.fromStation} → ${bookingDetails.toStation}
• Travel Date & Class : ${bookingDetails.travelDate} (${bookingDetails.travelClass})
• Booking Status      : ${bookingDetails.status}
• Total Fare Paid     : ₹${bookingDetails.finalFare}
--------------------------------------------------------------------------------

[CRITICAL SECURITY & DOWNLOAD NOTICE]
To prevent digital ticket forgery and unauthorized tampering, your full e-Ticket
PDF is NOT sent via email. 

HOW TO DOWNLOAD YOUR OFFICIAL e-TICKET:
1. Visit the RailVoy portal (or open the "My Tickets / Download" tab).
2. Enter your PNR Number: ${bookingDetails.pnr}
3. Enter your 4-Digit Security Passkey: ${plainPasscode}
4. Click "Unlock & Download Official e-Ticket PDF".

Have a safe and pleasant journey!
RailVoy National Passenger Reservation & Transit System
================================================================================
`;

  return safeSendMail({
    from: '"RailVoy Reservations" <reservations@railvoy.com>',
    to: email,
    subject: `RailVoy Booking Confirmed - PNR: ${bookingDetails.pnr} (Security Passkey Enclosed)`,
    text: textContent,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #334155; border-radius: 14px; padding: 24px; background: #0f172a; color: #f8fafc;">
        <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 18px;">
          <h2 style="color: #38bdf8; margin: 0; font-size: 22px; letter-spacing: 1px;">RAILVOY PASSENGER RESERVATION</h2>
          <span style="color: #94a3b8; font-size: 12px;">Booking Confirmation & Access Passkey</span>
        </div>

        <p style="font-size: 14px;">Dear Passenger,</p>
        <p style="font-size: 13px; color: #cbd5e1;">Your railway reservation has been confirmed. Below are your official access credentials to view and download your e-Ticket PDF.</p>

        <div style="background: #1e293b; border-radius: 10px; padding: 16px; margin: 18px 0; border: 1px solid #334155;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #94a3b8;"><strong>PNR / PRN Number:</strong></td>
              <td style="text-align: right; font-family: monospace; font-size: 18px; color: #38bdf8; font-weight: bold;">${bookingDetails.pnr}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #94a3b8;"><strong>4-Digit Security Passkey:</strong></td>
              <td style="text-align: right; font-family: monospace; font-size: 18px; color: #34d399; font-weight: bold;">${plainPasscode}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #94a3b8;">Train:</td>
              <td style="text-align: right; color: #f1f5f9;">${bookingDetails.trainName} (#${bookingDetails.trainNo})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #94a3b8;">Journey Route:</td>
              <td style="text-align: right; color: #f1f5f9;">${bookingDetails.fromStation} &rarr; ${bookingDetails.toStation}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #94a3b8;">Date &amp; Class:</td>
              <td style="text-align: right; color: #f1f5f9;">${bookingDetails.travelDate} (${bookingDetails.travelClass})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #94a3b8;">Status:</td>
              <td style="text-align: right; color: #34d399; font-weight: bold;">${bookingDetails.status}</td>
            </tr>
          </table>
        </div>

        <div style="background: #1e1b4b; border-left: 4px solid #6366f1; padding: 14px; border-radius: 8px; margin: 18px 0;">
          <h4 style="margin: 0 0 6px 0; color: #a5b4fc; font-size: 13px;">🔒 High-Security Ticket Protection Notice</h4>
          <p style="margin: 0; font-size: 12px; color: #c7d2fe; line-height: 1.5;">
            To maintain cryptographic integrity and prevent forged tickets, generated tickets are <strong>not attached directly to email</strong>.
            Please access the <strong>RailVoy Portal</strong>, enter your PNR <strong>${bookingDetails.pnr}</strong> and Passkey <strong>${plainPasscode}</strong> to download your official verified e-Ticket PDF.
          </p>
        </div>

        <div style="text-align: center; margin-top: 24px; padding-top: 14px; border-top: 1px solid #334155; font-size: 11px; color: #64748b;">
          RailVoy National Passenger Reservation &amp; Transit System &bull; Anti-Forgery e-Ticket System
        </div>
      </div>
    `
  }, 'BOOKING CONFIRMATION & PASSKEY');
};

// 3. Send Password Reset OTP Email
const sendPasswordResetEmail = async (email, otp) => {
  const textContent = `
Dear Passenger,

We received a request to reset the password for your RailVoy account (${email}).

Your 6-digit Password Reset Verification Code is:

    ======================
         ${otp}
    ======================

This code is valid for 10 minutes. If you did not request a password reset, please ignore this email or secure your account.

RailVoy National Passenger Reservation & Transit System
`;

  return safeSendMail({
    from: '"RailVoy Security" <security@railvoy.com>',
    to: email,
    subject: 'RailVoy - Password Reset Verification Code',
    text: textContent,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #0f172a; color: #f8fafc;">
        <h2 style="color: #f59e0b; text-align: center; margin-top: 0;">Password Reset Request</h2>
        <p>Dear Passenger,</p>
        <p>You requested to reset your password for your RailVoy account. Use the code below to complete the reset:</p>
        <div style="background: #1e293b; padding: 16px; border-radius: 8px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #f59e0b; margin: 16px 0; border: 1px dashed #d97706;">
          ${otp}
        </div>
        <p style="font-size: 13px; color: #94a3b8;">This code expires in 10 minutes. If you did not make this request, you can safely ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
        <p style="font-size: 11px; text-align: center; color: #64748b;">RailVoy National Passenger Reservation & Transit System &bull; Account Security</p>
      </div>
    `
  }, 'PASSWORD RESET CODE');
};

module.exports = {
  sendOTPEmail,
  sendTicketEmail,
  sendPasswordResetEmail
};

