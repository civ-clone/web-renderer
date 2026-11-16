# Civilization II in civ.one: what the rules don't do yet

This is the first playable Civilization II (M2a): Civ2's units, advances, governments, improvements, wonders and tribes on the shared rules, drawn on the isometric grid with the art you import yourself. It is a **preview**. Many Civ2 behaviours are not modelled yet, and a few differ on purpose. This page lists them, for players who know Civ2 and for developers picking up the next phase.

Each entry says what differs, which package owns it (all `civ-clone/civ2-*` unless noted), and whether it is **planned** (a later phase, M2b to M2f, see the roadmap in #1007) or **by design**. "Not scheduled" means it is wanted but has no phase yet.

Where the numbers are Civ2's, they come from a hand-written table checked against your own copy of the game (`CIV2_PATH`); no game text or art is in the repository. The Civilopedia is empty for Civ2 classes.

## Saves

Civ2 saves record that they belong to the `civ2` set and load as civ2, but **they will break across M2b to M2f**: rules and saved data will change between phases, and there is no promise that a save from one phase loads in the next. Treat Civ2 games as disposable until the set leaves preview. Civ1 saves are unaffected.

## Map

- **Interim world.** The map comes from the shared generator with Glacier at the poles and a simple downhill river walk afterwards, not Civ2's own generator. Start positions are simple, plus Civ2's start balancing (extra Settlers or advances for poor starts). Only staggered-iso grids are offered. (civ2-world, civ2-player.) Planned: Civ2's own generator (M2f).
- **Rivers** give +1 trade, a source of water for irrigation and a river-side site bonus, but Civ2's river movement and display rules are approximated. (civ2-world.) Not scheduled.
- **No commodities.** (civ2-world.) Planned (M2d, with trade routes).
- **Farmland** (M2c) can be built with Refrigeration on an irrigated square that isn't a city's, and gives +50% food with a Supermarket in the city; the city's own square counts as Farmland. (civ2-world, civ2-unit, civ2-city-improvement.)
- **What a square yields its city** follows Civ2's order since M2c: the square itself, then the Harbour, Offshore Platform, Colossus, Supermarket, the city square's mine and minimum shield, King Richard's, the railroad, the government's penalty and trade bonus (no penalty while celebrating), Superhighways, then pollution. The map, the square tooltip and the city screen show what a square yields the city on it or working it; any other square shows its own yields. (civ2-city, civ2-city-improvement, civ2-wonder, web-renderer.)

## Units and combat

M2b (#1007) brought Civ2's combat and units: hit points and firepower, damage that lasts until a unit heals, veterans after a win, fuel, Paradrop, Airlift, Transform, fortresses and airbases, and pillaging a chosen improvement.

- **In place:** Civ2's rounds of combat, with each unit's hit points and firepower, and the firepower changes for ships, submarines and helicopters; healing and the slower moves of a damaged unit; a winner's chance to become a veteran (always, with Sun Tzu's War Academy); fuel for aircraft, which crash at the end of their range; Paradrop (within 10 squares, from a city or an airbase), Airlift (between two cities with an Airport, once a city a turn) and Sabotage Unit; SDI Defense stopping nuclear attacks within 3 squares; Triremes that are never lost with the Lighthouse; and the combat handicaps by difficulty level, which a game can switch off. (civ2-unit, civ2-wonder, civ2-city-improvement, civ2-difficulty.)
- **Generic unit names.** Units that Civ1 also has use its names (Spearman, not Civ2's); Civ2's own names will come with a later import. (base-unit-\* packages.) Planned.
- **No barbarians.** Nothing raises them, so a hut that would release a horde gives mercenaries instead, and the Great Wall's effect on them is absent. Civ2's own odds for battles with barbarians aren't in either. (civ2-goody-hut, civ2-wonder, civ2-unit.) Planned (M2e).
- **Zones of control** and the Civ2 move and defence rows are in; City Walls and the Great Wall triple land defence as Civ2 does. (civ2-unit.)
- **No Senate rows.** Under the Republic and Democracy nothing stops you declaring war or breaking a treaty. (civ2-unit, civ2-diplomacy.) Planned (M2d).
- **No incite, bribe or trade routes.** Inciting a city, bribing a unit and setting up a trade route are not offered. A Diplomat or Spy can establish an embassy and investigate a city, and a Spy's only mission against a unit is Sabotage Unit. (civ2-unit, civ2-city.) Planned (M2d).
- **No ×2 sneak attack.** Civ2 doubles an attack that breaks a treaty; here it fights at its normal strength. (civ2-unit.) Not scheduled.
- **No instant heal in an allied city.** A unit heals by Civ2's steps wherever it is, but moving into an ally's city doesn't heal it at once. (civ2-unit.) Not scheduled.
- **Computer players' aircraft** don't lose the extra turn of fuel Civ2 takes from a computer player's attacker after a win. (civ2-unit.) Not scheduled.
- **An Airbase is only an airbase.** It refuels and heals aircraft, keeps a stack from dying with its defender, and launches paradrops. Civ2's code also treats it like a city for the square's yields, road and railroad moves and a fortress order; that looks accidental, and isn't followed. (civ2-unit, civ2-world.) By design.
- **Carriers and Submarines hold 8.** Civ2's code lets a carrier or a submarine hold 20 and doesn't check it on landing, and its unit table gives neither a hold; here both hold 8, Civ1's number. (civ2-unit.) By design.
- **Airlifts always fly.** An airlift near enemy fighters can be shot down, as in Civ2, but Civ2 asks you to confirm a risky one first. (civ2-unit.) Not scheduled.
- **No work pooling.** Engineers work at twice the rate, but several workers on one square don't add their work together as in Civ2 (#1059). (civ2-unit.) Planned.
- **No odds display.** Civ2 doesn't show the odds of a battle, and neither does civ.one yet. (web-renderer.) By design for now.
- **Where Civ2's code and its description differ, the code is followed:** a city loses a citizen when its defender loses unless the attacker fought from the sea, which the code judges by the attacker's square, not the city's; and the difficulty handicaps apply to any attacker that isn't a barbarian. (civ2-unit, civ2-difficulty.) By design.
- **Leonardo's Workshop** (M2c) upgrades every unit that has an upgrade at once, on each advance, when it is completed and when its city is captured, as Civ2's code does. An upgraded unit stops being a veteran, and a unit "upgraded" to its own type does too, as in the code. A capture's upgrade pass isn't saved: a game saved while the captor chooses loses it. Not for a city given in a treaty, which can't happen yet. Communism's veteran Diplomats and Spies are in. (civ2-wonder, civ2-unit, base-unit-upgrade.)

## Cities

M2c (#1007) brought Civ2's cities: shield waste and the capital link, Entertainers only below size 5, plunder, Partisans, rehoming, Farmland, Capitalization, the change penalty, Auto build, the computer players' late food and shield rows, rapture growth, angry citizens and the stages of happiness.

- **Waste and corruption:** trade corruption and shield waste by Civ2's distance, with the capital link walked as Civ2 walks it (one shortest land route of roads or railroads). There are no alliances yet, so every other player's city or unit blocks the link. Land masses are the world's as built (Civ2 recounts them when terrain changes). (civ2-city.) Partly planned (M2d, alliances).
- **The change penalty:** half the shields go when a person changes between units, improvements and Wonders, and the build list says how many before you choose. Capitalization counts as a Wonder, as in Civ2's code, so changing between the two costs nothing. Changing back in the same turn gives the shields back. A computer player loses half only on a change to a Wonder. Not on Chieftain. (civ2-city, civ2-difficulty.)
- **Carry-over:** computer players keep the shields left over after a build; a person's box empties. That is Civ2's code (and Civ1 v474's), not the manual. (civ2-city.) By design.
- **Capture:** plunder, rehoming of the loser's units, Partisans and the Palace escape (now offered to a person too, who is asked) are in. Not yet: civil war, a person's captured city starting in disorder under a Republic or a Democracy, the captor's new build, and the size-1 city a computer player may keep whole. Reputation and vendettas aren't kept, so Partisans are never veterans. Power ranks are taken as the capture starts, not at the start of the turn. The Palace escape counts the loser's cities and the city's size after the capture, and measures by the world's own distance, so it can be one off at its thresholds. (civ2-city, civ2-city-improvement.) Planned.
- **Auto build:** only improvements are scored. Civ2's unit and Wonder scores aren't ported, so "units only" finds nothing and keeps the build, and Wonders rank by civ2-wonder's own priority. Civ2's "nothing over 500 leaves Auto" can't happen in Civ2's own code either, so it isn't followed. (civ2-city.) Planned.
- **Famine** disbands the settlers even in a computer player's unseen city, and there are no food caravans. (civ2-city.) Not scheduled.
- **City numbers:** a destroyed city's slot is not reused, so empire-size effects can differ once a city is gone. (civ2-city-happiness.) By design for now.
- **Size:** Civ2's city size wraps past 127; that isn't modelled, and rapture growth has no 127 cap. (civ2-city, civ2-city-happiness.) By design.
- **Where the code and the plan differed, the code is followed:** Superhighways add to a square after the government's penalty and trade bonus; Colossus adds to ocean squares always and to land squares only with trade; King Richard's adds a shield to every square, ocean too; the city square counts as mined only where its terrain has no irrigation bonus (Glacier); the Courthouse's halving of waste is inside the formula, before the capital link, which affects shield waste only. (civ2-city, civ2-city-improvement, civ2-wonder.) By design.

## Happiness

- **In place:** Civ2's stages, each clamped before the next (the base, luxuries, buildings, martial law or units, Wonders), with angry citizens, who count among the unhappy for disorder. The city screen and the Happiness report show the stages. Rapture growth in a celebrating Republic or Democracy city, and a Nuclear Plant's meltdown in disorder without Fusion Power. Also the content base by level, empire size, martial law, military unhappiness, luxuries, disorder (a Democracy falls into Anarchy), and celebration. (civ2-city-happiness, civ2-city-improvement.)
- **Palace floor:** the content limit's floor of 2 with a Palace never changes the outcome at Civ2's own numbers, so it isn't modelled. (civ2-city-happiness.) By design.
- **Angry faces** need Civ2's PEOPLE.GIF: until it is imported, an angry citizen is drawn as Civ1's unhappy face, reddened. (web-renderer.)

## Science

- **Research cost** is Civ2's, but compares with the person who knows the most advances, not Civ2's rank-based reference player. With no person playing it uses 0. (civ2-science.) Not scheduled.
- **Advances from the start balancing** count towards the cost, which Civ2 does not do. (civ2-science, civ2-player.) Not scheduled.
- **Disorder** still stops a city's research, as in Civ1. (civ2-science.) By design for now.
- **Not yet:** Fundamentalism's science cap and loss, the Great Library's and Philosophy's rules in full, the Chieftain and space-race adjustments, and the AI's unit, tribe and city terms when valuing an advance. Plumbing is registered but unreachable. (civ2-science.) Planned.

## Governments

- **No maximum rate.** Every government allows any tax, luxury and science split. Civ2 caps them (60% to 100%). (civ2-trade-rate.) Planned (M2d).
- **Fundamentalism is only partly there:** it has its unit support and no unhappy citizens, but the tithes, science penalty and the rest of its rules are only partly in, and Fanatics are not restricted to it. (civ2-government, civ2-city-improvement.) Planned.
- **Revolutions:** a chosen revolution's Anarchy lasts 1 to 4 turns, to the next turn that is a multiple of 4; a Democracy that falls in civil disorder waits 4 turns more (5 to 8). Not yet: changing back without Anarchy in the turn you chose, the revolution offer on discovering a government's advance, and leader titles. (civ2-government.) Planned.
- **Senate:** none, see Units and Diplomacy. Planned (M2d).

## Improvements and wonders

- **In place:** 34 improvements and 28 wonders with Civ2's costs, upkeep and requirements, the Palace rules, veterans, defences, pollution, and Civ2's growth caps.
- **Capitalization** (M2c) turns a city's shields into gold each turn, after its units' support and waste, and its box is frozen while it does; none under Anarchy or in disorder. The build list shows its gold per turn. (civ2-city, civ2-city-improvement.)
- **No spaceship parts.** (civ2-city-improvement.) Planned (M2e).
- **Wonders with no effect yet:** Marco Polo's Embassy, the Eiffel Tower, the United Nations, the Great Wall's diplomatic effect, the Manhattan Project's reputation cost, the Apollo Program's spaceship parts. (civ2-wonder.) Planned (M2d, M2e).
- **The Apollo Program** shows every player the whole map. The interface still names a civilization once one of its cities has been seen, so after the reveal every civilization is named in notices and reports, where Civ2 makes no contact. (web-renderer.) Planned: it needs a record of first contact in the engine.
- **Darwin's Voyage's second advance** waits for the player's next choice of research. (civ2-wonder.) Not scheduled.
- **Harbour, Offshore Platform, Superhighways and the Supermarket** apply to each square, in Civ2's order (see Map). The Airport's and Superhighways' trade route parts wait for trade routes. (civ2-city-improvement.) Planned (M2d).
- **Treasury:** a bankruptcy sale leaves a few gold less than Civ2, a purchase is not offered once the box is already covered, and there is no 30,000 gold cap. (civ2-treasury.) Not scheduled.

## Diplomacy

- **Baseline diplomacy only:** contact, peace, tribute, cancelled treaties, shared knowledge, war, and the vendetta after a nuclear strike. No ceasefire, no alliance, and the computer players negotiate by Civ1's numbers. (civ2-diplomacy.) Planned.
- **No Senate**, see above. Planned (M2d).
- **Leaders:** each tribe's temper at a meeting comes from its Civ2 aggression attitude, and its civilised attitude weights the free advances given for a poor start; the expansion attitude is read by nothing yet, and leader names are the shared ones. (civ2-civilization.) Planned.
- **One tribe per colour** is not enforced, and a destroyed civilization does not return. A game can therefore end by conquest sooner than in Civ2. (civ2-civilization, civ2-game-end.) Planned.

## Huts

- **Outcomes** follow Civ2, including the redirects (nearby cities give mercenaries, no advance late in the game).
- **Barbarians are redirected** to mercenaries while there are none, see above.
- **A tribe's city** after 1000 AD is a plain size-1 city, not Civ2's larger one with buildings. (civ2-goody-hut.) Not scheduled.

## Score and the end of the game

- **No score and no spaceship.** There is no Civ2 score, no space race and no victory by landing. The game ends by retirement in 2020, with a warning in 2000, or by conquest. (civ2-game-end, rules-civ2.) Planned.

## Computer players

The AI is Civ1's (`simple-ai-client`), running against Civ2's rules. It plays 8 games to 2020 with no errors, but nothing was tuned for Civ2.

- **Civ1 policies.** Its strategies for expansion, defence, production and research are Civ1's, so it plays Civ1's game with Civ2's units. Its wonder and government choices assume Civ1's numbers. Planned.
- **Government flips.** It reconsiders its government on a fixed policy, but at most once every 40 turns, so it can leave a government that Civ2 would suit better, and spend 1 to 4 turns in Anarchy each time it chooses to (the longest seen is 4). It picks among Monarchy, Communism, the Republic and Democracy by Civ1's preference, and never picks Fundamentalism. Seen in soak games: most end under the Republic or Monarchy. Planned.
- **Revolutions** are started through whichever rules are loaded (simple-ai-client 0.1.30). If those rules offer no revolution terms, the AI never revolts. (simple-ai-client#82.)
- **Rebuying a lost defender** now works without a Gold treasury (simple-ai-client#81).

## Interface

- **Hidden until playable.** The Civ2 choice only appears when the `civ2` set is installed and you have imported the Civ2 tileset. (web-renderer: #1039, #1042, #1045 and #1046 install the set; #1049 adds the choice to New Game and the game setup.)
- **Isometric grid only.** Starting a Civ2 game forces the staggered-iso layout.
- **Six difficulty levels** (Chieftain to Deity) replace Civ1's, with their own calendars: 2020 arrives on turn 421 to 571 depending on the level and map size.
- **The Civ1 interface is reused.** No Civ2 windows, sounds or sidebar yet. (Track F, M3.)
- **City art by era** (M2c): with Civ2's art imported, a city is drawn in its civilization's style until its owner knows Industrialization, then in the industrial style, and in the modern one with Automobile and Electronics, at each style's own sizes, and a person's capital (a computer player's below King) a size larger. City Walls show only on your own cities, as before, and the Great Wall doesn't draw walls. With PEOPLE.GIF imported, citizens are Civ2's small ones, which fit the citizens' row; the engine sends their era (renaissance with Invention and Philosophy) for the large ones, which nothing shows yet. The isometric map's ancient city sizes are Civ2's (a new sprite at 4, 6 and 8), in Civ1 games on that map too. (web-renderer, rules-civ2.)
- **Auto build** can be set to choose anything, units only or improvements only (M2c).
- **Names only.** Names for the new units, improvements and specials are plain names; descriptions and the Civilopedia are empty.
- **Rules knowledge stays in the engine.** The interface draws only what the engine sends, so a missing rule shows as a missing option, not as an interface bug.
