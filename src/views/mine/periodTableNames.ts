/**
 * 作息表/课表全局唯一名 — TimeTableUtils.suggestUniqueName / isTableNameTaken 1:1。
 * 撞名自动顺延: 原名 → 原名2 → 原名3…(兼容历史 "名字(2)" 形态);
 * 空名回退 defaultName 参与顺延。名单 = 课表名 ∪ 作息表名 (issue#40 §4.1 全局唯一)。
 */

export function isTableNameTaken(
  name: string,
  courseTableNames: string[],
  periodTableNames: string[],
): boolean {
  if (name === '') return false
  return courseTableNames.includes(name) || periodTableNames.includes(name)
}

export function suggestUniqueName(
  base: string,
  courseTableNames: string[],
  periodTableNames: string[],
  defaultName = '',
): string {
  const effective = base.trim() === '' ? defaultName : base
  if (!isTableNameTaken(effective, courseTableNames, periodTableNames)) return effective
  let index = 2
  while (
    isTableNameTaken(`${effective}${index}`, courseTableNames, periodTableNames) ||
    isTableNameTaken(`${effective}(${index})`, courseTableNames, periodTableNames)
  ) {
    index++
  }
  return `${effective}${index}`
}
