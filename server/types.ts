export interface Transaction { get(path: string): Promise<any>; set(path: string, value: any): void; }
export interface Store { get(path: string): Promise<any>; transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>; }
export interface Upload {
  id: string; ownerUid: string; lectureId: string; kind: 'source' | 'processing'; guest: boolean;
  bucket: string; path: string; fileName: string; mimeType: string; fileSize: number;
  createdAt: number; expiresAt: number; status: string; generation?: string; leaseUntil?: number;
}
export interface MediaStorage {
  signedPut(upload: Upload): Promise<string>;
  signedRead(upload: Upload, expiresAt: number): Promise<string>;
  metadata(upload: Upload): Promise<{size: number; contentType: string; generation: string}>;
  readPrefix(upload: Upload): Promise<Buffer>;
  savePart(upload: Upload, index: number, bytes: Buffer): Promise<void>;
  compose(upload: Upload, chunks: number): Promise<void>;
  delete(upload: Upload): Promise<void>;
  deleteLecture(bucket: string, prefix: string): Promise<void>;
  readBuffer?(upload: Upload): Promise<Buffer>;
}
export interface AppConfig {
  production: boolean; allowedOrigins: string[]; primaryBucket: string; guestBucket: string;
  dailyGuestLimit: number; dailyMemberLimit: number; maxConcurrent: number; maxPerUidConcurrent: number;
  jobTimeoutMs: number; uploadLifetimeMs: number; readLifetimeMs: number;
  abuseSecret: string; guestIpDailyLimit: number; requestsPerMinute: number; trustProxy: false | number;
}
export interface Dependencies {
  store: Store; storage: MediaStorage; config: AppConfig;
  verifyIdToken(token: string): Promise<{uid: string; firebase?: {sign_in_provider?: string}}>;
  verifyAppCheck(token: string): Promise<unknown>;
  generate(input: {uri: string; mimeType: string; prompt: string; signal: AbortSignal; deadline: number; upload?: Upload}): Promise<any>;
  now?: () => number;
  startMaintenance?: () => () => void;
}
