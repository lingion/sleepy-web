export type OccurrenceTarget = { week: number; day: number; startNode: number; step: number }
export interface QuickAddSeed extends OccurrenceTarget { date: string; tableId?: number }
