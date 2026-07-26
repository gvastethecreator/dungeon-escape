import * as THREE from "three";

import { createDungeonMaterials } from "./world/MaterialLibrary";
import { createReliquaryAltar } from "./world/ReliquaryAltar";

const canvas = document.querySelector<HTMLCanvasElement>("#preview")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20221f);
scene.fog = new THREE.Fog(0x20221f, 7, 13);
const camera = new THREE.PerspectiveCamera(33, 1, 0.05, 30);
camera.position.set(4.2, 3.15, 5.7);
camera.lookAt(0, 1.45, 0);

const altar = createReliquaryAltar(createDungeonMaterials());
altar.rotation.y = -0.18;
scene.add(altar);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshStandardMaterial({ color: 0x282a27, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const key = new THREE.DirectionalLight(0xffd6a0, 3.5);
key.position.set(3.5, 5.5, 4.5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
const fill = new THREE.DirectionalLight(0x9ca8ad, 1.15);
fill.position.set(-4, 2.2, 2);
const rim = new THREE.DirectionalLight(0xb47b52, 1.8);
rim.position.set(-2, 4, -4);
scene.add(key, fill, rim, new THREE.HemisphereLight(0xa4a9a4, 0x161412, 0.7));

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

function frame(time: number): void {
  requestAnimationFrame(frame);
  altar.rotation.y = -0.18 + Math.sin(time * 0.00025) * 0.06;
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
