using UnityEngine;

namespace CandyRush
{
    // =====================================================================
    // Todo o tuning do jogo, portado de `src/config/*.ts`.
    //
    // Os valores que o `main.ts` sobrescrevia na inicialização
    // (applyDrivingTuning, applyLightingTuning, applyCircuitVisualTuning) já
    // estão aplicados aqui, com o valor antigo anotado ao lado. Nenhum destes
    // números deve aparecer escrito à mão dentro da lógica.
    // =====================================================================

    /// <summary>Constantes globais de simulação (config/physics.ts).</summary>
    public static class PhysicsConfig
    {
        /// <summary>Passo fixo da simulação, em segundos. 1/60 = 60 Hz.</summary>
        public static float FixedTimeStep = 1f / 60f;
        /// <summary>Máximo de passos de física por quadro: evita a "espiral da morte".</summary>
        public static int MaxStepsPerFrame = 5;
        /// <summary>Tempo máximo de quadro aceito pelo acumulador.</summary>
        public static float MaxFrameTime = 0.25f;
        /// <summary>Gravidade exagerada de propósito: kart mais colado ao chão.</summary>
        public static float Gravity = -18f;
    }

    /// <summary>O kart (config/kart.ts). Eixos locais: +X, +Y cima, +Z frente.</summary>
    public static class KartConfig
    {
        public static class Chassis
        {
            public static float Mass = 165f;
            public static Vector3 Size = new Vector3(1.05f, 0.5f, 1.85f);
            // main.ts: y -0.2 -> -0.24, z -0.09 -> -0.12
            public static Vector3 CenterOfMass = new Vector3(0f, -0.24f, -0.12f);
            public static Vector3 InertiaScale = new Vector3(1f, 0.75f, 1.6f);
            public static float LinearDamping = 0.02f;
            // main.ts: 0.55 -> 0.75
            public static float AngularDamping = 0.75f;
        }

        public static class Wheels
        {
            public static float HalfTrackFront = 0.58f;
            public static float HalfTrackRear = 0.62f;
            public static float FrontAxleZ = 0.66f;
            public static float RearAxleZ = -0.66f;
            public static float AttachY = -0.13f;
            public static float RadiusFront = 0.24f;
            public static float RadiusRear = 0.27f;
            public static float Width = 0.2f;
        }

        public static class Suspension
        {
            public static float RestLength = 0.26f;
            public static float MaxTravel = 0.2f;
            public static float Stiffness = 14000f;
            /// <summary>Leia o limite de estabilidade em config/kart.ts antes de aumentar.</summary>
            public static float DamperBump = 500f;
            public static float DamperRebound = 800f;
            public static float MaxForce = 14000f;
        }

        public static class Engine
        {
            // main.ts: 2050 -> 1880
            public static float MaxDriveForce = 1880f;
            // main.ts: 40 -> 35
            public static float PowerCutoffSpeed = 35f;
            public static float PowerFalloffExponent = 2f;
            public static float ReverseForce = 1300f;
            public static float ReverseTopSpeed = 9f;
            public static float ReverseEngageSpeed = 0.6f;
        }

        public static class Brakes
        {
            public static float Force = 4200f;
            public static float FrontBias = 0.62f;
            // main.ts: 4 -> 6
            public static float RollingResistance = 6f;
            // main.ts: 4 -> 7
            public static float EngineBraking = 7f;
        }

        public static class Handbrake
        {
            // main.ts: 0.5 -> 0.62
            public static float RearGripMultiplier = 0.62f;
            // main.ts: 600 -> 450
            public static float RearBrakeForce = 450f;
            public static bool CutsThrottle = false;
        }

        public static class Tires
        {
            // main.ts: 1.5 -> 1.75
            public static float FrontGrip = 1.75f;
            // main.ts: 1.4 -> 1.85
            public static float RearGrip = 1.85f;
            // main.ts: 1.9 -> 2.25
            public static float LongitudinalGrip = 2.25f;
            // main.ts: 0.22 -> 0.27
            public static float TireMassShare = 0.27f;
            public static float ForceApplicationHeight = 0.16f;
            public static bool UseFrictionCircle = true;
            public static float MaxLateralForce = 9000f;
        }

        public static class Steering
        {
            // main.ts: 33 -> 30
            public static float MaxAngleDegrees = 30f;
            // main.ts: 0.35 -> 0.46
            public static float HighSpeedFactor = 0.46f;
            // main.ts: 26 -> 30
            public static float FalloffSpeed = 30f;
            // main.ts: 5 -> 7
            public static float TurnRate = 7f;
            // main.ts: 8 -> 10
            public static float ReturnRate = 10f;
        }

        public static class Aero
        {
            // main.ts: 1.15 -> 1.45
            public static float DragCoefficient = 1.45f;
            // main.ts: 1.6 -> 2.35
            public static float DownforceCoefficient = 2.35f;
        }

        public static class Recovery
        {
            public static float FallThroughHeight = -3f;
            public static float InvertedTimeout = 1.5f;
            public static float StuckSpeed = 2f;
        }

        public static class Spawn
        {
            public static Vector3 Position = new Vector3(0f, 0.9f, 0f);
            public static float HeadingDegrees = 0f;
        }
    }

    /// <summary>Drift e boost (config/drift.ts).</summary>
    public static class DriftConfig
    {
        public static class Detection
        {
            public static float MinSpeed = 8f;
            public static float EnterAngleDeg = 12f;
            public static float ExitAngleDeg = 7f;
            public static float ExitGrace = 0.2f;
            public static float SpinOutAngleDeg = 100f;
        }

        public static class Charge
        {
            public static float BaseRatePerSecond = 1.2f;
            public static float IdealAngleDeg = 40f;
            public static float DepthBonus = 0.9f;
            public static float SpeedReference = 18f;
            public static readonly float[] Levels = { 0.35f, 0.85f, 1.5f };
        }

        public static class Boost
        {
            public static readonly float[] Force = { 700f, 1125f, 1550f };
            public static readonly float[] Duration = { 0.8f, 1.3f, 1.85f };
            public static readonly float[] SpeedCeilingBonus = { 3.5f, 5.5f, 8f };
            public static float DecayExponent = 0.55f;
        }

        public static class Steering
        {
            public static float DriftSteerMultiplier = 1.4f;
            public static float DriftFalloffRelief = 0.5f;
        }
    }

    /// <summary>Câmera perseguidora (config/camera.ts).</summary>
    public static class CameraConfig
    {
        public static float Near = 0.1f;
        public static float Far = 2000f;

        public static float OffsetDistance = 5.6f;
        public static float OffsetHeight = 2.25f;

        public static float FollowStiffness = 180f;
        public static float FollowDamping = 27f;

        public static float AimStiffness = 125f;
        public static float AimDamping = 23f;

        public static float LookAheadBase = 3.8f;
        public static float LookAheadPerSpeed = 0.13f;
        public static float LookHeight = 0.82f;

        public static float AccelMetersPerAccel = 0.035f;
        public static float AccelMaxPullBack = 0.55f;
        public static float AccelMaxPullIn = 0.55f;
        public static float AccelSmoothing = 8f;

        public static float RollDegreesPerLateralAccel = 0.16f;
        public static float RollMaxDegrees = 4.5f;
        public static float RollResponsiveness = 7.5f;
        public static float RollMinSpeed = 3f;

        public static float ShowcaseRevolutionsPerSecond = 0.045f;
        public static float ShowcaseDistance = 5.4f;
        public static float ShowcaseHeight = 2f;
        public static float ShowcaseLookHeight = 0.7f;

        public static float MinHeightAboveGround = 0.65f;
        public static bool SnapOnRespawn = true;
    }

    /// <summary>Sensação de velocidade (config/effects.ts).</summary>
    public static class EffectsConfig
    {
        public static class Fov
        {
            public static float AtRest = 66f;
            public static float AtTopSpeed = 82f;
            public static float BoostBonus = 7f;
            public static float ReferenceSpeed = 26f;
            public static float Responsiveness = 4.5f;
        }

        public static class Shake
        {
            public static float SpeedAmplitude = 0.018f;
            public static float BoostAmplitude = 0.028f;
            public static float OffTrackMultiplier = 2.6f;
            public static float ReferenceSpeed = 26f;
            public static float FrequencyA = 23.3f;
            public static float FrequencyB = 17.1f;
            public static float RollDegrees = 0.4f;
            public static float MinSpeed = 6f;
        }

        public static class Overlay
        {
            public static float VignetteMax = 0.55f;
            public static float VignetteStartSpeed = 12f;
            public static float ReferenceSpeed = 26f;
            public static float SpeedLinesMax = 0.7f;
            public static float ChromaticMax = 0.45f;
            public static float Responsiveness = 5f;
        }

        public static class DriftParticles
        {
            public static float Rate = 90f;
            public static float Life = 0.85f;
            public static float StartSize = 0.28f;
            public static float EndSize = 1.25f;
            public static float UpwardSpeed = 1.6f;
            public static float LateralSpeed = 2.6f;
            public static float Spread = 1.1f;
            public static float Drag = 1.8f;
            public static readonly int[] ColorByLevel = { 0xfff2f7, 0xff9ec4, 0xa89bf0, 0xffd76a };
        }

        public static class BoostParticles
        {
            public static float Rate = 120f;
            public static float Life = 0.55f;
            public static float StartSize = 0.34f;
            public static float EndSize = 0.05f;
            public static float BackwardSpeed = 5.5f;
            public static float Spread = 0.9f;
            public static float Drag = 2.4f;
            public static readonly int[] ColorByLevel = { 0xffffff, 0xffc8dd, 0xc0b6ff, 0xffe08a };
        }

        public static class SurfaceParticles
        {
            public static float Rate = 55f;
            public static float MinSpeed = 4f;
            public static float ReferenceSpeed = 20f;
            public static float Life = 0.7f;
            public static float StartSize = 0.22f;
            public static float EndSize = 0.95f;
            public static float UpwardSpeed = 1.2f;
            public static float Spread = 1.4f;
            public static float Drag = 2.2f;
        }

        public static class Sparks
        {
            public static float Rate = 140f;
            public static float ReferenceSpeed = 20f;
            public static float Life = 0.3f;
            public static float StartSize = 0.14f;
            public static float EndSize = 0.02f;
            public static float Speed = 6.5f;
            public static float Spread = 2.4f;
            public static float Drag = 3.5f;
            public static int ColorStart = 0xfff0c0;
            public static int ColorEnd = 0xff9ec4;
        }
    }

    /// <summary>
    /// Iluminação (config/lighting.ts), já com o `applyLightingTuning` do main.ts.
    ///
    /// Os números do three.js usam unidades físicas e passam por tone mapping
    /// ACES; o pipeline padrão do Unity não tem nada disso. Os fatores de
    /// conversão abaixo foram escolhidos para o mundo pastel sair com o mesmo
    /// brilho — são o primeiro lugar a mexer se a cena parecer clara ou escura
    /// demais.
    /// </summary>
    public static class LightingConfig
    {
        const float KeyBearingDegrees = 34f;
        const float KeyElevationDegrees = 52f;

        // main.ts: 0xbfe0ff/0xffd6e6/1.45 -> 0xd8edff/0xffd9ef/1.65
        public static int HemisphereSky = 0xf1e7ff;
        public static int HemisphereGround = 0xffe8f2;
        public static float HemisphereIntensity = 2.05f;

        // main.ts: 0xfff4e2/2.2 -> 0xfff4dc/2.35
        public static int SunColor = 0xfff8ee;
        public static float SunIntensity = 2.72f;
        public static float SunShadowStrength = 0.68f;
        public static float SunBearingRadians = KeyBearingDegrees * Mathf.PI / 180f;
        public static float SunElevationDegrees = KeyElevationDegrees;

        // main.ts: 0xc8e6ff/0.75 -> 0xbfdfff/1.05
        public static int RimColor = 0xd9ebff;
        public static float RimIntensity = 1.2f;
        public static float RimBearingRadians = (KeyBearingDegrees + 155f) * Mathf.PI / 180f;
        public static float RimElevationDegrees = 20f;

        // main.ts: 0xffd2e6/3.2 -> 0xffb7dc/4.6
        public static int KartLampColor = 0xffedf5;
        public static float KartLampIntensity = 4.6f;
        public static float KartLampDistance = 12f;
        public static float KartLampOffsetY = 2.2f;

        public static float ShadowRadius = 38f;

        public static float FogNear = 210f;
        public static float FogFar = 780f;

        /// <summary>Exposição do tone mapping ACES (main.ts: 1.0 -> 1.05).</summary>
        public static float Exposure = 1.05f;

        // --- Conversão three.js -> Unity ---
        // O three (r155+) divide a luz difusa por PI (BRDF de Lambert) e o
        // Unity não; por isso as luzes entram multiplicadas por 1/PI. A emissão
        // não passa pelo BRDF nos dois motores e fica igual.
        /// <summary>Multiplica a intensidade das luzes diretas do three.</summary>
        public static float DirectScale = 1f / Mathf.PI;
        /// <summary>Multiplica a luz ambiente (hemisfério) do three.</summary>
        public static float AmbientScale = 1f / Mathf.PI;
        /// <summary>Multiplica toda emissão de material.</summary>
        public static float EmissionScale = 1f;
        /// <summary>Converte a lanterna do kart (candela, decaimento 1.8) para a luz pontual do Unity.</summary>
        public static float KartLampScale = 0.14f;
    }

    /// <summary>Orçamento gráfico (config/quality.ts).</summary>
    public static class QualityConfig
    {
        public static int ShadowMapSize = 1024;
        public static int ParticlePoolSize = 300;
        // main.ts: min(6, 4) -> 4
        public static float TerrainCellSize = 4f;
        public static int CandyPropCount = 190;
        public static int TreeCount = 90;
        public static int HillCount = 60;
        public static int CloudCount = 24;
        public static int BalloonCount = 16;
        public static float HorizonPlaneSize = 2500f;
        public static int SkidMarkCount = 320;
    }

    /// <summary>A corrida (config/race.ts).</summary>
    public static class RaceConfig
    {
        public static int Laps = 3;

        public sealed class RivalProfile
        {
            public string Name;
            public string Sprite;
            public float Cornering, Pace, Wander, WanderPeriod;
        }

        public static readonly RivalProfile[] Rivals =
        {
            new RivalProfile { Name = "Bidu", Sprite = "blue", Cornering = 0.94f, Pace = 1.0f, Wander = 1.6f, WanderPeriod = 4.2f },
            new RivalProfile { Name = "Lili", Sprite = "purple", Cornering = 0.9f, Pace = 0.97f, Wander = 2.4f, WanderPeriod = 3.1f },
            new RivalProfile { Name = "Zizo", Sprite = "yellow", Cornering = 0.87f, Pace = 0.95f, Wander = 3.0f, WanderPeriod = 2.4f },
        };

        public static class Rival
        {
            public static int LookaheadSamples = 13;
            public static int BrakeLookaheadSamples = 26;
            public static float SteerGain = 2.1f;
            public static float CorneringAccel = 22f;
            public static float MaxSpeed = 30f;
            public static float BrakeThreshold = 1.08f;
            public static float CountersteerAngle = 26f;
        }

        public static float GridRowSpacing = 4.5f;
        public static float GridLateralOffset = 2.2f;

        public static float CollisionRadius = 1.05f;
        public static float CollisionRestitution = 0.35f;
        public static float CollisionPush = 2.4f;
    }

    /// <summary>Tipos de superfície (config/track.ts).</summary>
    public enum SurfaceKind { Asfalto, Zebra, Grama, Areia }

    public enum SurfaceParticle { None, Poeira, Areia }

    public sealed class SurfaceMaterial
    {
        public float Grip;
        public float MaxSpeed;
        public float RollingResistance;
        public SurfaceParticle Particle;
        public int ParticleColor;
        public bool OffTrack;
    }

    public struct ProfilePoint
    {
        public float At;
        public float Value;
        public ProfilePoint(float at, float value) { At = at; Value = value; }
    }

    /// <summary>A pista como sistema (config/track.ts).</summary>
    public static class TrackConfig
    {
        public static readonly ProfilePoint[] HalfWidthProfile =
        {
            new ProfilePoint(0.0f, 5.6f), new ProfilePoint(0.12f, 5.2f), new ProfilePoint(0.26f, 4.4f),
            new ProfilePoint(0.4f, 5.0f), new ProfilePoint(0.55f, 4.2f), new ProfilePoint(0.68f, 4.8f),
            new ProfilePoint(0.82f, 5.4f), new ProfilePoint(0.93f, 4.6f),
        };

        public static readonly ProfilePoint[] ElevationProfile =
        {
            new ProfilePoint(0.0f, 0.0f), new ProfilePoint(0.16f, 2.6f), new ProfilePoint(0.3f, 3.4f),
            new ProfilePoint(0.45f, 0.8f), new ProfilePoint(0.58f, -1.6f), new ProfilePoint(0.72f, -0.4f),
            new ProfilePoint(0.86f, 1.8f),
        };

        public static float BankingDegreesPerCurvature = 110f;
        public static float BankingMaxDegrees = 9f;
        public static int BankingSmoothingSamples = 14;

        // main.ts força 5.5 (mesmo valor do config).
        public static float RunoffWidth = 5.5f;

        public static float TerrainFadeStart = 45f;
        public static float TerrainFadeEnd = 115f;

        public static int CheckpointCount = 14;
        public static float CheckpointLateralMargin = 6f;

        public static float OffTrackGraceSeconds = 2.6f;
        public static float RespawnHeight = 0.8f;

        public static float BarrierOffsetFromEdge = 5f;
        public static float BarrierKartRadius = 0.75f;
        public static float BarrierRestitution = 0.2f;
        public static float BarrierSlidePerSecond = 0.55f;
        public static float BarrierAlignment = 3.5f;
        public static float BarrierScrapeSpeed = 2.5f;

        public static SurfaceMaterial Surface(SurfaceKind kind) => Surfaces[(int)kind];

        /// <summary>Estes números definem o custo de errar.</summary>
        public static readonly SurfaceMaterial[] Surfaces =
        {
            new SurfaceMaterial { Grip = 1.0f, MaxSpeed = 1.0f, RollingResistance = 1.0f, Particle = SurfaceParticle.None, ParticleColor = 0xffffff, OffTrack = false },
            new SurfaceMaterial { Grip = 0.9f, MaxSpeed = 1.0f, RollingResistance = 1.4f, Particle = SurfaceParticle.None, ParticleColor = 0xffffff, OffTrack = false },
            new SurfaceMaterial { Grip = 0.5f, MaxSpeed = 0.55f, RollingResistance = 3.5f, Particle = SurfaceParticle.Poeira, ParticleColor = 0xd9f2e2, OffTrack = true },
            new SurfaceMaterial { Grip = 0.7f, MaxSpeed = 0.72f, RollingResistance = 2.2f, Particle = SurfaceParticle.Areia, ParticleColor = 0xffe3ee, OffTrack = true },
        };
    }

    /// <summary>Circuito como cenário (config/circuit.ts).</summary>
    public static class CircuitConfig
    {
        public static readonly Vector2[] Centerline =
        {
            new Vector2(0, 0), new Vector2(0, 45), new Vector2(0, 85), new Vector2(-8, 110),
            new Vector2(-26, 128), new Vector2(-50, 135), new Vector2(-76, 134), new Vector2(-98, 126),
            new Vector2(-112, 110), new Vector2(-110, 90), new Vector2(-96, 80), new Vector2(-80, 74),
            new Vector2(-74, 56), new Vector2(-79, 34), new Vector2(-73, 14), new Vector2(-56, 4),
            new Vector2(-38, 6), new Vector2(-24, -6), new Vector2(-22, -24), new Vector2(-12, -38),
            new Vector2(4, -46), new Vector2(18, -40), new Vector2(20, -26), new Vector2(12, -13),
        };

        public static int Samples = 480;
        public static int CurvatureWindow = 5;

        public static float LayerRunoff = 0.03f;
        public static float LayerAsphalt = 0.09f;
        public static float LayerEdgeLine = 0.11f;
        public static float LayerStartLine = 0.115f;
        public static float LayerKerb = 0.13f;

        public static int ColorAsphalt = 0xf0679f;
        // main.ts: 0xbfdfa2 -> 0xffd7e8
        public static int ColorRunoff = 0xffd7e8;
        public static int ColorCenterLine = 0xffffff;
        public static int ColorKerbA = 0xf0518f;
        public static int ColorKerbB = 0xffffff;
        public static int ColorStartLineA = 0xffffff;
        public static int ColorStartLineB = 0x1a1a22;
        // main.ts: 0xb4dc93 -> 0xc5e9a7
        public static int ColorGrass = 0xc5e9a7;
        public static readonly int[] Pastels = { 0xff7fb5, 0x63d0e8, 0xc79bf5, 0xffd24d, 0x8fdb6a, 0xffa14d };

        public static float TextureRepeatMeters = 9f;

        public static float KerbWidth = 1.2f;
        public static int KerbStripeSegments = 4;

        public static float CenterLineWidth = 0.28f;

        public static float StartLineDepth = 1.6f;
        public static int StartLineSquares = 14;

        public static float TireWallSpacing = 2.24f;
        public static float TireWallRadius = 0.32f;
        public static float TireWallHeight = 1.6f;

        public static float PoleSpacing = 34f;
        public static float PoleHeight = 7.5f;
        public static float PoleRadius = 0.14f;
        public static float PoleOffsetFromEdge = 7.5f;
        public static int PoleColor = 0xffffff;
        public static float PoleFlagWidth = 1.9f;
        public static int PoleFlagColorA = 0xff9ec4;
        public static int PoleFlagColorB = 0xc9b6f5;

        public static float HillsMinDistance = 30f;
        public static float HillsMaxDistance = 160f;
        public static float HillsMinRadius = 3.5f;
        public static float HillsMaxRadius = 11f;

        public static float CloudsMinHeight = 90f;
        public static float CloudsMaxHeight = 190f;
        public static float CloudsSpread = 620f;
        public static float CloudsMinRadius = 12f;
        public static float CloudsMaxRadius = 30f;
        public static int CloudsColor = 0xfffdff;

        public static float GrandstandAt = 0.06f;
        public static int GrandstandSide = -1;
        public static float GrandstandOffsetFromEdge = 26f;
        public static float GrandstandLength = 34f;
        public static int GrandstandRows = 7;
        public static float GrandstandRowDepth = 1.1f;
        public static float GrandstandRowHeight = 0.62f;
        public static int GrandstandFrameColor = 0xfff2f6;
        public static int GrandstandSeatColor = 0xa9e3d0;

        public static float PitAt = 0.035f;
        public static int PitSide = 1;
        public static float PitOffsetFromEdge = 20f;
        public static float PitLength = 30f;
        public static float PitDepth = 8f;
        public static float PitHeight = 4.2f;
        public static int PitWallColor = 0xfff0e2;
        public static int PitRoofColor = 0xff8fb1;
        public static int PitAwningColor = 0xffd98e;

        // Jardim doce: quantidades independentes da vegetacao do horizonte.
        public static int GardenTreeCount = 105;
        public static int GardenCandyCount = 180;
        public static int GardenFlowerCount = 340;
        public static float GardenFlagSpacing = 38f;
        public static readonly int[] GardenPalette = { 0xff86bf, 0xffd85b, 0x88dca0, 0xb99aef, 0x77d9ef };

        public static float TreesMinDistance = 22f;
        public static float TreesMaxDistance = 110f;
        public static float TrunkRadius = 0.26f;
        public static float TrunkHeight = 2.6f;
        public static int TrunkColor = 0xffffff;
        public static float TreeScaleVariation = 0.4f;

        public sealed class TreeVariety
        {
            public string Kind;
            public int Weight;
            public int Color;
            public float Size;
        }

        public static readonly TreeVariety[] TreeVarieties =
        {
            new TreeVariety { Kind = "sorvete", Weight = 3, Color = 0xff7fb5, Size = 1.5f },
            new TreeVariety { Kind = "algodao", Weight = 3, Color = 0x7fd8ff, Size = 1.8f },
            new TreeVariety { Kind = "pirulito", Weight = 2, Color = 0xff4f9a, Size = 1.6f },
            new TreeVariety { Kind = "cupcake", Weight = 2, Color = 0xffd24d, Size = 1.4f },
        };

        public static float BalloonsMinHeight = 26f;
        public static float BalloonsMaxHeight = 62f;
        public static float BalloonsSpread = 120f;
        public static float BalloonsMinScale = 0.8f;
        public static float BalloonsMaxScale = 1.45f;

        public static int RandomSeed = 1337;
    }

    /// <summary>Moedas (config/pickups.ts).</summary>
    public static class CoinConfig
    {
        public static float Spacing = 14f;
        public static float Height = 0.85f;
        public static float LateralFraction = 0.55f;
        public static float WeaveLength = 7f;
        public static float Radius = 0.6f;
        public static float Thickness = 0.16f;
        public static float PickupRadius = 1.7f;
        public static float RespawnSeconds = 9f;
        public static float SpinSpeed = 0.75f;
        public static float BobAmplitude = 0.14f;
        public static float BobSpeed = 1.6f;
        public static int Color = 0xffd76a;
        public static int Emissive = 0xff9ec4;
        public static float EmissiveIntensity = 1.4f;
    }

    /// <summary>Coop local (config/coop.ts).</summary>
    public static class CoopConfig
    {
        public static bool SplitVertical = false;
        public static int DividerThickness = 3;
        public static float ShadowRadiusScale = 1.45f;
        public static float FovBonus = 7f;
        public static float HudScale = 0.74f;

        public sealed class PlayerProfile
        {
            public string Label;
            public string Tint;
            public string Sprite;
        }

        public static readonly PlayerProfile[] Players =
        {
            new PlayerProfile { Label = "P1", Tint = "#ff6fa5", Sprite = "pink" },
            new PlayerProfile { Label = "P2", Tint = "#59c8ff", Sprite = "blue" },
        };

        public static float GamepadDeadzone = 0.18f;
        public static float GamepadSteerCurve = 1.5f;
        public static float GamepadTriggerThreshold = 0.12f;
    }

    /// <summary>Rampa de turbo e geleias (config/trackFeatures.ts).</summary>
    public static class SpeedRampConfig
    {
        public static float At = 0.5f;
        public static float Length = 9f;
        public static float HalfWidth = 1.7f;
        public static float Lateral = 0f;
        public static float Height = 0.14f;
        public static float ArrowHeight = 0.17f;
        public static int BoostLevel = 2;
        public static int Chevrons = 3;
        public static int PadLight = 0xfff2f8;
        public static int PadStripe = 0xff8cc0;
        public static int Arrow = 0xff2e93;
        public static int Post = 0xffffff;
        public static int PostTop = 0xff5c96;
    }

    public struct JellySpot
    {
        public float At, Lateral, Radius;
        public int Color;
        public JellySpot(float at, float lateral, float radius, int color) { At = at; Lateral = lateral; Radius = radius; Color = color; }
    }

    public static class JellyConfig
    {
        public static readonly JellySpot[] Spots =
        {
            new JellySpot(0.905f, -3.2f, 0.85f, 0), new JellySpot(0.905f, 0.6f, 0.75f, 1),
            new JellySpot(0.93f, -0.9f, 0.8f, 2), new JellySpot(0.93f, 3.3f, 0.9f, 3),
            new JellySpot(0.955f, -3.6f, 0.75f, 1), new JellySpot(0.955f, 1.8f, 0.85f, 0),
            new JellySpot(0.975f, -1.6f, 0.8f, 3),
        };

        public static float SlowPerSecond = 0.05f;
        public static float Push = 1.6f;
        public static float WobbleAmplitude = 0.07f;
        public static float WobbleSpeed = 2.3f;
        public static float WobbleHitAmplitude = 0.34f;
        public static float WobbleHitDecay = 0.9f;
        public static readonly int[] Colors = { 0xff4f9a, 0x4fc3f5, 0x7fd36a, 0xffc93d };
        public static float EyeRadius = 0.17f;
        public static float EyeSpread = 0.36f;
        public static float MouthRadius = 0.16f;
        public static int Cheek = 0xff9ec4;
        public static int Ink = 0x5c2340;
    }

    /// <summary>O Túnel de Donut (config/donutTunnel.ts).</summary>
    public static class DonutConfig
    {
        public static float At = 0.43f;
        public static float HoleRadius = 11.5f;
        public static float CenterHeight = 5f;
        public static float TubeRadius = 3.8f;
        public static int RingSegments = 44;
        public static int TubeSegments = 18;
        public static float FrostingThickness = 0.2f;
        public static float FrostingSpan = 1.85f;
        public static float FrostingWaveAmplitude = 0.22f;
        public static int FrostingWaves = 9;
        public static int SprinkleCount = 96;
        public static float SprinkleLength = 0.66f;
        public static float SprinkleThickness = 0.18f;
        public static int Dough = 0xf0b46a;
        public static int DoughTop = 0xffd89c;
        public static int DoughBottom = 0xd98c3f;
        public static int Icing = 0xff6fae;
        public static int IcingTop = 0xffb2d6;
        public static int IcingBottom = 0xf03e90;
    }

    /// <summary>O portal "CANDY RUSH" (config/startGate.ts).</summary>
    public static class StartGateConfig
    {
        public static float OffsetFromEdge = 7.2f;
        public static float PillarRadius = 1.15f;
        public static float PillarHeight = 7.4f;
        public static float FootRadius = 1.75f;
        public static float FootHeight = 1.1f;
        public static float PlinthSize = 4f;
        public static float PlinthHeight = 0.55f;
        public static float ArchThickness = 1f;
        public static float ArchRise = 4.5f;
        public static string SignText = "CANDY RUSH";
        public static float SignWidth = 11.5f;
        public static float SignAboveArch = -0.3f;
        public static int LightsCount = 4;
        public static float LightsRadius = 0.34f;
        public static float LightsSpacing = 1.3f;
        public static float LightsBarHeight = 1.15f;
        public static float LightsBarDepth = 0.5f;
        public static float LightsBelowSign = 0.75f;
        public static float LollipopRadius = 1.9f;
        public static float LollipopThickness = 0.36f;
        public static float LollipopAt = 0.78f;
        public static float CloudRadius = 1.15f;
        public static float CloudAt = 0.5f;
        public static float StarOuterRadius = 1.15f;
        public static float StarInnerRadius = 0.48f;
        public static float StarAt = 0.36f;
        public static float FlagPoleHeight = 3.4f;
        public static float FlagPoleRadius = 0.12f;
        public static float FlagWidth = 2.3f;
        public static float FlagHeight = 1.45f;
        public static int FlagSquares = 4;
        public static float CrownBandRadius = 0.85f;
        public static float CrownBandHeight = 0.34f;
        public static float CrownSpikeHeight = 0.8f;
        public static float CrownSpikeRadius = 0.26f;
        public static int Pink = 0xff7fb5;
        public static int HotPink = 0xf5459a;
        public static int Frosting = 0xfff6fb;
        public static int Gold = 0xffc83d;
        public static int LightBar = 0x3b2436;
        public static int LightOn = 0xff5c96;
        public static int Cloud = 0xfffdff;
        public static int Face = 0x7a3a55;
        public static int Cheek = 0xffb3d0;
        public static int Star = 0xffd94f;
    }

    /// <summary>Placas, bandeiras e nuvens voadoras (config/candySigns.ts).</summary>
    public static class CandySignsConfig
    {
        public struct Signpost { public float At; public int Side; public float OffsetFromEdge; }
        public struct Board { public int Color, Icon, Dir; public float Y; }

        public static readonly Signpost[] Signposts =
        {
            new Signpost { At = 0.03f, Side = 1, OffsetFromEdge = 8.5f },
            new Signpost { At = 0.47f, Side = -1, OffsetFromEdge = 8.5f },
        };

        public static float PostHeight = 4.6f;
        public static float PostRadius = 0.22f;
        public static float TopRadius = 0.62f;
        public static readonly Board[] Boards =
        {
            new Board { Color = 0xff5c96, Icon = 0xffd94f, Dir = 1, Y = 3.9f },
            new Board { Color = 0x63d0e8, Icon = 0xff9ec4, Dir = -1, Y = 3.0f },
            new Board { Color = 0xffd24d, Icon = 0xffffff, Dir = 1, Y = 2.1f },
            new Board { Color = 0xc79bf5, Icon = 0xffffff, Dir = -1, Y = 1.2f },
        };
        public static float BoardWidth = 2.3f;
        public static float BoardHeight = 0.66f;
        public static float BoardDepth = 0.2f;

        public static readonly float[] StartFlagsAt = { 0.004f, 0.018f };
        public static float StartFlagsOffsetFromEdge = 7f;
        public static float StartFlagsPoleHeight = 3.6f;
        public static float StartFlagsPoleRadius = 0.17f;
        public static float StartFlagsWidth = 1.9f;
        public static float StartFlagsHeight = 1.2f;
        public static int StartFlagsSquares = 4;
        public static float StartFlagsStarRadius = 0.42f;
        public static int StartFlagsStarColor = 0xffd94f;

        public static int FlyingCount = 10;
        public static float FlyingMinHeight = 34f;
        public static float FlyingMaxHeight = 72f;
        public static float FlyingSpread = 90f;
        public static float FlyingMinScale = 1f;
        public static float FlyingMaxScale = 2.1f;
        public static int FlyingBody = 0xfffdff;
        public static int FlyingCheek = 0xffb3d0;
        public static int FlyingInk = 0x6b2f4d;
        public static readonly int[] Rainbow = { 0xff7fb5, 0xffa14d, 0xffd24d, 0x8fdb6a, 0x63d0e8, 0xc79bf5 };
        public static float RainbowTube = 0.26f;
    }

    /// <summary>O Doce Castelo (config/castle.ts).</summary>
    public static class CastleConfig
    {
        public static float At = 0.112f;
        public static float BuriedDepth = 2.5f;

        public static float TunnelLength = 30f;
        public static float WallMargin = 2.5f;
        public static float WallHeight = 4.2f;
        public static float ArchRise = 7.8f;
        public static float ShellThickness = 2.4f;
        public static float HoopLength = 1.5f;
        public static float PortalDepth = 2.2f;
        public static int MarshmallowCount = 15;
        public static float BellSpacing = 4.5f;

        public static float TerraceHeight = 15.5f;

        public static float SignPulse = 0.04f;
        public static float SignPulseSpeed = 2.4f;

        public static int HeartCount = 8;
        public static float HeartFromX = -15f;
        public static float HeartToX = 40f;
        public static float HeartBaseHeight = 19.5f;
        public static float HeartHeightStep = 2.8f;
        public static float HeartZ = -5f;
        public static float HeartZStagger = 1.5f;
        public static float HeartSize = 1.15f;
        public static float HeartThickness = 0.4f;

        public struct Area { public float MinX, MaxX, MinZ, MaxZ; }
        public static readonly Area[] Footprint =
        {
            new Area { MinX = -23, MaxX = 48, MinZ = -4, MaxZ = 36 },
            new Area { MinX = 12, MaxX = 48, MinZ = -25, MaxZ = -4 },
        };

        public struct Tower { public float X, Z, Radius, Height; public string Body, Roof; }
        public static readonly Tower[] Towers =
        {
            new Tower { X = 42, Z = 6, Radius = 3.2f, Height = 23, Body = "peach", Roof = "cane" },
            new Tower { X = 40, Z = 22, Radius = 2.4f, Height = 27, Body = "orange", Roof = "blue" },
            new Tower { X = 34, Z = 16, Radius = 2.6f, Height = 33, Body = "pink", Roof = "blue" },
            new Tower { X = 30, Z = 25, Radius = 2.2f, Height = 36, Body = "pink", Roof = "blue" },
            new Tower { X = 29, Z = 3.5f, Radius = 2.0f, Height = 21, Body = "cane", Roof = "gumdrop" },
            new Tower { X = 22, Z = 7.5f, Radius = 2.8f, Height = 29, Body = "blue", Roof = "dome" },
            new Tower { X = 15, Z = 20, Radius = 2.3f, Height = 39, Body = "pink", Roof = "cane" },
            new Tower { X = 4, Z = 21, Radius = 2.3f, Height = 42, Body = "orange", Roof = "cane" },
            new Tower { X = -1.5f, Z = 8.5f, Radius = 2.8f, Height = 29, Body = "blue", Roof = "dome" },
            new Tower { X = -6, Z = 26, Radius = 2.2f, Height = 31, Body = "blue", Roof = "dome" },
            new Tower { X = -9, Z = 16, Radius = 2.6f, Height = 33, Body = "orange", Roof = "cane" },
            new Tower { X = -18.5f, Z = 4, Radius = 3.0f, Height = 22, Body = "peach", Roof = "cane" },
        };

        public static int Gingerbread = 0xe29a5c;
        public static int Icing = 0xfffaf3;
        public static int Pink = 0xff9dc4;
        public static int HotPink = 0xff5c95;
        public static int Blue = 0x86d6f5;
        public static int Orange = 0xffb163;
        public static int Peach = 0xffcf9a;
        public static int Mint = 0x8fe3b4;
        public static int Yellow = 0xffd94f;
        public static int Lavender = 0xc6a4f4;
        public static int Window = 0x7a3a55;
        public static int Gold = 0xffc83d;
        public static int HoopPink = 0xff8fbb;
        public static int HoopWhite = 0xfff3f8;
        public static string CaneStripe = "#e8394f";
        public static string SignBackground = "#ff5c95";
    }

    /// <summary>A Máquina de Doces (config/candyFactory.ts).</summary>
    public static class FactoryConfig
    {
        public static float At = 0.225f;
        public static int Side = 1;
        public static float OffsetFromEdge = 34f;
        public static float BuriedDepth = 1.1f;

        public static float DeckWidth = 22f;
        public static float DeckDepth = 16f;
        public static float DeckHeight = 2.3f;
        public static int DeckPosts = 6;

        public static float BodyTopRadius = 2.7f;
        public static float BodyBottomRadius = 3.55f;
        public static float BodyHeight = 5.2f;
        public static float BowlRadius = 3.7f;
        public static float BowlCenterY = 9.6f;
        public static int BowlGumballs = 150;
        public static float LidY = 13.6f;
        public static float LidRadius = 2.45f;

        public static float ChuteCenterY = 2.2f;
        public static float ChuteCenterZ = 8.5f;
        public static float ChuteOffsetX = -1.2f;
        public static float ChuteTilt = 0.42f;
        public static float ChuteLength = 8.8f;
        public static float ChuteWidth = 2.6f;
        public static int ChuteRolling = 22;
        public static int ChuteSpilled = 46;

        public struct Jar { public float X, Z, Radius, Height; public string Cap; }
        public static readonly Jar[] Jars =
        {
            new Jar { X = -6.8f, Z = 3.2f, Radius = 1.05f, Height = 3.2f, Cap = "lavender" },
            new Jar { X = 6.4f, Z = 3.6f, Radius = 1.05f, Height = 3.2f, Cap = "mint" },
            new Jar { X = 7.8f, Z = -1.2f, Radius = 0.95f, Height = 2.8f, Cap = "blue" },
        };

        public struct Mountain { public float X, Z, Radius, Height; public int Base, Swirl, Rim, Dots; public float PuffMeters; }
        public static readonly Mountain[] Mountains =
        {
            new Mountain { X = -4, Z = -34, Radius = 20, Height = 31, Base = 0xffc0dc, Swirl = 0xc4ecff, Rim = 0xffe0f0, Dots = 26, PuffMeters = 9 },
            new Mountain { X = -30, Z = -19, Radius = 12, Height = 19, Base = 0xffd6ea, Swirl = 0xfffdff, Rim = 0xffe8f4, Dots = 14, PuffMeters = 6 },
            new Mountain { X = 20, Z = -27, Radius = 14, Height = 23, Base = 0xd3efff, Swirl = 0xffcfe6, Rim = 0xe4f7ff, Dots = 18, PuffMeters = 7 },
        };

        public static float FootprintMinX = -46, FootprintMaxX = 38, FootprintMinZ = -58, FootprintMaxZ = 15;

        public static int Cream = 0xfff1dc;
        public static int Pink = 0xff7fb5;
        public static int HotPink = 0xf5459a;
        public static int Frosting = 0xfff6fb;
        public static int Gold = 0xffb945;
        public static int Glass = 0xdff7ff;
        public static int Lavender = 0xc79bf5;
        public static int Mint = 0x8fdb6a;
        public static int Blue = 0x63d0e8;
    }
}
