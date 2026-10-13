import { lib, game, ui, get, ai, _status } from "noname";
import characters from "./character.js";
import skills from "./skill.js";
import translates from "./translate.js";

// 恣胜②"无点数牌的点数始终视为3"：不走技能的 mod.cardnumber——game.checkMod 的覆盖守卫
// `typeof arg[last] != "object"` 对 null 基数恒为 true（typeof null === "object"，引擎缺陷，
// 踩坑#60 修正记录），无点数牌（基数为 null）的 mod 返回值必被丢弃。
// 故对 get.number 打外层补丁：无点数牌（返回 null）且牌主拥有恣胜时返回 3；
// filter/content 及任意查询方的 get.number(card, player) 自动跟随。
// ⚠️ "unsure" 在原函数内提前返回、不经补丁（面朝下/信息隐藏场景维持未知点数）；
// ⚠️ 多张牌的数组（get.number([c1,c2])）基数也为 null，但 get.owner(数组) 为空、
// 且补丁只在显式传入 player 或牌有归属时生效——丈八转化杀等经 useCard 事件读点数时
// 都会显式传 player，可正常视为 3
const rawGetNumber = get.number;
if (!rawGetNumber._nonameDiyPatched) {
	const patchedGetNumber = function (card, player) {
		const num = rawGetNumber.apply(get, arguments);
		if (num === null && card && typeof card == "object") {
			const owner = player === false ? false : player || get.owner(card);
			if (owner && owner.hasSkill && owner.hasSkill("恣胜")) {
				return 3;
			}
		}
		return num;
	};
	patchedGetNumber._nonameDiyPatched = true;
	get.number = patchedGetNumber;
}

export const type = "extension";
export default function () {
	return {
		name: "noname_diy",
		editable: true,
		connect: false,
		arenaReady: function () {},
		content: function (config, pack) {},
		prepare: function () {},
		precontent: function (config) {},
		help: {},
		config: {},
		package: {
			character: {
				character: { ...characters },
				translate: { ...translates },
			},
			card: {
				card: {},
				translate: {},
				list: [],
			},
			skill: {
				skill: { ...skills },
				translate: { ...translates },
			},
			intro: "",
			author: "Ryno-Gwo",
			diskURL: "",
			forumURL: "",
			version: "1.0",
		},
		files: {
			character: ["神诸葛.jpg", "神曹操.jpg", "神张辽.jpg", "神徐盛.png", "神司马.jpg"],
			card: [],
			skill: [],
			audio: [],
		},
	};
}
