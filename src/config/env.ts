import dotenv from 'dotenv';

dotenv.config({
  path: '.env',
  quiet: true,
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const env = {
  PROXY_ADDRESS: required('PROXY_ADDRESS'),
  PROXY_USER: required('PROXY_USER'),
  PROXY_PASS: required('PROXY_PASS'),
  WORKERS: Number(required('WORKERS')),
  SERVER_PORT: Number(required('SERVER_PORT')),
  SERVER_HOST: required('SERVER_HOST'),
  SERVER_TIMEOUT: Number(required('SERVER_TIMEOUT')),
  DB_PORT: Number(required('DB_PORT')),
  DB_HOST: required('DB_HOST'),
};
