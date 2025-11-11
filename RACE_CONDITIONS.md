# Race Condition Analysis

## Critical Issue: We're NOT Fully Protected

**Honest Assessment:** For a demo with low concurrency, our current approach works. For **3M users in production**, we need a database with proper transactions.

## Current Race Condition Problems

### Problem 1: Task Processing (process-task.mts)

```typescript
// ❌ RACE CONDITION HERE
const state = await getQueueState();  // Read
const taskId = state.queue.shift()!;  // Modify (local copy)
// ... modify state ...
await saveQueueState(state);          // Write
```

**What can go wrong:**
- Two async workloads finish simultaneously
- Both read the same state
- Both shift the same task from queue
- One save overwrites the other → task lost or duplicated

**Current mitigation:** None! We don't have retry logic in `process-task.mts`.

### Problem 2: Rate Limit Tracking

```typescript
// ❌ RACE CONDITION HERE
const recentStarts = state.rateLimitHistory.filter(...).length;
if (recentStarts >= 250) return;  // Check
// ... later ...
state.rateLimitHistory.push(Date.now());  // Modify
await saveQueueState(state);  // Write
```

**What can go wrong:**
- Multiple tasks check rate limit simultaneously
- All see "249 starts" (under limit)
- All proceed and add themselves
- Result: 252+ tasks start instead of 250

## Why This Works for Demo (But Not Production)

**Current mitigations:**
1. ✅ Retry logic in `queue-task.mts` (helps with queueing)
2. ✅ Staggered delays in UI (reduces simultaneous requests)
3. ✅ Unique task IDs (prevents collisions)
4. ❌ **NO retry logic in `process-task.mts`** (critical gap!)

**Why it works for demo:**
- Low concurrency (250 starts/min, but spread over time)
- Tasks take 30 seconds (reduces simultaneous completions)
- Demo scale: acceptable to lose 1-2 tasks occasionally

**Why it FAILS for 3M users:**
- High concurrency: hundreds of tasks finishing simultaneously
- Race conditions become frequent, not rare
- Data loss/corruption becomes unacceptable
- Rate limit can be exceeded

## Solution: Use a Database

### Option 1: PostgreSQL with Transactions

```typescript
// Atomic operation with transaction
await db.transaction(async (tx) => {
  const task = await tx.query(
    'SELECT * FROM queue WHERE status = $1 ORDER BY created_at LIMIT 1 FOR UPDATE',
    ['queued']
  );
  
  if (task) {
    await tx.query(
      'UPDATE queue SET status = $1, started_at = $2 WHERE id = $3',
      ['processing', Date.now(), task.id]
    );
  }
});
```

**Benefits:**
- ✅ True ACID transactions
- ✅ `FOR UPDATE` locks row until transaction completes
- ✅ WAL (Write-Ahead Logging) prevents data loss
- ✅ Handles millions of concurrent requests

### Option 2: DynamoDB with Conditional Updates

```typescript
// Atomic conditional update
await dynamodb.update({
  TableName: 'queue',
  Key: { id: taskId },
  UpdateExpression: 'SET #status = :processing, started_at = :now',
  ConditionExpression: '#status = :queued',  // Only if still queued
  ExpressionAttributeNames: { '#status': 'status' },
  ExpressionAttributeValues: {
    ':processing': 'processing',
    ':queued': 'queued',
    ':now': Date.now()
  }
}).promise();
```

**Benefits:**
- ✅ Conditional updates prevent race conditions
- ✅ Serverless-friendly (AWS)
- ✅ Scales to millions of requests
- ✅ No need to manage connections

### Option 3: Redis with Lua Scripts (Atomic)

```lua
-- Atomic Lua script
local task = redis.call('LPOP', 'queue')
if task then
  redis.call('HSET', 'tasks', task, 'processing')
  redis.call('ZADD', 'rate_limit', ARGV[1], task)
  return task
end
return nil
```

**Benefits:**
- ✅ Lua scripts are atomic
- ✅ Fast (in-memory)
- ✅ Good for high-throughput queues
- ⚠️ Requires external Redis instance

## Recommended Approach for Production

### For Netlify + 3M Users:

1. **Use Supabase/Neon PostgreSQL** (serverless Postgres)
   - Netlify functions can connect to it
   - True transactions and WAL
   - Free tier available

2. **Or use Upstash Redis** (serverless Redis)
   - Netlify-compatible
   - Atomic operations
   - Pay-per-use

3. **Or use DynamoDB**
   - AWS service, works with Netlify
   - Conditional updates prevent races
   - Scales automatically

## What We Should Fix NOW (Even for Demo)

At minimum, add retry logic to `process-task.mts`:

```typescript
async function processNextTask(): Promise<void> {
  let retries = 5;
  let success = false;
  
  while (retries > 0 && !success) {
    const state = await getQueueState();
    
    if (state.queue.length === 0) {
      return;
    }
    
    // Check rate limit
    const recentStarts = state.rateLimitHistory.filter(...).length;
    if (recentStarts >= 250) {
      return; // Wait for window reset
    }
    
    // Try to claim a task
    const taskId = state.queue[0]; // Don't shift yet
    const task = state.tasks[taskId];
    
    if (!task) {
      // Task already claimed, retry
      retries--;
      await new Promise(resolve => setTimeout(resolve, 10));
      continue;
    }
    
    // Move to processing
    state.queue.shift();
    state.processing.push(taskId);
    task.status = 'processing';
    task.startedAt = Date.now();
    state.rateLimitHistory.push(Date.now());
    
    try {
      await saveQueueState(state);
      success = true;
      // Process the task...
    } catch (error) {
      // Conflict, retry
      retries--;
      await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20));
    }
  }
}
```

## Conclusion

**For Demo:** Current approach is acceptable with added retry logic.

**For Production (3M users):** **Use a database with transactions.** Blobs are not suitable for high-concurrency queue systems.

The current implementation is a **proof of concept** showing Netlify's capabilities, but it's not production-ready for scale.

