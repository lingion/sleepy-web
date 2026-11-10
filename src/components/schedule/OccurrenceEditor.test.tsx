import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Course, Table } from '../../data/types'
import { OccurrenceEditor } from './useOccurrenceActions'

afterEach(cleanup)
const timeJson = JSON.stringify([{node:1,start:'08:00',end:'08:45'},{node:2,start:'08:55',end:'09:40'},{node:4,start:'10:00',end:'10:45'}])
const course = { courseName:'数学',room:' A ',startNode:1,step:1,ownTime:false,isIrregularTime:false,isIrregularNode:false,startTime:'',endTime:'' } as Course
const props = { occurrence:{course,sourceDate:'2026-09-07',displayDate:'2026-09-07'},table:{startDate:'2026-09-07',maxWeek:20,timeJson} as Table,onDismiss:vi.fn(),onSave:vi.fn(),onDelete:vi.fn() }
describe('单次课程操作入口', () => {
  it('starts a long-press entry with adjust and delete actions before opening its form', () => {
    render(<OccurrenceEditor {...props}/>)
    expect(screen.queryByLabelText('教室或地点')).toBeNull()
    expect(screen.getByRole('button',{name:'删除本次'})).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'调整本次'}))
    expect(screen.getByLabelText('教室或地点')).toBeTruthy()
    expect(screen.queryByRole('button',{name:'删除本次'})).toBeNull()
  })
  it('opens directly for explicit adjust and uses only the contiguous standard node range', () => {
    render(<OccurrenceEditor {...props} startInEdit/>)
    expect(screen.getByLabelText('教室或地点')).toBeTruthy()
    expect(screen.getAllByRole('slider')[1].getAttribute('aria-valuemax')).toBe('2')
    fireEvent.click(screen.getByRole('switch',{name:'自定义时间'}))
    expect((screen.getByLabelText('开始时间') as HTMLInputElement).value).toBe('08:00')
    expect((screen.getByLabelText('结束时间') as HTMLInputElement).value).toBe('08:45')
  })
})
