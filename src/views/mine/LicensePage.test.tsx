/**
 * LicensePage — LicenseScreen.kt 1:1 区块序与展开契约;
 * 致谢漂移闸门移植自 AboutLicenseAttributionTest.kt (token 表由其逐条生成): 6 语 about_license_body 必须含每条 token。
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react'
import { LicensePage } from './LicensePage'
import { initI18n } from '../../i18n'
import zhCN from '../../i18n/zh-CN.json'
import zhTW from '../../i18n/zh-TW.json'
import en from '../../i18n/en.json'
import enGB from '../../i18n/en-GB.json'
import ja from '../../i18n/ja.json'
import es from '../../i18n/es.json'

const LOCALES: Record<string, { about_license_body: string; license_contributor_section: string }> = {
  'zh-CN': zhCN, 'zh-TW': zhTW, en, 'en-GB': enGB, ja, es,
}

beforeAll(() => {
  initI18n('zh-CN')
})

afterEach(cleanup)

function cardOf(title: string): HTMLElement {
  return screen.getByText(title).closest('div[style*="border-radius: 20px"]') as HTMLElement
}

describe('LicensePage', () => {
  it('区块顺序: 许可证 → 贡献者 → 致谢导语 → 跨校普适 → 按学校', () => {
    const { container } = render(<LicensePage onBack={() => {}} />)
    const text = container.textContent ?? ''
    const marks = ['许可证', '贡献者', 'jim139129', '教务适配致谢', '跨校普适项目', 'WakeUp 课程表 (YZune)', '按学校致谢', '合肥工业大学 HFUT', '浙大城市学院 HZCU']
    const pos = marks.map((m) => text.indexOf(m))
    expect(pos.every((p) => p >= 0)).toBe(true)
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })

  it('贡献者 4 人 (含 GitHub 主页链接, 不枚举 issue 编号)', () => {
    render(<LicensePage onBack={() => {}} />)
    for (const handle of ['jim139129', 'YYiChen', 'LzBsA', 'Cold577']) {
      expect(screen.getByText(`GitHub @${handle}`)).toBeTruthy()
      expect(screen.getByText(new RegExp(`github\\.com/${handle}$`))).toBeTruthy()
    }
  })

  it('按学校 41 张卡默认收起, 仅可展开卡有 48dp 展开按钮', () => {
    render(<LicensePage onBack={() => {}} />)
    // 41 所学校 + 致谢导语卡
    expect(screen.getAllByRole('button', { name: 'expand' })).toHaveLength(42)
    expect(screen.queryByText('classduck (luyishui)')).toBeNull()
    expect(within(cardOf('WakeUp 课程表 (YZune)')).queryByRole('button')).toBeNull()
  })

  it('点标题行或展开按钮各切换一次, 展开后逐行列出全部仓库', () => {
    render(<LicensePage onBack={() => {}} />)
    fireEvent.click(screen.getByText('合肥工业大学 HFUT'))
    expect(screen.getByText('classduck (luyishui)')).toBeTruthy()
    expect(within(cardOf('合肥工业大学 HFUT')).getAllByText(/\(/)).toHaveLength(12)
    fireEvent.click(within(cardOf('合肥工业大学 HFUT')).getByRole('button', { name: 'collapse' }))
    expect(screen.queryByText('classduck (luyishui)')).toBeNull()
  })

  it('致谢导语默认收起, 展开显示 about_license_body', () => {
    render(<LicensePage onBack={() => {}} />)
    const body = zhCN.about_license_body
    expect(screen.queryByText(body)).toBeNull()
    fireEvent.click(screen.getByText('教务适配致谢'))
    expect(screen.getByText(body)).toBeTruthy()
  })

  it('6 语 about_license_body 均含全部跨校/单校致谢 token, 贡献者区块标题齐全', () => {
    for (const [loc, dict] of Object.entries(LOCALES)) {
      const body = dict.about_license_body
      expect(body, loc).toBeTruthy()
      expect(dict.license_contributor_section, loc).toBeTruthy()
      for (const [project, mark] of [...FOUNDATIONAL, ...PER_SCHOOL]) {
        expect(body.includes(project), `${loc} 漏写 ${project}`).toBe(true)
        if (mark !== '') expect(body.includes(mark), `${loc} 漏写 ${project} 的 ${mark}`).toBe(true)
      }
    }
  })
})

const FOUNDATIONAL: Array<[string, string]> = [
  ['WakeUp', 'Apache-2.0'],
  ['WakeupSchedule_BUPT', 'Apache-2.0'],
  ['WakeupSchedule_Kotlin', 'Apache-2.0'],
  ['cqu.js', ''],
  ['shiguang_warehouse', 'MIT'],
  ['zfn_api', 'MPL-2.0'],
  ['FlowCourse', 'GPL-3.0'],
  ['iwut', 'AGPL-3.0'],
  ['shangkeschedule', 'Apache-2.0'],
]

const PER_SCHOOL: Array<[string, string]> = [
  ['HFUT-Schedule', 'MIT'],
  ['HfutOpenApi', 'BoynChan'],
  ['hfut_schedule_hacker', 'Aoi-cn'],
  ['django-hfut-auth', 'elonzh'],
  ['hfut-api', 'hfut-soft-ware'],
  ['hfut_api_service', 'onlineG2'],
  ['HFUTer', 'BrikerMan'],
  ['HFUTICS', 'ssyu0808'],
  ['AiSchedule-for-hfut', 'imnuke'],
  ['AISchedule', 'HualiNox'],
  ['classduck', 'luyishui'],
  ['SEUTimetable', 'Apache-2.0'],
  ['Aetik-yue/hormone', ''],
  ['luzy99/SEUAutoLogin', ''],
  ['zju-ical-py', 'LGPL-2.1'],
  ['USTC-timetable-to-ics', ''],
  ['ustc-course-timetable', 'HowardZorn'],
  ['ustc-timetable', 'kirsh1'],
  ['ScuTimetable', ''],
  ['neu_wisedu2wakeup', 'CreamPig233'],
  ['PopulusYang/NeuTimetable', ''],
  ['neucn/elise', ''],
  ['RekaYOO/NEU-JWXT-Toolkit', ''],
  ['PeterPtroc/neu-jwxt-to-wakeup', ''],
  ['leavesvv-source/NEU-Timetable', ''],
  ['321CQU/pymycqu', ''],
  ['BillYang2016/CQU-class2ics', ''],
  ['haowang02/CourseMonitor', ''],
  ['LengerHu/CQU_classtabletoics', ''],
  ['Hagb/cqu_timetable_new', ''],
  ['VayneDuan/CQU-Grade-Monitor', ''],
  ['weearc/cm-http-api', ''],
  ['barryZZJ/course_to_calander_converter', ''],
  ['courseTable', 'acm910'],
  ['MilLoong/UESTC-EAMS-Helper-App', ''],
  ['MilLoong/UESTC-EAMS-Helper-Python', ''],
  ['KaranocaVe/UESTCJWCWatchdog', ''],
  ['whtsky/uestc-eams-cleartimeout-userscript', ''],
  ['Sunmxt/UESTC-EAMS', ''],
  ['N0tExpectErr0r/GDUT-ClassTimeTable', ''],
  ['Richard-Zheng/GDUT-Schedule-ng', ''],
  ['StarArchive/gdut-course-frontend', ''],
  ['StarArchive/gdut-course-backend', ''],
  ['HoneQ7/GDUT_iOS_Timetable', ''],
  ['jkgeekJack/Android-GDUFE-JWC-SDK', ''],
  ['Kiteio/GDUFE-wrapper', ''],
  ['Kiteio/Punica', ''],
  ['gduf-finmind', ''],
  ['yongjianzheng/Gdufszhushou', ''],
  ['Crazioker/agency', ''],
  ['GDMU', ''],
  ['HZCU', ''],
  ['Xu-Jack11/MySchedule', ''],
  ['LanternCX/HZCUCourseChoose', ''],
  ['zHElEARN/CSUSTKit', ''],
  ['CreaMakers/EduSpider', ''],
  ['timeisthe/CSUSTDataGet', ''],
  ['Julius-lq/EduAdminSystem', ''],
  ['JS-CAUTION/csust-course-schedule', ''],
  ['helium777/bupt-course-grab', ''],
  ['JmPotato/BUPT-Grader', ''],
  ['Seizzzz/Auto-Login-BUPT', ''],
  ['zhongxinghong/PKUAutoElective', ''],
  ['thezzisu/pku-elective', ''],
  ['Hovennnnn/PKUAutoElective2023', ''],
  ['Lihhan/AutoElective_4_PKU', ''],
  ['AuYang261/PKU_Elective_Toolset', ''],
  ['MarkYangKp/ZhengFangJY', ''],
  ['APassbyDreg/BUAA_JW_Utils', ''],
  ['SE2020-TopUnderstanding/BUAA-Campus-Tools-Backend', ''],
  ['fondoger/buaa-teacher-evaluation', 'MIT'],
  ['Cauchy1412/BUAAGetCourse', ''],
  ['KKRainbow/JWOneShotEval', ''],
  ['ldiex/UCAS_Course_Schedule_Convertor', ''],
  ['Hurray0/UCAS_GET_Course', ''],
  ['cld378632668/ucas_course_tool', ''],
  ['GentleCP/UCAS-Helper', ''],
  ['wirsbf/TraintimePda-UCAS', ''],
  ['tbjuechen/sep-api', ''],
  ['Bloomberg2000/bjfu_course_ics_generator', ''],
  ['Bloomberg2000/bjfu_util.py', ''],
  ['Tonyseth/AHU_JW_GPA_Calculator', ''],
  ['Ahu_Plus', 'abydym'],
  ['bboy-xp/nefu-crawler', ''],
  ['heyMahalo/crouse_select', ''],
  ['tk.dcmmcc', ''],
  ['Bad-086/DHU_CourseMonitor', ''],
  ['NINIYOYYO/ynufe-campus-app', ''],
  ['MiaoWuNYA/ynufeRealLogin', ''],
  ['BIT-Login', 'BIT101-dev'],
  ['iBistu', 'ProjektMing'],
  ['JdaAssist', 'CH4019'],
  ['CQYTZFCheckScores', 'xM3GAN'],
  ['ScheduleXParser_SCAU', 'greyovo'],
  ['JW-spider', 'Zhy423310825'],
  ['BohaiServiceDome', 'joun233'],
  ['WeNEPU', 'cutiechi'],
  ['HeraldStudentCurriculum', 'idailylife'],
  ['bjtu_mis_Android', 'wan300'],
  ['BJTU-MIS-HarmonyOS', 'Anyes666'],
  ['BJTUselfService', 'HFDLYS'],
  ['bjtu-cli', 'fish2lab'],
  ['BJTUselfService-macOS', 'fish2lab'],
  ['BJTU-course-assistant', 's1y4x1'],
  ['ZiuChen/userscript', 'MIT'],
  ['BJTU-iCalendar-Generator', 'ymzhang-cs'],
  ['bjtu-timetable', 'Moliseeee'],
  ['BJTU-course-autoget-program', 'hyskr'],
  ['BjtuCoursePlatform', '57Darling02'],
  ['bjtuDean', 'jlytwhx'],
  ['bjtubox_python', 'jlytwhx'],
  ['Campus-Mate', 'Orien233'],
  ['BJTU-STU-MCP', 'ymzhang-cs'],
  ['CourseRobber', 'xschur'],
  ['Futuremind-BJTU', ''],
  ['BJTU_ezRate', 'Yukikasu'],
  ['bjtu_teaching_assessment', 'xxxand'],
  ['BJTU-script', 'Coconut00'],
  ['BJTU-CC', 'aooxin'],
  ['CourseTable', 'etherealviator'],
  ['ZF-Assistant', 'mcdona1d'],
  ['jianghaidai', 'sunjingquan'],
  ['JOU-Campus-Guide', 'sunjingquan'],
  ['jou_course_bot', 'brodamndamn'],
  ['Wehhit-server', 'dengjj'],
  ['Wehhit', 'zqy1'],
  ['Grain', 'LeeReindeer'],
  ['finance', 'GeorgeLeoo'],
  ['finance-server', 'GeorgeLeoo'],
  ['JStore', 'GeorgeLeoo'],
  ['RSSHub jou', 'MIT'],
  ['北交大iCalender课表生成', 'Greasy Fork'],
  ['LzBsA', 'github.com/LzBsA'],
  ['qnxg/hnu_query', 'AGPL-3.0'],
  ['qnxg/weihuda_backend', 'qnxg'],
  ['heriec/suda-yjs-shedule', 'heriec'],
  ['dlutor/chaoxingbook', 'MIT'],
  ['AmaneSuzuha000/SWJTU_Login', ''],
  ['1-nuo/swjtu-course-grabber', ''],
  ['Arex-lbb/auto-course-grabber', ''],
  ['1837634311/SWJTU-Course-Management-Script', 'GPL-3.0'],
  ['HackSwjtu/Postime', 'MIT'],
  ['lpzams/swjtu-course-crawler', ''],
  ['949144093/SWJTU-JiaoWuAutoLogin', ''],
  ['kakasearch/course_download', ''],
  ['zx1411057234/VatuuSpider', ''],
  ['kashaku/no-vatuu-evaluation', ''],
  ['Joe-create-star/swjtu-dektx-reminder', 'MIT'],
  ['Dawn-Course', 'GPL-3.0'],
  ['WakeUp_SHU', 'ershiyidian'],
  ['CourseHelper', 'jiangyiqi99'],
  ['aischedule-lit-kingosoft', 'MIT'],
  ['XiaoAISchedule_hebust', 'web1n'],
  ['ai-schedule-chaoxing', 'MIT'],
  ['tzvcst-schedule-chaoxing', 'AGPL-3.0'],
  ['xiaoai-shuwei-course', 'ZKJJaker'],
  ['jxufe-auto-evaluate', 'wzj1122'],
  ['KINGOSOFT-LOGIN', '52funny'],
  ['xiaoaiSchedule', 'xiaxiaoyu8'],
  ['mi-schedule', 'Kou-JunHao'],
  ['AISchedule-xjsf', 'ltxhhz'],
  ['AIScheduleSCAU', 'greyovo'],
  ['MI_AI_Course_Schedule', 'ceresOPA'],
  ['AISchedule-QiangZhi', 'MyLikeGirl'],
  ['classpush', 'sungithub270'],
  ['XiaoAiScheduleOfSUOT', 'trueWangSyutung'],
  ['XiaoAiCurriculumSchedule', 'LukeJean'],
  ['getICS', 'Konata09'],
  ['WITClassScheduleToCalendar', 'DOROMOLLL'],
  ['CrawlerCourseTable', 'canliture'],
  ['SYU_KINGGOClassSel', 'XTAI9'],
  ['hait_AICourseTable', 'zzzsq1'],
  ['AIShedule_cqwu', 'cqwu-ehall'],
  ['WakeUpSchedule', 'Daydream357'],
  ['shike-android', 'sw7943604-del'],
  ['shiguang_Tester', 'XingHeYuZhuan'],
  ['dutsso', 'yuanyuanzijin'],
  ['pub-docs', 'zfman'],
  ['eduData-GoBack', 'huhu415'],
  ['NUISTTable', 'zyc-816'],
  ['fontlos/buaa-api', 'MIT'],
  ['BUAASubnet/UBAA', 'MIT'],
  ['CoolwindHF/buaa2wakeup', 'MIT'],
  ['awesome-buaa-cs/buaa-curriculum', ''],
  ['cantBeFoundGroup/OpenBUAA', ''],
  ['el-ev/BUAA-ics-gen', 'MIT'],
  ['Krignd/KAgenda', ''],
  ['Yiki21/iclass_buaa_tui', 'GPL-3.0'],
  ['Lidozs55/BUAAer-Smart-Schedule-on-electron', ''],
  ['WhXcjm/buaa-byxt-aischedule', 'GPL-3.0'],
  ['MeanZhang/buaa-ai-schedule', 'MIT'],
  ['Alyssumira/BUAA-Schedule', 'MIT'],
  ['lyy1119/BuaaScheduleRender', 'MIT'],
  ['zjafb/BUAA-Hangzhou-Schedule', 'MIT'],
  ['dream2333/NWUPL-Pure-EMS', ''],
  ['linling-zy/kust-schedule', 'Apache-2.0'],
  ['3056810551/nuit-class-schedule', ''],
  ['SCAU-Grad-Automatically-Fill-Evaluation-Form-JS', 'jiefing'],
]
