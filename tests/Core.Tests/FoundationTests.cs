using System;
using System.Linq;
using System.Runtime.Serialization;
using Loodl.Core;
using Xunit;

public class FoundationTests
{
    private static MatchState Initial() => MatchState.Create("match", new[] { "a", "b" });
    private static RollAction Action(string player = "a", long version = 0, string match = "match") => new RollAction(match, player, "action-1", version);
    private sealed class Dice : IDice
    {
        public int Calls;
        private readonly int value;
        public Dice(int value) { this.value = value; }
        public int Roll() { Calls++; return value; }
    }

    [Theory]
    [InlineData(2, 2)] [InlineData(3, 3)] [InlineData(4, 4)] [InlineData(5, 2)]
    [InlineData(6, 3)] [InlineData(7, 4)] [InlineData(8, 4)]
    public void InitialStateHasEqualYardPawns(int seats, int pawns)
    {
        var state = MatchState.Create("m", Enumerable.Range(0, seats).Select(i => "p" + i), pawns);
        Assert.Equal(seats, state.Players.Count);
        Assert.All(state.Players, p => { Assert.Equal(pawns, p.Pawns.Count); Assert.All(p.Pawns, x => Assert.Equal(PawnZone.Yard, x.Zone)); });
        Assert.Equal(0, state.Version); Assert.Equal(TurnPhase.AwaitingRoll, state.Turn.Phase);
    }
    [Fact] public void DuplicatePlayersRejected() => Assert.Throws<ArgumentException>(() => MatchState.Create("m", new[] { "a", "a" }));
    [Theory] [InlineData(1)] [InlineData(9)]
    public void InvalidSeatCountRejected(int count) => Assert.Throws<ArgumentException>(() => MatchState.Create("m", Enumerable.Range(0, count).Select(i => "p" + i)));
    [Fact] public void InvalidPawnLocationRejected() => Assert.Throws<ArgumentException>(() => new PawnState("p", PawnZone.Track, -1));
    [Fact] public void SeededDiceHasStableSequenceAndRange()
    {
        var a = new SeededDice(42); var b = new SeededDice(42);
        Assert.Equal(new[] { 2, 5, 6, 1, 4 }, Enumerable.Range(0, 5).Select(_ => a.Roll()).ToArray());
        a = new SeededDice(42);
        for (var i = 0; i < 1000; i++) { int value = a.Roll(); Assert.InRange(value, 1, 6); Assert.Equal(value, b.Roll()); }
    }
    [Theory] [InlineData("b", 0, "match")] [InlineData("a", 1, "match")] [InlineData("a", 0, "other")]
    public void InvalidActionDoesNotConsumeRng(string player, long version, string match)
    {
        var dice = new Dice(3);
        Assert.Throws<InvalidOperationException>(() => RollEngine.Roll(Initial(), Action(player, version, match), dice));
        Assert.Equal(0, dice.Calls);
    }
    [Theory] [InlineData(0)] [InlineData(7)]
    public void InvalidDiceRejected(int value) => Assert.Throws<ArgumentOutOfRangeException>(() => RollEngine.Roll(Initial(), Action(), new Dice(value)));
    [Fact] public void SecondRollBeforePawnResolutionRejected()
    {
        var state = RollEngine.Roll(Initial(), Action(), new Dice(6)).State;
        Assert.Throws<InvalidOperationException>(() => RollEngine.Roll(state, Action(version: 1), new Dice(4)));
    }
    [Fact] public void SnapshotRoundTripPreservesRolledState()
    {
        var state = RollEngine.Roll(Initial(), Action(), new Dice(6)).State;
        var json = SnapshotJson.Serialize(state);
        Assert.Equal(json, SnapshotJson.Serialize(SnapshotJson.Deserialize(json)));
    }
    [Fact] public void UnknownSchemaRejected() => Assert.Throws<SerializationException>(() => SnapshotJson.Deserialize(SnapshotJson.Serialize(Initial()).Replace("\"Schema\":1", "\"Schema\":2")));
    [Fact] public void ReplayReproducesRollAndRejectsDuplicateEvent()
    {
        var initial = Initial(); var result = RollEngine.Roll(initial, Action(), new Dice(4));
        Assert.Equal(SnapshotJson.Serialize(result.State), SnapshotJson.Serialize(RollEngine.Replay(initial, new[] { result.Event })));
        Assert.Throws<InvalidOperationException>(() => RollEngine.Replay(initial, new[] { result.Event, result.Event }));
        Assert.Equal(0, initial.Version);
    }
    [Fact] public void ThirdSixPolicyPreservesTwoPreviouslyCommittedMovesAfterReload()
    {
        // Synthetic boundary fixture, NOT a playable 6,6,6 integration test.
        var initial = Initial();
        var players = new[] { new PlayerState("a", new[] { new PawnState("pawn-0", PawnZone.Track, 6),
            new PawnState("pawn-1", PawnZone.Track, 0), new PawnState("pawn-2"), new PawnState("pawn-3") }), initial.Players[1] };
        var before = new MatchState("match", 4, initial.LayoutId, initial.Rules, players, new TurnState("a", consecutiveSixes: 2));
        before = SnapshotJson.Deserialize(SnapshotJson.Serialize(before));
        var after = ThirdSixPolicy.Forfeit(before, "b");
        Assert.Equal(6, after.Players[0].Pawns[0].PathIndex); Assert.Equal(0, after.Players[0].Pawns[1].PathIndex);
        Assert.Same(before.Players[0], after.Players[0]); Assert.Equal("b", after.Turn.PlayerId);
        Assert.Equal(0, after.Turn.ConsecutiveSixes); Assert.Null(after.Turn.Die);
        Assert.Equal(TurnPhase.AwaitingRoll, after.Turn.Phase); Assert.Equal(5, after.Version);
        Assert.Throws<InvalidOperationException>(() => RollEngine.Roll(after, Action(version: 5), new Dice(2)));
    }
    [Fact] public void NonSixResetsStreak()
    {
        var initial = Initial(); var state = new MatchState(initial.Id, 0, initial.LayoutId, initial.Rules, initial.Players, new TurnState("a", consecutiveSixes: 1));
        Assert.Equal(0, RollEngine.Roll(state, Action(), new Dice(5)).State.Turn.ConsecutiveSixes);
    }
    [Fact] public void CaptureInteractionRemainsOpen() => Assert.Equal("OPEN", Initial().Rules.CaptureBonusInteractions);
}
