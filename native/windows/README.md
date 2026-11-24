# Steel Front · Windows UE5 高画质原型 0.3

试玩内容是一块 **480 × 480 米的诺曼底靶场**，外部还有约 1.68 公里宽的地形背景。可以驾驶谢尔曼、在坡道上体验接地与短暂腾空、开镜瞄准并击倒靶板。打开后，主界面会显示 **ENTER Deploy**。

## Windows 上启动

1. 用 Epic Games Launcher 安装 **Unreal Engine 5.7**，并更新 NVIDIA 驱动。
2. 安装 **Visual Studio 2022 17.14**，勾选 **Game development with C++**，同时保留 **MSVC v143** 和 **Windows SDK**（推荐 10.0.22621.0 或更新版）。
3. 将新版 ZIP 完整解压到新文件夹，双击 **Play-Windows.cmd**。首次启动会先编译工程，再生成图形材质、Nanite 数据和静态网格。生成期间可以在控制台查看进度。
4. 主界面出现后按 **Enter** 出战。

默认以 **2560 × 1440、DX12 和 SM6** 启动，TSR 内部渲染比例为 77%。在解压后的工程目录运行下列命令，可使用原生 1440p：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Scripts\Play-Windows.ps1 -NativeResolution
```

UE5.7 装在自定义位置时，追加 `-EngineRoot 'D:\Epic Games\UE_5.7'`。也可以用 `-Width 1920 -Height 1080` 调整窗口大小，或用 `-Editor` 打开编辑器。编译和资产生成的日志位于 `Saved/Logs`。

## 操作

| 按键 | 操作 |
| --- | --- |
| Enter | 出战或恢复鼠标捕获 |
| W / S | 前进和倒车 |
| A / D | 转动车体 |
| 松开 WASD | 自动制动 |
| Space | 立即施加制动力 |
| 鼠标 | 转动视角并瞄准 |
| 左键 | 射击 |
| 右键 | 切换开镜 |
| R | 重置全部靶板 |
| Esc | 释放鼠标 |

## 0.3 操控与靶场

- 自动刹车接入谢尔曼的运动积分。制动力逐步建立，停车距离取决于松键时的速度。
- 炮弹沿重力弹道飞行，曳光随弹移动，命中后在撞击位置闪光。散布采用圈内指数密度，准星跟随炮口预测着弹点。
- 靶场界面显示车速、自动制动、装填进度和已击倒的目标。按 R 可以重置靶板。

## 画质与数据来源

- 地表使用网页版高画质的四套材质、2K 漫反射与法线、粗糙度与环境遮蔽数据。保留网页地形的混合权重、道路车辙、岸边潮湿过渡，以及用于减少可见地形和碰撞差异的网格细分。
- 建筑沿用网页几何、UV、颜色变化和贴图。树木、灌木、碎石、草丛和车辆标识同样从网页资产生成。草地使用实例化和距离剔除。
- 谢尔曼的路轮、主动轮和履带分开导入。转向时两侧的履带相对运动，履带节沿原版模型提供的闭合轨迹移动。
- 水面采用双层动态波纹和 Single Layer Water。场景使用 Nanite、Lumen 硬件光追、虚拟阴影贴图和动态日光。
- 地表、岩石、建筑及金属纹理来自 [Poly Haven](https://polyhaven.com/license)，采用 CC0。植被卡片、水面法线、模型和地图数据由本项目生成。

`Content/Prototype/Normandy.sfbin` 是自包含的压缩网格数据。`ArtSource/NormandyMaterials.json` 指定纹理和材质。从仓库根目录可以运行 `node native/windows/verify-slice.mjs` 校验两者。重新导出需要 `npm ci` 和 `npx playwright install chromium`，然后运行 `node native/windows/export-slice.mjs`。

试玩包包含源码和资产，由 Windows 启动脚本在本机编译。地图与材质数据可用前面的校验命令验证。此版的 Windows 编译、实机画面与 RTX 5060 Ti 的帧率仍需在装有 UE5.7 的 Windows 上验证。
