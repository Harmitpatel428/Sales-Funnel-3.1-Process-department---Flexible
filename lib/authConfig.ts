// ============================================================================
// AUTH CONFIGURATION CONSTANTS
// ============================================================================

export const BCRYPT_SALT_ROUNDS = 12;
export const SESSION_COOKIE_NAME = 'session_token';
export const SESSION_EXPIRY_DAYS = 7;
export const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
export const PASSWORD_MIN_LENGTH = parseInt(process.env.PASSWORD_MIN_LENGTH || '12');
export const PASSWORD_EXPIRY_DAYS = parseInt(process.env.PASSWORD_EXPIRY_DAYS || '90');
export const PASSWORD_HISTORY_COUNT = parseInt(process.env.PASSWORD_HISTORY_COUNT || '5');
export const REMEMBER_ME_EXPIRY_DAYS = parseInt(process.env.REMEMBER_ME_EXPIRY_DAYS || '30');
