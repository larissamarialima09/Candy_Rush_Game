using System;

namespace CodePop.Blocks
{
    /// <summary>
    /// Os 7 tipos de bloco de comando do jogo.
    /// Os nomes aqui são internos: o texto exibido virá das tabelas de tradução.
    /// </summary>
    public enum BlockType
    {
        Walk,      // anda uma casa para frente
        TurnLeft,  // gira para a esquerda
        TurnRight, // gira para a direita
        Pick,      // pega o doce da casa atual
        Repeat,    // Capítulo 2: repete N vezes
        If,        // Capítulo 3: se há doce à frente / senão
        Function   // Capítulo 4: bloco criado pelo jogador
    }

    public static class BlockTypeParser
    {
        /// <summary>
        /// Lê o nome de um bloco escrito no arquivo da fase, ignorando maiúsculas,
        /// espaços, "_" e "-". Ex.: "turn_left", "Turn Left" e "turnleft" viram TurnLeft.
        /// </summary>
        public static bool TryParse(string text, out BlockType type)
        {
            type = BlockType.Walk;
            if (string.IsNullOrWhiteSpace(text)) return false;

            string clean = text.Replace("_", "").Replace("-", "").Replace(" ", "").Trim();
            return Enum.TryParse(clean, true, out type) && Enum.IsDefined(typeof(BlockType), type);
        }
    }
}
