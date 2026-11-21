# LOODL classic rules as implemented

Code: `packages/rules/src/engine.ts`. Tests: `packages/rules/test/engine.test.ts`.

## Locked

- **Three consecutive sixes.** The first and second six each allow a legal move. The third six ends the turn immediately: no pawn moves, earlier moves and captures stand, and play passes to the next player still in the match. A six that could not be used still counts toward the three. This is a constant (`SIX_LIMIT`), not a setting.
- A six is required to leave the yard.
- Finishing needs the exact number.
- Captured pawns return to their yard.
- If any legal move exists, the player must make one.

## Configurable (`RulesConfig`), with current defaults

| Setting | Default | Alternative |
|---|---|---|
| `pawnsPerPlayer` | 4 | 2 or 3 |
| `bonusOnSix` | on | off |
| `bonusOnCapture` | on | off |
| `bonusOnFinish` | **on** (owner request, 2026-11-17): bringing a pawn home grants another roll | off |
| `stackBonuses` | **off**: a six that also captures earns one extra roll | on: it earns two |
| `blockades` (stacks) | **on** (owner request, 2026-11-21): pawns of one colour may share a square; a different colour landing there captures **one** pawn of that stack. Nothing blocks movement | off: the lander captures the whole stack |
| `mercy` | **on** (owner request, 2026-11-21): while none of a seat's pawns are out (every unfinished pawn in the yard), its third roll in a row without a six is a six; with two dice, one die is the six. The count runs across turns and resets on any six or when a pawn is out | off |
| `sides` | null: everyone plays for themselves | 1v1 with two yards each: `[0, 1, 0, 1]` (red+yellow vs green+blue). Teammates' colours never capture each other; the first side with all its colours home wins |

## Interpretations I chose where the handoff was silent

These are implemented as fixed behaviour today. Each is a single small change if you want it different.

1. **Safe squares are the four start squares and the four stars.** Nothing is ever captured there, including an opponent sitting on your start square when you enter. Different colours can share a safe square.
2. **A six with no legal move still grants another roll** (and counts toward three sixes).
3. **A capture's extra roll after a non-six starts the six count from zero.** Only sixes rolled back to back count.
4. **Nothing blocks movement.** A pawn may enter, pass or land on any square. Landing on a square with several other colours takes one pawn from each of them. Start squares and stars stay safe.
5. **Home lanes are private.** No captures there.
6. **A player who brings their last pawn home stops rolling**, even if that move was a six. Play continues for the others until one player is left; that player takes last place.
7. **Two-player matches seat red and yellow** (opposite corners). Three players use red, green, yellow.

## Technical properties

- A match is plain JSON. `applyAction(state, action)` is the only way to change it and returns a new state plus events; invalid actions throw and change nothing.
- Die values travel inside roll actions, so an action log replays to the identical match (`replay`). The server will generate the values online; clients will not.
- `serializeMatch` / `deserializeMatch` save and restore mid-match, validating the data on load.
- `seededDice` is for tests and simulations only.

## Two dice (optional, proposed details awaiting approval)

Picked per match (Dice: 1 or 2 in the mode menu); setting `dice: 2`. Works with every mode, board size and pawn count, offline and online.

- Each roll is two dice. Each die is a separate move, on the same pawn or two different ones, in either order. The player taps a die to choose which to use; otherwise the first die that suits the tapped pawn is used.
- A pawn still needs a 6 on one die to come out; the other die can then move it.
- If a die cannot be used, it is kept while the other die can still change the board (bringing a pawn out can make it usable). When no remaining die has a move, the roll ends.
- **A double earns another roll** (instead of every six). A capture or a pawn home also earns one, but at most one extra roll per roll unless `stackBonuses` is on.
- **A third double in a row ends the turn at once with no move**, earlier moves standing. This mirrors the locked three-sixes rule; the one-die game is unchanged.
- Measured with medium AI, two dice make matches shorter: at 4 players about 78 rolls each instead of 139.

## Mercy rule details

- Dice values still travel in roll actions. When the mercy six is due, `mercySixDue(state)` is true and the engine rejects any roll without a six, so a client cannot dodge it and a server cannot forget it. `rollFor(state, dice)` produces a correct roll and is used by the server, the offline game and the tests.
- Saved matches from before the rule keep playing without it.

## 1v1 with two yards each

Offline: pick 2 players, then Yards each: 2. Online: the host of a private room with exactly two players picks it in the room rules. Always Classic rules. Turn order alternates players (red, green, yellow, blue). Results list the winner's two colours first.

## Coin wagers (solo only)

Code: `packages/rules/src/wager.ts`. Picked in the mode menu for solo matches against the computer: none, 25, 50, 100, 250, 500 or 1,000 coins, up to what you have.

- The stake is taken from your coins when the match starts and is saved with the match, so Save and exit keeps it.
- Winning (1st place) pays back stake × multiplier. Any other place, quitting, or starting a new match over it loses the stake.
- Multiplier: Beginner 1.2, Easy 1.5, Medium 2, Hard 2.5, Expert 3, plus 0.5 per opponent beyond the first (Medium with 4 players pays ×3).
- Coins are earned only by playing and are stored on the device. Not available online until accounts have a server-side database; wagering between people would need the server to hold the coins.
- If coins ever become purchasable with real money, wagering them may fall under gambling rules and must be reviewed first.

## Quick modes (proposed definitions, awaiting approval)

Both use the classic board and all classic rules, and start each player with one pawn already on its start square.

- **Quick Race** (`QUICK_RACE_RULES`): the first player to bring two pawns home wins and the match ends at once. Everyone else is ranked by pawns home, then by total distance travelled.
- **Quick Clash** (`QUICK_CLASH_RULES`): 3 points per capture, 2 per pawn home. The first player to 10 points wins. If someone brings two pawns home before that, the match ends there and the highest score wins. Ties fall back to pawns home, then distance.

Measured with medium AI on all four seats over 20 matches each, both quick modes take under 60% of the actions of a classic match (asserted in `quick.test.ts`).

## Not built yet

Teams, shorter quick layouts, offline turn timers, 5–8 player layouts, practice, campaign, and seat-balance statistics.

## Online action deadlines

Private rooms allow 30 seconds for each roll or pawn choice. At expiry the server rolls its own die or chooses a legal move with the medium AI. Every action gets a fresh deadline; reconnecting does not extend it. Normal rules, including the third-six forfeit, still apply. Rooms with no connected players stop automatic play and remain subject to idle expiry.

The interactive tutorial uses eight independent positions and preset dice through the same rules engine. It does not alter normal match dice or saved matches.
