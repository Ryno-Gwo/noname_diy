import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig["skill"] } */
const skills = {
	"魂契": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		trigger: {
			player: ["changeHp", "phaseBegin"],
			global: "gameStart",
		},
		filter(event, player, name) {
			if (name === "gameStart" || name === "phaseBegin") {
				// ③存在拥有你未持有技能的其他角色时才触发
				return game.hasPlayer(
					(current) =>
						current !== player &&
						lib.skill.夺魂
							.getSkills(current)
							.some((i) => !player.hasSkill(i)),
				);
			}
			// ①体力值增加后
			return event.num > 0 && player.hp > 1;
		},
		mod: {
			maxHandcardFinal(player) {
				return player.maxHp;
			},
		},
		async content(event, trigger, player) {
			if (
				event.triggername === "gameStart" ||
				event.triggername === "phaseBegin"
			) {
				// ③游戏开始或你的回合开始时，获得一名其他角色的一个技能（强制发动，来源与技能均由玩家自选）
				await lib.skill.夺魂.stealSkill(player);
				return;
			}
			// ①体力增长自动转化为体力上限
			const X = player.hp - 1;
			if (X > 0) {
				await player.loseHp(X);
				await player.gainMaxHp(X);
			}
		},
		skill_id: "魂契",
		_priority: 0,
	},
	"夺魂": {
		audio: "ext:noname_diy:2",
		forced: true,
		locked: true,
		trigger: {
			global: "_saveAfter",
		},
		filter(event, player) {
			// _saveAfter: 求桃失败、正式死亡前
			if (
				!event.dying ||
				!event.dying.isIn() ||
				!event.dying.isDying()
			) {
				return false;
			}
			// 选项1可行：上限>1 且武将牌堆有你可获得的技能；选项2可行：持有来源技；
			// 选项3可行：有牌可弃且存在可恢复的失效技能
			return (
				(player.maxHp > 1 &&
					lib.skill.夺魂.getPileCandidates(player).length > 0) ||
				lib.skill.夺魂.getStolenSkills(player).length > 0 ||
				(player.countCards("he") > 0 &&
					lib.skill.夺魂.getRestorableSkills(player).length > 0)
			);
		},
		getSkills(target) {
			const list = [];
			if (lib.character[target.name]) {
				list.addArray(lib.character[target.name][3]);
			}
			if (lib.character[target.name1]) {
				list.addArray(lib.character[target.name1][3]);
			}
			if (lib.character[target.name2]) {
				list.addArray(lib.character[target.name2][3]);
			}
			return list;
		},
		getStolenSkills(player) {
			const map = player.storage.夺魂_sources || {};
			return Object.keys(map).filter(
				(skill) => map[skill] !== player && player.hasSkill(skill),
			);
		},
		// 剩余武将牌堆中拥有"你可获得技能"的武将（同幻魂.getPileCandidates；未初始化时先建堆）
		getPileCandidates(player) {
			if (!_status.characterlist) {
				game.initCharacterList();
			}
			return _status.characterlist.filter(
				(name) =>
					lib.character[name] &&
					lib.character[name][3] &&
					lib.character[name][3].some((i) => !player.hasSkill(i)),
			);
		},
		// 选项1交互：观看武将牌堆中的X张牌（num），选择其中一名武将并获得其一个技能；
		// 仅观看，武将牌不离开牌堆（同幻魂选项3）；来源记为哨兵字符串"武将牌堆"
		// （不与任何玩家对象相等，getStolenSkills 照常纳入）
		async gainFromPile(player, num = 5) {
			const candidates = lib.skill.夺魂.getPileCandidates(player);
			if (!candidates.length) {
				return;
			}
			const list = candidates.randomGets(num);
			const result = await player
				.chooseButton(
					[
						`夺魂：观看武将牌堆中的${get.cnNumber(list.length)}张牌，选择其中一张获得其一个技能`,
						[list, "character"],
					],
					true,
				)
				.set("ai", (button) => {
					const me = _status.event.player;
					const skills =
						(lib.character[button.link] && lib.character[button.link][3]) || [];
					let eff = 0;
					for (const skill of skills) {
						if (!me.hasSkill(skill)) {
							eff += 1;
						}
					}
					return eff + Math.random();
				})
				.forResult();
			if (!result?.bool || !result.links?.length) {
				return;
			}
			const name = result.links[0];
			const skills = ((lib.character[name] && lib.character[name][3]) || []).filter(
				(i) => !player.hasSkill(i),
			);
			if (!skills.length) {
				return;
			}
			const chosen = await player
				.chooseButton(
					[`选择获得${get.translation(name)}的一个技能`, [skills, "skill"]],
					true,
				)
				.set("ai", (button) => {
					const info = get.info(button.link);
					if (info && info.charlotte) {
						return 1;
					}
					if (info && info.ai && info.ai.combo) {
						return 3 + Math.random();
					}
					return 2 + Math.random();
				})
				.forResult();
			if (!chosen?.bool || !chosen.links?.length) {
				return;
			}
			await player.addSkills(chosen.links);
			if (!player.storage.夺魂_sources) {
				player.storage.夺魂_sources = {};
			}
			for (const skill of chosen.links) {
				player.storage.夺魂_sources[skill] = "武将牌堆";
			}
		},
		async stealSkill(player) {
			// 选定一名其他角色并获得其一个技能，记录技能来源（魂契③专用）
			const tResult = await player
				.chooseTarget(
					true,
					"选择一名其他角色，永久获得其一个技能",
					(card, player2, t) => {
						return (
							player2 !== t &&
							lib.skill.夺魂
								.getSkills(t)
								.some((i) => !player2.hasSkill(i))
						);
					},
				)
				.set("ai", (t) => {
					const player2 = _status.event.player;
					const filtered = lib.skill.夺魂
						.getSkills(t)
						.filter((i) => !player2.hasSkill(i));
					if (!filtered.length) {
						return 0;
					}
					return 1 + Math.random();
				})
				.forResult();
			if (!tResult.bool || !tResult.targets.length) {
				return;
			}
			const source = tResult.targets[0];
			const skills = lib.skill.夺魂
				.getSkills(source)
				.filter((i) => !player.hasSkill(i));
			if (!skills.length) {
				return;
			}
			const chosen = await player
				.chooseButton(["请选择要获得的技能", [skills, "skill"]], true)
				.set("ai", (button) => {
					const info = get.info(button.link);
					if (info && info.charlotte) {
						return 1;
					}
					if (info && info.ai && info.ai.combo) {
						return 3 + Math.random();
					}
					return 2 + Math.random();
				})
				.forResult();
			if (chosen.bool && chosen.links && chosen.links.length) {
				await player.addSkills(chosen.links);
				if (!player.storage.夺魂_sources) {
					player.storage.夺魂_sources = {};
				}
				for (const skill of chosen.links) {
					player.storage.夺魂_sources[skill] = source;
				}
			}
		},
		// 失效池：仍拥有但当前不生效的技能（被 disableSkill 禁用，或被 skillBlocker 封锁）。
		// 不含已 removeSkill 移除的技能（夺魂/魂契拿到又失去的来源技不在其列，无法恢复），
		// 也不含已觉醒的技能（awakenSkill 的觉醒封锁不属"被锁"，恢复它等于解除觉醒）
		getDisabledSkills(player) {
			const raw = player.getSkills(null, false, false);
			const effective = player.getSkills(null, false, true);
			return raw.filter(
				(skill) =>
					!effective.includes(skill) &&
					!player.awakenedSkills.includes(skill),
			);
		},
		// 可恢复判定：disableSkill 型（止涕式）恒可解；
		// skillBlocker 型（破怠式）须封锁器以 storage 数组记录封锁名单，动态条件封锁不可恢复
		canRestoreSkill(player, skill) {
			const sources = player.disabledSkills[skill];
			if (Array.isArray(sources) && sources.length) {
				return true;
			}
			return (player.storage.skill_blocker || []).some((blocker) => {
				const info = lib.skill[blocker];
				return (
					info &&
					info.skillBlocker &&
					info.skillBlocker(skill, player) &&
					Array.isArray(player.storage[blocker]) &&
					player.storage[blocker].includes(skill)
				);
			});
		},
		getRestorableSkills(player) {
			return lib.skill.夺魂
				.getDisabledSkills(player)
				.filter((skill) => lib.skill.夺魂.canRestoreSkill(player, skill));
		},
		// 恢复一个失效技能：对两类封锁做精确反操作，连 group 子技一起解封
		restoreSkill(player, skill) {
			// ① disableSkill 型（止涕式）：删除该技能及 group 子技树上的全部封锁记录
			// （不能 enableSkill(禁用者)——那是按禁用者全局解，会连其封锁的其他技能一起放开）
			const tree = [skill];
			game.expandSkills(tree);
			for (const t of tree) {
				delete player.disabledSkills[t];
			}
			// ② skillBlocker 型（破怠式）：从封锁器的 storage 名单移除；名单清空则连封锁器一并移除
			for (const blocker of (player.storage.skill_blocker || []).slice()) {
				const info = lib.skill[blocker];
				const storage = player.storage[blocker];
				if (
					info &&
					info.skillBlocker &&
					info.skillBlocker(skill, player) &&
					Array.isArray(storage) &&
					storage.includes(skill)
				) {
					storage.remove(skill);
					if (!storage.length) {
						player.removeSkill(blocker); // onremove → removeSkillBlocker，并清理标记
					} else {
						player.markSkill(blocker); // 刷新封锁标记的失效列表显示
					}
				}
			}
			// 失效期间 checkMarks 可能清过技能标记，恢复后补挂
			if (lib.skill[skill]?.mark) {
				player.markSkill(skill);
			}
			_status.event.clearStepCache();
		},
		// 恢复交互：选择并恢复一个失效技能，返回是否恢复（夺魂③/止涕③共用）
		async restoreDisabledSkill(player) {
			const list = lib.skill.夺魂.getRestorableSkills(player);
			if (!list.length) {
				return false;
			}
			const result = await player
				.chooseButton(["选择恢复一个失效技能", [list, "skill"]], true)
				.set("ai", (button) => {
					const info = get.info(button.link);
					if (["魂契", "夺魂", "迅袭", "止涕"].includes(button.link)) {
						return 4;
					}
					if (info && info.ai && info.ai.combo) {
						return 3 + Math.random();
					}
					return 2 + Math.random();
				})
				.forResult();
			if (!result?.bool || !result.links?.length) {
				return false;
			}
			const skill = result.links[0];
			lib.skill.夺魂.restoreSkill(player, skill);
			game.log(player, "的技能", "#g【" + get.translation(skill) + "】", "恢复了");
			return true;
		},
		async content(event, trigger, player) {
			const target = trigger.dying;
			const stolenSkills = lib.skill.夺魂.getStolenSkills(player);
			// 多选一（可取消）；任一选项执行后濒死角色回复体力值至1点
			const controls = [];
			if (
				player.maxHp > 1 &&
				lib.skill.夺魂.getPileCandidates(player).length > 0
			) {
				controls.push("减体力上限并获得技能");
			}
			if (stolenSkills.length) {
				controls.push("失去技能并摸两张牌");
			}
			if (
				player.countCards("he") > 0 &&
				lib.skill.夺魂.getRestorableSkills(player).length > 0
			) {
				controls.push("弃牌恢复技能");
			}
			if (!controls.length) {
				return;
			}
			controls.push("cancel2");
			// X为场上角色数且至少为3（观看武将牌堆的张数）
			const pileNum = Math.max(3, game.countPlayer());
			const costResult = await player
				.chooseControl(controls)
				.set("prompt", get.prompt("夺魂", target))
				.set(
					"prompt2",
					`濒死角色：${get.translation(target)}。选择一项：①若你的体力上限大于1，你减少1点体力上限，观看武将牌堆的${pileNum}张牌并获得其中一个技能；②失去一个来源于其他角色或武将牌堆的技能并摸两张牌；③弃一张牌并恢复一个失效技能。选择一项后令其回复体力值至1点。`,
				)
				.set("restoreSkills", lib.skill.夺魂.getRestorableSkills(player))
				.set("ai", () => {
					const player2 = _status.event.player;
					const trigger2 = _status.event.getTrigger();
					const target2 = trigger2 && trigger2.dying;
					if (target2 && target2 !== player2 && get.attitude(player2, target2) <= 0) {
						return "cancel2";
					}
					const evtControls = _status.event.controls || [];
					const restoreSkills = _status.event.restoreSkills || [];
					// 有核心技/连协技可恢复时，③弃牌解封优先于摸牌
					const hasGoodRestore = restoreSkills.some(
						(s) =>
							["魂契", "夺魂", "迅袭", "止涕"].includes(s) ||
							get.info(s)?.ai?.combo,
					);
					if (
						evtControls.includes("减体力上限并获得技能") &&
						player2.maxHp > 2
					) {
						return "减体力上限并获得技能";
					}
					if (hasGoodRestore && evtControls.includes("弃牌恢复技能")) {
						return "弃牌恢复技能";
					}
					if (evtControls.includes("失去技能并摸两张牌")) {
						return "失去技能并摸两张牌";
					}
					if (evtControls.includes("减体力上限并获得技能")) {
						return "减体力上限并获得技能";
					}
					if (evtControls.includes("弃牌恢复技能")) {
						return "弃牌恢复技能";
					}
					return "cancel2";
				})
				.forResult();
			if (costResult.control === "cancel2" || !costResult.control) {
				return;
			}
			if (costResult.control === "减体力上限并获得技能") {
				// 选项1：减少1点体力上限，观看武将牌堆的X张牌并获得其中一个技能
				await player.loseMaxHp();
				await lib.skill.夺魂.gainFromPile(player, pileNum);
			} else if (costResult.control === "弃牌恢复技能") {
				// 选项3：弃一张牌并恢复一个失效技能
				await player.chooseToDiscard(
					"he",
					true,
					1,
					"夺魂：弃一张牌，恢复你的一个失效技能",
				);
				await lib.skill.夺魂.restoreDisabledSkill(player);
			} else {
				// 选项2：失去一个来源于其他角色或武将牌堆的技能并摸两张牌
				const chosen = await player
					.chooseButton([
						"请选择要失去的来源于其他角色或武将牌堆的技能",
						[stolenSkills, "skill"],
					])
					.set("ai", (button) => {
						const info = get.info(button.link);
						if (info && info.charlotte) {
							return 1;
						}
						return 2 + Math.random();
					})
					.forResult();
				if (!chosen.bool || !chosen.links || !chosen.links.length) {
					return;
				}
				for (const skill of chosen.links) {
					await player.removeSkill(skill);
					if (player.storage.夺魂_sources) {
						delete player.storage.夺魂_sources[skill];
					}
				}
				await player.draw(2);
			}
			// 濒死角色回复体力值至1点（此刻仍在死亡结算前，recoverTo(1) 即可阻止后续 die）
			await target.recoverTo(1);
		},
		skill_id: "夺魂",
		_priority: 0,
	},
	"迅袭": {
		audio: "ext:noname_diy:2",
		trigger: {
			// "一名其他角色使用牌对唯一目标造成的伤害结算结束后"：伤害结算后时机，global 单时机挂法
			// （damageAfter 由事件系统在 damage 事件 content 完成后触发，濒死结算已结束——
			// 事后追责窗口；注意与止涕的事件内时机 damageSource 区分）
			global: "damageAfter",
		},
		// "可以"的可选触发技：prompt 属性交由引擎自动弹 chooseBool（踩坑#31，同幻劫/幻生）；
		// AI 取舍用 check（content.js:3604：next2.ai = () => !check || check(...)）
		prompt: "是否发动【迅袭】？",
		filter(event, player) {
			// 代价校验：上限>1（减1后仍≥1）
			if (player.maxHp <= 1) {
				return false;
			}
			// "一名其他角色使用牌"：伤害须有来源，来源非自己且存活
			const source = event.source;
			if (!source || source === player || !source.isIn()) {
				return false;
			}
			// "使用牌"：须有牌（技能直伤 event.card 为空）
			if (!event.card) {
				return false;
			}
			// "对唯一目标"：该牌使用事件的目标数为1（南蛮/万箭等AOE、方天画戟多方杀均排除）。
			// ⚠️ getParent 按名找不到父事件时返回空对象 {}（truthy），故必须用
			// Array.isArray(useCard.targets) 判定，不能只判 useCard 真值
			const useCard = event.getParent("useCard");
			if (
				!useCard ||
				!Array.isArray(useCard.targets) ||
				useCard.targets.length !== 1
			) {
				return false;
			}
			// 0点伤害不算"造成伤害"（同幻魂）
			return event.num > 0;
		},
		check(trigger, player) {
			// 付1上限补1刀：来源或目标里有敌人才值得发动
			const source = trigger.source;
			const victim = trigger.player;
			return (
				get.attitude(player, source) < 0 ||
				(victim && get.attitude(player, victim) < 0)
			);
		},
		async content(event, trigger, player) {
			// "对其或目标"：伤害来源 或 受伤目标（去重——闪电自伤时二者合一；均限存活，
			// 结算后受伤者可能已死于该伤害，此时仅可追责来源）
			const candidates = [...new Set([trigger.source, trigger.player])].filter(
				(t) => t && t.isIn(),
			);
			if (!candidates.length) {
				return;
			}
			// 先支付后结算：减少一点体力上限
			await player.loseMaxHp();
			const result = await player
				.chooseTarget(
					true,
					"迅袭：对其或目标造成一点伤害",
					(card, player2, t) => candidates.includes(t),
				)
				.set("ai", (t) => {
					const me = _status.event.player;
					return -get.attitude(me, t) + Math.random();
				})
				.forResult();
			if (!result?.bool || !result.targets?.length) {
				return;
			}
			const target = result.targets[0];
			player.line(target);
			await target.damage(1, player);
		},
		skill_id: "迅袭",
		_priority: 0,
	},
	"止涕": {
		audio: "ext:noname_diy:2",
		trigger: {
			source: "damageSource",
		},
		logTarget: "player",
		filter(event, player) {
			const target = event.player;
			// 不判目标存活：damageSource 在死亡结算之后触发（damage 事件步骤：
			// changeHp → dying/death → damageSource），两个分支都应对击杀成立。
			// 2026-10 三次改版：造成伤害即触发；七次改版扩为多选一（上限/摸牌 / 封技 / 恢复失效技能）
			if (!target || target === player || !(event.num > 0)) {
				return false;
			}
			return true;
		},
		forced: true,
		async content(event, trigger, player) {
			const target = trigger.player;
			// 失效池：武将牌标注技能 ∩ 当前拥有 ∩ 非charlotte
			// （hasSkill 经 getSkills 过滤 disabledSkills，已被 disableSkill 封住的技能自然排除，无需另查失效标记）
			// 封技分支守卫并入可行性判定：本次伤害致死的目标已脱离游戏（die 第一步即移出
			// game.players），按规则不再是效果对象——此时仅剩选项1
			const banSkills = target.isIn()
				? lib.skill.夺魂
						.getSkills(target)
						.filter(
							(s) =>
								target.hasSkill(s) &&
								!lib.skill[s]?.charlotte,
						)
				: [];
			// 选项1：若你的体力上限小于场上的角色数，你增加一体力上限，否则你摸一张牌
			// （加在自己身上，杀死目标时同样生效；封顶与否决定弹窗首选项文案）
			const applyOption1 = async () => {
				if (player.maxHp < game.countPlayer()) {
					await player.gainMaxHp();
				} else {
					await player.draw(1);
				}
			};
			const maxHpCapped = player.maxHp >= game.countPlayer();
			const option1Label = maxHpCapped ? "摸一张牌" : "增加体力上限";
			// 选项3候选：自己当前可恢复的失效技能（被破怠等封锁/禁用时的反制）
			const restoreSkills = lib.skill.夺魂.getRestorableSkills(player);
			// 多选一；选项2/3均不可行（目标已死/无可封技且无可恢复技）时仅剩选项1，直接执行不询问
			if (banSkills.length === 0 && restoreSkills.length === 0) {
				await applyOption1();
				return;
			}
			const controls = [option1Label];
			const choiceList = [
				maxHpCapped
					? "摸一张牌（你的体力上限已不小于场上角色数）"
					: "增加一体力上限",
			];
			if (banSkills.length > 0) {
				controls.push("令其失去技能");
				choiceList.push(
					`令${get.translation(target)}失去一个技能，直到其下一个回合结束`,
				);
			}
			if (restoreSkills.length > 0) {
				controls.push("恢复失效技能");
				choiceList.push("恢复你的一个失效技能");
			}
			const result = await player
				.chooseControl(controls)
				.set("prompt", get.prompt(event.name, target))
				.set("choiceList", choiceList)
				.set("banSkills", banSkills)
				.set("restoreSkills", restoreSkills)
				.set("option1Label", option1Label)
				.set("ai", () => {
					const me = _status.event.player;
					const tgt = _status.event.getTrigger().player;
					const bans = _status.event.banSkills;
					const restores = _status.event.restoreSkills;
					const opt1 = _status.event.option1Label;
					// 优先恢复自己的核心技（被锁魂契/夺魂等时以此反制）；友方不封技；
					// 敌方持有combo技时封技压制；恢复连协技次优先，否则走选项1（上限成长或摸牌）
					if (
						restores.some((s) =>
							["魂契", "夺魂", "迅袭", "止涕"].includes(s),
						)
					) {
						return "恢复失效技能";
					}
					if (get.attitude(me, tgt) < 0) {
						const combo = bans.some(
							(s) =>
								get.info(s) &&
								get.info(s).ai &&
								get.info(s).ai.combo,
						);
						if (combo) {
							return "令其失去技能";
						}
					}
					if (restores.some((s) => get.info(s)?.ai?.combo)) {
						return "恢复失效技能";
					}
					return opt1;
				})
				.forResult();
			if (result?.control === "恢复失效技能") {
				await lib.skill.夺魂.restoreDisabledSkill(player);
				return;
			}
			if (result?.control !== "令其失去技能") {
				await applyOption1();
				return;
			}
			const chosen = await player
				.chooseButton(
					[
						`选择令${get.translation(target)}失去的一个技能`,
						[banSkills, "skill"],
					],
					true,
				)
				.set("ai", (button) => {
					const info = get.info(button.link);
					if (info && info.ai && info.ai.combo) {
						return 3 + Math.random();
					}
					return 2 + Math.random();
				})
				.forResult();
			if (!chosen.bool || !chosen.links || !chosen.links.length) {
				return;
			}
			const skill = chosen.links[0];
			player.line(target);
			game.log(target, "的技能", "#g【" + get.translation(skill) + "】", "失效了");
			// 封锁至其下一个回合结束：disableSkill 挂 disabledSkills，经 getSkills 过滤后
			// 触发/主动使用/mod 被动/skillTag/依赖 hasSkill 的 global 子技一并失效
			// （temp_ban 只覆盖触发与主动使用两个显式检查点，mod 等照常生效——见踩坑#47、#51）
			// ⚠️ 首次禁用若技能同时有 ondisable+onremove 会执行破坏性清理；本扩展与常规官方技均无 ondisable，安全
			target.disableSkill("止涕", skill);
			// 解除时机用官方 dcsbzuojun 式 when 钩子——在其自己的回合结束触发，
			// filter 跳过封技发生时所在的当前回合（若在其回合内造成伤害则顺延一回合）
			target
				.when({ player: "phaseEnd" }, false)
				.filter((evt) => evt != event.getParent("phase"))
				.assign({
					firstDo: true,
				})
				.step(async (evt2, trigger2, player2) => {
					player2.enableSkill("止涕");
				})
				.finish();
		},
		ai: {
			effect: {
				target(card, player, target, current) {
					// 止涕强制触发：对其他角色造成伤害必有收益（上限/摸牌/封技/恢复），伤害牌价值提升
					if (target !== player && get.tag(card, "damage") > 0) {
						return current + 0.3;
					}
				},
			},
		},
		skill_id: "止涕",
		_priority: 0,
	},
	"归訫": {
		audio: "ext:noname_diy:2",
		trigger: {
			player: "changeHp",
		},
		global: "归訫_put",
		group: ["归訫_use"],
		hasGuixin(player) {
			return player.getExpansions("归訫2").length > 0;
		},
		filter(event, player) {
			return game.hasPlayer(
				(target) =>
					target !== player &&
					target.isIn() &&
					(lib.skill.归訫.hasGuixin(target) ||
						target.countCards("hej") > 0),
			);
		},
		getIndex(event, player) {
			return Math.abs(event.changedHp);
		},
		async cost(event, trigger, player) {
			event.result = await player
				.chooseTarget(
					get.prompt(event.skill),
					"你可以依次选择其他角色：有\"归訫\"者你将其所有\"归訫\"移至你的武将牌上；无\"归訫\"者你获得其区域内的一张牌，然后你翻面。",
					(card, player2, target) =>
						target !== player2 &&
						target.isIn() &&
						(lib.skill.归訫.hasGuixin(target) ||
							target.countCards("hej") > 0),
					[1, Infinity],
				)
				.set("ai", (target) => {
					const me = _status.event.player;
					const att = get.attitude(me, target);
					if (att > 0) return -1;
					const guixin = target.getExpansions("归訫2");
					if (guixin.length > 0) {
						return -att + guixin.length - 0.5;
					}
					return -att - 1;
				})
				.forResult();
		},
		async content(event, trigger, player) {
			for (const target of event.targets.slice(0)) {
				if (!target.isIn()) continue;
				const guixin = target.getExpansions("归訫2").slice(0);
				if (guixin.length > 0) {
					player.line(target, "green");
					player.addSkill("归訫2");
					const next = player.addToExpansion(
						guixin,
						target,
						"giveAuto",
					);
					next.gaintag.add("归訫2");
					await next;
					game.log(
						player,
						"将",
						target,
						"的所有\"归訫\"移至了自己的武将牌上",
					);
					if (target.getExpansions("归訫2").length === 0) {
						target.removeSkill("归訫2");
					}
				} else {
					if (!target.countCards("hej")) continue;
					const next = player.gainPlayerCard({
						target: target,
						position: "hej",
						selectButton: [1, 1],
						prompt: `获得${get.translation(target)}区域内的一张牌`,
						ai: (button) => {
							const att = get.attitude(player, target);
							return att > 0
								? -get.buttonValue(button)
								: get.buttonValue(button);
						},
					});
					await next;
				}
			}
			await player.turnOver();
			game.log(player, "因【归訫】翻面了");
		},
		ai: {
			maixie: true,
			maixie_hp: true,
		},
		skill_id: "归訫",
		_priority: 0,
	},
	"归訫2": {
		charlotte: true,
		sub: true,
		sourceSkill: "归訫",
		onremove(player, skill) {
			const cards = player.getExpansions(skill);
			if (cards.length) {
				player.loseToDiscardpile({ cards });
			}
		},
		intro: {
			name: "归訫",
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("归訫2");
				if (cards.length) {
					if (player.isUnderControl(true)) {
						dialog.addAuto(cards);
					} else {
						return "共有" + get.cnNumber(cards.length) + "张\"归訫\"牌";
					}
				}
			},
		},
		ai: {
			notemp: true,
		},
		skill_id: "归訫2",
		_priority: 0,
	},
	"归訫_put": {
		audio: "归訫",
		sub: true,
		sourceSkill: "归訫",
		trigger: {
			player: "phaseBegin",
		},
		filter(event, player) {
			if (!player.countCards("hej")) return false;
			const holder = game.findPlayer((current) =>
				current.hasSkill("归訫"),
			);
			return !!holder;
		},
		logTarget(trigger, player) {
			return game.findPlayer((current) => current.hasSkill("归訫"));
		},
		async cost(event, trigger, player) {
			const holder = game.findPlayer((current) =>
				current.hasSkill("归訫"),
			);
			if (!holder) {
				event.result = { bool: false };
				return;
			}
			const next = player.chooseCard(
				"hej",
				`${get.prompt("归訫", holder)}：是否将一张区域内的牌置于武将牌上？`,
				(card) => lib.filter.cardDiscardable(card, player),
			);
			next.set("ai", (card) => {
				const me = _status.event.player;
				const useful = get.useful(card, me);
				if (get.position(card) === "j") {
					return 15 - useful;
				}
				if (me !== holder && get.attitude(holder, me) <= 0) {
					return 0;
				}
				if (useful > 4) return 0;
				return 10 - useful;
			});
			event.result = await next.forResult();
		},
		async content(event, trigger, player) {
			const holder = game.findPlayer((current) =>
				current.hasSkill("归訫"),
			);
			if (!holder) return;
			const cards = event.cards.slice(0);
			if (!cards.length) return;
			player.addSkill("归訫2");
			const next = player.addToExpansion(cards, player, "giveAuto");
			next.gaintag.add("归訫2");
			await next;
			game.log(player, "将", cards, "置于武将牌上，作为\"归訫\"");
			const drawResult = await holder
				.chooseBool(`是否令${get.translation(player)}摸一张牌？`)
				.set("ai", () =>
					player === holder || get.attitude(holder, player) > 0 ? 1 : 0,
				)
				.forResult();
			if (drawResult.bool) {
				await player.draw();
				game.log(holder, "令", player, "摸了一张牌");
			}
		},
		skill_id: "归訫_put",
		_priority: 0,
	},
	"归訫_use": {
		audio: "归訫",
		sub: true,
		sourceSkill: "归訫",
		enable: ["chooseToUse", "chooseToRespond"],
		filter(event, player) {
			if (!player.getExpansions("归訫2").length) {
				return false;
			}
			return (
				get.inpileVCardList((info) => {
					if (!["basic", "trick"].includes(info[0])) {
						return false;
					}
					return event.filterCard(
						get.autoViewAs(
							{ name: info[2], nature: info[3] },
							"unsure",
						),
						player,
						event,
					);
				}).length > 0
			);
		},
		chooseButton: {
			dialog(event, player) {
				const list = get.inpileVCardList((info) => {
					if (!["basic", "trick"].includes(info[0])) {
						return false;
					}
					return event.filterCard(
						get.autoViewAs(
							{ name: info[2], nature: info[3] },
							"unsure",
						),
						player,
						event,
					);
				});
				return ui.create.dialog("归訫", [list, "vcard"]);
			},
			check(button) {
				if (_status.event.getParent().type !== "phase") {
					return 1;
				}
				const player = get.player();
				return player.getUseValue({
					name: button.link[2],
					nature: button.link[3],
				});
			},
			backup(links, player) {
				return {
					audio: "归訫",
					popname: true,
					filterCard: true,
					selectCard: -1,
					position: "x",
					viewAs: { name: links[0][2], nature: links[0][3] },
					log: false,
					async precontent(event, trigger, player2) {
						const cards = player2.getExpansions("归訫2");
						if (!cards.length) {
							event.result.bool = false;
							return;
						}
						const card =
							cards[Math.floor(Math.random() * cards.length)];
						event.result.cards = [card];
						event.result.card = get.autoViewAs(
							{ name: links[0][2], nature: links[0][3] },
							[card],
						);
						player2.logSkill("归訫");
					},
				};
			},
			prompt(links, player) {
				return `随机使用一张\"归訫\"，将其当做${get.translation(links[0][3]) || ""}${get.translation(links[0][2])}使用`;
			},
		},
		hiddenCard(player, name) {
			if (!lib.inpile.includes(name)) {
				return false;
			}
			const type = get.type2(name);
			return (
				["basic", "trick"].includes(type) &&
				player.getExpansions("归訫2").length > 0
			);
		},
		ai: {
			fireAttack: true,
			respondSha: true,
			respondShan: true,
			skillTagFilter(player) {
				if (!player.getExpansions("归訫2").length) {
					return false;
				}
			},
			order: 7,
			result: {
				player(player) {
					if (_status.event.dying) {
						return get.attitude(player, _status.event.dying);
					}
					return 1;
				},
			},
		},
		subSkill: {
			backup: {
				skill_id: "归訫_use_backup",
				sub: true,
				sourceSkill: "归訫_use",
				_priority: 0,
			},
		},
		skill_id: "归訫_use",
		_priority: 0,
	},
	"飛影": {
		audio: "ext:noname_diy:2",
		locked: true,
		mod: {
			globalTo(from, to, distance) {
				if (lib.skill.归訫.hasGuixin(from)) {
					return distance + 1;
				}
			},
		},
		trigger: {
			global: ["phaseBegin", "useCard"],
		},
		forced: true,
		popup: false,
		silent: true,
		filter(event, player, name) {
			if (name === "phaseBegin") {
				return true;
			}
			const user = event.player;
			if (user === player) return false;
			if (lib.skill.归訫.hasGuixin(user)) return false;
			if (
				!event.targets ||
				event.targets.length !== 1 ||
				event.targets[0] !== player
			)
				return false;
			const used = player.storage.飛影_used || [];
			return !used.includes(user);
		},
		async content(event, trigger, player) {
			if (event.triggername === "phaseBegin") {
				player.storage.飛影_used = [];
				return;
			}
			const user = trigger.player;
			if (!player.storage.飛影_used) {
				player.storage.飛影_used = [];
			}
			player.storage.飛影_used.push(user);
			trigger.cancel();
			game.log(user, "使用的", trigger.card, "因【飛影】无效了");
		},
		ai: {
			effect: {
				target(card, player, target, current) {
					if (
						current < 0 &&
						get.attitude(player, target) < 0 &&
						!lib.skill.归訫.hasGuixin(player)
					) {
						return [1, -0.6];
					}
				},
			},
		},
		skill_id: "飛影",
		_priority: 1,
	},
	"七煋": {
		audio: "ext:noname_diy:2",
		trigger: {
			player: ["phaseBegin", "phaseEnd"],
			global: "phaseBefore",
		},
		direct: true,
		filter(event, player, name) {
			if (name == "phaseBegin") {
				return player.getExpansions("七煋").length < 7;
			}
			if (name == "phaseBefore") {
				return (
					game.phaseNumber == 0 &&
					player.getExpansions("七煋").length < 7
				);
			}
			if (name == "phaseEnd") {
				return (
					player.getExpansions("七煋").length > 0 &&
					game.hasPlayer((current) => current != player && current.isIn())
				);
			}
			return false;
		},
		async content(event, trigger, player) {
			if (
				event.triggername == "phaseBegin" ||
				event.triggername == "phaseBefore"
			) {
				const num = 7 - player.getExpansions("七煋").length;
				const cards = get.cards(7);
				const putBack = (list) => {
					for (let i = list.length - 1; i >= 0; i--) {
						ui.cardPile.insertBefore(list[i], ui.cardPile.firstChild);
					}
					game.updateRoundNumber();
				};
				const next = player.chooseToMove();
				next.set(
					"prompt",
					`七煋：调整牌堆顶七张牌的顺序（点击两张牌可交换位置），前${get.cnNumber(num)}张将置于武将牌上，称为\"煋\"`,
				);
				next.set("list", [["牌堆顶", cards]]);
				next.set("processAI", (list) => {
					const sorted = list[0][1]
						.slice(0)
						.sort((a, b) => get.value(a) - get.value(b));
					return [sorted];
				});
				const result = await next.forResult();
				if (!result.bool) {
					putBack(cards);
					return;
				}
				player.logSkill("七煋");
				const moved = result.moved[0].slice(0);
				const pushs = moved.slice(0, num);
				const backs = moved.slice(num);
				if (pushs.length) {
					const addStars = player.addToExpansion(pushs, "draw");
					addStars.gaintag.add("七煋");
					await addStars;
					player.markSkill("七煋");
				}
				if (backs.length) {
					putBack(backs);
					game.log(player, "将", backs, "置于了牌堆顶");
				}
			} else if (event.triggername == "phaseEnd") {
				const stars = player.getExpansions("七煋");
				const maxNum = Math.min(
					stars.length,
					game.countPlayer((current) => current != player && current.isIn()),
				);
				if (maxNum <= 0) {
					return;
				}
				const result = await player
					.chooseButton(
						[
							`七煋：是否将"煋"移至其他角色的武将牌上？`,
							[stars, "card"],
						],
						[1, maxNum],
					)
					.set("ai", () => 1 + Math.random())
					.forResult();
				if (!result.bool || !result.links || !result.links.length) {
					return;
				}
				const num = result.links.length;
				const result2 = await player
					.chooseTarget(
						`七煋：选择${get.cnNumber(num)}名角色，将"煋"分别移至其武将牌上`,
						(card, player2, target) =>
							target != player2 && target.isIn(),
						[num, num],
					)
					.set("ai", (target) => {
						const me = _status.event.player;
						return -get.attitude(me, target) + Math.random();
					})
					.forResult();
				if (!result2.bool || !result2.targets) {
					return;
				}
				player.logSkill("七煋", result2.targets);
				for (let i = 0; i < num; i++) {
					const target = result2.targets[i];
					const star = result.links[i];
					if (!target.isIn()) {
						continue;
					}
					const next = target.addToExpansion(star, player, "give");
					await next;
					target.addGaintag(star, "七煋");
					target.addSkill("七煋_mark");
					target.markSkill("七煋_mark");
				}
				player.markSkill("七煋");
				game.log(
					player,
					"将",
					get.cnNumber(num),
					"张\"煋\"分别移至了",
					result2.targets,
					"的武将牌上",
				);
			}
		},
		intro: {
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("七煋");
				if (cards.length) {
					if (player.isUnderControl(true)) {
						dialog.addAuto(cards);
					} else {
						return "共有" + get.cnNumber(cards.length) + "张\"煋\"";
					}
				}
			},
		},
		ai: {
			notemp: true,
		},
		skill_id: "七煋",
		_priority: 0,
	},
	"相天": {
		audio: "ext:noname_diy:2",
		trigger: {
			global: "phaseBegin",
		},
		filter(event, player) {
			const target = event.player;
			return (
				target &&
				target.isIn() &&
				target.getExpansions("七煋").length > 0
			);
		},
		logTarget: "player",
		async cost(event, trigger, player) {
			const target = trigger.player;
			const stars = target.getExpansions("七煋");
			const { bool, links } = await player
				.chooseButton([
					`相天：是否移去${get.translation(target)}武将牌上的一张\"煋\"？`,
					[stars, "card"],
				])
				.set("ai", () => 1 + Math.random())
				.forResult();
			if (!bool || !links || !links.length) {
				return;
			}
			const choice = await player
				.chooseControl(["相天_damage", "相天_defend", "cancel2"])
				.set("prompt", `相天：选择${get.translation(target)}的防伤效果`)
				.set("choiceList", [
					"其造成的非雷电伤害均被防止",
					"其受到的非雷电伤害均被防止",
				])
				.set("ai", () => {
					const me = _status.event.player;
					const trigger2 = _status.event.getTrigger();
					const target2 = trigger2 && trigger2.player;
					if (!target2) {
						return "cancel2";
					}
					if (target2 == me || get.attitude(me, target2) >= 0) {
						return "相天_defend";
					}
					return "相天_damage";
				})
				.forResult();
			if (!choice.control || choice.control == "cancel2") {
				return;
			}
			event.result = {
				bool: true,
				cost_data: { card: links[0], type: choice.control },
			};
		},
		async content(event, trigger, player) {
			const target = trigger.player;
			const { card, type } = event.cost_data;
			await target.loseToDiscardpile(card);
			if (target.getExpansions("七煋").length == 0) {
				target.removeSkill("七煋_mark");
			} else {
				target.markSkill("七煋_mark");
			}
			target.addTempSkill("相天2", { player: "phaseBeginStart" });
			target.markAuto("相天2", [type]);
		},
		ai: {
			notemp: true,
		},
		skill_id: "相天",
		_priority: 0,
	},
	"相天2": {
		charlotte: true,
		sub: true,
		sourceSkill: "相天",
		audio: "相天",
		onremove: true,
		trigger: {
			global: "damageBegin4",
		},
		filter(event, player) {
			if (event.hasNature("thunder")) {
				return false;
			}
			const storage = player.getStorage("相天2");
			const type = storage && storage[0];
			if (type == "相天_damage") {
				return event.source == player;
			}
			if (type == "相天_defend") {
				return event.player == player;
			}
			return false;
		},
		forced: true,
		async content(event, trigger, player) {
			trigger.cancel();
		},
		ai: {
			nofire: true,
			nodamage: true,
			effect: {
				target(card, player, target, current) {
					const storage = target.getStorage("相天2");
					const type = storage && storage[0];
					if (type != "相天_defend") {
						return;
					}
					if (
						get.tag(card, "damage") &&
						!get.tag(card, "thunderDamage")
					) {
						return "zeroplayertarget";
					}
				},
				player_use(card, player, target) {
					const storage = player.getStorage("相天2");
					const type = storage && storage[0];
					if (type != "相天_damage") {
						return;
					}
					if (
						get.tag(card, "damage") &&
						!get.tag(card, "thunderDamage")
					) {
						return [1, -0.5];
					}
				},
			},
		},
		intro: {
			name: "相天",
			content(storage, player) {
				const type = storage && storage[0];
				if (type == "相天_damage") {
					return "其造成的非雷电伤害均被防止";
				}
				return "其受到的非雷电伤害均被防止";
			},
		},
		skill_id: "相天2",
		_priority: 0,
	},
	"七煋_mark": {
		charlotte: true,
		sub: true,
		sourceSkill: "七煋",
		intro: {
			name: "煋",
			markcount(storage, player) {
				return player.getExpansions("七煋").length;
			},
			mark(dialog, storage, player) {
				const cards = player.getExpansions("七煋");
				if (cards.length) {
					dialog.addAuto(cards);
				}
			},
		},
		skill_id: "七煋_mark",
		_priority: 0,
	},
	"神机": {
		audio: "ext:noname_diy:2",
		trigger: {
			global: ["useCard", "respond"],
		},
		filter(event, player) {
			const card = event.card;
			if (!card || !card.isCard) {
				return false;
			}
			if (get.type2(card) == "equip") {
				return false;
			}
			if (!event.cards || event.cards.length !== 1) {
				return false;
			}
			if (player.hasSkill("神机_used")) {
				return false;
			}
			if (event.player != _status.currentPhase) {
				return false;
			}
			const user = event.player;
			if (!user || !user.isIn()) {
				return false;
			}
			return user.getExpansions("七煋").some((star) => {
				const suit = get.suit(star);
				const suit2 = get.suit(card);
				return (
					suit &&
					suit2 &&
					suit != "unsure" &&
					suit2 != "unsure" &&
					suit == suit2
				);
			});
		},
		logTarget: "player",
		async cost(event, trigger, player) {
			const user = trigger.player;
			const str =
				user == player
					? "摸一张牌，于此牌结算结束后你可以视为再次使用此牌"
					: `摸一张牌，然后令${get.translation(trigger.card)}无效并获得${get.translation(user)}的一张牌`;
			event.result = await player
				.chooseBool(get.prompt(event.skill, user), str)
				.set("ai", () => {
					const me = _status.event.player;
					const trigger2 = _status.event.getTrigger();
					const user2 = trigger2 && trigger2.player;
					if (!user2) {
						return 0;
					}
					if (user2 == me) {
						return 1;
					}
					return get.attitude(me, user2) < 0 ? 1 : 0;
				})
				.forResult();
		},
		async content(event, trigger, player) {
			const user = trigger.player;
			player.addTempSkill("神机_used");
			player.addMark("神机_used", 1, false);
			await player.draw();
			if (user == player) {
				const card = trigger.card;
				trigger.insertAfter(async (event2) => {
					const me = event2.player;
					if (!me.isIn()) {
						return;
					}
					const result = await me
						.chooseBool(`神机：是否视为再次使用${get.translation(card)}？`)
						.set("ai", () => {
							const me2 = _status.event.player;
							if (!me2.isIn()) {
								return 0;
							}
							if (lib.card[card.name] && lib.card[card.name].notarget) {
								return 1;
							}
							return game.hasPlayer((t) =>
								lib.filter.filterTarget(card, me2, t),
							)
								? 1
								: 0;
						})
						.forResult();
					if (!result.bool) {
						return;
					}
					const vcard = get.autoViewAs({
						name: card.name,
						nature: card.nature,
					});
					await me.chooseUseTarget(vcard, true, false);
				}, { player: player });
			} else {
				if (event.triggername == "useCard") {
					trigger.targets.length = 0;
					trigger.all_excluded = true;
				} else {
					trigger.cancel();
				}
				game.log(
					user,
					event.triggername == "useCard" ? "使用的" : "打出的",
					trigger.card,
					"因【神机】无效了",
				);
				if (user.countCards("hej") > 0) {
					await player.gainPlayerCard(user, "hej", true);
				}
			}
		},
		ai: {
			notemp: true,
		},
		subSkill: {
			used: {
				charlotte: true,
				onremove: true,
				intro: {
					content: "本回合已发动",
				},
			},
		},
		skill_id: "神机",
		_priority: 0,
	},
	"疑兵": {
		audio: "ext:noname_diy:2",
		trigger: {
			global: "phaseBegin",
		},
		forced: true,
		juexingji: true,
		derivation: ["疑城"],
		async content(event, trigger, player) {
			const target = trigger.player;
			if (!target.isIn()) return;
			const choice = await target
				.chooseControl("选项一", "选项二")
				.set("prompt", "疑兵：请选择一项")
				.set("choiceList", [
					`令${get.translation(player)}摸两张牌，然后其将其中一张置于武将牌上，称为\"疑兵\"`,
					`将你的一张牌置于${get.translation(player)}的武将牌上，称为\"疑兵\"`,
				])
				.set("ai", () => {
					const me = _status.event.player;
					const skillOwner = player;
					const att = get.attitude(me, skillOwner);
					if (att > 0) return "选项一";
					const hasJunk = me.hasCard(
						(card) => get.value(card, me) < 3,
						"he",
					);
					if (hasJunk) return "选项二";
					return "选项一";
				})
				.forResult();
			player.logSkill("疑兵", target);
			if (choice.control === "选项一") {
				game.log(target, "选择了选项一");
				const cards = get.cards(2);
				await player.showCards(cards, `${get.translation(player)}发动了【疑兵】`, true).set("clearArena", false);
				const result = await player
					.chooseCardButton("疑兵：选择一张牌置于武将牌上", cards, 1, true)
					.set("ai", (button) => get.value(button.link, player))
					.forResult();
				game.broadcastAll(ui.clear);
				if (result?.links?.length) {
					const chosen = result.links[0];
					const remain = cards.filter((c) => c !== chosen);
					const next = player.addToExpansion([chosen], "draw");
					next.gaintag.add("疑城");
					await next;
					player.markSkill("疑城");
					if (remain.length) {
						await player.gain(remain, "gain2");
					}
				}
			} else {
				game.log(target, "选择了选项二");
				const result = await target
					.chooseCard("he", `将一张牌置于${get.translation(player)}的武将牌上`, true)
					.set("ai", (card) => 8 - get.useful(card, _status.event.player))
					.forResult();
				if (result.bool && result.cards && result.cards.length) {
					const next = player.addToExpansion(result.cards, target, "give");
					next.gaintag.add("疑城");
					await next;
					player.markSkill("疑城");
				}
			}
			if (player.getExpansions("疑城").length >= game.countPlayer()) {
				player.$skill("疑兵", "legend", "wood", "main");
				player.awakenSkill("疑兵");
				player.addSkill("疑城");
				game.log(player, "觉醒了，获得了【疑城】");
			}
		},
		onremove(player, skill) {
			if (!player.hasSkill("疑城") && player.getExpansions("疑城").length) {
				player.loseToDiscardpile(player.getExpansions("疑城"));
			}
		},
		skill_id: "疑兵",
		_priority: 0,
	},
	"疑城": {
		audio: "ext:noname_diy:2",
		trigger: {
			player: ["phaseDrawBegin", "phaseDiscardBegin"],
		},
		group: ["疑城_negate"],
		direct: true,
		filter(event, player) {
			return player.countCards("hej") > 0;
		},
		async content(event, trigger, player) {
			const isPhaseDraw = event.triggername === "phaseDrawBegin";
			const phaseName = isPhaseDraw ? "摸牌阶段" : "弃牌阶段";
			player.logSkill(event.skill);
			const result = await player
				.chooseCard("hej", [1, Infinity], `跳过${phaseName}，选择任意张牌置于武将牌上，称为\"疑兵\"（取消则不跳过）`)
				.set("ai", (card) => 6 - get.useful(card, _status.event.player))
				.forResult();
			if (!result.bool || !result.cards || !result.cards.length) return;
			trigger.cancel();
			game.log(player, "跳过了", phaseName);
			const next = player.addToExpansion(result.cards, player, "giveAuto");
			next.gaintag.add("疑城");
			await next;
			player.markSkill("疑城");
			game.log(player, "将", get.cnNumber(result.cards.length), "张牌置于武将牌上，作为\"疑兵\"");
		},
		onremove(player, skill) {
			const cards = player.getExpansions("疑城");
			if (cards.length) {
				player.loseToDiscardpile(cards);
			}
		},
		intro: {
			name: "疑兵",
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("疑城");
				if (cards.length) {
					if (player.isUnderControl(true)) {
						dialog.addAuto(cards);
					} else {
						return "共有" + get.cnNumber(cards.length) + "张\"疑兵\"";
					}
				}
			},
		},
		skill_id: "疑城",
		_priority: 0,
	},
	"疑城_negate": {
		audio: "疑城",
		sub: true,
		sourceSkill: "疑城",
		trigger: {
			target: "useCardToTarget",
		},
		direct: true,
		filter(event, player) {
			if (event.player == player) return false;
			return player.getExpansions("疑城").length > 0;
		},
		async content(event, trigger, player) {
			const cards = player.getExpansions("疑城");
			if (!cards.length) return;
			const X = Math.max(1, Math.min(5, cards.length));
			const result = await player
				.chooseButton([
					`疑城：是否移去一张\"疑兵\"，令${get.translation(trigger.card)}对你无效，然后摸${get.cnNumber(X)}张牌？`,
					[cards, "card"],
				])
				.set("ai", (button) => {
					const me = _status.event.player;
					const trigger2 = _status.event.getTrigger();
					if (!trigger2) {
						return 0;
					}
					const targets = trigger2.targets || [];
					if (!targets.some((t) => t !== me && get.attitude(me, t) < 0)) {
						return 0;
					}
					if (trigger2.card && (trigger2.card.name == "sha" || get.tag(trigger2.card, "damage") > 0)) {
						return 5 - get.value(button.link, me);
					}
					return 3 - get.value(button.link, me);
				})
				.forResult();
			if (!result.bool || !result.links || !result.links.length) return;
			player.logSkill("疑城", trigger.player);
			await player.loseToDiscardpile(result.links[0]);
			trigger.getParent().excluded.add(player);
			game.log(player, "移去一张\"疑兵\"，令", trigger.card, "对自己无效");
			await player.draw(X);
		},
		skill_id: "疑城_negate",
		_priority: 0,
	},
	"破军": {
		audio: "ext:noname_diy:2",
		mod: {
			targetInRange: () => true,
			cardUsable: () => Infinity,
		},
		trigger: {
			player: "useCard2",
		},
		direct: true,
		filter(event, player) {
			if (!player.getExpansions("疑城").length) {
				return false;
			}
			const card = event.card;
			if (!card) {
				return false;
			}
			const type = get.type2(card);
			if (type == "basic" && card.name == "sha") {
				return true;
			}
			if (type == "trick" && card.name != "wuxie") {
				return true;
			}
			return false;
		},
		async content(event, trigger, player) {
			const card = trigger.card;
			let directHitUsed = false;
			const stars = player.getExpansions("疑城");
			if (stars.length) {
				const result1 = await player
					.chooseButton(
						[
							`破军：是否移去一张\"疑兵\"，令${get.translation(card)}无法被响应？`,
							[stars, "card"],
						],
					)
					.set("ai", (button) => {
						const me = _status.event.player;
						const trigger2 = _status.event.getTrigger();
						if (!trigger2) {
							return 0;
						}
						const targets = trigger2.targets || [];
						if (!targets.some((t) => t !== me && get.attitude(me, t) < 0)) {
							return 0;
						}
						if (trigger2.card && (trigger2.card.name == "sha" || get.tag(trigger2.card, "damage") > 0)) {
							return 5 - get.value(button.link, me);
						}
						return 3 - get.value(button.link, me);
					})
					.forResult();
				if (result1.bool && result1.links && result1.links.length) {
					await player.loseToDiscardpile(result1.links[0]);
					trigger.directHit.addArray(trigger.targets.slice(0));
					directHitUsed = true;
					player.logSkill("破军", trigger.targets);
					game.log(player, "发动【破军】，令", card, "无法被响应");
				}
			}
			if (card.name == "sha" && player.getExpansions("疑城").length) {
				const currentTargets = trigger.targets.slice(0);
				const availTargets = game.filterPlayer(
					(t) =>
						!currentTargets.includes(t) &&
						lib.filter.targetEnabled2(card, player, t),
				);
				if (availTargets.length) {
					const stars2 = player.getExpansions("疑城");
					const maxNum = Math.min(stars2.length, availTargets.length);
					const result2 = await player
						.chooseButton(
							[
								`破军：是否额外移去任意张\"疑兵\"以额外指定等量名目标？`,
								[stars2, "card"],
							],
							[1, maxNum],
						)
						.set("ai", (button) => {
							const me = _status.event.player;
							const trigger2 = _status.event.getTrigger();
							if (!trigger2) {
								return 0;
							}
							const targets = trigger2.targets || [];
							if (
								!game.hasPlayer(
									(t) =>
										!targets.includes(t) &&
										lib.filter.targetEnabled2(trigger2.card, me, t) &&
										get.attitude(me, t) < 0,
								)
							) {
								return 0;
							}
							return 4 - get.value(button.link, me);
						})
						.forResult();
					if (result2.bool && result2.links && result2.links.length) {
						const num = result2.links.length;
						const result3 = await player
							.chooseTarget(
								`破军：额外指定${get.cnNumber(num)}名目标`,
								(card2, player2, target) =>
									!currentTargets.includes(target) &&
									lib.filter.targetEnabled2(card, player2, target),
								[num, num],
							)
							.set("ai", (target) => {
								const me = _status.event.player;
								return -get.attitude(me, target) + Math.random();
							})
							.forResult();
						if (result3.bool && result3.targets && result3.targets.length) {
							await player.loseToDiscardpile(result2.links);
							player.logSkill("破军", result3.targets);
							player.line(result3.targets, "fire");
							trigger.targets.addArray(result3.targets);
							if (directHitUsed) {
								trigger.directHit.addArray(result3.targets);
							}
							// 将所有目标（含原始目标）的手牌移至其武将牌上
							for (const target of trigger.targets) {
								const hs = target.getCards("h");
								if (hs.length) {
									target.addSkill("破军2");
									const next = target.addToExpansion(hs, target, "giveAuto");
									next.gaintag.add("破军2");
									await next;
								}
							}
							game.log(player, "发动【破军】，额外指定了", result3.targets);
						}
					}
				}
			}
		},
		skill_id: "破军",
		_priority: 0,
	},
	"破军2": {
		trigger: { global: "phaseEnd" },
		forced: true,
		popup: false,
		charlotte: true,
		sourceSkill: "破军",
		filter(event, player) {
			return player.getExpansions("破军2").length > 0;
		},
		async content(event, trigger, player) {
			const cards = player.getExpansions("破军2");
			if (cards.length) {
				await player.gain(cards, "draw");
			}
			game.log(player, "收回了" + get.cnNumber(cards.length) + "张\"破军\"牌");
			player.removeSkill("破军2");
		},
		intro: {
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("破军2");
				if (player.isUnderControl(true)) {
					dialog.addAuto(cards);
				} else {
					return "共有" + get.cnNumber(cards.length) + "张牌";
				}
			},
		},
		skill_id: "破军2",
		_priority: 0,
	},
	"戢鳞": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		trigger: {
			player: ["chooseToUseAfter", "chooseToRespondAfter"],
			global: "_wuxieAfter",
		},
		filter(event, player) {
			if (event.name == "_wuxie") {
				const trick = event._trigger?.card;
				if (!trick) return false;
				if (get.type(trick) !== "trick" || get.type2(trick) === "delay") return false;
				const directHit = event._trigger?.getParent()?.directHit;
				if (directHit?.length && directHit.includes(player)) return false;
				if (event.wuxieresult && event.wuxieresult == player) return false;
				if (event._info_map.player == player) return false;
				return true;
			}
			if (event.name == "chooseToUse" && event.type == "wuxie") return false;
			if (!event.respondTo || event.respondTo[0] === player) return false;
			const trick = event.respondTo[1];
			if (get.type(trick) !== "trick" || get.type2(trick) === "delay") return false;
			return !event.result.bool;
		},
		async content(event, trigger, player) {
			await player.draw(1);
			if (player.getExpansions("倾朝").length >= 5) return;
			const h = player.getCards("h");
			if (h.length === 0) return;
			const result = await player
				.chooseCard("戢鳞：将一张手牌置于武将牌上，称为\"志\"", 1, true)
				.set("ai", card => get.value(card, player))
				.forResult();
			if (result.bool && result.cards.length) {
				const next = player.addToExpansion(result.cards, player, "giveAuto");
				next.gaintag.add("倾朝");
				await next;
				player.markSkill("倾朝");
			}
		},
		onremove(player, skill) {
			if (!player.hasSkill("倾朝") && player.getExpansions("倾朝").length) {
				player.loseToDiscardpile(player.getExpansions("倾朝"));
			}
		},
		skill_id: "戢鳞",
		_priority: 0,
	},
	"英猷": {
		audio: "ext:noname_diy:2",
		trigger: { global: "phaseBegin" },
		filter(event, player) {
			if (event.player === player) return false;
			const zhi = player.getExpansions("倾朝");
			if (zhi.length < 2) return false;
			const suitMap = {};
			for (const c of zhi) {
				const s = get.suit(c);
				suitMap[s] = (suitMap[s] || 0) + 1;
			}
			return Object.values(suitMap).some(count => count >= 2);
		},
		prompt: "是否发动【英猷】？",
		async content(event, trigger, player) {
			const target = trigger.player;
			const zhi = player.getExpansions("倾朝");
			const suitGroups = {};
			for (const c of zhi) {
				const s = get.suit(c);
				if (!suitGroups[s]) suitGroups[s] = [];
				suitGroups[s].push(c);
			}
			const validSuits = Object.keys(suitGroups).filter(s => suitGroups[s].length >= 2);
			if (validSuits.length === 0) return;
			let chosenCards;
			if (validSuits.length === 1) {
				const suit = validSuits[0];
				const cards = suitGroups[suit];
				const result = await player
					.chooseButton([`英猷：移去至少2张${get.translation(suit)}的\"志\"`, [cards, "card"]], [2, cards.length])
					.set("ai", button => get.value(button.link, player))
					.forResult();
				if (!result.bool) return;
				chosenCards = result.links;
			} else {
				const suitChoice = await player
					.chooseControl(validSuits)
					.set("prompt", "英猷：选择要移去的\"志\"的花色")
					.set("ai", () => validSuits[0])
					.forResult();
				const chosenSuit = suitChoice.control;
				const cards = suitGroups[chosenSuit];
				const result = await player
					.chooseButton([`英猷：移去至少2张${get.translation(chosenSuit)}的\"志\"`, [cards, "card"]], [2, cards.length])
					.set("ai", button => get.value(button.link, player))
					.forResult();
				if (!result.bool) return;
				chosenCards = result.links;
			}
			const X = chosenCards.length;
			await player.loseToDiscardpile(chosenCards);
			player.markSkill("倾朝");
			await player.draw(X);
			const choice = await player
				.chooseControl(["选项一", "选项二", "选项三", "cancel2"])
				.set("prompt", "英猷：请选择一项")
				.set("choiceList", [
					`弃置${get.translation(target)}${get.cnNumber(X)}张牌`,
					`令${get.translation(target)}使用的下${get.cnNumber(X)}张牌无效`,
					`令${get.translation(target)}摸${get.cnNumber(X)}张牌并跳过出牌阶段和弃牌阶段`
				])
				.set("ai", () => {
					const att = get.attitude(player, target);
					if (att >= 0) return "cancel2";
					return "选项三";
				})
				.forResult();
			if (choice.control === "cancel2") return;
			player.logSkill("英猷", target);
			if (choice.control === "选项一") {
				if (target.countCards("he") > 0) {
					await player.discardPlayerCard(target, "he", X, true);
				}
			} else if (choice.control === "选项二") {
				target.addSkill("英猷_seal");
				target.addMark("英猷_seal", X, false);
				target.storage["英猷_seal_source"] = player;
			} else {
				await target.draw(X);
				target.addTempSkill("英猷_skip", { player: "phaseAfter" });
			}
		},
		subSkill: {
			seal: {
				charlotte: true,
				forced: true,
				marktext: "封",
				intro: { content: "使用的下#张牌无效" },
				trigger: { player: "useCard1" },
				filter(event, player) {
					return player.countMark("英猷_seal") > 0;
				},
				async content(event, trigger, player) {
					player.removeMark("英猷_seal", 1, false);
					trigger.all_excluded = true;
					game.log(trigger.card, "因【英猷】无效");
					if (!player.countMark("英猷_seal")) {
						player.removeSkill("英猷_seal");
					}
				},
				onremove(player) {
					delete player.storage["英猷_seal_source"];
				}
			},
			skip: {
				charlotte: true,
				forced: true,
				trigger: { player: ["phaseUseBegin", "phaseDiscardBegin"] },
				async content(event, trigger, player) {
					trigger.cancel();
					game.log(player, "跳过了", event.triggername === "phaseUseBegin" ? "出牌阶段" : "弃牌阶段");
				}
			}
		},
		skill_id: "英猷",
		_priority: 0,
	},
	"应天": {
		audio: "ext:noname_diy:2",
		trigger: { player: "phaseZhunbeiBegin" },
		forced: true,
		derivation: ["倾朝", "reguicai", "rewansha", "lianpo"],
		filter(event, player) {
			return player.getExpansions("倾朝").length >= 5;
		},
		async content(event, trigger, player) {
			player.$skill("应天", "legend", "thunder", "main");
			player.awakenSkill("应天");
			await player.loseMaxHp();
			// 先加后删：确保戢鳞的onremove检测到倾朝存在，不会移除\"志\"
			await player.addSkills(["倾朝", "reguicai", "rewansha", "lianpo"]);
			await player.removeSkills(["戢鳞", "英猷"]);
			game.log(player, "觉醒了，减少了1点体力上限，失去了【戢鳞】、【英猷】，获得了【倾朝】、【鬼才】、【完杀】、【连破】");
		},
		skill_id: "应天",
		_priority: 0,
	},
	"倾朝": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		mod: {
			// ②使用与\"志\"花色相同的牌无距离限制
			targetInRange(card, player) {
				const zhi = player.getExpansions("倾朝");
				if (zhi.some(c => get.suit(c) === get.suit(card))) return true;
			},
			// ③使用与所有\"志\"花色均不相同的牌无次数限制
			cardUsable(card, player) {
				const zhi = player.getExpansions("倾朝");
				if (zhi.length && !zhi.some(c => get.suit(c) === get.suit(card))) return true;
			}
		},
		trigger: {
			player: "loseAfter",
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "dieAfter"]
		},
		filter(event, player, name) {
			// ④当你杀死一名角色时
			if (name === "dieAfter") {
				return event.source === player && player.getExpansions("倾朝").length > 0;
			}
			const evt = event.getl(player);
			if (!evt || !evt.cards2 || !evt.cards2.length) return false;
			const zhi = player.getExpansions("倾朝");
			if (!zhi.length) return false;
			const zhiSuits = new Set(zhi.map(c => get.suit(c)));
			return evt.cards2.some(card => zhiSuits.has(get.suit(card)));
		},
		async content(event, trigger, player) {
			if (event.triggername === "dieAfter") {
				// ④杀死角色后移去一张\"志\"，摸3张牌
				const zhi = player.getExpansions("倾朝");
				const { bool, links } = await player.chooseButton(['移去一张\"志\"', zhi], true).forResult();
				if (bool) {
					await player.loseToDiscardpile(links);
					await player.draw(3);
				}
			} else {
				const evt = trigger.getl(player);
				const zhi = player.getExpansions("倾朝");
				const zhiSuits = new Set(zhi.map(c => get.suit(c)));
				const X = evt.cards2.filter(card => zhiSuits.has(get.suit(card))).length;
				if (X > 0) await player.draw(X);
			}
		},
		intro: {
			name: "志",
			marktext: "志",
			markcount: "expansion",
			mark(dialog, storage, player) {
				const cards = player.getExpansions("倾朝");
				if (cards.length) {
					if (player.isUnderControl(true)) {
						dialog.addAuto(cards);
					} else {
						return "共有" + get.cnNumber(cards.length) + "张\"志\"";
					}
				}
			}
		},
		onremove(player, skill) {
			const cards = player.getExpansions("倾朝");
			if (cards.length) {
				player.loseToDiscardpile(cards);
			}
		},
		skill_id: "倾朝",
		_priority: 0,
	},
	"冶武": {
		audio: "ext:noname_diy:2",
		forced: true,
		locked: true,
		trigger: {
			// 失去感知时机集合参考官方枭姬(xiaoji, standard.js):
			// 自己主动失去(弃置/被拆等独立 lose) -> player:"loseAfter";
			// 他人夺走(gain, 含义贤/定州) -> global:"gainAfter"; 多人失去 -> "loseAsyncAfter";
			// 装备被顶替 -> "equipAfter"; 移至判定区/武将牌 -> addJudgeAfter/addToExpansionAfter
			player: ["phaseBegin", "useCard", "loseAfter"],
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "addToExpansionAfter"],
			source: "damageSource",
		},
		/**
		 * 获取装备牌的摸牌数量
		 * @param {object} card - 卡牌对象
		 * @returns {number} 摸牌数量
		 */
		getDrawNum(card) {
			// 若为武器牌，X为其攻击距离，否则为1
			if (get.subtype(card) === "equip1") {
				const info = lib.card[card.name];
				if (info && info.distance) {
					return 1 - (info.distance.attackFrom || 0);
				}
				return 1;
			}
			return 1;
		},
		init(player) {
			player.storage.冶武_damageCount = 0;
		},
		filter(event, player, name) {
			if (name === "phaseBegin") {
				return true;
			}
			if (name === "useCard") {
				return get.type(event.card) === "equip";
			}
			if (name === "loseAfter" || name === "equipAfter" || name === "addJudgeAfter" || name === "gainAfter" || name === "loseAsyncAfter" || name === "addToExpansionAfter") {
				// 只认"装备区内的牌"失去(参考枭姬 getIndex 判 evt.es):
				// 使用装备时新手牌是从手牌失去(hs), 不算失去装备, 避免与 useCard 时机重复摸牌;
				// 被抢/被拆/被顶替等装备区(es)的牌失去才触发
				const evt = event.getl(player);
				if (!evt || evt.player !== player || !evt.es || !evt.es.length) return false;
				return true;
			}
			if (name === "damageSource") {
				return event.num > 0;
			}
			return false;
		},
		async content(event, trigger, player) {
			if (event.triggername === "phaseBegin") {
				// ①回合开始时，若你有已废除的武器栏，你恢复一个武器栏，否则你获得一个额外的武器栏
				const disabled = player.disabledSlots?.equip1 || 0;
				if (disabled > 0) {
					player.disabledSlots.equip1 -= 1;
					player.$syncDisable();
					game.log(player, `恢复了1个`, `#g武器栏`);
				} else {
					await player.expandEquip(1);
				}
				// 重置伤害计数
				player.storage.冶武_damageCount = 0;
			} else if (event.triggername === "damageSource") {
				// ①每当你累计造成2点伤害时，触发武器栏效果
				player.storage.冶武_damageCount = (player.storage.冶武_damageCount || 0) + trigger.num;
				while (player.storage.冶武_damageCount >= 2) {
					player.storage.冶武_damageCount -= 2;
					const disabled = player.disabledSlots?.equip1 || 0;
					if (disabled > 0) {
						player.disabledSlots.equip1 -= 1;
						player.$syncDisable();
						game.log(player, `恢复了1个`, `#g武器栏`);
					} else {
						await player.expandEquip(1);
					}
				}
			} else if (event.triggername === "useCard") {
				// ②当你使用装备牌时，摸X张牌
				const num = lib.skill.冶武.getDrawNum(trigger.card);
				if (num > 0) {
					await player.draw(num);
				}
			} else {
				// ②当你失去装备区内的装备牌时，每张摸X张牌
				// (含被其他角色抢走、被弃置、被新装备顶替等一切装备区牌的失去途径)
				const evt = trigger.getl(player);
				if (evt && evt.es) {
					for (const card of evt.es) {
						const num = lib.skill.冶武.getDrawNum(card);
						if (num > 0) {
							await player.draw(num);
						}
					}
				}
			}
		},
		skill_id: "冶武",
		_priority: 0,
	},
	"炼刃": {
		audio: "ext:noname_diy:2",
		enable: "phaseUse",
		filter(event, player) {
			return player.hasCard(card => get.type(card) === "equip", "he");
		},
		subSkill: {
			backup: {},
		},
		// 先选效果(选项1/2), 再选装备牌, 再以系统拖拽指定目标
		chooseButton: {
			dialog(event, player) {
				const dialog = ui.create.dialog("炼刃：选择一项", "hidden");
				dialog.add([
					[
						["get", "获得一名其他角色的至多X张牌"],
						["damage", "依次对至多X名其他角色各造成一点伤害"],
					],
					"textbutton",
				]);
				return dialog;
			},
			check(button) {
				const player = get.player();
				if (button.link === "damage") {
					return game.hasPlayer(target => target !== player && get.attitude(player, target) < 0) ? 2 : 0;
				}
				return 1;
			},
			backup(links, player) {
				const isGet = links[0] === "get";
				return {
					audio: "ext:noname_diy:2",
					position: "he",
					// 引擎不自动弃牌, 由 content 内手动弃置所选的装备牌
					discard: false,
					lose: false,
					delay: false,
					filterCard(card) {
						return get.type(card) === "equip";
					},
					check(card) {
						return 8 - get.value(card);
					},
					selectCard: 1,
					filterTarget(card, player, target) {
						if (isGet) {
							return target !== player && target.countCards("he") > 0;
						}
						return target !== player;
					},
					selectTarget: isGet ? 1 : [1, Infinity],
					filterOk() {
						if (isGet) return true;
						// 目标数不能超过所选装备牌决定的X
						const { cards, targets } = ui.selected;
						if (!cards || !cards.length) return false;
						const x = lib.skill.冶武.getDrawNum(cards[0]);
						return targets.length >= 1 && targets.length <= x;
					},
					// 引擎对每个目标各执行一次 content(event.target 依次指向所选目标),
					// 故此处只处理单个 event.target 即可保证每个目标恰好受到一点伤害;
					// 弃牌只在第一个目标结算时(num===0)执行一次
					async content(event, trigger, player) {
						const discardedCard = event.cards[0];
						const x = lib.skill.冶武.getDrawNum(discardedCard);
						const target = event.target;
						if (event.num === 0) {
							// 弃置所选装备牌
							await player.discard(discardedCard);
						}
						if (isGet) {
							// 选项1：获得一名其他角色的至多X张牌
							const num = Math.min(target.countCards("he"), x);
							if (num > 0) {
								await player.gainPlayerCard(target, num, "he");
							}
						} else {
							// 选项2：对该目标造成一点伤害
							await target.damage();
						}
					},
					ai: {
						order: 8,
						result: {
							target(player, target) {
								if (isGet) {
									return -get.attitude(player, target) * Math.min(target.countCards("he"), 2);
								}
								return -get.attitude(player, target);
							},
						},
					},
				};
			},
			prompt(links, player) {
				if (links[0] === "get") {
					return "弃置一张装备牌，获得一名其他角色的至多X张牌";
				}
				return "弃置一张装备牌，依次对至多X名其他角色各造成一点伤害";
			},
		},
		ai: {
			order: 8,
			result: {
				player: 1,
			},
		},
		skill_id: "炼刃",
		_priority: 0,
	},
	"穷兵": {
		audio: "ext:noname_diy:2",
		forced: true,
		locked: true,
		trigger: {
			player: "dying",
		},
		filter(event, player) {
			// 若你有未废除的武器栏
			return player.hasEnabledSlot(1);
		},
		async content(event, trigger, player) {
			player.logSkill(event.skill);
			// 废除一个武器栏
			const expanded = player.expandedSlots?.equip1 || 0;
			if (expanded > 0) {
				player.expandedSlots.equip1 -= 1;
				player.$syncExpand();
				game.log(player, `减少了1个`, `#g武器栏上限`);
			} else {
				player.disabledSlots ??= {};
				player.disabledSlots.equip1 ??= 0;
				player.disabledSlots.equip1 += 1;
				player.$syncDisable();
				game.log(player, `废除了1个`, `#g武器栏`);
			}
			
			// 将体力恢复至1点
			if (player.hp < 1) {
				await player.recoverTo(1);
			}
			
			// 摸装备栏数张牌
			const equipSlotCount = player.countEnabledSlot();
			if (equipSlotCount > 0) {
				await player.draw(equipSlotCount);
			}
			
			// 对一名其他角色造成一点伤害
			const targetResult = await player.chooseTarget("选择一名其他角色造成一点伤害", (card, player, target) => {
				return target !== player;
			}, true).set("ai", target => {
				return -get.attitude(player, target);
			}).forResult();
			if (targetResult.bool && targetResult.targets && targetResult.targets.length) {
				const target = targetResult.targets[0];
				await target.damage();
			}
		},
		ai: {
			effect: {
				target(card, player, target) {
					if (get.tag(card, "damage") && target.hp <= 0 && target.hasEnabledSlot(1)) {
						return [1, 0.5];
					}
				},
			},
		},
		skill_id: "穷兵",
		_priority: 0,
	},
	"傀体": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		trigger: {
			player: ["damageEnd", "gainEnd"],
			target: "useCardToTarget",
		},
		mod: {
			// ④你使用牌无次数限制（原【不竭】效果并入，与破军①同款写法）
			cardUsable: () => Infinity,
		},
		logTarget(trigger, player, triggername) {
			if (triggername === "damageEnd") {
				return _status.currentPhase;
			}
			if (triggername === "useCardToTarget") {
				// 弹泡指向牌的使用者
				return trigger.player;
			}
			// gainEnd：无特定指向
			return void 0;
		},
		filter(event, player, name) {
			if (name === "damageEnd") {
				// ①受到伤害：需存在当前回合角色且有牌可失去
				if (!(event.num > 0)) {
					return false;
				}
				const current = _status.currentPhase;
				return !!(current && current.isIn() && current.countCards("he") > 0);
			}
			if (name === "gainEnd") {
				// ③获得锦囊牌：本事件获得的牌中有锦囊，且你手牌里有锦囊可弃置
				// 必须用 lib.card[card.name].type 判原始类型：get.type/get.type2 内部会
				// 查 cardname mod，若场上存在同类 mod 会造成无限递归（踩坑#45）
				const isTrick = (card) => ["trick", "delay"].includes(lib.card[card.name]?.type);
				if (!event.cards?.some(isTrick)) {
					return false;
				}
				return player.getCards("h").some(isTrick);
			}
			// useCardToTarget：②成为其他角色使用牌的目标（不限定牌的类型）
			if (!event.card) {
				return false;
			}
			return event.player !== player;
		},
		async content(event, trigger, player) {
			if (event.triggername === "damageEnd") {
				// ①令当前回合角色失去等量张牌
				const current = _status.currentPhase;
				if (!current || !current.isIn()) {
					return;
				}
				const num = Math.min(trigger.num, current.countCards("he"));
				if (num <= 0) {
					return;
				}
				const result = await current
					.chooseCard("he", num, true, `傀体：请失去${get.cnNumber(num)}张牌`)
					.set("ai", (card) => -get.value(card))
					.forResult();
				if (result?.bool && result.cards?.length) {
					await current.lose(result.cards);
					game.log(current, "因【傀体】失去了", result.cards);
				}
				return;
			}
			if (event.triggername === "gainEnd") {
				// ③弃置手牌里所有锦囊牌，然后按弃置数回复体力或增加体力上限
				// （gainEnd 时获得的牌已入手，初始手牌因 gameDrawEnd 前触发被引擎屏蔽而不受影响）
				const cards = player.getCards("h").filter((card) => ["trick", "delay"].includes(lib.card[card.name]?.type));
				if (!cards.length) {
					return;
				}
				await player.discard(cards);
				// "然后若"：体力值在弃置之后判定；recover 内部按 maxHp-hp 自动封顶
				if (player.hp < player.maxHp) {
					await player.recover(cards.length);
				} else {
					await player.gainMaxHp(cards.length);
				}
				return;
			}
			// ②摸一张牌或获得其一张牌
			const user = trigger.player;
			let choice = "摸牌";
			if (user.countCards("hej") > 0) {
				const result = await player
					.chooseControl(["摸牌", "获得其牌"])
					.set("prompt", "傀体：请选择一项")
					.set("choiceList", ["摸一张牌", `获得${get.translation(user)}区域里的一张牌`])
					.set("ai", () => {
						const me = _status.event.player;
						const user2 = _status.event.getTrigger()?.player;
						if (!user2) {
							return "摸牌";
						}
						return get.attitude(me, user2) < 0 ? "获得其牌" : "摸牌";
					})
					.forResult();
				if (result?.control) {
					choice = result.control;
				}
			}
			if (choice === "获得其牌") {
				await player.gainPlayerCard(user, 3, "hej", true);
			} else {
				await player.draw(3);
			}
		},
		skill_id: "傀体",
		_priority: 0,
	},
	"百战": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		trigger: {
			// useCard2：此时目标已确定、牌未结算，修改 baseDamage 仍有效；
			// 每次使用只触发一次（useCardToTarget 是逐目标时机，多目标杀会重复触发）
			player: "useCard2",
		},
		logTarget: "targets",
		filter(event, player) {
			// 当你使用【杀】时（含视为/转化的杀），且已指定目标
			return event.card && event.targets?.length > 0 && get.name(event.card, player) === "sha";
		},
		async content(event, trigger, player) {
			// 选项2需"体力上限大于1"；不满足时只剩选项1，无需询问
			if (player.maxHp <= 1) {
				// 选项1：失去一点体力，然后令此【杀】伤害值+1
				// baseDamage 会在逐目标结算时拷入牌效果事件，作为 damage 的默认 num
				await player.loseHp(1);
				trigger.baseDamage++;
				return;
			}
			const result = await player
				.chooseControl(["失去体力", "失去体力及上限"])
				.set("prompt", "百战：请选择一项")
				.set("choiceList", ["失去一点体力，然后令此【杀】伤害值+1", "失去一点体力及上限，然后对其中一个目标造成一点伤害"])
				.set("ai", () => {
					const me = _status.event.player;
					// 体力紧张：只选代价低的选项1
					if (me.hp <= 2) {
						return "失去体力";
					}
					const targets = (_status.event.getTrigger()?.targets ?? []).filter((t) => t.isIn());
					const enemies = targets.filter((t) => get.attitude(me, t) < 0);
					if (!enemies.length) {
						return "失去体力";
					}
					// 有1体力的敌人时，选项2的稳定伤害可直接收割
					if (enemies.some((t) => t.hp === 1)) {
						return "失去体力及上限";
					}
					// 敌人手牌较多（大概率有闪）时，选项2的稳定伤害期望更高
					const avgHand = enemies.reduce((sum, t) => sum + t.countCards("h"), 0) / enemies.length;
					return avgHand >= 2 ? "失去体力及上限" : "失去体力";
				})
				.forResult();
			if (result?.control !== "失去体力及上限") {
				// 选项1：失去一点体力，然后令此【杀】伤害值+1
				// baseDamage 会在逐目标结算时拷入牌效果事件，作为 damage 的默认 num
				await player.loseHp(1);
				trigger.baseDamage++;
				return;
			}
			// 选项2：失去一点体力及上限，然后对其中一个目标造成一点伤害
			// 先选目标再失去体力：避免失去体力致阵亡后无法再发起选择；
			// 仅一名存活目标时自动指定，多名时由玩家挑选（限定为使用此【杀】时指定的目标）
			const targets = trigger.targets.filter((t) => t.isIn());
			if (!targets.length) {
				return;
			}
			let target = targets[0];
			if (targets.length > 1) {
				const result2 = await player
					.chooseTarget(
						true,
						"百战：请选择此【杀】的一名目标，对其造成一点伤害",
						(card, player2, target2) => targets.includes(target2),
					)
					.set("ai", (target2) => {
						const me = _status.event.player;
						return get.damageEffect(target2, me, me) + (target2.hp === 1 ? 5 : 0);
					})
					.forResult();
				if (result2?.bool && result2.targets?.length) {
					target = result2.targets[0];
				}
			}
			// loseHp 可能触发濒死结算（嵌套完成后才继续）；若因此阵亡则不再扣上限，
			// 避免对已阵亡角色 loseMaxHp 到 0 触发二次 die（content.js loseMaxHp 的 maxHp<=0 分支）
			await player.loseHp(1);
			if (player.isIn()) {
				await player.loseMaxHp(1);
			}
			if (target.isIn()) {
				await target.damage(1, player);
			}
		},
		skill_id: "百战",
		_priority: 0,
	},
	"移魂": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		trigger: {
			global: ["roundStart", "useCardToTarget"],
		},
		logTarget(trigger, player, triggername) {
			if (triggername === "useCardToTarget") {
				return trigger.target;
			}
			return void 0;
		},
		filter(event, player, name) {
			if (name === "roundStart") {
				return game.hasPlayer((current) => current !== player);
			}
			// useCardToTarget：指定角色成为除你以外其他角色使用牌的唯一目标
			const target = player.storage["移魂"];
			if (!target || !target.isIn()) {
				return false;
			}
			// 指定仅在本轮内有效（"直到本轮游戏结束"）：
			// 若某轮开始时你已阵亡（无法重新指定），上一轮的指定不得跨轮生效
			if (player.storage["移魂_round"] !== game.roundNumber) {
				return false;
			}
			if (event.target !== target) {
				return false;
			}
			if (event.player === target) {
				return false;
			}
			if (event.player === player) {
				return false;
			}
			const evt = event.getParent();
			if (!evt || !evt.targets || evt.targets.length !== 1 || !evt.targets.includes(target)) {
				return false;
			}
			// 每名"移魂"拥有者对同一次使用牌只转移一次，防止互相指定时无限循环
			return !evt["移魂_used"]?.includes(player.playerid);
		},
		async content(event, trigger, player) {
			if (event.triggername === "roundStart") {
				// 每轮游戏开始时指定一名其他角色
				const result = await player
					.chooseTarget(
						true,
						"移魂：指定一名其他角色，当其成为其他角色使用牌的目标时，你代替其成为此牌的目标",
						(card, player2, target) => target !== player2,
					)
					.set("ai", (target) => {
						const me = _status.event.player;
						return -get.attitude(me, target) + Math.random() * 0.5;
					})
					.forResult();
				if (result?.bool && result.targets?.length) {
					player.storage["移魂"] = result.targets[0];
					// 轮数戳：game.roundNumber 在 roundStart 触发前已自增（content.js），
					// 指定效果持续到本轮结束（下轮 roundStart 时被新指定覆盖或自然失效）
					player.storage["移魂_round"] = game.roundNumber;
					player.markSkill("移魂");
					game.log(player, "指定了", result.targets[0], "为【移魂】的目标");
				}
				return;
			}
			// 代替该角色成为此牌的目标（参考官方流离 liuli 的改目标写法）
			const target = player.storage["移魂"];
			const evt = trigger.getParent();
			if (!target || !evt?.targets || evt.targets.length !== 1 || evt.targets[0] !== target) {
				return;
			}
			if (player.storage["移魂_round"] !== game.roundNumber) {
				return;
			}
			evt["移魂_used"] ??= [];
			if (evt["移魂_used"].includes(player.playerid)) {
				return;
			}
			evt["移魂_used"].push(player.playerid);
			evt.triggeredTargets2.remove(target);
			evt.targets.remove(target);
			evt.targets.push(player);
			player.line(target, "thunder");
			game.log(player, "代替", target, "成为了", trigger.card, "的目标");
		},
		intro: {
			name: "移魂",
			content(storage) {
				if (storage && storage.isIn?.()) {
					return "当前指定：" + get.translation(storage);
				}
				if (storage) {
					return "指定目标：" + get.translation(storage) + "（已阵亡）";
				}
				return "尚未指定目标";
			},
		},
		skill_id: "移魂",
		_priority: 0,
	},
	"魅魔": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		trigger: {
			// ①挂 global "useCard"（每张牌一次性时机，trigger 即 useCard 事件本身，targets 已确定，
			// 踩坑#40）——"指定唯一目标"是用牌级语义，一次性时机天然每张牌至多结算一次
			// （useCardToTarget 是逐目标时机，需自行限定）；global 位全场询问，貂蝉自己的用牌同样触发
			global: ["useCard", "dying"],
		},
		// 弹泡指向：①获"魅"的用牌者、②濒死者——两事件的弹泡主体都是 trigger.player
		logTarget: "player",
		gainMei(target, num = 1) {
			// "魅"计数标记：addMark 会自动 markSkill 挂上"魅魔_mark"的标记显示
			if (num > 0) {
				target.addSkill("魅魔_mark");
				target.addMark("魅魔_mark", num);
			} else if (num < 0) {
				target.removeMark("魅魔_mark", -num);
				if (target.countMark("魅魔_mark") <= 0) {
					target.removeSkill("魅魔_mark");
				}
			}
		},
		filter(event, player, name) {
			if (name === "useCard") {
				const user = event.player;
				if (!user) {
					return false;
				}
				// 范围=你和拥有"魅"的角色（貂蝉始终在列，其余使用者需持"魅"）
				if (user !== player && user.countMark("魅魔_mark") <= 0) {
					return false;
				}
				// ①：非虚拟牌（非虚拟=有实体牌基础，转化牌不算虚拟，纯视为牌如魅祸的虚拟【杀】不算
				// ——get.is.virtualCard；排除虚拟牌堵魅祸炸 N 枚魅又全额回充的循环）
				if (get.is.virtualCard(event.card)) {
					return false;
				}
				// 指定唯一目标（目标不限；无目标牌不算"指定"）
				return event.targets?.length === 1;
			}
			if (name === "dying") {
				// ②有"魅"的角色进入濒死时（无魅可移则无事发生，不触发、不弹泡，正常进入求桃/死亡流程；
				// 貂蝉自己无魅濒死同样不触发）
				const dying = event.player;
				return !!(dying && dying.isIn() && dying.countMark("魅魔_mark") > 0);
			}
			return false;
		},
		async content(event, trigger, player) {
			if (event.triggername === "useCard") {
				// ①：该用牌者获得一枚"魅"，然后你摸一张牌
				const user = trigger.player;
				lib.skill.魅魔.gainMei(user, 1);
				game.log(user, "获得了一枚\"魅\"");
				await player.draw();
				return;
			}
			// ②：移去其所有"魅"并令其恢复等量点体力；濒死者为貂蝉自己时她额外摸等量张牌
			// （recover 上限为体力上限不会溢出；伤害透支时回复后 hp 仍≤0，引擎继续正常求桃/死亡流程）
			const target = trigger.player;
			const num = target.countMark("魅魔_mark");
			if (num > 0) {
				lib.skill.魅魔.gainMei(target, -num);
				await target.recover(num);
				if (target === player) {
					await player.draw(num);
				}
			}
		},
		skill_id: "魅魔",
		_priority: 0,
	},
	"魅魔_mark": {
		charlotte: true,
		sub: true,
		sourceSkill: "魅魔",
		mark: true,
		marktext: "魅",
		intro: {
			name: "魅",
			name2: "魅",
			content: "mark",
		},
		skill_id: "魅魔_mark",
		_priority: 0,
	},
	"魅心": {
		audio: "ext:noname_diy:2",
		trigger: { target: "useCardToTarget" },
		logTarget: "player",
		filter(event, player) {
			// 当你成为其他角色使用牌的目标时（target 位时机；content 中以 excluded 取消目标——踩坑#17）；
			// 两项至少一项可选：①交给该角色一张牌——文案未限定区域，"一张牌"=手牌区/装备区/木牛流马
			// 三处（位置码 "hes"：木牛流马牌带 glows 混在手牌节点，"h" 排除、"s" 仅选它）；
			// ②移去该角色一枚"魅"——需其持魅
			if (!event.player || event.player === player) {
				return false;
			}
			const user = event.player;
			return player.countCards("hes") > 0 || user.countMark("魅魔_mark") > 0;
		},
		async cost(event, trigger, player) {
			const user = trigger.player;
			const canGive = player.countCards("hes") > 0;
			const canRemove = user.countMark("魅魔_mark") > 0;
			// 是否发动：此牌对自己为负面价值才值得取消（友方回复等正面牌不取消）
			const boolResult = await player
				.chooseBool(
					get.prompt(event.skill, user),
					canGive && canRemove
						? "选择一项取消之"
						: canRemove
							? `移去${get.translation(user)}一枚\"魅\"并取消之`
							: `将一张牌交给${get.translation(user)}，令其获得一枚\"魅\"并取消之`,
				)
				.set("ai", () => {
					const evt = _status.event.getTrigger();
					const me = _status.event.player;
					if (!evt) {
						return 0;
					}
					return get.effect(me, evt.card, evt.player, me) < 0 ? 1 : 0;
				})
				.forResult();
			if (!boolResult.bool) {
				return;
			}
			// 选哪一项：两项皆可选时 chooseControl（result.index：0=交牌，1=移魅），否则唯一项
			let choice = "give";
			if (canGive && canRemove) {
				const ctrlResult = await player
					.chooseControl()
					.set("prompt", "魅心：请选择一项")
					.set("choiceList", [
						`交给${get.translation(user)}一张牌，令其获得一枚\"魅\"并取消之`,
						`移去${get.translation(user)}一枚\"魅\"并取消之`,
					])
					.set("ai", () => {
						const evt = _status.event.getTrigger();
						const me = _status.event.player;
						if (!evt) {
							return 1;
						}
						// 非友方→移魅（免费且削减其"魅"储备）；友方→交牌（还其一张牌并喂"魅"）
						return get.attitude(me, evt.player) > 0 ? 0 : 1;
					})
					.forResult();
				choice = ctrlResult.index === 1 ? "remove" : "give";
			} else if (canRemove) {
				choice = "remove";
			}
			if (choice === "give") {
				// 交给牌："一张牌"=手牌区/装备区/木牛流马（位置码 "hes"）；交付对象即牌的使用者，
				// 无需另选目标；低价值牌优先送出（装备牌 get.value 高，AI 自然不会误交身上的装备）
				const cardResult = await player
					.chooseCard("hes", 1, true, `魅心：选择交给${get.translation(user)}的牌`)
					.set("ai", (card) => 1 / Math.max(0.1, get.value(card)))
					.forResult();
				if (cardResult.bool && cardResult.cards?.length) {
					event.result = { bool: true, cards: cardResult.cards, cost_data: "give" };
				}
				return;
			}
			event.result = { bool: true, cost_data: "remove" };
		},
		async content(event, trigger, player) {
			const user = trigger.player;
			// 取消：per-target 触发事件与 useCard 事件按引用共享 excluded——踩坑#17
			trigger.getParent().excluded.add(player);
			game.log(trigger.card, "对", player, "无效了");
			if (event.cost_data === "give") {
				// ①：交给一张牌，令其获得一枚"魅"
				await player.give(event.cards, user);
				game.log(player, "将", event.cards, "交给了", user);
				lib.skill.魅魔.gainMei(user, 1);
				game.log(user, "获得了一枚\"魅\"");
			} else {
				// ②：移去其一枚"魅"
				lib.skill.魅魔.gainMei(user, -1);
				game.log(player, "移去了", user, "的一枚\"魅\"");
			}
		},
		ai: {
			effect: {
				target(card, player, target, current) {
					if (player && target && player !== target && get.tag(card, "damage") && current < 0) {
						// 用牌者有"魅"：她可免费移魅取消，威胁大降
						if (player.countMark("魅魔_mark") > 0) {
							return [1, 0];
						}
						// 仅可交牌取消（手牌/装备/木牛流马内任一，有代价），威胁略降
						if (target.countCards("hes") > 0) {
							return [1, 0.4];
						}
					}
				},
			},
		},
		skill_id: "魅心",
		_priority: 0,
	},
	"魅祸": {
		audio: "ext:noname_diy:2",
		enable: "phaseUse",
		usable: 1,
		filter(event, player) {
			// 存在有"魅"的角色（含貂蝉自己），且其之外还存在另一名角色可作受害者
			return game.hasPlayer((current) => {
				if (current.countMark("魅魔_mark") <= 0) {
					return false;
				}
				return game.hasPlayer((c) => c !== player && c !== current);
			});
		},
		filterTarget(card, player, target) {
			if (ui.selected.targets.length) {
				// 第二个目标：受害者（另一名其他角色：非貂蝉、非"魅"来源者）
				return target !== player && !ui.selected.targets.includes(target);
			}
			// 第一个目标：有"魅"的角色（含貂蝉自己，用自身的"魅"开火）
			return target.countMark("魅魔_mark") > 0;
		},
		selectTarget: 2,
		multitarget: true,
		multiline: true,
		async content(event, trigger, player) {
			const user = event.targets[0];
			const victim = event.targets[1];
			if (!user.isIn() || !victim.isIn()) {
				return;
			}
			player.line([user, victim], "thunder");
			// 移去其所有"魅"
			const num = user.countMark("魅魔_mark");
			if (num <= 0) {
				return;
			}
			lib.skill.魅魔.gainMei(user, -num);
			game.log(player, "移去了", user, "的全部\"魅\"");
			// 其视为对受害者使用等量张无视距离和次数限制的【杀】
			// （useCard 直接指定目标结算，天然无距离和次数限制；中途死亡/离场则终止）
			for (let i = 0; i < num; i++) {
				if (!user.isIn() || !victim.isIn()) {
					break;
				}
				await user.useCard(get.autoViewAs({ name: "sha", isCard: true }), victim, false);
			}
		},
		ai: {
			order: 6,
			result: {
				target(player, target) {
					if (!ui.selected.targets.length) {
						// 第一个目标（"魅"来源者，含自己）：自己最优（亲自开火不拆人），
						// 敌方次之（拆光其"魅"+借刀），友方权衡（借刀打人 vs 拆光其保命"魅"）
						const num = target.countMark("魅魔_mark");
						if (target === player) {
							return 5 + num;
						}
						const att = get.attitude(player, target);
						return att > 0 ? att + num - 3 : num + 2;
					}
					return -get.attitude(player, target);
				},
			},
		},
		skill_id: "魅祸",
		_priority: 0,
	},
	"恣胜": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		trigger: {
			// "使用…时"用 useCard 时机：位于 useCard1/useCard2 之后、牌效果结算之前——
			// 摸牌/授予随使用立即结算（结算后才触发的 useCardAfter 体感错误）；
			// "打出…时"用 respond 时机同理。旧增益的消耗也放本时机：本张牌的
			// useCard1 计数、useCard2 直击、选取阶段 mod 均已生效完毕，且在同一触发器内
			// 先消耗后授予，顺序确定，规避同时机两个触发器的排序竞争
			player: ["useCard", "respond"],
		},
		filter(event, player, name) {
			// 点数为3的整数倍（含视为/转化牌：取其基础牌点数；
			// 无点数牌经 get.number 补丁（恣胜②，见 extension.js）视为3）
			// （豪贤生效期间：指定点数的牌也触发恣胜，见 filter 内豪贤_aura 判定）
			const num = get.number(event.card, player);
			if (typeof num == "number" && num > 0) {
				if (num % 3 == 0) {
					return true;
				}
				// 豪贤指定的点数：恣胜所有效果可对其生效——前提是先能触发
				if (
					player.hasSkill("豪贤_aura") &&
					(player.getStorage("豪贤_aura") || []).includes(num)
				) {
					return true;
				}
			}
			// 点数不合格时，仅"使用"有待消耗增益才触发（打出不消耗增益）
			return name == "useCard" && player.hasSkill("恣胜_effect");
		},
		async content(event, trigger, player) {
			// ①消耗：本张牌即上一份增益的"下一张牌"，其选取阶段 mod 与结算前效果
			// （useCard1 计数、useCard2 直击）均已生效，至此移除
			// （仅"使用"消耗——增益文案的效果均只针对"使用的下一张牌"，打出不消耗）
			if (
				event.triggername == "useCard" &&
				player.hasSkill("恣胜_effect")
			) {
				player.removeSkill("恣胜_effect");
			}
			// ②授予：按本次牌倍数依次执行对应效果（第 i 档效果在"倍数≤i"时全部生效：
			// 点数3（及经恣胜②视为3的无点数牌）→四档全含，6→二三四档，9→三四档，12→仅第四档；
			// 豪贤指定的点数→四档全含）
			const num = get.number(trigger.card, player);
			if (typeof num != "number" || num <= 0) {
				return;
			}
			const isAura =
				player.hasSkill("豪贤_aura") &&
				(player.getStorage("豪贤_aura") || []).includes(num);
			if (num % 3 != 0 && !isAura) {
				return;
			}
			const bei = num / 3;
			if (bei <= 1 || isAura) {
				// 1及以下倍（豪贤指定点数视为四档全含，第一档必执行）：
				// 摸一张牌（原摸三张——配合②无点数视为3，丈八两牌合一杀若摸三张
				// 会形成"2换3"的刷牌引擎，降为一张后 2换1 净亏，杜绝循环）
				await player.draw();
				// 1倍新增：若此牌目标中包含其他角色，你获得其中一名其他角色的一张牌
				// （打出（respond）无目标，天然跳过；限定有牌可被获得的目标，
				// "hej"=手牌+装备+判定，踩坑#54 区域码）
				const targets = (trigger.targets || []).filter(
					(t) => t != player && t.isIn() && t.countCards("hej") > 0,
				);
				if (targets.length) {
					const result = await player
						.chooseTarget(
							true,
							"恣胜：获得其中一名目标角色的一张牌",
							(card, player, target) => {
								return get.event().tgs.includes(target);
							},
						)
						.set("tgs", targets)
						.set("ai", (target) => {
							// 敌对度优先，目标牌量作次要权重
							return (
								-get.attitude(player, target) *
								(1 + target.countCards("hej") / 5)
							);
						})
						.forResult();
					const target = result?.targets?.[0];
					if (target) {
						await player.gainPlayerCard(target, "hej", true);
					}
				}
			}
			const list = [];
			for (let i = 2; i <= 4; i++) {
				if (bei <= i) {
					list.push(i);
				}
			}
			if (isAura) {
				// 豪贤指定点数：恣胜所有效果均可生效——各档位增益覆盖为满档
				list.length = 0;
				list.push(2, 3, 4);
			}
			if (list.length) {
				// 2/3/4及以下倍：令"下一张牌"获得对应各档增益
				lib.skill.恣胜.addEffect(player, list);
			}
		},
		addEffect(player, list) {
			player.addSkill("恣胜_effect");
			player.storage.恣胜_effect = list;
			player.markSkill("恣胜_effect");
			const info = [];
			if (list.includes(2)) info.push("下一张牌无视距离限制");
			if (list.includes(3)) info.push("下一张牌无视次数限制");
			if (list.includes(4)) info.push("下一张基本牌可指定至多三个目标");
			game.log(player, "的", "#g" + info.join("；"));
		},
		// ②无点数牌的点数始终视为3：不走 mod.cardnumber——game.checkMod 的覆盖守卫
		// `typeof arg[last] != "object"` 对 null 基数恒为 true（typeof null === "object"，
		// 踩坑#60 修正记录），无点数牌（基数为 null）的 mod 返回值必被丢弃，属引擎缺陷；
		// 改为 extension.js 顶部对 get.number 的外层补丁：无点数牌且牌主拥有恣胜时返回 3，
		// filter/content 及任意查询方的 get.number(card, player) 自动跟随
		// （"unsure" 仍在钩子前提前返回、不经补丁，由 filter 的 typeof 兜底）
		skill_id: "恣胜",
		_priority: 0,
	},
	"恣胜_effect": {
		charlotte: true,
		sub: true,
		sourceSkill: "恣胜",
		// 不进入角色技能列表：nodeintro（悬停/点击角色弹出的技能列表面板）会列出所有
		// 带"技能名_info"翻译条目的已获技能（get/index.js），nopop 技能被跳过；
		// 同时关闭引擎自动 logSkill，避免与主技能恣胜重复弹泡（具体效果由恣胜 content 内自行 game.log）
		nopop: true,
		popup: false,
		// 纯 mod 增益载体（无 trigger）：旧3档"无法被响应"（useCard2 直击）已随
		// 2026-10-05 改版移除，3档改为"无视次数限制"并入 mod.cardUsable，不再需要
		// 触发器与 forced（触发类附属技必须 forced 的要求见踩坑#59，本技能已非触发技）
		mark: true,
		marktext: "恣",
		intro: {
			content(storage) {
				const list = storage || [];
				const info = [];
				if (list.includes(2)) info.push("下一张牌无视距离限制");
				if (list.includes(3)) info.push("下一张牌无视次数限制");
				if (list.includes(4)) info.push("下一张基本牌可指定至多三个目标");
				return "你使用的" + info.join("；");
			},
		},
		mod: {
			// 2倍：下一张牌无视距离（踩坑#42：不匹配时必须隐式返回 undefined，不得返回 false）
			targetInRange(card, player) {
				if (player.getStorage("恣胜_effect").includes(2)) {
					return true;
				}
			},
			// 3倍：下一张牌无视次数限制
			cardUsable(card, player) {
				if (player.getStorage("恣胜_effect").includes(3)) {
					return Infinity;
				}
			},
			// 4倍：下一张基本牌可指定至多三个目标（selectTarget mod 约定为原地修改 range；
			// range[1]==-1 表示无上限，跳过——mapodoufu 同款写法；仅基本牌生效，
			// 避免顺拆/乐不思蜀/闪电/装备牌等非基本牌的多目标歧义）
			selectTarget(card, player, range) {
				if (
					player.getStorage("恣胜_effect").includes(4) &&
					get.type(card) == "basic" &&
					range[1] != -1
				) {
					range[1] = Math.max(range[1], 3);
				}
			},
		},
		onremove(player, skill) {
			delete player.storage[skill];
		},
		ai: {
			notemp: true,
		},
		skill_id: "恣胜_effect",
		_priority: 0,
	},
	"显略": {
		audio: "ext:noname_diy:2",
		enable: "phaseUse",
		// 出牌阶段限三次，且显略②的"+1"为永久生效（不封顶）——usable 用函数形式动态
		// 读取同名标记（巡使 shencai 同款写法），标记+1 后本阶段内立即可再发动
		usable(skill, player) {
			return 3 + player.countMark("显略");
		},
		// 发动即选牌并指定目标（chongxin 同款写法）：选一张手牌（不失去）+ 一名其他角色，
		// 一步完成（原"先选目标、再选牌展示"的两步流程）——效果不变，省一步操作
		filterCard: true,
		position: "h",
		selectCard: 1,
		discard: false,
		lose: false,
		delay: false,
		filterTarget(card, player, target) {
			// 显略的目标是"一名其他角色"（你与其各展示一张手牌）
			if (target === player) {
				return false;
			}
			// 目标需有手牌可展示（三处皆无手牌时强制 chooseCard 会无牌可选）
			if (target.countCards("h") <= 0) {
				return false;
			}
			return true;
		},
		selectTarget: 1,
		mark: true,
		intro: {
			// 标记显示当前发动次数上限（基础3 + ②累计的+1）
			markcount: (storage = 0) => 3 + storage,
			content: (storage = 0) => "当前发动次数上限：" + (3 + storage),
		},
		onremove: true,
		async content(event, trigger, player) {
			const target = event.target;
			if (!target.isIn()) {
				return;
			}
			const myCard = event.cards[0];
			// 你与其依次展示一张手牌：自己已在发动时选好牌，此处亮出，目标看到后再选（"依次"语义）
			await player.showCards(
				[myCard],
				`${get.translation(player)}发动了【显略】`,
			);
			const theirResult = await target
				.chooseCard(
					"h",
					true,
					`显略：${get.translation(player)}已展示一张牌，请展示你的牌`,
				)
				.set("ai", (card) => {
					// 张飞的牌 mod 3 → 展示 mod 为 need=(3-r)%3 的牌时两牌之和为3的倍数
					// （分支②：双方各摸一张+张飞显略上限+1，展示牌均不失去）
					const r = (get.number(myCard, player) || 0) % 3;
					const need = (3 - r) % 3;
					const num = (get.number(card, target) || 0) % 3;
					const value = get.value(card, target);
					// 无论敌友均优先凑"和为3的倍数"（②分支）：自己白赚一张+免①的抢牌挨杀
					// （帮张飞涨上限属长期代价，短期止损优先）；无 need-mod 牌时被迫吃①，
					// 出价值最低的牌（-value：value 越小得分越高）
					return num == need ? 20 - value : -value;
				})
				.forResult();
			if (
				!theirResult.bool ||
				!theirResult.cards ||
				!theirResult.cards.length
			) {
				return;
			}
			const theirCard = theirResult.cards[0];
			await target.showCards([theirCard], `${get.translation(target)}展示了`);
			const n1 = get.number(myCard, player);
			const n2 = get.number(theirCard, target);
			if (
				typeof n1 != "number" ||
				typeof n2 != "number" ||
				n1 <= 0 ||
				n2 <= 0
			) {
				return;
			}
			if ((n1 + n2) % 3 != 0) {
				// ①点数之和不为3的整数倍：获得这些牌，并视为对其使用一张不计入次数限制的【杀】
				// （gain 会自动从原持有者区域移牌——双方均为手牌，自己的牌在自己区域
				// gain 会跳过转移）
				await player.gain([myCard, theirCard], "gain2");
				// 不计入次数：创建 useCard 事件后、结算前置 addCount=false，
				// 跳过引擎对 stat.card[杀] 的自增（自增点在 useCard 步骤开头、useCard1 之前），
				// 不消耗本回合出杀次数（2026-10-05 确认保留"不计次数"效果，文案省略）
				const useEvt = player.useCard(
					get.autoViewAs({ name: "sha", isCard: true }),
					target,
					false,
				);
				useEvt.addCount = false;
				await useEvt;
			} else {
				// ②点数之和为3的整数倍：你与其各摸一张牌，然后令【显略】的发动次数上限+1
				// （不封顶、永久生效——usable 动态读取标记，本阶段内立即可再发动；
				// 2026-10-05 改版：原"令【豪贤】视为未发动过"的循环已移除）
				await player.draw();
				await target.draw();
				player.addMark("显略", 1, false);
				game.log(player, "的【显略】发动次数上限+1");
			}
		},
		ai: {
			order: 9,
			// 发动时选择的展示牌：不会失去（①的 gain 对自己区域已有的牌跳过转移、②不移动牌），低价值优先
			check(card) {
				return 6 - get.value(card);
			},
			result: {
				target(player, target) {
					const att = get.attitude(player, target);
					// 队友：配合凑"和为3的倍数"可各摸一张+上限永久+1，纯收益；
					// 敌方：对方会凑②止损（各摸一张）或被迫吃①（抢牌+杀），期望仍为正
					if (att > 0) {
						return 2;
					}
					if (att < 0) {
						return 1.5;
					}
					return 0.5;
				},
			},
		},
		skill_id: "显略",
		_priority: 0,
	},
	"豪贤": {
		audio: "ext:noname_diy:2",
		enable: "phaseUse",
		limited: true,
		filter(event, player) {
			// 限定技：未发动过（awakenSkill 置 storage 并禁用技能）
			return !player.storage.豪贤;
		},
		async content(event, trigger, player) {
			player.awakenSkill("豪贤");
			// X 为显略发动次数上限（基础3 + 显略②累计的+1，不封顶）
			const X = 3 + player.countMark("显略");
			// 指定至多X个点数：自建 dialog + 两行按钮网格（第一行7、第二行6），
			// 避免 textbutton 单列长列表需下拉、且两端对齐整行过宽的问题。
			// 自建按钮只需 link 属性 + 推入 dialog.buttons 即与内置按钮完全同轨：
			// check 流程（game/check.js checkButton）遍历 dialog.buttons 自动管理
			// selectable/selected，点击走 ui.click.button，AI 走 ai.basic.chooseButton
			// 逐按钮打分（sortcard 位置选择同款纯文本按钮样式）
			const dialog = ui.create.dialog(`豪贤：选择至多${X}个点数`, "hidden");
			const perRow = Math.ceil(13 / 2);
			for (let row = 0; row < 2; row++) {
				const rowDiv = ui.create.div(".buttons", dialog.content);
				rowDiv.style.display = "flex";
				rowDiv.style.justifyContent = "center";
				for (
					let n = row * perRow + 1;
					n <= Math.min((row + 1) * perRow, 13);
					n++
				) {
					const button = ui.create.div(".button.card.pointerdiv.mebg", rowDiv);
					button.style.width = "64px";
					button.style.height = "64px";
					button.style.margin = "4px";
					button.style.display = "flex";
					button.style.alignItems = "center";
					button.style.justifyContent = "center";
					button.style.fontFamily = "xinwei";
					button.style.fontSize = "20px";
					button.textContent = `点数${n}`;
					button.link = n;
					button.listen(ui.click.button);
					dialog.buttons.push(button);
				}
			}
			// AI 打分依据：手牌各点数的牌数（chooseButton 的 ai 为逐按钮打分，预统计一次）
			const counts = {};
			player.getCards("h").forEach((card) => {
				const n = get.number(card, player);
				if (typeof n == "number" && n > 0) {
					counts[n] = (counts[n] || 0) + 1;
				}
			});
			const result = await player
				.chooseButton(dialog, true)
				.set("selectButton", [1, X])
				.set("counts", counts)
				.set("ai", (button) => {
					// 按手牌该点数的牌数 × 指定提升幅度打分：非3倍数提升最大（不触发→全含），
					// Q/9/6 按缺失档位递减，3 已四档全含（指定无提升，得分为 0 不被选中）
					const n = button.link;
					// 提升幅度：非3倍数→3；12缺一二三档→3；9缺一二档→2；6缺一档→1；3已全含→0
					const gain =
						n % 3 != 0 ? 3 : n == 12 ? 3 : n == 9 ? 2 : n == 6 ? 1 : 0;
					return (get.event().counts[n] || 0) * gain + gain * 0.1;
				})
				.forResult();
			const chosen = result?.links || [];
			// 光环 storage 为指定的点数数组（恣胜 filter/content 据此判定；
			// intro 据此展示），onremove:true 于到期自动移除时一并清理
			player.storage.豪贤_aura = chosen;
			// 直到你的下个回合开始（addTempSkill 于其下一次 phaseBeginStart 自动移除，
			// 相天2 同款时效写法）
			player.addTempSkill("豪贤_aura", { player: "phaseBeginStart" });
			game.log(player, "指定了点数", "#g" + chosen.join("、"));
		},
		ai: {
			order: 8,
			result: {
				player(player2) {
					// 手里有牌可打时才值得开启（收益来自后续用牌/打出）
					return player2.countCards("he") > 0 ? 1 : 0;
				},
			},
		},
		skill_id: "豪贤",
		_priority: 0,
	},
	"豪贤_aura": {
		charlotte: true,
		sub: true,
		sourceSkill: "豪贤",
		mark: true,
		marktext: "贤",
		intro: {
			content(storage) {
				return (
					"【恣胜】的所有效果均可对你指定的点数（" +
					((storage || []).join("、") || "无") +
					"）的牌生效，直到你的下个回合开始"
				);
			},
		},
		onremove: true,
		ai: {
			notemp: true,
		},
		skill_id: "豪贤_aura",
		_priority: 0,
	},
	"幻魂": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		trigger: {
			// "一名角色受伤害时"：任意角色（含自己）受到伤害都触发，global 单时机挂法
			// （damageBegin4 在扣体力前触发，选项2的回复可抵消1点伤害、抢救濒死边缘的角色）
			global: "damageBegin4",
		},
		// 受伤者 = trigger.player，弹泡指向对方
		logTarget: "player",
		filter(event, player) {
			// 0点伤害不算"伤害"（选项1摸牌恒可行，其余选项可行性在 content 内判）
			return event.num > 0 && event.player && event.player.isIn();
		},
		async content(event, trigger, player) {
			const victim = trigger.player;
			// 单次抉择：每次触发四选一（文案无循环）
			// 选项2双条件：自己有牌可弃，且受伤者未满血（满血回复无意义，不进选项）
			// 选项3配额：当前持有所得技数<体力上限（不再失去体力；配额=体力上限）
			const canHeal =
				player.countCards("he") > 0 && victim.hp < victim.maxHp;
			const fromPile =
				lib.skill.幻魂.getGained(player).length < player.maxHp &&
				lib.skill.幻魂.getPileCandidates(player).length > 0;
			const canBan =
				lib.skill.幻魂.getGained(player).length > 0 &&
				game.hasPlayer(
					(current) =>
						current !== player &&
						lib.skill.幻魂.banCandidates(current).length > 0,
				);
			// 选项与文案同步构建：不可行选项不进列表（无牌可弃/配额耗尽/无可封目标时不显示其文案）
			const options = ["摸一张牌"];
			const choices = ["摸一张牌"];
			if (canHeal) {
				options.push("弃牌回复");
				choices.push(`弃一张牌并令${get.translation(victim)}回复一点体力`);
			}
			if (fromPile) {
				options.push("观看武将牌堆");
				choices.push(
					"若你此法获得的技能数小于你的体力上限，你观看武将牌堆中的五张牌并获得其中一个技能",
				);
			}
			if (canBan) {
				options.push("失技封敌");
				choices.push(
					"失去一个通过【幻魂】获得的技能，然后令一名其他角色失去一个技能，直到其下个回合结束",
				);
			}
			let choice;
			if (options.length === 1) {
				// 仅选项1可行：锁定技直接执行，无需询问（百战式）
				choice = "摸一张牌";
			} else {
				const result = await player
					.chooseControl(options)
					.set(
						"prompt",
						`幻魂：请选择一项（已持有${lib.skill.幻魂.getGained(player).length}个以此法获得的技能，配额为你的体力上限${player.maxHp}）`,
					)
					.set("choiceList", choices)
					.set("ai", () => {
						const evt = _status.event;
						const evtControls = evt.controls || [];
						const me = evt.player;
						const junk = lib.skill.幻魂
							.getGained(me)
							.some((s) => get.info(s) && get.info(s).charlotte);
						// 弃牌回复在扣体力前结算，可抵消1点伤害：
						// 受伤者是友方且这1回复能救命（伤害≥体力）时最优先
						if (
							evtControls.includes("弃牌回复") &&
							(victim === me || get.attitude(me, victim) > 0) &&
							victim.hp <= trigger.num
						) {
							return "弃牌回复";
						}
						// 免费滚池优先（不再失去体力，优先扩池）
						if (evtControls.includes("观看武将牌堆")) {
							return "观看武将牌堆";
						}
						// 鸡肋技换封敌：稳赚
						if (evtControls.includes("失技封敌") && junk) {
							return "失技封敌";
						}
						// 受伤者是友方时弃牌回复净收益为正（回1血≈2分 > 弃1牌≈1分）
						if (
							evtControls.includes("弃牌回复") &&
							(victim === me || get.attitude(me, victim) > 0)
						) {
							return "弃牌回复";
						}
						// 兜底摸牌
						return evtControls[0];
					})
					.forResult();
				if (!result?.control) {
					return;
				}
				choice = result.control;
			}
			if (choice === "摸一张牌") {
				// 选项1：摸牌兜底（每次受伤稳定+1牌）
				await player.draw(1);
				return;
			}
			if (choice === "弃牌回复") {
				// 选项2：选一张牌弃置，令受伤者回复一点体力——
				// damageBegin4 时机在扣体力前，此回复可抵消1点伤害、抢救濒死边缘的友方
				await player.chooseToDiscard(
					"he",
					true,
					1,
					"幻魂：弃一张牌，令" +
						get.translation(victim) +
						"回复一点体力",
				);
				if (victim.isIn()) {
					await victim.recover(1);
				}
				return;
			}
			if (choice === "观看武将牌堆") {
				// 选项3：不再失去体力，直接观看牌堆
				await lib.skill.幻魂.gainFromPile(player);
				return;
			}
			if (choice === "失技封敌") {
				// 选项4：弃池技换封敌（同止涕：直到其下个回合结束）
				const gained = lib.skill.幻魂.getGained(player);
				const chosen = await player
					.chooseButton(["幻魂：选择要失去的技能", [gained, "skill"]], true)
					.set("ai", (button) => {
						const info = get.info(button.link);
						if (info && info.charlotte) {
							return 3 + Math.random();
						}
						return 1 + Math.random();
					})
					.forResult();
				if (!chosen?.bool || !chosen.links?.length) {
					return;
				}
				await lib.skill.幻魂.removeGained(player, chosen.links);
				const tResult = await player
					.chooseTarget(
						true,
						"令一名其他角色失去一个技能，直到其下个回合结束",
						(card, player2, t) =>
							player2 !== t &&
							lib.skill.幻魂.banCandidates(t).length > 0,
					)
					.set("ai", (t) => {
						const me = _status.event.player;
						let att = -get.attitude(me, t);
						if (
							lib.skill.幻魂
								.banCandidates(t)
								.some((s) => get.info(s) && get.info(s).ai && get.info(s).ai.combo)
						) {
							att += 2;
						}
						return att + Math.random();
					})
					.forResult();
				if (!tResult?.bool || !tResult.targets?.length) {
					return;
				}
				const target = tResult.targets[0];
				const banSkills = lib.skill.幻魂.banCandidates(target);
				const banResult = await player
					.chooseButton(
						[
							`选择令${get.translation(target)}失去的一个技能`,
							[banSkills, "skill"],
						],
						true,
					)
					.set("ai", (button) => {
						const info = get.info(button.link);
						if (info && info.ai && info.ai.combo) {
							return 3 + Math.random();
						}
						return 2 + Math.random();
					})
					.forResult();
				if (!banResult?.bool || !banResult.links?.length) {
					return;
				}
				const skill = banResult.links[0];
				player.line(target);
				game.log(target, "的技能", "#g【" + get.translation(skill) + "】", "失效了");
				// disableSkill 挂 disabledSkills（temp_ban 封不死 mod，见踩坑#51）；
				// 解除时机"其下个回合结束"——phaseEnd 有"本回合内提前解除"歧义（踩坑#49），
				// 沿用止涕式 filter 跳过封技发生时所在的当前回合：
				// 回合外封技→下一次 phaseEnd 即其下个回合结束；其回合内封技→顺延一回合
				target.disableSkill("幻魂", skill);
				target
					.when({ player: "phaseEnd" }, false)
					.filter((evt) => evt != event.getParent("phase"))
					.assign({
						firstDo: true,
					})
					.step(async (evt2, trigger2, player2) => {
						player2.enableSkill("幻魂");
					})
					.finish();
			}
		},
		// ---- 幻魂/幻生 共用辅助（挂在 lib.skill.幻魂 上；幻魂③封敌同源） ----
		// 取角色技能（兼容 name/name1/name2 主公技槽，与夺魂.getSkills 同构）
		getSkills(target) {
			const list = [];
			if (lib.character[target.name]) {
				list.addArray(lib.character[target.name][3]);
			}
			if (lib.character[target.name1]) {
				list.addArray(lib.character[target.name1][3]);
			}
			if (lib.character[target.name2]) {
				list.addArray(lib.character[target.name2][3]);
			}
			return list;
		},
		// 剩余武将牌堆中拥有“你可获得技能”的武将（未初始化时先建堆）
		getPileCandidates(player) {
			if (!_status.characterlist) {
				game.initCharacterList();
			}
			return _status.characterlist.filter(
				(name) =>
					lib.character[name] &&
					lib.character[name][3] &&
					lib.character[name][3].some((i) => !player.hasSkill(i)),
			);
		},
		// 当前拥有的、通过幻魂获得的技能（幻魂③配额判定与幻魂④/幻生消耗）
		getGained(player) {
			const pool = player.storage.幻魂_pool || [];
			return pool.filter((i) => player.hasSkill(i));
		},
		// 记录“通过幻魂获得”的技能（数组池，失去时移除）
		// 选项3配额按“当前持有数”计（getGained().length < 体力上限）：
		// 弃技（幻魂④/幻生）可腾出配额，上限不随场上人数变化
		recordGain(player, skills) {
			if (!player.storage.幻魂_pool) {
				player.storage.幻魂_pool = [];
			}
			player.storage.幻魂_pool.addArray(skills);
		},
		// 失去技能并同步清理池
		async removeGained(player, skills) {
			for (const skill of skills) {
				await player.removeSkill(skill);
				if (player.storage.幻魂_pool) {
					player.storage.幻魂_pool.remove(skill);
				}
			}
		},
		// 可封技候选：目标当前拥有的非charlotte技能（hasSkill 已过滤被禁用者）
		banCandidates(target) {
			return lib.skill.幻魂
				.getSkills(target)
				.filter(
					(s) => target.hasSkill(s) && !lib.skill[s]?.charlotte,
				);
		},
		// 幻魂选项3交互：观看武将牌堆中的五张牌，
		// 选择其中一名武将并获得其一个技能；仅观看，武将牌不离开牌堆
		async gainFromPile(player) {
			const candidates = lib.skill.幻魂.getPileCandidates(player);
			if (!candidates.length) {
				return;
			}
			const num = 5;
			const list = candidates.randomGets(num);
			const result = await player
				.chooseButton(
					[
						`幻魂：观看武将牌堆中的${get.cnNumber(list.length)}名武将，选择一名获得其技能`,
						[list, "character"],
					],
					true,
				)
				.set("ai", (button) => {
					const me = _status.event.player;
					const skills =
						(lib.character[button.link] && lib.character[button.link][3]) || [];
					let eff = 0;
					for (const skill of skills) {
						if (!me.hasSkill(skill)) {
							eff += 1;
						}
					}
					return eff + Math.random();
				})
				.forResult();
			if (!result?.bool || !result.links?.length) {
				return;
			}
			const name = result.links[0];
			const skills = ((lib.character[name] && lib.character[name][3]) || []).filter(
				(i) => !player.hasSkill(i),
			);
			if (!skills.length) {
				return;
			}
			const chosen = await player
				.chooseButton(
					[`选择获得${get.translation(name)}的一个技能`, [skills, "skill"]],
					true,
				)
				.set("ai", (button) => {
					const info = get.info(button.link);
					if (info && info.charlotte) {
						return 1;
					}
					if (info && info.ai && info.ai.combo) {
						return 3 + Math.random();
					}
					return 2 + Math.random();
				})
				.forResult();
			if (!chosen?.bool || !chosen.links?.length) {
				return;
			}
			await player.addSkills(chosen.links);
			lib.skill.幻魂.recordGain(player, chosen.links);
		},
		ai: {
			effect: {
				target(card, player, target) {
					// 打幻魂持有者会喂其触发（摸牌回复/封敌等），略降伤害价值
					if (
						target !== player &&
						get.tag(card, "damage") > 0 &&
						target.hasSkill("幻魂")
					) {
						return [1, -0.1];
					}
				},
			},
		},
		skill_id: "幻魂",
		_priority: 0,
	},
	"幻劫": {
		audio: "ext:noname_diy:2",
		trigger: {
			// gameStart：游戏开始（同魂契/移魂的挂法）；roundEnd：一轮游戏结束时
			// （round 事件收尾处 event.trigger("roundEnd")，content.js）
			global: ["gameStart", "roundEnd"],
		},
		// "可以"的可选触发技：prompt 属性交由引擎自动弹 chooseBool（踩坑#31，同幻生）；
		// AI 取舍用 check（content.js:3604：next2.ai = () => !check || check(...)）
		prompt: "是否发动【幻劫】？",
		filter(event, player) {
			return (
				player.isIn() &&
				game.hasPlayer((current) => current !== player)
			);
		},
		check(trigger, player) {
			// 掉1体力换1直伤：体力为1时发动会进入濒死，不打；无敌人可打也不发动
			if (player.hp <= 1) {
				return false;
			}
			return game.hasPlayer(
				(current) =>
					current !== player && get.attitude(player, current) < 0,
			);
		},
		async content(event, trigger, player) {
			// 先支付后结算：失去1点体力（loseHp 不是伤害，不触发幻魂）
			await player.loseHp(1);
			if (!player.isIn()) {
				// 体力为1时强行发动且未被救回：已进入死亡流程，无从造成伤害
				return;
			}
			const tResult = await player
				.chooseTarget(
					true,
					"幻劫：对一名其他角色造成1点伤害",
					(card, player2, t) => player2 !== t,
				)
				.set("ai", (t) => {
					const me = _status.event.player;
					let att = -get.attitude(me, t);
					if (t.hp <= 1) {
						// 压制残血，优先斩杀
						att += 2;
					}
					return att + Math.random();
				})
				.forResult();
			if (!tResult?.bool || !tResult.targets?.length) {
				return;
			}
			const target = tResult.targets[0];
			if (target.isIn()) {
				await target.damage(1, player);
			}
		},
		skill_id: "幻劫",
		_priority: 0,
	},
	"幻生": {
		audio: "ext:noname_diy:2",
		trigger: {
			// 同夺魂：_saveAfter = 求桃失败、正式死亡前，此刻回体力可阻止后续 die
			global: "_saveAfter",
		},
		// “可以”的可选触发技：prompt 属性交由引擎自动弹 chooseBool（踩坑#31）；
		// AI 取舍用 check（content.js:3604：next2.ai = () => !check || check(...)）
		prompt: "是否发动【幻生】？",
		logTarget: "dying",
		filter(event, player) {
			if (!event.dying || !event.dying.isIn() || !event.dying.isDying()) {
				return false;
			}
			return lib.skill.幻魂.getGained(player).length > 0;
		},
		check(trigger, player) {
			// 自己命悬一线必救；友军值得救；敌方死亡不值得白费技能
			if (trigger.dying === player) {
				return true;
			}
			return get.attitude(player, trigger.dying) > 0;
		},
		async content(event, trigger, player) {
			const target = trigger.dying;
			const gained = lib.skill.幻魂.getGained(player);
			const result = await player
				.chooseButton(
					[
						`幻生：选择失去一个技能，令${get.translation(target)}恢复体力值至1点`,
						[gained, "skill"],
					],
					true,
				)
				.set("ai", (button) => {
					const info = get.info(button.link);
					// 复活优先于保技：低价值（非combo）技能先换
					if (info && info.ai && info.ai.combo) {
						return 1 + Math.random();
					}
					return 3 + Math.random();
				})
				.forResult();
			if (!result?.bool || !result.links?.length) {
				return;
			}
			await lib.skill.幻魂.removeGained(player, result.links);
			// 此刻仍在死亡结算前，recoverTo(1) 即可阻止后续 die（同夺魂）；
			// 若已被其他技能救回（hp>=1）则不再回复，避免 recoverTo 负增量
			if (target.isIn() && target.hp < 1) {
				await target.recoverTo(1);
			}
		},
		skill_id: "幻生",
		_priority: 0,
	},
};

export default skills;
