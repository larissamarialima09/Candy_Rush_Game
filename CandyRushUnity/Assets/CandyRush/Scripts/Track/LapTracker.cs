using UnityEngine;

namespace CandyRush
{
    /// <summary>Um portal atravessando a pista.</summary>
    public sealed class Checkpoint
    {
        public int SampleIndex;
        public Vector3 Position;
        public Vector3 Forward;
        public float HalfWidth;
        public float Heading;
    }

    /// <summary>
    /// Checkpoints em sequência, voltas e cronometragem (track/lapTracker.ts).
    /// A volta só fecha se TODOS os portais forem cruzados na ordem, e a
    /// detecção é por cruzamento de plano — funciona em qualquer velocidade.
    /// </summary>
    public sealed class LapTracker
    {
        public readonly Checkpoint[] Checkpoints;
        public int NextCheckpoint = 1;
        public int LastCheckpoint;
        public int Lap;
        public float CurrentLapTime;
        public float LastLapTime;
        public float BestLapTime = float.PositiveInfinity;
        public bool LapJustCompleted;
        public float OffTrackTimer;
        public bool JustRescued;

        readonly int[] previousSide;
        readonly CircuitPath path;
        bool started;

        public LapTracker(CircuitPath path)
        {
            this.path = path;
            int count = TrackConfig.CheckpointCount;
            Checkpoints = new Checkpoint[count];
            for (int i = 0; i < count; i++)
            {
                int sampleIndex = path.IndexAtFraction((float)i / count);
                PathSample s = path.Samples[sampleIndex];
                Checkpoints[i] = new Checkpoint
                {
                    SampleIndex = sampleIndex,
                    Position = s.Position,
                    Forward = s.Tangent,
                    HalfWidth = s.HalfWidth + TrackConfig.CheckpointLateralMargin,
                    Heading = Mathf.Atan2(s.Tangent.x, s.Tangent.z),
                };
            }
            previousSide = new int[count];
            for (int i = 0; i < count; i++) previousSide[i] = -1;
        }

        public void Update(float dt, Kart kart)
        {
            LapJustCompleted = false;
            JustRescued = false;
            UpdateCrossings(kart.Body.ChassisPosition);
            if (started) CurrentLapTime += dt;
            UpdateOffTrack(dt, kart);
        }

        void UpdateCrossings(Vector3 kartPosition)
        {
            for (int i = 0; i < Checkpoints.Length; i++)
            {
                Checkpoint checkpoint = Checkpoints[i];
                Vector3 toKart = kartPosition - checkpoint.Position;
                int side = Vector3.Dot(toKart, checkpoint.Forward) >= 0 ? 1 : -1;
                int previous = previousSide[i];
                previousSide[i] = side;

                // Só a travessia de trás para a frente, dentro da largura.
                if (previous >= 0 || side <= 0) continue;
                PathSample s = path.Samples[checkpoint.SampleIndex];
                float lateral = Mathf.Abs(toKart.x * s.Left.x + toKart.z * s.Left.z);
                if (lateral > checkpoint.HalfWidth) continue;
                OnCheckpointCrossed(i);
            }
        }

        void OnCheckpointCrossed(int index)
        {
            if (index == 0)
            {
                if (!started)
                {
                    started = true;
                    CurrentLapTime = 0;
                    NextCheckpoint = 1;
                    LastCheckpoint = 0;
                    return;
                }
                if (NextCheckpoint != 0) return;

                Lap++;
                LastLapTime = CurrentLapTime;
                if (LastLapTime < BestLapTime) BestLapTime = LastLapTime;
                CurrentLapTime = 0;
                LapJustCompleted = true;
                NextCheckpoint = 1;
                LastCheckpoint = 0;
                return;
            }
            if (index != NextCheckpoint) return;
            LastCheckpoint = index;
            NextCheckpoint = (index + 1) % Checkpoints.Length;
        }

        /// <summary>Fora da pista por tempo demais: volta ao ÚLTIMO portal válido.</summary>
        void UpdateOffTrack(float dt, Kart kart)
        {
            if (!kart.Telemetry.OffTrack || kart.Telemetry.WheelsOnGround == 0)
            {
                OffTrackTimer = 0;
                return;
            }
            OffTrackTimer += dt;
            if (OffTrackTimer < TrackConfig.OffTrackGraceSeconds) return;
            Rescue(kart);
        }

        public void Rescue(Kart kart)
        {
            Checkpoint checkpoint = Checkpoints[LastCheckpoint];
            kart.RespawnAt(checkpoint.Position + new Vector3(0, TrackConfig.RespawnHeight, 0), checkpoint.Heading);
            OffTrackTimer = 0;
            JustRescued = true;
        }

        public void Reset()
        {
            NextCheckpoint = 1;
            LastCheckpoint = 0;
            Lap = 0;
            CurrentLapTime = 0;
            LastLapTime = 0;
            BestLapTime = float.PositiveInfinity;
            OffTrackTimer = 0;
            started = false;
            for (int i = 0; i < previousSide.Length; i++) previousSide[i] = -1;
        }

        public float LapProgress
        {
            get
            {
                int count = Checkpoints.Length;
                int done = NextCheckpoint == 0 ? count : NextCheckpoint;
                return (float)done / count;
            }
        }
    }

    /// <summary>O que aconteceu no contato com a barreira neste passo.</summary>
    public sealed class BarrierContact
    {
        public bool Touching;
        public Vector3 Point;
        public float ImpactSpeed;
        public float SlideSpeed;
    }

    /// <summary>
    /// Barreiras laterais que RASPAM em vez de travar (track/barriers.ts): a
    /// componente contra o muro é absorvida e a componente ao longo dele é
    /// preservada.
    /// </summary>
    public sealed class BarrierSystem
    {
        public readonly BarrierContact Contact = new BarrierContact();
        readonly CircuitPath path;

        public BarrierSystem(CircuitPath path) { this.path = path; }

        public void Update(float dt, Kart kart)
        {
            Contact.Touching = false;
            Contact.ImpactSpeed = 0;
            Contact.SlideSpeed = 0;

            RigidBody body = kart.Body;
            Vector3 position = body.ChassisPosition;
            int index = path.NearestSampleIndex(position.x, position.z);
            PathSample s = path.Samples[index];
            float lateral = path.LateralOffset(index, position.x, position.z);

            float limit = s.HalfWidth + TrackConfig.BarrierOffsetFromEdge - TrackConfig.BarrierKartRadius;
            float penetration = Mathf.Abs(lateral) - limit;
            if (penetration <= 0) return;

            // Normal do muro, apontando PARA DENTRO da pista.
            float side = MathUtil.Sign(lateral);
            if (side == 0) side = 1;
            Vector3 normal = s.Left * -side;

            position += normal * penetration;
            body.Position += normal * penetration;

            float approaching = Vector3.Dot(body.Velocity, normal);
            if (approaching < 0)
            {
                Vector3 normalVelocity = normal * approaching;
                Vector3 tangentVelocity = body.Velocity - normalVelocity;
                // Atrito do raspão é POR SEGUNDO, convertido para este passo.
                body.Velocity = tangentVelocity * Mathf.Pow(TrackConfig.BarrierSlidePerSecond, dt)
                                - normalVelocity * TrackConfig.BarrierRestitution;
                Contact.ImpactSpeed = -approaching;
                Contact.SlideSpeed = tangentVelocity.magnitude;
            }
            else
            {
                Contact.SlideSpeed = body.Velocity.magnitude;
            }

            // Alinha o kart com o muro, convergindo para a taxa de guinada certa.
            Vector3 forward = body.DirectionToWorld(Vector3.forward);
            forward.y = 0;
            if (forward.sqrMagnitude > 1e-6f)
            {
                forward.Normalize();
                Vector3 wall = new Vector3(s.Tangent.x, 0, s.Tangent.z).normalized;
                if (Vector3.Dot(forward, wall) < 0) wall = -wall;
                float cross = forward.z * wall.x - forward.x * wall.z;
                float angle = Mathf.Atan2(cross, Vector3.Dot(forward, wall));
                float desiredYawRate = angle * TrackConfig.BarrierAlignment;
                Vector3 av = body.AngularVelocity;
                av.y += (desiredYawRate - av.y) * MathUtil.Clamp(TrackConfig.BarrierAlignment * dt, 0, 1);
                body.AngularVelocity = av;
            }

            Contact.Touching = true;
            Contact.Point = position - normal * TrackConfig.BarrierKartRadius;
            Contact.Point.y = path.SurfaceHeight(index, lateral) + 0.3f;
        }
    }
}
