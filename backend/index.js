import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Pool } = pkg;

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, "../frontend");

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'shatova_db',
  max: 10,
});

// Test database connection and create table if not exists
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_transactions (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        category VARCHAR(50) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        cost_price DECIMAL(12,2) NOT NULL,
        selling_price DECIMAL(12,2) NOT NULL,
        profit DECIMAL(12,2) GENERATED ALWAYS AS (selling_price - cost_price) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Database ready: sales_transactions table exists');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
})();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(frontendPath));

// ---------------------------
// API ROUTES (CRUD for transactions)
// ---------------------------

// GET all transactions (latest first)
app.get('/api/transactions', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, date, category, provider, cost_price, selling_price, profit FROM sales_transactions ORDER BY date DESC, id DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// POST new transaction
app.post('/api/transactions', async (req, res) => {
  const { date, category, provider, cost_price, selling_price } = req.body;
  
  if (!date || !category || !provider || cost_price === undefined || selling_price === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  if (selling_price < cost_price) {
    return res.status(400).json({ success: false, message: 'Selling price cannot be less than cost price' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO sales_transactions (date, category, provider, cost_price, selling_price)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, date, category, provider, cost_price, selling_price, profit`,
      [date, category, provider, cost_price, selling_price]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Insert failed' });
  }
});

// PUT update transaction
app.put('/api/transactions/:id', async (req, res) => {
  const { id } = req.params;
  const { date, category, provider, cost_price, selling_price } = req.body;

  if (!date || !category || !provider || cost_price === undefined || selling_price === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  if (selling_price < cost_price) {
    return res.status(400).json({ success: false, message: 'Selling price cannot be less than cost price' });
  }

  try {
    const result = await pool.query(
      `UPDATE sales_transactions
       SET date = $1, category = $2, provider = $3, cost_price = $4, selling_price = $5
       WHERE id = $6
       RETURNING id, date, category, provider, cost_price, selling_price, profit`,
      [date, category, provider, cost_price, selling_price, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// DELETE transaction
app.delete('/api/transactions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM sales_transactions WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

// ---------------------------
// FRONTEND ROUTES (serve HTML pages)
// ---------------------------
// Public HTML routes
app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});
app.get("/login", (req, res) => {
    res.sendFile(path.join(frontendPath, "login.html"));
});
app.get("/register", (req, res) => {
    res.sendFile(path.join(frontendPath, "register.html"));
});
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(frontendPath, "dashboard.html"));
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    time: new Date(),
    service: 'Shatova Sales API'
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl} – endpoint not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Global error:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ success: false, message });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Serving frontend from: ${frontendPath}`);
  console.log(`🗄️  Database: PostgreSQL via pool`);
});