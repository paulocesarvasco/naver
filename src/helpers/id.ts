import { randomBytes } from 'crypto';

export function generateSessionID(length = 24): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);

  let sessionID = '';
  for (let i = 0; i < length; i++) {
    sessionID += charset[bytes[i] % charset.length];
  }

  return sessionID;
}
