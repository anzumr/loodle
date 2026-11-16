using System;
using System.Collections.Generic;
using System.Linq;

namespace Loodl.Core
{
    public interface IDice { int Roll(); }

    // Stable test/simulation RNG. Not suitable for authoritative online dice.
    public sealed class SeededDice : IDice
    {
        private uint state;
        public SeededDice(uint seed) { state = seed; }
        public int Roll()
        {
            uint value;
            do { state = unchecked(state * 1664525u + 1013904223u); value = state; }
            while (value >= 4294967292u); // Rejection removes modulo bias.
            return (int)(value % 6) + 1;
        }
    }

    public sealed class RollAction
    {
        public string MatchId { get; }
        public string PlayerId { get; }
        public string ActionId { get; }
        public long ExpectedVersion { get; }
        public RollAction(string matchId, string playerId, string actionId, long expectedVersion)
        {
            MatchId = Guard.Text(matchId, nameof(matchId)); PlayerId = Guard.Text(playerId, nameof(playerId));
            ActionId = Guard.Text(actionId, nameof(actionId)); ExpectedVersion = expectedVersion;
        }
    }

    public sealed class DiceRolled
    {
        public RollAction Action { get; }
        public int Value { get; }
        public DiceRolled(RollAction action, int value) { Action = action ?? throw new ArgumentNullException(nameof(action)); Value = value; }
    }

    public sealed class RollResult
    {
        public MatchState State { get; }
        public DiceRolled Event { get; }
        public RollResult(MatchState state, DiceRolled gameEvent) { State = state; Event = gameEvent; }
    }

    // Policy contract only: caller supplies the next eligible player. No capture/finish rules inferred.
    public static class ThirdSixPolicy
    {
        public static MatchState Forfeit(MatchState state, string nextEligiblePlayerId)
        {
            if (state.Turn.Phase != TurnPhase.AwaitingRoll || state.Turn.ConsecutiveSixes != 2 ||
                nextEligiblePlayerId == state.Turn.PlayerId || !state.Players.Any(p => p.Id == nextEligiblePlayerId))
                throw new InvalidOperationException("Invalid third-six policy context");
            return new MatchState(state.Id, checked(state.Version + 1), state.LayoutId, state.Rules,
                state.Players, new TurnState(nextEligiblePlayerId));
        }
    }

    // Stage 0 supports a single roll boundary. Pawn resolution is deliberately absent.
    public static class RollEngine
    {
        private static void Validate(MatchState state, RollAction action)
        {
            if (action.MatchId != state.Id || action.PlayerId != state.Turn.PlayerId || action.ExpectedVersion != state.Version ||
                state.Turn.Phase != TurnPhase.AwaitingRoll)
                throw new InvalidOperationException("Wrong match, player, version or phase");
            if (state.Turn.ConsecutiveSixes == 2)
                throw new NotSupportedException("Full bonus sequence orchestration belongs to Stage 1; use the isolated third-six policy contract");
        }
        public static RollResult Roll(MatchState state, RollAction action, IDice dice)
        {
            Validate(state, action);
            var gameEvent = new DiceRolled(action, dice.Roll());
            return new RollResult(Apply(state, gameEvent), gameEvent);
        }
        public static MatchState Apply(MatchState state, DiceRolled gameEvent)
        {
            Validate(state, gameEvent.Action);
            if (gameEvent.Value < 1 || gameEvent.Value > 6) throw new ArgumentOutOfRangeException(nameof(gameEvent));
            return new MatchState(state.Id, checked(state.Version + 1), state.LayoutId, state.Rules, state.Players,
                new TurnState(state.Turn.PlayerId, TurnPhase.AwaitingPawnAction,
                    gameEvent.Value == 6 ? state.Turn.ConsecutiveSixes + 1 : 0, gameEvent.Value));
        }
        // Trusted persisted events only. Network clients must never call this as an action API.
        public static MatchState Replay(MatchState initial, IEnumerable<DiceRolled> events)
        {
            foreach (var gameEvent in events) initial = Apply(initial, gameEvent);
            return initial;
        }
    }
}
