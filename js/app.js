(function () {
  "use strict";

  const DATA = window.SKELETON_DATA;
  if (!DATA) {
    console.error("SKELETON_DATA is missing");
    return;
  }

  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  function titleCase(text) {
    return String(text || "")
      .split(" ")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
  }

  const els = {
    canvas: $("scene"),
    viewport: $("viewport"),
    loader: $("loader"),
    progressFill: $("progressFill"),
    progressCount: $("progressCount"),
    progressPct: $("progressPct"),
    loaderStatus: $("loaderStatus"),
    panel: $("panel"),
    panelClose: $("panelClose"),
    backBtn: $("backBtn"),
    resetBtn: $("resetBtn"),
    indexOpen: $("indexOpen"),
    mobileIndex: $("mobileIndex"),
    indexClose: $("indexClose"),
    indexDrawer: $("indexDrawer"),
    scrim: $("scrim"),
    searchInput: $("searchInput"),
    categoryChips: $("categoryChips"),
    boneList: $("boneList"),
    drawerCount: $("drawerCount"),
    indexCount: $("indexCount"),
    statusPill: $("statusPill"),
    statusText: $("statusText"),
    statBones: $("statBones"),
    hint: $("hint"),
    hintText: $("hintText"),
    boneName: $("boneName"),
    boneLatin: $("boneLatin"),
    boneRegion: $("boneRegion"),
    boneSide: $("boneSide"),
    boneGroup: $("boneGroup"),
    boneIsolate: $("boneIsolate"),
    modeHint: $("modeHint"),
    switchBtn: $("switchBtn"),
    resetNote: $("resetNote"),
    boneDesc: $("boneDesc"),
    boneFeatures: $("boneFeatures"),
    boneFact: $("boneFact"),
    profileNo: $("profileNo"),
    profileTotal: $("profileTotal"),
    modelFile: $("modelFile"),
    locatorDot: $("locatorDot"),
    locatorRing: $("locatorRing"),
    tooltip: $("tooltip"),
    tooltipName: $("tooltipName"),
    tooltipLatin: $("tooltipLatin"),
    toast: $("toast")
  };

  els.panel.inert = true;
  els.indexDrawer.inert = true;
  els.indexCount.textContent = DATA.stats.uniqueBones;
  els.drawerCount.textContent = DATA.stats.uniqueBones;
  els.statBones.textContent = DATA.stats.uniqueBones;
  els.profileTotal.textContent = DATA.stats.uniqueBones;
  els.hintText.textContent = "拖拽旋转 · 方向键平移 · 滚轮缩放 · 双击单骨";

  const entries = DATA.entries;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const byFile = new Map();
  entries.forEach((entry) => entry.files.forEach((f) => byFile.set(f, entry)));
  entries.forEach((entry) => { entry.meshes = []; });

  const CATEGORY_ORDER = ["skull", "spine", "ribs", "upper", "lower"];
  const CATEGORY_LABELS = {
    skull: "颅骨",
    spine: "脊柱",
    ribs: "胸廓",
    upper: "上肢",
    lower: "下肢"
  };
  const SIDE_LABELS = {
    left: "左侧 · LEFT",
    right: "右侧 · RIGHT",
    median: "中轴 · AXIAL"
  };

  const state = {
    ready: false,
    selectedEntry: null,
    selectedSet: new Set(),
    hoveredEntry: null,
    meshes: [],
    totalParts: DATA.stats.meshFiles,
    loadedParts: 0,
    failedParts: 0,
    animating: false,
    cameraRaf: 0,
    bodyBox: null,
    bodyHeight: 170,
    homePos: null,
    homeTarget: null,
    filterCategory: "all",
    filterQuery: "",
    down: null,
    warnedRotation: false,
    isolationMode: "none",
    contextIds: new Set(),
    clickTimer: 0,
    pendingBoneClick: null,
    cameraKeys: new Set(),
    lastFrame: 0
  };

  let renderer, scene, camera, controls, skeletonGroup, raycaster;
  let objLoader;
  let toastTimer = 0;

  /* ============================================================
     UI: 索引 / 搜索 / 分类
     ============================================================ */
  function createChips() {
    const all = document.createElement("button");
    all.type = "button";
    all.className = "chip is-active";
    all.dataset.cat = "all";
    all.innerHTML = `全部 <b>${DATA.stats.uniqueBones}</b>`;
    all.addEventListener("click", () => setCategoryFilter("all"));
    els.categoryChips.appendChild(all);

    CATEGORY_ORDER.forEach((cat) => {
      const info = DATA.categories[cat];
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.cat = cat;
      b.innerHTML = `${info.name} <b>${info.count}</b>`;
      b.addEventListener("click", () => setCategoryFilter(cat));
      els.categoryChips.appendChild(b);
    });
  }

  function setCategoryFilter(cat) {
    state.filterCategory = cat;
    els.categoryChips.querySelectorAll(".chip").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.cat === cat);
    });
    renderList(true);
  }

  function visibleEntries() {
    const q = state.filterQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (state.filterCategory !== "all" && entry.category !== state.filterCategory) return false;
      if (!q) return true;
      const haystack = `${entry.label} ${entry.labelEn} ${entry.groupName} ${entry.files.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }

  function renderList(resetScroll = false) {
    const list = visibleEntries();
    els.drawerCount.textContent = list.length;
    els.boneList.innerHTML = "";

    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "没有找到匹配的骨骼";
      els.boneList.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    CATEGORY_ORDER.forEach((cat) => {
      const catEntries = list.filter((e) => e.category === cat);
      if (!catEntries.length) return;

      const block = document.createElement("div");
      block.className = "cat-block";
      const head = document.createElement("div");
      head.className = "cat-head";
      const cn = document.createElement("span");
      cn.className = "cn";
      cn.textContent = DATA.categories[cat].name;
      const lat = document.createElement("span");
      lat.className = "lat";
      lat.textContent = DATA.categories[cat].latin;
      const count = document.createElement("span");
      count.className = "count";
      count.textContent = String(catEntries.length).padStart(2, "0");
      head.append(cn, lat, count);
      block.appendChild(head);

      catEntries.forEach((entry) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "bone-row";
        row.dataset.id = entry.id;
        const left = document.createElement("span");
        left.className = "cn";
        if (entry.side !== "median") {
          const mark = document.createElement("i");
          mark.className = "side-mark" + (entry.side === "right" ? " right" : "");
          left.appendChild(mark);
        }
        left.appendChild(document.createTextNode(entry.label));
        const right = document.createElement("span");
        right.className = "en";
        right.textContent = entry.labelEn;
        row.append(left, right);
        row.addEventListener("click", () => {
          closeDrawer(false);
          selectEntry(entry, { source: "index" });
        });
        block.appendChild(row);
      });

      fragment.appendChild(block);
    });

    els.boneList.appendChild(fragment);
    if (resetScroll) els.boneList.scrollTop = 0;
    updateActiveRow(false);
  }

  function updateActiveRow(scroll = true) {
    const rows = els.boneList.querySelectorAll(".bone-row");
    rows.forEach((row) => {
      const active = state.selectedEntry && row.dataset.id === state.selectedEntry.id;
      row.classList.toggle("is-active", !!active);
      if (active && scroll) {
        row.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      }
    });
  }

  let searchTimer = 0;
  els.searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.filterQuery = els.searchInput.value;
      renderList(true);
    }, 60);
  });

  function openDrawer() {
    clearPendingClick();
    state.cameraKeys.clear();
    if (state.selectedEntry) {
      els.panel.inert = true;
      els.panel.setAttribute("aria-hidden", "true");
    }
    document.body.classList.add("drawer-open");
    els.indexDrawer.setAttribute("aria-hidden", "false");
    els.indexDrawer.inert = false;
    els.indexOpen.classList.add("is-active");
    els.indexOpen.setAttribute("aria-expanded", "true");
    els.mobileIndex.setAttribute("aria-expanded", "true");
    els.boneList.scrollTop = 0;
    updateActiveRow(false);
    window.setTimeout(() => els.searchInput.focus({ preventScroll: true }), reduceMotion ? 0 : 300);
  }

  function closeDrawer(focusToggle = true) {
    if (!document.body.classList.contains("drawer-open")) return;
    document.body.classList.remove("drawer-open");
    els.indexDrawer.setAttribute("aria-hidden", "true");
    els.indexDrawer.inert = true;
    els.indexOpen.classList.remove("is-active");
    els.indexOpen.setAttribute("aria-expanded", "false");
    els.mobileIndex.setAttribute("aria-expanded", "false");
    if (state.selectedEntry && document.body.classList.contains("panel-open")) {
      els.panel.inert = false;
      els.panel.setAttribute("aria-hidden", "false");
    }
    if (focusToggle) {
      const target = window.innerWidth <= 860 ? els.mobileIndex : els.indexOpen;
      target.focus({ preventScroll: true });
    }
  }

  els.indexOpen.addEventListener("click", openDrawer);
  els.mobileIndex.addEventListener("click", openDrawer);
  els.switchBtn.addEventListener("click", openDrawer);
  els.indexClose.addEventListener("click", () => closeDrawer());
  els.scrim.addEventListener("click", () => closeDrawer());

  /* ============================================================
     Three.js 初始化
     ============================================================ */
  function initThree() {
    renderer = new THREE.WebGLRenderer({
      canvas: els.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth <= 860 ? 1.6 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 6000);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.75;
    controls.panSpeed = 0.7;
    controls.minPolarAngle = 0.08;
    controls.maxPolarAngle = Math.PI * 0.9;
    controls.minDistance = 5;
    controls.maxDistance = 900;

    const hemi = new THREE.HemisphereLight(0xdcefe8, 0x0d1816, 0.18);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffd2a0, 1.05);
    key.position.set(-210, 190, 240);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x62b9b0, 0.18);
    fill.position.set(270, 70, 150);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x9df1e2, 1.65);
    rim.position.set(20, 150, -300);
    scene.add(rim);

    const top = new THREE.DirectionalLight(0xfff2dd, 0.12);
    top.position.set(0, 320, 50);
    scene.add(top);

    const under = new THREE.DirectionalLight(0x315e57, 0.08);
    under.position.set(0, -120, 90);
    scene.add(under);

    skeletonGroup = new THREE.Group();
    skeletonGroup.name = "skeletonRoot";
    scene.add(skeletonGroup);

    raycaster = new THREE.Raycaster();
    objLoader = new THREE.OBJLoader();

    window.addEventListener("resize", onResize);
    els.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    bindCanvasEvents();

    animate();
  }

  function onResize() {
    if (!renderer || !camera) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth <= 860 ? 1.6 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (!state.selectedEntry && state.ready) {
      fitHomeView(false);
    }
  }

  function moveCameraWithKeys(dt) {
    if (!dt || !state.cameraKeys.size) return;
    if (document.body.classList.contains("drawer-open")) return;

    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const horizontal =
      (state.cameraKeys.has("ArrowRight") ? 1 : 0) -
      (state.cameraKeys.has("ArrowLeft") ? 1 : 0);
    const vertical =
      (state.cameraKeys.has("ArrowUp") ? 1 : 0) -
      (state.cameraKeys.has("ArrowDown") ? 1 : 0);

    if (!horizontal && !vertical) return;

    const pan = new THREE.Vector3()
      .addScaledVector(right, horizontal)
      .addScaledVector(up, vertical);
    if (pan.lengthSq() < 1e-8) return;
    pan.normalize();

    /* 速度随镜头距离缩放，远看全身时移动快，近看长骨时更精细 */
    const distance = camera.position.distanceTo(controls.target);
    const speed = Math.max(3, distance * 0.14);
    pan.multiplyScalar(speed * dt);

    camera.position.add(pan);
    controls.target.add(pan);
  }

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = state.lastFrame ? Math.min(0.05, (now - state.lastFrame) / 1000) : 0;
    state.lastFrame = now;
    if (controls && controls.enabled && !state.animating) {
      moveCameraWithKeys(dt);
      controls.update();
    }
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  /* ============================================================
     材质与视觉状态
     ============================================================ */
  const COLORS = {
    base: new THREE.Color(0xcdb792),
    hover: new THREE.Color(0xb39770),
    select: new THREE.Color(0x9c825f),
    isolated: new THREE.Color(0xc0a57c),
    single: new THREE.Color(0xa78a64),
    context: new THREE.Color(0x3b4a44),
    ghost: new THREE.Color(0x33433d),
    skullGhost: new THREE.Color(0x53675e),
    dim: new THREE.Color(0x25312e)
  };
  const EMISSIVE = {
    base: 0x0b1412,
    hover: 0x29554e,
    select: 0x1b403a,
    isolated: 0x24564d,
    single: 0x1c463e,
    dim: 0x000000
  };

  function newBoneMaterial() {
    return new THREE.MeshStandardMaterial({
      color: COLORS.base.clone(),
      roughness: 0.68,
      metalness: 0.02,
      emissive: new THREE.Color(EMISSIVE.base),
      emissiveIntensity: 0.08
    });
  }

  function setMeshState(mesh, mode) {
    const mat = mesh.material;
    if (!mat) return;

    /* 每次切换先恢复不透明，避免 ghost 状态污染其他模式 */
    mat.transparent = false;
    mat.opacity = 1;
    mat.depthWrite = true;

    if (mode === "ghost") {
      mat.color.copy(COLORS.ghost);
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
      mat.roughness = 0.98;
      mat.metalness = 0;
      mat.transparent = true;
      mat.opacity = 0.1;
      mat.depthWrite = false;
    } else if (mode === "skullGhost") {
      mat.color.copy(COLORS.skullGhost);
      mat.emissive.setHex(0x061512);
      mat.emissiveIntensity = 0.03;
      mat.roughness = 0.92;
      mat.metalness = 0;
      mat.transparent = true;
      mat.opacity = 0.28;
      mat.depthWrite = false;
    } else if (mode === "dim") {
      mat.color.copy(COLORS.dim);
      mat.emissive.setHex(EMISSIVE.dim);
      mat.emissiveIntensity = 0;
      mat.roughness = 0.95;
      mat.metalness = 0;
    } else if (mode === "isolated") {
      mat.color.copy(COLORS.isolated);
      mat.emissive.setHex(EMISSIVE.isolated);
      mat.emissiveIntensity = 0.08;
      mat.roughness = 0.58;
      mat.metalness = 0.03;
    } else if (mode === "single") {
      mat.color.copy(COLORS.single);
      mat.emissive.setHex(EMISSIVE.single);
      mat.emissiveIntensity = 0.045;
      mat.roughness = 0.7;
      mat.metalness = 0.02;
    } else if (mode === "context") {
      mat.color.copy(COLORS.context);
      mat.emissive.setHex(0x000000);
      mat.emissiveIntensity = 0;
      mat.roughness = 0.92;
      mat.metalness = 0;
    } else if (mode === "selected") {
      mat.color.copy(COLORS.select);
      mat.emissive.setHex(EMISSIVE.select);
      mat.emissiveIntensity = 0.07;
      mat.roughness = 0.68;
      mat.metalness = 0.03;
    } else if (mode === "hover") {
      mat.color.copy(COLORS.hover);
      mat.emissive.setHex(EMISSIVE.hover);
      mat.emissiveIntensity = 0.07;
      mat.roughness = 0.6;
      mat.metalness = 0.03;
    } else {
      mat.color.copy(COLORS.base);
      mat.emissive.setHex(EMISSIVE.base);
      mat.emissiveIntensity = 0.14;
      mat.roughness = 0.68;
      mat.metalness = 0.02;
    }
  }

  function applyBaseMaterials() {
    state.isolationMode = "none";
    state.contextIds.clear();
    state.meshes.forEach((mesh) => {
      mesh.visible = true;
      setMeshState(mesh, "base");
    });
    state.selectedSet.clear();
  }

  function applySelectionMaterials(mode, contextEntries = []) {
    const selected = state.selectedEntry;
    const selectedIsSkull = !!selected && selected.category === "skull";
    state.isolationMode = mode;
    state.selectedSet = new Set(selected ? selected.meshes : []);
    const contextIds = new Set(contextEntries.map((entry) => entry.id));
    state.contextIds = contextIds;

    state.meshes.forEach((mesh) => {
      const meshEntry = byId.get(mesh.userData.entryId);
      if (state.selectedSet.has(mesh)) {
        mesh.visible = true;
        setMeshState(mesh, mode === "single" ? "single" : mode === "context" ? "isolated" : "selected");
      } else if (mode === "single") {
        if (selectedIsSkull && meshEntry && meshEntry.category === "skull") {
          /* 头骨单骨隔离：其余头骨半透明，便于观察位置与形态 */
          mesh.visible = true;
          setMeshState(mesh, "skullGhost");
        } else {
          mesh.visible = false;
        }
      } else if (mode === "context") {
        /* 区域参照：本区域用暗色实体，其他区域保留为可点击的淡色轮廓 */
        mesh.visible = true;
        if (meshEntry && contextIds.has(meshEntry.id)) {
          setMeshState(mesh, selectedIsSkull ? "skullGhost" : "context");
        } else {
          setMeshState(mesh, "ghost");
        }
      } else {
        mesh.visible = true;
        setMeshState(mesh, "dim");
      }
    });
  }

  /* ============================================================
     加载 OBJ 模型
     ============================================================ */
  async function unpackEmbeddedModels() {
    const encoded = window.__SKELETON_MODELS_GZIP_B64__;
    if (!encoded) throw new Error("内嵌模型数据未加载");
    if (typeof DecompressionStream === "undefined") {
      throw new Error("当前浏览器不支持 DecompressionStream，请使用新版 Chrome、Edge、Firefox 或 Safari");
    }

    els.loaderStatus.textContent = "解压内嵌模型数据…";
    await new Promise((resolve) => setTimeout(resolve, 0));

    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    const payload = await new Response(stream).json();
    window.__SKELETON_MODELS_GZIP_B64__ = null;
    return payload;
  }

  async function loadModelFile(entry, file, textMap) {
    const text = textMap[file];
    if (!text) throw new Error(`缺少模型数据: ${file}`);

    const object = objLoader.parse(text);
    object.name = file;
    object.scale.setScalar(0.1);
    object.rotation.x = -Math.PI / 2;
    object.updateMatrixWorld(true);

    let meshCount = 0;
    object.traverse((child) => {
      if (!child.isMesh) return;
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      const material = newBoneMaterial();
      child.material = material;
      child.userData.entryId = entry.id;
      child.userData.file = file;
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = true;
      state.meshes.push(child);
      entry.meshes.push(child);
      meshCount++;
    });

    if (!meshCount) throw new Error(`OBJ 中没有网格: ${file}`);
    skeletonGroup.add(object);
    return true;
  }

  async function loadAllModels() {
    const textMap = await unpackEmbeddedModels();
    const queue = [];
    entries.forEach((entry) => {
      entry.files.forEach((file) => queue.push({ entry, file }));
    });
    state.totalParts = queue.length;
    els.loaderStatus.textContent = "正在构建 3D 骨骼…";

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        await loadModelFile(item.entry, item.file, textMap);
      } catch (err) {
        state.failedParts++;
        console.warn("模型加载失败:", item.file, err);
      }
      state.loadedParts++;
      updateProgress(item.entry, item.file);
      if (i % 2 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  function updateProgress(entry, file) {
    const done = state.loadedParts;
    const total = state.totalParts;
    const pct = total ? Math.round((done / total) * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
    els.progressCount.textContent = `${done} / ${total}`;
    els.progressPct.textContent = `${pct}%`;
    els.loaderStatus.textContent = `${entry.label} · ${file}`;
  }

  function finishLoading() {
    if (!state.meshes.length) {
      els.loaderStatus.textContent = "模型数据解析失败，请刷新页面重试";
      return;
    }

    skeletonGroup.updateMatrixWorld(true);
    const rawBox = new THREE.Box3().setFromObject(skeletonGroup);
    const center = rawBox.getCenter(new THREE.Vector3());
    skeletonGroup.position.x -= center.x;
    skeletonGroup.position.z -= center.z;
    skeletonGroup.position.y -= rawBox.min.y;
    skeletonGroup.updateMatrixWorld(true);

    state.bodyBox = new THREE.Box3().setFromObject(skeletonGroup);
    state.bodyHeight = Math.max(1, state.bodyBox.max.y - state.bodyBox.min.y);

    fitHomeView(true);
    state.ready = true;
    els.loaderStatus.textContent = "模型已就绪";
    document.body.classList.add("is-ready");

    window.setTimeout(() => {
      els.loader.classList.add("is-hidden");
      if (state.failedParts > 0) {
        showToast(`有 ${state.failedParts} 个模型部件加载失败，其余骨骼可正常浏览`);
      }
      applyHash();
    }, reduceMotion ? 50 : 450);

    window.__SKELETON_APP__ = {
      state,
      entries,
      selectEntry,
      resetView,
      fitHomeView,
      camera: () => camera,
      home: () => ({ pos: state.homePos, target: state.homeTarget })
    };
  }

  /* ============================================================
     相机
     ============================================================ */
  function fitHomeView(resetCamera) {
    if (!state.bodyBox) return;
    const width = state.bodyBox.max.x - state.bodyBox.min.x;
    const height = state.bodyHeight;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const fitHeight = (height * 0.5) / Math.tan(vFov / 2);
    const fitWidth = (width * 0.5) / (Math.tan(vFov / 2) * camera.aspect);
    const margin = window.innerWidth <= 860 ? 1.27 : 1.18;
    const distance = Math.max(fitHeight, fitWidth) * margin;
    const target = new THREE.Vector3(0, state.bodyBox.min.y + height * 0.515, 0);
    const pos = new THREE.Vector3(0, target.y + height * 0.025, distance);

    state.homeTarget = target.clone();
    state.homePos = pos.clone();
    controls.minDistance = Math.max(4, height * 0.12);
    controls.maxDistance = Math.max(400, height * 5.2);

    if (resetCamera !== false) {
      cancelCameraAnimation();
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.enabled = true;
      camera.lookAt(target);
      controls.update();
    }
  }

  function cancelCameraAnimation() {
    if (state.cameraRaf) cancelAnimationFrame(state.cameraRaf);
    state.cameraRaf = 0;
    state.animating = false;
    if (controls) controls.enabled = true;
  }

  function animateCamera(endPos, endTarget, duration) {
    cancelCameraAnimation();
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const d = reduceMotion ? 0 : duration;
    if (!d) {
      camera.position.copy(endPos);
      controls.target.copy(endTarget);
      camera.lookAt(endTarget);
      controls.enabled = true;
      controls.update();
      return;
    }

    state.animating = true;
    controls.enabled = false;
    const start = performance.now();

    function tick(now) {
      const t = Math.min(1, (now - start) / d);
      const e = easeInOutCubic(t);
      camera.position.lerpVectors(startPos, endPos, e);
      controls.target.lerpVectors(startTarget, endTarget, e);
      camera.lookAt(controls.target);
      if (t < 1) {
        state.cameraRaf = requestAnimationFrame(tick);
      } else {
        state.cameraRaf = 0;
        state.animating = false;
        camera.position.copy(endPos);
        controls.target.copy(endTarget);
        controls.enabled = true;
        controls.update();
      }
    }
    state.cameraRaf = requestAnimationFrame(tick);
  }

  function focusCameraOnBox(box, duration = 1050, viewDirOverride = null) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const tan = Math.tan(vFov / 2);
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const mobile = viewportW <= 860;

    let targetH;
    let targetW;
    if (mobile) {
      const panelH = Math.min(viewportH * 0.56, 470);
      const freeH = Math.max(180, viewportH - panelH);
      targetH = Math.min(300, freeH * 0.64);
      targetW = viewportW * 0.82;
    } else {
      const freeW = Math.max(420, viewportW - 408 - 70);
      targetH = Math.min(620, viewportH * 0.6);
      targetW = freeW * 0.82;
    }

    /* 用包围盒而不是包围球拟合，细长的股骨/肋骨才不会过度缩小 */
    const fitHeight = (size.y * 0.5 * viewportH) / (tan * Math.max(1, targetH));
    const fitWidth = (size.x * 0.5 * viewportW) / (tan * camera.aspect * Math.max(1, targetW));
    let distance = clamp(Math.max(fitHeight, fitWidth) * 1.12, 8, mobile ? 800 : 500);
    if (mobile) distance = Math.max(8, distance * 0.78);

    let dir = viewDirOverride
      ? viewDirOverride.clone()
      : camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.05, 1);
    dir.normalize();
    if (!viewDirOverride) {
      /* 从当前视角继续观察；略抬高，避免贴着轴线看扁 */
      dir.y += 0.04;
      dir.normalize();
    }

    const endPos = center.clone().add(dir.multiplyScalar(distance));
    animateCamera(endPos, center, duration);
  }

  /* ============================================================
     选择 / 复位 / 面板
     ============================================================ */
  function entryBox(entry) {
    const box = new THREE.Box3();
    entry.meshes.forEach((mesh) => box.expandByObject(mesh));
    return box;
  }

  function updatePanel(entry) {
    const group = DATA.groups[entry.group] || DATA.groups.skull;
    const category = DATA.categories[entry.category] || { name: entry.category, latin: "" };
    els.boneName.textContent = entry.label;
    const enLower = entry.labelEn.toLowerCase();
    const latinLower = group.latin.toLowerCase();
    els.boneLatin.textContent = enLower === latinLower || enLower.includes(latinLower)
      ? group.latin
      : `${group.latin} · ${titleCase(entry.labelEn)}`;
    els.boneRegion.textContent = category.name;
    els.boneSide.textContent = SIDE_LABELS[entry.side] || SIDE_LABELS.median;
    els.boneGroup.textContent = group.name;
    const cleanLabel = entry.label.replace(/^[左右]/, "").replace(/\s+/g, "");
    const cleanGroup = group.name.replace(/\s+/g, "");
    els.boneGroup.style.display = cleanLabel === cleanGroup || group.name === category.name ? "none" : "";
    els.boneDesc.textContent = group.desc;
    els.boneFact.textContent = group.fact;
    els.modelFile.textContent = entry.files.join(" · ");
    els.profileNo.textContent = String(entry.order + 1).padStart(2, "0");

    els.boneFeatures.innerHTML = "";
    group.features.forEach((text, i) => {
      const li = document.createElement("li");
      const num = document.createElement("span");
      num.className = "f-num";
      num.textContent = `0${i + 1}`;
      const p = document.createElement("p");
      p.textContent = text;
      li.append(num, p);
      els.boneFeatures.appendChild(li);
    });

    els.panel.classList.remove("is-switching");
    void els.panel.offsetWidth;
    els.panel.classList.add("is-switching");
    window.setTimeout(() => els.panel.classList.remove("is-switching"), 420);
    els.panel.scrollTop = 0;
    const scroller = els.panel.querySelector(".panel-scroll");
    if (scroller) scroller.scrollTop = 0;
  }

  function updateLocator(box) {
    if (!state.bodyBox) return;
    const center = box.getCenter(new THREE.Vector3());
    const nx = clamp((center.x - state.bodyBox.min.x) / Math.max(0.001, state.bodyBox.max.x - state.bodyBox.min.x), 0, 1);
    const ny = clamp((center.y - state.bodyBox.min.y) / Math.max(0.001, state.bodyHeight), 0, 1);
    const left = clamp(50 + (nx - 0.5) * 52, 10, 90);
    const top = clamp(100 - ny * 87, 8, 96);
    els.locatorDot.style.left = `${left}%`;
    els.locatorDot.style.top = `${top}%`;
    els.locatorRing.style.left = `${left}%`;
    els.locatorRing.style.top = `${top}%`;
  }

  function boxForEntries(list) {
    const box = new THREE.Box3();
    list.forEach((entry) => {
      entry.meshes.forEach((mesh) => box.expandByObject(mesh));
    });
    return box;
  }

  function contextFor(entry) {
    const cat = entry.category;
    const group = entry.group;
    const side = entry.side;
    let context = [];

    if (cat === "skull") {
      context = entries.filter((e) => e.category === "skull");
    } else if (cat === "spine") {
      if (group === "cervical" || group === "thoracic" || group === "lumbar") {
        context = entries.filter((e) => e.group === group);
      } else if (group === "sacrum") {
        context = entries.filter((e) => e.group === "sacrum" || e.group === "hip");
      } else {
        context = entries.filter((e) => e.category === "spine");
      }
    } else if (cat === "ribs") {
      context = entries.filter((e) => e.category === "ribs");
    } else if (cat === "upper") {
      /* 上肢 + 手部：同侧肩带、上臂、前臂与整只手 */
      context = entries.filter((e) => e.category === "upper" && e.side === side);
    } else if (cat === "lower") {
      /* 下肢 + 足部：同侧髋骨、大腿、小腿与整只脚 */
      context = entries.filter((e) => e.category === "lower" && e.side === side);
    } else {
      context = entries.filter((e) => e.category === cat);
    }

    if (!context.length) context = [entry];
    return context;
  }

  function contextLabelFor(entry) {
    const side = entry.side === "left" ? "左" : entry.side === "right" ? "右" : "";
    if (entry.category === "skull") return "头骨";
    if (entry.category === "ribs") return "胸廓";
    if (entry.category === "spine") {
      if (entry.group === "sacrum") return "骶骨与骨盆";
      return entry.groupName;
    }
    if (entry.category === "upper") {
      return side + "上肢与手部";
    }
    if (entry.category === "lower") {
      return side + "下肢与足部";
    }
    return "区域";
  }

  function skullBounds() {
    const box = new THREE.Box3();
    entries.forEach((entry) => {
      if (entry.category === "skull") {
        entry.meshes.forEach((mesh) => box.expandByObject(mesh));
      }
    });
    return box;
  }

  function skullViewDirection(entry, skullBox) {
    const skullCenter = skullBox.getCenter(new THREE.Vector3());
    const boneCenter = entryBox(entry).getCenter(new THREE.Vector3());
    const offset = boneCenter.clone().sub(skullCenter);
    if (offset.lengthSq() < 1e-4) {
      return new THREE.Vector3(0, 0.08, 1).normalize();
    }
    const dir = offset.normalize();
    /* 从所选骨块所在的方向观察，额骨偏前、枕骨偏后、顶骨偏侧 */
    dir.y = Math.max(dir.y, 0.06);
    return dir.normalize();
  }

  function selectEntry(entry, opts = {}) {
    clearPendingClick();
    state.cameraKeys.clear();
    if (!state.ready || !entry) return;
    if (!entry.meshes || !entry.meshes.length) {
      showToast("该骨骼模型未能载入，请检查模型文件");
      return;
    }
    if (state.selectedEntry === entry && !opts.force) {
      resetView();
      return;
    }

    state.selectedEntry = entry;
    state.hoveredEntry = null;
    hideTooltip();

    const isSkull = entry.category === "skull";
    const mode = opts.singleBone ? "single" : "context";
    const context = contextFor(entry);
    applySelectionMaterials(mode, context);
    updatePanel(entry);
    updateLocator(entryBox(entry));

    let focusBox = mode === "single" ? entryBox(entry) : boxForEntries(context);
    let viewDir = null;
    if (isSkull) {
      const skullBox = mode === "single" ? skullBounds() : focusBox;
      viewDir = skullViewDirection(entry, skullBox);
    }

    const isolated = mode !== "none";
    document.body.classList.add("panel-open");
    document.body.classList.toggle("isolated", isolated);
    document.body.classList.toggle("single-isolated", mode === "single");
    document.body.classList.toggle("context-mode", mode === "context");
    els.boneIsolate.hidden = !isolated;
    els.modeHint.hidden = !(mode === "context" || (mode === "single" && isSkull));
    if (mode === "context") {
      els.modeHint.textContent = isSkull
        ? "半透明为其他头骨，淡色为身体其他区域，可直接点击切换"
        : "淡色轮廓为其他区域，可直接点击切换";
    } else if (mode === "single" && isSkull) {
      els.modeHint.textContent = "半透明为其他头骨，便于观察位置与形态";
    } else {
      els.modeHint.textContent = "";
    }

    if (mode === "context") {
      els.boneIsolate.textContent = isSkull ? "头骨模式 · 双击单骨" : "区域参照 · 双击单骨";
      els.boneIsolate.title = isSkull
        ? "其他头骨半透明；双击完全隔离该骨"
        : `区域参照：${contextLabelFor(entry)}；双击完全隔离该骨`;
      els.statusText.textContent = isSkull ? `头骨模式 · ${entry.label}` : `区域参照 · ${entry.label}`;
      els.resetNote.textContent = "单击返回 · 双击模型中的该骨进入单骨隔离";
    } else if (mode === "single") {
      els.boneIsolate.textContent = isSkull ? "单骨隔离 · 头骨半透明" : "单骨隔离 · 其他骨骼已隐藏";
      els.boneIsolate.title = isSkull ? "其余头骨半透明，便于观察位置与形态" : "仅显示当前骨块";
      els.statusText.textContent = `单骨隔离 · ${entry.label}`;
      els.resetNote.textContent = "再次点击该骨骼，或按 Esc 返回全身视图";
    } else {
      els.statusText.textContent = `聚焦 · ${entry.label}`;
      els.resetNote.textContent = "再次点击该骨骼，或按 Esc 返回全身视图";
    }
    els.panel.setAttribute("aria-hidden", "false");
    els.panel.inert = false;
    els.statusPill.classList.add("is-focus");
    els.hint.classList.add("is-hidden");
    closeDrawer(false);
    updateActiveRow();
    updateHash(entry.id);
    focusCameraOnBox(focusBox, 1050, viewDir);
  }

  function resetView(opts = {}) {
    clearPendingClick();
    state.cameraKeys.clear();
    if (!state.ready) return;
    const hadPanel = !!state.selectedEntry;
    if (!hadPanel && !document.body.classList.contains("panel-open") && !opts.force) {
      if (opts.closeDrawer !== false) closeDrawer();
      return;
    }

    state.selectedEntry = null;
    state.hoveredEntry = null;
    state.selectedSet.clear();
    applyBaseMaterials();
    hideTooltip();
    document.body.classList.remove("panel-open", "isolated", "single-isolated", "context-mode");
    els.boneIsolate.hidden = true;
    els.modeHint.hidden = true;
    els.modeHint.textContent = "";
    els.resetNote.textContent = "再次点击该骨骼，或按 Esc 返回全身视图";
    els.panel.setAttribute("aria-hidden", "true");
    els.panel.inert = true;
    els.statusPill.classList.remove("is-focus");
    els.statusText.textContent = "全身视图 · OVERVIEW";
    els.hint.classList.remove("is-hidden");
    updateActiveRow(false);
    updateHash(null);
    if (opts.closeDrawer !== false) closeDrawer(false);

    if (state.homePos && state.homeTarget) {
      animateCamera(state.homePos, state.homeTarget, 950);
    }
  }

  els.panelClose.addEventListener("click", () => resetView());
  els.backBtn.addEventListener("click", () => resetView());
  els.resetBtn.addEventListener("click", () => {
    if (state.selectedEntry) resetView();
    else if (document.body.classList.contains("drawer-open")) closeDrawer();
    else {
      fitHomeView(true);
      showToast("视角已复位");
    }
  });

  /* ============================================================
     射线拾取 / 悬停 / 点击
     ============================================================ */
  function pointerToNdc(clientX, clientY) {
    const rect = els.canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function pick(clientX, clientY) {
    if (!state.meshes.length) return null;
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointerToNdc(clientX, clientY), camera);
    const hits = raycaster.intersectObjects(state.meshes, false);
    if (!hits.length) return null;

    let chosen = hits[0];
    if (state.isolationMode === "context" && state.contextIds.size) {
      /* 本区域骨骼优先于淡色其他区域，避免轮廓挡住参照区域的操作 */
      const primary = hits.find((hit) => {
        const entry = byId.get(hit.object.userData.entryId);
        return entry && state.contextIds.has(entry.id);
      });
      if (primary) chosen = primary;
    }

    const mesh = chosen.object;
    const id = mesh.userData.entryId;
    const entry = byId.get(id);
    return entry ? { entry, mesh, point: chosen.point } : null;
  }

  function clearHoverVisual() {
    if (!state.hoveredEntry) return;
    state.hoveredEntry.meshes.forEach((mesh) => {
      if (!state.selectedSet.has(mesh)) setMeshState(mesh, "base");
    });
    state.hoveredEntry = null;
  }

  function setHover(entry) {
    if (!entry) {
      clearHoverVisual();
      hideTooltip();
      return;
    }
    if (state.hoveredEntry === entry) return;
    clearHoverVisual();
    state.hoveredEntry = entry;
    entry.meshes.forEach((mesh) => setMeshState(mesh, "hover"));
  }

  function clearPendingClick() {
    if (state.clickTimer) {
      window.clearTimeout(state.clickTimer);
      state.clickTimer = 0;
    }
    state.pendingBoneClick = null;
  }

  function handleCanvasClick(clientX, clientY) {
    if (!state.ready || state.animating) return;
    const hit = pick(clientX, clientY);

    if (!hit) {
      clearPendingClick();
      if (state.selectedEntry) resetView();
      return;
    }

    const entry = hit.entry;
    const now = performance.now();
    if (
      state.pendingBoneClick &&
      state.pendingBoneClick.entry === entry &&
      now - state.pendingBoneClick.time <= 380
    ) {
      clearPendingClick();
      selectEntry(entry, { singleBone: true, force: true });
      return;
    }

    clearPendingClick();
    state.pendingBoneClick = { entry, time: now };
    state.clickTimer = window.setTimeout(() => {
      state.clickTimer = 0;
      const pending = state.pendingBoneClick;
      state.pendingBoneClick = null;
      if (!pending) return;
      if (state.selectedEntry === pending.entry) resetView();
      else selectEntry(pending.entry);
    }, 260);
  }

  let lastHoverCheck = 0;
  function bindCanvasEvents() {
    const canvas = els.canvas;

    canvas.addEventListener("pointerdown", (e) => {
      if (!state.ready) return;
      state.down = {
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        pointerId: e.pointerId,
        moved: false
      };
      hideTooltip();
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!state.ready) return;
      if (state.down) {
        const dx = e.clientX - state.down.x;
        const dy = e.clientY - state.down.y;
        if (Math.hypot(dx, dy) > 5) {
          state.down.moved = true;
          clearPendingClick();
          clearHoverVisual();
          hideTooltip();
          return;
        }
      }
      if (e.pointerType !== "mouse" || !finePointer) return;
      if (state.selectedEntry) {
        hideTooltip();
        return;
      }
      const now = performance.now();
      if (now - lastHoverCheck < 42) {
        if (els.tooltip.classList.contains("is-visible")) placeTooltip(e.clientX, e.clientY);
        return;
      }
      lastHoverCheck = now;
      const hit = pick(e.clientX, e.clientY);
      if (hit) {
        setHover(hit.entry);
        showTooltip(hit.entry, e.clientX, e.clientY);
        canvas.style.cursor = "pointer";
      } else {
        setHover(null);
        hideTooltip();
        canvas.style.cursor = "grab";
      }
    });

    canvas.addEventListener("pointerup", (e) => {
      const down = state.down;
      state.down = null;
      if (!state.ready || !down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      const moved = down.moved || Math.hypot(dx, dy) > 5;
      const elapsed = performance.now() - down.t;
      if (!moved && elapsed < 750) {
        handleCanvasClick(e.clientX, e.clientY);
      }
    });

    canvas.addEventListener("pointercancel", () => {
      state.down = null;
      clearHoverVisual();
      hideTooltip();
    });

    canvas.addEventListener("pointerleave", () => {
      state.down = null;
      clearHoverVisual();
      hideTooltip();
      els.canvas.style.cursor = "grab";
    });

    canvas.addEventListener("dblclick", (e) => {
      if (!state.ready) return;
      const hit = pick(e.clientX, e.clientY);
      if (!hit) return;
      if (state.selectedEntry === hit.entry && state.isolationMode === "single") return;
      clearPendingClick();
      selectEntry(hit.entry, { singleBone: true, force: true });
    });
  }

  function showTooltip(entry, x, y) {
    els.tooltipName.textContent = entry.label;
    els.tooltipLatin.textContent = titleCase(entry.labelEn);
    els.tooltip.classList.add("is-visible");
    placeTooltip(x, y);
  }

  function placeTooltip(x, y) {
    const pad = 15;
    const w = els.tooltip.offsetWidth || 170;
    const h = els.tooltip.offsetHeight || 78;
    let left = x + 18;
    let top = y + 18;
    if (left + w + pad > window.innerWidth) left = x - w - 18;
    if (top + h + pad > window.innerHeight) top = y - h - 18;
    els.tooltip.style.left = `${Math.max(pad, left)}px`;
    els.tooltip.style.top = `${Math.max(pad, top)}px`;
  }

  function hideTooltip() {
    els.tooltip.classList.remove("is-visible");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => els.toast.classList.remove("is-visible"), 3600);
  }

  /* ============================================================
     深链接
     ============================================================ */
  function updateHash(id) {
    try {
      if (id) history.replaceState(null, "", `#${id}`);
      else history.replaceState(null, "", `${location.pathname}${location.search}`);
    } catch (err) {
      /* ignore file:// or restricted history */
    }
  }

  function applyHash() {
    if (!state.ready) return;
    const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    if (!raw) return;
    const entry = byId.get(raw);
    if (entry) selectEntry(entry, { force: true });
  }

  window.addEventListener("hashchange", () => {
    const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    if (!raw) {
      if (state.selectedEntry) resetView();
      return;
    }
    const entry = byId.get(raw);
    if (entry && state.selectedEntry !== entry) selectEntry(entry, { force: true });
  });

  /* ============================================================
     键盘
     ============================================================ */
  document.addEventListener("keydown", (e) => {
    const inInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
    if (e.key === "Escape") {
      state.cameraKeys.clear();
      if (document.body.classList.contains("drawer-open")) {
        closeDrawer();
      } else if (state.selectedEntry) {
        resetView();
      }
      return;
    }
    if (inInput) return;
    if (document.body.classList.contains("drawer-open")) return;

    if (e.key === "/") {
      e.preventDefault();
      openDrawer();
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      state.cameraKeys.add(e.key);
      return;
    }

    if (state.selectedEntry && (e.key === "[" || e.key === "]")) {
      e.preventDefault();
      const idx = entries.indexOf(state.selectedEntry);
      const next = entries[(idx + (e.key === "]" ? 1 : -1) + entries.length) % entries.length];
      selectEntry(next, { force: true });
    }
  });

  document.addEventListener("keyup", (e) => {
    state.cameraKeys.delete(e.key);
  });

  window.addEventListener("blur", () => {
    state.cameraKeys.clear();
  });

  /* ============================================================
     启动
     ============================================================ */
  function boot() {
    createChips();
    renderList();
    initThree();
    loadAllModels()
      .then(finishLoading)
      .catch((err) => {
        console.error("加载流程失败:", err);
        els.loaderStatus.textContent = "加载失败：" + (err && err.message ? err.message : "未知错误");
        showToast("模型加载失败，请刷新重试");
      });
  }

  boot();
})();
















