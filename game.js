(() => {
  const canvas = document.getElementById("gameCanvas");
  const xpEl = document.getElementById("xp");
  const objectiveEl = document.getElementById("objective");
  const dialogueEl = document.getElementById("dialogue");
  const eventEl = document.getElementById("eventText");
  const muteBtn = document.getElementById("muteBtn");
  const victoryScreen = document.getElementById("victoryScreen");
  const playAgainBtn = document.getElementById("playAgain");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6f89ff);
  scene.fog = new THREE.Fog(0x6f89ff, 25, 95);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

  const ambientLight = new THREE.AmbientLight(0x9bc4ff, 0.7);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xfff3d1, 0.65);
  dirLight.position.set(16, 26, 14);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -35;
  dirLight.shadow.camera.right = 35;
  dirLight.shadow.camera.top = 35;
  dirLight.shadow.camera.bottom = -35;
  scene.add(dirLight);

  const gameState = {
    xp: 0,
    bridgeRepaired: false,
    gardenCompleted: false,
    machineActivated: false,
    portalUnlocked: false,
    gameCompleted: false,
  };

  const keys = {};
  const challengeItems = [];
  const floatingObjects = [];
  const particles = [];
  const bridgeSegments = [];
  const clouds = [];

  const player = {
    group: new THREE.Group(),
    velocityY: 0,
    speed: 5.5,
    grounded: false,
    animation: "idle",
    animTimer: 0,
    carry: null,
    celebrateTimer: 0,
    confusedTimer: 0,
    limbs: {},
  };

  const cameraRig = {
    yaw: 0,
    pitch: -0.25,
    distance: 9,
    minDistance: 5,
    maxDistance: 12,
    shake: 0,
  };

  const clock = new THREE.Clock();
  let audioCtx = null;
  let muted = false;

  const islandRadius = 21;
  const islandCenter = new THREE.Vector3(0, 0, 0);

  function makeNumberSprite(text, color = "#fff09f", size = 120) {
    const cnv = document.createElement("canvas");
    cnv.width = cnv.height = 256;
    const ctx = cnv.getContext("2d");
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, 256, 256);
    ctx.font = `900 ${size}px Trebuchet MS`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 16;
    ctx.strokeText(text, 128, 134);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 134);
    const texture = new THREE.CanvasTexture(cnv);
    texture.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 2.4, 1);
    return sprite;
  }

  function setupInput() {
    window.addEventListener("keydown", (e) => {
      keys[e.code] = true;
      if (e.code === "Space" && player.grounded) {
        player.velocityY = 7.5;
        player.grounded = false;
        player.animation = "jump";
        playSound("jump");
      }
    });
    window.addEventListener("keyup", (e) => {
      keys[e.code] = false;
    });

    let dragging = false;
    canvas.addEventListener("mousedown", () => {
      dragging = true;
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging || gameState.gameCompleted) return;
      cameraRig.yaw -= e.movementX * 0.003;
      cameraRig.pitch -= e.movementY * 0.0024;
      cameraRig.pitch = Math.max(-1.05, Math.min(0.35, cameraRig.pitch));
    });
    window.addEventListener("wheel", (e) => {
      cameraRig.distance += e.deltaY * 0.01;
      cameraRig.distance = Math.max(cameraRig.minDistance, Math.min(cameraRig.maxDistance, cameraRig.distance));
    });

    muteBtn.addEventListener("click", () => {
      muted = !muted;
      muteBtn.textContent = muted ? "🔇" : "🔊";
    });

    playAgainBtn.addEventListener("click", () => window.location.reload());
  }

  function createWorld() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(120, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xb6d8ff, side: THREE.BackSide })
    );
    scene.add(sky);

    const islandBase = new THREE.Mesh(
      new THREE.CylinderGeometry(islandRadius * 0.85, islandRadius, 5.5, 40),
      new THREE.MeshStandardMaterial({ color: 0x5f4f7d, roughness: 0.95 })
    );
    islandBase.position.y = -3.5;
    islandBase.receiveShadow = true;
    scene.add(islandBase);

    const islandTop = new THREE.Mesh(
      new THREE.CylinderGeometry(islandRadius, islandRadius * 0.95, 2.2, 48),
      new THREE.MeshStandardMaterial({ color: 0x4cb26d, roughness: 0.9 })
    );
    islandTop.position.y = -0.2;
    islandTop.receiveShadow = true;
    scene.add(islandTop);

    const spawnPad = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.8, 0.6, 20),
      new THREE.MeshStandardMaterial({ color: 0x7eb4ff, emissive: 0x22336f, emissiveIntensity: 0.7 })
    );
    spawnPad.position.set(-14, 0.2, 9);
    spawnPad.receiveShadow = true;
    scene.add(spawnPad);

    const flowers = new THREE.Group();
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 15;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 0.7, 6),
        new THREE.MeshStandardMaterial({ color: 0x3f8f53 })
      );
      stem.position.set(x, 0.35, z);
      const bud = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xfad0ff, emissive: 0x4d244f, emissiveIntensity: 0.35 })
      );
      bud.position.y = 0.42;
      stem.add(bud);
      flowers.add(stem);
      floatingObjects.push({ mesh: bud, baseY: bud.position.y, speed: 0.8 + Math.random() });
    }
    scene.add(flowers);

    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xe7f3ff, emissive: 0x38527e, emissiveIntensity: 0.2 });
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(1.2 + Math.random() * 0.7, 10, 10), cloudMat);
        puff.position.set((j - 1.5) * 0.9, Math.random() * 0.4, Math.random() * 1.1 - 0.5);
        cloud.add(puff);
      }
      cloud.position.set((Math.random() - 0.5) * 60, 14 + Math.random() * 6, (Math.random() - 0.5) * 60);
      cloud.userData.phase = Math.random() * Math.PI * 2;
      clouds.push(cloud);
      scene.add(cloud);
    }

    createBridge();
    createChallengeAreas();
    createMachineAndPortal();
    createAmbientParticles();
  }

  function createBridge() {
    const brokenBridgeStart = new THREE.Vector3(-2, 0.25, -9);
    const bridgeDir = new THREE.Vector3(1, 0, 0.1).normalize();

    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.35, 1.8),
        new THREE.MeshStandardMaterial({ color: 0x8d6f56, roughness: 0.9 })
      );
      seg.position.copy(brokenBridgeStart).addScaledVector(bridgeDir, i * 2.35);
      seg.receiveShadow = true;
      seg.castShadow = true;
      if (i < 2 || i > 3) {
        scene.add(seg);
      } else {
        seg.visible = false;
        seg.scale.y = 0.01;
        bridgeSegments.push(seg);
        scene.add(seg);
      }
    }
  }

  function createChallengeAreas() {
    const labelBridge = makeNumberSprite("2 → 4 → 6 → ?", "#f7efff", 54);
    labelBridge.position.set(-10, 4.5, -7.5);
    scene.add(labelBridge);

    createNumberChoice({
      id: "bridge-7",
      value: 7,
      correct: false,
      challenge: "bridge",
      position: new THREE.Vector3(-15, 1.2, -6),
      style: "block",
    });
    createNumberChoice({
      id: "bridge-8",
      value: 8,
      correct: true,
      challenge: "bridge",
      position: new THREE.Vector3(-9, 1.2, -12),
      style: "block",
    });
    createNumberChoice({
      id: "bridge-9",
      value: 9,
      correct: false,
      challenge: "bridge",
      position: new THREE.Vector3(-3.5, 1.2, -8),
      style: "block",
    });

    const gardenSign = makeNumberSprite("5 → 10 → 15 → 20 → ?", "#fff3a9", 42);
    gardenSign.position.set(10, 4.2, 9.5);
    scene.add(gardenSign);

    createNumberChoice({
      id: "garden-22",
      value: 22,
      correct: false,
      challenge: "garden",
      position: new THREE.Vector3(6, 1.4, 14),
      style: "crystal",
    });
    createNumberChoice({
      id: "garden-25",
      value: 25,
      correct: true,
      challenge: "garden",
      position: new THREE.Vector3(12.5, 1.4, 8),
      style: "crystal",
    });
    createNumberChoice({
      id: "garden-30",
      value: 30,
      correct: false,
      challenge: "garden",
      position: new THREE.Vector3(15, 1.4, 14.2),
      style: "crystal",
    });
  }

  function createNumberChoice({ id, value, correct, challenge, position, style }) {
    const color = style === "block" ? 0x8e8cff : 0x7fffcc;
    const geo =
      style === "block"
        ? new THREE.BoxGeometry(1.6, 1.6, 1.6)
        : new THREE.OctahedronGeometry(1.1, 0);

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        emissive: correct ? 0x284b28 : 0x2f2455,
        emissiveIntensity: 0.65,
        roughness: 0.35,
        metalness: 0.1,
      })
    );

    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.userData = { id, value, correct, challenge, solved: false, bounce: 0, phase: Math.random() * Math.PI * 2 };
    const label = makeNumberSprite(String(value), correct ? "#c0ffb8" : "#ffe8ff", 110);
    label.position.y = style === "block" ? 1.5 : 1.8;
    mesh.add(label);
    challengeItems.push(mesh);
    scene.add(mesh);
  }

  let machine;
  let machineCore;
  let portal;
  let portalRing;
  let machineLabel;
  function createMachineAndPortal() {
    machine = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 4.6, 2.1, 16),
      new THREE.MeshStandardMaterial({ color: 0x5f6da0, roughness: 0.7 })
    );
    base.position.y = 1;
    base.receiveShadow = true;
    machine.add(base);

    machineCore = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 18, 18),
      new THREE.MeshStandardMaterial({
        color: 0x7bdfff,
        emissive: 0x102647,
        emissiveIntensity: 0.45,
        roughness: 0.2,
        metalness: 0.35,
      })
    );
    machineCore.position.y = 3;
    machineCore.castShadow = true;
    machine.add(machineCore);

    machineLabel = makeNumberSprite("3 → 6 → 9 → 12 → ?", "#d7f8ff", 42);
    machineLabel.position.set(0, 5.4, 0);
    machine.add(machineLabel);

    machine.position.set(0, 0, 0);
    scene.add(machine);

    const finalChoices = [14, 15, 16];
    finalChoices.forEach((num, i) => {
      const crystal = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.0),
        new THREE.MeshStandardMaterial({
          color: 0xffb36f,
          emissive: num === 15 ? 0x3f2f0f : 0x32243f,
          emissiveIntensity: 0.6,
          roughness: 0.35,
        })
      );
      crystal.position.set(6 + i * 4, 1.5, -10.5 + i * 1.6);
      crystal.castShadow = true;
      crystal.userData = {
        collectible: true,
        value: num,
        challenge: "machine",
        phase: i,
        picked: false,
      };
      const number = makeNumberSprite(String(num), num === 15 ? "#ffe9ac" : "#ffd7f6", 95);
      number.position.y = 1.6;
      crystal.add(number);
      challengeItems.push(crystal);
      scene.add(crystal);
    });

    portal = new THREE.Group();
    portal.position.set(13.5, 0.2, -2.5);

    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(2.3, 2.8, 0.6, 20),
      new THREE.MeshStandardMaterial({ color: 0x6f649f, roughness: 0.8 })
    );
    stand.receiveShadow = true;
    portal.add(stand);

    portalRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.25, 12, 36),
      new THREE.MeshStandardMaterial({ color: 0x77a4ff, emissive: 0x1f3270, emissiveIntensity: 0.4 })
    );
    portalRing.position.y = 2.5;
    portalRing.rotation.x = Math.PI / 2;
    portal.add(portalRing);

    const portalFill = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 24),
      new THREE.MeshBasicMaterial({ color: 0x67d7ff, transparent: true, opacity: 0.18 })
    );
    portalFill.position.y = 2.5;
    portalFill.rotation.x = -Math.PI / 2;
    portal.add(portalFill);

    portal.visible = false;
    scene.add(portal);
  }

  function createAmbientParticles() {
    const geom = new THREE.BufferGeometry();
    const count = 120;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 18;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = Math.random() * 4 + 0.8;
      positions[i * 3 + 2] = Math.sin(angle) * r;
    }
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(
      geom,
      new THREE.PointsMaterial({ size: 0.12, color: 0xfffbcd, transparent: true, opacity: 0.55 })
    );
    scene.add(pts);
    floatingObjects.push({ mesh: pts, ambientParticles: true });
  }

  function createPlayer() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4f8cff, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd9ac, roughness: 0.85 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2f3c73, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.2, 6, 10), bodyMat);
    body.position.y = 1.8;
    body.castShadow = true;
    player.group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), skinMat);
    head.position.y = 3.1;
    head.castShadow = true;
    player.group.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupil = new THREE.MeshStandardMaterial({ color: 0x212121 });
    const eyeL = new THREE.Mesh(eyeGeo, white);
    eyeL.position.set(-0.17, 0.03, 0.48);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.17;
    const pL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), pupil);
    pL.position.z = 0.07;
    eyeL.add(pL);
    const pR = pL.clone();
    eyeR.add(pR);
    head.add(eyeL, eyeR);

    const hair = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.5, 7), darkMat);
    hair.position.set(0, 0.58, 0);
    hair.rotation.z = 0.32;
    head.add(hair);

    const armGeo = new THREE.CapsuleGeometry(0.14, 0.7, 5, 8);
    const legGeo = new THREE.CapsuleGeometry(0.16, 0.8, 5, 8);

    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.7, 2.05, 0);
    leftArm.rotation.z = 0.28;
    const rightArm = leftArm.clone();
    rightArm.position.x = 0.7;
    rightArm.rotation.z = -0.28;

    const leftLeg = new THREE.Mesh(legGeo, darkMat);
    leftLeg.position.set(-0.27, 0.7, 0);
    const rightLeg = leftLeg.clone();
    rightLeg.position.x = 0.27;

    [leftArm, rightArm, leftLeg, rightLeg].forEach((part) => {
      part.castShadow = true;
      player.group.add(part);
    });

    player.limbs = { leftArm, rightArm, leftLeg, rightLeg, head, body };
    player.group.position.set(-14, 1.3, 9);
    scene.add(player.group);
  }

  function groundHeightAt(x, z) {
    const dist = Math.hypot(x, z);
    if (dist > islandRadius + 1.2) return -12;
    const ripple = Math.sin(x * 0.2) * 0.09 + Math.cos(z * 0.25) * 0.07;
    return 1 + ripple;
  }

  function updatePlayer(dt) {
    if (gameState.gameCompleted) return;

    const move = new THREE.Vector3();
    if (keys.KeyW) move.z -= 1;
    if (keys.KeyS) move.z += 1;
    if (keys.KeyA) move.x -= 1;
    if (keys.KeyD) move.x += 1;

    const moving = move.lengthSq() > 0;
    if (moving) {
      move.normalize();
      const sin = Math.sin(cameraRig.yaw);
      const cos = Math.cos(cameraRig.yaw);
      const worldX = move.x * cos - move.z * sin;
      const worldZ = move.x * sin + move.z * cos;
      player.group.position.x += worldX * player.speed * dt;
      player.group.position.z += worldZ * player.speed * dt;
      const targetFacing = Math.atan2(worldX, worldZ);
      player.group.rotation.y += (targetFacing - player.group.rotation.y) * 0.18;
    }

    const fromCenter = player.group.position.clone().sub(islandCenter);
    if (fromCenter.length() > islandRadius - 1) {
      fromCenter.setLength(islandRadius - 1);
      player.group.position.x = fromCenter.x;
      player.group.position.z = fromCenter.z;
    }

    player.velocityY -= 18 * dt;
    player.group.position.y += player.velocityY * dt;

    const ground = groundHeightAt(player.group.position.x, player.group.position.z);
    if (player.group.position.y <= ground) {
      player.group.position.y = ground;
      player.velocityY = 0;
      player.grounded = true;
    }

    if (!player.grounded) {
      player.animation = "jump";
    } else if (player.celebrateTimer > 0) {
      player.animation = "celebrate";
    } else if (player.confusedTimer > 0) {
      player.animation = "confused";
    } else if (moving) {
      player.animation = "walk";
    } else {
      player.animation = "idle";
    }

    player.animTimer += dt;
    if (player.celebrateTimer > 0) player.celebrateTimer -= dt;
    if (player.confusedTimer > 0) player.confusedTimer -= dt;

    updatePlayerAnimation();

    if (player.carry) {
      const t = player.animTimer;
      player.carry.position.copy(player.group.position).add(new THREE.Vector3(0.8, 2.4 + Math.sin(t * 6) * 0.14, 0));
      player.carry.rotation.y += dt * 2.8;
    }
  }

  function updatePlayerAnimation() {
    const t = player.animTimer;
    const { leftArm, rightArm, leftLeg, rightLeg, head, body } = player.limbs;
    if (!leftArm) return;

    leftArm.rotation.x = 0;
    rightArm.rotation.x = 0;
    leftLeg.rotation.x = 0;
    rightLeg.rotation.x = 0;
    head.rotation.z = 0;
    body.scale.y = 1;

    if (player.animation === "walk") {
      leftArm.rotation.x = Math.sin(t * 10) * 0.6;
      rightArm.rotation.x = -Math.sin(t * 10) * 0.6;
      leftLeg.rotation.x = -Math.sin(t * 10) * 0.5;
      rightLeg.rotation.x = Math.sin(t * 10) * 0.5;
      body.scale.y = 1 + Math.sin(t * 10) * 0.03;
    } else if (player.animation === "jump") {
      leftArm.rotation.x = -0.9;
      rightArm.rotation.x = -0.9;
      leftLeg.rotation.x = 0.3;
      rightLeg.rotation.x = 0.3;
    } else if (player.animation === "celebrate") {
      leftArm.rotation.x = -1.4 + Math.sin(t * 14) * 0.5;
      rightArm.rotation.x = -1.4 + Math.cos(t * 14) * 0.5;
      head.rotation.z = Math.sin(t * 9) * 0.18;
      body.scale.y = 1 + Math.sin(t * 12) * 0.06;
    } else if (player.animation === "confused") {
      head.rotation.z = Math.sin(t * 15) * 0.2;
      leftArm.rotation.x = -0.6;
      rightArm.rotation.x = -0.6;
    } else {
      body.position.y = 1.8 + Math.sin(t * 2.8) * 0.04;
    }
  }

  function updateCamera(dt) {
    const target = player.group.position.clone().add(new THREE.Vector3(0, 2.0, 0));
    const camOffset = new THREE.Vector3(
      Math.sin(cameraRig.yaw) * Math.cos(cameraRig.pitch),
      Math.sin(cameraRig.pitch),
      Math.cos(cameraRig.yaw) * Math.cos(cameraRig.pitch)
    ).multiplyScalar(-cameraRig.distance);

    const desired = target.clone().add(camOffset);
    const ground = groundHeightAt(desired.x, desired.z);
    desired.y = Math.max(desired.y, ground + 2.2);

    if (cameraRig.shake > 0) {
      desired.x += (Math.random() - 0.5) * cameraRig.shake;
      desired.y += (Math.random() - 0.5) * cameraRig.shake;
      cameraRig.shake = Math.max(0, cameraRig.shake - dt * 1.6);
    }

    camera.position.lerp(desired, 0.08);
    camera.lookAt(target);
  }

  function updateFloating(dt) {
    const time = performance.now() * 0.001;
    floatingObjects.forEach((entry) => {
      if (entry.ambientParticles) {
        entry.mesh.rotation.y += dt * 0.03;
      } else {
        entry.mesh.position.y = entry.baseY + Math.sin(time * entry.speed) * 0.08;
      }
    });

    challengeItems.forEach((item) => {
      if (!item.visible) return;
      const phase = item.userData.phase ?? 0;
      item.position.y += Math.sin(time * 2.5 + phase) * 0.0025;
      item.rotation.y += dt * 0.5;
      if (item.userData.bounce > 0) {
        item.position.y += Math.sin((1 - item.userData.bounce) * Math.PI * 5) * 0.08;
        item.userData.bounce = Math.max(0, item.userData.bounce - dt * 2.2);
      }
    });

    clouds.forEach((cloud) => {
      cloud.position.x += Math.sin(time * 0.18 + cloud.userData.phase) * 0.006;
      cloud.position.z += Math.cos(time * 0.15 + cloud.userData.phase) * 0.005;
    });

    if (portal.visible) {
      portalRing.rotation.z += dt * 1.5;
      portalRing.material.emissiveIntensity = 0.7 + Math.sin(time * 5) * 0.2;
    }

    if (gameState.machineActivated) {
      machineCore.material.emissiveIntensity = 0.95 + Math.sin(time * 8) * 0.1;
      machineCore.scale.setScalar(1 + Math.sin(time * 6) * 0.03);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= dt * 4;
      p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      }
    }
  }

  function updateInteractions() {
    const pos = player.group.position;

    for (const obj of challengeItems) {
      if (!obj.visible) continue;
      const dist = obj.position.distanceTo(pos);
      if (dist > 1.7) continue;

      if (obj.userData.challenge === "bridge" && !gameState.bridgeRepaired) {
        resolveBridgeChoice(obj);
        return;
      }

      if (obj.userData.challenge === "garden" && gameState.bridgeRepaired && !gameState.gardenCompleted) {
        resolveGardenChoice(obj);
        return;
      }

      if (obj.userData.collectible && gameState.gardenCompleted && !gameState.machineActivated && !obj.userData.picked) {
        pickMachineCrystal(obj);
        return;
      }
    }

    if (gameState.gardenCompleted && !gameState.machineActivated && player.carry) {
      if (machine.position.distanceTo(pos) < 4.3) {
        insertIntoMachine();
      }
    }

    if (gameState.portalUnlocked && !gameState.gameCompleted && portal.position.distanceTo(pos) < 2.3) {
      completeGame();
    }
  }

  function resolveBridgeChoice(obj) {
    if (obj.userData.correct) {
      obj.userData.solved = true;
      obj.material.emissiveIntensity = 1;
      awardXP(50, "+50 XP");
      showDialogue("George: آفرین! الگو +2 بود.");
      showEventText("Bridge Restored!");
      player.celebrateTimer = 1.8;
      playSound("correct");
      emitParticles(obj.position, 24, 0x8df8ff);
      gameState.bridgeRepaired = true;
      objectiveEl.textContent = "Complete the Number Garden. Find the next number.";
      revealBridge();
      showPatternHint();
      brightenWorld(0.12);
    } else {
      wrongChoice(obj, "George: Hmm… هر بار عدد چقدر بزرگتر میشه؟");
    }
  }

  function resolveGardenChoice(obj) {
    if (obj.userData.correct) {
      obj.userData.solved = true;
      obj.material.emissiveIntensity = 1.1;
      awardXP(50, "+50 XP");
      showDialogue("George: +5! خیلی خوب!");
      showEventText("Number Garden Activated!");
      playSound("correct");
      emitParticles(obj.position, 26, 0xc8ff8f);
      player.celebrateTimer = 1.8;
      gameState.gardenCompleted = true;
      objectiveEl.textContent = "Power the Number Machine. Bring the missing crystal.";
      brightenWorld(0.15);
      cameraRig.shake = 0.22;
      scene.fog.far = 110;
    } else {
      wrongChoice(obj, "George: به فاصله بین عددها نگاه کن!");
      obj.userData.bounce = 1;
      obj.position.x += (Math.random() - 0.5) * 0.7;
      obj.position.z += (Math.random() - 0.5) * 0.7;
    }
  }

  function pickMachineCrystal(obj) {
    obj.userData.picked = true;
    player.carry = obj;
    showDialogue(`George picked ${obj.userData.value}. Take it to the machine!`);
    playSound("pickup");
    awardXP(20, "+20 XP");
  }

  function insertIntoMachine() {
    if (!player.carry) return;
    const crystal = player.carry;
    player.carry = null;

    if (crystal.userData.value === 15) {
      crystal.visible = false;
      awardXP(80, "+80 XP");
      gameState.machineActivated = true;
      showDialogue("George: ماشین روشن شد! Portal unlocked!");
      showEventText("Number Machine Online!");
      player.celebrateTimer = 2.4;
      playSound("portal");
      emitParticles(machine.position.clone().add(new THREE.Vector3(0, 3, 0)), 42, 0x9dd8ff);
      machineCore.material.emissive = new THREE.Color(0x5ac7ff);
      machineCore.material.emissiveIntensity = 1;
      unlockPortal();
      objectiveEl.textContent = "Reach the glowing portal!";
      brightenWorld(0.2);
    } else {
      crystal.userData.picked = false;
      crystal.position.set(8 + Math.random() * 6, 1.4, -9 + Math.random() * 3);
      wrongChoice(crystal, "George: نه! باید الگو +3 ادامه پیدا کنه.");
      crystal.userData.bounce = 1;
    }
  }

  function wrongChoice(obj, line) {
    showDialogue(line);
    player.confusedTimer = 1.4;
    playSound("wrong");
    cameraRig.shake = 0.12;
    obj.rotation.x += 0.2;
    emitParticles(obj.position, 10, 0xff8ba6);
  }

  function revealBridge() {
    bridgeSegments.forEach((seg, i) => {
      seg.visible = true;
      const delay = i * 120;
      setTimeout(() => {
        const start = performance.now();
        const duration = 500;
        const animate = () => {
          const t = (performance.now() - start) / duration;
          const k = Math.min(1, t);
          seg.scale.y = 0.01 + k * 0.99;
          if (k < 1) requestAnimationFrame(animate);
        };
        animate();
      }, delay);
    });
  }

  function showPatternHint() {
    const hint = makeNumberSprite("+2   +2   +2", "#f9ffd2", 58);
    hint.position.set(-8.5, 6, -10.4);
    scene.add(hint);
    let life = 2.8;
    const tick = () => {
      life -= 0.016;
      hint.position.y += 0.01;
      hint.material.opacity = Math.max(0, life / 2.8);
      if (life > 0) requestAnimationFrame(tick);
      else scene.remove(hint);
    };
    tick();
  }

  function unlockPortal() {
    gameState.portalUnlocked = true;
    portal.visible = true;
    cameraRig.shake = 0.4;
    emitParticles(portal.position.clone().add(new THREE.Vector3(0, 2.3, 0)), 50, 0x9ae6ff);
  }

  function completeGame() {
    gameState.gameCompleted = true;
    awardXP(200, "MISSION COMPLETE +200 XP");
    showDialogue("George: We fixed the world of numbers!");
    playSound("victory");
    player.celebrateTimer = 5;
    setTimeout(() => {
      victoryScreen.classList.remove("hidden");
    }, 600);
  }

  function awardXP(amount, label) {
    gameState.xp += amount;
    xpEl.textContent = `⚡ XP ${gameState.xp}`;
    xpEl.classList.add("bump");
    setTimeout(() => xpEl.classList.remove("bump"), 200);
    showEventText(label);
    playSound("xp");
  }

  let dialogueTimer = 0;
  function showDialogue(text, duration = 2.6) {
    dialogueEl.textContent = text;
    dialogueEl.classList.add("show");
    dialogueTimer = duration;
  }

  let eventTimer = 0;
  function showEventText(text, duration = 1.2) {
    eventEl.textContent = text;
    eventEl.classList.add("show");
    eventTimer = duration;
  }

  function emitParticles(position, count, color) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.05, 6, 6),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
      );
      mesh.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.2, (Math.random() - 0.5) * 0.5));
      scene.add(mesh);
      particles.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 5, 2 + Math.random() * 4, (Math.random() - 0.5) * 5),
        life: 1 + Math.random() * 0.9,
        maxLife: 1.8,
      });
    }
  }

  function brightenWorld(amount) {
    ambientLight.intensity = Math.min(1.2, ambientLight.intensity + amount);
    dirLight.intensity = Math.min(1.05, dirLight.intensity + amount * 0.7);
    scene.fog.near = Math.max(20, scene.fog.near - 1.5);
    scene.fog.far = Math.min(120, scene.fog.far + 8);
  }

  function playSound(type) {
    if (muted || !audioCtx) return;
    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.connect(audioCtx.destination);

    const tones = {
      pickup: [660, 0.08, "triangle", 0.05],
      correct: [520, 0.15, "sine", 0.07],
      wrong: [190, 0.22, "square", 0.06],
      xp: [780, 0.08, "triangle", 0.035],
      jump: [380, 0.06, "sine", 0.03],
      portal: [220, 0.55, "sawtooth", 0.06],
      victory: [440, 0.18, "triangle", 0.09],
    };
    const [freq, dur, wave, vol] = tones[type] || tones.xp;

    const osc = audioCtx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.4, now + dur);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + dur);
  }

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.033);

    updatePlayer(dt);
    updateCamera(dt);
    updateFloating(dt);
    updateInteractions();

    if (dialogueTimer > 0) {
      dialogueTimer -= dt;
      if (dialogueTimer <= 0) dialogueEl.classList.remove("show");
    }
    if (eventTimer > 0) {
      eventTimer -= dt;
      if (eventTimer <= 0) eventEl.classList.remove("show");
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function init() {
    setupInput();
    createWorld();
    createPlayer();
    showDialogue("George: The numbers are scrambled… let's fix them!");
    window.addEventListener("resize", onResize);
    animate();
  }

  init();
})();
