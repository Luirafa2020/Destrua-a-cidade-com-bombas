// --- Configurações Iniciais e Globais ---
const canvas = document.getElementById('city-canvas');
const statusDisplay = document.getElementById('status-display');
const launchButton = document.getElementById('launch-button');
const explosionOverlay = document.getElementById('explosion-overlay');
const performanceInfo = document.getElementById('performance-info');

let scene, camera, renderer, controls, clock, raycaster, mouse;
let buildings = [];
let fragments = [];
let groundMesh = null;
let targetMarker = null; // Marcador visual do alvo
let activeBombs = []; // Array para gerenciar bombas caindo {mesh, target, audioNodes}

// Estado (Simplificado)
let targetPosition = new THREE.Vector3();
let isTargetSet = false;

// Parâmetros da Explosão e Efeitos
const citySize = 100;
const buildingMaxHeight = 15;
const buildingSpacing = 2.5;
const roadWidth = 1.5;
const fragmentCount = 12;
const gravity = 9.8;
const blastRadius = 38;
const blastForce = 85;
const bombFallSpeed = 90;
const bombStartY = 160;
const detonationHeight = 0; // Impacto no solo

// Efeitos Visuais da Explosão (Meshes compartilhados/reutilizados)
let fireballMesh = null;
const fireballMaxSize = blastRadius * 0.6;
const fireballDuration = 0.8;
let fireballTimer = Infinity; // Inicia "morto"

let shockwaveMesh = null;
const shockwaveMaxSize = blastRadius * 1.5;
const shockwaveDuration = 1.2;
const shockwaveThickness = 1.5;
let shockwaveTimer = Infinity;

let groundScarMesh = null;
const groundScarSize = blastRadius * 0.8;
const groundScarDuration = 30;
let groundScarTimer = Infinity;

let smokeColumnMesh = null;
let smokeColumnMaterial = null;
const smokeColumnHeight = blastRadius * 3.5;
const smokeColumnTopRadius = blastRadius * 1.2;
const smokeColumnDuration = 15;
let smokeColumnTimer = Infinity;


// Sistema de Partículas (Fumaça/Poeira - Partículas persistem entre explosões)
let smokeParticles = null;
let smokeGeometry = null;
let smokeMaterial = null;
const smokeParticleCount = 7000; // Aumentado um pouco mais (AJUSTE!)
const smokeMaxAge = 8; // Vida um pouco mais longa
const smokeSpread = blastRadius * 0.8;
const smokeRiseSpeed = blastRadius * 0.9;
let particleAttributes = {
    positions: null, velocities: null, ages: null, sizes: null, opacities: null
};
let activeSmokeParticles = 0; // Contador para UI

// Camera Shake
let isShaking = false;
let shakeIntensity = 0;
const maxShakeIntensity = 0.25;
const shakeDuration = 0.7;
let shakeTimer = 0;


// Áudio
let audioContext;
let explosionGain;
// fallingSound não é mais global

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

    // 2. Iluminação
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

    // 3. Controles
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = 10;
    controls.maxDistance = citySize * 1.5;

    // 4. Criar a Cidade e Efeitos
    createGround();
    generateCityWithProceduralTextures();
    createTargetMarker();
    // createBombModel(); // Modelo será criado sob demanda agora
    setupExplosionEffects();
    initAudio();

    // 5. Event Listeners
    window.addEventListener('resize', onWindowResize);
    canvas.addEventListener('click', onCanvasClick);
    launchButton.addEventListener('click', launchAttack);

    // 6. Iniciar Simulação
    updateStatus("Defina o Alvo"); // Estado inicial
    canvas.classList.add('targeting');
    launchButton.disabled = true; // Começa desabilitado
    animate();
}

// --- Funções de Criação ---

function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(citySize * 1.5, citySize * 1.5);
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

function createBuildingTexture(widthPx = 256, heightPx = 512) {
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

function generateCityWithProceduralTextures() {
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
            buildingMesh.userData = { isBuilding: true, width: buildingWidth, height: buildingHeight, depth: buildingDepth };
            scene.add(buildingMesh); buildings.push(buildingMesh);
        }
    }
    console.timeEnd("Generate Buildings");
}

function createTargetMarker() {
    const markerGeometry = new THREE.RingGeometry(0.8, 1.0, 32);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
    targetMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    targetMarker.rotation.x = -Math.PI / 2; targetMarker.position.y = 0.01;
    targetMarker.visible = false;
    scene.add(targetMarker);
}

function createBombModel() { // Retorna um NOVO modelo de bomba
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
    return group; // Retorna o grupo criado
}

function setupExplosionEffects() {
    // Bola de Fogo (Mesh compartilhado)
    const fireballGeometry = new THREE.SphereGeometry(1, 32, 32);
    const fireballMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFAA, transparent: true, opacity: 0.95, fog: false });
    fireballMesh = new THREE.Mesh(fireballGeometry, fireballMaterial); fireballMesh.visible = false; scene.add(fireballMesh);

    // Onda de Choque (Mesh compartilhado)
    const shockwaveGeometry = new THREE.RingGeometry(1, 1 + shockwaveThickness, 64);
    const shockwaveMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, transparent: true, opacity: 0.4, fog: false });
    shockwaveMesh = new THREE.Mesh(shockwaveGeometry, shockwaveMaterial); shockwaveMesh.rotation.x = -Math.PI / 2; shockwaveMesh.position.y = 0.1; shockwaveMesh.visible = false; scene.add(shockwaveMesh);

    // Marca no Chão (Mesh compartilhado)
    const groundScarGeometry = new THREE.CircleGeometry(1, 64);
    const groundScarMaterial = new THREE.MeshBasicMaterial({ color: 0x1A1A1A, transparent: true, opacity: 0.75 });
    groundScarMesh = new THREE.Mesh(groundScarGeometry, groundScarMaterial); groundScarMesh.rotation.x = -Math.PI / 2; groundScarMesh.position.y = 0.0; groundScarMesh.visible = false; scene.add(groundScarMesh);

    // Coluna de Fumaça Principal (Mesh compartilhado)
    const smokeColumnGeom = new THREE.CylinderGeometry(smokeColumnTopRadius, blastRadius * 0.5, smokeColumnHeight, 32, 64, true);
    const posAttr = smokeColumnGeom.attributes.position; const vertex = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++){ vertex.fromBufferAttribute(posAttr, i); const yRatio = (vertex.y + smokeColumnHeight / 2) / smokeColumnHeight; const noiseFactor = 1.0 + (Math.random() - 0.5) * 0.5 * yRatio; const radialNoise = (Math.random() - 0.5) * 0.2 * yRatio; vertex.x *= noiseFactor + radialNoise; vertex.z *= noiseFactor + radialNoise; if(yRatio < 0.1) { vertex.x *= yRatio * 10; vertex.z *= yRatio * 10; } posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z); }
    smokeColumnGeom.computeVertexNormals();
    const smokeColumnCanvas = document.createElement('canvas'); smokeColumnCanvas.width = 128; smokeColumnCanvas.height = 512; const ctxCol = smokeColumnCanvas.getContext('2d'); const gradCol = ctxCol.createLinearGradient(0, 0, 0, 512); gradCol.addColorStop(0, 'rgba(90, 80, 70, 0.0)'); gradCol.addColorStop(0.2, 'rgba(100, 90, 80, 0.6)'); gradCol.addColorStop(0.8, 'rgba(130, 120, 110, 0.7)'); gradCol.addColorStop(1, 'rgba(150, 140, 130, 0.3)'); ctxCol.fillStyle = gradCol; ctxCol.fillRect(0, 0, 128, 512);
    for(let i=0; i<50; i++) { const x = Math.random()*128; const y = Math.random()*512; const r = Math.random()*30 + 10; const alpha = Math.random()*0.1 + 0.05; const gray = Math.random()*50 + 100; const gradBlob = ctxCol.createRadialGradient(x,y,0, x,y,r); gradBlob.addColorStop(0, `rgba(${gray},${gray-10},${gray-20}, ${alpha})`); gradBlob.addColorStop(1, `rgba(${gray},${gray-10},${gray-20}, 0)`); ctxCol.fillStyle = gradBlob; ctxCol.fillRect(x-r, y-r, r*2, r*2); }
    const smokeColumnTexture = new THREE.CanvasTexture(smokeColumnCanvas); smokeColumnTexture.wrapS = THREE.RepeatWrapping; smokeColumnTexture.wrapT = THREE.ClampToEdgeWrapping;
    smokeColumnMaterial = new THREE.MeshStandardMaterial({ map: smokeColumnTexture, alphaMap: smokeColumnTexture, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending, roughness: 0.9, metalness: 0.0 });
    smokeColumnMesh = new THREE.Mesh(smokeColumnGeom, smokeColumnMaterial); smokeColumnMesh.position.y = smokeColumnHeight / 2; smokeColumnMesh.visible = false; scene.add(smokeColumnMesh);

    // Partículas de Fumaça/Poeira (Sistema Único, partículas persistem)
    smokeGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(smokeParticleCount * 3); const velocities = new Float32Array(smokeParticleCount * 3);
    const ages = new Float32Array(smokeParticleCount); const sizes = new Float32Array(smokeParticleCount); const opacities = new Float32Array(smokeParticleCount);
    for (let i = 0; i < smokeParticleCount; i++) { positions[i * 3 + 1] = -1000; ages[i] = smokeMaxAge; }
    smokeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); smokeGeometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    smokeGeometry.setAttribute('age', new THREE.BufferAttribute(ages, 1)); smokeGeometry.setAttribute('particleSize', new THREE.BufferAttribute(sizes, 1));
    smokeGeometry.setAttribute('particleOpacity', new THREE.BufferAttribute(opacities, 1));
    const smokeCanvas = document.createElement('canvas'); smokeCanvas.width = 64; smokeCanvas.height = 64; const ctx = smokeCanvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); gradient.addColorStop(0, 'rgba(180, 160, 140, 0.6)'); gradient.addColorStop(0.5, 'rgba(150, 130, 110, 0.3)'); gradient.addColorStop(1, 'rgba(120, 100, 80, 0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); const smokeTexture = new THREE.CanvasTexture(smokeCanvas);
    smokeMaterial = new THREE.PointsMaterial({ map: smokeTexture, size: 6.0, color: 0xAAAAAA, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.NormalBlending, sizeAttenuation: true });
    smokeMaterial.onBeforeCompile = shader => {
        shader.vertexShader = ` attribute float particleSize; attribute float particleOpacity; varying float vOpacity; ${shader.vertexShader} `.replace(`#include <begin_vertex>`, `#include <begin_vertex> \n transformed *= particleSize; \n vOpacity = particleOpacity;`);
        shader.fragmentShader = ` varying float vOpacity; ${shader.fragmentShader} `.replace(`vec4 diffuseColor = vec4( diffuse, opacity );`, `vec4 diffuseColor = vec4( diffuse, opacity * vOpacity );`);
    };
    smokeParticles = new THREE.Points(smokeGeometry, smokeMaterial); smokeParticles.visible = true; // Partículas sempre visíveis, mas podem estar inativas
    scene.add(smokeParticles);
    particleAttributes = { positions, velocities, ages, sizes, opacities };
}


// --- Lógica de Simulação e Estado ---

function updateStatus(message) {
    statusDisplay.textContent = `Status: ${message}`;
    statusDisplay.style.color = '#FFCC00'; // Amarelo padrão
    if (message.includes("Ataque")) statusDisplay.style.color = '#FFA500'; // Laranja
    if (message.includes("IMPACTO")) statusDisplay.style.color = '#FF0000'; // Vermelho
}

function launchAttack() {
    if (!isTargetSet) {
        updateStatus("ERRO: Defina um alvo primeiro!");
        return;
    }

    console.log("Lançando ataque em:", targetPosition);
    updateStatus("Ataque lançado!"); // Mensagem imediata
    launchButton.disabled = true; // Desabilita temporariamente para evitar spam? Ou não?
    isTargetSet = false; // Reseta flag do alvo para o próximo clique
    targetMarker.visible = false; // Esconde marcador atual

    const newBombMesh = createBombModel(); // Cria um NOVO mesh de bomba
    newBombMesh.position.copy(targetPosition);
    newBombMesh.position.y = bombStartY;
    newBombMesh.rotation.set(Math.PI, 0, 0); // Aponta para baixo
    newBombMesh.visible = true;
    scene.add(newBombMesh);

    const audioNodes = playFallingSound(); // Toca e OBTÉM os nós de áudio

    // Adiciona a nova bomba ao array de bombas ativas
    activeBombs.push({
        mesh: newBombMesh,
        target: targetPosition.clone(), // Guarda o alvo específico desta bomba
        audioNodes: audioNodes           // Guarda os nós de áudio para parar depois
    });

    // Habilita o botão novamente se quisermos permitir lançamentos rápidos
    // launchButton.disabled = false; // Ou mantenha desabilitado até definir novo alvo
    // updateStatus("Defina o próximo alvo ou aguarde impacto");
}

function animateBombFall(deltaTime) {
    // Itera pelo array de bombas ativas DE TRÁS PARA FRENTE (seguro para remover elementos)
    for (let i = activeBombs.length - 1; i >= 0; i--) {
        const bomb = activeBombs[i];

        // Move a bomba para baixo
        bomb.mesh.position.y -= bombFallSpeed * deltaTime;

        // Verifica se atingiu a altura de detonação
        if (bomb.mesh.position.y <= detonationHeight) {
            console.log("Detonation Height Reached for a bomb");
            detonate(bomb.mesh.position.clone()); // Passa uma CLONE da posição final

            // Para o som de queda ESPECÍFICO desta bomba
            stopFallingSound(bomb.audioNodes);

            // Remove o mesh da bomba da cena
            scene.remove(bomb.mesh);
            // TODO: Dispor geometria/materiais da bomba se não forem reutilizados?
            // (Neste caso, criamos novo a cada vez, então sim)
             bomb.mesh.traverse(child => {
                 if (child.isMesh) {
                     child.geometry.dispose();
                     // Se o material não for compartilhado globalmente, dispor também
                     if (Array.isArray(child.material)) {
                         child.material.forEach(m => m.dispose());
                     } else {
                         child.material.dispose();
                     }
                 }
             });


            // Remove a bomba do array de bombas ativas
            activeBombs.splice(i, 1);
        }
    }
}

function detonate(detonationPosition) {
    // Não há mais estado 'exploding' global, apenas inicia os efeitos
    console.log("Detonate function called at", detonationPosition);
    updateStatus("IMPACTO!"); // Atualiza status geral

    const bombPos = detonationPosition; // Posição da detonação atual

    startCameraShake();
    triggerVisualFlash(bombPos);
    playExplosionSound(); // Toca som da explosão (pode sobrepor)

    // --- REPOSICIONA e REINICIA animação dos efeitos visuais compartilhados ---
    // Bola de Fogo
    fireballMesh.position.copy(bombPos);
    fireballMesh.scale.set(0.1, 0.1, 0.1);
    fireballMesh.visible = true;
    fireballTimer = 0; // Reinicia timer

    // Onda de Choque
    shockwaveMesh.position.copy(bombPos);
    shockwaveMesh.position.y = 0.1;
    shockwaveMesh.scale.set(0.1, 0.1, 1);
    shockwaveMesh.material.opacity = 0.6;
    shockwaveMesh.visible = true;
    shockwaveTimer = 0; // Reinicia timer

    // Marca no Chão
    groundScarMesh.position.copy(bombPos);
    groundScarMesh.position.y = 0.01;
    groundScarMesh.scale.set(groundScarSize, groundScarSize, 1);
    groundScarMesh.material.opacity = 0.75;
    groundScarMesh.visible = true;
    groundScarTimer = 0; // Reinicia timer

    // Coluna de Fumaça
    smokeColumnMesh.position.copy(bombPos);
    smokeColumnMesh.position.y = 0;
    smokeColumnMesh.scale.set(0.1, 0.1, 0.1);
    smokeColumnMesh.material.opacity = 0.0;
    smokeColumnMesh.visible = true;
    smokeColumnTimer = 0; // Reinicia timer

    // SPAWN NOVAS partículas de fumaça a partir desta posição
    spawnSmokeParticles(bombPos);
    // smokeParticles já está visível

    // --- Lógica de Destruição de Prédios (igual, mas usa bombPos local) ---
    const buildingsToRemove = [];
    buildings.forEach(building => {
        const distance = building.position.distanceTo(bombPos);
        if (distance < blastRadius) {
            const damageFactor = Math.pow(1.0 - (distance / blastRadius), 1.5);
            if (Math.random() < damageFactor * 1.8) {
                buildingsToRemove.push({ building, damageFactor });
            }
        }
    });
    buildingsToRemove.forEach(item => {
        fractureBuilding(item.building, bombPos, item.damageFactor);
    });
    buildings = buildings.filter(b => !buildingsToRemove.some(item => item.building === b));

    // Não há mais agendamento de 'cleanup' global
}

function fractureBuilding(building, blastCenter, damageFactor) {
    scene.remove(building);
    const buildingPos = building.position; const buildingData = building.userData;
    const fragmentMaterial = Array.isArray(building.material) ? building.material[0] : building.material.clone();
    for (let i = 0; i < fragmentCount; i++) {
        const fragWidth = buildingData.width / (Math.random() * 2.5 + 2); const fragHeight = buildingData.height / (Math.random() * 3.5 + 3); const fragDepth = buildingData.depth / (Math.random() * 2.5 + 2);
        const fragmentGeometry = new THREE.BoxGeometry(fragWidth, fragHeight, fragDepth); const fragment = new THREE.Mesh(fragmentGeometry, fragmentMaterial);
        fragment.position.set( buildingPos.x + (Math.random() - 0.5) * buildingData.width * 0.9, buildingPos.y + (Math.random() - 0.5) * buildingData.height * 0.9, buildingPos.z + (Math.random() - 0.5) * buildingData.depth * 0.9 );
        fragment.position.y = Math.max(fragment.position.y, fragHeight / 2 + 0.01); fragment.castShadow = true; fragment.receiveShadow = true;
        const direction = new THREE.Vector3().subVectors(fragment.position, blastCenter).normalize(); const distance = fragment.position.distanceTo(blastCenter);
        const forceFalloff = Math.max(0, 1 - (distance / blastRadius)); const forceMagnitude = blastForce * forceFalloff * (0.6 + Math.random() * 0.8);
        const velocity = direction.multiplyScalar(forceMagnitude); velocity.y += Math.random() * blastForce * forceFalloff * 0.4;
        fragment.userData = { isFragment: true, velocity: velocity, angularVelocity: new THREE.Vector3((Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*15), height: fragHeight, creationTime: clock.elapsedTime };
        scene.add(fragment); fragments.push(fragment);
    }
    building.geometry.dispose(); if (Array.isArray(building.material)) building.material.forEach(m => m.dispose()); else building.material.dispose();
}


// --- Animação dos Efeitos da Explosão ---

function animateExplosionEffects(deltaTime) {
    // Anima Bola de Fogo (se visível e timer não expirou)
    if (fireballMesh.visible && fireballTimer < fireballDuration) {
        fireballTimer += deltaTime;
        const life = Math.min(1.0, fireballTimer / fireballDuration); // Garante que life não passe de 1
        const scale = 0.1 + life * life * fireballMaxSize;
        fireballMesh.scale.set(scale, scale, scale);
        fireballMesh.material.opacity = Math.max(0, 1.0 - life * 1.2);
        fireballMesh.material.color.setHSL(0.1 * (1.0 - life), 1.0, 0.5 + 0.4 * (1.0-life));
        if (life >= 1.0) fireballMesh.visible = false; // Esconde ao final
    }

    // Anima Onda de Choque
    if (shockwaveMesh.visible && shockwaveTimer < shockwaveDuration) {
        shockwaveTimer += deltaTime;
        const life = Math.min(1.0, shockwaveTimer / shockwaveDuration);
        const scale = life * shockwaveMaxSize;
        shockwaveMesh.scale.set(scale, scale, 1);
        shockwaveMesh.material.opacity = Math.max(0, 0.6 - life * 0.7);
        if (life >= 1.0) shockwaveMesh.visible = false;
    }

    // Anima Marca no Chão
     if (groundScarMesh.visible && groundScarTimer < groundScarDuration) {
         groundScarTimer += deltaTime;
         const life = Math.min(1.0, groundScarTimer / groundScarDuration);
         groundScarMesh.material.opacity = Math.max(0, 0.75 * (1.0 - life));
         if (life >= 1.0) groundScarMesh.visible = false;
     }

    // Anima Coluna de Fumaça
    if (smokeColumnMesh.visible && smokeColumnTimer < smokeColumnDuration) {
        smokeColumnTimer += deltaTime;
        const life = Math.min(1.0, smokeColumnTimer / smokeColumnDuration);
        const heightScale = Math.sin(Math.min(1.0, life * 1.1) * Math.PI / 2) * 1.2 + 0.1;
        const widthScale = 0.1 + life * 0.9;
        smokeColumnMesh.scale.set(widthScale, heightScale, widthScale);
        smokeColumnMesh.position.y = heightScale * smokeColumnHeight / 2; // Ajuste da posição Y
        const fadeIn = Math.min(1.0, smokeColumnTimer * 1.5);
        const fadeOut = Math.max(0.0, 1.0 - life * 0.8);
        smokeColumnMesh.material.opacity = fadeIn * fadeOut * 0.7;
        smokeColumnMesh.rotation.y += deltaTime * 0.05;
        if (life >= 1.0) smokeColumnMesh.visible = false;
    }


    // Anima Partículas de Fumaça/Poeira (Sistema único, mas partículas têm ciclo de vida)
     if (smokeParticles.visible) { // Verifica visibilidade geral (embora devesse estar sempre true)
         let stillActive = 0;
         let particlesNeedUpdate = false; // Flag para otimizar updates da GPU
         for (let i = 0; i < smokeParticleCount; i++) {
             if (particleAttributes.ages[i] < smokeMaxAge) {
                 particlesNeedUpdate = true; // Marca que pelo menos uma partícula mudou
                 particleAttributes.ages[i] += deltaTime;
                 const ageRatio = particleAttributes.ages[i] / smokeMaxAge;
                 // Atualiza posição
                 particleAttributes.positions[i * 3 + 0] += particleAttributes.velocities[i * 3 + 0] * deltaTime;
                 particleAttributes.positions[i * 3 + 1] += particleAttributes.velocities[i * 3 + 1] * deltaTime;
                 particleAttributes.positions[i * 3 + 2] += particleAttributes.velocities[i * 3 + 2] * deltaTime;
                 // Simula atrito/turbulência
                 particleAttributes.velocities[i*3 + 0] *= (1.0 - deltaTime * 0.35);
                 particleAttributes.velocities[i*3 + 1] *= (1.0 - deltaTime * 0.15);
                 particleAttributes.velocities[i*3 + 2] *= (1.0 - deltaTime * 0.35);
                 particleAttributes.velocities[i*3 + 0] += (Math.random() - 0.5) * deltaTime * 6;
                 particleAttributes.velocities[i*3 + 2] += (Math.random() - 0.5) * deltaTime * 6;
                 // Atualiza tamanho
                 particleAttributes.sizes[i] = 1.0 + Math.sin(ageRatio * Math.PI) * 3.5;
                 // Atualiza opacidade
                 const fadeIn = Math.min(1.0, particleAttributes.ages[i] * 2.5);
                 const fadeOut = Math.max(0.0, 1.0 - ageRatio * 1.1);
                 particleAttributes.opacities[i] = fadeIn * fadeOut * 0.65;

                 if(particleAttributes.ages[i] < smokeMaxAge) {
                     stillActive++;
                 } else {
                     // Reseta partícula morta
                      particleAttributes.opacities[i] = 0;
                      particleAttributes.positions[i*3+1] = -1000; // Move para longe
                 }
             }
         }
         // Atualiza atributos na GPU SOMENTE se alguma partícula foi modificada
         if (particlesNeedUpdate) {
             smokeGeometry.attributes.position.needsUpdate = true;
             smokeGeometry.attributes.velocity.needsUpdate = true;
             smokeGeometry.attributes.age.needsUpdate = true;
             smokeGeometry.attributes.particleSize.needsUpdate = true;
             smokeGeometry.attributes.particleOpacity.needsUpdate = true;
         }

         activeSmokeParticles = stillActive;
         performanceInfo.textContent = `Partículas Ativas: ${activeSmokeParticles}`;
         // Não esconde mais o sistema aqui, pois novas partículas podem ser adicionadas
     }
}

function spawnSmokeParticles(origin) {
     let spawnedCount = 0;
     // Encontra partículas "mortas" para reutilizar
     for(let i = 0; i < smokeParticleCount && spawnedCount < smokeParticleCount / 2; i++) { // Limita spawns por explosão para evitar sobrecarga total imediata
         if (particleAttributes.ages[i] >= smokeMaxAge) {
             // Inicializa a partícula i
             const theta = Math.random() * Math.PI * 2; const phi = Math.acos((Math.random() * 2) - 1); const radius = Math.random() * smokeSpread * 0.35;
             particleAttributes.positions[i*3 + 0] = origin.x + radius * Math.sin(phi) * Math.cos(theta);
             particleAttributes.positions[i*3 + 1] = origin.y + radius * Math.cos(phi) * 0.6;
             particleAttributes.positions[i*3 + 2] = origin.z + radius * Math.sin(phi) * Math.sin(theta);
             const speed = (0.6 + Math.random() * 0.4) * smokeRiseSpeed; const upFactor = 0.75 + Math.random() * 0.5; const outFactor = 1.0 - upFactor * 0.7;
             particleAttributes.velocities[i*3 + 0] = Math.sin(phi) * Math.cos(theta) * speed * outFactor;
             particleAttributes.velocities[i*3 + 1] = Math.cos(phi) * speed * upFactor + Math.random() * 0.25 * speed;
             particleAttributes.velocities[i*3 + 2] = Math.sin(phi) * Math.sin(theta) * speed * outFactor;
             particleAttributes.ages[i] = 0.0; // Nasce
             particleAttributes.sizes[i] = 1.0 + Math.random() * 0.5;
             particleAttributes.opacities[i] = 0.0; // Fade in
             spawnedCount++;
         }
     }
     console.log(`Spawned ${spawnedCount} new particles.`);
     // Marca atributos para atualização (importante mesmo se reusando)
     smokeGeometry.attributes.position.needsUpdate = true;
     smokeGeometry.attributes.velocity.needsUpdate = true;
     smokeGeometry.attributes.age.needsUpdate = true;
     smokeGeometry.attributes.particleSize.needsUpdate = true;
     smokeGeometry.attributes.particleOpacity.needsUpdate = true;
     // smokeParticles.visible = true; // Já deve estar visível
}

function resetExplosionEffects() {
    // Esconde meshes compartilhados e reseta timers para o estado "morto"
    fireballMesh.visible = false; fireballTimer = Infinity;
    shockwaveMesh.visible = false; shockwaveTimer = Infinity;
    groundScarMesh.visible = false; groundScarTimer = Infinity;
    smokeColumnMesh.visible = false; smokeColumnTimer = Infinity;

    // Não reseta as partículas aqui, elas continuam seu ciclo de vida

    // Reseta luzes
     if(scene.userData.directionalLight) scene.userData.directionalLight.intensity = 0.75;
     if(scene.userData.ambientLight) scene.userData.ambientLight.intensity = 0.45;
}

// --- Camera Shake ---
function startCameraShake() {
    isShaking = true;
    shakeIntensity = maxShakeIntensity;
    shakeTimer = 0;
}

function applyCameraShake(deltaTime) {
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
function animateFragments(deltaTime) {
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
    fragmentsToRemoveIndexes.forEach(indexToRemove => { if (fragments[indexToRemove]) { scene.remove(fragments[indexToRemove]); fragments[indexToRemove].geometry.dispose(); fragments.splice(indexToRemove, 1); } });
}


// --- UI, Eventos ---
function updateUI() {
    // Habilita/desabilita botão baseado SE um alvo está definido
    launchButton.disabled = !isTargetSet;
}

// updateStatus é chamada conforme necessário

function triggerVisualFlash(bombPos) {
    explosionOverlay.classList.add('active');
    const light = scene.userData.directionalLight; const ambient = scene.userData.ambientLight;
    // Armazena intensidades originais se não estiverem já armazenadas (para o tween)
    if (!light.userData.originalIntensity) light.userData.originalIntensity = light.intensity;
    if (!ambient.userData.originalIntensity) ambient.userData.originalIntensity = ambient.intensity;

    // Interrompe tweens anteriores se houver
    if(light.userData.tween) TWEEN.remove(light.userData.tween);
    if(ambient.userData.tween) TWEEN.remove(ambient.userData.tween);

    light.intensity = 6.0; // Flash
    ambient.intensity = 1.2;

    setTimeout(() => {
        explosionOverlay.classList.remove('active');
        if (window.TWEEN) {
             light.userData.tween = new TWEEN.Tween(light)
                .to({ intensity: light.userData.originalIntensity || 0.75 }, 2000)
                .easing(TWEEN.Easing.Quadratic.Out)
                .onComplete(() => light.userData.tween = null) // Limpa referência ao tween
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

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onCanvasClick(event) {
    // Permite definir alvo a qualquer momento
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects([groundMesh]);
    if (intersects.length > 0) {
        targetPosition.copy(intersects[0].point);
        targetMarker.position.copy(targetPosition);
        targetMarker.position.y = 0.05;
        targetMarker.visible = true;
        isTargetSet = true; // Marca que um alvo foi definido
        console.log("Target set at:", targetPosition);
        updateStatus("Alvo definido! Pronto para lançar.");
        updateUI(); // Atualiza o botão
    }
}

// --- Áudio ---

function initAudio() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        explosionGain = audioContext.createGain();
        explosionGain.gain.value = 0.75;
        explosionGain.connect(audioContext.destination);
    } catch (e) { console.error("Web Audio API não suportada.", e); }
}

function playFallingSound() { // Agora RETORNA os nós criados
    if (!audioContext) return null; // Retorna null se não puder criar

    const now = audioContext.currentTime;
    let osc = audioContext.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1300, now); osc.frequency.exponentialRampToValueAtTime(250, now + 3.5);
    let filter = audioContext.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(1600, now); filter.frequency.linearRampToValueAtTime(400, now + 3.5); filter.Q.setValueAtTime(18, now);
    let noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 4, audioContext.sampleRate); let output = noiseBuffer.getChannelData(0); for (let i = 0; i < noiseBuffer.length; i++) output[i] = (Math.random() * 2 - 1) * 0.18;
    let noiseSource = audioContext.createBufferSource(); noiseSource.buffer = noiseBuffer; noiseSource.loop = true;
    let gain = audioContext.createGain(); gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.35, now + 0.6);
    osc.connect(filter); filter.connect(gain); noiseSource.connect(gain); gain.connect(audioContext.destination);
    osc.start(now); noiseSource.start(now);

    // Retorna os nós necessários para parar depois
    return { osc: osc, noise: noiseSource, gain: gain };
}

function stopFallingSound(audioNodes) { // Recebe os nós a serem parados
    if (!audioContext || !audioNodes) return; // Verifica se recebeu nós válidos
    const now = audioContext.currentTime;
    audioNodes.gain.gain.setTargetAtTime(0, now, 0.04);
    // Usa try-catch para stop() caso já tenham sido parados por algum motivo
    try { audioNodes.osc.stop(now + 0.1); } catch(e) {}
    try { audioNodes.noise.stop(now + 0.1); } catch(e) {}
}

function playExplosionSound() { // Som da Explosão Aprimorado (igual ao anterior)
    if (!audioContext || !explosionGain) return;
    const now = audioContext.currentTime;
    const duration = 4.5;

    // Camada 1: Impacto
    const impactNoise = audioContext.createBufferSource(); const iBufSize = audioContext.sampleRate * 0.15; const iBuffer = audioContext.createBuffer(1, iBufSize, audioContext.sampleRate); const iOut = iBuffer.getChannelData(0); for (let i = 0; i < iBufSize; i++) iOut[i] = Math.random() * 2 - 1; impactNoise.buffer = iBuffer;
    const impactFilter = audioContext.createBiquadFilter(); impactFilter.type = 'lowpass'; impactFilter.frequency.value = 1500; impactFilter.Q.value = 2;
    const impactGain = audioContext.createGain(); impactGain.gain.setValueAtTime(1.2, now); impactGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    impactNoise.connect(impactFilter); impactFilter.connect(impactGain); impactGain.connect(explosionGain); impactNoise.start(now);

    // Camada 2: Corpo + Sub
    const bodyNoise = audioContext.createBufferSource(); const bBufSize = audioContext.sampleRate * (duration * 0.8); const bBuffer = audioContext.createBuffer(1, bBufSize, audioContext.sampleRate); const bOut = bBuffer.getChannelData(0); for (let i = 0; i < bBufSize; i++) bOut[i] = Math.random() * 2 - 1; bodyNoise.buffer = bBuffer;
    const bodyFilter = audioContext.createBiquadFilter(); bodyFilter.type = 'lowpass'; bodyFilter.frequency.setValueAtTime(800, now + 0.05); bodyFilter.frequency.exponentialRampToValueAtTime(60, now + duration * 0.7); bodyFilter.Q.value = 4;
    const bodyGain = audioContext.createGain(); bodyGain.gain.setValueAtTime(0, now); bodyGain.gain.linearRampToValueAtTime(0.9, now + 0.1); bodyGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.8);
    bodyNoise.connect(bodyFilter); bodyFilter.connect(bodyGain); bodyGain.connect(explosionGain); bodyNoise.start(now + 0.02);
    const subOsc = audioContext.createOscillator(); subOsc.type = 'sine'; subOsc.frequency.setValueAtTime(50, now); subOsc.frequency.exponentialRampToValueAtTime(25, now + duration * 0.6);
    const subGain = audioContext.createGain(); subGain.gain.setValueAtTime(0, now); subGain.gain.linearRampToValueAtTime(1.0, now + 0.05); subGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.7);
    subOsc.connect(subGain); subGain.connect(explosionGain); subOsc.start(now); subOsc.stop(now + duration * 0.8);

    // Camada 3: Rumble
    const rumbleLfo = audioContext.createOscillator(); rumbleLfo.type = 'sine'; rumbleLfo.frequency.value = 5 + Math.random() * 3;
    const rumbleDepth = audioContext.createGain(); rumbleDepth.gain.value = 0.3;
    const rumbleNoise = audioContext.createBufferSource(); rumbleNoise.buffer = bBuffer; // Reusa bBuffer
    const rumbleFilter = audioContext.createBiquadFilter(); rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.value = 100; rumbleFilter.Q.value = 1;
    const rumbleGain = audioContext.createGain(); rumbleGain.gain.setValueAtTime(0.5, now + 0.2); rumbleGain.gain.linearRampToValueAtTime(0.8, now + 1.0); rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    rumbleLfo.connect(rumbleDepth); rumbleDepth.connect(rumbleGain.gain);
    rumbleNoise.connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(explosionGain);
    rumbleLfo.start(now + 0.2); rumbleLfo.stop(now + duration); rumbleNoise.start(now + 0.2); // Inicia o ruído do rumble

    // Camada 4: Crackle
    for (let i = 0; i < 8; i++) { const delay = 0.2 + Math.random() * 1.5; const crackleDur = 0.1 + Math.random() * 0.4; const cNoise = audioContext.createBufferSource(); const cBufSize = audioContext.sampleRate * crackleDur; const cBuffer = audioContext.createBuffer(1, cBufSize, audioContext.sampleRate); const cOut = cBuffer.getChannelData(0); for (let j = 0; j < cBufSize; j++) cOut[j] = (Math.random() * 2 - 1) * Math.pow(Math.random(), 3); cNoise.buffer = cBuffer; const cFilter = audioContext.createBiquadFilter(); cFilter.type = 'highpass'; cFilter.frequency.value = 1500 + Math.random()*1000; cFilter.Q.value = 0.5; const cGain = audioContext.createGain(); cGain.gain.setValueAtTime(0, now + delay); cGain.gain.linearRampToValueAtTime(0.15 + Math.random() * 0.1, now + delay + 0.02); cGain.gain.exponentialRampToValueAtTime(0.01, now + delay + crackleDur); cNoise.connect(cFilter); cFilter.connect(cGain); cGain.connect(explosionGain); cNoise.start(now + delay); }
}


// --- Loop de Animação Principal ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = Math.min(0.05, clock.getDelta()); // Limita delta time

    controls.update(); // Atualiza controles PRIMEIRO
    if(window.TWEEN) TWEEN.update(); // Atualiza TWEEN

    applyCameraShake(deltaTime); // Aplica shake DEPOIS

    animateBombFall(deltaTime); // Anima TODAS as bombas caindo
    animateExplosionEffects(deltaTime); // Anima os efeitos visuais COMPARTILHADOS
    animateFragments(deltaTime); // Anima TODOS os fragmentos

    renderer.render(scene, camera);
}

// --- Iniciar ---
init();