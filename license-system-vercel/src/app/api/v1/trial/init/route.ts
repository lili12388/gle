import { NextRequest, NextResponse } from 'next/server'
import { db, generateId } from '@/lib/db'

const FREE_LEAD_LIMIT = 50

// Get country from IP using free API
async function getCountryFromIP(ip: string): Promise<string | null> {
  if (!ip || ip === 'unknown') return null
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=country,countryCode`, {
      signal: AbortSignal.timeout(2000) // 2 second timeout
    })
    if (response.ok) {
      const data = await response.json()
      return data.countryCode || data.country || null
    }
  } catch (e) {
    // Silently fail - country is optional
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Accept both 'fingerprint' (from extension) and 'fingerprint_hash' (legacy)
    const fingerprint_hash = body?.fingerprint || body?.fingerprint_hash
    const { fingerprint_components, extension_id, client } = body || {}

    if (!fingerprint_hash || typeof fingerprint_hash !== 'string' || fingerprint_hash.length < 8) {
      return NextResponse.json({ ok: false, error: 'Invalid fingerprint' }, { status: 400 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown'

    // Get country from IP (async, but don't block on failure)
    const country = await getCountryFromIP(ip)

    const existing = await db.execute(
      `SELECT * FROM extension_trials WHERE fingerprint_hash = ?`,
      [fingerprint_hash]
    )

    if (existing.rows.length === 0) {
      const id = generateId()
      await db.execute(
        `INSERT INTO extension_trials (
          id, fingerprint_hash, fingerprint_components, extension_id,
          leads_used, max_leads, is_locked, last_ip, country, client_browser, client_os, client_timezone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          fingerprint_hash,
          fingerprint_components ? JSON.stringify(fingerprint_components) : null,
          extension_id || null,
          0,
          FREE_LEAD_LIMIT,
          0,
          ip,
          country,
          client?.browser || null,
          client?.os || null,
          client?.timezone || null,
        ]
      )
      return NextResponse.json({
        success: true,
        isNew: true,
        leadsUsed: 0,
        leadsRemaining: FREE_LEAD_LIMIT,
        leadsTotal: FREE_LEAD_LIMIT,
        isLocked: false,
      })
    }

    const trial = existing.rows[0] as any
    const leadsUsed = Number(trial.leads_used || 0)
    const maxLeads = Number(trial.max_leads || FREE_LEAD_LIMIT)
    const isLocked = trial.is_locked === 1 || leadsUsed >= maxLeads

    await db.execute(
      `UPDATE extension_trials 
       SET last_seen_at = datetime('now'),
           last_ip = ?,
           country = COALESCE(?, country),
           client_browser = COALESCE(?, client_browser),
           client_os = COALESCE(?, client_os),
           client_timezone = COALESCE(?, client_timezone),
           fingerprint_components = COALESCE(?, fingerprint_components)
       WHERE fingerprint_hash = ?`,
      [
        ip,
        country,
        client?.browser || null,
        client?.os || null,
        client?.timezone || null,
        fingerprint_components ? JSON.stringify(fingerprint_components) : null,
        fingerprint_hash,
      ]
    )

    return NextResponse.json({
      success: true,
      isNew: false,
      leadsUsed,
      leadsRemaining: Math.max(0, maxLeads - leadsUsed),
      leadsTotal: maxLeads,
      isLocked,
    })
  } catch (error) {
    console.error('Trial init error:', error)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const fingerprint_hash = request.nextUrl.searchParams.get('fingerprint_hash')
    if (!fingerprint_hash || fingerprint_hash.length < 8) {
      return NextResponse.json({ ok: false, error: 'Invalid fingerprint' }, { status: 400 })
    }

    const existing = await db.execute(
      `SELECT * FROM extension_trials WHERE fingerprint_hash = ?`,
      [fingerprint_hash]
    )

    if (existing.rows.length === 0) {
      return NextResponse.json({
        success: true,
        exists: false,
        leadsRemaining: FREE_LEAD_LIMIT,
        leadsTotal: FREE_LEAD_LIMIT,
        isLocked: false,
      })
    }

    const trial = existing.rows[0] as any
    const leadsUsed = Number(trial.leads_used || 0)
    const maxLeads = Number(trial.max_leads || FREE_LEAD_LIMIT)
    const isLocked = trial.is_locked === 1 || leadsUsed >= maxLeads

    return NextResponse.json({
      success: true,
      exists: true,
      leadsUsed,
      leadsRemaining: Math.max(0, maxLeads - leadsUsed),
      leadsTotal: maxLeads,
      isLocked,
      createdAt: trial.created_at,
    })
  } catch (error) {
    console.error('Trial status error:', error)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
