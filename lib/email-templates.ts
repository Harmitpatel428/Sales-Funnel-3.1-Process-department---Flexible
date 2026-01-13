export const passwordResetTemplate = (resetLink: string, userName: string) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .button { display: inline-block; padding: 10px 20px; background-color: #007bff; color: #fff; text-decoration: none; border-radius: 5px; }
    .footer { margin-top: 20px; font-size: 12px; color: #777; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Password Reset Request</h2>
    <p>Hello ${userName},</p>
    <p>We received a request to reset your password. Click the link below to set a new password:</p>
    <p><a href="${resetLink}" class="button">Reset Password</a></p>
    <p>If you didn't request this, you can verify your account security settings.</p>
    <p>This link will expire in 1 hour.</p>
    <div class="footer">
      <p>Best regards,<br>The Team</p>
    </div>
  </div>
</body>
</html>
`;

export const mfaSetupTemplate = (qrCodeUrl: string, secret: string) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .code { font-family: monospace; font-size: 18px; background: #f4f4f4; padding: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <h2>MFA Setup</h2>
    <p>You requested to set up Multi-Factor Authentication.</p>
    <p>Scan the QR code below with your authenticator app, or enter the secret manually.</p>
    <p><img src="${qrCodeUrl}" alt="MFA QR Code" /></p>
    <p><strong>Secret:</strong> <span class="code">${secret}</span></p>
    <p>If you did not initiate this request, please contact support immediately.</p>
  </div>
</body>
</html>
`;

export const mfaVerificationTemplate = (code: string) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .code { font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #007bff; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Verification Code</h2>
    <p>Your verification code is:</p>
    <p class="code">${code}</p>
    <p>This code will expire in 10 minutes.</p>
    <p>If you didn't request this, someone might be trying to access your account.</p>
  </div>
</body>
</html>
`;

export const passwordExpiryWarningTemplate = (daysRemaining: number) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .warning { color: #d9534f; }
  </style>
</head>
<body>
  <div class="container">
    <h2 class="warning">Password Expiry Warning</h2>
    <p>Your password will expire in <strong>${daysRemaining} days</strong>.</p>
    <p>Please log in and update your password soon to avoid interruption.</p>
    <p><a href="${process.env.NEXTAUTH_URL}/profile">Update Password</a></p>
  </div>
</body>
</html>
`;
