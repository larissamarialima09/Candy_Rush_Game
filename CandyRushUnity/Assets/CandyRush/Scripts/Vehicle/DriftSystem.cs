using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// Máquina de estados do drift e do boost (vehicle/driftSystem.ts).
    ///
    /// Não aplica força nenhuma e não sabe o que é um kart: recebe velocidade,
    /// ângulo de deslizamento e se há rodas no chão, e devolve "quanto empuxo"
    /// e "quanto teto de velocidade extra". Quem aplica é o <see cref="Kart"/>.
    /// A física do drift continua valendo mesmo sem esta classe: ela só observa
    /// e recompensa.
    /// </summary>
    public sealed class DriftSystem
    {
        public bool Drifting;
        public float Charge;
        /// <summary>Nível conquistado com a carga atual: 0 a 3.</summary>
        public int Level;
        /// <summary>Sentido do deslizamento: -1, 0 ou +1. Usado pelos efeitos.</summary>
        public float Direction;

        /// <summary>Nível do boost em curso, 0 se não há boost.</summary>
        public int BoostLevel;
        float boostTimeLeft;
        float boostDuration;

        public bool BoostJustFired;
        public bool SpunOut;

        float belowExitTimer;

        public void Update(float dt, float speed, float slipAngleDeg, bool onGround)
        {
            BoostJustFired = false;
            SpunOut = false;
            UpdateBoost(dt);

            float absSlip = Mathf.Abs(slipAngleDeg);
            bool fastEnough = speed >= DriftConfig.Detection.MinSpeed;

            // Rodar não é derrapar: passar do limite queima toda a carga.
            if (Drifting && absSlip >= DriftConfig.Detection.SpinOutAngleDeg)
            {
                SpunOut = true;
                StopDrifting(false);
                return;
            }

            if (!Drifting)
            {
                if (fastEnough && onGround && absSlip >= DriftConfig.Detection.EnterAngleDeg)
                {
                    Drifting = true;
                    Charge = 0;
                    Level = 0;
                    belowExitTimer = 0;
                }
                return;
            }

            Direction = MathUtil.Sign(slipAngleDeg);
            bool stillSliding = absSlip >= DriftConfig.Detection.ExitAngleDeg && fastEnough && onGround;
            if (stillSliding)
            {
                belowExitTimer = 0;
                Charge += ChargeRate(speed, absSlip) * dt;
                Level = LevelForCharge(Charge);
            }
            else
            {
                // Tolerância curta: corrigir a traseira por um instante não
                // encerra o drift.
                belowExitTimer += dt;
                if (belowExitTimer >= DriftConfig.Detection.ExitGrace) StopDrifting(true);
            }
        }

        float ChargeRate(float speed, float absSlip)
        {
            float depthSpan = Mathf.Max(1f, DriftConfig.Charge.IdealAngleDeg - DriftConfig.Detection.EnterAngleDeg);
            float depth = MathUtil.Clamp((absSlip - DriftConfig.Detection.EnterAngleDeg) / depthSpan, 0, 1);
            float speedFactor = MathUtil.Clamp(speed / DriftConfig.Charge.SpeedReference, 0.4f, 1.25f);
            return DriftConfig.Charge.BaseRatePerSecond * (1 + depth * DriftConfig.Charge.DepthBonus) * speedFactor;
        }

        void StopDrifting(bool release)
        {
            if (release && Level > 0) TriggerBoost(Level);
            Drifting = false;
            Charge = 0;
            Level = 0;
            Direction = 0;
            belowExitTimer = 0;
        }

        /// <summary>
        /// Dispara um boost. Público porque o drift não é a única origem de turbo:
        /// a rampa também chama isto.
        /// </summary>
        public void TriggerBoost(int level)
        {
            if (level == 0) return;
            float duration = DriftConfig.Boost.Duration[level - 1];
            // Encadear drifts fracos não pode cortar um boost forte pela metade.
            if (level < BoostLevel && boostTimeLeft > 0) return;
            BoostLevel = level;
            boostDuration = duration;
            boostTimeLeft = duration;
            BoostJustFired = true;
        }

        void UpdateBoost(float dt)
        {
            if (boostTimeLeft <= 0) return;
            boostTimeLeft -= dt;
            if (boostTimeLeft <= 0)
            {
                boostTimeLeft = 0;
                BoostLevel = 0;
            }
        }

        public bool IsBoosting => BoostLevel > 0;

        /// <summary>Empuxo extra, em N, com o decaimento aplicado.</summary>
        public float BoostForce
        {
            get
            {
                if (BoostLevel == 0) return 0;
                return DriftConfig.Boost.Force[BoostLevel - 1] * Mathf.Pow(BoostTimeRemaining, DriftConfig.Boost.DecayExponent);
            }
        }

        /// <summary>Quanto sobe o teto de potência do motor, em m/s.</summary>
        public float SpeedCeilingBonus =>
            BoostLevel == 0 ? 0 : DriftConfig.Boost.SpeedCeilingBonus[BoostLevel - 1] * BoostTimeRemaining;

        /// <summary>Fração restante do boost, 0..1.</summary>
        public float BoostTimeRemaining =>
            boostDuration <= 0 ? 0 : MathUtil.Clamp(boostTimeLeft / boostDuration, 0, 1);

        public void Reset()
        {
            Drifting = false;
            Charge = 0;
            Level = 0;
            Direction = 0;
            BoostLevel = 0;
            boostTimeLeft = 0;
            boostDuration = 0;
            belowExitTimer = 0;
            BoostJustFired = false;
            SpunOut = false;
        }

        static int LevelForCharge(float charge)
        {
            float[] levels = DriftConfig.Charge.Levels;
            if (charge >= levels[2]) return 3;
            if (charge >= levels[1]) return 2;
            if (charge >= levels[0]) return 1;
            return 0;
        }
    }
}
