# Netlify Platform Limits

## Observed Limits in Production

Based on testing, Netlify appears to have some built-in limits that affect this demo:

### Observed Behavior
- **Max ~20 tasks queued** - Blob write operations seem rate-limited
- **Max ~25 tasks processing** - Async Workloads or function concurrency limit

## Potential Netlify Limits

### 1. Netlify Blobs Rate Limits

Netlify Blobs may have undocumented rate limits:
- **Operations per second**: Possibly ~20-25 writes/second
- **Concurrent operations**: May be limited per account/plan

**Symptoms:**
- Tasks fail to queue after ~20
- Blob save operations timeout or fail
- Retry logic helps but doesn't fully solve it

**Workaround:**
- Add longer delays between blob operations
- Batch blob updates instead of individual saves
- Use exponential backoff for retries

### 2. Netlify Functions Concurrency

While AWS Lambda supports 1000 concurrent executions, Netlify may have:
- **Account-level limits**: Lower limits on free/starter plans
- **Per-function limits**: Individual function concurrency caps
- **Regional limits**: Limits per deployment region

**Symptoms:**
- Only ~25 async workloads processing simultaneously
- Functions queue up but don't execute

### 3. Async Workloads Extension Limits

The Async Workloads extension may have:
- **Concurrent workload limit**: ~25 simultaneous workloads
- **Rate limit on triggering**: Limits on how many workloads can be triggered per second

**Symptoms:**
- `AsyncWorkloadsClient.send()` calls fail after a certain number
- Workloads queue but don't start

## How to Check Your Limits

1. **Netlify Dashboard**:
   - Go to your site → Functions → Overview → Usage
   - Check for any rate limit warnings or errors

2. **Function Logs**:
   - Check function execution logs for rate limit errors
   - Look for 429 (Too Many Requests) or 503 (Service Unavailable) errors

3. **Blob Store Logs**:
   - Check if blob operations are failing
   - Look for timeout or rate limit errors

## Solutions

### For Production at Scale

1. **Use a Database Instead of Blobs**
   - PostgreSQL (Supabase/Neon) - no rate limits on writes
   - DynamoDB - designed for high throughput
   - Redis - very high write throughput

2. **Implement Exponential Backoff**
   - Increase delays between retries
   - Use jitter to spread out retries

3. **Batch Operations**
   - Instead of individual blob writes, batch multiple updates
   - Write once per batch instead of per task

4. **Contact Netlify Support**
   - Ask about account-specific limits
   - Request limit increases if needed
   - Check if enterprise plans have higher limits

## Current Mitigations in Code

We already have:
- ✅ Retry logic with delays
- ✅ Exponential backoff
- ✅ Error logging

**What we could add:**
- Longer delays between blob operations (100-200ms)
- Batch blob updates
- Better error messages showing Netlify limits

## Testing Locally vs Production

**Local (`netlify dev`):**
- May have different/simulated limits
- Blobs might work differently locally
- Functions may not have the same concurrency limits

**Production:**
- Real Netlify infrastructure limits apply
- Blob rate limits are enforced
- Function concurrency limits are real

This explains why it works locally but has limits in production!

