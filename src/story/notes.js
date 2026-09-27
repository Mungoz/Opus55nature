// Everything there is to read: the boat log at the jetty, the walkers' register at the
// signpost, J.'s hut book; and in the Black Wood (HORROR_PLAN 16.4) the plaque at the plunge
// pool, the card at the shrine, the MISSING poster, the forestry notice, the hunter's log, the
// forester's diary, the hiker's notebook, the note on the boathouse door, and J.'s last.
// A line or two each. People are only ever initials.
// hands: hand1 J.'s pencil; hand2, hand3, hand4 other people's; print: typed or printed;
// carved: cut in brass or stone

export const READS = {

	boatlog: {
		title: 'Boats · Alp Larchmere',
		pages: [ {
			head: 'Boats · who takes them · when back',
			entries: [
				{ text: '14.9.  large boat.  the K.s and children.  back 17.40', hand: 'hand3' },
				{ text: '28.9.  large boat.  M.B. for the cattle.  back same day', hand: 'hand2' },
				{ text: '2.10.  both boats in.  season over.', hand: 'hand3' },
				{ text: '4.10.  J. took the other boat. Up to close the hut and find the red cow. Back Sunday.', hand: 'hand1' },
			],
		} ],
	},

	register: {
		title: 'Walkers’ register',
		pages: [ {
			head: 'Please write your name · the date · where you are going',
			entries: [
				{ text: '19 Sept. Up from the lake in 1h40. Marmots everywhere! R. & T. (Thun)', hand: 'hand2' },
				{ text: '1 Oct. Cold. Hut shut. Gate left open, I closed it. A.', hand: 'hand3' },
				{ text: '8 Oct. Heard a cowbell up by the falls. Thought the cows were all down?  E.', hand: 'hand3' },
				{ text: '12 Oct. The herder was at the tarn. Called to him. He didn’t turn round.', hand: 'hand2' },
				{ text: '17 Oct. turned back', hand: 'hand3', faint: true },
			],
		} ],
	},

	hutbook: {
		title: 'Hut book',
		pages: [ {
			head: 'Hut book · Alp Larchmere · 1994–',
			entries: [
				{ text: '4.10. Up. No sign of the red cow. Heard her bell above the falls. Went. Nothing.', hand: 'hand1' },
				{ text: '5.10. Bell again, in the night, from the lake side. She can’t be there, the fence is whole.', hand: 'hand1' },
				{ text: '7.10. Someone at the far side of the tarn this morning. Waved. Didn’t wave back. Not on the shore. In it.', hand: 'hand1' },
			],
		}, {
			head: '',
			entries: [
				{ text: '8.10. Chained the top gate. Nothing comes down from the tarn now. Key on the table.', hand: 'hand1' },
				{ text: '9.10. Boarded the trough. Covered the window.', hand: 'hand1' },
				{ text: 'It stands where I stand now.', hand: 'hand1', scrawl: true },
				{ text: 'Going down to the boat.', hand: 'hand1', scrawl: true },
			],
		} ],
	},

	plaque: {
		title: 'A plaque on the rock',
		pages: [ {
			head: '',
			entries: [
				{ text: 'Here in the pool below the falls, on 14 August 1961, A. M. was drowned, aged nine.', hand: 'carved' },
				{ text: 'She was looking at the water.', hand: 'carved' },
				{ text: 'Pray for her.', hand: 'carved' },
			],
		} ],
	},

	shrine: {
		title: 'A card at the shrine',
		pages: [ {
			head: '',
			entries: [
				{ text: 'Holy Mother, keep him out of the water.', hand: 'hand4' },
				{ text: 'The children ask every night. J., come down before the snow.', hand: 'hand4' },
				{ text: 'Bring him home.  — M.', hand: 'hand4' },
			],
		} ],
	},

	missing: {
		title: 'MISSING',
		pages: [ {
			head: 'Police post, Larchmere · 16 October 1994',
			entries: [
				{ text: 'MISSING', hand: 'print' },
				{ text: 'J. B., 58, herder, of Alp Larchmere. Last seen 9 October at the alp hut above the lake.', hand: 'print' },
				{ text: 'Long dark wool coat, grey felt hat, a stick.', hand: 'print' },
				{ text: 'Anyone who has seen him is asked to tell the police post in the village, or any forestry worker.', hand: 'print' },
				{ text: 'he’s at the pond', hand: 'hand3', faint: true },
			],
		} ],
	},

	notice: {
		title: 'Forestry notice',
		pages: [ {
			head: 'Forest district Larchmere',
			entries: [
				{ text: 'TIMBER FELLING — 26 SEPT. TO 31 OCT.', hand: 'print' },
				{ text: 'Keep to the marked path. Do not climb on the log stacks.', hand: 'print' },
				{ text: 'The footbridge over the gully is closed: its rotten deck boards have been taken up. New planks are stacked here in the clearing for the carpenter.', hand: 'print' },
				{ text: 'Work stopped 10.10. Nobody up here till further notice.  F.', hand: 'hand2' },
			],
		} ],
	},

	hunterlog: {
		title: 'Hunter’s log',
		pages: [ {
			head: 'Stand 3 · the glade · 1994',
			entries: [
				{ text: '1.10.  2 hinds, 1 calf at the far end of the glade, 18.40. Let them go.', hand: 'hand2' },
				{ text: '4.10.  Nothing. Deer won’t come into the glade. Stood at the edge all evening, looking at the pond way.', hand: 'hand2' },
				{ text: '6.10.  J. at the black pond at dusk. Called to him. He didn’t turn.', hand: 'hand2' },
			],
		}, {
			head: '',
			entries: [
				{ text: '8.10.  J. again. Not on the bank. In the water, standing in it, up to nothing. Through the glasses you could see him in the pond and not on the bank above it.', hand: 'hand2' },
				{ text: '9.10.  Leaving the shed key here. I’m not going back to the lodge after dark.', hand: 'hand2' },
			],
		} ],
	},

	forester: {
		title: 'Forester’s diary',
		pages: [ {
			head: 'Diary · forest lodge · October 1994',
			entries: [
				{ text: '3.10.  Brought the boat oars up from the boathouse to mend. Two blades split.', hand: 'hand3' },
				{ text: '7.10.  Oars done. In the shed. Somebody needs to take them down.', hand: 'hand3' },
				{ text: '9.10.  The radio. Under the static, a voice, very slow, reading out places. The hut. The tarn. The pond. The glade. This lodge.', hand: 'hand3' },
			],
		}, {
			head: '',
			entries: [
				{ text: '10.10.  Stopped the felling. Sent the men down. Locked the shed.', hand: 'hand3' },
				{ text: '11.10.  Last night it was in the rain barrel by the door. In the water, looking up at me. I have put the lid on.', hand: 'hand3' },
				{ text: 'The key is up at the stand with H.', hand: 'hand3', faint: true },
			],
		} ],
	},

	map: {
		title: 'The map on the wall',
		pages: [ { head: 'Forest district Larchmere · felling 1994', image: null, entries: [] } ],
	},

	photo: {
		title: 'The camera',
		pages: [ { head: 'The last photograph on the film', image: null, entries: [] } ],
	},

	notebook: {
		title: 'A damp notebook',
		pages: [ {
			head: '',
			entries: [
				{ text: 'Day 1. Camped past the charcoal burners’ place. Nobody burning, but the kiln’s warm.', hand: 'hand4' },
				{ text: 'Day 2. Someone walked round the tent in the night. Boots. Then stood still, a long time, right by my head.', hand: 'hand4' },
				{ text: 'Day 3. Photos at the black pond this morning. There’s a man standing in the water in them. There wasn’t when I took them.', hand: 'hand4' },
			],
		}, {
			head: '',
			entries: [
				{ text: 'Day 4. Tent’s broken. Going for the boat.', hand: 'hand4', scrawl: true },
				{ text: 'don’t look at the lake', hand: 'hand4', scrawl: true, faint: true },
			],
		} ],
	},

	boathouse: {
		title: 'A note on the boathouse door',
		pages: [ {
			head: '',
			entries: [
				{ text: 'The oars are up at the forest lodge being mended.  F.', hand: 'hand3' },
			],
		} ],
	},

	jlast: {
		title: 'J.’s last page',
		pages: [ {
			head: '',
			entries: [
				{ text: 'If you are reading this it has let you come this far.', hand: 'hand1' },
				{ text: 'It is the one standing where you stand. Row, and don’t look over the side.', hand: 'hand1', scrawl: true },
				{ text: '— J.', hand: 'hand1' },
			],
		} ],
	},

};
