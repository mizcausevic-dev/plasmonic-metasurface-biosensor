import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { drawSpectrum } from "./chart";
import {
  AB_HEIGHT,
  ARRAY,
  CHANNEL,
  HALF_GAP,
  HERO_POS,
  LINKER_H,
  MOLECULES,
  OPTICS,
  RECEPTORS,
  RING_R,
  ROT_Y,
  TUBE_R,
  arrayOrigin,
  bindingMapAmount,
  bindingMapWeight,
  cameraAt,
  chargeAmount,
  chargeSign,
  chevronAmount,
  chevronX,
  clearGapEndpointsWorld,
  clipAmount,
  coverTransform,
  dielectricAmount,
  dimensionAmount,
  fluidOpacity,
  gapFieldDir,
  gapMidLocal,
  gapMidWorld,
  illuminationAmount,
  isBound,
  labelSpecs,
  type LabelSpec,
  lowerPathAmount,
  moleculeAmount,
  moleculePosition,
  nearFieldAmount,
  type V3,
} from "./model";

export type Quality = "high" | "low";

export type ExperienceOptions = {
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  labels: HTMLElement;
  leaders: SVGSVGElement;
  quality: Quality;
  onContextLost: () => void;
};

class ArcCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly radius: number,
    private readonly a0: number,
    private readonly a1: number,
  ) {
    super();
  }

  getPoint(t: number, optionalTarget?: THREE.Vector3): THREE.Vector3 {
    const target = optionalTarget ?? new THREE.Vector3();
    const a = this.a0 + (this.a1 - this.a0) * t;
    return target.set(Math.cos(a) * this.radius, 0, Math.sin(a) * this.radius);
  }
}

type LabelView = { spec: LabelSpec; el: HTMLDivElement; line: SVGLineElement };
type MoleculeView = {
  spec: (typeof MOLECULES)[number];
  free: THREE.Mesh;
  bound: THREE.Mesh;
  halo: THREE.Mesh;
};

export class Experience {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.001, 800);
  private readonly look = new THREE.Vector3();
  private readonly clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 80);
  private composer: EffectComposer | null = null;
  private readonly labelViews: LabelView[] = [];
  private readonly molecules: MoleculeView[] = [];
  private readonly arrows: THREE.ArrowHelper[] = [];
  private readonly cover: THREE.Group;
  private readonly ghost: THREE.Group;
  private readonly fluidMat: THREE.MeshStandardMaterial;
  private readonly ghostMat: THREE.MeshBasicMaterial;
  private readonly upperMat: THREE.MeshBasicMaterial;
  private readonly lowerMat: THREE.MeshBasicMaterial;
  private readonly freeMat: THREE.MeshStandardMaterial;
  private readonly boundMat: THREE.MeshStandardMaterial;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly dielectricMat: THREE.MeshBasicMaterial;
  private readonly dimMat: THREE.MeshBasicMaterial;
  private readonly beams: THREE.Mesh[] = [];
  private readonly fieldShells: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; base: number }[] = [];
  private readonly fieldCamera = new THREE.Vector3();
  private readonly fieldInverse = new THREE.Matrix4();
  private readonly plus: THREE.Sprite;
  private readonly minus: THREE.Sprite;
  private readonly mapMat: THREE.MeshBasicMaterial;
  private readonly chevrons: THREE.Mesh[] = [];
  private readonly polarNear: THREE.Group;
  private readonly polarFar: THREE.Group;
  private readonly upperPath: THREE.Group;
  private readonly lowerPath: THREE.Group;
  private readonly dimension: THREE.Group;
  private readonly screenCanvas: HTMLCanvasElement;
  private readonly screenCtx: CanvasRenderingContext2D;
  private readonly screenTex: THREE.CanvasTexture;
  private disposed = false;

  constructor(private readonly options: ExperienceOptions) {
    const { canvas, quality } = options;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality === "high",
      alpha: false,
      logarithmicDepthBuffer: false,
      powerPreference: "high-performance",
    });
    if (!this.renderer.getContext()) throw new Error("WebGL context was not created.");
    this.renderer.setClearColor(0x0a0c10, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.localClippingEnabled = true;
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.options.onContextLost();
    });

    this.scene.background = new THREE.Color(0x0a0c10);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = quality === "high" ? 0.42 : 0.3;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xc5d0dc, 0x07080c, 0.7));
    const key = new THREE.DirectionalLight(0xfff4e6, quality === "high" ? 3.4 : 2.6);
    key.position.set(30, 90, 48);
    const fill = new THREE.DirectionalLight(0x8ea4bc, 0.85);
    fill.position.set(-40, 24, -16);
    this.scene.add(key, fill);
    if (quality === "high") {
      RectAreaLightUniformsLib.init();
      const rect = new THREE.RectAreaLight(0xfff6ea, 8, 36, 18);
      rect.position.set(CHANNEL.sensorX, 30, 12);
      rect.lookAt(CHANNEL.sensorX, 0, 0);
      this.scene.add(rect);
    }

    const gold = new THREE.MeshPhysicalMaterial({
      color: 0xffd166,
      metalness: 1,
      roughness: 0.24,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
      envMapIntensity: 1.05,
    });
    const ringGeo = new THREE.TubeGeometry(new ArcCurve(RING_R, HALF_GAP, Math.PI * 2 - HALF_GAP), 56, TUBE_R, 8, false);

    this.buildStage();
    this.buildSubstrate(quality);
    const walls = this.buildWalls();
    this.fluidMat = new THREE.MeshStandardMaterial({
      color: 0x132238,
      roughness: 0.2,
      metalness: 0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      clippingPlanes: [this.clip],
      side: THREE.DoubleSide,
    });
    const fluid = new THREE.Mesh(
      new THREE.BoxGeometry(CHANNEL.length - CHANNEL.wall * 2, CHANNEL.height, CHANNEL.halfWidth * 2),
      this.fluidMat,
    );
    fluid.position.set(CHANNEL.length / 2, CHANNEL.height / 2, 0);
    fluid.renderOrder = 2;
    this.scene.add(fluid);

    this.cover = this.buildCover(quality, false);
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: 0xd5deea,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.ghost = this.buildCover(quality, true);
    this.scene.add(this.cover, this.ghost);

    this.buildArray(ringGeo, gold);
    const hero = new THREE.Group();
    hero.position.set(HERO_POS.x, HERO_POS.y, HERO_POS.z);
    hero.rotation.y = ROT_Y;
    hero.add(new THREE.Mesh(ringGeo, gold));
    const shell = new THREE.Mesh(
      new THREE.TubeGeometry(new ArcCurve(RING_R, HALF_GAP, Math.PI * 2 - HALF_GAP), 48, TUBE_R + 0.0022, 7, false),
      new THREE.MeshStandardMaterial({
        color: 0x9eacba,
        roughness: 0.8,
        metalness: 0,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    shell.name = "linker-shell";
    hero.add(shell);
    this.addAntibodies(hero);
    this.addField(hero);
    this.scene.add(hero);
    this.assertAnchors(hero);

    this.plus = this.chargeSprite("+", "#9fd4ff");
    this.minus = this.chargeSprite("−", "#ffb4a8");
    this.scene.add(this.plus, this.minus);
    this.buildArrows();

    this.dimMat = new THREE.MeshBasicMaterial({
      color: 0xf4f1ea,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    this.dimension = this.buildDimension();
    this.scene.add(this.dimension);

    this.dielectricMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mid = gapMidLocal();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 0.1), this.dielectricMat);
    slab.position.set(mid.x, TUBE_R + LINKER_H + 0.01, mid.z);
    hero.add(slab);

    this.freeMat = new THREE.MeshStandardMaterial({ color: 0xd5dde8, roughness: 0.48, metalness: 0 });
    this.boundMat = new THREE.MeshStandardMaterial({ color: 0x00e5ff, roughness: 0.38, metalness: 0.04 });
    this.haloMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9, depthWrite: false });
    this.buildMolecules();

    this.upperMat = new THREE.MeshBasicMaterial({
      color: 0xe7eef6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.lowerMat = this.upperMat.clone();
    this.upperPath = new THREE.Group();
    this.lowerPath = new THREE.Group();
    this.addBeam(this.upperPath, OPTICS.source, OPTICS.top, this.upperMat);
    this.addBeam(this.upperPath, OPTICS.top, OPTICS.floor, this.upperMat);
    this.addBeam(this.lowerPath, OPTICS.floor, OPTICS.exit, this.lowerMat);
    this.addBeam(this.lowerPath, OPTICS.exit, OPTICS.lens, this.lowerMat);
    this.addBeam(this.lowerPath, OPTICS.lens, OPTICS.fold, this.lowerMat);
    this.addBeam(this.lowerPath, OPTICS.fold, OPTICS.slit, this.lowerMat);
    this.scene.add(this.upperPath, this.lowerPath);
    this.buildInstruments();

    this.polarNear = this.doubleArrow(0.16);
    this.polarNear.position.set(CHANNEL.sensorX, 0.72, 0.42);
    this.polarFar = this.doubleArrow(10);
    this.polarFar.position.set(CHANNEL.sensorX, 42, 8);
    this.scene.add(this.polarNear, this.polarFar);
    this.buildChevrons();
    this.mapMat = this.buildBindingMap();

    this.screenCanvas = document.createElement("canvas");
    this.screenCanvas.width = 480;
    this.screenCanvas.height = 270;
    const screenCtx = this.screenCanvas.getContext("2d");
    if (!screenCtx) throw new Error("Spectrum screen context failed.");
    this.screenCtx = screenCtx;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 9),
      new THREE.MeshStandardMaterial({
        map: this.screenTex,
        emissive: 0xffffff,
        emissiveMap: this.screenTex,
        emissiveIntensity: 0.85,
        roughness: 0.45,
      }),
    );
    screen.position.set(OPTICS.screen.x, OPTICS.screen.y, OPTICS.screen.z);
    this.scene.add(screen);

    if (quality === "high") {
      const composer = new EffectComposer(this.renderer);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), 0.12, 0.35, 0.92);
      composer.addPass(bloom);
      this.composer = composer;
    }

    walls.forEach((wall) => this.scene.add(wall));
    this.buildLabelDom();
    if (new URLSearchParams(location.search).has("axes")) this.scene.add(new THREE.AxesHelper(15));
    this.resize();
  }

  resize(): void {
    const width = Math.max(1, this.options.stage.clientWidth);
    const height = Math.max(1, this.options.stage.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, this.options.quality === "high" ? 1.5 : 1);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(width, height);
  }

  update(t: number): void {
    if (this.disposed) return;
    const cam = cameraAt(t);
    this.camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    this.look.set(cam.look.x, cam.look.y, cam.look.z);
    this.camera.lookAt(this.look);
    this.camera.fov = cam.fov;
    const distance = this.camera.position.distanceTo(this.look);
    this.camera.near = Math.max(0.0004, distance / 120);
    this.camera.far = Math.max(8, distance * 12);
    this.camera.updateProjectionMatrix();

    const cover = coverTransform(t);
    this.cover.position.set(cover.x, CHANNEL.height + cover.y, 0);
    this.ghost.position.set(0, CHANNEL.height, 0);
    this.ghost.visible = cover.ghost > 0.03;
    this.ghostMat.opacity = 0.55 * cover.ghost;

    this.fluidMat.opacity = fluidOpacity(t);
    const gap = gapMidWorld();
    this.clip.constant = THREE.MathUtils.lerp(80, gap.z + 0.06, clipAmount(t));

    const illum = illuminationAmount(t);
    const lower = lowerPathAmount(t);
    this.upperMat.opacity = 0.78 * illum;
    this.lowerMat.opacity = 0.78 * lower;
    const radial = (1.15 + 3.1 * lower) / 1.15;
    for (const beam of this.beams) {
      beam.scale.x = radial;
      beam.scale.z = radial;
    }
    this.upperPath.visible = illum > 0.04;
    this.lowerPath.visible = lower > 0.04;

    const field = nearFieldAmount(t);
    for (const shell of this.fieldShells) {
      shell.mesh.updateWorldMatrix(true, false);
      this.fieldInverse.copy(shell.mesh.matrixWorld).invert();
      this.fieldCamera.copy(this.camera.position).applyMatrix4(this.fieldInverse);
      shell.mat.uniforms.uCamera.value.copy(this.fieldCamera);
      shell.mat.uniforms.uOpacity.value = shell.base * field;
    }
    const charge = chargeAmount(t);
    this.placeCharges(t, charge);
    const dir = gapFieldDir(t);
    const direction = new THREE.Vector3(dir.x, dir.y, dir.z);
    this.arrows.forEach((arrow, index) => {
      arrow.position.set(gap.x, gap.y + 0.012 + index * 0.008, gap.z);
      arrow.setDirection(direction);
      setArrowOpacity(arrow, charge);
    });

    const dim = dimensionAmount(t);
    this.dimension.visible = dim > 0.03;
    this.dimMat.opacity = dim;

    this.dielectricMat.opacity = 0.28 * dielectricAmount(t);
    this.polarNear.visible = t >= 6.7 && t < 10.2;
    this.polarFar.visible = t >= 28.6;
    const chev = chevronAmount(t);
    this.chevrons.forEach((mesh, index) => {
      mesh.position.set(chevronX(index, t), 13, (index % 2 === 0 ? 1 : -1) * 4);
      mesh.visible = chev > 0.04;
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * chev;
    });

    const mol = moleculeAmount(t);
    const transparent = mol < 0.98;
    this.freeMat.transparent = transparent;
    this.boundMat.transparent = transparent;
    this.freeMat.opacity = mol;
    this.boundMat.opacity = mol;
    this.freeMat.depthWrite = !transparent;
    this.boundMat.depthWrite = !transparent;
    this.haloMat.opacity = 0.9 * mol;
    for (const item of this.molecules) {
      const p = moleculePosition(item.spec, t);
      const bound = isBound(item.spec, t);
      item.free.visible = !bound && mol > 0.03;
      item.bound.visible = bound && mol > 0.03;
      item.free.position.set(p.x, p.y, p.z);
      item.bound.position.set(p.x, p.y, p.z);
    }

    this.mapMat.opacity = 0.85 * bindingMapAmount(t);
    drawSpectrum(this.screenCtx, this.screenCanvas.width, this.screenCanvas.height, t, {
      background: "#10141c",
      compact: true,
    });
    this.screenTex.needsUpdate = true;
    this.updateLabels(t);

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.disposed = true;
    this.composer?.dispose();
    this.renderer.dispose();
  }

  private buildStage(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const g = canvas.getContext("2d");
    if (!g) return;
    g.fillStyle = "#10141a";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(255,255,255,0.045)";
    for (let i = 0; i <= 256; i += 32) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(340, 8, 150),
      new THREE.MeshStandardMaterial({ map: tex, color: 0x10141a, roughness: 0.95, metalness: 0 }),
    );
    plinth.position.set(CHANNEL.length / 2, -24, 18);
    this.scene.add(plinth);
  }

  private buildSubstrate(quality: Quality): void {
    const mat =
      quality === "high"
        ? new THREE.MeshPhysicalMaterial({
            color: 0xd5e4f2,
            roughness: 0.06,
            metalness: 0,
            transmission: 0.92,
            thickness: 6,
            ior: 1.48,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xd5e4f2,
            roughness: 0.12,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(CHANNEL.length + 36, 6, CHANNEL.halfWidth * 2 + 36), mat);
    mesh.position.set(CHANNEL.length / 2, -3, 0);
    this.scene.add(mesh);
  }

  private buildWalls(): THREE.Mesh[] {
    const mat = this.pdmsMaterial(this.options.quality, false);
    const h = CHANNEL.height;
    const fullZ = CHANNEL.halfWidth * 2 + CHANNEL.wall * 2;
    const sideGeo = new THREE.BoxGeometry(CHANNEL.length, h, CHANNEL.wall);
    const neg = new THREE.Mesh(sideGeo, mat);
    neg.position.set(CHANNEL.length / 2, h / 2, -(CHANNEL.halfWidth + CHANNEL.wall / 2));
    const posMat = mat.clone();
    posMat.clippingPlanes = [this.clip];
    const pos = new THREE.Mesh(sideGeo, posMat);
    pos.position.set(CHANNEL.length / 2, h / 2, CHANNEL.halfWidth + CHANNEL.wall / 2);
    const endGeo = new THREE.BoxGeometry(CHANNEL.wall, h, fullZ);
    const inlet = new THREE.Mesh(endGeo, mat);
    inlet.position.set(CHANNEL.wall / 2, h / 2, 0);
    const outlet = new THREE.Mesh(endGeo, mat);
    outlet.position.set(CHANNEL.length - CHANNEL.wall / 2, h / 2, 0);
    return [neg, pos, inlet, outlet];
  }

  private buildCover(quality: Quality, ghost: boolean): THREE.Group {
    const group = new THREE.Group();
    const fullZ = CHANNEL.halfWidth * 2 + CHANNEL.wall * 2;
    const mat = ghost ? this.ghostMat : this.pdmsMaterial(quality, true);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(CHANNEL.length, CHANNEL.cover, fullZ), mat);
    lid.position.set(CHANNEL.length / 2, CHANNEL.cover / 2, 0);
    group.add(lid);
    const portGeo = new THREE.CylinderGeometry(4.2, 4.2, 10, 16);
    for (const x of [28, 192]) {
      const port = new THREE.Mesh(portGeo, mat);
      port.position.set(x, CHANNEL.cover + 5, 0);
      group.add(port);
    }
    group.position.set(0, CHANNEL.height, 0);
    return group;
  }

  private pdmsMaterial(quality: Quality, cover: boolean): THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial {
    const color = cover ? 0xf4ecdf : 0xf7f1e8;
    if (quality === "high") {
      return new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.14,
        metalness: 0,
        transmission: 0.9,
        thickness: cover ? 6 : 4,
        ior: 1.41,
        transparent: true,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.25,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private buildArray(geo: THREE.TubeGeometry, material: THREE.Material): void {
    const count = ARRAY.nx * ARRAY.nz;
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const origin = arrayOrigin();
    let i = 0;
    for (let ix = 0; ix < ARRAY.nx; ix += 1) {
      for (let iz = 0; iz < ARRAY.nz; iz += 1) {
        const x = origin.x + ix * ARRAY.pitch;
        const z = origin.z + iz * ARRAY.pitch;
        const central = Math.abs(x - HERO_POS.x) < 1e-4 && Math.abs(z - HERO_POS.z) < 1e-4;
        dummy.position.set(x, TUBE_R, z);
        dummy.rotation.set(0, ROT_Y, 0);
        dummy.scale.setScalar(central ? 0.0001 : 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        i += 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  private addAntibodies(hero: THREE.Group): void {
    const protein = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.58, metalness: 0 });
    const linkerMat = new THREE.MeshStandardMaterial({ color: 0xb7c3d1, roughness: 0.7, metalness: 0 });
    for (const receptor of RECEPTORS) {
      const group = new THREE.Group();
      group.name = `ab-${receptor.index}`;
      group.position.set(receptor.baseLocal.x, receptor.baseLocal.y, receptor.baseLocal.z);
      const linker = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, LINKER_H, 6), linkerMat);
      linker.position.y = -LINKER_H / 2;
      const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.0021, 0.0052, 2, 6), protein);
      stem.position.y = 0.0046;
      const fab = new THREE.CapsuleGeometry(0.0018, 0.004, 2, 6);
      const left = new THREE.Mesh(fab, protein);
      left.position.set(-0.0024, 0.0094, 0);
      left.rotation.z = 0.65;
      const right = new THREE.Mesh(fab, protein);
      right.position.set(0.0024, 0.0094, 0);
      right.rotation.z = -0.65;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), protein);
      knob.position.y = AB_HEIGHT;
      group.add(linker, stem, left, right, knob);
      hero.add(group);
    }
  }

  private addField(hero: THREE.Group): void {
    const mid = gapMidLocal();
    // Unit sphere in object space. Local Z is the gap axis after the hero yaw.
    // Intensity is the ray's closest approach to the gap center, so the overlay
    // falls off instead of reading as a hard shell.
    const shells = [
      { scale: new THREE.Vector3(0.012, 0.014, 0.024), gain: 0.72, falloff: 4.2 },
      { scale: new THREE.Vector3(0.02, 0.022, 0.04), gain: 0.28, falloff: 2.4 },
    ];
    const geo = new THREE.SphereGeometry(1, 32, 24);
    for (const shell of shells) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        uniforms: {
          uCamera: { value: new THREE.Vector3() },
          uOpacity: { value: 0 },
          uFalloff: { value: shell.falloff },
        },
        vertexShader: `
          varying vec3 vLocal;
          void main() {
            vLocal = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vLocal;
          uniform vec3 uCamera;
          uniform float uOpacity;
          uniform float uFalloff;
          void main() {
            vec3 rd = normalize(vLocal - uCamera);
            float b = dot(uCamera, rd);
            float dist2 = max(0.0, dot(uCamera, uCamera) - b * b);
            float intensity = exp(-dist2 * uFalloff);
            if (vLocal.y < 0.0) intensity *= 0.45;
            if (intensity < 0.04) discard;
            vec3 col = vec3(0.851, 0.016, 0.161) * intensity;
            gl_FragColor = vec4(col, intensity * uOpacity);
          }
        `,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(mid.x, 0.006, mid.z);
      mesh.scale.copy(shell.scale);
      mesh.renderOrder = 8;
      hero.add(mesh);
      this.fieldShells.push({ mesh, mat, base: shell.gain });
    }
  }

  private assertAnchors(hero: THREE.Group): void {
    hero.updateWorldMatrix(true, true);
    const tmp = new THREE.Vector3();
    for (const receptor of RECEPTORS) {
      const child = hero.getObjectByName(`ab-${receptor.index}`);
      if (!child) throw new Error(`Missing antibody ${receptor.index}`);
      child.getWorldPosition(tmp);
      const error = tmp.distanceTo(new THREE.Vector3(receptor.base.x, receptor.base.y, receptor.base.z));
      if (error > 0.0015) throw new Error(`Receptor anchor mismatch ${receptor.index}: ${error}`);
    }
  }

  private chargeSprite(text: string, color: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const g = canvas.getContext("2d");
    if (!g) throw new Error("Charge sprite failed.");
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = color;
    g.font = "700 88px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 64, 68);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }),
    );
    sprite.scale.set(0.016, 0.016, 0.016);
    return sprite;
  }

  private buildArrows(): void {
    for (let i = 0; i < 5; i += 1) {
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.016, 0xf4f1ea, 0.005, 0.0035);
      this.arrows.push(arrow);
      this.scene.add(arrow);
    }
  }

  private buildDimension(): THREE.Group {
    const group = new THREE.Group();
    const [a, b] = clearGapEndpointsWorld(TUBE_R + 0.012);
    const start = new THREE.Vector3(a.x, a.y, a.z);
    const end = new THREE.Vector3(b.x, b.y, b.z);
    const dir = end.clone().sub(start);
    const length = dir.length();
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 1, 8), this.dimMat);
    line.renderOrder = 20;
    line.scale.y = length;
    line.position.copy(start).add(end).multiplyScalar(0.5);
    line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    group.add(line);
    for (const point of [start, end]) {
      const tick = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 10, 8), this.dimMat);
      tick.position.copy(point);
      tick.renderOrder = 20;
      group.add(tick);
    }
    return group;
  }

  private buildMolecules(): void {
    const freeGeo = new THREE.SphereGeometry(1, 12, 8);
    const boundGeo = new THREE.OctahedronGeometry(1, 0);
    const haloGeo = new THREE.TorusGeometry(1.45, 0.22, 6, 14);
    for (const spec of MOLECULES) {
      const free = new THREE.Mesh(freeGeo, this.freeMat);
      const bound = new THREE.Mesh(boundGeo, this.boundMat);
      const halo = new THREE.Mesh(haloGeo, this.haloMat);
      halo.rotation.x = Math.PI / 2;
      bound.add(halo);
      free.scale.setScalar(spec.radius);
      bound.scale.setScalar(spec.radius * 1.2);
      this.scene.add(free, bound);
      this.molecules.push({ spec, free, bound, halo });
    }
  }

  private addBeam(group: THREE.Group, a: V3, b: V3, material: THREE.Material): void {
    const start = new THREE.Vector3(a.x, a.y, a.z);
    const end = new THREE.Vector3(b.x, b.y, b.z);
    const dir = end.clone().sub(start);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 1, 12, 1, true), material);
    mesh.scale.y = dir.length();
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    this.beams.push(mesh);
    group.add(mesh);
  }

  private buildInstruments(): void {
    const body = new THREE.MeshStandardMaterial({
      color: 0x3a4554,
      roughness: 0.55,
      metalness: 0.22,
      emissive: 0x121820,
      emissiveIntensity: 0.6,
    });
    const source = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 14), body);
    source.position.set(CHANNEL.sensorX, 58, 0);
    const aperture = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff1d2, toneMapped: false }),
    );
    aperture.position.set(OPTICS.source.x, OPTICS.source.y, OPTICS.source.z);
    aperture.rotation.x = Math.PI / 2;
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 3.2, 28),
      new THREE.MeshStandardMaterial({
        color: 0xe7f2fb,
        roughness: 0.05,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    lens.position.set(OPTICS.lens.x, OPTICS.lens.y, OPTICS.lens.z);
    const spec = new THREE.Mesh(new THREE.BoxGeometry(20, 14, 22), body);
    spec.position.set(CHANNEL.sensorX, OPTICS.slit.y, 84);
    const mirror = new THREE.Mesh(
      new THREE.BoxGeometry(7, 7, 0.7),
      new THREE.MeshStandardMaterial({ color: 0xe7f2fb, metalness: 0.85, roughness: 0.12 }),
    );
    mirror.position.set(OPTICS.fold.x, OPTICS.fold.y, OPTICS.fold.z);
    mirror.rotation.x = Math.PI / 4;
    this.scene.add(source, aperture, lens, mirror, spec);
  }

  private doubleArrow(length: number): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4f1ea });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(length * 0.018, length * 0.018, length * 0.62, 8), mat);
    shaft.rotation.z = Math.PI / 2;
    const head = new THREE.ConeGeometry(length * 0.055, length * 0.16, 8);
    const positive = new THREE.Mesh(head, mat);
    positive.rotation.z = -Math.PI / 2;
    positive.position.x = length * 0.38;
    const negative = new THREE.Mesh(head, mat);
    negative.rotation.z = Math.PI / 2;
    negative.position.x = -length * 0.38;
    group.add(shaft, positive, negative);
    return group;
  }

  private buildChevrons(): void {
    const geo = new THREE.ConeGeometry(1.3, 3.4, 4);
    geo.rotateZ(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf4f1ea, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 7; i += 1) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      this.chevrons.push(mesh);
      this.scene.add(mesh);
    }
  }

  private buildBindingMap(): THREE.MeshBasicMaterial {
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 180;
    const g = canvas.getContext("2d");
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    if (!g) return mat;
    g.clearRect(0, 0, 300, 180);
    g.fillStyle = "rgba(0, 229, 255, 0.16)";
    g.fillRect(8, 8, 284, 164);
    g.strokeStyle = "rgba(0, 229, 255, 0.9)";
    g.strokeRect(8, 8, 284, 164);
    for (let ix = 0; ix < ARRAY.nx; ix += 1) {
      for (let iz = 0; iz < ARRAY.nz; iz += 1) {
        const weight = bindingMapWeight(ix, iz);
        const x = 16 + (ix / (ARRAY.nx - 1)) * 268;
        const y = 16 + (iz / (ARRAY.nz - 1)) * 148;
        g.beginPath();
        g.fillStyle = `rgba(0, 229, 255, ${0.25 + weight * 0.75})`;
        g.arc(x, y, 2 + weight * 5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(255,255,255,0.7)";
        g.lineWidth = 1;
        g.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry((ARRAY.nx - 1) * ARRAY.pitch + 0.4, (ARRAY.nz - 1) * ARRAY.pitch + 0.4), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(CHANNEL.sensorX, 0.05, 0);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    return mat;
  }

  private placeCharges(t: number, amount: number): void {
    const [a, b] = clearGapEndpointsWorld(0.012);
    const high = a.x >= b.x ? a : b;
    const low = a.x >= b.x ? b : a;
    const positive = chargeSign(t) === 1 ? high : low;
    const negative = chargeSign(t) === 1 ? low : high;
    this.plus.position.set(positive.x, positive.y, positive.z);
    this.minus.position.set(negative.x, negative.y, negative.z);
    const opacity = amount;
    (this.plus.material as THREE.SpriteMaterial).opacity = opacity;
    (this.minus.material as THREE.SpriteMaterial).opacity = opacity;
    this.plus.visible = amount > 0.04;
    this.minus.visible = amount > 0.04;
  }

  private buildLabelDom(): void {
    for (const spec of labelSpecs()) {
      const el = document.createElement("div");
      el.className = "tag";
      el.textContent = spec.text;
      el.hidden = true;
      this.options.labels.append(el);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("visibility", "hidden");
      this.options.leaders.append(line);
      this.labelViews.push({ spec, el, line });
    }
  }

  private updateLabels(t: number): void {
    this.camera.updateMatrixWorld(true);
    const width = this.options.stage.clientWidth;
    const height = this.options.stage.clientHeight;
    this.options.leaders.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const hideOnSmall = new Set(["aqueous", "access", "rep", "substrate"]);
    const point = new THREE.Vector3();
    for (const view of this.labelViews) {
      const show = view.spec.show(t) && !(width < 700 && hideOnSmall.has(view.spec.id));
      if (!show) {
        view.el.hidden = true;
        view.line.setAttribute("visibility", "hidden");
        continue;
      }
      const anchor = view.spec.anchor(t);
      point.set(anchor.x, anchor.y, anchor.z).project(this.camera);
      const x = (point.x * 0.5 + 0.5) * width;
      const y = (-point.y * 0.5 + 0.5) * height;
      if (point.z > 1 || x < -80 || y < -80 || x > width + 80 || y > height + 80) {
        view.el.hidden = true;
        view.line.setAttribute("visibility", "hidden");
        continue;
      }
      view.el.hidden = false;
      const left = THREE.MathUtils.clamp(x + view.spec.dx, 8, Math.max(8, width - 210));
      const top = THREE.MathUtils.clamp(y + view.spec.dy, 8, Math.max(8, height - 48));
      view.el.style.left = `${left}px`;
      view.el.style.top = `${top}px`;
      view.line.setAttribute("x1", x.toFixed(1));
      view.line.setAttribute("y1", y.toFixed(1));
      view.line.setAttribute("x2", left.toFixed(1));
      view.line.setAttribute("y2", (top + 12).toFixed(1));
      view.line.setAttribute("visibility", "visible");
    }
  }
}

function setArrowOpacity(arrow: THREE.ArrowHelper, opacity: number): void {
  const line = arrow.line.material as THREE.LineBasicMaterial;
  const cone = arrow.cone.material as THREE.MeshBasicMaterial;
  line.transparent = true;
  cone.transparent = true;
  line.opacity = opacity;
  cone.opacity = opacity;
  line.depthWrite = false;
  cone.depthWrite = false;
  arrow.visible = opacity > 0.04;
}
