// 引入必要的模块
require('dotenv').config(); // 用于加载 .env 文件中的环境变量

// 检查所有必需的环境变量是否存在
const requiredEnvVars = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`错误: 缺少环境变量 ${envVar}。`);
    console.error('请确保在 Northflank 的环境变量设置中，已经将数据库连接的变量正确映射。');
    console.error('例如: Key: MYSQL_HOST, Value: ${NF_MYSQL_HOST}');
    process.exit(1); // 启动失败
  }
}

const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

// 初始化 Express 应用
const app = express();

// 中间件设置
app.use(cors()); // 允许跨域请求
app.use(express.json()); // 解析 JSON 格式的请求体

// 数据库连接池
let db;

// 数据库连接函数
async function connectToDatabase() {
  try {
    db = await mysql.createPool({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    console.log('成功连接到 MySQL 数据库');
  } catch (error) {
    console.error('连接数据库失败:', error);
    process.exit(1); // 连接失败时退出进程
  }
}

// API 路由
// 3.2.1. 添加一条健身记录
app.post('/log', async (req, res) => {
  const { user_id, action, reps, weight } = req.body;

  // 数据校验
  if (!user_id || !action || reps === undefined || weight === undefined) {
    return res.status(400).json({ error: '缺少必要的请求参数: user_id, action, reps, weight' });
  }

  try {
    // 1. 查询当天已完成的组数
    const countSql = 'SELECT COUNT(*) as setCount FROM fitness_logs WHERE user_id = ? AND action = ? AND DATE(created_at) = CURDATE()';
    const [countRows] = await db.query(countSql, [user_id, action]);
    const setCount = countRows[0].setCount;

    // 2. 计算新记录的 sets 值
    const newSet = setCount + 1;

    // 3. 插入新记录
    const insertSql = 'INSERT INTO fitness_logs (user_id, action, reps, weight, sets) VALUES (?, ?, ?, ?, ?)';
    const [insertResult] = await db.query(insertSql, [user_id, action, reps, weight, newSet]);
    const newLogId = insertResult.insertId;

    // 4. 查询并返回完整的新记录
    const selectSql = 'SELECT * FROM fitness_logs WHERE id = ?';
    const [newLogRows] = await db.query(selectSql, [newLogId]);
    
    res.status(201).json(newLogRows[0]);

  } catch (error) {
    console.error('添加健身记录失败:', error);
    res.status(500).json({ error: '服务器内部错误，无法添加记录' });
  }
});

// 3.2.2. 按时间段获取健身记录
app.post('/logs/period', async (req, res) => {
  const { user_id, period } = req.body;

  if (!user_id || !period) {
    return res.status(400).json({ error: '缺少必要的请求参数: user_id, period' });
  }

  let startDate;
  const now = new Date();
  now.setHours(0, 0, 0, 0); // 设置时间为当天的 00:00:00

  switch (period) {
    case 'today':
      startDate = now;
      break;
    case 'week':
      const dayOfWeek = now.getDay(); // 0 (Sunday) to 6 (Saturday)
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // adjust when day is Sunday
      startDate = new Date(now.setDate(diff));
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    default:
      return res.status(400).json({ error: '无效的 period 参数，可选值为: today, week, month, quarter' });
  }

  try {
    const sql = 'SELECT * FROM fitness_logs WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC';
    const [rows] = await db.query(sql, [user_id, startDate]);
    res.json(rows);
  } catch (error) {
    console.error('按时间段获取记录失败:', error);
    res.status(500).json({ error: '服务器内部错误，无法获取记录' });
  }
});

// 3.2.3. 撤回上一条健身记录
app.post('/log/delete-last', async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: '缺少必要的请求参数: user_id' });
  }

  try {
    // 1. 查询最新一条记录的 id
    const selectSql = 'SELECT id FROM fitness_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1';
    const [rows] = await db.query(selectSql, [user_id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: '没有找到该用户的任何记录' });
    }

    const lastId = rows[0].id;

    // 2. 删除该记录
    const deleteSql = 'DELETE FROM fitness_logs WHERE id = ?';
    await db.query(deleteSql, [lastId]);

    res.json({
      success: true,
      message: '已成功撤回上一条记录。'
    });

  } catch (error) {
    console.error('撤回记录失败:', error);
    res.status(500).json({ error: '服务器内部错误，无法撤回记录' });
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;

async function startServer() {
  await connectToDatabase();
  app.listen(PORT, () => {
    console.log(`服务器正在 http://localhost:${PORT} 运行`);
  });
}

startServer();
