using UnityEngine;

namespace CandyRush
{
    /// <summary>Estado de input já normalizado. O kart nunca vê tecla: vê eixos.</summary>
    public sealed class InputState
    {
        /// <summary>0..1</summary>
        public float Throttle;
        /// <summary>0..1 — vira ré quando o kart está parado.</summary>
        public float Brake;
        /// <summary>-1..+1. POSITIVO é ESQUERDA, como no original.</summary>
        public float Steer;
        public bool Handbrake;
        /// <summary>Pulso: true apenas no passo em que a tecla foi pressionada.</summary>
        public bool RespawnPressed;
        public bool PausePressed;
    }

    /// <summary>Configuração imutável de uma roda (vehicle/wheel.ts).</summary>
    public sealed class WheelSpec
    {
        public string Name;
        public Vector3 PositionLocal;
        public float Radius;
        public bool Steered;
        public bool Powered;
        public bool IsFront;
        public float BrakeShare;
    }

    /// <summary>Estado por roda, recalculado a cada passo de física.</summary>
    public sealed class Wheel
    {
        public readonly WheelSpec Spec;
        public bool Grounded;
        public float Compression;
        public float SuspensionForce;
        public Vector3 ContactPoint;
        public Vector3 ContactNormal = Vector3.up;
        public Vector3 WorldCenter;
        public float SteerAngle;
        public float SpinAngle;
        public float SlipLongitudinal;
        public float SlipLateral;
        public float ForceLongitudinal;
        public float ForceLateral;
        public bool Saturated;
        public SurfaceKind Surface = SurfaceKind.Asfalto;

        public Wheel(WheelSpec spec) { Spec = spec; }
    }

    /// <summary>Números que o HUD, a câmera e os efeitos leem.</summary>
    public sealed class KartTelemetry
    {
        public float Speed;
        public float ForwardSpeed;
        public float SlipAngleDeg;
        public float SteerAngleDeg;
        public int WheelsOnGround;
        public float DriveForce;
        public bool Reversing;
        public bool Respawned;
        public SurfaceKind Surface = SurfaceKind.Asfalto;
        public bool OffTrack;
    }

    /// <summary>
    /// O kart (vehicle/kart.ts): corpo rígido, quatro raios de suspensão e o
    /// modelo de pneu com círculo de atrito. Tudo em passo fixo.
    /// </summary>
    public sealed class Kart
    {
        static readonly Vector3 LocalForward = new Vector3(0, 0, 1);
        static readonly Vector3 LocalDown = new Vector3(0, -1, 0);
        static readonly Vector3 LocalUp = new Vector3(0, 1, 0);

        public readonly RigidBody Body;
        public readonly Wheel[] Wheels;
        public readonly DriftSystem Drift = new DriftSystem();
        public readonly KartTelemetry Telemetry = new KartTelemetry();

        float steerInput;
        float invertedTimer;
        /// <summary>Teto de velocidade da superfície, medido no passo anterior.</summary>
        float surfaceSpeedFactor = 1;

        Vector3 prevPosition, currPosition;
        Quaternion prevOrientation = Quaternion.identity, currOrientation = Quaternion.identity;

        public Kart()
        {
            Body = new RigidBody(
                KartConfig.Chassis.Mass,
                KartConfig.Chassis.Size,
                KartConfig.Chassis.CenterOfMass,
                KartConfig.Chassis.InertiaScale,
                KartConfig.Chassis.LinearDamping,
                KartConfig.Chassis.AngularDamping);
            Wheels = BuildWheels();
            Respawn();
        }

        public void Respawn()
        {
            RespawnAt(KartConfig.Spawn.Position, MathUtil.DegToRad(KartConfig.Spawn.HeadingDegrees));
        }

        /// <summary>Reposiciona o kart num ponto e rumo quaisquer, parado.</summary>
        public void RespawnAt(Vector3 position, float headingRadians)
        {
            Body.SetChassisTransform(position, MathUtil.AxisAngle(Vector3.up, headingRadians));
            steerInput = 0;
            invertedTimer = 0;
            Telemetry.Respawned = true;
            Drift.Reset();
            foreach (Wheel wheel in Wheels)
            {
                wheel.Grounded = false;
                wheel.Compression = 0;
                wheel.SuspensionForce = 0;
                wheel.SteerAngle = 0;
            }
            currPosition = Body.ChassisPosition;
            currOrientation = Body.Orientation;
            prevPosition = currPosition;
            prevOrientation = currOrientation;
        }

        /// <summary>Um passo de física de tamanho FIXO.</summary>
        public void Update(float dt, InputState input, IGroundSampler ground)
        {
            prevPosition = currPosition;
            prevOrientation = currOrientation;
            Telemetry.Respawned = false;

            if (input.RespawnPressed) Respawn();

            Vector3 forward = Body.DirectionToWorld(LocalForward);
            float forwardSpeed = Vector3.Dot(Body.Velocity, forward);

            // O deslizamento é medido ANTES de qualquer força deste passo.
            float slipAngleDeg = ComputeSlipAngle();
            Telemetry.SlipAngleDeg = slipAngleDeg;
            Drift.Update(dt, Body.Velocity.magnitude, slipAngleDeg, Telemetry.WheelsOnGround > 0);

            UpdateSteering(dt, input);

            // --- Trem de força ---
            bool reversing = input.Brake > 0 && forwardSpeed < KartConfig.Engine.ReverseEngageSpeed;
            bool throttleCut = input.Handbrake && KartConfig.Handbrake.CutsThrottle;
            float throttle = throttleCut ? 0 : input.Throttle;

            float driveTotal = 0;
            if (reversing)
            {
                float ratio = MathUtil.Clamp(-forwardSpeed / KartConfig.Engine.ReverseTopSpeed, 0, 1);
                driveTotal = -KartConfig.Engine.ReverseForce * (1 - ratio) * input.Brake;
            }
            else if (throttle > 0)
            {
                // O boost levanta o teto da curva de torque; a superfície o corta.
                float cutoff = (KartConfig.Engine.PowerCutoffSpeed + Drift.SpeedCeilingBonus) * surfaceSpeedFactor;
                float ratio = MathUtil.Clamp(forwardSpeed / cutoff, 0, 1);
                float curve = Mathf.Max(0, 1 - Mathf.Pow(ratio, KartConfig.Engine.PowerFalloffExponent));
                driveTotal = KartConfig.Engine.MaxDriveForce * curve * throttle;
            }

            float braking = !reversing && input.Brake > 0 ? input.Brake : 0;
            bool coasting = throttle == 0 && braking == 0 && !reversing;

            int poweredCount = 0;
            foreach (Wheel w in Wheels) if (w.Spec.Powered) poweredCount++;
            float drivePerWheel = poweredCount > 0 ? driveTotal / poweredCount : 0;

            ApplyAero();
            ApplyBoost();

            int onGround = 0;
            float speedFactorSum = 0;
            int pavedWheels = 0;
            foreach (Wheel wheel in Wheels)
            {
                UpdateWheel(wheel, dt, ground, drivePerWheel, braking, coasting, input.Handbrake);
                if (wheel.Grounded)
                {
                    onGround++;
                    SurfaceMaterial surface = TrackConfig.Surface(wheel.Surface);
                    speedFactorSum += surface.MaxSpeed;
                    if (!surface.OffTrack) pavedWheels++;
                }
            }

            surfaceSpeedFactor = onGround > 0 ? speedFactorSum / onGround : 1;
            Telemetry.OffTrack = onGround > 0 && pavedWheels == 0;
            Telemetry.Surface = DominantSurface();

            Body.Integrate(dt, PhysicsConfig.Gravity);
            UpdateRecovery(dt);

            currPosition = Body.ChassisPosition;
            currOrientation = Body.Orientation;

            Telemetry.Speed = Body.Velocity.magnitude;
            Telemetry.ForwardSpeed = forwardSpeed;
            Telemetry.DriveForce = driveTotal;
            Telemetry.Reversing = reversing;
            Telemetry.WheelsOnGround = onGround;
            Telemetry.SteerAngleDeg = Wheels[0].SteerAngle * Mathf.Rad2Deg;
        }

        /// <summary>
        /// Volante: a intenção crua vira um ângulo suavizado, e o ângulo máximo
        /// ENCOLHE com a velocidade.
        /// </summary>
        void UpdateSteering(float dt, InputState input)
        {
            float rate = input.Steer == 0 ? KartConfig.Steering.ReturnRate : KartConfig.Steering.TurnRate;
            steerInput = MathUtil.MoveTowards(steerInput, input.Steer, rate * dt);

            float speed = Body.Velocity.magnitude;
            float t = MathUtil.Clamp(speed / KartConfig.Steering.FalloffSpeed, 0, 1);
            float factor = MathUtil.Lerp(1, KartConfig.Steering.HighSpeedFactor, t);
            float maxAngle = MathUtil.DegToRad(KartConfig.Steering.MaxAngleDegrees);

            // Assistência de contra-esterço durante o drift.
            if (Drift.Drifting)
            {
                factor = MathUtil.Lerp(factor, 1, DriftConfig.Steering.DriftFalloffRelief);
                maxAngle *= DriftConfig.Steering.DriftSteerMultiplier;
            }

            float angle = maxAngle * factor * steerInput;
            foreach (Wheel wheel in Wheels) if (wheel.Spec.Steered) wheel.SteerAngle = angle;
        }

        /// <summary>Rede de segurança: sem colisão de chassi, kart capotado nunca acha o chão.</summary>
        void UpdateRecovery(float dt)
        {
            if (Body.Position.y < KartConfig.Recovery.FallThroughHeight)
            {
                Respawn();
                return;
            }
            bool upsideDown = Body.DirectionToWorld(LocalUp).y < 0.2f;
            bool stopped = Body.Velocity.magnitude < KartConfig.Recovery.StuckSpeed;
            if (upsideDown && stopped)
            {
                invertedTimer += dt;
                if (invertedTimer >= KartConfig.Recovery.InvertedTimeout) Respawn();
            }
            else invertedTimer = 0;
        }

        /// <summary>Ângulo com sinal entre para onde o kart aponta e para onde anda.</summary>
        float ComputeSlipAngle()
        {
            Vector3 flat = Body.Velocity;
            flat.y = 0;
            if (flat.sqrMagnitude < 1) return 0;

            Vector3 forward = Body.DirectionToWorld(LocalForward);
            forward.y = 0;
            if (forward.sqrMagnitude < 1e-6f) return 0;
            forward.Normalize();

            float along = Vector3.Dot(flat, forward);
            float lateral = forward.z * flat.x - forward.x * flat.z;
            return Mathf.Atan2(lateral, along) * 180f / Mathf.PI;
        }

        /// <summary>Empuxo do boost no CENTRO DE MASSA: força pura, sem torque.</summary>
        void ApplyBoost()
        {
            float f = Drift.BoostForce;
            if (f <= 0) return;
            Body.AddForce(Body.DirectionToWorld(LocalForward) * f);
        }

        void ApplyAero()
        {
            float speed = Body.Velocity.magnitude;
            if (speed < 1e-3f) return;
            Vector3 f = Body.Velocity * (-KartConfig.Aero.DragCoefficient * speed);
            f.y -= KartConfig.Aero.DownforceCoefficient * speed * speed;
            Body.AddForce(f);
        }

        void UpdateWheel(Wheel wheel, float dt, IGroundSampler ground, float drivePerWheel, float braking,
            bool coasting, bool handbrake)
        {
            WheelSpec spec = wheel.Spec;
            Vector3 attach = Body.LocalToWorld(spec.PositionLocal);
            Vector3 down = Body.DirectionToWorld(LocalDown);
            float rayLength = KartConfig.Suspension.RestLength + spec.Radius;

            if (!ground.Raycast(attach, down, rayLength, out GroundHit hit))
            {
                wheel.Grounded = false;
                wheel.Surface = SurfaceKind.Asfalto;
                wheel.Compression = 0;
                wheel.SuspensionForce = 0;
                wheel.ForceLateral = 0;
                wheel.ForceLongitudinal = 0;
                wheel.Saturated = false;
                wheel.WorldCenter = attach + down * KartConfig.Suspension.RestLength;
                return;
            }

            wheel.Grounded = true;
            wheel.Surface = hit.Surface;
            wheel.Compression = MathUtil.Clamp(rayLength - hit.Distance, 0, KartConfig.Suspension.MaxTravel);
            wheel.ContactPoint = hit.Point;
            wheel.ContactNormal = hit.Normal;
            wheel.WorldCenter = attach + down * (KartConfig.Suspension.RestLength - wheel.Compression);

            Vector3 up = -down;

            // --- Suspensão: mola + amortecedor ao longo do eixo do chassi ---
            Vector3 attachVelocity = Body.PointVelocity(attach);
            float compressionSpeed = -Vector3.Dot(attachVelocity, up);
            float damper = compressionSpeed > 0 ? KartConfig.Suspension.DamperBump : KartConfig.Suspension.DamperRebound;
            float springForce = KartConfig.Suspension.Stiffness * wheel.Compression + damper * compressionSpeed;
            springForce = MathUtil.Clamp(springForce, 0, KartConfig.Suspension.MaxForce);
            wheel.SuspensionForce = springForce;
            Body.AddForceAtPoint(up * springForce, hit.Point);

            // --- Referencial do pneu, projetado no plano do chão ---
            Vector3 forward = Body.DirectionToWorld(LocalForward);
            if (wheel.SteerAngle != 0) forward = MathUtil.AxisAngle(up, wheel.SteerAngle) * forward;
            forward -= hit.Normal * Vector3.Dot(forward, hit.Normal);
            if (forward.sqrMagnitude < 1e-8f) return;
            forward.Normalize();
            Vector3 right = Vector3.Cross(hit.Normal, forward).normalized;

            Vector3 contactVelocity = Body.PointVelocity(hit.Point);
            float vLong = Vector3.Dot(contactVelocity, forward);
            float vLat = Vector3.Dot(contactVelocity, right);
            wheel.SlipLongitudinal = vLong;
            wheel.SlipLateral = vLat;

            SurfaceMaterial surface = TrackConfig.Surface(wheel.Surface);
            float load = springForce;
            float massShare = Body.Mass * KartConfig.Tires.TireMassShare;

            // --- Grip lateral: frente e trás diferentes definem o caráter do kart ---
            float gripCoefficient = (spec.IsFront ? KartConfig.Tires.FrontGrip : KartConfig.Tires.RearGrip) * surface.Grip;
            if (handbrake && !spec.IsFront) gripCoefficient *= KartConfig.Handbrake.RearGripMultiplier;

            float maxLateral = Mathf.Min(gripCoefficient * load, KartConfig.Tires.MaxLateralForce);
            float desiredLateral = -vLat * massShare / dt;
            float lateral = MathUtil.Clamp(desiredLateral, -maxLateral, maxLateral);

            // --- Longitudinal: tração, freio, rolamento, freio-motor ---
            float longitudinal = spec.Powered ? drivePerWheel : 0;
            float resistance = braking * KartConfig.Brakes.Force * spec.BrakeShare;
            if (handbrake && !spec.IsFront) resistance += KartConfig.Handbrake.RearBrakeForce * 0.5f;
            resistance += KartConfig.Brakes.RollingResistance * surface.RollingResistance * Mathf.Abs(vLong);
            if (coasting) resistance += KartConfig.Brakes.EngineBraking * Mathf.Abs(vLong);

            // Resistência nunca inverte o sentido da roda dentro de um passo.
            float maxStopping = Mathf.Abs(vLong) * massShare / dt;
            resistance = Mathf.Min(resistance, maxStopping);
            longitudinal -= MathUtil.Sign(vLong) * resistance;

            float maxLongitudinal = KartConfig.Tires.LongitudinalGrip * surface.Grip * load;
            longitudinal = MathUtil.Clamp(longitudinal, -maxLongitudinal, maxLongitudinal);

            // --- Círculo de atrito: lateral e longitudinal dividem o pneu ---
            wheel.Saturated = Mathf.Abs(desiredLateral) > maxLateral;
            if (KartConfig.Tires.UseFrictionCircle && maxLateral > 1e-3f && maxLongitudinal > 1e-3f)
            {
                float load2 = MathUtil.Hypot(longitudinal / maxLongitudinal, lateral / maxLateral);
                if (load2 > 1)
                {
                    longitudinal /= load2;
                    lateral /= load2;
                    wheel.Saturated = true;
                }
            }

            wheel.ForceLongitudinal = longitudinal;
            wheel.ForceLateral = lateral;

            // A força do pneu é aplicada ACIMA do contato, senão o kart capota.
            Vector3 applyPoint = hit.Point + hit.Normal * KartConfig.Tires.ForceApplicationHeight;
            Body.AddForceAtPoint(forward * longitudinal + right * lateral, applyPoint);

            wheel.SpinAngle += vLong / spec.Radius * dt;
        }

        /// <summary>Transformação interpolada para o render (evita microtravamento).</summary>
        public void GetRenderTransform(float alpha, out Vector3 position, out Quaternion orientation)
        {
            position = Vector3.Lerp(prevPosition, currPosition, alpha);
            orientation = Quaternion.Slerp(prevOrientation, currOrientation, alpha);
        }

        SurfaceKind DominantSurface()
        {
            var tally = new int[4];
            SurfaceKind best = SurfaceKind.Asfalto;
            int bestCount = 0;
            foreach (Wheel wheel in Wheels)
            {
                if (!wheel.Grounded) continue;
                int count = ++tally[(int)wheel.Surface];
                if (count > bestCount)
                {
                    bestCount = count;
                    best = wheel.Surface;
                }
            }
            return best;
        }

        static Wheel[] BuildWheels()
        {
            float frontBias = KartConfig.Brakes.FrontBias;
            return new[]
            {
                new Wheel(new WheelSpec
                {
                    Name = "FL", PositionLocal = new Vector3(-KartConfig.Wheels.HalfTrackFront, KartConfig.Wheels.AttachY, KartConfig.Wheels.FrontAxleZ),
                    Radius = KartConfig.Wheels.RadiusFront, Steered = true, Powered = false, IsFront = true, BrakeShare = frontBias / 2,
                }),
                new Wheel(new WheelSpec
                {
                    Name = "FR", PositionLocal = new Vector3(KartConfig.Wheels.HalfTrackFront, KartConfig.Wheels.AttachY, KartConfig.Wheels.FrontAxleZ),
                    Radius = KartConfig.Wheels.RadiusFront, Steered = true, Powered = false, IsFront = true, BrakeShare = frontBias / 2,
                }),
                new Wheel(new WheelSpec
                {
                    Name = "RL", PositionLocal = new Vector3(-KartConfig.Wheels.HalfTrackRear, KartConfig.Wheels.AttachY, KartConfig.Wheels.RearAxleZ),
                    Radius = KartConfig.Wheels.RadiusRear, Steered = false, Powered = true, IsFront = false, BrakeShare = (1 - frontBias) / 2,
                }),
                new Wheel(new WheelSpec
                {
                    Name = "RR", PositionLocal = new Vector3(KartConfig.Wheels.HalfTrackRear, KartConfig.Wheels.AttachY, KartConfig.Wheels.RearAxleZ),
                    Radius = KartConfig.Wheels.RadiusRear, Steered = false, Powered = true, IsFront = false, BrakeShare = (1 - frontBias) / 2,
                }),
            };
        }
    }
}
