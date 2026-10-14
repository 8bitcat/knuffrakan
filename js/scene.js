// Renderare, rosa himmel med moln, dis, ljus och jaktkamera.
import * as THREE from 'three';

export const SKY = {
  hor: 0xf7d9e4,    // horisonten (= diset)
  mid: 0xf1b4cd,
  top: 0xe18fbd,
  cloud: 0xfff4f8,
  shade: 0x8796b4,  // blågrå skuggor i molnen
};

const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = `
varying vec3 vDir;
uniform vec3 cHor; uniform vec3 cMid; uniform vec3 cTop; uniform vec3 cCloud; uniform vec3 cShade;
uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(cHor, cMid, smoothstep(-0.02, 0.2, h));
  col = mix(col, cTop, smoothstep(0.2, 0.85, h));
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.14) * 0.85 + vec2(uTime * 0.004, uTime * 0.0013);
    float n = fbm(uv * 1.25);
    float c = smoothstep(0.47, 0.76, n) * smoothstep(0.0, 0.16, h);
    float sh = smoothstep(0.58, 0.88, fbm(uv * 1.25 + vec2(3.7, 1.9)));
    vec3 cc = mix(cCloud, cShade, sh * 0.7);
    col = mix(col, cc, c * 0.88);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSkyMesh(radius = 8000) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    uniforms: {
      cHor: { value: new THREE.Color(SKY.hor) }, cMid: { value: new THREE.Color(SKY.mid) },
      cTop: { value: new THREE.Color(SKY.top) }, cCloud: { value: new THREE.Color(SKY.cloud) },
      cShade: { value: new THREE.Color(SKY.shade) }, uTime: { value: 0 },
    },
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Ingen filmisk tonmappning: förlagan har rena, mättade färger
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY.hor);
  scene.fog = new THREE.FogExp2(SKY.hor, 0.00042);

  const sky = createSkyMesh();
  scene.add(sky);

  // Reflektioner i lacken: rendera himlen en gång till en miljökarta
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(createSkyMesh(100));
  const ground = new THREE.Mesh(new THREE.CircleGeometry(100, 16), new THREE.MeshBasicMaterial({ color: 0xf0e2ea }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -2;
  envScene.add(ground);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.3, 9000);

  const hemi = new THREE.HemisphereLight(0xffe9f2, 0xc9a9bb, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0ee, 1.45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
  scene.add(sun, sun.target);
  const SUN_DIR = new THREE.Vector3(0.45, 0.82, 0.35).normalize();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return {
    renderer, scene, camera, sky, sun,
    // inne i tunneln: mindre dagsljus
    setTunnel(k) { hemi.intensity = 1.0 * (1 - 0.6 * k); sun.intensity = 1.45 * (1 - 0.85 * k); },
    // Skuggan och himlen följer det man tittar på
    follow(target, t) {
      sky.position.copy(camera.position);
      sky.material.uniforms.uTime.value = t;
      sun.position.copy(target).addScaledVector(SUN_DIR, 200);
      sun.target.position.copy(target);
    },
  };
}

// Jaktkamera bakom bilen, mjukt följande riktning
export class ChaseCam {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.yaw = 0;
    this.mode = 0;
    this.fov = 68;
    this.inited = false;
    this._d = new THREE.Vector3();
  }
  toggle() { this.mode = (this.mode + 1) % 3; }
  update(dt, pos, fwd, vel, kmh) {
    const M0 = [{ d: 8.6, h: 3.1 }, { d: 14, h: 5.5 }, { d: 6, h: 2.1 }][this.mode];
    const E = this.extra || { d: 0, h: 0 };
    const M = { d: M0.d + E.d, h: M0.h + E.h };
    // riktning: framåt, men följ farten när bilen glider/snurrar
    let hx = fwd.x, hz = fwd.z;
    const hl = Math.hypot(hx, hz);
    if (hl > 0.2) { hx /= hl; hz /= hl; } else { hx = Math.sin(this.yaw); hz = Math.cos(this.yaw); }
    const vh = Math.hypot(vel.x, vel.z);
    if (vh > 12) { const w = 0.55; hx = hx * (1 - w) + (vel.x / vh) * w; hz = hz * (1 - w) + (vel.z / vh) * w; }
    const want = Math.atan2(hx, hz);
    if (!this.inited) { this.yaw = want; }
    let dy = want - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * (1 - Math.exp(-5.5 * dt));
    const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw);
    // mjuka ut avståndet till bilen (inte positionen) — annars hamnar kameran långt bak i 300 km/h
    this._d.set(-sx * M.d, M.h, -sz * M.d);
    if (!this.inited) { this.off = this._d.clone(); this.look.copy(pos); this.inited = true; }
    this.off.lerp(this._d, 1 - Math.exp(-7 * dt));
    this.pos.copy(pos).add(this.off);
    if (this.pos.y < pos.y + 1.2) this.pos.y = pos.y + 1.2;
    this.camera.position.copy(this.pos);
    this._d.set(pos.x + sx * 9, pos.y + 1.3, pos.z + sz * 9);
    this.look.copy(this._d);
    this.camera.lookAt(this.look);
    const wantFov = 66 + Math.min(14, kmh * 0.035);
    this.fov += (wantFov - this.fov) * Math.min(1, 3 * dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.05) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
  }
}
