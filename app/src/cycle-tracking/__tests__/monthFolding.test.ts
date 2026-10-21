import { describe, it, expect } from 'vitest';
import { buildMonthSpans } from '../utils';
import {
  isFoldingEligible, defaultOpenBlock, canFold, foldMonth, openMonth, allOpenBlock,
  collapsedBlock, isAllOpen, visibleDayRange, isDayInRange, foldedDayCount,
  standardCellWidth, foldedContainerWidth, ribbonGroupX, ribbonLabel, ribbonAriaLabel,
  monthPaletteIndex,
  monthPillMode,
  foldMode, frameDays, headerGeometry, stripItems, stripItemLabel, stripItemAriaLabel,
  stripItemTarget, fitStrip, keepsPin, type StripItem,
} from '../monthFolding';

const spans = (startIso: string, lastDay: number) => buildMonthSpans(new Date(startIso), 1, lastDay);
const spansA = spans('2026-07-07', 105);
const spans105 = spansA;

describe('isFoldingEligible', () => {
  it('needs > 40 days and > 1 month', () => {
    expect(isFoldingEligible(40, spans('2026-07-07', 40))).toBe(false);
    expect(isFoldingEligible(41, spans('2026-07-07', 41))).toBe(true);
    expect(isFoldingEligible(60, [{ monthIndex: 0, monthLabel: 'July', startDayNumber: 1, endDayNumber: 60 }])).toBe(false);
  });
});
describe('defaultOpenBlock', () => {
  it('active: opens latest months until >= 40 days, including the crossing month', () => {
    expect(defaultOpenBlock(spansA, true)).toEqual({ from: 2, to: 3 }); // Sep+Oct = 49 days
  });
  it('ended: opens first months until >= 40 days', () => {
    expect(defaultOpenBlock(spansA, false)).toEqual({ from: 0, to: 1 }); // Jul+Aug = 56 days
  });
  it('a 1-day first month keeps adding months until >= 40 days are open', () => {
    const s = spans('2026-07-31', 70); // Jul = 1 day, Aug = 31, Sep = 30, Oct = 8
    expect(defaultOpenBlock(s, false)).toEqual({ from: 0, to: 2 }); // 1 + 31 = 32 < 40 → add Sep
  });
  it('a 41-day two-month cycle opens everything', () => {
    const s = spans('2026-07-07', 41);
    expect(defaultOpenBlock(s, true)).toEqual({ from: 0, to: 1 });
    expect(isAllOpen({ from: 0, to: 1 }, s)).toBe(true);
  });
});
describe('fold/open', () => {
  it('only edge months of a multi-month block can fold', () => {
    expect(canFold({ from: 1, to: 3 }, 1)).toBe(true);
    expect(canFold({ from: 1, to: 3 }, 3)).toBe(true);
    expect(canFold({ from: 1, to: 3 }, 2)).toBe(false);
    expect(canFold({ from: 3, to: 3 }, 3)).toBe(false);
  });
  it('months outside the open block cannot fold', () => {
    expect(canFold({ from: 1, to: 2 }, 0)).toBe(false);
    expect(canFold({ from: 1, to: 2 }, 3)).toBe(false);
  });
  it('foldMonth shrinks from the folded edge and is a no-op otherwise', () => {
    expect(foldMonth({ from: 1, to: 3 }, 1)).toEqual({ from: 2, to: 3 });
    expect(foldMonth({ from: 1, to: 3 }, 3)).toEqual({ from: 1, to: 2 });
    expect(foldMonth({ from: 3, to: 3 }, 3)).toEqual({ from: 3, to: 3 });
  });
  it('openMonth keeps the block contiguous', () => {
    expect(openMonth({ from: 3, to: 3 }, 1)).toEqual({ from: 1, to: 3 });
    expect(openMonth({ from: 0, to: 0 }, 2)).toEqual({ from: 0, to: 2 });
  });
  it('collapsedBlock is the anchor month only', () => {
    expect(collapsedBlock(spansA, true)).toEqual({ from: 3, to: 3 });
    expect(collapsedBlock(spansA, false)).toEqual({ from: 0, to: 0 });
    expect(allOpenBlock(spansA)).toEqual({ from: 0, to: 3 });
  });
});
describe('ranges and counts', () => {
  it('visibleDayRange and foldedDayCount', () => {
    expect(visibleDayRange({ from: 2, to: 3 }, spansA)).toEqual({ minDay: 57, maxDay: 105 });
    expect(foldedDayCount({ from: 2, to: 3 }, spansA)).toBe(56);
    expect(isDayInRange(56, { minDay: 57, maxDay: 105 })).toBe(false);
    expect(isDayInRange(57, { minDay: 57, maxDay: 105 })).toBe(true);
  });
});
describe('geometry', () => {
  it('standardCellWidth is card plot width / 40, floored at MIN_CELL_WIDTH', () => {
    expect(standardCellWidth(1038, 130)).toBe(22);          // (1038-130-40)/40 = 21.7 → 22
    expect(standardCellWidth(2000, 130)).toBeCloseTo(45.75); // (2000-130-40)/40
  });
  it('foldedContainerWidth sums reserves, ribbons and open days', () => {
    expect(foldedContainerWidth({ leftReserve: 130, ribbonsLeft: 48, ribbonsRight: 0, openDays: 49, cellWidth: 22 })).toBe(130 + 48 + 0 + 40 + 1078);
  });
  it('ribbonGroupX pins before-group to the viewport left edge once scrolled past it', () => {
    const args = { side: 'before' as const, naturalX: 82, groupWidth: 48, clientWidth: 1038 };
    expect(ribbonGroupX({ ...args, scrollLeft: 0 })).toBe(82);
    expect(ribbonGroupX({ ...args, scrollLeft: 258 })).toBe(258);
  });
  it('ribbonGroupX pins after-group to the viewport right edge until its slot is in view', () => {
    const args = { side: 'after' as const, naturalX: 1296, groupWidth: 48, clientWidth: 1038 };
    expect(ribbonGroupX({ ...args, scrollLeft: 0 })).toBe(1038 - 48);
    expect(ribbonGroupX({ ...args, scrollLeft: 300 })).toBe(300 + 1038 - 48); // slot still off-screen
    expect(ribbonGroupX({ ...args, scrollLeft: 400 })).toBe(1296);            // slot in view
  });
  it('ribbonGroupX leaves the after-group at its slot when the chart is narrower than the container', () => {
    expect(ribbonGroupX({ side: 'after', naturalX: 600, groupWidth: 72, scrollLeft: 0, clientWidth: 1038 })).toBe(600);
  });
});
describe('monthPillMode', () => {
  it('renders a dot-only control for a narrow foldable month, nothing for a narrow unfoldable one', () => {
    expect(monthPillMode(14, true)).toBe('dot');   // one-day month at 22 px columns
    expect(monthPillMode(14, false)).toBe('none');
    expect(monthPillMode(21.9, true)).toBe('dot');
  });
  it('switches to the short label below 68 px (79 px when a "−" dot is shown)', () => {
    expect(monthPillMode(22, false)).toBe('short');
    expect(monthPillMode(67.9, false)).toBe('short');
    expect(monthPillMode(68, false)).toBe('full');
    expect(monthPillMode(78.9, true)).toBe('short');
    expect(monthPillMode(79, true)).toBe('full');
  });
});

describe('labels and colours', () => {
  it('ribbonLabel / ribbonAriaLabel pluralise', () => {
    expect(ribbonLabel(spansA[2])).toBe('Sep · 30 days');
    expect(ribbonAriaLabel(spansA[2])).toBe('Show September, 30 days');
    const one = spans('2026-07-31', 40)[0];
    expect(ribbonLabel(one)).toBe('Jul · 1 day');
    expect(ribbonAriaLabel(one)).toBe('Show July, 1 day');
  });
  it('monthPaletteIndex cycles every three months', () => {
    expect([0, 1, 2, 3, 4, 5].map(monthPaletteIndex)).toEqual([0, 1, 2, 0, 1, 2]);
  });
});

describe('mode and frame', () => {
  it('foldMode', () => {
    expect(foldMode(true, true)).toBe('ribbons');
    expect(foldMode(false, true)).toBe('pills');
    expect(foldMode(true, false)).toBe('off');
    expect(foldMode(false, false)).toBe('off');
  });
  it('frameDays', () => {
    expect(frameDays('ribbons')).toBe(40);
    expect(frameDays('pills')).toBe(14);
  });
});

describe('defaultOpenBlock with the 14-day frame', () => {
  it('active, anchor month >= 14 days opens it alone', () => {
    expect(defaultOpenBlock(spans105, true, 14)).toEqual({ from: 3, to: 3 }); // Oct 19 days
  });
  it('active, a 2-day anchor month also opens the previous month', () => {
    const s = buildMonthSpans(new Date('2026-07-07'), 1, 119); // day 119 = 2 Nov
    expect(defaultOpenBlock(s, true, 14)).toEqual({ from: 3, to: 4 });
  });
  it('ended opens the first month(s) until >= 14 days', () => {
    expect(defaultOpenBlock(spans105, false, 14)).toEqual({ from: 0, to: 0 }); // Jul 25 days
  });
  it('default frame stays 40', () => {
    expect(defaultOpenBlock(spans105, true)).toEqual({ from: 2, to: 3 });
  });
});

describe('headerGeometry', () => {
  it('pills mode uses a 30 px gutter', () => {
    expect(headerGeometry('pills')).toEqual({ gutter: 30, header: 138, dateTop: 30, weekDayTop: 66, cycleDayTop: 102, hairlineTop: 29 });
  });
  it('ribbons and off keep today', () => {
    const today = { gutter: 22, header: 130, dateTop: 22, weekDayTop: 58, cycleDayTop: 94, hairlineTop: 21 };
    expect(headerGeometry('ribbons')).toEqual(today);
    expect(headerGeometry('off')).toEqual(today);
  });
});

describe('strip model', () => {
  const w = (item: StripItem, compact: boolean) => 12 * stripItemLabel(item, compact).length + 20;
  it('stripItems: one item per month, calendar order, open foldable only at block ends', () => {
    const items = stripItems(spans105, { from: 2, to: 3 });
    expect(items.map((i) => i.kind)).toEqual(['folded', 'folded', 'open', 'open']);
    expect(items.map((i) => stripItemLabel(i, false))).toEqual(['Jul 25', 'Aug 31', 'Sep 30', 'Oct 19']);
    expect(items.filter((i) => i.kind === 'open').map((i) => (i as { foldable: boolean }).foldable)).toEqual([true, true]);
    expect((stripItems(spans105, { from: 3, to: 3 })[3] as { foldable: boolean }).foldable).toBe(false);
  });
  it('labels and aria labels', () => {
    const merged: StripItem = { kind: 'folded', side: 'before', months: spans105.slice(0, 3) };
    expect(stripItemLabel(merged, false)).toBe('Jul–Sep 86');
    expect(stripItemLabel(merged, true)).toBe('Jul–Sep');
    expect(stripItemAriaLabel(merged)).toBe('Show September, 30 days (July–September folded, 86 days)');
    expect(stripItemAriaLabel({ kind: 'folded', side: 'before', months: [spans105[0]] })).toBe('Show July, 25 days');
    expect(stripItemAriaLabel({ kind: 'open', months: [spans105[3]], foldable: true })).toBe('Fold October');
    expect(stripItemAriaLabel({ kind: 'open', months: [spans105[3]], foldable: false })).toBe('October is open');
  });
  it('a merged pill targets the month nearest the open block', () => {
    expect(stripItemTarget({ kind: 'folded', side: 'before', months: spans105.slice(0, 3) })).toBe(2);
    expect(stripItemTarget({ kind: 'folded', side: 'after', months: spans105.slice(1, 4) })).toBe(1);
  });
  it('fitStrip: no merge when it fits', () => {
    const r = fitStrip(spans105, { from: 3, to: 3 }, w, 10_000);
    expect(r).toMatchObject({ compact: false, scroll: false });
    expect(r.items).toHaveLength(4);
  });
  it('fitStrip: merges the before-group from month 0 in threes', () => {
    // 4 unmerged pills ~ 4*92+12 = 380; merged Jul–Sep + Oct ~ 140+92+4 = 236
    const r = fitStrip(spans105, { from: 3, to: 3 }, w, 300);
    expect(r.items.map((i) => stripItemLabel(i, r.compact))).toEqual(['Jul–Sep 86', 'Oct 19']);
    expect(r.compact).toBe(false);
  });
  it('fitStrip: stops after a partial merge', () => {
    const s = buildMonthSpans(new Date('2026-01-01'), 1, 290); // Jan..Oct 17
    const block = { from: 9, to: 9 };
    const full = fitStrip(s, block, w, 10_000).items.length; // 10
    const r = fitStrip(s, block, w, 12 * 70); // fits after one merge
    expect(r.items.length).toBe(full - 2);
    expect(stripItemLabel(r.items[0], false)).toBe('Jan–Mar 90');
    expect(stripItemLabel(r.items[1], false)).toBe('Apr 30');
  });
  it('fitStrip: never merges open months; after-group chunks start from the last month', () => {
    const s = buildMonthSpans(new Date('2026-01-01'), 1, 290);
    const r = fitStrip(s, { from: 0, to: 1 }, w, 400, 4);
    expect(r.items.filter((i) => i.kind === 'open')).toHaveLength(2);
    const lastFolded = r.items[r.items.length - 1];
    expect(lastFolded.months.map((m) => m.monthLabel)).toEqual(['August', 'September', 'October']);
  });
  it('fitStrip: compacts after merging is exhausted, then scrolls', () => {
    const all = { from: 0, to: 3 };
    expect(fitStrip(spans105, all, w, 4 * 12 * 3 + 4 * 20 + 12)).toMatchObject({ compact: true, scroll: false });
    expect(fitStrip(spans105, all, w, 50)).toMatchObject({ compact: true, scroll: true });
  });
});

describe('keepsPin (tooltip guard decision, pills mode ranges)', () => {
  const sepOct = { minDay: 57, maxDay: 105 };
  it('clears when the pinned day\'s month folds away', () => {
    expect(keepsPin(100, sepOct, { minDay: 57, maxDay: 86 })).toBe(false); // Oct folded
  });
  it('survives when a later month folds and the day stays displayed', () => {
    expect(keepsPin(60, sepOct, { minDay: 57, maxDay: 86 })).toBe(true);
  });
  it('survives when a month opens after the block', () => {
    expect(keepsPin(60, { minDay: 57, maxDay: 86 }, sepOct)).toBe(true);
  });
  it('clears when the first displayed day shifts, even if the day stays in range', () => {
    expect(keepsPin(100, sepOct, { minDay: 26, maxDay: 105 })).toBe(false); // Aug opened before
  });
});
