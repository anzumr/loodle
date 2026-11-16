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
| `bonusOnFinish` | **off** | on: bringing a pawn home grants another roll |
| `stackBonuses` | **off**: a six that also captures earns one extra roll | on: it earns two |
| `blockades` | on: two friendly pawns on a shared square stop opponents landing on or passing it | off: no blocking, and a pawn landing there captures both |

## Interpretations I chose where the handoff was silent

These are implemented as fixed behaviour today. Each is a single small change if you want it different.

1. **Safe squares are the four start squares and the four stars.** Nothing is ever captured there, including an opponent sitting on your start square when you enter. Different colours can share a safe square.
2. **A six with no legal move still grants another roll** (and counts toward three sixes).
3. **A capture's extra roll after a non-six starts the six count from zero.** Only sixes rolled back to back count.
4. **A blockade on your start square stops you entering.** Your own blockades never block you, and a third pawn may join one.
5. **Home lanes are private.** No captures or blockades there.
6. **A player who brings their last pawn home stops rolling**, even if that move was a six. Play continues for the others until one player is left; that player takes last place.
7. **Two-player matches seat red and yellow** (opposite corners). Three players use red, green, yellow.

## Technical properties

- A match is plain JSON. `applyAction(state, action)` is the only way to change it and returns a new state plus events; invalid actions throw and change nothing.
- Die values travel inside roll actions, so an action log replays to the identical match (`replay`). The server will generate the values online; clients will not.
- `serializeMatch` / `deserializeMatch` save and restore mid-match, validating the data on load.
- `seededDice` is for tests and simulations only.

## Not built yet

Teams, Quick modes, turn timers, 5–8 player layouts, AI, and seat-balance statistics.
