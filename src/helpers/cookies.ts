import { generateSessionID } from './id.js';

const DEFAULT_DOMAIN = '.naver.com';
const DEFAULT_PATH = '/';
const DEFAULT_OEP =
  '%5B%7B%22serId%22%3A%22shopping%22%2C%22type%22%3A%22oep%22%2C%22expId%22%3A%22TEST-20251223-2%22%2C%22varId%22%3A%2219%22%2C%22value%22%3A%7B%22stms%22%3A%5B%22100411802%22%5D%7D%2C%22userType%22%3A%22nnb%22%2C%22provId%22%3A%22%22%2C%22sesnId%22%3A%22%22%7D%5D';

export interface SessionCookie {
  domain: string;
  name: string;
  path: string;
  value: string;
}

export interface OEPConfigCookie {
  path: string;
  domain: string;
  name: string;
  value: string;
  expires: number;
}

export function createSessionCookie(): SessionCookie {
  return {
    name: 'nstore_session',
    value: generateSessionID(),
    domain: DEFAULT_DOMAIN,
    path: DEFAULT_PATH,
  };
}

export function createOEPConfigCookie(ttl = 300): OEPConfigCookie {
  return {
    name: 'OEP_CONFIG',
    value: DEFAULT_OEP,
    domain: DEFAULT_DOMAIN,
    path: DEFAULT_PATH,
    expires: Math.floor(Date.now() / 1000) + ttl,
  };
}
