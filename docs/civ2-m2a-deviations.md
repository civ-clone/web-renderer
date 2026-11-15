# Civilization II in civ.one: what the rules don't do yet

This is the first playable Civilization II (M2a): Civ2's units, advances, governments, improvements, wonders and tribes on the shared rules, drawn on the isometric grid with the art you import yourself. It is a **preview**. Many Civ2 behaviours are not modelled yet, and a few differ on purpose. This page lists them, for players who know Civ2 and for developers picking up the next phase.

Each entry says what differs, which package owns it (all `civ-clone/civ2-*` unless noted), and whether it is **planned** (a later phase, M2b to M2f, see the roadmap in #1007) or **by design**. "Not scheduled" means it is wanted but has no phase yet.

Where the numbers are Civ2's, they come from a hand-written table checked against your own copy of the game (`CIV2_PATH`); no game text or art is in the repository. The Civilopedia is empty for Civ2 classes.

## Saves

Civ2 saves record that they belong to the `civ2` set and load as civ2, but **they will break across M2b to M2f**: rules and saved data will change between phases, and there is no promise that a save from one phase loads in the next. Treat Civ2 games as disposable until the set leaves preview. Civ1 saves are unaffected.

## Map

- **Interim world.** The map comes from the shared generator with Glacier at the poles and a simple downhill river walk afterwards, not Civ2's own generator. Start positions are simple, plus Civ2's start balancing (extra Settlers or advances for poor starts). Only staggered-iso grids are offered. (civ2-world, civ2-player.) Planned: Civ2's own generator (M2f).
- **Rivers** give +1 trade, a source of water for irrigation and a river-side site bonus, but Civ2's river movement and display rules are approximated. (civ2-world.) Not scheduled.
- **No Farmland.** It can't be built yet, so the Supermarket does nothing. (civ2-world, civ2-city-improvement.) Planned.
- **No commodities, no city-context yields.** Squares yield what the terrain and special say; nothing depends on the city working them. (civ2-world.) Planned.
- **City square.** Irrigation and a road as in Civ1; Civ2's mine bonus where irrigation is impossible and the centre's farmland are not modelled. (civ2-city.) Not scheduled.

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
- **Carriers and Submarines hold 8.** Civ2's code lets a carrier or a submarine hold 20 and doesn't check it on landing; here both hold 8, as the unit table says. (civ2-unit.) By design.
- **Airlifts always fly.** An airlift near enemy fighters can be shot down, as in Civ2, but Civ2 asks you to confirm a risky one first. (civ2-unit.) Not scheduled.
- **No work pooling.** Engineers work at twice the rate, but several workers on one square don't add their work together as in Civ2 (#1059). (civ2-unit.) Planned.
- **No odds display.** Civ2 doesn't show the odds of a battle, and neither does civ.one yet. (web-renderer.) By design for now.
- **Where Civ2's code and its description differ, the code is followed:** a city loses a citizen when its defender loses unless the attacker fought from the sea, which the code judges by the attacker's square, not the city's; and the difficulty handicaps apply to any attacker that isn't a barbarian. (civ2-unit, civ2-difficulty.) By design.
- **Not modelled:** Leonardo's upgrades and Communism's veteran Diplomats. (civ2-wonder, civ2-unit.) Planned (M2c).

## Cities

- **Civ1-shaped corruption:** trade only, by distance. No shield waste, no capital link, no celebration step, and the distance is the world's own, not Civ2's. A Courthouse halves it. (civ2-city.) Planned.
- **Civ1-shaped specialists:** no "Entertainers only below size 5" rule; the three Civ2 specialists give 2 luxuries, 3 gold and 3 research. (civ2-city.) Planned.
- **Capture** takes a citizen and an advance, but there is no plunder, no lost improvements, no partisans and no civil war, and the previous owner's units are disbanded rather than rehomed. (civ2-city.) Planned.
- **Famine** disbands the settlers even in a computer player's unseen city, and there are no food caravans. (civ2-city.) Not scheduled.
- **Auto build:** a city set to automatic does not choose for itself. (civ2-city.) Planned.
- **Computer players' late food box:** the extra boost Civ2 gives them after turn 200 while a human leads is left out. (civ2-difficulty.) Not scheduled.
- **City numbers:** a destroyed city's slot is not reused, so empire-size effects can differ once a city is gone. (civ2-city-happiness.) By design for now.

## Happiness

- **Civ1-shaped calculation:** no angry citizens (extra unhappy citizens are dropped), and the base calculator's order rather than Civ2's step-by-step clamp. (civ2-city-happiness.) Planned (M2c).
- **No rapture growth:** a celebrating Republic or Democracy city does not grow. (civ2-city-happiness.) Planned (M2c).
- **In place:** content base by level, empire size, martial law, military unhappiness, luxuries, disorder (a Democracy falls into Anarchy), and celebration.
- **Not modelled:** Nuclear Plant meltdowns. (civ2-city-improvement.) Not scheduled.

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
- **No spaceship parts or Capitalization.** (civ2-city-improvement.) Planned.
- **Wonders with no effect yet:** Marco Polo's Embassy, the Eiffel Tower, the United Nations, the Great Wall's diplomatic effect, the Manhattan Project's reputation cost, the Apollo Program's revealed map. (civ2-wonder.) Planned.
- **Superhighways, Harbour and Offshore Platform** add to the city's totals, not to each square. Superhighways' bonus also comes after pollution and leaves out the celebration and Colossus bonuses, where Civ2 adds it to the square first. (civ2-city-improvement.) Not scheduled.
- **Palace escape** after a capital falls is offered only to computer players and ignores land masses. (civ2-city-improvement.) Not scheduled.
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
- **Names only.** Names for the new units, improvements and specials are plain names; descriptions and the Civilopedia are empty.
- **Rules knowledge stays in the engine.** The interface draws only what the engine sends, so a missing rule shows as a missing option, not as an interface bug.
