import { NextRequest, NextResponse } from 'next/server'
import { db, generateId } from '@/lib/db'

const FREE_LEAD_LIMIT = 50

// CORS headers for browser extension
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Handle preflight OPTIONS request
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Accept both 'fingerprint' (from extension) and 'fingerprint_hash' (legacy)
    const fingerprint_hash = body?.fingerprint || body?.fingerprint_hash
    const { leadsCount } = body || {}

    if (!fingerprint_hash || typeof fingerprint_hash !== 'string' || fingerprint_hash.length < 8) {
      return NextResponse.json({ ok: false, error: 'Invalid fingerprint' }, { status: 400, headers: corsHeaders })
    }

    const count = Number(leadsCount)
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      return NextResponse.json({ ok: false, error: 'Invalid leads count (1-100)' }, { status: 400, headers: corsHeaders })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'

    const existing = await db.execute(
      `SELECT * FROM extension_trials WHERE fingerprint_hash = ?`,
      [fingerprint_hash]
    )

    if (existing.rows.length === 0) {
      const id = generateId()
      const initialUsed = Math.min(count, FREE_LEAD_LIMIT)
      const isLocked = initialUsed >= FREE_LEAD_LIMIT
      await db.execute(
        `INSERT INTO extension_trials (
          id, fingerprint_hash, leads_used, max_leads, is_locked, last_ip, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [id, fingerprint_hash, initialUsed, FREE_LEAD_LIMIT, isLocked ? 1 : 0, ip]
      )

      return NextResponse.json({
        success: true,
        leadsConsumed: initialUsed,
        leadsRequested: count,
        leadsUsed: initialUsed,
        leadsRemaining: Math.max(0, FREE_LEAD_LIMIT - initialUsed),
        leadsTotal: FREE_LEAD_LIMIT,
        isLocked,
      }, { headers: corsHeaders })
    }

    const trial = existing.rows[0] as any
    const maxLeads = Number(trial.max_leads || FREE_LEAD_LIMIT)
    const leadsUsed = Number(trial.leads_used || 0)

    if (trial.is_locked === 1 || leadsUsed >= maxLeads) {
      return NextResponse.json({
        success: false,
        error: 'Free trial limit reached',
        leadsUsed,
        leadsRemaining: 0,
        leadsTotal: maxLeads,
        isLocked: true,
      }, { headers: corsHeaders })
    }

    const available = Math.max(0, maxLeads - leadsUsed)
    const actual = Math.min(count, available)
    const newUsed = leadsUsed + actual
    const lockedNow = newUsed >= maxLeads

    await db.execute(
      `UPDATE extension_trials 
       SET leads_used = ?, is_locked = ?, last_ip = ?, last_seen_at = datetime('now'), updated_at = datetime('now')
       WHERE fingerprint_hash = ?`,
      [newUsed, lockedNow ? 1 : 0, ip, fingerprint_hash]
    )

    return NextResponse.json({
      success: true,
      leadsConsumed: actual,
      leadsRequested: count,
      leadsUsed: newUsed,
      leadsRemaining: Math.max(0, maxLeads - newUsed),
      leadsTotal: maxLeads,
      isLocked: lockedNow,
      ...(Math.max(0, maxLeads - newUsed) <= 10 && !lockedNow && {
        warning: `Only ${Math.max(0, maxLeads - newUsed)} free leads remaining!`
      }),
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('Trial consume error:', error)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}
