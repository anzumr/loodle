using System;
using System.Collections.Generic;
using System.Linq;

namespace Loodl.Core
{
    public enum TurnPhase { AwaitingRoll, AwaitingPawnAction }
    public enum PawnZone { Yard, Track, Finished }

    public static class RuleIds
    {
        public const string ThirdSixForfeits = "third_consecutive_six_forfeits_turn";
        public const string FirstTwoMovesRemain = "first_two_moves_remain";
        public const string CaptureBonusInteractions = "capture_bonus_interactions";
    }

    public sealed class Ruleset
    {
        public string Id { get; }
        public Ruleset(string id) { Id = Guard.Text(id, nameof(id)); }
        public bool ThirdSixForfeits => true;
        public bool FirstTwoMovesRemain => true;
        public string CaptureBonusInteractions => "OPEN";
    }

    // Topology implementation and approved layouts belong to Stage 1/2.
    public interface IBoardLayout
    {
        string Id { get; }
        int SeatCount { get; }
        IReadOnlyList<int> PathForSeat(int seat);
        bool IsSafe(int nodeId);
    }

    internal static class Guard
    {
        internal static string Text(string value, string name) =>
            !string.IsNullOrWhiteSpace(value) ? value : throw new ArgumentException("Required identifier", name);
    }

    public sealed class PawnState
    {
        public string Id { get; }
        public PawnZone Zone { get; }
        public int PathIndex { get; }
        public PawnState(string id, PawnZone zone = PawnZone.Yard, int pathIndex = -1)
        {
            Id = Guard.Text(id, nameof(id));
            if (!Enum.IsDefined(typeof(PawnZone), zone) ||
                (zone == PawnZone.Track ? pathIndex < 0 : pathIndex != -1))
                throw new ArgumentException("Invalid pawn location");
            Zone = zone; PathIndex = pathIndex;
        }
    }

    public sealed class PlayerState
    {
        public string Id { get; }
        public IReadOnlyList<PawnState> Pawns { get; }
        public PlayerState(string id, IEnumerable<PawnState> pawns)
        {
            Id = Guard.Text(id, nameof(id));
            var items = pawns?.ToArray() ?? throw new ArgumentNullException(nameof(pawns));
            if (items.Length < 2 || items.Length > 4 || items.Any(p => p == null) ||
                items.Select(p => p.Id).Distinct(StringComparer.Ordinal).Count() != items.Length)
                throw new ArgumentException("Expected 2–4 uniquely identified pawns");
            Pawns = Array.AsReadOnly(items);
        }
    }

    public sealed class TurnState
    {
        public string PlayerId { get; }
        public TurnPhase Phase { get; }
        public int ConsecutiveSixes { get; }
        public int? Die { get; }
        public TurnState(string playerId, TurnPhase phase = TurnPhase.AwaitingRoll, int consecutiveSixes = 0, int? die = null)
        {
            PlayerId = Guard.Text(playerId, nameof(playerId));
            if (!Enum.IsDefined(typeof(TurnPhase), phase) || consecutiveSixes < 0 || consecutiveSixes > 2 ||
                (phase == TurnPhase.AwaitingRoll ? die != null : !die.HasValue || die < 1 || die > 6) ||
                (phase == TurnPhase.AwaitingPawnAction && (die == 6 ? consecutiveSixes == 0 : consecutiveSixes != 0)))
                throw new ArgumentException("Invalid turn state");
            Phase = phase; ConsecutiveSixes = consecutiveSixes; Die = die;
        }
    }

    public sealed class MatchState
    {
        public string Id { get; }
        public long Version { get; }
        public string LayoutId { get; }
        public Ruleset Rules { get; }
        public IReadOnlyList<PlayerState> Players { get; }
        public TurnState Turn { get; }
        public MatchState(string id, long version, string layoutId, Ruleset rules, IEnumerable<PlayerState> players, TurnState turn)
        {
            Id = Guard.Text(id, nameof(id)); LayoutId = Guard.Text(layoutId, nameof(layoutId));
            Rules = rules ?? throw new ArgumentNullException(nameof(rules));
            Turn = turn ?? throw new ArgumentNullException(nameof(turn));
            var items = players?.ToArray() ?? throw new ArgumentNullException(nameof(players));
            if (version < 0 || items.Length < 2 || items.Length > 8 || items.Any(p => p == null) ||
                items.Select(p => p.Id).Distinct(StringComparer.Ordinal).Count() != items.Length ||
                items.Select(p => p.Pawns.Count).Distinct().Count() != 1 || !items.Any(p => p.Id == turn.PlayerId))
                throw new ArgumentException("Invalid match participants/version");
            Version = version; Players = Array.AsReadOnly(items);
        }
        public static MatchState Create(string id, IEnumerable<string> playerIds, int pawnCount = 4)
        {
            if (pawnCount < 2 || pawnCount > 4) throw new ArgumentOutOfRangeException(nameof(pawnCount));
            var players = playerIds.Select(p => new PlayerState(p, Enumerable.Range(0, pawnCount).Select(i => new PawnState("pawn-" + i)))).ToArray();
            if (players.Length == 0) throw new ArgumentException("Players required");
            return new MatchState(id, 0, "unapproved-layout", new Ruleset("classic-contract-v1"), players, new TurnState(players[0].Id));
        }
    }
}
