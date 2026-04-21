import { useState } from 'react'

export interface UserProfile {
  sex:           'm' | 'f'
  age:           number
  height:        number   // cm
  weight:        number   // kg
  activityLevel: 0 | 1 | 2 | 3 | 4
  goalType:      'lose' | 'maintain' | 'gain'
}

const LS_KEY = 'user_profile'

const DEFAULT: UserProfile = {
  sex:           'm',
  age:           30,
  height:        170,
  weight:        70,
  activityLevel: 1,
  goalType:      'maintain',
}

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      return saved ? { ...DEFAULT, ...JSON.parse(saved) } : DEFAULT
    } catch {
      return DEFAULT
    }
  })

  const saveProfile = (updates: Partial<UserProfile>) => {
    const next = { ...profile, ...updates }
    setProfile(next)
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  }

  return { profile, saveProfile }
}
