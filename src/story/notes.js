// Everything there is to read: the boat log at the jetty, the walkers' register at the
// signpost, J.'s hut book. A line or two each. People are only ever initials.
// hands: hand1 J.'s pencil; hand2, hand3 other people's

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
				{ text: '9.10. Boarded the trough. Covered the window.', hand: 'hand1' },
				{ text: 'It stands where I stand now.', hand: 'hand1', scrawl: true },
				{ text: 'Going down to the boat.', hand: 'hand1', scrawl: true },
			],
		} ],
	},

};
