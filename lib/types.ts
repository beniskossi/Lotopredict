export interface DrawResult {
  id: string
  draw_name: string
  draw_date: string
  winning_numbers: number[]
  machine_numbers: number[] | null
  created_at: string
  updated_at: string
}

export interface DrawSchedule {
  id: string
  day_of_week: string
  draw_name: string
  time: string
  created_at: string
  updated_at: string
}

export interface NumberFrequency {
  number: number
  frequency: number
  lastSeen: string | null
  daysSinceLastSeen: number
}

export interface NumberAssociation {
  number: number
  associatedWith: number
  frequency: number
  inSameDraw: number
  inNextDraw: number
}

export interface PredictionResult {
  numbers: number[]
  confidence: number
  method: "xgboost" | "random-forest" | "rnn-lstm" | "hybrid"
  timestamp: string
}

export interface FetchedDrawResult {
  draw_name: string
  draw_date: string
  winning_numbers: number[]
  machine_numbers?: number[]
}

export const DRAW_SCHEDULES: DrawSchedule[] = [
  // Lundi
  { id: "1", day_of_week: "Lundi", draw_name: "Réveil", time: "10:00", created_at: "", updated_at: "" },
  { id: "2", day_of_week: "Lundi", draw_name: "Étoile", time: "13:00", created_at: "", updated_at: "" },
  { id: "3", day_of_week: "Lundi", draw_name: "Akwaba", time: "16:00", created_at: "", updated_at: "" },
  { id: "4", day_of_week: "Lundi", draw_name: "Monday Special", time: "18:15", created_at: "", updated_at: "" },
  // Mardi
  { id: "5", day_of_week: "Mardi", draw_name: "La Matinale", time: "10:00", created_at: "", updated_at: "" },
  { id: "6", day_of_week: "Mardi", draw_name: "Émergence", time: "13:00", created_at: "", updated_at: "" },
  { id: "7", day_of_week: "Mardi", draw_name: "Sika", time: "16:00", created_at: "", updated_at: "" },
  { id: "8", day_of_week: "Mardi", draw_name: "Lucky Tuesday", time: "18:15", created_at: "", updated_at: "" },
  // Mercredi
  { id: "9", day_of_week: "Mercredi", draw_name: "Première Heure", time: "10:00", created_at: "", updated_at: "" },
  { id: "10", day_of_week: "Mercredi", draw_name: "Fortune", time: "13:00", created_at: "", updated_at: "" },
  { id: "11", day_of_week: "Mercredi", draw_name: "Baraka", time: "16:00", created_at: "", updated_at: "" },
  { id: "12", day_of_week: "Mercredi", draw_name: "Midweek", time: "18:15", created_at: "", updated_at: "" },
  // Jeudi
  { id: "13", day_of_week: "Jeudi", draw_name: "Kado", time: "10:00", created_at: "", updated_at: "" },
  { id: "14", day_of_week: "Jeudi", draw_name: "Privilège", time: "13:00", created_at: "", updated_at: "" },
  { id: "15", day_of_week: "Jeudi", draw_name: "Monni", time: "16:00", created_at: "", updated_at: "" },
  { id: "16", day_of_week: "Jeudi", draw_name: "Fortune Thursday", time: "18:15", created_at: "", updated_at: "" },
  // Vendredi
  { id: "17", day_of_week: "Vendredi", draw_name: "Cash", time: "10:00", created_at: "", updated_at: "" },
  { id: "18", day_of_week: "Vendredi", draw_name: "Solution", time: "13:00", created_at: "", updated_at: "" },
  { id: "19", day_of_week: "Vendredi", draw_name: "Wari", time: "16:00", created_at: "", updated_at: "" },
  { id: "20", day_of_week: "Vendredi", draw_name: "Friday Bonanza", time: "18:15", created_at: "", updated_at: "" },
  // Samedi
  { id: "21", day_of_week: "Samedi", draw_name: "Soutra", time: "10:00", created_at: "", updated_at: "" },
  { id: "22", day_of_week: "Samedi", draw_name: "Diamant", time: "13:00", created_at: "", updated_at: "" },
  { id: "23", day_of_week: "Samedi", draw_name: "Moaye", time: "16:00", created_at: "", updated_at: "" },
  { id: "24", day_of_week: "Samedi", draw_name: "National", time: "18:15", created_at: "", updated_at: "" },
  // Dimanche
  { id: "25", day_of_week: "Dimanche", draw_name: "Bénédiction", time: "10:00", created_at: "", updated_at: "" },
  { id: "26", day_of_week: "Dimanche", draw_name: "Prestige", time: "13:00", created_at: "", updated_at: "" },
  { id: "27", day_of_week: "Dimanche", draw_name: "Awalé", time: "16:00", created_at: "", updated_at: "" },
  { id: "28", day_of_week: "Dimanche", draw_name: "Espoir", time: "18:15", created_at: "", updated_at: "" },
]
