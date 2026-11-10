import { useEffect, useRef, useState } from 'react'
import type { OccurrenceQuestion } from '../../domain/occurrenceSave'
import { AlertDialog } from '../AlertDialog'
import { DialogActionButtons } from '../DialogActionButtons'

type Question = { title: string; message: string; choices: string[]; answer: (value: number | null) => void; destructive: boolean }

/** Each answer resolves the immutable suspended save, including cancellation on unmount. */
export function useOccurrenceDialogs() {
  const [question,setQuestion]=useState<Question|null>(null)
  const pending=useRef<((value:number|null)=>void)|null>(null)
  useEffect(()=>()=>{ pending.current?.(null) },[])
  const ask:OccurrenceQuestion=(title,message,choices=['确定'],destructive=false)=>new Promise((resolve)=>{
    pending.current?.(null)
    const answer=(value:number|null)=>{ pending.current=null;setQuestion(null);resolve(value) }
    pending.current=answer
    setQuestion({title,message,choices,destructive,answer})
  })
  return { ask,host:question && <AlertDialog title={question.title} onDismiss={()=>question.answer(null)}>
    <p style={{whiteSpace:'pre-line',maxHeight:300,overflow:'auto'}}>{question.message}</p>
    <DialogActionButtons confirmText={question.choices[0]} onConfirm={()=>question.answer(0)} dismissText="返回修改" onDismiss={()=>question.answer(null)} thirdText={question.choices[1]} onThird={question.choices[1]?()=>question.answer(1):undefined} destructive={question.destructive}/>
  </AlertDialog> }
}
