using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// Câmera perseguidora com peso (camera/chaseCamera.ts).
    ///
    /// Duas molas (posição e mira) integradas no passo fixo, mais recuo por
    /// aceleração, antecipação da mira, inclinação nas curvas, FOV dinâmico e
    /// tremor. Toda a conta é feita no referencial do three; só no fim,
    /// em <see cref="ApplyToRender"/>, o resultado é espelhado para a câmera do
    /// Unity.
    /// </summary>
    public sealed class ChaseCamera
    {
        public readonly Camera Camera;

        Vector3 position, velocity, aim, aimVelocity;
        float rollAngle;
        Vector3 previousAnchor, previousAimTarget;
        float smoothedAccel, previousForwardSpeed;
        float fov = EffectsConfig.Fov.AtRest;
        float fovBonus;
        float shakeMeters, shakeClock, showcaseAngle;

        Vector3 prevPosition, prevAim;
        float prevRoll, prevFov = EffectsConfig.Fov.AtRest, prevShake;
        bool initialized;

        /// <summary>Posição de render no referencial do three (para os billboards).</summary>
        public Vector3 RenderPositionThree { get; private set; }

        public ChaseCamera(Camera camera)
        {
            Camera = camera;
            Camera.fieldOfView = EffectsConfig.Fov.AtRest;
            Camera.nearClipPlane = CameraConfig.Near;
            Camera.farClipPlane = CameraConfig.Far;
        }

        public void SetFovBonus(float degrees) => fovBonus = degrees;

        static Vector3 FlatForward(Kart kart)
        {
            Vector3 forward = kart.Body.DirectionToWorld(Vector3.forward);
            forward.y = 0;
            if (forward.sqrMagnitude < 1e-6f) forward = new Vector3(0, 0, 1);
            return forward.normalized;
        }

        public void Reset(Kart kart)
        {
            Vector3 kartPosition = kart.Body.ChassisPosition;
            Vector3 forward = FlatForward(kart);
            Vector3 anchor = kartPosition - forward * CameraConfig.OffsetDistance + Vector3.up * CameraConfig.OffsetHeight;
            Vector3 aimTarget = kartPosition + forward * CameraConfig.LookAheadBase + Vector3.up * CameraConfig.LookHeight;
            SnapTo(anchor, aimTarget);
            initialized = true;
        }

        /// <summary>Um passo FIXO de câmera.</summary>
        public void Update(float dt, Kart kart, bool offTrack)
        {
            prevPosition = position;
            prevAim = aim;
            prevRoll = rollAngle;
            prevFov = fov;
            prevShake = shakeMeters;
            shakeClock += dt;

            Vector3 kartPosition = kart.Body.ChassisPosition;
            // A câmera segue o RUMO do kart, não a atitude dele.
            Vector3 forward = FlatForward(kart);
            float forwardSpeed = kart.Telemetry.ForwardSpeed;

            bool snapping = !initialized || (kart.Telemetry.Respawned && CameraConfig.SnapOnRespawn);
            if (snapping)
            {
                smoothedAccel = 0;
                previousForwardSpeed = forwardSpeed;
            }

            // --- Recuo por aceleração ---
            float rawAccel = (forwardSpeed - previousForwardSpeed) / dt;
            previousForwardSpeed = forwardSpeed;
            float smoothing = Mathf.Min(1, CameraConfig.AccelSmoothing * dt);
            smoothedAccel += (rawAccel - smoothedAccel) * smoothing;
            float accelOffset = MathUtil.Clamp(smoothedAccel * CameraConfig.AccelMetersPerAccel,
                -CameraConfig.AccelMaxPullIn, CameraConfig.AccelMaxPullBack);

            float distance = CameraConfig.OffsetDistance + accelOffset;
            Vector3 anchor = kartPosition - forward * distance + Vector3.up * CameraConfig.OffsetHeight;
            float ahead = CameraConfig.LookAheadBase + Mathf.Max(0, forwardSpeed) * CameraConfig.LookAheadPerSpeed;
            Vector3 aimTarget = kartPosition + forward * ahead + Vector3.up * CameraConfig.LookHeight;

            if (snapping)
            {
                SnapTo(anchor, aimTarget);
                initialized = true;
            }

            // Pré-alimentação com a velocidade dos alvos: movimento uniforme não gera atraso.
            Vector3 anchorVelocity = (anchor - previousAnchor) / dt;
            Vector3 aimTargetVelocity = (aimTarget - previousAimTarget) / dt;
            previousAnchor = anchor;
            previousAimTarget = aimTarget;

            IntegrateSpring(ref position, ref velocity, anchor, anchorVelocity,
                CameraConfig.FollowStiffness, CameraConfig.FollowDamping, dt);
            IntegrateSpring(ref aim, ref aimVelocity, aimTarget, aimTargetVelocity,
                CameraConfig.AimStiffness, CameraConfig.AimDamping, dt);

            if (position.y < CameraConfig.MinHeightAboveGround)
            {
                position.y = CameraConfig.MinHeightAboveGround;
                if (velocity.y < 0) velocity.y = 0;
            }

            UpdateRoll(dt, kart, forwardSpeed);
            UpdateFieldOfView(dt, kart);
            UpdateShake(dt, kart, offTrack);
        }

        void UpdateFieldOfView(float dt, Kart kart)
        {
            float speedT = MathUtil.Clamp(kart.Telemetry.Speed / EffectsConfig.Fov.ReferenceSpeed, 0, 1);
            float target = MathUtil.Lerp(EffectsConfig.Fov.AtRest, EffectsConfig.Fov.AtTopSpeed, speedT)
                           + EffectsConfig.Fov.BoostBonus * kart.Drift.BoostTimeRemaining + fovBonus;
            fov += (target - fov) * Mathf.Min(1, EffectsConfig.Fov.Responsiveness * dt);
        }

        void UpdateShake(float dt, Kart kart, bool offTrack)
        {
            float speed = kart.Telemetry.Speed;
            float target = 0;
            if (speed > EffectsConfig.Shake.MinSpeed)
            {
                float t = MathUtil.Clamp((speed - EffectsConfig.Shake.MinSpeed) /
                                         (EffectsConfig.Shake.ReferenceSpeed - EffectsConfig.Shake.MinSpeed), 0, 1);
                target = EffectsConfig.Shake.SpeedAmplitude * t;
                target += EffectsConfig.Shake.BoostAmplitude * kart.Drift.BoostTimeRemaining;
                if (offTrack) target *= EffectsConfig.Shake.OffTrackMultiplier;
            }
            shakeMeters += (target - shakeMeters) * Mathf.Min(1, 8 * dt);
        }

        /// <summary>Aceleração lateral ≈ guinada × velocidade; negativa para inclinar para dentro.</summary>
        void UpdateRoll(float dt, Kart kart, float forwardSpeed)
        {
            float target = 0;
            if (Mathf.Abs(forwardSpeed) > CameraConfig.RollMinSpeed)
            {
                float lateralAccel = kart.Body.AngularVelocity.y * forwardSpeed;
                target = MathUtil.Clamp(-lateralAccel * CameraConfig.RollDegreesPerLateralAccel,
                    -CameraConfig.RollMaxDegrees, CameraConfig.RollMaxDegrees);
            }
            rollAngle += (target - rollAngle) * Mathf.Min(1, CameraConfig.RollResponsiveness * dt);
        }

        /// <summary>Modo vitrine do menu: gira devagar em volta do kart parado.</summary>
        public void Showcase(float dt, Kart kart)
        {
            showcaseAngle += CameraConfig.ShowcaseRevolutionsPerSecond * Mathf.PI * 2 * dt;
            Vector3 k = kart.Body.ChassisPosition;
            var anchor = new Vector3(
                k.x + Mathf.Sin(showcaseAngle) * CameraConfig.ShowcaseDistance,
                k.y + CameraConfig.ShowcaseHeight,
                k.z + Mathf.Cos(showcaseAngle) * CameraConfig.ShowcaseDistance);
            var aimTarget = new Vector3(k.x, k.y + CameraConfig.ShowcaseLookHeight, k.z);
            SnapTo(anchor, aimTarget);
            initialized = true;

            fov += (EffectsConfig.Fov.AtRest + fovBonus - fov) * Mathf.Min(1, 3 * dt);
            prevFov = fov;
            shakeMeters = 0;
            prevShake = 0;
        }

        void SnapTo(Vector3 newPosition, Vector3 newAim)
        {
            position = newPosition;
            aim = newAim;
            velocity = Vector3.zero;
            aimVelocity = Vector3.zero;
            rollAngle = 0;
            smoothedAccel = 0;
            previousAnchor = newPosition;
            previousAimTarget = newAim;
            prevPosition = newPosition;
            prevAim = newAim;
            prevRoll = 0;
            fov = EffectsConfig.Fov.AtRest + fovBonus;
            prevFov = fov;
            shakeMeters = 0;
            prevShake = 0;
            shakeClock = 0;
        }

        /// <summary>Interpola, calcula no referencial do three e espelha para o Unity.</summary>
        public void ApplyToRender(float alpha)
        {
            Vector3 renderPosition = Vector3.Lerp(prevPosition, position, alpha);
            Vector3 renderAim = Vector3.Lerp(prevAim, aim, alpha);
            float roll = prevRoll + (rollAngle - prevRoll) * alpha;

            Vector3 viewDirection = renderAim - renderPosition;
            if (viewDirection.sqrMagnitude < 1e-8f) viewDirection = new Vector3(0, 0, 1);
            viewDirection.Normalize();

            // Roll: gira o "cima" em torno da direção de visão, antes do lookAt.
            Vector3 up = MathUtil.AxisAngle(viewDirection, MathUtil.DegToRad(roll)) * Vector3.up;

            // Tremor nos eixos da câmera, com duas frequências incomensuráveis.
            float amplitude = prevShake + (shakeMeters - prevShake) * alpha;
            if (amplitude >= 1e-4f)
            {
                float t = shakeClock;
                float x = Mathf.Sin(t * Mathf.PI * 2 * EffectsConfig.Shake.FrequencyA);
                float y = Mathf.Sin(t * Mathf.PI * 2 * EffectsConfig.Shake.FrequencyB + 1.7f);
                // No three a câmera olha para -Z local e X local é a direita da tela.
                Vector3 right = Vector3.Cross(viewDirection, up).normalized;
                Vector3 camUp = Vector3.Cross(right, viewDirection).normalized;
                renderPosition += right * (x * amplitude) + camUp * (y * amplitude);
                float maxAmplitude = EffectsConfig.Shake.SpeedAmplitude + EffectsConfig.Shake.BoostAmplitude;
                float normalized = MathUtil.Clamp(amplitude / maxAmplitude, 0, 1);
                up = MathUtil.AxisAngle(viewDirection, MathUtil.DegToRad(EffectsConfig.Shake.RollDegrees * normalized) * y) * up;
            }

            RenderPositionThree = renderPosition;

            // Espelho three -> Unity. O "olhar para" é o mesmo ponto espelhado.
            Transform t2 = Camera.transform;
            t2.position = ThreeSpace.ToUnity(renderPosition);
            t2.rotation = Quaternion.LookRotation(ThreeSpace.ToUnity(viewDirection), ThreeSpace.ToUnity(up));

            float renderFov = prevFov + (fov - prevFov) * alpha;
            if (Mathf.Abs(Camera.fieldOfView - renderFov) > 1e-3f) Camera.fieldOfView = renderFov;
        }

        /// <summary>
        /// Mola amortecida semi-implícita. O amortecimento age sobre a velocidade
        /// RELATIVA ao alvo, senão seguir um alvo em velocidade constante deixa
        /// um atraso permanente.
        /// </summary>
        static void IntegrateSpring(ref Vector3 pos, ref Vector3 vel, Vector3 target, Vector3 targetVelocity,
            float stiffness, float damping, float dt)
        {
            Vector3 accel = (target - pos) * stiffness - (vel - targetVelocity) * damping;
            vel += accel * dt;
            pos += vel * dt;
        }
    }
}
