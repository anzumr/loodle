using System;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;

namespace Loodl.Core
{
    public static class SnapshotJson
    {
        public static string Serialize(MatchState state)
        {
            var dto = new Snapshot { Schema = 1, Match = state.Id, Version = state.Version, Layout = state.LayoutId,
                Rules = state.Rules.Id, Active = state.Turn.PlayerId, Phase = (int)state.Turn.Phase,
                Sixes = state.Turn.ConsecutiveSixes, Die = state.Turn.Die,
                Players = state.Players.Select(p => new Player { Id = p.Id, Pawns = p.Pawns.Select(x => new Pawn {
                    Id = x.Id, Zone = (int)x.Zone, Index = x.PathIndex }).ToArray() }).ToArray() };
            using var stream = new MemoryStream();
            new DataContractJsonSerializer(typeof(Snapshot)).WriteObject(stream, dto);
            return Encoding.UTF8.GetString(stream.ToArray());
        }
        public static MatchState Deserialize(string json)
        {
            using var stream = new MemoryStream(Encoding.UTF8.GetBytes(json));
            var dto = (Snapshot?)new DataContractJsonSerializer(typeof(Snapshot)).ReadObject(stream);
            if (dto == null || dto.Schema != 1) throw new SerializationException("Unsupported snapshot schema");
            return new MatchState(dto.Match, dto.Version, dto.Layout, new Ruleset(dto.Rules),
                dto.Players.Select(p => new PlayerState(p.Id, p.Pawns.Select(x => new PawnState(x.Id, (PawnZone)x.Zone, x.Index)))),
                new TurnState(dto.Active, (TurnPhase)dto.Phase, dto.Sixes, dto.Die));
        }
        [DataContract] private sealed class Snapshot
        {
            [DataMember(IsRequired = true)] public int Schema;
            [DataMember(IsRequired = true)] public string Match = "";
            [DataMember(IsRequired = true)] public long Version;
            [DataMember(IsRequired = true)] public string Layout = "";
            [DataMember(IsRequired = true)] public string Rules = "";
            [DataMember(IsRequired = true)] public string Active = "";
            [DataMember(IsRequired = true)] public int Phase;
            [DataMember(IsRequired = true)] public int Sixes;
            [DataMember(IsRequired = true)] public int? Die;
            [DataMember(IsRequired = true)] public Player[] Players = Array.Empty<Player>();
        }
        [DataContract] private sealed class Player
        {
            [DataMember(IsRequired = true)] public string Id = "";
            [DataMember(IsRequired = true)] public Pawn[] Pawns = Array.Empty<Pawn>();
        }
        [DataContract] private sealed class Pawn
        {
            [DataMember(IsRequired = true)] public string Id = "";
            [DataMember(IsRequired = true)] public int Zone;
            [DataMember(IsRequired = true)] public int Index;
        }
    }
}
