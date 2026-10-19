import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

class FormaThreeViewer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf2f5ef);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100000);
    this.perspectiveCamera = new THREE.PerspectiveCamera(38, 1, 0.01, 100000);
    this.cameraMode = "orthographic";
    this.camera = this.orthographicCamera;
    this.camera.up.set(0, 0, 1);
    this.controls = this.createControls(this.camera);
    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
    this.mesh = null;
    this.edges = null;
    this.grid = null;
    this.modelBounds = null;
    this.zones = [];
    this.colors = {};
    this.wireframe = false;

    this.addToolbar();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();
    this.animate = this.animate.bind(this);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  createControls(camera) {
    const controls = new OrbitControls(camera, this.renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 100000;
    return controls;
  }

  addToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "viewer3d-toolbar";
    toolbar.innerHTML = `
      <button type="button" data-viewer-action="orthographic" class="active">Ortho</button>
      <button type="button" data-viewer-action="perspective">Perspective</button>
      <button type="button" data-viewer-action="wireframe">Wireframe</button>
      <button type="button" data-viewer-action="reset">Reset</button>`;
    toolbar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-viewer-action]");
      if (!button) return;
      const action = button.dataset.viewerAction;
      if (action === "orthographic" || action === "perspective") this.setCameraMode(action);
      if (action === "wireframe") {
        this.wireframe = !this.wireframe;
        button.classList.toggle("active", this.wireframe);
        if (this.mesh) this.mesh.material.wireframe = this.wireframe;
      }
      if (action === "reset") this.fitCamera();
    });
    this.container.appendChild(toolbar);

    const help = document.createElement("div");
    help.className = "viewer3d-help";
    help.textContent = "Drag to orbit · wheel to zoom · right-drag to pan";
    this.container.appendChild(help);
    const scale = document.createElement("div");
    scale.className = "viewer3d-scale";
    scale.textContent = "Dimensionally accurate STL";
    this.container.appendChild(scale);
  }

  load(arrayBuffer, zones, colors, unitScale = 1) {
    const loader = new STLLoader();
    const geometry = loader.parse(arrayBuffer.slice(0));
    geometry.computeVertexNormals();
    geometry.scale(unitScale, unitScale, unitScale);
    geometry.computeBoundingBox();
    const sourceBounds = geometry.boundingBox.clone();
    const centerX = (sourceBounds.min.x + sourceBounds.max.x) / 2;
    const centerY = (sourceBounds.min.y + sourceBounds.max.y) / 2;
    geometry.translate(-centerX, -centerY, -sourceBounds.min.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    this.clearModel();
    this.zones = zones;
    this.colors = colors;
    const material = this.createProgramMaterial(zones, colors, geometry.boundingBox);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.material.wireframe = this.wireframe;
    this.modelGroup.add(this.mesh);

    if (geometry.attributes.position.count < 300000) {
      const edgeGeometry = new THREE.EdgesGeometry(geometry, 28);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x26312c, transparent: true, opacity: 0.24 });
      this.edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      this.modelGroup.add(this.edges);
    }

    this.modelBounds = geometry.boundingBox.clone();
    this.addGrid();
    this.fitCamera();
  }

  updateZones(zones, colors) {
    this.zones = zones;
    this.colors = colors;
    if (!this.mesh || !this.modelBounds) return;
    const oldMaterial = this.mesh.material;
    this.mesh.material = this.createProgramMaterial(zones, colors, this.modelBounds);
    this.mesh.material.wireframe = this.wireframe;
    oldMaterial.dispose();
  }

  createProgramMaterial(zones, colors, bounds) {
    const width = Math.max(0.001, bounds.max.x - bounds.min.x);
    const colorExpression = zones.map((zone) => {
      let cursor = 0;
      const entries = Object.entries(zone.mix);
      const mix = entries.map(([program, ratio], index) => {
        cursor += Number(ratio);
        const color = new THREE.Color(colors[program] || "#cbd2cc");
        const assignment = `programColor = vec3(${color.r.toFixed(5)}, ${color.g.toFixed(5)}, ${color.b.toFixed(5)});`;
        if (entries.length === 1) return assignment;
        return index === entries.length - 1 ? `else { ${assignment} }` : `${index ? "else " : ""}if (vAcross <= ${cursor.toFixed(5)}) { ${assignment} }`;
      }).join(" ");
      return `if (vElevation >= ${Number(zone.bottom).toFixed(4)} && vElevation < ${Number(zone.top).toFixed(4)}) { ${mix} }`;
    }).join(" else ");

    return new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: `
        varying float vElevation;
        varying float vAcross;
        varying vec3 vNormalView;
        void main() {
          vElevation = position.z;
          vAcross = clamp((position.x - ${bounds.min.x.toFixed(5)}) / ${width.toFixed(5)}, 0.0, 1.0);
          vNormalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vElevation;
        varying float vAcross;
        varying vec3 vNormalView;
        void main() {
          vec3 programColor = vec3(0.78, 0.81, 0.78);
          ${colorExpression}
          vec3 lightDirection = normalize(vec3(0.45, 0.65, 0.85));
          float diffuse = max(dot(normalize(vNormalView), lightDirection), 0.0);
          float shade = 0.62 + diffuse * 0.38;
          gl_FragColor = vec4(programColor * shade, 1.0);
        }`
    });
  }

  addGrid() {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    const size = Math.max(this.modelBounds.max.x - this.modelBounds.min.x, this.modelBounds.max.y - this.modelBounds.min.y) * 3;
    const divisions = Math.max(10, Math.min(40, Math.round(size / 20)));
    this.grid = new THREE.GridHelper(size, divisions, 0x7f8b84, 0xc8cec8);
    this.grid.rotation.x = Math.PI / 2;
    this.grid.position.z = -0.05;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.55;
    this.scene.add(this.grid);
  }

  setCameraMode(mode) {
    if (mode === this.cameraMode) return;
    const oldPosition = this.camera.position.clone();
    const target = this.controls.target.clone();
    this.controls.dispose();
    this.cameraMode = mode;
    this.camera = mode === "orthographic" ? this.orthographicCamera : this.perspectiveCamera;
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(oldPosition);
    this.controls = this.createControls(this.camera);
    this.controls.target.copy(target);
    this.controls.update();
    this.container.querySelectorAll("[data-viewer-action='orthographic'],[data-viewer-action='perspective']").forEach((button) => button.classList.toggle("active", button.dataset.viewerAction === mode));
    this.resize();
  }

  fitCamera() {
    if (!this.modelBounds) return;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    this.modelBounds.getSize(size);
    this.modelBounds.getCenter(center);
    const radius = Math.max(size.x, size.y, size.z) * 0.62;
    const direction = new THREE.Vector3(1.35, -1.55, 0.72).normalize();
    this.camera.position.copy(center).add(direction.multiplyScalar(radius * 3.2));
    this.camera.up.set(0, 0, 1);
    this.controls.target.copy(center);
    this.controls.update();
    this.orthoSize = Math.max(size.z * 1.12, Math.max(size.x, size.y) * 1.5);
    this.resize();
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    this.renderer.setSize(width, height, false);
    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();
    const viewHeight = this.orthoSize || 100;
    this.orthographicCamera.top = viewHeight / 2;
    this.orthographicCamera.bottom = -viewHeight / 2;
    this.orthographicCamera.left = -viewHeight * aspect / 2;
    this.orthographicCamera.right = viewHeight * aspect / 2;
    this.orthographicCamera.updateProjectionMatrix();
  }

  clearModel() {
    while (this.modelGroup.children.length) {
      const object = this.modelGroup.children.pop();
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    }
    this.mesh = null;
    this.edges = null;
  }

  animate() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  }
}

window.Forma3D = {
  mount(container) {
    return new FormaThreeViewer(container);
  }
};
window.dispatchEvent(new CustomEvent("forma3dready"));
