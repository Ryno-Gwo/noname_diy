# 无名杀扩展 · 开发参考文档

> **简介**：本文档记录 `noname_diy` 扩展（作者 Ryno-Gwo，版本 v1.0）内全部角色技能的设计点、实现方式与所用无名杀（Noname）引擎 API，供后续开发与 AI 对话参考。对应代码：`extension.js`。随实现演进持续更新。

---

# 0. 总览

## 0.1 结构骨架

### 0.1.1 扩展结构

```js
import { lib, game, ui, get, ai, _status } from "noname";
export const type = "extension";
export default function () {
  return {
    name: "noname_diy",          // 扩展名（目录名）
    editable: true, connect: false,
    arenaReady() {}, content() {}, prepare() {}, precontent() {}, help: {}, config: {},
    package: {
      character: { character: { 角色名: {...} }, translate: {...} },
      card:      { card: {}, translate: {}, list: [] },
      skill:     { skill: { 技能名: {...} }, translate: {...} },
    },
    files: { character: [...图], card: [], skill: [], audio: [] },
  };
}
```

角色定义字段：`sex` 性别 / `group` 势力 / `hp` 当前体力 / `maxHp` 体力上限 / `hujia` 护甲 / `skills` 技能数组 / `img` 立绘 / `dieAudios` 阵亡语音。

### 0.1.2 技能结构

**普通技能模板：**

```js
"技能名": {
  audio: "ext:noname_diy:2",        // 音频（:2 数字=默认语音）
  trigger: { global: "xxx", player: ["a","b"], source: "c", target: "d" },
  filter(event, player, name) { ... },    // 是否触发；name = 具体触发时机名
  direct: true,                            // 无 cost，content 内自行询问
  forced: true, locked: true,
  group: ["附属A"],                        // 把附属技能挂到主技能名上触发
  subSkill: { ... },                       // 附属技能（trigger/filter/content 独立）
  mod: { maxHandcardFinal(player) {...} }, // 常驻修正
  async cost(event, trigger, player) {...},   // 询问层
  async content(event, trigger, player) {...},// 执行层
  ai: { effect: {...} },                   // AI 价值修正
  intro: {...},                            // 标记展示
  onremove(player, skill) {...},           // 技能被移除时清理
  "skill_id": "技能名", "_priority": 0,
}
```

**附属技能模板**（`subSkill` / `group` 里的）：

```js
"主技能_附属": {
  sub: true,
  sourceSkill: "主技能",
  charlotte: true,            // 纯辅助/无实际效果
  trigger: { global: "xxx" },
  filter(event, player, name) { return true; },
  async content(event, trigger, player) { /* ... */ },
  onremove(player, skill) { /* 清理 */ },
  intro: { content: "..." },
  "skill_id": "主技能_附属",
  "_priority": 0,
}
```

## 0.2 其他

- **音频写法**：`audio: "ext:扩展名:2"`（数字=默认语音档位）；角色阵亡语音 `dieAudios: ["ext:扩展名/audio/die/角色名.mp3"]`。
- **`skill_id` 与 `_priority`**：技能对象末尾固定写 `"skill_id": "技能名"`（保持 ID 稳定）与 `"_priority": 0`（触发/修正优先级，数值越大越靠后执行）。
- **附属技能命名约定**：`主技能_用途`。本扩展出现过的后缀：`_rescue`（救场）、`_put`（全局放置）、`_use`（虚拟使用）、`_used`（本回合已用标记）、`_lock`（锁技能载体）、`_mark`（标记展示载体）、`_backup`（chooseButton 后备技能）、`_negate`（令牌对己无效，疑城②）、`_effect`（"下一张牌"待生效增益载体，恣胜）、`_aura`（持续光环载体，豪贤）。
- **三大核心机制**：
  1. **标记牌（扩展区）**：牌置于武将牌上（`addToExpansion`），按 gaintag 名区分类型（"归訫"/"煋"/神徐盛"疑兵"牌，其 gaintag 为"疑城"），可被全场角色读取花色、被当作虚拟牌使用。
  2. **技能来源追踪**：`player.storage.夺魂_sources = {技能名: 来源角色或"武将牌堆"}`，魂契③从角色偷技记来源角色，夺魂①观堆取技记哨兵字符串 "武将牌堆"，供魂契③与夺魂的代价共用（失去时 `delete`）。
  3. **死亡后复活**：`global:"_saveAfter"`（求桃失败、正式死亡前）触发，`recoverTo(1)` 拉回 1 血即可阻止死亡结算。
- **AI 基调**：`get.attitude(a,b)` 好感度（>0 友 / <0 敌）是所有 AI 决策的基础；`charlotte` 类技能视为可轻易舍弃的"鸡肋技"。

## 参考角色与技能一览

| 角色 | 技能（含附属） | 定位 / 主题 |
|------|----------------|------------|
| 神张辽（shen，1/5） | 魂契、夺魂、迅袭、止涕 | 体力上限↔技能/手牌的资源流转（回合开始偷技 + 死亡时观武将牌堆取技/丢技摸2/弃牌解封）+ 迅袭减上限补刀 + 打伤害换上限/封技/恢复失效技 |
| 神曹操（shen，3/3） | 归訫（归訫2/归訫_put/归訫_use）、飛影 | 卖血 + 标记牌（扩展区）+ 虚拟用牌 |
| 神诸葛（shen，3/3） | 七煋（七煋_mark）、相天（相天2）、神机（神机_used） | 观牌堆定序 + 花色联动 |
| 神徐盛（shen，5/5） | 疑兵（觉醒技）、疑城（疑城_skip / 疑城_negate）、破军 | 觉醒成长 + "疑兵"资源（跳过摸牌+弃牌囤积 / 无效化换牌）+ 破军无距离次数/不可响应/目标扩张 |
| 应天司马懿（shen，4/4） | 戢鳞、英猷（英猷_seal/英猷_skip）、应天（觉醒技）、倾朝 | "志"资源管理 + 花色联动 + 觉醒后鬼才/完杀/连破 |
| 神冶（shen，4/4） | 冶武、炼刃、穷兵 | 武器栏增减经济 + 弃装备牌抉择（拿牌/伤害）+ 濒死保命 |
| 神傀（shen，4/4） | 傀体、百战、移魂 | 傀儡机制：受击反制 + 被指定赚牌 + 锦囊到手即弃换续航 + 无限用牌 + 使用杀以体力为燃料 + 流离式目标转移 |
| 武张飞（shen，4/4） | 恣胜（恣胜_effect）、显略、豪贤（豪贤_aura） | 点数3引擎：倍数≤i全档依次触发+1倍获得目标牌 + 依次展示博弈两分支+②上限+1（usable 动态标记限次） + 限定技光环（指定点数满档，X=显略上限） |
| 神左慈（shen，4/4） | 幻魂、幻劫、幻生 | 技能池引擎：任意角色受伤四向抉择（摸牌/弃牌回复伤者/观堆滚池配额=体力上限看5张/弃池封敌）+ 游戏开始与轮末可选"失去1体力对一名其他角色造成1点伤害" + 死亡时弃一个所得技复活濒死者 |

---

# 1. 通用API

## 1.1 时机相关（trigger）

- `global`：全场任意角色触发（`gameStart`/`phaseBegin`/`useCard`/`dying`/`damageSource`/`_saveAfter`…）
- `player`：仅技能拥有者自身（`phaseBegin`/`changeHp`/`phaseEnd`…）
- `source` / `target`：作为伤害来源 / 目标时（`damageSource` / `useCardToTarget`…）
- 多时机用数组：`player: ["phaseBegin", "phaseEnd"]`
- ⚠️ **filter 的第三个参数 `name` = 具体触发时机名**（多时机必用，见七煋/相天/飛影）
- ⚠️ `trigger.player`（事件主体）与 `player`（content 第一个参数 = 技能拥有者）是**两个不同概念**
- ⚠️ **`_saveAfter`（求桃结束后、正式死亡前）**：濒死角色在 `event.dying`（不是 `event.player`，后者会随求桃轮换）——"死亡后复活"的落点

## 1.2 玩家行为（player.*，作用于技能拥有者自身）

| API | 作用 |
|-----|------|
| `loseHp()` / `gainMaxHp()` / `loseMaxHp()` | 扣血 / 加上限 / 减上限 |
| `recoverTo(1)` | 回复到指定体力（复活/救场专用） |
| `draw(n)` | 摸 n 张 |
| `turnOver()` / `link()` | 翻面 / 横置 |
| `addSkills(list)` / `removeSkill(s)` / `hasSkill(s)` / `addTempSkill(s, time)` | 技能增删查 / 临时技能 |
| `addMark(n, count, false)` / `countMark(n)` | 标记（第三个参数 false = 不打动画） |
| `addToExpansion(cards, from?, type?)` | 置于武将牌上（扩展区） |
| `addGaintag(card, tag)` / `markSkill(name)` | 给扩展牌打标记 / 刷新标记显示 |
| `markAuto(name, data)` / `getStorage(name)` / `storage.xxx` | 技能数据存储 |
| `logSkill(name, target?)` / `line(target, color)` | 技能气泡 / 连线特效 |
| `gainPlayerCard({target, position, selectButton, prompt, ai})` | 获得其区域一张牌 |

## 1.3 其他玩家行为（playerX.*，作用于 target / source / holder 等其他玩家对象）

与 1.2 是**同一套方法**，只是调用对象换成其他玩家（`target`、`trigger.player`、`trigger.source`、`game.findPlayer(...)` 返回的 `holder` 等）。本扩展的典型用法：

| 用法 | 场景 |
|------|------|
| `target.recoverTo(1)` | 夺魂_rescue 复活死亡角色 |
| `target.loseMaxHp()`（`while` 循环可降到 1） | 止涕② 降目标上限 |
| `target.disableEquip(slot)` / `target.hasEnabledSlot(slot)` / `target.getEquip(n)` | 止涕① 废除装备栏 |
| `target.removeSkill(s)` / `target.addSkill(s)` / `target.addTempSkill(s, time)` | 止涕③ 锁/解技能；相天2 临时防伤 |
| `target.addToExpansion(cards, from, "give")` / `target.addGaintag(card, tag)` / `target.markSkill(name)` | 七煋 移"煋"给他人 |
| `target.loseToDiscardpile(card)` | 相天 移去他人"煋" |
| `holder.chooseBool(...)` / `holder.chooseControl(...)` | 归訫_put 拥有者决定是否摸牌 |
| `trigger.source.addMark(name, n)` | （官方冯河示例）给伤害来源打标记 |

⚠️ **获取其他玩家对象**见 1.5.2。

## 1.4 询问/选项（均为 Promise，须 `await x.forResult()`）

| API | 用途 | 结果字段 |
|-----|------|---------|
| `player.chooseBool(prompt, prompt2)` | 是与否 | `{bool}` |
| `player.chooseControl(controls)` | 文字选项按钮 | `{control}` ⚠️无 bool，用 `control==="cancel2"` 判取消 |
| `player.chooseButton([prompt,[list,"skill"|"card"|"vcard"]], select?, cancelable?)` | 列表/牌选择 | `{bool, links}` |
| `player.chooseTarget(prompt, prompt2?, filter, [min,max]?)` | 选角色 | `{bool, targets}` |
| `player.chooseCard(prompt, cancelable?, filter?)` | 选牌 | `{bool, cards}` |
| `player.chooseCardTarget({...})` | 选牌+目标 | `{bool, cards, targets}` |
| `player.chooseToMove()` | 拖动排序 | `{bool, moved}` |
| `player.chooseUseTarget(vcard, true, false)` | 视为使用（自动选目标/结算） | — |

通用链式：`.set("ai", fn)` 设 AI、`.set("prompt",...)`/`.set("prompt2",...)`/`.set("choiceList",...)`/`.set("filterCard",...)` 等追加参数。

**AI 内取上下文：**
- `_status.event.player` → 当前选择者
- `_status.event.getTrigger()` → 当前 trigger
- `_status.event.controls` → chooseControl 可用选项（AI 只能返回其中一项）
- `_status.currentPhase` → 当前回合角色

## 1.5 信息/对象获取

### 1.5.1 玩家自身信息/对象

| API | 作用 |
|-----|------|
| `hp` / `maxHp` / `hujia` | 体力 / 体力上限 / 护甲 |
| `getHp()` / `getDamagedHp()` | 当前体力 / 已损失体力值（maxHp - hp） |
| `getExpansions(tag)` | 按 gaintag 名取扩展区牌（"归訫2"/"七煋"） |
| `countCards(pos)` / `hasCards(pos)` / `getCards(pos)` | 区域牌（pos: `"h"`/`"e"`/`"j"`/`"hej"`） |
| `countMark(name)` / `getStorage(name)` / `storage.xxx` | 标记数 / 技能存储 |
| `hasSkill(s)` / `isIn()` / `isDead()` / `isDying()` / `isUnderControl()` | 状态判断 |
| `getEquip(n)` / `hasEnabledSlot(n)` | 装备栏状态 |

### 1.5.2 其他玩家信息/对象（指定角色 / 目标角色 / 所有其他角色）

**获取对象：**

| API | 作用 |
|-----|------|
| `trigger.player` / `trigger.source` | 事件主体 / 伤害来源 |
| `event.dying` | `_saveAfter` 时的濒死角色 |
| `event.targets` / `event.target` | 目标列表 / 单目标 |
| `game.filterPlayer(fn)` | 返回满足 fn 的所有角色 |
| `game.findPlayer(fn)` | 返回第一个满足 fn 的角色（如找归訫拥有者 `holder`） |
| `game.countPlayer(fn)` / `game.hasPlayer(fn)` | 计数 / 是否存在 |
| `game.me` / `game.players` / `game.dead` | 玩家自身 / 存活列表 / 死亡列表 |

**对目标的信息查询**：与 1.5.1 同一套方法，作用在目标上即可（`target.getExpansions("七煋")`、`target.countCards("e")`、`target.hasSkill(...)`…）。另：`get.translation(target)` 获取显示名，`get.attitude(me, target)` 获取好感度。

### 1.5.3 全局的信息/对象（游戏轮数等）

| API | 作用 |
|-----|------|
| `game.phaseNumber` | 当前回合序数（0 = 游戏开始前） |
| `game.updateRoundNumber()` | 牌堆动后刷新回合数 |
| `lib.character[名][3]` | 角色技能数组（name/name1/name2 三槽，见夺魂.getSkills） |
| `lib.skill[技能名]` | 技能定义对象（可挂自定义辅助函数：getSkills/getStolenSkills/gainFromPile/hasGuixin） |
| `lib.inpile` / `lib.card` / `lib.filter` | 牌堆牌名 / 卡牌定义 / 通用过滤 |
| `_status` / `_status.event` / `_status.currentPhase` | 全局状态 / 当前事件 / 当前回合角色 |

**全局工具函数（get.\*）：**

| API | 作用 |
|-----|------|
| `get.prompt(skill, target?)` / `get.prompt2(skill, target?)` | 技能询问文案 |
| `get.translation(x)` / `get.cnNumber(n)` | 翻译 / 中文数字 |
| `get.info(skill)` | 技能信息（`info.charlotte`、`info.ai.combo`…） |
| `get.attitude(a, b)` | 好感度（>0 友 / <0 敌 / 0 中立） |
| `get.suit(card)` / `get.type2(name)` / `get.tag(card,"damage")` | 花色 / 类型 / 标签 |
| `get.value(card, owner?)` / `get.useful(card, owner?)` / `get.buttonValue(btn)` | 牌价值 |
| `get.autoViewAs({name, nature}, cards?)` | 构造虚拟牌 |
| `get.inpileVCardList(filter)` | 牌堆内可虚拟的牌列表 |
| `get.cards(n)` | 取牌堆顶 n 张 |
| `get.position(card)` | 牌位置（`"h"`/`"e"`/`"j"`/`"d"`） |

## 1.6 事件/效果控制

- `trigger.cancel()`：取消事件（防伤 / 无效化）
- `trigger.targets.length = 0; trigger.all_excluded = true;`：令牌"无目标"（无效化）
- `trigger.insertAfter(fn, {player})`：事件结算**结束后**再执行（神机"再次使用"）
- `event.cost_data`：**cost 里选的选项不会自动传给 content**，需 `event.result.cost_data = ...` 手动传递
- `event.changedHp`（changeHp）：扣除护甲/封顶后的实际变化值；配合 `getIndex` 控制"每点触发一次"
- `event.triggername`：content 里取具体触发时机名
- `mod` 修正（常驻生效）：`maxHandcardFinal(player){...}` 手牌上限硬锁、`globalTo(from,to,distance){...}` 距离修正

## 1.7 其他

- `game.log(...)`：战报日志（`game.log(player, "做", x, "了")`）
- `ui.create.dialog(title, list)`：弹窗；`ui.cardPile.insertBefore(card, firstChild)`：插回牌堆顶
- `game.delayx()`：延迟等待动画
- 响应/隐藏牌支持：`hiddenCard(player, name)`、`skillTagFilter(player, tag, arg)`、`ai:{respondSha, respondShan, fireAttack, order, result}`

---

# 2 参考角色与技能

## 2.1 神张辽

### 2.1.0 魂契

**文案：**
> 锁定技。①当你的体力值增加后，若其大于1，你失去X点体力（X为你增加后的体力值-1），然后增加X点体力上限。②你的手牌上限始终等于体力上限。③游戏或你的回合开始时，你获得一名其他角色的一个技能。

**设计点：**
1. 体力值增长的"自动转化器"：体力一旦超过1，多余部分立即转化为体力上限。
2. ③（原夺魂①并入并改为强制发动）：开局即获得一个技能作为成长起点，不再付体力上限代价；来源角色与具体技能仍由玩家自选，且每个自己的回合开始都能再取一个。偷到的技能记入 `夺魂_sources`，直接为夺魂②的选项2提供"来源技能"资源。
3. 与夺魂的"减上限换技能"形成闭环：魂契不断积累上限 → 夺魂消耗上限观武将牌堆取技。
4. ②手牌上限硬锁 = 体力上限。

**实现要点：**
- **触发**：`trigger:{player:["changeHp","phaseBegin"], global:"gameStart"}`——多时机共用一个技能，`filter` 用第三个参数 `name` 区分（踩坑#23），content 用 `event.triggername` 分支。
- **①filter**：`event.num > 0 && player.hp > 1`；**③filter**：存在拥有你未持有技能的其他角色才触发（避免无意义弹泡）。
- **锁定技**：`locked:true` + `forced:true`，自动发动无需询问。
- **content ①**：计算 `X = player.hp - 1` → `loseHp(X)` → `gainMaxHp(X)`。loseHp 会再次触发 changeHp，但此时 `event.num < 0` 不满足 filter，不会循环。
- **content ③**：`await lib.skill.夺魂.stealSkill(player)`——强制选目标、强制选技能、`addSkills` 并写入 `夺魂_sources`（来源角色）。
- **手牌上限硬锁**：`mod:{maxHandcardFinal(player){ return player.maxHp; }}`——用最高优先级层，避免被偷来的 maxHandcardBase 覆盖（同原夺魂③）。
- 注：content 里旧的手动 `player.logSkill(event.skill)` 为静默无效调用（event.skill 为 undefined，见踩坑#30/#46），已随本次改版移除，弹泡由引擎自动调用。

**关键 API：** `changeHp` / `phaseBegin` / `gameStart` / `event.triggername` / `forced` / `locked` / `loseHp` / `gainMaxHp` / `mod.maxHandcardFinal` / `lib.skill.夺魂.stealSkill`（addSkills + 来源记录）。

---

### 2.1.1 夺魂

**文案：**
> 一名角色死亡时，你可以选择一项并令其回复体力值至1点：1、若你的体力上限大于1，你减少1点体力上限，观看武将牌堆的X张牌并获得其中一个技能（X为场上角色数且至少为3）；2、失去一个来源于其他角色或武将牌堆的技能并摸两张牌；3、弃一张牌并恢复一个失效技能。

**设计点：**
1. 原情况A（gameStart 减上限偷技）并入魂契③并改为强制发动（不再付上限代价）；本技能只剩"死亡时救场"一个触发。
2. **救场（_saveAfter）**：求桃失败后兜底，"选择一项并令其回复体力值至1点"——**减上限观武将牌堆取技**（X = 场上角色数且至少为3；2026-10 四次改版：参考神左慈【幻魂】选项3，从"偷一名其他角色的技能"改为"观武将牌堆取技"，来源记哨兵字符串）或**丢一个来源技（角色来源或武将牌堆来源均可）并摸两张牌**（2026-10 五次改版：选项2从"对一名其他角色造成一点伤害"改为"摸两张牌"，纯收益）。
3. 选项2摸牌为纯收益，不再经伤害联动止涕；救友军成本更低，救自己（自杀式濒死）同样成立。
4. 选项1可行性 = 上限>1 且武将牌堆有你可获得的技能；选项2可行性 = 持有至少1个来源技（角色来源或武将牌堆来源）；选项3可行性 = 有牌可弃且存在可恢复的失效技能。皆不可行时天然安全锁。
5. **选项3（2026-10 七次改版）**：弃一张牌并恢复一个失效技能——反制破怠（hm_podai）这类"封锁/禁用仍持有的技能"的效果。**"失效"口径**：技能仍在武将牌上但不生效（被 `disableSkill` 禁用，或被 `skillBlocker` 封锁器锁住，见踩坑#62）；夺魂/魂契拿到又失去的技能是 `removeSkill` 移除、不在失效池，**不可恢复**；觉醒技的觉醒封锁（`awakenedSkills`）同样排除。

**实现要点：**
- **触发**：`trigger:{global:"_saveAfter"}`，`forced:true` + `locked:true`。filter 判 `event.dying.isIn() && event.dying.isDying()`，不排除自己（可自救）；选项1/3可行性并入 filter（选项1：`maxHp>1 && getPileCandidates().length>0`；选项3：`countCards("he")>0 && getRestorableSkills().length>0`），避免空弹泡。
- **⚠️ 不能用 `group`**：若用 `group:["夺魂_rescue"]` 分离救人逻辑，引擎会用子技能的 trigger 覆盖主技能的 trigger（见踩坑记录#28）。
- **流程**：`chooseControl`（可行选项动态拼入 + `cancel2`）→ 对应效果 → `recoverTo(1)`。
  - 选项1：`loseMaxHp` → `await lib.skill.夺魂.gainFromPile(player, pileNum)`，`pileNum = Math.max(3, game.countPlayer())`（X = 场上角色数且至少为3；`randomGets` 自动截断越界）。
  - 选项2：`chooseButton` 选要失去的来源技 → `removeSkill` + `delete 夺魂_sources` → `draw(2)`。
  - 选项3：`chooseToDiscard("he", true, 1, ...)`（弃一张牌，同幻魂②写法）→ `await lib.skill.夺魂.restoreDisabledSkill(player)`（强制单选要恢复的技能）。
- **复活**：`await target.recoverTo(1)`（在 `_saveAfter` 内拉回 1 血即可阻止后续 die；两选项共用——"选择一项后"任一选项执行即成立）。
- **偷技辅助 `stealSkill(player)`**（魂契③专用）：强制 `chooseTarget`（其他角色 ∩ 有你未持有的技能）→ 强制 `chooseButton` 选技能（AI 避开 charlotte 鸡肋技）→ `addSkills` → 逐技写入 `player.storage.夺魂_sources[技能] = 来源角色`。
- **观堆取技辅助 `gainFromPile(player)`**（选项1专用，同幻魂选项3但不入幻魂池）：候选 = 剩余武将牌堆中拥有"你可获得技能"的武将（`_status.characterlist`，未初始化则 `game.initCharacterList()`，场上角色已被剔出牌堆）；来源记哨兵字符串，不与任何玩家对象相等，`getStolenSkills` 的 `map[skill]!==player` 判定照常纳入。
- **技能来源追踪**：`player.storage.夺魂_sources = {技能名: 来源角色或"武将牌堆"}`；获得时写入，失去时 `delete`。
- **辅助函数**（挂在技能对象上，供魂契/夺魂共用）：
  - `getSkills(target)`：取角色技能（兼容 name/name1/name2 主公技槽）
  - `getStolenSkills(player)`：`Object.keys(map).filter(s => map[s]!==player && player.hasSkill(s))` —— 当前拥有的"来源技能"（角色来源 + 武将牌堆来源）
  - `stealSkill(player)`：偷技交互（选目标 → 选技能 → 记录来源）
  - `getPileCandidates(player)`：剩余武将牌堆中拥有"你可获得技能"的武将列表（同幻魂.getPileCandidates）
  - `gainFromPile(player, num = 5)`：观堆取技交互（观X张 → 选武将 → 选技能 → 记录哨兵来源）
  - `getDisabledSkills(player)`：失效池＝`getSkills(null,false,false)`（原始，第三参关过滤）与 `getSkills(null,false,true)`（过滤后）的差集——`game.filterSkills` 只剔 `disabledSkills` 与封锁，差集恰为"失效但仍拥有"；已 `removeSkill` 移除的不在池内；排除 `awakenedSkills`（觉醒封锁不可恢复）
  - `canRestoreSkill(player, skill)`：`disabledSkills` 型恒可解；skillBlocker 型仅当封锁器以 storage 数组记封锁名单（破怠式）可解，动态条件封锁不可
  - `getRestorableSkills(player)`：失效池 ∩ 可恢复
  - `restoreSkill(player, skill)`：精确反操作——`game.expandSkills([技能])` 展开子技树逐条目 `delete disabledSkills[t]`（不能 `enableSkill(禁用者)`，那是按禁用者全局解）＋ 从各封锁器 storage 名单 `remove`（清空则 `removeSkill(封锁器)`）＋ 有 mark 则 `markSkill` 补挂 ＋ `clearStepCache`
  - `restoreDisabledSkill(player)`：选技交互（强制单选，AI 优先核心技/连协技）→ `restoreSkill`，返回是否恢复（夺魂③/止涕③共用）
- **AI**：对濒死角色好感度 ≤0 则取消（救自己除外）；上限>2 优先扣上限，其次（有核心技/连协技可恢复时）选③弃牌解封，否则丢来源技能（优先丢 `info.charlotte` 的鸡肋技）+ 摸2。

**关键 API：** `forced` / `locked` / `_saveAfter` / `chooseControl` / `chooseButton([... , "skill"])` / `chooseButton([list, "character"])` / `loseMaxHp` / `draw` / `chooseToDiscard` / `game.countPlayer()` / `recoverTo` / `addSkills` / `removeSkill` / `hasSkill` / `storage` / `get.prompt` / `get.attitude` / `_status.characterlist` / `game.initCharacterList()` / `randomGets` / `_status.event.getTrigger()` / `getSkills(null,false,false|true)` / `disabledSkills` / `storage.skill_blocker` / `get.is.blocked` / `game.expandSkills` / `awakenedSkills` / `clearStepCache`。

---

### 2.1.2 迅袭

**文案：**
> 一名其他角色使用牌对唯一目标造成的伤害结算结束后，若你的体力上限大于1，你可以减少一点体力上限，然后对其或目标造成一点伤害。

**设计点：**
1. 上限换直伤的事后追责技（2026-10 二次改版：时机从"造成伤害时"改为"伤害结算结束后"，仍限定"使用牌"）：任意其他角色用牌对唯一目标造成伤害并结算完毕后，付1上限补1刀——可打伤害来源（惩罚出牌者），也可打受伤目标（补刀/压制）。结算后才触发，即使该伤害击杀了目标，仍可对来源追责。
2. 与止涕联动：迅袭的直伤来源为自己、目标是其他角色，必触发止涕（加上限回补或封技）——上限支出可经止涕选项1回补，形成"减1上限→打1伤害→回1上限"的循环。
3. 可选触发（"可以"）：AI 只在来源或目标为敌方时才值得付上限。

**实现要点：**
- **触发**：`global:"damageAfter"`（伤害结算后时机——damage 事件 content 完成后由事件系统 afterTrigger 触发，濒死结算已结束；官方 boss/chess/single 等模式广泛使用；注意与止涕的事件内时机 `damageSource` 区分），`prompt` 属性交由引擎自动弹 chooseBool（踩坑#31），AI 用 `check`。
- **filter 链**：`maxHp > 1`（代价校验）→ `event.source` 存在、非自己且存活（"一名其他角色使用牌"）→ `event.card` 存在（"使用牌"，技能直伤无牌不算）→ `getParent("useCard")` 存在且 `targets.length === 1`（"对唯一目标"，南蛮/万箭等 AOE、方天画戟多方杀均排除）→ `event.num > 0`（0点伤害不算"造成伤害"，同幻魂）。⚠️ `getParent` 按名找不到父事件时返回**空对象 `{}`（truthy）**（`gameEvent.js` 的 `toreturn = forced ? void 0 : {}`），故用 `!useCard || !Array.isArray(useCard.targets)` 判定，不能只判 `useCard` 真值。
- **content**：候选 = `[source, victim]` 去重（闪电自伤时二者合一）∩ 存活（结算后受伤者可能已死于该伤害，此时仅剩来源可追责；候选为空直接返回不支付）→ `loseMaxHp()`（先支付后结算）→ 强制 `chooseTarget`（候选内）→ `target.damage(1, player)`（技能直伤，来源为自己）。
- **AI**：`check` 判来源或目标好感度 <0 才发动；chooseTarget 选好感度最低者。

**关键 API：** `global:"damageAfter"` / `trigger.source` / `trigger.card` / `trigger.num` / `getParent("useCard")` / `prompt` + `check`（可选触发技） / `loseMaxHp` / `chooseTarget` / `target.damage(1, player)` / `line` / `get.attitude`。

---

### 2.1.3 止涕

**文案：**
> 锁定技。当对其他角色造成伤害时，你选择一项：1、若你的体力上限小于场上的角色数，你增加一体力上限，否则你摸一张牌；2、令其失去一个技能直到其下一个回合结束；3、恢复一个失效技能。

**设计点：**
1. 无条件多选一（2026-10 三次改版改二选一并移除原"有来源技→封技/无来源技→加上限"的双分支互斥，2026-10 七次改版扩为三选一）：造成伤害即触发，**选项1（上限/摸牌）**、**封技**、**恢复失效技能**任选其一。
2. 上限成长固定为1点/次但有封顶（2026-10 六次改版：上限 < 场上角色数才涨，否则改摸1牌）：未封顶时止涕是上限成长的核心引擎——上限即手牌上限（魂契②）、即夺魂观堆的发动资源（夺魂①）；封顶后自动转化为过牌收益，避免无限堆上限。
3. 封技不再有来源限制：任意伤害都可封锁目标任意技能（非 charlotte）直到其下一个回合结束，从"惩罚被偷过技能的目标"变为通用压制。
4. 强制触发（`forced:true`）：造成伤害即进入 content，"你选择一项"无取消项；选项2/3均不可行（目标已死/无可封技且无可恢复技）时仅剩选项1，直接执行不询问（幻魂式单选项直执行）。
5. **选项3（2026-10 七次改版）**：恢复**自己的**一个失效技能（止涕②封目标，③解自己的封），与夺魂③同口径——仍拥有但被禁/被封的技能，移除的技能不在池内（见踩坑#62）。与夺魂③互为保底：止涕被锁时自身无法触发，靠夺魂③救；夺魂被锁时靠止涕③救。

**实现要点：**
- **触发**：`source:"damageSource"` + `forced:true`，`filter` 判目标≠自己且 `event.num > 0`。⚠️ **不判目标存活**——`damageSource` 在死亡结算之后触发（damage 事件步骤：changeHp → dying/death → damageSource），两个分支都应对击杀成立（见踩坑#48）。
- **可行性判定**：content 开头算失效池——`target.isIn()`（尸体豁免——死亡角色不再是效果对象，此时仅剩选项1）+ 失效池非空；失效池：`lib.skill.夺魂.getSkills(target)` ∩ `target.hasSkill` ∩ 非 `charlotte`（`hasSkill` 经 `getSkills` 过滤 `disabledSkills`，已被封住的技能自然排除，无需另查失效标记）。
- **询问**：可行选项动态拼 `controls`/`choiceList`（选项1恒可行；封技需失效池非空；恢复需 `getRestorableSkills(player)` 非空），仅剩选项1时直接执行不询问；首选项标签动态——`maxHp < game.countPlayer()` 时为"增加体力上限"，封顶时为"摸一张牌"；AI 优先恢复核心技（魂契/夺魂/迅袭/止涕被锁时反制）、敌方持有 `info.ai.combo` 技能时封技、有连协技可恢复次优先，否则走选项1。
- **选项1**：`player.maxHp < game.countPlayer()` → `await player.gainMaxHp()`，否则 → `await player.draw(1)`（加在自己身上，对尸体同样生效；封顶判定在执行时实时计算）。
- **"直到其下一个回合结束"（2026-09 三次改版：tempBanSkill → disableSkill）**：`target.disableSkill("止涕", skill)` 把技能挂进 `disabledSkills`，经 `getSkills` 过滤后**触发、主动使用、mod 被动、skillTag、依赖 hasSkill 的 global 子技一并失效**——旧 `tempBanSkill` 的 `temp_ban_` 只覆盖 filterTrigger/filterEnable 两个显式检查点，mod/skillTag/global 子技（如归訫的归訫_put）会"封了照用"（实测踩坑，见#51）。解除用官方 dcsbzuojun 式 when 钩子：`target.when({player:"phaseEnd"}, false).filter(evt => evt != event.getParent("phase")).assign({firstDo:true}).step(player2.enableSkill("止涕")).finish()`——在其自己的回合结束触发，filter 跳过封技发生时所在的当前回合（若在其回合内造成伤害则顺延到其下下回合，严格等于"其下一个回合结束"，见踩坑#49）；自定义 filter 在排布阶段判定，被跳过不消耗 `when` 的一次性守卫（content.ts 仅在触发事件真正创建后才置 `triggered`）。⚠️ `disableSkill` 首次禁用若技能同时有 `ondisable`+`onremove` 会执行破坏性清理——本扩展与常规官方技均无 `ondisable`，安全。
- **选项3**：`await lib.skill.夺魂.restoreDisabledSkill(player)`——选技交互与恢复逻辑复用夺魂的辅助函数（见 2.1.1），恢复对象是止涕持有者自己。
- **AI**：`ai.effect.target` 对任意目标提高伤害牌价值（`current + 0.3`——上限/摸牌/封技/恢复必有收益）。
- 旧三标记（止戈/血俎/失魂）与 `止涕_mark` 展示技能已随前版移除；`countFromSource` 辅助已随本版移除（止涕不再读取技能来源）。

**关键 API：** `forced` / `damageSource` / `logTarget` / `chooseControl` / `choiceList` / `chooseButton([... , "skill"])` / `gainMaxHp` / `draw` / `game.countPlayer()` / `disableSkill(禁用者, 技)` / `enableSkill(禁用者)` / `when({player:"phaseEnd"}, false)` / `isIn` / `line` / `lib.skill.夺魂.restoreDisabledSkill`。

---

## 2.2 神曹操

### 2.2.1 归訫（归訫 / 归訫2 / 归訫_put / 归訫_use）

**文案：**
> ①每名角色的回合开始时，其可以将区域内的一张牌置于其武将牌上，称为"归訫"，然后你可以令其摸一张牌。
> ②每当你失去或回复1点体力后，你可以依次选择任意名其他角色，若其：1、有"归訫"，你将其所有"归訫"移至你的武将牌上；2、没有"归訫"，你获得其区域内的一张牌。若如此做，你翻面。
> ③你可以将武将牌上的一张"归訫"当做任意基本牌或非延时类锦囊牌使用或打出。

**设计点：**
1. 全场的"归訫"牌 = 标记资源（挂在扩展区）；①②③ 围绕它流转。
2. ②卖血收益：`changeHp` 覆盖伤害/流失/回复三种来源，**每变化 1 点触发一次**（`getIndex`）。
3. ③用扩展区牌当虚拟牌使用——Noname 经典"标记牌当手牌用"套路。

**实现要点（含大量踩坑）：**
- **②触发次数**：`trigger:{player:"changeHp"}` + `getIndex(event, player){ return Math.abs(event.changedHp); }` —— 每 1 点触发一次。
- **翻面代价**：对无归訫目标拿牌后 `await player.turnOver()`（先结算所有目标、最后统一翻面）。
- **全局"置归訫"**：`归訫_put` 挂 `global:"归訫_put"` 让全场角色回合开始可触发；`holder = game.findPlayer(p => p.hasSkill("归訫"))` 找技能拥有者，再由拥有者决定是否令其摸牌（`holder.chooseBool`）。
- **扩展区牌移动**：`addToExpansion(cards, from, "giveAuto"/"give"/"draw")`；打标记 `next.gaintag.add("归訫2")`；**lose/give 会清掉非 `eternal_` 的 gaintag** → 移过来后需重新 `addGaintag`（七煋也踩过此坑）。
- **③虚拟用牌**（重点套路）：
  - `enable: ["chooseToUse","chooseToRespond"]` + `hiddenCard(player, name)`（告诉 AI/响应系统"你能当这张牌"）。
  - `chooseButton`：`dialog` 列可虚拟牌（`get.inpileVCardList` + `event.filterCard(get.autoViewAs(...))` 过滤）→ `backup` 返回 `{filterCard:true, selectCard:-1, position:"x", viewAs:{name,nature}, precontent}`。
  - **扩展区牌不在场上、无法点选** → 用 `selectCard:-1 + position:"x"` 让引擎自动选中全部归訫，再在 `precontent` 里**随机抽一张**写入 `event.result.cards/card`。
  - `skillTagFilter` + `ai:{fireAttack, respondSha, respondShan, order, result}` 支撑 AI。
- **附属技能命名**：`归訫2`（牌标记载体，`onremove` 清牌）、`归訫_put`（全局放牌）、`归訫_use`（虚拟使用）+ `归訫_use_backup`。

**关键 API：** `changeHp` / `getIndex` / `getExpansions` / `addToExpansion` / `addGaintag` / `markSkill` / `loseToDiscardpile` / `turnOver` / `gainPlayerCard` / `enable` / `chooseButton.dialog|check|backup|prompt` / `precontent` / `hiddenCard` / `skillTagFilter` / `get.inpileVCardList` / `get.autoViewAs` / `ui.create.dialog` / `isUnderControl` / `intro.mark`。

---

### 2.2.2 飛影

**文案：**
> 锁定技。除你以外拥有"归訫"的角色与你计算距离+1；除你以外没有"归訫"的角色每回合使用的第一张以你为唯一目标的牌无效。

**设计点：**
1. 与归訫联动：有归訫=友，加距离；无归訫=敌，无效其第一张牌。
2. 每回合限一次（对每个使用者的首张有效），回合开始重置。

**实现要点：**
- **距离**：`mod.globalTo(from, to, distance){ return distance + 1; }`（from 有归訫时）。
- **无效化**：`trigger:{global:["phaseBegin","useCard"]}`；`filter(event, player, name)` **用第三个参数 `name` 区分时机**；`useCard` 时 `trigger.cancel()`。
- **回合重置**：`phaseBegin` 清空 `storage.飛影_used`；useCard 时 `push(user)` 记录。
- **AI**：`ai.effect.target` 里对对自己不利、且用牌者无归訫的目标牌返回 `[1, -0.6]` 抑制。

**关键 API：** `mod.globalTo` / `trigger.cancel()` / filter 的 `name` 参数 / `storage` / `get.attitude`。

---

## 2.3 神诸葛

### 2.3.1 七煋（七煋 / 七煋_mark）

**文案：**
> ①游戏开始或回合开始时，你可以观看牌堆顶的七张牌并以任意顺序调整排列，然后将前X张牌（X为7-你的"煋"数）置于你的武将牌上，称为"煋"。
> ②你的回合结束时，你可以将任意张"煋"移至等量名角色的武将牌上。

**设计点：**
1. 观星式定序 + 囤牌（上限 7 张"煋"）。
2. ②把"煋"分发给他人 → 供相天/神机读取花色（全场共享花色池）。

**实现要点：**
- **触发**：`player:["phaseBegin","phaseEnd"]` + `global:"phaseBefore"`（游戏开始），filter 用 `name` 区分；`game.phaseNumber == 0` 判断游戏开始。
- **观星排序**：`chooseToMove()` + `.set("list",[["牌堆顶",cards]])` + `.set("processAI", fn)`；结果 `result.moved[0]` 为排序后数组。
- **取前 X 张**：`moved.slice(0, num)` 置扩展区（`addToExpansion(pushs,"draw")` + `gaintag.add("七煋")`）；剩余 `backs` **插回牌堆顶**。
- **⚠️ 牌堆顶的牌无主**，不能走 `loseToDiscardpile` → 用 `ui.cardPile.insertBefore(list[i], ui.cardPile.firstChild)` 倒序插回 + `game.updateRoundNumber()`。
- **移煋给他人**：`chooseButton`（选 n 张）+ `chooseTarget`（选 n 人，`[num,num]`）；逐个 `target.addToExpansion(star, player, "give")`。
- **⚠️ gaintag 坑**：`give` 的 lose 会清 gaintag → 移过去后重新 `target.addGaintag(star, "七煋")` + `addSkill("七煋_mark")` + `markSkill`。
- **标记展示**：`intro:{markcount:"expansion", mark(dialog, storage, player){...}}`，明置牌用 `dialog.addAuto(cards)`，他人视角显示数量。

**关键 API：** `chooseToMove` / `get.cards(n)` / `addToExpansion` / `addGaintag` / `markSkill` / `ui.cardPile.insertBefore` / `game.updateRoundNumber` / `game.phaseNumber` / `getExpansions` / `intro.markcount` / `intro.mark` / `isUnderControl`。

---

### 2.3.2 相天（相天 / 相天2）

**文案：**
> 一名角色的回合开始时，若其武将牌上有"煋"，你可以移去其一张"煋"，然后直到其下个回合开始前：1、其造成非雷电伤害时，防止之；2、其受到非雷电伤害时，防止之。

**设计点：**
1. 消耗他人"煋"给予持续的"防伤结界"（大雾式），类型二选一（防造成/防受到）。
2. 时效：到下个回合开始（`phaseBeginStart` 移除临时技）。

**实现要点：**
- **触发**：`global:"phaseBegin"`，filter 判目标有"煋"。
- **cost 组合**：`chooseButton`（选一张煋）+ `chooseControl`（选防伤类型），结果打包进 `event.result = {bool:true, cost_data:{card, type}}`。
- **移除煋**：`target.loseToDiscardpile(card)`；煋数为 0 时 `removeSkill("七煋_mark")`。
- **临时防伤**：`target.addTempSkill("相天2", {player:"phaseBeginStart"})` + `markAuto("相天2",[type])`。
- **防伤**：`相天2` 监听 `global:"damageBegin4"`，filter 按存储的 type 判 `event.source==player`（防其造成）或 `event.player==player`（防其受到），`trigger.cancel()`；**雷电伤害豁免**（`event.hasNature("thunder")` 返回 false）。
- **AI**：`ai.effect.target` / `player_use` 用 `"zeroplayertarget"` / `[1,-0.5]` 抑制非雷伤害牌。

**关键 API：** `chooseButton` + `cost_data` / `chooseControl` / `loseToDiscardpile` / `addTempSkill(s, {player:"phaseBeginStart"})` / `markAuto` / `getStorage` / `damageBegin4` / `trigger.cancel()` / `event.hasNature` / `ai.effect`。

---

### 2.3.3 神机（神机 / 神机_used）

**文案：**
> 每名角色的回合限一次，一名角色于回合内使用或打出非虚拟非转化的非装备牌时，若此牌与其武将牌上一张"煋"的花色相同，你可以摸一张牌，然后若该角色：①不为你，你令此牌无效并获得其一张牌；②为你，你可以于此牌结算结束后视为再次使用此牌。

**设计点：**
1. 花色联动七煋：实体牌与"煋"同花色才可触发。
2. 敌我分流：他人用牌→无效+抢牌；自己用牌→结算后再来一发（复制使用）。
3. 每名角色的回合限一次。

**实现要点：**
- **触发**：`global:["useCard","respond"]`，filter 严格过滤：`card.isCard` 实体、非装备、`event.cards.length===1`、用牌者=当前回合角色、与某张"煋"同花色（`get.suit` 判 `"unsure"` 排除）。
- **限次**：content 里 `addTempSkill("神机_used")` + `addMark("神机_used",1,false)`；`神机_used` 为 `charlotte` 临时技。
- **无效化**：useCard 用 `trigger.targets.length = 0; trigger.all_excluded = true;`；respond 用 `trigger.cancel()`。
- **复制使用（重点）**：`trigger.insertAfter(async (event2)=>{ ... await me.chooseUseTarget(get.autoViewAs({name, nature}), true, false); }, {player: player})` —— 在原牌结算**结束后**再问是否视为再次使用；`chooseUseTarget` 会自动套用该牌目标规则、不计入次数、不重复触发神机。
- **AI**：`ai.notemp`、`effect` 辅助。

**关键 API：** `useCard`/`respond` / `insertAfter` / `chooseUseTarget` / `get.autoViewAs` / `trigger.targets.length=0` / `all_excluded` / `trigger.cancel()` / `addTempSkill` / `addMark` / `get.suit` / `charlotte`。

---

## 2.4 神徐盛

### 2.4.1 疑兵（觉醒技）

**文案：**
> 觉醒技。一名角色的回合开始时，你令其选择一项：1、令你摸两张牌，然后你将其中一张置于你的武将牌上，称为"疑兵"；2、将一张牌置于你的武将牌上，称为"疑兵"。当你以此法得到等于场上角色数的"疑兵"时，你获得【疑城】。

**设计点：**
1. 觉醒技：以"疑兵"（扩展区标记牌）为成长资源，攒够 **场上角色数** 张即觉醒，获得【疑城】并移除【疑兵】。
2. 觉醒前后共用同一份"疑兵"资源：觉醒时【疑兵】技能移除，但已有"疑兵"牌保留，由【疑城】接管展示与消费。
3. 强制触发（`forced:true`）：每名角色回合开始时自动发动，无需询问技能拥有者。
4. 令当前回合角色选择：选项一（技能拥有者摸牌选放）或选项二（回合角色给牌）。

**实现要点：**
- **触发**：`trigger:{global:"phaseBegin"}`（任意角色回合开始，含自己）+ `forced:true`（强制触发，不询问技能拥有者）。
- **无 filter**：所有角色回合开始都触发。
- **选择权在当前回合角色**：`target.chooseControl("选项一","选项二")`，AI 根据态度决定——友方选选项一（帮摸牌增长），敌方有废牌（`get.value < 3`）时选选项二（给废牌），否则选选项一。
- **选项一（摸牌选放）**：`get.cards(2)` 取两张 → `showCards` 展示（仿涉猎 shelie 模式）→ `chooseCardButton` 选一张 → `addToExpansion([chosen],"draw").gaintag.add("疑城")` → 剩余一张 `player.gain(remain,"gain2")` 入手。
- **选项二（给牌）**：`target.chooseCard("he",...,true)` 选一张 → `addToExpansion(cards,target,"give").gaintag.add("疑城")`。
- **觉醒检查**：放牌后查 `getExpansions("疑城").length >= game.countPlayer()`，满足则 `awakenSkill("疑兵")` → `addSkill("疑城")`（先加后删）。
- **⚠️ 扩展区牌 gaintag 用 `"疑城"`**：标记牌 gaintag 必须与**承载标记的技能名**一致才能自动刷新。虽然"疑兵"牌是【疑兵】放的，但展示/消费它的技能是【疑城】，故 gaintag 用"疑城"、`intro.name:"疑兵"` 呈现。
- **onremove 兜底**：`疑兵.onremove` 仅在**尚未觉醒**（`!player.hasSkill("疑城")`）时清掉"疑兵"牌；正常觉醒流程先加【疑城】再移除【疑兵】，牌保留。
- **已移除 `疑兵_gain` 子技能**：旧版选项一（监听使用牌指定目标）已不再需要。

**关键 API：** `global:"phaseBegin"` / `forced:true` / `chooseControl` / `get.cards` / `showCards` / `chooseCardButton` / `addToExpansion` / `gaintag` / `markSkill` / `getExpansions` / `awakenSkill` / `addSkill` / `onremove` / `game.countPlayer`。

---

### 2.4.2 疑城（疑城 / 疑城_skip / 疑城_negate）

**文案：**
> ①回合开始时，你可以跳过本回合的摸牌阶段和弃牌阶段，然后将任意张牌置于你的武将牌上，称为"疑兵"。
> ②当你成为其他角色使用牌的目标时，你可以移去一张"疑兵"并令此牌无效，然后你摸X张牌（X为"疑兵"数且至少为1，至多为5）。

**设计点：**
1. 觉醒后接管的资源技能：①跳过摸牌+弃牌阶段，将任意张手牌/装备/判定牌置于武将牌上 → ②移一张"疑兵"换"无效化 + 摸X张"。
2. X = 移去一张后的**剩余"疑兵"数**，至少为 1，至多为 5（非体力值）。

**实现要点：**
- **①跳过摸牌+弃牌阶段**：`trigger:{player:"phaseBegin"}` + `direct:true` + `filter` 判有牌可放；content 里 `chooseBool` 确认后 `player.addTempSkill("疑城_skip")` → `chooseCard("hej",[1,Infinity])` 选任意张牌 → `addToExpansion(cards,player,"giveAuto").gaintag.add("疑城")`。
- **疑城_skip 子技能**：`trigger:{player:["phaseDrawBegin2","phaseDiscardBegin"]}` + `forced:true`；摸牌阶段用 `trigger.changeToZero()`，弃牌阶段用 `trigger.cancel()`。
- **②令牌对单目标无效**：`trigger:{target:"useCardToTarget"}` + `direct:true`；X = `Math.max(1, Math.min(5, cards.length))`（按移去前的疑兵数计算）→ `chooseButton` 选一张"疑兵" → `loseToDiscardpile` → **`trigger.getParent().excluded.add(player)`** 令该牌只对自己无效（参考娴辅）→ `player.draw(X)`。
- **标记展示**：`intro:{name:"疑兵", markcount:"expansion", mark(...)}`——统计 gaintag=="疑城" 的扩展区牌，展示名"疑兵"；`onremove` 清掉"疑兵"牌。
- **AI**：①仅当手牌平均价值低时跳过摸牌+弃牌；②仅对效果为负的牌（`get.effect(...) >= 0` 不发）移牌。

**关键 API：** `phaseBegin` / `direct:true` / `chooseBool` / `chooseCard("hej",[1,Infinity])` / `addToExpansion` + `"giveAuto"` / `addTempSkill` / `phaseDrawBegin2` + `changeToZero` / `phaseDiscardBegin` + `cancel` / `useCardToTarget` / `excluded.add` / `loseToDiscardpile` / `draw` / `Math.max` / `Math.min` / `intro.markcount:"expansion"`。

---

### 2.4.3 破军

**文案：**
> ①你使用牌无距离和次数限制。
> ②当你使用牌时，可以移去一张"疑兵"，然后令此牌无法被响应。若此牌为【杀】，你可以额外移去任意张"疑兵"，然后额外指定等量名目标，若如此做，此【杀】伤害+1。

**设计点：**
1. ①常驻 mod：`targetInRange: () => true`（无距离限制）+ `cardUsable: () => Infinity`（无次数限制）。
2. ②任意可响应牌（杀/火雷杀、可被无懈的锦囊）移一张"疑兵" → `directHit` 无法被响应。
3. ③【杀】可再移 N 张"疑兵" → 额外指定 N 名目标 + 伤害+1（"若如此做"）。
4. 攻防一体：既强化进攻（杀/锦囊不可响应），又延续"疑兵"资源的攻防转换。

**实现要点：**
- **①无距离/次数限制**：`mod:{ targetInRange: () => true, cardUsable: () => Infinity }`——常驻生效，无需触发。
- **触发**：`trigger:{player:"useCard2"}`（只对"使用牌"触发）+ `direct:true`；filter 仅限可响应牌：`get.type2(card)=="basic" && card.name=="sha"`，或 `get.type2(card)=="trick" && card.name!="wuxie"`（排除无懈，避免无意义提示）。
- **②无法被响应**：`chooseButton` 选一张"疑兵" → `loseToDiscardpile` → `trigger.directHit.addArray(trigger.targets.slice(0))`。
- **③加目标/伤害**（仅 `card.name=="sha"`）：`chooseButton([...], [1, min(疑兵数, 可用目标数)])` 选 N 张 → `chooseTarget([num,num])` 选 N 名额外目标（`targetEnabled2` 过滤）→ `loseToDiscardpile` → `trigger.targets.addArray(新目标)`；若②已用则新增目标同样加入 `directHit` → `trigger.baseDamage++`。
- **AI**：两处 chooseButton 的 ai 都在存在**敌方**可指定目标时才返回正数，且优先移去低价值"疑兵"（`4 - get.value(button.link, me)`）；②对杀/伤害类锦囊加权（`5 - ...`）。

**关键 API：** `mod.targetInRange` / `mod.cardUsable` / `useCard2` / `get.type2` / `directHit.addArray` / `chooseTarget([num,num])` / `targetEnabled2` / `trigger.targets.addArray` / `baseDamage++` / `loseToDiscardpile` / `get.tag(card,"damage")`。

---

## 2.6 神冶

### 2.6.0 冶武

**文案：**
> 锁定技。①回合开始或每当你累计造成2点伤害时，若你有已废除的武器栏，你恢复一个武器栏，否则你获得一个额外的武器栏。②当你使用或失去装备牌时，摸X张牌（若该装备牌为武器牌，则X为其攻击距离，否则为1）。

**设计点：**
1. 武器栏管理：优先恢复已废除的武器栏，没有废除的才增加新栏位。
2. 伤害联动：累计造成2点伤害时触发武器栏效果，提高触发频率。
3. 装备牌联动：使用或失去装备牌时摸牌，武器牌根据攻击距离摸牌，其他装备牌摸1张。

**实现要点：**
- **触发**：`trigger:{player:["phaseBegin","useCard","loseAfter"],global:["equipAfter","addJudgeAfter","gainAfter","loseAsyncAfter","addToExpansionAfter"],source:"damageSource"}`，用 `filter` 第三个参数区分时机。
- **失去装备的时机集合参考官方枭姬（xiaoji, standard.js）**：`gain` 事件的 content 会对每个被抢者调用 `owner.lose(...)`（type:"gain"）产生子 lose，但此类**带 type 的转移子 lose 不触发 loseAfter**（引擎统一在该转移事件的 After 时机通知），因此他人夺走装备（义贤/定州 = gain 事件）必须监听 `global:"gainAfter"` 而非 loseAfter；多人同时失去走 `loseAsyncAfter`；装备被新装备顶替走 `equipAfter`；移至判定区/武将牌走对应 After；自己主动失去（弃置/被拆等独立 lose）走 `player:"loseAfter"`。
- **失去统计只认装备区（evt.es）**（参考枭姬 getIndex 判 `evt.es`）：使用装备时新手牌是从手牌失去（记录在 hs），不算"失去装备"，避免与 useCard 时机重复摸牌；被抢/被拆/被顶替的装备区牌（es）才触发。
- **锁定技**：`locked:true` + `forced:true`。
- **伤害计数**：`player.storage.冶武_damageCount` 记录累计伤害，每累计2点触发一次，回合开始时重置。
- **content**：回合开始或伤害触发时检查 `disabledSlots`，有废除的栏位则恢复，否则调用 `expandEquip(1)`；使用装备时按 `getDrawNum` 摸牌，失去时遍历 `trigger.getl(player).es` 每张各摸一次。

**关键 API：** `expandEquip` / `disabledSlots` / `$syncDisable` / `getDrawNum` / `draw` / `damageSource` / `getl` / `gainAfter` / `equipAfter` / `loseAsyncAfter`。

---

### 2.6.1 炼刃

**文案：**
> 出牌阶段，你可以弃置一张装备牌，然后选择一项：1、获得一名其他角色的至多X张牌（若该装备牌为武器牌，则X为其攻击距离，否则为1）；2、依次对至多X名其他角色造成一点伤害。

**设计点：**
1. 装备牌资源管理：弃置装备牌触发两种效果，提供灵活选择。
2. 选项1：获得其他角色的牌，X根据装备牌类型计算，最多获得X张。
3. 选项2：对多名角色造成伤害，X根据装备牌类型计算。

**实现要点：**
- **交互顺序**：出牌阶段点技能 → 先弹竖排技能选项（义贤式 textbutton，选"拿牌/伤害"）→ 再选一张装备牌 → 再以系统鼠标拖拽一键指定目标（摧决式）。
- **主技能**：`enable:"phaseUse"` + `filter` 检查有装备牌可弃 + `subSkill:{backup:{}}`。
- **选项弹窗**：`chooseButton.dialog` 用 `ui.create.dialog(...)` + `dialog.add([[[key,label]...],"textbutton"])` 竖排选项；`backup(links)` 读 `links[0]` 分支（拿牌 or 伤害），返回带 `filterCard(装备)/selectCard:1/position:"he"/selectTarget/filterOk/content` 的对象。
- **弃牌**：backup 设 `discard:false`，content 内手动 `player.discard`（backup 型技能引擎不自动弃牌）。
- **⚠️ 多目标结算**：非 `multitarget` 的主动技 content 会**对每个目标各执行一次**（`event.target` 依次指向所选目标，`event.num` 递增），故 content 只对单数 `event.target` 结算即可保证每个目标恰好受1点伤害/一次拿牌；一次性副作用（弃牌）放 `if (event.num===0)` 内。切勿在 content 里遍历 `event.targets` 结算（会每人重复结算 N 次）。
- **动态目标上限**：`selectTarget:[1,Infinity]` + `filterOk()` 读 `ui.selected.cards[0]` 由 `getDrawNum` 算出 X 限制目标数（超限点确定自动取消重选）。
- **选项1**：`gainPlayerCard(target, min(target.countCards("he"), x))`；**选项2**：`target.damage()`。

**关键 API：** `chooseButton` / `backup` / `textbutton` / `filterOk` / `ui.selected` / `discard` / `gainPlayerCard` / `damage` / `getDrawNum`。

---

### 2.6.2 穷兵

**文案：**
> 锁定技。当你进入濒死状态时，若你有未废除的武器栏，你废除一个武器栏，然后将体力恢复至1点，摸装备栏数张牌并对一名其他角色造成一点伤害。

**设计点：**
1. 保命技：进入濒死状态时自动触发，提供生存能力。
2. 可多次发动：没有次数限制，每次濒死都可以发动。
3. 伤害联动：对一名角色造成1点伤害，可联动冶武的伤害累计效果。
4. 代价：废除一个武器栏，减少后续的武器栏恢复机会。

**实现要点：**
- **锁定技**：`forced:true` + `locked:true`。
- **触发**：`trigger:{player:"dying"}`。
- **filter**：`player.hasEnabledSlot(1)` 检查是否有未废除的武器栏。
- **content**：废除一个武器栏（优先减少 `expandedSlots`，否则增加 `disabledSlots`）；`recoverTo(1)` 恢复体力；`draw(countEnabledSlot())` 摸牌；`chooseTarget` + `damage` 造成伤害。

**关键 API：** `hasEnabledSlot` / `expandedSlots` / `disabledSlots` / `$syncExpand` / `$syncDisable` / `recoverTo` / `countEnabledSlot` / `draw` / `chooseTarget` / `damage`。

---

## 2.7 神傀

### 2.7.0 傀体

**文案：**
> 锁定技。①当你受到伤害时，你令当前回合角色失去等量张牌。②当你成为其他角色使用牌的目标时，你摸一张牌或获得其一张牌。③当你获得锦囊牌时，你弃置手牌区中的所有锦囊牌，然后若你的体力值不满，你恢复等量点体力，否则增加等量点体力上限。④你使用牌无次数限制。

**设计点：**
1. ①傀儡的"代价转移"机制：受到的伤害转化为当前回合角色的手牌损耗（受击威慑，敌方打傀儡亏牌）。
2. ②"被指定即收益"且不限定牌的类型：任何其他角色的牌以你为目标都稳定赚一张（摸1或从使用者处拿1）。与【移魂】联动：转移过来的单目标牌会对"你"再次触发 useCardToTarget，②照常生效。
3. ③锦囊"过路费"：手牌里的锦囊留不住——每获得一张锦囊就清空手牌全部锦囊，但按弃置数转化为体力回复或上限成长，为【百战】的体力消耗续航。闭环：被指定→②赚牌→若是锦囊→③弃掉回血/涨上限。
4. ④原【不竭】并入：配合②③，傀儡以体力为燃料高频用牌、以锦囊弃置为燃料续航。

**实现要点：**
- **三时机共用一个技能**：`trigger:{player:["damageEnd","gainEnd"], target:"useCardToTarget"}`，filter 用第三个参数 `name` 区分、content 用 `event.triggername` 分支（踩坑#8/#23）。
- **①时机用 `player:"damageEnd"`**（官方奸雄/反馈同款时机）；"当前回合角色"取 `_status.currentPhase`，filter 里校验其存活且有牌可失去（避免弹泡后空结算）；"失去"用 `chooseCard` + `target.lose(cards)`（lose 默认去向为弃牌堆，与"弃置"语义区分）。
- **②不限定牌的类型**：filter 只保留 `event.card` 存在 + "使用者非你"（`event.player !== player`）两个判定；X 固定为 1。二选一：content 内 `chooseControl` 询问"摸牌/获得其牌"（对方区域内无牌时跳过询问直接摸牌）；获得用 `gainPlayerCard(user, 1, "hej", true)`。若拿到的牌是锦囊，会嵌套触发③。
- **③"获得"时机 `player:"gainEnd"`**：事件生命周期自动触发 `XBefore→XBegin→content→XEnd→XAfter`（gameEvent.js loop 动态命名，源码搜不到 "gainEnd" 字面量），gainEnd 时获得的牌已入手；`event.cards` 为本事件获得的牌。filter 两道闸：本事件获得的牌中有锦囊 + 手牌里确有锦囊（防极端情况下牌未入手时空弹泡）。
- **③锦囊类型判定**：必须用 `lib.card[card.name]?.type` 读原始类型，`["trick","delay"].includes(...)`（含延时锦囊）。⚠️ 不能调 `get.type`/`get.type2`——它们内部查 cardname mod，场上存在同类 mod 时会无限递归（踩坑#45；本技能原③"锦囊视为杀"的 cardname mod 已随改版移除，此处属遗留风险防范）。
- **③弃置与转化**：`player.discard(cards)`（弃置语义，触发弃牌相关事件；弃置对象为**手牌区中的所有锦囊牌**，含本次获得的）后按弃置数结算：`hp < maxHp` 时 `recover(num)`（内部按 maxHp-hp 自动封顶），否则 `gainMaxHp(num)`。"若你的体力值不满"在弃置之后判定。弃牌是 lose 不是 gain，无循环风险。
- **③初始手牌边界**：引擎在 `gameDrawEnd` 前屏蔽 lose/gain/equip 等事件的触发（gameEvent.js trigger 入口 `_status.gameDrawed` 检查），故游戏开始发牌不触发③；初始手牌里的锦囊会在你下次获得任意锦囊时随③一并弃置。
- **④**：`mod:{ cardUsable: () => Infinity }`（原【不竭】同款，与破军①同款写法）。
- **弹泡**：不手动 logSkill——引擎在触发时自动 `logSkill`（content.js createTrigger 内，`info.popup != false && !info.direct` 时），`logTarget` 写成函数按 triggername 返回弹泡指向（damageEnd → `_status.currentPhase`；useCardToTarget → `trigger.player` 即牌的使用者；gainEnd → undefined 无特定指向）。手动在 content 里 logSkill 会造成双重弹泡+双重语音。

**关键 API：** `damageEnd` / `useCardToTarget`（target 位） / `gainEnd`（事件生命周期自动时机） / `event.cards`（gain 事件） / `lib.card[card.name].type` 原始类型判定 / `_status.currentPhase` / `chooseCard(position, num, true, prompt)` / `player.lose(cards)`（默认进弃牌堆） / `player.discard(cards)` / `gainPlayerCard(target, num, position, true)` / `chooseControl` / `recover`（自动封顶） / `gainMaxHp` / `mod.cardUsable` / `logTarget(trigger, player, triggername)` 函数式弹泡指向 / `get.cnNumber`。

---

### 2.7.1 百战

**文案：**
> 锁定技。当你使用【杀】时，你选择一项：1、失去一点体力，然后令此【杀】伤害值+1；2、若你的体力上限大于1，失去一点体力及上限，然后对其中一个目标造成一点伤害。

**设计点：**
1. 从"造成伤害即成长"改为"使用杀付费强化"：体力是燃料、杀是输出手段；配合傀体③（锦囊弃置回血/涨上限）与傀体②（被指定赚牌）构成资源循环。
2. 选项1（1体力换此杀+1伤害）：期望伤害高但可被闪避；选项2（需体力上限大于1，1体力+1上限换其中一名目标稳定1点伤害）：不可响应、无视闪避，适合对手牌多的敌人或收割残血的场合。
3. 锁定技强制发动但选项自选（forced 触发 + content 内 chooseControl，同傀体②模式，踩坑#23）；选项2附条件"体力上限大于1"，条件不满足时只剩选项1，无需询问直接结算。

**实现要点：**
- **触发**：`player:"useCard2"`——useCard 事件内容里的显式时机（content.js：useCard1 → 应变 → useCard2 → useCard → 逐目标结算），此时 `trigger.targets` 已确定、`trigger.baseDamage` 已初始化（`get.info(card).baseDamage || 1`）且尚未拷入逐目标的牌效果事件。⚠️ 不用 `useCardToTarget`：那是逐目标时机，多目标【杀】（方天画戟）会重复触发，不合"当你使用【杀】时"的一次性语义。
- **filter**：`get.name(event.card, player) === "sha"`（含视为/转化的杀）且 `event.targets?.length > 0`。
- **选项1**：`await player.loseHp(1)` 后 `trigger.baseDamage++`——baseDamage 在逐目标结算时拷入牌效果事件（content.js `next.baseDamage = event.baseDamage`），牌效果内 `target.damage()` 未传 num 时默认取 `(event.baseDamage || 1) + (event.extraDamage || 0)`（player.js damage），故此【杀】对每名目标的伤害各+1。⚠️ loseHp 可能致濒死，濒死结算嵌在 loseHp 事件内完成后再继续 content；文案无"体力不足不可选"的限制，忠实实现（AI 会规避）。
- **选项2**：**先在失去体力前**用 `chooseTarget`（filter 限定 `trigger.targets` 中的存活角色；仅一名存活目标时自动指定、多名时玩家挑选）锁定伤害对象，再 `await player.loseHp(1)` → 存活时 `await player.loseMaxHp(1)` → `target.damage(1, player)`（技能直伤，不可被响应）。⚠️ 先选目标的原因：loseHp 可能致阵亡，阵亡后再发起选择不可靠；此时伤害仍照常结算（来源阵亡时引擎 damage 的 filterStop 会自动清掉 source 变为无来源）。⚠️ 引擎 loseMaxHp 无下限钳制（`maxHp -= num`，`maxHp<=0` 直接 `die()`，content.js 已验证），故若失去体力时已阵亡则跳过扣上限，避免对已阵亡角色二次 die。
- **二选一**：`player.maxHp <= 1` 时直接走选项1（跳过询问）；否则 `chooseControl(["失去体力", "失去体力及上限"])` + choiceList（数组格式，踩坑#34；结果无 bool，用 control 判定，踩坑#2）。AI：hp≤2 只选选项1；有1体力敌人时选选项2（稳定伤害可直接收割）；目标均为敌人且手牌均值≥2（大概率握闪）时选选项2，否则选项1。选项2的选目标 AI：`get.damageEffect(target, me, me)` + 1体力目标加成。
- **弹泡**：`logTarget: "targets"`（字符串式，取 `trigger.targets` 目标列表；引擎自动 logSkill，content.js 对数组 targets 正常处理）。

**关键 API：** `useCard2` / `trigger.baseDamage`（逐目标结算前修改仍有效） / `loseHp` / `loseMaxHp`（无下限钳制，maxHp≤0 即死） / `target.damage(num, source)`（变参，直伤不可响应） / `chooseControl`（数组格式） / `chooseTarget(true, prompt, filter)` / `get.damageEffect(target, source, viewer)` / `logTarget` 字符串式（取数组）。

---

### 2.7.2 移魂

（原 2.7.3；原 2.7.2 不竭已删除，其"无次数限制"并入傀体④。文案与实现不变。）

**文案：**
> 锁定技。每轮游戏开始时，你指定一名其他角色，然后直到本轮游戏结束，当该角色成为除你以外其他角色使用牌的唯一目标时，你代替该角色成为此牌的目标。

**设计点：**
1. 每轮换目标的强制"替身"机制：指定角色成为**唯一目标**且使用者**非你**时，此牌转移到你身上——傀儡本体吸收。
2. 两条限制的用意：①"除你以外其他角色"排除你自己使用牌指定其的情况，避免自己的【杀】转到自己头上；②"唯一目标"把 AOE（南蛮入寇/万箭齐发/桃园结义）和多目标牌（如方天画戟多指【杀】）排除在外——既贴合文案，也天然规避了"你已在目标列表中，转移后被结算两次"的问题。
3. 与傀体②强联动：单目标牌（含乐不思蜀等延时锦囊）被转移到自己身上时，useCardToTarget 会对"你"再次触发，傀体②照常触发（②已不限定牌的类型，任意转移过来的单目标牌都稳定赚一张；引擎循环自动实现，无需额外代码）。
4. 与傀体①联动：转移过来的【杀】造成伤害后，当前回合角色失去等量张牌，形成"打傀儡指定的目标 = 亏牌"的威慑闭环。

**实现要点：**
- **触发**：`global:["roundStart","useCardToTarget"]`。roundStart 为每轮开始的全场时机（content.js 在回合初始化且 isRound 时触发），filter 用 `name` 区分。
- **指定存储**：`player.storage["移魂"] = target` + 轮数戳 `player.storage["移魂_round"] = game.roundNumber`，`markSkill("移魂")` 刷新标记；`intro.content(storage)` 读取 storage（Player 对象）显示"当前指定：XXX"，目标死亡时显示"（已阵亡）"。
- **"直到本轮游戏结束"的落地（轮数戳）**：`game.roundNumber` 在 roundStart 触发**之前**已同步自增（content.js 回合初始化步骤内 `game.roundNumber++` → `await event.trigger("roundStart")`），故指定时戳下当前轮数，filter/content 校验 `storage["移魂_round"] === game.roundNumber`。这同时堵住一个隐藏边界：若某轮开始时你已阵亡（触发不生效、无法重新指定），中途复活后上一轮的指定不会跨轮生效；正常每轮 roundStart 会用新指定覆盖轮数戳，指定目标换人后旧目标立即失效（storage 被覆盖，从始至终只存一个目标）。
- **filter 的四道闸**（evt = `event.getParent()` 即 useCard 事件）：①`event.target === 指定角色`；②`event.player !== 指定角色`（该角色自己用牌不算）；③`event.player !== player`（"除你以外"）；④`evt.targets.length === 1 && evt.targets.includes(target)`（"唯一目标"）。
- **改目标（重点，参考官方流离 liuli）**：content 里 `evt.triggeredTargets2.remove(目标); evt.targets.remove(目标); evt.targets.push(player);`。useCard 的多目标循环全部读活跃的 `evt.targets`（getTriggerTarget 按 targets 与 triggeredTargets 的差集逐个发时机、效果按 `targets[num]` 取），故中途改 targets 即生效；被移除者不再进入后续时机与结算。因 filter 已保证"唯一目标且使用者非你"，此时你必然不在 targets 中，push 无需去重。
- **⚠️ 防死循环守卫**：两个"移魂"拥有者互相指定对方且互相成为目标时，仍会触发"转移 → 新目标再触发 → 再转移"的乒乓循环。守卫：转移前检查并在 useCard 事件上写 `evt["移魂_used"]`（playerid 数组），每名拥有者对同一次使用牌只转移一次（filter 与 content 双重校验）。
- **弹泡**：logTarget 函数——useCardToTarget 分支返回 `trigger.target`（被指定者），roundStart 分支返回 undefined（指定选择发生在 content 内，弹泡不指向目标，靠 game.log 记录）。

**关键 API：** `roundStart` / `useCardToTarget`（global 位，`event.target` 为当前目标、`event.player` 为使用者）/ `trigger.getParent()`（useCard 事件）/ `evt.targets` / `evt.triggeredTargets2` / `storage` 存 Player 对象 / `markSkill` / `intro.content`。

---

## 2.8 神貂蝉

### 2.8.0 魅魔

**文案：**
> 锁定技。你和拥有"魅"的角色：1、使用非虚拟牌指定唯一目标时，获得一枚"魅"，然后你摸一张牌；2、进入濒死状态时，你移去其所有"魅"并令其恢复等量点体力，若该角色为你，你额外摸等量张牌。

**设计点：**
1. 作用范围是"你和拥有'魅'的角色"：**貂蝉始终在列**（即使自己没有"魅"），其余角色须持"魅"才受①②约束——①②中"用牌/濒死"的主语是范围内角色，"你"（摸牌方）恒为貂蝉。（V3.x 的"缴税"式防御①已随本版整体移除，她的防御职责移交魅心。）
2. ①"魅"的积累引擎：**获"魅"的是用牌者**（主语承前省略，非目标）——范围内角色使用**非虚拟**牌指定**唯一目标**（目标不限）时，用牌者获一枚"魅"、貂蝉摸一张。"非虚拟"=有实体牌基础（转化牌用实体牌当别的牌，不算虚拟）；排除虚拟牌是为了堵魅祸的回充循环——魅祸的视为【杀】若触发①，炸 N 枚魅又全额回充（净耗 0）。
3. ②濒死续命：有"魅"的角色濒死时移去（销毁）其所有"魅"并恢复等量点体力；**濒死者为貂蝉自己时她额外摸等量张牌**——她的魅既是②的续命数值也是魅祸的爆发资源，濒死自回血同时补牌（回复量以魅数为准：魅少或伤害透支时照样进入求桃/死亡）。

**实现要点：**
- **两效果共用一个技能（全 global 位）**：`trigger:{global:["useCard","dying"]}`，filter 用第三个参数 `name` 区分、content 用 `event.triggername` 分支（踩坑#8/#23）。①挂 global `"useCard"`（每张牌一次性时机，trigger 即 useCard 事件本身，`targets` 已确定，踩坑#40）而非 useCardToTarget（逐目标时机）——"指定唯一目标"是用牌级语义，一次性时机每张牌至多结算一次；global 位全场询问，貂蝉自己的用牌同样触发。
- **"魅"的存储**：纯计数标记（非扩展区牌），用 `addMark/removeMark/countMark` 实现，载体是子技能 `魅魔_mark`（charlotte+sub+sourceSkill，`mark:true, marktext:"魅", intro:{name:"魅", name2:"魅", content:"mark"}`）。`addMark` 会自动 `markSkill` 挂显示；`gainMei(target, ±n)` 帮助函数统一加/减，减到 0 时 `removeSkill` 清理。
- **① filter/content**：范围（`user === player || user.countMark("魅魔_mark") > 0`）+ 非虚拟（`!get.is.virtualCard(event.card)`。`get.is.virtualCard(card)`，get/is.js：无 `cards` 数组或为空即虚拟——魅祸 `get.autoViewAs({name:"sha", isCard:true})` 无 `.cards` 判虚拟 ✓；转化/实体使用有 `.cards` 判非虚拟 ✓）+ 唯一目标（`event.targets?.length === 1`，目标不限；无目标牌不算"指定"）；content：`gainMei(trigger.player,1)` + `player.draw()`。
- **② filter/content**：filter 判 `dying.isIn() && dying.countMark("魅魔_mark") > 0`——**无魅不触发**（无事发生的锁定技触发只会白弹泡；貂蝉无魅濒死即正常死亡）。content：`num = countMark`；`gainMei(target,-num)`（销毁）→ `target.recover(num)`（recover 上限为体力上限）→ `target === player` 时 `player.draw(num)` 额外摸——dying 时机先于濒死求桃询问，回复后 hp>0 引擎自动跳过求桃（参见踩坑#50 的 dying/rescue 机制）；⚠️ 若伤害透支（如 hp=-3 而魅仅 1），回复后 hp 仍≤0，引擎继续正常求桃/死亡流程。
- **弹泡**：不手动 logSkill，引擎自动弹泡；`logTarget:"player"` 字符串式——①获魅的用牌者、②濒死者，两事件的弹泡主体都是 `trigger.player`。（旧版 `ai.effect.target` 威慑随"缴税"①移除而删除。）

**关键 API：** `global:"useCard"`（每张牌一次性时机，`trigger` 即 useCard 事件，`targets` 已确定，踩坑#40） / `global:"dying"`（濒死者为 `event.player`） / `get.is.virtualCard`（非虚拟判定） / `recover(num)`（上限为体力上限） / `addMark` / `removeMark` / `countMark`（计数标记三件套）。

---

### 2.8.1 魅心

**文案：**
> 当你成为其他角色使用牌的目标时，你可以选择一项：1、交给该角色一张牌，令其获得一枚"魅"并取消之；2、移去该角色一枚"魅"并取消之。

**设计点：**
1. 纯防御取消技，不再按用牌者性别分流（V3.x 的性别双分支已废弃）：两项都以"取消之"收尾——**①破财免灾**：送一张牌（文案未限定区域，"一张牌"=手牌区/装备区/木牛流马三处）并喂对方一枚"魅"；**②移魅免灾**：削对方一枚"魅"，免费。对方无"魅"且自己三处皆无牌时无法发动。
2. 与魅魔联动：①喂出的"魅"给对方魅魔①的资格（其用牌让貂蝉摸牌）与②濒死续命/魅祸弹药——对敌是双刃（喂资源 vs 保命），对友是回赠（如队友被借刀逼出的【杀】指向自己时，可还一张牌取消并喂魅）。
3. 两项皆可时玩家自选；AI 按态度分流——非友方移魅（免费且削其储备），友方交牌（还牌+喂魅）。

**实现要点：**
- **触发**：`trigger:{target:"useCardToTarget"}`（本技能语义即"你成为目标"，target 位正确）；`logTarget:"player"` 弹泡指向用牌者。filter：两项至少一项可选——`player.countCards("hes") > 0 || user.countMark("魅魔_mark") > 0`。⚠️ **区域规则**：文案"一张牌"未限定区域时=手牌区/装备区/木牛流马三处，位置码用 `"hes"`（木牛流马牌带 `glows` 混在手牌节点里，`"h"` 排除、`"s"` 仅选它，官方技能同款，如族战定 `position:"hes"`）；显式写"手牌"才是 `"h"`，写"区域内"才是 `"hej"`。
- **cost 三段**：先 `chooseBool` 是否发动（`get.effect(me, evt.card, evt.player, me) < 0` 才取消，友方回复等正面牌不取消）→ 两项皆可选时 `chooseControl().set("choiceList",[...])` 选一项（`result.index`：0=交牌、1=移魅，见踩坑#2 chooseControl 结果无 bool）→ 选"交牌"时 `chooseCard("hes", 1, true, ...)`（低价值优先；装备牌 `get.value` 高，AI 自然不会误交身上的装备）。选项经 `event.result.cost_data` 传给 content（踩坑#1：cost 的选项不自动传 content）。（chooseCardTarget 合并选择版已随改版弃用，其 filter 签名 `(card, player, target)` 教训保留在踩坑#53。）
- **content**：先 `trigger.getParent().excluded.add(player)` 取消（踩坑#17，仅令此牌对貂蝉无效），再按 `event.cost_data` 分支——交牌：`player.give(event.cards, user)` → `gainMei(user, 1)`；移魅：`gainMei(user, -1)`。
- **AI**：ai.effect.target 对带 damage 标签的牌下调威胁——用牌者持魅 [1, 0]（她可免费移魅取消）、仅可交手牌取消 [1, 0.4]。

**关键 API：** target 位 `useCardToTarget` / `chooseControl().set("choiceList",[])`（`result.index` 取选项，踩坑#2） / `cost_data`（cost→content 传自定义数据，踩坑#1） / `trigger.getParent().excluded.add`（取消目标，踩坑#17） / `player.give(cards, target)` / `lib.skill.魅魔.gainMei`。

---

### 2.8.2 魅祸

**文案：**
> 出牌阶段限一次，你可以移去一名角色的所有"魅"，然后令其视为对你指定的另一名其他角色使用等量张无视距离和次数限制的【杀】。

**设计点：**
1. "魅"的引爆器：选中一名有"魅"的角色（**含貂蝉自己**），移去其全部"魅"，令其视为对指定受害者使用等量张【杀】——攒的魅一次性变成爆发；拆敌方全魅则同时将其逐出魅魔范围（此后其用牌不再获魅、貂蝉不再因之摸牌）并断其②濒死续命。
2. **出牌阶段限一次**（V2 的无限使用会让"杀有魅貂蝉→貂蝉摸牌→再发动"无限循环，必须限次）。
3. 受害者是"另一名其他角色"：既非貂蝉、也非魅来源者；被拆光魅的受害者不再受魅魔②保护，可能真死。

**实现要点：**
- **主动技结构**：`enable:"phaseUse", usable:1, selectTarget:2, multitarget:true, multiline:true`；`filterTarget` 按选择顺序分流：`ui.selected.targets` 为空时选"魅来源者"（只判 `countMark("魅魔_mark") > 0`，**不排自己**），否则选"受害者"（判 `target !== player && !ui.selected.targets.includes(target)`）；`filter` 用双层 `game.hasPlayer` 判"存在有魅角色，且其之外另有角色可作受害者"。
- **content**：`num = user.countMark("魅魔_mark")` → `gainMei(user, -num)` 全移 → `for` 循环 num 次 `user.useCard(get.autoViewAs({name:"sha", isCard:true}), victim, false)`（视为使用天然无距离/次数限制、不耗实体牌；每轮校验双方 `isIn()`，中途死亡/离场即终止）。
- **AI**：`result.target` 分流——第一个目标：自己最优（`5+num`，亲自开火不拆人）、敌方 `num+2`（拆全魅+借刀）、友方 `att+num-3`（权衡借刀收益与拆掉其保命魅）；第二个目标（受害者）返回 `-attitude`。
- **联动**：视为【杀】是**虚拟牌**（`get.autoViewAs` 产物无 `.cards`），魅魔①的"非虚拟"限定将其排除——炸 N 枚魅就是净耗 N 枚，无回充循环；user 为其他角色时魅被移光已出范围，同样不触发。受害者濒死时魅魔②照常结算：有魅则移光续命、血线回正后继续挨杀，救不回或无魅时进入求桃；**真死则死亡结算完成后剩余杀终止**（循环开头 `isIn()` 守卫）。

**关键 API：** `usable:1`（每出牌阶段限一次） + `selectTarget:2` + `multitarget` + `ui.selected.targets` 分流式 `filterTarget` / `get.autoViewAs({name:"sha", isCard:true})` / `user.useCard(vcard, target, false)`（视为使用，无距离/次数限制） / `player.line(targets, "thunder")`。

---

## 2.9 武张飞

### 2.9.0 恣胜（恣胜 / 恣胜_effect）

**文案：**
> 锁定技。①当你使用或打出点数为3的整数倍的牌时，根据倍数依次执行对应的效果：1及以下倍，你摸一张牌，若此牌目标中包含其他角色，你获得其中一名其他角色的一张牌；2及以下倍，你使用的下一张牌无视距离限制；3及以下倍，你使用的下一张牌无视次数限制；4及以下倍，你使用的下一张基本牌可指定至多三个目标。②你的无点数牌的点数始终视为3。

**文案（注）：** `倍数 = 点数 / 3`（标准牌堆点数1~13，仅 3/6/9/12 四档；无点数牌经②视为3，即倍数1），第 i 档效果在**倍数 ≤ i** 时全部依次生效：点数3（及一切无点数牌）→全部四档+摸一张+获得目标一张牌（价值最高的牌），6→二三四档，9→三四档，12→仅第四档（2026-09-30 二次改版：效果一摸牌降为**一张**——配合②，丈八两牌合一杀若摸三张会形成"2换3"刷牌引擎，2换1 净亏杜绝循环；效果四限定**下一张基本牌**——避免顺拆/乐不思蜀/闪电/装备牌等非基本牌的多目标歧义；新增效果②**无点数牌的点数始终视为3**——覆盖显略的视为【杀】、丈八两牌合一杀等无实体基础的虚拟牌；2026-10-01 三次改版：效果一新增**获得其中一名目标的一张牌**——对其他角色用牌时的额外进账，打出（respond）无目标天然不生效；2026-10-05 四次改版：二档拆出**无视距离限制**、三档从"无法被响应"改为**无视次数限制**）。豪贤生效期间（见 2.9.2）**指定点数**的牌均触发恣胜且四档全含（摸一张 + 获得目标牌 + 2/3/4档叠加授予）。

**设计点：**
1. 点数3核心：倍数越小命中的档位越多（"倍数≤i"全含式判定），价值最高的牌是3而不是各点数各有价值——鼓励围绕点数3组织手牌（用户明确的设计原则）。
2. ②"无点数牌的点数始终视为3"：把显略的视为【杀】、丈八两牌合一杀等无实体基础的虚拟牌纳入恣胜引擎（视为3→触发全部四档+摸一张）；1倍摸牌相应降为一张，丈八 2换1 净亏、不形成刷牌循环（用户明示的改版动机）。
3. "下一张牌"语义的落点：延迟增益用 `恣胜_effect` 附属技承载，storage 为**倍数数组**（如 `[3,4]` 或豪贤期间的 `[2,3,4]`），多档可叠加，`intro.content` 按 storage 展示当前待生效增益。
4. ④限基本牌：目标扩张只对杀/闪/桃/酒等基本牌生效，锦囊（顺拆双目标、闪电无目标）与装备牌的多目标歧义不纳入。
5. 1倍新增"获得其中一名目标的一张牌"：对其他角色用牌时（杀/锦囊/AOE 等有目标者）额外抢一张牌；打出无目标不生效。候选限定为有牌可被获得的目标（`countCards("hej") > 0`），`chooseTarget` 限候选 + `gainPlayerCard(target, "hej", true)` 两步落位（踩坑#54 区域码）。
6. 豪贤期间"所有效果对指定点数生效" = **指定点数的牌触发恣胜且一律四档全含**（摸一张 + 获得目标牌 + `[2,3,4]` 满档；2026-10-05 改版：光环从"3的倍数满档"改为"指定点数满档"——指定非3倍数点数即扩大触发范围，指定 6/9/12 即补全缺失档位、指定3无提升（本就全含），光环由此**重新进入恣胜 filter**：指定点数的牌必须先能触发才能全档生效）。

**实现要点：**
- **授予/消耗时机选 `useCard`/`respond`（使用/打出时）**：useCard 时机位于 useCard1/useCard2 之后、牌效果结算之前——摸三张/授予随使用**立即**结算（挂 `useCardAfter` 会变成整张牌结算完毕后才触发，五谷丰登点数3"结算结束才摸牌"的体感错误即源于此）；旧增益的消耗也放本时机：本张牌的选取阶段 mod、useCard2 直击均已生效完毕，且在同一触发器内**先消耗后授予**，顺序确定，规避同时机两个触发器的排序竞争。**打出只授予不消耗**——增益文案的效果均只针对"使用的下一张牌"，打出（respond）不该白白浪费待生效增益。
- **消耗守卫在 filter**：`点数为3的倍数 || 豪贤指定点数 || (useCard 且 hasSkill("恣胜_effect"))`——有待生效增益的"使用"时**必定触发**（哪怕本张牌点数不合格），保证增益一定在本张牌上生效后移除，不会永久滞留；filter 用第三参数 `name` 区分 useCard/respond（踩坑#8）。豪贤光环**进入 filter 判定**（2026-10-05 起光环可扩大触发范围至指定点数——指定点数的牌必须先能触发才能全档生效，故 filter 查 `hasSkill("豪贤_aura") && getStorage("豪贤_aura").includes(num)`），content 里同样判定以决定是否满档生效。
- **多档授予**：`bei<=1`（或豪贤指定点数）先 `draw()` 一张 + 若此牌目标含其他角色则 `chooseTarget` 限候选 → `gainPlayerCard(target, "hej", true)` 获得一张；再 `for i in 2..4` 收集所有 `bei<=i` 的档位成数组一次授予（点数3及无点数牌→`[2,3,4]`，6→`[2,3,4]`，9→`[3,4]`，12→`[4]`），豪贤指定点数的牌数组覆盖为 `[2,3,4]` 满档。
- **②无点数视为3**：不走 `mod.cardnumber`（checkMod 覆盖守卫对 null 基数恒为 true——`typeof null === "object"`，mod 返回值必被丢弃，见踩坑#60 修正记录）——改为 extension.js 顶部对 `get.number` 的外层补丁：原函数返回 null 且牌主拥有恣胜时返回 3，filter/content 及任意查询方的 `get.number(card, player)` 自动跟随；"unsure" 在原函数内提前返回、不经补丁，由 filter 的 typeof 兜底。
- **延迟增益载体 `恣胜_effect`**：charlotte+sub+sourceSkill，**纯 mod 载体（无 trigger）**——旧3档"无法被响应"的 useCard2 直击已随 2026-10-05 改版移除，3档并入 `mod.cardUsable`，不再是触发技（历史上曾**必须 `forced:true`**，踩坑#59：触发类附属技缺 forced，每次生效前都会弹"是否发动"取消框；改版后无 trigger 自然无询问）；`mark:true + marktext:"恣" + intro.content(storage)` 展示；storage 为倍数数组，`onremove` 清 storage。各档落地：
  - **2倍（无视距离）**：`mod.targetInRange` 返 `true`（踩坑#42：不匹配时隐式 undefined，不得返 false）。
  - **3倍（无视次数）**：`mod.cardUsable` 返 `Infinity`。
  - **4倍（下一张基本牌至多三目标）**：`mod.selectTarget` **原地修改** `range[1] = Math.max(range[1], 3)`，**仅对 `get.type(card) == "basic"` 的牌生效**（`range[1]==-1` 表示无上限需排除——mapodoufu 同款；charlotte 技能的 mod 照常生效，getModableSkills 只过滤 `info.mod` 存在性）。（原4倍"不计入次数"的 nocount 模板应用已随首轮改版删除，见踩坑#58 通用参考；原3倍"无法被响应"的 directHit 方案见踩坑#20 通用参考。）
- **数字兜底**：`get.number(card, player)` 对无点数牌经外层补丁已返回 3，filter/content 以 `typeof num == "number" && num > 0` 兜底 `"unsure"` 等钩子外情形。
- **AI**：锁定技无需选择；`恣胜_effect` 的 `ai.notemp` 防止 AI 误判临时技。无实体牌的虚拟杀（显略①、丈八合杀）经②视为点数3，常规期间即触发恣胜（摸一张+满档延迟增益）——显略①→恣胜形成链式引擎。

**关键 API：** `useCard`/`respond`（使用/打出时机，useCard 在 useCard1/2 后、牌效果前） / `get.number(card, player)`（虚拟牌取基础牌点数；无点数经 get.number 外层补丁返回3） / **`get.number` 外层补丁**（extension.js 顶部，"无点数视为X点"，踩坑#60 修正） / `mod.selectTarget`（**原地修改** range 数组，`range[1]==-1` 无上限） / `mod.targetInRange`/`mod.cardUsable`（返 `Infinity` 无视次数） / **附属技隐藏出技能列表**（`nopop:true`，踩坑#61；触发类附属技必须 forced 的要求见踩坑#59，恣胜_effect 已无 trigger 不适用） / `chooseTarget(true, prompt, filter)` 限候选 + `gainPlayerCard(target, "hej", true)`（获得目标一张牌） / `getStorage`（默认返回 `[]`） / `onremove` 清 storage。

---

### 2.9.1 显略

**文案：**
> 出牌阶段限三次，你与一名其他角色依次展示一张手牌，然后根据这两张牌的点数执行对应效果：1、点数之和不为3的整数倍，你获得这些牌并视为对其使用一张不计入次数限制的【杀】；2、点数之和为3的整数倍，你与其各摸一张牌并令你的【显略】的发动次数上限+1。

**文案（注）：** 2026-09-30 改版：三分支简化为两分支（原"点数之差摸牌"分支删除）；"各展示"改"依次展示"——张飞先亮牌，目标**看到张飞的牌后再**选。判定：`(n1+n2)%3 != 0` → ①，否则 → ②。2026-10-05 改版：限次从"每名其他角色限一次"改为**出牌阶段限三次**；展示牌从"一张牌"（hes 含装备区）收窄为**一张手牌**；②从"令【豪贤】视为未发动过"改为"令显略发动次数上限+1"（**永久、不封顶**——用户确认；①的"不计入次数限制"效果保留，2026-10-06 应用户要求补回文案）。

**设计点：**
1. 依次展示的博弈：张飞先亮牌，目标针对性回应——**无论敌友，目标均优先凑"和为3的倍数"**（②分支：自己白赚一张+免①的抢牌挨杀；帮张飞涨上限属长期代价，短期止损优先；2026-10-05 起敌方不再有"主动吃①断豪贤刷新"的动机——②已不重置豪贤）。无 need-mod 牌时被迫吃①（失去一张低价值牌+挨一刀）。
2. ②分支的"+1"永久生效且不封顶：`usable` 动态读取同名标记，标记+1 后**本阶段内立即可再发动**（巡使→神裁的同款联动写法）；上限跨回合滚雪球，豪贤的 X 随之增大——上限不封顶为用户明示的设计决定。
3. ①分支的视为【杀】不计入次数：创建 useCard 事件后置 `addCount=false` 再 await，不消耗本回合出杀次数（效果保留、文案省略——用户确认）。张飞自己的展示牌两分支都不会失去（①的 gain 对自己手牌区已有的牌跳过转移、②不移动牌）。

**实现要点：**
- **限次**：`enable:"phaseUse"` + `usable(skill, player) { return 3 + player.countMark("显略"); }`（巡使 shencai 同款：usable 函数动态读取**同名标记**，`mark:true + intro` 展示当前上限，`onremove:true` 失去技能时清标记；②触发时 `player.addMark("显略", 1, false)` 即永久+1，无封顶）。原"每名其他角色限一次"的 `显略_used` 临时技方案已随 2026-10-05 改版删除（含 translate 条目）。⚠️ filterTarget 另需"目标有**手牌**可展示"守卫（`countCards("h") > 0`）——目标无手牌时强制 `chooseCard` 会无牌可选。
- **发动即选牌指定目标（2026-10-01 改版）**：`filterCard:true + position:"h" + selectCard:1 + discard/lose/delay:false + filterTarget + selectTarget:1`（chongxin 同款写法）——发动技能时**一次性**选展示牌与目标，content 里 `event.cards[0]` 取所选牌（`discard:false/lose:false` 下牌不失去、仅记录）；省去原"先选目标→再选牌展示"两步中选目标后单独选牌的环节。⚠️ 2026-10-05 起展示牌收窄为**手牌**（原 `"hes"` 含装备区，踩坑#54 区域码）。
- **依次展示**：发动时已选定自己的牌 → `player.showCards([我的牌])` 亮出 → `target.chooseCard("h"…, true)`（目标**能看到已亮出的牌**再选）→ `target.showCards([其的牌])`。
- **两分支判定**：`(n1+n2)%3 != 0` → `player.gain([我的牌, 其的牌], "gain2")`（**gain 自动从原持有者区域移牌**，自己手牌区已有的牌自动跳过）→ 视为【杀】不计入次数；否则 → 双方各 `draw()` 一张 + `player.addMark("显略", 1, false)` + `game.log`（原 `restoreSkill("豪贤")` 复原逻辑已随 2026-10-05 改版删除）。
- **视为【杀】不计入次数**：`const useEvt = player.useCard(get.autoViewAs({name:"sha", isCard:true}), target, false); useEvt.addCount = false; await useEvt;`——创建事件后、await 前置 addCount=false，跳过引擎 stat 自增点（useCard content 开头即执行、先于 useCard1），**无需** stat 回退（踩坑#58 场景②）。另：该视为【杀】无实体牌基础，经恣胜②视为点数3——使用它会触发恣胜1倍（摸一张+获得目标牌+满档延迟增益），显略→恣胜链式联动。
- **目标 AI（2026-10-05 更新）**：`r = get.number(张飞的牌) % 3`，`need = (3-r) % 3`（展示 mod 为 need 的牌即凑成"和为3的倍数"）；评分 `满足 ? 20 - value : -value`——有 need-mod 牌时凑②选价值最低的，无 need-mod 牌时出价值最低的吃①（2026-10-05 起无论敌友均凑②：②已不重置豪贤，敌方无"主动吃①断刷新"的动机）。
- **张飞自身 AI**：`ai.check` 展示牌不会失去，低价值优先（`6 - get.value`）；`ai.result.target` 队友 2（②各摸一张+上限永久+1，纯收益）、敌方 1.5（对方凑②止损或被迫吃①，期望为正）、不确定 0.5（原"已发动豪贤优先打队友"的豪贤判断已删除）。

**关键 API：** `enable:"phaseUse"` + `usable(skill, player)` 函数动态限次（巡使 shencai 同款） / **同名标记作次数上限**（`mark:true + intro.markcount/content + onremove:true`，`addMark(技能名, 1, false)` 永久+1） / `filterCard:true + discard/lose/delay:false + event.cards`（发动即选牌指定目标，chongxin 同款） / `filterTarget`（签名 `(card, player, target)`，踩坑#53） / `player.showCards → target.chooseCard → target.showCards`（依次展示链） / `player.gain(cards, "gain2")`（gain 自动从原持有者移牌、跳过自己手牌区已有的牌） / `get.autoViewAs({name:"sha", isCard:true})` + `player.useCard(vcard, target, false)`（魅祸同款视为使用） / **创建时置 `addCount=false`**（跳过统计自增，无需回退，踩坑#58 场景②） / `getStorage` 默认 `[]`。

---

### 2.9.2 豪贤

**文案：**
> 限定技。出牌阶段，你可以令【恣胜】的所有效果均可对你指定的至多X个点数的牌生效（X为你的显略发动次数上限），直到你的下个回合开始。

**文案（注）：** 2026-10-05 改版定稿：指定点数制——X = 显略发动次数上限（基础3 + 显略②累计的+1，**不封顶**，用户确认），从1~13中**任意点数均可指定**（含3的倍数点数，用户确认）。各点数被指定后的提升：非3倍数（1/2/4/5/7/8/10/11/13）从"不触发恣胜"→"触发且四档全含"（提升最大）；Q/12 缺一二三档→全含；9 缺一二档→全含；6 缺第一档→全含；3 本就四档全含（指定无提升）。（历史：原版"任意点数的牌"→2026-10-01 削弱为"3的倍数满档"→2026-10-05 改为"指定点数满档"。）

**设计点：**
1. 恣胜的爆发引擎：开启后直到下个回合开始，**指定点数的牌**均使恣胜**全部效果**生效（摸一张 + 获得目标牌 + 2/3/4档延迟增益叠加授予；无点数牌经恣胜②视为3，点数3不在指定范围时也照常按倍数规则触发）；指定非3倍数点数即**扩大触发范围**（2026-10-05 起光环重新进入恣胜 filter），指定 6/9/12 即**补全缺失档位**。
2. X 与显略联动：显略②每触发一次上限永久+1（不封顶），豪贤的指定名额随之增长——"显略滚上限→豪贤多指定"的新联动取代原"显略②重置豪贤"循环（该循环已删除，豪贤现在一局只能开一次）。
3. 时效"直到你的下个回合开始"：相天2 同款 `addTempSkill(skill, {player:"phaseBeginStart"})`——出牌阶段使用，下一次 phaseBeginStart 即下个自己回合开始，精确落地"直到你的下个回合开始"。

**实现要点：**
- **主动限定技**：`enable:"phaseUse" + limited:true`，filter 查 `!player.storage.豪贤`（awakenSkill 置 storage[豪贤]=true 并经 `_awake` 禁用技能，双闸门）。原显略②的 `restoreSkill` 复原逻辑已随 2026-10-05 改版删除，豪贤一局仅一次。
- **指定点数交互（2026-10-06 改为两行多选网格）**：X = `3 + player.countMark("显略")`；**自建 dialog**（`ui.create.dialog(提示, "hidden")`，交由 chooseButton 打开）+ 13 个点数按钮排**两行 flex 网格**（第一行7、第二行6——textbutton 单列长列表需下拉且两端对齐过宽，弃用）。自建按钮与内置完全同轨：`ui.create.div(".button.card.pointerdiv.mebg", 行容器)`（sortcard 位置选择同款纯文本按钮）+ **内联样式定尺寸/居中**（不依赖查不到的主题 CSS）+ `button.link = 点数数字` + `button.listen(ui.click.button)` + **推入 `dialog.buttons`**——`game.check` 的 checkButton 遍历 `event.dialog.buttons` 自动管理 selectable/selected，无需 Button 类原型；`selectButton: [1, X]` + `forced: true` 至少选一（不白发动）、至多选X；`result.links` 经 `get.links`（收集 `button.link`）直接得到点数数字数组；storage 在 `addTempSkill` 之前写入：`player.storage.豪贤_aura = chosen`。
- **光环载体 `豪贤_aura`**：charlotte+sub，`mark:true + marktext:"贤" + intro.content(storage)`（展示指定的点数列表），`addTempSkill("豪贤_aura", {player:"phaseBeginStart"})` 挂载，到期自动移除，`onremove:true` 清 storage；恣胜 **filter 与 content** 均查 `hasSkill("豪贤_aura") && getStorage("豪贤_aura").includes(num)`（2026-10-05 起光环**重新进入恣胜 filter**——指定点数的牌必须先能触发才能全档生效；content 中 `isAura` 时第一档强制执行、档位数组覆盖为 `[2,3,4]` 满档）。带"豪贤_aura_info"翻译条目、未设 nopop，悬停技能列表可见。
- **AI（指定点数）**：chooseButton 的 ai 为**逐按钮打分**（引擎自动取最高分至 selectButton 上限），手牌点数分布预统计一次经 `.set("counts")` 传入；单按钮得分 = "手牌中该点数的牌数 × 指定提升幅度"（非3倍数幅度3、12幅度3、9幅度2、6幅度1、3幅度0——提升幅度即缺失的档位数），点数3得分恒 0 不会被选中。

**关键 API：** `enable:"phaseUse"` + `limited:true` + `awakenSkill`（限定技标准闸门） / **自建 dialog 的 chooseButton 多选**（`ui.create.dialog(提示, "hidden")` 自由布局 + 自建按钮推入 `dialog.buttons`：`link` 携带任意值、`listen(ui.click.button)` 接入点击、check 流程自动管理 selectable/selected——`selectButton: [min, max]` 多选、`forced` 保证最少选数、`get.links` 收集 link；比 `textbutton` 文本按钮多出布局自由度——自建 flex 行可网格排列，避免单列下拉；chooseControl 无多选能力） / `storage.豪贤_aura` 写入时机在 `addTempSkill` 之前 / `addTempSkill(skill, {player:"phaseBeginStart"})`（"直到下个回合开始"时效，相天2 同款） / `mark:true + marktext + intro.content(storage)` 数组式标记。

---

## 2.10 神左慈

### 2.10.0 幻魂

**文案：**
> 锁定技。一名角色受伤害时，你选择一项：1、摸一张牌；2、弃一张牌并令其回复一点体力；3、若你此法获得的技能数小于你的体力上限，你观看武将牌堆中的五张牌并获得其中一个技能；4、失去一个通过【幻魂】获得的技能，然后令一名其他角色失去一个技能直到其下个回合结束。

**设计点：**
1. 神左慈的"发动机"：任意角色（含自己）受伤即触发，四选一：①摸牌（兜底）、②弃牌回复（护伤者）、③观堆滚池（免费拿技）、④弃池技封敌。每次触发只选一次，无循环。
2. 单时机 global 挂法："一名角色"不再区分自己/他人——任意伤害事件只从受伤侧（damageBegin4）触发一次，自伤（火攻等）照常触发。幻劫的"失去体力"不是伤害，不触发幻魂。
3. 选项2的回复在扣体力之前结算（damageBegin4 时机）：受伤者先回1点再挨打，等效抵消1点伤害——满血者无法回复，该选项自动隐藏；体力=伤害值时回1再扣恰好不再濒死。
4. 技能来源只有"剩余武将牌堆"：`initCharacterList` 已把场上角色剔出牌堆，两者天然不重叠；观看式复制（牌不离开牌堆，参考挈挟），不与化身（抽走式）争牌。
5. 选项3自带配额条件"此法获得的技能数<体力上限"（见设计点6）且牌堆有候选；选项2需有牌可弃且受伤者未满血；选项4需池非空且有可封目标。不可行选项不进 controls，choiceList 亦同步动态构建（不可行选项不显示文案）；全不可行时仅剩选项1直接执行（百战式）。
6. 选项3配额=体力上限（固定口径，不再随场上人数缩水）：判定口径为"当前持有的所得技数"<体力上限——弃技（幻魂④/幻生）可腾出配额，至多回到体力上限个。
7. 与幻劫/幻生的闭环：幻魂攒的技能既是幻魂④的封敌弹药，也是幻生的复活燃料；幻劫的直伤（每轮至多一次）仍会作为"一名角色受伤害"喂幻魂滚池。

**实现要点：**
- **触发**：`trigger:{global:"damageBegin4"}`（"受伤时"=扣体力前，踩坑#8/#23 同源）：`trigger.player` 即受伤者，`logTarget:"player"` 字符串式弹泡指向对方。filter 判 `event.num > 0`（0点伤害不算伤害）且受伤者在场。`forced:true + locked:true`。
- **单次抉择**：content 构建可行性 `options`：选项1恒可行；选项2需有牌可弃（`countCards("he")>0`）且受伤者未满血（`victim.hp < victim.maxHp`，满血回复无意义不进选项）；选项3需配额未满（`getGained(player).length < player.maxHp`）且牌堆有候选（`getPileCandidates`）；选项4需池非空且场上有 `banCandidates` 非空的其他角色。**仅剩选项1时直接执行不弹窗**（百战式，避免 choiceList 与单项按钮错位）；多项时 `chooseControl`（无 `cancel2`，锁定强制）+ choiceList 同步动态构建，prompt 附当前持有数与配额（体力上限）。
- **选项2**：`chooseToDiscard("he", true, 1)` 弃一张牌（含装备区）→ `victim.recover(1)`——回复发生在扣体力前，等效减伤1点/抢救"体力=伤害值"的濒死边缘角色。
- **选项4解除时机**（同止涕"下一个回合结束"，见踩坑#49/#51）：`disableSkill("幻魂", skill)` 挂 `disabledSkills`（触发/主动使用/mod 被动/skillTag 全失效），解除用 when 钩子 + **止涕式 filter 排除当前回合**：`.filter((evt) => evt != event.getParent("phase"))`——回合外封技→下一次 phaseEnd 即其下个回合结束；其回合内封技→顺延一回合（phaseEnd 不像 phaseBegin 天然无歧义，必须排除）。
- **辅助函数挂 `lib.skill.幻魂`（幻魂/幻生共用）**：
  - `getSkills(target)`：取角色技能（兼容 name/name1/name2 三槽）。
  - `getPileCandidates(player)`：`_status.characterlist`（未初始化则 `game.initCharacterList()`）中拥有"你可获得技能"的武将列表；固定取5个用 `candidates.randomGets(5)`（引擎数组扩展，自动截断越界）。
  - `getGained(player)` / `recordGain(player, skills)` / `removeGained(player, skills)`：技能池 `player.storage.幻魂_pool = [技能名...]`，查询时再过 `hasSkill` 过滤——只列"当前拥有的"，失去后 `remove` 出池。选项3配额判定即 `getGained(player).length`（持有数口径）与体力上限比较，见设计点6。
  - `gainFromPile(player)`：**观看武将牌堆中的五张**（幻魂选项3专用；参考 onlyOL 挈挟 qiexie 的 characterlist 用法，但不移除武将牌）：`chooseButton([列表, "character"])`（内建武将按钮，hover 显示武将技能）选一名 → `chooseButton([技能, "skill"])` 选一个 → `addSkills` + 入池。
  - `banCandidates(target)`：可封技候选（幻魂④专用）：`getSkills(target)` ∩ `target.hasSkill` ∩ 非 `charlotte`。
- **AI**：受伤者是友方且这1回复能救命（`victim.hp ≤ trigger.num`）→ 优先选项2；否则优先选项3免费滚池；持 `charlotte` 鸡肋技优先选项4封敌；友方受伤时选项2仍优于摸牌；兜底选项1摸牌。`ai.effect.target` 对持有幻魂的目标降伤害价值（`[1, -0.1]`，打他白喂触发）。

**关键 API：** `global:"damageBegin4"` / `trigger.num` / `logTarget` 字符串式 / `forced` / `locked` / `chooseControl` / `chooseToDiscard` / `draw` / `recover` / `disableSkill(禁用者, 技)` / `when({player:"phaseEnd"}, false) + filter` / `_status.characterlist` / `game.initCharacterList()` / `randomGets` / `chooseButton([list, "character"])` / `addSkills` / `hasSkill` / `storage` / `ai.effect.target`。

---

### 2.10.1 幻劫

**文案：**
> 游戏开始或当一轮游戏结束时，你可以失去一点体力并对一名其他角色造成一点伤害。

**设计点：**
1. 定时直伤引擎：游戏开始、每轮结束各一次"以1体力换1直伤"的可选时机，不再循环、不再摸牌交牌——轻量补伤，按需取舍。
2. 先支付后结算：先失去1点体力（loseHp 非伤害，不触发幻魂），再对选定的目标造成1点伤害。体力为1时强行发动会进入濒死（规则允许，AI 永不为之）；未被救回则死亡流程中，无从结算伤害。
3. 与幻魂咬合：对目标造成的1点伤害即"一名角色受伤害"，仍会喂左慈自己的幻魂滚池——每轮至多一次的直伤稳定换1次幻魂触发。

**实现要点：**
- **触发**：`trigger:{global:["gameStart","roundEnd"]}`——`gameStart` 同魂契挂法；`roundEnd` 在 round 事件收尾处触发（content.js），即"一轮游戏结束时"的标准挂点。filter 判 `player.isIn()` 且场上有其他角色。
- **可选触发**：不再 locked/forced；挂 `prompt:"是否发动【幻劫】？"` 由引擎自动弹 chooseBool（踩坑#31，同幻生），AI 取舍用 `check`（content.js:3604：`next2.ai = () => !check || check(...)`）——体力≤1 恒不打（发动即濒死），且需场上有敌对角色（`get.attitude < 0`）。
- **content**：`loseHp(1)` → `isIn()` 兜底（未被救回则终止）→ `chooseTarget(true, ...)` 强制选一名其他角色 → `target.damage(1, player)`。

**关键 API：** `gameStart` / `roundEnd` / `prompt` 属性自动 chooseBool / `check` / `loseHp(1)` / `chooseTarget(true)` / `target.damage(1, player)`。

---

### 2.10.2 幻生

**文案：**
> 当一名角色死亡时，你可以失去一个通过【幻魂】获得的技能并令其恢复体力值至1点。

**设计点：**
1. 复活引擎（"死亡时"的口径同夺魂）：技能池即复活燃料——弃一个所得技，把一名濒死角色（含自己）从死亡边缘拉回至1点体力。对象不限友方，文案只写"一名角色"。
2. 挂 `_saveAfter` 而非 `death`：求桃失败、正式 die 之前，濒死者仍在场，`recoverTo(1)` 即可阻断后续 die——不产生"死而复生"的结算残渣（击杀奖惩、阵亡离场均未发生）。
3. 只换一个技能："一个"而非"任意个"，复活单价固定；池空时技能整体失效（filter 拦）。消耗使幻魂③持有技数-1（腾出配额），与幻魂④同源（见2.10.0设计点6）。

**实现要点：**
- **触发**：`trigger:{global:"_saveAfter"}`（同夺魂，踩坑#3：濒死角色在 `event.dying`）。filter 判 `event.dying` 存在且 `isIn()`/`isDying()`（若已被其他技能救回则不再触发），另判池内有当前拥有的技能。非锁定（"可以"）——设 `prompt` 属性由引擎自动弹 chooseBool（踩坑#31），`logTarget:"dying"`；AI 取舍用 `check` 函数（content.js:3604：`next2.ai = () => !check || check(...)`，本引擎触发询问不吃 `ai.result.player`）：自己濒死必救，友军救，敌方不救。
- **流程**：`chooseButton([池内技能, "skill"], true)` 强制单选（AI 先换非 combo 低价值技）→ `removeGained`（`removeSkill` + 出池，自动弹失去泡）→ 目标 `isIn()` 且 `hp < 1` 时 `recoverTo(1)`。`hp<1` 守卫：多个救人技同触发时若他人已先救回，`recoverTo(1)` 会算出负增量（recoverTo 即 `recover(num-hp)`），须跳过。
- **自救可行**：触发询问的 chooseBool 由引擎自动带 `forceDie`（content.js:3602），幻生持有者自己濒死时也能作答；_saveAfter 时点尚未真正死亡，content 正常执行。

**关键 API：** `_saveAfter` / `event.dying` / `prompt` 属性 / `check` 函数 / `logTarget` / `isDying` / `chooseButton([...], true)` / `removeGained` / `recoverTo(1)` / `getGained`。

---

# 3 踩坑记录

1. **cost 的选项不传给 content**：手动 `event.result.cost_data = ...`（止涕/相天）。
2. **`chooseControl` 结果没有 `bool`**：只能 `control==="cancel2"` 判取消（止涕）。
3. **`_saveAfter` 里濒死角色在 `event.dying`**，不是 `event.player`（夺魂_rescue）。
4. **扩展区牌无法点选**：`selectCard:-1 + position:"x"` + `precontent` 里自己定 `event.result.cards/card`（归訫_use）。
5. **`lose`/`give` 清掉非 `eternal_` 的 gaintag**：移牌后重新 `addGaintag`（七煋、归訫）。
6. **牌堆顶的牌无主**：不能 `loseToDiscardpile`，用 `ui.cardPile.insertBefore` 插回（七煋）。
7. **mod 同层 last-write-wins**：手牌上限硬锁用最高层 `maxHandcardFinal`，避免被偷来的 `maxHandcardBase`（七弦/冯河）覆盖（夺魂③）。
8. **filter 第三个参数 `name`** 是多时机触发时区分时机的方式（七煋/相天/飛影）。
9. **`getIndex` 控制"每 X 点触发一次"**：`Math.abs(event.changedHp)`（归訫②）。
10. **技能来源追踪**：`player.storage.夺魂_sources = {技能名: 来源角色或"武将牌堆"}`，丢技时 `delete`，供魂契③/夺魂共用（保持数据一致；哨兵字符串不与任何玩家对象相等）。
11. **锁技能恢复**：监听 `player:"dying"` + `onremove` 兜底，避免技能永久丢失（止涕_lock）。
12. **`trigger.player` vs `player`**：前者是事件主体，后者是技能拥有者，别混。
13. **"每回合限一次"**：`addTempSkill("xxx_used")` + `charlotte` 临时技，或 `storage` 数组 + 回合开始重置（飛影）。
14. **复活 = `recoverTo(1)`** 在 `_saveAfter` 内执行即可阻止后续死亡结算。
15. **扩展区标记牌 gaintag 必须与技能名一致**：lose 事件只对 **gaintag == 技能名** 的标记自动 `markSkill`/`unmarkSkill` 刷新（content.js lose 的 `unmarks` 循环），用展示名作 gaintag 会导致标记永不更新；且 **`addToExpansion` 不自动刷新**，放牌后需显式 `player.markSkill("技能名")`。⚠️ 当**同一资源被多个技能阶段共用**时（神徐盛"疑兵"：疑兵觉醒期 → 疑城接管），gaintag 应取**最终承载标记的技能名**（"疑城"），展示名经 `intro.name` 呈现（疑兵/疑城）。
16. **`chooseCard` 勿用 `[0,X]`**：最小0时"确定"按钮无意义（不选牌点确定等同取消，只有选牌后才出现真正生效的确定）。应**先用 `chooseBool` 问"是否发动"**，确认后再 `chooseCard("hej",...,[1,X])`（至少选1张）（疑兵）。
17. **令牌对单目标无效**：`useCardToTarget` 时机用 `trigger.getParent().excluded.add(player)` 令该牌只对目标自己无效（参考娴辅；疑城_negate）。
18. **"不计入次数"**：chooseButton backup 的 `precontent` 里 `event.getParent().addCount = false`（natuheng 式），配合 `mod.cardUsable` 返 `Infinity` 实现"无视次数限制"（原疑城_sha ③，已随其移除，保留作通用参考）。
19. **jibing 式"类型+扩展牌"组合弹窗**（原疑城_sha ③，已随其移除，保留作通用参考）：vcard 按钮 link 是 `[type,"",name,nature]` 数组，用 `Array.isArray(button.link)` 区分类型按钮与牌按钮；多类型时 `dialog._chooseButton=2`、`select()` 返 `_chooseButton||1`；`backup` 里 `_status.event` 就是 chooseToUse/chooseToRespond 事件（可直接读 filterCard）；单类型模式（`dialog._cardName`）下 `backup` 的 `links[0]` 是扩展牌，需按事件过滤重新推断唯一可用类型。
20. **`useCard2` 时机**（破军/巡使）：只对"使用牌"触发（打出杀不触发）。可在 content 里 `trigger.directHit.addArray(trigger.targets)` 令无法响应、`trigger.targets.addArray(新目标)` 额外加目标、`trigger.baseDamage++` 加伤害；⚠️ 新增目标是否加入 directHit 需按设计自行决定（破军：仅当"①已移牌令全牌无法响应"时，新增目标才同样不可响应）。
21. **觉醒技（连续累积型）不能直接用 `awaken:true`**：`awaken:true` 首次触发即移除技能，而"攒够条件才觉醒"的技能需要多次触发。应**手动**：条件满足时 `player.addSkill(觉醒所得技)` 后再 `player.removeSkill(觉醒技)`（先加后删，使 onremove 通过 `hasSkill` 判断保留资源牌）（疑兵）。
22. **技能注册三要素缺一不可**：技能要在游戏中出现，必须同时满足：①`skill.js` 中有技能定义；②`character.js` 的 `skills` 数组中注册；③`translate.js` 中有 `技能名` 和 `技能名_info` 翻译条目。**缺任何一个技能都不会显示**。曾因只改了 `skill.js` 和 `character.js` 但漏了 `translate.js` 导致新技能（魂契）在游戏中完全不出现。
23. **多触发时机共用一个技能**：当一个技能需要在多个时机触发（如魂契的 `changeHp` + `phaseBegin` + `gameStart`），不能用 `group` 分离（会覆盖主技能 trigger，见#28）。正确做法：将所有 trigger 写在主技能的数组里，`filter` 用第三个参数 `name` 区分，`content` 用 `event.triggername` 分支。配合 `forced:true` 跳过引擎自动确认弹窗，由 content 内部的 `chooseBool`/`chooseControl` 控制交互。
24. **`markAuto` + `getStorage` 实现"每种标记最多一个"**：用 `target.markAuto("skill_mark", [value])` 追加标记值到 storage 数组，`target.getStorage("skill_mark")` 返回数组，检查 `owned.includes(value)` 判断是否已拥有。配合 `intro:{content(storage){...}}` 展示已有标记。相比旧式的"每种标记独立 `addMark`"方案，`markAuto` 更适合"多选一且不可重复"的标记系统（原止涕_mark，已随止涕改版移除，保留作通用参考）。
25. **Unicode 转义引号需统一**：JS 文件中的 `\u201c`/`\u201d`（中文左右双引号）在某些引擎环境下可能导致解析问题。建议统一替换为 `\"`（转义英文双引号）。可用 PowerShell 批量替换：`$content.Replace('\u201c','\"').Replace('\u201d','\"')`。
26. **跳过摸牌阶段**：`phaseDrawBegin2` 触发 + `trigger.changeToZero()`（张辽突袭式，`num=0`）实现不摸牌；牌堆顶无主牌用 `get.cards(n)` + `addToExpansion(cards, "draw")`（疑城①）。
27. **⚠️ 觉醒技动画机制（重要踩坑）**：`skillAnimation: true` 写在技能定义上时，`trySkillAnimate` 会在**每次 `logSkill` 调用时**播放动画，而非仅在觉醒时。对于"攒够条件才觉醒"的连续触发型觉醒技（如疑兵：每回合触发，但攒够牌才觉醒），会导致**每次触发都播动画**。正确做法：**不在技能定义上写 `skillAnimation`**，而是在 `content` 里觉醒条件满足时**手动调用** `player.$skill("技能名", "legend", "wood", "main")`，然后再 `player.awakenSkill()`。⚠️ 第4个参数 `"main"` 必须传，否则 `avatar` 为 falsy 会走 `playerfocus` 分支而非 `playerfocus2` 分支，动画效果不同（`trySkillAnimate` 在 `skill_animation_type == "default"` 时会设 `checkShow = "main"`）。引擎调用链：`logSkill` → `trySkillAnimate` → 检查 `lib.skill[name].skillAnimation` → `player.$skill(name, type, color, checkShow)` → `$legend(1200)` + `$fullscreenpop(name, color, avatar)`。
28. **⚠️ `group` 会覆盖主技能的 trigger**：当主技能有 `group:["xxx"]` 时，引擎用 group 中子技能的 trigger **替代**主技能自身的 trigger 进行匹配。若子技能只定义了 `trigger:{global:"_saveAfter"}`，则主技能的 `trigger:{global:"gameStart"}` 不再生效——`gameStart` 时引擎检查的是 `_saveAfter`，不匹配，整个技能静默跳过。**解决方案**：不用 `group`，将所有 trigger 写在主技能上（如 `trigger:{global:["gameStart","_saveAfter"]}`），用 `filter` 的第三个参数 `name` 和 `content` 里的 `event.triggername` 区分不同触发时机的逻辑。
29. **⚠️ `logSkill` 不执行效果**：`player.logSkill(skillName)` 仅显示技能名气泡动画+播放语音，**不会执行任何游戏效果**。不能用 `if(条件){ player.logSkill(skill); return; }` 来代替实际的 content 逻辑——这会导致技能看起来触发了（有动画），但实际什么都没发生。正确做法：在 content 里直接写效果逻辑，需要动画时在效果执行前调用 `logSkill`。
30. **⚠️ content 事件中 `event.skill` 为 `undefined`**：引擎 `createTrigger`（content.js）创建 content 事件时用 `game.createEvent(event.skill)` 但未设置 `next.skill`，导致 content 函数内 `event.skill` 为 `undefined`，`get.prompt(event.skill)` 显示"是否发动【】？"。cost 事件有 `next2.skill = event.skill` 所以正常。**不改引擎的解法**：用 `event.name` 代替 `event.skill`——因为 `game.createEvent(event.skill)` 以技能名作为事件名，`event.name` 即为技能名字符串。用法：`get.prompt(event.name)` 代替 `get.prompt(event.skill)`。同理，content 内手动 `logSkill(event.skill)` 传入 undefined 实际只画线、不记日志；触发技更优解法是在技能对象上设 `logTarget:"player"`（或函数），由引擎在触发时解析目标并自动记录“对目标发动了【技能】”+画线（止涕）。
31. **⚠️ `prompt` 属性 vs `direct: true` vs `forced: true`**：`prompt: "是否发动【技能名？"` 属性会让引擎**自动弹出 `chooseBool` 询问**（不设 `direct` 也不设 `forced` 时）。`direct: true` 则**完全跳过询问**，直接进入 content。`forced: true` 也跳过询问且无法取消。对于文案中有"你可以"的可选触发技能，应使用 `prompt` 属性，不需要设 `direct`/`forced`，也不需要在 content 里手动写 `chooseBool`（应天司马懿·戢鳞/英猷）。
32. **`get.cards(n)` 返回待处理区的牌**：`get.cards(n)` 从牌堆顶取 n 张牌，返回的牌在**待处理区**（ordering area），不属于任何玩家的手牌区。可以直接传给 `showCards`、`chooseCardButton`、`addToExpansion` 或 `target.gain`。典型模式（参考疑兵选项一）：`get.cards(2)` → `showCards` → `chooseCardButton` → `game.broadcastAll(ui.clear)` → 对选中/剩余牌分别处理。⚠️ 不要用 `player.draw(n)` + `player.getCards("h").slice(-n)` 的方式模拟"从牌堆取牌到待处理区"——那会先让牌进入手牌区再截取，语义不同且会触发不必要的 gain 事件（应天司马懿·戢鳞）。
33. **`addToExpansion` 的 gaintag 写法**：放牌到扩展区后设置 gaintag，正确写法是链式调用 `next.gaintag.add("tag")`，**不是** `.set("gaintag", ["tag"])`。后者会覆盖 gaintag 属性而非追加。放牌后需显式 `player.markSkill("技能名")` 刷新标记显示（踩坑#15 已提及，此处强调 API 写法差异）（应天司马懿·戢鳞）。
34. **`chooseControl` 用数组格式传参**：`chooseControl` 应传入**数组** `chooseControl(["选项一", "选项二", "cancel2"])`，而非散参数 `chooseControl("选项一", "选项二", "cancel2")`。散参数格式在某些引擎版本下可能导致控制值匹配异常。配合 `.set("prompt", "xxx")` 和 `.set("choiceList", [...])` 使用，参考相天/疑兵的写法（应天司马懿·英猷）。
35. **跨回合的牌无效效果（mark 计数型）**：对于"使用的前X张牌无效"这种跨回合持续效果，不能用 `addTempSkill`（会在回合结束时清除），应使用 `addSkill` 添加持久的附属技能，配合 `addMark`/`removeMark`/`countMark` 实现计数消耗。触发器用 `trigger: { player: "useCard1" }`，content 中 `removeMark` 并设 `trigger.all_excluded = true`，标记归零时 `removeSkill` 自行清理（应天司马懿·戢鳞_seal）。
36. **锁花色效果（牌禁用 mod 三件套）**：实现"不能使用或打出某花色的牌"效果，需同时设置三个 mod：`cardEnabled`（禁止使用）、`cardRespondable`（禁止打出/响应）、`cardSavable`（禁止救人），均检查 `get.suit(card)` 是否在禁用列表中。参考冠绝 ban 子技能的实现模式（应天司马懿·英猷_forbid）。
37. **非虚拟非转化牌判断**：在 `filter` 中排除虚拟牌（视为使用）和转化牌（当XX使用），可用条件 `!event.card.isCard && event.cards && event.cards.length === 1`。`event.card.isCard === true` 表示虚拟牌（如视为使用的杀）；`event.cards.length !== 1` 表示转化牌或多牌合并使用。参考神机的 filter 条件（应天司马懿·英猷）。
38. **⚠️ storage 的 owner 问题**：给目标角色添加附属技能时，附属技能的 `filter`/`content` 中读取 `player.storage.xxx` 读的是**目标角色**的 storage，不是发动者的。如果需要让附属技能知道"是谁发动的"，应把数据存在**目标角色**的 storage 上（如 `target.storage["xxx_source"] = player`），而非发动者身上（应天司马懿·戢鳞_effect）。
39. **⚠️ translate.js 中的引号编码**：`translate.js` 的字符串值内引用技能名/资源名时，必须使用中文弯引号 `\u201c`/`\u201d`（即 `"`/`"`），**不能**用 ASCII 双引号 `"`（U+0022）——那会被 JavaScript 解析器当作字符串结束符，导致 `SyntaxError: Unexpected identifier`。编辑 translate.js 时尤其注意：不要在替换操作中把弯引号替换为直引号。可用 `\u201c`/`\u201d` Unicode 转义写法代替直接粘贴弯引号字符（应天司马懿·英猷_info）。
40. **结束出牌阶段的正确做法**：参考巧说（reqiaoshui）`event.getParent(3).skipped = true`。对于 `trigger: { global: "useCard" }` 的技能，`trigger` 本身就是 useCard 事件，`trigger.getParent("phaseUse")` 可获取出牌阶段事件。⚠️ **必须在 `await useCard` 之前**保存 phaseUse 引用——`await` 之后事件链可能改变导致引用失效。正确模式：`const phaseUse = trigger.getParent("phaseUse");` → `await player.useCard(...);` → `phaseUse.skipped = true;`（应天司马懿·英猷）。
41. **内置技能的内部名 ≠ 中文显示名**：游戏内置技能（如鬼才、完杀、连破等）在 `addSkills`/`removeSkills` 等 API 中必须使用**内部标识符**（如 `reguicai`、`rewansha`、`lianpo`），不能用中文翻译名。可在原版武将包（如 `extra.js`）中搜索 `derivation` 字段找到正确的内部名（应天司马懿·应天）。
42. **⚠️ `targetInRange` mod 返回值语义**：`targetInRange(card, player, target)` mod 中，返回 `true` = 目标在范围内（无距离限制）；返回 `false` = **强制判定为目标超出距离**（不可使用）；返回 `undefined`（不返回）= 不修改，按正常距离计算。⚠️ 常见错误：`return zhi.some(c => get.suit(c) === get.suit(card))`——当花色不匹配时 `.some()` 返回 `false`，导致该花色的牌**永远无法使用**（被强制判定为超出距离）。正确写法：`if (zhi.some(...)) return true;`，不匹配时隐式返回 `undefined`，让引擎正常计算距离（应天司马懿·倾朝）。
43. **⚠️ 察觉"自己失去装备/牌"须参考官方枭姬（xiaoji, standard.js）的时机集合**（神冶·冶武，2026-09 更正）：① 他人夺走自己的牌（义贤 `player.gain(cards,"give")`、定州 `player.gain(cards,"give",target)`）产生的是 **gain 事件**，其 content 会对每个被抢者 `owner.lose(...)`（type:"gain"）产生子 lose——但此类**带 type 的转移子 lose 不触发 loseAfter**，引擎统一在转移事件自身的 After 时机通知，所以监听 `global:["loseAfter","loseAsyncAfter"]` 抓不到抢牌，**必须监听 `global:"gainAfter"`**（gain 事件的 `getl(player)` 会聚合其下子 lose，能取到被抢者失去的牌）。② 完整失去感知集合：`player:"loseAfter"`（自己弃置/被拆等独立 lose）+ `global:["equipAfter","addJudgeAfter","gainAfter","loseAsyncAfter","addToExpansionAfter"]`。③ **失去统计只认 `evt.es`（装备区失去）**：使用装备时新手牌从手牌失去记录在 hs 不算失去装备，否则会与 useCard 时机重复触发（“使用装备摸两次”）；按需在 filter 判断 `evt.player === player && evt.es?.length`。
44. **⚠️ 主动技 content 按目标逐个执行 + chooseButton backup 常见坑**（神冶·炼刃）：① 非 `multitarget` 的 useSkill 型主动技（含 chooseButton 的 backup 技能）content 会**对每个目标各执行一次**（每轮 `event.target` 单数依次指向所选目标、`event.num` 递增，多目标时 targets 先按座次排序并自动高亮/画线）。**切勿在 content 里遍历 `event.targets` 结算**——否则每人会被重复结算 N 次（曾出现"每个目标连续受 X 点伤害"）。正确做法：content 只处理单数 `event.target`（每个目标恰好结算一次），一次性副作用（如弃牌）放 `if (event.num === 0)` 内只执行一次。② **不要在 backup 型主技能的 precontent 里覆盖 `event.result.skill` 为主容器技能名**：主技能是 chooseButton 容器、本身没有 content，引擎应自动走 `技能_backup`（backup() 返回对象自带 content）；若强行把 result.skill 设回主技能名，useSkill 会取到 undefined content → ContentCompiler 报 `Cannot read properties of undefined (reading 'compiled')`。③ backup 型技能引擎**不自动弃牌**，需在 backup 返回对象设 `discard:false` 并在 content 内手动 `player.discard`。
45. **"你的X牌均视为Y牌"用 `mod.cardname` 实现，且 mod 内禁止调用 get.type/get.name**（原神傀·傀体③"锦囊视为杀"，该效果已随改版移除，保留作通用参考；现神傀·傀体③判定"获得锦囊牌"仍沿用其"读 `lib.card[card.name].type` 原始类型"要点）：① 官方先例：extra.js `nzry_longnu_2`（所有锦囊牌视为雷杀）、`wushen`（红牌视为杀）、library/skill.js `aozhan`（鏖战规则技，桃视为杀/闪）。写法：`mod:{ cardname(card, player){ if (条件) return "新牌名"; } }`——该 mod 挂在 `get.name(card, player)` 查询层（game.checkMod），使用/打出/响应/AI 评估/显示全部自动跟随，**无需**在 trigger 侧替换牌对象（aozhan 的 trigger 部分是其"杀/闪二选一"交互所需的，普通单向转化不需要）。② ⚠️ **mod 内必须用 `lib.card[card.name]?.type` 读原始类型判断，不能调 `get.type(card)`/`get.type2(card)`**——get.type 内部会再次调用 get.name 查 cardname mod，造成无限递归。③ 判定"锦囊牌"（含延时锦囊）用 `["trick","delay"].includes(lib.card[card.name]?.type)`；判定"非延时锦囊"用 `get.type2(card, player) === "trick"`（get.type2 把 delay 归入 trick）——在 mod **外**判断他人牌的类型时用后者。④ mod 只对"牌主/查询传入的 player"生效：他人查你的牌（get.name(card, 你)）也会得到转化后的名字；无 player 参数且牌不在手牌区时（如判定区牌被 get.name(card) 裸查）不生效。
46. **触发类技能不要在 content 里手动 logSkill**（神傀）：引擎在触发结算时已自动调用 `player.logSkill`（content.js createTrigger 内：`info.popup != false && !info.direct` 时），弹泡指向由 `logTarget`（字符串取 `trigger[key]`，或函数 `(trigger, player, triggername) => ...`）或 cost 的 `result.targets` 决定，需要"当前回合角色"这类目标时用 logTarget 函数返回 `_status.currentPhase`。content 里再手动 logSkill 属冗余（若导致双重调用则双重弹泡+语音）。另注：本扩展旧技能（魂契/止涕）content 里的 `player.logSkill(event.skill, ...)` 因 `event.skill` 在 content 中为 undefined（踩坑#30）而是**静默无效调用**（logSkill 内 `lib.translate[name2]` 检查挡住 undefined），实际弹泡全部来自引擎自动调用——新技能无需模仿这行写法。
47. **"令一名角色失去技能直到回合结束"用 `tempBanSkill(skill)`**（夺魂②）：引擎内置（Player.tempBanSkill），默认 expire `{global:["phaseAfter","phaseBeforeStart"]}` = **当前回合结束时解除**（`lib.relatedTrigger` 只映射 `phaseAny`，`phaseAfter` 不匹配任何相关触发名，精确对应回合结束事件）。封锁范围：①触发结算——`lib.filter.filterTrigger` 尾段检查 storage 中 `temp_ban_*`，经 `game.expandSkills([被封技能])` 匹配（**连 group 成员一起封锁**）；②主动使用——enable 技能枚举逐技按 `temp_ban_技能名` 精确匹配（group 成员的 enable 不受影响）。特性：非破坏性（不触发 onremove，storage/标记/扩展牌全保留，技能仍显示在武将牌上）；自动 log "XX的技能【YY】暂时失效了"（`log:false` 可关）；幂等（`isTempBanned` 为真再调用直接返回）。⚠️ **局限**：技能的 `mod`（被动修正：cardname/cardUsable/maxHandcard 等）走 `getModableSkills`→`getSkills()`——`getSkills` 只过滤 `disabledSkills`/`skill_blocker`，**不查 temp_ban**，所以被封技能的被动修正仍生效。若需连 mod 一起封死，改用 `disableSkill(唯一禁用者, 技能)`（会递归禁用 group 成员，且首次禁用时若技能同时有 `ondisable`+`onremove` 会执行其破坏性清理）+ `when({global:["phaseAfter","phaseBeforeStart"]})` 里 `enableSkill(禁用者)` 恢复（参考 `awakenSkill` 的失去语义），代价是自行管理恢复时机与唯一 disabler。
48. **⚠️ `damageSource` 在死亡结算之后触发**（止涕）：引擎 damage 事件步骤（content.js）：①`changeHp` + `trigger("damage")` → ②`hp<=0` 时 `player.dying()`——求桃与 `_saveAfter` 救场（如夺魂 `recoverTo(1)`）都在此事件内，救回则目标存活 → ③`trigger("damageSource")`。因此**伤害致死时，`damageSource` 时点目标已 `isDead()`，且 die 事件第一步就把其移出了 `game.players`（`isIn()` 也为假）**。触发技 filter 不能用"目标存活/`isDead()`"作条件，否则"杀死目标"时整个技能不触发（止涕加体力上限奖励在击杀时丢失的根因）。需要区分"对尸体豁免"的效果：作用于自己的部分（止涕加上限分支）照常执行；作用于目标本人的部分（封技等）在 content 内用 `target.isIn()` 守卫跳过。
49. **"直到其下一个回合结束"的时效写法**（止涕）：`addTempSkill(skill, {player:"phaseEnd"})`/`tempBanSkill(skill, {player:"phaseEnd"})` 的语义是"其**下一次** phaseEnd 时解除"——若效果在其自己回合内生效，会在**本回合**结束时提前解除。官方（dcsbzuojun）对"直到其下个回合结束"的标准写法是 when 钩子 + filter 跳过当前回合：`target.when({player:"phaseEnd"}, false).filter(evt => evt != event.getParent("phase")).assign({firstDo:true}).step(cleanup).finish()`。搭配 `tempBanSkill(skill, "forever")`（只置 `temp_ban_` 标记与日志、不挂自动解除）使用。`when(...)` 的 skill 自带 `triggered` 一次性守卫（触发一次后不再执行）；`instantlyAdd=false` 时必须调用 `.finish()` 才会 addSkill。
50. **dying 事件对已濒死角色幂等**（通用）：damage 事件在 hp≤0 时创建新的 dying 事件，但其第一步（content.ts）检查 `player.isDying() || player.hp > 0` 即 finish——对已处于 `_status.dying` 中的角色（如 `_saveAfter` 中的濒死者）再次造成伤害**不会**嵌套新一轮求桃、也不会提前 die（`isDying()` = `_status.dying.includes(this) && hp <= 0 && isAlive()`，player.js）。随后 `recoverTo(1)` 经 changeHp 检测到 `_status.dying.includes(player) && player.hp > 0`，将其移出 `_status.dying` 并 finish 待决的 `_save`/`dying` 事件，救回照常成立。因此技能仍可合法地对濒死者本身造成伤害（如幻劫选到濒死者为目标）。
51. **⚠️ `temp_ban` 封不死的技能类别——"封了但技能照用"**（止涕，2026-09 实测）：`tempBanSkill` 的 `temp_ban_` 标记在引擎里只有两个检查点——filterTrigger（library/index.js 触发排布）与 filterEnable（game/check.js 主动使用枚举）。**mod 被动修正（`getModableSkills`→`getSkills` 只过滤 `disabledSkills`/`skill_blocker`）、skillTag 响应类（`hasSkillTag` 同样走 `getSkills`）、以及依赖 `hasSkill` 判定的 `global:` 子技（如归訫的归訫_put，其 filter 找 `hasSkill("归訫")` 的持有者）都不受 temp_ban 影响**——表现为"弹了封技询问、选了技能、失效日志也打了，但技能照常生效"。强封方案（#47 已提示，止涕已改用）：`target.disableSkill(唯一禁用者, 技能)` 挂 `disabledSkills`，`getSkills`/`hasSkill`/`hasSkillTag`/mod 全部随之失效，`enableSkill(禁用者)` 解除；递归封 group 成员；首次禁用仅当技能同时有 `ondisable`+`onremove` 才执行破坏性清理（本扩展技能均无 `ondisable`）。解除时机仍用 #49 的 when 钩子，step 内改调 `player2.enableSkill("止涕")`。
52. **⚠️ 全局历史没有 `damage` 键**（魅祸，2026-09 实测）：`game.getGlobalHistory(key)` 直接查 `_status.globalHistory[最新记录][key]`，而全局记录只初始化了 **`cardMove`/`custom`/`useCard`/`changeHp`/`everything` 五个键**（content.js phase 轮换处），`damage` 只存在于玩家个人 `actionHistory`（`player.getHistory("damage")`）——传 `"damage"` 会拿到 undefined，对其 `.length`/`.filter` 直接 TypeError。要按事件名全局检索用 `game.getGlobalHistory("everything", evt => evt.name == "damage")`（zhanfa.js 同款），需要"基线差"统计时对过滤结果 `.length`/`.slice()` 即可。
53. **⚠️ `chooseTarget`/`chooseCardTarget` 的 filter 签名是 `(card, player, target)`**（魅心，2026-09 实测）：候选判定函数的参数序是 (card, 选择者, 候选目标)（yingbian.js 等官方技能同款）——箭头函数写成 `(card, target) => target !== player` 时，第二个参数捕获到的是**选择者本人**，`选择者 !== 貂蝉` 恒为 false，表现为"选择目标时点不了任何角色"（无报错、纯静默失败）。选"其他角色"直接用 `lib.filter.notMe`（神孙权冯河同款），自定义筛选务必写全三个参数 `(card, player2, target)`。
54. **⚠️ 选牌区域规则："一张牌"≠ 手牌；"给自己"与"从别人拿"范围不同**（魅心①，2026-09 规则修正）：
- **自己选/交自己的牌**（"交给…一张牌"、"将一张牌置于…"）：文案未显式写"手牌/手牌区"时，范围=**手牌区+装备区+木牛流马内**三处，位置码 `"hes"`——木牛流马牌带 `glows` 类混在手牌节点中（player.js iterableGetCards：`"h"` 排除 glows、`"s"` 仅选 glows），官方同款（族战定 `position:"hes"`）。
- **从其他角色区域内选牌**（"获得其（X）张牌"）：范围=**手牌区+装备区+判定区**（`"hej"`）——比选择自己区域的牌多一个判定区；**木牛流马内的牌对其他角色不可见**，拿不到里面的牌，但木牛流马本身是装备区的装备牌，可以被拿走。
- **"区域内的一张牌"**：手牌/装备/判定三区，`"hej"`（归訫② 同款）；显式"手牌"→`"h"`。判定区牌不属于自己选牌"一张牌"的范围。
- **木牛流马的携带牌**：扣置牌挂在 muniu 虚拟牌的 `storages` 上；木牛离开装备区时引擎 `muniu.onLose`（card/extra.js）自动将 `storages` **置入弃牌堆**（swapEquip 移动除外）——拿走别人的木牛后内牌自动掉弃牌堆，技能无需自行处理。
- `give`/`lose` 对装备/木牛流马牌无需特殊处理（移出时 gaintag 自动清除）。
55. **限定技"视为未发动过"用 `restoreSkill`**（原显略②→豪贤重置，该联动已随 2026-10-05 改版删除，经验保留备用）：引擎 `awakenSkill` 的实现是 `disableSkill(技能+"_awake", 技能)` + `awakenedSkills.add` + `storage[技能]=true`（**不移除技能**，disable 使其退出 enable 枚举与 hasSkill），`restoreSkill` 反向复原（storage 回 false、enableSkill、重新 markSkill）。判断"是否已发动"用 `player.storage.技能` 真值判断即可，**不要**去 `awakenedSkills` 集合上找——它是 noname 扩展数组（`.add`/`.remove`/`.includes`），没有 `.has`。当时的条件写法：`if (player.storage.豪贤) { player.restoreSkill("豪贤"); }`。
56. **"下一张牌"延迟增益的授予/消耗时机**（恣胜）："当你使用…时"的正确挂点是 **`useCard`**（useCard1/useCard2 之后、牌效果结算之前）——挂 `useCardAfter` 会退化成"整张牌结算完毕后才触发"（实测：点数3五谷丰登结算结束才摸三张，体感即错）。授予与消耗放**同一触发器内先消耗后授予**，顺序确定；不要拆成两个技能挂同一时机——同优先级触发器的执行顺序不保证 consume 先于 grant，会出现"新授予的增益立刻被旧消耗逻辑删掉"的竞争。filter 需含"有待生效增益的'使用'"守卫，保证本张牌点数不合格时增益也会被消耗，不永久滞留；**打出（respond）只授予不消耗**（增益效果均只针对"使用的下一张牌"）。另一注意点：事件被 `trigger.cancel()`（如飛影的无效化）时本次使用中断，增益视是否已过 useCard 时机决定去留，语义可接受。
57. **`mod.selectTarget` 实现"可指定至多X个目标"**（恣胜4倍）：`game.checkMod(card, player, range, "selectTarget", player)` 传入的 range 数组是**原地修改**语义（官方 mapodoufu 同款 `range[1]++`），不是返回值语义；`range[1] == -1` 表示无上限目标（如借刀），必须排除。写法：`if (条件 && range[1] != -1) range[1] = Math.max(range[1], 3);`。charlotte 技能的 mod 照常生效（getModableSkills 只过滤 `info.mod` 存在性，不看 charlotte）。
58. **"不计入次数"的两种场景与写法**（原恣胜4倍 / 显略①）：① **下张牌免计**（被动增益挂在下张牌上）——只能照搬引擎 `nocount` 模板：`useCard1`（`firstDo:true`）时 `trigger.addCount=false` + **手动回退统计** `player.getStat().card[牌名]--`。原因：useCard content 里 stat 自增点（8951 行）先于 useCard1 触发点（9211 行）执行，触发时置 addCount=false 已来不及阻止自增，必须事后回退。② **技能内虚拟使用免计**（显略的视为【杀】）——创建事件后、await 前置旗即可：`const useEvt = player.useCard(...); useEvt.addCount = false; await useEvt;`，自增点在事件内容开头、创建时已置旗 → **整体跳过自增，无需 stat 回退**（此时补 stat-- 反而会多扣一次）。两场景不可混用写法。（2026-09-30 恣胜改版后四档不再含"不计入次数"，场景①在本扩展已无使用，保留作通用参考；场景②仍用于显略①。）
59. **触发类附属技能必须写 `forced`**（恣胜_effect，2026-09-30 实测）：引擎对所有非 `forced`/`direct` 的触发技，在每次生效前默认弹 chooseBool 询问（"是否发动【XXX】？"），`sub`/`charlotte` 附属技也不例外——表现为恣胜4倍增益指定目标后多出一次"是否发动恣胜-附属技能"的可取消询问，取消即效果丢失。修复：效果型附属触发技一律 `forced: true`（锁定生效），反馈靠引擎自动弹泡（sourceSkill 技能名）+ 自行 `game.log` 具体效果。
60. **"无点数牌视为X点"不能走 `mod.cardnumber`，需对 `get.number` 打外层补丁**（恣胜②，2026-09-30 初版，2026-10-02 实测修正）：`get.number` 尾部（get/index.js）确有 `game.checkMod(card, owner, number, "cardnumber", owner)` 钩子，**但 checkMod 的覆盖守卫 `typeof arg[last] != "object"` 对 null 基数恒为 true——`typeof null === "object"` 是经典 JS 陷阱**。无点数牌（无 `card.number` 且 `.cards` 非1张，如丈八两牌合一杀、纯 `autoViewAs` 虚拟牌——显略的视为【杀】即此类）基数恰为 null：mod 会照常被调用、**返回值却必被丢弃**，等于永远不生效（实测：显略的虚拟杀不触发恣胜，"视为3"形同虚设）。数字基数（typeof "number"）时守卫不拦截，但那本就无需 mod——**该 mod 对无点数场景完全无效**。可用实现：在扩展入口（extension.js）对 `get.number` 打外层补丁——包装原函数，原函数返回 `null` 且 `card` 为对象时，取 `player === false ? false : player || get.owner(card)`，拥有恣胜则返回 3；filter/content 及任意查询方的 `get.number(card, player)` 自动跟随。⚠️ 补丁函数加 `_nonameDiyPatched` 标记防重复包装（模块重复载入时防套娃）；⚠️ 补丁/`mod` 内均禁止调用 `get.number`（无限递归，踩坑#45 同理）；`"unsure"` 在钩子**之前**提前 return、不经补丁——技能层用 `typeof` 兜底；`player === false` 表示调用方明确不按归属查询，补丁尊重之直接放行。
61. **附属技能出现在"角色技能列表"的机制与隐藏方法**（恣胜_effect/豪贤_aura，2026-10-01 实测）：悬停/点击角色弹出的技能列表面板由 `get.nodeintro`（get/index.js）构建，它遍历 `player.getSkills()`（含 tempSkills/additionalSkills），**凡 `lib.translate[技能+"_info"]` 有翻译条目的技能都会列出**（标题取 `get.translation` 前2字、描述取 `_info`），与技能是否"临时"无关；`显略_used` 不出现仅因其没有 `_info` 翻译条目。隐藏方法二选一：① 不写该技能的 `_info` 翻译条目；② 技能加 **`nopop: true`**——nodeintro 对 `nopop`/`equipSkill` 技能直接 `continue` 跳过（官方 sub 技能同款开关）。`nopop` 的全部副作用：菜单"武将百科/衍生技"列表同样跳过（本扩展未用衍生技展示，无影响）；**不影响**标记（mark/marktext/intro 照常显示）、不影响触发与 AI。另可给触发类附属技配 `popup: false` 关闭引擎自动 logSkill，避免附属技与主技能重复弹泡/记录"发动了【主技能】"。
62. **"恢复失效技能"的可行域与解除写法**（夺魂③/止涕③，2026-10 实测）：引擎层面"技能仍拥有但不生效"只有两类——`disableSkill(禁用者, 技能)` 挂 `disabledSkills`（被禁技 → [禁用者] 数组），与 `skillBlocker` 封锁器（`player.storage.skill_blocker` 存封锁器名，`get.is.blocked` 逐一调 `skillBlocker(被查技, player)` 判定）；两者都经 `game.filterSkills` 从 `getSkills`/`hasSkill` 中剔除。**失效池枚举**＝`getSkills(null,false,false)`（原始，第三参 `applySkillFilter` 传 false）与 `getSkills(null,false,true)`（过滤后）的差集，恰好就是"失效但仍拥有"的技能；已 `removeSkill` 移除的不在池内（故夺魂/魂契拿到又失去的来源技天然不可恢复）。**解除**＝精确反操作：① disableSkill 型——`game.expandSkills([技能])` 展开子技树后逐条目 `delete player.disabledSkills[t]`，**不能**用 `enableSkill(禁用者)`——那是按禁用者全局解，会连其封锁的其他技能一起放开；② skillBlocker 型——仅当封锁器以 **storage 数组记录封锁名单**（破怠 `hm_podai_sb` 式）时可解：`storage.remove(技能)`，名单清空则 `removeSkill(封锁器)`（onremove 自动 `removeSkillBlocker`）；动态条件封锁（skillBlocker 不依赖名单）无解，须经 `canRestoreSkill` 从可恢复列表排除。⚠️ 觉醒技觉醒后 `disabledSkills[技]=["技_awake"]` 会混入差集，须排除 `player.awakenedSkills`（恢复它等于解除觉醒）。解锁后技能有 mark 的需 `markSkill` 补挂（checkMarks 可能在失效期间清过），并 `_status.event.clearStepCache()`。
