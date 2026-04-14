type Bucket = {
  tokens: number;
  lastRefill: number;
};

const buckets = new Map<number, Bucket>();

// Capacity and refill settings
const CAPACITY = 60; // tokens
const REFILL_INTERVAL_SEC = 60; // refill period in seconds

function nowSec() {
  return Date.now() / 1000;
}

export function allowRequest(userId: number, cost = 1): boolean {
  const t = nowSec();
  let bucket = buckets.get(userId);
  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefill: t };
    buckets.set(userId, bucket);
  }

  // refill tokens
  const elapsed = t - bucket.lastRefill;
  if (elapsed > 0) {
    const refill = (elapsed / REFILL_INTERVAL_SEC) * CAPACITY;
    bucket.tokens = Math.min(CAPACITY, bucket.tokens + refill);
    bucket.lastRefill = t;
  }

  if (bucket.tokens >= cost) {
    bucket.tokens -= cost;
    return true;
  }

  return false;
}

export function tokensRemaining(userId: number): number {
  const bucket = buckets.get(userId);
  return bucket ? Math.max(0, Math.floor(bucket.tokens)) : CAPACITY;
}
