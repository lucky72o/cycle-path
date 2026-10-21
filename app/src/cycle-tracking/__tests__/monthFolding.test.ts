import { describe, it, expect } from 'vitest';
import { buildMonthSpans } from '../utils';
import {
  isFoldingEligible, defaultOpenBlock, canFold, foldMonth, openMonth, allOpenBlock,
  collapsedBlock, isAllOpen, visibleDayRange, isDayInRange, foldedDayCount,
  standardCellWidth, foldedContainerWidth, ribbonGroupX, ribbonLabel, ribbonAriaLabel,
  monthPaletteIndex,
  monthPillMode,
} from '../monthFolding';

const spans = (startIso: string, lastDay: number) => buildMonthSpans(new Date(startIso), 1, lastDay);
const spansA = spans('2026-07-07', 105);

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
