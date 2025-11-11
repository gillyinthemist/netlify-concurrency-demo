# Troubleshooting Async Workloads 404 Error

## The Problem

You're seeing this error:
```
AsyncWorkloadsClient#send() did not get a event router ack: process-task - response status 404
```

This means the `async-workloads-router` endpoint is returning 404, which indicates the Async Workloads extension isn't properly set up or active.

## Step-by-Step Verification

### 1. Verify Extension is Installed on Your Team

1. Go to https://app.netlify.com
2. Click on your **Team** (top left)
3. Go to **Team settings** > **Extensions**
4. Verify **Async Workloads** is listed and **Installed**

### 2. Verify Extension is Enabled for Your Site

1. Go to your site: https://app.netlify.com/projects/statuesque-kulfi-6d953f
2. Go to **Site configuration** > **Build & deploy** > **Async Workloads**
3. Verify the extension is enabled
4. If you're on Starter plan, ensure an API key is configured

### 3. Check Environment Variables

The Async Workloads extension might need environment variables. Check:

```bash
netlify env:list
```

For Starter plan, you should see `AWL_API_KEY` or similar.

### 4. Verify Site Link

Your site is linked:
- Site ID: `340e5f7a-2f47-473e-b0db-0601e528cc4c`
- Project: `statuesque-kulfi-6d953f`

### 5. Try Deploying

Sometimes async workloads work better in production. Try:

```bash
netlify deploy --prod
```

Then test the deployed site. If it works in production but not locally, it's a local dev limitation.

### 6. Restart Netlify Dev

After configuring the extension:

```bash
# Stop netlify dev (Ctrl+C)
# Then restart
netlify dev
```

### 7. Check Netlify CLI Version

Make sure you have the latest Netlify CLI:

```bash
netlify --version
npm install -g netlify-cli@latest
```

## Alternative: Test in Production

If local development continues to have issues, you can:

1. Deploy the site: `netlify deploy --prod`
2. Test the queue functionality on the deployed site
3. The async workloads should work in production even if local dev has limitations

## Still Not Working?

1. Check Netlify's status page: https://www.netlifystatus.com/
2. Review your site's build logs in the Netlify dashboard
3. Contact Netlify support with:
   - Your site ID: `340e5f7a-2f47-473e-b0db-0601e528cc4c`
   - The error message
   - Confirmation that the extension is installed

## Note on Local Development

Some Netlify features (like Async Workloads) may have limited support in `netlify dev`. If the extension is properly configured but still not working locally, try deploying to production to verify the setup is correct.

