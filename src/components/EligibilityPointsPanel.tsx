/**
 * Succession → Eligibility Points.
 *
 * Sets what each eligibility type contributes to a candidate's Eligibility
 * score, and the raw total that earns the full 15% weight. The succession
 * specification (§D) puts those numbers in the administrator's hands rather
 * than in the code, which is the only reason this screen exists.
 *
 * Built to the shape of OfficeWeightingPanel — the other "admin edits the
 * weights" surface — so the two read as one system: icon header, consequence
 * notice, then a bordered table edited in place.
 */

import { failureText } from '../lib/friendlyErrors';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Award, Check, Plus, Trash2 } from 'lucide-react';
import {
  deleteEligibilityType,
  listEligibilityTypes,
  setPointsForFullMarks,
  upsertEligibilityType,
  type EligibilityType,
} from '../lib/api/eligibilityTypes';

/** How long a "Saved" tick stays up before fading, in ms. */
const SAVED_FLASH_MS = 2000;

export const EligibilityPointsPanel = () => {
  const [types, setTypes] = useState<EligibilityType[]>([]);
  const [cap, setCap] = useState('100');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  // Which add/remove/cap write is in flight; blocks a second click from sending another.
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listEligibilityTypes();
    if (res.ok === false) {
      setError(failureText('load the eligibility types', res.error, { mode: 'load' }));
      setLoading(false);
      return;
    }
    setTypes(res.data);
    if (res.data.length > 0) setCap(String(res.data[0].pointsForFullMarks));
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const flashSaved = (id: string) => {
    setSavedId(id);
    window.setTimeout(() => setSavedId((cur) => (cur === id ? null : cur)), SAVED_FLASH_MS);
  };

  const saveType = async (t: EligibilityType, patch: Partial<EligibilityType>) => {
    setSavingId(t.id);
    setError(null);
    const res = await upsertEligibilityType({
      id: t.id,
      name: patch.name ?? t.name,
      points: patch.points ?? t.points,
      pointsForFullMarks: t.pointsForFullMarks,
      isActive: patch.isActive ?? t.isActive,
      sortOrder: t.sortOrder,
    });
    setSavingId(null);
    if (res.ok === false) {
      setError(failureText('save the eligibility type', res.error));
      return;
    }
    setTypes((prev) => prev.map((x) => (x.id === t.id ? res.data : x)));
    flashSaved(t.id);
  };

  const saveCap = async () => {
    if (busyAction) return;
    const value = Number(cap);
    setError(null);
    setBusyAction('cap');
    const res = await setPointsForFullMarks(value);
    setBusyAction(null);
    if (res.ok === false) {
      setError(failureText('save the points for full marks', res.error));
      return;
    }
    setTypes((prev) => prev.map((t) => ({ ...t, pointsForFullMarks: value })));
  };

  const addType = async () => {
    const name = newName.trim();
    if (!name || busyAction) return;
    setError(null);
    setBusyAction('add');
    const res = await upsertEligibilityType({
      name,
      points: 0,
      pointsForFullMarks: Number(cap) || 100,
      isActive: true,
      sortOrder: types.length + 1,
    });
    setBusyAction(null);
    if (res.ok === false) {
      setError(failureText('add the eligibility type', res.error));
      return;
    }
    setTypes((prev) => [...prev, res.data]);
    setNewName('');
  };

  const removeType = async (t: EligibilityType) => {
    // Deleting a type does not delete anybody's eligibility record; those keep
    // their text and simply stop scoring, which the breakdown reports as "no
    // points configured". Said here so the action does not read as destructive.
    if (busyAction) return;
    setError(null);
    setBusyAction(`remove:${t.id}`);
    const res = await deleteEligibilityType(t.id);
    setBusyAction(null);
    if (res.ok === false) {
      setError(failureText('remove the eligibility type', res.error));
      return;
    }
    setTypes((prev) => prev.filter((x) => x.id !== t.id));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <Award className="h-6 w-6 text-blue-600" />
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Eligibility Points</h2>
          <p className="text-sm text-slate-500">
            What each eligibility contributes to a candidate&rsquo;s Eligibility score in succession ranking
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs text-amber-800">
          Changing these re-ranks every succession candidate. An employee&rsquo;s points are the sum across all
          their valid eligibilities, capped at the full-marks total below, then scaled to the 15% Eligibility
          weight. The seeded values are placeholders — set them deliberately before relying on a ranking.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading eligibility points…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
            <label htmlFor="elig-cap" className="text-sm font-semibold text-slate-900">
              Points for full marks
            </label>
            <input
              id="elig-cap"
              type="number"
              min={1}
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              onBlur={() => void saveCap()}
              className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500">
              The raw total that earns the whole 15%. This is the cap that stops a long list of minor
              credentials reaching full marks.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <div className="col-span-6">Eligibility type</div>
              <div className="col-span-2">Points</div>
              <div className="col-span-2">Active</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            <div className="divide-y divide-slate-100">
              {types.map((t) => (
                <div key={t.id} className="grid grid-cols-12 items-center px-5 py-3.5">
                  <div className="col-span-6 min-w-0">
                    <span className={`truncate text-sm font-semibold ${t.isActive ? 'text-slate-900' : 'text-slate-400'}`}>
                      {t.name}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min={0}
                      defaultValue={t.points}
                      aria-label={`Points for ${t.name}`}
                      disabled={savingId === t.id}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next) && next !== t.points) void saveType(t, { points: next });
                      }}
                      className="w-20 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={t.isActive}
                      aria-label={`${t.name} is active`}
                      disabled={savingId === t.id}
                      onChange={(e) => void saveType(t, { isActive: e.target.checked })}
                      className="h-4 w-4"
                    />
                    {savingId === t.id && <span className="text-xs text-slate-400">Saving…</span>}
                    {savedId === t.id && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                        <Check className="h-3.5 w-3.5" /> Saved
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-right">
                    <button
                      type="button"
                      onClick={() => void removeType(t)}
                      disabled={busyAction !== null}
                      aria-busy={busyAction === `remove:${t.id}` || undefined}
                      aria-label={`Remove ${t.name}`}
                      title="Remove this type. Employee records keep their eligibility; it stops scoring."
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </div>
                </div>
              ))}
              {types.length === 0 && (
                <p className="px-5 py-6 text-center text-sm text-slate-400">
                  No eligibility types configured. Every eligibility on record will score zero until one is added.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void addType(); }}
                placeholder="Add an eligibility type…"
                aria-label="New eligibility type name"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => void addType()}
                disabled={!newName.trim() || busyAction !== null}
                aria-busy={busyAction === 'add' || undefined}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#363EE8] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#191FA8] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Add type
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default EligibilityPointsPanel;
