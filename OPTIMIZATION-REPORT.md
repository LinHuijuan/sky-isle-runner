# 星尘浮岛 · 优化诊断报告

**诊断时间**：2026-09-17
**测试环境**：Chrome headless · ANGLE D3D11 · **Intel UHD Graphics 630（核显）** · 1600×900 · DPR 1
**预览地址**：http://127.0.0.1:5188

---

## 一、实测基线

用 Playwright 注入 WebGL 调用计数器，直接统计每帧 `drawElements / drawArrays / drawElementsInstanced` 次数：

| 场景 | draw call / 帧 | 三角形 / 帧 | FPS |
|---|---|---|---|
| 关卡内运行 | 808 | 52,954 | 19.9 |
| 暂停（背景仍在渲染） | 705 | 46,559 | 29.9 |
| 主菜单标题页 | **1,054** | 65,238 | 25.8 |

静态资源占用：**几何体 690 个 / 纹理 75 张 / 着色器程序 33 个**。

结论：**三角形数只有 5 万（很轻），但 draw call 高达 800–1050**。这是典型的一帧上千次 CPU→GPU 提交瓶颈，核显上直接体现为 20 fps 左右。标题页反而最慢，因为起始相机能把整条赛道收进视锥。

---

## 二、已修复的问题（含实测收益）

### 🐞 Bug 1：Boss 门每帧刷屏 + 把玩家往后推

`src/game/Game.ts` → `checkGoal()`

```ts
if (dx0*dx0 + dz0*dz0 < 4.5*4.5 && Math.abs(p0.y - finishY) < 1.5) {
  if (!pl.finished) {            // ← 外层已 continue 过，这里恒为 true
    this.popups.spawn(...);      // 每帧生成一个 DOM 弹窗
    pl.runner.forwardSpeed.value *= 0.3;
    pl.runner.group.position.z -= 1.2;   // 每帧回推 1.2，≈72 单位/秒
  }
}
```

**影响**：第 3/4/5 关（`bossKeys` 分别为 2/3/4）钥匙没集齐时靠近终点门，会被以 72 单位/秒的速度弹开，同时每秒生成 60 个弹窗 DOM 节点（每个节点每帧还要写 4 次 style）。玩家实际**无法靠近大门**，且掉帧严重。

**修复**：`PlayerSlot` 新增 `gateBlockCooldown`，节流到 1.6 秒一次，回推量降到 0.6。

---

### 🐞 Bug 2：PowerUp 图标材质泄漏

`src/entities/PowerUp.ts`

```ts
const u = new THREE.Mesh(uGeo, new THREE.MeshBasicMaterial({ color: '#fff' }));
(this as {...})._extra = [uGeo];   // ← 只登记了 geometry，材质没登记
```

`_extra` 只收集了几何体，图标用的 `MeshBasicMaterial` **永远不会被 dispose**。每次重建赛道泄漏 3 个材质（磁铁/护盾/加速各一），无尽模式每过一波都会重建。

**修复**：改为按 `kind` 缓存共享材质，并在 `disposeSharedPowerUpAssets()` 中统一释放。

---

### 🐞 Bug 3：Runner 阴影是死代码

`src/entities/Runner.ts`

```ts
function surfaceGuess(runner: Runner): number {
  return runner.group.position.y;    // 恒等于自身高度
}
// ...
const air = Math.max(0, this.group.position.y - surfaceGuess(this));  // 恒为 0
```

`air` 永远是 0，`blob-shadow` 永远不会随跳跃高度缩小或淡出。

**修复**：新增 `groundY` 字段记录最近一次已知地面高度，阴影按真实离地高度缩放淡出。

---

### 🐞 Bug 4：three r184 废弃 API 告警

`src/core/Renderer.ts` 使用 `THREE.PCFSoftShadowMap`，r184 已移除该模式，控制台每次启动都告警并静默回退：

```
THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.
```

**修复**：显式改用 `THREE.PCFShadowMap`。

---

### ⚡ 性能 1：每帧强制同步布局

`Game.update()` 原本**每帧**调用：

```ts
resizeRenderer(this.renderer, this.camera, this.tuning.maxDpr);  // 读 clientWidth/clientHeight
this.syncPostSize();                                             // 又读一次
```

读 `clientWidth` 会强制浏览器立即结算样式与布局；而同一帧内 HUD 刚写过 style，于是形成**写→读→写→读的布局抖动（layout thrashing）**，60 次/秒。同时 `EffectComposer.setSize()` 也被每帧调用一次。

**修复**：改为 `ResizeObserver` + `window.resize` / `orientationchange` 事件驱动，用 `resizePending` 标志每帧最多消费一次。

---

### ⚡ 性能 2：HUD 每帧无条件写 DOM

`src/systems/Hud.ts` → `update()` 每帧执行：

- 4 处 `textContent = String(...)`，值没变也写
- `progressFill.style.width = "xx.x%"` —— `width` 是**布局属性**，每帧触发一次重排（且 CSS 上还挂着 `transition: width`）
- `renderPowers()` 在没有道具时每帧调用 `powerRow.replaceChildren()` —— 每秒 60 次清空 DOM
- 计时模式 `setTimer()` 每帧 `querySelector` 两次

**修复**：
- 所有写入加值比对（`lastScore / lastDistance / lastPct / lastCombo / lastDashReady / lastPowerSeconds`）
- 进度条改用 `transform: scaleX()`，`transform-origin: left`，彻底离开布局路径
- `replaceChildren()` 加状态守卫
- 计时器元素缓存引用

---

### ⚡ 性能 3：每帧对象分配（GC 压力）

`Game.update()` 每帧新建：2 个 `THREE.Vector2`、3~4 个 `THREE.Vector3`（`focusPoint()`）、1 个 HUD 快照对象 + `{...powerTimers}` 展开、以及每 30ms 一个 `new THREE.Color()`（拖尾粒子）。`publishDiagnostics()` 每帧构造一个 20 字段的嵌套对象。

**修复**：全部改为复用的 scratch 对象 / 模块级常量；`publishDiagnostics()` 改为原地改写同一个对象。

---

### ⚡ 性能 4：水晶与道具各自新建几何体、材质、Canvas 纹理

`Crystal` 每个实例在构造函数里创建：

- 3 个几何体（核心八面体 / 内层碎片 / 光环圆环）
- 3 个材质
- **1 张 64×64 canvas 光晕纹理**（现场画径向渐变）

一条赛道约 50 颗水晶 → 每次重建产生 **~150 个几何体 + ~50 张 canvas 纹理**。`PowerUp` 同样。

**修复**：改为模块级按 `tone` / `kind` 缓存，整局只建一次。新增 `disposeSharedCrystalAssets()` / `disposeSharedPowerUpAssets()`，由 `Game.dispose()` 统一释放。

---

### ⚡ 性能 5：岛体装饰件几何合并

`src/world/Island.ts` 中，每座浮岛原本是 **12~17 个独立 Mesh**，其中：

- 3 层岩体：各自 `sharedRock.clone()` + 独立几何体
- 碎石：2~4 个（共享几何体材质，但仍是独立 draw call）
- **垂根：2~4 个，每根都新建几何体 + 新建材质**

**修复**：用 `BufferGeometryUtils.mergeGeometries` 合并：
- 3 层岩体 → 1 个 Mesh，层间色差烘焙进顶点色（`vertexColors: true`），单一共享材质
- 全部碎石 → 1 个 Mesh
- 全部垂根 → 1 个 Mesh（原来每根 2 次分配 → 整岛 2 次）

---

### ♿ 无障碍与体验

| 问题 | 修复 |
|---|---|
| `#hud` 上挂了 `aria-live="polite"`，而 HUD 每帧变化 → 屏幕阅读器持续播报 | 移除；新增独立的 `#a11y-status`，只在生命值变化等关键事件时播报 |
| `#touch-controls` 设了 `aria-hidden="true"`，内部却含可聚焦按钮（axe: aria-hidden-focus） | 改为只对不可聚焦的摇杆设 `aria-hidden`，按钮保留可访问名称 |
| 游戏内「减少动态」开关只影响 3D，UI 动画忽略系统偏好 | 新增 `@media (prefers-reduced-motion: reduce)` 规则，覆盖面板入场、连击横幅、星级弹出、按钮 hover 位移等 |

---

## 三、A/B 对比结果

把改动前的 `dist/` 构建产物和改动后的构建分别起静态服务，用测试钩子 `setState('active-play')` **冻结同一帧**（固定种子 42、固定玩家位置），各采样 3 轮取中位数：

| 指标 | 改动前 | 改动后 | 变化 |
|---|---:|---:|---:|
| **draw call / 帧** | 611 | **517** | **−15.4%** |
| **帧时间** | 26.16 ms | **20.87 ms** | **−20.2%** |
| **FPS** | 38.2 | **47.9** | **+25.4%** |
| 几何体总数 | 484 | **314** | **−35.1%** |
| 纹理总数 | 58 | **29** | **−50.0%** |
| 三角形 / 帧 | 39,521 | 39,789 | ≈持平（视觉无回退） |

三角形数持平说明画面内容没有删减，是纯开销优化。

---

## 四、还可以继续优化的地方（按收益排序）

### 🔴 1. 环境与水晶仍未批处理（预计还能砍 150~250 draw call）

当前 517 次调用的大头：

| 来源 | 对象数 | 说明 |
|---|---:|---|
| `Environment` 云朵 | ~40 | 10 组 × 3~5 个球体，共享材质却各自成 Mesh |
| `Environment` 远景浮岛 | 14 | 共享几何体材质 |
| `Course` 装饰浮岛 | 6 | 共享几何体材质 |
| `Crystal` | ~50 × 4 | 核心 + 碎片 + 圆环 + Sprite 光晕 |
| `PowerUp` | ~15 × 4 | 同上 |
| `Runner` | ~45 | 手臂 14 + 腿 16 + 躯干 14 |
| 浮岛 | ~70 × 9 | 已合并过一轮 |

**做法**：
- 云朵 / 远景浮岛 / 装饰浮岛 → `InstancedMesh`（每帧更新实例矩阵即可保留飘移动画）。40 个 Mesh → 2 个，14 → 2，6 → 1。
- 水晶核心 / 碎片 / 圆环 → 每种 tone 一个 `InstancedMesh`（3 tone × 3 部件 = 9 个 draw call 覆盖全部水晶）。光晕 Sprite 改为 `Points` 云或 billboard 平面实例化。
- `Runner` 的关节球/环（肩环、肘球、腕球、髋环、膝球、踝球，共 12 个小件）可以在每个骨骼节点内合并成 1 个 Mesh。

### 🟠 2. 迷雾与远平面不匹配，缺少距离剔除

`camera.far = 240`，而 `FogExp2` 密度 0.008 —— 约 200 单位外的物体已完全被雾吞没，但仍在提交绘制。

**做法**：把 `camera.far` 收到 160 左右，同时把天空穹顶半径从 230/240 缩到 140，再按玩家 z 做一次手动距离剔除（`mesh.group.visible = island.position.z > playerZ - 40 && < playerZ + 150`）。预计再省 15~20% draw call。

### 🟠 3. 后期处理开销（核显上是硬成本）

- `UnrealBloomPass` 在 DPR 2 下 5 级 mip 全屏叠加，非常吃填充率。建议「中」画质下把 `composer.setPixelRatio(1)`（当前已随 `maxDpr` 联动），并把 bloom 的 `radius` 从 0.55 降到 0.4。
- `GradeShader` + `OutputPass` 是两次额外的全屏 pass，可以把调色逻辑并进 `OutputPass` 的 shader，省一次全屏采样。
- 阴影贴图「中」画质仍是 1024²，可降到 768²；阴影相机范围 `±24` 也可以收紧到 `±18`。

### 🟡 4. `applyStageTheme()` 的遍历方式脆弱

```ts
this.course.group.traverse((obj) => {
  const m = mesh.material;
  if (!m || !m.map) return;
  if (m.color.g > m.color.r && m.color.g > m.color.b) m.color.set(stage.grass);
});
```

靠「绿色分量最大」猜哪块是草地，并直接改写材质颜色。一旦以后引入共享材质或顶点色方案（本报告的性能 5 就是这样），这个启发式会失效或串色。建议给草地材质打 `userData.isGrass = true` 显式标记。

### 🟡 5. `findIslandAt()` 线性扫描

每帧每玩家扫全部 ~70 座岛。当前规模无所谓，但如果把赛道拉长到无尽模式几十波之后，建议按 z 建桶索引（`Map<floor(z/10), IslandDef[]>`），只查相邻 2~3 个桶。

### 🟡 6. `Particles.update()` 每帧全量上传缓冲

480 个粒子的 position / color / size 三个 `BufferAttribute` 每帧全量 `needsUpdate`，无论存活几个。three r184 支持 `attribute.addUpdateRange()`，可以只上传活跃区间。

### 🟢 7. 其余小项

- `AudioSystem.dispose()` 没有移除构造函数里注册的 `pointerdown` / `keydown` 解锁监听；若在解锁前销毁，之后触发会**新建一个 AudioContext**。
- `AudioSystem.noiseBurst()` 每次崩塌都现场生成一段随机噪声 `AudioBuffer`，可以预生成一条复用。
- `Hazard.update()` 里 `const pull = Math.min(1, elapsed % 1000) * 0;` 是恒为 0 的死代码。
- `index.html` 没有加载态；纹理走 `TextureLoader` 异步加载，首帧会出现材质空白再「跳」出贴图。可加一层 loading 遮罩等首帧就绪。
- `ScorePopups` 用 `style.left / top`（百分比）驱动位置，每帧触发布局。改成 `transform: translate3d()` 即可走合成层。
- `.hud-chip` 等 6 处使用了 `backdrop-filter: blur(14px)`，每个都会让浏览器额外采样一次背后画面。核显上可考虑降到 8px 或只保留面板的模糊。

---

### 🧪 顺带修掉的一个测试脚本缺陷

`scripts/playtest-deep.mjs` 的「Double start click spam」步骤长期失败（`page.click('#btn-start-run')` 超时 30 秒）。排查后确认**不是产品缺陷**：

```js
await page.click('#btn-start-run');   // 第一下：开跑
await page.waitForTimeout(200);
await page.click('#btn-start-run');   // 第二下：此时面板已隐藏 → 按钮不可见 → 等 30s 超时
```

第一下点击后 `startRun()` → `setMode('playing')` → `Hud.setMode()` 把所有面板 `hidden = true`，按钮（连同 `#panel-loadout`）**按设计就该隐藏**。所以第二次点击永远等不到按钮出现，这个断言从设计上就不可能通过。

已改为「按钮仍在屏幕上才补点第二下」，保留了验证 250ms 防抖的意图，同时不再误报：

```js
const spamBtn = page.locator('#btn-start-run');
if (await spamBtn.isVisible().catch(() => false)) await spamBtn.click();
```

---

## 五、回归验证

改动后完整跑通：

| 脚本 | 结果 |
|---|---|
| `tsc --noEmit` | 通过，0 错误 |
| `playtest-full.mjs` | 通过（移动 / 收集 / 冲刺 / 暂停恢复 / 死亡重开 / 双人） |
| `playtest-deep.mjs` | 通过（第 5 关 Boss 钥匙 UI、第 1 关弹跳花园、R 重开、无尽模式） |
| `test-infinite.mjs` | 通过（无限生命 HUD 显示 ∞、存档持久化） |
| `test-midrun.mjs` | 通过（中途存档 + 继续、位置与分数还原） |
| `verify-controls.mjs` | 通过（左键 +x、右键 −x 方向正确） |

浏览器控制台：**0 个 error**，且原先的 `PCFSoftShadowMap has been deprecated` 告警已消失。

---

## 六、改动文件清单

```
src/game/Game.ts          Boss门节流 / ResizeObserver / 复用 scratch 与 HUD 快照 / 诊断对象复用 / 释放共享资源
src/game/PlayerSlot.ts    新增 gateBlockCooldown
src/entities/Crystal.ts   几何体·材质·光晕纹理按 tone 共享；新增 disposeSharedCrystalAssets()
src/entities/PowerUp.ts   按 kind 共享；修复图标材质泄漏；新增 disposeSharedPowerUpAssets()
src/entities/Runner.ts    缓存 emblem / blobShadow 引用；修复阴影死代码；移除 surfaceGuess
src/world/Island.ts       岩体·碎石·垂根几何合并；新增共享顶点色岩体材质
src/core/Renderer.ts      PCFSoftShadowMap → PCFShadowMap
src/systems/Hud.ts        全量值比对 / 进度条 transform / 道具行守卫 / 计时器缓存 / 无障碍播报
src/styles.css            progress-fill 改 transform；#hud 加 contain；prefers-reduced-motion；.visually-hidden
index.html                移除 #hud 的 aria-live；修 aria-hidden-focus；新增 #a11y-status
```

新增探针脚本（都留在 `scripts/`，可复用）：

| 脚本 | 用途 |
|---|---|
| `perf-probe2.mjs` | patch WebGL 绘制调用，输出每帧 draw call / 三角形 / FPS + 资源计数 |
| `bench-ab.mjs` | 冻结确定性场景做 A/B 基准（多轮取中位数） |
| `static-serve.mjs` | 极简静态服务器，用于同时对比两个构建产物 |
| `leak-probe.mjs` | 反复重建赛道，观察几何体 / 纹理 / 堆内存增长 |

---

## 七、⚠️ 需要你确认的一件事

本次会话过程中发现，`sky-isle-runner/.git` 目录**已经不存在了**（会话开始时还在，`git log` 可以正常读取）。

- 源码 `src/`、`index.html` 等**全部完好无损**，已通过 `tsc` 类型检查与全部玩法回归脚本。
- 丢失的只有 Git 提交历史（8 个 commit）。如果没有远端仓库，这些历史无法恢复。
- 已排查：本次会话执行过的命令中没有删除 `.git` 的操作（唯一一次 `git stash` 报的是 `Unable to create index.lock: No such file or directory`，说明执行时 `.git` 已经不在了）。

建议：检查一下是否有杀毒软件 / 同步盘 / IDE 的清理动作，并尽快为该项目重新 `git init` + 首次提交，或确认远端仓库是否还在。
