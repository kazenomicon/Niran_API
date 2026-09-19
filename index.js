require('dotenv').config();
const express = require('express');
const cors = require('cors');
const createError = require('http-errors');
const auth = require("./middleware/auth");
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Neon serverless uses stateless HTTP queries — no per-request connection step needed.

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const CarStoreRoute = require('./Routes/Car_Store.route');
app.use('/api/store', CarStoreRoute);
const UserRoute = require('./Routes/User.route');
app.use('/api/user', UserRoute);
const AdminRoute = require('./Routes/Admin.route');
app.use('/api/admin', auth, AdminRoute);

app.get("/", (req, res) => {
  res.status(200).send({ status: "success" });
});

app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.send({
    error: {
      status: err.status || 500,
      message: err.message,
    },
  });
});

// Start server only when running locally (not on Vercel)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
}

module.exports = app;
