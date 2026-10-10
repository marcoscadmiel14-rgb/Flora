# Flora Arena — Arquitetura técnica

Documento de contrato para quem implementa. O design de jogo (criaturas, mapa, números) está em `docs/GDD.md`; este arquivo define **como** o código é organizado para que o design seja verificável.

## 1. Princípios

1. **Simulação determinística separada da renderização.** Tudo que decide o resultado de uma partida (movimento, colisões, dano, estado do terreno, fragmentos, estruturas, energia) vive em `src/sim/` e é TypeScript puro, sem DOM, sem Pixi, sem `Math.random`, sem `Date`. Roda a 60 Hz fixos (`STEP = 1/60`).
2. **A renderização só lê.** `src/render/` consome o estado da sim e a lista de eventos do tick; nunca altera a sim. Efeitos visuais nascem de eventos da sim (posição e direção reais do impacto).
3. **Toda funcionalidade tem teste na sim.** Uma mecânica só está "pronta" quando um teste em `tests/` exercita a sim headless e verifica o estado (célula de terreno mudou, navegação mudou, energia chegou à criatura etc.). Visual não conta como prova.
4. **Sem alocação em caminhos quentes.** Typed arrays para o grid, pools para projéteis, partículas e eventos. O alvo é 60 fps estáveis em Android intermediário.

## 2. Pastas

```
src/
  core/        math, rng, fixedLoop, pools — sem dependências
  sim/         simulação determinística (headless)
    types.ts       ids, enums, formatos de eventos, input
    world.ts       World: dono de todo o estado + tick()
    terrain.ts     grid de células (materiais, estado, hp, umidade, carga…)
    materials.ts   tabela de materiais (dados do GDD)
    props.ts       objetos destrutíveis (pedras, pilares…)
    collision.ts   formas (círculo, cápsula, setor, anel, retângulo orientado) e consultas
    movement.ts    movimento de criaturas contra o terreno/props, knockback, atrito
    impact.ts      pipeline de impacto ambiental (seção 5)
    abilities/     definições data-driven + executor de fases
    creatures/     um arquivo por criatura (kit, passiva)
    projectiles.ts, hazards.ts, structures.ts, fragments.ts, energy.ts …
    match.ts       rounds, vitória, timer
    ai.ts          oponente controlado pela máquina (gera o mesmo Input de um jogador)
  render/      PixiJS: câmera, terreno, sprites, VFX, luz, decalques, shake
  ui/          HUD, controles de toque, menus, layout retrato/paisagem
  audio/       SFX procedural com WebAudio
  platform/    Capacitor (orientação, haptics), detecção de capacidade
  assets/      manifesto de sprites (formato PixelLab)
  main.ts      boot
tests/         vitest (headless)
e2e/           Playwright: partida real em Chromium com emulação Android
```

## 3. Espaço e perspectiva

- **Mundo:** plano do chão em unidades de mundo (1 u = 1 pixel de arte). Tile = **16 u**. Altura `z` em u (para saltos, projéteis em arco, detritos).
- **Projeção oblíqua 2D:** `screenX = x`, `screenY = y * K - z`, com **K = 0.75**. Um círculo no chão aparece como elipse 1 : 0,75. Colisão sempre no espaço do mundo (círculos de verdade); só o desenho é comprimido.
- **Ordenação:** por `y` do pé (com desempate por id). Sombras são elipses no chão.
- **Pixel-perfect com movimento suave:** o palco é escalado por um fator inteiro `s` (`s = max(1, floor(min(W / minW, H / minH)))`). Texturas usam `scaleMode: 'nearest'`. Personagens e projéteis se movem com precisão sub-pixel na tela nativa (fluidez); o terreno é uma RenderTexture redesenhada só nas células que mudam.

## 4. Simulação

### 4.1 Tick

```
World.tick(inputs: [Input, Input]):
  1. aplicar input → intenção de movimento / pedidos de habilidade
  2. avançar habilidades (fases: windup → active → recovery)
  3. mover criaturas, projéteis, fragmentos (com colisão contra terreno/props/estruturas)
  4. resolver hits (hitboxes ativas × hurtboxes) → dano, knockback, status
  5. pipeline de impacto ambiental (seção 5)
  6. sistemas de campo: energia em superfícies condutoras, ondas de choque, crescimento, zonas
  7. regras de partida (KO, round, timer)
  8. publicar eventos do tick em world.events (lista limpa a cada tick)
```

`hitstop` congela as entidades envolvidas por N ticks (a sim continua determinística).

### 4.2 Input

```ts
interface Input {
  moveX: number; moveY: number;      // -1..1 (joystick)
  aimX: number; aimY: number;        // direção de mira (ou 0,0 = auto-mira)
  buttons: number;                   // bitmask: BASIC, SKILL1, SKILL2, SKILL3, ULT, DODGE
}
```

O jogador humano e a IA produzem exatamente este formato. Isso garante que a IA joga com as mesmas regras.

### 4.3 Habilidades (data-driven)

Cada habilidade declara fases com duração em ms (convertidas para ticks) e, por fase, as hitboxes, o telegraph (forma + duração) e os ganchos (`onStart`, `onActiveTick`, `onHit`, `onTerrainImpact`, `onEnd`). Regras de cancelamento e esquiva vêm do GDD. Cada hit gera um `HitEvent` e, quando toca o chão, um `Impact` para o pipeline ambiental.

### 4.4 Terreno

Grid `W × H` em typed arrays (struct-of-arrays):

| campo | tipo | uso |
|---|---|---|
| `material` | Uint8 | id do material |
| `state` | Uint8 | estágio (intacto → rachado → quebrado → cratera…) |
| `hp` | Float32 | resistência restante do estágio |
| `wet` | Float32 | umidade 0..1 (água espalhada, condutividade) |
| `charge` | Float32 | energia presente na célula |
| `growth` | Float32 | estruturas vivas |
| `deform` | Float32 | depressão visual (areia) / altura |
| `flags` | Uint16 | bloqueia movimento, bloqueia projétil, condutor, perigo… |
| `version` | Uint32 | incrementa ao mudar → o renderer redesenha só essa célula |

`terrain.walkable(cx, cy)` e `terrain.blocksProjectile(cx, cy)` são derivados de material + estado + props + estruturas, e recalculados quando qualquer um muda. A navegação da IA usa o mesmo grid.

## 5. Pipeline de impacto ambiental

Sequência controlada pela sim (não pela animação):

```
Ataque executado
 → colisão confirmada        (hitbox tocou chão/prop/criatura neste tick)
 → material identificado     (terrain.materialAt(ponto) ou prop.material)
 → resistência verificada    (força × tipo de impacto vs. tabela do material/estágio)
 → estado ambiental atualizado (state/hp/wet/deform/flags; props mudam de estágio; navegação recalculada)
 → partículas emitidas       (EnvEvent com ponto, direção, material, intensidade)
 → reação física aplicada    (fragmentos/detritos com impulso na direção do impacto, empurrão em criaturas/props)
 → animação de impacto       (eventos consumidos por render/áudio: decalque, poeira, respingo, shake, hitstop)
```

```ts
interface Impact {
  x: number; y: number;          // ponto real no chão
  dirX: number; dirY: number;    // direção real do golpe
  kind: ImpactKind;              // blunt | slash | pierce | energy | gravity | explosive …
  force: number;                 // magnitude
  radius: number;
  source: EntityId;
}
```

Cada etapa publica eventos tipados em `world.events` (ex.: `TerrainCracked`, `TerrainShattered`, `DustCloud`, `SandDepressed`, `WaterSplash`, `WaveSpawned`, `PropDamaged`, `PropDestroyed`, `NavChanged`, `FragmentSpawned`). Os testes verificam a sequência e o estado resultante.

## 6. Renderização

- Camadas (de baixo para cima): terreno (RenderTexture) → decalques (rachaduras, crateras, marcas) → telegraphs no chão → sombras → entidades ordenadas por y (criaturas, props, estruturas, projéteis, fragmentos) → partículas → luz aditiva → HUD de mundo (barras sobre as criaturas) → UI de tela.
- **Legibilidade:** telegraphs nunca ficam abaixo de partículas; partículas sobre criaturas têm alpha máximo limitado; o contorno da criatura continua visível. O shake de câmera tem orçamento (amplitude e duração máximas, decaimento).
- **Interpolação:** a renderização interpola posições entre o tick anterior e o atual usando `alpha` do `FixedLoop`.

## 7. Sprites (PixelLab)

`src/assets/manifest.ts` descreve cada criatura no formato que o PixelLab produz: 8 direções (`south, south-east, east, north-east, north, north-west, west, south-west`), animações com N quadros por direção, tamanho do quadro e ponto de ancoragem (pés). Enquanto a arte não existe, o manifesto aponta para um **marcador provisório** desenhado em código e claramente identificado como provisório. Trocar a arte = trocar o manifesto.

## 8. Plataforma

- Capacitor 8, `android/` versionado. Activity em tela cheia imersiva, tela sempre ligada.
- APK de debug gerado pelo GitHub Actions a cada push (`.github/workflows/android.yml`).
- Orientação: decidida pelo protótipo (ver GDD §10 e `e2e/`); travada em runtime via `@capacitor/screen-orientation`.

## 9. Verificação

- `npm test` — testes headless da sim (mecânicas, pipeline de impacto, navegação, determinismo).
- `npm run e2e` — Playwright: abre o jogo em Chromium com emulação de Android (viewport, toque, DPR, CPU 4× mais lenta), joga uma partida real contra a IA, coleta FPS e eventos da sim por `window.__FLORA__`, tira screenshots em retrato e paisagem e mede sobreposição de UI.
- O desempenho no aparelho real deve ser confirmado instalando o APK; o e2e é uma aproximação.
