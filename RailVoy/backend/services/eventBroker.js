/**
 * eventBroker.js — Enterprise Message Broker (RabbitMQ / Event-Driven Architecture)
 * 
 * Provides:
 * 1. Asynchronous publishing of domain events (e.g., booking.confirmed, ticket.transferred)
 * 2. Decouples heavy I/O operations (PDF generation, email delivery, ledger accounting)
 * 3. Graceful asynchronous fallback if RabbitMQ is offline or not installed
 */

const EventEmitter = require('events');
const localEventBus = new EventEmitter();

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://railvoy_admin:railvoy_queue_2026@127.0.0.1:5672';
const EXCHANGE_NAME = 'railvoy.direct.events';

let amqpChannel = null;
let isBrokerConnected = false;

// Dynamically attempt to connect to RabbitMQ via amqplib if present
const initRabbitMQ = async () => {
  try {
    const amqp = require('amqplib');
    const connection = await amqp.connect(RABBITMQ_URL, { timeout: 3000 });
    amqpChannel = await connection.createChannel();

    await amqpChannel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });
    await amqpChannel.assertQueue('q.ticket.email', { durable: true });
    await amqpChannel.assertQueue('q.analytics.ledger', { durable: true });

    await amqpChannel.bindQueue('q.ticket.email', EXCHANGE_NAME, 'booking.confirmed');
    await amqpChannel.bindQueue('q.analytics.ledger', EXCHANGE_NAME, 'payment.settled');

    isBrokerConnected = true;
    console.log('⚡ [RabbitMQ] Connected to Event Broker Grid (Exchange declared)');
  } catch (err) {
    isBrokerConnected = false;
    console.log('ℹ️  [RabbitMQ] Offline — Operating in Local Event-Bus fallback mode');
  }
};

initRabbitMQ();

/**
 * Publishes an asynchronous event to RabbitMQ (or local EventBus)
 * 
 * @param {string} routingKey - e.g. 'booking.confirmed', 'payment.settled'
 * @param {object} payload - Message payload
 */
const publishEvent = async (routingKey, payload) => {
  const eventMessage = {
    eventId: 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
    routingKey,
    timestamp: new Date().toISOString(),
    data: payload
  };

  if (isBrokerConnected && amqpChannel) {
    try {
      const buffer = Buffer.from(JSON.stringify(eventMessage));
      amqpChannel.publish(EXCHANGE_NAME, routingKey, buffer, { persistent: true });
      return true;
    } catch (err) {
      console.warn('[EventBroker] RabbitMQ publish failed, using local event bus:', err.message);
    }
  }

  // Local fallback: dispatch asynchronously without blocking the caller
  setImmediate(() => {
    localEventBus.emit(routingKey, eventMessage);
  });
  return true;
};

/**
 * Registers a subscriber for a domain event
 */
const subscribeLocal = (routingKey, handler) => {
  localEventBus.on(routingKey, handler);
};

module.exports = {
  publishEvent,
  subscribeLocal,
  isBrokerConnected: () => isBrokerConnected
};
