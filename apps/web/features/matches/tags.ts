/** Cache tags for match data (shared by queries, actions and the event route). */
export const matchTags = {
	/** Match lists (home page, /matches, team pages). */
	list: "matches",
	one: (id: string) => `match:${id}`,
};
