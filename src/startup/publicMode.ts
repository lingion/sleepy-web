/** Keep the build flag independent of the public schedule parser. */
export function publicScheduleEnabled(): boolean {
  return import.meta.env.VITE_PUBLIC_SCHEDULE_PATH !== undefined
}
