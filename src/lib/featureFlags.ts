// Feature flags — gated by env vars at build time.
// To disable a feature cleanly: set the env var to anything other than 'true'.
// To remove a feature permanently: delete its flag here + remove the JSX usage site.
export const FEATURES = {
  photoNutrition: import.meta.env.VITE_PHOTO_ANALYSIS_ENABLED === 'true',
} as const
