using System;
using System.Linq;
using UnityEngine;

namespace CandyRush
{
    public static class RacerProfile
    {
        public const int MaxNameLength = 18;
        const string NameKey = "CandyRush.RacerName", RabbitKey = "CandyRush.Rabbit";
        public static readonly string[] RabbitNames = { "Nuvem", "Amora", "Caramelo", "Violeta" };
        /// <summary>Mesma ordem de RabbitNames: azul, rosa, amarelo, roxo (Resources/Candy/Menu/Rabbits).</summary>
        public static readonly string[] RabbitSprites = { "blue", "pink", "yellow", "purple" };
        public static int Rabbit => Mathf.Clamp(PlayerPrefs.GetInt(RabbitKey, 1), 0, 3);
        public static string Name => CleanName(PlayerPrefs.GetString(NameKey, "Piloto Doce"));
        public static KartPalette Palette => KartPalette.Rival(RabbitSprites[Rabbit]);
        public static string CleanName(string value)
        {
            string clean = new string((value ?? "").Where(c => char.IsLetterOrDigit(c) || c == ' ' || c == '-' || c == '_').ToArray()).Trim();
            if (clean.Length > MaxNameLength) clean = clean.Substring(0, MaxNameLength).Trim();
            return string.IsNullOrWhiteSpace(clean) ? "Piloto Doce" : clean;
        }
        public static void Save(string name, int rabbit)
        {
            PlayerPrefs.SetString(NameKey, CleanName(name));
            PlayerPrefs.SetInt(RabbitKey, Mathf.Clamp(rabbit, 0, 3));
            PlayerPrefs.Save();
        }
    }
}
