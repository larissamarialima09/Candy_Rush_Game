using UnityEngine;

namespace CandyRush
{
    /// <summary>
    /// As texturas da interface, desenhadas no <see cref="Canvas2D"/> a partir
    /// do CSS e do SVG do index.html original: pílulas, cartão, vinheta, linhas
    /// de velocidade, franja de turbo, moedinha e o troféu.
    /// </summary>
    public static class UiArt
    {
        public static Texture2D White, Pill, PillBorder, Rounded, Card, Backdrop, Vignette, SpeedLines, Chromatic, CoinDot, Trophy, TrophyGray;
        public static Texture2D PinkButton, BlueButton, GoldRow, MenuSky;
        public static Texture2D FrontPink, FrontPurple, FrontHover, FrontPanel;
        public static Texture2D SoftLavenderPill, PausePanel;
        public static Texture2D PauseResumePill, PauseHomePill;
        public static Texture2D RestartPill, RestartHoverPill, RestartPressedPill;
        public static Texture2D BackIcon, HomeIcon, PlayIcon, GearIcon, FlagIcon;
        public static Texture2D MenuBackdropPhoto;
        public static Font Font;

        public static void Build()
        {
            if (White != null) return;
            White = Solid(Color.white);
            FrontPink = GlossyPill("#ff83bc", "#f51e87");
            FrontPurple = GlossyPill("#b889dc", "#8b3caa");
            FrontHover = GlossyPill("#ffb0d5", "#ff48a2");
            FrontPanel = GlossyPill("#fff9fd", "#ffdfec");
            SoftLavenderPill = GlossyPill("#f3ecff", "#dcc6fa", "#8b3caa");
            PausePanel = PausePanelTexture();
            PauseResumePill = MenuPill(380, 82, "#ff80b8", "#f50079");
            PauseHomePill = MenuPill(340, 68, "#f3ecff", "#dcc6fa");
            RestartPill = MenuPill(340, 44, "#ff80b8", "#f50079");
            RestartHoverPill = MenuPill(340, 44, "#ffb0d5", "#ff48a2");
            RestartPressedPill = MenuPill(340, 44, "#f567aa", "#d9006b");

            Pill = RoundedTexture(64, 64, 32, "#ffffff");
            PillBorder = TrackTexture();
            Rounded = RoundedTexture(32, 32, 8, "#ffffff");
            Card = CardTexture();
            PinkButton = GradientPill("#ff8fbe", "#ff5f9b");
            BlueButton = GradientPill("#8fd8ff", "#4bb4f0");
            GoldRow = GradientPill("#ffe9a8", "#ffd24d");
            Backdrop = BackdropTexture();
            var sky = new Canvas2D(128, 128);
            sky.FillGradient = Canvas2D.Linear(0, 0, 128, 128).AddStop(0, "#cdefff").AddStop(.5f, "#ede0ff").AddStop(1, "#ffd9e9");
            sky.FillRoundRect(0, 0, 128, 128, 0);
            MenuSky = sky.ToTexture("candy-menu-sky", false, false, false);
            Vignette = VignetteTexture();
            SpeedLines = SpeedLinesTexture();
            Chromatic = ChromaticTexture();
            CoinDot = CoinTexture();
            Trophy = TrophyTexture(false);
            TrophyGray = TrophyTexture(true);
            BackIcon = BackArrowIcon();
            HomeIcon = HouseIcon();
            PlayIcon = PlayTriangleIcon();
            GearIcon = GearWheelIcon();
            FlagIcon = CheckeredFlagIcon();
            MenuBackdropPhoto = Resources.Load<Texture2D>("Candy/Menu/Backdrop");

            Font = Font.CreateDynamicFontFromOSFont(new[] { "Arial Rounded MT Bold", "Trebuchet MS", "Arial" }, 16);
            if (Font == null) Font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        }

        static Texture2D Solid(Color color)
        {
            var t = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            t.SetPixels(new[] { color, color, color, color });
            t.Apply();
            return t;
        }

        static Texture2D GlossyPill(string top, string bottom, string edge = "#753168")
        {
            var c = new Canvas2D(128, 128);
            c.Fill(edge); c.FillRoundRect(2, 7, 124, 120, 58);
            c.Fill("#fff9ff"); c.FillRoundRect(1, 1, 126, 120, 59);
            c.FillGradient = Canvas2D.Linear(0, 4, 0, 118).AddStop(0, top).AddStop(1, bottom);
            c.FillRoundRect(5, 5, 118, 112, 54);
            c.Fill(new Color(1, 1, 1, .24f)); c.FillRoundRect(17, 10, 94, 38, 19);
            return c.ToTexture("front-pill", false, false, false);
        }

        // Desenha na proporção final: as extremidades e o brilho não são esticados.
        public static Texture2D MenuPill(int width, int height, string top, string bottom)
        {
            var c = new Canvas2D(width * 2, height * 2);
            float w = c.Width, h = c.Height;
            c.Fill("#86365f"); c.FillRoundRect(2, 10, w - 4, h - 10, (h - 10) / 2);
            c.Fill("#ffdba8"); c.FillRoundRect(0, 3, w, h - 10, (h - 10) / 2);
            c.Fill("#fff6fc"); c.FillRoundRect(4, 2, w - 8, h - 14, (h - 14) / 2);
            c.FillGradient = Canvas2D.Linear(0, 8, 0, h - 14).AddStop(0, top).AddStop(1, bottom);
            c.FillRoundRect(10, 8, w - 20, h - 26, (h - 26) / 2);
            c.FillGradient = Canvas2D.Linear(0, 12, 0, h * .55f)
                .AddStop(0, new Color(1, 1, 1, .48f)).AddStop(1, new Color(1, 1, 1, 0));
            c.FillRoundRect(24, 12, w - 48, h * .43f, h * .215f);
            return c.ToTexture("menu-candy-pill", false, false, false);
        }

        static Texture2D RoundedTexture(int w, int h, float radius, string color)
        {
            var c = new Canvas2D(w, h);
            c.Fill(color);
            c.FillRoundRect(0, 0, w, h, radius);
            return c.ToTexture("ui-rounded", false, false, false);
        }

        static Texture2D GradientPill(string top, string bottom)
        {
            var c = new Canvas2D(64, 64);
            c.FillGradient = Canvas2D.Linear(0, 0, 0, 64).AddStop(0, top).AddStop(1, bottom);
            c.FillRoundRect(0, 0, 64, 64, 30);
            return c.ToTexture("ui-pill", false, false, false);
        }

        /// <summary>Trilho do medidor de drift: fundo translúcido e borda branca.</summary>
        static Texture2D TrackTexture()
        {
            var c = new Canvas2D(64, 32);
            c.Fill(new Color(1, 1, 1, 0.6f));
            c.FillRoundRect(0, 0, 64, 32, 16);
            var inner = new Canvas2D(64, 32);
            // Recorta o miolo e pinta o fundo translúcido por cima.
            for (int i = 0; i < c.Pixels.Length; i++) inner.Pixels[i] = Color.clear;
            inner.Fill(new Color(1, 1, 1, 1));
            inner.FillRoundRect(4, 4, 56, 24, 12);
            for (int i = 0; i < c.Pixels.Length; i++)
            {
                float k = inner.Pixels[i].a;
                Color edge = c.Pixels[i];
                c.Pixels[i] = Color.Lerp(edge, new Color(1, 1, 1, 0.28f), k);
            }
            return c.ToTexture("ui-track", false, false, false);
        }

        /// <summary>Cartão com moldura rosa visível em volta, para a tela de pausa.</summary>
        static Texture2D PausePanelTexture()
        {
            var c = new Canvas2D(160, 160);
            c.Fill("#ff5fa3");
            c.FillRoundRect(0, 0, 160, 160, 42);
            c.FillGradient = Canvas2D.Linear(20, 8, 140, 152).AddStop(0, "#fff8fc").AddStop(0.6f, "#fff0f7").AddStop(1, "#ffe3f0");
            c.FillRoundRect(9, 9, 142, 142, 35);
            return c.ToTexture("ui-pause-panel", false, false, false);
        }

        static Texture2D CardTexture()
        {
            var c = new Canvas2D(160, 160);
            c.Fill("#ffffff");
            c.FillRoundRect(0, 0, 160, 160, 38);
            c.FillGradient = Canvas2D.Linear(20, 0, 140, 160).AddStop(0, "#fff6fa").AddStop(0.55f, "#ffe6f0").AddStop(1, "#ffd9ea");
            c.FillRoundRect(4, 4, 152, 152, 34);
            return c.ToTexture("ui-card", false, false, false);
        }

        static Texture2D BackdropTexture()
        {
            const int size = 128;
            var c = new Canvas2D(size, size);
            var inner = new Color(60 / 255f, 30 / 255f, 70 / 255f, 0.35f);
            var outer = new Color(20 / 255f, 12 / 255f, 34 / 255f, 0.85f);
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float dx = ((x + 0.5f) / size - 0.5f) / 0.8f;
                    float dy = ((y + 0.5f) / size - 0.45f) / 0.7f;
                    c.Pixels[y * size + x] = Color.Lerp(inner, outer, Mathf.Clamp01(Mathf.Sqrt(dx * dx + dy * dy)));
                }
            }
            return c.ToTexture("ui-backdrop", false, false, false);
        }

        static Texture2D VignetteTexture()
        {
            const int size = 256;
            var c = new Canvas2D(size, size);
            var mid = new Color(120 / 255f, 40 / 255f, 80 / 255f, 0.35f);
            var edge = new Color(60 / 255f, 15 / 255f, 45 / 255f, 0.75f);
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float dx = ((x + 0.5f) / size - 0.5f) / 0.62f;
                    float dy = ((y + 0.5f) / size - 0.52f) / 0.58f;
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    Color col;
                    if (d <= 0.45f) col = new Color(mid.r, mid.g, mid.b, 0);
                    else if (d <= 0.78f) col = Color.Lerp(new Color(mid.r, mid.g, mid.b, 0), mid, (d - 0.45f) / 0.33f);
                    else col = Color.Lerp(mid, edge, Mathf.Clamp01((d - 0.78f) / 0.22f));
                    c.Pixels[y * size + x] = col;
                }
            }
            return c.ToTexture("ui-vignette", false, false, false);
        }

        static Texture2D SpeedLinesTexture()
        {
            const int size = 512;
            var c = new Canvas2D(size, size);
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    float nx = (x + 0.5f) / size - 0.5f, ny = (y + 0.5f) / size - 0.5f;
                    float angle = Mathf.Atan2(nx, -ny) * Mathf.Rad2Deg;
                    if (angle < 0) angle += 360;
                    float a = angle % 3f;
                    float line = a < 2.2f ? 0 : a < 2.6f ? (a - 2.2f) / 0.4f * 0.5f : Mathf.Max(0, 0.5f - (a - 2.6f) / 0.4f * 0.5f);
                    float dx = nx / 0.55f, dy = ny / 0.5f;
                    float d = Mathf.Sqrt(dx * dx + dy * dy);
                    float mask = Mathf.Clamp01((d - 0.4f) / 0.6f);
                    c.Pixels[y * size + x] = new Color(1, 1, 1, line * mask);
                }
            }
            return c.ToTexture("ui-speedlines", false, false, false);
        }

        static Texture2D ChromaticTexture()
        {
            const int w = 256, h = 4;
            var c = new Canvas2D(w, h);
            var pink = new Color(1, 60 / 255f, 120 / 255f, 0.55f);
            var cyan = new Color(60 / 255f, 220 / 255f, 1, 0.55f);
            for (int x = 0; x < w; x++)
            {
                float u = (x + 0.5f) / w;
                float left = Mathf.Clamp01(1 - u / 0.14f);
                float right = Mathf.Clamp01(1 - (1 - u) / 0.14f);
                Color col = left > 0 ? new Color(pink.r, pink.g, pink.b, pink.a * left)
                    : right > 0 ? new Color(cyan.r, cyan.g, cyan.b, cyan.a * right) : Color.clear;
                for (int y = 0; y < h; y++) c.Pixels[y * w + x] = col;
            }
            return c.ToTexture("ui-chromatic", false, false, false);
        }

        static Texture2D CoinTexture()
        {
            var c = new Canvas2D(128, 128);
            c.Fill("#925018"); c.FillCircle(64, 66, 59);
            c.FillGradient = Canvas2D.Linear(20, 12, 104, 112)
                .AddStop(0, "#fff5bc").AddStop(.35f, "#ffd66c")
                .AddStop(.65f, "#b97820").AddStop(1, "#ffe391");
            c.FillCircle(64, 62, 58);
            c.Stroke("#9d6119"); c.LineWidth = 2;
            for (int i = 0; i < 48; i++)
            {
                float a = i * Mathf.PI * 2 / 48;
                c.BeginPath();
                c.MoveTo(64 + Mathf.Cos(a) * 52, 62 + Mathf.Sin(a) * 52);
                c.LineTo(64 + Mathf.Cos(a) * 56, 62 + Mathf.Sin(a) * 56);
                c.StrokePath();
            }
            c.Fill("#fff0a5"); c.FillCircle(64, 62, 49);
            c.Fill("#a86518"); c.FillCircle(64, 63, 46);
            c.FillGradient = Canvas2D.Linear(28, 20, 94, 108)
                .AddStop(0, "#fff1a2").AddStop(.45f, "#eeb947").AddStop(1, "#c88725");
            c.FillCircle(64, 61, 44);
            // Finas marcas de cunhagem, determinísticas, sob o emblema em relevo.
            for (int i = 0; i < 220; i++)
            {
                float a = i * 2.399963f, r = 41 * Mathf.Sqrt((i + .5f) / 220);
                c.Fill(i % 2 == 0 ? new Color(1, .96f, .72f, .22f) : new Color(.5f, .28f, .06f, .12f));
                c.FillCircle(64 + Mathf.Cos(a) * r, 61 + Mathf.Sin(a) * r, .65f);
            }
            for (int layer = 0; layer < 2; layer++)
            {
                c.Fill(layer == 0 ? "#9b5b16" : "#fff0a0");
                c.BeginPath();
                for (int i = 0; i < 10; i++)
                {
                    float a = -Mathf.PI / 2 + i * Mathf.PI / 5, r = i % 2 == 0 ? 28 : 13;
                    float x = 64 + Mathf.Cos(a) * r, y = 61 + Mathf.Sin(a) * r + (layer == 0 ? 3 : 0);
                    if (i == 0) c.MoveTo(x, y); else c.LineTo(x, y);
                }
                c.ClosePath(); c.FillPath();
            }
            return c.ToTexture("ui-coin", false, false, false);
        }

        /// <summary>O troféu SVG do index.html, redesenhado no canvas em 2x.</summary>
        static Texture2D TrophyTexture(bool gray)
        {
            const float s = 2f;
            var c = new Canvas2D((int)(200 * s), (int)(210 * s));
            Canvas2D.Gradient Gold(float y0, float y1) =>
                Canvas2D.Linear(0, y0 * s, 0, y1 * s).AddStop(0, "#ffe9a8").AddStop(0.45f, "#ffd24d").AddStop(1, "#f0a93f");

            // Alças.
            c.Stroke("#ffd24d");
            c.LineWidth = 13 * s;
            c.RoundCaps = true;
            c.BeginPath();
            c.MoveTo(52 * s, 40 * s);
            c.BezierCurveTo(18 * s, 40 * s, 18 * s, 92 * s, 56 * s, 96 * s);
            c.StrokePath();
            c.BeginPath();
            c.MoveTo(148 * s, 40 * s);
            c.BezierCurveTo(182 * s, 40 * s, 182 * s, 92 * s, 144 * s, 96 * s);
            c.StrokePath();

            // Taça.
            c.FillGradient = Gold(34, 132);
            c.BeginPath();
            c.MoveTo(50 * s, 34 * s);
            c.LineTo(150 * s, 34 * s);
            c.LineTo(150 * s, 78 * s);
            c.BezierCurveTo(150 * s, 112 * s, 128 * s, 132 * s, 100 * s, 132 * s);
            c.BezierCurveTo(72 * s, 132 * s, 50 * s, 112 * s, 50 * s, 78 * s);
            c.ClosePath();
            c.FillPath();

            // Pé e base.
            c.FillGradient = Gold(130, 156);
            c.FillRoundRect(90 * s, 130 * s, 20 * s, 26 * s, 7 * s);
            c.FillGradient = Gold(154, 170);
            c.FillRoundRect(62 * s, 154 * s, 76 * s, 16 * s, 8 * s);
            c.Fill("#ffb347");
            c.FillRoundRect(50 * s, 168 * s, 100 * s, 20 * s, 10 * s);

            // Carinha fofa.
            c.Fill("#6b4a2f");
            c.FillEllipse(80 * s, 74 * s, 7 * s, 9 * s, 0);
            c.FillEllipse(120 * s, 74 * s, 7 * s, 9 * s, 0);
            c.Fill("#ffffff");
            c.FillCircle(82.5f * s, 71 * s, 2.6f * s);
            c.FillCircle(122.5f * s, 71 * s, 2.6f * s);
            c.Fill("#ff9ec4");
            c.GlobalAlpha = 0.75f;
            c.FillEllipse(63 * s, 88 * s, 9 * s, 5.5f * s, 0);
            c.FillEllipse(137 * s, 88 * s, 9 * s, 5.5f * s, 0);
            c.GlobalAlpha = 1;
            c.Stroke("#6b4a2f");
            c.LineWidth = 5 * s;
            c.BeginPath();
            c.MoveTo(86 * s, 90 * s);
            c.QuadraticCurveTo(100 * s, 104 * s, 114 * s, 90 * s);
            c.StrokePath();

            // Brilhos.
            c.Fill("#fffbe6");
            Sparkle(c, s, 28, 22, 3.5f, 8);
            Sparkle(c, s, 170, 60, 2.6f, 6);
            Sparkle(c, s, 158, 16, 2f, 4.6f);

            if (gray)
            {
                // filter: grayscale(0.75) opacity(0.55)
                for (int i = 0; i < c.Pixels.Length; i++)
                {
                    Color p = c.Pixels[i];
                    float l = p.r * 0.2126f + p.g * 0.7152f + p.b * 0.0722f;
                    c.Pixels[i] = new Color(Mathf.Lerp(p.r, l, 0.75f), Mathf.Lerp(p.g, l, 0.75f), Mathf.Lerp(p.b, l, 0.75f), p.a * 0.55f);
                }
            }
            return c.ToTexture(gray ? "ui-trophy-gray" : "ui-trophy", false, false, false);
        }

        /// <summary>Seta curva de "voltar", branca, para os botões com ícone.</summary>
        static Texture2D BackArrowIcon()
        {
            var c = new Canvas2D(64, 64);
            c.Stroke("#ffffff");
            c.LineWidth = 9;
            c.RoundCaps = true;
            c.BeginPath();
            c.MoveTo(48, 24);
            c.QuadraticCurveTo(50, 46, 24, 46);
            c.StrokePath();
            c.Fill("#ffffff");
            c.BeginPath();
            c.MoveTo(32, 32);
            c.LineTo(14, 46);
            c.LineTo(32, 60);
            c.ClosePath();
            c.FillPath();
            return c.ToTexture("ui-icon-back", false, false, false);
        }

        /// <summary>Casinha branca simples para o botão "menu inicial".</summary>
        static Texture2D HouseIcon()
        {
            var c = new Canvas2D(64, 64);
            c.Fill("#ffffff");
            c.BeginPath();
            c.MoveTo(32, 8);
            c.LineTo(58, 28);
            c.LineTo(49, 28);
            c.LineTo(49, 54);
            c.LineTo(15, 54);
            c.LineTo(15, 28);
            c.LineTo(6, 28);
            c.ClosePath();
            c.FillPath();
            c.Fill("#8b3caa");
            c.FillRoundRect(27, 38, 10, 16, 2);
            return c.ToTexture("ui-icon-home", false, false, false);
        }

        /// <summary>Triângulo de "play", branco, pro botão JOGAR.</summary>
        static Texture2D PlayTriangleIcon()
        {
            var c = new Canvas2D(64, 64);
            c.Fill("#ffffff");
            c.BeginPath();
            c.MoveTo(21, 14);
            c.LineTo(50, 32);
            c.LineTo(21, 50);
            c.ClosePath();
            c.FillPath();
            return c.ToTexture("ui-icon-play", false, false, false);
        }

        /// <summary>Engrenagem branca, pro botão CONFIGURAÇÕES.</summary>
        static Texture2D GearWheelIcon()
        {
            var c = new Canvas2D(64, 64);
            c.Fill("#ffffff");
            const float cx = 32, cy = 32, r = 14, toothLen = 8, toothHalfW = 5;
            const int teeth = 8;
            c.BeginPath();
            c.Circle(cx, cy, r);
            for (int i = 0; i < teeth; i++)
            {
                float a = i * Mathf.PI * 2 / teeth;
                float dx = Mathf.Cos(a), dy = Mathf.Sin(a);
                float px = -dy, py = dx;
                Vector2 baseA = new Vector2(cx + dx * (r - 2) + px * toothHalfW, cy + dy * (r - 2) + py * toothHalfW);
                Vector2 baseB = new Vector2(cx + dx * (r - 2) - px * toothHalfW, cy + dy * (r - 2) - py * toothHalfW);
                Vector2 tipA = new Vector2(cx + dx * (r + toothLen) + px * toothHalfW, cy + dy * (r + toothLen) + py * toothHalfW);
                Vector2 tipB = new Vector2(cx + dx * (r + toothLen) - px * toothHalfW, cy + dy * (r + toothLen) - py * toothHalfW);
                c.MoveTo(baseA.x, baseA.y);
                c.LineTo(tipA.x, tipA.y);
                c.LineTo(tipB.x, tipB.y);
                c.LineTo(baseB.x, baseB.y);
                c.ClosePath();
            }
            c.FillPath();
            return c.ToTexture("ui-icon-gear", false, false, false);
        }

        /// <summary>Bandeirinha quadriculada de corrida, pra cercar a placa do piloto.</summary>
        static Texture2D CheckeredFlagIcon()
        {
            var c = new Canvas2D(48, 48);
            c.Stroke("#42216e");
            c.LineWidth = 4;
            c.RoundCaps = true;
            c.BeginPath();
            c.MoveTo(8, 6);
            c.LineTo(8, 42);
            c.StrokePath();
            const int cols = 4, rows = 3;
            const float fx = 10, fy = 6, fw = 30, fh = 20;
            const float cw = fw / cols, ch = fh / rows;
            for (int row = 0; row < rows; row++)
            {
                for (int col = 0; col < cols; col++)
                {
                    bool dark = (row + col) % 2 == 0;
                    c.Fill(dark ? "#2b2b2b" : "#ffffff");
                    c.FillRect(fx + col * cw, fy + row * ch, cw, ch);
                }
            }
            return c.ToTexture("ui-icon-flag", false, false, false);
        }

        /// <summary>O brilho de quatro pontas do SVG ("l a b ...").</summary>
        static void Sparkle(Canvas2D c, float s, float x, float y, float a, float b)
        {
            c.BeginPath();
            c.MoveTo(x * s, y * s);
            c.LineTo((x + a) * s, (y + b) * s);
            c.LineTo((x + a + b) * s, (y + b + a) * s);
            c.LineTo((x + a) * s, (y + b + 2 * a) * s);
            c.LineTo(x * s, (y + 2 * b + 2 * a) * s);
            c.LineTo((x - a) * s, (y + b + 2 * a) * s);
            c.LineTo((x - a - b) * s, (y + b + a) * s);
            c.LineTo((x - a) * s, (y + b) * s);
            c.ClosePath();
            c.FillPath();
        }
    }
}
