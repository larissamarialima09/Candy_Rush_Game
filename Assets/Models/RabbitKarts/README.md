# Rabbit Kart

Abra o projeto no Unity 6000.6.2f1 e aguarde a instalacao do glTFast e a
importacao dos quatro GLBs. Execute `Tools > Rabbit Kart > Criar prefab`.
O comando cria um prefab em `Assets/Prefabs` com KartVisuals no pivo do
modelo e os materiais dos quatro personagens. Repetir o comando cria uma
nova copia, sem sobrescrever prefabs editados.

Arraste o prefab para a cena. No KartVisuals, atribua o Rigidbody do
controlador ou forneca velocidade manual. Velocidade e em metros/segundo
com sinal (negativa na re); volante vai de -1 a 1. Mesmo com Rigidbody,
o controlador deve fornecer o volante para animar o esterco:

```csharp
private KartVisuals visuals;

void Awake() { visuals = GetComponentInChildren<KartVisuals>(); }
void Update() { visuals.SetInput(velocidade, volante); }

// Troca em runtime, sem modificar materiais de outros karts:
// visuals.AplicarPersonagem(KartVisuals.Personagem.Amora);
```

O script usa linearVelocity no Unity 6 e velocity nas versoes anteriores.
O modelo aponta para +Z e as rodas giram em X. Marque inverterGiro se
necessario. Raios locais: 0.20 na frente e 0.26 atras, ajustados pela
escala Y de cada roda. Use escala uniforme para manter rodas circulares.

As rotacoes originais das orelhas e dos bracos sao preservadas. O quique
move apenas Rabbit; o script nao move o Rigidbody nem adiciona fisica.
Se adicionar KartVisuals manualmente, configure Aparencias com os materiais
dos quatro modelos, ou use o gerador de prefab para preencher esses campos.

Importador: https://docs.unity3d.com/Packages/com.unity.cloud.gltfast@6.14/manual/ImportEditor.html
