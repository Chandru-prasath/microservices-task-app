const express = require('express');
const mongoose = require('mongoose');
const amqp = require('amqplib');

const app = express();
app.use(express.json());

// ✅ PORT (Railway compatible)
const PORT = process.env.PORT;

// ✅ Environment URLs
const mongoURL = process.env.MONGO_URL || "mongodb://mongo:27017/task";
const rabbitURL = process.env.RABBITMQ_URL || "amqp://rabbitmq";

// ✅ MongoDB Connection (FIXED)
async function connectMongo() {
    try {
        await mongoose.connect(mongoURL, {
            serverSelectionTimeoutMS: 5000
        });
        console.log("✅ Connected to MongoDB");
    } catch (err) {
        console.log("❌ MongoDB error:", err.message);
    }
}

// ✅ Schema
const TaskSchema = new mongoose.Schema({
    title: String,
    description: String,
    userId: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Task = mongoose.model('Task', TaskSchema);

// ✅ RabbitMQ
let channel = null;

async function connectRabbitMQWithRetry(retries = 5, delay = 3000) {
    for (let i = 0; i < retries; i++) {
        try {
            const connection = await amqp.connect(rabbitURL);
            channel = await connection.createChannel();
            await channel.assertQueue("task_created", { durable: true });

            console.log("✅ Connected to RabbitMQ");
            return;
        } catch (err) {
            console.log(`❌ RabbitMQ attempt ${i + 1} failed`);
            await new Promise(res => setTimeout(res, delay));
        }
    }

    console.log("⚠ RabbitMQ not connected after retries");
}

// ✅ ROUTES

// GET all tasks
app.get('/tasks', async (req, res) => {
    try {
        const tasks = await Task.find();
        res.json(tasks);
    } catch (err) {
        console.error("❌ GET Error:", err);
        res.status(500).json({ error: "Failed to fetch tasks" });
    }
});

// POST create task
app.post('/tasks', async (req, res) => {
    try {
        const { title, description, userId } = req.body;

        const task = new Task({ title, description, userId });
        await task.save();

        // ✅ Respond immediately (prevents 502)
        res.status(201).json({
            message: "Task created",
            task
        });

        // ✅ Send RabbitMQ message in background
        setImmediate(() => {
            try {
                if (channel) {
                    const message = {
                        taskId: task._id,
                        userId,
                        title
                    };

                    channel.sendToQueue(
                        "task_created",
                        Buffer.from(JSON.stringify(message)),
                        { persistent: true }
                    );

                    console.log("📤 Message sent to queue");
                } else {
                    console.log("⚠ RabbitMQ not connected");
                }
            } catch (err) {
                console.log("RabbitMQ send error:", err.message);
            }
        });

    } catch (err) {
        console.error("❌ POST Error:", err);

        if (!res.headersSent) {
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
});

// ✅ START SERVER (FIXED ORDER)
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`🚀 task-service running on port ${PORT}`);

    await connectMongo();               // ✅ wait Mongo
    await connectRabbitMQWithRetry();  // ✅ connect RabbitMQ
});