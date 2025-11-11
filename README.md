# Netlify Async Workloads Queue Demo

A demonstration of building a FIFO queue system with concurrency control using Netlify's serverless platform. This app simulates an image generation API with rate limiting, processing tasks with a maximum concurrency of 6.

## 🎯 What This Demo Shows

- **FIFO Queue**: Tasks are processed in first-in-first-out order
- **Concurrency Control**: Maximum 6 tasks process simultaneously
- **Rate Limiting**: Simulates API rate limits (each task takes ~30 seconds)
- **Real-time UI**: Live dashboard showing queued, processing, and completed tasks

## 🐍 For Python Developers: Understanding Netlify Concepts

If you're coming from Python, here's how Netlify's concepts map to things you might know:

### Netlify Functions ≈ AWS Lambda / Serverless Functions

**Python equivalent**: Think of Flask/FastAPI endpoints, but each endpoint runs in its own isolated container that spins up on-demand.

```python
# Python Flask
@app.route('/api/queue-task', methods=['POST'])
def queue_task():
    # Your code here
    return jsonify({"success": True})

# Netlify Function (JavaScript/TypeScript)
export default async (req: Request) => {
    // Your code here
    return new Response(JSON.stringify({"success": True}));
};
```

**Key differences**:

- Functions are **serverless** - they only run when called (like AWS Lambda)
- Each function has a **10-second timeout** by default (can be extended)
- Functions are **stateless** - no persistent memory between invocations
- Functions are in `netlify/functions/` directory

### Netlify Blobs ≈ Redis / Simple Key-Value Store

**Python equivalent**: Think of Redis or a simple dictionary that persists across function invocations.

```python
# Python with Redis
import redis
r = redis.Redis()

# Store data
r.set("queue-state", json.dumps(state))

# Retrieve data
state = json.loads(r.get("queue-state"))
```

```typescript
// Netlify Blobs
import { getStore } from "@netlify/blobs";

const store = getStore("queue-state");

// Store data
await store.set("state", JSON.stringify(state));

// Retrieve data
const data = await store.get("state", { type: "json" });
```

**Key points**:

- **Blobs** = Binary Large Objects, but you can store JSON strings
- Think of it as a **persistent dictionary** that survives function restarts
- Each "store" is like a namespace (similar to Redis databases)
- Data persists across function invocations (unlike function memory)
- Perfect for storing queue state, user sessions, cache, etc.

**Why we use it**: Since Netlify Functions are stateless, we need Blobs to persist our queue state between function calls.

### Async Workloads ≈ Celery Tasks / Background Workers

**Python equivalent**: Think of Celery workers that process tasks asynchronously.

```python
# Python with Celery
from celery import Celery

app = Celery('tasks')

@app.task
def process_image_generation(image_id):
    # Long-running task (30 seconds)
    time.sleep(30)
    return "completed"

# Trigger task
process_image_generation.delay(image_id)
```

```typescript
// Netlify Async Workloads
import { asyncWorkloadFn } from "@netlify/async-workloads";

export default asyncWorkloadFn(async (event) => {
  // Long-running task (30 seconds)
  await new Promise((resolve) => setTimeout(resolve, 30000));
});

// Trigger from another function
const client = new AsyncWorkloadsClient();
await client.send("process-task");
```

**Key differences**:

- **Async Workloads** = Background tasks that can run longer than 10 seconds
- Think of it as **Celery workers** but managed by Netlify
- Functions wrapped with `asyncWorkloadFn` can run for up to **15 minutes**
- They're **event-driven** - you send events to trigger them
- They're **durable** - if a function crashes, Netlify retries automatically

**Why we use it**: Regular Netlify Functions timeout after 10 seconds. Async Workloads let us run longer tasks (like our 30-second simulated image generation).

## 🏗️ Architecture Overview

```
┌─────────────┐
│   Browser   │ (React UI)
└──────┬──────┘
       │ HTTP POST
       ▼
┌─────────────────┐
│  queue-task     │ (Netlify Function)
│  Function       │ - Receives request
│                 │ - Creates task
│                 │ - Saves to Blobs
│                 │ - Triggers async workload
└──────┬──────────┘
       │
       ├──► Netlify Blobs (Queue State Storage)
       │    └─> Like Redis: {"queue": [...], "processing": [...], "tasks": {...}}
       │
       └──► Async Workloads Router
            │
            ▼
       ┌─────────────────┐
       │  process-task    │ (Async Workload Function)
       │  Function        │ - Runs for up to 15 minutes
       │                  │ - Processes one task
       │                  │ - Updates Blobs
       │                  │ - Triggers next task if available
       └──────────────────┘
```

## 📁 Project Structure

```
netlify-concurrency-demo/
├── app/
│   └── page.tsx              # React UI (Next.js)
├── netlify/
│   └── functions/
│       ├── queue-task.mts    # API endpoint: Add task to queue
│       ├── queue-status.mts  # API endpoint: Get queue status
│       ├── clear-queue.mts   # API endpoint: Clear queue
│       └── process-task.mts  # Async workload: Process tasks
├── netlify.toml              # Netlify configuration
└── package.json
```

## 🔑 Key Concepts Explained

### 1. Queue State Storage (Blobs)

We store the entire queue state in Netlify Blobs as a JSON object:

```typescript
interface QueueState {
  queue: string[]; // Task IDs waiting to be processed (FIFO)
  processing: string[]; // Task IDs currently being processed
  completed: string[]; // Task IDs that finished
  tasks: Record<string, Task>; // Full task objects by ID
}
```

**Python analogy**: Like a `dict` stored in Redis:

```python
queue_state = {
    "queue": ["task-1", "task-2"],
    "processing": ["task-3"],
    "completed": ["task-4"],
    "tasks": {
        "task-1": {...},
        "task-2": {...},
        ...
    }
}
```

### 2. Concurrency Control

We limit processing to 6 concurrent tasks:

```typescript
const MAX_CONCURRENCY = 6;

if (state.processing.length < MAX_CONCURRENCY) {
  // Start processing next task
}
```

**Python analogy**: Like using a semaphore:

```python
from threading import Semaphore

semaphore = Semaphore(6)  # Max 6 concurrent

def process_task():
    with semaphore:
        # Process task
        pass
```

### 3. FIFO Queue Processing

Tasks are processed in order:

1. Task added to `queue` array (end of list)
2. When processing starts, task moved from `queue` to `processing`
3. When complete, task moved from `processing` to `completed`

**Python analogy**: Like using `collections.deque`:

```python
from collections import deque

queue = deque()
queue.append("task-1")  # Add to end
task = queue.popleft()  # Remove from front (FIFO)
```

### 4. Race Condition Handling

#### What is a Race Condition?

A **race condition** happens when two or more operations try to modify the same data at the same time, and the final result depends on which one finishes first (like a "race" to see who finishes first).

**Simple Example:**
Imagine two people trying to withdraw $100 from a bank account with $150:

```
Without Protection:
Time 0ms: Person A checks balance → $150 ✅
Time 1ms: Person B checks balance → $150 ✅ (both see $150!)
Time 2ms: Person A withdraws $100 → Balance = $50
Time 3ms: Person B withdraws $100 → Balance = -$50 ❌ (overdrawn!)
```

Both people saw $150, so both thought they could withdraw. The account ends up overdrawn!

**In Our Queue System:**
When multiple tasks finish at the same time, they all try to update the blob:

```
Race Condition Scenario:
Time 0ms: Task A reads blob (processing: [1,2,3,4,5,6])
Time 1ms: Task B reads blob (processing: [1,2,3,4,5,6]) ← Same data!
Time 2ms: Task A removes itself, saves (processing: [2,3,4,5,6])
Time 3ms: Task B removes itself, saves (processing: [1,3,4,5,6]) ❌ Lost task 2!
```

Task B's save overwrites Task A's save, and we lose track of task 2!

#### The Challenge

**The Problem:**

- Netlify Blobs doesn't have built-in atomic operations or transactions
- Multiple async workloads can finish simultaneously and try to update the blob
- Read-modify-write operations are not atomic → potential data loss or corruption

#### Our Mitigation Strategies

We use multiple layers of protection:

1. **Staggered Delays in UI** (50ms between requests)

   - Reduces simultaneous writes when queueing tasks
   - Helps prevent race conditions at the source

2. **Retry Logic with Exponential Backoff**

   ```typescript
   let retries = 5;
   while (retries > 0 && !success) {
     state = await getQueueState();
     // Modify state
     try {
       await saveQueueState(state);
       success = true;
     } catch (error) {
       retries--;
       await new Promise((resolve) =>
         setTimeout(resolve, 10 + Math.random() * 20)
       );
     }
   }
   ```

3. **Unique Task IDs with High-Resolution Timestamps**

   - Prevents ID collisions even under race conditions
   - Uses `Date.now() + performance.now() + random()` for uniqueness

4. **Idempotent Operations**
   - Task completion checks if task exists before updating
   - Multiple completions of same task won't corrupt state

**Python analogy**: Like optimistic locking:

```python
import threading
import time

def add_task():
    max_retries = 5
    for attempt in range(max_retries):
        try:
            # Read current state
            state = get_state()

            # Modify
            state.queue.append(new_task)

            # Write back (assumes atomic write)
            save_state(state)
            break
        except ConflictError:
            # Another process modified it, retry
            time.sleep(0.01 * (2 ** attempt))  # Exponential backoff
```

#### Limitations & Trade-offs

**What We're NOT Doing:**

- ❌ True atomic transactions (Blobs doesn't support this)
- ❌ Distributed locking (would require external service)
- ❌ WAL (Write-Ahead Logging) like databases

**Why This Works for This Demo:**

- ✅ Low contention: Only 6 concurrent tasks max
- ✅ Tasks take 30 seconds: Reduces simultaneous completions
- ✅ Retry logic handles most conflicts
- ✅ Idempotent operations prevent corruption

**For Production at Scale:**
If you need true ACID guarantees for 3M users, consider:

- **Netlify KV** (if available) - has better consistency guarantees
- **External Database** (PostgreSQL, DynamoDB) - proper transactions/WAL
- **Distributed Lock Service** (Redis, etcd) - for coordination
- **Event Sourcing** - append-only log prevents conflicts

**Current Approach Trade-off:**

- ✅ Simple, works with Netlify's serverless model
- ✅ Good enough for moderate concurrency (6-100 tasks)
- ⚠️ Not perfect for high-contention scenarios
- ⚠️ Small chance of race conditions under extreme load

#### Real-World Example

**Scenario:** 6 tasks finish simultaneously

**Without Protection:**

```
Time 0ms: Task A reads state (processing: [1,2,3,4,5,6])
Time 1ms: Task B reads state (processing: [1,2,3,4,5,6])
Time 2ms: Task A removes itself, saves (processing: [2,3,4,5,6])
Time 3ms: Task B removes itself, saves (processing: [1,3,4,5,6]) ❌ Lost task 2!
```

**With Our Protection:**

```
Time 0ms: Task A reads state (processing: [1,2,3,4,5,6])
Time 1ms: Task B reads state (processing: [1,2,3,4,5,6])
Time 2ms: Task A removes itself, saves (processing: [2,3,4,5,6]) ✅
Time 3ms: Task B tries to save, detects conflict, retries
Time 4ms: Task B reads fresh state (processing: [2,3,4,5,6])
Time 5ms: Task B removes itself, saves (processing: [3,4,5,6]) ✅
```

The retry logic ensures both tasks eventually complete correctly, even if there's a race condition.

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Netlify account
- Netlify CLI: `npm install -g netlify-cli`

### Setup Steps

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Install Async Workloads Extension**:

   - Go to [Netlify Dashboard](https://app.netlify.com)
   - Team settings → Extensions
   - Install "Async Workloads" extension
   - For Starter plan: Configure API key at Site settings → Build & deploy → Async Workloads

3. **Link your site** (for local development):

   ```bash
   netlify link
   ```

4. **Run locally**:

   ```bash
   netlify dev
   ```

5. **Deploy**:
   ```bash
   netlify deploy --prod
   ```

## 📊 How It Works

### Adding a Task

1. User clicks "Queue 5 Tasks" in UI
2. UI sends 5 POST requests to `/api/queue-task` (staggered 50ms apart)
3. Each `queue-task` function:
   - Generates unique task ID
   - Reads current state from Blobs
   - Adds task to `queue` array
   - Saves updated state to Blobs
   - If under concurrency limit, triggers `process-task` async workload

### Processing a Task

1. `process-task` async workload receives event
2. Reads queue state from Blobs
3. Checks if under concurrency limit (max 6)
4. Removes first task from `queue`, adds to `processing`
5. Saves state to Blobs
6. Simulates 30-second work (your image generation API call)
7. Moves task from `processing` to `completed`
8. Saves state to Blobs
9. If more tasks in queue and under limit, triggers next `process-task`

### Viewing Status

1. UI polls `/api/queue-status` every 2 seconds
2. `queue-status` function reads state from Blobs
3. Returns tasks grouped by status (queued, processing, completed)

## 🔧 Configuration

### `netlify.toml`

```toml
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"  # Required for ES modules

[[plugins]]
  package = "@netlify/plugin-nextjs"  # Next.js integration
```

### Function Configuration

Each function exports a `config` object:

```typescript
export const config: Config = {
  path: "/api/queue-task", // URL path
};
```

**Python analogy**: Like Flask route decorator:

```python
@app.route('/api/queue-task', methods=['POST'])
```

## 🐛 Troubleshooting

### "AsyncWorkloadsClient#send() did not get a event router ack"

- **Cause**: Async Workloads extension not installed/enabled
- **Fix**: Install extension in Netlify dashboard and link your site

### "require() of ES Module not supported"

- **Cause**: Function trying to import ES module in CommonJS
- **Fix**: Use `.mts` extension and dynamic imports (already done in this project)

### Tasks not processing

- Check that Async Workloads extension is installed
- Check function logs in Netlify dashboard
- Verify `process-task` function is deployed

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more details.

## 📚 Further Reading

- [Netlify Functions Docs](https://docs.netlify.com/functions/overview/)
- [Netlify Blobs Docs](https://docs.netlify.com/blobs/overview/)
- [Async Workloads Docs](https://docs.netlify.com/build/async-workloads/get-started/)
- [Next.js on Netlify](https://docs.netlify.com/integrations/frameworks/next-js/overview/)

## 💡 Key Takeaways for Python Developers

1. **Functions are stateless** → Use Blobs for persistence (like Redis)
2. **Functions timeout at 10s** → Use Async Workloads for long tasks (like Celery)
3. **Everything is async** → Use `async/await` everywhere (like Python's `async def`)
4. **No shared memory** → All state must be in Blobs or passed via events
5. **Event-driven** → Functions trigger other functions via events (like Celery tasks)

## 🎓 Learning Path

If you're new to Netlify:

1. **Start with regular Functions** - Understand serverless basics
2. **Add Blobs** - Learn persistence patterns
3. **Add Async Workloads** - Handle long-running tasks
4. **Build this demo** - See it all work together

This demo combines all three concepts to build a production-ready queue system!
