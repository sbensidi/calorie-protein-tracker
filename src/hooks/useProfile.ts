import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { WeightUnit, VolumeUnit } from '../lib/units'

export interface UserProfile {
  sex:                'm' | 'f'
  age:                number
  height:             number   // cm
  weight:             number   // kg
  activityLevel:      0 | 1 | 2 | 3 | 4
  goalType:           'lose' | 'maintain' | 'gain'
  weightUnit:         WeightUnit
  volumeUnit:         VolumeUnit
  fluidGoalMl:        number
  fluidThresholdMl:   number
  fluidZeroCalOnly:   boolean
  defaultServingGrams: number
}

// Only non-sensitive preferences are cached locally — biometrics stay DB-only
const LS_KEY = 'user_prefs'

type UserPrefs = Pick<UserProfile,
  'weightUnit' | 'volumeUnit' | 'fluidGoalMl' | 'fluidThresholdMl' | 'fluidZeroCalOnly' | 'defaultServingGrams'
>

function lsSave(p: UserProfile) {
  const prefs: UserPrefs = {
    weightUnit:          p.weightUnit,
    volumeUnit:          p.volumeUnit,
    fluidGoalMl:         p.fluidGoalMl,
    fluidThresholdMl:    p.fluidThresholdMl,
    fluidZeroCalOnly:    p.fluidZeroCalOnly,
    defaultServingGrams: p.defaultServingGrams,
  }
  localStorage.setItem(LS_KEY, JSON.stringify(prefs))
}

const DEFAULT: UserProfile = {
  sex:                'm',
  age:                30,
  height:             170,
  weight:             70,
  activityLevel:      1,
  goalType:           'maintain',
  weightUnit:         'g',
  volumeUnit:         'ml',
  fluidGoalMl:        2500,
  fluidThresholdMl:   100,
  fluidZeroCalOnly:   false,
  defaultServingGrams: 150,
}


function lsLoad(): UserProfile {
  localStorage.removeItem('user_profile')
  try {
    const saved = localStorage.getItem(LS_KEY)
    // Merge only safe preference fields — biometrics come from DB only
    return saved ? { ...DEFAULT, ...(JSON.parse(saved) as Partial<UserPrefs>) } : DEFAULT
  } catch {
    return DEFAULT
  }
}

function dbToProfile(row: Record<string, unknown>): UserProfile {
  return {
    sex:              (row.sex as 'm' | 'f') ?? DEFAULT.sex,
    age:              (row.age as number)    ?? DEFAULT.age,
    height:           (row.height as number) ?? DEFAULT.height,
    weight:           (row.weight as number) ?? DEFAULT.weight,
    activityLevel:    (row.activity_level as 0|1|2|3|4) ?? DEFAULT.activityLevel,
    goalType:         (row.goal_type as 'lose'|'maintain'|'gain') ?? DEFAULT.goalType,
    weightUnit:       (row.weight_unit as WeightUnit) ?? DEFAULT.weightUnit,
    volumeUnit:       (row.volume_unit as VolumeUnit) ?? DEFAULT.volumeUnit,
    fluidGoalMl:         (row.fluid_goal_ml as number)         ?? DEFAULT.fluidGoalMl,
    fluidThresholdMl:    (row.fluid_threshold_ml as number)    ?? DEFAULT.fluidThresholdMl,
    fluidZeroCalOnly:    (row.fluid_zero_cal_only as boolean)  ?? DEFAULT.fluidZeroCalOnly,
    defaultServingGrams: (row.default_serving_grams as number) ?? DEFAULT.defaultServingGrams,
  }
}

function profileToDb(p: UserProfile, userId: string) {
  return {
    id:                  userId,
    sex:                 p.sex,
    age:                 p.age,
    height:              p.height,
    weight:              p.weight,
    activity_level:      p.activityLevel,
    goal_type:           p.goalType,
    weight_unit:         p.weightUnit,
    volume_unit:         p.volumeUnit,
    fluid_goal_ml:        p.fluidGoalMl,
    fluid_threshold_ml:   p.fluidThresholdMl,
    fluid_zero_cal_only:  p.fluidZeroCalOnly,
    default_serving_grams: p.defaultServingGrams,
    updated_at:           new Date().toISOString(),
  }
}

export function useProfile(userId: string | null) {
  const [profile, setProfile] = useState<UserProfile>(lsLoad)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id,sex,age,height,weight,activity_level,goal_type,weight_unit,volume_unit,fluid_goal_ml,fluid_threshold_ml,fluid_zero_cal_only,default_serving_grams,updated_at')
      .eq('id', userId)
      .single()
    if (!err && data) {
      const p = dbToProfile(data as Record<string, unknown>)
      setProfile(p)
      lsSave(p)
      setError(null)
    } else if (err?.code === 'PGRST116') {
      setError(null)
    } else if (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`profile-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, () => fetchProfile())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, fetchProfile])

  const saveProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const prev = profile
    const next = { ...profile, ...updates }
    setProfile(next)
    lsSave(next)
    if (!userId) return
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .upsert(profileToDb(next, userId), { onConflict: 'id' })
    if (err) {
      if (import.meta.env.DEV) console.error('Save profile error:', err)
      setError(err.message)
      setProfile(prev)
      lsSave(prev)
    } else {
      setError(null)
    }
  }, [profile, userId])

  return { profile, loading, error, saveProfile }
}
