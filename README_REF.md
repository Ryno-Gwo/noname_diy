# 无名杀扩展 · 开发参考文档

> **简介**：本文档记录 `noname_diy_skill` 扩展（作者 Ryno-Gwo，版本 v1.1）内全部角色技能的设计点、实现方式与所用无名杀（Noname）引擎 API，供后续开发与 AI 对话参考。对应代码：`extension.js`。随实现演进持续更新。

---

# 0. 总览

## 0.1 结构骨架

### 0.1.1 扩展结构

```js
import { lib, game, ui, get, ai, _status } from "noname";
export const type = "extension";
export default function () {
  return {
    name: "noname_diy_skill",          // 扩展名（目录名）
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
  audio: "ext:noname_diy_skill:2",        // 音频（:2 数字=默认语音）
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
  1. **标记牌（扩展区）**：牌置于武将牌上（`addToExpansion`），按 gaintag 名区分类型（"归訫"/"煋"/"疑军"），可被全场角色读取花色、被当作虚拟牌使用。
  2. **技能来源追踪**：`player.storage.夺魂_sources = {技能名: 来源角色}`，供夺魂的代价与止涕的 X 计数共用。
  3. **死亡后复活**：`global:"_saveAfter"`（求桃失败、正式死亡前）触发，`recoverTo(1)` 拉回 1 血即可阻止死亡结算。
- **AI 基调**：`get.attitude(a,b)` 好感度（>0 友 / <0 敌）是所有 AI 决策的基础；`charlotte` 类技能视为可轻易舍弃的"鸡肋技"。

## 参考角色与技能一览

| 角色 | 技能（含附属） | 定位 / 主题 |
|------|----------------|------------|
| 神张辽（shen，1/5） | 夺魂（夺魂_rescue）、止涕（止涕_lock） | 体力上限↔技能的资源流转 |
| 神曹操（shen，3/3） | 归訫（归訫2/归訫_put/归訫_use）、飛影 | 卖血 + 标记牌（扩展区）+ 虚拟用牌 |
| 神诸葛（shen，3/3） | 七煋（七煋_mark）、相天（相天2）、神机（神机_used） | 观牌堆定序 + 花色联动 |
| 神徐盛（shen，5/5） | 疑城（疑城_negate/疑城_sha）、破军 | 囤积/消耗“疑军”（无效化换牌 + 当基本牌） + 杀目标扩张 |

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

### 2.1.1 夺魂（含 夺魂_rescue）

**文案：**
> ①游戏开始或你的回合开始时，若你的体力上限大于1，你可以失去1点体力，然后增加1点体力上限。
> ②一名角色死亡时，若你：1、体力上限大于1，你可以减少1点体力上限并获得一名其他角色的一个技能；2、拥有至少1个来源于其他角色的技能，你可以失去一个来源于其他角色的技能，然后摸体力上限张牌。若如此做，你令其回复体力至1点。
> ③你的手牌上限始终等于体力上限。

**设计点：**
1. ①"换上限"：用当前体力换永久体力上限（成长型）。
2. ②"救场 + 资源二选一"：死亡后复活（求桃失败后兜底），代价二选一——**减上限**（收益=拿任意其他角色一个技能）或**丢一个来源技能**（收益=摸上限张牌）。用"若如此做"统一在选项执行后复活。
3. ③"手牌上限硬锁 = 体力上限"。
4. 三个效果围绕"体力上限"形成统一资源线，且上限=1 时①/②选项1停用，天然安全锁。

**实现要点：**
- **触发**：主技能 `global:"gameStart"` + `player:"phaseBegin"`；救场用 `global:"_saveAfter"`（求桃失败、正式死亡前），`filter` 判 `event.dying.isDying()`。
- **复活**：`await target.recoverTo(1)`（在 `_saveAfter` 内拉回 1 血即可阻止后续 die）。
- **技能来源追踪**：`player.storage.夺魂_sources = {技能名: 来源角色}`；偷技时在 `chooseSkill` 内写入，失去时 `delete`。
- **辅助函数**（挂在技能对象上，供夺魂/止涕共用）：
  - `getSkills(target)`：取角色技能（兼容 name/name1/name2 主公技槽）
  - `getStolenSkills(player)`：`Object.keys(map).filter(s => map[s]!==player && player.hasSkill(s))` —— 当前拥有的"来源技能"
- **代价选择**：`chooseControl` 按可用性动态组 `controls`（选项1需 `maxHp>1` 且存在其他角色有可选技能；选项2需有来源技能），末尾 `push("cancel2")`。
- **AI 判好感**：救自己/友军才发动；上限>2 优先扣上限，否则丢来源技能（丢技能时 AI 优先丢 `info.charlotte` 的鸡肋技）。
- **手牌上限硬锁**：`mod.maxHandcardFinal(player){ return player.maxHp; }` —— 用最高优先级层，避免被偷来的 `maxHandcardBase`（七弦/冯河类）覆盖。
- **防无限复活**：拿技能并入选项①（消耗上限）、丢技能是选项②（消耗技能存量），不再有"复活后白拿技能"的净收益。

**关键 API：** `chooseBool` / `chooseControl` / `chooseTarget` / `chooseButton([... , "skill"])` / `loseHp` / `gainMaxHp` / `loseMaxHp` / `recoverTo` / `draw` / `addSkills` / `removeSkill` / `hasSkill` / `storage` / `mod.maxHandcardFinal` / `get.prompt2` / `get.attitude` / `game.filterPlayer` / `_status.event.getTrigger()`。

---

### 2.1.2 止涕（含 止涕_lock）

**文案：**
> 一局游戏内每名角色限一次，当你对其他角色造成伤害时，若你拥有来源于其的技能，你可以选择一项：①废除其X个装备栏；②降低其X点体力上限（至多降为1）；③令其失去X个技能，直到其进入濒死状态。X为你拥有的来源于其的技能数。

**设计点：**
1. 与夺魂②的"来源技能"挂钩：**X = 你拥有的、来源于该受伤角色的技能数**（`countFromSource`）。
2. 三选一压制：废装备栏 / 降上限 / 锁技能。
3. 一局每名角色限一次（`storage.止涕_used` 数组）。

**实现要点：**
- **触发**：`source:"damageSource"`，`filter` 判目标≠自己、未用过、`countFromSource>0`。
- **cost 传参坑**：选项用 `chooseControl`，且**引擎不会把 cost 的 `event.result` 自动传给 content** → 手动 `event.result.cost_data = event.result.control`；且 `chooseControl` 结果**无 bool 字段**，只能靠 `control` 判断。
- **①废装备栏**：`for` 循环 X 次，`disableEquip(slot)`；3/4 位（武器/防具）合并为 `equip3_4` 一次废除；用 `hasEnabledSlot` 收集可用栏。
- **②降上限**：`while(num>0 && target.maxHp>1) target.loseMaxHp()`，最多降到 1。
- **③锁技能**：选 X 个技能 → `target.removeSkill(skill)` → 记录到 `target.storage.止涕_lock` → `target.addSkill("止涕_lock")`。
- **解锁**：`止涕_lock` 监听 `player:"dying"`（进入濒死即恢复所有被锁技能）并 `removeSkill("止涕_lock")`；`onremove` 兜底（标记被移除时也恢复，防永久丢失）。
- **AI**：`ai.effect.target` 里对有来源技能且未对其用过止涕的目标，提高伤害牌价值（`current + 0.3`）。

**关键 API：** `chooseControl` + `cost_data` / `countCards("e")` / `getEquip` / `hasEnabledSlot` / `disableEquip` / `loseMaxHp` / `removeSkill` / `addSkill` / `addArray` / `trigger.player` / `onremove` / `storage` / `intro.content` / `get.cnNumber`。

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

### 2.4.1 疑城（疑城 / 疑城_negate / 疑城_sha）

**文案：**
> ①其他角色的回合开始时，你可以将至多X张牌（X为你的"疑军"数且至少为1、至多为7）置于武将牌上，称为"疑军"。
> ②当你成为其他角色使用牌的目标时，若你有"疑军"，你可以移去一张"疑军"并令此牌无效，然后你摸X张牌（X为移去前的"疑军"数且至少为1、至多为7）。
> ③每名角色的回合限3次，你可以将一张"疑军"当做无视距离和次数限制的任意基本牌（杀/闪/桃/酒及火雷杀）使用或打出。

**设计点：**
1. 围绕"疑军"（扩展区标记牌）做资源流转：①囤牌 → ②弃牌换"无效化+摸牌" → ③当任意基本牌。
2. ①的 X 与"疑军"数挂钩（至少1、至多7），越囤越能囤，形成滚雪球。
3. ②摸牌数取**移去前**的疑军数——资源越厚，无效化的收益越高。
4. ③兼具攻（杀/酒）守（闪/桃）两面，且无视距离/次数，每名角色回合限3次。

**实现要点（含大量踩坑）：**
- **⚠️ 扩展区标记牌的 gaintag 必须与技能名一致**：疑军牌 gaintag 用 `"疑城"`（=技能名）而非展示名"疑军"。lose 事件（content.js 的 `unmarks` 循环）只对 **gaintag == 技能名** 的标记自动 `markSkill`/`unmarkSkill` 刷新（②③破军移去疑军后标记自动更新）；但 **`addToExpansion` 不自动刷新**，①放牌后需显式 `player.markSkill("疑城")`。`intro.markcount` 用 `"expansion"`（统计带该 gaintag 的扩展区牌），展示名经 `intro.name:"疑军"` 呈现。
- **⚠️ `chooseCard` 勿用 `[0,X]`**：最小0时"确定"按钮无意义（不选牌点确定等同取消，只有选牌后才出现真正生效的确定）。应**先用 `chooseBool` 问"是否发动"**，确认后再 `chooseCard("hej",...,[1,X])`（至少选1张）。
- **主技能兼顾计数重置与①**：`trigger:{global:"phaseBegin"}` + `direct:true` + `filter()=>true`（每次 phaseBegin 都进 content）；content 里**先重置③计数 `player.storage.疑城_sha_count = 0`（每名角色回合开始重置）**，再判 `trigger.player == player` 决定是否发动①（①仅其他角色回合）。
- **①放牌**：`chooseCard("hej",...,[1,X])`（X=`getX`=`min(7,max(1,疑军数))`）→ `addToExpansion(cards, player, "giveAuto").gaintag.add("疑城")` → `player.markSkill("疑城")`。
- **②令牌对单目标无效**：`trigger:{target:"useCardToTarget"}` + `direct:true`；content 里**先算 X=`getX`（移去前疑军数，1-7）**，再 chooseButton 选一张疑军 → `loseToDiscardpile` → **`trigger.getParent().excluded.add(player)`** 令该牌对自己无效（参考娴辅）→ 摸 X 张。
- **③任意基本牌（重点套路：jibing 式"类型+扩展牌"组合弹窗）**：
  - `enable:["chooseToUse","chooseToRespond"]`；filter 用 `get.inpileVCardList(info => info[0]=="basic" && event.filterCard(get.autoViewAs({name:info[2],nature:info[3],isCard:true,storage:{疑城_basic:true}},"unsure"), player, event)).length > 0` —— 自动覆盖杀/闪/桃/酒及火/雷杀等 nature 变体。
  - dialog：`types.length>1` 时设 `dialog._chooseButton=2` 并 `dialog.add([types,"vcard"])`（vcard 按钮 link 是 `[type,"",name,nature]` 数组，基础牌无 nature 时为3元素）；`types.length==1` 时设 `dialog._cardName=types[0]` 且只列疑军牌。
  - `filter(button)` 用 `Array.isArray(button.link)` 区分类型按钮与牌按钮：未选→只能选类型；已选类型→只能选疑军；单类型模式用 `dialog._cardName` 过滤。`select()` 返回 `dialog._chooseButton || 1`（多类型选2个按钮：类型+疑军）。
  - `backup(links)`：`links.length==2` 时 `links[0]` 是类型元组（`[2]`=name、`[3]`=nature）、`links[1]` 是疑军；`links.length==1`（单类型）时用 `_status.event`（backup 里就是 chooseToUse/chooseToRespond 事件）按 `get.inpileVCardList` 重新推断唯一可用基本牌。
  - backup 返回 `{filterCard: card => card == lib.skill.疑城_sha_backup.card, selectCard:-1, position:"x", viewAs:{name, nature, storage:{疑城_basic:true}}, card, log:false, precontent}`（急袭式精确指定扩展牌）。
  - **不计入次数**：precontent 里 `event.getParent().addCount = false`（natuheng 式），疑军当杀/酒不占用本回合使用次数。
  - **无视距离/次数**：`mod.targetInRange(card)` 判 `card.storage.疑城_basic` 返 `true` + `mod.cardUsable(card)` 返 `Infinity`（参考巡使/恒）。
  - **限次**：`player.storage.疑城_sha_count` 计数（filter 判 `<3`、precontent +1、主技能 phaseBegin 重置）。
  - `hiddenCard` 支持 `["sha","shan","tao","jiu"]`；`ai` 加 `respondSha/respondShan/save`，`result.player(player)` 濒死时按好感度决定出手。

**关键 API：** `chooseBool` / `chooseCard`+`[1,X]` / `addToExpansion` / `gaintag` / `markSkill` / `intro.markcount:"expansion"` / `useCardToTarget` / `excluded.add` / `getX` / `get.inpileVCardList` / `chooseButton.dialog|filter|select|check|backup|prompt` / `_chooseButton` / `_cardName` / `Array.isArray(button.link)` / `viewAs:{name,nature,storage}` / `precontent` / `addCount=false` / `mod.targetInRange` / `mod.cardUsable` / `storage` / `get.autoViewAs`。

---

### 2.4.2 破军

**文案：**
> 你于回合内使用【杀】时，你可以移去任意张"疑军"，然后额外指定等量名目标，若如此做，此【杀】无法被响应且伤害+1。

**设计点：**
1. 用"疑军"换【杀】的目标扩张：移去 N 张 → 额外指定 N 名目标。
2. 强化牌面：全目标无法响应（`directHit`）+ 伤害+1（`baseDamage++`）。
3. 与疑城③联动：疑军当杀同样能触发破军。

**实现要点：**
- **触发**：`trigger:{player:"useCard2"}`（参考巡使加目标时机）。useCard2 **只对"使用牌"触发**（打出杀/响应杀不会触发），配合 filter 判 `_status.currentPhase == player`（仅回合内主动使用【杀】）。
- **content**：先算可用额外目标（`game.filterPlayer(t => !trigger.targets.includes(t) && lib.filter.targetEnabled2(trigger.card, player, t))`），`chooseButton([...], [0, Math.min(疑军数, 可用目标数)])` 选任意张疑军 → `chooseTarget([num,num])` 选等量名额外目标 → `loseToDiscardpile` 移去疑军 → `trigger.targets.addArray(新目标)`。
- **无法响应 + 伤害+1**：`trigger.directHit.addArray(trigger.targets)`（含原目标与新目标）+ `trigger.baseDamage++`。
- **AI**：chooseButton 的 ai 只在存在可额外指定的**敌人**（`get.attitude(me,t)<0`）时返回正数，且优先移去低价值疑军（`4 - get.value(button.link, me)`）。

**关键 API：** `useCard2` / `_status.currentPhase` / `chooseButton`+`[0,n]` / `chooseTarget([num,num])` / `targetEnabled2` / `trigger.targets.addArray` / `trigger.directHit.addArray` / `trigger.baseDamage++` / `loseToDiscardpile` / `get.attitude`。

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
15. **扩展区标记牌 gaintag 必须与技能名一致**：lose 事件只对 **gaintag == 技能名** 的标记自动 `markSkill`/`unmarkSkill` 刷新（content.js lose 的 `unmarks` 循环），用展示名作 gaintag 会导致标记永不更新；且 **`addToExpansion` 不自动刷新**，放牌后需显式 `player.markSkill("技能名")`（疑城①）。
16. **`chooseCard` 勿用 `[0,X]`**：最小0时"确定"按钮无意义（不选牌点确定等同取消，只有选牌后才出现真正生效的确定）。应**先用 `chooseBool` 问"是否发动"**，确认后再 `chooseCard("hej",...,[1,X])`（至少选1张）（疑城①）。
17. **令牌对单目标无效**：`useCardToTarget` 时机用 `trigger.getParent().excluded.add(player)` 令该牌只对目标自己无效（参考娴辅；疑城②）。
18. **"不计入次数"**：chooseButton backup 的 `precontent` 里 `event.getParent().addCount = false`（natuheng 式），配合 `mod.cardUsable` 返 `Infinity` 实现"无视次数限制"（疑城③）。
19. **jibing 式"类型+扩展牌"组合弹窗**（疑城③）：vcard 按钮 link 是 `[type,"",name,nature]` 数组，用 `Array.isArray(button.link)` 区分类型按钮与牌按钮；多类型时 `dialog._chooseButton=2`、`select()` 返 `_chooseButton||1`；`backup` 里 `_status.event` 就是 chooseToUse/chooseToRespond 事件（可直接读 filterCard）；单类型模式（`dialog._cardName`）下 `backup` 的 `links[0]` 是扩展牌，需按事件过滤重新推断唯一可用类型。
20. **`useCard2` 时机加目标**（破军/巡使）：只对"使用牌"触发（打出杀不触发），可 `trigger.targets.addArray(新目标)` 额外加目标，`trigger.directHit.addArray(全部目标)` 令无法响应，`trigger.baseDamage++` 加伤害。
