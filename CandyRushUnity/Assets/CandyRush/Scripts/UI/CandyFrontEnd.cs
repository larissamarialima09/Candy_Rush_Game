using System;
using UnityEngine;

namespace CandyRush
{
    /// <summary>Interactive menu over separate artwork; no text/buttons baked into backgrounds.</summary>
    public sealed class CandyFrontEnd
    {
        public enum Page { Home, Rabbit, Name }
        public Page CurrentPage { get; private set; }
        public int SelectedRabbit { get; private set; }
        public string DraftName { get; set; }
        /// <summary>Desligado pelo GameUI quando o logo animado (Canvas) assume o lugar do logo estático.</summary>
        public bool ShowStaticLogo = true;
        readonly Action<int> start;
        readonly Texture2D background, logo, rabbits, lollipop;
        GUIStyle pink, purple, small, title, caption, field, card, homePlay, homeSettings, homePlate;
        GUIStyle selectionArrow, selectionContinue;
        GUIStyle nameConfirm, namePlate, nameHint;
        TouchScreenKeyboard keyboard;
        public CandyFrontEnd(Action<int> start)
        {
            this.start = start;
            background = Resources.Load<Texture2D>("Candy/Menu/Backdrop");
            logo = Resources.Load<Texture2D>("Candy/Menu/Logo");
            rabbits = Resources.Load<Texture2D>("Candy/Menu/Rabbits");
            lollipop = Resources.Load<Texture2D>("Candy/Menu/Lollipop");
            SelectedRabbit = RacerProfile.Rabbit;
            DraftName = RacerProfile.Name;
        }
        public void OpenSettings()
        {
            SelectedRabbit = RacerProfile.Rabbit;
            DraftName = RacerProfile.Name;
            CurrentPage = Page.Rabbit;
        }
        public void SelectRabbit(int index) => SelectedRabbit = (index % 4 + 4) % 4;
        public void ContinueToName() => CurrentPage = Page.Name;
        public void Confirm()
        {
            if (keyboard != null) { DraftName = keyboard.text; keyboard.active = false; keyboard = null; }
            RacerProfile.Save(DraftName, SelectedRabbit);
            CurrentPage = Page.Home;
        }
        public void Back()
        {
            if (keyboard != null) { keyboard.active = false; keyboard = null; }
            CurrentPage = CurrentPage == Page.Name ? Page.Rabbit : Page.Home;
        }
        public void Play() => start(1);
        void Styles()
        {
            if (pink != null) return;
            pink = new GUIStyle(GUI.skin.button) { font = UiArt.Font, fontSize = 32, fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter, border = new RectOffset(60, 60, 60, 60) };
            pink.normal.background = UiArt.FrontPink;
            pink.hover.background = UiArt.FrontHover;
            pink.active.background = UiArt.FrontPurple;
            pink.focused.background = UiArt.FrontHover;
            pink.normal.textColor = pink.hover.textColor = pink.active.textColor = pink.focused.textColor = Color.white;
            purple = new GUIStyle(pink) { fontSize = 23 };
            purple.normal.background = UiArt.FrontPurple;
            small = HomeButton(112, 60, 19, "#bd8aeb", "#8133b0");
            selectionArrow = HomeButton(64, 72, 32, "#ff80b8", "#f50079");
            selectionContinue = HomeButton(340, 76, 32, "#ff80b8", "#f50079");
            nameConfirm = HomeButton(350, 86, 32, "#ff80b8", "#f50079");
            namePlate = new GUIStyle { normal = { background = UiArt.MenuPill(650, 64, "#fffaf5", "#ffe0eb") } };
            title = new GUIStyle { font = UiArt.Font, fontSize = 31, fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter, normal = { textColor = Hex.C(0x42216e) } };
            caption = new GUIStyle(title) { fontSize = 20, wordWrap = true };
            nameHint = new GUIStyle(caption) { fontSize = 18 };
            field = new GUIStyle(GUI.skin.textField) { font = UiArt.Font, fontSize = 29,
                alignment = TextAnchor.MiddleLeft, padding = new RectOffset(28, 24, 12, 12),
                border = new RectOffset() };
            field.normal.background = field.hover.background = field.active.background = field.focused.background =
                UiArt.MenuPill(650, 88, "#fffaf5", "#ffe0eb");
            field.normal.textColor = field.focused.textColor = Hex.C(0x42216e);
            card = new GUIStyle { normal = { background = UiArt.FrontPanel }, border = new RectOffset(30, 30, 30, 30) };
            homePlay = HomeButton(400, 104, 36, "#ff80b8", "#f50079");
            homeSettings = HomeButton(320, 72, 22, "#bd8aeb", "#8133b0");
            homePlate = new GUIStyle { normal = { background = UiArt.MenuPill(340, 48, "#fffaf5", "#ffe0eb") } };
        }
        GUIStyle HomeButton(int width, int height, int fontSize, string top, string bottom)
        {
            var style = new GUIStyle(pink) { fontSize = fontSize, border = new RectOffset() };
            style.normal.background = UiArt.MenuPill(width, height, top, bottom);
            style.hover.background = style.focused.background = UiArt.MenuPill(width, height, "#ffd2ec", bottom);
            style.active.background = UiArt.MenuPill(width, height, bottom, top);
            return style;
        }
        void Panel(Rect r) => GUI.Box(r, GUIContent.none, card);
        /// <summary>Pílula com ícone à esquerda e texto, para JOGAR/CONFIGURAÇÕES.</summary>
        bool IconButton(Rect r, Texture2D icon, string label, GUIStyle pillStyle)
        {
            bool clicked = GUI.Button(r, GUIContent.none, pillStyle);
            float iconSize = r.height * 0.46f;
            float iconX = r.x + r.height * 0.32f;
            GUI.DrawTexture(new Rect(iconX, r.y + (r.height - iconSize) / 2, iconSize, iconSize), icon);
            var textStyle = new GUIStyle { font = pillStyle.font, fontSize = pillStyle.fontSize, fontStyle = pillStyle.fontStyle,
                alignment = TextAnchor.MiddleCenter, normal = { textColor = pillStyle.normal.textColor } };
            float textX = iconX + iconSize + 10;
            GUI.Label(new Rect(textX, r.y, r.xMax - textX - 14, r.height), label, textStyle);
            return clicked;
        }
        void Rabbit(Rect r, int index)
        {
            if (rabbits == null) return;
            float aspect = rabbits.width / 4f / rabbits.height;
            float w = Mathf.Min(r.width, r.height * aspect), h = w / aspect;
            GUI.DrawTextureWithTexCoords(new Rect(r.center.x - w / 2, r.center.y - h / 2, w, h), rabbits,
                new Rect(index * .25f, 0, .25f, 1));
        }
        /// <summary>Pirulito girando, 24 quadros num atlas 6x4 gerado por BakeFrontEndArt.</summary>
        void Lollipop(Rect r, float offset)
        {
            if (lollipop == null) return;
            int frame = Mathf.FloorToInt((Time.unscaledTime + offset) * 12) % 24;
            GUI.DrawTextureWithTexCoords(r, lollipop, new Rect((frame % 6) / 6f, (frame / 6) / 4f, 1f / 6, .25f));
        }
        public void Draw()
        {
            Styles();
            var previous = GUI.matrix;
            GUI.matrix = Matrix4x4.identity;
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), background != null ? background : UiArt.MenuSky, ScaleMode.ScaleAndCrop);
            Rect safe = Screen.safeArea;
            if (safe.width <= 0 || safe.height <= 0) safe = new Rect(0, 0, Screen.width, Screen.height);
            float scale = Mathf.Min(safe.width / 1280f, safe.height / 720f);
            GUI.matrix = Matrix4x4.TRS(new Vector3(safe.x + (safe.width - 1280 * scale) / 2,
                Screen.height - safe.yMax + (safe.height - 720 * scale) / 2, 0), Quaternion.identity, Vector3.one * scale);
            Lollipop(new Rect(1130, 490, 120, 168), 0);
            if (CurrentPage == Page.Home) DrawHome();
            else
            {
                if (GUI.Button(new Rect(28, 28, 112, 60), "VOLTAR", small)) Back();
                if (CurrentPage == Page.Rabbit) DrawSelection();
                else DrawName();
            }
            if (Event.current.type == EventType.KeyDown && Event.current.keyCode == KeyCode.Escape && CurrentPage != Page.Home)
            { Back(); Event.current.Use(); }
            GUI.matrix = previous;
        }
        void DrawHome()
        {
            if (ShowStaticLogo && logo != null) GUI.DrawTexture(new Rect(360, 5, 580, 355), logo, ScaleMode.ScaleToFit);
            Rabbit(new Rect(30, 278, 340, 400), RacerProfile.Rabbit);
            if (IconButton(new Rect(440, 354, 400, 104), UiArt.PlayIcon, "JOGAR", homePlay)) Play();
            if (IconButton(new Rect(480, 478, 320, 72), UiArt.GearIcon, "CONFIGURAÇÕES", homeSettings)) OpenSettings();
            GUI.Box(new Rect(470, 580, 340, 48), GUIContent.none, homePlate);
            string plate = RacerProfile.Name + "  ·  " + RacerProfile.RabbitNames[RacerProfile.Rabbit];
            GUI.DrawTexture(new Rect(480, 587, 28, 28), UiArt.FlagIcon);
            GUI.Label(new Rect(512, 582, 256, 38), plate, caption);
            GUI.DrawTexture(new Rect(772, 587, 28, 28), UiArt.FlagIcon);
            Lollipop(new Rect(1040, 105, 90, 126), 1);
        }
        void Header(string text)
        {
            Panel(new Rect(235, 40, 810, 80));
            GUI.Label(new Rect(255, 50, 770, 60), text, title);
        }
        void DrawSelection()
        {
            Header("ESCOLHA SEU COELHO");
            const float cardW = 220, gap = 26;
            float total = 4 * cardW + 3 * gap;
            float startX = (1280 - total) / 2;
            const float centerY = 360;
            for (int i = 0; i < 4; i++)
            {
                bool selected = i == SelectedRabbit;
                float h = selected ? 350 : 320;
                Rect r = new Rect(startX + i * (cardW + gap), centerY - h / 2, cardW, h);
                if (selected)
                {
                    var color = GUI.color;
                    GUI.color = new Color(1, .35f, .73f, .8f + .2f * Mathf.Sin(Time.unscaledTime * 3));
                    Panel(new Rect(r.x - 7, r.y - 7, r.width + 14, r.height + 14));
                    GUI.color = color;
                }
                if (GUI.Button(r, GUIContent.none, card)) SelectRabbit(i);
                Rabbit(new Rect(r.x + 10, r.y + 9, r.width - 20, r.height - 62), i);
                GUI.Label(new Rect(r.x + 5, r.yMax - 48, r.width - 10, 36), RacerProfile.RabbitNames[i], caption);
                if (selected) GUI.Label(new Rect(r.x, r.yMax + 12, r.width, 28), "✓  SELECIONADO", caption);
            }
            if (GUI.Button(new Rect(startX - 84, centerY - 36, 64, 72), "‹", selectionArrow)) SelectRabbit(SelectedRabbit - 1);
            if (GUI.Button(new Rect(startX + total + 20, centerY - 36, 64, 72), "›", selectionArrow)) SelectRabbit(SelectedRabbit + 1);
            if (GUI.Button(new Rect(470, 600, 340, 76), "CONTINUAR", selectionContinue)) ContinueToName();
        }
        void DrawName()
        {
            Header("ESCOLHA SEU NOME DE CORREDOR");
            Rabbit(new Rect(55, 208, 320, 420), SelectedRabbit);
            const float formX = 430, formWidth = 650;
            GUI.Box(new Rect(formX, 216, formWidth, 64), GUIContent.none, namePlate);
            GUI.Label(new Rect(formX + 24, 224, formWidth - 48, 44), "Seu coelho: " + RacerProfile.RabbitNames[SelectedRabbit], caption);
            var input = new Rect(formX, 312, formWidth, 88);
            GUI.SetNextControlName("RacerName");
            if (TouchScreenKeyboard.isSupported)
            {
                if (GUI.Button(input, string.IsNullOrEmpty(DraftName) ? "Digite seu nome..." : DraftName, field))
                    keyboard = TouchScreenKeyboard.Open(DraftName, TouchScreenKeyboardType.Default, false, false, false, false, "Digite seu nome...", RacerProfile.MaxNameLength);
                if (keyboard != null) DraftName = keyboard.text;
            }
            else
            {
                // O clique para focar o campo pode falhar sob a matriz de escala do
                // menu; foca automaticamente ao entrar na tela, sem repetir o
                // comando a cada frame (o que reiniciaria o cursor durante a digitação).
                if (GUI.GetNameOfFocusedControl() != "RacerName") GUI.FocusControl("RacerName");
                DraftName = GUI.TextField(input, DraftName, RacerProfile.MaxNameLength, field);
                if (string.IsNullOrEmpty(DraftName) && GUI.GetNameOfFocusedControl() != "RacerName")
                    GUI.Label(new Rect(input.x + 28, input.y + 24, input.width - 56, 44), "Digite seu nome...", caption);
            }
            GUI.Label(new Rect(formX + 24, input.yMax + 20, formWidth - 48, 52),
                "Até 18 caracteres.\nSeu nome aparece na classificação.", nameHint);
            if (GUI.Button(new Rect(formX + (formWidth - 350) / 2, 504, 350, 86), "CONFIRMAR", nameConfirm)) Confirm();
            if (Event.current.type == EventType.KeyDown && Event.current.keyCode == KeyCode.Return)
            { Confirm(); Event.current.Use(); }
        }
    }
}
