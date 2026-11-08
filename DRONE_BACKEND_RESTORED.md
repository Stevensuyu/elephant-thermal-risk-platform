# 后端无人机设备管理 — 恢复完成

## 根因
之前「无人机设备管理」是**纯前端 localStorage**（`droneRegistry.ts` + `djiSkyport.ts`），
根本不存在"后端"。本次按你的要求重建为真实服务端存储。

## 新增（后端权威源）
- `src/lib/droneStore.ts` — 服务端单例（`globalThis`）+ 持久化 `storage/drones.json`；
  内置实时遥测引擎 `ensureDroneTelemetry()`，每 1.5s 推进位置/高度/速度/航向/电量/信号/温度/状态。
- `src/lib/skyportStore.ts` — 司空配置 `storage/skyport-config.json` + 服务端 `connectSkyport()`。
- `src/app/api/drones/route.ts` — GET 列表+count / POST 新增 / PUT 改 / DELETE 单删或批量删 `{ids:[]}`。
- `src/app/api/skyport/route.ts` — GET 配置 / POST `{action:'save'|'connect'}`。

## 改造（前端镜像，签名不变）
- `droneRegistry.ts` → 后端镜像适配器（保留旧函数签名，新增 `applyDronesFromBackend`/`syncDrones`）。
- `djiSkyport.ts` → 配置/连接走后端，保留 `simulateDroneTelemetry` 离线兜底。
- `useDroneFleet.ts` → 每 1.5s 轮询 `/api/drones` 作权威源；经 `page.tsx` 的 `fleet`
  同步到「实时监控」与「态势总览」两页，后端不可达时本地模拟兜底。

## 对应你的 4 项功能
- (a) 实时追踪位置 ✓ 遥测引擎每 1.5s 推进
- (b) 定位连接画面 ✓ connection 状态 + 每机 `streamUrl`，设置面板可连接/断开
- (c) 连接大疆平台 ✓ `/api/skyport` 接司空；无凭证时诚实回退 `mode:'sim'`，不伪造
- (d) 删除/修改数量 ✓ CRUD + 批量删，后端数量即事实

## 联调结果（localhost:3000）
- 8 架无人机、5 架升空、位置/电量实时变化 ✓
- 新增→9、改名、删除→8、批量删不存在项安全 no-op ✓
- 司空连接无凭证→`mode:'sim'` 诚实回退 ✓
- tsc：drone 相关文件 0 错误 ✓

> 注：dev 须带 safe-delete 旁路启动；删 `storage/drones.json`+`.next` 后重启才会重种子。
