import { DAY_KEYS } from './i18n'
import type { DayKey } from './i18n'

/** Numeric day-of-week string key as stored in Supabase weekly_overrides */
export type WeekDayIndex = '0' | '1' | '2' | '3' | '4' | '5' | '6'

const DAY_TO_INDEX: Record<DayKey, WeekDayIndex> = {
  sunday: '0', monday: '1', tuesday: '2', wednesday: '3',
  thursday: '4', friday: '5', saturday: '6',
}

const INDEX_TO_DAY: Record<WeekDayIndex, DayKey> = {
  '0': 'sunday', '1': 'monday', '2': 'tuesday', '3': 'wednesday',
  '4': 'thursday', '5': 'friday', '6': 'saturday',
}

export function toWeekIndex(key: DayKey): WeekDayIndex {
  return DAY_TO_INDEX[key]
}

export function fromWeekIndex(idx: WeekDayIndex): DayKey {
  return INDEX_TO_DAY[idx]
}

export function todayDayKey(): DayKey {
  return DAY_KEYS[new Date().getDay()]
}
