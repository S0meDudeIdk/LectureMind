import crypto from 'node:crypto';

/** Read only server-side inline service-account credentials; never stage a file. */
export function readInlineServiceAccount(env:NodeJS.ProcessEnv=process.env) {
  const value=(env.GOOGLE_APPLICATION_CREDENTIALS_JSON || env.GCP_SERVICE_ACCOUNT_KEY || '').trim();
  if(!value)return null;
  try {
    const credential=JSON.parse(value.startsWith('{')?value:Buffer.from(value,'base64').toString('utf8'));
    if(credential.type!=='service_account'||typeof credential.project_id!=='string'||!credential.project_id||
       typeof credential.client_email!=='string'||!credential.client_email.endsWith('.iam.gserviceaccount.com')||
       typeof credential.private_key!=='string')throw new Error();
    crypto.createPrivateKey(credential.private_key);
    return credential;
  } catch {
    throw new Error('Invalid inline service-account credentials. Set GOOGLE_APPLICATION_CREDENTIALS_JSON to valid service-account JSON or its base64 encoding.');
  }
}
