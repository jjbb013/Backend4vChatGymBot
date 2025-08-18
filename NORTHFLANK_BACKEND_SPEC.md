# Northflank 健身记录后端服务 - 需求规格说明书

## 1. 项目概述

### 1.1. 核心目标
本项目旨在创建一个部署在 Northflank 平台上的 Node.js 后端服务，该服务使用 MySQL 数据库，用于替代当前微信小程序中的“微信云开发数据库”方案，以实现对健身数据的全权管理。

### 1.2. 设计原则
- **功能对等**: 新后端服务的 API 必须完整实现当前 `utils/storage.js` 中提供的所有数据操作功能。
- **方案兼容**: 必须保留现有的微信云开发代码，并通过一个简单的配置开关，让小程序可以方便地在“微信云数据库”和“Northflank 后端服务”之间切换。
- **可移植性**: 服务应基于主流技术栈（Node.js + Express + MySQL），不与 Northflank 平台强绑定，便于未来迁移。
- **AI 友好**: 本文档的定义应足够清晰、细致，以便 AI 开发者能够直接依据此文档进行项目开发。

### 1.3. 技术栈
- **后端**: Node.js, Express.js
- **数据库**: MySQL
- **部署平台**: Northflank

---

## 2. 数据库设计

数据库中应包含一张核心表 `fitness_logs`，用于存储所有的用户健身记录。

### 2.1. `fitness_logs` 表结构
使用以下 SQL 语句创建该表：

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

### 2.2. 字段说明
- `id`: 自增主键，唯一标识每一条记录。
- `user_id`: 字符串类型，用于存储用户的 `openid`，是查询用户数据的核心字段。
- `action`: 健身动作的名称，例如“深蹲”、“杠铃卧推”。
- `reps`: 每次训练的重复次数。
- `weight`: 负重，单位为公斤。支持浮点数（如 `20.5`）和负数（如 `-15`，用于辅助器械）。
- `sets`: 该记录是用户当天完成的第几组同名 `action`。此字段需要在插入数据前通过查询计算得出。
- `created_at`: 记录的创建时间，由数据库自动生成。用于排序和按时间段查询。

---

## 3. API 接口规范

后端服务需要提供一组 RESTful API，供小程序前端调用。所有接口的请求和响应均使用 JSON 格式。

### 3.1. 通用约定
- **用户识别**: 所有需要用户身份的接口，请求体中都必须包含 `user_id` 字段。
- **错误处理**: 如果请求失败，应返回合适的 HTTP 状态码（如 400, 500），并在响应体中提供错误信息，格式为 `{ "error": "具体的错误描述" }`。

### 3.2. 接口定义

#### 3.2.1. 添加一条健身记录
- **功能**: 对应原 `addFitnessLog` 和 `getTodayActionSetCount` 的组合功能。
- **Endpoint**: `POST /log`
- **请求体 (Request Body)**:
  ```json
  {
    "user_id": "用户的openid",
    "action": "深蹲",
    "reps": 10,
    "weight": 80.5
  }
  ```
- **处理流程**:
  1.  接收到请求后，首先根据 `user_id` 和 `action` 查询当天已完成的组数。
      ```sql
      SELECT COUNT(*) as setCount FROM fitness_logs WHERE user_id = ? AND action = ? AND DATE(created_at) = CURDATE();
      ```
  2.  将查询到的 `setCount` 加 1，作为新记录的 `sets` 值。
  3.  将 `user_id`, `action`, `reps`, `weight` 和计算出的 `sets` 值插入到 `fitness_logs` 表中。
      ```sql
      INSERT INTO fitness_logs (user_id, action, reps, weight, sets) VALUES (?, ?, ?, ?, ?);
      ```
  4.  查询刚刚插入的完整记录，并将其作为响应返回。
- **成功响应 (Response Body)**:
  ```json
  {
    "id": 101,
    "user_id": "用户的openid",
    "action": "深蹲",
    "reps": 10,
    "weight": 80.5,
    "sets": 3,
    "created_at": "2025-08-18T14:30:00.000Z"
  }
  ```

#### 3.2.2. 按时间段获取健身记录
- **功能**: 对应原 `getFitnessLogsByPeriod`。
- **Endpoint**: `POST /logs/period`
- **请求体 (Request Body)**:
  ```json
  {
    "user_id": "用户的openid",
    "period": "today" 
  }
  ```
  (`period` 的可选值为: `today`, `week`, `month`, `quarter`)
- **处理流程**:
  1.  根据 `period` 值计算查询的起始日期 (`startDate`)。
      - `today`: 今天 00:00:00
      - `week`: 本周一 00:00:00
      - `month`: 本月第一天 00:00:00
      - `quarter`: 本季度第一天 00:00:00
  2.  执行查询。
      ```sql
      SELECT * FROM fitness_logs WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC;
      ```
  3.  返回查询到的记录数组。
- **成功响应 (Response Body)**:
  ```json
  [
    { "id": 101, "action": "深蹲", ... },
    { "id": 100, "action": "卧推", ... }
  ]
  ```

#### 3.2.3. 撤回上一条健身记录
- **功能**: 对应原 `deleteLastFitnessLog`。
- **Endpoint**: `POST /log/delete-last`
- **请求体 (Request Body)**:
  ```json
  {
    "user_id": "用户的openid"
  }
  ```
- **处理流程**:
  1.  查询指定 `user_id` 最新的一条记录的 `id`。
      ```sql
      SELECT id FROM fitness_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1;
      ```
  2.  如果查询到记录，则根据 `id` 删除该记录。
      ```sql
      DELETE FROM fitness_logs WHERE id = ?;
      ```
  3.  返回操作结果。
- **成功响应 (Response Body)**:
  ```json
  {
    "success": true,
    "message": "已成功撤回上一条记录。"
  }
  ```

---

## 4. Northflank 部署指南

1.  **创建 MySQL 数据库**: 在 Northflank 上创建一个 MySQL 数据库插件 (Addon)。
2.  **创建 Node.js 服务**: 创建一个新的服务 (Service)，选择从 Git 仓库部署。
3.  **关联数据库**: 将创建的 MySQL 插件关联到 Node.js 服务。Northflank 会自动将数据库的连接信息（主机、用户名、密码、数据库名）作为环境变量注入到服务中。
4.  **环境变量**: 在 Node.js 代码中，通过 `process.env` 读取数据库连接信息，不要硬编码。
5.  **构建与启动**:
    - **Build Command**: `npm install`
    - **Start Command**: `node server.js` (或你的主文件名)
6.  **端口**: 确保 Express 服务监听的端口是 Northflank 指定的 `PORT` 环境变量 (`process.env.PORT`)。

---

## 5. 小程序集成方案

为了实现方案的平滑切换，需要在小程序端进行以下改造：

1.  **创建新的数据层文件**: 复制 `utils/storage.js` 并重命名为 `utils/storage_northflank.js`。
2.  **改造 `storage_northflank.js`**:
    -   移除所有 `wx.cloud.database()` 相关的代码。
    -   将文件中的每一个函数（如 `addFitnessLog`）改造为使用 `wx.request` 来调用 Northflank 服务上对应的 API 接口。
    -   例如，新的 `addFitnessLog` 函数应该向 `POST /log` 发送请求。
3.  **创建配置开关**: 在 `app.js` 或一个独立的 `config.js` 文件中，定义一个全局配置项。
    ```javascript
    // in app.js
    globalData: {
      useNorthflank: false, // true: 使用 Northflank, false: 使用微信云开发
      // ... other globalData
    }
    ```
4.  **动态导入**: 在所有使用到数据层的文件中（主要是 `pages/chat/chat.js`），根据全局配置动态导入不同的模块。

    ```javascript
    // in pages/chat/chat.js
    const app = getApp();
    const storage = app.globalData.useNorthflank 
      ? require('../../utils/storage_northflank.js') 
      : require('../../utils/storage.js');

    // 后续调用方式不变
    // storage.addFitnessLog(...);
    ```
通过以上方案，即可在不破坏现有功能的前提下，完成新后端的开发与集成，并保留未来快速切换回原方案的能力。
