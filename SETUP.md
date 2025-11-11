# Netlify Async Workloads Queue Demo - Setup Instructions

## Prerequisites

1. **Netlify Account** with access to Async Workloads extension
2. **Netlify CLI** installed (`npm install -g netlify-cli`)
3. **Node.js** 20+ installed

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Async Workloads Extension

The Async Workloads extension must be installed on your Netlify team:

1. Go to your Netlify team dashboard
2. Navigate to **Team settings > Extensions**
3. Install the **Async Workloads** extension
4. For Starter plan users: Configure the API key at **Project configuration > Build & Deploy > Async Workloads**

### 3. Link Your Site (for local development)

For local development with `netlify dev`, you need to link your site:

```bash
netlify link
```

This will connect your local project to a Netlify site that has the Async Workloads extension installed.

### 4. Run Locally

```bash
netlify dev
```

**Note:** If you see 404 errors for `async-workloads-router`, it means:
- The Async Workloads extension isn't installed on your Netlify site
- Or the site isn't properly linked (`netlify link`)

### 5. Deploy

```bash
netlify deploy --prod
```

## How It Works

- **FIFO Queue**: Tasks are processed in first-in-first-out order
- **Concurrency Control**: Maximum 6 tasks process simultaneously
- **Task Duration**: Each task takes ~30 seconds to simulate API calls
- **Storage**: Queue state is persisted in Netlify Blob Store
- **Auto-processing**: When a task completes, the next task automatically starts if under the concurrency limit

## Troubleshooting

### Error: "AsyncWorkloadsClient#send() did not get a event router ack"

This means the Async Workloads extension isn't available. Make sure:
1. The extension is installed on your Netlify team
2. Your site is linked (`netlify link`)
3. You're running `netlify dev` (not `next dev`)

### Error: "require() of ES Module not supported"

This should be fixed with the `node_bundler = "esbuild"` configuration in `netlify.toml`. If you still see this, try restarting `netlify dev`.

