// app/src/cycle-tracking/interpretation/components/cardStyles.ts

export const btn = {
  base: 'px-4 py-2 rounded-md text-sm font-medium transition-colors',
  confirm: 'bg-emerald-600 text-white hover:bg-emerald-700',
  adjust: 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100',
  reject: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100',
  keepWatching: 'bg-white text-gray-500 border border-gray-300 hover:bg-gray-50',
  keepMine: 'bg-emerald-600 text-white hover:bg-emerald-700',
  acceptNew: 'bg-violet-500 text-white hover:bg-violet-600',
  saveAdjust: 'bg-amber-600 text-white hover:bg-amber-700',
  rejectShift: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100',
  keepShift: 'bg-white text-gray-500 border border-gray-300 hover:bg-gray-50',
  secondary: 'bg-white text-gray-500 border border-gray-300 hover:bg-gray-50',
} as const;

export const card = {
  base: 'rounded-lg border overflow-hidden',
  suggested: 'border-violet-200',
  confirmed: 'border-green-200',
  adjusted: 'border-amber-200',
  needsReview: 'border-red-300 border-2',
  falseRise: 'border-red-200',
} as const;

export const header = {
  base: 'px-4 py-3 border-b flex items-center justify-between',
  suggested: 'bg-violet-50 border-violet-200',
  confirmed: 'bg-green-50 border-green-200',
  adjusted: 'bg-amber-50 border-amber-200',
  needsReview: 'bg-red-50 border-red-200',
} as const;

export const footer = {
  base: 'px-4 py-3 border-t flex items-center gap-2',
} as const;

export const badge = {
  high: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700',
  low: 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700',
} as const;
