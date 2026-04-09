const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// ✅ Railway PORT
const PORT = process.env.PORT || 3001;

// ✅ Use ENV (IMPORTANT)
const mongoURL = process.env.MONGO_URL;

// ✅ MongoDB Connection
async function connectMongo() {
  try {
    if (!mongoURL) {
      throw new Error("MONGO_URL not found");
    }

    await mongoose.connect(mongoURL, {
      serverSelectionTimeoutMS: 5000
    });

    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.log("❌ MongoDB Connection error:", err.message);
  }
}

// ✅ Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: String
});

const User = mongoose.model('User', UserSchema);

// ✅ Routes
app.get('/users', async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post('/users', async (req, res) => {
  const { name, email } = req.body;

  try {
    const user = new User({ name, email });
    await user.save();

    res.status(201).json(user);
  } catch (error) {
    console.error("❌ Error saving:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/users", (req, res) => {
  res.json({
    message: "Users API working",
    users: []
  });
});

app.get('/', (req, res) => {
  res.send("hello World");
});

// ✅ Start server AFTER DB connect
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 user-service running on port ${PORT}`);
  await connectMongo();
});