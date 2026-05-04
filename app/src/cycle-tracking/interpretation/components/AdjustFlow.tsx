// app/src/cycle-tracking/interpretation/components/AdjustFlow.tsx
import { useState, useMemo } from 'react';
import type { ThermalShiftResult, UserOverrides, CycleDayInput } from '../types';
import { btn, card, header, footer } from './cardStyles';
import { validateAdjustment, type AdjustValidation } from '../sensiplan/validateAdjustment';
import { fahrenheitToCelsius } from '../../utils';

type AdjustFlowProps = {
  currentResult: ThermalShiftResult;
  days: CycleDayInput[];
  cycleStartDate: Date;
  existingOverrides?: UserOverrides;
  onSave: (overrides: UserOverrides) => Promise<void>;
  onRevert: () => Promise<void>;
  onCancel: () => void;
};

function dateForDayNumber(start: Date, dayNumber: number): Date {
  const d = new Date(start);
  d.setDate(start.getDate() + (dayNumber - 1));
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function tempC(day: CycleDayInput): number | null {
  return day.bbt === null ? null : fahrenheitToCelsius(day.bbt);
}

function reasonMessage(v: Extract<AdjustValidation, { kind: 'invalid' }>, pickedDay: number): string {
  switch (v.reason) {
    case 'picked_day_no_temp':
      return `Day ${pickedDay} has no temperature recorded — it can't be the shift day.`;
    case 'picked_day_excluded':
      return `Day ${pickedDay} is marked excluded from interpretation. Un-exclude it first, or pick another day.`;
    case 'insufficient_lows':
      return `Sensiplan needs 6 valid low temps before the shift day. You have ${v.validLowsCount ?? '?'} (${v.missingDaysCount ?? 0} missing, ${v.excludedDaysCount ?? 0} excluded). Pick a later shift day, or add/un-exclude earlier temps.`;
    case 'not_above_coverline':
      return `Day ${pickedDay}'s temp isn't higher than the coverline. Sensiplan defines the shift as the *first temp above the coverline*. Pick a different day.`;
    case 'earlier_valid_shift_exists':
      return `Cycle Path detects a Sensiplan-valid shift earlier, at Day ${v.earlierShiftDay}. The thermal shift must be the *first* day where the 3-over-6 rule holds. To pick Day ${pickedDay} (later), mark the earlier confirming temps as excluded if you believe they were disturbed.`;
    case 'rule_broken':
      return `Day ${v.failedOnDay}'s temp dropped to/below the coverline, breaking the 3-consecutive-highs rule. This day can't be the shift under Sensiplan.`;
    case 'fourth_day_failed':
      return `Sensiplan requires the 3rd higher temp to reach coverline +0.2 °C, or a 4th consecutive higher temp. Neither holds for Day ${pickedDay}.`;
  }
}

export function AdjustFlow({
  currentResult, days, cycleStartDate, existingOverrides,
  onSave, onRevert, onCancel,
}: AdjustFlowProps) {
  const enginePick = currentResult.status !== 'none' ? currentResult.shiftDay : null;
  const defaultShiftDay = existingOverrides?.shiftDay ?? enginePick ?? 1;
  const [shiftDay, setShiftDay] = useState(defaultShiftDay);
  const [saving, setSaving] = useState(false);

  const validation = useMemo(
    () => validateAdjustment(days, shiftDay),
    [days, shiftDay],
  );

  const canSave = validation.kind === 'valid' && !saving;
  const userDiffersFromEngine = enginePick !== null && shiftDay !== enginePick;
  // P1.A fix: Revert is only meaningful when there's a SAVED adjustment to revert.
  // Don't show the button just because the unsaved picker disagrees with the engine.
  // Otherwise opening AdjustFlow from a CONFIRMED card and experimenting with the
  // picker would let the user demote a persisted CONFIRMED row to SUGGESTED.
  const hasSavedAdjustment = existingOverrides?.shiftDay != null;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({ shiftDay });
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    setSaving(true);
    try {
      await onRevert();
    } finally {
      setSaving(false);
    }
  };

  const dayMap = useMemo(() => {
    const m = new Map<number, CycleDayInput>();
    for (const d of days) m.set(d.dayNumber, d);
    return m;
  }, [days]);

  return (
    <div className={`${card.base} ${card.adjusted}`}>
      <div className={`${header.base} ${header.adjusted}`}>
        <span className="font-semibold text-sm text-violet-700">Adjust Thermal Shift Day</span>
        <p className="text-xs text-gray-500 mt-1">
          Pick the day of the first higher temperature. The coverline is calculated automatically from the 6 preceding low temps (Sensiplan rule).
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* Section 1 — Shift day picker */}
        <div>
          <label className="block text-xs text-gray-500 font-medium mb-1">Shift day</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              value={shiftDay}
              onChange={(e) => setShiftDay(Number(e.target.value))}
              className="w-20 px-3 py-2 rounded-md border-2 border-violet-500 bg-violet-50 font-medium text-sm"
            />
            {enginePick !== null && (
              <span className="text-xs text-gray-500">Cycle Path suggests Day {enginePick}.</span>
            )}
          </div>
          {hasSavedAdjustment && (
            <button
              onClick={handleRevert}
              disabled={saving}
              className="text-xs text-violet-600 underline mt-2 disabled:opacity-50"
            >
              Revert to Cycle Path's suggestion
            </button>
          )}
        </div>

        {/* Section 2 — Validity panel */}
        {validation.kind === 'valid' && validation.status === 'confirmed' && (
          <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            ✓ <strong>Sensiplan thermal shift confirmed.</strong> Day {shiftDay} is the first higher temp. 3 confirming temps satisfy the rule.
          </div>
        )}
        {validation.kind === 'valid' && validation.status === 'pending' && (
          <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
            ⏳ <strong>Awaiting more temperatures.</strong> Day {shiftDay} is above the coverline.{' '}
            {(() => {
              // P3 fix: validation.confirmingDays already includes the picked shift day,
              // so 3 - length is the correct "more highs needed" count for the simple
              // 3-over-6 path. (4-day exception adds at most 1 more if 3rd doesn't clear,
              // which is fine — the message stays accurate as a minimum.)
              const remaining = Math.max(0, 3 - validation.confirmingDays.length);
              return remaining === 0
                ? 'Awaiting either a clearance to coverline +0.2 °C or a 4th consecutive high.'
                : `Need ${remaining} more high temp${remaining === 1 ? '' : 's'} to confirm (3rd must reach coverline +0.2 °C, or a 4th consecutive high temp confirms).`;
            })()}
            <p className="mt-1 italic text-xs">You can save this adjustment now — it'll finalize once more data is recorded.</p>
          </div>
        )}
        {validation.kind === 'invalid' && (
          <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
            ✗ <strong>Not a valid Sensiplan shift.</strong>
            <p className="mt-1">{reasonMessage(validation, shiftDay)}</p>
          </div>
        )}

        {/* Section 2.5 — Soft warning for early shifts */}
        {validation.kind === 'valid' && validation.softWarning === 'early_shift' && (
          <div className="p-3 rounded-md bg-amber-50 border border-amber-300 text-xs text-amber-900">
            ⚠ <strong>Early shift — reference temps may include menstrual days.</strong> Sensiplan recommends the 6 reference temps come from the post-menstrual low phase. With a shift this early, your reference may include early-cycle days that carry leftover heat from your previous luteal phase. You can still save this — just review the reference temps below carefully.
          </div>
        )}

        {/* Section 3 — Reference temps card (only when validation has reference data) */}
        {validation.kind === 'valid' && (
          <div className="p-3 rounded-md bg-gray-50 border border-gray-200">
            <div className="text-xs font-semibold text-gray-700 mb-2">6 preceding low temps (reference)</div>
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-500">
                  <th className="text-left font-normal">Date</th>
                  <th className="text-left font-normal">Cycle day</th>
                  <th className="text-left font-normal">Temp</th>
                  <th className="text-left font-normal">Note</th>
                </tr>
              </thead>
              <tbody>
                {[...validation.referenceDays, ...validation.skippedDays]
                  .sort((a, b) => a - b)
                  .map((dayNum) => {
                    const d = dayMap.get(dayNum);
                    if (!d) return null;
                    const isReference = validation.referenceDays.includes(dayNum);
                    const tC = tempC(d);
                    const isCoverline = isReference && tC === validation.coverlineTemp;
                    return (
                      <tr key={dayNum} className={isReference ? '' : 'text-gray-400 line-through'}>
                        <td>{formatDate(dateForDayNumber(cycleStartDate, dayNum))}</td>
                        <td>Day {dayNum}</td>
                        <td>{tC === null ? '—' : `${tC.toFixed(2)} °C`}</td>
                        <td>
                          {!isReference && (d.excludeFromInterpretation ? 'excluded — skipped' : tC === null ? 'missing — skipped' : '')}
                          {isCoverline && <strong className="text-violet-700">← Coverline</strong>}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* Section 4 — Confirming temps card (only when validation is valid) */}
        {validation.kind === 'valid' && (
          <div className="p-3 rounded-md bg-violet-50 border border-violet-200">
            <div className="text-xs font-semibold text-violet-700 mb-2">Confirming temps</div>
            <table className="text-xs w-full">
              <thead>
                <tr className="text-violet-500">
                  <th className="text-left font-normal">Date</th>
                  <th className="text-left font-normal">Cycle day</th>
                  <th className="text-left font-normal">Temp</th>
                  <th className="text-left font-normal">Above</th>
                  <th className="text-left font-normal">Note</th>
                </tr>
              </thead>
              <tbody>
                {validation.confirmingDays.map((dayNum, idx) => {
                  const d = dayMap.get(dayNum);
                  if (!d) return null;
                  const tC = tempC(d);
                  if (tC === null) return null;
                  const above = tC - validation.coverlineTemp;
                  const isShift = idx === 0;
                  const isThird = idx === 2;
                  return (
                    <tr key={dayNum}>
                      <td>{formatDate(dateForDayNumber(cycleStartDate, dayNum))}</td>
                      <td>Day {dayNum}</td>
                      <td>{tC.toFixed(2)} °C</td>
                      <td>+{above.toFixed(2)} °C</td>
                      <td>
                        {isShift && <strong>1st higher (shift day)</strong>}
                        {idx === 1 && '2nd higher'}
                        {isThird && !validation.usedFourthDayException && (
                          above >= 0.2
                            ? <span className="text-emerald-700">3rd higher — clears +0.2 ✓</span>
                            : '3rd higher'
                        )}
                        {idx === 3 && validation.usedFourthDayException && (
                          <span className="text-emerald-700">4th-day exception ✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Section 5 — Engine comparison strip */}
        {userDiffersFromEngine && validation.kind === 'valid' && enginePick !== null && currentResult.status !== 'none' && (
          <div className="p-2 bg-violet-50 rounded-md text-xs text-violet-700 border border-violet-200">
            Cycle Path suggests Day {enginePick} (coverline {currentResult.coverlineTemp.toFixed(2)} °C). You're picking Day {shiftDay} (coverline {validation.coverlineTemp.toFixed(2)} °C).
          </div>
        )}
      </div>

      <div className={`${footer.base} bg-violet-50 border-violet-200`}>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className={`${btn.base} ${btn.saveAdjust} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {saving ? 'Saving...' : 'Save Adjustment'}
        </button>
        <button onClick={onCancel} className={`${btn.base} ${btn.secondary}`}>Cancel</button>
      </div>
    </div>
  );
}
