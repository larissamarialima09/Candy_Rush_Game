using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace CandyRush
{
    /// <summary>Menu inicial em Canvas; configurações, HUD, pausa e resultados em IMGUI.</summary>
    public sealed class GameUI : MonoBehaviour
    {
        /// <summary>O que o HUD de UM jogador precisa, coletado pelo GameManager a cada quadro.</summary>
        public struct HudEntry
        {
            public int Index;
            public string Name;
            public Kart Kart;
            public LapTracker Tracker;
            public Viewport Viewport;
            public int CoinsCollected;
            public bool JustCollectedCoin;
        }

        static readonly Color[] LevelColors =
        {
            Color.white,
            new Color(1f, 0.62f, 0.77f),
            new Color(0.66f, 0.61f, 0.94f),
            new Color(1f, 0.84f, 0.42f),
        };
        static readonly string[] LevelLabels = { "DRIFT", "TURBO 1", "TURBO 2", "TURBO 3" };

        GameState state;
        Action onResume;
        Action onRestart;
        Action onMenu;
        CandyFrontEnd frontEnd;
        int playerCount = 1;
        GameObject logoOverlay;

        bool finishVisible;
        IReadOnlyList<Competitor> finishCompetitors;
        int finishPlayerPosition;
        Competitor finishWinner;
        IReadOnlyList<SeriesStanding> finishSeries;
        int finishHeats;

        readonly Dictionary<int, float> messageTimer = new Dictionary<int, float>();
        readonly Dictionary<int, string> messageText = new Dictionary<int, string>();
        readonly Dictionary<int, float> coinPopTimer = new Dictionary<int, float>();
        readonly Dictionary<int, float> vignetteOpacity = new Dictionary<int, float>();
        readonly Dictionary<int, float> speedLinesOpacity = new Dictionary<int, float>();
        readonly Dictionary<int, float> chromaticOpacity = new Dictionary<int, float>();

        IReadOnlyList<HudEntry> hudEntries = Array.Empty<HudEntry>();

        GUIStyle labelStyle, bigLabelStyle, titleStyle, detailStyle, warningStyle, buttonStyle, rowStyle;
        GUIStyle pinkPillStyle, purplePillStyle, pillLabelStyle;

        public bool FinishVisible => finishVisible;

        public void Init(GameState gameState, Action<int> start, Action resume, Action restart, Action menu = null)
        {
            state = gameState;
            onResume = resume;
            onRestart = restart;
            onMenu = menu;
            UiArt.Build();
            frontEnd = new CandyFrontEnd(start);
            BuildLogoOverlay();
        }

        public void SetPlayerCount(int count) => playerCount = count;

        MenuCandyRush animatedMenu;

        void BuildLogoOverlay()
        {
            if (EventSystem.current == null)
            {
                var events = new GameObject("EventSystem");
                events.AddComponent<EventSystem>();
                events.AddComponent<StandaloneInputModule>();
            }
            logoOverlay = new GameObject("CandyRushMenuCanvas", typeof(RectTransform));
            logoOverlay.SetActive(false);
            logoOverlay.transform.SetParent(transform, false);
            var canvas = logoOverlay.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = logoOverlay.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1870, 841);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.Expand;
            logoOverlay.AddComponent<GraphicRaycaster>();
            var content = new GameObject("MenuCandyRush", typeof(RectTransform));
            content.transform.SetParent(logoOverlay.transform, false);
            animatedMenu = content.AddComponent<MenuCandyRush>();
            animatedMenu.aoJogar.AddListener(frontEnd.Play);
            animatedMenu.aoConfigurar.AddListener(frontEnd.OpenSettings);
        }

        void Update()
        {
            if (state == null || logoOverlay == null) return;
            bool visible = state.Name == GameStateName.Menu && frontEnd.CurrentPage == CandyFrontEnd.Page.Home;
            if (logoOverlay.activeSelf != visible)
            {
                logoOverlay.SetActive(visible);
                if (visible) animatedMenu.AtualizarPerfil();
            }
        }
        public void UpdateHud(IReadOnlyList<HudEntry> entries, Coins coins, Viewport[] viewports, float dt, float fps)
        {
            hudEntries = entries;
            foreach (var e in entries)
            {
                bool justCollected = e.JustCollectedCoin;
                if (justCollected) coinPopTimer[e.Index] = 0.14f;
                coinPopTimer.TryGetValue(e.Index, out float pop);
                coinPopTimer[e.Index] = Mathf.Max(0, pop - dt);

                var tracker = e.Tracker;
                if (tracker.LapJustCompleted)
                {
                    bool isBest = tracker.LastLapTime <= tracker.BestLapTime;
                    messageText[e.Index] = isBest
                        ? $"VOLTA MAIS RÁPIDA  {FormatTime(tracker.LastLapTime)}"
                        : $"VOLTA  {FormatTime(tracker.LastLapTime)}";
                    messageTimer[e.Index] = 2.4f;
                }
                if (tracker.JustRescued)
                {
                    messageText[e.Index] = "DE VOLTA À PISTA";
                    messageTimer[e.Index] = 1.6f;
                }
                messageTimer.TryGetValue(e.Index, out float mt);
                messageTimer[e.Index] = Mathf.Max(0, mt - dt);

                // Efeitos de tela: vinheta, linhas de velocidade e aberração cromática.
                var kart = e.Kart;
                float speed = kart.Telemetry.Speed;
                float boost = kart.Drift.BoostTimeRemaining;
                float speedT = Mathf.Clamp01((speed - EffectsConfig.Overlay.VignetteStartSpeed) / Mathf.Max(1, EffectsConfig.Overlay.ReferenceSpeed - EffectsConfig.Overlay.VignetteStartSpeed));
                float targetVignette = EffectsConfig.Overlay.VignetteMax * speedT;
                float targetLines = EffectsConfig.Overlay.SpeedLinesMax * Mathf.Max(speedT * speedT, boost);
                float targetChromatic = EffectsConfig.Overlay.ChromaticMax * boost;
                float t = Mathf.Min(1, EffectsConfig.Overlay.Responsiveness * dt);

                vignetteOpacity.TryGetValue(e.Index, out float v);
                speedLinesOpacity.TryGetValue(e.Index, out float sl);
                chromaticOpacity.TryGetValue(e.Index, out float ch);
                vignetteOpacity[e.Index] = v + (targetVignette - v) * t;
                speedLinesOpacity[e.Index] = sl + (targetLines - sl) * t;
                chromaticOpacity[e.Index] = ch + (targetChromatic - ch) * t;
            }
        }

        public void ShowFinish(IReadOnlyList<Competitor> competitors, int playerPosition, Competitor winner,
            IReadOnlyList<SeriesStanding> series, int heats)
        {
            if (finishVisible) return;
            finishVisible = true;
            finishCompetitors = competitors;
            finishPlayerPosition = playerPosition;
            finishWinner = winner;
            finishSeries = series;
            finishHeats = heats;
        }

        public void HideFinish() => finishVisible = false;

        void EnsureStyles()
        {
            if (labelStyle != null) return;
            Font font = UiArt.Font;

            labelStyle = new GUIStyle { font = font, fontSize = 16, normal = { textColor = Color.white } };
            bigLabelStyle = new GUIStyle { font = font, fontSize = 34, fontStyle = FontStyle.Bold, normal = { textColor = Color.white } };
            titleStyle = new GUIStyle { font = font, fontSize = 30, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, normal = { textColor = new Color(1f, 0.4f, 0.65f) } };
            detailStyle = new GUIStyle { font = font, fontSize = 16, alignment = TextAnchor.MiddleCenter, wordWrap = true, normal = { textColor = new Color(0.35f, 0.22f, 0.43f) } };
            warningStyle = new GUIStyle { font = font, fontSize = 18, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, normal = { textColor = Color.white } };
            buttonStyle = new GUIStyle(GUI.skin.button) { font = font, fontSize = 19, fontStyle = FontStyle.Bold,
                border = new RectOffset(), alignment = TextAnchor.MiddleCenter };
            buttonStyle.normal.background = UiArt.RestartPill;
            buttonStyle.hover.background = UiArt.RestartHoverPill;
            buttonStyle.active.background = UiArt.RestartPressedPill;
            buttonStyle.focused.background = UiArt.RestartHoverPill;
            buttonStyle.normal.textColor = buttonStyle.hover.textColor = buttonStyle.active.textColor = buttonStyle.focused.textColor = new Color(.28f, .13f, .35f);
            rowStyle = new GUIStyle { font = font, fontSize = 15, normal = { textColor = Color.white } };

            pinkPillStyle = PauseButtonStyle(UiArt.PauseResumePill);
            purplePillStyle = PauseButtonStyle(UiArt.PauseHomePill);
            pillLabelStyle = new GUIStyle { font = font, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, normal = { textColor = Color.white } };
        }

        static readonly Color LavenderText = new Color(0.42f, 0.22f, 0.6f);

        static GUIStyle PauseButtonStyle(Texture2D background)
        {
            // A textura tem a proporção final do botão, como no menu inicial.
            var style = new GUIStyle { border = new RectOffset() };
            style.normal.background = style.hover.background =
                style.active.background = style.focused.background = background;
            return style;
        }

        /// <summary>
        /// Botão em formato de pílula com ícone à esquerda e texto, como nas
        /// telas do menu inicial, com textura na proporção final para
        /// preservar as extremidades semicirculares.
        /// </summary>
        bool IconButton(Rect r, Texture2D icon, string label, GUIStyle pillStyle, float fontSize, Color? tint = null)
        {
            bool clicked = GUI.Button(r, GUIContent.none, pillStyle);
            float iconSize = r.height * 0.46f;
            float iconX = r.x + r.height * 0.36f;
            var previousColor = GUI.color;
            if (tint.HasValue) GUI.color = tint.Value;
            GUI.DrawTexture(new Rect(iconX, r.y + (r.height - iconSize) / 2, iconSize, iconSize), icon);
            GUI.color = previousColor;
            var textStyle = new GUIStyle(pillLabelStyle) { fontSize = Mathf.RoundToInt(fontSize) };
            if (tint.HasValue) textStyle.normal.textColor = tint.Value;
            float textX = iconX + iconSize + 8;
            GUI.Label(new Rect(textX, r.y, r.xMax - textX - 12, r.height), label, textStyle);
            return clicked;
        }

        void OnGUI()
        {
            if (state == null) return;
            EnsureStyles();
            if (state.Name == GameStateName.Menu) { if (frontEnd.CurrentPage != CandyFrontEnd.Page.Home) frontEnd.Draw(); return; }

            if (state.Name == GameStateName.Racing)
            {
                foreach (var e in hudEntries) DrawPlayerHud(e);
            }

            var previousMatrix = GUI.matrix;
            float scale = Mathf.Min(Screen.width / 960f, Screen.height / 720f);
            GUI.matrix = Matrix4x4.TRS(new Vector3((Screen.width - 960 * scale) / 2,
                (Screen.height - 720 * scale) / 2, 0), Quaternion.identity, Vector3.one * scale);
            if (finishVisible) DrawFinishScreen();
            else if (state.Name == GameStateName.Paused) DrawPause();
            GUI.matrix = previousMatrix;
        }

        // --- HUD de corrida ---

        void DrawPlayerHud(HudEntry e)
        {
            Rect vp = new Rect(e.Viewport.X, e.Viewport.Y, e.Viewport.Width, e.Viewport.Height);
            var kart = e.Kart;
            var tracker = e.Tracker;

            // Efeitos de tela (dentro da faixa deste jogador).
            vignetteOpacity.TryGetValue(e.Index, out float vig);
            if (vig > 0.001f) DrawFaded(UiArt.Vignette, vp, vig);
            speedLinesOpacity.TryGetValue(e.Index, out float lines);
            if (lines > 0.001f) DrawFaded(UiArt.SpeedLines, vp, lines);
            chromaticOpacity.TryGetValue(e.Index, out float chroma);
            if (chroma > 0.001f)
            {
                GUI.DrawTexture(new Rect(vp.x, vp.y, 30, vp.height), UiArt.Chromatic, ScaleMode.StretchToFill, true, 0, new Color(1, 1, 1, chroma), 0, 0);
                GUI.DrawTexture(new Rect(vp.xMax - 30, vp.y, 30, vp.height), UiArt.Chromatic, ScaleMode.StretchToFill, true, 0, new Color(1, 1, 1, chroma), 0, 0);
            }

            float scale = playerCount > 1 ? CoopConfig.HudScale : 1f;
            float pad = 14 * scale;

            // Tarja do piloto (só no coop).
            if (playerCount > 1)
            {
                var tag = new Rect(vp.x + pad, vp.y + pad, 180 * scale, 22 * scale);
                GUI.color = Color.white;
                GUI.DrawTexture(tag, UiArt.Pill);
                var tagLabel = new GUIStyle(labelStyle) { alignment = TextAnchor.MiddleCenter, fontSize = Mathf.RoundToInt(14 * scale) };
                tagLabel.normal.textColor = Color.black;
                GUI.Label(tag, e.Name, tagLabel);
            }

            // Placar de voltas, canto superior direito.
            float boxW = 190 * scale, boxH = 92 * scale;
            var lapBox = new Rect(vp.xMax - boxW - pad, vp.y + pad, boxW, boxH);
            HudRoundRect(lapBox, new Color(1f, .91f, .96f), 24 * scale);
            var lapStyle = new GUIStyle(labelStyle) { fontSize = Mathf.RoundToInt(14 * scale) };
            lapStyle.normal.textColor = new Color(0.2f, 0.1f, 0.2f);
            GUI.Label(new Rect(lapBox.x + 10, lapBox.y + 4, boxW - 20, 22), $"VOLTA {tracker.Lap + 1}/{RaceConfig.Laps}", lapStyle);
            GUI.Label(new Rect(lapBox.x + 10, lapBox.y + 24, boxW - 20, 22), FormatTime(tracker.CurrentLapTime), lapStyle);
            GUI.Label(new Rect(lapBox.x + 10, lapBox.y + 44, boxW - 20, 20),
                $"últ {(tracker.LastLapTime > 0 ? FormatTime(tracker.LastLapTime) : "--:--.--")}", lapStyle);
            GUI.Label(new Rect(lapBox.x + 10, lapBox.y + 64, boxW - 20, 20),
                $"melhor {(float.IsFinite(tracker.BestLapTime) ? FormatTime(tracker.BestLapTime) : "--:--.--")}", lapStyle);

            // Moedas, abaixo do placar.
            coinPopTimer.TryGetValue(e.Index, out float pop);
            float coinScale = pop > 0 ? 1.15f : 1f;
            var coinBox = new Rect(vp.xMax - 90 * scale - pad, lapBox.yMax + 6 * scale, 90 * scale, 30 * scale * coinScale);
            HudRoundRect(coinBox, Color.white, coinBox.height / 2);
            GUI.DrawTexture(new Rect(coinBox.x + 4, coinBox.y + 3, coinBox.height - 6, coinBox.height - 6), UiArt.CoinDot);
            var coinStyle = new GUIStyle(labelStyle) { fontSize = Mathf.RoundToInt(16 * scale), fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleRight };
            coinStyle.normal.textColor = new Color(0.2f, 0.1f, 0.2f);
            GUI.Label(new Rect(coinBox.x, coinBox.y, coinBox.width - 10, coinBox.height), e.CoinsCollected.ToString(), coinStyle);

            // Velocímetro, canto inferior.
            float speedKmh = kart.Telemetry.Speed * 3.6f;
            var speedoStyle = new GUIStyle(bigLabelStyle) { alignment = TextAnchor.LowerRight, fontSize = Mathf.RoundToInt(38 * scale) };
            GUI.Label(new Rect(vp.xMax - 220 * scale - pad, vp.yMax - 60 * scale, 220 * scale, 50 * scale), Mathf.RoundToInt(speedKmh) + " km/h", speedoStyle);

            // Medidor de drift.
            var drift = kart.Drift;
            float maxCharge = DriftConfig.Charge.Levels[2];
            float chargeRatio = Mathf.Clamp01(drift.Charge / maxCharge);
            int level = drift.IsBoosting ? drift.BoostLevel : drift.Level;
            float fillRatio = drift.IsBoosting ? drift.BoostTimeRemaining : chargeRatio;

            float meterW = 220 * scale, meterH = 26 * scale;
            var meterRect = new Rect(vp.x + pad, vp.yMax - meterH - pad, meterW, meterH);
            HudRoundRect(meterRect, new Color(1, 1, 1, .9f), meterH / 2);
            HudRoundRect(new Rect(meterRect.x + 3 * scale, meterRect.y + 3 * scale,
                meterRect.width - 6 * scale, meterRect.height - 6 * scale), new Color(.35f, .12f, .3f, .65f), (meterH - 6 * scale) / 2);
            var fillRect = new Rect(meterRect.x + 4 * scale, meterRect.y + 4 * scale, (meterRect.width - 8 * scale) * Mathf.Clamp01(fillRatio), meterRect.height - 8 * scale);
            GUI.color = LevelColors[level];
            if (fillRect.width > 0) HudRoundRect(fillRect, Color.white, Mathf.Min(fillRect.height, fillRect.width) / 2);
            GUI.color = Color.white;
            var driftLabelStyle = new GUIStyle(labelStyle) { fontSize = Mathf.RoundToInt(13 * scale), alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            driftLabelStyle.normal.textColor = level > 0 ? LevelColors[level] : Color.white;
            GUI.Label(meterRect, drift.IsBoosting ? LevelLabels[drift.BoostLevel] : (level > 0 ? LevelLabels[level] : "DRIFT"), driftLabelStyle);

            // Aviso central: fora da pista tem prioridade sobre a mensagem de volta.
            string warning = null;
            if (kart.Telemetry.OffTrack && tracker.OffTrackTimer > 0.35f)
            {
                float remaining = Mathf.Max(0, TrackConfig.OffTrackGraceSeconds - tracker.OffTrackTimer);
                warning = $"FORA DA PISTA  {remaining:0.0}";
            }
            else if (messageTimer.TryGetValue(e.Index, out float wt) && wt > 0)
            {
                messageText.TryGetValue(e.Index, out warning);
            }

            if (!string.IsNullOrEmpty(warning))
            {
                var warnRect = new Rect(vp.x + vp.width * 0.5f - 220 * scale, vp.y + 60 * scale, 440 * scale, 40 * scale);
                GUI.DrawTexture(warnRect, UiArt.Pill);
                var ws = new GUIStyle(warningStyle) { fontSize = Mathf.RoundToInt(16 * scale) };
                ws.normal.textColor = new Color(0.2f, 0.1f, 0.2f);
                GUI.Label(warnRect, warning, ws);
            }
        }

        static void HudRoundRect(Rect rect, Color color, float radius)
        {
            GUI.DrawTexture(rect, UiArt.White, ScaleMode.StretchToFill, true, 0, color, 0, radius);
        }

        static void DrawFaded(Texture2D tex, Rect rect, float alpha)
        {
            var prev = GUI.color;
            GUI.color = new Color(1, 1, 1, alpha);
            GUI.DrawTexture(rect, tex, ScaleMode.StretchToFill);
            GUI.color = prev;
        }

        // --- Menu ---

        void DrawSweetBackdrop()
        {
            float scale = Mathf.Min(Screen.width / 960f, Screen.height / 720f);
            GUI.DrawTexture(new Rect((960 - Screen.width / scale) / 2, (720 - Screen.height / scale) / 2,
                Screen.width / scale, Screen.height / scale), UiArt.MenuSky);
            for (int i = 0; i < 24; i++)
            {
                float x = (i * 137 + 23) % 960;
                float y = (i * 83 + 19) % 720 + Mathf.Sin(Time.unscaledTime + i) * 8;
                var previous = GUI.color;
                GUI.color = i % 2 == 0 ? new Color(1, 1, 1, .65f) : new Color(1, .77f, .87f, .65f);
                GUI.DrawTexture(new Rect(x, y, 7 + i % 4 * 3, 7 + i % 4 * 3), UiArt.Pill);
                GUI.color = previous;
            }
            CandyBalloonFrames.Draw(new Rect(5, 155, 245, 245), 1.5f);
            CandyBalloonFrames.Draw(new Rect(750, 370, 190, 190), 3);
        }

        void DrawSweetCard(Rect rect)
        {
            var previous = GUI.color;
            GUI.color = new Color(.47f, .25f, .55f, .18f);
            GUI.DrawTexture(new Rect(rect.x + 5, rect.y + 9, rect.width, rect.height), UiArt.Card);
            GUI.color = previous;
            GUI.DrawTexture(rect, UiArt.Card);
        }

        void DrawPause()
        {
            // Mesmo pano de fundo fotográfico do menu inicial, para as telas
            // soarem como uma coisa só (em vez do céu gradiente genérico).
            // O retângulo precisa cobrir a tela INTEIRA dentro do espaço local
            // da matriz 960x720 escalada — não só a caixa 960x720 nominal —
            // senão em telas com proporção diferente sobra jogo/HUD visível
            // nas bordas, por trás do card (jeito que dava a impressão de que
            // o jogo não tinha pausado de verdade).
            var photo = UiArt.MenuBackdropPhoto;
            float bgScale = Mathf.Min(Screen.width / 960f, Screen.height / 720f);
            var fullBleed = new Rect((960 - Screen.width / bgScale) / 2, (720 - Screen.height / bgScale) / 2,
                Screen.width / bgScale, Screen.height / bgScale);
            if (photo != null) GUI.DrawTexture(fullBleed, photo, ScaleMode.ScaleAndCrop);
            else DrawSweetBackdrop();

            // Card com moldura rosa (UiArt.PausePanel), maior e com botões
            // proporcionais como na referência: pílula rosa larga em cima e
            // uma pílula lilás clara, mais estreita, embaixo.
            var card = new Rect(250, 140, 460, 440);
            var shadowColor = GUI.color;
            GUI.color = new Color(.47f, .25f, .55f, .18f);
            GUI.DrawTexture(new Rect(card.x + 5, card.y + 9, card.width, card.height), UiArt.PausePanel);
            GUI.color = shadowColor;
            GUI.DrawTexture(card, UiArt.PausePanel);
            CandyBalloonFrames.Draw(new Rect(410, 150, 140, 140));
            GUI.Label(new Rect(270, 306, 420, 46), "UMA PAUSA DOCE", new GUIStyle(titleStyle) { fontSize = 34 });
            GUI.Label(new Rect(280, 358, 400, 34), "Respire. A pista espera por você!", detailStyle);
            if (IconButton(new Rect(290, 414, 380, 82), UiArt.BackIcon, "VOLTAR À CORRIDA", pinkPillStyle, 21)) onResume?.Invoke();
            if (onMenu != null && IconButton(new Rect(310, 504, 340, 68), UiArt.HomeIcon, "MENU INICIAL", purplePillStyle, 19, LavenderText)) onMenu();
        }

        // --- Fim de corrida ---

        void DrawFinishScreen()
        {
            DrawSweetBackdrop();

            var ordered = new List<Competitor>(finishCompetitors);
            ordered.Sort((a, b) => a.Position - b.Position);

            Competitor champion = finishWinner ?? ordered.Find(c => c.Position == 1);

            var humans = new List<Competitor>();
            foreach (var c in ordered) if (c.IsPlayer) humans.Add(c);
            bool coop = humans.Count > 1;
            bool won = champion != null && champion.IsPlayer;

            string winnerName = champion != null ? (champion.IsPlayer && !coop ? "Você" : champion.Name) : "Vencedor";

            float w = 540, h = Mathf.Max(450, 280 + (finishSeries != null ? finishSeries.Count : ordered.Count) * 28);
            var card = new Rect(480 - w / 2, 360 - h / 2, w, h);
            DrawSweetCard(card);

            var trophyRect = new Rect(card.x + card.width / 2 - 50, card.y + 10, 100, 105);
            GUI.DrawTexture(trophyRect, won ? UiArt.Trophy : UiArt.TrophyGray);

            var titleRect = new Rect(card.x, card.y + 118, card.width, 34);
            var titleS = new GUIStyle(titleStyle) { fontSize = 24 };
            GUI.Label(titleRect, won && !coop ? "VOCÊ VENCEU!" : $"{winnerName.ToUpperInvariant()} VENCEU!", titleS);

            string detail = coop
                ? CoopDetail(humans, champion, winnerName)
                : won
                    ? $"{RaceConfig.Laps} voltas, primeiro lugar. O troféu é seu!"
                    : $"Você terminou em {finishPlayerPosition}º. {winnerName} levou o troféu desta vez.";
            GUI.Label(new Rect(card.x + 24, card.y + 154, card.width - 48, 40), detail, detailStyle);

            float rowY = card.y + 204;
            if (finishSeries != null)
            {
                foreach (var s in finishSeries)
                {
                    DrawStandingRow(card, ref rowY, s.Position, s.Name, s.IsPlayer, s.Name == champion?.Name, $"{s.Points} pts");
                }
            }
            else
            {
                foreach (var c in ordered)
                {
                    string time = c.Finished ? FormatTime(c.FinishTime) : "—";
                    DrawStandingRow(card, ref rowY, c.Position, c.IsPlayer && !coop ? $"{c.Name} (você)" : c.Name, c.IsPlayer, c == champion, time);
                }
            }

            if (GUI.Button(new Rect(card.x + 100, card.yMax - 56, card.width - 200, 44), "CORRER DE NOVO", buttonStyle))
                onRestart?.Invoke();
        }

        void DrawStandingRow(Rect card, ref float y, int position, string name, bool isPlayer, bool isChampion, string trailing)
        {
            var rowRect = new Rect(card.x + 24, y, card.width - 48, 26);
            if (isChampion) GUI.DrawTexture(rowRect, UiArt.GoldRow);
            var style = new GUIStyle(rowStyle);
            style.normal.textColor = isPlayer ? new Color(.68f, .18f, .43f) : new Color(.35f, .22f, .43f);
            GUI.Label(new Rect(rowRect.x + 6, rowRect.y + 3, 40, 20), $"{position}º", style);
            GUI.Label(new Rect(rowRect.x + 50, rowRect.y + 3, rowRect.width - 130, 20), isChampion ? $"Troféu - {name}" : name, style);
            var trailStyle = new GUIStyle(style) { alignment = TextAnchor.MiddleRight };
            GUI.Label(new Rect(rowRect.xMax - 90, rowRect.y + 3, 84, 20), trailing, trailStyle);
            y += 28;
        }

        static string CoopDetail(List<Competitor> humans, Competitor champion, string winnerName)
        {
            humans.Sort((a, b) => a.Position - b.Position);
            var placings = new List<string>();
            foreach (var h in humans) placings.Add($"{h.Name} em {h.Position}º");
            string placingsText = string.Join(", ", placings);

            if (humans.Count < 2) return $"{placingsText}.";

            string duel = $"{humans[0].Name} levou a melhor sobre {humans[1].Name}";
            return champion != null && champion.IsPlayer
                ? $"{duel}. {placingsText}."
                : $"{duel}, mas {winnerName} levou o troféu. {placingsText}.";
        }

        static string FormatTime(float seconds)
        {
            if (!float.IsFinite(seconds)) return "--:--.--";
            int minutes = Mathf.FloorToInt(seconds / 60);
            float rest = seconds - minutes * 60;
            return $"{minutes}:{rest:00.00}";
        }
    }
}
