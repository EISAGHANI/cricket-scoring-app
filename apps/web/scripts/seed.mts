/**
 * Demo data for Phase 2 (brief §10, the parts that exist so far): one league, two clubs, eight
 * teams with 15 players each, and a user for every role. Runs through the real services so roles,
 * squads and audit entries are exactly what the app would create.
 *
 *   pnpm --filter @cricket/web db:seed            # refuses if data exists
 *   pnpm --filter @cricket/web db:seed --reset    # empties the database first (local only)
 *
 * Sign in as any seeded user with an email code; codes arrive in Mailpit (http://localhost:8025).
 */
import { schema, createDb, type Database } from "@cricket/db";
import { resetDatabase } from "@cricket/db/testing";
import type { Subject } from "@cricket/authz";
import { eq } from "drizzle-orm";
import { createClub } from "@/features/clubs/service";
import { createOrganization } from "@/features/organizations/service";
import { addSquadPlayer, createOwnProfile, setSquadRole } from "@/features/players/service";
import { createTeam } from "@/features/teams/service";
import { createVenue } from "@/features/venues/service";
import type { ServiceContext } from "@/lib/services/context";

const url = process.env.DATABASE_URL;
const reset = process.argv.includes("--reset");
const force = process.argv.includes("--force");
if (url === undefined) throw new Error("DATABASE_URL is required");
if (!force && !/@(localhost|127\.0\.0\.1|postgres)(:\d+)?\//.test(url)) {
	throw new Error("Refusing to seed a non-local database (pass --force if you really mean it)");
}

const FIRST = [
	"Aarav",
	"Ben",
	"Chloe",
	"Dev",
	"Ella",
	"Farhan",
	"Grace",
	"Hamza",
	"Isla",
	"Jack",
	"Kiran",
	"Leah",
	"Mohsin",
	"Nia",
	"Omar",
	"Priya",
	"Quinn",
	"Rohan",
	"Sana",
	"Theo",
	"Usman",
	"Vik",
	"Will",
	"Yasmin",
	"Zain",
];
const LAST = [
	"Ahmed",
	"Bell",
	"Chaudhry",
	"Dawson",
	"Edwards",
	"Farooq",
	"Green",
	"Hussain",
	"Iqbal",
	"Jones",
	"Khan",
	"Lewis",
	"Malik",
	"Nair",
	"Owen",
	"Patel",
	"Qureshi",
	"Rahman",
	"Shah",
	"Taylor",
	"Usmani",
	"Verma",
	"Walsh",
	"Young",
];

/** Deterministic pseudo-random (so the demo is the same on every machine). */
let state = 20261102;
const rand = (): number => (
	(state = (state * 1103515245 + 12345) % 2147483648),
	state / 2147483648
);
const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
const used = new Set<string>();
function playerName(): string {
	for (;;) {
		const name = `${pick(FIRST)} ${pick(LAST)}`;
		if (!used.has(name)) {
			used.add(name);
			return name;
		}
	}
}

async function user(db: Database, email: string, name: string): Promise<string> {
	const [u] = await db
		.insert(schema.users)
		.values({ email, name, emailVerified: true })
		.returning({ id: schema.users.id });
	return u!.id;
}

async function ctxFor(db: Database, userId: string): Promise<ServiceContext> {
	const roles = await db
		.select({
			role: schema.roleAssignments.role,
			scopeType: schema.roleAssignments.scopeType,
			scopeId: schema.roleAssignments.scopeId,
		})
		.from(schema.roleAssignments)
		.where(eq(schema.roleAssignments.userId, userId));
	const subject: Subject = { userId, roles };
	return { db, subject, ip: "seed" };
}

const ROLES = ["BATTER", "BOWLER", "ALL_ROUNDER", "WICKET_KEEPER"] as const;
const BOWLING = [
	"RIGHT_ARM_FAST",
	"RIGHT_ARM_MEDIUM",
	"RIGHT_ARM_OFF_BREAK",
	"RIGHT_ARM_LEG_BREAK",
	"LEFT_ARM_ORTHODOX",
	"LEFT_ARM_MEDIUM_FAST",
] as const;

async function main(): Promise<void> {
	const { db, close } = createDb(url!, { max: 2 });
	try {
		const [existing] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
		if (existing !== undefined && !reset)
			throw new Error("The database already has data. Re-run with --reset to start over.");
		if (reset) await resetDatabase(db);

		const admin = await user(db, "admin@cricket.local", "Platform Admin");
		await db
			.insert(schema.roleAssignments)
			.values({ userId: admin, role: "SUPER_ADMIN", scopeType: "PLATFORM", scopeId: null });

		const leagueAdmin = await user(db, "league@cricket.local", "League Admin");
		const org = await createOrganization(await ctxFor(db, leagueAdmin), {
			name: "Metro Cricket League",
			slug: "metro",
		});
		await createVenue(await ctxFor(db, leagueAdmin), {
			name: "Metro Oval",
			city: "Metro City",
			organizationId: org.id,
		});
		await createVenue(await ctxFor(db, leagueAdmin), {
			name: "Riverside Park",
			city: "Metro City",
		});

		const clubs = [
			{
				name: "Riverside Cricket Club",
				short: "RCC",
				teams: ["First XI", "Second XI", "Women's XI", "Under-15s"],
			},
			{
				name: "Northgate Cricket Club",
				short: "NCC",
				teams: ["First XI", "Second XI", "Sunday XI", "Veterans"],
			},
		];
		let managerN = 0;
		for (const [ci, c] of clubs.entries()) {
			const clubAdmin = await user(
				db,
				`club${ci + 1}@cricket.local`,
				`${c.name.split(" ")[0]} Club Admin`,
			);
			const club = await createClub(await ctxFor(db, clubAdmin), { name: c.name });
			for (const [ti, teamName] of c.teams.entries()) {
				const team = await createTeam(await ctxFor(db, clubAdmin), {
					name: `${c.name.split(" ")[0]} ${teamName}`,
					shortName: `${c.short}${ti + 1}`,
					clubId: club.id,
					category: teamName.includes("Women")
						? "WOMEN"
						: teamName.includes("Under")
							? "JUNIOR"
							: teamName.includes("Veterans")
								? "VETERANS"
								: "SENIOR",
				});
				// A manager per team (club admins can grant this later through the UI too).
				const manager = await user(db, `manager${++managerN}@cricket.local`, `Manager ${managerN}`);
				await db
					.insert(schema.roleAssignments)
					.values({
						userId: manager,
						role: "TEAM_MANAGER",
						scopeType: "TEAM",
						scopeId: team.id,
						grantedBy: clubAdmin,
					});
				const managerCtx = await ctxFor(db, manager);

				// The captain has an account and owns their profile.
				const captainName = playerName();
				const captain = await user(db, `captain${managerN}@cricket.local`, captainName);
				const own = await createOwnProfile(await ctxFor(db, captain), {
					displayName: captainName,
					role: pick(ROLES),
					battingHand: rand() < 0.8 ? "RIGHT" : "LEFT",
				});
				await addSquadPlayer(managerCtx, team.id, { playerId: own.id, squadRole: "CAPTAIN" });

				// 14 more players, unclaimed (claimable through the app).
				const junior = teamName.includes("Under");
				for (let i = 0; i < 14; i++) {
					const { playerId } = await addSquadPlayer(managerCtx, team.id, {
						displayName: playerName(),
						squadRole: i === 0 ? "VICE_CAPTAIN" : i === 1 ? "WICKET_KEEPER" : "PLAYER",
					});
					await db
						.update(schema.players)
						.set({
							role: i === 1 ? "WICKET_KEEPER" : pick(ROLES),
							battingHand: rand() < 0.75 ? "RIGHT" : "LEFT",
							bowlingStyle: rand() < 0.7 ? pick(BOWLING) : null,
							// Juniors are minors; two have guardian consent for a public profile.
							dateOfBirth: junior ? `201${2 + (i % 3)}-0${1 + (i % 9)}-15` : null,
							guardianConsent: junior && i < 2,
						})
						.where(eq(schema.players.id, playerId));
				}
				if (ti === 0) await setSquadRole(managerCtx, team.id, own.id, { squadRole: "CAPTAIN" });
			}
		}
		const count = async (t: typeof schema.players | typeof schema.teams | typeof schema.users) =>
			(await db.select({ id: t.id }).from(t)).length;
		console.log(
			`Seeded: 1 league, ${clubs.length} clubs, ${await count(schema.teams)} teams, ${await count(schema.players)} players, ${await count(schema.users)} users.`,
		);
		console.log(
			"Sign in as admin@cricket.local, league@cricket.local, club1@cricket.local, manager1@cricket.local or captain1@cricket.local (codes in Mailpit).",
		);
	} finally {
		await close();
	}
}

await main();
