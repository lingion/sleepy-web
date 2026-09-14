/**
 * LicensePage — 开源许可与致谢 (LicenseScreen.kt 1:1)。
 * GPL 卡 → 贡献者 → 可折叠致谢导语 (about_license_body 全文) → 跨校普适项目 → 按学校致谢 (可展开)。
 * 项目名/作者/license 名是通用标识不翻译; 条目数据与 LicenseScreen.kt 逐条对齐。
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconExpandLess, IconExpandMore } from '../../components/icons'
import { SettingsScaffold } from './shared'

export function LicensePage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }))
  const bodyExpanded = expanded['__body__'] === true

  return (
    <SettingsScaffold title={t('license_page_title')} onBack={onBack}>
      {/* 许可证区块 */}
      <LicenseCard>
        <div className="m3-title-small" style={{ fontWeight: 600 }}>{t('license_gpl_section')}</div>
        <div style={{ height: 8 }} />
        <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
          {t('license_gpl_body')}
        </div>
      </LicenseCard>

      {/* 贡献者区块 (直接向本项目提交代码并合入的开发者, 与上游参考仓库致谢区分) */}
      <SectionHeader text={t('license_contributor_section')} />
      {CONTRIBUTOR_ENTRIES.map((e) => (
        <AttributionCard key={e.id} title={e.title} meta={e.meta} usage={e.usage} />
      ))}

      {/* 致谢导语区块 (可折叠: 默认收起, 点击展开看 about_license_body 全文) */}
      <LicenseCard>
        <div
          onClick={() => toggle('__body__')}
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          <div style={{ flex: 1 }}>
            <div className="m3-title-small" style={{ fontWeight: 600 }}>{t('license_attribution_section')}</div>
            <div style={{ height: 8 }} />
            <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>
              {t('license_attribution_note')}
            </div>
          </div>
          <ExpandIcon expanded={bodyExpanded} />
        </div>
        {bodyExpanded && (
          <div className="m3-body-small" style={{ marginTop: 8, color: 'var(--md-on-surface-variant)', whiteSpace: 'pre-line' }}>
            {t('about_license_body')}
          </div>
        )}
      </LicenseCard>

      {/* 跨校普适项目 (Foundational) */}
      <SectionHeader text={t('license_foundational_section')} />
      {ATTRIBUTION_ENTRIES.map((e) => (
        <AttributionCard key={e.id} title={e.title} meta={e.meta} usage={e.usage} />
      ))}

      {/* 按学校致谢 (PerSchool, 可展开) */}
      <SectionHeader text={t('license_perschool_section')} />
      {PER_SCHOOL_ENTRIES.map((e) => {
        const open = expanded[e.id] === true
        return (
          <LicenseCard key={e.id}>
            <div
              onClick={() => toggle(e.id)}
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
            >
              <div className="m3-title-small" style={{ flex: 1, fontWeight: 600 }}>{e.title}</div>
              <ExpandIcon expanded={open} />
            </div>
            {open && (
              <div style={{ marginTop: 6 }}>
                {e.usage.split('\n').map((line, i) => (
                  <div key={i} className="m3-body-small" style={{ padding: '2px 0', color: 'var(--md-on-surface-variant)' }}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </LicenseCard>
        )
      })}
    </SettingsScaffold>
  )
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return expanded
    ? <IconExpandLess size={20} style={{ color: 'var(--md-on-surface-variant)' }} />
    : <IconExpandMore size={20} style={{ color: 'var(--md-on-surface-variant)' }} />
}

/** 一条顶层致谢卡 (不可展开): 标题 + 副标题 (primary 色) + 说明段。 */
function AttributionCard({ title, meta, usage }: { title: string; meta: string; usage: string }) {
  return (
    <LicenseCard>
      <div className="m3-title-small" style={{ fontWeight: 600 }}>{title}</div>
      {meta.trim() !== '' && (
        <div className="m3-body-small" style={{ marginTop: 2, color: 'var(--md-primary)' }}>{meta}</div>
      )}
      <div className="m3-body-medium" style={{ marginTop: 6, color: 'var(--md-on-surface-variant)' }}>{usage}</div>
    </LicenseCard>
  )
}

function SectionHeader({ text }: { text: string }) {
  return (
    <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-primary)', padding: '8px 4px 0' }}>
      {text}
    </div>
  )
}

function LicenseCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="m3-card" style={{ borderRadius: 20, background: 'var(--md-surface-container)', padding: 16 }}>
      {children}
    </div>
  )
}

/** 跨校普适项目 (单卡, 不可展开) — LicenseScreen.kt attributionEntries 1:1 */
const ATTRIBUTION_ENTRIES: Array<{ id: string; title: string; meta: string; usage: string }> = [
  { id: 'foundational-wakeup', title: 'WakeUp 课程表 (YZune)', meta: 'Apache-2.0', usage: 'JwCourse / JwParser 中间结构语义与强智系 HTML 解析的参考实现' },
  { id: 'foundational-wakeup-bupt', title: 'WakeupSchedule_BUPT (dIT8Zv)', meta: 'Apache-2.0', usage: '十二个教务解析器的上游: 强智全家族 (qz/qz_with_node/qz_br/qz_crazy/qz_old)、老版正方、URP、青果、新正方、HNUST 与 Parser 设计' },
  { id: 'foundational-wakeup-kotlin', title: 'WakeupSchedule_Kotlin (YZune)', meta: 'Apache-2.0', usage: '经典金智 EAMS 导入实现 (TaskActivity 位图解析) 的参考' },
  { id: 'foundational-cqu-js', title: '时光课程表 cqu.js', meta: '', usage: '重庆大学门户 REST 协议 (session / 课表 / 作息三接口) 的分析依据' },
  { id: 'foundational-shiguang', title: 'shiguang_warehouse (XingHeYuZhuan)', meta: 'MIT', usage: '武汉理工大学 kcbcxby 协议、经典金智 EAMS (hunnu/uestc/hpu) 与新正方网格视图 (zhengfang_01) 的协议形态参考' },
  { id: 'foundational-zfn', title: 'zfn_api (openschoolcn)', meta: 'MPL-2.0', usage: '新正方 jwglxt kbList 接口形态交叉验证' },
  { id: 'foundational-flow', title: 'FlowCourse (jiaweiyaya)', meta: 'GPL-3.0', usage: '新正方 kbList 主流形态与 jc 多形态交叉验证' },
  { id: 'foundational-iwut', title: 'iwut (TokenTeam)', meta: 'AGPL-3.0 · 仅参考协议形态', usage: '武汉理工大学节次 DM 映射的协议佐证 (未引用代码)' },
  { id: 'foundational-shangkeschedule', title: '「上课」shangkeschedule (qiqqqqq517)', meta: 'Apache-2.0', usage: '1776 校学校登记表在名单交叉复核中的对照数据源' },
]

/** 按学校聚合: 每校一条卡, 展开后看到该校所参考的所有 GitHub 项目 — perSchoolEntries 1:1 */
const PER_SCHOOL_ENTRIES: Array<{ id: string; title: string; usage: string }> = [
  { id: 'school-hfut', title: '合肥工业大学 HFUT', usage: 'HFUT-Schedule (Chiu-xaH, MIT)\nHfutOpenApi (BoynChan, MIT)\nhfut_schedule_hacker (Aoi-cn)\ndjango-hfut-auth (elonzh, MIT)' },
  { id: 'school-seu', title: '东南大学 SEU', usage: 'SEUTimetable (sakimidare, Apache-2.0)\nAetik-yue/hormone (SEU SSO 入口)\nluzy99/SEUAutoLogin' },
  { id: 'school-zju', title: '浙江大学 ZJU', usage: 'zju-ical-py (Xecades, LGPL-2.1)' },
  { id: 'school-ustc', title: '中国科学技术大学 USTC', usage: 'USTC-timetable-to-ics (1970633640)' },
  { id: 'school-scu', title: '四川大学 SCU', usage: 'ScuTimetable (Z-P-J)' },
  { id: 'school-neu', title: '东北大学 NEU', usage: 'neu_wisedu2wakeup (CreamPig233)\nPopulusYang/NeuTimetable\nneucn/elise\nRekaYOO/NEU-JWXT-Toolkit\nPeterPtroc/neu-jwxt-to-wakeup\nleavesvv-source/NEU-Timetable' },
  { id: 'school-cqu', title: '重庆大学 CQU', usage: '时光课程表 cqu.js (茵符草)\n321CQU/pymycqu\nBillYang2016/CQU-class2ics\nhaowang02/CourseMonitor\nLengerHu/CQU_classtabletoics\nHagb/cqu_timetable_new\nVayneDuan/CQU-Grade-Monitor\nweearc/cm-http-api\nbarryZZJ/course_to_calander_converter' },
  { id: 'school-whut', title: '武汉理工大学 WHUT', usage: 'courseTable (acm910)' },
  { id: 'school-uestc', title: '电子科技大学 UESTC', usage: 'MilLoong/UESTC-EAMS-Helper-App\nMilLoong/UESTC-EAMS-Helper-Python\nKaranocaVe/UESTCJWCWatchdog\nwhtsky/uestc-eams-cleartimeout-userscript\nSunmxt/UESTC-EAMS' },
  { id: 'school-gdut', title: '广东工业大学 GDUT', usage: 'N0tExpectErr0r/GDUT-ClassTimeTable\nRichard-Zheng/GDUT-Schedule-ng\nStarArchive/gdut-course-frontend\nStarArchive/gdut-course-backend\nHoneQ7/GDUT_iOS_Timetable' },
  { id: 'school-gdufe', title: '广东财经大学 GDUFE', usage: 'jkgeekJack/Android-GDUFE-JWC-SDK-1.0.0\nKiteio/GDUFE-wrapper' },
  { id: 'school-gduf', title: '广东金融学院 GDUf', usage: 'Kiteio/Punica\ngduf-finmind' },
  { id: 'school-gdufs', title: '广东外语外贸大学 GDUFS', usage: 'yongjianzheng/Gdufszhushou\nCrazioker/agency' },
  { id: 'school-gdmu', title: '广东医科大学 GDMU', usage: '用户采集包实锤 zf_new 协议形态 (新正方 zftal-ui-v5 裸 /kbcx/ 路径), 参见 docs/release-notes-v1.0.49.md' },
  { id: 'school-csust', title: '长沙理工大学 CSUST', usage: 'zHElEARN/CSUSTKit\nCreaMakers/EduSpider\ntimeisthe/CSUSTDataGet\nJulius-lq/EduAdminSystem\nJS-CAUTION/csust-course-schedule' },
  { id: 'school-bupt', title: '北京邮电大学 BUPT', usage: 'helium777/bupt-course-grab\nJmPotato/BUPT-Grader\nSeizzzz/Auto-Login-BUPT' },
  { id: 'school-pku', title: '北京大学 PKU', usage: 'zhongxinghong/PKUAutoElective\nthezzisu/pku-elective\nHovennnnn/PKUAutoElective2023\nLihhan/AutoElective_4_PKU\nAuYang261/PKU_Elective_Toolset' },
  { id: 'school-buct', title: '北京化工大学 BUCT', usage: 'MarkYangKp/ZhengFangJY' },
  { id: 'school-ucas', title: '中国科学院大学 UCAS', usage: 'ldiex/UCAS_Course_Schedule_Convertor\nHurray0/UCAS_GET_Course\ncld378632668/ucas_course_tool\nGentleCP/UCAS-Helper\nwirsbf/TraintimePda-UCAS\ntbjuechen/sep-api' },
  { id: 'school-bjfu', title: '北京林业大学 BJFU', usage: 'Bloomberg2000/bjfu_course_ics_generator\nBloomberg2000/bjfu_util.py' },
  { id: 'school-ahu', title: '安徽大学 AHU', usage: 'Tonyseth/AHU_JW_GPA_Calculator' },
  { id: 'school-nefu', title: '东北林业大学 NEFU', usage: 'bboy-xp/nefu-crawler\nheyMahalo/crouse_select' },
  { id: 'school-dhu', title: '东华大学 DHU', usage: 'tk.dcmmcc\nBad-086/DHU_CourseMonitor' },
  { id: 'school-ynufe', title: '云南财经大学 YNUFE', usage: 'NINIYOYYO/ynufe-campus-app\nMiaoWuNYA/ynufeRealLogin' },
  { id: 'school-bit', title: '北京理工大学 BIT', usage: 'BIT-Login (BIT101-dev)' },
  { id: 'school-bistu', title: '北京信息科技大学 BISTU', usage: 'iBistu (ProjektMing)' },
  { id: 'school-ahujz', title: '安徽建筑大学 AHU-JZ', usage: 'JdaAssist (CH4019, MIT)' },
  { id: 'school-cqytu', title: '重庆邮电大学移通学院 CQYTU', usage: 'CQYTZFCheckScores (xM3GAN, Apache-2.0)' },
  { id: 'school-scau', title: '华南农业大学 SCAU', usage: 'ScheduleXParser_SCAU (greyovo)' },
  { id: 'school-qlu', title: '齐鲁工业大学 QLU', usage: 'JW-spider (Zhy423310825)' },
  { id: 'school-bhu', title: '渤海大学 BHU', usage: 'BohaiServiceDome (joun233)' },
  { id: 'school-nepu', title: '东北石油大学 NEPU', usage: 'WeNEPU (cutiechi)' },
  { id: 'school-nust', title: '南京理工大学 NUST', usage: 'HeraldStudentCurriculum (idailylife)' },
  {
    id: 'school-bjtu', title: '北京交通大学 BJTU', usage: [
      'bjtu_mis_Android (wan300, MIT)', 'BJTU-MIS-HarmonyOS (Anyes666, MIT)', 'BJTUselfService (HFDLYS, MIT)',
      'bjtu-cli (fish2lab)', 'BJTUselfService-macOS (fish2lab)', 'BJTU-course-assistant (s1y4x1)',
      'ZiuChen/userscript (MIT)', 'BJTU-iCalendar-Generator (ymzhang-cs, MIT)', 'bjtu-timetable (Moliseeee)',
      'BJTU-course-autoget-program (hyskr)', 'BjtuCoursePlatform (57Darling02)', 'bjtuDean (jlytwhx, MIT)',
      'bjtubox_python (jlytwhx)', 'Campus-Mate (Orien233)', 'BJTU-STU-MCP (ymzhang-cs)',
      'CourseRobber (xschur)', 'Futuremind-BJTU', 'BJTU_ezRate (Yukikasu, MIT)',
      'bjtu_teaching_assessment (xxxand, MIT)', 'BJTU-script (Coconut00)', 'BJTU-CC (aooxin)',
      'CourseTable (etherealviator, MIT)', 'ZF-Assistant (mcdona1d)',
      'Greasy Fork 430918 北交大iCalender课表生成',
    ].join('\n'),
  },
  { id: 'school-jou', title: '江苏海洋大学 JOU', usage: '酱海带 jianghaidai (sunjingquan, 闭源参考, 仅协议分析未复用)\nJOU-Campus-Guide (sunjingquan)\njou_course_bot (brodamndamn)\nWehhit-server (dengjj)\nWehhit (zqy1)\nGrain (LeeReindeer, 浙江海洋大学, GPL-3.0)\n家庭记账系统 finance (GeorgeLeoo)\nfinance-server (GeorgeLeoo)\nJStore (GeorgeLeoo)\nRSSHub jou 路由 (RSSHub, MIT)' },
  { id: 'school-ysu', title: '燕山大学 YSU', usage: 'LzBsA (github.com/LzBsA, boya_pp 协议适配原始提交, PR 复活)\nqnxg/hnu_query (qnxg, AGPL-3.0)\nqnxg/weihuda_backend (qnxg)\nheriec/suda-yjs-shedule (heriec)\ndlutor/chaoxingbook (dlutor, MIT)' },
]

/** 贡献者: 直接向本项目提交代码并合入的开发者 — contributorEntries 1:1 */
const CONTRIBUTOR_ENTRIES: Array<{ id: string; title: string; meta: string; usage: string }> = [
  { id: 'contributor-jim139129', title: 'jim139129', meta: 'GitHub @jim139129', usage: '已合并多项 PR 并持续反馈 issue — 全部提交与讨论记录见 github.com/jim139129' },
]
