/**
 * pinyin — util/PinyinMatcher.kt 1:1 移植 (零依赖拼音首字母搜索)。
 * BASIC_MAP 表体由 Kotlin 源机械转换 (重复字取首次出现), 未增删条目。
 * Android 运行时同样不依赖任何拼音库: 全拼排序靠 schools.json 预生成的 sortKeyFull,
 * 本表只负责「拼音首字母」匹配 (如输入 hrbeu / ahdx 命中校名)。
 */

import type { SchoolInfo } from './schools'

/** 汉字 → 拼音首字母 (大写);表外汉字为 undefined */
const INITIALS: Record<string, string> = {}

function addLetter(letter: string, chars: string): void {
  for (const ch of chars) INITIALS[ch] = letter
}

addLetter('A',
  '哎唉啊埃安挨昂暗澳爱矮袄阿'
)

addLetter('B',
  '不丙伯便保倍傍八兵冰别办勃包北半卑博卞变壁备奔宝宾巴币布帛帮并彪彬必悲憋扁报抱搏搬播斌本板柄标棒榜步比毕波渤滨版狈玻病白百碑碧秉笔笨编背膀菠蔽薄蚌表豹贝贬辈辟辨辩边遍避邦闭鞭饱饼驳'
)

addLetter('C',
  '丑产从仓传侧倡储充册冲出创初厂参叉吃吵唱场城处存宠层崇崔川巢常彩彻惨惩慈成才承抄拆撤操昌春曹朝材查柴楚橱此池沉沧测潮澄灿猜磁称程策筹纯缠耻臣舱苍茶草菜虫裁触词诚财超车迟采重错长闯阐陈除颤驰'
)

addLetter('D',
  '丁东丹代但低冬到动单地多大定对带当得德懂打段灯点电的短端第等读调达迪道都'
)

addLetter('E',
  '二俄儿娥尔峨恩而耳额饿鹅'
)

addLetter('F',
  '付佛凤分副反发复富封府房扶放方服法福翻阜防非风飞饭'
)

addLetter('G',
  '个光公共关功古各告哥国够官工广戈故更果格桂歌甘管给观贵跟过顾高'
)

addLetter('H',
  '互会何侯函划化卉华号合后呼和哈唤回坏好孩宏害寒弘很徽怀悍惠惶慌或户换晖杭桓桦槐横欢汇汉沪河泓洪活浩海淮湖湟滑潞火煌环珲琥画红翰航花获菏虎虹行话豪贺赫辉还邯韩骅鹤黄黑'
)

addLetter('J',
  '举九井交京今介件价佳俊借倦假健具军决净减剑剧加卷句叫吉嘉均坚基境奖姐家寄将尖就尽局居届峻巨巾建惊戒截技拒据捷掘接救教敬旧晋景晶暨杰架检橘江洁津济浸焦狡甲疆监睛睫矩礁禁究竞竭简箭精紧纪经结绝继聚胶舅茎荐菊蒋蕉街见觉角解警计记讲距轿较近进酒酱金鉴镜间阶降集靖静颈驾鲸'
)

addLetter('K',
  '况凯刻口可哭喀客宽开快昆渴看矿科空肯苦酷靠'
)

addLetter('L',
  '两临丽乐乱了亮令六兰冷凉列利力劳勒卵历另岭廉廊录律懒拉捞料旅朗来林柳栗梁楼洛流浪滤漏灵理离立笼篮粮累练绿罗老聋联脸良莱莲落蓝螺论路轮辽连邻里量陆陇陵隆零雷领鹿龙'
)

addLetter('M',
  '买亩们免冒勉名吗命墨妈妙妹密幕庙弥忙慕慢描摩敏明曼木末某梅梦棉模母每毛民没满漠漫灭煤牡猛猫玛盟目磨秒秘穆米绵美膜芒苗茂茅茫莫萌蒙蜜谋贸门陌面马魔鸣麦麻默'
)

addLetter('N',
  '乃你内农凝努南呢哪囊奈女奴妮娘宁尼尿年弄念怒恼您扭拿捏暖泥牛男纳能脑诺那酿闹难鸟'
)

addLetter('O',
  '偶哦欧'
)

addLetter('P',
  '乒佩偏凭判匹品喷坡培婆屏帕平庞彭怕扑批抛披拍拼排旁普朋朴泡泼派漂潘炮爬片牌瓶疲皮盆盘盼破碰票篇聘胖膨苹萍葡蓬评谱贫赔跑配铺陪飘骗魄'
)

addLetter('Q',
  '七且亲企侵全其切前劝勤区千却去取启器圈墙奇契巧庆弃强悄情抢拳旗晴曲期权枪桥歧气求汽泉浅清漆潜犬球琴砌确禽秋穷签缺群茄裙请起趋轻迁钱青驱齐'
)

addLetter('R',
  '乳人任入嚷壤如容弱忍惹扔扰日染柔润热然燃瑞绕肉若荣认让软饶'
)

addLetter('S',
  '三上世丝书事伤使侍剩势十升双受史司售商善四塞士声失始孙守宋实审室宿寿少尚山岁市师式思所手扫损授搜收散数施时是术杀束松树桑森水沈沙深熟生盛省石示社神算素索绍缩色苏萨蛇视设识诉试诗说谁赏输送适速酸释锁随顺饰首'
)

addLetter('T',
  '亭他体倘停偷兔台叹同吐听唐团图土坦塔填天太头套她徒态托投挑挺探推摊条汤泰涂涛潭炭特甜田痛突童糖统脱腾腿谈跳躺退透通铁铜'
)

addLetter('W',
  '万为乌五亡伍伟位务午卧卫味围外委完尾弯往微忘我挖握文无晚武沃温湾物王玩瓦皖窝网翁腕芜误违问闻雾'
)

addLetter('X',
  '下习乡些休侠信修像兄先兴写协厦向吸咸响喜型夏夕姓嫌孝学宣寻小巡巷希席幸弦形心性息悉悬惜想掀效斜新旋星显晓杏校橡欣歇洗消湘溪熙现相瞎秀稀穴笑箱系纤线细绣绪续肖胸膝芯萧虚虾蟹血袖袭襄西讯许详谢象贤辛迅选邢邪醒锡闲限险雄雪需项香鲜'
)

addLetter('Y',
  '一与业严义也于云亚以仪仰优余依倚允元养勇医印压厌原又友右叶呀咽因圆域夜央姨娱宇宜宴尤岩已幼幽应异引影忧悠意愿扬抑拥易映月有杨样欲永沂油沿洋液游源演烟爷牙玉用由疑盐眼矣研硬移约羊翼耀育艺英蚁衣要言议译越运远遇遗野钥银阅阳阴院隐雨音页预颜验鱼'
)

addLetter('Z',
  '丈专中主之争仔众住作侦债再准则制助占只周哲嘴噪在址坐增壮奏姿子字宅宗尊展州左庄张志忠怎总扎找抓折招择指振掌摘支政整早昨昼智暂最杂枝栽桌正治注泽洲涨渣灾照状猪珍症皱真着知祝种站章竹筑糟紫纵纸组织终置者自至致舟芝著装证诊诸账质资赞赠走足转轴这追逐造遭遮遵郑针钟镇闸阵阻驻骤'
)

/** 单字首字母 — firstLetterOf(ch);非 CJK 基本区汉字或表外字返回 null */
export function firstLetterOf(ch: string): string | null {
  const code = ch.codePointAt(0) ?? 0
  if (code < 0x4e00 || code > 0x9fa5) return null
  return INITIALS[ch] ?? null
}

/** namePinyinShort — sortKey 单字母前缀 + 逐字首字母 (ASCII 字母数字原样小写) */
export function namePinyinShort(name: string, sortKey: string): string {
  let out = ''
  if (sortKey.length === 1 && /[a-zA-Z]/.test(sortKey)) out += sortKey.toLowerCase()
  for (const ch of name) {
    if (/[a-zA-Z0-9]/.test(ch)) out += ch.toLowerCase()
    else {
      const fl = firstLetterOf(ch)
      if (fl) out += fl.toLowerCase()
    }
  }
  return out
}

/** match — name 子串 / aliases 子串 / 拼音首字母子串, 任一命中即为真 */
export function matchPinyin(
  name: string,
  sortKey: string,
  query: string,
  aliases: readonly string[] = []
): boolean {
  if (!query.trim()) return true
  const q = query.trim().toLowerCase()
  if (name.toLowerCase().includes(q)) return true
  if (aliases.some((a) => a.toLowerCase().includes(q))) return true
  return namePinyinShort(name, sortKey).includes(q)
}

/** 过滤 + 排序 — SchoolSelectScreen.kt filtered: 拼音匹配后, alias 全等者置顶 */
export function filterSchools(schools: readonly SchoolInfo[], query: string): SchoolInfo[] {
  if (!query.trim()) return [...schools]
  const q = query.trim().toLowerCase()
  return schools
    .filter((s) => matchPinyin(s.name, s.sortKey, query, s.aliases))
    .sort((a, b) => {
      const aHit = a.aliases.some((x) => x.toLowerCase() === q)
      const bHit = b.aliases.some((x) => x.toLowerCase() === q)
      return Number(bHit) - Number(aHit)
    })
}
