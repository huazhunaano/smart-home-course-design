# 智能家居系统（SmartHome）课程设计

软件工程课程设计（2026）第 3 组项目仓库。以平面图为入口的轻量智能家居系统，采用五层架构：展示层、策略层、控制层、设备层、数据层。

## 成员与分工

| 成员 | 角色 | 主责模块 | 工作量 |
|---|---|---|---|
| 华祖鼎（组长） | 架构 + 展示层 | 五层架构与依赖规则、接口契约、Home3D 平面图、2D/3D 切换、集成与发布 | 35% |
| 陈逸轩 | 后端 + 设备控制 + 数据层 | REST/WS 服务、控制层校验与重试、设备能力模型与模拟器、Repository 与 SQLite | 32% |
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
├─ web/                    # 前端（React 19 + Vite + Home3D），待建
├─ server/                 # 后端（FastAPI），待建
├─ shared/contracts/       # 接口契约（JSON Schema / TS 类型），待建
└─ README.md
```

代码尚未开始，当前仓库先承载第 9–10 周交付物；后续按 `web/`、`server/`、`shared/contracts/` 分层落地。

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

- 前端：React 19 + TypeScript + Vite，改造 Home3D 复用 2D/3D 平面图能力
- 后端：Python 3.14 + FastAPI + Uvicorn，原生 WebSocket 推送
- 数据：SQLite（WAL 模式）+ Repository 接口，零安装、事务完整
- 设备：统一驱动接口 + HTTP 设备模拟器，后续可替换为真实驱动
- 部署：本机双进程启动脚本，不使用 Docker

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
- 配图目录：[docs/figures](docs/figures)

## 启动方式

代码落地后在此补充：

```bash
# 后端
python -m venv .venv && .venv\Scripts\activate
pip install -r server/requirements.txt
uvicorn server.main:app --reload

# 前端
cd web && npm install && npm run dev
```
