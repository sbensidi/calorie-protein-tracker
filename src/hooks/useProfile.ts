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
}

const LS_KEY = 'user_profile'

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
}


function lsLoad(): UserProfile {
  try {
    const saved = localStorage.getItem(LS_KEY)
    return saved ? { ...DEFAULT, ...JSON.parse(saved) } : DEFAULT
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
    fluidGoalMl:      (row.fluid_goal_ml as number)       ?? DEFAULT.fluidGoalMl,
    fluidThresholdMl: (row.fluid_threshold_ml as number)  ?? DEFAULT.fluidThresholdMl,
    fluidZeroCalOnly:  (row.fluid_zero_cal_only as boolean) ?? DEFAULT.fluidZeroCalOnly,
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
    fluid_goal_ml:       p.fluidGoalMl,
    fluid_threshold_ml:  p.fluidThresholdMl,
    fluid_zero_cal_only: p.fluidZeroCalOnly,
    updated_at:          new Date().toISOString(),
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
      .select('*')
      .eq('id', userId)
      .single()
    if (!err && data) {
      const p = dbToProfile(data as Record<string, unknown>)
      setProfile(p)
      localStorage.setItem(LS_KEY, JSON.stringify(p))
      setError(null)
    } else if (err?.code === 'PGRST116') {
      setError(null)
    } else if (err) {
      setError(err.message)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  const saveProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const prev = profile
    const next = { ...profile, ...updates }
    setProfile(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
    if (!userId) return
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .upsert(profileToDb(next, userId), { onConflict: 'id' })
    if (err) {
      import.meta.env.DEV && console.error('Save profile error:', err)
      setError(err.message)
      setProfile(prev)
      localStorage.setItem(LS_KEY, JSON.stringify(prev))
    } else {
      setError(null)
    }
  }, [profile, userId])

  return { profile, loading, error, saveProfile }
}
