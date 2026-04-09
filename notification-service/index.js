const amqp = require("amqplib");

let connection, channel;

// ✅ Use Railway env variable
const RABBITMQ_URL = process.env.RABBITMQ_URL;

async function start() {
  try {
    if (!RABBITMQ_URL) {
      throw new Error("RABBITMQ_URL not found in environment variables");
    }

    // ✅ Connect using CloudAMQP URL
    connection = await amqp.connect(RABBITMQ_URL);

    channel = await connection.createChannel();

    await channel.assertQueue("task_created", {
      durable: true
    });

    console.log("✅ Notification Service connected to RabbitMQ");
    console.log("👂 Listening for messages...");

    // ✅ Consume messages
    channel.consume("task_created", (msg) => {
      if (msg !== null) {
        const taskData = JSON.parse(msg.content.toString());

        console.log("📩 NEW TASK RECEIVED:");
        console.log("Title:", taskData.title);
        console.log("Full Data:", taskData);

        channel.ack(msg);
      }
    });

  } catch (error) {
    console.error("❌ RabbitMQ Connection Error:", error.message);

    // 🔁 Retry after delay
    setTimeout(start, 5000);
  }
}

start();