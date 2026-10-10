import Phaser from 'phaser';

export class TextureGenerator {
  public static generateAll(scene: Phaser.Scene, size = 64): void {
    TextureGenerator.generateCockpit(scene, size);
    TextureGenerator.generateFuelTank(scene, size);
    TextureGenerator.generateEngine(scene, size);
    TextureGenerator.generateNoseCone(scene, size);
    TextureGenerator.generateFinLeft(scene, size);
    TextureGenerator.generateFinRight(scene, size);
    TextureGenerator.generateHull(scene, size);
    TextureGenerator.generateDockingPort(scene);
    TextureGenerator.generateTrayBg(scene);
    TextureGenerator.generateBayFrames(scene);
  }

  private static createCanvas(scene: Phaser.Scene, key: string, width: number, height: number): { ctx: CanvasRenderingContext2D; canvas: Phaser.Textures.CanvasTexture } {
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }
    const canvas = scene.textures.createCanvas(key, width, height);
    if (!canvas) {
      throw new Error(`Failed to create canvas texture for ${key}`);
    }
    const ctx = canvas.getContext();
    ctx.imageSmoothingEnabled = false;
    return { ctx, canvas };
  }

  private static generateCockpit(scene: Phaser.Scene, s: number): void {
    const { ctx, canvas } = this.createCanvas(scene, 'tex_cockpit', s, s);

    // Main fuselage body (Teal #427f80)
    ctx.fillStyle = '#427f80';
    ctx.fillRect(0, 0, s, s);

    // Left shadow (#305d5e) & Right highlight (#78b6b7)
    ctx.fillStyle = '#305d5e';
    ctx.fillRect(0, 0, 4, s);
    ctx.fillStyle = '#78b6b7';
    ctx.fillRect(s - 4, 0, 4, s);

    // Top & Bottom seam bevels
    ctx.fillStyle = '#264a4b';
    ctx.fillRect(0, 0, s, 2);
    ctx.fillRect(0, s - 2, s, 2);

    // Rivet dots in corners
    const rivets = [
      [6, 6], [s - 7, 6], [6, s - 7], [s - 7, s - 7]
    ];
    for (const [rx, ry] of rivets) {
      ctx.fillStyle = '#1c3839';
      ctx.fillRect(rx, ry, 3, 3);
      ctx.fillStyle = '#9fe1e2';
      ctx.fillRect(rx + 1, ry + 1, 1, 1);
    }

    // Cockpit Window Dome (Arched / Capsule)
    const cx = s / 2;
    const cy = s / 2 - 2;
    const rw = 16;
    const rh = 18;

    // Window Outer Bevel (Dark border #1e3a3b)
    ctx.fillStyle = '#1e3a3b';
    ctx.beginPath();
    ctx.roundRect(cx - rw - 3, cy - rh - 3, (rw + 3) * 2, (rh + 3) * 2, 14);
    ctx.fill();

    // Window Inner Glass (Glass gradient #a2e3e4 to #4da4a5)
    const glassGrad = ctx.createLinearGradient(cx, cy - rh, cx, cy + rh);
    glassGrad.addColorStop(0, '#d1f6f7');
    glassGrad.addColorStop(0.4, '#9be0e2');
    glassGrad.addColorStop(1, '#539fa0');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.roundRect(cx - rw, cy - rh, rw * 2, rh * 2, 12);
    ctx.fill();

    // Inside the Cockpit: Cute Space Cow / Astronaut!
    // Body / Suit (Cream #f4ede1)
    ctx.fillStyle = '#eddcc4';
    ctx.beginPath();
    ctx.roundRect(cx - 9, cy + 3, 18, 12, 4);
    ctx.fill();

    // Astronaut Helmet / Head
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 9, 0, Math.PI * 2);
    ctx.fill();

    // Cow Spots / Ears (Brown/Black patches)
    ctx.fillStyle = '#2b2a29';
    ctx.beginPath();
    ctx.arc(cx - 7, cy - 8, 3, 0, Math.PI * 2);
    ctx.arc(cx + 7, cy - 8, 3, 0, Math.PI * 2);
    ctx.arc(cx - 4, cy - 5, 4, 0, Math.PI * 2);
    ctx.fill();

    // Visor / Face (Cute black eyes + snout)
    ctx.fillStyle = '#ffb3ba'; // Snout
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, 5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2a29';
    ctx.fillRect(cx - 2, cy + 1, 1.5, 1.5);
    ctx.fillRect(cx + 0.5, cy + 1, 1.5, 1.5);

    // Eyes
    ctx.fillStyle = '#1c1b1a';
    ctx.fillRect(cx - 5, cy - 4, 2, 3);
    ctx.fillRect(cx + 3, cy - 4, 2, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 5, cy - 4, 1, 1);
    ctx.fillRect(cx + 3, cy - 4, 1, 1);

    // Glass glare reflection highlight (Curved arc #ffffff)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 4, 11, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();

    // Lower dashboard LED lights
    ctx.fillStyle = '#162b2c';
    ctx.fillRect(cx - 14, s - 11, 28, 6);
    // Green LED
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(cx - 10, s - 9, 3, 3);
    // Amber LED
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cx - 4, s - 9, 3, 3);
    // Cyan LED
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(cx + 2, s - 9, 3, 3);
    // Red LED
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx + 8, s - 9, 3, 3);

    canvas.refresh();
  }

  private static generateFuelTank(scene: Phaser.Scene, s: number): void {
    const { ctx, canvas } = this.createCanvas(scene, 'tex_fuel', s, s);

    // Teal fuselage base
    ctx.fillStyle = '#427f80';
    ctx.fillRect(0, 0, s, s);

    // Left shadow & Right highlight
    ctx.fillStyle = '#305d5e';
    ctx.fillRect(0, 0, 4, s);
    ctx.fillStyle = '#78b6b7';
    ctx.fillRect(s - 4, 0, 4, s);

    // Horizontal seam line in middle
    ctx.fillStyle = '#264a4b';
    ctx.fillRect(0, s / 2 - 1, s, 2);
    ctx.fillStyle = '#679e9f';
    ctx.fillRect(0, s / 2 + 1, s, 1);

    // Top & Bottom seams
    ctx.fillStyle = '#264a4b';
    ctx.fillRect(0, 0, s, 2);
    ctx.fillRect(0, s - 2, s, 2);

    // Vertical Fuel Gauge Portholes (Stacked illuminated golden windows)
    const drawWindow = (wy: number) => {
      const wx = s / 2 + 3;
      const ww = 18;
      const wh = 21;

      // Dark bezel
      ctx.fillStyle = '#203c3d';
      ctx.beginPath();
      ctx.roundRect(wx - ww / 2 - 2, wy - wh / 2 - 2, ww + 4, wh + 4, 8);
      ctx.fill();

      // Golden amber fuel glow
      const grad = ctx.createLinearGradient(wx - ww / 2, wy, wx + ww / 2, wy);
      grad.addColorStop(0, '#e5a528');
      grad.addColorStop(0.3, '#f7c348');
      grad.addColorStop(0.8, '#ffe274');
      grad.addColorStop(1, '#e5a528');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(wx - ww / 2, wy - wh / 2, ww, wh, 6);
      ctx.fill();

      // Glass shine highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.roundRect(wx - ww / 2 + 3, wy - wh / 2 + 2, 4, wh - 4, 2);
      ctx.fill();
    };

    drawWindow(s * 0.28);
    drawWindow(s * 0.72);

    // Left column LED indicators
    const leds = [
      { y: s * 0.20, color: '#ef4444' }, // Red
      { y: s * 0.32, color: '#f59e0b' }, // Yellow
      { y: s * 0.44, color: '#22c55e' }, // Green
      { y: s * 0.65, color: '#ef4444' },
      { y: s * 0.77, color: '#22c55e' }
    ];

    for (const led of leds) {
      // Bezel
      ctx.fillStyle = '#1c3435';
      ctx.beginPath();
      ctx.arc(14, led.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // Glow dot
      ctx.fillStyle = led.color;
      ctx.beginPath();
      ctx.arc(14, led.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Right-edge rivet dots
    ctx.fillStyle = '#234445';
    ctx.fillRect(s - 8, 8, 2, 2);
    ctx.fillRect(s - 8, s / 2 - 8, 2, 2);
    ctx.fillRect(s - 8, s / 2 + 8, 2, 2);
    ctx.fillRect(s - 8, s - 10, 2, 2);

    canvas.refresh();
  }

  private static generateEngine(scene: Phaser.Scene, s: number): void {
    const { ctx, canvas } = this.createCanvas(scene, 'tex_engine', s, s);

    // Top mounting collar that meets fuselage flush
    ctx.fillStyle = '#24373e';
    ctx.fillRect(s * 0.18, 0, s * 0.64, 7);
    ctx.fillStyle = '#39535e';
    ctx.fillRect(s * 0.18, 0, s * 0.64, 2);

    // Mounting bolts
    ctx.fillStyle = '#61818e';
    ctx.fillRect(s * 0.26, 2, 3, 3);
    ctx.fillRect(s * 0.48, 2, 3, 3);
    ctx.fillRect(s * 0.70, 2, 3, 3);

    // Trapezoidal Bell Nozzle
    // Tapers from width 36 at top to width 56 at bottom
    ctx.beginPath();
    ctx.moveTo(s * 0.22, 7);
    ctx.lineTo(s * 0.78, 7);
    ctx.lineTo(s * 0.92, s - 5);
    ctx.lineTo(s * 0.08, s - 5);
    ctx.closePath();

    const nozzleGrad = ctx.createLinearGradient(0, 0, s, 0);
    nozzleGrad.addColorStop(0, '#1c2b31');
    nozzleGrad.addColorStop(0.25, '#2e434c');
    nozzleGrad.addColorStop(0.7, '#38525d');
    nozzleGrad.addColorStop(1, '#203036');
    ctx.fillStyle = nozzleGrad;
    ctx.fill();

    // 4 Horizontal Corrugated Cooling Ribs
    const ribs = [s * 0.25, s * 0.42, s * 0.59, s * 0.76];
    for (const ry of ribs) {
      const progress = (ry - 7) / (s - 12);
      const leftX = s * 0.22 - progress * (s * 0.14);
      const rightX = s * 0.78 + progress * (s * 0.14);

      // Shadow line
      ctx.strokeStyle = '#152126';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(leftX + 2, ry);
      ctx.lineTo(rightX - 2, ry);
      ctx.stroke();

      // Highlight line
      ctx.strokeStyle = '#516f7c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(leftX + 3, ry - 1.5);
      ctx.lineTo(rightX - 3, ry - 1.5);
      ctx.stroke();
    }

    // Bottom Rim / Throat Nozzle
    ctx.fillStyle = '#141e22';
    ctx.fillRect(s * 0.06, s - 5, s * 0.88, 5);

    // Glowing internal flame / thermal heat throat
    const heatGrad = ctx.createLinearGradient(s / 2, s - 6, s / 2, s);
    heatGrad.addColorStop(0, '#ff9900');
    heatGrad.addColorStop(0.5, '#ff4d00');
    heatGrad.addColorStop(1, '#990000');
    ctx.fillStyle = heatGrad;
    ctx.fillRect(s * 0.14, s - 4, s * 0.72, 3);

    canvas.refresh();
  }

  private static generateNoseCone(scene: Phaser.Scene, s: number): void {
    const { ctx, canvas } = this.createCanvas(scene, 'tex_cone', s, s);

    // Aerodynamic curved dome path (Rose/Crimson #ba4154)
    ctx.beginPath();
    ctx.moveTo(s * 0.14, s);
    ctx.bezierCurveTo(s * 0.14, s * 0.45, s * 0.28, s * 0.05, s / 2, 3);
    ctx.bezierCurveTo(s * 0.72, s * 0.05, s * 0.86, s * 0.45, s * 0.86, s);
    ctx.closePath();

    const coneGrad = ctx.createLinearGradient(0, 0, s, 0);
    coneGrad.addColorStop(0, '#8c2838');
    coneGrad.addColorStop(0.2, '#b23b4e');
    coneGrad.addColorStop(0.7, '#cc4c61');
    coneGrad.addColorStop(1, '#972b3c');
    ctx.fillStyle = coneGrad;
    ctx.fill();

    // Cone tip highlight
    ctx.fillStyle = '#f0788d';
    ctx.beginPath();
    ctx.arc(s / 2, 7, 3, 0, Math.PI * 2);
    ctx.fill();

    // Curved specular highlight line along right flank
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s / 2 + 3, 10);
    ctx.quadraticCurveTo(s * 0.74, s * 0.45, s * 0.78, s - 8);
    ctx.stroke();

    // Horizontal panel seams with subtle texture
    ctx.strokeStyle = '#6e1d2b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(s * 0.25, s * 0.40);
    ctx.quadraticCurveTo(s / 2, s * 0.42, s * 0.75, s * 0.40);
    ctx.moveTo(s * 0.18, s * 0.72);
    ctx.quadraticCurveTo(s / 2, s * 0.75, s * 0.82, s * 0.72);
    ctx.stroke();

    // Subtle "MOO" / NASA markings in pixel style
    ctx.fillStyle = '#6e1d2b';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MOO', s / 2, s * 0.60);

    // Bottom attachment collar (Teal #427f80)
    ctx.fillStyle = '#305d5e';
    ctx.fillRect(s * 0.14, s - 3, s * 0.72, 3);

    canvas.refresh();
  }

  private static generateFinLeft(scene: Phaser.Scene, s: number): void {
    const { ctx, canvas } = this.createCanvas(scene, 'tex_fin_left', s, s);

    // Sweeps to the LEFT: mounting base is on the RIGHT edge (x = s)
    ctx.beginPath();
    ctx.moveTo(s, s * 0.15); // Top attachment point
    ctx.bezierCurveTo(s * 0.35, s * 0.15, s * 0.05, s * 0.45, s * 0.05, s * 0.75); // Wing tip
    ctx.quadraticCurveTo(s * 0.05, s * 0.95, s * 0.35, s * 0.95); // Bottom curve
    ctx.lineTo(s, s * 0.95); // Bottom attachment
    ctx.closePath();

    const finGrad = ctx.createLinearGradient(0, s / 2, s, s / 2);
    finGrad.addColorStop(0, '#366869');
    finGrad.addColorStop(0.5, '#4a898a');
    finGrad.addColorStop(1, '#5ca4a5');
    ctx.fillStyle = finGrad;
    ctx.fill();

    // Edge highlight (Top curve #8ad3d4)
    ctx.strokeStyle = '#88c9ca';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(s - 2, s * 0.16);
    ctx.bezierCurveTo(s * 0.35, s * 0.16, s * 0.07, s * 0.46, s * 0.07, s * 0.75);
    ctx.stroke();

    // Flush mounting seam on right edge
    ctx.fillStyle = '#223f40';
    ctx.fillRect(s - 3, s * 0.15, 3, s * 0.80);

    canvas.refresh();
  }

  private static generateFinRight(scene: Phaser.Scene, s: number): void {
    const { ctx, canvas } = this.createCanvas(scene, 'tex_fin_right', s, s);

    // Sweeps to the RIGHT: mounting base is on the LEFT edge (x = 0)
    ctx.beginPath();
    ctx.moveTo(0, s * 0.15); // Top attachment point
    ctx.bezierCurveTo(s * 0.65, s * 0.15, s * 0.95, s * 0.45, s * 0.95, s * 0.75); // Wing tip
    ctx.quadraticCurveTo(s * 0.95, s * 0.95, s * 0.65, s * 0.95); // Bottom curve
    ctx.lineTo(0, s * 0.95); // Bottom attachment
    ctx.closePath();

    const finGrad = ctx.createLinearGradient(0, s / 2, s, s / 2);
    finGrad.addColorStop(0, '#5ca4a5');
    finGrad.addColorStop(0.5, '#4a898a');
    finGrad.addColorStop(1, '#366869');
    ctx.fillStyle = finGrad;
    ctx.fill();

    // Edge highlight (Top curve #8ad3d4)
    ctx.strokeStyle = '#88c9ca';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(2, s * 0.16);
    ctx.bezierCurveTo(s * 0.65, s * 0.16, s * 0.93, s * 0.46, s * 0.93, s * 0.75);
    ctx.stroke();

    // Flush mounting seam on left edge
    ctx.fillStyle = '#223f40';
    ctx.fillRect(0, s * 0.15, 3, s * 0.80);

    canvas.refresh();
  }

  private static generateHull(scene: Phaser.Scene, s: number): void {
    const { ctx, canvas } = this.createCanvas(scene, 'tex_hull', s, s);

    // Teal body base
    ctx.fillStyle = '#427f80';
    ctx.fillRect(0, 0, s, s);

    // Left shadow & Right highlight
    ctx.fillStyle = '#305d5e';
    ctx.fillRect(0, 0, 4, s);
    ctx.fillStyle = '#78b6b7';
    ctx.fillRect(s - 4, 0, 4, s);

    // Horizontal Girder Plates & Seams
    const plates = [s * 0.25, s * 0.50, s * 0.75];
    for (const py of plates) {
      ctx.fillStyle = '#244546';
      ctx.fillRect(0, py - 2, s, 4);
      ctx.fillStyle = '#6da6a7';
      ctx.fillRect(0, py + 2, s, 1.5);

      // Rivets along each plate
      for (let rx = 10; rx < s - 8; rx += 12) {
        ctx.fillStyle = '#1c3435';
        ctx.fillRect(rx, py - 1, 2, 2);
      }
    }

    // Communication Antenna prongs (left side)
    const antennas = [s * 0.30, s * 0.48, s * 0.66];
    for (const ay of antennas) {
      ctx.fillStyle = '#d1e8e8';
      ctx.fillRect(6, ay, 10, 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(16, ay - 1, 3, 4); // Amber sensor tip
    }

    canvas.refresh();
  }

  private static generateDockingPort(scene: Phaser.Scene): void {
    const s = 24;
    const { ctx, canvas } = this.createCanvas(scene, 'tex_docking_port', s, s);

    // Outer subtle cyan glow ring
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 9, 0, Math.PI * 2);
    ctx.stroke();

    // Vibrant core ring
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 6, 0, Math.PI * 2);
    ctx.fill();

    // Bright center crosshair pin
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(s / 2 - 1, s / 2 - 1, 2, 2);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, 6, 0, Math.PI * 2);
    ctx.stroke();

    canvas.refresh();
  }

  private static generateTrayBg(scene: Phaser.Scene): void {
    const w = 1080;
    const h = 130;
    const { ctx, canvas } = this.createCanvas(scene, 'tex_tray_bg', w, h);

    // Base warm PCB circuit parchment (#d8a46e)
    ctx.fillStyle = '#d8a46e';
    ctx.fillRect(0, 0, w, h);

    // Top border stripe (#b77e48)
    ctx.fillStyle = '#9e6430';
    ctx.fillRect(0, 0, w, 4);
    ctx.fillStyle = '#eed1aa';
    ctx.fillRect(0, 4, w, 2);

    // Circuit board trace lines (Copper ochre #ba8148)
    ctx.strokeStyle = 'rgba(186, 129, 72, 0.65)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    // Procedural right-angle traces across the bar
    for (let x = 30; x < w - 40; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 15);
      ctx.lineTo(x + 18, 30);
      ctx.lineTo(x + 18, 55);
      ctx.lineTo(x + 36, 75);
      ctx.stroke();

      // Solder points / pads
      ctx.fillStyle = '#ecd3ae';
      ctx.beginPath();
      ctx.arc(x, 15, 2.5, 0, Math.PI * 2);
      ctx.arc(x + 36, 75, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    canvas.refresh();
  }

  private static generateBayFrames(scene: Phaser.Scene): void {
    const w = 92;
    const h = 104;

    // Normal bay
    const { ctx, canvas } = this.createCanvas(scene, 'tex_bay_normal', w, h);
    ctx.fillStyle = '#f4d8b7';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 14);
    ctx.fill();

    ctx.strokeStyle = '#ad743f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, w - 3, h - 3, 13);
    ctx.stroke();

    // Subtle inner bevel
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(4, 4, w - 8, h - 8, 10);
    ctx.stroke();
    canvas.refresh();

    // Hover / Active Bay
    const { ctx: ctxActive, canvas: canvasActive } = this.createCanvas(scene, 'tex_bay_active', w, h);
    ctxActive.fillStyle = '#faecd9';
    ctxActive.beginPath();
    ctxActive.roundRect(0, 0, w, h, 14);
    ctxActive.fill();

    // Glowing cyan / gold outer border
    ctxActive.strokeStyle = '#0284c7';
    ctxActive.lineWidth = 4;
    ctxActive.beginPath();
    ctxActive.roundRect(2, 2, w - 4, h - 4, 13);
    ctxActive.stroke();

    ctxActive.strokeStyle = '#38bdf8';
    ctxActive.lineWidth = 2;
    ctxActive.beginPath();
    ctxActive.roundRect(5, 5, w - 10, h - 10, 10);
    ctxActive.stroke();
    canvasActive.refresh();
  }
}
