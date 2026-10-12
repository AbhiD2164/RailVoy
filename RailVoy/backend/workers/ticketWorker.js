/**
 * ticketWorker.js — Asynchronous Ticket & Notification Processing Fleet
 * 
 * Subscribes to: 'booking.confirmed' (via RabbitMQ or local EventBroker)
 * Tasks:
 * 1. Generates and renders e-Ticket PDF with QR code
 * 2. Transmits SMTP email with attached security passkey
 * 3. Logs completed delivery without blocking the main reservation API
 */

const { sendTicketEmail } = require('../services/mailService');
const { subscribeLocal } = require('../services/eventBroker');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://railvoy_admin:railvoy_queue_2026@127.0.0.1:5672';

// 1. Local Fallback Listener (Operates when running on local machine without Docker)
subscribeLocal('booking.confirmed', async (event) => {
  try {
    const { userEmail, booking, plainPasscode } = event.data;
    console.log(`[Worker - Local] Processing asynchronous ticket email for PNR: ${booking.pnr} -> ${userEmail}`);
    await sendTicketEmail(userEmail, booking, plainPasscode);
    console.log(`[Worker - Local] Email successfully sent for PNR: ${booking.pnr}`);
  } catch (err) {
    console.warn(`[Worker - Local] Background email delivery notice:`, err.message);
  }
});

// 2. Standalone RabbitMQ AMQP Worker (Operates in Docker / Production)
const startAMQPWorker = async () => {
  try {
    const amqp = require('amqplib');
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertQueue('q.ticket.email', { durable: true });
    channel.prefetch(5);

    console.log('🚀 [AMQP Worker] Ticket Processing Worker active on q.ticket.email');

    channel.consume('q.ticket.email', async (msg) => {
      if (!msg) return;
      try {
        const parsed = JSON.parse(msg.content.toString());
        const { userEmail, booking, plainPasscode } = parsed.data || parsed.payload || parsed;

        console.log(`[AMQP Worker] Dispatching e-ticket for PNR: ${booking?.pnr || 'N/A'}`);
        await sendTicketEmail(userEmail, booking, plainPasscode);

        channel.ack(msg);
      } catch (err) {
        console.error('[AMQP Worker] Processing error, requeuing:', err.message);
        channel.nack(msg, false, true);
      }
    });
  } catch (e) {
    // amqplib not available or rabbitmq not running — worker gracefully listens via local subscriber
  }
};

if (require.main === module) {
  startAMQPWorker();
}

module.exports = { startAMQPWorker };
