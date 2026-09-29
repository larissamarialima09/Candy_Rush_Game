using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace CandyRush
{
    /// <summary>
    /// Pool fixo de partículas numa malha só, com mistura aditiva
    /// (fx/particleSystem.ts): desbotar até o preto é o mesmo que sumir.
    /// A malha é reescrita a cada quadro com discos virados para a câmera.
    /// </summary>
    public sealed class CandyParticles
    {
        readonly int capacity;
        readonly Vector3[] positions, velocities;
        readonly float[] life, maxLife, startSize, endSize, drag;
        readonly Color[] colorStart, colorEnd;
        int cursor;
        public int Alive;

        readonly Mesh mesh;
        readonly Vector3[] vertices;
        readonly Color[] colors;
        readonly Vector2[] uvs;

        public CandyParticles(Transform world)
        {
            capacity = QualityConfig.ParticlePoolSize;
            positions = new Vector3[capacity];
            velocities = new Vector3[capacity];
            life = new float[capacity];
            maxLife = new float[capacity];
            startSize = new float[capacity];
            endSize = new float[capacity];
            drag = new float[capacity];
            colorStart = new Color[capacity];
            colorEnd = new Color[capacity];

            vertices = new Vector3[capacity * 4];
            colors = new Color[capacity * 4];
            uvs = new Vector2[capacity * 4];
            var indices = new int[capacity * 6];
            for (int i = 0; i < capacity; i++)
            {
                uvs[i * 4] = new Vector2(0, 0);
                uvs[i * 4 + 1] = new Vector2(1, 0);
                uvs[i * 4 + 2] = new Vector2(1, 1);
                uvs[i * 4 + 3] = new Vector2(0, 1);
                indices[i * 6] = i * 4;
                indices[i * 6 + 1] = i * 4 + 1;
                indices[i * 6 + 2] = i * 4 + 2;
                indices[i * 6 + 3] = i * 4;
                indices[i * 6 + 4] = i * 4 + 2;
                indices[i * 6 + 5] = i * 4 + 3;
            }
            mesh = new Mesh { name = "particles" };
            mesh.MarkDynamic();
            mesh.vertices = vertices;
            mesh.colors = colors;
            mesh.uv = uvs;
            mesh.triangles = indices;
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 5000);

            Mat material = Mats.UnlitAdditive();
            material.Material.SetTexture("_MainTex", ProceduralTextures.SoftDisc());
            SceneKit.Mesh(world, mesh, material, false, false, "particles");
        }

        /// <summary>Emite uma partícula. O pool é circular: a mais antiga é reciclada.</summary>
        public void Spawn(Vector3 position, Vector3 velocity, float lifeSeconds, float start, float end, int colorA, int colorB, float dragPerSecond)
        {
            int i = cursor;
            cursor = (cursor + 1) % capacity;
            positions[i] = position;
            velocities[i] = velocity;
            life[i] = lifeSeconds;
            maxLife[i] = lifeSeconds;
            startSize[i] = start;
            endSize[i] = end;
            drag[i] = dragPerSecond;
            colorStart[i] = Hex.Linear(colorA);
            colorEnd[i] = Hex.Linear(colorB);
        }

        /// <summary>Avança e redesenha. `right`/`up` são os eixos da câmera no referencial do three.</summary>
        public void Update(float dt, Vector3 right, Vector3 up)
        {
            int alive = 0;
            for (int i = 0; i < capacity; i++)
            {
                int v = i * 4;
                if (life[i] <= 0)
                {
                    vertices[v] = vertices[v + 1] = vertices[v + 2] = vertices[v + 3] = Vector3.zero;
                    continue;
                }
                life[i] -= dt;
                if (life[i] <= 0)
                {
                    vertices[v] = vertices[v + 1] = vertices[v + 2] = vertices[v + 3] = Vector3.zero;
                    continue;
                }
                alive++;
                float t = 1 - life[i] / maxLife[i];
                velocities[i] *= Mathf.Max(0, 1 - drag[i] * dt);
                positions[i] += velocities[i] * dt;

                // O disco do original tinha diâmetro 1 vezes a escala.
                float half = (startSize[i] + (endSize[i] - startSize[i]) * t) * 0.5f;
                Vector3 r = right * half, u = up * half, p = positions[i];
                vertices[v] = p - r - u;
                vertices[v + 1] = p + r - u;
                vertices[v + 2] = p + r + u;
                vertices[v + 3] = p - r + u;
                Color c = Color.Lerp(colorStart[i], colorEnd[i], t) * (1 - t * t);
                c.a = 1;
                colors[v] = colors[v + 1] = colors[v + 2] = colors[v + 3] = c;
            }
            Alive = alive;
            mesh.vertices = vertices;
            mesh.colors = colors;
        }
    }

    /// <summary>
    /// Liga o estado do kart às partículas (fx/kartEffects.ts): fumaça de drift
    /// com a cor do NÍVEL de carga, rastro de turbo, poeira fora da pista e
    /// faíscas no raspão. Só visual, com deltaTime variável.
    /// </summary>
    public sealed class KartEffects
    {
        readonly Kart kart;
        readonly CandyParticles particles;
        float driftDebt, boostDebt, dustDebt, sparkDebt;
        static float Rand() => Random.value;

        public KartEffects(Kart kart, CandyParticles particles)
        {
            this.kart = kart;
            this.particles = particles;
        }

        public void Update(float dt, BarrierContact barrier)
        {
            if (dt <= 0) return;
            EmitDriftSmoke(dt);
            EmitBoostTrail(dt);
            EmitSurfaceDust(dt);
            if (barrier != null && barrier.Touching) EmitSparks(dt, barrier);
            else sparkDebt = 0;
        }

        void EmitSurfaceDust(float dt)
        {
            float speed = kart.Telemetry.Speed;
            if (speed < EffectsConfig.SurfaceParticles.MinSpeed)
            {
                dustDebt = 0;
                return;
            }
            float intensity = Mathf.Min(1, speed / EffectsConfig.SurfaceParticles.ReferenceSpeed);
            dustDebt += EffectsConfig.SurfaceParticles.Rate * intensity * dt;
            int perWheel = Mathf.FloorToInt(dustDebt);
            dustDebt -= perWheel;
            if (perWheel == 0) return;

            foreach (Wheel wheel in kart.Wheels)
            {
                if (!wheel.Grounded) continue;
                SurfaceMaterial material = TrackConfig.Surface(wheel.Surface);
                if (material.Particle == SurfaceParticle.None) continue;
                for (int n = 0; n < perWheel; n++)
                {
                    Vector3 position = wheel.ContactPoint + new Vector3(0, 0.05f, 0);
                    Vector3 velocity = Vector3.up * (EffectsConfig.SurfaceParticles.UpwardSpeed * (0.5f + Rand())) + kart.Body.Velocity * -0.12f;
                    velocity.x += (Rand() - 0.5f) * EffectsConfig.SurfaceParticles.Spread;
                    velocity.z += (Rand() - 0.5f) * EffectsConfig.SurfaceParticles.Spread;
                    particles.Spawn(position, velocity, EffectsConfig.SurfaceParticles.Life * (0.7f + Rand() * 0.6f),
                        EffectsConfig.SurfaceParticles.StartSize, EffectsConfig.SurfaceParticles.EndSize,
                        material.ParticleColor, material.ParticleColor, EffectsConfig.SurfaceParticles.Drag);
                }
            }
        }

        void EmitSparks(float dt, BarrierContact barrier)
        {
            float intensity = Mathf.Min(1, barrier.SlideSpeed / EffectsConfig.Sparks.ReferenceSpeed);
            if (intensity <= 0.05f) return;
            sparkDebt += EffectsConfig.Sparks.Rate * intensity * dt;
            while (sparkDebt >= 1)
            {
                sparkDebt -= 1;
                Vector3 velocity = kart.Body.Velocity * -0.25f + Vector3.up * (EffectsConfig.Sparks.Speed * 0.35f);
                velocity.x += (Rand() - 0.5f) * EffectsConfig.Sparks.Spread;
                velocity.y += Rand() * EffectsConfig.Sparks.Spread * 0.5f;
                velocity.z += (Rand() - 0.5f) * EffectsConfig.Sparks.Spread;
                particles.Spawn(barrier.Point, velocity, EffectsConfig.Sparks.Life * (0.6f + Rand() * 0.8f),
                    EffectsConfig.Sparks.StartSize, EffectsConfig.Sparks.EndSize,
                    EffectsConfig.Sparks.ColorStart, EffectsConfig.Sparks.ColorEnd, EffectsConfig.Sparks.Drag);
            }
        }

        void EmitDriftSmoke(float dt)
        {
            DriftSystem drift = kart.Drift;
            if (!drift.Drifting)
            {
                driftDebt = 0;
                return;
            }
            Vector3 lateral = kart.Body.DirectionToWorld(Vector3.right);
            lateral.y = 0;
            lateral.Normalize();
            int color = EffectsConfig.DriftParticles.ColorByLevel[Mathf.Min(drift.Level, 3)];
            float intensity = Mathf.Min(1, Mathf.Abs(kart.Telemetry.SlipAngleDeg) / 35f);
            driftDebt += EffectsConfig.DriftParticles.Rate * intensity * dt;
            int perWheel = Mathf.FloorToInt(driftDebt);
            driftDebt -= perWheel;
            if (perWheel == 0) return;

            foreach (Wheel wheel in kart.Wheels)
            {
                if (wheel.Spec.IsFront || !wheel.Grounded) continue;
                for (int n = 0; n < perWheel; n++)
                {
                    Vector3 position = wheel.ContactPoint + new Vector3(0, 0.06f, 0);
                    Vector3 velocity = Vector3.up * (EffectsConfig.DriftParticles.UpwardSpeed * (0.6f + Rand() * 0.8f))
                                       + lateral * (-drift.Direction * EffectsConfig.DriftParticles.LateralSpeed * Rand());
                    velocity.x += (Rand() - 0.5f) * EffectsConfig.DriftParticles.Spread;
                    velocity.z += (Rand() - 0.5f) * EffectsConfig.DriftParticles.Spread;
                    particles.Spawn(position, velocity, EffectsConfig.DriftParticles.Life * (0.7f + Rand() * 0.6f),
                        EffectsConfig.DriftParticles.StartSize, EffectsConfig.DriftParticles.EndSize, color, color,
                        EffectsConfig.DriftParticles.Drag);
                }
            }
        }

        void EmitBoostTrail(float dt)
        {
            DriftSystem drift = kart.Drift;
            if (!drift.IsBoosting)
            {
                boostDebt = 0;
                return;
            }
            Vector3 forward = kart.Body.DirectionToWorld(Vector3.forward);
            Vector3 origin = kart.Body.ChassisPosition - forward * 0.95f + new Vector3(0, 0.15f, 0);
            int color = EffectsConfig.BoostParticles.ColorByLevel[Mathf.Min(drift.BoostLevel, 3)];
            boostDebt += EffectsConfig.BoostParticles.Rate * drift.BoostTimeRemaining * dt;
            while (boostDebt >= 1)
            {
                boostDebt -= 1;
                Vector3 position = origin + new Vector3((Rand() - 0.5f) * 0.7f, 0, (Rand() - 0.5f) * 0.7f);
                Vector3 velocity = forward * -EffectsConfig.BoostParticles.BackwardSpeed + kart.Body.Velocity * 0.25f;
                velocity.x += (Rand() - 0.5f) * EffectsConfig.BoostParticles.Spread;
                velocity.y += Rand() * EffectsConfig.BoostParticles.Spread * 0.6f;
                velocity.z += (Rand() - 0.5f) * EffectsConfig.BoostParticles.Spread;
                particles.Spawn(position, velocity, EffectsConfig.BoostParticles.Life * (0.7f + Rand() * 0.6f),
                    EffectsConfig.BoostParticles.StartSize, EffectsConfig.BoostParticles.EndSize, color,
                    EffectsConfig.BoostParticles.ColorByLevel[0], EffectsConfig.BoostParticles.Drag);
            }
        }
    }

    /// <summary>
    /// Marcas de pneu (fx/skidMarks.ts): um anel de quadriláteros numa malha
    /// só, cada um desbotando no próprio tempo pelo alfa do vértice.
    /// </summary>
    public sealed class SkidMarks
    {
        const float Width = 0.28f, Lift = 0.035f, MinSegment = 0.25f, MinSlip = 1.4f, FullSlip = 5f, MaxOpacity = 0.5f, Life = 9f;

        sealed class Trail
        {
            public Vector3 LastPoint;
            public bool Started;
        }

        readonly int capacity;
        readonly Vector3[] vertices;
        readonly Color[] colors;
        readonly float[] born, strength;
        readonly Dictionary<Wheel, Trail> trails = new Dictionary<Wheel, Trail>();
        readonly Mesh mesh;
        int cursor;
        float clock;
        bool dirty;

        public SkidMarks(Transform world)
        {
            capacity = QualityConfig.SkidMarkCount;
            vertices = new Vector3[capacity * 6];
            colors = new Color[capacity * 6];
            born = new float[capacity];
            strength = new float[capacity];
            for (int i = 0; i < capacity; i++) born[i] = -1000;
            var indices = new int[capacity * 6];
            for (int i = 0; i < indices.Length; i++) indices[i] = i;

            mesh = new Mesh { name = "skid-marks" };
            mesh.MarkDynamic();
            mesh.vertices = vertices;
            mesh.colors = colors;
            mesh.triangles = indices;
            mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 5000);
            SceneKit.Mesh(world, mesh, Mats.UnlitVertexAlpha(), false, false, "skid-marks");
            Fade();
        }

        /// <summary>Recebe TODOS os karts de uma vez: o relógio vale para a malha inteira.</summary>
        public void Update(float dt, IList<Kart> karts)
        {
            clock += dt;
            foreach (Kart kart in karts)
                foreach (Wheel wheel in kart.Wheels) UpdateWheel(wheel);
            Fade();
        }

        void UpdateWheel(Wheel wheel)
        {
            if (!trails.TryGetValue(wheel, out Trail trail))
            {
                trail = new Trail();
                trails[wheel] = trail;
            }
            float slip = Mathf.Abs(wheel.SlipLateral);
            if (!wheel.Grounded || slip < MinSlip)
            {
                trail.Started = false;
                return;
            }
            if (!trail.Started)
            {
                trail.LastPoint = wheel.ContactPoint;
                trail.Started = true;
                return;
            }

            Vector3 travel = wheel.ContactPoint - trail.LastPoint;
            travel.y = 0;
            if (travel.sqrMagnitude < MinSegment * MinSegment) return;
            travel.Normalize();
            Vector3 perpendicular = Vector3.Cross(Vector3.up, travel).normalized * (Width * 0.5f);
            Vector3 lift = new Vector3(0, Lift, 0);

            Vector3 fromLeft = trail.LastPoint + perpendicular + lift;
            Vector3 fromRight = trail.LastPoint - perpendicular + lift;
            Vector3 toLeft = wheel.ContactPoint + perpendicular + lift;
            Vector3 toRight = wheel.ContactPoint - perpendicular + lift;

            int quad = cursor;
            cursor = (cursor + 1) % capacity;
            born[quad] = clock;
            strength[quad] = MathUtil.Clamp((slip - MinSlip) / (FullSlip - MinSlip), 0, 1);
            int b = quad * 6;
            vertices[b] = fromLeft;
            vertices[b + 1] = fromRight;
            vertices[b + 2] = toRight;
            vertices[b + 3] = fromLeft;
            vertices[b + 4] = toRight;
            vertices[b + 5] = toLeft;
            dirty = true;
            trail.LastPoint = wheel.ContactPoint;
        }

        void Fade()
        {
            for (int quad = 0; quad < capacity; quad++)
            {
                float age = clock - born[quad];
                float alpha = age < 0 || age > Life ? 0 : (1 - age / Life) * MaxOpacity * strength[quad];
                // Escura e levemente arroxeada: preto puro fica duro contra o rosa.
                var c = new Color(0.16f, 0.1f, 0.16f, alpha);
                int b = quad * 6;
                for (int v = 0; v < 6; v++) colors[b + v] = c;
            }
            if (dirty) mesh.vertices = vertices;
            dirty = false;
            mesh.colors = colors;
        }

        public void Clear()
        {
            for (int i = 0; i < capacity; i++) born[i] = -1000;
            trails.Clear();
            Fade();
        }
    }

    /// <summary>
    /// A musiquinha do original (CandyMusic no main.ts): arpejo em onda
    /// triangular e baixo senoidal, um passo a cada 185 ms. Sintetizada em
    /// tempo real, sem arquivo de áudio.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public sealed class CandyMusic : MonoBehaviour
    {
        static readonly double[] Notes = { 523.25, 659.25, 783.99, 1046.5, 880, 783.99, 659.25, 587.33 };
        static readonly double[] Bass = { 261.63, 329.63, 392, 329.63 };
        const double StepSeconds = 0.185;

        sealed class Voice
        {
            public double Frequency, Phase, Start, Duration, Volume;
            public bool Triangle;
        }

        readonly List<Voice> voices = new List<Voice>();
        readonly object gate = new object();
        double sampleRate, time, nextStep;
        int step;
        bool playing;

        void Awake()
        {
            sampleRate = AudioSettings.outputSampleRate;
            var source = GetComponent<AudioSource>();
            // Um clipe mudo em laço mantém a fonte "tocando"; o som de verdade
            // é escrito em OnAudioFilterRead.
            int rate = Mathf.Max(8000, (int)sampleRate);
            source.clip = AudioClip.Create("candy-music-carrier", rate, 1, rate, false);
            source.playOnAwake = true;
            source.loop = true;
            source.spatialBlend = 0;
            source.volume = 1;
            if (!source.isPlaying) source.Play();
        }

        /// <summary>Começa a tocar (no original, no primeiro clique ou tecla).</summary>
        public void Begin() => playing = true;

        void OnAudioFilterRead(float[] data, int channels)
        {
            if (sampleRate <= 0) return;
            double dt = 1.0 / sampleRate;
            lock (gate)
            {
                for (int i = 0; i < data.Length; i += channels)
                {
                    if (playing && time >= nextStep)
                    {
                        voices.Add(new Voice { Frequency = Notes[step % Notes.Length], Start = time, Duration = 0.105, Volume = 0.05, Triangle = true });
                        if (step % 2 == 0)
                            voices.Add(new Voice { Frequency = Bass[(step / 2) % Bass.Length], Start = time, Duration = 0.18, Volume = 0.032 });
                        step++;
                        nextStep = time + StepSeconds;
                    }

                    double sample = 0;
                    for (int v = voices.Count - 1; v >= 0; v--)
                    {
                        Voice voice = voices[v];
                        double age = time - voice.Start;
                        if (age > voice.Duration + 0.02)
                        {
                            voices.RemoveAt(v);
                            continue;
                        }
                        // Envelope exponencial: sobe em 18 ms e cai até o fim da nota.
                        double env = age < 0.018
                            ? 0.0001 * System.Math.Pow(voice.Volume / 0.0001, age / 0.018)
                            : voice.Volume * System.Math.Pow(0.0001 / voice.Volume, System.Math.Min(1, (age - 0.018) / (voice.Duration - 0.018)));
                        voice.Phase += voice.Frequency * dt;
                        double p = voice.Phase - System.Math.Floor(voice.Phase);
                        double wave = voice.Triangle ? 1 - 4 * System.Math.Abs(p - 0.5) : System.Math.Sin(p * System.Math.PI * 2);
                        sample += wave * env;
                    }
                    for (int c = 0; c < channels; c++) data[i + c] = (float)sample;
                    time += dt;
                }
            }
        }
    }
}
