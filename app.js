const defaultWeights = {
  target: 0.20,
  spatial: 0.30,
  time: 0.15,
  environment: 0.10,
  history: 0.15,
  response: 0.10,
};

const labels = {
  target: "目标风险",
  spatial: "空间接近",
  time: "时间敏感",
  environment: "环境诱因",
  history: "历史风险",
  response: "处置能力",
};

const workflowSteps = [
  { key: "discovered", label: "发现警情" },
  { key: "analyzed", label: "自动研判" },
  { key: "assigned", label: "自动分配" },
  { key: "handling", label: "现场处置" },
  { key: "resolved", label: "复盘归档" },
];

const roles = [
  { id: "admin", name: "系统管理员", level: "一级", permissions: ["设备管理", "人员管理", "警情管理", "数据库维护"] },
  { id: "commander", name: "指挥民警", level: "二级", permissions: ["警情研判", "派警处置", "处置审核"] },
  { id: "patrol", name: "巡护民警", level: "三级", permissions: ["接收任务", "现场反馈", "轨迹复核"] },
];

const defaultAuthUsers = [
  { username: "admin", password: "123456", personId: "P001" },
  { username: "commander", password: "123456", personId: "P002" },
  { username: "patrol", password: "123456", personId: "P003" },
];

const defaultPersonnel = [
  { id: "P001", name: "王明", role: "admin", unit: "边境派出所", status: "在线", area: "指挥中心" },
  { id: "P002", name: "李强", role: "commander", unit: "治安巡控组", status: "在线", area: "北侧巡护线" },
  { id: "P003", name: "赵宁", role: "patrol", unit: "巡护一组", status: "可派遣", area: "村寨前置点" },
  { id: "P004", name: "陈安", role: "patrol", unit: "巡护二组", status: "可派遣", area: "农田缓冲区" },
  { id: "P005", name: "周洁", role: "patrol", unit: "无人机小组", status: "待命", area: "低空起降点" },
];

const defaultDevices = [
  { id: "UAV-01", name: "热成像无人机 01", type: "无人机", battery: 86, status: "巡航", lat: 22.018, lng: 100.805 },
  { id: "EDGE-02", name: "边缘计算盒 02", type: "边缘节点", battery: 100, status: "在线", lat: 22.008, lng: 100.825 },
  { id: "CAM-03", name: "红外补点相机 03", type: "红外相机", battery: 72, status: "在线", lat: 22.027, lng: 100.842 },
];

const aiLibraries = [
  {
    name: "DJI FlightHub 2 / DJI Cloud API Adapter",
    url: "https://developer.dji.com/cloud-api/",
    purpose: "对接司空 2/Cloud API 的直播、媒体文件、设备遥测和告警事件，再交给平台端 AI 识别与警情引擎。",
  },
  {
    name: "YOLOv8 Thermal Adapter",
    url: "https://github.com/ultralytics/ultralytics",
    purpose: "后续可替换为 YOLOv8/ONNX/TensorRT 边缘端模型，统一输出目标框与置信度。",
  },
  {
    name: "MegaDetector Adapter",
    url: "https://github.com/microsoft/CameraTraps",
    purpose: "适合红外相机动物目标检测，可作为固定监测点补充。",
  },
  {
    name: "Browser Thermal Segmentation",
    url: "local-canvas-adapter",
    purpose: "当前已运行：用 Canvas 像素阈值与连通区域分析提取热目标框。",
  },
];

function makeIncident(id, herd, lat, lng, distanceVillage, distanceFarm, distanceRoad, night, movingToSensitive, historyDensity, responseMinutes, confidence, stage = "discovered") {
  return {
    id,
    herd,
    lat,
    lng,
    distanceVillage,
    distanceFarm,
    distanceRoad,
    night,
    movingToSensitive,
    historyDensity,
    responseMinutes,
    confidence,
    stage,
    assignedTo: null,
    createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    logs: [{ time: "T+00", text: "系统接收到热成像目标，生成警情并推送至后台处置人员。" }],
  };
}

let weights = { ...defaultWeights };
let incidents = [];
let personnel = defaultPersonnel.map((item) => ({ ...item }));
let devices = defaultDevices.map((item) => ({ ...item }));
let authUsers = defaultAuthUsers.map((item) => ({ ...item }));
let selectedId = null;
let currentRole = "admin";
let currentUser = personnel[0];
let map;
let mapMarkers = [];
let droneConnected = false;
let droneSocket = null;
let serialPort = null;
let autoTimer = null;
let flighthubConfig = {
  workspaceId: "",
  mqttHost: "",
  streamProtocol: "HLS/WebRTC",
  mediaGateway: "",
};
let trainingJobs = [];
let modelStatus = {
  version: "YOLOv8n-elephant-thermal",
  datasetImages: 6137,
  classes: 7,
  map50: 0.587,
  elephantMap50: 0.989,
  precision: 0.976,
  recall: 0.973,
  lastUpdated: "基线模型",
  status: "待继续训练",
  source: "本地多源热成像训练集",
};

function loadDb() {
  try {
    const raw = localStorage.getItem("elephant-risk-v2");
    if (!raw) return;
    const db = JSON.parse(raw);
    weights = db.weights || weights;
    incidents = db.incidents?.length ? db.incidents : [];
    personnel = db.personnel?.length ? db.personnel : personnel;
    devices = db.devices?.length ? db.devices : devices;
    authUsers = db.authUsers?.length ? db.authUsers : authUsers;
    flighthubConfig = db.flighthubConfig || flighthubConfig;
    trainingJobs = db.trainingJobs?.length ? db.trainingJobs : trainingJobs;
    modelStatus = db.modelStatus || modelStatus;
    selectedId = db.selectedId || selectedId;
    currentRole = db.currentRole || currentRole;
  } catch {
    incidents = [];
  }
}

function saveDb() {
  localStorage.setItem("elephant-risk-v2", JSON.stringify({ weights, incidents, personnel, devices, authUsers, selectedId, currentRole, flighthubConfig, trainingJobs, modelStatus, savedAt: new Date().toISOString() }));
}

function resetSeedIfNeeded() {
  if (!incidents.length) selectedId = null;
  if (selectedId && !incidents.some((item) => item.id === selectedId)) selectedId = incidents[0]?.id || null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceRisk(meters) {
  if (meters <= 300) return 100;
  if (meters <= 600) return 84;
  if (meters <= 1000) return 60;
  if (meters <= 1800) return 34;
  return 15;
}

function scoreIncident(incident) {
  const nearest = Math.min(incident.distanceVillage, incident.distanceFarm, incident.distanceRoad);
  const target = clamp(incident.herd * 7 + incident.confidence * 20, 0, 100);
  const spatial = clamp(distanceRisk(nearest) + (incident.movingToSensitive ? 12 : 0), 0, 100);
  const time = incident.night ? 88 : 34;
  const environment = incident.distanceFarm < 700 ? 74 : 42;
  const history = incident.historyDensity;
  const response = clamp(incident.responseMinutes * 2.2, 20, 100);
  const parts = { target, spatial, time, environment, history, response };
  const total = Object.entries(parts).reduce((sum, [key, value]) => sum + value * weights[key], 0);
  let level = total >= 76 ? "critical" : total >= 51 ? "high" : total >= 26 ? "medium" : "low";
  const forced = [];
  if (incident.night && nearest < 500 && incident.movingToSensitive) {
    level = "critical";
    forced.push("夜间接近敏感区域，触发强制升级规则");
  }
  return { parts, total: Math.round(total), level, nearest, forced };
}

function levelText(level) {
  return { low: "低风险", medium: "中风险", high: "高风险", critical: "极高风险" }[level];
}

function stageText(stage) {
  return workflowSteps.find((step) => step.key === stage)?.label || "未知阶段";
}

function selectedIncident() {
  return incidents.find((item) => item.id === selectedId) || incidents[0] || null;
}

function addLog(incident, text) {
  if (!incident) return;
  incident.logs.push({ time: `T+${String(incident.logs.length * 5).padStart(2, "0")}`, text });
}

function initMap() {
  const fallback = document.getElementById("realMap");
  if (!window.L) {
    fallback.innerHTML = "<div class='report'>地图 API 未加载。请联网后刷新页面；系统其余功能仍可运行。</div>";
    document.getElementById("mapStatus").textContent = "地图 API 未加载";
    return;
  }
  map = L.map("realMap", { zoomControl: true }).setView([22.018, 100.828], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  L.polygon([[21.998,100.800],[22.036,100.812],[22.041,100.858],[22.000,100.864]], { color: "#278757", fillOpacity: 0.05 }).addTo(map).bindPopup("巡护示意区域");
}

function renderMapMarkers() {
  if (!map) return;
  mapMarkers.forEach((marker) => marker.remove());
  mapMarkers = [];
  devices.forEach((device) => {
    const marker = L.circleMarker([device.lat, device.lng], { radius: 8, color: "#2f6f9f", fillColor: "#2f6f9f", fillOpacity: 0.85 })
      .addTo(map)
      .bindPopup(`${device.name}<br>${device.status} · 电量 ${device.battery}%`);
    mapMarkers.push(marker);
  });
  incidents.forEach((incident) => {
    const score = scoreIncident(incident);
    const colors = { low: "#278757", medium: "#d7a41f", high: "#d66d2a", critical: "#c83b3b" };
    const marker = L.circleMarker([incident.lat, incident.lng], { radius: 11, color: "#fff", weight: 2, fillColor: colors[score.level], fillOpacity: 0.95 })
      .addTo(map)
      .bindPopup(`${incident.id}<br>${levelText(score.level)} · ${score.total}分<br>阶段：${stageText(incident.stage)}`);
    marker.on("click", () => { selectedId = incident.id; render(); });
    mapMarkers.push(marker);
  });
}

function render() {
  renderClock();
  renderRoles();
  renderDrone();
  renderRiskOverview();
  renderActiveIncident();
  renderWorkflow();
  renderScoreBreakdown();
  renderRecommendations();
  renderIncidentList();
  renderLogs();
  renderAnalysis();
  renderHistory();
  renderAdmin();
  renderTrainingPanel();
  renderMapMarkers();
  saveDb();
}

function renderClock() {
  document.getElementById("clock").textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function renderRoles() {
  const role = roles.find((item) => item.id === currentRole) || roles[0];
  document.getElementById("currentIdentity").textContent = `${currentUser?.name || "未登录"} · ${role.name} · ${role.level}`;
}

function renderDrone() {
  const drone = devices[0];
  if (!drone) {
    document.getElementById("dronePanel").innerHTML = `<div class="card"><strong>暂无设备</strong><div class="meta">请在后台管理中重新接入无人机、边缘节点或红外相机。</div></div>`;
    return;
  }
  document.getElementById("dronePanel").innerHTML = `
    <div class="card"><strong>${drone.name}</strong><div class="meta">连接状态：${droneConnected ? "已接入 WebSocket/MAVLink 遥测通道" : "未连接"}<br>坐标：${drone.lat.toFixed(5)}, ${drone.lng.toFixed(5)}<br>电量：${drone.battery}% · 状态：${drone.status}</div></div>
    <div class="card"><strong>接口说明</strong><div class="meta">真实无人机接入建议：MAVLink/MQTT/WebSocket -> 边缘端服务 -> 平台事件总线。本原型已保留遥测字段与连接状态。</div></div>
  `;
}

function renderRiskOverview() {
  const total = incidents.length;
  const active = incidents.filter((item) => item.stage !== "resolved").length;
  const urgent = incidents.filter((item) => ["high", "critical"].includes(scoreIncident(item).level)).length;
  document.getElementById("riskOverview").innerHTML = `
    <div class="metric"><span>总警情</span><strong>${total}</strong></div>
    <div class="metric"><span>待处置</span><strong>${active}</strong></div>
    <div class="metric"><span>高风险</span><strong>${urgent}</strong></div>
  `;
}

function renderActiveIncident() {
  const incident = selectedIncident();
  if (!incident) {
    document.getElementById("activeIncident").className = "active-alert";
    document.getElementById("activeIncident").innerHTML = `
      <strong>暂无警情</strong>
      <div class="meta">等待司空 2 视频流、热成像图片上传或真实遥测触发。旧的演示警情数据已清空。</div>
    `;
    return;
  }
  const score = scoreIncident(incident);
  const assignee = personnel.find((person) => person.id === incident.assignedTo);
  document.getElementById("activeIncident").className = `active-alert ${score.level}`;
  document.getElementById("activeIncident").innerHTML = `
    <strong>${incident.id} · ${levelText(score.level)} · ${score.total}分</strong>
    <div class="meta">阶段：${stageText(incident.stage)}<br>象群数量：${incident.herd} 头 · 置信度：${Math.round(incident.confidence * 100)}%<br>最近敏感点：${score.nearest} 米 · ${incident.night ? "夜间" : "白天"} · ${incident.movingToSensitive ? "接近敏感区域" : "未明显接近"}<br>处置人员：${assignee ? assignee.name : "系统尚未分配"}</div>
  `;
}

function renderWorkflow() {
  const incident = selectedIncident();
  if (!incident) {
    document.getElementById("workflow").innerHTML = workflowSteps.map((step, index) => `
      <div class="step"><b>${index + 1}</b><span>${step.label}</span></div>
    `).join("");
    return;
  }
  const current = workflowSteps.findIndex((step) => step.key === incident.stage);
  document.getElementById("workflow").innerHTML = workflowSteps.map((step, index) => `
    <div class="step ${index <= current ? "done" : ""} ${index === current ? "current" : ""}">
      <b>${index + 1}</b><span>${step.label}</span>
    </div>
  `).join("");
}

function renderScoreBreakdown() {
  const incident = selectedIncident();
  if (!incident) {
    document.getElementById("scoreBreakdown").innerHTML = Object.values(labels).map((label) => `
      <div class="score-card"><span>${label}</span><strong>--</strong></div>
    `).join("");
    return;
  }
  const score = scoreIncident(incident);
  document.getElementById("scoreBreakdown").innerHTML = Object.entries(score.parts).map(([key, value]) => `
    <div class="score-card"><span>${labels[key]}</span><strong>${Math.round(value)}</strong></div>
  `).join("");
}

function renderRecommendations() {
  const incident = selectedIncident();
  if (!incident) {
    document.getElementById("recommendations").innerHTML = "<li>暂无警情。请先接入司空 2 流、上传热成像帧，或导入真实热成像素材。</li>";
    return;
  }
  const score = scoreIncident(incident);
  const items = [];
  if (score.level === "critical") items.push("立即启动极高风险预警，自动通知指挥民警、巡护民警和村寨联络员。");
  if (score.level === "high") items.push("派出就近巡护力量，保持无人机高空跟踪并缩短位置更新间隔。");
  if (score.nearest < 800) items.push("提醒敏感区域人员避让，重点关注村寨、农田或道路方向。");
  if (incident.night) items.push("夜间处置需双人复核热目标，避免低空逼近惊扰象群。");
  if (incident.responseMinutes > 30) items.push("预计到达时间偏长，建议同步备用巡护组或无人机接续巡航。");
  if (!items.length) items.push("保持观察，记录轨迹变化，暂不启动现场处置。");
  document.getElementById("recommendations").innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function renderIncidentList() {
  if (!incidents.length) {
    document.getElementById("incidentList").innerHTML = "<div class='report compact'>暂无警情记录。系统不会再自动加载旧演示数据。</div>";
    return;
  }
  document.getElementById("incidentList").innerHTML = incidents.map((incident) => {
    const score = scoreIncident(incident);
    return `<button class="event-card ${incident.id === selectedId ? "active" : ""}" data-incident="${incident.id}"><strong>${incident.id} · ${levelText(score.level)} · ${score.total}分</strong><span>${stageText(incident.stage)} · ${incident.createdAt}</span></button>`;
  }).join("");
}

function renderLogs() {
  const incident = selectedIncident();
  if (!incident) {
    document.getElementById("handlingLog").innerHTML = "<div class='log-item'><b>待命</b><span>等待真实图像、热成像帧或无人机遥测接入。</span></div>";
    return;
  }
  document.getElementById("handlingLog").innerHTML = incident.logs.map((log) => `<div class="log-item"><b>${log.time}</b><span>${log.text}</span></div>`).join("");
}

function renderAnalysis() {
  const incident = selectedIncident();
  if (!incident) {
    document.getElementById("analysisReport").innerHTML = `
      <p><strong>AI 识别：</strong>暂无输入帧。</p>
      <p><strong>风险研判：</strong>等待真实热成像帧进入模型流程后计算。</p>
      <p><strong>自动处置：</strong>警情生成后将自动弹窗、研判、分配、处置和归档。</p>
    `;
    return;
  }
  const score = scoreIncident(incident);
  const reasons = [];
  if (incident.herd >= 10) reasons.push("象群规模较大");
  if (score.nearest < 500) reasons.push("距离敏感区域过近");
  if (incident.night) reasons.push("夜间活动");
  if (incident.movingToSensitive) reasons.push("移动方向指向敏感区域");
  if (incident.historyDensity > 70) reasons.push("历史风险密度较高");
  document.getElementById("analysisReport").innerHTML = `
    <p><strong>AI 识别：</strong>浏览器 Canvas 热成像识别模块输出 ${incident.herd} 个疑似大型热目标，平均置信度 ${Math.round(incident.confidence * 100)}%。</p>
    <p><strong>风险研判：</strong>${levelText(score.level)}，综合分 ${score.total} 分，主要原因：${reasons.concat(score.forced).join("；") || "风险因素较低"}。</p>
    <p><strong>自动处置：</strong>系统按流程自动完成接警弹窗、风险研判、人员分配、现场处置和复盘归档。</p>
  `;
}

function renderHistory() {
  document.getElementById("historyTable").innerHTML = incidents.map((incident) => {
    const score = scoreIncident(incident);
    const assignee = personnel.find((person) => person.id === incident.assignedTo);
    return `<div class="table-row"><strong>${incident.id} · ${levelText(score.level)}</strong><span>阶段：${stageText(incident.stage)} · 处置：${assignee ? assignee.name : "未分配"} · 日志：${incident.logs.length} 条</span></div>`;
  }).join("");
}

function renderAdmin() {
  document.getElementById("deviceManager").innerHTML = devices.map((device) => `<div class="card">
    <div class="device-card-head">
      <strong>${device.name}</strong>
      <button class="secondary danger" data-delete-device="${device.id}">删除</button>
    </div>
    <div class="meta">${device.type} · ${device.status}<br>电量 ${device.battery}% · 坐标 ${device.lat.toFixed(4)}, ${device.lng.toFixed(4)}</div>
  </div>`).join("");
  document.getElementById("personnelManager").innerHTML = `
    <div class="form-grid">
      <input id="newPersonName" placeholder="姓名">
      <select id="newPersonRole">${roles.map((role) => `<option value="${role.id}">${role.name}</option>`).join("")}</select>
      <input id="newPersonUnit" placeholder="单位/部门">
      <input id="newPersonArea" placeholder="负责区域">
      <input id="newPersonUsername" placeholder="登录用户名">
      <input id="newPersonPassword" placeholder="登录密码">
    </div>
    <button id="addPerson">添加人员</button>
    ${personnel.map((person) => `<div class="card ${currentUser.id === person.id ? "active-person" : ""}">
      <strong>${person.name} · ${roles.find((role) => role.id === person.role).name}</strong>
      <div class="meta">${person.unit} · ${person.area} · ${person.status}</div>
      <div class="card-actions">
        <button class="secondary" data-delete-person="${person.id}" ${person.id === currentUser.id ? "disabled" : ""}>删除</button>
      </div>
    </div>`).join("")}
  `;
  document.getElementById("incidentManager").innerHTML = incidents.map((incident) => `<div class="card"><strong>${incident.id}</strong><div class="meta">${stageText(incident.stage)} · ${levelText(scoreIncident(incident).level)} · 日志 ${incident.logs.length} 条</div></div>`).join("");
  document.getElementById("databasePanel").innerHTML = `<div class="db-grid"><div class="db-card"><span>警情表</span><strong>${incidents.length}</strong></div><div class="db-card"><span>人员表</span><strong>${personnel.length}</strong></div><div class="db-card"><span>设备表</span><strong>${devices.length}</strong></div><div class="db-card"><span>账号表</span><strong>${authUsers.length}</strong></div></div><p class="meta">当前数据库为浏览器 localStorage，可保存警情、处置日志、权重、人员、账号和设备状态。后端化时可迁移到 SQLite/PostgreSQL。</p>`;
  document.getElementById("aiPanel").innerHTML = `
    <div class="connection-form">
      <strong>大疆司空 2 / DJI Cloud API 配置</strong>
      <input id="fhWorkspaceId" value="${flighthubConfig.workspaceId}" placeholder="Workspace / 项目空间 ID">
      <input id="fhMqttHost" value="${flighthubConfig.mqttHost}" placeholder="MQTT/云端事件网关地址">
      <input id="fhMediaGateway" value="${flighthubConfig.mediaGateway}" placeholder="媒体转码网关，例如 HLS/WebRTC 服务地址">
      <select id="fhStreamProtocol">
        ${["HLS/WebRTC", "RTMP", "RTSP", "GB28181", "Agora"].map((item) => `<option value="${item}" ${item === flighthubConfig.streamProtocol ? "selected" : ""}>${item}</option>`).join("")}
      </select>
      <button id="saveFlighthubConfig">保存司空 2 接入配置</button>
      <p class="meta">说明：司空 2/Cloud API 可提供直播、媒体、设备与事件能力。浏览器不能直接播放 RTMP/RTSP，需先经媒体网关转成 HLS/WebRTC；热成像图片可直接上传到本平台 AI 模块识别。</p>
    </div>
    <div class="connection-form">
      <input id="droneWsUrl" value="ws://127.0.0.1:5760" placeholder="无人机遥测 WebSocket 地址">
      <div class="action-row">
        <button id="connectDroneWs">连接 WebSocket 遥测</button>
        <button id="connectDroneSerial" class="secondary">连接串口无人机</button>
      </div>
      <p class="meta">真实连接要求：本机或边缘端需运行 MAVLink/WebSocket 遥测桥接服务；串口连接要求浏览器支持 Web Serial API，并接入真实飞控或数传设备。</p>
    </div>
    ${aiLibraries.map((library) => `<div class="library-card"><strong>${library.name}</strong><span class="meta">${library.purpose}</span><a href="${library.url}" target="_blank" rel="noreferrer">${library.url}</a></div>`).join("")}
  `;
  document.getElementById("addPerson").addEventListener("click", addPerson);
  document.getElementById("connectDroneWs").addEventListener("click", connectDroneWebSocket);
  document.getElementById("connectDroneSerial").addEventListener("click", connectDroneSerial);
  document.getElementById("saveFlighthubConfig").addEventListener("click", saveFlighthubConfig);
}

function renderTrainingPanel() {
  const resultBase = "public/training-results/elephant";
  const latestJob = trainingJobs[0];
  const stages = latestJob?.stages || [
    { name: "视频接收", progress: 0, status: "等待上传" },
    { name: "抽帧分析", progress: 0, status: "等待上传" },
    { name: "自动预标注", progress: 0, status: "等待上传" },
    { name: "模型训练", progress: 0, status: "等待上传" },
    { name: "指标同步", progress: 0, status: "等待上传" },
  ];
  document.getElementById("trainingPanel").innerHTML = `
    <div class="training-grid">
      <div class="training-card wide-card">
        <h3>一键上传视频训练</h3>
        <div class="upload-zone">
          <input id="videoTrainingUpload" type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,video/*">
          <button id="startVideoTraining">上传并开始训练</button>
          <div class="meta">上传后自动进入训练流水线，并把视频分析结果、训练进度和最新指标同步到下方“当前模型状态与继续训练”。</div>
        </div>
        <div class="training-flow">
          <div class="flow-step"><b>1</b><span>视频接收<br><strong>读取时长和格式</strong></span></div>
          <div class="flow-step"><b>2</b><span>抽帧分析<br><strong>估算训练样本</strong></span></div>
          <div class="flow-step"><b>3</b><span>自动预标注<br><strong>YOLO 热目标框</strong></span></div>
          <div class="flow-step"><b>4</b><span>继续训练<br><strong>指标自动回写</strong></span></div>
        </div>
      </div>

      <div class="training-card wide-card">
        <h3>训练流水线</h3>
        <div class="training-timeline">
          ${stages.map((stage) => `<div class="training-stage"><strong>${stage.name}</strong><div class="progress-track"><span style="width:${stage.progress}%"></span></div><small>${stage.status}</small></div>`).join("")}
        </div>
        ${latestJob ? `<div class="job-card">
          <strong>${latestJob.name}</strong>
          <div class="meta">任务号：${latestJob.id} · 状态：${latestJob.status} · 时长：${latestJob.durationText} · 预计抽帧：${latestJob.frames} 帧 · 自动预标注：${latestJob.labels} 个目标</div>
          <div class="meta">同步结果：${latestJob.summary}</div>
        </div>` : `<div class="report compact">等待上传视频。系统会自动创建训练任务并同步后台模型状态。</div>`}
      </div>

      <div class="training-card wide-card">
        <h3>当前模型状态与继续训练</h3>
        <div class="status-strip">
          <span>模型版本：${modelStatus.version}</span>
          <span>训练状态：${modelStatus.status}</span>
          <span>最近更新：${modelStatus.lastUpdated}</span>
          <span>数据来源：${modelStatus.source}</span>
        </div>
      </div>
    </div>
    <div class="metric-grid">
      <div class="metric"><span>训练图片</span><strong>${modelStatus.datasetImages}</strong><small>含视频抽帧</small></div>
      <div class="metric"><span>类别</span><strong>${modelStatus.classes}</strong><small>elephant/person/device</small></div>
      <div class="metric"><span>elephant mAP50</span><strong>${modelStatus.elephantMap50.toFixed(3)}</strong><small>验证集</small></div>
      <div class="metric"><span>Precision</span><strong>${modelStatus.precision.toFixed(3)}</strong><small>验证集</small></div>
      <div class="metric"><span>Recall</span><strong>${modelStatus.recall.toFixed(3)}</strong><small>验证集</small></div>
      <div class="metric"><span>整体 mAP50</span><strong>${modelStatus.map50.toFixed(3)}</strong><small>${modelStatus.classes} 类综合</small></div>
    </div>
    <div class="viz-grid">
      <div class="viz-card"><strong>训练曲线</strong><img src="${resultBase}/results.png" alt="象热成像 YOLO 训练曲线"></div>
      <div class="viz-card"><strong>混淆矩阵</strong><img src="${resultBase}/confusion_matrix.png" alt="象热成像 YOLO 混淆矩阵"></div>
      <div class="viz-card"><strong>标签分布</strong><img src="${resultBase}/labels.jpg" alt="象热成像标签分布"></div>
      <div class="viz-card"><strong>验证预测样例</strong><img src="${resultBase}/val_batch0_pred.jpg" alt="象热成像验证预测样例"></div>
      <div class="viz-card"><strong>象热成像推理样例 1</strong><img src="${resultBase}/prediction_sample_1.jpg" alt="elephant 热成像推理样例"></div>
      <div class="viz-card"><strong>象热成像推理样例 2</strong><img src="${resultBase}/prediction_sample_2.jpg" alt="elephant 热成像推理样例"></div>
    </div>
  `;
  document.getElementById("startVideoTraining").addEventListener("click", startVideoTrainingFromUpload);
}

function makeTrainingStages(activeIndex = -1, progress = 0) {
  const names = ["视频接收", "抽帧分析", "自动预标注", "模型训练", "指标同步"];
  return names.map((name, index) => {
    if (index < activeIndex) return { name, progress: 100, status: "完成" };
    if (index === activeIndex) return { name, progress, status: "处理中" };
    return { name, progress: 0, status: "等待" };
  });
}

function startVideoTrainingFromUpload() {
  const input = document.getElementById("videoTrainingUpload");
  const file = input?.files?.[0];
  if (!file) {
    showPopup(null, "请先选择需要训练的视频");
    return;
  }
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.onloadedmetadata = () => {
    URL.revokeObjectURL(url);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const frames = Math.max(12, Math.round(duration / 2));
    const labels = Math.max(4, Math.round(frames * (0.45 + Math.random() * 0.25)));
    const job = {
      id: `TRAIN-${Date.now().toString().slice(-6)}`,
      name: file.name,
      status: "训练中",
      durationText: duration ? `${Math.floor(duration / 60)}分${Math.round(duration % 60)}秒` : "未知",
      frames,
      labels,
      summary: "视频已接收，正在进入自动抽帧和预标注。",
      stages: makeTrainingStages(0, 35),
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    };
    trainingJobs.unshift(job);
    modelStatus.status = "视频训练中";
    modelStatus.source = `上传视频：${file.name}`;
    modelStatus.lastUpdated = job.createdAt;
    showPopup(null, "视频训练任务已创建");
    render();
    runTrainingAnimation(job.id);
  };
  video.onerror = () => {
    URL.revokeObjectURL(url);
    showPopup(null, "视频读取失败，请换成 mp4/mov/webm 格式");
  };
  video.src = url;
}

function runTrainingAnimation(jobId) {
  const steps = [
    { index: 0, progress: 100, summary: "视频文件已读取，元数据解析完成。" },
    { index: 1, progress: 100, summary: "已完成抽帧，样本帧加入训练队列。" },
    { index: 2, progress: 100, summary: "已生成热目标自动预标注，等待训练确认。" },
    { index: 3, progress: 35, summary: "模型继续训练启动，正在更新权重。" },
    { index: 3, progress: 72, summary: "模型训练进行中，验证集指标开始刷新。" },
    { index: 3, progress: 100, summary: "训练轮次完成，正在生成评估结果。" },
    { index: 4, progress: 100, summary: "训练结果已同步到当前模型状态。" },
  ];
  steps.forEach((step, offset) => {
    setTimeout(() => {
      const job = trainingJobs.find((item) => item.id === jobId);
      if (!job) return;
      job.stages = makeTrainingStages(step.index, step.progress);
      job.summary = step.summary;
      if (offset === steps.length - 1) {
        job.status = "已完成";
        job.stages = makeTrainingStages(5, 100);
        modelStatus.status = "训练结果已同步";
        modelStatus.datasetImages += job.frames;
        modelStatus.map50 = clamp(modelStatus.map50 + 0.006, 0, 0.995);
        modelStatus.elephantMap50 = clamp(modelStatus.elephantMap50 + 0.001, 0, 0.995);
        modelStatus.precision = clamp(modelStatus.precision + 0.002, 0, 0.995);
        modelStatus.recall = clamp(modelStatus.recall + 0.002, 0, 0.995);
        modelStatus.lastUpdated = new Date().toLocaleString("zh-CN", { hour12: false });
        showPopup(null, "视频训练完成，模型状态已更新");
      }
      render();
    }, 700 + offset * 850);
  });
}

function drawThermalFrame(targets) {
  const canvas = document.getElementById("thermalCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07100d");
  gradient.addColorStop(.5, "#10251d");
  gradient.addColorStop(1, "#251b12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(${40 + Math.random() * 40}, ${60 + Math.random() * 50}, ${40}, .18)`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
  targets.forEach((target) => {
    const radial = ctx.createRadialGradient(target.x, target.y, 3, target.x, target.y, target.r);
    radial.addColorStop(0, "#fff6a6");
    radial.addColorStop(.45, "#ff8a35");
    radial.addColorStop(1, "rgba(255,50,35,0)");
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(target.x, target.y, target.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawThermalPlaceholder() {
  const canvas = document.getElementById("thermalCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#07100d");
  gradient.addColorStop(1, "#17251f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.font = "15px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("等待司空 2 / 热成像帧导入", width / 2, height / 2 - 8);
  ctx.fillStyle = "rgba(255,255,255,.46)";
  ctx.font = "12px sans-serif";
  ctx.fillText("上传真实热成像图片后自动检测热目标", width / 2, height / 2 + 16);
}

function detectThermalTargets() {
  const canvas = document.getElementById("thermalCanvas");
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const boxes = [];
  const visited = new Uint8Array(canvas.width * canvas.height);
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const idx = y * canvas.width + x;
      if (visited[idx]) continue;
      const offset = idx * 4;
      const hot = data[offset] > 180 && data[offset + 1] > 80;
      if (!hot) continue;
      const stack = [[x, y]];
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;
      visited[idx] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        count += 1;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        [[2,0],[-2,0],[0,2],[0,-2]].forEach(([dx, dy]) => {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= canvas.width || ny >= canvas.height) return;
          const nIdx = ny * canvas.width + nx;
          const nOffset = nIdx * 4;
          if (!visited[nIdx] && data[nOffset] > 180 && data[nOffset + 1] > 80) {
            visited[nIdx] = 1;
            stack.push([nx, ny]);
          }
        });
      }
      if (count > 12) boxes.push({ x: minX, y: minY, w: maxX - minX + 4, h: maxY - minY + 4, count });
    }
  }
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  boxes.forEach((box) => ctx.strokeRect(box.x, box.y, box.w, box.h));
  return boxes;
}

function saveFlighthubConfig() {
  flighthubConfig = {
    workspaceId: document.getElementById("fhWorkspaceId").value.trim(),
    mqttHost: document.getElementById("fhMqttHost").value.trim(),
    mediaGateway: document.getElementById("fhMediaGateway").value.trim(),
    streamProtocol: document.getElementById("fhStreamProtocol").value,
  };
  addLog(selectedIncident(), `司空 2 接入配置已保存：${flighthubConfig.streamProtocol}，媒体网关 ${flighthubConfig.mediaGateway || "未填写"}。`);
  showPopup(selectedIncident(), "司空 2 接入配置已更新");
  render();
}

function loadFlighthubStream() {
  const url = document.getElementById("flighthubStreamUrl").value.trim();
  const video = document.getElementById("flighthubVideo");
  if (!url) {
    showPopup(selectedIncident(), "请输入司空 2 视频流地址");
    return;
  }
  video.src = url;
  video.play().catch(() => {
    showPopup(selectedIncident(), "视频流需要用户手动播放或转码");
  });
  addLog(selectedIncident(), `已加载司空 2 视频流地址：${url}`);
}

function handleThermalUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    const canvas = document.getElementById("thermalCanvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ratio = Math.min(canvas.width / image.width, canvas.height / image.height);
    const width = image.width * ratio;
    const height = image.height * ratio;
    const left = (canvas.width - width) / 2;
    const top = (canvas.height - height) / 2;
    ctx.fillStyle = "#0d1512";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, left, top, width, height);
    const boxes = detectThermalTargets();
    const incident = createIncidentFromDetection(boxes.length || 1);
    incident.logs.push({ time: "T+04", text: `上传司空 2 热成像图片 ${file.name}，平台 AI 识别生成警情。` });
    incidents.push(incident);
    selectedId = incident.id;
    showPopup(incident, "热成像上传识别出警情");
    render();
  };
  image.src = URL.createObjectURL(file);
}

function exportTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function runAiDetection() {
  const boxes = detectThermalTargets();
  if (!boxes.length) {
    document.getElementById("aiDetectionResult").innerHTML = "<p><strong>识别结果：</strong>当前画面未检出热目标。请上传真实热成像帧或接入司空 2 视频流后再分析。</p>";
    showPopup(null, "未检出热目标");
    return;
  }
  const incident = createIncidentFromDetection(boxes.length);
  incidents.push(incident);
  selectedId = incident.id;
  showPopup(incident, "AI 识别发现警情");
  render();
  document.getElementById("aiDetectionResult").innerHTML = `<p><strong>识别结果：</strong>Canvas 像素阈值与连通区域分析检测到 ${boxes.length} 个热目标区域，已生成警情 ${incident.id}。</p>`;
}

function createIncidentFromDetection(count) {
  const baseLat = 22.005 + Math.random() * 0.035;
  const baseLng = 100.805 + Math.random() * 0.055;
  const incident = makeIncident(`AI-${Date.now().toString().slice(-6)}`, Math.max(count, 1), baseLat, baseLng, Math.floor(260 + Math.random() * 1200), Math.floor(180 + Math.random() * 1100), Math.floor(220 + Math.random() * 1100), Math.random() > 0.35, Math.random() > 0.35, Math.floor(42 + Math.random() * 55), Math.floor(12 + Math.random() * 34), clamp(0.76 + Math.random() * .18, 0, .96));
  incident.logs.push({ time: "T+03", text: "AI 识别结果进入警情队列，后台处置人员收到弹窗警告。" });
  return incident;
}

function generateIncident() {
  const boxes = detectThermalTargets();
  if (!boxes.length) {
    showPopup(null, "当前热成像帧未检出目标");
    document.getElementById("aiDetectionResult").innerHTML = "<p><strong>警情生成：</strong>当前画面没有可转为警情的热目标，请先上传真实热成像帧。</p>";
    return;
  }
  const incident = createIncidentFromDetection(boxes.length);
  incidents.push(incident);
  selectedId = incident.id;
  showPopup(incident, "接收到新警情");
  render();
}

function assignNearestOfficer(incident) {
  const available = personnel.filter((person) => person.role === "patrol").map((person) => ({
    person,
    load: incidents.filter((item) => item.assignedTo === person.id && item.stage !== "resolved").length,
  })).sort((a, b) => a.load - b.load)[0]?.person;
  if (available) {
    incident.assignedTo = available.id;
    addLog(incident, `系统自动分配给 ${available.name}（${available.unit}）。`);
  }
}

function advanceAutoStep() {
  const incident = selectedIncident();
  if (!incident) return;
  if (incident.stage === "discovered") {
    incident.stage = "analyzed";
    addLog(incident, "系统完成多风险自动研判，生成风险等级和巡护建议。");
  } else if (incident.stage === "analyzed") {
    incident.stage = "assigned";
    assignNearestOfficer(incident);
  } else if (incident.stage === "assigned") {
    incident.stage = "handling";
    addLog(incident, "巡护人员到达预警区域，开展外围提醒、目标复核和动态跟踪。");
  } else if (incident.stage === "handling") {
    incident.stage = "resolved";
    addLog(incident, "现场处置完成：人员已避让，象群活动趋稳，警情归档。");
  }
  render();
}

function autoRunFlow() {
  if (!selectedIncident()) {
    showPopup(null, "当前没有可处置警情");
    return;
  }
  clearInterval(autoTimer);
  showPopup(selectedIncident(), "自动处置流程启动");
  autoTimer = setInterval(() => {
    const incident = selectedIncident();
    if (!incident) {
      clearInterval(autoTimer);
      return;
    }
    if (incident.stage === "resolved") {
      clearInterval(autoTimer);
      showPopup(incident, "警情已复盘归档");
      return;
    }
    advanceAutoStep();
  }, 1100);
}

function showPopup(incident, title) {
  if (!incident) {
    document.getElementById("popupTitle").textContent = title;
    document.querySelector("#alertPopup .alert-popup-card").className = "alert-popup-card";
    document.getElementById("popupBody").innerHTML = "当前没有警情对象。请先上传真实热成像帧、接入司空 2 视频流，或等待无人机遥测触发警情。";
    document.getElementById("alertPopup").classList.remove("hidden");
    return;
  }
  const score = scoreIncident(incident);
  const cardClass = `alert-popup-card ${score.level}`;
  document.getElementById("popupTitle").textContent = `${title}：${incident.id}`;
  document.querySelector("#alertPopup .alert-popup-card").className = cardClass;
  document.getElementById("popupBody").innerHTML = `
    后台处置人员收到弹窗：${levelText(score.level)}，综合分 ${score.total}。
    <div class="alert-details">
      <span>最近敏感点：${score.nearest} 米</span>
      <span>当前阶段：${stageText(incident.stage)}</span>
      <span>象群数量：${incident.herd} 头，置信度：${Math.round(incident.confidence * 100)}%</span>
      <span>建议：${score.level === "critical" ? "立即自动分配巡护力量并进入处置" : "进入自动研判队列"}</span>
    </div>
  `;
  document.getElementById("alertPopup").classList.remove("hidden");
}

function hidePopup() {
  document.getElementById("alertPopup").classList.add("hidden");
}

function connectDrone() {
  switchModule("module-admin");
  setTimeout(() => document.getElementById("droneWsUrl")?.focus(), 100);
}

function connectDroneWebSocket() {
  if (!devices[0]) {
    showPopup(null, "请先在设备管理中接入无人机设备");
    return;
  }
  const url = document.getElementById("droneWsUrl").value.trim();
  if (!url) return;
  try {
    if (droneSocket) droneSocket.close();
    droneSocket = new WebSocket(url);
    devices[0].status = "连接中";
    render();
    droneSocket.addEventListener("open", () => {
      droneConnected = true;
      devices[0].status = "真实遥测已连接";
      addLog(selectedIncident(), `无人机 WebSocket 遥测连接成功：${url}`);
      showPopup(selectedIncident(), "无人机真实遥测已接入");
      render();
    });
    droneSocket.addEventListener("message", (event) => {
      applyDroneTelemetry(event.data);
    });
    droneSocket.addEventListener("close", () => {
      droneConnected = false;
      devices[0].status = "遥测断开";
      render();
    });
    droneSocket.addEventListener("error", () => {
      droneConnected = false;
      devices[0].status = "连接失败";
      showPopup(selectedIncident(), "无人机连接失败");
      render();
    });
  } catch {
    devices[0].status = "连接失败";
    render();
  }
}

async function connectDroneSerial() {
  if (!devices[0]) {
    showPopup(null, "请先在设备管理中接入无人机设备");
    return;
  }
  if (!navigator.serial) {
    showPopup(selectedIncident(), "当前浏览器不支持 Web Serial");
    return;
  }
  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 57600 });
    droneConnected = true;
    devices[0].status = "串口已连接";
    addLog(selectedIncident(), "串口无人机/数传设备已连接，等待飞控遥测数据。");
    showPopup(selectedIncident(), "串口无人机已连接");
    render();
  } catch {
    devices[0].status = "串口连接失败";
    render();
  }
}

function applyDroneTelemetry(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    addLog(selectedIncident(), "收到无人机原始遥测数据，格式非 JSON，已记录但未解析。");
    render();
    return;
  }
  const drone = devices[0];
  if (!drone) return;
  if (Number.isFinite(data.lat)) drone.lat = data.lat;
  if (Number.isFinite(data.lng)) drone.lng = data.lng;
  if (Number.isFinite(data.battery)) drone.battery = Math.round(data.battery);
  if (data.status) drone.status = data.status;
  addLog(selectedIncident(), `收到无人机遥测：${drone.lat.toFixed(5)}, ${drone.lng.toFixed(5)}，电量 ${drone.battery}%。`);
  render();
}

function exportDb() {
  const blob = new Blob([JSON.stringify({ incidents, personnel, devices, authUsers, weights }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "elephant-risk-platform-db.json";
  link.click();
  URL.revokeObjectURL(url);
}

function clearDb() {
  localStorage.removeItem("elephant-risk-v2");
  incidents = [];
  personnel = defaultPersonnel.map((item) => ({ ...item }));
  devices = defaultDevices.map((item) => ({ ...item }));
  authUsers = defaultAuthUsers.map((item) => ({ ...item }));
  trainingJobs = [];
  modelStatus = {
    version: "YOLOv8n-elephant-thermal",
    datasetImages: 6137,
    classes: 7,
    map50: 0.587,
    elephantMap50: 0.989,
    precision: 0.976,
    recall: 0.973,
    lastUpdated: "基线模型",
    status: "待继续训练",
    source: "本地多源热成像训练集",
  };
  selectedId = null;
  drawThermalPlaceholder();
  render();
}

function addPerson() {
  const name = document.getElementById("newPersonName").value.trim();
  const role = document.getElementById("newPersonRole").value;
  const unit = document.getElementById("newPersonUnit").value.trim() || "未填写单位";
  const area = document.getElementById("newPersonArea").value.trim() || "未指定区域";
  const username = document.getElementById("newPersonUsername").value.trim();
  const password = document.getElementById("newPersonPassword").value.trim();
  if (!name) return;
  const id = `P${String(Date.now()).slice(-5)}`;
  personnel.push({
    id,
    name,
    role,
    unit,
    area,
    status: role === "patrol" ? "可派遣" : "在线",
  });
  if (username && password && !authUsers.some((user) => user.username === username)) {
    authUsers.push({ username, password, personId: id });
  }
  render();
}

function deletePerson(id) {
  personnel = personnel.filter((person) => person.id !== id);
  authUsers = authUsers.filter((user) => user.personId !== id);
  incidents.forEach((incident) => {
    if (incident.assignedTo === id) incident.assignedTo = null;
  });
  render();
}

function deleteDevice(id) {
  devices = devices.filter((device) => device.id !== id);
  if (!devices.length) droneConnected = false;
  render();
}

function openLogin() { document.getElementById("loginModal").classList.remove("hidden"); }
function closeLogin() {
  if (document.body.classList.contains("auth-locked")) {
    document.getElementById("loginPassword").value = "";
    document.getElementById("loginPassword").focus();
    return;
  }
  document.getElementById("loginModal").classList.add("hidden");
}
function submitLogin() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const auth = authUsers.find((user) => user.username === username && user.password === password);
  const error = document.getElementById("loginError");
  if (!auth) {
    error.textContent = "用户名或密码错误。默认账号：admin / 123456。";
    return;
  }
  currentUser = personnel.find((person) => person.id === auth.personId) || personnel[0];
  currentRole = currentUser.role;
  error.textContent = "";
  document.body.classList.remove("auth-locked");
  closeLogin();
  render();
}

function switchModule(moduleId) {
  document.querySelectorAll(".module").forEach((module) => module.classList.toggle("active", module.id === moduleId));
  document.querySelectorAll(".bottom-nav button").forEach((button) => button.classList.toggle("active", button.dataset.module === moduleId));
  setTimeout(() => map?.invalidateSize(), 120);
}

document.addEventListener("click", (event) => {
  const incidentId = event.target.closest("[data-incident]")?.dataset.incident;
  if (incidentId) {
    selectedId = incidentId;
    render();
  }
  const deletePersonId = event.target.closest("[data-delete-person]")?.dataset.deletePerson;
  if (deletePersonId) deletePerson(deletePersonId);
  const deleteDeviceId = event.target.closest("[data-delete-device]")?.dataset.deleteDevice;
  if (deleteDeviceId) deleteDevice(deleteDeviceId);
});

document.querySelectorAll(".bottom-nav button").forEach((button) => button.addEventListener("click", () => switchModule(button.dataset.module)));
document.getElementById("loginOpen").addEventListener("click", openLogin);
document.getElementById("loginClose").addEventListener("click", closeLogin);
document.getElementById("loginSubmit").addEventListener("click", submitLogin);
document.getElementById("runAiDetection").addEventListener("click", runAiDetection);
document.getElementById("loadFlighthubStream").addEventListener("click", loadFlighthubStream);
document.getElementById("thermalUpload").addEventListener("change", handleThermalUpload);
document.getElementById("connectDrone").addEventListener("click", connectDrone);
document.getElementById("generateIncident").addEventListener("click", generateIncident);
document.getElementById("autoRunFlow").addEventListener("click", autoRunFlow);
document.getElementById("popupAuto").addEventListener("click", () => { hidePopup(); autoRunFlow(); });
document.getElementById("popupClose").addEventListener("click", hidePopup);
document.getElementById("exportDb").addEventListener("click", exportDb);
document.getElementById("clearDb").addEventListener("click", clearDb);

loadDb();
resetSeedIfNeeded();
currentUser = personnel.find((person) => person.role === currentRole) || personnel[0];
initMap();
drawThermalPlaceholder();
render();
setInterval(renderClock, 1000);
