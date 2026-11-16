# Architecture

The pure C# core targets .NET Standard 2.1 and C# 9. The .NET 10 test host is separate from Unity's runtime. Unity compatibility is an API target, not proof of Editor compilation or IL2CPP compatibility.

State objects validate construction and expose read-only collections. Pawn identity is scoped to its player. Match snapshots include schema, match/version, layout/ruleset IDs, participants and active turn. Schema 1 uses built-in DataContract JSON serialization, with no external runtime package. Unknown schemas fail; schema migrations are future work. Deserialized values pass through model constructors.

RollAction carries match, player, action ID and expected state version. RollEngine validates the boundary before consuming injected RNG. A successful roll returns a new state and typed DiceRolled event. Replay consumes trusted persisted events through the same transition. Replayed duplicates/stale versions fail. Durable idempotency receipts, authentication, transaction storage and a serialized event envelope belong to later stages; an action ID alone does not provide durable deduplication.

The seeded LCG dice is stable simulation infrastructure with rejection sampling. It is not cryptographically secure and must never generate ranked outcomes. A later authoritative adapter must supply fair secure dice. Snapshots do not persist RNG state; replay uses recorded outcomes, while resumed live simulations need a separately managed RNG boundary.

Stage 0 intentionally stops at AwaitingPawnAction. No pawn action handler, path geometry, capture logic, finish eligibility or complete bonus sequence exists. The ThirdSixPolicy contract consumes a state with two prior sixes and a caller-selected next player; it preserves participant objects and resets turn control. RollEngine refuses a two-six context until Stage 1 integrates this policy. Do not expose event replay as a client action endpoint.

IBoardLayout defines identity, seat count, seat paths and safe-square lookup. No approved layout is supplied; `unapproved-layout` is explicit metadata, not a valid playable board. Layout invariants and balanced 2–8-seat geometry require subsequent implementation.

Unity presentation, backend services and AI must consume this single core rather than duplicate rules. Unity integration should reference a built core assembly or a deliberate local package; do not copy source into two independently maintained implementations. DataContract reflection/AOT behavior must be tested with IL2CPP before device claims.
