import { describe, it, expect } from 'vitest'
import { JwClassicEamsParser } from './classicEamsParser'

const tjuLike = `
<table id="manualArrangeCourseTable"></table>
<script>
var table0 = new CourseTable(2019,84);
var unitCount = 12;
var actTeachers = [{id:7396,name:"张老师",lab:true}];
activity = new TaskActivity(actTeacherId.join(','),actTeacherName.join(','),"39603(04127)","离散数学","3883","23楼506","00000000010000000000000000000000000000000000000",null,"","","","");
index =3*unitCount+0; table0.activities[index][table0.activities[index].length]=activity;
index =3*unitCount+1; table0.activities[index][table0.activities[index].length]=activity;
var actTeachers = [{id:100,name:"李老师",lab:false}];
activity = new TaskActivity(actTeacherId.join(','),actTeacherName.join(','),"39605(04131)","程序设计原理","3901","23楼214","000000000000010101010000000000000000000000000000",null,"","","","");
index =1*unitCount+2; table0.activities[index][table0.activities[index].length]=activity;
table0.marshalTable(2,1,21);
</script>`

const literalLike = `
<script>
var table0 = new CourseTable(2025,300);
var unitCount = 13;
activity = new TaskActivity("9766","韦老师","11870(G0102030.01)","局域网与城域网(G0102030.01)","364","A108","00000000010000000000000000000000000000000000000",null,"","","","");
index =0*unitCount+0; table0.activities[index][table0.activities[index].length]=activity;
index =0*unitCount+1; table0.activities[index][table0.activities[index].length]=activity;
table0.marshalTable(2,1,21);
</script>`

function page(task: string, index: string, options = '', teacher = '王老师'): string {
  return `<script>var table0 = new CourseTable(2025,1); var unitCount = 12; ${options} activity = new TaskActivity("1",${JSON.stringify(teacher)},"2(02)",${JSON.stringify(task)},"100","教1-101","00000000010000000000000000000000000000000000000",null,"","","",""); index =${index}; table0.marshalTable(2,1,21);</script>`
}

describe('JwClassicEamsParser', () => {
  it('resolves expression teachers and merges consecutive nodes', () => {
    const cs = new JwClassicEamsParser(tjuLike).generateCourseList()
    expect(cs).toHaveLength(5)
    const discrete = cs.find((x) => x.name === '离散数学')!
    expect([discrete.teacher, discrete.room, discrete.day, discrete.startNode, discrete.endNode, discrete.startWeek])
      .toEqual(['张老师', '23楼506', 4, 1, 2, 9])
    expect(cs.filter((x) => x.name === '程序设计原理').map((x) => x.startWeek)).toEqual([13, 15, 17, 19])
  })

  it('maps literal args, unitCount and bitmap index without off-by-one', () => {
    const c = new JwClassicEamsParser(literalLike).generateCourseList()[0]
    expect([c.name, c.teacher, c.room, c.day, c.startNode, c.endNode, c.startWeek, c.type])
      .toEqual(['局域网与城域网(G0102030.01)', '韦老师', 'A108', 1, 1, 2, 9, 0])
  })

  it('resolves courseNameLessonNo expression and preserves name verbatim', () => {
    const src = page('this.courseNameLessonNo', '4*unitCount+0', 'var actTeachers=[{id:9,name:"陈老师"}]; var courseNameLessonNo = "会计学原理(ACCT1001)";').replace('"this.courseNameLessonNo"', 'this.courseNameLessonNo').replace('"王老师"', 'actTeacherName.join(\',\')')
    const c = new JwClassicEamsParser(src).generateCourseList()[0]
    expect([c.name, c.teacher, c.day, c.startNode]).toEqual(['会计学原理(ACCT1001)', '陈老师', 5, 1])
  })

  it('skips negative-one teachers and suspended rooms', () => {
    const src = `<script>var unitCount=12;
      activity=new TaskActivity("","-1","x","坏课","1","停课","00000000010000000000000000000000000000000000000"); index=0*unitCount+0;
      activity=new TaskActivity("1","好老师","x","正常课程","1","教1","00000000010000000000000000000000000000000000000"); index=1*unitCount+0;
      activity=new TaskActivity("1","王老师","x","停课课程","1","停课","00000000010000000000000000000000000000000000000"); index=2*unitCount+0;</script>`
    const cs = new JwClassicEamsParser(src).generateCourseList()
    expect(cs).toHaveLength(1)
    expect(cs[0].name).toBe('正常课程')
  })

  it('maps numeric index via unitCount modulo and protects empty pages', () => {
    const src = page('课程乙', '26')
    const c = new JwClassicEamsParser(src).generateCourseList()[0]
    expect([c.day, c.startNode]).toEqual([3, 3])
    const empty = '<table id="manualArrangeCourseTable"></table><script>var unitCount=12;</script>'
    expect(new JwClassicEamsParser(empty).generateCourseList()).toEqual([])
    expect(new JwClassicEamsParser(empty).confidence()).toBe(0)
  })

  it('keeps commas and brackets in names', () => {
    const comma = page('概率论与数理统计,上', '0*unitCount+4')
    expect(new JwClassicEamsParser(comma).generateCourseList()[0].name).toBe('概率论与数理统计,上')
    const brackets = ['市场营销学(理论)', '数据库实验(上机)', '《红楼梦》导读']
    const src = brackets.map((name, i) => page(name, `1*unitCount+${i}`)).join('')
    expect(new JwClassicEamsParser(src).generateCourseList().map((x) => x.name)).toEqual(brackets)
  })

  it('reports confidence anchors and matched features', () => {
    expect(new JwClassicEamsParser(tjuLike).confidence()).toBe(95)
    const partial = '<script>activity=new TaskActivity("1","t","c","n","r","p","01");</script>'
    expect(new JwClassicEamsParser(partial).confidence()).toBe(55)
    expect(new JwClassicEamsParser(tjuLike).matchedFeatures()).toEqual(expect.arrayContaining(['new TaskActivity(...)', 'table#manualArrangeCourseTable', 'var unitCount = N']))
  })
})
