import { lib, game, ui, get, ai, _status } from "noname";
export const type = "extension";
export default function(){
	return {name:"noname_diy_skill",editable:true,connect:false,arenaReady:function () {},content:function (config, pack) {},prepare:function () {},precontent:function (config) {},help:{},config:{},package:{
    character: {
        character: {
            "神张辽": {
                sex: "male",
                group: "shen",
                hp: 1,
                maxHp: 5,
                hujia: 0,
                skills: ["夺魂","止涕"],
                img: "extension/noname_diy_skill/神张辽.jpg",
                dieAudios: ["ext:noname_diy_skill/audio/die/神张辽.mp3"],
            },
            "神曹操": {
                sex: "male",
                group: "shen",
                hp: 3,
                maxHp: 3,
                hujia: 0,
                skills: ["归訫","飛影"],
                img: "extension/noname_diy_skill/神曹操.jpg",
                dieAudios: ["ext:noname_diy_skill/audio/die/神曹操.mp3"],
            },
            "神诸葛": {
                sex: "male",
                group: "shen",
                hp: 3,
                maxHp: 3,
                hujia: 0,
                skills: ["七煋","相天","神机"],
                img: "extension/noname_diy_skill/神诸葛.jpg",
            },
            "神徐盛": {
                sex: "male",
                group: "shen",
                hp: 5,
                maxHp: 5,
                hujia: 0,
                skills: ["疑城","破军"],
                img: "extension/noname_diy_skill/神徐盛.png",
                dieAudios: ["ext:noname_diy_skill/audio/die/神徐盛.mp3"],
            },
        },
        translate: {
            "神张辽": "神张辽",
            "noname_diy_skill": "noname_diy_skill",
            "神曹操": "神曹操",
            "神诸葛": "神诸葛",
            "神徐盛": "神徐盛",
        },
    },
    card: {
        card: {
        },
        translate: {
        },
        list: [],
    },
    skill: {
        skill: {
            "夺魂": {
                audio: "ext:noname_diy_skill:2",
                trigger: {
                    global: "gameStart",
                    player: "phaseBegin",
                },
                group: ["夺魂_rescue"],
                direct: true,
                filter(event, player) {
                  return player.maxHp > 1;
                },
                mod: {
                    maxHandcardFinal(player) {
                        return player.maxHp;
                      },
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
                  const { bool } = await player
                    .chooseBool(
                      get.prompt2(event.skill),
                      "失去1点体力，然后增加1点体力上限",
                    )
                    .set("ai", () => {
                      const player2 = _status.event.player;
                      if (player2.hp <= 1 && player2.maxHp <= 1) {
                        return 0;
                      }
                      return 1;
                    })
                    .forResult();
                  if (!bool) {
                    return;
                  }
                  player.logSkill(event.skill);
                  await player.loseHp();
                  await player.gainMaxHp();
                },
                subSkill: {
                    rescue: {
                        audio: "ext:noname_diy_skill:2",
                        trigger: {
                            global: "_saveAfter",
                        },
                        filter(event, player) {
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
                        direct: true,
                        async content(event, trigger, player) {
                          const target = trigger.dying;
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
                              // 记录技能来源，供【止涕】判断“来源于其的技能”
                              if (!player.storage.夺魂_sources) {
                                player.storage.夺魂_sources = {};
                              }
                              for (const skill of chosen.links) {
                                player.storage.夺魂_sources[skill] = source;
                              }
                            }
                          };
                          // 选择一项：①减少体力上限并获得一名其他角色的技能；②失去一个来源技能并摸牌
                          const controls = [];
                          const skillCandidates = game.filterPlayer(
                            (t) =>
                              t !== player &&
                              lib.skill.夺魂
                                .getSkills(t)
                                .some((i) => !player.hasSkill(i)),
                          );
                          if (player.maxHp > 1 && skillCandidates.length) {
                            controls.push("减少体力上限并获得技能");
                          }
                          const stolenSkills = lib.skill.夺魂.getStolenSkills(player);
                          if (stolenSkills.length) {
                            controls.push("失去一个来源技能并摸牌");
                          }
                          if (!controls.length) {
                            return;
                          }
                          controls.push("cancel2");
                          const costResult = await player
                            .chooseControl(controls)
                            .set("prompt", get.prompt2(event.skill, target))
                            .set(
                              "prompt2",
                              "选择一项：①减少1点体力上限，并获得一名其他角色的一个技能；②失去一个来源于其他角色的技能，然后摸体力上限张牌。若如此做，你令其回复体力至1点。",
                            )
                            .set("ai", () => {
                              const player2 = _status.event.player;
                              const trigger2 = _status.event.getTrigger();
                              const target2 = trigger2 && trigger2.dying;
                              if (!target2) {
                                return "cancel2";
                              }
                              if (
                                target2 !== player2 &&
                                get.attitude(player2, target2) <= 0
                              ) {
                                return "cancel2";
                              }
                              const evtControls = _status.event.controls || [];
                              if (
                                evtControls.includes("减少体力上限并获得技能") &&
                                player2.maxHp > 2
                              ) {
                                return "减少体力上限并获得技能";
                              }
                              if (evtControls.includes("失去一个来源技能并摸牌")) {
                                return "失去一个来源技能并摸牌";
                              }
                              if (evtControls.includes("减少体力上限并获得技能")) {
                                return "减少体力上限并获得技能";
                              }
                              return "cancel2";
                            })
                            .forResult();
                          if (
                            costResult.control === "cancel2" ||
                            !costResult.control
                          ) {
                            return;
                          }
                          player.logSkill(event.skill, target);
                          if (costResult.control === "减少体力上限并获得技能") {
                            // ① 减少1点体力上限，并获得一名其他角色的一个技能
                            await player.loseMaxHp();
                            const result = await player
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
                            if (result.bool && result.targets.length) {
                              await chooseSkill(result.targets[0]);
                            }
                          } else {
                            // ② 失去一个来源于其他角色的技能，然后摸体力上限张牌
                            if (!stolenSkills.length) {
                              return;
                            }
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
                            if (
                              !chosen.bool ||
                              !chosen.links ||
                              !chosen.links.length
                            ) {
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
                          // 若如此做，你令其回复体力至1点
                          await target.recoverTo(1);
                        },
                        "skill_id": "夺魂_rescue",
                        sub: true,
                        sourceSkill: "夺魂",
                        "_priority": 0,
                    },
                },
                "_priority": 0,
                "skill_id": "夺魂",
            },
            "止涕": {
                audio: "ext:noname_diy_skill:2",
                trigger: {
                    source: "damageSource",
                },
                filter(event, player) {
                  // player = 伤害来源（技能拥有者），event.player = 受伤角色
                  const target = event.player;
                  if (!target || target === player || target.isDead()) {
                    return false;
                  }
                  // 一局游戏内每名角色限一次
                  const used = player.storage.止涕_used || [];
                  if (used.includes(target)) {
                    return false;
                  }
                  return lib.skill.止涕.countFromSource(player, target) > 0;
                },
                countFromSource(player, target) {
                  const map = player.storage.夺魂_sources || {};
                  return Object.keys(map).filter(
                    (skill) => map[skill] === target && player.hasSkill(skill),
                  ).length;
                },
                async cost(event, trigger, player) {
                  const target = trigger.player;
                  const X = lib.skill.止涕.countFromSource(player, target);
                  // ③ 仅在目标还有可失去的技能时提供
                  const controls = ["止涕1", "止涕2"];
                  if (lib.skill.夺魂.getSkills(target).length > 0) {
                    controls.push("止涕3");
                  }
                  controls.push("cancel2");
                  event.result = await player
                    .chooseControl(controls)
                    .set(
                      "prompt",
                      `对${get.translation(target)}发动【止涕】：废除其${get.cnNumber(X)}个装备栏，或降低其${get.cnNumber(X)}点体力上限，或令其失去${get.cnNumber(X)}个技能`,
                    )
                    .set("ai", () => {
                      const player2 = _status.event.player;
                      const trigger2 = _status.event.getTrigger();
                      const target2 = trigger2 && trigger2.player;
                      if (!target2 || get.attitude(player2, target2) >= 0) {
                        return "cancel2";
                      }
                      const X2 = lib.skill.止涕.countFromSource(player2, target2);
                      const skills = lib.skill.夺魂.getSkills(target2);
                      // 目标技能足够多时优先封锁其技能
                      if (skills.length > 0 && skills.length >= X2) {
                        return "止涕3";
                      }
                      if (target2.countCards("e") > 0) {
                        return "止涕1";
                      }
                      return "止涕2";
                    })
                    .forResult();
                  // 引擎不会把 cost 的 event.result 传给 content，需用 cost_data 传递选项。
                  // 注意：点击选项后的 result 没有 bool 字段，只有 control，不能判断 bool
                  if (event.result && event.result.control) {
                    event.result.cost_data = event.result.control;
                  }
                },
                async content(event, trigger, player) {
                  const target = trigger.player;
                  const X = lib.skill.止涕.countFromSource(player, target);
                  // 记录本局已对目标使用过
                  if (!player.storage.止涕_used) {
                    player.storage.止涕_used = [];
                  }
                  player.storage.止涕_used.push(target);
                  player.logSkill("止涕", target);
                  if (event.cost_data === "止涕1") {
                    // 废除X个装备栏：逐个选择要废除的装备栏（参考止啼/心海）
                    for (let n = 0; n < X; n++) {
                      const slotSet = new Set();
                      for (const slot of [1, 2, 3, 4, 5]) {
                        if (target.hasEnabledSlot(slot)) {
                          slotSet.add(
                            slot === 3 || slot === 4 ? "equip3_4" : `equip${slot}`,
                          );
                        }
                      }
                      const list = Array.from(slotSet);
                      if (!list.length) {
                        break;
                      }
                      const result = await player
                        .chooseControl(list)
                        .set("prompt", `选择废除${get.translation(target)}的一个装备栏`)
                        .set("ai", () => {
                          if (
                            list.includes("equip3_4") &&
                            target.getEquip(3) &&
                            target.getEquip(4)
                          ) {
                            return "equip3_4";
                          }
                          if (list.includes("equip2") && target.getEquip(2)) {
                            return "equip2";
                          }
                          if (list.includes("equip5") && target.getEquip(5)) {
                            return "equip5";
                          }
                          if (list.includes("equip1") && target.getEquip(1)) {
                            return "equip1";
                          }
                          return list[0];
                        })
                        .forResult();
                      if (result.control === "equip3_4") {
                        await target.disableEquip(3, 4);
                      } else {
                        await target.disableEquip(result.control);
                      }
                    }
                  } else if (event.cost_data === "止涕2") {
                    // 降低X点体力上限（至多降为1）
                    let num = X;
                    while (num > 0 && target.maxHp > 1) {
                      await target.loseMaxHp();
                      num--;
                    }
                  } else if (event.cost_data === "止涕3") {
                    // 令其失去X个技能，直到其进入濒死状态（由止涕_lock 在 dying 时恢复）
                    const available = lib.skill.夺魂.getSkills(target);
                    const num = Math.min(X, available.length);
                    if (num > 0) {
                      const result = await player
                        .chooseButton(
                          [
                            `止涕：选择要令${get.translation(target)}失去的${get.cnNumber(num)}个技能`,
                            [available, "skill"],
                          ],
                          [num, num],
                        )
                        .set("ai", (button) => {
                          const info = get.info(button.link);
                          if (info && info.ai && info.ai.combo) {
                            return 3 + Math.random();
                          }
                          return 2 + Math.random();
                        })
                        .forResult();
                      if (result.bool && result.links && result.links.length) {
                        if (!target.storage.止涕_lock) {
                          target.storage.止涕_lock = [];
                        }
                        target.storage.止涕_lock.addArray(result.links);
                        for (const skill of result.links) {
                          target.removeSkill(skill);
                        }
                        target.addSkill("止涕_lock");
                        game.log(target, "失去了", result.links, "，进入濒死状态时恢复");
                      }
                    }
                  }
                },
                ai: {
                    effect: {
                        target(card, player, target, current) {
                          // 有来源于其的技能且本局未对其使用过时，略微提高对其使用伤害牌的价值
                          if (
                            target !== player &&
                            get.tag(card, "damage") > 0 &&
                            lib.skill.止涕.countFromSource(player, target) > 0 &&
                            !(player.storage.止涕_used || []).includes(target)
                          ) {
                            return current + 0.3;
                          }
                        },
                    },
                },
                "skill_id": "止涕",
                "_priority": 0,
            },
            "止涕_lock": {
                charlotte: true,
                sub: true,
                sourceSkill: "止涕",
                trigger: {
                    player: "dying",
                },
                // 进入濒死状态：解除技能封锁
                async content(event, trigger, player) {
                  const list = player.storage.止涕_lock || [];
                  player.storage.止涕_lock = [];
                  for (const skill of list) {
                    if (lib.skill[skill] && !player.hasSkill(skill)) {
                      player.addSkill(skill);
                    }
                  }
                  player.removeSkill("止涕_lock");
                  if (list.length) {
                    game.log(player, "因进入濒死状态，恢复了", list, "等技能");
                  }
                },
                onremove(player, skill) {
                  // 兜底：标记被移除时恢复被封锁的技能，避免永久丢失
                  const list = player.storage.止涕_lock || [];
                  player.storage.止涕_lock = [];
                  for (const s of list) {
                    if (lib.skill[s] && !player.hasSkill(s)) {
                      player.addSkill(s);
                    }
                  }
                },
                intro: {
                    name: "止涕",
                    content(storage, player) {
                        const list = player.storage.止涕_lock || [];
                        return `已失去${get.cnNumber(list.length)}个技能，进入濒死状态时恢复`;
                      },
                },
                "skill_id": "止涕_lock",
                "_priority": 0,
            },
            "归訫": {
                audio: "ext:noname_diy_skill:2",
                trigger: {
                    player: "changeHp",
                },
                global: "归訫_put",
                group: ["归訫_use"],
                hasGuixin(player) {
                  return player.getExpansions("归訫2").length > 0;
                },
                filter(event, player) {
                  // changeHp：场上至少存在一个可指定的目标
                  return game.hasPlayer(
                    (target) =>
                      target !== player &&
                      target.isIn() &&
                      (lib.skill.归訫.hasGuixin(target) ||
                        target.countCards("hej") > 0),
                  );
                },
                // changeHp 覆盖伤害/体力流失/回复三种来源；
                // changedHp 为扣除护甲、体力上限封顶后的实际变化值，
                // 取其绝对值即为“失去或回复的体力点数”，每1点触发一次
                getIndex(event, player) {
                  return Math.abs(event.changedHp);
                },
                async cost(event, trigger, player) {
                  event.result = await player
                    .chooseTarget(
                      get.prompt(event.skill),
                      "你可以依次选择其他角色：有“归訫”者你将其所有“归訫”移至你的武将牌上；无“归訫”者你获得其区域内的一张牌，然后你翻面。",
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
                      if (att > 0) return -1; // 不处理友军
                      const guixin = target.getExpansions("归訫2");
                      if (guixin.length > 0) {
                        // 翻面代价：至少能取走其“归訫”才值得
                        return -att + guixin.length - 0.5;
                      }
                      // 无“归訫”：翻面代价大，仅凭一张普通牌不划算
                      return -att - 1;
                    })
                    .forResult();
                },
                async content(event, trigger, player) {
                  // 受到伤害后：先依次结算所选角色，最后再翻面
                  for (const target of event.targets.slice(0)) {
                    if (!target.isIn()) continue;
                    const guixin = target.getExpansions("归訫2").slice(0);
                    if (guixin.length > 0) {
                      // 有“归訫”：将其所有“归訫”移至你的武将牌上（仍是“归訫”），可用于效果3
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
                        "的所有“归訫”移至了自己的武将牌上",
                      );
                      if (target.getExpansions("归訫2").length === 0) {
                        target.removeSkill("归訫2");
                      }
                    } else {
                      // 无“归訫”：获得其区域内的一张牌
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
                  // 结算完毕后再翻面
                  await player.turnOver();
                  game.log(player, "因【归訫】翻面了");
                },
                ai: {
                    maixie: true,
                    "maixie_hp": true,
                },
                "skill_id": "归訫",
                "_priority": 0,
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
                            return "共有" + get.cnNumber(cards.length) + "张“归訫”牌";
                          }
                        }
                      },
                },
                ai: {
                    notemp: true,
                },
                "skill_id": "归訫2",
                "_priority": 0,
            },
            "归訫_put": {
                audio: "归訫",
                sub: true,
                sourceSkill: "归訫",
                trigger: {
                    player: "phaseBegin",
                },
                filter(event, player) {
                  // player = 当回合角色
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
                    const me = _status.event.player; // 当回合角色（选择者）
                    const useful = get.useful(card, me);
                    // 判定区里的延时锦囊牌（乐/兵粮/闪电等）：放上武将牌可逃过判定，任何时候都值得
                    if (get.position(card) === "j") {
                      return 15 - useful;
                    }
                    // 其余情况：只有自己就是拥有者，或拥有者对自己友好（会令自己摸牌）时才放废牌换摸牌
                    if (me !== holder && get.attitude(holder, me) <= 0) {
                      return 0;
                    }
                    if (useful > 4) return 0; // 不是废牌：不放
                    return 10 - useful; // 越废得分越高，选最废的一张
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
                  game.log(player, "将", cards, "置于武将牌上，作为“归訫”");
                  // 衔接技能拥有者的选择：是否令其摸一张牌
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
                "skill_id": "归訫_put",
                "_priority": 0,
            },
            "归訫_use": {
                audio: "归訫",
                sub: true,
                sourceSkill: "归訫",
                enable: ["chooseToUse","chooseToRespond"],
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
                          // 扩展区牌不在场上渲染，无法点选：selectCard:-1 + position:"x" 让引擎
                          // 自动选中全部归訫（checkEnd 钩子自动确认），再由 precontent 随机抽一张
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
                        return `随机使用一张“归訫”，将其当做${get.translation(links[0][3]) || ""}${get.translation(links[0][2])}使用`;
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
                        "skill_id": "归訫_use_backup",
                        sub: true,
                        sourceSkill: "归訫_use",
                        "_priority": 0,
                    },
                },
                "skill_id": "归訫_use",
                "_priority": 0,
            },
            "飛影": {
                audio: "ext:noname_diy_skill:2",
                locked: true,
                mod: {
                    globalTo(from, to, distance) {
                        if (lib.skill.归訫.hasGuixin(from)) {
                          return distance + 1;
                        }
                      },
                },
                trigger: {
                    global: ["phaseBegin","useCard"],
                },
                forced: true,
                popup: false,
                silent: true,
                filter(event, player, name) {
                  // 触发时机名在 filter 的第三个参数 name 中
                  if (name === "phaseBegin") {
                    return true;
                  }
                  // useCard
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
                  // useCard：使该牌无效
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
                "skill_id": "飛影",
                "_priority": 1,
            },
            "七煋": {
                audio: "ext:noname_diy_skill:2",
                trigger: {
                    player: ["phaseBegin", "phaseEnd"],
                    global: "phaseBefore",
                },
                direct: true,
                filter(event, player, name) {
                  // 注意：filter 的 event 是源事件（name 是源事件名），
                  // 触发时机名在第三个参数 name 中
                  if (name == "phaseBegin") {
                    return player.getExpansions("七煋").length < 7;
                  }
                  if (name == "phaseBefore") {
                    // 游戏开始时（第一回合前）也可观煋
                    return (
                      game.phaseNumber == 0 &&
                      player.getExpansions("七煋").length < 7
                    );
                  }
                  if (name == "phaseEnd") {
                    // phaseEnd：有“煋”且有其他在场角色时可移煋
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
                    // 观看牌堆顶七张牌并调整顺序，硬性只取前X张置于武将牌上
                    const num = 7 - player.getExpansions("七煋").length;
                    const cards = get.cards(7);
                    // 牌堆顶的牌无主，不能走 loseToDiscardpile，需直接插回牌堆顶
                    const putBack = (list) => {
                      for (let i = list.length - 1; i >= 0; i--) {
                        ui.cardPile.insertBefore(list[i], ui.cardPile.firstChild);
                      }
                      game.updateRoundNumber();
                    };
                    const next = player.chooseToMove();
                    next.set(
                      "prompt",
                      `七煋：调整牌堆顶七张牌的顺序（点击两张牌可交换位置），前${get.cnNumber(num)}张将置于武将牌上，称为“煋”`,
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
                    // 回合结束时：将任意张“煋”移至等量名角色的武将牌上
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
                          `七煋：是否将“煋”移至其他角色的武将牌上？`,
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
                        `七煋：选择${get.cnNumber(num)}名角色，将“煋”分别移至其武将牌上`,
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
                      // “give”动画会使煋牌明置（lose 时 addKnower everyone），
                      // 这样所有角色点开其“煋”标记都能看到牌面
                      const next = target.addToExpansion(star, player, "give");
                      await next;
                      // lose 事件会清掉牌上非 eternal_ 的 gaintag，
                      // 移过去后需重新打上“七煋”标记，否则 getExpansions 检测不到
                      target.addGaintag(star, "七煋");
                      target.addSkill("七煋_mark");
                      target.markSkill("七煋_mark");
                    }
                    player.markSkill("七煋");
                    game.log(
                      player,
                      "将",
                      get.cnNumber(num),
                      "张“煋”分别移至了",
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
                            return "共有" + get.cnNumber(cards.length) + "张“煋”";
                          }
                        }
                      },
                },
                ai: {
                    notemp: true,
                },
                "skill_id": "七煋",
                "_priority": 0,
            },
            "相天": {
                audio: "ext:noname_diy_skill:2",
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
                      `相天：是否移去${get.translation(target)}武将牌上的一张“煋”？`,
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
                      // 自己/友军：防其受到伤害；敌人：限制其造成伤害
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
                  // 防伤持续到其下个回合开始（大雾式），类型由发动时选择
                  target.addTempSkill("相天2", { player: "phaseBeginStart" });
                  target.markAuto("相天2", [type]);
                },
                ai: {
                    notemp: true,
                },
                "skill_id": "相天",
                "_priority": 0,
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
                "skill_id": "相天2",
                "_priority": 0,
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
                        // 移至他人武将牌上的“煋”均为明置牌，所有角色可见牌面
                        const cards = player.getExpansions("七煋");
                        if (cards.length) {
                          dialog.addAuto(cards);
                        }
                      },
                },
                "skill_id": "七煋_mark",
                "_priority": 0,
            },
            "神机": {
                audio: "ext:noname_diy_skill:2",
                trigger: {
                    global: ["useCard", "respond"],
                },
                filter(event, player) {
                  const card = event.card;
                  // 仅限非虚拟非转化的非装备实体牌（避免转化/虚拟牌重复触发）
                  if (!card || !card.isCard) {
                    return false;
                  }
                  if (get.type2(card) == "equip") {
                    return false;
                  }
                  if (!event.cards || event.cards.length !== 1) {
                    return false;
                  }
                  // 每名角色的回合限一次
                  if (player.hasSkill("神机_used")) {
                    return false;
                  }
                  // 仅限当前回合角色于其回合内使用或打出（响应他人的牌不触发）
                  if (event.player != _status.currentPhase) {
                    return false;
                  }
                  const user = event.player;
                  if (!user || !user.isIn()) {
                    return false;
                  }
                  // 此牌与其武将牌上一张“煋”的花色相同
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
                  // 每名角色的回合限一次
                  player.addTempSkill("神机_used");
                  player.addMark("神机_used", 1, false);
                  await player.draw();
                  if (user == player) {
                    // 于此牌结算结束后，可以视为再次使用此牌
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
                      // chooseUseTarget 会自动套用此牌自身的目标规则：
                      // 单目标牌只能选1个、多目标牌按牌定义、全目标牌自动全选，
                      // 选择完毕后自动使用（不计入次数，也不会再次触发神机）
                      const vcard = get.autoViewAs({
                        name: card.name,
                        nature: card.nature,
                      });
                      await me.chooseUseTarget(vcard, true, false);
                    }, { player: player });
                  } else {
                    // 令此牌无效 + 获得其一张牌
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
                "skill_id": "神机",
                "_priority": 0,
            },
            "疑城": {
                audio: "ext:noname_diy_skill:2",
                trigger: {
                    global: "phaseBegin",
                },
                group: ["疑城_negate", "疑城_sha"],
                direct: true,
                filter() {
                    return true;
                },
                // ① 其他角色的回合开始时，你可以将至多X张牌置于武将牌上，称为“疑军”（X为你的“疑军”数且至少为1、至多为7）
                getX(player) {
                    return Math.min(7, Math.max(1, player.getExpansions("疑城").length));
                },
                async content(event, trigger, player) {
                    // 每名角色的回合开始时重置③的限次计数
                    player.storage.疑城_sha_count = 0;
                    // ① 仅“其他角色”的回合开始时发动
                    if (trigger.player == player) {
                        return;
                    }
                    if (!player.countCards("hej")) {
                        return;
                    }
                    const X = lib.skill.疑城.getX(player);
                    // 先问是否发动（避免 [0,X] 选牌时“确定”无意义的困惑）
                    const bool = await player
                        .chooseBool(`疑城：是否将至多${get.cnNumber(X)}张牌置于武将牌上，称为“疑军”？`)
                        .set("ai", () => {
                            const me = _status.event.player;
                            // 有可放置的废牌才发动（与后续选牌 AI 保持一致）
                            return me.hasCard(
                                (card) => lib.filter.cardDiscardable(card, me) && get.useful(card, me) < 6,
                                "hej"
                            )
                                ? 1
                                : 0;
                        })
                        .forResult();
                    if (!bool.bool) {
                        return;
                    }
                    const result = await player
                        .chooseCard(
                            "hej",
                            `疑城：将至多${get.cnNumber(X)}张牌置于武将牌上，称为“疑军”`,
                            (card) => lib.filter.cardDiscardable(card, player),
                            [1, X]
                        )
                        .set("ai", (card) => {
                            const me = _status.event.player;
                            return 6 - get.useful(card, me);
                        })
                        .forResult();
                    if (!result.bool || !result.cards || !result.cards.length) {
                        return;
                    }
                    player.logSkill("疑城");
                    const next = player.addToExpansion(result.cards, player, "giveAuto");
                    next.gaintag.add("疑城");
                    await next;
                    player.markSkill("疑城");
                    game.log(player, "将", result.cards, "置于武将牌上，称为“疑军”");
                },
                onremove(player, skill) {
                    const cards = player.getExpansions("疑城");
                    if (cards.length) {
                        player.loseToDiscardpile(cards);
                    }
                },
                intro: {
                    name: "疑军",
                    markcount: "expansion",
                    mark(dialog, storage, player) {
                        const cards = player.getExpansions("疑城");
                        if (cards.length) {
                            if (player.isUnderControl(true)) {
                                dialog.addAuto(cards);
                            } else {
                                return "共有" + get.cnNumber(cards.length) + "张“疑军”";
                            }
                        }
                    },
                },
                "skill_id": "疑城",
                "_priority": 0,
            },
            "疑城_negate": {
                audio: "疑城",
                sub: true,
                sourceSkill: "疑城",
                trigger: {
                    target: "useCardToTarget",
                },
                direct: true,
                // ② 当你成为其他角色使用牌的目标时，若你有“疑军”，你可以移去一张“疑军”并令此牌无效，然后摸X张牌（X为移去前的“疑军”数且至少为1、至多为7）
                filter(event, player) {
                    // 仅其他角色使用牌
                    if (event.player == player) {
                        return false;
                    }
                    return player.getExpansions("疑城").length > 0;
                },
                async content(event, trigger, player) {
                    const cards = player.getExpansions("疑城");
                    if (!cards.length) {
                        return;
                    }
                    // X = 移去前的“疑军”数（至少为1、至多为7），例：当前3张→移去1张后摸3张
                    const X = lib.skill.疑城.getX(player);
                    const result = await player
                        .chooseButton(
                            [
                                `疑城：是否移去一张“疑军”，令${get.translation(trigger.card)}对你无效，然后摸${get.cnNumber(X)}张牌？`,
                                [cards, "card"],
                            ]
                        )
                        .set("ai", (button) => {
                            const me = _status.event.player;
                            const trigger2 = _status.event.getTrigger();
                            if (!trigger2 || get.effect(me, trigger2.card, trigger2.player, me) >= 0) {
                                return 0;
                            }
                            return 4 - get.value(button.link, me);
                        })
                        .forResult();
                    if (!result.bool || !result.links || !result.links.length) {
                        return;
                    }
                    await player.loseToDiscardpile(result.links[0]);
                    // 令此牌对你无效
                    trigger.getParent().excluded.add(player);
                    game.log(player, "移去一张“疑军”，令", trigger.card, "对自己无效");
                    await player.draw(X);
                },
                "skill_id": "疑城_negate",
                "_priority": 0,
            },
            "疑城_sha": {
                audio: "疑城",
                sub: true,
                sourceSkill: "疑城",
                enable: ["chooseToUse", "chooseToRespond"],
                // ③ 每名角色的回合限3次，将一张“疑军”当做无视距离和次数限制的任意基本牌（杀/闪/桃/酒及火雷杀）使用或打出
                filter(event, player) {
                    if (!player.getExpansions("疑城").length) {
                        return false;
                    }
                    if ((player.storage.疑城_sha_count || 0) >= 3) {
                        return false;
                    }
                    return get.inpileVCardList((info) => {
                        if (info[0] != "basic") {
                            return false;
                        }
                        return event.filterCard(
                            get.autoViewAs({ name: info[2], nature: info[3], isCard: true, storage: { 疑城_basic: true } }, "unsure"),
                            player,
                            event
                        );
                    }).length > 0;
                },
                chooseButton: {
                    dialog(event, player) {
                        const dialog = ui.create.dialog("疑城：将一张“疑军”当做基本牌使用或打出", "hidden");
                        const types = get.inpileVCardList((info) => {
                            if (info[0] != "basic") {
                                return false;
                            }
                            return event.filterCard(
                                get.autoViewAs({ name: info[2], nature: info[3], isCard: true, storage: { 疑城_basic: true } }, "unsure"),
                                player,
                                event
                            );
                        });
                        if (types.length > 1) {
                            dialog._chooseButton = 2;
                            dialog.add([types, "vcard"]);
                        } else if (types.length == 1) {
                            dialog._cardName = types[0];
                        }
                        dialog.add(player.getExpansions("疑城"));
                        return dialog;
                    },
                    filter(button, player) {
                        const evt = _status.event.getParent();
                        const dialog = _status.event.dialog;
                        if (!dialog) {
                            return false;
                        }
                        // 单类型：直接选“疑军”
                        if (!dialog._chooseButton) {
                            const type = dialog._cardName;
                            if (!type || !type[2] || Array.isArray(button.link)) {
                                return false;
                            }
                            return evt.filterCard(
                                get.autoViewAs({ name: type[2], nature: type[3], isCard: true, storage: { 疑城_basic: true } }, [button.link]),
                                player,
                                evt
                            );
                        }
                        // 已选类型，接着只能选“疑军”
                        if (ui.selected.buttons.length) {
                            const first = ui.selected.buttons[0].link;
                            if (!Array.isArray(first) || Array.isArray(button.link)) {
                                return false;
                            }
                            const [ , , name, nature] = first;
                            return evt.filterCard(
                                get.autoViewAs({ name, nature, isCard: true, storage: { 疑城_basic: true } }, [button.link]),
                                player,
                                evt
                            );
                        }
                        // 未选任何按钮：只能选类型按钮
                        return Array.isArray(button.link);
                    },
                    select() {
                        return _status.event.dialog ? _status.event.dialog._chooseButton || 1 : 1;
                    },
                    check(button) {
                        if (_status.event.getParent().type != "phase") {
                            return 1;
                        }
                        const player = get.player();
                        if (Array.isArray(button.link)) {
                            const [ , , name, nature] = button.link;
                            return player.getUseValue({ name, nature, isCard: true });
                        }
                        // 疑军牌：按单类型模式下唯一可用的基本牌评估
                        const dialog = _status.event.dialog;
                        const type = dialog && dialog._cardName;
                        if (type && type[2]) {
                            return player.getUseValue({ name: type[2], nature: type[3], isCard: true });
                        }
                        return 1;
                    },
                    backup(links, player) {
                        let name, nature, card;
                        if (links.length == 2) {
                            name = links[0][2];
                            nature = links[0][3];
                            card = links[1];
                        } else {
                            card = links[0];
                            // 单类型模式：按事件过滤推断唯一可用的基本牌
                            const evt = _status.event;
                            const t = get.inpileVCardList((info) => {
                                if (info[0] != "basic") {
                                    return false;
                                }
                                return evt.filterCard(
                                    get.autoViewAs({ name: info[2], nature: info[3], isCard: true }, [card]),
                                    player,
                                    evt
                                );
                            })[0];
                            if (t) {
                                name = t[2];
                                nature = t[3];
                            } else {
                                name = "sha";
                            }
                        }
                        return {
                            audio: "疑城",
                            filterCard: (card2) => card2 == lib.skill.疑城_sha_backup.card,
                            selectCard: -1,
                            position: "x",
                            viewAs: { name, nature, storage: { 疑城_basic: true } },
                            card,
                            log: false,
                            async precontent(event, trigger, player2) {
                                // 不计入次数（不占用本回合使用次数）+ 每回合限次计数
                                event.getParent().addCount = false;
                                player2.storage.疑城_sha_count = (player2.storage.疑城_sha_count || 0) + 1;
                                player2.logSkill("疑城");
                            },
                        };
                    },
                    prompt(links, player) {
                        if (links.length == 2) {
                            return `将一张“疑军”当做${get.translation(links[0][3]) || ""}${get.translation(links[0][2])}使用或打出（无视距离和次数限制）`;
                        }
                        return "将一张“疑军”当做基本牌使用或打出（无视距离和次数限制）";
                    },
                },
                mod: {
                    // ③ 无视距离和次数限制（参考巡使）
                    targetInRange(card) {
                        if (card.storage && card.storage.疑城_basic) {
                            return true;
                        }
                    },
                    cardUsable(card) {
                        if (card.storage && card.storage.疑城_basic) {
                            return Infinity;
                        }
                    },
                },
                hiddenCard(player, name) {
                    if (!["sha", "shan", "tao", "jiu"].includes(name)) {
                        return false;
                    }
                    if ((player.storage.疑城_sha_count || 0) >= 3) {
                        return false;
                    }
                    return player.getExpansions("疑城").length > 0;
                },
                ai: {
                    respondSha: true,
                    respondShan: true,
                    save: true,
                    skillTagFilter(player, tag) {
                        if ((player.storage.疑城_sha_count || 0) >= 3) {
                            return false;
                        }
                        return player.getExpansions("疑城").length > 0;
                    },
                    order: 6,
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
                        "skill_id": "疑城_sha_backup",
                        sub: true,
                        sourceSkill: "疑城_sha",
                        "_priority": 0,
                    },
                },
                "skill_id": "疑城_sha",
                "_priority": 0,
            },
            "破军": {
                audio: "ext:noname_diy_skill:2",
                trigger: {
                    player: "useCard2",
                },
                direct: true,
                // 你于回合内使用【杀】时，可以移去任意张“疑军”，然后额外指定等量名目标，若如此做，此【杀】无法被响应且伤害+1
                // useCard2 只对“使用牌”触发（打出杀不会触发），加上回合限制即满足“回合内主动使用【杀】”
                filter(event, player) {
                    if (event.card?.name != "sha") {
                        return false;
                    }
                    if (_status.currentPhase != player) {
                        return false;
                    }
                    return player.getExpansions("疑城").length > 0;
                },
                async content(event, trigger, player) {
                    const stars = player.getExpansions("疑城");
                    if (!stars.length) {
                        return;
                    }
                    const currentTargets = trigger.targets.slice(0);
                    const availTargets = game.filterPlayer(
                        (t) => !currentTargets.includes(t) && lib.filter.targetEnabled2(trigger.card, player, t)
                    );
                    if (!availTargets.length) {
                        return;
                    }
                    const maxNum = Math.min(stars.length, availTargets.length);
                    const result = await player
                        .chooseButton(
                            [
                                `破军：移去任意张“疑军”，以额外指定等量名目标（此【杀】将无法被响应且伤害+1）`,
                                [stars, "card"],
                            ],
                            [0, maxNum]
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
                                        get.attitude(me, t) < 0
                                )
                            ) {
                                return 0;
                            }
                            return 4 - get.value(button.link, me);
                        })
                        .forResult();
                    if (!result.bool || !result.links || !result.links.length) {
                        return;
                    }
                    const num = result.links.length;
                    const result2 = await player
                        .chooseTarget(
                            `破军：额外指定${get.cnNumber(num)}名目标`,
                            (card, player2, target) =>
                                !currentTargets.includes(target) &&
                                lib.filter.targetEnabled2(trigger.card, player2, target),
                            [num, num]
                        )
                        .set("ai", (target) => {
                            const me = _status.event.player;
                            return -get.attitude(me, target) + Math.random();
                        })
                        .forResult();
                    if (!result2.bool || !result2.targets || !result2.targets.length) {
                        return;
                    }
                    await player.loseToDiscardpile(result.links);
                    player.logSkill("破军", result2.targets);
                    player.line(result2.targets, "fire");
                    trigger.targets.addArray(result2.targets);
                    // 此【杀】无法被响应（全部目标）且伤害+1
                    trigger.directHit.addArray(trigger.targets);
                    trigger.baseDamage++;
                    game.log(player, "发动【破军】，额外指定了", result2.targets, "，此【杀】无法被响应且伤害+1");
                },
                "skill_id": "破军",
                "_priority": 0,
            },
        },
        translate: {
            "夺魂": "夺魂",
            "夺魂_info": "①游戏开始或你的回合开始时，若你的体力上限大于1，你可以失去1点体力，然后增加1点体力上限。②一名角色死亡时，若你：1、体力上限大于1，你可以减少1点体力上限并获得一名其他角色的一个技能；2、拥有至少1个来源于其他角色的技能，你可以失去一个来源于其他角色的技能，然后摸体力上限张牌。若如此做，你令其回复体力至1点。③你的手牌上限始终等于体力上限。",
            "止涕": "止涕",
            "止涕_info": "一局游戏内每名角色限一次，当你对其他角色造成伤害时，若你拥有来源于其的技能，你可以选择一项：①废除其X个装备栏；②降低其X点体力上限（至多降为1）；③令其失去X个技能，直到其进入濒死状态。X为你拥有的来源于其的技能数。",
            "止涕_lock": "止涕",
            "归訫": "归訫",
            "归訫_info": "①每名角色的回合开始时，其可以将区域内的一张牌置于其武将牌上，称为“归訫”，然后你可以令其摸一张牌。②每当你失去或回复1点体力后，你可以依次选择任意名其他角色，若其：1、有“归訫”，你将其所有“归訫”移至你的武将牌上；2、没有“归訫”，你获得其区域内的一张牌。若如此做，你翻面。③你可以将武将牌上的一张“归訫”当做任意基本牌或非延时类锦囊牌使用或打出。",
            "归訫2": "归訫",
            "归訫2_info": "归訫-附属技能",
            "归訫_put": "归訫",
            "归訫_use": "归訫",
            "飛影": "飛影",
            "飛影_info": "锁定技。除你以外拥有“归訫”的角色与你计算距离+1；除你以外没有“归訫”的角色每回合使用的第一张以你为唯一目标的牌无效。",
            "归訫_use_info": "归訫-附属技能",
            "归訫_put_info": "归訫-附属技能",
            "七煋": "七煋",
            "七煋_info": "①游戏开始或回合开始时，你可以观看牌堆顶的七张牌并以任意顺序调整排列，然后将前X张牌（X为7-你的“煋”数）置于你的武将牌上，称为“煋”。②你的回合结束时，你可以将任意张“煋”移至等量名角色的武将牌上。",
            "相天": "相天",
            "相天_info": "一名角色的回合开始时，若其武将牌上有“煋”，你可以移去其一张“煋”，然后直到其下个回合开始前：1、其造成非雷电伤害时，防止之；2、其受到非雷电伤害时，防止之。",
            "神机": "神机",
            "神机_info": "每名角色的回合限一次，一名角色于回合内使用或打出非虚拟非转化的非装备牌时，若此牌与其武将牌上一张“煋”的花色相同，你可以摸一张牌，然后若该角色：①不为你，你令此牌无效并获得其一张牌；②为你，你可以于此牌结算结束后视为再次使用此牌。",
            "相天2": "相天",
            "神机_used": "神机",
            "七煋_mark": "煋",
            "疑城": "疑城",
            "疑城_info": "①其他角色的回合开始时，你可以将至多X张牌（X为你的“疑军”数且至少为1、至多为7）置于武将牌上，称为“疑军”。②当你成为其他角色使用牌的目标时，若你有“疑军”，你可以移去一张“疑军”并令此牌无效，然后你摸X张牌（X为移去前的“疑军”数且至少为1、至多为7）。③每名角色的回合限3次，你可以将一张“疑军”当做无视距离和次数限制的任意基本牌（包括【杀】、【闪】、【桃】、【酒】及火【杀】、雷【杀】）使用或打出。",
            "疑城_negate": "疑城",
            "疑城_sha": "疑城",
            "破军": "破军",
            "破军_info": "你于回合内使用【杀】时，你可以移去任意张“疑军”，然后额外指定等量名目标，若如此做，此【杀】无法被响应且伤害+1。",
        },
    },
    intro: "",
    author: "Ryno-Gwo",
    diskURL: "",
    forumURL: "",
    version: "1.1",
},files:{"character":["神诸葛.jpg","神曹操.jpg","神张辽.jpg","神徐盛.png"],"card":[],"skill":[],"audio":[]}} 
};