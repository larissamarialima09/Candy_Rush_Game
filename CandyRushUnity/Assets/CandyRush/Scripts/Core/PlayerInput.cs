using System;
using UnityEngine;

namespace CandyRush
{
    /// <summary>Um mapa de teclas (config/controls.ts). Cada ação aceita várias teclas.</summary>
    public sealed class KeyMap
    {
        public KeyCode[] Throttle, Brake, SteerLeft, SteerRight, Handbrake, Respawn, Pause;

        /// <summary>Sozinho: WASD e setas, tanto faz.</summary>
        public static readonly KeyMap Solo = new KeyMap
        {
            Throttle = new[] { KeyCode.W, KeyCode.UpArrow },
            Brake = new[] { KeyCode.S, KeyCode.DownArrow },
            SteerLeft = new[] { KeyCode.A, KeyCode.LeftArrow },
            SteerRight = new[] { KeyCode.D, KeyCode.RightArrow },
            Handbrake = new[] { KeyCode.Space },
            Respawn = new[] { KeyCode.R },
            Pause = new[] { KeyCode.Escape, KeyCode.P },
        };

        /// <summary>Coop, piloto 1: lado esquerdo do teclado.</summary>
        public static readonly KeyMap CoopP1 = new KeyMap
        {
            Throttle = new[] { KeyCode.W },
            Brake = new[] { KeyCode.S },
            SteerLeft = new[] { KeyCode.A },
            SteerRight = new[] { KeyCode.D },
            Handbrake = new[] { KeyCode.LeftShift, KeyCode.Space },
            Respawn = new[] { KeyCode.R },
            Pause = new[] { KeyCode.Escape, KeyCode.P },
        };

        /// <summary>Coop, piloto 2: setas e as teclas ao alcance do polegar direito.</summary>
        public static readonly KeyMap CoopP2 = new KeyMap
        {
            Throttle = new[] { KeyCode.UpArrow },
            Brake = new[] { KeyCode.DownArrow },
            SteerLeft = new[] { KeyCode.LeftArrow },
            SteerRight = new[] { KeyCode.RightArrow },
            Handbrake = new[] { KeyCode.RightShift, KeyCode.Return, KeyCode.KeypadEnter, KeyCode.Keypad0 },
            Respawn = new[] { KeyCode.Slash, KeyCode.KeypadPeriod },
            Pause = new[] { KeyCode.Escape },
        };

        public static bool Any(KeyCode[] keys)
        {
            foreach (KeyCode key in keys) if (Input.GetKey(key)) return true;
            return false;
        }
    }

    /// <summary>Os botões de toque da tela, preenchidos pelo HUD.</summary>
    public static class TouchState
    {
        public static bool Throttle, Brake, Left, Right, Handbrake, Respawn;
    }

    /// <summary>
    /// Um controle (core/gamepad.ts), no layout XInput do Unity:
    /// analógico esquerdo X, gatilhos nos eixos 9 e 10, A/B/X/Y = botões 0..3,
    /// RB = 5, Start = 7. Os eixos são declarados no InputManager do projeto.
    /// </summary>
    public sealed class GamepadSource
    {
        readonly int joyNum;
        readonly KeyCode[] buttons = new KeyCode[8];
        static bool axesMissing;

        public GamepadSource(int index)
        {
            joyNum = index + 1;
            for (int b = 0; b < buttons.Length; b++)
                buttons[b] = (KeyCode)Enum.Parse(typeof(KeyCode), $"Joystick{joyNum}Button{b}");
        }

        public bool Connected
        {
            get
            {
                string[] names = Input.GetJoystickNames();
                return names.Length >= joyNum && !string.IsNullOrEmpty(names[joyNum - 1]);
            }
        }

        public void Read(out float steer, out float throttle, out float brake, out bool handbrake,
            out bool respawn, out bool pause)
        {
            steer = throttle = brake = 0;
            handbrake = respawn = pause = false;
            if (!Connected) return;

            float rawSteer = 0, lt = 0, rt = 0;
            if (!axesMissing)
            {
                try
                {
                    rawSteer = Input.GetAxisRaw($"CR_Joy{joyNum}_X");
                    lt = Input.GetAxisRaw($"CR_Joy{joyNum}_LT");
                    rt = Input.GetAxisRaw($"CR_Joy{joyNum}_RT");
                }
                catch (ArgumentException)
                {
                    axesMissing = true;
                    Debug.LogWarning("[CandyRush] Eixos de controle ausentes no InputManager; só os botões vão funcionar.");
                }
            }

            steer = ShapeAxis(rawSteer);
            throttle = Analog(rt, Input.GetKey(buttons[0]));
            brake = Analog(lt, Input.GetKey(buttons[1]));
            handbrake = Input.GetKey(buttons[5]) || Input.GetKey(buttons[2]);
            respawn = Input.GetKey(buttons[3]);
            pause = Input.GetKey(buttons[7]);
        }

        /// <summary>
        /// Zona morta REESCALADA e curva de resposta. O sinal é invertido porque
        /// no kart `steer` positivo é esquerda.
        /// </summary>
        static float ShapeAxis(float raw)
        {
            float magnitude = Mathf.Abs(raw);
            if (magnitude <= CoopConfig.GamepadDeadzone) return 0;
            float rescaled = (magnitude - CoopConfig.GamepadDeadzone) / (1 - CoopConfig.GamepadDeadzone);
            float shaped = Mathf.Pow(MathUtil.Clamp(rescaled, 0, 1), CoopConfig.GamepadSteerCurve);
            return -MathUtil.Sign(raw) * shaped;
        }

        static float Analog(float axis, bool button)
        {
            float best = Mathf.Max(Mathf.Abs(axis), button ? 1 : 0);
            return best >= CoopConfig.GamepadTriggerThreshold ? MathUtil.Clamp(best, 0, 1) : 0;
        }

        public static bool AnyConnected()
        {
            foreach (string name in Input.GetJoystickNames())
                if (!string.IsNullOrEmpty(name)) return true;
            return false;
        }
    }

    /// <summary>
    /// A entrada de um jogador (core/input.ts): teclado, controle e toque
    /// combinados pegando o MAIOR valor de cada eixo, nunca a soma.
    /// </summary>
    public sealed class PlayerInput
    {
        public readonly InputState State = new InputState();
        readonly KeyMap keys;
        readonly GamepadSource gamepad;
        readonly bool usesTouch;
        bool respawnLatched, pauseLatched;

        public PlayerInput(KeyMap keys, int? gamepadIndex = null, bool touch = false)
        {
            this.keys = keys ?? KeyMap.Solo;
            gamepad = gamepadIndex.HasValue ? new GamepadSource(gamepadIndex.Value) : null;
            usesTouch = touch;
        }

        /// <summary>Uma vez por passo de física, antes de simular.</summary>
        public InputState Sample()
        {
            float padSteer = 0, padThrottle = 0, padBrake = 0;
            bool padHandbrake = false, padRespawn = false, padPause = false;
            gamepad?.Read(out padSteer, out padThrottle, out padBrake, out padHandbrake, out padRespawn, out padPause);

            bool left = KeyMap.Any(keys.SteerLeft) || (usesTouch && TouchState.Left);
            bool right = KeyMap.Any(keys.SteerRight) || (usesTouch && TouchState.Right);
            float keySteer = (left ? 1 : 0) - (right ? 1 : 0);
            float keyThrottle = KeyMap.Any(keys.Throttle) || (usesTouch && TouchState.Throttle) ? 1 : 0;
            float keyBrake = KeyMap.Any(keys.Brake) || (usesTouch && TouchState.Brake) ? 1 : 0;

            State.Throttle = Mathf.Max(keyThrottle, padThrottle);
            State.Brake = Mathf.Max(keyBrake, padBrake);
            State.Steer = LargestMagnitude(keySteer, padSteer);
            State.Handbrake = KeyMap.Any(keys.Handbrake) || (usesTouch && TouchState.Handbrake) || padHandbrake;

            bool respawnDown = KeyMap.Any(keys.Respawn) || (usesTouch && TouchState.Respawn) || padRespawn;
            State.RespawnPressed = respawnDown && !respawnLatched;
            respawnLatched = respawnDown;

            bool pauseDown = KeyMap.Any(keys.Pause) || padPause;
            State.PausePressed = pauseDown && !pauseLatched;
            pauseLatched = pauseDown;
            return State;
        }

        /// <summary>Entre dois comandos de direção vale o mais forte, com o sinal.</summary>
        static float LargestMagnitude(float a, float b)
        {
            if (Mathf.Abs(a) == Mathf.Abs(b)) return a + b == 0 ? 0 : a;
            return Mathf.Abs(a) > Mathf.Abs(b) ? a : b;
        }
    }
}
