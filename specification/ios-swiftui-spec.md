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
    var displayUnit: String?  // original entry unit when not grams (e.g. "cup", "tbsp", "ml", "fl_oz")
    var displayAmount: Double? // original entry amount in that unit (e.g. 1.5 for "1.5 cups")
    // nil for both when meal was entered in grams or as pcs (pieces/servings)

    enum CodingKeys: String, CodingKey {
        case id, date, name, grams, calories, protein, fat, carbs, notes
        case userId = "user_id"
        case mealType = "meal_type"
        case timeLogged = "time_logged"
        case createdAt = "created_at"
        case fluidMl = "fluid_ml"
        case fluidExcluded = "fluid_excluded"
        case displayUnit = "display_unit"
        case displayAmount = "display_amount"
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
    var showGreeting: Bool           // show/hide daily greeting panel (default true)
    var displayName: String?         // optional custom name shown in greeting, overrides Google name

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
        case showGreeting = "show_greeting"
        case displayName = "display_name"
    }

    static let defaults = UserProfile(
        sex: .m, age: 30, height: 170, weight: 70,
        activityLevel: 1, goalType: .maintain,
        weightUnit: .g, volumeUnit: .ml,
        fluidGoalMl: 2500, fluidThresholdMl: 100,
        fluidZeroCalOnly: false, defaultServingGrams: 150,
        targetWeightKg: nil, showGreeting: true, displayName: nil
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
// Synced to Supabase `composed_groups` table + cached locally (UserDefaults/SwiftData).
struct ComposedGroup: Codable, Identifiable {
    let id: String
    let userId: String
    var name: String
    var mealIds: [String]      // ordered list of Meal.id values that belong to this group
    var batchWeightG: Double?  // estimated total cooked weight (g) — when set, enables recipe scaling
    var totalCalories: Int?    // total calories of all ingredients, cached at save time
    var totalProtein: Double?  // total protein of all ingredients, cached at save time

    enum CodingKeys: String, CodingKey {
        case id, name
        case userId = "user_id"
        case mealIds = "meal_ids"
        case batchWeightG = "batch_weight_g"
        case totalCalories = "total_calories"
        case totalProtein = "total_protein"
    }
}
```

**Sync rules**:
- On fetch: load from `composed_groups` table filtered by `user_id`
- On create/rename: upsert to DB (conflict on `id`); always persist `batch_weight_g`, `total_calories`, `total_protein`
- On dissolve: delete row from DB
- On meal delete: remove the meal ID from all groups that reference it; if a group's `mealIds` becomes empty, delete the group row
- Realtime subscription on `composed_groups` table mirrors the meals pattern
- Local cache (UserDefaults JSON) used as immediate read source; DB is authoritative

**Recipe scaling**: when `batchWeightG != nil`, the group card shows a "Log portion" mode — the user enters consumed grams and the app scales `totalCalories` / `totalProtein` proportionally (see §22.3).

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

// Entry units — superset of weight + volume + pcs
enum EntryUnit: String {
    case g, oz, ml, cup, tbsp, tsp, fl_oz
    case pcs   // pieces / servings — "מנה" (he) / "serving" (en)
}

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

**`pcs` (pieces/servings) unit**:
- Used for unit-based library items (e.g. "2 eggs", "1 avocado") where `FoodLibraryItem.grams < 0`
- Also selected manually by the user for any item
- Gram anchor: `defaultServingGrams` (from user profile) or `FoodLibraryItem.servingSize` when a library match is found
- Display: "מנה" (Hebrew) / "serving" (English) in the unit picker
- Stored as `grams = -amount` in DB (e.g. 2 pieces → `grams = -2.0`); `display_unit` / `display_amount` are `nil` for pcs entries

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
    .select("id,user_id,name,calories,protein,grams,date,meal_type,time_logged,created_at,fluid_ml,fluid_excluded,fat,carbs,notes,display_unit,display_amount")
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
- Amount unit picker: **g / oz / ml / cup / tbsp / tsp / fl oz / serving (pcs)**
  - `pcs` = "מנה" (he) / "serving" (en) — for unit-based items and library items with a defined serving size
  - Auto-selected when a library item with `grams < 0` is chosen
  - Shows a gram-anchor hint below the field: "~150g per serving" / "~150ג׳ למנה"
- Meal type picker: breakfast / lunch / dinner / snack / beverage
- Date picker (default: today)
- Fluid ml field (shown when meal type is beverage OR amount unit is a volume)
- "Fluid excluded" toggle (exclude from calorie total)

### Unit switching — intelligent cal/prot scaling
When the user changes the amount unit after nutrition values have been calculated, the app recalculates calories and protein automatically:
- **Non-pcs ↔ non-pcs** (e.g., g → oz, ml → cup): amount stays the same; calories/protein recalculate for the new physical quantity
- **pcs → weight/volume**: ratio shifts from cal/serving to cal/gram; calories/protein recalculate for current amount
- **weight/volume → pcs**: ratio shifts from cal/gram to cal/serving; calories/protein recalculate
- If no nutrition ratio is known yet (before AI calculation), unit switching only changes the unit label — no recalculation

### Composed dish / recipe portion logging
When the food entry sheet is opened from a ComposedGroup card that has `batchWeightG` set:
- Shows a special **"Log portion"** mode: a gram input for the amount consumed
- On confirm: scales `totalCalories` and `totalProtein` proportionally and inserts as a single meal row
  ```swift
  let ratio = portionG / group.batchWeightG!
  let cal  = Int((Double(group.totalCalories!) * ratio).rounded())
  let prot = (group.totalProtein! * ratio * 10).rounded() / 10
  ```

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
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users not null,
  date           date not null,
  meal_type      text not null check (meal_type in ('breakfast','lunch','dinner','snack','beverage')),
  name           text not null,
  grams          numeric not null,
  calories       integer not null,
  protein        numeric not null,
  time_logged    time not null,
  created_at     timestamptz default now(),
  fluid_ml       numeric,
  fluid_excluded boolean default false,
  fat            real,           -- grams of fat (optional)
  carbs          real,           -- grams of carbs (optional)
  notes          text,           -- free-text user notes (optional)
  display_unit   text,           -- original entry unit when not grams (e.g. 'cup', 'tbsp', 'ml', 'fl_oz')
  display_amount real            -- original entry amount in that unit
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
  target_weight_kg      real,
  show_greeting         boolean not null default true,
  display_name          text,
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

-- composed_groups — named dish groupings with optional batch-weight for recipe scaling
create table composed_groups (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users not null,
  name            text not null,
  meal_ids        text[] not null default '{}',
  batch_weight_g  real,           -- total estimated cooked weight; set → enables recipe scaling
  total_calories  integer,        -- cached sum of all ingredient calories
  total_protein   real,           -- cached sum of all ingredient protein
  updated_at      timestamptz default now()
);
alter table composed_groups enable row level security;
create policy "Users manage own composed_groups"
  on composed_groups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- weight_log — one entry per user per day
create table weight_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  weight_kg  real not null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
alter table weight_log enable row level security;
create policy "Users manage own weight_log"
  on weight_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create index weight_log_user_date on weight_log (user_id, date desc);
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

In the History tab stats (week view), the balance card shows **two rows**:

**Row 1 — Plan adherence** (consumed vs. user's calorie goal):
```swift
let weeklyTotal = meals.filter { isInWeek($0.date) }.reduce(0) { $0 + $1.calories }
let weeklyGoal  = daysInWeek.reduce(0) { $0 + goalForDate($1).calories }
let planDiff    = weeklyTotal - weeklyGoal   // positive = over goal
```
- Display: `"+1,200 kcal vs. plan"` / `"+1,200 קק״ל מהיעד"` (amber if over, green if under)
- Exact: show "✓" instead of a number when `planDiff == 0`

**Row 2 — Actual weight impact** (consumed vs. calculated TDEE):
```swift
let weeklyTdee   = calcWeeklyTdee(profile)          // formula-based (or HealthKit — see §20)
let tdeeBalance  = weeklyTotal - weeklyTdee          // negative = deficit
let weightGrams  = Int(abs(Double(tdeeBalance)) / 7.7) // 7700 kcal/kg ÷ 1000 = grams
```
- Deficit (`tdeeBalance < 0`) → green: `"~150g loss"` / `"ירידה של ~150 גרם"`
- Surplus (`tdeeBalance > 0`) → amber: `"~80g gain"` / `"עלייה של ~80 גרם"`
- Zero → neutral: `"No weight change"` / `"ללא שינוי במשקל"`
- Footer note: `"* estimate based on calculated TDEE"` (or `"* from Apple Health"` when HealthKit active — see §20)

**UI**: a card in the History stats section with two labelled rows and a footer note.

---

### 19.6 Target Date Projection

**Where**: ProfileView → target weight section.

**Input**: `UserProfile.targetWeightKg` (new field, nullable REAL on profiles table).

**Calculation**:
```swift
func projectedDate(profile: UserProfile, tdee: Int, dailyCalGoal: Int) -> Date? {
    guard let target = profile.targetWeightKg else { return nil }
    let dailyDeficit = tdee - dailyCalGoal   // positive = eating under TDEE (deficit)
    let kgDiff = target - profile.weight     // negative = wanting to lose
    // Valid only when directions align: deficit + loss goal (signs differ), or surplus + gain goal (signs differ).
    // Same sign = wrong direction (e.g. eating at deficit but targeting weight gain).
    guard abs(dailyDeficit) >= 50 && dailyDeficit.signum() != kgDiff.signum() else { return nil }
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

### 19.8 Calorie Distribution by Meal Type

> **Note**: Meal timing insights (average `timeLogged` per type) were removed — `timeLogged` reflects data-entry time, not eating time, making it unreliable for insights.

**Where**: History tab stats view (both week and month periods).

**Logic**: group meals in the selected period by `mealType`, sum calories per type, compute each type's share of the grand total (rounded to nearest integer %).  
Skip types with 0 calories. Sort descending by calorie share.  
If grand total is 0, hide the card.

**UI**: a card in the stats section:
- Section header "Calories by meal type" / "התפלגות קלוריות לפי ארוחה"
- One row per type (in descending calorie order):
  - Type label in type color | pct label right-aligned
  - Thin horizontal progress bar (height 5 pt, corner radius 3) filled to `pct%`
- Type colors: breakfast=amber, lunch=blue, dinner=green, snack=text-secondary, beverage=cyan

```swift
struct MealTypeSlice {
    let type: MealType
    let kcal: Int
    let pct: Int
}

func calcMealTypeDistribution(meals: [Meal]) -> [MealTypeSlice] {
    let totals = Dictionary(grouping: meals, by: \.mealType)
        .mapValues { $0.reduce(0) { $0 + $1.calories } }
    let grand = totals.values.reduce(0, +)
    guard grand > 0 else { return [] }
    return totals
        .filter { $0.value > 0 }
        .map { MealTypeSlice(type: $0.key, kcal: $0.value, pct: Int(($0.value * 100 / grand).rounded())) }
        .sorted { $0.kcal > $1.kcal }
}
```

---

### 19.9 Macro Breakdown (אבות המזון)

**Where**: History tab stats view (both week and month periods), below the calorie distribution card.

**Logic**:
1. Count how many meals in the period have both `fat ≠ nil` and `carbs ≠ nil` → `coverage = count / total`.
2. If `coverage ≥ 0.5` (`hasFatCarbs = true`): compute macro kcal using only those meals. Protein 4 kcal/g · fat 9 kcal/g · carbs 4 kcal/g.
3. If `coverage < 0.5` (`hasFatCarbs = false`): use all meals, compute protein kcal only.
4. Each macro's `%` = its kcal / total macro kcal (rounded).
5. If total macro kcal is 0, hide the card.

**UI**: a card in the stats section:
- Section header "Macronutrients" / "אבות המזון"
- Protein row always shown (color = accent/blue)
- Fat (amber) and carbs (green) rows shown only when `hasFatCarbs = true`
- Each row: macro label | pct right-aligned | thin progress bar (same style as §19.8)
- Footer note (small, text-tertiary):
  - `hasFatCarbs = false`: "Fat & carbs missing in over half of entries" / "שומן ופחמימות: חסרים בפחות ממחצית הרשומות"
  - `hasFatCarbs = true && coverage < 1.0`: "Based on {pct}% of entries with fat & carb data" / "מבוסס על {pct}% מהרשומות שכוללות שומן ופחמימות"

```swift
struct MacroBreakdown {
    let proteinPct: Int
    let fatPct: Int
    let carbsPct: Int
    let totalKcal: Double
    let hasFatCarbs: Bool
    let coverage: Double
}

func calcMacroBreakdown(meals: [Meal]) -> MacroBreakdown {
    guard !meals.isEmpty else {
        return MacroBreakdown(proteinPct: 0, fatPct: 0, carbsPct: 0, totalKcal: 0, hasFatCarbs: false, coverage: 0)
    }
    let withFatCarbs = meals.filter { $0.fat != nil && $0.carbs != nil }
    let coverage = Double(withFatCarbs.count) / Double(meals.count)
    let hasFatCarbs = coverage >= 0.5
    let source = hasFatCarbs ? withFatCarbs : meals
    let protKcal  = source.reduce(0.0) { $0 + Double($1.protein) * 4 }
    let fatKcal   = hasFatCarbs ? source.reduce(0.0) { $0 + Double($1.fat ?? 0) * 9 } : 0
    let carbKcal  = hasFatCarbs ? source.reduce(0.0) { $0 + Double($1.carbs ?? 0) * 4 } : 0
    let total = protKcal + fatKcal + carbKcal
    guard total > 0 else {
        return MacroBreakdown(proteinPct: 0, fatPct: 0, carbsPct: 0, totalKcal: 0, hasFatCarbs: hasFatCarbs, coverage: coverage)
    }
    return MacroBreakdown(
        proteinPct: Int((protKcal / total * 100).rounded()),
        fatPct:     Int((fatKcal  / total * 100).rounded()),
        carbsPct:   Int((carbKcal / total * 100).rounded()),
        totalKcal:  total,
        hasFatCarbs: hasFatCarbs,
        coverage:    coverage
    )
}
```

---

### 19.10 Push Notifications

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

### 19.11 Daily Greeting Panel

**Where**: Today tab, above the DailySummary card.

**Visibility**: controlled by `profiles.show_greeting` (boolean, default `true`). User can dismiss permanently via X button or toggle in Settings → Appearance.

**Structure**: two lines.
- **line1** — time-based greeting + first name (from Google OAuth `full_name`, split on space). Fallback: no name.
- **line2** — context-based phrase, or a joke every 4 days.

#### Time slots for line1

| Hour | Hebrew | English |
|---|---|---|
| 06–10 | בוקר טוב / בוקר מצוין / בוקר אחלה | Good morning / Morning |
| 11–16 | צהריים טובים | Good afternoon |
| 17–20 | ערב טוב | Good evening |
| 21+ | לילה טוב | Good night |

Phrase selected deterministically: `phrases[dayOfYear % phrases.count]`

#### line2 priority order

1. **Joke** — fires when `dayOfYear % 4 == 0` and `hour < 21`. English only, LTR-aligned. 32 jokes cycling annually (~2×/week). Emoji 😄 appended at end.
2. **Night** (`hour >= 21`) — calming close-of-day phrase.
3. **No meals logged, morning** (`calories == 0`, `hour < 12`) — encouragement to start.
4. **No meals logged, late** (`calories == 0`, `hour >= 12`) — gentle reminder to log.
5. **Over goal** (`calories > calorieGoal`) — compassionate, non-judgmental.
6. **Goal met** (`remaining <= goal × 0.1`) — celebration.
7. **Streak active** (`streak >= 2`) — streak count substituted for `{N}`.
8. **Fluid goal met** (`fluidMl >= fluidGoal`) — hydration celebration.
9. **Fluid low** (`fluidMl < fluidGoal × 0.4`, `hour >= 10`) — hydration nudge.
10. **Protein close** (`remaining <= 25g`, `hour >= 17`) — protein gap substituted for `{prot}`.
11. **Default / on track** — calories remaining substituted for `{cal}`.

#### Dismissal flow

First tap of X → panel transforms to a confirmation card:
- Title: "להסיר את הברכה?" / "Remove greeting?"
- Body: "הברכה תוסר לצמיתות. אפשר להחזיר אותה בכל עת מההגדרות." / "The greeting will be permanently removed. You can re-enable it anytime from Settings."
- Buttons: "הסר לצמיתות" / "Remove permanently" (amber) + "ביטול" / "Cancel"

Confirmed → `PATCH profiles SET show_greeting = false`.

#### Settings toggle

Settings → Appearance section: "הצג ברכה יומית" / "Show daily greeting" toggle. Syncs to `profiles.show_greeting`.

#### Swift sketch

```swift
struct GreetingContext {
    let hour: Int
    let firstName: String?
    let streak: Int
    let calsConsumed: Int
    let calsGoal: Int
    let protConsumed: Double
    let protGoal: Double
    let fluidMl: Int
    let fluidGoalMl: Int
    let dayOfYear: Int
    let lang: Lang
}

struct Greeting {
    let line1: String
    let line2: String
    let isJoke: Bool
}

func getGreeting(_ ctx: GreetingContext) -> Greeting {
    let namePart = ctx.firstName.map { ", \($0)" } ?? ""
    let timeWord = ctx.hour < 11 ? morningWords.pick(ctx.dayOfYear)
                 : ctx.hour < 17 ? afternoonWord
                 : ctx.hour < 21 ? eveningWord
                 : nightWord
    let line1 = "\(timeWord)\(namePart)!"

    if ctx.dayOfYear % 4 == 0 && ctx.hour < 21 {
        return Greeting(line1: line1, line2: jokes.pick(ctx.dayOfYear / 4) + " 😄", isJoke: true)
    }
    // … priority chain as above
}
```

`isJoke == true` → render line2 with `.environment(\.layoutDirection, .leftToRight)` and `.multilineTextAlignment(.leading)`.

#### DB migration

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_greeting boolean NOT NULL DEFAULT true;
```

---

### 19.12 DB Migration

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

---

## 20. HealthKit Integration — Apple Health & Apple Fitness Calorie Burn

### 20.1 Overview & Motivation

The app currently estimates TDEE (Total Daily Energy Expenditure) using the Mifflin-St Jeor formula × an activity multiplier. This is a static estimate that doesn't reflect the user's actual activity on a given day.

Apple Health aggregates real calorie burn from:
- **Apple Watch** — continuous heart rate + movement tracking (most accurate)
- **Apple Fitness+** — workout sessions
- **iPhone** — step count + movement estimation
- **Third-party apps** — Garmin, Strava, Nike Run Club, etc.

By reading this data via **HealthKit**, the app can show the user their **actual measured deficit or surplus** for the day and week — far more meaningful than a formula-based estimate.

---

### 20.2 What to Read from HealthKit

| HealthKit type | Identifier | What it represents |
|---|---|---|
| Active Energy Burned | `activeEnergyBurned` | Calories from exercise + movement above resting |
| Basal Energy Burned | `basalEnergyBurned` | Resting metabolic rate (estimated by device) |
| **Total = Active + Basal** | — | The actual TDEE for the day |

> **Note**: On iPhone without Apple Watch, only basal + step-based active energy is available. With Apple Watch, the data is much more complete and updates throughout the day.

---

### 20.3 Setup

#### Info.plist
```xml
<key>NSHealthShareUsageDescription</key>
<string>Used to show your actual calorie burn and calculate a more accurate daily deficit.</string>
```

#### Entitlements
In Xcode → Target → Signing & Capabilities → add **HealthKit**.

#### Stack entry (add to §1)
| Layer | Choice | Rationale |
|---|---|---|
| Activity data | **HealthKit** (`HKHealthStore`) | Read-only: active + basal energy burned |

---

### 20.4 HealthKitManager

```swift
import HealthKit

@Observable
final class HealthKitManager {
    private let store = HKHealthStore()
    var isAuthorized = false
    var authorizationStatus: HKAuthorizationStatus = .notDetermined

    private let readTypes: Set<HKObjectType> = [
        HKQuantityType(.activeEnergyBurned),
        HKQuantityType(.basalEnergyBurned),
    ]

    // Call once — ideally from ProfileView when user first sets up their profile.
    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        do {
            try await store.requestAuthorization(toShare: [], read: readTypes)
            isAuthorized = true
        } catch {
            isAuthorized = false
        }
    }

    // Returns total kcal burned (active + basal) for a given calendar date.
    func totalBurnedKcal(for date: Date) async -> Double? {
        guard HKHealthStore.isHealthDataAvailable() else { return nil }
        async let active = fetchSum(type: .activeEnergyBurned, date: date)
        async let basal  = fetchSum(type: .basalEnergyBurned,  date: date)
        guard let a = await active, let b = await basal else { return nil }
        return a + b
    }

    // Aggregate over a date range (e.g. current week).
    func totalBurnedKcal(from start: Date, to end: Date) async -> Double? {
        guard HKHealthStore.isHealthDataAvailable() else { return nil }
        async let active = fetchSum(type: .activeEnergyBurned, from: start, to: end)
        async let basal  = fetchSum(type: .basalEnergyBurned,  from: start, to: end)
        guard let a = await active, let b = await basal else { return nil }
        return a + b
    }

    // MARK: — Private helpers

    private func fetchSum(type identifier: HKQuantityTypeIdentifier, date: Date) async -> Double? {
        let cal = Calendar.current
        let start = cal.startOfDay(for: date)
        let end   = cal.date(byAdding: .day, value: 1, to: start)!
        return await fetchSum(type: identifier, from: start, to: end)
    }

    private func fetchSum(type identifier: HKQuantityTypeIdentifier,
                          from start: Date, to end: Date) async -> Double? {
        let quantityType = HKQuantityType(identifier)
        let predicate    = HKQuery.predicateForSamples(withStart: start, end: end)

        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: quantityType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, result, _ in
                let value = result?.sumQuantity()?.doubleValue(for: .kilocalorie())
                continuation.resume(returning: value)
            }
            store.execute(query)
        }
    }
}
```

---

### 20.5 Integration into Calorie Deficit Calculation

The HealthKit burn replaces (or supplements) the formula-based TDEE wherever deficit is shown. Priority order:

```
1. HealthKit data available AND authorized → use actual burn
2. Otherwise → fall back to Mifflin-St Jeor × activity multiplier
```

```swift
// In your main ViewModel / environment object:
func effectiveTdee(for date: Date, profile: UserProfile, healthKit: HealthKitManager) async -> (kcal: Int, source: TdeeSource) {
    if healthKit.isAuthorized,
       let burned = await healthKit.totalBurnedKcal(for: date) {
        return (Int(burned), .healthKit)
    }
    return (calcDailyTdee(profile), .formula)
}

enum TdeeSource { case healthKit, formula }
```

---

### 20.6 UI Integration Points

#### DailySummaryView
Show a deficit/surplus row beneath the calorie ring:
```
Burned today: 2,340 kcal  (from Apple Health)
Consumed:     1,800 kcal
Deficit:        540 kcal → ~70g loss on pace
```
- Source badge: `"from Apple Health"` (SF Symbol: `heart.fill`, color: `.red`) or `"estimated"` (SF Symbol: `function`, color: `.secondary`)
- If HealthKit not authorized: show a soft prompt — `"Connect Apple Health for accurate deficit tracking"` with a button that triggers `requestAuthorization()`

#### WeeklyBalance card (§19.5 Row 2)
Replace formula-based `weeklyTdee` with the HealthKit weekly total when available:
```swift
let weeklyBurn: Double
if healthKit.isAuthorized,
   let hkBurn = await healthKit.totalBurnedKcal(from: weekStart, to: weekEnd) {
    weeklyBurn = hkBurn
    tdeeSource = .healthKit
} else {
    weeklyBurn = Double(calcWeeklyTdee(profile))
    tdeeSource = .formula
}
```
Footer note updates accordingly: `"* from Apple Health"` vs `"* estimate based on TDEE formula"`.

#### Target Date Projection (§19.6)
Use the **7-day rolling average** of HealthKit daily burn as the TDEE input for projection — more accurate than the static formula:
```swift
func rollingAvgBurn(healthKit: HealthKitManager) async -> Double? {
    let end   = Date()
    let start = Calendar.current.date(byAdding: .day, value: -7, to: end)!
    guard let total = await healthKit.totalBurnedKcal(from: start, to: end) else { return nil }
    return total / 7.0
}
```

#### ProfileView — HealthKit section
Add a dedicated row in Settings/Profile:

```
⬤ Apple Health
  [Connect]                    ← if not authorized
  ✓ Connected — reads calorie burn  ← if authorized
```

- `HKHealthStore.isHealthDataAvailable()` → if false (iPad without iPhone), hide the section entirely
- If denied: show `"Access denied — change in Health app → Sharing → Apps"` with a deep-link button to `UIApplication.openURL(URL(string: "x-apple-health://")!)`

---

### 20.7 Privacy & Graceful Degradation

- **Never request write permissions** — read-only. The `toShare` set must always be empty.
- **Offline / no Watch**: still works — iPhone estimates active energy from steps; basal from biometrics.
- **Permission denied**: all TDEE-dependent features fall back to formula. No feature is broken without HealthKit.
- **Data not yet available** (e.g. early morning before Watch syncs): show formula estimate with a `"Syncing…"` indicator and refresh when app foregrounds (`scenePhase == .active`).
- **Never store HealthKit data in Supabase** — only read locally and display in-session. HealthKit data belongs to the user's Health app and must not be uploaded to third-party servers without explicit additional consent.

---

## 21. Settings & UX Refinements (May 2026)

Changes shipped in this batch: sticky save button system, RTL-aware filter chip fades, per-field day-override clear buttons, Profile screen enhancements, weekly balance card fixes, and a full empty-state refresh.

---

### 21.1 Sticky Save Button (Profile / Goals / Preferences)

Previously each sub-screen in Settings had its own inline "Save" button at the bottom of its scroll view — easy to miss and inconsistent across screens.

**New pattern**: a single floating footer button is rendered by the parent `SettingsSheet`, always visible at the bottom of the screen, overlaying the scroll content with a gradient fade.

#### Architecture

```
SettingsSheet
├── ScrollView  ← contains ProfileScreen / GoalsScreen / PreferencesScreen
│     (save button no longer lives here)
└── Footer save button  ← always visible, outside scroll, floats above
```

Each sub-screen exposes a `saveRef` — a mutable ref that holds its `handleSave()` function. When the user taps the footer button, `SettingsSheet` calls whichever ref is active.

```swift
// Sub-screen protocol (conceptual)
protocol SaveableScreen {
    var onSave: () -> Void { get }   // called when footer button is tapped
    var onSaveDone: () -> Void { get } // called after save completes (triggers ✓ confirmation)
}
```

#### Footer button layout

- Positioned at the bottom of the sheet, below the scroll area.
- Gradient background (`transparent → bg`) so it "lifts" above the content.
- Respects `safeAreaInsets.bottom`.
- Two states:
  - Default: `btn-primary` → "Save Profile" / "Save Goals" / "Save Preferences" (label matches active screen)
  - Confirmed (2 s): `btn-confirm` → `check` icon + "Saved!" / "נשמר!"
- `screenSaved` state resets to `false` whenever the user navigates to a different sub-screen.

#### Swift sketch

```swift
@State private var screenSaved = false

var body: some View {
    VStack(spacing: 0) {
        ScrollView {
            switch screen {
            case .profile:     ProfileView(saveRef: $profileSave, onSaveDone: markSaved)
            case .goals:       GoalsView(saveRef: $goalsSave,   onSaveDone: markSaved)
            case .preferences: PrefsView(saveRef: $prefsSave,   onSaveDone: markSaved)
            }
        }
        // Footer — always visible
        footerSaveButton
    }
}

private var footerSaveButton: some View {
    Button(action: triggerSave) {
        Label(saveLabel, systemImage: screenSaved ? "checkmark" : "")
    }
    .buttonStyle(screenSaved ? .confirm : .primary)
    .padding(.horizontal, 16)
    .padding(.bottom, max(safeAreaInsets.bottom, 8))
    .background(
        LinearGradient(colors: [.clear, Color(.systemBackground)],
                       startPoint: .top, endPoint: .bottom)
            .frame(height: 80)
    )
}

private func triggerSave() {
    switch screen {
    case .profile:     profileSave?()
    case .goals:       goalsSave?()
    case .preferences: prefsSave?()
    }
}

private func markSaved() {
    screenSaved = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { screenSaved = false }
}
```

---

### 21.2 Filter Chip Scroll Fades — RTL-Aware

Horizontally-scrollable filter chip rows (FoodHistory screen, Food Library screen) show edge-fade gradients to hint at off-screen content.

**Before**: both left and right fades were always visible, regardless of scroll position or language direction.

**After**: fades appear/disappear dynamically based on actual scroll position, and their sides are swapped for RTL (Hebrew).

#### Logic

```swift
@State private var chipCanScrollLeft  = false
@State private var chipCanScrollRight = false

func updateChipScroll(_ scrollView: UIScrollView) {
    chipCanScrollLeft  = scrollView.contentOffset.x > 2
    chipCanScrollRight = scrollView.contentOffset.x < scrollView.contentSize.width - scrollView.bounds.width - 2
}
```

#### Which side shows the fade

| Scroll state | LTR | RTL (Hebrew) |
|---|---|---|
| Can scroll left | Left fade visible | Right fade visible |
| Can scroll right | Right fade visible | Left fade visible |

In SwiftUI, use `Environment(\.layoutDirection)` to determine which side maps to which visual edge.

---

### 21.3 Day Override Panel — Per-Field Clear (×) Buttons

In Settings → Goals → weekly override panel (expanded day picker), each field (calories / protein / fluid) now has an individual × button that clears only that field back to the weekly default, without resetting the entire day's override.

**Trigger**: button appears only when the field has a custom diff (i.e. the current value differs from the weekly default). Not shown in compact mode.

**Position**: inline-start (left in LTR / right in RTL) inside the input field.

#### clearDayField logic

```swift
func clearDayField(dayKey: DayKey, field: GoalField) {
    guard let entry = overrides[toWeekIndex(dayKey)] else { return }
    var updated = entry
    switch field {
    case .calories: updated.calories = defaultCalories
    case .protein:  updated.protein  = defaultProtein
    case .fluid:    updated.fluidMl  = defaultFluidMl
    }
    overrides[toWeekIndex(dayKey)] = updated
}
```

**Existing "Reset day" button** (resets all three fields at once) is unchanged — it's complementary.

---

### 21.4 Profile Screen Enhancements

#### Display Name Field

New optional `displayName` text field in ProfileScreen (top of "Personal Details" section).

- Maps to `profiles.display_name` column (nullable TEXT).
- When set, overrides the name pulled from Google OAuth in the daily greeting.
- Placeholder: "Custom name (optional)" / "שם מותאם אישית (אופציונלי)"
- Hint below the field: "Overrides the name pulled from your Google account in the daily greeting" / "מחליף את השם שנמשך מחשבון Google בברכה היומית"

```sql
-- DB migration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
```

#### TDEE Row in Metrics Preview

TDEE (Total Daily Energy Expenditure) is now shown as its own dedicated row in the metrics summary card (between BMR and BMI), not embedded as sub-text inside the BMR row.

```
┌────────────────────────────────────────────┐
│ BMR    Basal Metabolic Rate — at rest      │
│                                    1,650 kcal │
├────────────────────────────────────────────┤
│ TDEE   Total Daily Energy Expenditure…     │
│                                    2,300 kcal │  ← NEW row (accent color)
├────────────────────────────────────────────┤
│ BMI    Under < 18.5 | Normal 18.5–24.9 …   │
│                                  22.4 — Normal │
├────────────────────────────────────────────┤
│ Fluid  35 ml × 75 kg                       │
│                                      2,625 ml │
└────────────────────────────────────────────┘
```

#### Metric Pulse Animation

When any metric value changes (BMR, TDEE, BMI, fluid), the displayed number briefly pulses to signal the update. Implemented by assigning a `key` to the value label that changes with the metric — triggering a CSS remount / SwiftUI identity reset which replays the entrance animation.

```swift
// SwiftUI: use .id() modifier to trigger re-animation
Text(formattedBmr)
    .id("bmr-\(bmr)-\(bmi)")  // key changes → view re-mounts → animation replays
    .transition(.scale(scale: 0.85).combined(with: .opacity))
```

#### Draft Protection (`dirtyRef`)

Profile state is initialised from a localStorage/cache snapshot immediately, then updated when the server responds. A `dirtyRef` flag prevents the server response from overwriting in-progress user edits:

```swift
@State private var draft = UserProfile()
@State private var userHasEdited = false

// On server update:
func onProfileReceived(_ p: UserProfile) {
    if !userHasEdited { draft = p }
}

// On any field change:
func set<K>(_ key: K, _ value: ...) {
    userHasEdited = true
    draft[key] = value
}
```

#### Weight Log Improvements

- **Weight log button**: changed from filled primary style to ghost style with accent border (less visually dominant).
- **Sparkline guard**: the sparkline chart is only rendered when there are ≥ 2 entries. A single point produces a degenerate line; hide it until there's a real trend.
- **Weight unit RTL fix**: in Hebrew, the unit label `ק״ג` is displayed *before* the number (matching Hebrew reading conventions); in English, `kg` is displayed *after*. Both use `direction: ltr` to keep the number itself LTR-ordered.
- **Live profile update on log**: when the user logs a new weight entry, `draft.weight` updates immediately and a `onSave({ weight: kg })` is fired — GoalsScreen recommendations (e.g. suggested calorie/protein goals) update in real-time without requiring a separate "Save" tap.

#### Target Weight Field

- **Clear button**: when `targetWeightKg` is set, an × button appears inside the input on the inline-end side, setting the field back to `null`.
- **Placeholder**: new i18n key `targetWeightPlaceholder` — "Enter your target weight" / "הזן את משקל היעד הרצוי".
- **Projection hint**: below the blue projection chip, a small explanatory footnote: "Calculated based on the daily caloric difference between your TDEE and goal, assuming 7,700 kcal per kg of fat." / "מחושב לפי ההפרש הקלורי היומי בין ה-TDEE שלך ליעד, בהנחה של 7,700 קק\"ל לכל ק\"ג שומן."

#### Weight Input Clear Button

When the weight-log text field has any value, an × button appears inline-end to clear it — consistent with other clearable inputs throughout the app.

---

### 21.5 Weekly Balance Card Fixes

#### Dots vs. Bar (Period Toggle)

`PeriodBalanceCard` renders a progress indicator below the progress fraction. The indicator type depends on the period:

| Period | Indicator |
|--------|-----------|
| Week   | 7 dots (one per day), filled dots = elapsed days |
| Month  | Solid horizontal progress bar |

Previously both were rendered simultaneously. Now only one is shown based on the `showDots` prop.

```swift
if showDots {
    HStack(spacing: 3) {
        ForEach(0..<totalDays, id: \.self) { i in
            RoundedRectangle(cornerRadius: 3)
                .fill(i < daysElapsed ? color : Color(.systemFill))
                .frame(maxWidth: .infinity, maxHeight: 5)
        }
    }
} else {
    GeometryReader { geo in
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 2).fill(Color(.systemFill))
            RoundedRectangle(cornerRadius: 2).fill(color)
                .frame(width: geo.size.width * min(1, CGFloat(daysElapsed) / CGFloat(totalDays)))
        }
    }
    .frame(height: 4)
}
```

#### TDEE Day Count Fix

The weekly TDEE denominator now covers exactly the same days as the numerator (`weeklyTotalCal`).

**Problem**: `last7` (grouped history) intentionally excludes today (to avoid showing a partial day in the history list), but `weeklyTotalCal` *does* include `todayCalories`. So the denominator was off by 1 on days when the user had logged anything today.

**Fix**:
```swift
let loggedDaysCount   = last7.count + (isCurrentWeek && todayCalories > 0 ? 1 : 0)
let tdeeForLoggedDays = (weeklyTdee / 7.0) * Double(loggedDaysCount)
let tdeeBalance       = weeklyTotalCal - Int(tdeeForLoggedDays)
```

#### RTL Minus Sign Fix

The balance tile number (e.g. `−1,200 kcal`) uses `direction: ltr; unicodeBidi: embed` to keep the minus sign visually on the *left* of the number, regardless of page RTL direction.

```swift
// SwiftUI: force LTR for the numeric label
Text(formattedBalance)
    .environment(\.layoutDirection, .leftToRight)
```

#### Projection Line — Grams Removed

The plan-adherence projection line (Row 1 of the balance card — consumed vs. calorie goal) no longer shows an estimated weight-change in grams.

**Reason**: Row 1 uses the calorie *goal* as its baseline; Row 2 (weight impact) uses *TDEE* as its baseline. Because these denominators differ, the gram estimates from the two rows will never agree, creating confusion. The gram estimate is shown only in Row 2 (weight impact vs. TDEE), where the formula is `kcal ÷ 7,700`.

---

### 21.6 Empty States Refresh

All 13 empty-state locations across the app were updated with friendlier copy and replaced emoji with Material Symbols Rounded icons (consistent with the rest of the icon language).

#### Icon mapping

| Old emoji | New icon (Material Symbols Rounded) |
|-----------|--------------------------------------|
| 🙂 | `mood` |
| 🚀 | `rocket_launch` |
| 🤔 | `manage_search` |
| 📊 | `monitoring` |
| 🍽️ | `dinner_dining` |
| 🤷 | `help_outline` |
| 👇 | `add_circle` |

#### Copy changes and new i18n keys

| Key | Hebrew | English | Used in |
|-----|--------|---------|---------|
| `noMealsToday` (updated) | יום חדש, דף חלק | Fresh day, fresh start | Today tab — no meals yet |
| `noEnoughData` (updated) | הגרפים ממתינים לך | Charts are waiting for you | Stats — not enough data |
| `noEnoughDataSub` (new) | תעד כמה ימים ונמלא אותם | Log a few days to fill them up | Stats — sub-text |
| `noHistoryHint` (updated) | תתחיל לתעד ונעשה היסטוריה! | Start logging and let's make history! | History tab — first-use hint |
| `weekEmpty` (new) | שבוע שקט | Quiet week | History — week range, no data |
| `monthEmpty` (new) | חודש ריק | Empty month | History — month range, no data |
| `rangeEmptySub` (new) | לא תיעדת כלום בתקופה הזו | Nothing logged here | Week/month empty sub-text |
| `noDataOnDate` (new) | לא תיעדת כלום בתאריך הזה | Nothing logged on this date | History — date picker empty |
| `tryOtherWord` (new) | נסה מילה אחרת? | Try something else? | Search empty sub-text |
| `noRecentFood` (new) | לא אכלת את זה לאחרונה | Haven't eaten this recently | FoodHistoryModal — no results |
| `addManually` (new) | הוסף ידנית | Add manually | FoodHistoryModal — CTA hint |
| `noComposedDishes` (new) | עדיין אין מנות שמורות | No saved dishes yet | Composed dishes — empty |
| `noComposedDishesSub` (new) | הרכב את הראשונה! | Build your first one! | Composed dishes — sub-text |
| `unknownFood` (new) | לא מכירים את זה | Don't know that one | Food library — no results |
| `unknownFoodSub` (new) | נסה שם אחר? | Try a different name? | Food library — sub-text |

#### Empty state structure (all locations)

Each empty state now follows a consistent pattern:

```swift
VStack(spacing: 4) {
    Image(systemName: iconName)         // SF Symbol equivalent of Material Symbol
        .font(.system(size: 24))
        .opacity(0.4)
    Text(primaryMessage)
        .font(.subheadline)
    Text(secondaryMessage)              // where applicable
        .font(.caption)
        .opacity(0.7)
}
.padding(.vertical, 32)
.frame(maxWidth: .infinity)
.foregroundStyle(.secondary)
```

**Icon opacity**: 0.4 across all empty states (reduced presence — the icon is decorative, not the primary communication).

---

### 21.7 Push Notifications — Web Suspended, iOS Native Only

The web app's `NotificationsSection` component (which requested browser push permission) has been removed. Web push is unreliable on iOS Safari, and the feature is better served natively.

**iOS**: §19.10 remains the authoritative specification. Implement full `UNUserNotificationCenter` scheduling with per-meal-type toggles (breakfast / lunch / dinner) and time pickers.

**Web**: the Reminders section is hidden. No notification-related UI appears in the web Settings sheet.

---

### 21.8 DB Migration

```sql
-- Display name override for greeting
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
```

All other schema changes for this batch were already applied in §19.12.

---

## 22. New Features (v3 — May/June 2026)

Features shipped after the §21 batch: serving unit system, original entry unit display, composed-group batch weight & recipe scaling, cooking weight estimation, and notification explanation text.

---

### 22.1 Serving Unit System — Pieces (`pcs`)

**Why**: many foods are naturally quantified by piece or serving (eggs, avocados, protein bars). Logging "2 eggs" in grams forces the user to do mental math. The `pcs` / "מנה" / "serving" unit removes that friction.

#### Entry flow

1. User selects a library item where `countable == true` OR manually switches the unit picker to "מנה" / "serving".
2. The unit field shows **"מנה"** (Hebrew) / **"serving"** (English).
3. Below the amount field, a gram-anchor hint appears:
   - Library match found: `"1 מנה ≈ 60ג׳ (ביצה)"` / `"1 serving ≈ 60g (Egg)"`
   - No library match: `"1 מנה ≈ 150ג׳"` / `"1 serving ≈ 150g"` (uses `defaultServingGrams`)
4. Tap the hint chip → auto-fills the gram anchor into the library-match state.

#### Storage
- `Meal.grams` = `−amount` (negative signals unit-based; e.g. 2 servings → `grams = -2.0`).
- `display_unit` = `nil`, `display_amount` = `nil` (pcs is its own dimension, not an alternative unit for grams).

#### `NutritionRatios` — proportional scaling across unit switches

```swift
struct NutritionRatios {
    var calPerUnit:  Double  // kcal per gram (normal) or kcal per serving (pcs)
    var protPerUnit: Double  // protein per gram or per serving
    var perServing:  Bool    // true when unit == pcs
}
```

When the user switches units after nutrition is already calculated, the app re-derives cal/prot for the new unit without requiring another AI call:

| From → To | Action |
|---|---|
| pcs → weight/volume | Divide ratios by `servingGrams`; recalculate for current amount |
| weight/volume → pcs | Multiply ratios by `servingGrams`; recalculate for current amount |
| weight → volume (or reverse) | Keep ratios; convert amount to base, apply density → recalculate |

If `calPerUnit == 0` (no ratio known yet), unit changes only swap the label — no recalculation.

#### Swift sketch

```swift
func handleUnitChange(to newUnit: EntryUnit,
                      ratios: inout NutritionRatios?,
                      amount: Double,
                      servingGrams: Double,
                      density: Double) -> (cal: Int, prot: Double)? {
    guard var r = ratios, r.calPerUnit > 0 else { return nil }
    let oldIsPcs = /* previousUnit == .pcs */
    let newIsPcs = newUnit == .pcs

    if oldIsPcs != newIsPcs {
        if oldIsPcs {
            // pcs → weight: ratio was cal/serving, convert to cal/gram
            r.calPerUnit  /= servingGrams
            r.protPerUnit /= servingGrams
            r.perServing   = false
        } else {
            // weight → pcs: ratio was cal/gram, convert to cal/serving
            r.calPerUnit  *= servingGrams
            r.protPerUnit *= servingGrams
            r.perServing   = true
        }
        ratios = r
    }

    let base: Double = {
        if r.perServing { return amount }
        if newUnit == .pcs { return amount * servingGrams }
        let ml = toBaseMl(amount, unit: newUnit as! VolumeUnit)
        return UNITS[newUnit].type == .volume ? mlToGrams(ml, density: density) : toBaseGrams(amount, unit: newUnit as! WeightUnit)
    }()
    return (Int((base * r.calPerUnit).rounded()), (base * r.protPerUnit * 10).rounded() / 10)
}
```

---

### 22.2 Original Entry Unit Display

**Why**: when a user logs "1.5 cups of oatmeal" and it gets stored as 360g, the meal card shows "360g" — the original mental model is lost.

**Solution**: store the original unit + amount in `display_unit` / `display_amount` on the `Meal` row. The meal card reads these and prefers them for display.

#### Rules

| Entry unit | `display_unit` | `display_amount` | Display in MealCard |
|---|---|---|---|
| g | nil | nil | "350g" |
| oz | "oz" | 1.5 | "1.5 oz" |
| ml | "ml" | 300 | "300ml" |
| cup | "cup" | 1.5 | "1.5 cup" |
| tbsp | "tbsp" | 2 | "2 tbsp" |
| tsp | "tsp" | 1 | "1 tsp" |
| fl_oz | "fl_oz" | 8 | "8 fl oz" |
| pcs | nil | nil | "2×" or "2 serving" |

#### MealCard display logic

```swift
var amountLabel: String {
    if let unit = meal.displayUnit, let amount = meal.displayAmount {
        // Show the original entry unit
        return "\(formatAmount(amount)) \(localizedUnit(unit, lang: lang))"
    }
    if meal.grams < 0 {
        // Unit-based (pcs)
        return "\(Int(-meal.grams))×"
    }
    // Default: grams
    return "\(Int(meal.grams))g"
}
```

#### Swift struct additions (already in §3.1)
`displayUnit: String?` and `displayAmount: Double?` — both `nil` when the unit is grams or pcs.

---

### 22.3 ComposedGroup Batch Weight & Recipe Scaling

**Why**: a user cooks a batch recipe (e.g. a stew with 5 ingredients totaling 1,200 kcal). They weigh the finished pot (900g). On a given day they eat 300g of it. Instead of re-logging all ingredients, they log "300g of stew" and the app calculates the portion automatically.

#### Batch weight flow

1. In the ComposedGroup card (expanded), tap **"Estimate cooked weight"** / **"הערך משקל מבושל"**.
2. The app runs `estimateCookedWeight(meals)` (see §22.4) and shows the estimate pre-filled.
3. User can confirm or edit the number.
4. Value is saved to `composed_groups.batch_weight_g` via upsert.

#### Recipe scaling flow

When `batchWeightG != nil`, the group card in the Today tab shows a **"Log portion"** button alongside the usual "Log full dish".

```
┌─ Pasta & veggies ─────────────────────┐
│  1,200 kcal  ·  85g protein           │
│  Batch: 900g cooked                   │
│  [Log portion]   [Log full dish]       │
└────────────────────────────────────────┘
```

**"Log portion"** opens a sheet with a gram input. On confirm:
```swift
let ratio = portionG / group.batchWeightG!
let cal   = Int((Double(group.totalCalories!) * ratio).rounded())
let prot  = (group.totalProtein! * ratio * 10).rounded() / 10
// Insert as a single Meal row with the scaled values
```

**"Log full dish"** logs each ingredient as a separate `Meal` row (existing behavior).

#### `totalCalories` / `totalProtein` caching

Set at group-create / group-update time from the sum of all ingredient meals:
```swift
let totalCal  = group.mealIds.compactMap { mealById[$0] }.reduce(0) { $0 + $1.calories }
let totalProt = group.mealIds.compactMap { mealById[$0] }.reduce(0.0) { $0 + $1.protein }
```
Stored in `composed_groups.total_calories` and `composed_groups.total_protein`.

---

### 22.4 Cooking Weight Estimation

**Why**: after cooking, the weight of a dish differs from the sum of raw ingredients (water evaporates from meat, pasta absorbs water). This function estimates the cooked weight so users can set an accurate `batchWeightG`.

#### `getCookingFactor(name: String) → (factor: Double, matched: Bool)`

Looks up the ingredient name against a table of ~55 keyword patterns → cooking factor (ratio of cooked to raw weight):

| Category | Example | Factor |
|---|---|---|
| Dry pasta / rice / quinoa | פסטה, אורז, quinoa | 2.2–2.8× (absorbs water) |
| Chicken breast | חזה עוף, chicken breast | 0.70 (loses water) |
| Beef / burger | אנטריקוט, hamburger | 0.75 |
| Fish | סלמון, salmon | 0.80 |
| Leafy vegetables fresh | תרד טרי | 0.25 (wilts dramatically) |
| Frozen vegetables | תרד קפוא, broccoli | 0.90 |
| Eggs / cheese | ביצה, גבינה | 0.90–0.95 |
| Oils / sauces | שמן, maple syrup | 1.00 (no change) |

Default factor when no match: **0.85**.
`matched = false` when the default is used.

#### `estimateCookedWeight(meals: [Meal]) → { total: Int, breakdown: [CookingBreakdownItem] }`

```swift
struct CookingBreakdownItem {
    let name:     String
    let rawG:     Double   // 0 for unit-based items (weight unknown)
    let factor:   Double
    let cookedG:  Int
    let matched:  Bool     // false = default factor used
    let skipped:  Bool     // true = unit-based item, cannot estimate weight
}

func estimateCookedWeight(_ meals: [Meal]) -> (total: Int, breakdown: [CookingBreakdownItem]) {
    let breakdown = meals.map { m -> CookingBreakdownItem in
        let isFluid = m.fluidMl != nil
        let isUnit  = m.grams < 0 && !isFluid
        let rawG    = isUnit ? 0 : isFluid ? (m.fluidMl ?? 0) : m.grams

        if isUnit {
            return CookingBreakdownItem(name: m.name, rawG: 0, factor: 0.85,
                                         cookedG: 0, matched: false, skipped: true)
        }
        let (factor, matched) = getCookingFactor(m.name)
        return CookingBreakdownItem(name: m.name, rawG: rawG, factor: factor,
                                     cookedG: Int((rawG * factor).rounded()),
                                     matched: matched, skipped: false)
    }
    let total = breakdown.reduce(0) { $0 + $1.cookedG }
    return (total, breakdown)
}
```

#### UI in ComposedGroup card (expanded)

```
Estimated cooked weight: ~650g
  ├─ אורז    180g × 2.80 = 504g  ✓
  ├─ עוף    200g × 0.70 = 140g  ✓
  └─ שמן      6g × 1.00 =   6g  ✓
```

Unmatched entries show `~` before their estimate. Skipped (unit-based) entries show "—".
Tap the row → opens the batch-weight editor pre-filled with the estimate.

---

### 22.5 Reminders Section — Explanation Text

**Where**: Settings → Reminders card (§19.10), below the permission status row and enable button.

**What**: a short explanatory paragraph that describes what the reminders will do, always visible (not conditional on permission state).

```
"הפעלת התזכורות תאפשר לאפליקציה לשלוח לך תזכורת ארוחה בשעות שתבחר."
/ "Enabling reminders lets the app send you a meal reminder at times you choose."
```

This text is a new i18n key: `notificationExplanation`.

| Key | Hebrew | English |
|---|---|---|
| `notificationExplanation` | הפעלת התזכורות תאפשר לאפליקציה לשלוח לך תזכורת ארוחה בשעות שתבחר. | Enabling reminders lets the app send you a meal reminder at times you choose. |

**Placement**: between the permission status row and the meal-type time-pickers. Font: caption / `.footnote`, color: text-secondary.

---

### 22.6 DB Migration

```sql
-- Original entry unit on meals
ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS display_unit   TEXT,
  ADD COLUMN IF NOT EXISTS display_amount REAL;

-- Batch weight + totals on composed_groups
-- (create the table if migrating from the localStorage-only version)
CREATE TABLE IF NOT EXISTS composed_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  meal_ids        TEXT[] NOT NULL DEFAULT '{}',
  batch_weight_g  REAL,
  total_calories  INTEGER,
  total_protein   REAL,
  updated_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE composed_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Users manage own composed_groups"
  ON composed_groups FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- If table already exists, add the new columns
ALTER TABLE composed_groups
  ADD COLUMN IF NOT EXISTS batch_weight_g  REAL,
  ADD COLUMN IF NOT EXISTS total_calories  INTEGER,
  ADD COLUMN IF NOT EXISTS total_protein   REAL;
```
