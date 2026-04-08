const express = require('express')
const mongoose = require('mongoose')
const amqp = require('amqplib')

const app = express()
app.use(express.json())

const port = 3002

mongoose.connect('mongodb://mongo:27017/task')
.then(() => {
    console.log("Connected to MongoDB")
})
.catch((err) => {
    console.log("MongoDB Connection error", err)
})

const TaskSchema = new mongoose.Schema({
    title: String,
    description: String,
    userId: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
})

const Task = mongoose.model('Task', TaskSchema)

let channel,connection;
async function ConnectRabbitMQwithRetry(delay = 3000) {
    while (true) {
        try {
            connection = await amqp.connect("amqp://rabbitmq");
            channel = await connection.createChannel();
            await channel.assertQueue("task_created");

            console.log("✅ Connected to RabbitMQ");
            return;
        } catch (err) {
            console.log(" RabbitMQ Error:", err.message);
            console.log("Retrying in 3 seconds...");
            await new Promise(res => setTimeout(res, delay));
        }
    }
}

app.get('/tasks', async (req, res) => {
    const tasks = await Task.find()
    res.json(tasks)
})

app.post('/tasks', async (req, res) => {

    const { title, description, userId } = req.body

    try {
        const task = new Task({title, description, userId});
        await task.save()
        
        const message = {taskId: task._id, userId, title};

        if(!channel){
            return res.status(503).json({err:"RabbitMQ not Connected"})
        }
         
        channel.sendToQueue("task_created", Buffer.from(
            JSON.stringify(message)
        ));

        res.status(201).json(task)

    } catch (error) {
        console.error("Error saving:", error)
        res.status(500).json({ error: "Internal Server Error" })
    }

})

app.listen(port, () => {
    console.log(`task-service is running on port ${port}`)
    ConnectRabbitMQwithRetry();
})