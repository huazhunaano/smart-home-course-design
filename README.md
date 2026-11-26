# 智能家居系统（SmartHome）课程设计

软件工程课程设计（2026）第 18 组项目仓库。以平面图为入口的轻量智能家居系统，采用五层架构：展示层、策略层、控制层、设备层、数据层。

## 成员与分工

| 成员 | 角色 | 主责模块 | 工作量 |
|---|---|---|---|
| 华祖鼎（组长） | 架构 + 展示层 | 五层架构与依赖规则、接口契约、SVG 平面图与设备图层、集成与发布 | 35% |
| 陈逸轩 | 后端 + 设备控制 + 数据层 | REST/WS 服务、控制层校验与重试、设备能力模型与模拟器、Repository 与 SQLite | 33% |
| 周灿 | 策略 + 文档测试 | 场景规则、温控策略、测试用例与报告、四份交付文档 | 32% |

指导教师：王婷

## 目录结构

```
.
├─ docs/                   # 课程交付文档与配图
│  ├─ 01-选题报告与分工表.docx
│  ├─ 02-可行性分析报告.docx
│  ├─ 03-需求规格说明书v1.0.docx
│  ├─ 04-架构设计与评审讲解稿.docx
│  └─ figures/             # 架构图、用例图、类图、状态图、时序图、线框图
├─ web/                    # 前端（React 19 + TypeScript + Vite + 自研 SVG）
├─ server/                 # 后端（FastAPI + SQLite + WebSocket）
│  ├─ app/                 # 展示/策略/控制/设备/数据五层实现
│  └─ tests/               # pytest 单元与接口测试
└─ README.md
```

第 12–13 周迭代已完成：数据层、设备层、控制层、平面图与设备面板、状态同步；第 14 周起补场景策略与选做功能。

## 分支模型

- `main`：始终可运行、可演示，只接受经过评审的合并。
- `feature/<模块>`：功能开发分支，例如 `feature/floorplan`、`feature/control-service`、`feature/strategy`、`feature/device-driver`、`feature/repository`。
- 合并方式：功能分支完成后提 Pull Request，至少 1 人评审通过后合入 `main`；涉及策略与控制层的改动，评审人须由非作者补充至少 1 条失败分支测试。
- **禁止向 `main` 强推（force push）**，禁止直接向 `main` 提交未经评审的功能代码。
- 每周至少完成一次完整合并与联调（周日集成日），确保 `main` 当周可运行。

## 提交信息规范

格式：`<type>: <摘要>`，type 取值：

- `feat`：新增功能
- `fix`：缺陷修复
- `docs`：文档变更
- `refactor`：重构（不改变外部行为）
- `test`：测试相关

示例：`feat: 新增回家场景的指令编排`、`fix: 修正设备超时未回写的状态`。

## 禁止提交的内容

- 任何密钥、Token、证书（`.env`、`*.pem`、`secrets/`）
- 数据库文件与数据库密码（`*.db`、`*.sqlite`）
- `node_modules/`、构建产物（`dist/`、`build/`）、虚拟环境与缓存
- 编辑器本地配置与系统临时文件

以上均已写入 `.gitignore`。

## 技术路线（已定稿）

- 前端：React 19 + TypeScript + Vite，自研 SVG 2D 平面图（3D 作为后续扩展）
- 后端：Python 3.14 + FastAPI + Uvicorn，原生 WebSocket 推送
- 数据：SQLite（WAL 模式）+ Repository 接口，零安装、事务完整
- 设备：统一驱动接口 + 内置模拟器（19 类、40 台），后续可替换为真实驱动
- 部署：本机双进程启动脚本，不使用 Docker

## 设计参考

前端交互与信息层级参考了以下开源智能家居项目，仅借鉴设计思路，未复制其代码：

| 项目 | 参考内容 |
|---|---|
| [Home Assistant](https://www.home-assistant.io/) | 状态跟随视觉（开/关用图标与颜色区分）、单次点击即完成控制、区域化仪表盘布局、平面图叠加设备图层 |
| [Gladys Assistant](https://gladysassistant.com/) | 可分区 Dashboard、设备磁贴 + 详情弹层、主色克制的浅色界面 |
| [openHAB Main UI](https://www.openhab.org/docs/ui/) | 位置 / 设备 / 属性三层语义模型，据此组织“房间 → 设备 → 能力”的展示结构 |
| [ha-floorplan](https://github.com/ExperienceLovelace/ha-floorplan) | SVG 平面图与设备状态联动的实现方式 |

落地到本项目：左侧房间导航（位置）、中间 SVG 平面图与设备圆点（设备）、右侧面板按设备类型生成控制项（属性）；开启设备用实心圆点 + 高亮描边，关闭为空心，悬停显示名称与状态。

## 关键接口（契约冻结后以 `shared/contracts/` 为准）

- `DeviceDriver.describe()` / `execute(cmd, timeout=1.0)` / `on_state(handler)`
- `ControlService.send(cmd)` / `dispatch(plans, scene_id=None, on_progress=None)`
- `ISceneStrategy.evaluate(ctx) -> list[DeviceCommand]`
- `ClimatePolicy.target_temp(season, indoor, outdoor, humidity) -> TempDecision`
- `Repository.get_device / list_devices / save_state / append_state_log / transaction`

## 文档索引

- [选题报告与分工表](docs/01-选题报告与分工表.docx)
- [可行性分析报告](docs/02-可行性分析报告.docx)
- [需求规格说明书 v1.0](docs/03-需求规格说明书v1.0.docx)
- [架构设计与评审讲解稿](docs/04-架构设计与评审讲解稿.docx)
- [概要设计说明书](docs/05-概要设计说明书.docx)
- [测试报告](docs/06-测试报告.docx)
- 配图目录：[docs/figures](docs/figures)

## 启动方式

```bash
# 1) 后端（首次先安装依赖）
cd server
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2) 前端（开发模式，另开终端）
cd web
npm install
npm run dev            # http://localhost:5173

# 或构建后由后端直接托管
npm run build          # 生成 web/dist，随后访问 http://127.0.0.1:8000
```

## 测试

```bash
cd server
python -m pytest -q    # 16 个用例：策略、控制、仓储、REST
```

最近一次结果：`16 passed`。回家场景 23 条命令全部成功，总耗时约 715 ms，单条平均 30.4 ms。
