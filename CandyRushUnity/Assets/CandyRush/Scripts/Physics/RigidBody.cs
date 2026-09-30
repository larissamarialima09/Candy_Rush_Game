using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// Corpo rígido de 6 graus de liberdade com integração semi-implícita
    /// (Euler simplético) — physics/rigidBody.ts.
    ///
    /// Não usa o PhysX do Unity de propósito: todo o tuning do kart foi feito
    /// contra ESTE integrador, com passo fixo de 1/60 s. Trocar de motor
    /// mudaria a pilotagem inteira.
    ///
    ///  - `Position` é a posição de mundo do CENTRO DE MASSA.
    ///  - Pontos locais informados de fora são relativos à ORIGEM DO CHASSI.
    ///  - Inércia diagonal no espaço local; termos giroscópicos ignorados.
    /// </summary>
    public sealed class RigidBody
    {
        public Vector3 Position;
        public Quaternion Orientation = Quaternion.identity;
        public Vector3 Velocity;
        /// <summary>Velocidade angular de mundo, em rad/s.</summary>
        public Vector3 AngularVelocity;

        public readonly Vector3 CenterOfMassLocal;
        public readonly float Mass;
        public readonly float InvMass;
        public readonly Vector3 InvInertiaLocal;

        Vector3 force;
        Vector3 torque;

        public float LinearDamping;
        public float AngularDamping;

        public RigidBody(float mass, Vector3 size, Vector3 centerOfMass, Vector3 inertiaScale,
            float linearDamping, float angularDamping)
        {
            Mass = mass;
            InvMass = 1f / mass;
            CenterOfMassLocal = centerOfMass;
            LinearDamping = linearDamping;
            AngularDamping = angularDamping;

            // Inércia de uma caixa sólida homogênea: I_x = m/12 * (y² + z²), etc.
            float k = mass / 12f;
            float ix = k * (size.y * size.y + size.z * size.z) * inertiaScale.x;
            float iy = k * (size.x * size.x + size.z * size.z) * inertiaScale.y;
            float iz = k * (size.x * size.x + size.y * size.y) * inertiaScale.z;
            InvInertiaLocal = new Vector3(1f / ix, 1f / iy, 1f / iz);
        }

        /// <summary>Posiciona o corpo informando onde a ORIGEM DO CHASSI deve ficar.</summary>
        public void SetChassisTransform(Vector3 chassisPosition, Quaternion orientation)
        {
            Orientation = orientation;
            Position = chassisPosition + Orientation * CenterOfMassLocal;
            Velocity = Vector3.zero;
            AngularVelocity = Vector3.zero;
            force = Vector3.zero;
            torque = Vector3.zero;
        }

        /// <summary>Posição de mundo da origem do chassi (o que a malha visual usa).</summary>
        public Vector3 ChassisPosition => Position - Orientation * CenterOfMassLocal;

        public Vector3 LocalToWorld(Vector3 local) => Orientation * (local - CenterOfMassLocal) + Position;

        public Vector3 DirectionToWorld(Vector3 local) => Orientation * local;

        /// <summary>Velocidade de um ponto de mundo solidário ao corpo: v + ω × r.</summary>
        public Vector3 PointVelocity(Vector3 worldPoint) =>
            Vector3.Cross(AngularVelocity, worldPoint - Position) + Velocity;

        public void AddForce(Vector3 f) => force += f;

        /// <summary>Força num ponto de mundo: gera força linear E torque.</summary>
        public void AddForceAtPoint(Vector3 f, Vector3 worldPoint)
        {
            force += f;
            torque += Vector3.Cross(worldPoint - Position, f);
        }

        public void AddTorque(Vector3 t) => torque += t;

        /// <summary>Avança um passo FIXO. `gravity` é a aceleração em Y (negativa).</summary>
        public void Integrate(float dt, float gravity)
        {
            // --- Linear ---
            Vector3 accel = force * InvMass;
            accel.y += gravity;
            Velocity += accel * dt;
            Velocity *= Mathf.Max(0f, 1f - LinearDamping * dt);

            // --- Angular: α = R · (I_local⁻¹ · (Rᵀ · τ)) ---
            Vector3 local = Quaternion.Inverse(Orientation) * torque;
            local = Vector3.Scale(local, InvInertiaLocal);
            AngularVelocity += (Orientation * local) * dt;
            AngularVelocity *= Mathf.Max(0f, 1f - AngularDamping * dt);

            // --- Posições com a velocidade já atualizada ---
            Position += Velocity * dt;

            // dq/dt = ½ · ω(quaternion puro) · q
            var spin = new Quaternion(AngularVelocity.x, AngularVelocity.y, AngularVelocity.z, 0f) * Orientation;
            var q = new Quaternion(
                Orientation.x + spin.x * 0.5f * dt,
                Orientation.y + spin.y * 0.5f * dt,
                Orientation.z + spin.z * 0.5f * dt,
                Orientation.w + spin.w * 0.5f * dt);
            float len = Mathf.Sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
            Orientation = new Quaternion(q.x / len, q.y / len, q.z / len, q.w / len);

            force = Vector3.zero;
            torque = Vector3.zero;
        }
    }

    /// <summary>Resultado de um raycast contra o chão.</summary>
    public struct GroundHit
    {
        public float Distance;
        public Vector3 Point;
        public Vector3 Normal;
        public SurfaceKind Surface;
    }

    /// <summary>Superfície contra a qual as rodas fazem raycast (physics/ground.ts).</summary>
    public interface IGroundSampler
    {
        bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, out GroundHit hit);
    }

    /// <summary>Plano infinito horizontal. Usado só para medir o sinal do volante.</summary>
    public sealed class FlatGround : IGroundSampler
    {
        public float Height;
        public FlatGround(float height = 0) { Height = height; }

        public bool Raycast(Vector3 origin, Vector3 direction, float maxDistance, out GroundHit hit)
        {
            hit = default;
            if (direction.y >= -1e-4f) return false;
            float distance = (origin.y - Height) / -direction.y;
            if (distance < 0 || distance > maxDistance) return false;
            hit.Distance = distance;
            hit.Point = origin + direction * distance;
            hit.Normal = Vector3.up;
            hit.Surface = SurfaceKind.Asfalto;
            return true;
        }
    }
}
