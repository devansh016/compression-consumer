const amqp = require("amqplib");
const ffmpeg = require("fluent-ffmpeg");
const AWS = require("aws-sdk");
const tmp = require("tmp");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Set up AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_DEFAULT_REGION,
});

// RabbitMQ server connection
const rabbitmqURL = process.env.AMQP_URL;

async function consumeMessages() {
  try {
    // Create a connection to RabbitMQ server
    const queueName = "compression_request_queue";
    const connection = await amqp.connect(rabbitmqURL);
    const channel = await connection.createChannel();
    channel.prefetch(1);
    await channel.assertQueue(queueName, { durable: false });
    console.log(`Waiting for messages from queue "${queueName}"...`);

    // Consume messages from the queue
    channel.consume(queueName, async (message) => {
      if (message !== null) {
        const jsonMessage = JSON.parse(message.content.toString());
        console.log(`Received message from queue "${queueName}":`, jsonMessage);

        const s3Key = jsonMessage.s3Key;
        const downloadParams = {
          Key: s3Key,
          Bucket: process.env.AWS_S3_BUCKET,
        };
        const downloadStream = s3.getObject(downloadParams).createReadStream();

        // Use tmp to create a temporary file
        const tmpFile = tmp.fileSync({ postfix: path.extname(s3Key) });
        const outputFilePath = tmpFile.name;

        // Use FFmpeg to compress the video
        const ffmpegProcess = ffmpeg();
        ffmpegProcess.input(downloadStream).output(outputFilePath);

        await new Promise((resolve, reject) => {
          ffmpegProcess.on("end", resolve).on("error", reject).run();
        });

        // Upload the compressed video back to AWS S3
        const uploadParams = {
          Key: `compressed_${s3Key}`,
          Body: fs.createReadStream(outputFilePath),
          Bucket: process.env.AWS_S3_BUCKET,
        };

        const uploadResult = await s3.upload(uploadParams).promise();
        tmpFile.removeCallback();

        // Sending to Email Queue
        console.log(uploadResult);
        sendToCompressionResultQueue({
          CompressedFileUrl: uploadResult.Location,
          CompressedFilekey: uploadResult.Key,
          shareid: jsonMessage.shareid,
        });
        console.log("Compression Done");
        channel.ack(message);
      }
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

async function sendToCompressionResultQueue(jsonMessage) {
  try {
    const queueName = "compression_result_queue";
    const connection = await amqp.connect(rabbitmqURL);
    const channel = await connection.createChannel();
    await channel.assertQueue(queueName, { durable: false });

    channel.sendToQueue(queueName, Buffer.from(JSON.stringify(jsonMessage)));
    console.log(`Request sent to queue "${queueName}":`, jsonMessage);

    await channel.close();
    await connection.close();
  } catch (error) {
    console.error("Error:", error);
  }
}

// Call the function to start consuming messages
consumeMessages();
