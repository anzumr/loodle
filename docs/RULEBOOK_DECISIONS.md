# Rulebook decisions

Source: LOODL_Production_Handoff_v1.2.md. No additional gameplay decisions are approved here.

| Rule ID | Status | Meaning |
|---|---|---|
| third_consecutive_six_forfeits_turn | CONFIRMED | Third consecutive six in the continuous active turn ends the turn immediately; no pawn action or extra roll from that six. |
| first_two_moves_remain | CONFIRMED | Preserve all lawful committed state changes from the first two rolls; never roll back their moves or captures. |
| capture_bonus_interactions | OPEN | Whether capture bonuses carry/reset the streak or stack with six bonuses requires approval. |

Reset the streak on non-six or transfer of control. Select the next eligible player on forfeit. Stage 0's policy accepts that player from the caller; it does not invent eligibility rules.

Also OPEN: blockade/team passage, safe/entry/home capture details, exact finish, finishing turn order, timeouts/disconnects, Quick scoring/ties and board topology. Proposed defaults are not approved rules.

Stage 1 must test actual 6,6,6 and 6,6,5 sequences, committed captures, no third-roll pawn action, no fourth bonus roll, reload before the third six, ordered event replay and rejection of the forfeiting player's actions.
