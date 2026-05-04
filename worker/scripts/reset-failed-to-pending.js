'use strict';
// Resets failed traffic_details rows back to 'pending' so workers pick them up
// again on the next poll cycle. Useful while debugging a campaign that hit
// transient errors (proxy outage, captcha flake, network blip).
//
// Usage:
//   node scripts/reset-failed-to-pending.js                  # global: every failed row
//   node scripts/reset-failed-to-pending.js <campaignId>     # scoped to one traffic_summaries.id
//
// The campaign ID is the UUID shown in the dashboard URL when viewing a
// campaign: /dashboard/campaigns/<campaignId>.
//
// Side effects per row reset:
//   - status:               'failed'  → 'pending'
//   - error_message:         <value>  → NULL
//   - started_at:            <value>  → NULL
//   - completed_at:          <value>  → NULL
//   - ip:                    <value>  → NULL
//   - actual_dwell_seconds:  <value>  → NULL
//
// If the parent traffic_summaries row was auto-marked 'completed' (because no
// pending/running rows remained), it is flipped back to 'running' so the
// PM2 workers will resume execution. Already-running campaigns are left alone.

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { sql, pool } = require('../../shared/models/db');

function isUuid(v) {
  return typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function resetForCampaign(campaignId) {
  const summary = await sql`
    SELECT id, status FROM traffic_summaries WHERE id = ${campaignId}
  `;
  if (summary.length === 0) {
    throw new Error(`Campaign ${campaignId} not found`);
  }

  const result = await sql`
    UPDATE traffic_details
    SET status = 'pending',
        error_message = NULL,
        started_at = NULL,
        completed_at = NULL,
        ip = NULL,
        actual_dwell_seconds = NULL
    WHERE traffic_summary_id = ${campaignId}
      AND status = 'failed'
    RETURNING id
  `;
  const resetCount = result.length;

  let summaryReactivated = false;
  if (resetCount > 0 && summary[0].status === 'completed') {
    await sql`
      UPDATE traffic_summaries
      SET status = 'running', updated_at = NOW()
      WHERE id = ${campaignId}
    `;
    summaryReactivated = true;
  }

  return { campaignId, resetCount, summaryReactivated, previousSummaryStatus: summary[0].status };
}

async function resetGlobal() {
  // 1. Find every campaign with at least one failed row before we wipe them,
  //    so we know which 'completed' summaries to reactivate.
  const affected = await sql`
    SELECT DISTINCT ts.id, ts.status
    FROM traffic_summaries ts
    JOIN traffic_details td ON td.traffic_summary_id = ts.id
    WHERE td.status = 'failed'
  `;

  const result = await sql`
    UPDATE traffic_details
    SET status = 'pending',
        error_message = NULL,
        started_at = NULL,
        completed_at = NULL,
        ip = NULL,
        actual_dwell_seconds = NULL
    WHERE status = 'failed'
    RETURNING id, traffic_summary_id
  `;
  const resetCount = result.length;

  const reactivatedIds = [];
  for (const ts of affected) {
    if (ts.status === 'completed') {
      await sql`
        UPDATE traffic_summaries
        SET status = 'running', updated_at = NOW()
        WHERE id = ${ts.id}
      `;
      reactivatedIds.push(ts.id);
    }
  }

  return { resetCount, affectedCampaigns: affected.length, reactivatedIds };
}

async function main() {
  const arg = process.argv[2];

  if (arg && !isUuid(arg)) {
    console.error(`[reset-failed] Invalid campaign ID: ${arg}`);
    console.error('[reset-failed] Expected a UUID like: 3f1c8e2a-4b1d-4a5e-9b3a-1c2d3e4f5a6b');
    process.exit(2);
  }

  try {
    if (arg) {
      console.log(`[reset-failed] Scope: campaign ${arg}`);
      const { resetCount, summaryReactivated, previousSummaryStatus } = await resetForCampaign(arg);
      console.log(`[reset-failed] Reset ${resetCount} failed row(s) → pending`);
      if (summaryReactivated) {
        console.log(`[reset-failed] Campaign status flipped 'completed' → 'running' (workers will resume)`);
      } else {
        console.log(`[reset-failed] Campaign status left as '${previousSummaryStatus}' (no flip needed)`);
      }
    } else {
      console.log('[reset-failed] Scope: GLOBAL (every campaign)');
      const { resetCount, affectedCampaigns, reactivatedIds } = await resetGlobal();
      console.log(`[reset-failed] Reset ${resetCount} failed row(s) across ${affectedCampaigns} campaign(s) → pending`);
      if (reactivatedIds.length > 0) {
        console.log(`[reset-failed] Reactivated ${reactivatedIds.length} previously completed campaign(s):`);
        for (const id of reactivatedIds) console.log(`  - ${id}`);
      }
    }
  } catch (err) {
    console.error(`[reset-failed] ERROR: ${err.message}`);
    process.exitCode = 1;
  } finally {
    if (pool && typeof pool.end === 'function') {
      await pool.end().catch(() => {});
    }
  }
}

main();
