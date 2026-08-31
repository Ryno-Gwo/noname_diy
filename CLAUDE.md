# 项目指令

> 本文件在 `noname/resources/app/extension/noname_diy/` 中有一份副本，用于 git 记录。修改时请同步更新。

## noname 引擎扩展开发

扩展位于 `noname/resources/app/extension/noname_diy/`。

### 文件结构
- `skill.js` — 技能定义
- `character.js` — 武将定义（`skills` 数组注册技能名）
- `translate.js` — 翻译（`技能名` + `技能名_info`）
- `extension.js` — 主入口
- `info.json` — 扩展元信息

### 技能注册三要素（缺一不可）
1. `skill.js` 中有技能定义
2. `character.js` 的 `skills` 数组中注册
3. `translate.js` 中有 `技能名` 和 `技能名_info` 翻译条目

### 引擎行为参考

遇到引擎机制问题（触发、标记、事件属性等），查阅 `README_REF.md` 的"踩坑记录"章节（第3节），其中记录了所有已验证的引擎行为和解决方案，但也可能有错漏或误区，实际开发应当结合具体情况具体分析。

### 编辑规范
- 修改技能后同步更新 `translate.js`、`README.md`、`README_REF.md`
- 如非必要（比如引擎自身存在重大漏洞等），不得修改引擎文件，优先在扩展代码内解决

### 技能描述与辅助解释（重要）

编写技能时，必须区分**技能描述**和**辅助解释**：

- **技能描述**（写入 `translate.js`、`README.md`、`README_REF.md` 的"文案"部分）：正式文案语言，与游戏内显示一致。
- **辅助解释**（仅供开发者/AI 理解）：实现原理、API 说明、设计意图分析等，这部分内容不能出现在技能描述中。
