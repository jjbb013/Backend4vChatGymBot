# 健身记录后端服务 (Backend4vChatGymBot)

本项目是一个基于 Node.js, Express 和 MySQL 的后端服务，用于记录和管理用户健身数据。该项目已根据 `NORTHFLANK_BACKEND_SPEC.md` 的要求开发，并为在 Northflank 平台上一键部署进行了优化。

## 功能特性

- **添加健身记录**: 记录用户完成的每个健身动作的次数、负重和组数。
- **查询历史记录**: 按天、周、月、季度查询用户的健身历史。
- **撤回操作**: 允许用户撤回上一条错误的记录。

## Northflank 部署指南

你可以按照以下步骤将此服务免费部署到 Northflank：

### 步骤 1: Fork 本仓库

首先，你需要将本 GitHub 仓库 Fork 到你自己的账户下。Northflank 将从你的仓库中拉取代码进行部署。

### 步骤 2: 在 Northflank 创建项目

1.  登录 [Northflank](https://northflank.com/)。
2.  创建一个新项目。

### 步骤 3: 创建 MySQL 数据库

1.  在你的 Northflank 项目中，点击 `Add new` -> `Addon`。
2.  选择 `MySQL` 数据库，选择一个合适的名称（例如 `fitness-db`），并选择免费的 `nf-compute-10` 计划。
3.  点击创建。数据库将在几分钟内准备就绪。

### 步骤 4: 创建并部署 Node.js 服务

1.  在同一个项目中，点击 `Add new` -> `Service`。
2.  选择 `Deployment from Git repository`。
3.  授权 Northflank 访问你的 GitHub 账户，并选择你刚刚 Fork 的仓库。
4.  **构建选项 (Build Options)**:
    -   **Buildpack**: Northflank 会自动检测到这是一个 Node.js 项目，无需修改。
    -   **Build Command**: `npm install`
    -   **Start Command**: `node server.js`
5.  **端口 (Ports)**:
    -   Northflank 会自动检测到代码中使用的 `PORT` 环境变量，并为你配置好端口 `3000`。保持默认即可。
6.  点击创建服务。Northflank 将开始构建和部署你的应用。

### 步骤 5: 关联数据库并设置环境变量

部署会自动开始，但会因为缺少数据库连接信息而失败。你需要将数据库关联到服务上：

1.  进入刚刚创建的服务，在左侧菜单中找到 `Build & Config` -> `Environment`。
2.  向下滚动到 **Internal Connections** 部分。
3.  点击 `Add internal connection`，选择你之前创建的 MySQL 数据库 (`fitness-db`)。
4.  Northflank 会自动将数据库的连接凭证（主机、用户、密码、数据库名）作为环境变量注入到你的服务中。这些变量的名称格式如下：
    -   `NF_MYSQL_HOST`
    -   `NF_MYSQL_USER`
    -   `NF_MYSQL_PASSWORD`
    -   `NF_MYSQL_DATABASE`
5.  保存更改。Northflank 会自动触发一次新的部署。代码已配置为自动识别 Northflank 的环境变量 (`NF_MYSQL_HOST` 等)，因此**无需手动创建别名**。

### 步骤 6: 初始化数据库表结构

服务部署成功后，数据库还是空的。你需要连接到数据库并创建 `fitness_logs` 表。

1.  在 Northflank 的数据库 (`fitness-db`) 详情页面，找到 **Connection details**。
2.  你可以使用任何 MySQL 客户端（如 TablePlus, DBeaver, 或 VS Code 插件）连接到数据库。
3.  连接成功后，执行以下 SQL 语句来创建表：

```sql
CREATE TABLE fitness_logs (
    `id` INT PRIMARY KEY AUTO_INCREMENT COMMENT '记录的唯一ID',
    `user_id` VARCHAR(128) NOT NULL COMMENT '用户的唯一标识 (对应微信的 openid)',
    `action` VARCHAR(255) NOT NULL COMMENT '健身动作名称',
    `reps` INT NOT NULL COMMENT '完成次数',
    `weight` FLOAT NOT NULL DEFAULT 0 COMMENT '负重 (单位: kg)，支持正负数和浮点数',
    `sets` INT NOT NULL COMMENT '当天该动作的第几组',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    INDEX `idx_user_id` (`user_id`) COMMENT '为用户ID创建索引以优化查询'
) COMMENT '用户健身记录表';
```

### 步骤 7: 获取 API 地址并测试

部署成功后，Northflank 会为你的服务提供一个公开的 URL。你可以在服务概览页面找到它。这个 URL 就是你的 API 地址，可以用于小程序端的集成了。

## API 接口

- `POST /log`: 添加一条健身记录
- `POST /logs/period`: 按时间段获取健身记录
- `POST /log/delete-last`: 撤回上一条健身记录

详细的接口请求和响应格式请参考 `NORTHFLANK_BACKEND_SPEC.md`。

---

## 高级用法: 使用 Northflank CLI

对于更高级的管理和自动化操作，你可以安装并使用 Northflank CLI。CLI 工具允许你通过命令行与你的 Northflank 账户进行交互。

### 安装 CLI

根据官方文档，你需要 Node.js (v12+) 环境，然后执行以下命令进行全局安装：

```bash
npm i -g @northflank/cli
```

### 登录和认证

安装成功后，你需要登录你的 Northflank 账户。执行以下命令，它会打开一个浏览器窗口让你授权：

```bash
northflank login
```

你需要先在 Northflank 网站的账户设置中创建一个 API Token，然后在登录流程中使用它。

### 用途说明

- **管理资源**: 你可以使用 CLI 创建、查看、删除服务和数据库等。
- **CI/CD 集成**: 虽然本项目推荐使用 Git-push 的方式自动部署，但在复杂的 CI/CD 流程中，你可以使用 CLI 来触发构建、更新环境变量等。

**请注意**: 对于本项目的部署，你**无需**安装 CLI，只需按照上面的 Git 部署指南操作即可。CLI 是一个可选的、用于高级管理的工具。
