using System;
using UnityEngine;

namespace CandyRush
{
    public static class CandyBalloonFrames
    {
        static Sprite[] frames;
        public static Sprite[] Frames
        {
            get
            {
                if (frames == null)
                {
                    frames = Resources.LoadAll<Sprite>("Candy/Balloon");
                    Array.Sort(frames, (a, b) => string.CompareOrdinal(a.name, b.name));
                }
                return frames;
            }
        }
        public static Sprite At(float time)
        {
            var items = Frames;
            return items.Length == 0 ? null : items[Mathf.FloorToInt(time * 8) % items.Length];
        }
        public static void Draw(Rect rect, float phase = 0)
        {
            var sprite = At(Time.unscaledTime + phase);
            if (sprite == null) return;
            var r = sprite.rect;
            var tex = sprite.texture;
            GUI.DrawTextureWithTexCoords(rect, tex, new Rect(r.x / tex.width, r.y / tex.height, r.width / tex.width, r.height / tex.height));
        }
    }

    public sealed class CandyBalloonSprite : MonoBehaviour
    {
        SpriteRenderer visual;
        public float Phase;
        void Awake()
        {
            visual = gameObject.AddComponent<SpriteRenderer>();
            visual.sprite = CandyBalloonFrames.At(Phase);
        }
        void Update() { visual.sprite = CandyBalloonFrames.At(Time.time + Phase); }
        // Runs for each camera, including both split-screen players.
        void OnWillRenderObject()
        {
            if (Camera.current != null) transform.rotation = Camera.current.transform.rotation;
        }
    }
}
