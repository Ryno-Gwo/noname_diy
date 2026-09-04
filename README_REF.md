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
- **附属技能命名约定**：`主技能_用途`。本扩展出现过的后缀：`_rescue`（救场）、`_put`（全局放置）、`_use`（虚拟使用）、`_used`（本回合已用标记）、`_lock`（锁技能载体）、`_mark`（标记展示载体）、`_backup`（chooseButton 后备技能）、`_negate`（令牌对己无效，疑城②）。
- **三大核心机制**：
  1. **标记牌（扩展区）**：牌置于武将牌上（`addToExpansion`），按 gaintag 名区分类型（"归訫"/"煋"/神徐盛"疑兵"牌，其 gaintag 为"疑城"），可被全场角色读取花色、被当作虚拟牌使用。
  2. **技能来源追踪**：`player.storage.夺魂_sources = {技能名: 来源角色}`，供夺魂的代价与止涕的 X 计数共用。
  3. **死亡后复活**：`global:"_saveAfter"`（求桃失败、正式死亡前）触发，`recoverTo(1)` 拉回 1 血即可阻止死亡结算。
- **AI 基调**：`get.attitude(a,b)` 好感度（>0 友 / <0 敌）是所有 AI 决策的基础；`charlotte` 类技能视为可轻易舍弃的"鸡肋技"。

## 参考角色与技能一览

| 角色 | 技能（含附属） | 定位 / 主题 |
|------|----------------|------------|
| 神张辽（shen，1/5） | 魂契、夺魂、止涕（止涕_mark） | 体力上限↔技能的资源流转 + 标记压制 |
| 神曹操（shen，3/3） | 归訫（归訫2/归訫_put/归訫_use）、飛影 | 卖血 + 标记牌（扩展区）+ 虚拟用牌 |
| 神诸葛（shen，3/3） | 七煋（七煋_mark）、相天（相天2）、神机（神机_used） | 观牌堆定序 + 花色联动 |
| 神徐盛（shen，5/5） | 疑兵（觉醒技）、疑城（疑城_skip / 疑城_negate）、破军 | 觉醒成长 + "疑兵"资源（跳过摸牌+弃牌囤积 / 无效化换牌）+ 破军无距离次数/不可响应/目标扩张 |
| 应天司马懿（shen，4/4） | 戢鳞（戢鳞_seal）、英猷（英猷_used/英猷_gain/英猷_forbid）、应天（觉醒技）、覆变 | "志"资源管理 + 花色联动 + 觉醒后鬼才/完杀/连破 |

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
| `lib.skill[技能名]` | 技能定义对象（可挂自定义辅助函数：getSkills/getStolenSkills/countFromSource/hasGuixin） |
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
> 锁定技。①当你的体力值增加后，若其大于1，你失去X点体力（X为你增加后的体力值-1），然后增加X点体力上限。②你的手牌上限始终等于体力上限。

**设计点：**
1. 体力值增长的"自动转化器"：体力一旦超过1，多余部分立即转化为体力上限。
2. 与夺魂的"减上限换技能"形成闭环：魂契不断积累上限 → 夺魂消耗上限偷技能。
3. ②手牌上限硬锁 = 体力上限（原夺魂③移至此处）。

**实现要点：**
- **触发**：`trigger:{player:"changeHp"}` + `filter` 判 `event.num > 0 && player.hp > 1`。
- **锁定技**：`locked:true` + `forced:true`，自动发动无需询问。
- **content**：计算 `X = player.hp - 1` → `loseHp(X)` → `gainMaxHp(X)`。loseHp 会再次触发 changeHp，但此时 `event.num < 0` 不满足 filter，不会循环。
- **手牌上限硬锁**：`mod:{maxHandcardFinal(player){ return player.maxHp; }}`——用最高优先级层，避免被偷来的 maxHandcardBase 覆盖（同原夺魂③）。

**关键 API：** `changeHp` / `forced` / `locked` / `loseHp` / `gainMaxHp` / `mod.maxHandcardFinal`。

---

### 2.1.1 夺魂

**文案：**
> ①游戏开始时，你可以失去1点体力上限并获得一名其他角色的一个技能。
> ②一名角色死亡时，若你：1、体力上限大于1，你可以减少1点体力上限并获得一名其他角色的一个技能；2、拥有至少1个来源于其他角色的技能，你可以失去一个来源于其他角色的技能，然后摸体力上限张牌。若如此做，你令其回复体力至1点。

**设计点：**
1. **情况A（gameStart）**：开局主动消耗上限换技能，成长型起点。
2. **情况B（_saveAfter）**：求桃失败后兜底救场，代价二选一——**减上限拿技能**或**丢来源技摸牌**，执行后令濒死角色回复至1点。
3. 上限=1 时情况A和B选项1均停用，天然安全锁。
4. 两个触发时机共用一个技能，用 `event.triggername` 区分流程。

**实现要点：**
- **触发**：`trigger:{global:["gameStart","_saveAfter"]}`，`forced:true` + `locked:false`（跳过引擎自动确认弹窗，由 content 内部的 `chooseBool`/`chooseControl` 控制是否发动）。
- **filter**：用第三个参数 `name` 区分——`gameStart` 判 `maxHp>1`；`_saveAfter` 判 `event.dying.isIn() && event.dying.isDying()`，不排除自己（可自救）。
- **⚠️ 不能用 `group`**：若用 `group:["夺魂_rescue"]` 分离救人逻辑，引擎会用子技能的 trigger 覆盖主技能的 trigger，导致 `gameStart` 不触发（见踩坑记录#28）。
- **⚠️ `logSkill` 不执行效果**：`player.logSkill(skillName)` 仅显示技能名气泡动画，不会执行任何游戏效果。不能用 `logSkill` + `return` 代替实际的技能 content 逻辑（见踩坑记录#29）。
- **情况A流程**：`chooseBool("是否要失去1点体力上限，并获得一名其他角色的一个技能？")` → `loseMaxHp` → `chooseTarget` → `chooseSkill`。
- **情况B流程**：`chooseControl(["减体力上限并获得技能", "失去技能并摸牌", "cancel2"])` → 对应效果 → `recoverTo(1)`。
- **复活**：`await target.recoverTo(1)`（在 `_saveAfter` 内拉回 1 血即可阻止后续 die）。
- **技能来源追踪**：`player.storage.夺魂_sources = {技能名: 来源角色}`；偷技时在 `chooseSkill` 内写入，失去时 `delete`。
- **辅助函数**（挂在技能对象上，供夺魂/止涕共用）：
  - `getSkills(target)`：取角色技能（兼容 name/name1/name2 主公技槽）
  - `getStolenSkills(player)`：`Object.keys(map).filter(s => map[s]!==player && player.hasSkill(s))` —— 当前拥有的"来源技能"
- **AI**：情况A 时 `maxHp>2` 才发动；情况B 时对濒死角色好感度 ≤0 则取消，上限>2 优先扣上限，否则丢来源技能（AI 优先丢 `info.charlotte` 的鸡肋技）。

**关键 API：** `forced` / `locked` / `chooseBool` / `chooseControl` / `chooseTarget` / `chooseButton([... , "skill"])` / `loseMaxHp` / `recoverTo` / `draw` / `addSkills` / `removeSkill` / `hasSkill` / `storage` / `event.triggername` / `get.prompt2` / `get.attitude` / `game.filterPlayer` / `_status.event.getTrigger()`。

---

### 2.1.2 止涕（含 止涕_mark）

**文案：**
> 当你对其他角色造成伤害时，若你拥有来源于其的技能，你令其获得一枚其未拥有的标记：【止戈】废除1个由你指定的装备栏；【血俎】降低1点体力上限（至多降为1）；【失魂】失去1个由你指定的技能。若如此做，你增加1点体力上限。

**设计点：**
1. 与夺魂的"来源技能"挂钩：拥有来源于目标的技能才能发动。
2. 标记系统：三种标记（止戈/血俎/失魂），每种只能获得一次，标记永久存在。
3. 标记即效果：获得标记时立即执行对应效果。
4. 成功添加标记后增加1点体力上限——弥补夺魂消耗上限后的成长缺口，避免上限降为1后无法恢复的隐藏困境。
5. 强制发动（`forced:true`）：满足条件即自动执行，无需询问。

**实现要点：**
- **触发**：`source:"damageSource"` + `forced:true`，`filter` 判目标≠自己、未死亡、`countFromSource>0`、且目标尚未拥有全部三种标记。
- **标记存储**：`target.markAuto("止涕_mark", [选择的标记名])` 统一存储，`target.addSkill("止涕_mark")` 注册展示技能。`getStorage("止涕_mark")` 返回已拥有标记数组。
- **选项过滤**：`controls` 数组根据 `owned = target.getStorage("止涕_mark") || []` 动态构建，只显示目标未拥有的标记类型。
- **【止戈】废装备栏**：收集可用栏 `hasEnabledSlot`（3/4 位合并为 `equip3_4`）→ `chooseControl` 选一个 → `disableEquip`。
- **【血俎】降上限**：`if(target.maxHp > 1) target.loseMaxHp()`，直接降到1。
- **【失魂】去技能**：`lib.skill.夺魂.getSkills(target)` 获取目标技能 → `filter(s => !lib.skill[s]?.charlotte)` 排除 charlotte 技 → `chooseButton` 选一个 → `target.removeSkill`。
- **增加上限**：标记效果执行完毕后 `await player.gainMaxHp()`，无论选择了哪种标记。
- **标记展示**：`止涕_mark` 为 `charlotte` 子技能，`intro:{name:"止涕", content(storage){...}}` 显示已拥有标记。
- **AI**：`ai.effect.target` 里对有来源技能且标记未满（<3）的目标，提高伤害牌价值（`current + 0.3`）；选择标记时优先失魂（如有技能）、其次血俎（如上限>1）、最后止戈。

**关键 API：** `forced` / `damageSource` / `countFromSource` / `markAuto` / `getStorage` / `addSkill` / `hasEnabledSlot` / `disableEquip` / `loseMaxHp` / `removeSkill` / `gainMaxHp` / `chooseControl` / `chooseButton` / `intro.content` / `charlotte`。

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
10. **技能来源追踪**：`player.storage.夺魂_sources = {技能名: 来源角色}`，丢技时 `delete`，供夺魂代价/止涕计数共用（保持数据一致）。
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
23. **多触发时机共用一个技能**：当一个技能需要在多个时机触发（如 `gameStart` + `_saveAfter`），不能用 `group` 分离（会覆盖主技能 trigger，见#28）。正确做法：将所有 trigger 写在主技能的数组里，`filter` 用第三个参数 `name` 区分，`content` 用 `event.triggername` 分支。配合 `forced:true` 跳过引擎自动确认弹窗，由 content 内部的 `chooseBool`/`chooseControl` 控制交互。
24. **`markAuto` + `getStorage` 实现"每种标记最多一个"**：用 `target.markAuto("skill_mark", [value])` 追加标记值到 storage 数组，`target.getStorage("skill_mark")` 返回数组，检查 `owned.includes(value)` 判断是否已拥有。配合 `intro:{content(storage){...}}` 展示已有标记。相比旧式的"每种标记独立 `addMark`"方案，`markAuto` 更适合"多选一且不可重复"的标记系统（止涕_mark）。
25. **Unicode 转义引号需统一**：JS 文件中的 `\u201c`/`\u201d`（中文左右双引号）在某些引擎环境下可能导致解析问题。建议统一替换为 `\"`（转义英文双引号）。可用 PowerShell 批量替换：`$content.Replace('\u201c','\"').Replace('\u201d','\"')`。
26. **跳过摸牌阶段**：`phaseDrawBegin2` 触发 + `trigger.changeToZero()`（张辽突袭式，`num=0`）实现不摸牌；牌堆顶无主牌用 `get.cards(n)` + `addToExpansion(cards, "draw")`（疑城①）。
27. **⚠️ 觉醒技动画机制（重要踩坑）**：`skillAnimation: true` 写在技能定义上时，`trySkillAnimate` 会在**每次 `logSkill` 调用时**播放动画，而非仅在觉醒时。对于"攒够条件才觉醒"的连续触发型觉醒技（如疑兵：每回合触发，但攒够牌才觉醒），会导致**每次触发都播动画**。正确做法：**不在技能定义上写 `skillAnimation`**，而是在 `content` 里觉醒条件满足时**手动调用** `player.$skill("技能名", "legend", "wood", "main")`，然后再 `player.awakenSkill()`。⚠️ 第4个参数 `"main"` 必须传，否则 `avatar` 为 falsy 会走 `playerfocus` 分支而非 `playerfocus2` 分支，动画效果不同（`trySkillAnimate` 在 `skill_animation_type == "default"` 时会设 `checkShow = "main"`）。引擎调用链：`logSkill` → `trySkillAnimate` → 检查 `lib.skill[name].skillAnimation` → `player.$skill(name, type, color, checkShow)` → `$legend(1200)` + `$fullscreenpop(name, color, avatar)`。
28. **⚠️ `group` 会覆盖主技能的 trigger**：当主技能有 `group:["xxx"]` 时，引擎用 group 中子技能的 trigger **替代**主技能自身的 trigger 进行匹配。若子技能只定义了 `trigger:{global:"_saveAfter"}`，则主技能的 `trigger:{global:"gameStart"}` 不再生效——`gameStart` 时引擎检查的是 `_saveAfter`，不匹配，整个技能静默跳过。**解决方案**：不用 `group`，将所有 trigger 写在主技能上（如 `trigger:{global:["gameStart","_saveAfter"]}`），用 `filter` 的第三个参数 `name` 和 `content` 里的 `event.triggername` 区分不同触发时机的逻辑。
29. **⚠️ `logSkill` 不执行效果**：`player.logSkill(skillName)` 仅显示技能名气泡动画+播放语音，**不会执行任何游戏效果**。不能用 `if(条件){ player.logSkill(skill); return; }` 来代替实际的 content 逻辑——这会导致技能看起来触发了（有动画），但实际什么都没发生。正确做法：在 content 里直接写效果逻辑，需要动画时在效果执行前调用 `logSkill`。
30. **⚠️ content 事件中 `event.skill` 为 `undefined`**：引擎 `createTrigger`（content.js）创建 content 事件时用 `game.createEvent(event.skill)` 但未设置 `next.skill`，导致 content 函数内 `event.skill` 为 `undefined`，`get.prompt(event.skill)` 显示"是否发动【】？"。cost 事件有 `next2.skill = event.skill` 所以正常。**不改引擎的解法**：用 `event.name` 代替 `event.skill`——因为 `game.createEvent(event.skill)` 以技能名作为事件名，`event.name` 即为技能名字符串。用法：`get.prompt(event.name)` 代替 `get.prompt(event.skill)`。
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
42. **⚠️ `targetInRange` mod 返回值语义**：`targetInRange(card, player, target)` mod 中，返回 `true` = 目标在范围内（无距离限制）；返回 `false` = **强制判定为目标超出距离**（不可使用）；返回 `undefined`（不返回）= 不修改，按正常距离计算。⚠️ 常见错误：`return zhi.some(c => get.suit(c) === get.suit(card))`——当花色不匹配时 `.some()` 返回 `false`，导致该花色的牌**永远无法使用**（被强制判定为超出距离）。正确写法：`if (zhi.some(...)) return true;`，不匹配时隐式返回 `undefined`，让引擎正常计算距离（应天司马懿·覆变）。
