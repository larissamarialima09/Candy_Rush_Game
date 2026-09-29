using System.Collections.Generic;
using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// O bootstrap do jogo — equivalente a main.ts + core/gameLoop.ts.
    ///
    /// Monta a cena inteira em código (não há .unity a mão: tudo aqui nasce de
    /// Resources/Shaders e das classes de Scripts/*), mantém o próprio
    /// acumulador de passo fixo (em vez do FixedUpdate do Unity) porque o resto
    /// do port — Kart, ChaseCamera, KartView — já espera um `alpha` de
    /// interpolação exatamente como o gameLoop.ts original fornecia.
    /// </summary>
    public sealed class GameManager : MonoBehaviour
    {
        const int SeriesHeats = 2;

        sealed class Player
        {
            public int Index;
            public string Name;
            public Kart Kart;
            public KartView View;
            public Camera CameraComponent;
            public ChaseCamera Camera;
            public LapTracker LapTracker;
            public BarrierSystem Barriers;
            public KartEffects Effects;
            public PlayerInput Input;
        }

        sealed class Rival
        {
            public Kart Kart;
            public KartView View;
            public RacerController Controller;
        }

        // --- Cena ---
        Light sun, rim;
        Light kartLamp;
        Vector3 sunOffsetUnity, rimOffsetUnity;
        CircuitPath circuitPath;
        TrackSurface trackSurface;
        CircuitScenery scenery;
        Audience audience;
        Coins coins;
        CandyObstacles candyObstacles;
        SpeedRamp speedRamp;
        JellyBlobs jellyBlobs;
        CandyParticles particles;
        SkidMarks skidMarks;
        CandyMusic music;

        readonly List<Player> players = new List<Player>();
        readonly List<Player> activePlayers = new List<Player>();
        readonly List<Rival> rivals = new List<Rival>();
        RaceDirector director;
        RaceSeries raceSeries;
        GameState state;
        Transform playersRoot;
        Transform sceneRoot;
        /// <summary>
        /// Raiz com escala (-1,1,1): tudo que nasce dela usa os números do
        /// three.js sem tradução, e o espelho em X faz o resto. Câmera e luzes
        /// ficam DE FORA dela — essas, sim, convertem cada ponto com
        /// <see cref="ThreeSpace.ToUnity"/>, porque não têm "local" nenhum a
        /// espelhar: precisam de posição e direção corretas no mundo real.
        /// </summary>
        Transform worldRoot;

        GameUI ui;
        Viewport[] viewports = new Viewport[0];

        // --- Passo fixo ---
        float accumulator;
        float fps;

        readonly List<Kart> activeKartsScratch = new List<Kart>();
        readonly List<GameUI.HudEntry> hudEntries = new List<GameUI.HudEntry>();

        void Awake()
        {
            Application.targetFrameRate = -1;
            QualitySettings.vSyncCount = 1;

            worldRoot = new GameObject("world-mirror").transform;
            worldRoot.localScale = new Vector3(-1, 1, 1);

            BuildLighting();
            BuildTrackAndScenery();
            BuildActors();

            state = new GameState();
            director = new RaceDirector(circuitPath);
            raceSeries = new RaceSeries(SeriesHeats);

            music = gameObject.AddComponent<CandyMusic>();

            ui = gameObject.AddComponent<GameUI>();
            ui.Init(state, OnStart, OnResume, OnRestart, OnMenu);

            // Um piloto já existe no menu: é o kart que a câmera orbita na vitrine.
            SetPlayerCount(1);
            ResetRace();
            foreach (var p in players) p.Camera.Reset(p.Kart);
        }

        void BuildLighting()
        {
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Hex.Linear(LightingConfig.HemisphereSky) * LightingConfig.HemisphereIntensity * LightingConfig.AmbientScale;
            RenderSettings.ambientGroundColor = Hex.Linear(LightingConfig.HemisphereGround) * LightingConfig.HemisphereIntensity * LightingConfig.AmbientScale;
            RenderSettings.ambientEquatorColor = Color.Lerp(RenderSettings.ambientSkyColor, RenderSettings.ambientGroundColor, 0.5f);

            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Hex.Linear(0xffe6f2);
            RenderSettings.fogStartDistance = LightingConfig.FogNear;
            RenderSettings.fogEndDistance = LightingConfig.FogFar;

            var sunGo = new GameObject("sun");
            sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = Hex.C(LightingConfig.SunColor);
            sun.intensity = LightingConfig.SunIntensity * LightingConfig.DirectScale;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = LightingConfig.SunShadowStrength;
            sun.shadowResolution = UnityEngine.Rendering.LightShadowResolution.High;

            var rimGo = new GameObject("rim");
            rim = rimGo.AddComponent<Light>();
            rim.type = LightType.Directional;
            rim.color = Hex.C(LightingConfig.RimColor);
            rim.intensity = LightingConfig.RimIntensity * LightingConfig.DirectScale;
            rim.shadows = LightShadows.None;

            var lampGo = new GameObject("kart-lamp");
            kartLamp = lampGo.AddComponent<Light>();
            kartLamp.type = LightType.Point;
            kartLamp.color = Hex.C(LightingConfig.KartLampColor);
            kartLamp.intensity = LightingConfig.KartLampIntensity * LightingConfig.KartLampScale;
            kartLamp.range = LightingConfig.KartLampDistance;
            kartLamp.shadows = LightShadows.None;

            // O sol, a luz de contorno e a lanterna não pertencem à raiz
            // espelhada (não têm "local" — precisam de posição/direção certas
            // no mundo real), então cada uma converte o próprio deslocamento.
            sunOffsetUnity = ThreeSpace.ToUnity(LightOffset(LightingConfig.SunBearingRadians, LightingConfig.SunElevationDegrees, 240f));
            rimOffsetUnity = ThreeSpace.ToUnity(LightOffset(LightingConfig.RimBearingRadians, LightingConfig.RimElevationDegrees, 240f));

            // Céu: uma esfera enorme com o shader próprio, sempre atrás de tudo.
            // Fica dentro da raiz espelhada, como o resto do cenário.
            var skyMat = new Material(Mats.SkyShader);
            SceneKit.Mesh(worldRoot, Geo.Sphere(3800, 20, 14), new Mat { Material = skyMat }, false, false, "sky");
        }

        static Vector3 LightOffset(float bearing, float elevationDegrees, float distance)
        {
            float elevation = elevationDegrees * Mathf.Deg2Rad;
            float horizontal = Mathf.Cos(elevation) * distance;
            return new Vector3(Mathf.Sin(bearing) * horizontal, Mathf.Sin(elevation) * distance, Mathf.Cos(bearing) * horizontal);
        }

        void BuildTrackAndScenery()
        {
            sceneRoot = SceneKit.Node("scene", worldRoot);

            circuitPath = new CircuitPath(CircuitConfig.Centerline, CircuitConfig.Samples, CircuitConfig.CurvatureWindow);
            trackSurface = new TrackSurface(circuitPath);

            Texture2D meadow = ProceduralTextures.Meadow();
            TerrainBuilder.BuildHorizon(sceneRoot, meadow);
            TerrainBuilder.Build(circuitPath, sceneRoot, meadow);

            Texture2D trackTex = ProceduralTextures.CandyTrack();
            Texture2D trackNormals = ProceduralTextures.CandyNormalMap();
            new CircuitSurface(circuitPath, sceneRoot, trackTex, trackNormals);

            scenery = new CircuitScenery(circuitPath, sceneRoot);
            new CandyProps(circuitPath, sceneRoot);
            new CandySigns(circuitPath, sceneRoot);
            audience = new Audience(scenery.Grandstand, sceneRoot);
            coins = new Coins(circuitPath, sceneRoot);

            candyObstacles = new CandyObstacles(circuitPath, sceneRoot);
            speedRamp = new SpeedRamp(circuitPath, sceneRoot);
            jellyBlobs = new JellyBlobs(circuitPath, sceneRoot);
            particles = new CandyParticles(sceneRoot);
            skidMarks = new SkidMarks(sceneRoot);
        }

        void BuildActors()
        {
            playersRoot = new GameObject("players").transform;

            float steerSign = RacerController.MeasureSteerSign(trackSurface);
            for (int i = 0; i < RaceConfig.Rivals.Length; i++)
            {
                var profile = RaceConfig.Rivals[i];
                var kart = new Kart();
                rivals.Add(new Rival
                {
                    Kart = kart,
                    View = new KartView(kart, sceneRoot, KartPalette.Rival(profile.Sprite)),
                    Controller = new RacerController(circuitPath, profile, i * 1.7f, steerSign),
                });
            }
        }

        Player CreatePlayer(int index)
        {
            var kart = new Kart();
            var profile = CoopConfig.Players[Mathf.Min(index, CoopConfig.Players.Length - 1)];
            var view = index == 0
                ? new KartView(kart, sceneRoot, RacerProfile.Palette)
                : new KartView(kart, sceneRoot, KartPalette.Rival(profile.Sprite));

            var camGo = new GameObject($"camera-p{index + 1}");
            camGo.transform.SetParent(playersRoot, false);
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = CameraConfig.Near;
            cam.farClipPlane = CameraConfig.Far;
            if (index > 0) cam.depth = 1;

            return new Player
            {
                Index = index,
                Name = index == 0 ? RacerProfile.Name : profile.Label,
                Kart = kart,
                View = view,
                CameraComponent = cam,
                Camera = new ChaseCamera(cam),
                LapTracker = new LapTracker(circuitPath),
                Barriers = new BarrierSystem(circuitPath),
                Effects = new KartEffects(kart, particles),
                Input = new PlayerInput(KeyMap.Solo),
            };
        }

        void ConfigureInputs()
        {
            bool coop = players.Count > 1;
            foreach (var p in players)
            {
                KeyMap keys = coop ? (p.Index == 0 ? KeyMap.CoopP1 : KeyMap.CoopP2) : KeyMap.Solo;
                int gamepadIndex = coop ? (p.Index == 0 ? 1 : 0) : 0;
                p.Input = new PlayerInput(keys, gamepadIndex, touch: p.Index == 0);
            }
        }

        void SetPlayerCount(int count)
        {
            while (players.Count < count) players.Add(CreatePlayer(players.Count));

            activePlayers.Clear();
            for (int i = 0; i < count; i++) activePlayers.Add(players[i]);

            foreach (var p in players)
            {
                bool active = p.Index < count;
                p.View.SetVisible(active);
                p.CameraComponent.gameObject.SetActive(active);
            }

            ConfigureInputs();

            director.Competitors.Clear();
            for (int i = 0; i < count; i++)
                director.Add(players[i].Name, players[i].Kart, true, players[i].LapTracker);
            for (int i = 0; i < rivals.Count; i++)
                director.Add(RaceConfig.Rivals[i].Name, rivals[i].Kart, false);

            LayoutViewports();
            raceSeries.Reset(director.Competitors);
            ui.SetPlayerCount(count);
        }

        void LayoutViewports()
        {
            int count = Mathf.Max(1, activePlayers.Count);
            viewports = SplitScreen.ComputeViewports(count, Screen.width, Screen.height);

            for (int i = 0; i < count; i++)
            {
                var p = players[i];
                var v = viewports[i];
                // Unity conta a partir da base da tela; a UI (OnGUI) conta do topo.
                float nx = v.X / Screen.width, nw = v.Width / Screen.width;
                float nh = v.Height / Screen.height;
                float ny = 1f - (v.Y + v.Height) / Screen.height;
                p.CameraComponent.rect = new Rect(nx, ny, nw, nh);
                p.Camera.SetFovBonus(SplitScreen.FovBonusFor(count));
            }
        }

        void ResetRace()
        {
            for (int i = 0; i < players.Count; i++) PlaceOnGrid(players[i].Kart, i);
            for (int i = 0; i < rivals.Count; i++) PlaceOnGrid(rivals[i].Kart, players.Count + i);
            director.Reset();
            skidMarks.Clear();
            coins.Reset();
            foreach (var p in players) { p.LapTracker.Reset(); }
        }

        void PlaceOnGrid(Kart kart, int row)
        {
            int startIndex = circuitPath.IndexAtFraction(0);
            float sampleSpacing = circuitPath.TotalLength / circuitPath.Count;
            int spacingSamples = Mathf.RoundToInt(RaceConfig.GridRowSpacing / sampleSpacing);
            int index = ((startIndex - row * spacingSamples) % circuitPath.Count + circuitPath.Count * 4) % circuitPath.Count;
            float lateral = (row % 2 == 0 ? 1 : -1) * RaceConfig.GridLateralOffset;

            Vector3 position = circuitPath.PointAt(index, lateral, TrackConfig.RespawnHeight);
            PathSample sample = circuitPath.Samples[index];
            kart.RespawnAt(position, Mathf.Atan2(sample.Tangent.x, sample.Tangent.z));
        }

        // --- Botões de UI ---

        void OnStart(int playerCount)
        {
            if (players.Count > 0)
            {
                players[0].Name = RacerProfile.Name;
                players[0].View.SetPalette(RacerProfile.Palette);
            }
            SetPlayerCount(playerCount);
            ResetRace();
            foreach (var p in players) p.Camera.Reset(p.Kart);
            state.Set(GameStateName.Racing);
            music.Begin();
        }

        void OnResume() => state.Set(GameStateName.Racing);

        void OnMenu()
        {
            ui.HideFinish();
            state.Set(GameStateName.Menu);
        }

        void OnRestart()
        {
            ui.HideFinish();
            raceSeries.Reset(director.Competitors);
            ResetRace();
            foreach (var p in players) p.Camera.Reset(p.Kart);
            state.Set(GameStateName.Racing);
        }

        // --- Loop ---

        void Update()
        {
            float frameDt = Time.unscaledDeltaTime;
            if (frameDt > 0) fps += (1f / frameDt - fps) * 0.08f;
            if (frameDt > PhysicsConfig.MaxFrameTime) frameDt = PhysicsConfig.MaxFrameTime;

            accumulator += frameDt;
            float dt = PhysicsConfig.FixedTimeStep;
            int steps = 0;
            while (accumulator >= dt && steps < PhysicsConfig.MaxStepsPerFrame)
            {
                FixedStep(dt);
                accumulator -= dt;
                steps++;
            }
            if (steps == PhysicsConfig.MaxStepsPerFrame) accumulator = 0;

            Render(accumulator / dt, frameDt);
        }

        List<Kart> ActiveKarts()
        {
            activeKartsScratch.Clear();
            foreach (var p in activePlayers) activeKartsScratch.Add(p.Kart);
            return activeKartsScratch;
        }

        void FixedStep(float dt)
        {
            foreach (var p in activePlayers) p.Input.Sample();

            bool pausePressed = false;
            foreach (var p in activePlayers) if (p.Input.State.PausePressed) pausePressed = true;
            if (pausePressed && !ui.FinishVisible) state.TogglePause();
            if (!state.Simulates) return;

            foreach (var p in activePlayers) p.Kart.Update(dt, p.Input.State, trackSurface);
            foreach (var r in rivals) r.Kart.Update(dt, r.Controller.Update(dt, r.Kart), trackSurface);

            candyObstacles.Update(dt);
            foreach (var p in activePlayers) candyObstacles.Collide(p.Kart);
            foreach (var r in rivals) candyObstacles.Collide(r.Kart);

            jellyBlobs.Update(dt);
            foreach (var p in activePlayers) { speedRamp.Collide(p.Kart); jellyBlobs.Collide(p.Kart, dt); }
            foreach (var r in rivals) { speedRamp.Collide(r.Kart); jellyBlobs.Collide(r.Kart, dt); }

            if (activePlayers.Count > 0)
            {
                foreach (var r in rivals) activePlayers[0].Barriers.Update(dt, r.Kart);
            }
            foreach (var p in activePlayers) p.Barriers.Update(dt, p.Kart);

            coins.Update(dt, ActiveKarts());

            foreach (var p in activePlayers) p.LapTracker.Update(dt, p.Kart);
            director.Update(dt);
            foreach (var p in activePlayers) p.Camera.Update(dt, p.Kart, p.Kart.Telemetry.OffTrack);

            if (director.PlayersFinished && !ui.FinishVisible)
            {
                var standings = raceSeries.Record(director.Competitors);
                ui.ShowFinish(director.Competitors, director.PlayerPosition, director.Winner, standings, raceSeries.Heat);
                state.Set(GameStateName.Paused);
            }
        }

        void Render(float alpha, float frameDt)
        {
            var active = activePlayers;
            if (active.Count == 0) return;

            if (state.Name == GameStateName.Menu)
            {
                active[0].Camera.Showcase(frameDt, active[0].Kart);
                candyObstacles.Update(frameDt);
                jellyBlobs.Update(frameDt);
                coins.Update(frameDt, ActiveKarts());
            }

            foreach (var p in active) { p.View.Update(alpha); p.Camera.ApplyToRender(alpha); }
            foreach (var r in rivals) r.View.Update(alpha);

            sun.transform.forward = -sunOffsetUnity.normalized;
            rim.transform.forward = -rimOffsetUnity.normalized;

            Vector3 lampPos = ThreeSpace.ToUnity(active[0].Kart.Body.ChassisPosition);
            lampPos.y += LightingConfig.KartLampOffsetY;
            kartLamp.transform.position = lampPos;

            if (state.IsRacing)
            {
                foreach (var p in active) p.Effects.Update(frameDt, p.Barriers.Contact);
                skidMarks.Update(frameDt, ActiveKarts());
            }
            Transform camTransform = active[0].Camera.Camera.transform;
            particles.Update(frameDt, camTransform.right, camTransform.up);
            audience.Update(frameDt, active[0].Kart.Body.Position, active[0].Kart.Telemetry.Speed);
            scenery.Castle.Update(frameDt);

            hudEntries.Clear();
            for (int i = 0; i < active.Count; i++)
            {
                var p = active[i];
                hudEntries.Add(new GameUI.HudEntry
                {
                    Index = p.Index,
                    Name = p.Name,
                    Kart = p.Kart,
                    Tracker = p.LapTracker,
                    Viewport = i < viewports.Length ? viewports[i] : default,
                    CoinsCollected = p.Index < coins.CollectedByPlayer.Count ? coins.CollectedByPlayer[p.Index] : 0,
                    JustCollectedCoin = p.Index < coins.JustCollectedByPlayer.Count && coins.JustCollectedByPlayer[p.Index],
                });
            }
            ui.UpdateHud(hudEntries, coins, viewports, frameDt, fps);
        }

        void LateUpdate()
        {
            if (Screen.width > 0 && Screen.height > 0) LayoutViewports();
        }
    }
}
