let activeMode = 0
let hues: Record<string, number> = {}
export function configureCourseHues(mode: number, next: Record<string, number>): void { activeMode = mode; hues = next }
export function persistedCourseHue(groupId: string): number | undefined { return activeMode === 0 ? undefined : hues[groupId] }
