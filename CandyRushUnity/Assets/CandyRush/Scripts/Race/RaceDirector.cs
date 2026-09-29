using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>Um competidor: jogador ou adversário.</summary>
    public sealed class Competitor
    {
        public string Name;
        public Kart Kart;
        public bool IsPlayer;
        public LapTracker Tracker;
        public float Progress;
        public int Lap;
        public int Position;
        public int LastSampleIndex;
        public bool Finished;
        public float FinishTime;
    }

    /// <summary>
    /// Dirige a corrida (race/raceDirector.ts): mede o progresso, ordena as
    /// posições, resolve as batidas entre karts e decide quem terminou.
    /// </summary>
    public sealed class RaceDirector
    {
        public readonly List<Competitor> Competitors = new List<Competitor>();
        public float Elapsed;
        /// <summary>True quando TODOS os humanos cruzaram a linha na última volta.</summary>
        public bool PlayersFinished;
        public int PlayerPosition;
        public Competitor Winner;

        readonly CircuitPath path;
        readonly List<Competitor> sorted = new List<Competitor>();

        public RaceDirector(CircuitPath path) { this.path = path; }

        public Competitor Add(string name, Kart kart, bool isPlayer, LapTracker tracker = null)
        {
            var competitor = new Competitor
            {
                Name = name,
                Kart = kart,
                IsPlayer = isPlayer,
                Tracker = tracker ?? new LapTracker(path),
                Position = Competitors.Count + 1,
                LastSampleIndex = path.NearestSampleIndex(kart.Body.Position.x, kart.Body.Position.z),
            };
            Competitors.Add(competitor);
            return competitor;
        }

        public void Update(float dt)
        {
            Elapsed += dt;
            foreach (Competitor c in Competitors)
                if (!c.Finished) UpdateProgress(dt, c);

            ResolveKartCollisions();
            UpdatePositions();

            int humanCount = 0, firstHumanPosition = 0;
            bool allFinished = true;
            foreach (Competitor c in Competitors)
            {
                if (!c.IsPlayer) continue;
                if (humanCount == 0) firstHumanPosition = c.Position;
                humanCount++;
                if (!c.Finished) allFinished = false;
            }
            if (humanCount > 0 && allFinished)
            {
                PlayersFinished = true;
                PlayerPosition = firstHumanPosition;
            }
        }

        void UpdateProgress(float dt, Competitor c)
        {
            c.Tracker.Update(dt, c.Kart);
            Vector3 position = c.Kart.Body.Position;
            int index = path.NearestSampleIndex(position.x, position.z);
            c.LastSampleIndex = index;
            c.Lap = c.Tracker.Lap;
            c.Progress = c.Lap * path.TotalLength + path.Samples[index].Distance;

            if (c.Tracker.Lap >= RaceConfig.Laps && !c.Finished)
            {
                c.Finished = true;
                c.FinishTime = Elapsed;
                if (Winner == null) Winner = c;
            }
        }

        /// <summary>Só a componente NORMAL da velocidade relativa é trocada.</summary>
        void ResolveKartCollisions()
        {
            float minimum = RaceConfig.CollisionRadius * 2;
            for (int i = 0; i < Competitors.Count; i++)
            {
                for (int j = i + 1; j < Competitors.Count; j++)
                {
                    Competitor fc = Competitors[i], sc = Competitors[j];
                    RigidBody first = fc.Kart.Body, second = sc.Kart.Body;

                    Vector3 delta = second.Position - first.Position;
                    delta.y = 0;
                    float distance = delta.magnitude;
                    if (distance >= minimum || distance < 1e-4f) continue;

                    Vector3 normal = delta / distance;
                    float overlap = minimum - distance;
                    first.Position += normal * (-overlap * 0.5f);
                    second.Position += normal * (overlap * 0.5f);

                    float approach = (second.Velocity.x - first.Velocity.x) * normal.x +
                                     (second.Velocity.z - first.Velocity.z) * normal.z;
                    if (approach >= 0) continue;

                    float impulse = -approach * (1 + RaceConfig.CollisionRestitution) * 0.5f;
                    first.Velocity += normal * -impulse;
                    second.Velocity += normal * impulse;
                    first.Velocity += normal * (-RaceConfig.CollisionPush * 0.5f);
                    second.Velocity += normal * (RaceConfig.CollisionPush * 0.5f);

                    float impact = -approach;
                    float firstBias = fc.IsPlayer ? 0.9f : 1.15f;
                    float secondBias = sc.IsPlayer ? 0.9f : 1.15f;
                    first.Velocity *= 1 - Mathf.Min(0.38f, impact * 0.035f * firstBias);
                    second.Velocity *= 1 - Mathf.Min(0.38f, impact * 0.035f * secondBias);

                    float spin = Mathf.Min(2.4f, impact * 0.08f);
                    Vector3 a1 = first.AngularVelocity; a1.y -= spin * firstBias; first.AngularVelocity = a1;
                    Vector3 a2 = second.AngularVelocity; a2.y += spin * secondBias; second.AngularVelocity = a2;
                }
            }
        }

        void UpdatePositions()
        {
            sorted.Clear();
            sorted.AddRange(Competitors);
            // Ordenação estável (a do JS também é): empates mantêm a ordem de entrada.
            for (int i = 1; i < sorted.Count; i++)
            {
                Competitor key = sorted[i];
                int j = i - 1;
                while (j >= 0 && Compare(sorted[j], key) > 0)
                {
                    sorted[j + 1] = sorted[j];
                    j--;
                }
                sorted[j + 1] = key;
            }
            for (int i = 0; i < sorted.Count; i++) sorted[i].Position = i + 1;
        }

        static int Compare(Competitor a, Competitor b)
        {
            if (a.Finished != b.Finished) return a.Finished ? -1 : 1;
            if (a.Finished && b.Finished) return a.FinishTime.CompareTo(b.FinishTime);
            return b.Progress.CompareTo(a.Progress);
        }

        public void Reset()
        {
            Elapsed = 0;
            PlayersFinished = false;
            PlayerPosition = 0;
            Winner = null;
            foreach (Competitor c in Competitors)
            {
                c.Progress = 0;
                c.Lap = 0;
                c.Finished = false;
                c.FinishTime = 0;
                c.LastSampleIndex = path.NearestSampleIndex(c.Kart.Body.Position.x, c.Kart.Body.Position.z);
                c.Tracker.Reset();
            }
        }
    }

    /// <summary>
    /// Piloto rival (rivals/racerController.ts): persegue o eixo da pista e lê a
    /// curvatura À FRENTE para decidir a velocidade. Não trapaceia: produz o
    /// mesmo `InputState` do teclado e entrega ao mesmo `Kart`.
    /// </summary>
    public sealed class RacerController
    {
        readonly InputState input = new InputState();
        readonly CircuitPath path;
        readonly RaceConfig.RivalProfile profile;
        readonly float steerSign;
        float clock;

        public RacerController(CircuitPath path, RaceConfig.RivalProfile profile, float phase, float steerSign)
        {
            this.path = path;
            this.profile = profile;
            clock = phase;
            this.steerSign = steerSign;
        }

        public InputState Update(float dt, Kart kart)
        {
            clock += dt;
            Vector3 position = kart.Body.Position;
            int index = path.NearestSampleIndex(position.x, position.z);
            int count = path.Count;

            // Desvio da linha ideal: senóide lenta com fase por piloto.
            float drift = Mathf.Sin(clock / profile.WanderPeriod * Mathf.PI * 2) * profile.Wander;
            int aheadIndex = (index + RaceConfig.Rival.LookaheadSamples) % count;
            float lateralLimit = path.Samples[aheadIndex].HalfWidth * 0.7f;
            Vector3 target = path.PointAt(aheadIndex, MathUtil.Clamp(drift, -lateralLimit, lateralLimit), 0);

            Vector3 forward = kart.Body.DirectionToWorld(Vector3.forward);
            forward.y = 0;
            forward.Normalize();

            float dx = target.x - position.x, dz = target.z - position.z;
            float distance = MathUtil.Hypot(dx, dz);
            float steer = 0;
            if (distance > 1e-4f)
            {
                float cross = forward.z * (dx / distance) - forward.x * (dz / distance);
                float dot = forward.x * (dx / distance) + forward.z * (dz / distance);
                steer = MathUtil.Clamp(steerSign * Mathf.Atan2(cross, dot) * RaceConfig.Rival.SteerGain, -1, 1);
            }

            // Escorregando demais: endireita em vez de insistir.
            if (Mathf.Abs(kart.Telemetry.SlipAngleDeg) > RaceConfig.Rival.CountersteerAngle)
                steer = MathUtil.Clamp(steer * 0.25f, -1, 1);

            int brakeIndex = (index + RaceConfig.Rival.BrakeLookaheadSamples) % count;
            float curvature = Mathf.Abs(path.Samples[brakeIndex].Curvature);
            float radius = curvature > 1e-4f ? 1f / curvature : 1000f;
            float targetSpeed = Mathf.Min(
                RaceConfig.Rival.MaxSpeed * profile.Pace,
                Mathf.Sqrt(RaceConfig.Rival.CorneringAccel * radius) * profile.Cornering);

            float speed = kart.Telemetry.Speed;
            input.Throttle = speed < targetSpeed ? profile.Pace : 0;
            input.Brake = speed > targetSpeed * RaceConfig.Rival.BrakeThreshold ? 1 : 0;
            input.Steer = steer;
            input.Handbrake = false;
            input.RespawnPressed = false;
            input.PausePressed = false;
            return input;
        }

        /// <summary>
        /// Descobre para que lado `steer = +1` gira, simulando dois segundos.
        /// Medido em vez de deduzido: chutar esse sinal já custou uma sessão
        /// inteira de depuração no original.
        /// </summary>
        public static float MeasureSteerSign(IGroundSampler ground)
        {
            var probe = new Kart();
            var input = new InputState { Throttle = 1, Steer = 1 };
            float yaw = 0;
            const float dt = 1f / 60f;
            for (int i = 0; i < 120; i++)
            {
                probe.Update(dt, input, ground);
                yaw += probe.Body.AngularVelocity.y * dt;
            }
            float sign = MathUtil.Sign(yaw);
            return sign == 0 ? 1 : sign;
        }
    }
}
