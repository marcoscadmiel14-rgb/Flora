import { Application, Graphics } from 'pixi.js';

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#0b0d12', antialias: false });
  document.getElementById('app')!.appendChild(app.canvas);
  app.stage.addChild(new Graphics().rect(0, 0, 64, 64).fill(0x3fbf7f));
}

void boot();
