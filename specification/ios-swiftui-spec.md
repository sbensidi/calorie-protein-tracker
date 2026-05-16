# iOS Native App — SwiftUI Specification
## Calorie & Protein Tracker (מעקב קלוריות)

> **Purpose of this document**: Full implementation spec for an iOS native SwiftUI app that shares the existing Supabase backend (same DB, same Edge Functions) with the web PWA. Any developer or AI coding assistant should be able to build the complete app from this document alone.

---

## 1. Architecture Decision

### Stack
| Layer | Choice | Rationale |
|---|---|---|
| UI | SwiftUI 5+ (iOS 17+) | Declarative, animation-native, RTL-ready |
| Data sync | **Supabase Swift SDK** (`supabase-swift`) | Same DB as web — users share data across platforms |
| Local cache | SwiftData | Offline-first, no setup overhead, integrates with SwiftUI |
| Realtime | Supabase Realtime (WebSocket) | Mirrors web behavior — live sync across devices |
| Auth | Supabase Auth (`GoTrue`) | Email/password + Magic Link + Google OAuth |
| AI nutrition | Shared Edge Function (`/api/nutrition`) | Groq API key stays server-side |
| Barcode | AVFoundation + Vision | Native iOS, no third-party scanner |
| i18n | `LocalizedStringKey` + custom string catalog | Hebrew (RTL) + English |

### What NOT to use
- **CoreData** — replaced by SwiftData
- **CloudKit** — conflicts with Supabase; would require two separate data stores
- **Combine** — use `async/await` + `@Observable` macro (Swift 5.9+)
- **UIKit** — SwiftUI only; use `UIViewRepresentable` only for camera overlay

---

## 2. Supabase Configuration

### Package dependency
```swift
// Package.swift or Xcode SPM
.package(url: "https://github.com/supabase/supabase-swift", from: "2.0.0")
```

### Client initialization
```swift
// SupabaseClient.swift
import Supabase

let supabase = SupabaseClient(
    supabaseURL: URL(string: "https://<PROJECT_REF>.supabase.co")!,
    supabaseKey: "<ANON_KEY>"   // same anon key as web app
)
```

### Environment variables
Store in `Secrets.xcconfig` (not committed to git):
```
SUPABASE_URL = https://<PROJECT_REF>.supabase.co
SUPABASE_ANON_KEY = <anon_key>
```

---

## 3. Data Models

These Swift structs mirror the Supabase database tables exactly. Use `Codable` for DB serialization and `@Model` for SwiftData caching.

### 3.1 Meal
```swift
struct Meal: Codable, Identifiable {
    let id: String
    let userId: String
    var date: String          // "YYYY-MM-DD"
    var mealType: MealType
    var name: String
    var grams: Double         // negative = unit-based (e.g. -2.0 = 2 pieces)
    var calories: Int
    var protein: Double
    var fat: Double?           // grams, optional
    var carbs: Double?         // grams, optional
    var notes: String?         // free-text user notes
    var timeLogged: String    // "HH:mm:ss"
    let createdAt: String
    var fluidMl: Double?      // nil if not a fluid
    var fluidExcluded: Bool   // true = tracked as fluid but excluded from calorie total

    enum CodingKeys: String, CodingKey {
        case id, date, name, grams, calories, protein, fat, carbs, notes
        case userId = "user_id"
        case mealType = "meal_type"
        case timeLogged = "time_logged"
        case createdAt = "created_at"
        case fluidMl = "fluid_ml"
        case fluidExcluded = "fluid_excluded"
    }
}

enum MealType: String, Codable, CaseIterable {
    case breakfast, lunch, dinner, snack, beverage
}
```

### 3.2 Goal
```swift
struct Goal: Codable, Identifiable {
    let id: String
    let userId: String
    var defaultCalories: Int
    var defaultProtein: Int
    var weeklyOverrides: [String: DayOverride]  // "0"–"6" (Sunday=0)
    var updatedAt: String

    struct DayOverride: Codable {
        var calories: Int
        var protein: Int
        var fluidMl: Int?
    }

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case defaultCalories = "default_calories"
        case defaultProtein = "default_protein"
        case weeklyOverrides = "weekly_overrides"
        case updatedAt = "updated_at"
    }
}
```

**Business rule**: `weeklyOverrides` keyed by day-of-week index ("0" = Sunday … "6" = Saturday). When no override exists for a day, use `defaultCalories` / `defaultProtein`.

### 3.3 FoodHistory
```swift
struct FoodHistory: Codable, Identifiable {
    let id: String
    let userId: String
    var name: String
    var grams: Double         // negative = unit-based
    var calories: Int
    var protein: Double
    var fluidMl: Double?
    var useCount: Int
    var lastUsed: String      // ISO date string

    enum CodingKeys: String, CodingKey {
        case id, name, grams, calories, protein
        case userId = "user_id"
        case fluidMl = "fluid_ml"
        case useCount = "use_count"
        case lastUsed = "last_used"
    }
}
```

### 3.4 UserProfile
```swift
struct UserProfile: Codable {
    var sex: Sex
    var age: Int
    var height: Double        // cm
    var weight: Double        // kg
    var activityLevel: Int    // 0–4
    var goalType: GoalType
    var weightUnit: WeightUnit
    var volumeUnit: VolumeUnit
    var fluidGoalMl: Int
    var fluidThresholdMl: Int  // ml above which a meal is auto-detected as fluid
    var fluidZeroCalOnly: Bool // only auto-detect fluids when calories == 0
    var defaultServingGrams: Double  // default "1 serving" size
    var targetWeightKg: Double?      // goal weight for projection

    enum Sex: String, Codable { case m, f }
    enum GoalType: String, Codable { case lose, maintain, gain }
    enum WeightUnit: String, Codable { case g, oz }
    enum VolumeUnit: String, Codable { case ml, cup, tbsp, tsp, fl_oz }

    enum CodingKeys: String, CodingKey {
        case sex, age, height, weight
        case activityLevel = "activity_level"
        case goalType = "goal_type"
        case weightUnit = "weight_unit"
        case volumeUnit = "volume_unit"
        case fluidGoalMl = "fluid_goal_ml"
        case fluidThresholdMl = "fluid_threshold_ml"
        case fluidZeroCalOnly = "fluid_zero_cal_only"
        case defaultServingGrams = "default_serving_grams"
        case targetWeightKg = "target_weight_kg"
    }

    static let defaults = UserProfile(
        sex: .m, age: 30, height: 170, weight: 70,
        activityLevel: 1, goalType: .maintain,
        weightUnit: .g, volumeUnit: .ml,
        fluidGoalMl: 2500, fluidThresholdMl: 100,
        fluidZeroCalOnly: false, defaultServingGrams: 150,
        targetWeightKg: nil
    )
}
```

### 3.5 FoodLibraryItem
```swift
struct FoodLibraryItem: Codable, Identifiable {
    let id: String
    var nameHe: String
    var nameEn: String
    var category: String
    var caloriesPer100g: Double
    var proteinPer100g: Double
    var fatPer100g: Double?
    var carbsPer100g: Double?
    var fiberPer100g: Double?
    var servingSize: Double?
    var servingUnit: String
    var density: Double?      // g/ml, for volume→weight conversion
    var countable: Bool       // true = item can be counted by piece (e.g. "2 eggs")

    enum CodingKeys: String, CodingKey {
        case id, category, density, countable
        case nameHe = "name_he"
        case nameEn = "name_en"
        case caloriesPer100g = "calories_per_100g"
        case proteinPer100g = "protein_per_100g"
        case fatPer100g = "fat_per_100g"
        case carbsPer100g = "carbs_per_100g"
        case fiberPer100g = "fiber_per_100g"
        case servingSize = "serving_size"
        case servingUnit = "serving_unit"
    }
}
```

### 3.6 ComposedGroup
```swift
// Synced to Supabase `composed_groups` table + cached in UserDefaults
struct ComposedGroup: Codable, Identifiable {
    let id: String
    let userId: String
    var name: String
    var mealIds: [String]  // ordered list of Meal.id values

    enum CodingKeys: String, CodingKey {
        case id, name
        case userId = "user_id"
        case mealIds = "meal_ids"
    }
}
```

**Sync rules**:
- On fetch: load from `composed_groups` table filtered by `user_id`
- On create/rename: upsert to DB (conflict on `id`)
- On dissolve: delete row from DB
- On meal delete: remove the meal ID from all groups that reference it; if a group's `mealIds` becomes empty, delete the group row
- Realtime subscription on `composed_groups` table mirrors the meals pattern

### 3.7 NutritionResult
```swift
struct NutritionResult {
    var calories: Int
    var protein: Double
    var fat: Double?    // returned by AI when available
    var carbs: Double?  // returned by AI when available
}
```

### 3.8 BarcodeProduct
```swift
struct BarcodeProduct: Codable {
    var name: String
    var brand: String?
    var barcode: String
    var caloriesPer100g: Double
    var proteinPer100g: Double
    var fatPer100g: Double?    // optional — not always in barcode DB
    var carbsPer100g: Double?  // optional — not always in barcode DB
    var source: String        // "openfoodfacts" | "usda"
}
```

### 3.9 WeightLog
```swift
// Stored in Supabase `weight_log` table. One entry per user per date (unique constraint).
struct WeightLog: Codable, Identifiable {
    let id: String
    let userId: String
    var date: String       // "YYYY-MM-DD"
    var weightKg: Double
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, date
        case userId = "user_id"
        case weightKg = "weight_kg"
        case createdAt = "created_at"
    }
}
```

**Sync rules**:
- Fetch last 180 days, ordered by `date DESC`
- Upsert by `(user_id, date)` — one weight entry per day, later entry wins
- Delete by `id` + RLS (user owns row)
- Realtime subscription on `weight_log` table (same pattern as `meals`)

---

## 4. Business Logic

### 4.1 BMR & TDEE (Mifflin-St Jeor)
```swift
// Same formula as web
func calcBMR(profile: UserProfile) -> Int {
    let base = 10 * profile.weight + 6.25 * profile.height - 5 * Double(profile.age)
    let sex = profile.sex == .m ? 5.0 : -161.0
    return Int(base + sex)
}

let activityMultipliers: [Double] = [1.2, 1.375, 1.55, 1.725, 1.9]

func calcTDEE(profile: UserProfile) -> Int {
    Int(Double(calcBMR(profile: profile)) * activityMultipliers[profile.activityLevel])
}

func suggestedCalories(profile: UserProfile) -> Int {
    let tdee = calcTDEE(profile: profile)
    switch profile.goalType {
    case .lose:     return tdee - 500
    case .gain:     return tdee + 300
    case .maintain: return tdee
    }
}

func suggestedProtein(profile: UserProfile) -> Int {
    let rate: Double = profile.goalType == .lose ? 2.0 : profile.goalType == .gain ? 2.2 : 1.6
    return Int(profile.weight * rate)
}

// Weight (kg) × 35ml = daily fluid target, rounded to nearest 100ml
func suggestedFluidMl(profile: UserProfile) -> Int {
    Int(profile.weight * 35 / 100) * 100
}
```

### 4.2 BMI
```swift
func calcBMI(profile: UserProfile) -> Double {
    let heightM = profile.height / 100
    return (profile.weight / (heightM * heightM)).rounded(toDecimalPlaces: 1)
}

enum BMICategory { case underweight, normal, overweight, obese }

func bmiCategory(bmi: Double) -> BMICategory {
    if bmi < 18.5 { return .underweight }
    if bmi < 25   { return .normal }
    if bmi < 30   { return .overweight }
    return .obese
}
```

### 4.3 Fluid auto-detection
A meal is treated as a fluid entry if ALL of these are true:
1. `fluidMl` is set (not nil)
2. `fluidMl >= profile.fluidThresholdMl`
3. If `fluidZeroCalOnly` is true: `calories == 0`

When a fluid is tracked but excluded (`fluidExcluded == true`), it contributes to fluid total but NOT to calorie/protein totals.

### 4.4 Goal for a specific date
```swift
func goalForDate(_ dateStr: String, goals: Goal) -> (calories: Int, protein: Int) {
    let components = dateStr.split(separator: "-").compactMap { Int($0) }
    guard components.count == 3 else { return (goals.defaultCalories, goals.defaultProtein) }
    var cal = Calendar(identifier: .gregorian)
    cal.firstWeekday = 1
    let date = DateComponents(calendar: cal, year: components[0], month: components[1], day: components[2]).date!
    let dow = String(cal.component(.weekday, from: date) - 1) // 0=Sunday
    if let override = goals.weeklyOverrides[dow] {
        return (override.calories, override.protein)
    }
    return (goals.defaultCalories, goals.defaultProtein)
}
```

### 4.5 Unit conversion
```swift
enum WeightUnit: String { case g, oz }
enum VolumeUnit: String { case ml, cup, tbsp, tsp, fl_oz }

func toBaseGrams(_ amount: Double, unit: WeightUnit) -> Double {
    unit == .oz ? amount * 28.3495 : amount
}

func toBaseMl(_ amount: Double, unit: VolumeUnit) -> Double {
    switch unit {
    case .ml:    return amount
    case .cup:   return amount * 240
    case .tbsp:  return amount * 14.787
    case .tsp:   return amount * 4.929
    case .fl_oz: return amount * 29.574
    }
}

// Volume → grams via density (g/ml). 1.0 = water.
func mlToGrams(_ ml: Double, density: Double) -> Double { ml * density }
func gramsToMl(_ g: Double, density: Double) -> Double  { g / density }
```

### 4.6 Serving size
- Library items may have a `servingSize` (e.g. 1 egg = 60g) and `servingUnit` (e.g. "piece").
- `defaultServingGrams` in `UserProfile` is the fallback when no library match found.
- Display: "serving ≈ 150g" / "מנה ≈ 150ג׳"
- Nutrition is always stored as total calories/protein for the logged amount — NOT per-100g.

### 4.7 Fuzzy matching (library lookup)
Implement the same 5-layer algorithm as web:

```swift
func fuzzyScore(query: String, candidate: String) -> Double {
    let q = query.lowercased().trimmingCharacters(in: .whitespaces)
    let c = candidate.lowercased().trimmingCharacters(in: .whitespaces)

    if q == c { return 1.0 }
    if c.contains(q) || q.contains(c) { return 0.85 }

    // Token overlap (tokens ≥ 3 chars)
    let qt = q.split(separator: " ").map(String.init).filter { $0.count >= 3 }
    let ct = c.split(separator: " ").map(String.init).filter { $0.count >= 3 }
    if !qt.isEmpty && !ct.isEmpty {
        let overlap = qt.filter { t in ct.contains(where: { $0.contains(t) || t.contains($0) }) }.count
        if overlap > 0 { return 0.70 }
    }

    // Prefix/morphological (≥3 chars)
    let minLen = min(q.count, c.count)
    if minLen >= 3 {
        let qPre = String(q.prefix(3)), cPre = String(c.prefix(3))
        if q.hasPrefix(cPre) || c.hasPrefix(qPre) { return 0.65 }
    }

    // Levenshtein normalized
    let dist = levenshtein(q, c)
    let maxLen = max(q.count, c.count)
    guard maxLen > 0 else { return 0 }
    let norm = 1.0 - Double(dist) / Double(maxLen)
    return norm >= 0.55 ? norm * 0.55 : 0
}

let fuzzyThreshold = 0.65

func fuzzyMatchLibrary(query: String, library: [FoodLibraryItem], lang: AppLanguage) -> FoodLibraryItem? {
    guard !query.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
    var best: (item: FoodLibraryItem, score: Double)? = nil
    for item in library {
        let name = lang == .he ? item.nameHe : item.nameEn
        let alt  = lang == .he ? item.nameEn : item.nameHe
        let score = max(fuzzyScore(query: query, candidate: name),
                        fuzzyScore(query: query, candidate: alt) * 0.9)
        if score >= fuzzyThreshold, best == nil || score > best!.score {
            best = (item, score)
        }
    }
    return best?.item
}
```

---

## 5. API Integration

### 5.1 Nutrition Edge Function
Same proxy as web. All calls go through `/api/nutrition` on the Vercel deployment.

```swift
struct NutritionRequest: Encodable {
    let foodName: String
    let amount: Double
    let amountType: String  // "g" or "unit"
}

func fetchNutrition(
    foodName: String,
    amount: Double,
    amountType: String,
    accessToken: String
) async throws -> NutritionResult {
    var req = URLRequest(url: URL(string: "https://your-vercel-app.vercel.app/api/nutrition")!)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    req.httpBody = try JSONEncoder().encode(NutritionRequest(foodName: foodName, amount: amount, amountType: amountType))

    let (data, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse else { throw NutritionError.network }
    if http.statusCode == 429 { throw NutritionError.rateLimit }
    guard http.statusCode == 200 else { throw NutritionError.server }

    let result = try JSONDecoder().decode(NutritionResult.self, from: data)
    return result
}

enum NutritionError: Error { case network, rateLimit, server, parse }
```

**Fallback chain** (same as web):
1. Check `FoodHistory` for exact name + amount match (±5% tolerance)
2. Call `/api/nutrition` proxy → Groq AI
3. If proxy fails: show manual entry fields with zeros pre-filled

### 5.2 Barcode lookup
```swift
func lookupBarcode(_ barcode: String, accessToken: String) async throws -> BarcodeProduct? {
    var url = URLComponents(string: "https://your-vercel-app.vercel.app/api/barcode")!
    url.queryItems = [URLQueryItem(name: "barcode", value: barcode)]
    var req = URLRequest(url: url.url!)
    req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    let (data, response) = try await URLSession.shared.data(for: req)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    return try? JSONDecoder().decode(BarcodeProduct.self, from: data)
}
```

### 5.3 Supabase table operations
```swift
// Fetch meals (last 90 days)
let cutoff = Calendar.current.date(byAdding: .day, value: -90, to: Date())!
let cutoffStr = ISO8601DateFormatter().string(from: cutoff).prefix(10)
let meals: [Meal] = try await supabase
    .from("meals")
    .select("id,user_id,name,calories,protein,grams,date,meal_type,time_logged,created_at,fluid_ml,fluid_excluded")
    .eq("user_id", value: userId)
    .gte("date", value: String(cutoffStr))
    .order("date", ascending: false)
    .order("time_logged", ascending: true)
    .execute()
    .value

// Insert meal
try await supabase.from("meals").insert(meal).execute()

// Update meal
try await supabase.from("meals").update(updates).eq("id", value: id).eq("user_id", value: userId).execute()

// Delete meal
try await supabase.from("meals").delete().eq("id", value: id).eq("user_id", value: userId).execute()

// Upsert goals
try await supabase.from("goals").upsert(goal, onConflict: "user_id").execute()

// Upsert profile
try await supabase.from("profiles").upsert(profile, onConflict: "id").execute()
```

### 5.4 Realtime subscriptions
```swift
// Subscribe to meals changes
let channel = supabase.channel("meals-\(userId)")
let changeStream = channel.postgresChange(
    AnyAction.self,
    schema: "public",
    table: "meals",
    filter: .init(column: "user_id", operator: .eq, value: userId)
)
await channel.subscribe()
for await _ in changeStream {
    await fetchMeals()
}
```

---

## 6. Authentication

### Flows supported
1. **Email + Password** — sign in / sign up
2. **Magic Link** — passwordless email link
3. **Google OAuth** — via universal link callback
4. **Forgot Password** → email reset link
5. **Update Password** — after deep link from reset email

### Auth state management
```swift
@Observable class AuthStore {
    var session: Session? = nil
    var isLoading = true

    init() {
        Task {
            session = try? await supabase.auth.session
            isLoading = false
            for await state in supabase.auth.authStateChanges {
                session = state.session
            }
        }
    }

    var userId: String? { session?.user.id.uuidString.lowercased() }
    var accessToken: String? { session?.accessToken }
}
```

### Sign-in screen layout
- Tab bar: "Sign In" | "Sign Up"
- Email field, Password field, Submit button
- "or" divider
- Google sign-in button
- "Forgot password?" link (→ separate screen)
- Magic link option
- All labels bilingual via i18n system

---

## 7. App Structure & Navigation

### Root
```
ContentView
├── if !auth.session → AuthView
└── else → MainTabView
    ├── Tab 0: TodayView
    ├── Tab 1: HistoryView
    └── Tab 2: SettingsView
```

### Tab 0 — Today (`TodayView`)
**Purpose**: Log meals for today, see daily progress.

**Layout**:
1. `DailySummaryHeader` — Donut ring + calories/protein/fluid bars
2. Meal list grouped by `MealType` (breakfast → lunch → dinner → snack → beverage)
3. Each group shows a collapsible accordion
4. Within a group, `ComposedGroup` cards appear as named units with expandable ingredient list
5. FAB (floating action button) → `FoodEntrySheet`

**DailySummaryHeader**:
- Donut ring: calories consumed vs goal (% arc, colored green/amber/red)
- Inline stats: calories consumed, goal, remaining
- Protein bar: linear progress
- Fluid bar: linear progress (only shown if `fluidGoalMl > 0`)
- Each bar shows value, goal, and % met

**MealCard actions** (swipe or long-press context menu):
- Edit → `FoodEntrySheet` pre-filled
- Duplicate → copies meal to today with current time
- Delete → confirmation alert
- Move to group / Create dish

**ComposedGroup** (named meal composition):
- Header shows group name + total calories/protein
- Expandable to show individual ingredient rows
- **Dissolve (ungroup) button** appears in the card header when expanded — NOT in the footer/bottom of the expanded content. This ensures it's reachable without scrolling through ingredients.
- Actions: rename group (tap name → inline edit), ungroup (dissolve), delete all

### Tab 1 — History (`HistoryView`)
**Purpose**: Browse and filter past days.

**Two view modes** (toggle in toolbar):
- **Calendar view**: Month grid, days colored by goal status (green/amber/red)
- **List view**: Scrollable day cards, most recent first

**Filters** (filter bar above list):
- All | Met goal | Over | Under
- Date range: Week | Month | Custom

**Day card** (list view):
- Date header (localized)
- Calories consumed vs goal — colored chip
- Protein consumed vs goal — colored chip
- Fluid if tracked
- Tap → expand to show all meals for that day

**Month grouping** (list view):
- Days are visually grouped by calendar month
- Each month begins with a section separator: month name + year (e.g. "מאי 2026 ────" / "May 2026 ────")
- Separator is NOT sticky — it scrolls with the list
- Month label uses `HE_MONTHS` / `EN_MONTHS` arrays depending on current language

**Analytics summary** (top of history):
- Avg calories (last 7 or 30 days)
- Avg protein
- Avg fluid
- Days with data count

**Sort**: newest first (default) / oldest first

### Tab 2 — Settings (`SettingsView`)
Organized into sections:

**Personal Profile**:
- Sex (segmented: male/female)
- Age, Height (cm), Weight (kg)
- Activity level (picker: Sedentary → Very Active)
- Goal type (picker: Lose / Maintain / Gain)
- "Save Profile" button

**Metrics section** (auto-calculated, read-only):
- BMR display — basal metabolic rate (Mifflin-St Jeor, at rest)
  - Below the BMR value: show TDEE at the user's current activity level as a secondary note (`TDEE = BMR × ACTIVITY_MULTIPLIERS[activityLevel]`)
  - Example: "TDEE: 2,310 kcal with your activity"
- BMI display with category label + color
- Suggested fluid per day (35 ml × weight kg, rounded to nearest 100 ml)

**Nutrition Goals section**:
- Default calorie goal (stepper + text field)
- Default protein goal (stepper + text field)
- Fluid goal (stepper + text field, in ml)
- TDEE banner with suggested values and "Apply All" button
- Weekly overrides: 7-day grid, each day shows cal/prot/fluid with edit capability
- "Reset all to default" button

**Preferences**:
- Language toggle: Hebrew / English
- Theme style: Classic / Minimal
- Weight unit: g / oz
- Volume unit: ml / cup / tbsp / tsp / fl oz
- Default serving size (text field)
- Fluid threshold (ml) — meals above this auto-detected as fluid
- Zero-cal only fluid detection toggle

**Food Management**:
- Food History list (searchable) — tap to re-use
- Food Library (searchable) — system food database

**Account**:
- Sign Out button
- Link Google account (if not already linked)
- Password change

---

## 8. Food Entry Sheet (`FoodEntrySheet`)

Presented as a bottom sheet (`.sheet` modifier, detents: `.medium`, `.large`).

### Entry modes
1. **Manual entry** — default; type food name + amount
2. **Barcode scan** — camera overlay using `AVFoundation`
3. **Food history** — search recent foods
4. **Food library** — search `FoodLibraryItem` database

### Fields
- Food name (text field, search-as-you-type against history + library)
- Amount value (number field)
- Amount unit picker: g / oz / ml / cup / tbsp / tsp / fl oz / serving
- Meal type picker: breakfast / lunch / dinner / snack / beverage
- Date picker (default: today)
- Fluid ml field (shown when meal type is beverage OR amount unit is a volume)
- "Fluid excluded" toggle (exclude from calorie total)

### AI Calculate button
- Displayed as a **full-width primary-color button** on its own row, below the amount / unit / meal-type row
- Disabled when food name is empty
- Tap → calls nutrition API
  - While calculating: button shows a spinner icon + text "מחשב..." / "Calculating..." with reduced opacity (0.8)
  - Button remains disabled during the calculation to prevent double-submit
- On success: shows confirmation card with calories + protein values
  - "Confirm & Add" button
  - "Edit manually" option
- On error: shows appropriate message (network / rate limit / not found / parse error)
- History cache check happens client-side BEFORE calling API

### Barcode scanner
- Full-screen camera with targeting rectangle
- Uses `AVCaptureSession` + `VNDetectBarcodesRequest`
- On scan → calls `/api/barcode` → pre-fills food name + nutrition
- "Scan again" button if product not found
- Fallback to manual entry always available

### Serving size hint
When food name matches a library item (fuzzy):
- Show chip below name field: "serving ≈ 150g" / "Matched: Chicken Breast"
- Tap chip → auto-fill amount with `servingSize` from library

### Form validation
- Amount must be > 0
- Food name must be non-empty
- Protein and calories cannot both be 0 when adding manually

---

## 9. Internationalization (i18n)

### Language model
```swift
enum AppLanguage: String, CaseIterable {
    case he, en

    var isRTL: Bool { self == .he }
    var locale: Locale { Locale(identifier: rawValue) }
}
```

### String catalog
Create `Localizable.xcstrings` with all keys. Below are ALL translation keys from the web app mapped to both languages:

| Key | Hebrew | English |
|---|---|---|
| appTitle | מעקב קלוריות | Calorie Tracker |
| today | היום | Today |
| history | היסטוריה | History |
| goals | יעדים | Goals |
| settings | הגדרות | Settings |
| foodName | שם המאכל | Food name |
| grams | גרמים | Grams |
| mealType | ארוחה | Meal type |
| breakfast | בוקר | Breakfast |
| lunch | צהריים | Lunch |
| dinner | ערב | Dinner |
| snack | חטיף | Snack |
| beverage | שתייה | Beverage |
| calculate | חשב | Calculate |
| calculating | מחשב... | Calculating... |
| add | הוסף | Add |
| cancel | ביטול | Cancel |
| edit | עריכה | Edit |
| delete | מחק | Delete |
| duplicate | שכפל | Duplicate |
| save | שמור | Save |
| calories | קלוריות | Calories |
| protein | חלבון | Protein |
| caloriesUnit | קק״ל | kcal |
| proteinUnit | ג׳ | g |
| goal | יעד | Goal |
| consumed | נצרך | Consumed |
| noMealsToday | לא נוספו ארוחות היום | No meals logged today |
| noHistory | אין היסטוריה עדיין | No history yet |
| signIn | התחבר | Sign In |
| signUp | הרשם | Sign Up |
| signOut | התנתק | Sign Out |
| email | דוא"ל | Email |
| password | סיסמה | Password |
| magicLink | קישור קסם | Magic Link |
| checkEmail | בדוק את הדוא"ל שלך לקישור כניסה | Check your email for a sign-in link |
| aiError | שגיאה בחישוב AI — הזן ידנית | AI calculation failed — enter manually |
| aiErrorNetwork | שגיאת חיבור — בדוק אינטרנט ונסה שנית | Connection error — check your internet and try again |
| aiErrorNotFound | לא זיהינו את המוצר — נסה לתאר ביתר פירוט | Food not recognized — try adding more details |
| aiErrorRateLimit | יותר מדי בקשות — נסה שוב בעוד כמה שניות | Too many requests — try again in a few seconds |
| aiErrorParse | לא הצלחנו לקרוא את תוצאות הניתוח — נסה שנית | Could not read nutrition results — try again |
| confirmNutrition | ערכים תזונתיים | Nutritional Values |
| serving | מנה | serving |
| servingEqualGrams | מנה ≈ {n}ג׳ | serving ≈ {n}g |
| servingFuzzyMatch | התאמה: {name} | Matched: {name} |
| fluid | נוזלים | Fluid |
| scanBarcode | סריקה | Scan |
| scanHint | כוון את הברקוד למסגרת | Point the barcode at the frame |
| productFound | מוצר זוהה | Product identified |
| productNotFound | מוצר לא נמצא — הזן ידנית | Product not found — enter manually |
| per100g | לכל 100 גרם | Per 100g |
| searchFood | חפש מאכל... | Search food... |
| manualEntry | הזנה ידנית | Manual entry |
| createDish | צור מנה | Create dish |
| dishName | שם המנה | Dish name |
| ingredients | רכיבים | ingredients |
| addIngredient | הוסף רכיב | Add ingredient |
| metGoal | עמד ביעד | Met goal |
| overGoal | חריגה | Over |
| underGoal | חסר | Under |
| bmi | BMI | BMI |
| sex | מין | Sex |
| male | זכר | Male |
| female | נקבה | Female |
| ageLabel | גיל | Age |
| heightCm | גובה (ס"מ) | Height (cm) |
| weightKg | משקל (ק"ג) | Weight (kg) |
| lose | ירידה במשקל | Lose weight |
| maintain | שמירה על משקל | Maintain weight |
| gain | עלייה במשקל | Gain weight |
| sedentary | יושבני (ללא פעילות) | Sedentary (no exercise) |
| lightActive | קלה (1-3 ימי ספורט/שבוע) | Light (1-3 days/week) |
| moderateActive | בינונית (3-5 ימים/שבוע) | Moderate (3-5 days/week) |
| activeLevel | פעיל (6-7 ימים/שבוע) | Active (6-7 days/week) |
| veryActive | פעיל מאוד (עבודה פיזית) | Very Active (physical job) |
| profileSaved | הפרופיל נשמר! | Profile Saved! |
| goalsSaved | היעדים נשמרו | Goals saved |
| goalsApplied | היעדים הוחלו | Goals applied |
| toastSessionExpired | פג תוקף הסשן — אנא התחבר שוב | Session expired — please sign in again |
| toastServerError | שגיאה בתקשורת עם השרת | Server error. Please try again. |
| toastOffline | אין חיבור לאינטרנט | No internet connection |
| forgotPassword | שכחתי סיסמה | Forgot password |
| sendResetLink | שלח קישור לאיפוס | Send Reset Link |
| newPassword | סיסמה חדשה | New password |
| updatePassword | עדכן סיסמה | Update Password |
| passwordUpdated | הסיסמה עודכנה — אפשר להתחבר | Password updated — you can sign in |
| signInWithGoogle | כניסה עם Google | Continue with Google |
| linkGoogle | קשר חשבון Google | Connect Google account |
| foodHistory | היסטוריית מזונות | Food History |
| foodLibrary | ספריית מזונות | Food Library |
| myDishes | מנות שהרכבתי | My composed dishes |
| uses | שימושים | uses |
| applyAll | החל את כל ההמלצות | Apply All Recommendations |
| suggestedCalGoal | יעד קלוריות מומלץ | Suggested Calorie Goal |
| suggestedProtGoal | יעד חלבון מומלץ | Suggested Protein Goal |
| suggestedFluidGoal | יעד נוזלים מומלץ | Suggested Fluid Goal |
| noEnoughData | אין מספיק נתונים עדיין | Not enough data yet |
| avgCal | קל׳ ממוצע | Avg cal |
| avgProt | חל׳ ממוצע | Avg prot |
| avgFluid | נוזלים ממוצע | Avg fluid |
| daysWithData | ימים עם נתונים | days with data |
| styleClassic | קלאסי | Classic |
| styleMinimal | מינימליסטי | Minimal |
| fluidThreshold | סף זיהוי נוזלים | Fluid detection threshold |
| zerocalOnly | 0 קל׳ בלבד | 0-cal only |
| defaultServingGrams | גרמים למנה ברירת מחדל | Default grams per serving |
| sortOldFirst | ישן לחדש | Oldest first |
| sortNewFirst | חדש לישן | Newest first |

### RTL / LTR layout
```swift
@Environment(\.layoutDirection) var layoutDirection

// Or derive from AppLanguage:
var semanticDirection: LayoutDirection {
    appLanguage == .he ? .rightToLeft : .leftToRight
}
```

Apply `.environment(\.layoutDirection, lang.isRTL ? .rightToLeft : .leftToRight)` at the root ContentView level so all children inherit it.

For text alignment: use `.leading` (not `.left` / `.right`) — SwiftUI maps `.leading` to the correct side automatically.

---

## 10. AppStore / Session Persistence

### User preferences (UserDefaults)
```swift
// Keys — stored locally, not synced
let langKey           = "app_lang"          // "he" | "en"
let themeKey          = "app_theme"         // "classic" | "minimal"
let composedGroupsKey = "composed_groups"   // [ComposedGroup] JSON

// Preferences that mirror DB (cached for offline)
let userPrefsKey      = "user_prefs"        // UserProfile subset (no biometrics)
```

**Rule from web**: Only non-sensitive preferences are cached locally. Biometrics (age, height, weight, sex) come from DB only. Cache only: `weightUnit`, `volumeUnit`, `fluidGoalMl`, `fluidThresholdMl`, `fluidZeroCalOnly`, `defaultServingGrams`.

### Offline behavior
- Show cached meals (SwiftData) when offline
- Show "No internet connection" toast
- Queue writes when offline → sync on reconnect (use `URLSession` background tasks or simple retry)
- Realtime subscription reconnects automatically via Supabase SDK

---

## 11. Notification & Toast System

```swift
struct AppToast: Identifiable {
    let id = UUID()
    var message: String
    var type: ToastType
    var action: ToastAction?

    struct ToastAction {
        var label: String
        var handler: () -> Void
    }

    enum ToastType { case success, error, info }
}
```

Display: overlay at bottom of screen, auto-dismiss after 4 seconds (same as web). Slide-up animation. Multiple toasts queue.

---

## 12. Supabase Database Schema (reference)

```sql
-- meals
create table meals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  date          date not null,
  meal_type     text not null check (meal_type in ('breakfast','lunch','dinner','snack','beverage')),
  name          text not null,
  grams         numeric not null,
  calories      integer not null,
  protein       numeric not null,
  time_logged   time not null,
  created_at    timestamptz default now(),
  fluid_ml      numeric,
  fluid_excluded boolean default false
);

-- goals
create table goals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users unique not null,
  default_calories  integer not null default 1700,
  default_protein   integer not null default 160,
  weekly_overrides  jsonb default '{}',
  updated_at        timestamptz default now()
);

-- profiles
create table profiles (
  id                    uuid primary key references auth.users,
  sex                   text check (sex in ('m','f')),
  age                   integer,
  height                numeric,
  weight                numeric,
  activity_level        integer check (activity_level between 0 and 4),
  goal_type             text check (goal_type in ('lose','maintain','gain')),
  weight_unit           text default 'g',
  volume_unit           text default 'ml',
  fluid_goal_ml         integer default 2500,
  fluid_threshold_ml    integer default 100,
  fluid_zero_cal_only   boolean default false,
  default_serving_grams numeric default 150,
  updated_at            timestamptz default now()
);

-- food_history
create table food_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users not null,
  name        text not null,
  grams       numeric not null,
  calories    integer not null,
  protein     numeric not null,
  fluid_ml    numeric,
  use_count   integer default 1,
  last_used   timestamptz default now()
);

-- food_library (read-only, populated by admin)
create table food_library (
  id                 uuid primary key,
  name_he            text not null,
  name_en            text not null,
  category           text not null,
  calories_per_100g  numeric not null,
  protein_per_100g   numeric not null,
  fat_per_100g       numeric,
  carbs_per_100g     numeric,
  fiber_per_100g     numeric,
  serving_size       numeric,
  serving_unit       text default '',
  density            numeric,
  countable          boolean default false
);
```

Row Level Security (RLS) is enabled on all tables. Users can only read/write their own rows. `food_library` is public read.

---

## 13. Key UI Behaviors to Replicate

### Accordion / Expand-collapse
- Each meal type group (breakfast/lunch/dinner/snack/beverage) has a header showing group name + total calories + item count
- Tapping header toggles expanded/collapsed state
- Default: all groups expanded on Today tab
- History: groups collapsed by default (tap to expand)

### Swipe actions
- Swipe left on meal row → Delete (red), Edit (blue)
- Swipe right → Duplicate

### Progress bars
- Calorie bar: green when < 100% of goal, amber at 90–110%, red when > 110%
- Protein bar: green when ≥ 100%, amber when 70–99%, red when < 70%
- Fluid bar: same logic as protein
- **Percentage display is NOT capped at 100%** — show the real ratio (e.g. 136%) when the user exceeds their goal. Color the percentage value in danger/red when over.

### Donut ring
- SVG-style `Circle` with stroke, trimmed to `progress` fraction
- Color: green (met), amber (close), red (over)
- Animated with `withAnimation(.easeInOut)`

### Calendar view (history)
- Month grid with 7-column layout
- Each day cell: colored dot or filled background indicating goal status
- Tap day → sheet showing that day's meals
- Previous/next month navigation

### Composed dish / group
- Select multiple meals → "Create dish" → prompt for group name
- Shows as a single card with expandable ingredient list
- **Dissolve button** is visible in the card header row when the group is expanded (not buried in the scrollable content below). It should use a destructive/danger color to signal it ungroups permanently.
- Rename: tap the group name inline → editable text field; save only if the value actually changed (no-op save if unchanged)
- Composed group data synced to `composed_groups` Supabase table (NOT UserDefaults — see section 3.6)
- When a meal is deleted: automatically remove its ID from all groups; if a group becomes empty after removal, delete the group

### FoodHistory auto-update
- When a meal is added successfully, upsert the food into `food_history`:
  - If food name already exists: increment `use_count`, update `last_used`, update grams/calories/protein with latest values
  - If new: insert fresh row

---

## 14. State Management Architecture

Use the `@Observable` macro (Swift 5.9 / iOS 17):

```swift
@Observable class AppStore {
    // Auth
    var session: Session? = nil
    var isAuthLoading = true

    // User data (fetched after auth)
    var meals: [Meal] = []
    var goals: Goal? = nil
    var profile: UserProfile = .defaults
    var foodHistory: [FoodHistory] = []
    var composedGroups: [ComposedGroup] = []

    // UI state
    var lang: AppLanguage = .he
    var themeStyle: ThemeStyle = .classic
    var activeTab: Tab = .today
    var isEntrySheetOpen = false
    var editingMeal: Meal? = nil
    var toasts: [AppToast] = []

    // Loading / error
    var isLoadingMeals = false
    var isLoadingGoals = false
    var error: String? = nil
}

enum Tab { case today, history, settings }
enum ThemeStyle: String { case classic, minimal }
```

Inject as `@Environment` object at root:
```swift
@main struct CalorieTrackerApp: App {
    @State private var store = AppStore()
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
                .environment(\.layoutDirection, store.lang.isRTL ? .rightToLeft : .leftToRight)
        }
    }
}
```

---

## 15. Design System

### Colors
Match the web CSS token system. Define in `Assets.xcassets` with light/dark variants:

| Token | Light | Dark | Usage |
|---|---|---|---|
| `accent` | `#E63946` (red) | same | Primary brand color |
| `text1` | `#111827` | `#F9FAFB` | Primary text |
| `text2` | `#6B7280` | `#9CA3AF` | Secondary text |
| `surface` | `#FFFFFF` | `#1C1C1E` | Card / sheet background |
| `surfaceRaised` | `#F3F4F6` | `#2C2C2E` | Elevated surface |
| `separator` | `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` | Dividers |
| `positive` | `#10B981` | `#34D399` | Met goal / success |
| `warning` | `#F59E0B` | `#FBBF24` | Close to goal |
| `danger` | `#EF4444` | `#F87171` | Over goal / error |

### Typography
- Primary: SF Pro (system default)
- Hebrew: system font renders Heebo-equivalent via iOS system
- Weights: Regular (400), SemiBold (600), Bold (700), ExtraBold (800)

### Minimum touch targets
44×44pt minimum for all interactive elements (WCAG 2.5.5). Apply `.contentShape(Rectangle())` with explicit frame if needed.

### Shadow scale
Match the web token system. Define four elevation levels:

| Token | Usage | Approximate value |
|---|---|---|
| `shadowSm` | Toggle knob, small chips | `0 1px 4px rgba(0,0,0,0.30)` |
| `shadowMd` | Toasts, search dropdowns | `0 4px 16px rgba(0,0,0,0.20)` |
| `shadowLg` | Autocomplete panels, popovers | `0 8px 24px rgba(0,0,0,0.40)` |
| `shadowXl` | FAB, bottom nav pill | `0 8px 32px rgba(0,0,0,0.50)` + inner highlight |

In SwiftUI: use `.shadow(color:radius:x:y:)` — stack two `.shadow` modifiers for the xl level.

### Spacing scale
4pt base unit: 4, 8, 12, 16, 20, 24, 32, 48

### Minimal vs Classic themes
- **Classic**: standard card shadows, rounded corners 12pt, surface backgrounds
- **Minimal**: hairline separators (0.5pt), no card shadows, more whitespace, accent red for emphasis only

---

## 16. iOS-Specific Considerations

### Safe areas
Use `.safeAreaInset(edge: .bottom)` for FAB and bottom sheets. Never cover the home indicator.

### Dynamic Type
Support all Dynamic Type sizes. Use relative font sizes (`Font.body`, `.headline`, etc.) rather than fixed pt values.

### Camera permissions
Add to `Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>Used to scan food barcodes</string>
```

### Network calls
Use `URLSession` with `async/await`. Handle `URLError.notConnectedToInternet` → show offline toast.

### Background refresh
Register for background app refresh to sync meals when app is backgrounded:
```swift
BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.yourapp.sync", using: nil) { task in
    // Fetch latest data from Supabase
}
```

### Widget (optional, phase 2)
A WidgetKit widget showing today's calorie/protein progress. Uses shared `UserDefaults` app group.

### Haptics
- Light: successful add / duplicate
- Medium: delete confirmation
- Error: failed API call

---

## 17. Edge Function Base URL

The Vercel deployment URL must be configured in the app. Use a build configuration:

```
// Debug: use staging URL
NUTRITION_API_BASE = https://calorie-tracker-staging.vercel.app

// Release: use production URL
NUTRITION_API_BASE = https://calorie-tracker.vercel.app
```

Both `/api/nutrition` (POST) and `/api/barcode` (GET) endpoints are authenticated via the Supabase JWT in the `Authorization` header.

---

## 18. Build & Release Checklist

- [ ] `Secrets.xcconfig` excluded from git (`.gitignore`)
- [ ] Supabase URL + anon key set in config (not hardcoded)
- [ ] Camera permission string added to `Info.plist`
- [ ] Minimum deployment target: iOS 17.0
- [ ] Swift 5.9+ (for `@Observable`)
- [ ] App group configured for widget data sharing
- [ ] Hebrew RTL layout tested on device
- [ ] Dynamic Type large size tested
- [ ] Offline mode tested (airplane mode)
- [ ] Background sync task registered
- [ ] TestFlight build submitted before App Store submission

---

## 19. New Features (v2 — added May 2026)

Ten new features were added to the web PWA and must be replicated in the iOS app.

---

### 19.1 Fat & Carbs Tracking

**DB**: `meals.fat REAL`, `meals.carbs REAL` (nullable columns).

**AI parser** (`/api/nutrition`): now returns `{"calories": N, "protein": N, "fat": N, "carbs": N}`. Parse the extra fields and store them.

**Barcode API** (`/api/barcode`): response now includes `fatPer100g` and `carbsPer100g`. Scale by grams when building the `Meal`.

**UI (FoodEntrySheet confirm card)**:
- After AI calculation, show fat & carbs chips below the calories/protein row
- Chips are editable inline (stepper or text field) — user can correct AI values
- Chips use warning color (amber) for fat, library/positive color for carbs
- Both fields are optional — don't require them for save

**UI (MealRow / MealDetail)**:
- In read mode: show fat/carbs as small inline chips if non-nil
- In edit mode: text inputs for fat and carbs alongside existing calorie/protein fields

---

### 19.2 Notes Field on Meals

**DB**: `meals.notes TEXT` (nullable).

**UI**:
- FoodEntrySheet confirm card: `TextEditor` / multiline `TextField` for notes, 3-line max visible
- MealDetail edit mode: notes text field before Save button
- MealRow read mode: small gray italic paragraph below macros if notes is non-nil

---

### 19.3 Body Weight Log

**DB**: new `weight_log` table (see §3.9). Upsert by `(user_id, date)`.

**ViewModel** (`WeightLogViewModel`):
```swift
@Observable class WeightLogViewModel {
    var entries: [WeightLog] = []
    func logWeight(_ kg: Double, date: String = today()) async throws
    func deleteEntry(_ id: String) async throws
    // Realtime subscription on weight_log table
}
```

**UI (ProfileView / Settings)**:
- Section header "Weight Log" / "יומן משקל"
- Numeric input field + "Log" button → upsert today's entry
- SVG-style line chart (use Swift Charts) of last 8 entries
- List of last 4 entries with delete swipe action

---

### 19.4 Goal Streak

**Logic**: count consecutive days (going backwards from yesterday) where:
1. Calories logged > 0
2. Total calories ≤ that day's goal

Show streak chip in `DailySummaryView` when streak ≥ 2.

```swift
func calcGoalStreak(meals: [Meal], goalForDate: (String) -> Int) -> Int {
    let byDate: [String: Int] = meals.reduce(into: [:]) { acc, m in
        acc[m.date, default: 0] += m.calories
    }
    var streak = 0
    var d = Calendar.current.date(byAdding: .day, value: -1, to: Date())!
    for _ in 0..<90 {
        let key = isoDate(d)
        let cal = byDate[key] ?? 0
        let goal = goalForDate(key)
        guard cal > 0 && cal <= goal else { break }
        streak += 1
        d = Calendar.current.date(byAdding: .day, value: -1, to: d)!
    }
    return streak
}
```

**UI**: amber "🔥 N ימים ברצף" / "🔥 N day streak" chip in `DailySummaryView` header row (aligned opposite to date label).

---

### 19.5 Weekly Calorie Balance

In the History tab stats (week view), compute:
- `weeklyTotal` = sum of calories for days that have data in the current week
- `weeklyGoal`  = sum of daily calorie goals for those same days
- `balance = weeklyTotal − weeklyGoal`

**UI**: a chip between the stat cards and the bar chart:
- Negative balance → green chip with "trending_down" icon: "Weekly deficit: Xkcal"
- Positive balance → amber chip with "trending_up" icon: "Weekly surplus: Xkcal"
- Zero → neutral chip: "Right on target!"

---

### 19.6 Target Date Projection

**Where**: ProfileView → target weight section.

**Input**: `UserProfile.targetWeightKg` (new field, nullable REAL on profiles table).

**Calculation**:
```swift
func projectedDate(profile: UserProfile, tdee: Int, dailyCalGoal: Int) -> Date? {
    guard let target = profile.targetWeightKg else { return nil }
    let dailyDeficit = tdee - dailyCalGoal
    let kgDiff = target - profile.weight
    guard abs(dailyDeficit) >= 50 && dailyDeficit.signum() == kgDiff.signum() else { return nil }
    let days = Int(abs(kgDiff) * 7700 / Double(abs(dailyDeficit)))
    return Calendar.current.date(byAdding: .day, value: days, to: Date())
}
```

**UI**: After the target weight input, if a valid date is computable, show a blue info card:
```
🎯  Reach goal
    June 14, 2026
```

---

### 19.7 Data Export (CSV)

**Where**: Settings main screen row labeled "Export CSV" / "ייצא CSV".

**Logic**:
```swift
func exportMealsCsv(_ meals: [Meal]) -> URL {
    let header = "date,meal_type,name,grams,calories,protein,fat,carbs,notes,time_logged"
    let rows = meals.map { m in
        let notesEscaped = (m.notes ?? "").replacingOccurrences(of: "\"", with: "\"\"")
        return "\(m.date),\(m.mealType.rawValue),\"\(m.name)\",\(m.grams),\(m.calories),\(m.protein),\(m.fat ?? 0),\(m.carbs ?? 0),\"\(notesEscaped)\",\(m.timeLogged)"
    }
    let csv = ([header] + rows).joined(separator: "\n")
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("meals-\(isoDate(Date())).csv")
    try? csv.write(to: url, atomically: true, encoding: .utf8)
    return url
}
```

Present with `ShareLink` (iOS 16+) or `UIActivityViewController` so user can save to Files / share to other apps.

---

### 19.8 Meal Timing Insights

**Where**: History tab stats view (both week and month periods).

**Logic**: for meals in the selected period, group by `mealType`. Compute average `timeLogged` (as minutes since midnight) per type. Display formatted as `HH:mm`.

**UI**: a card at the bottom of the stats section:
- Section header "Meal Timing" / "תזמון ארוחות"
- One row per meal type that has data: colored label | avg time | count (×N)
- Colors match meal type: breakfast=amber, lunch=blue, dinner=green, snack=text-2, beverage=cyan

```swift
func avgTimeLogged(meals: [Meal]) -> [MealType: String] {
    let grouped = Dictionary(grouping: meals, by: \.mealType)
    return grouped.mapValues { ms in
        let avgMins = ms.map { m -> Int in
            let parts = m.timeLogged.split(separator: ":").compactMap { Int($0) }
            return (parts.first ?? 0) * 60 + (parts.dropFirst().first ?? 0)
        }.reduce(0, +) / ms.count
        return String(format: "%02d:%02d", avgMins / 60, avgMins % 60)
    }
}
```

---

### 19.9 Push Notifications

**Where**: ProfileView → "Reminders" / "תזכורות" section.

**iOS permission**: call `UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])`.

**UI**: 
- Card showing current status: "Reminders on" / "Reminders off" / "Blocked — change in Settings"
- Enable button → triggers permission request
- If denied: show "Blocked" label and link to Settings (`UIApplication.openSettingsURLString`)

**Implementation**: Unlike the web (which only requests permission), the iOS app can schedule actual `UNCalendarNotificationTrigger` reminders:
```swift
func scheduleMealReminder(mealType: MealType, hour: Int, minute: Int) {
    let content = UNMutableNotificationContent()
    content.title = mealType == .breakfast ? "ארוחת בוקר" : "Meal reminder"
    content.sound = .default

    var components = DateComponents()
    components.hour = hour
    components.minute = minute

    let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
    let request = UNNotificationRequest(identifier: "meal-\(mealType.rawValue)", content: content, trigger: trigger)
    UNUserNotificationCenter.current().add(request)
}
```

Provide toggles for breakfast (e.g. 08:00), lunch (13:00), dinner (19:00) reminders in the Reminders section.

---

### 19.10 DB Migration

Run this SQL in the Supabase console before deploying the iOS update:

```sql
-- Extend meals table
ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS fat   REAL,
  ADD COLUMN IF NOT EXISTS carbs REAL,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add target weight to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS target_weight_kg REAL;

-- New weight_log table
CREATE TABLE IF NOT EXISTS weight_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  weight_kg  REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE weight_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own weight_log"
  ON weight_log FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS weight_log_user_date
  ON weight_log (user_id, date DESC);
```

> **Important**: The migration file is at `specification/migration_new_features.sql` in the web repo.
