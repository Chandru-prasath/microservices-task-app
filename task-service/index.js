const express = require('express');
const mongoose = require('mongoose');
const amqp = require('amqplib');

const app = express();
app.use(express.json());

const port = process.env.PORT || 8080;

// ✅ Environment-based URLs
const mongoURL = process.env.MONGO_URL || "mongodb://mongo:27017/task";
const rabbitURL = process.env.RABBITMQ_URL || "amqp://rabbitmq";

// ✅ MongoDB Connection
mongoose.connect(mongoURL)
.then(() => {
    console.log("✅ Connected to MongoDB");
})
.catch((err) => {
    console.log("❌ MongoDB Connection error", err);
});

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
let channel, connection;

async function connectRabbitMQWithRetry(delay = 3000) {
    while (true) {
        try {
            connection = await amqp.connect(rabbitURL, {
                rejectUnauthorized: false
            });

            channel = await connection.createChannel();
            await channel.assertQueue("task_created", { durable: true });

            console.log("✅ Connected to RabbitMQ");
            return;

        } catch (err) {
            console.log("❌ RabbitMQ Error:", err.message);
            console.log("🔁 Retrying in 3 seconds...");
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

// ✅ Routes

// GET all tasks
app.get('/tasks', async (req, res) => {
    try {
        const tasks = await Task.find();
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch tasks" });
    }
});

// ✅ FIXED POST (NO 502 ERROR)
app.post('/tasks', async (req, res) => {
    try {
        const { title, description, userId } = req.body;

        const task = new Task({ title, description, userId });

        await task.save();

        // ✅ respond immediately
        res.status(201).json({
            message: "Task created",
            task
        });

        // ✅ async RabbitMQ (after response)
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

                    console.log("📤 Message sent");
                } else {
                    console.log("⚠ RabbitMQ not ready");
                }
            } catch (err) {
                console.log("RabbitMQ send error:", err.message);
            }
        });

    } catch (error) {
        console.error("❌ Error:", error);

        if (!res.headersSent) {
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
});

// ✅ Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 task-service running on port ${PORT}`);
});