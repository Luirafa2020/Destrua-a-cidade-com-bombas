// --- START OF FILE script.js ---

// --- Configurações Iniciais e Globais ---
const canvas = document.getElementById('city-canvas');
const statusDisplay = document.getElementById('status-display');
const launchButton = document.getElementById('launch-button');
const explosionOverlay = document.getElementById('explosion-overlay');
const performanceInfo = document.getElementById('performance-info');
// === NEW: Power Control UI ===
const powerSlider = document.getElementById('power-slider');
const powerValueDisplay = document.getElementById('power-value');

let scene, camera, renderer, controls, clock, raycaster, mouse;
let buildings = [];
let fragments = [];
let groundMesh = null;
let targetMarker = null; // Marcador visual do alvo
let activeBombs = []; // Array para gerenciar bombas caindo {mesh, target, audioNodes}
// === NEW: Pedestrians ===
let pedestrians = [];
const pedestrianCount = 60; // Número de pedestres
const pedestrianSpeed = 1.5; // Velocidade de movimento
const pedestrianCheckRadius = 0.8; // Raio para evitar prédios ao spawnar
const pedestrianHeight = 0.7;
const pedestrianRadius = 0.1;
let activePedestrians = 0; // Contador para UI

// Estado (Simplificado)
let targetPosition = new THREE.Vector3();
let isTargetSet = false;

// Parâmetros da Explosão e Efeitos (BASE VALUES)
const citySize = 100;
const buildingMaxHeight = 15;
const buildingSpacing = 2.8;
const roadWidth = 1.5;
const fragmentCount = 13;
const gravity = 9.8;
const baseBlastRadius = 30; // Raio base
const baseBlastForce = 70;  // Força base
const bombFallSpeed = 90;
const bombStartY = 160;
const detonationHeight = 0; // Impacto no solo

// === NEW: Bomb Power ===
let currentBombPowerFactor = 1.0; // Multiplicador inicial (será atualizado pela UI)
const minPowerFactor = 0.2; // Mínimo multiplicador (20%)
const maxPowerFactor = 2.2; // Máximo multiplicador (220%)

// Efeitos Visuais da Explosão (Meshes compartilhados/reutilizados)
let fireballMesh = null;
const baseFireballMaxSize = baseBlastRadius * 0.6; // Base size
const fireballDuration = 0.8;
let fireballTimer = Infinity; // Inicia "morto"

let shockwaveMesh = null;
const baseShockwaveMaxSize = baseBlastRadius * 1.5; // Base size
const shockwaveDuration = 1.2;
const shockwaveThickness = 1.5;
let shockwaveTimer = Infinity;

let groundScarMesh = null;
const baseGroundScarSize = baseBlastRadius * 0.8; // Base size
const groundScarDuration = 30;
let groundScarTimer = Infinity;

let smokeColumnMesh = null;
let smokeColumnMaterial = null;
const baseSmokeColumnHeight = baseBlastRadius * 3.5; // Base height
const baseSmokeColumnTopRadius = baseBlastRadius * 1.2; // Base radius
const smokeColumnDuration = 15;
let smokeColumnTimer = Infinity;

// Sistema de Partículas (Fumaça/Poeira - Partículas persistem entre explosões)
let smokeParticles = null;
let smokeGeometry = null;
let smokeMaterial = null;
const smokeParticleCount = 7000;
const smokeMaxAge = 8;
const baseSmokeSpread = baseBlastRadius * 0.8; // Base spread
const baseSmokeRiseSpeed = baseBlastRadius * 0.9; // Base speed
let particleAttributes = {
    positions: null, velocities: null, ages: null, sizes: null, opacities: null
};
let activeSmokeParticles = 0;

// Camera Shake
let isShaking = false;
let shakeIntensity = 0;
const maxShakeIntensity = 0.25;
const shakeDuration = 0.7;
let shakeTimer = 0;

// Áudio
let audioContext;
let explosionGain;

// --- Inicialização ---
function init() {
    // 1. Essenciais do Three.js
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6690C2);
    scene.fog = new THREE.Fog(0x6690C2, citySize * 0.4, citySize * 2.2);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, citySize * 3);
    camera.position.set(citySize * 0.6, citySize * 0.4, citySize * 0.6);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 2. Iluminação (sem mudanças)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.75);
    directionalLight.position.set(citySize * 0.6, citySize * 1.1, citySize * 0.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    const shadowCamSize = citySize;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = citySize * 3;
    directionalLight.shadow.bias = -0.002;
    scene.add(directionalLight);
    scene.userData.directionalLight = directionalLight;
    scene.userData.ambientLight = ambientLight;

    // 3. Controles (sem mudanças)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 10;
    controls.maxDistance = citySize * 1.5;

    // 4. Criar a Cidade, Efeitos e Pedestres
    createGround();
    generateCityWithProceduralTextures(); // Cria prédios
    createTargetMarker();
    setupExplosionEffects(); // Configura meshes de efeitos
    spawnPedestrians(pedestrianCount); // === NEW: Spawna pedestres
    initAudio();

    // 5. Event Listeners
    window.addEventListener('resize', onWindowResize);
    canvas.addEventListener('click', onCanvasClick);
    launchButton.addEventListener('click', launchAttack);
    // === NEW: Power Slider Listener ===
    powerSlider.addEventListener('input', updateBombPower);
    updateBombPower(); // Call once initially to set value

    // 6. Iniciar Simulação
    updateStatus("Defina o Alvo");
    canvas.classList.add('targeting');
    launchButton.disabled = true;
    animate();
}

// --- Funções de Criação ---

function createGround() { // Sem mudanças
    const groundGeometry = new THREE.PlaneGeometry(citySize * 1.5, citySize * 1.5);
    // ... (código da textura procedural do chão - igual)
    const groundCanvas = document.createElement('canvas');
    groundCanvas.width = 128; groundCanvas.height = 128;
    const ctx = groundCanvas.getContext('2d');
    ctx.fillStyle = '#404040';
    ctx.fillRect(0, 0, 128, 128);
    for(let i = 0; i < 600; i++) {
        const x = Math.random() * 128; const y = Math.random() * 128;
        const c = Math.random() * 40 + 25; ctx.fillStyle = `rgb(${c},${c},${c})`;
        ctx.fillRect(x, y, Math.random() > 0.5 ? 2: 1, Math.random() > 0.5 ? 2: 1);
    }
    const groundTexture = new THREE.CanvasTexture(groundCanvas);
    groundTexture.wrapS = THREE.RepeatWrapping; groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(citySize / 6, citySize / 6); groundTexture.anisotropy = 16;
    const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 0.85, metalness: 0.05 });
    groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.y = -0.05;
    groundMesh.receiveShadow = true; groundMesh.userData.isGround = true;
    scene.add(groundMesh);
 }

function createBuildingTexture(widthPx = 256, heightPx = 512) { // Sem mudanças
    // ... (código da textura procedural do prédio - igual) ...
    const canvas = document.createElement('canvas');
    canvas.width = widthPx; canvas.height = heightPx; const ctx = canvas.getContext('2d');
    const baseHue = Math.random() * 0.15 + (Math.random() > 0.4 ? 0.55 : 0.05);
    const baseSaturation = 0.05 + Math.random() * 0.15;
    const light1 = 0.4 + Math.random() * 0.2; const light2 = light1 + (Math.random() - 0.5) * 0.15;
    const gradient = ctx.createLinearGradient(0, 0, 0, heightPx);
    gradient.addColorStop(0, `hsl(${baseHue * 360}, ${baseSaturation * 100}%, ${light1 * 100}%)`);
    gradient.addColorStop(1, `hsl(${baseHue * 360}, ${baseSaturation * 100}%, ${light2 * 100}%)`);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, widthPx, heightPx);
    const imageData = ctx.getImageData(0, 0, widthPx, heightPx); const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) { const noise = (Math.random() - 0.5) * 25; data[i] = Math.max(0, Math.min(255, data[i] + noise)); data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise)); data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise)); }
    ctx.putImageData(imageData, 0, 0);
    const windowMinWidth = widthPx * 0.07; const windowMaxWidth = widthPx * 0.12;
    const windowAspectMin = 1.0; const windowAspectMax = 1.8;
    const spacingMinX = windowMinWidth * 0.5; const spacingMaxX = windowMinWidth * 1.0;
    const spacingMinY = windowMinWidth * 0.4; const spacingMaxY = windowMinWidth * 0.9;
    let currentY = spacingMinY + Math.random() * (spacingMaxY - spacingMinY);
    while(currentY < heightPx) { let currentX = spacingMinX + Math.random() * (spacingMaxX - spacingMinX); const rowHeight = (windowAspectMin + Math.random()*(windowAspectMax - windowAspectMin)) * (windowMinWidth + Math.random()*(windowMaxWidth-windowMinWidth));
        while(currentX < widthPx) { const windowWidth = windowMinWidth + Math.random() * (windowMaxWidth - windowMinWidth); const windowHeight = Math.min(rowHeight, heightPx - currentY - spacingMinY);
            if (windowWidth > 1 && windowHeight > 1) { const windowRand = Math.random(); let windowColor; if (windowRand < 0.15) windowColor = `hsl(0, 0%, ${8 + Math.random() * 10}%)`; else if (windowRand < 0.65) windowColor = `hsl(60, 65%, ${70 + Math.random() * 20}%)`; else windowColor = `hsl(200, 30%, ${60 + Math.random() * 15}%)`;
                ctx.fillStyle = windowColor; ctx.fillRect(currentX, currentY, windowWidth, windowHeight);
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = Math.max(1, widthPx / 200); ctx.strokeRect(currentX, currentY, windowWidth, windowHeight); }
            const spacingX = spacingMinX + Math.random() * (spacingMaxX - spacingMinX); currentX += windowWidth + spacingX; }
        const spacingY = spacingMinY + Math.random() * (spacingMaxY - spacingMinY); currentY += Math.max(rowHeight, windowMinWidth * windowAspectMin) + spacingY; }
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = Math.max(1, heightPx/256); const floorHeight = heightPx / (10 + Math.random()*15);
    for(let y = floorHeight; y < heightPx; y += floorHeight) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(widthPx, y); ctx.stroke(); }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); texture.needsUpdate = true;
    return texture;
 }

function generateCityWithProceduralTextures() { // Sem mudanças significativas
    const buildingGeometry = new THREE.BoxGeometry(1, 1, 1);
    const numTextures = 20; const buildingTextures = [];
    console.time("Generate Textures");
    for (let i = 0; i < numTextures; i++) { buildingTextures.push(createBuildingTexture()); }
    console.timeEnd("Generate Textures");
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0xAAAAAA, roughness: 0.9, metalness: 0.1 });
    const halfCitySize = citySize / 2;
    console.time("Generate Buildings");
    for (let x = -halfCitySize; x < halfCitySize; x += buildingSpacing + roadWidth + Math.random() * buildingSpacing * 0.7) {
        for (let z = -halfCitySize; z < halfCitySize; z += buildingSpacing + roadWidth + Math.random() * buildingSpacing * 0.7) {
            if (Math.random() > 0.93) continue;
            const buildingWidth = Math.random() * (buildingSpacing * 0.8) + (buildingSpacing * 0.5);
            const buildingDepth = Math.random() * (buildingSpacing * 0.8) + (buildingSpacing * 0.5);
            const buildingHeight = Math.pow(Math.random(), 1.8) * buildingMaxHeight + 2.5;
            const facadeTexture = buildingTextures[Math.floor(Math.random() * numTextures)];
            facadeTexture.repeat.set(buildingWidth / 4, buildingHeight / 4);
            const buildingMaterials = [ new THREE.MeshStandardMaterial({ map: facadeTexture, roughness: 0.7, metalness: 0.25 }), new THREE.MeshStandardMaterial({ map: facadeTexture, roughness: 0.7, metalness: 0.25 }), roofMaterial, roofMaterial, new THREE.MeshStandardMaterial({ map: facadeTexture, roughness: 0.7, metalness: 0.25 }), new THREE.MeshStandardMaterial({ map: facadeTexture, roughness: 0.7, metalness: 0.25 }) ];
            const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterials);
            buildingMesh.scale.set(buildingWidth, buildingHeight, buildingDepth);
            buildingMesh.position.set( x + (Math.random()-0.5)*roadWidth*0.4, buildingHeight / 2, z + (Math.random()-0.5)*roadWidth*0.4 );
            buildingMesh.castShadow = true; buildingMesh.receiveShadow = true;
            // Store building center and radius for pedestrian spawning check
            buildingMesh.userData = {
                isBuilding: true,
                width: buildingWidth, height: buildingHeight, depth: buildingDepth,
                centerXZ: new THREE.Vector2(buildingMesh.position.x, buildingMesh.position.z),
                boundingRadiusXZ: Math.max(buildingWidth, buildingDepth) / 2 // Approximate radius
            };
            scene.add(buildingMesh); buildings.push(buildingMesh);
        }
    }
    console.timeEnd("Generate Buildings");
}

function createTargetMarker() { // Sem mudanças
    const markerGeometry = new THREE.RingGeometry(0.8, 1.0, 32);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    targetMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    targetMarker.rotation.x = -Math.PI / 2; targetMarker.position.y = 0.01;
    targetMarker.visible = false;
    scene.add(targetMarker);
}

function createBombModel() { // Sem mudanças
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.9, roughness: 0.25 });
    const finMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.8, roughness: 0.4 });
    const bodyGeom = new THREE.CylinderGeometry(0.25, 0.22, 1.2, 20);
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat); group.add(bodyMesh);
    const noseGeom = new THREE.SphereGeometry(0.25, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeom, bodyMat); noseMesh.position.y = 0.6; noseMesh.scale.y = 1.5; group.add(noseMesh);
    const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(0.3, -0.1); finShape.lineTo(0.25, -0.4); finShape.lineTo(0, -0.35); finShape.lineTo(0, 0);
    const finGeom = new THREE.ExtrudeGeometry(finShape, { depth: 0.03, bevelEnabled: false });
    for (let i = 0; i < 4; i++) { const finMesh = new THREE.Mesh(finGeom, finMat); const angle = (i / 4) * Math.PI * 2; finMesh.position.set( Math.cos(angle) * 0.18, -0.6, Math.sin(angle) * 0.18 ); finMesh.rotation.set(0, -angle , 0); group.add(finMesh); }
    group.traverse(child => { if (child.isMesh) child.castShadow = true; });
    return group;
}

function setupExplosionEffects() { // Add userData to store scaled sizes
    // Bola de Fogo
    const fireballGeometry = new THREE.SphereGeometry(1, 32, 32);
    const fireballMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFAA, transparent: true, opacity: 0.95, fog: false });
    fireballMesh = new THREE.Mesh(fireballGeometry, fireballMaterial);
    fireballMesh.visible = false;
    fireballMesh.userData.currentMaxSize = baseFireballMaxSize; // Store initial base size
    scene.add(fireballMesh);

    // Onda de Choque
    const shockwaveGeometry = new THREE.RingGeometry(1, 1 + shockwaveThickness, 64);
    const shockwaveMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, transparent: true, opacity: 0.4, fog: false });
    shockwaveMesh = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial);
    shockwaveMesh.rotation.x = -Math.PI / 2; shockwaveMesh.position.y = 0.1; shockwaveMesh.visible = false;
    shockwaveMesh.userData.currentMaxSize = baseShockwaveMaxSize; // Store initial base size
    scene.add(shockwaveMesh);

    // Marca no Chão
    const groundScarGeometry = new THREE.CircleGeometry(1, 64);
    const groundScarMaterial = new THREE.MeshBasicMaterial({ color: 0x1A1A1A, transparent: true, opacity: 0.75 });
    groundScarMesh = new THREE.Mesh(groundScarGeometry, groundScarMaterial);
    groundScarMesh.rotation.x = -Math.PI / 2; groundScarMesh.position.y = 0.0; groundScarMesh.visible = false;
    groundScarMesh.userData.currentSize = baseGroundScarSize; // Store initial base size
    scene.add(groundScarMesh);

    // Coluna de Fumaça Principal (Geometry needs regeneration if radius changes drastically, but let's scale the mesh for now)
    // We'll scale the existing mesh based on power, affecting height and radius
    const smokeColumnGeom = new THREE.CylinderGeometry(baseSmokeColumnTopRadius, baseBlastRadius * 0.5, baseSmokeColumnHeight, 32, 64, true);
    // ... (geometry vertex manipulation for noise - use base sizes here) ...
    const posAttr = smokeColumnGeom.attributes.position; const vertex = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++){ vertex.fromBufferAttribute(posAttr, i); const yRatio = (vertex.y + baseSmokeColumnHeight / 2) / baseSmokeColumnHeight; const noiseFactor = 1.0 + (Math.random() - 0.5) * 0.5 * yRatio; const radialNoise = (Math.random() - 0.5) * 0.2 * yRatio; vertex.x *= noiseFactor + radialNoise; vertex.z *= noiseFactor + radialNoise; if(yRatio < 0.1) { vertex.x *= yRatio * 10; vertex.z *= yRatio * 10; } posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z); }
    smokeColumnGeom.computeVertexNormals();
    // ... (material creation - igual) ...
    const smokeColumnCanvas = document.createElement('canvas'); smokeColumnCanvas.width = 128; smokeColumnCanvas.height = 512; const ctxCol = smokeColumnCanvas.getContext('2d'); const gradCol = ctxCol.createLinearGradient(0, 0, 0, 512); gradCol.addColorStop(0, 'rgba(90, 80, 70, 0.0)'); gradCol.addColorStop(0.2, 'rgba(100, 90, 80, 0.6)'); gradCol.addColorStop(0.8, 'rgba(130, 120, 110, 0.7)'); gradCol.addColorStop(1, 'rgba(150, 140, 130, 0.3)'); ctxCol.fillStyle = gradCol; ctxCol.fillRect(0, 0, 128, 512);
    for(let i=0; i<50; i++) { const x = Math.random()*128; const y = Math.random()*512; const r = Math.random()*30 + 10; const alpha = Math.random()*0.1 + 0.05; const gray = Math.random()*50 + 100; const gradBlob = ctxCol.createRadialGradient(x,y,0, x,y,r); gradBlob.addColorStop(0, `rgba(${gray},${gray-10},${gray-20}, ${alpha})`); gradBlob.addColorStop(1, `rgba(${gray},${gray-10},${gray-20}, 0)`); ctxCol.fillStyle = gradBlob; ctxCol.fillRect(x-r, y-r, r*2, r*2); }
    const smokeColumnTexture = new THREE.CanvasTexture(smokeColumnCanvas); smokeColumnTexture.wrapS = THREE.RepeatWrapping; smokeColumnTexture.wrapT = THREE.ClampToEdgeWrapping;
    smokeColumnMaterial = new THREE.MeshStandardMaterial({ map: smokeColumnTexture, alphaMap: smokeColumnTexture, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending, roughness: 0.9, metalness: 0.0 });

    smokeColumnMesh = new THREE.Mesh(smokeColumnGeom, smokeColumnMaterial);
    smokeColumnMesh.position.y = baseSmokeColumnHeight / 2; // Initial position
    smokeColumnMesh.visible = false;
    smokeColumnMesh.userData.currentHeight = baseSmokeColumnHeight; // Store initial base height
    smokeColumnMesh.userData.currentTopRadius = baseSmokeColumnTopRadius; // Store radius? Less direct to scale, let's scale X/Z instead
    scene.add(smokeColumnMesh);

    // Partículas de Fumaça/Poeira
    smokeGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(smokeParticleCount * 3); const velocities = new Float32Array(smokeParticleCount * 3);
    const ages = new Float32Array(smokeParticleCount); const sizes = new Float32Array(smokeParticleCount); const opacities = new Float32Array(smokeParticleCount);
    for (let i = 0; i < smokeParticleCount; i++) { positions[i * 3 + 1] = -1000; ages[i] = smokeMaxAge; }
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); smokeGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    smokeGeometry.setAttribute('age', new THREE.BufferAttribute(ages, 1)); smokeGeometry.setAttribute('particleSize', new THREE.BufferAttribute(sizes, 1));
    smokeGeometry.setAttribute('particleOpacity', new THREE.BufferAttribute(opacities, 1));
    // ... (material creation - igual) ...
    const smokeCanvas = document.createElement('canvas'); smokeCanvas.width = 64; smokeCanvas.height = 64; const ctx = smokeCanvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); gradient.addColorStop(0, 'rgba(180, 160, 140, 0.6)'); gradient.addColorStop(0.5, 'rgba(150, 130, 110, 0.3)'); gradient.addColorStop(1, 'rgba(120, 100, 80, 0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); const smokeTexture = new THREE.CanvasTexture(smokeCanvas);
    smokeMaterial = new THREE.PointsMaterial({ map: smokeTexture, size: 6.0, color: 0xAAAAAA, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.NormalBlending, sizeAttenuation: true });
    smokeMaterial.onBeforeCompile = shader => {
        shader.vertexShader = ` attribute float particleSize; attribute float particleOpacity; varying float vOpacity; ${shader.vertexShader} `.replace(`#include <begin_vertex>`, `#include <begin_vertex> \n transformed *= particleSize; \n vOpacity = particleOpacity;`);
        shader.fragmentShader = ` varying float vOpacity; ${shader.fragmentShader} `.replace(`vec4 diffuseColor = vec4( diffuse, opacity );`, `vec4 diffuseColor = vec4( diffuse, opacity * vOpacity );`);
    };
    smokeParticles = new THREE.Points(smokeGeometry, smokeMaterial);
    smokeParticles.visible = true;
    scene.add(smokeParticles);
    particleAttributes = { positions, velocities, ages, sizes, opacities };
    // Store base values in userData for scaling particle spawn
    smokeParticles.userData.baseSpread = baseSmokeSpread;
    smokeParticles.userData.baseRiseSpeed = baseSmokeRiseSpeed;
}

// === NEW: Pedestrian Functions ===
function createPedestrianMesh() {
    // Simplified Humanoid Shape using Primitives
    const group = new THREE.Group();

    // Define dimensions relative to overall height/radius for easier scaling
    const headRadius = pedestrianRadius * 1.1;
    const torsoHeight = pedestrianHeight * 0.45;
    const torsoWidth = pedestrianRadius * 2.2;
    const torsoDepth = pedestrianRadius * 1.5;
    const limbRadius = pedestrianRadius * 0.5;
    const armLength = torsoHeight * 0.9;
    const legHeight = pedestrianHeight * 0.45;

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.08, 0.5, 0.6 + Math.random() * 0.1), // Basic skin tone range
        roughness: 0.85,
        metalness: 0.0
    });
    const clothesMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(Math.random(), 0.4 + Math.random() * 0.3, 0.3 + Math.random() * 0.3), // Random clothes color
        roughness: 0.8,
        metalness: 0.05
    });
     const pantsMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.6 + Math.random()*0.1, 0.3 + Math.random() * 0.2, 0.25 + Math.random() * 0.15), // Darker pants color (blues/grays)
        roughness: 0.8,
        metalness: 0.05
    });

    // Head (Sphere)
    const headGeom = new THREE.SphereGeometry(headRadius, 10, 8);
    const headMesh = new THREE.Mesh(headGeom, skinMat);
    headMesh.position.y = legHeight + torsoHeight + headRadius * 0.9; // Position head on top of torso
    headMesh.castShadow = true;
    group.add(headMesh);

    // Torso (Box)
    const torsoGeom = new THREE.BoxGeometry(torsoWidth, torsoHeight, torsoDepth);
    const torsoMesh = new THREE.Mesh(torsoGeom, clothesMat);
    const torsoYPos = legHeight + torsoHeight / 2;
    torsoMesh.position.y = torsoYPos; // Position torso above legs
    torsoMesh.castShadow = true;
    group.add(torsoMesh);

    // --- Legs (Cylinders within Pivot Groups) ---
    const legGeom = new THREE.CylinderGeometry(limbRadius, limbRadius * 0.8, legHeight, 6); // Taper slightly

    // Left Leg
    const leftLegPivot = new THREE.Group();
    leftLegPivot.name = 'leftLeg'; // Name the pivot group directly
    leftLegPivot.position.set(-torsoWidth / 3.5, legHeight, 0); // Position pivot at hip height
    const leftLegMesh = new THREE.Mesh(legGeom, pantsMat);
    leftLegMesh.position.y = -legHeight / 2; // Offset mesh down so pivot is at the top
    leftLegMesh.castShadow = true;
    leftLegPivot.add(leftLegMesh);
    group.add(leftLegPivot);

    // Right Leg
    const rightLegPivot = new THREE.Group();
    rightLegPivot.name = 'rightLeg'; // Name the pivot group directly
    rightLegPivot.position.set(torsoWidth / 3.5, legHeight, 0); // Position pivot at hip height
    const rightLegMesh = new THREE.Mesh(legGeom, pantsMat);
    rightLegMesh.position.y = -legHeight / 2; // Offset mesh down so pivot is at the top
    rightLegMesh.castShadow = true;
    rightLegPivot.add(rightLegMesh);
    group.add(rightLegPivot);

    // --- Arms (Cylinders within Pivot Groups) ---
    const armGeom = new THREE.CylinderGeometry(limbRadius * 0.8, limbRadius * 0.6, armLength, 6);

    // Left Arm
    const leftArmPivot = new THREE.Group();
    leftArmPivot.name = 'leftArm'; // Name the pivot group directly
    // Position pivot at shoulder height, slightly outside torso
    leftArmPivot.position.set(-torsoWidth / 2 - limbRadius * 0.5, torsoYPos + torsoHeight / 2 - limbRadius, 0);
    const leftArmMesh = new THREE.Mesh(armGeom, skinMat); // Use skin material for arms
    leftArmMesh.position.y = -armLength / 2 + limbRadius; // Offset mesh down so pivot is near the top
    leftArmMesh.castShadow = true;
    leftArmPivot.add(leftArmMesh);
    group.add(leftArmPivot);

    // Right Arm
    const rightArmPivot = new THREE.Group();
    rightArmPivot.name = 'rightArm'; // Name the pivot group directly
    // Position pivot at shoulder height, slightly outside torso
    rightArmPivot.position.set(torsoWidth / 2 + limbRadius * 0.5, torsoYPos + torsoHeight / 2 - limbRadius, 0);
    const rightArmMesh = new THREE.Mesh(armGeom, skinMat); // Use skin material for arms
    rightArmMesh.position.y = -armLength / 2 + limbRadius; // Offset mesh down so pivot is near the top
    rightArmMesh.castShadow = true;
    rightArmPivot.add(rightArmMesh);
    group.add(rightArmPivot);


    // Set pivot point to the base (bottom of the feet)
    // The group's origin is already at 0,0,0 which corresponds to the ground level
    // because all parts are positioned relative to that (e.g., legs start at y=0 up to legHeight/2).

    return group;
}

function spawnPedestrians(count) {
    console.time("Spawn Pedestrians");
    const halfCity = citySize / 2;
    let spawned = 0;
    let attempts = 0;
    const maxAttempts = count * 50; // Limit attempts to prevent infinite loop

    while (spawned < count && attempts < maxAttempts) {
        attempts++;
        const px = (Math.random() - 0.5) * citySize * 0.95; // Spawn within city bounds
        const pz = (Math.random() - 0.5) * citySize * 0.95;
        const spawnPos = new THREE.Vector2(px, pz);

        // Check proximity to buildings
        let tooClose = false;
        for (const building of buildings) {
            const distSq = spawnPos.distanceToSquared(building.userData.centerXZ);
            const minSafeDist = building.userData.boundingRadiusXZ + pedestrianCheckRadius;
            if (distSq < minSafeDist * minSafeDist) {
                tooClose = true;
                break;
            }
        }

        if (!tooClose) {
            const pedestrianMesh = createPedestrianMesh();
            pedestrianMesh.position.set(px, 0, pz); // Start on the ground plane

            // Assign random velocity
            const angle = Math.random() * Math.PI * 2;
            const velocity = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(pedestrianSpeed * (0.8 + Math.random() * 0.4)); // Slight speed variation

            pedestrians.push({
                mesh: pedestrianMesh,
                velocity: velocity
            });
            scene.add(pedestrianMesh);
            spawned++;
        }
    }
    console.timeEnd("Spawn Pedestrians");
    if (spawned < count) {
        console.warn(`Could only spawn ${spawned} out of ${count} pedestrians.`);
    }
    activePedestrians = spawned;
}

function animatePedestrians(deltaTime) {
    const halfCity = citySize / 2;
    const boundary = halfCity * 1.05; // Slightly outside visual range
    const walkCycleFrequency = pedestrianSpeed * 5; // Adjust frequency based on speed
    const walkAmplitude = Math.PI / 4.5; // Swing angle for limbs
    const time = clock.elapsedTime;

    for (const p of pedestrians) {
        // --- Movement ---
        p.mesh.position.addScaledVector(p.velocity, deltaTime);

        // --- Boundary Check & Direction Change ---
        let changeDir = false;
        if (Math.abs(p.mesh.position.x) > boundary || Math.abs(p.mesh.position.z) > boundary) {
            // Simple teleport back inside if too far out (prevents getting stuck)
             p.mesh.position.x = THREE.MathUtils.clamp(p.mesh.position.x, -halfCity, halfCity);
             p.mesh.position.z = THREE.MathUtils.clamp(p.mesh.position.z, -halfCity, halfCity);
            changeDir = true;
        }

        // Random direction change occasionally
        if (Math.random() < 0.005) { // Low chance each frame
             changeDir = true;
        }

        if(changeDir) {
             const angle = Math.random() * Math.PI * 2;
             p.velocity.set(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(pedestrianSpeed * (0.8 + Math.random() * 0.4));
        }

        // --- Limb Animation ---
        const cycleTime = time * walkCycleFrequency;

        // Find limb pivot groups by name
        const leftLeg = p.mesh.getObjectByName('leftLeg');
        const rightLeg = p.mesh.getObjectByName('rightLeg');
        const leftArm = p.mesh.getObjectByName('leftArm');
        const rightArm = p.mesh.getObjectByName('rightArm');

        if (leftLeg) {
            leftLeg.rotation.x = walkAmplitude * Math.sin(cycleTime);
        }
        if (rightLeg) {
            rightLeg.rotation.x = walkAmplitude * Math.sin(cycleTime + Math.PI); // Opposite phase
        }
        if (leftArm) {
            leftArm.rotation.x = walkAmplitude * Math.sin(cycleTime + Math.PI); // Opposite phase to left leg
        }
        if (rightArm) {
            rightArm.rotation.x = walkAmplitude * Math.sin(cycleTime); // Opposite phase to right leg
        }


        // Make pedestrian face movement direction
        // Calculate the target point slightly ahead in the direction of velocity
        const lookTarget = p.mesh.position.clone().add(p.velocity);
        // Ensure the target point's Y coordinate is the same as the mesh's Y to prevent tilting
        lookTarget.y = p.mesh.position.y;
        // Only apply lookAt if velocity is significant to avoid issues with zero vector
        if (p.velocity.lengthSq() > 0.001) {
             p.mesh.lookAt(lookTarget);
        }
    }
}

function removePedestrian(index) {
    if (!pedestrians[index]) return;
    const p = pedestrians[index];
    scene.remove(p.mesh);
    // Dispose geometry and materials
    p.mesh.traverse(child => {
        if (child.isMesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
    pedestrians.splice(index, 1);
    activePedestrians--;
}
// === END NEW Pedestrian Functions ===

// --- Lógica de Simulação e Estado ---

// === NEW: Update Bomb Power ===
function updateBombPower() {
    const sliderValue = parseFloat(powerSlider.value);
    const sliderMin = parseFloat(powerSlider.min);
    const sliderMax = parseFloat(powerSlider.max);

    // Map slider value (e.g., 10-150) to power factor (e.g., 0.2-2.2)
    const normalizedValue = (sliderValue - sliderMin) / (sliderMax - sliderMin); // 0 to 1
    currentBombPowerFactor = minPowerFactor + normalizedValue * (maxPowerFactor - minPowerFactor);

    powerValueDisplay.textContent = `${Math.round(sliderValue)}%`; // Display original slider value

    // Optional: Provide visual feedback immediately, e.g., scale the target marker?
    // targetMarker.scale.set(currentBombPowerFactor, currentBombPowerFactor, 1);
}

function updateStatus(message) {
    statusDisplay.textContent = `Status: ${message}`;
    statusDisplay.style.color = '#FFCC00';
    if (message.includes("Ataque")) statusDisplay.style.color = '#FFA500';
    if (message.includes("IMPACTO")) statusDisplay.style.color = '#FF0000';
    if (message.includes("Pronto")) statusDisplay.style.color = '#00FF00'; // Green for ready
}

function launchAttack() {
    if (!isTargetSet) {
        updateStatus("ERRO: Defina um alvo primeiro!");
        return;
    }

    console.log("Lançando ataque em:", targetPosition, "com Power Factor:", currentBombPowerFactor.toFixed(2));
    updateStatus("Ataque lançado!");
    // launchButton.disabled = true; // Keep enabled to allow rapid fire
    isTargetSet = false;
    targetMarker.visible = false;

    const newBombMesh = createBombModel();
    newBombMesh.position.copy(targetPosition);
    newBombMesh.position.y = bombStartY;
    newBombMesh.rotation.set(Math.PI, 0, 0);
    newBombMesh.visible = true;
    scene.add(newBombMesh);

    const audioNodes = playFallingSound();

    activeBombs.push({
        mesh: newBombMesh,
        target: targetPosition.clone(),
        audioNodes: audioNodes,
        powerFactor: currentBombPowerFactor // === Store power factor for this specific bomb ===
    });

    updateStatus("Defina o próximo alvo...");
    launchButton.disabled = true; // Disable until new target is set
    canvas.classList.add('targeting');
}

function animateBombFall(deltaTime) {
    for (let i = activeBombs.length - 1; i >= 0; i--) {
        const bomb = activeBombs[i];
        bomb.mesh.position.y -= bombFallSpeed * deltaTime;

        if (bomb.mesh.position.y <= detonationHeight) {
            console.log("Detonation Height Reached");
            // === Pass the specific power factor for this bomb ===
            detonate(bomb.mesh.position.clone(), bomb.powerFactor);

            stopFallingSound(bomb.audioNodes);
            scene.remove(bomb.mesh);
             bomb.mesh.traverse(child => { // Dispose geometry/material
                 if (child.isMesh) {
                     child.geometry.dispose();
                     if (Array.isArray(child.material)) {
                         child.material.forEach(m => m.dispose());
                     } else {
                         child.material.dispose();
                     }
                 }
             });
            activeBombs.splice(i, 1);
        }
    }
}

// === MODIFIED: detonate now accepts powerFactor ===
function detonate(detonationPosition, powerFactor) {
    console.log("Detonate function called at", detonationPosition, "Power:", powerFactor.toFixed(2));
    updateStatus("IMPACTO!");

    // === Calculate effective parameters based on powerFactor ===
    const effectiveBlastRadius = baseBlastRadius * powerFactor;
    const effectiveBlastForce = baseBlastForce * powerFactor;
    const effectiveFireballMaxSize = baseFireballMaxSize * powerFactor;
    const effectiveShockwaveMaxSize = baseShockwaveMaxSize * powerFactor;
    const effectiveGroundScarSize = baseGroundScarSize * powerFactor;
    const effectiveSmokeColumnHeight = baseSmokeColumnHeight * powerFactor;
    // Smoke column width scaling - scale X and Z based on radius factor
    const effectiveSmokeColumnRadiusFactor = Math.sqrt(powerFactor); // Scale radius by sqrt(power) for area? Or just powerFactor? Let's try powerFactor.
    const effectiveSmokeSpread = baseSmokeSpread * powerFactor;
    const effectiveSmokeRiseSpeed = baseSmokeRiseSpeed * powerFactor;


    startCameraShake(powerFactor); // Scale shake intensity?
    triggerVisualFlash(powerFactor); // Scale flash intensity/duration?
    playExplosionSound(powerFactor); // Scale sound volume/intensity?

    // --- REPOSICIONA e REINICIA animação dos efeitos visuais compartilhados ---
    // Bola de Fogo
    fireballMesh.position.copy(detonationPosition);
    fireballMesh.scale.set(0.1, 0.1, 0.1);
    fireballMesh.visible = true;
    fireballMesh.userData.currentMaxSize = effectiveFireballMaxSize; // Set scaled size
    fireballTimer = 0;

    // Onda de Choque
    shockwaveMesh.position.copy(detonationPosition);
    shockwaveMesh.position.y = 0.1;
    shockwaveMesh.scale.set(0.1, 0.1, 1);
    shockwaveMesh.material.opacity = 0.6;
    shockwaveMesh.visible = true;
    shockwaveMesh.userData.currentMaxSize = effectiveShockwaveMaxSize; // Set scaled size
    shockwaveTimer = 0;

    // Marca no Chão
    groundScarMesh.position.copy(detonationPosition);
    groundScarMesh.position.y = 0.01;
    groundScarMesh.scale.set(effectiveGroundScarSize, effectiveGroundScarSize, 1); // Scale directly
    groundScarMesh.material.opacity = 0.75;
    groundScarMesh.visible = true;
    groundScarTimer = 0;

    // Coluna de Fumaça
    smokeColumnMesh.position.copy(detonationPosition);
    smokeColumnMesh.position.y = 0; // Start from ground
    smokeColumnMesh.scale.set(0.1 * effectiveSmokeColumnRadiusFactor, 0.1, 0.1 * effectiveSmokeColumnRadiusFactor); // Scale initial size
    smokeColumnMesh.material.opacity = 0.0;
    smokeColumnMesh.visible = true;
    smokeColumnMesh.userData.currentHeight = effectiveSmokeColumnHeight; // Store scaled height for animation
    smokeColumnMesh.userData.currentRadiusFactor = effectiveSmokeColumnRadiusFactor; // Store scale factor
    smokeColumnTimer = 0;

    // SPAWN NOVAS partículas de fumaça
    spawnSmokeParticles(detonationPosition, effectiveSmokeSpread, effectiveSmokeRiseSpeed);

    // --- Lógica de Destruição de Prédios (Use effective values) ---
    const buildingsToRemove = [];
    buildings.forEach(building => {
        const distance = building.position.distanceTo(detonationPosition);
        if (distance < effectiveBlastRadius) { // Use effective radius
            const damageFactor = Math.pow(1.0 - (distance / effectiveBlastRadius), 1.5);
            if (Math.random() < damageFactor * 1.8) {
                buildingsToRemove.push({ building, damageFactor });
            }
        }
    });
    buildingsToRemove.forEach(item => {
        // Pass effective force and radius to fracture function
        fractureBuilding(item.building, detonationPosition, item.damageFactor, effectiveBlastRadius, effectiveBlastForce);
    });
    buildings = buildings.filter(b => !buildingsToRemove.some(item => item.building === b));

    // === NEW: Remove Pedestrians in Blast Radius ===
    const detonationPosXZ = new THREE.Vector2(detonationPosition.x, detonationPosition.z);
    for (let i = pedestrians.length - 1; i >= 0; i--) {
        const p = pedestrians[i];
        const pPosXZ = new THREE.Vector2(p.mesh.position.x, p.mesh.position.z);
        const distSq = pPosXZ.distanceToSquared(detonationPosXZ);
        if (distSq < effectiveBlastRadius * effectiveBlastRadius) {
            removePedestrian(i);
        }
    }
}

// === MODIFIED: fractureBuilding accepts effective radius/force ===
function fractureBuilding(building, blastCenter, damageFactor, effectiveRadius, effectiveForce) {
    scene.remove(building);
    const buildingPos = building.position; const buildingData = building.userData;
    const fragmentMaterial = Array.isArray(building.material) ? building.material[0].clone() : building.material.clone(); // Clone material to avoid shared disposal issues if base material is reused
    fragmentMaterial.needsUpdate = true; // Flag for update

    for (let i = 0; i < fragmentCount; i++) {
        const fragWidth = buildingData.width / (Math.random() * 2.5 + 2); const fragHeight = buildingData.height / (Math.random() * 3.5 + 3); const fragDepth = buildingData.depth / (Math.random() * 2.5 + 2);
        const fragmentGeometry = new THREE.BoxGeometry(fragWidth, fragHeight, fragDepth); const fragment = new THREE.Mesh(fragmentGeometry, fragmentMaterial);
        fragment.position.set( buildingPos.x + (Math.random() - 0.5) * buildingData.width * 0.9, buildingPos.y + (Math.random() - 0.5) * buildingData.height * 0.9, buildingPos.z + (Math.random() - 0.5) * buildingData.depth * 0.9 );
        fragment.position.y = Math.max(fragment.position.y, fragHeight / 2 + 0.01); fragment.castShadow = true; fragment.receiveShadow = true;
        const direction = new THREE.Vector3().subVectors(fragment.position, blastCenter).normalize(); const distance = fragment.position.distanceTo(blastCenter);
        const forceFalloff = Math.max(0, 1 - (distance / effectiveRadius)); // Use effective radius
        const forceMagnitude = effectiveForce * forceFalloff * (0.6 + Math.random() * 0.8); // Use effective force
        const velocity = direction.multiplyScalar(forceMagnitude); velocity.y += Math.random() * effectiveForce * forceFalloff * 0.4; // Use effective force
        fragment.userData = { isFragment: true, velocity: velocity, angularVelocity: new THREE.Vector3((Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*15), height: fragHeight, creationTime: clock.elapsedTime };
        scene.add(fragment); fragments.push(fragment);
    }
    // Dispose original building geometry/materials AFTER creating fragments
    building.geometry.dispose();
    if (Array.isArray(building.material)) {
        // We cloned the material[0], so dispose the originals
        building.material.forEach(m => m.dispose());
    } else {
        building.material.dispose();
    }
}


// --- Animação dos Efeitos da Explosão (Use userData sizes) ---

function animateExplosionEffects(deltaTime) {
    // Anima Bola de Fogo
    if (fireballMesh.visible && fireballTimer < fireballDuration) {
        fireballTimer += deltaTime;
        const life = Math.min(1.0, fireballTimer / fireballDuration);
        const currentMaxSize = fireballMesh.userData.currentMaxSize || baseFireballMaxSize; // Use stored size
        const scale = 0.1 + life * life * currentMaxSize; // Use stored max size
        fireballMesh.scale.set(scale, scale, scale);
        fireballMesh.material.opacity = Math.max(0, 1.0 - life * 1.2);
        fireballMesh.material.color.setHSL(0.1 * (1.0 - life), 1.0, 0.5 + 0.4 * (1.0-life));
        if (life >= 1.0) fireballMesh.visible = false;
    }

    // Anima Onda de Choque
    if (shockwaveMesh.visible && shockwaveTimer < shockwaveDuration) {
        shockwaveTimer += deltaTime;
        const life = Math.min(1.0, shockwaveTimer / shockwaveDuration);
        const currentMaxSize = shockwaveMesh.userData.currentMaxSize || baseShockwaveMaxSize; // Use stored size
        const scale = life * currentMaxSize; // Use stored max size
        shockwaveMesh.scale.set(scale, scale, 1);
        shockwaveMesh.material.opacity = Math.max(0, 0.6 - life * 0.7);
        if (life >= 1.0) shockwaveMesh.visible = false;
    }

    // Anima Marca no Chão (Size set at creation, only fades)
     if (groundScarMesh.visible && groundScarTimer < groundScarDuration) {
         groundScarTimer += deltaTime;
         const life = Math.min(1.0, groundScarTimer / groundScarDuration);
         groundScarMesh.material.opacity = Math.max(0, 0.75 * (1.0 - life));
         if (life >= 1.0) groundScarMesh.visible = false;
     }

    // Anima Coluna de Fumaça (Use stored height/radius factor)
    if (smokeColumnMesh.visible && smokeColumnTimer < smokeColumnDuration) {
        smokeColumnTimer += deltaTime;
        const life = Math.min(1.0, smokeColumnTimer / smokeColumnDuration);
        const currentHeight = smokeColumnMesh.userData.currentHeight || baseSmokeColumnHeight;
        const currentRadiusFactor = smokeColumnMesh.userData.currentRadiusFactor || 1.0;
        const heightScale = Math.sin(Math.min(1.0, life * 1.1) * Math.PI / 2) * 1.2 + 0.1; // Animation curve for height
        const widthScale = (0.1 + life * 0.9) * currentRadiusFactor; // Scale width based on animation and power factor

        smokeColumnMesh.scale.set(widthScale, heightScale, widthScale);
        smokeColumnMesh.position.y = (heightScale * currentHeight) / 2; // Adjust position based on scaled height

        const fadeIn = Math.min(1.0, smokeColumnTimer * 1.5);
        const fadeOut = Math.max(0.0, 1.0 - life * 0.8);
        smokeColumnMesh.material.opacity = fadeIn * fadeOut * 0.7;
        smokeColumnMesh.rotation.y += deltaTime * 0.05;
        if (life >= 1.0) smokeColumnMesh.visible = false;
    }


    // Anima Partículas de Fumaça/Poeira (sem mudanças diretas aqui, spawn é escalado)
     if (smokeParticles.visible) {
         let stillActive = 0;
         let particlesNeedUpdate = false;
         for (let i = 0; i < smokeParticleCount; i++) {
             if (particleAttributes.ages[i] < smokeMaxAge) {
                 particlesNeedUpdate = true;
                 particleAttributes.ages[i] += deltaTime;
                 const ageRatio = particleAttributes.ages[i] / smokeMaxAge;
                 particleAttributes.positions[i * 3 + 0] += particleAttributes.velocities[i * 3 + 0] * deltaTime;
                 particleAttributes.positions[i * 3 + 1] += particleAttributes.velocities[i * 3 + 1] * deltaTime;
                 particleAttributes.positions[i * 3 + 2] += particleAttributes.velocities[i * 3 + 2] * deltaTime;
                 particleAttributes.velocities[i*3 + 0] *= (1.0 - deltaTime * 0.35);
                 particleAttributes.velocities[i*3 + 1] *= (1.0 - deltaTime * 0.15);
                 particleAttributes.velocities[i*3 + 2] *= (1.0 - deltaTime * 0.35);
                 particleAttributes.velocities[i*3 + 0] += (Math.random() - 0.5) * deltaTime * 6;
                 particleAttributes.velocities[i*3 + 2] += (Math.random() - 0.5) * deltaTime * 6;
                 particleAttributes.sizes[i] = 1.0 + Math.sin(ageRatio * Math.PI) * 3.5;
                 const fadeIn = Math.min(1.0, particleAttributes.ages[i] * 2.5);
                 const fadeOut = Math.max(0.0, 1.0 - ageRatio * 1.1);
                 particleAttributes.opacities[i] = fadeIn * fadeOut * 0.65;

                 if(particleAttributes.ages[i] < smokeMaxAge) {
                     stillActive++;
                 } else {
                      particleAttributes.opacities[i] = 0;
                      particleAttributes.positions[i*3+1] = -1000;
                 }
             }
         }
         if (particlesNeedUpdate) {
             smokeGeometry.attributes.position.needsUpdate = true;
             smokeGeometry.attributes.velocity.needsUpdate = true;
             smokeGeometry.attributes.age.needsUpdate = true;
             smokeGeometry.attributes.particleSize.needsUpdate = true;
             smokeGeometry.attributes.particleOpacity.needsUpdate = true;
         }
         activeSmokeParticles = stillActive;
         // Update performance info
         performanceInfo.textContent = `Partículas: ${activeSmokeParticles} | Pedestres: ${activePedestrians}`;
     }
}

// === MODIFIED: spawnSmokeParticles accepts effective spread/speed ===
function spawnSmokeParticles(origin, effectiveSpread, effectiveRiseSpeed) {
     let spawnedCount = 0;
     for(let i = 0; i < smokeParticleCount && spawnedCount < smokeParticleCount / 2; i++) {
         if (particleAttributes.ages[i] >= smokeMaxAge) {
             const theta = Math.random() * Math.PI * 2; const phi = Math.acos((Math.random() * 2) - 1); const radius = Math.random() * effectiveSpread * 0.35; // Use effective spread
             particleAttributes.positions[i*3 + 0] = origin.x + radius * Math.sin(phi) * Math.cos(theta);
             particleAttributes.positions[i*3 + 1] = origin.y + radius * Math.cos(phi) * 0.6;
             particleAttributes.positions[i*3 + 2] = origin.z + radius * Math.sin(phi) * Math.sin(theta);
             const speed = (0.6 + Math.random() * 0.4) * effectiveRiseSpeed; // Use effective speed
             const upFactor = 0.75 + Math.random() * 0.5; const outFactor = 1.0 - upFactor * 0.7;
             particleAttributes.velocities[i*3 + 0] = Math.sin(phi) * Math.cos(theta) * speed * outFactor;
             particleAttributes.velocities[i*3 + 1] = Math.cos(phi) * speed * upFactor + Math.random() * 0.25 * speed;
             particleAttributes.velocities[i*3 + 2] = Math.sin(phi) * Math.sin(theta) * speed * outFactor;
             particleAttributes.ages[i] = 0.0;
             particleAttributes.sizes[i] = 1.0 + Math.random() * 0.5;
             particleAttributes.opacities[i] = 0.0;
             spawnedCount++;
         }
     }
     console.log(`Spawned ${spawnedCount} new particles (Spread: ${effectiveSpread.toFixed(1)}, Speed: ${effectiveRiseSpeed.toFixed(1)})`);
     smokeGeometry.attributes.position.needsUpdate = true;
     smokeGeometry.attributes.velocity.needsUpdate = true;
     smokeGeometry.attributes.age.needsUpdate = true;
     smokeGeometry.attributes.particleSize.needsUpdate = true;
     smokeGeometry.attributes.particleOpacity.needsUpdate = true;
}

function resetExplosionEffects() { // Sem mudanças
    fireballMesh.visible = false; fireballTimer = Infinity;
    shockwaveMesh.visible = false; shockwaveTimer = Infinity;
    groundScarMesh.visible = false; groundScarTimer = Infinity;
    smokeColumnMesh.visible = false; smokeColumnTimer = Infinity;
    if(scene.userData.directionalLight) scene.userData.directionalLight.intensity = 0.75;
    if(scene.userData.ambientLight) scene.userData.ambientLight.intensity = 0.45;
}

// --- Camera Shake ---
function startCameraShake(powerFactor = 1.0) { // Optional power scaling
    isShaking = true;
    shakeIntensity = maxShakeIntensity * Math.min(1.5, powerFactor); // Scale intensity, cap it
    shakeTimer = 0;
}

function applyCameraShake(deltaTime) { // Sem mudanças
    if (!isShaking) return;
    shakeTimer += deltaTime;
    if (shakeTimer >= shakeDuration) { isShaking = false; return; }
    const currentIntensity = shakeIntensity * (1.0 - shakeTimer / shakeDuration);
    const offsetX = (Math.random() - 0.5) * 2 * currentIntensity;
    const offsetY = (Math.random() - 0.5) * 2 * currentIntensity;
    const offsetZ = (Math.random() - 0.5) * 2 * currentIntensity;
    camera.position.x += offsetX; camera.position.y += offsetY; camera.position.z += offsetZ;
}


// --- Simulação Física dos Fragmentos ---
function animateFragments(deltaTime) { // Sem mudanças
    const fragmentsToRemoveIndexes = [];
    fragments.forEach((fragment, index) => {
        fragment.userData.velocity.y -= gravity * deltaTime * 1.5;
        fragment.position.addScaledVector(fragment.userData.velocity, deltaTime);
        fragment.rotation.x += fragment.userData.angularVelocity.x * deltaTime; fragment.rotation.y += fragment.userData.angularVelocity.y * deltaTime; fragment.rotation.z += fragment.userData.angularVelocity.z * deltaTime;
        const groundLevel = fragment.userData.height / 2;
        if (fragment.position.y < groundLevel) {
            fragment.position.y = groundLevel; fragment.userData.velocity.y *= -0.3; fragment.userData.velocity.x *= 0.8; fragment.userData.velocity.z *= 0.8; fragment.userData.angularVelocity.multiplyScalar(0.7);
            if (fragment.userData.velocity.lengthSq() < 0.1) { fragment.userData.velocity.set(0, 0, 0); fragment.userData.angularVelocity.set(0, 0, 0); if (!fragment.userData.restTime) fragment.userData.restTime = clock.elapsedTime; if (clock.elapsedTime - fragment.userData.restTime > 8 + Math.random()*5) { if (!fragmentsToRemoveIndexes.includes(index)) fragmentsToRemoveIndexes.push(index); } }
        }
        const timeAlive = clock.elapsedTime - fragment.userData.creationTime; if (timeAlive > 20 || fragment.position.y < -20 || Math.abs(fragment.position.x) > citySize * 1.2 || Math.abs(fragment.position.z) > citySize * 1.2) { if (!fragmentsToRemoveIndexes.includes(index)) fragmentsToRemoveIndexes.push(index); }
    });
    fragmentsToRemoveIndexes.sort((a, b) => b - a);
    fragmentsToRemoveIndexes.forEach(indexToRemove => {
         if (fragments[indexToRemove]) {
             const frag = fragments[indexToRemove];
             scene.remove(frag);
             frag.geometry.dispose();
             // Only dispose material if it's the cloned one (check instance?)
             // Or assume all fragment materials are clones now
             if (frag.material && typeof frag.material.dispose === 'function') {
                 frag.material.dispose();
             }
             fragments.splice(indexToRemove, 1);
         }
     });
}


// --- UI, Eventos ---
function updateUI() {
    launchButton.disabled = !isTargetSet;
}

function triggerVisualFlash(powerFactor = 1.0) { // Optional power scaling
    explosionOverlay.classList.add('active');
    const light = scene.userData.directionalLight; const ambient = scene.userData.ambientLight;
    if (!light.userData.originalIntensity) light.userData.originalIntensity = light.intensity;
    if (!ambient.userData.originalIntensity) ambient.userData.originalIntensity = ambient.intensity;
    if(light.userData.tween) TWEEN.remove(light.userData.tween);
    if(ambient.userData.tween) TWEEN.remove(ambient.userData.tween);

    // Scale flash intensity
    light.intensity = 6.0 * Math.min(2.0, powerFactor * 1.2); // Brighter flash for more power, capped
    ambient.intensity = 1.2 * Math.min(1.5, powerFactor);

    setTimeout(() => {
        explosionOverlay.classList.remove('active');
        if (window.TWEEN) {
             light.userData.tween = new TWEEN.Tween(light)
                .to({ intensity: light.userData.originalIntensity || 0.75 }, 2000) // Return to original
                .easing(TWEEN.Easing.Quadratic.Out)
                .onComplete(() => light.userData.tween = null)
                .start();
             ambient.userData.tween = new TWEEN.Tween(ambient)
                .to({ intensity: ambient.userData.originalIntensity || 0.45 }, 2000)
                .easing(TWEEN.Easing.Quadratic.Out)
                .onComplete(() => ambient.userData.tween = null)
                .start();
        } else {
            light.intensity = light.userData.originalIntensity || 0.75;
            ambient.intensity = ambient.userData.originalIntensity || 0.45;
        }
    }, 130);
}

function onWindowResize() { // Sem mudanças
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onCanvasClick(event) { // Sem mudanças
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([groundMesh]);
    if (intersects.length > 0) {
        targetPosition.copy(intersects[0].point);
        targetMarker.position.copy(targetPosition);
        targetMarker.position.y = 0.05;
        targetMarker.visible = true;
        isTargetSet = true;
        updateStatus("Alvo definido! Pronto para lançar.");
        updateUI();
        canvas.classList.remove('targeting'); // Remove targeting cursor once set
    }
}

// --- Áudio ---

function initAudio() { // Sem mudanças
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        explosionGain = audioContext.createGain();
        explosionGain.gain.value = 0.75; // Base gain
        explosionGain.connect(audioContext.destination);
    } catch (e) { console.error("Web Audio API não suportada.", e); }
}

function playFallingSound() { // Sem mudanças
    if (!audioContext) return null;
    const now = audioContext.currentTime;
    let osc = audioContext.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1300, now); osc.frequency.exponentialRampToValueAtTime(250, now + 3.5);
    let filter = audioContext.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(1600, now); filter.frequency.linearRampToValueAtTime(400, now + 3.5); filter.Q.setValueAtTime(18, now);
    let noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 4, audioContext.sampleRate); let output = noiseBuffer.getChannelData(0); for (let i = 0; i < noiseBuffer.length; i++) output[i] = (Math.random() * 2 - 1) * 0.18;
    let noiseSource = audioContext.createBufferSource(); noiseSource.buffer = noiseBuffer; noiseSource.loop = true;
    let gain = audioContext.createGain(); gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.35, now + 0.6);
    osc.connect(filter); filter.connect(gain); noiseSource.connect(gain); gain.connect(audioContext.destination);
    osc.start(now); noiseSource.start(now);
    return { osc: osc, noise: noiseSource, gain: gain };
}

function stopFallingSound(audioNodes) { // Sem mudanças
    if (!audioContext || !audioNodes) return;
    const now = audioContext.currentTime;
    try { audioNodes.gain.gain.setTargetAtTime(0, now, 0.04); } catch(e){}
    try { audioNodes.osc.stop(now + 0.1); } catch(e) {}
    try { audioNodes.noise.stop(now + 0.1); } catch(e) {}
}

// === MODIFIED: playExplosionSound optionally accepts powerFactor ===
function playExplosionSound(powerFactor = 1.0) {
    if (!audioContext || !explosionGain) return;
    const now = audioContext.currentTime;
    const duration = 4.5;
    const volumeScale = Math.min(1.5, powerFactor * 0.8 + 0.4); // Scale volume, min 0.4, max 1.5

    // Disconnect previous gain node if re-creating? No, reuse explosionGain. Just scale sub-gains.
    const scaledMasterGain = Math.min(1.0, 0.75 * volumeScale); // Cap overall gain to prevent clipping
    explosionGain.gain.setValueAtTime(scaledMasterGain, now);

    // --- Create temporary gain nodes for scaling individual layers ---
    const tempGainNode = audioContext.createGain();
    tempGainNode.connect(explosionGain);

    // Camada 1: Impacto
    const impactNoise = audioContext.createBufferSource(); const iBufSize = audioContext.sampleRate * 0.15; const iBuffer = audioContext.createBuffer(1, iBufSize, audioContext.sampleRate); const iOut = iBuffer.getChannelData(0); for (let i = 0; i < iBufSize; i++) iOut[i] = Math.random() * 2 - 1; impactNoise.buffer = iBuffer;
    const impactFilter = audioContext.createBiquadFilter(); impactFilter.type = 'lowpass'; impactFilter.frequency.value = 1500; impactFilter.Q.value = 2;
    const impactGain = audioContext.createGain();
    impactGain.gain.setValueAtTime(1.2 * volumeScale, now); // Scale gain
    impactGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    impactNoise.connect(impactFilter); impactFilter.connect(impactGain); impactGain.connect(tempGainNode); // Connect to temp gain
    impactNoise.start(now); impactNoise.onended = () => { impactGain.disconnect(); } // Clean up gain node

    // Camada 2: Corpo + Sub
    const bodyNoise = audioContext.createBufferSource(); const bBufSize = audioContext.sampleRate * (duration * 0.8); const bBuffer = audioContext.createBuffer(1, bBufSize, audioContext.sampleRate); const bOut = bBuffer.getChannelData(0); for (let i = 0; i < bBufSize; i++) bOut[i] = Math.random() * 2 - 1; bodyNoise.buffer = bBuffer;
    const bodyFilter = audioContext.createBiquadFilter(); bodyFilter.type = 'lowpass'; bodyFilter.frequency.setValueAtTime(800, now + 0.05); bodyFilter.frequency.exponentialRampToValueAtTime(60, now + duration * 0.7); bodyFilter.Q.value = 4;
    const bodyGain = audioContext.createGain();
    bodyGain.gain.setValueAtTime(0, now);
    bodyGain.gain.linearRampToValueAtTime(0.9 * volumeScale, now + 0.1); // Scale gain
    bodyGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.8);
    bodyNoise.connect(bodyFilter); bodyFilter.connect(bodyGain); bodyGain.connect(tempGainNode); // Connect to temp gain
    bodyNoise.start(now + 0.02); bodyNoise.onended = () => { bodyGain.disconnect(); } // Clean up

    const subOsc = audioContext.createOscillator(); subOsc.type = 'sine'; subOsc.frequency.setValueAtTime(50, now); subOsc.frequency.exponentialRampToValueAtTime(25, now + duration * 0.6);
    const subGain = audioContext.createGain();
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(1.0 * volumeScale, now + 0.05); // Scale gain
    subGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.7);
    subOsc.connect(subGain); subGain.connect(tempGainNode); // Connect to temp gain
    subOsc.start(now); subOsc.stop(now + duration * 0.8); subOsc.onended = () => { subGain.disconnect(); } // Clean up

    // Camada 3: Rumble
    const rumbleLfo = audioContext.createOscillator(); rumbleLfo.type = 'sine'; rumbleLfo.frequency.value = 5 + Math.random() * 3;
    const rumbleDepth = audioContext.createGain(); rumbleDepth.gain.value = 0.3;
    const rumbleNoise = audioContext.createBufferSource(); rumbleNoise.buffer = bBuffer; // Reusa bBuffer
    const rumbleFilter = audioContext.createBiquadFilter(); rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.value = 100; rumbleFilter.Q.value = 1;
    const rumbleGain = audioContext.createGain();
    rumbleGain.gain.setValueAtTime(0.5 * volumeScale, now + 0.2); // Scale gain
    rumbleGain.gain.linearRampToValueAtTime(0.8 * volumeScale, now + 1.0); // Scale gain
    rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    rumbleLfo.connect(rumbleDepth); rumbleDepth.connect(rumbleGain.gain);
    rumbleNoise.connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(tempGainNode); // Connect to temp gain
    rumbleLfo.start(now + 0.2); rumbleLfo.stop(now + duration);
    rumbleNoise.start(now + 0.2); rumbleNoise.onended = () => { rumbleGain.disconnect(); rumbleLfo.disconnect(); rumbleDepth.disconnect(); } // Clean up

    // Camada 4: Crackle
    for (let i = 0; i < 8; i++) { const delay = 0.2 + Math.random() * 1.5; const crackleDur = 0.1 + Math.random() * 0.4; const cNoise = audioContext.createBufferSource(); const cBufSize = audioContext.sampleRate * crackleDur; const cBuffer = audioContext.createBuffer(1, cBufSize, audioContext.sampleRate); const cOut = cBuffer.getChannelData(0); for (let j = 0; j < cBufSize; j++) cOut[j] = (Math.random() * 2 - 1) * Math.pow(Math.random(), 3); cNoise.buffer = cBuffer; const cFilter = audioContext.createBiquadFilter(); cFilter.type = 'highpass'; cFilter.frequency.value = 1500 + Math.random()*1000; cFilter.Q.value = 0.5; const cGain = audioContext.createGain();
    cGain.gain.setValueAtTime(0, now + delay);
    cGain.gain.linearRampToValueAtTime((0.15 + Math.random() * 0.1) * volumeScale, now + delay + 0.02); // Scale gain
    cGain.gain.exponentialRampToValueAtTime(0.01, now + delay + crackleDur);
    cNoise.connect(cFilter); cFilter.connect(cGain); cGain.connect(tempGainNode); // Connect to temp gain
    cNoise.start(now + delay); cNoise.onended = () => { cGain.disconnect(); } // Clean up
    }

     // Disconnect the temporary gain node after the explosion sound duration
     setTimeout(() => {
         tempGainNode.disconnect();
         console.log("Disconnected temp explosion gain node.");
         // Optional: Reset master gain to base value if needed, though next explosion will set it again
         // explosionGain.gain.setTargetAtTime(0.75, audioContext.currentTime, 0.1);
     }, duration * 1000 + 500); // Delay slightly longer than duration
}


// --- Loop de Animação Principal ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = Math.min(0.05, clock.getDelta());

    controls.update();
    if(window.TWEEN) TWEEN.update();

    // Apply shake before camera update from controls? Or after? After seems better.
    applyCameraShake(deltaTime);

    animateBombFall(deltaTime);
    animateExplosionEffects(deltaTime);
    animateFragments(deltaTime);
    animatePedestrians(deltaTime); // === NEW: Animate pedestrians ===

    renderer.render(scene, camera);
}

// --- Iniciar ---
init();

// --- END OF FILE script.js ---