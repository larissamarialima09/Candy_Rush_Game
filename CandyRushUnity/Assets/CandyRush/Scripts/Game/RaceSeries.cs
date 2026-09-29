using System.Collections.Generic;
using System.Linq;

namespace CandyRush
{
    public struct SeriesStanding
    {
        public string Name;
        public bool IsPlayer;
        public int Position;
        public int Points;
        public int Wins;
    }

    /// <summary>Campeonato de vários heats (main.ts: RaceSeries). Pontuação por posição, desempate por vitórias.</summary>
    public sealed class RaceSeries
    {
        sealed class Total
        {
            public string Name;
            public bool IsPlayer;
            public int Points;
            public int Wins;
            public int LastPosition = int.MaxValue;
        }

        readonly Dictionary<Competitor, Total> totals = new Dictionary<Competitor, Total>();
        readonly int heatCount;
        public int Heat = 1;

        public RaceSeries(int heatCount) { this.heatCount = heatCount; }

        public void Reset(IEnumerable<Competitor> competitors)
        {
            Heat = 1;
            totals.Clear();
            foreach (var c in competitors) Ensure(c);
        }

        public IReadOnlyList<SeriesStanding> Record(IReadOnlyList<Competitor> competitors)
        {
            var ordered = competitors.OrderBy(c => c.Position).ToList();
            for (int i = 0; i < ordered.Count; i++)
            {
                var total = Ensure(ordered[i]);
                total.Points += ordered.Count - i;
                total.Wins += i == 0 ? 1 : 0;
                total.LastPosition = i + 1;
            }
            return Standings();
        }

        public void Advance() => Heat = System.Math.Min(Heat + 1, heatCount);
        public bool IsComplete => Heat >= heatCount;

        Total Ensure(Competitor c)
        {
            if (totals.TryGetValue(c, out var existing)) return existing;
            var entry = new Total { Name = c.Name, IsPlayer = c.IsPlayer };
            totals[c] = entry;
            return entry;
        }

        List<SeriesStanding> Standings()
        {
            var ranked = totals.Values.ToList();
            ranked.Sort((a, b) =>
            {
                if (a.Points != b.Points) return b.Points - a.Points;
                if (a.Wins != b.Wins) return b.Wins - a.Wins;
                if (a.LastPosition != b.LastPosition) return a.LastPosition - b.LastPosition;
                return string.CompareOrdinal(a.Name, b.Name);
            });
            var result = new List<SeriesStanding>(ranked.Count);
            for (int i = 0; i < ranked.Count; i++)
            {
                var e = ranked[i];
                result.Add(new SeriesStanding { Name = e.Name, IsPlayer = e.IsPlayer, Position = i + 1, Points = e.Points, Wins = e.Wins });
            }
            return result;
        }
    }
}
