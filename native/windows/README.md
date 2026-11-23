# Steel Front · Windows UE5 原型

试玩内容是一块约 360 × 360 米的诺曼底靶场。可以驾驶谢尔曼、在坡道上体验接地与短暂腾空、开镜瞄准并击倒靶板。打开程序后，主界面会显示 **Press ENTER to deploy**。

## 首次运行

1. 在 Windows 10 或 11 的 PC 上，用 Epic Games Launcher 安装 **Unreal Engine 5.7**，并更新 NVIDIA 显卡驱动。
2. 安装 **Visual Studio 2022 17.14**，在安装器里勾选 **Game development with C++**，同时保留 **MSVC v143** 和 **Windows SDK**（推荐 10.0.22621.0 或更新版）。
3. 完整解压原型，双击 **Play-Windows.cmd**。脚本会编译项目、生成材质和静态网格，再直接启动游戏主界面。第一次处理网格和着色器时，窗口出现前需要等待一段时间。
4. 按 **Enter** 出战。

如果从 GitHub 下载的是整个仓库，启动文件在 `native/windows/Play-Windows.cmd`。如果 UE5.7 装在自定义位置，可以在 PowerShell 里指定引擎目录：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Scripts\Play-Windows.ps1 -EngineRoot 'D:\Epic Games\UE_5.7'
```

也可以用参数 `-Width 1920 -Height 1080` 改窗口大小，或加 `-Editor` 打开编辑器。编译和资产生成的日志位于 `Saved/Logs`。如果生成中断，修好错误后再次运行启动脚本即可继续处理缺失的资产。

## 操作

| 按键 | 操作 |
| --- | --- |
| Enter | 出战或恢复鼠标捕获 |
| W / S | 前进和倒车 |
| A / D | 转动车体 |
| Space | 刹车 |
| 鼠标 | 转动视角并瞄准 |
| 左键 | 射击 |
| 右键 | 切换开镜 |
| R | 重置全部靶板 |
| Esc | 释放鼠标 |

## 画质与工程

默认以 **2560 × 1440、DX12 和 SM6** 启动。配置开启了 Lumen 硬件光追、虚拟阴影贴图以及 TSR（77% 内部渲染比例）。地形、建筑和植被启用 Nanite，光照包含动态阳光、天光和体积雾。RTX 5060 Ti 16 GB 是目标显卡，实际帧率待以 Windows 上的试玩结果为准。

- `Content/Prototype/Normandy.sfbin` 包含从网页版导出的地形、建筑、植被、坦克网格及碰撞数据。
- `SteelFrontBake` 是 UE 编辑器命令，生成静态网格及 Nanite 数据。材质脚本会导入随包提供的纹理。
- 在仓库根目录运行 `node native/windows/verify-slice.mjs` 可验证资产数据。要重新导出，先运行 `npm ci` 和 `npx playwright install chromium`，再运行 `node native/windows/export-slice.mjs`。资产已经包含在试玩包内。
- 地表、石墙及金属纹理来自 [Poly Haven](https://polyhaven.com/license)，采用 CC0。水面法线、模型和地图数据由本项目生成。

当前交付为 UE5 C++ 源码工程。本次使用 Linux 验证了地图数据、靶位的视线和启动脚本流程。Windows 上的 UE 编译、实际画面和显卡帧率仍待运行确认。
