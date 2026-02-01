'use client';

import React, { useEffect, useState } from 'react';

interface License {
  id: string;
  license_key_hash: string;
  license_key_plaintext?: string;
  plan: string;
  status: string;
  max_activations: number;
  active_activations?: number;
  expires_at?: string;
  customer_email?: string;
  customer_name?: string;
  notes?: string;
  last_used?: string;
  created_at: string;
}

interface ExtensionTrial {
  id: string;
  fingerprint_hash: string;
  fingerprint_components?: string;
  extension_id?: string;
  leads_used: number;
  max_leads: number;
  is_locked: number;
  first_seen_at: string;
  last_seen_at: string;
  last_ip?: string;
  country?: string;
  client_browser?: string;
  client_os?: string;
  client_timezone?: string;
}

interface TrialStats {
  total_users: number;
  licensed_users: number;
  locked_users: number;
  total_leads_used: number;
}

export default function ExtensionAdminClient({ initialLicenses = [], token }: { initialLicenses: any[]; token: string }) {
  const [activeTab, setActiveTab] = useState<'licenses' | 'trials'>('licenses');
  const [licenses, setLicenses] = useState<License[]>(initialLicenses);
  const [trials, setTrials] = useState<ExtensionTrial[]>([]);
  const [stats, setStats] = useState<TrialStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);
  const [newLicenseKey, setNewLicenseKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedLicenseId, setCopiedLicenseId] = useState<string | null>(null);
  const [form, setForm] = useState({ plan: 'lifetime', max_activations: 1, expires_days: 0, customer_email: '', customer_name: '', notes: '' });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showBonusModal, setShowBonusModal] = useState<ExtensionTrial | null>(null);
  const [bonusLeads, setBonusLeads] = useState(50);
  const [editingMaxActivations, setEditingMaxActivations] = useState<string | null>(null);
  const [newMaxActivations, setNewMaxActivations] = useState<number>(1);
  const [ephemeralKeys, setEphemeralKeys] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('admin_ephemeral_keys');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  });

  async function fetchLicenses() {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/licenses', { headers: { 'Authorization': 'Bearer ' + token } });
      const data = await res.json();
      if (data.success) setLicenses(data.licenses || []);
      else alert('Failed to fetch licenses: ' + (data.error || JSON.stringify(data)));
    } catch (err: any) {
      alert('Fetch failed: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  async function fetchTrials() {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/trials', { headers: { 'Authorization': 'Bearer ' + token } });
      const data = await res.json();
      if (data.success) {
        setTrials(data.trials || []);
        setStats(data.stats || null);
      } else alert('Failed to fetch trials: ' + (data.error || JSON.stringify(data)));
    } catch (err: any) {
      alert('Fetch failed: ' + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTrials();
  }, []);

  function fmtDate(v: string | null | undefined) {
    if (!v) return '-';
    try {
      const d = new Date(v);
      return d.toLocaleString();
    } catch { return v; }
  }

  async function trialAction(fingerprintHash: string, action: string, extraData?: any) {
    setActionLoading(fingerprintHash + action);
    try {
      const res = await fetch('/api/v1/admin/trials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ fingerprint_hash: fingerprintHash, action, ...extraData }),
      });
      const data = await res.json();
      if (data.success) {
        fetchTrials();
      } else {
        alert('Action failed: ' + (data.message || data.error || JSON.stringify(data)));
      }
    } catch (err: any) {
      alert('Request failed: ' + (err?.message || err));
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteTrial(fingerprintHash: string) {
    if (!confirm('Delete this trial user? This cannot be undone.')) return;
    setActionLoading(fingerprintHash + 'delete');
    try {
      const res = await fetch('/api/v1/admin/trials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ fingerprint_hash: fingerprintHash }),
      });
      const data = await res.json();
      if (data.success) {
        fetchTrials();
      } else {
        alert('Delete failed: ' + (data.message || data.error || JSON.stringify(data)));
      }
    } catch (err: any) {
      alert('Request failed: ' + (err?.message || err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload: any = { plan: form.plan, max_activations: form.max_activations };
      if (form.expires_days > 0) payload.expires_days = form.expires_days;
      if (form.customer_email.trim()) payload.customer_email = form.customer_email.trim();
      if (form.customer_name.trim()) payload.customer_name = form.customer_name.trim();
      if (form.notes.trim()) payload.notes = form.notes.trim();

      const res = await fetch('/api/v1/admin/licenses/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreate(false);
        setNewLicenseKey(data.license_key);
        try {
          const k = String(data.license_key);
          setEphemeralKeys(prev => {
            const next = { ...prev, [data.license_id]: k };
            try { localStorage.setItem('admin_ephemeral_keys', JSON.stringify(next)); } catch (e) {}
            return next;
          });
          await navigator.clipboard.writeText(k);
          setCopiedKey(true);
        } catch (e) {}
        fetchLicenses();
      } else {
        alert('Create failed: ' + (data.message || data.error || JSON.stringify(data)));
      }
    } catch (err: any) {
      alert('Create request failed: ' + (err?.message || err));
    }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke license ' + id + '?')) return;
    try {
      const res = await fetch('/api/v1/admin/licenses/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ license_id: id })
      });
      const data = await res.json();
      if (data.success || data.ok) {
        alert('Revoked');
        fetchLicenses();
      } else alert('Failed: ' + (data.error || data.message || JSON.stringify(data)));
    } catch (err: any) { alert('Request failed: ' + (err?.message || err)); }
  }

  async function resetActivations(id: string) {
    if (!confirm('Reset activations for ' + id + '?')) return;
    try {
      const res = await fetch('/api/v1/admin/licenses/reset-activations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ license_id: id })
      });
      const data = await res.json();
      if (data.success) {
        alert('Activations reset');
        fetchLicenses();
      } else alert('Failed: ' + (data.error || data.message || JSON.stringify(data)));
    } catch (err: any) { alert('Request failed: ' + (err?.message || err)); }
  }

  async function updateMaxActivations(id: string, maxActivations: number) {
    try {
      const res = await fetch('/api/v1/admin/licenses/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ max_activations: maxActivations })
      });
      const data = await res.json();
      if (data.success) {
        setEditingMaxActivations(null);
        fetchLicenses();
      } else alert('Failed: ' + (data.error || data.message || JSON.stringify(data)));
    } catch (err: any) { alert('Request failed: ' + (err?.message || err)); }
  }

  const visibleLicenses = showRevoked ? licenses : licenses.filter(l => l.status !== 'revoked');

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
        <button
          onClick={() => { fetchLicenses(); fetchTrials(); }}
          style={{ padding: '9px 14px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 999, fontSize: 13, color: '#374151', cursor: 'pointer' }}
        >
          {loading ? 'Refreshing…' : '🔄 Refresh'}
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{stats.total_users}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Total Users</div>
          </div>
          <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb' }}>{licenses.length}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Licensed Users</div>
          </div>
          <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#dc2626' }}>{stats.locked_users}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Trial Ended (Potential Buyers!)</div>
          </div>
          <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#8b5cf6' }}>{stats.total_leads_used}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Total Leads Extracted</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab('licenses')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'licenses' ? '#16a34a' : '#f3f4f6',
            color: activeTab === 'licenses' ? '#fff' : '#374151',
            border: 'none',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          🔑 Licenses ({licenses.length})
        </button>
        <button
          onClick={() => setActiveTab('trials')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'trials' ? '#16a34a' : '#f3f4f6',
            color: activeTab === 'trials' ? '#fff' : '#374151',
            border: 'none',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          👥 Trial Users ({trials.length})
        </button>
      </div>

      {/* Licenses Tab */}
      {activeTab === 'licenses' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <button
              onClick={() => setShowRevoked(v => !v)}
              style={{ padding: '8px 14px', background: showRevoked ? '#111827' : '#ffffff', color: showRevoked ? '#ffffff' : '#374151', border: '1px solid #e5e7eb', borderRadius: 999, fontSize: 12, cursor: 'pointer' }}
            >
              {showRevoked ? 'Hide revoked' : 'Show revoked'}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: '9px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              + Add Extension License
            </button>
          </div>

          <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>License Key</th>
                  <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>Customer</th>
                  <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>Activations</th>
                  <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>Last Used</th>
                  <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleLicenses.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No extension licenses yet.</td></tr>
                )}
                {visibleLicenses.map((lic, index) => {
                  let statusBg = 'rgba(22,163,74,0.12)';
                  let statusColor = '#15803d';
                  if (lic.status === 'revoked') { statusBg = 'rgba(220,38,38,0.10)'; statusColor = '#b91c1c'; }
                  else if (lic.status === 'expired') { statusBg = 'rgba(234,179,8,0.12)'; statusColor = '#b45309'; }

                  return (
                    <tr key={lic.id} style={{ borderBottom: '1px solid #f3f4f6', background: index % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <code style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: '4px 8px', borderRadius: 6, fontSize: 11, color: '#111827' }}>
                            {ephemeralKeys[lic.id] || lic.license_key_plaintext || (lic.license_key_hash?.slice(0, 16) + '…')}
                          </code>
                          {(ephemeralKeys[lic.id] || lic.license_key_plaintext) && (
                            <button
                              onClick={async () => {
                                await navigator.clipboard.writeText(ephemeralKeys[lic.id] || lic.license_key_plaintext!);
                                setCopiedLicenseId(lic.id);
                                setTimeout(() => setCopiedLicenseId(null), 2000);
                              }}
                              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: copiedLicenseId === lic.id ? '#22c55e' : '#fff', color: copiedLicenseId === lic.id ? '#fff' : '#000', cursor: 'pointer', fontSize: 10 }}
                            >{copiedLicenseId === lic.id ? 'Copied!' : 'Copy'}</button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {lic.customer_name && <div style={{ fontWeight: 500, fontSize: 12 }}>{lic.customer_name}</div>}
                        {lic.customer_email && <div style={{ fontSize: 11, color: '#6b7280' }}>{lic.customer_email}</div>}
                        {!lic.customer_name && !lic.customer_email && <span style={{ fontSize: 11, color: '#9ca3af' }}>-</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: statusBg, color: statusColor, textTransform: 'capitalize' }}>
                          {lic.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {editingMaxActivations === lic.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min={1} max={99} value={newMaxActivations} onChange={e => setNewMaxActivations(Math.min(99, Math.max(1, Number(e.target.value))))} style={{ width: 50, padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }} />
                            <button onClick={() => updateMaxActivations(lic.id, newMaxActivations)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: 10 }}>Save</button>
                            <button onClick={() => setEditingMaxActivations(null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 10 }}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span>{lic.active_activations ?? 0} / {lic.max_activations}</span>
                            <button onClick={() => { setEditingMaxActivations(lic.id); setNewMaxActivations(lic.max_activations ?? 1); }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 9, color: '#6b7280' }}>Edit</button>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#4b5563' }}>{fmtDate(lic.last_used)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <button onClick={() => revoke(lic.id)} style={{ marginRight: 4, padding: '6px 11px', borderRadius: 999, border: 'none', background: 'rgba(248,113,113,0.16)', color: '#b91c1c', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Revoke</button>
                        <button onClick={() => resetActivations(lic.id)} style={{ padding: '6px 11px', borderRadius: 999, border: 'none', background: 'rgba(59,130,246,0.08)', color: '#1d4ed8', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Reset</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trials Tab */}
      {activeTab === 'trials' && (
        <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>Fingerprint</th>
                <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>Leads Used</th>
                <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>Last Seen</th>
                <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>Country</th>
                <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600 }}>IP</th>
                <th style={{ padding: '12px 14px', color: '#6b7280', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {trials.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>No trial users tracked yet.</td></tr>
              )}
              {trials.map((trial, index) => {
                const isLocked = trial.is_locked === 1 || trial.leads_used >= trial.max_leads;
                const isLoadingThis = actionLoading?.startsWith(trial.fingerprint_hash);
                const remaining = Math.max(0, trial.max_leads - trial.leads_used);

                return (
                  <tr key={trial.id || trial.fingerprint_hash} style={{ borderBottom: '1px solid #f3f4f6', background: index % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 500, fontSize: 12, fontFamily: 'monospace' }}>
                        {trial.fingerprint_hash?.slice(0, 14)}...{trial.fingerprint_hash?.slice(-6)}
                      </div>
                      {trial.client_browser && (
                        <div style={{ fontSize: 10, color: '#9ca3af' }}>{trial.client_browser} / {trial.client_os || 'Unknown OS'}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontWeight: 600, color: isLocked ? '#dc2626' : '#111827' }}>
                        {trial.leads_used}
                      </span>
                      <span style={{ color: '#6b7280' }}> / {trial.max_leads}</span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {isLocked ? (
                        <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: 'rgba(220,38,38,0.10)', color: '#b91c1c' }}>
                          🔒 Trial Ended
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 500, background: 'rgba(234,179,8,0.12)', color: '#b45309' }}>
                          Trial ({remaining} left)
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#4b5563', fontSize: 11 }}>{fmtDate(trial.last_seen_at)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500 }}>
                      {trial.country ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <img 
                            src={`https://flagcdn.com/16x12/${trial.country.toLowerCase()}.png`} 
                            alt={trial.country}
                            style={{ width: 16, height: 12, borderRadius: 2 }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                          {trial.country}
                        </span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, fontFamily: 'monospace', color: '#6b7280' }}>{trial.last_ip || '-'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button onClick={() => trialAction(trial.fingerprint_hash, 'reset_trial')} disabled={isLoadingThis} title="Reset trial: Set leads to 0 and unlock" style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(59,130,246,0.12)', color: '#2563eb', fontSize: 10, fontWeight: 500, cursor: 'pointer', opacity: isLoadingThis ? 0.5 : 1 }}>🔄 Reset</button>
                        <button onClick={() => { setShowBonusModal(trial); setBonusLeads(50); }} disabled={isLoadingThis} title="Add bonus leads" style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontSize: 10, fontWeight: 500, cursor: 'pointer', opacity: isLoadingThis ? 0.5 : 1 }}>➕ Add</button>
                        {isLocked ? (
                          <button onClick={() => trialAction(trial.fingerprint_hash, 'unlock')} disabled={isLoadingThis} title="Unlock trial" style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(34,197,94,0.12)', color: '#16a34a', fontSize: 10, fontWeight: 500, cursor: 'pointer', opacity: isLoadingThis ? 0.5 : 1 }}>🔓 Unlock</button>
                        ) : (
                          <button onClick={() => trialAction(trial.fingerprint_hash, 'lock')} disabled={isLoadingThis} title="Lock trial" style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(234,179,8,0.12)', color: '#b45309', fontSize: 10, fontWeight: 500, cursor: 'pointer', opacity: isLoadingThis ? 0.5 : 1 }}>🔒 Lock</button>
                        )}
                        <button onClick={() => deleteTrial(trial.fingerprint_hash)} disabled={isLoadingThis} title="Delete trial user" style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(220,38,38,0.12)', color: '#b91c1c', fontSize: 10, fontWeight: 500, cursor: 'pointer', opacity: isLoadingThis ? 0.5 : 1 }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create License Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40 }}>
          <form onSubmit={handleCreate} style={{ background: '#ffffff', padding: 24, borderRadius: 16, minWidth: 340, maxWidth: 420, boxShadow: '0 24px 60px rgba(15,23,42,0.35)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 600, color: '#0f172a' }}>Create Extension License</h3>
            <p style={{ marginTop: 0, marginBottom: 16, fontSize: 12, color: '#6b7280' }}>
              This license key will work for MapsReach Chrome Extension.
            </p>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 13, color: '#111827' }}>
              Plan
              <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 9px', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 13, color: '#111827' }}>
              Max Activations (devices)
              <input type="number" min={1} max={10} value={form.max_activations} onChange={e => setForm({ ...form, max_activations: Math.min(10, Math.max(1, Number(e.target.value))) })} style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 9px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 13, color: '#111827' }}>
              Expire in days (0 = never)
              <input type="number" min={0} value={form.expires_days} onChange={e => setForm({ ...form, expires_days: Number(e.target.value) })} style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 9px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
            </label>
            <label style={{ display: 'block', marginBottom: 10, fontSize: 13, color: '#111827' }}>
              Customer Email
              <input value={form.customer_email} onChange={e => setForm({ ...form, customer_email: e.target.value })} style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 9px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
            </label>
            <label style={{ display: 'block', marginBottom: 14, fontSize: 13, color: '#111827' }}>
              Customer Name
              <input value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} style={{ display: 'block', width: '100%', marginTop: 6, padding: '7px 9px', borderRadius: 8, border: '1px solid #e5e7eb' }} />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#ffffff', fontSize: 13, color: '#374151', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" style={{ padding: '8px 14px', borderRadius: 999, border: 'none', background: '#16a34a', color: '#ffffff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Add Bonus Leads Modal */}
      {showBonusModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#ffffff', padding: 20, borderRadius: 12, minWidth: 320, maxWidth: 400, boxShadow: '0 20px 50px rgba(15,23,42,0.35)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 18, fontWeight: 600 }}>➕ Add Bonus Leads</h3>
            <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, color: '#6b7280' }}>
              Add extra leads to this trial user's allowance.
            </p>
            <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, color: '#374151' }}>
              <strong>Fingerprint:</strong> {showBonusModal.fingerprint_hash?.slice(0, 20)}...
            </p>
            <input
              type="number"
              min="1"
              value={bonusLeads}
              onChange={(e) => setBonusLeads(parseInt(e.target.value) || 0)}
              placeholder="Number of bonus leads"
              style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14, marginBottom: 12 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setShowBonusModal(null); setBonusLeads(50); }} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#ffffff', fontSize: 13, color: '#374151', cursor: 'pointer' }}>Cancel</button>
              <button
                disabled={!!actionLoading || bonusLeads < 1}
                onClick={async () => {
                  await trialAction(showBonusModal.fingerprint_hash, 'add_leads', { bonus_leads: bonusLeads });
                  setShowBonusModal(null);
                  setBonusLeads(50);
                }}
                style={{ padding: '8px 12px', borderRadius: 999, border: 'none', background: '#16a34a', color: '#fff', fontSize: 13, cursor: actionLoading ? 'wait' : 'pointer', opacity: !!actionLoading || bonusLeads < 1 ? 0.6 : 1 }}
              >
                {actionLoading ? 'Adding...' : `Add ${bonusLeads} Leads`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* License Created Modal */}
      {newLicenseKey && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#ffffff', padding: 20, borderRadius: 12, minWidth: 320, maxWidth: 540, boxShadow: '0 20px 50px rgba(15,23,42,0.35)' }}>
            <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 18, fontWeight: 600 }}>Extension License Created! 🧩</h3>
            <p style={{ marginTop: 0, marginBottom: 12, fontSize: 13, color: '#6b7280' }}>
              Copy this key and send it to your customer.
            </p>
            <div style={{ fontFamily: 'monospace', background: '#f3f4f6', padding: 12, borderRadius: 8, fontSize: 14 }}>
              {newLicenseKey}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(String(newLicenseKey));
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2000);
                }}
                style={{ padding: '8px 12px', borderRadius: 999, border: 'none', background: '#16a34a', color: '#fff', fontSize: 13, cursor: 'pointer' }}
              >
                {copiedKey ? 'Copied!' : 'Copy key'}
              </button>
              <button onClick={() => { setNewLicenseKey(null); setCopiedKey(false); }} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#ffffff', fontSize: 13, color: '#374151', cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
