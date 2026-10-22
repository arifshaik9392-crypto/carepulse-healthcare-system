// server/otpService.js - Production-ready OTP engine for Email & Phone verification
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const https = require('https');

// In-memory active OTP store with security constraints
// Key: identifier (email or phone)
// Value: { codeHash, expiresAt, attemptsLeft, lastSentAt, role, profileData }
const otpStore = new Map();

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

class OtpService {
  constructor() {
    this.refreshProviders();
  }

  refreshProviders() {
    // 1. Email Provider: SMTP / Nodemailer
    this.smtpHost = process.env.SMTP_HOST || null;
    this.smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    this.smtpUser = process.env.SMTP_USER || null;
    this.smtpPass = process.env.SMTP_PASS || null;
    this.smtpFrom = process.env.SMTP_FROM || 'CarePulse Health <no-reply@carepulse.org>';
    this.emailConfigured = !!(this.smtpHost && this.smtpUser && this.smtpPass);

    if (this.emailConfigured) {
      try {
        this.mailTransporter = nodemailer.createTransport({
          host: this.smtpHost,
          port: this.smtpPort,
          secure: this.smtpPort === 465,
          auth: {
            user: this.smtpUser,
            pass: this.smtpPass
          }
        });
      } catch (err) {
        console.error("[OTP SERVICE] Failed to initialize SMTP mail transporter:", err.message);
        this.mailTransporter = null;
        this.emailConfigured = false;
      }
    } else {
      this.mailTransporter = null;
    }

    // 2. Phone / SMS Providers: Twilio (Messages or Verify Service) or Fast2SMS or Firebase Auth
    this.twilioSid = process.env.TWILIO_ACCOUNT_SID || null;
    this.twilioToken = process.env.TWILIO_AUTH_TOKEN || null;
    this.twilioPhone = process.env.TWILIO_PHONE_NUMBER || null;
    this.twilioVerifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || null;
    this.twilioConfigured = !!(this.twilioSid && this.twilioToken && (this.twilioPhone || this.twilioVerifyServiceSid));

    this.fast2smsKey = process.env.FAST2SMS_KEY || null;
    this.fast2smsConfigured = !!this.fast2smsKey;

    this.firebaseAuthKey = process.env.FIREBASE_AUTH_KEY || null;

    this.phoneConfigured = this.twilioConfigured || this.fast2smsConfigured || !!this.firebaseAuthKey;
  }

  getProviderStatus() {
    this.refreshProviders();
    return {
      emailOtpConfigured: this.emailConfigured,
      phoneOtpConfigured: this.phoneConfigured,
      activeEmailProvider: this.emailConfigured ? `SMTP (${this.smtpHost})` : null,
      activePhoneProvider: this.twilioVerifyServiceSid ? 'Twilio Verify' : (this.twilioPhone ? 'Twilio SMS' : (this.fast2smsConfigured ? 'Fast2SMS' : (this.firebaseAuthKey ? 'Firebase Auth' : null))),
      requiresEmailCredentials: !this.emailConfigured,
      requiresPhoneCredentials: !this.phoneConfigured,
      requiredEmailEnv: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"],
      requiredPhoneEnv: [
        "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (or TWILIO_VERIFY_SERVICE_SID)",
        "or FAST2SMS_KEY"
      ]
    };
  }

  generateSecureCode() {
    // 6-digit cryptographically secure numerical code
    return crypto.randomInt(100000, 999999).toString();
  }

  hashCode(code) {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  async dispatchEmailOtp(email, code) {
    if (!this.emailConfigured || !this.mailTransporter) {
      throw new Error("Email provider is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env to deliver real email OTPs.");
    }

    const mailOptions = {
      from: this.smtpFrom,
      to: email,
      subject: `Your CarePulse Verification Code: ${code}`,
      text: `Welcome to CarePulse.\n\nYour 6-digit verification code is: ${code}\n\nThis code will expire in 5 minutes. If you did not request this, please disregard this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
          <h2 style="color: #014BAA; margin-top: 0;">CarePulse Health</h2>
          <p style="color: #475569; font-size: 14px;">Real-Time Insights. Better Care.</p>
          <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 16px 0;" />
          <p style="color: #1e293b; font-size: 15px;">Your one-time authentication code is:</p>
          <div style="background: #F8F3F0; padding: 16px; text-align: center; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #014BAA; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #64748b; font-size: 12px;">This code is valid for 5 minutes. Never share this code with anyone.</p>
        </div>
      `
    };

    return await this.mailTransporter.sendMail(mailOptions);
  }

  async dispatchSmsOtp(phone, code) {
    const formattedPhone = phone.startsWith("+") ? phone : (phone.length === 10 ? `+91${phone}` : `+${phone}`);

    // Option A1: Twilio Verify Service (If TWILIO_VERIFY_SERVICE_SID is set)
    if (this.twilioSid && this.twilioToken && this.twilioVerifyServiceSid) {
      const auth = Buffer.from(`${this.twilioSid}:${this.twilioToken}`).toString('base64');
      const postData = new URLSearchParams({
        To: formattedPhone,
        Channel: 'sms'
      }).toString();

      return new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'verify.twilio.com',
          path: `/v2/Services/${this.twilioVerifyServiceSid}/Verifications`,
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(body));
            } else {
              reject(new Error(`Twilio Verify failed with HTTP ${res.statusCode}: ${body}`));
            }
          });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    }

    // Option A2: Twilio standard Programmable Messaging SMS API
    if (this.twilioSid && this.twilioToken && this.twilioPhone) {
      const auth = Buffer.from(`${this.twilioSid}:${this.twilioToken}`).toString('base64');
      const postData = new URLSearchParams({
        To: formattedPhone,
        From: this.twilioPhone,
        Body: `Your CarePulse verification code is: ${code}. Valid for 5 minutes.`
      }).toString();

      return new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'api.twilio.com',
          path: `/2010-04-01/Accounts/${this.twilioSid}/Messages.json`,
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(body));
            } else {
              reject(new Error(`Twilio SMS failed with HTTP ${res.statusCode}: ${body}`));
            }
          });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    }

    // Option B: Fast2SMS API (for Indian mobile numbers)
    if (this.fast2smsConfigured) {
      const clean10Digit = phone.replace(/[^0-9]/g, '').slice(-10);
      if (clean10Digit.length !== 10) {
        throw new Error("Fast2SMS requires a valid 10-digit Indian mobile number.");
      }

      // Fast2SMS bulkV2 API supports 'otp' route (for numeric OTPs)
      // or 'dlt' route if FAST2SMS_DLT_SENDER_ID and FAST2SMS_DLT_TEMPLATE_ID are configured
      const dltSenderId = process.env.FAST2SMS_DLT_SENDER_ID;
      const dltMessageId = process.env.FAST2SMS_DLT_MESSAGE_ID;

      let postData;
      if (dltSenderId && dltMessageId) {
        postData = JSON.stringify({
          route: "dlt",
          sender_id: dltSenderId,
          message: dltMessageId,
          variables_values: code,
          numbers: clean10Digit
        });
      } else {
        // Fast2SMS Quick OTP Route (Standard numerical OTP delivery)
        postData = JSON.stringify({
          route: "otp",
          variables_values: code,
          numbers: clean10Digit
        });
      }

      return new Promise((resolve, reject) => {
        const req = https.request({
          hostname: 'www.fast2sms.com',
          path: '/dev/bulkV2',
          method: 'POST',
          headers: {
            'authorization': this.fast2smsKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              // Fast2SMS returns { return: true, request_id: '...', message: [...] } on success
              if (parsed.return === true || (res.statusCode >= 200 && res.statusCode < 300 && !parsed.status_code)) {
                resolve(parsed);
              } else {
                let errorMsg = Array.isArray(parsed.message) 
                  ? parsed.message.join(', ') 
                  : (parsed.message || `Fast2SMS error code ${parsed.status_code || res.statusCode}`);
                
                if (errorMsg.includes('complete website verification')) {
                  errorMsg += " (Action required: Log in to fast2sms.com -> OTP SMS menu -> Complete Aadhaar/Website verification to activate live SMS OTP routing).";
                }
                reject(new Error(errorMsg));
              }
            } catch (err) {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve({ raw: body });
              } else {
                reject(new Error(`Fast2SMS failed with HTTP ${res.statusCode}: ${body}`));
              }
            }
          });
        });
        req.on('error', (err) => {
          reject(new Error(`Fast2SMS connection error: ${err.message}`));
        });
        req.write(postData);
        req.end();
      });
    }

    throw new Error("SMS provider is not configured. Set FAST2SMS_KEY in .env (or TWILIO credentials) to deliver real SMS OTPs.");
  }

  async requestOtp(identifier, isPhone, role, profileData = null) {
    this.refreshProviders();
    const cleanId = identifier.trim().toLowerCase();
    const now = Date.now();

    // Check resend cooldown
    const existing = otpStore.get(cleanId);
    if (existing && (now - existing.lastSentAt) < RESEND_COOLDOWN_MS) {
      const waitSecs = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
      return {
        success: false,
        status: 429,
        error: `Please wait ${waitSecs} seconds before requesting a new OTP.`
      };
    }

    const rawCode = this.generateSecureCode();
    const codeHash = this.hashCode(rawCode);

    // Attempt real delivery
    let realDeliverySucceeded = false;
    let deliveryError = null;

    if (isPhone) {
      if (this.phoneConfigured) {
        try {
          await this.dispatchSmsOtp(cleanId, rawCode);
          realDeliverySucceeded = true;
        } catch (err) {
          deliveryError = err.message;
          console.error(`[OTP DISPATCH ERROR] Failed sending real SMS to ${cleanId}:`, err.message);
        }
      }
    } else {
      if (this.emailConfigured) {
        try {
          await this.dispatchEmailOtp(cleanId, rawCode);
          realDeliverySucceeded = true;
        } catch (err) {
          deliveryError = err.message;
          console.error(`[OTP DISPATCH ERROR] Failed sending real email to ${cleanId}:`, err.message);
        }
      }
    }

    // Save to secure verification store
    otpStore.set(cleanId, {
      codeHash,
      expiresAt: now + OTP_EXPIRY_MS,
      attemptsLeft: MAX_ATTEMPTS,
      lastSentAt: now,
      isPhone,
      role,
      profileData,
      realDeliverySucceeded
    });

    // Provide strict, non-misleading response
    const providerConfigured = isPhone ? this.phoneConfigured : this.emailConfigured;

    if (!providerConfigured) {
      return {
        success: false,
        status: 503,
        configured: false,
        channel: isPhone ? 'SMS/Phone' : 'Email',
        error: isPhone 
          ? "No SMS provider configured. Please configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER (or FAST2SMS_KEY) in .env to send real SMS OTPs."
          : "No Email provider configured. Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env to deliver real Email OTPs.",
        requiredConfig: isPhone ? ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"] : ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"]
      };
    }

    if (!realDeliverySucceeded) {
      return {
        success: false,
        status: 502,
        configured: true,
        channel: isPhone ? 'SMS/Phone' : 'Email',
        error: `Delivery provider failed to dispatch ${isPhone ? 'SMS' : 'email'}: ${deliveryError}`
      };
    }

    return {
      success: true,
      delivered: true,
      expiresInSeconds: 300,
      cooldownSeconds: 60,
      channel: isPhone ? 'SMS' : 'Email'
    };
  }

  verifyOtp(identifier, code) {
    const cleanId = identifier.trim().toLowerCase();
    const record = otpStore.get(cleanId);

    if (!record) {
      return {
        success: false,
        error: "No active OTP request found for this identifier. Please request a new OTP."
      };
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      otpStore.delete(cleanId);
      return {
        success: false,
        error: "OTP has expired. Please request a new code."
      };
    }

    if (record.attemptsLeft <= 0) {
      otpStore.delete(cleanId);
      return {
        success: false,
        error: "Maximum verification attempts exceeded. Please request a fresh OTP."
      };
    }

    const providedHash = this.hashCode(code.trim());
    if (providedHash !== record.codeHash) {
      record.attemptsLeft -= 1;
      return {
        success: false,
        attemptsLeft: record.attemptsLeft,
        error: `Invalid OTP code. ${record.attemptsLeft} attempts remaining.`
      };
    }

    // Verified! Clean up store
    const verifiedData = {
      role: record.role,
      isPhone: record.isPhone,
      profileData: record.profileData
    };
    otpStore.delete(cleanId);

    return {
      success: true,
      verifiedData
    };
  }
}

module.exports = new OtpService();
