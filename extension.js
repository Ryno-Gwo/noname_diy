import { lib, game, ui, get, ai, _status } from "noname";
import characters from "./character.js";
import skills from "./skill.js";
import translates from "./translate.js";

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
			character: ["神诸葛.jpg", "神曹操.jpg", "神张辽.jpg", "神徐盛.png"],
			card: [],
			skill: [],
			audio: [],
		},
	};
}
