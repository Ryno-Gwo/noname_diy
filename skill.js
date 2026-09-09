import { lib, game, ui, get, ai, _status } from "noname";

/** @type { importCharacterConfig["skill"] } */
const skills = {
	"魂契": {
		audio: "ext:noname_diy:2",
		locked: true,
		forced: true,
		trigger: {
			player: "changeHp",
		},
		filter(event, player) {
			return event.num > 0 && player.hp > 1;
		},
		mod: {
			maxHandcardFinal(player) {
				return player.maxHp;
			},
		},
		async content(event, trigger, player) {
			const X = player.hp - 1;
			if (X > 0) {
				player.logSkill(event.skill);
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
			global: ["gameStart", "_saveAfter"],
		},
		filter(event, player, name) {
			if (name === "gameStart") {
				return player.maxHp > 1;
			}
			// _saveAfter: 求桃失败、正式死亡前
			if (
				!event.dying ||
				!event.dying.isIn() ||
				!event.dying.isDying()
			) {
				return false;
			}
			return (
				player.maxHp > 1 ||
				lib.skill.夺魂.getStolenSkills(player).length > 0
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
		async content(event, trigger, player) {
			const target = event.triggername === "_saveAfter" ? trigger.dying : null;
			const chooseSkill = async (source) => {
				const skills = lib.skill.夺魂
					.getSkills(source)
					.filter((i) => !player.hasSkill(i));
				if (!skills.length) {
					return;
				}
				const chosen = await player
					.chooseButton(
						["请选择要获得的技能", [skills, "skill"]],
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
				if (chosen.bool && chosen.links && chosen.links.length) {
					await player.addSkills(chosen.links);
					if (!player.storage.夺魂_sources) {
						player.storage.夺魂_sources = {};
					}
					for (const skill of chosen.links) {
						player.storage.夺魂_sources[skill] = source;
					}
				}
			};
			const stolenSkills = lib.skill.夺魂.getStolenSkills(player);
			const skillCandidates = game.filterPlayer(
				(t) =>
					t !== player &&
					lib.skill.夺魂
						.getSkills(t)
						.some((i) => !player.hasSkill(i)),
			);
			if (event.triggername === "gameStart") {
				// 情况A：chooseBool 确认后直接减上限拿技能
				if (player.maxHp <= 1 || !skillCandidates.length) {
					return;
				}
				const result = await player
					.chooseBool(
						get.prompt(event.name),
						"是否要失去1点体力上限，并获得一名其他角色的一个技能？",
					)
					.set("ai", () => (player.maxHp > 2 ? 1 : 0))
					.forResult();
				if (!result.bool) {
					return;
				}
				player.logSkill(event.skill);
				await player.loseMaxHp();
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
				if (tResult.bool && tResult.targets.length) {
					await chooseSkill(tResult.targets[0]);
				}
			} else {
				// 情况B：chooseControl 选 B1/B2，执行后复活
				const controls = [];
				if (player.maxHp > 1 && skillCandidates.length) {
					controls.push("减体力上限并获得技能");
				}
				if (stolenSkills.length) {
					controls.push("失去技能并摸牌");
				}
				if (!controls.length) {
					return;
				}
				controls.push("cancel2");
				const costResult = await player
					.chooseControl(controls)
					.set("prompt", get.prompt("夺魂", target))
					.set(
						"prompt2",
						`濒死角色：${get.translation(target)}。选择一项：①减体力上限并获得技能，令其回复体力至1点；②失去技能并摸牌，令其回复体力至1点。`,
					)
					.set("ai", () => {
						const player2 = _status.event.player;
						const trigger2 = _status.event.getTrigger();
						const target2 = trigger2 && trigger2.dying;
						if (target2 && target2 !== player2 && get.attitude(player2, target2) <= 0) {
							return "cancel2";
						}
						const evtControls = _status.event.controls || [];
						if (
							evtControls.includes("减体力上限并获得技能") &&
							player2.maxHp > 2
						) {
							return "减体力上限并获得技能";
						}
						if (evtControls.includes("失去技能并摸牌")) {
							return "失去技能并摸牌";
						}
						if (evtControls.includes("减体力上限并获得技能")) {
							return "减体力上限并获得技能";
						}
						return "cancel2";
					})
					.forResult();
				if (costResult.control === "cancel2" || !costResult.control) {
					return;
				}
				player.logSkill(event.skill, target);
				if (costResult.control === "减体力上限并获得技能") {
					await player.loseMaxHp();
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
					if (tResult.bool && tResult.targets.length) {
						await chooseSkill(tResult.targets[0]);
					}
				} else {
					const chosen = await player
						.chooseButton([
							"请选择要失去的来源于其他角色的技能",
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
					await player.draw(player.maxHp);
				}
				await target.recoverTo(1);
			}
		},
		skill_id: "夺魂",
		_priority: 0,
	},
	"止涕": {
		audio: "ext:noname_diy:2",
		trigger: {
			source: "damageSource",
		},
		filter(event, player) {
			const target = event.player;
			if (!target || target === player || target.isDead()) {
				return false;
			}
			if (lib.skill.止涕.countFromSource(player, target) <= 0) {
				return false;
			}
			const owned = target.getStorage("止涕_mark") || [];
			return (
				!owned.includes("止戈") ||
				!owned.includes("血俎") ||
				!owned.includes("失魂")
			);
		},
		countFromSource(player, target) {
			const map = player.storage.夺魂_sources || {};
			return Object.keys(map).filter(
				(skill) => map[skill] === target && player.hasSkill(skill),
			).length;
		},
		forced: true,
		async content(event, trigger, player) {
			const target = trigger.player;
			const owned = target.getStorage("止涕_mark") || [];
			const controls = [];
			if (!owned.includes("止戈")) {
				controls.push("止戈");
			}
			if (!owned.includes("血俎")) {
				controls.push("血俎");
			}
			if (!owned.includes("失魂")) {
				controls.push("失魂");
			}
			controls.push("cancel2");
			const result = await player
				.chooseControl(controls)
				.set("prompt", get.prompt(event.name, target))
				.set(
					"prompt2",
					"令其获得一枚其未拥有的标记：【止戈】废除1个装备栏；【血俎】降低1点体力上限；【失魂】失去1个技能。若如此做，你增加1点体力上限。",
				)
				.set("ai", () => {
					const me = _status.event.player;
					const tgt = _status.event.getTrigger().player;
					if (get.attitude(me, tgt) >= 0) {
						return "cancel2";
					}
					if (
						controls.includes("失魂") &&
						lib.skill.夺魂.getSkills(tgt).filter((s) => !lib.skill[s]?.charlotte).length > 0
					) {
						return "失魂";
					}
					if (controls.includes("血俎") && tgt.maxHp > 1) {
						return "血俎";
					}
					if (controls.includes("止戈")) {
						return "止戈";
					}
					return "cancel2";
				})
				.forResult();
			if (result.control === "cancel2") {
				return;
			}
			player.logSkill(event.skill, target);
			target.markAuto("止涕_mark", [result.control]);
			target.addSkill("止涕_mark");
			if (result.control === "止戈") {
				const slotList = [];
				for (const slot of [1, 2, 3, 4, 5]) {
					if (target.hasEnabledSlot(slot)) {
						slotList.push(
							slot === 3 || slot === 4
								? "equip3_4"
								: `equip${slot}`,
						);
					}
				}
				if (slotList.length) {
					const slotResult = await player
						.chooseControl(slotList)
						.set(
							"prompt",
							`选择废除${get.translation(target)}的一个装备栏`,
						)
						.set("ai", () => {
							if (slotList.includes("equip3_4")) {
								return "equip3_4";
							}
							if (slotList.includes("equip2")) {
								return "equip2";
							}
							return slotList[0];
						})
						.forResult();
					if (slotResult.control === "equip3_4") {
						await target.disableEquip(3, 4);
					} else {
						await target.disableEquip(slotResult.control);
					}
				}
			} else if (result.control === "血俎") {
				if (target.maxHp > 1) {
					await target.loseMaxHp();
				}
			} else if (result.control === "失魂") {
				const skills = lib.skill.夺魂.getSkills(target);
				const available = skills.filter(
					(s) => !lib.skill[s]?.charlotte,
				);
				if (available.length) {
					const skillResult = await player
						.chooseButton(
							[
								`选择令${get.translation(target)}失去的一个技能`,
								[available, "skill"],
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
					if (
						skillResult.bool &&
						skillResult.links &&
						skillResult.links.length
					) {
						target.removeSkill(skillResult.links[0]);
					}
				}
			}
			await player.gainMaxHp();
		},
		ai: {
			effect: {
				target(card, player, target, current) {
					if (
						target !== player &&
						get.tag(card, "damage") > 0 &&
						lib.skill.止涕.countFromSource(player, target) > 0
					) {
						const owned = target.getStorage("止涕_mark") || [];
						if (owned.length < 3) {
							return current + 0.3;
						}
					}
				},
			},
		},
		skill_id: "止涕",
		_priority: 0,
	},
	"止涕_mark": {
		charlotte: true,
		sub: true,
		sourceSkill: "止涕",
		intro: {
			name: "止涕",
			content(storage) {
				if (!storage || !storage.length) {
					return "";
				}
				return "已拥有标记：" + storage.map((s) => `【${s}】`).join("");
			},
		},
		skill_id: "止涕_mark",
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
			player: ["loseAfter", "phaseAfter"],
			global: ["equipAfter", "addJudgeAfter", "gainAfter", "loseAsyncAfter", "dieAfter"]
		},
		filter(event, player, name) {
			if (name === "phaseAfter") {
				return player.getExpansions("倾朝").length > 0;
			}
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
			if (event.triggername === "phaseAfter") {
				const zhi = player.getExpansions("倾朝");
				const { bool, links } = await player.chooseButton(['移去一张\"志\"', zhi], true).forResult();
				if (bool) {
					await player.loseToDiscardpile(links);
				}
			} else if (event.triggername === "dieAfter") {
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
};

export default skills;
