/**
 * LicensePage — 开源许可与致谢 (LicenseScreen.kt 1:1)。
 * GPL 卡 → 贡献者 → 可折叠致谢导语 (about_license_body 全文) → 跨校普适项目 → 按学校致谢 (可展开)。
 * 项目名/作者/license 名是通用标识不翻译; 条目数据由 LicenseScreen.kt 逐条生成。
 */

import { useState, type ReactNode } from 'react'
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
      {/* LazyColumn contentPadding 16 + spacedBy 12 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: -16 }}>
        <LicenseCard>
          <div className="m3-body-large" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{t('license_gpl_section')}</div>
          <div style={{ height: 8 }} />
          <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{t('license_gpl_body')}</div>
        </LicenseCard>

        <SectionHeader text={t('license_contributor_section')} />
        {CONTRIBUTOR_ENTRIES.map((e) => (
          <AttributionCard key={e.id} title={e.title} subtitle={e.meta} description={e.usage} />
        ))}

        <LicenseCard>
          <div onClick={() => toggle('__body__')} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m3-body-large" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{t('license_attribution_section')}</div>
              <div style={{ height: 8 }} />
              <div className="m3-body-medium" style={{ color: 'var(--md-on-surface-variant)' }}>{t('license_attribution_note')}</div>
            </div>
            <ExpandButton expanded={bodyExpanded} onToggle={() => toggle('__body__')} />
          </div>
          {bodyExpanded && (
            <div className="m3-body-small" style={{ paddingTop: 8, color: 'var(--md-on-surface-variant)' }}>{t('about_license_body')}</div>
          )}
        </LicenseCard>

        <SectionHeader text={t('license_foundational_section')} />
        {ATTRIBUTION_ENTRIES.map((e) => (
          <AttributionCard key={e.id} title={e.title} subtitle={e.meta} description={e.usage} />
        ))}

        <SectionHeader text={t('license_perschool_section')} />
        {PER_SCHOOL_ENTRIES.map((e) => (
          <AttributionCard
            key={e.id}
            title={e.title}
            expandable={{ expanded: expanded[e.id] === true, onToggle: () => toggle(e.id), lines: e.usage.split('\n') }}
          />
        ))}
      </div>
    </SettingsScaffold>
  )
}

/** M3 IconButton: 48dp 触控区 + 24dp ExpandLess/ExpandMore (onSurfaceVariant) */
function ExpandButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const Icon = expanded ? IconExpandLess : IconExpandMore
  return (
    <button
      type="button"
      aria-label={expanded ? 'collapse' : 'expand'}
      aria-expanded={expanded}
      onClick={(ev) => {
        ev.stopPropagation()
        onToggle()
      }}
      style={{
        width: 48, height: 48, flexShrink: 0, borderRadius: 24, border: 'none', padding: 0, cursor: 'pointer',
        background: 'transparent', color: 'var(--md-on-surface-variant)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Icon size={24} />
    </button>
  )
}

/** 一条顶层致谢卡: 跨校项目/贡献者=不可展开 (标题+副标题+说明), 单校=可展开 (仅标题, 展开逐行列仓库)。 */
function AttributionCard({
  title, subtitle, description, expandable,
}: {
  title: string
  subtitle?: string
  description?: string
  expandable?: { expanded: boolean; onToggle: () => void; lines: string[] }
}) {
  const expanded = expandable?.expanded === true
  return (
    <LicenseCard>
      <div
        onClick={expandable?.onToggle}
        style={{ display: 'flex', alignItems: 'center', cursor: expandable ? 'pointer' : undefined }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-on-surface)' }}>{title}</div>
          {subtitle !== undefined && subtitle.trim() !== '' && (
            <div className="m3-body-small" style={{ marginTop: 2, color: 'var(--md-primary)' }}>{subtitle}</div>
          )}
        </div>
        {expandable && <ExpandButton expanded={expanded} onToggle={expandable.onToggle} />}
      </div>
      {!expanded && description !== undefined && description.trim() !== '' && (
        <div className="m3-body-medium" style={{ marginTop: 6, color: 'var(--md-on-surface-variant)' }}>{description}</div>
      )}
      {/* Android 的 Spacer(6dp) 在 AnimatedVisibility 内与内容同点叠放 (Box 式布局), 实际不产生间距 */}
      {expanded && expandable && (
        <div>
          {expandable.lines.map((line, i) => (
            <div key={i} className="m3-body-small" style={{ padding: '2px 0', color: 'var(--md-on-surface-variant)' }}>{line}</div>
          ))}
        </div>
      )}
    </LicenseCard>
  )
}

function SectionHeader({ text }: { text: string }) {
  return (
    <div className="m3-title-small" style={{ fontWeight: 600, color: 'var(--md-primary)', padding: '8px 0 4px 4px' }}>
      {text}
    </div>
  )
}

function LicenseCard({ children }: { children: ReactNode }) {
  return (
    <div style={{ borderRadius: 20, background: 'var(--md-surface-container)', color: 'var(--md-on-surface)', padding: 16 }}>
      {children}
    </div>
  )
}

/** 贡献者: 直接向本项目提交代码并合入的开发者 — contributorEntries 1:1 */
const CONTRIBUTOR_ENTRIES: Array<{ id: string; title: string; meta: string; usage: string }> = [
  { id: 'contributor-jim139129', title: 'jim139129', meta: 'GitHub @jim139129', usage: '已合并多项 PR 并持续反馈 issue — 全部提交与讨论记录见 github.com/jim139129' },
  { id: 'contributor-YYiChen', title: 'YYiChen', meta: 'GitHub @YYiChen', usage: '已合并 PR #43 课表自适应高度、PR #48 前一晚明日预告 — 全部提交与讨论记录见 github.com/YYiChen' },
  { id: 'contributor-LzBsA', title: 'LzBsA', meta: 'GitHub @LzBsA', usage: '已合并 PR #30 燕山大学研究生平台 boya_pp 协议适配 (贡献者保留式 merge) — 全部提交与讨论记录见 github.com/LzBsA' },
  { id: 'contributor-Cold577', title: '冷冷冷 Cold577', meta: 'GitHub @Cold577', usage: '已合并 PR #79 小组件选择器预览图修复 (运行时位图容器 previewLayout 摘除) — 全部提交与讨论记录见 github.com/Cold577' },
]

/** 跨校普适项目 (单卡, 不可展开) — attributionEntries 1:1 */
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

/** 按学校聚合: 每校一条卡, 展开后每行 = 一个仓库 + (作者, license) — perSchoolEntries 1:1 */
const PER_SCHOOL_ENTRIES: Array<{ id: string; title: string; usage: string }> = [
  {
    id: 'school-hfut', title: '合肥工业大学 HFUT', usage: [
      'HFUT-Schedule (Chiu-xaH, MIT)',
      'HfutOpenApi (BoynChan, MIT)',
      'hfut_schedule_hacker (Aoi-cn)',
      'django-hfut-auth (elonzh, MIT)',
      'hfut-api (hfut-soft-ware)',
      'hfut-api (SnowingFox)',
      'hfut_api_service (onlineG2)',
      'HFUTer (BrikerMan)',
      'HFUTICS (ssyu0808)',
      'AiSchedule-for-hfut (imnuke, GPL-3.0)',
      'AISchedule (HualiNox)',
      'classduck (luyishui)',
    ].join('\n'),
  },
  { id: 'school-seu', title: '东南大学 SEU', usage: 'SEUTimetable (sakimidare, Apache-2.0)\nAetik-yue/hormone (SEU SSO 入口)\nluzy99/SEUAutoLogin' },
  { id: 'school-zju', title: '浙江大学 ZJU', usage: 'zju-ical-py (Xecades, LGPL-2.1)' },
  {
    id: 'school-ustc', title: '中国科学技术大学 USTC', usage: [
      'USTC-timetable-to-ics (1970633640)',
      'ustc-course-timetable (HowardZorn, GPL-3.0)',
      'ustc-timetable (kirsh1, AGPL-3.0)',
    ].join('\n'),
  },
  { id: 'school-scu', title: '四川大学 SCU', usage: 'ScuTimetable (Z-P-J)' },
  {
    id: 'school-neu', title: '东北大学 NEU', usage: [
      'neu_wisedu2wakeup (CreamPig233)',
      'PopulusYang/NeuTimetable',
      'neucn/elise',
      'RekaYOO/NEU-JWXT-Toolkit',
      'PeterPtroc/neu-jwxt-to-wakeup',
      'leavesvv-source/NEU-Timetable',
    ].join('\n'),
  },
  {
    id: 'school-cqu', title: '重庆大学 CQU', usage: [
      '时光课程表 cqu.js (茵符草)',
      '321CQU/pymycqu',
      'BillYang2016/CQU-class2ics',
      'haowang02/CourseMonitor',
      'LengerHu/CQU_classtabletoics',
      'Hagb/cqu_timetable_new',
      'VayneDuan/CQU-Grade-Monitor',
      'weearc/cm-http-api',
      'barryZZJ/course_to_calander_converter',
    ].join('\n'),
  },
  { id: 'school-whut', title: '武汉理工大学 WHUT', usage: 'courseTable (acm910)' },
  {
    id: 'school-uestc', title: '电子科技大学 UESTC', usage: [
      'MilLoong/UESTC-EAMS-Helper-App',
      'MilLoong/UESTC-EAMS-Helper-Python',
      'KaranocaVe/UESTCJWCWatchdog',
      'whtsky/uestc-eams-cleartimeout-userscript',
      'Sunmxt/UESTC-EAMS',
    ].join('\n'),
  },
  {
    id: 'school-gdut', title: '广东工业大学 GDUT', usage: [
      'N0tExpectErr0r/GDUT-ClassTimeTable',
      'Richard-Zheng/GDUT-Schedule-ng',
      'StarArchive/gdut-course-frontend',
      'StarArchive/gdut-course-backend',
      'HoneQ7/GDUT_iOS_Timetable',
    ].join('\n'),
  },
  { id: 'school-gdufe', title: '广东财经大学 GDUFE', usage: 'jkgeekJack/Android-GDUFE-JWC-SDK-1.0.0\nKiteio/GDUFE-wrapper' },
  { id: 'school-gduf', title: '广东金融学院 GDUf', usage: 'Kiteio/Punica\ngduf-finmind' },
  { id: 'school-gdufs', title: '广东外语外贸大学 GDUFS', usage: 'yongjianzheng/Gdufszhushou\nCrazioker/agency' },
  { id: 'school-gdmu', title: '广东医科大学 GDMU', usage: '用户采集包实锤 zf_new 协议形态 (新正方 zftal-ui-v5 裸 /kbcx/ 路径), 参见 docs/release-notes-v1.0.49.md' },
  {
    id: 'school-csust', title: '长沙理工大学 CSUST', usage: [
      'zHElEARN/CSUSTKit',
      'CreaMakers/EduSpider',
      'timeisthe/CSUSTDataGet',
      'Julius-lq/EduAdminSystem',
      'JS-CAUTION/csust-course-schedule',
    ].join('\n'),
  },
  { id: 'school-bupt', title: '北京邮电大学 BUPT', usage: 'helium777/bupt-course-grab\nJmPotato/BUPT-Grader\nSeizzzz/Auto-Login-BUPT' },
  {
    id: 'school-pku', title: '北京大学 PKU', usage: [
      'zhongxinghong/PKUAutoElective',
      'thezzisu/pku-elective',
      'Hovennnnn/PKUAutoElective2023',
      'Lihhan/AutoElective_4_PKU',
      'AuYang261/PKU_Elective_Toolset',
    ].join('\n'),
  },
  { id: 'school-buct', title: '北京化工大学 BUCT', usage: 'MarkYangKp/ZhengFangJY' },
  {
    id: 'school-ucas', title: '中国科学院大学 UCAS', usage: [
      'ldiex/UCAS_Course_Schedule_Convertor',
      'Hurray0/UCAS_GET_Course',
      'cld378632668/ucas_course_tool',
      'GentleCP/UCAS-Helper',
      'wirsbf/TraintimePda-UCAS',
      'tbjuechen/sep-api',
    ].join('\n'),
  },
  { id: 'school-bjfu', title: '北京林业大学 BJFU', usage: 'Bloomberg2000/bjfu_course_ics_generator\nBloomberg2000/bjfu_util.py' },
  { id: 'school-ahu', title: '安徽大学 AHU', usage: 'Tonyseth/AHU_JW_GPA_Calculator\nAhu_Plus (abydym, GPL-3.0)' },
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
    id: 'school-buaa-byxt', title: '北京航空航天大学 byxt (2026-09)', usage: [
      'fontlos/buaa-api (Rust, MIT)',
      'BUAASubnet/UBAA (Kotlin, MIT)',
      'CoolwindHF/buaa2wakeup (Python, MIT)',
      'awesome-buaa-cs/buaa-curriculum (API.md 旁证)',
      'cantBeFoundGroup/OpenBUAA (Python)',
      'el-ev/BUAA-ics-gen (Python, MIT)',
      'Krignd/KAgenda (Kotlin)',
      'Yiki21/iclass_buaa_tui (Rust, GPL-3.0)',
      'Lidozs55/BUAAer-Smart-Schedule-on-electron (Vue)',
      'WhXcjm/buaa-byxt-aischedule (JS, GPL-3.0)',
      'MeanZhang/buaa-ai-schedule (JS, MIT, archived)',
      'Alyssumira/BUAA-Schedule (Kotlin, MIT)',
      'lyy1119/BuaaScheduleRender (Go, MIT, GSMIS 研究生形态参考)',
      'zjafb/BUAA-Hangzhou-Schedule (MIT, UBAA fork, 杭州校区旁证)',
    ].join('\n'),
  },
  {
    id: 'school-bjtu', title: '北京交通大学 BJTU', usage: [
      'bjtu_mis_Android (wan300, MIT)',
      'BJTU-MIS-HarmonyOS (Anyes666, MIT)',
      'BJTUselfService (HFDLYS, MIT)',
      'bjtu-cli (fish2lab)',
      'BJTUselfService-macOS (fish2lab)',
      'BJTU-course-assistant (s1y4x1)',
      'ZiuChen/userscript (MIT)',
      'BJTU-iCalendar-Generator (ymzhang-cs, MIT)',
      'bjtu-timetable (Moliseeee)',
      'BJTU-course-autoget-program (hyskr)',
      'BjtuCoursePlatform (57Darling02)',
      'bjtuDean (jlytwhx, MIT)',
      'bjtubox_python (jlytwhx)',
      'Campus-Mate (Orien233)',
      'BJTU-STU-MCP (ymzhang-cs)',
      'CourseRobber (xschur)',
      'Futuremind-BJTU',
      'BJTU_ezRate (Yukikasu, MIT)',
      'bjtu_teaching_assessment (xxxand, MIT)',
      'BJTU-script (Coconut00)',
      'BJTU-CC (aooxin)',
      'CourseTable (etherealviator, MIT)',
      'ZF-Assistant (mcdona1d)',
      'Greasy Fork 430918 北交大iCalender课表生成',
    ].join('\n'),
  },
  {
    id: 'school-jou', title: '江苏海洋大学 JOU', usage: [
      '酱海带 jianghaidai (sunjingquan, 闭源参考, 仅协议分析未复用)',
      'JOU-Campus-Guide (sunjingquan)',
      'jou_course_bot (brodamndamn)',
      'Wehhit-server (dengjj)',
      'Wehhit (zqy1)',
      'Grain (LeeReindeer, 浙江海洋大学, GPL-3.0)',
      '家庭记账系统 finance (GeorgeLeoo)',
      'finance-server (GeorgeLeoo)',
      'JStore (GeorgeLeoo)',
      'RSSHub jou 路由 (RSSHub, MIT)',
    ].join('\n'),
  },
  {
    id: 'school-ysu', title: '燕山大学 YSU', usage: [
      'LzBsA (github.com/LzBsA, boya_pp 协议适配原始提交, PR 复活)',
      'qnxg/hnu_query (qnxg, AGPL-3.0)',
      'qnxg/weihuda_backend (qnxg)',
      'heriec/suda-yjs-shedule (heriec)',
      'dlutor/chaoxingbook (dlutor, MIT)',
    ].join('\n'),
  },
  {
    id: 'school-swjtu', title: '西南交通大学 SWJTU', usage: [
      'AmaneSuzuha000/SWJTU_Login (YHXT CAS + ytoken cookie + common API 直接证据)',
      '1-nuo/swjtu-course-grabber (ytoken 请求头 + JWT sub 学号 + SM2 选课加密)',
      'Arex-lbb/auto-course-grabber (JWT + SM2 + A0422 失效码)',
      '1837634311/SWJTU-Course-Management-Script (GPL-3.0, TMS/vatuu 反向证据)',
      'HackSwjtu/Postime (MIT, 老教务网反向证据)',
      'lpzams/swjtu-course-crawler (旧 vatuu 反向证据)',
      '949144093/SWJTU-JiaoWuAutoLogin (旧 vatuu 反向证据)',
      'kakasearch/course_download (旧 vatuu 反向证据)',
      'zx1411057234/VatuuSpider (旧 vatuu 反向证据)',
      'kashaku/no-vatuu-evaluation (旧 vatuu 反向证据)',
      'Joe-create-star/swjtu-dektx-reminder (MIT, OCW/YETHAN 多租户旁证)',
    ].join('\n'),
  },
  {
    id: 'school-wakeup-family', title: 'WakeUp 兼容协议族调研', usage: [
      'Dawn-Course (HF-CYGG, GPL-3.0)',
      'WakeUp_SHU (ershiyidian)',
      'CourseHelper (jiangyiqi99, GPL-3.0)',
      'aischedule-lit-kingosoft (icepie, MIT)',
      'XiaoAISchedule_hebust (web1n)',
      'ai-schedule-chaoxing (moeshin, MIT)',
      'tzvcst-schedule-chaoxing (Sittymin, AGPL-3.0)',
      'xiaoai-shuwei-course (ZKJJaker, 反向证据)',
      'jxufe-auto-evaluate (wzj1122, MIT)',
      'KINGOSOFT-LOGIN (52funny)',
      'xiaoaiSchedule (xiaxiaoyu8)',
      'mi-schedule (Kou-JunHao, MIT)',
      'AISchedule-xjsf (ltxhhz, MIT)',
      'AIScheduleSCAU (greyovo)',
      'MI_AI_Course_Schedule (ceresOPA)',
      'AISchedule-QiangZhi (MyLikeGirl)',
      'classpush (sungithub270, GPL-3.0)',
      'XiaoAiScheduleOfSUOT (trueWangSyutung)',
      'XiaoAiCurriculumSchedule (LukeJean)',
      'getICS (Konata09)',
      'WITClassScheduleToCalendar (DOROMOLLL, MIT)',
      'CrawlerCourseTable (canliture)',
      'SYU_KINGGOClassSel (XTAI9)',
      'hait_AICourseTable (zzzsq1)',
      'AIShedule_cqwu (cqwu-ehall, AGPL-3.0)',
      'WakeUpSchedule (Daydream357, MIT)',
      'shike-android (sw7943604-del)',
      'shiguang_Tester (XingHeYuZhuan, MIT)',
      'dutsso (yuanyuanzijin)',
      'pub-docs (zfman, 青果接口文档)',
      'eduData-GoBack (huhu415)',
      'NUISTTable (zyc-816)',
      'SCAU-Grad-Automatically-Fill-Evaluation-Form-JS (jiefing, Gwork 族控件命名旁证)',
    ].join('\n'),
  },
  {
    id: 'school-four-school-jw', title: '四校教务协议交叉验证（2026-09）', usage: [
      'NWUPL: dream2333/NWUPL-Pure-EMS (间接协议旁证)',
      'LIXIN: classic EAMS 采集形态（未复制代码）',
      'KMUST: linling-zy/kust-schedule (间接协议旁证, Apache-2.0)',
      'NUIT: 3056810551/nuit-class-schedule (直接字段旁证, 未复制代码)',
    ].join('\n'),
  },
  {
    id: 'school-hzcu', title: '浙大城市学院 HZCU', usage: [
      '用户采集包实锤 zf_new 协议 (新正方 zftal-ui-v5 裸 /kbcx/ 路径, SSO /sso/ddlogin 专用入口, issue #90)',
      'qiqqqqq517/shangkeschedule (Apache-2.0, 该校 zhengfang_new 条目互证)',
      'Xu-Jack11/MySchedule (MIT, 同端点直接旁证)',
      'LanternCX/HZCUCourseChoose (MIT, 选课端点旁证)',
    ].join('\n'),
  },
]
